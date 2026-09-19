const SUPABASE_URL =
  "https://ufoulgbiqgjriwapuopc.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const WIZARD_KEY = "glime_services_wizard";

let supabaseClient = null;
let state = {};
let systemFields = [];
let customFields = [];
let fieldValues = {};


/* =========================================
   SUPABASE
========================================= */

async function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    throw new Error("Supabase JS client is not available.");
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  return supabaseClient;
}


/* =========================================
   STATE
========================================= */

function loadState() {
  try {
    state = JSON.parse(
      sessionStorage.getItem(WIZARD_KEY) || "{}"
    );
  } catch (error) {
    console.error("Wizard state parse error:", error);
    state = {};
  }

  return state;
}

function saveState() {
  sessionStorage.setItem(
    WIZARD_KEY,
    JSON.stringify(state)
  );
}


/* =========================================
   HELPERS
========================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function prettyLabel(value) {
  const text = String(value || "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!text) {
    return "Field";
  }

  return text.replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  );
}

function getFieldConfig(field) {
  if (
    field &&
    field.config &&
    typeof field.config === "object"
  ) {
    return field.config;
  }

  return {};
}


/* =========================================
   CONTEXT
========================================= */

function renderContext() {
  const context = document.getElementById(
    "selection-context"
  );

  if (!context) {
    return;
  }

  const industryName =
    state.industry?.name ||
    state.customIndustry?.name ||
    "";

  const businessModelName =
    state.businessModel?.name || "";

  const structureName =
    state.template?.name || "";

  const entityName =
    state.entity?.name || "";

  const parts = [];

  if (industryName) {
    parts.push(
      `<strong>Industry:</strong> ${escapeHtml(
        industryName
      )}`
    );
  }

  if (businessModelName) {
    parts.push(
      `<strong>Business model:</strong> ${escapeHtml(
        businessModelName
      )}`
    );
  }

  if (structureName) {
    parts.push(
      `<strong>Structure:</strong> ${escapeHtml(
        structureName
      )}`
    );
  }

  if (entityName) {
    parts.push(
      `<strong>Type:</strong> ${escapeHtml(
        entityName
      )}`
    );
  }

  if (!parts.length) {
    context.hidden = true;
    return;
  }

  context.innerHTML = parts.join("<br>");
  context.hidden = false;
}


/* =========================================
   PAGE COPY
========================================= */

function renderPageCopy() {
  const entityName =
    state.entity?.name || "type";

  document.getElementById(
    "page-title"
  ).textContent =
    `Configure your ${entityName}`;

  if (state.entitySource === "custom") {
    document.getElementById(
      "page-intro"
    ).textContent =
      "This is your custom type. Add the fields you want to keep track of.";
  } else {
    document.getElementById(
      "page-intro"
    ).textContent =
      "GLIME has loaded the fields connected to this type. You can also add your own.";
  }

  document.getElementById(
    "field-heading"
  ).textContent =
    state.entitySource === "custom"
      ? "Define your fields"
      : "Available fields";

  document.getElementById(
    "field-subheading"
  ).textContent =
    state.entitySource === "custom"
      ? "Start with the fields that matter to your business."
      : "These fields come from the selected structure and type.";
}


/* =========================================
   LOAD SYSTEM FIELDS
========================================= */

async function loadSystemFields() {
  systemFields = [];

  /*
   * Custom entity:
   * There is no system template field list.
   */
  if (
    state.entitySource !== "system" ||
    !state.template?.id ||
    !state.entity?.id
  ) {
    return;
  }

  const supabase = await getSupabaseClient();

  const {
    data,
    error
  } = await supabase
    .from("template_fields")
    .select(`
      id,
      template_id,
      entity_type_id,
      field_definition_id,
      slug,
      label,
      data_type,
      is_required,
      is_visible,
      sort_order,
      config
    `)
    .eq(
      "template_id",
      state.template.id
    )
    .eq(
      "entity_type_id",
      state.entity.id
    )
    .eq(
      "is_visible",
      true
    )
    .order(
      "sort_order",
      { ascending: true }
    );

  if (error) {
    throw error;
  }

  const seen = new Set();

  systemFields =
    (data || [])
      .filter((field) => {
        if (
          !field?.id ||
          seen.has(field.id)
        ) {
          return false;
        }

        seen.add(field.id);
        return true;
      })
      .map((field) => ({
        id: field.id,
        source: "system",
        slug: field.slug,
        label:
          field.label ||
          prettyLabel(field.slug),
        dataType:
          field.data_type || "text",
        required:
          field.is_required === true,
        visible:
          field.is_visible !== false,
        sortOrder:
          Number(field.sort_order || 0),
        config:
          getFieldConfig(field)
      }));
}


/* =========================================
   CUSTOM FIELDS
========================================= */

function restoreCustomFields() {
  const saved =
    Array.isArray(state.customFields)
      ? state.customFields
      : [];

  customFields = saved.map((field) => ({
    id:
      field.id ||
      crypto.randomUUID(),

    source: "custom",

    slug:
      field.slug ||
      slugify(field.label),

    label:
      field.label || "",

    dataType:
      field.dataType || "text",

    required:
      field.required === true,

    visible:
      field.visible !== false,

    sortOrder:
      Number(field.sortOrder || 0),

    config:
      field.config || {}
  }));
}

function restoreValues() {
  fieldValues =
    state.fieldValues &&
    typeof state.fieldValues === "object"
      ? {
          ...state.fieldValues
        }
      : {};
}


/* =========================================
   SYSTEM FIELD RENDERING
========================================= */

function renderSystemFields() {
  const container =
    document.getElementById(
      "system-fields"
    );

  container.innerHTML = "";

  if (!systemFields.length) {
    return;
  }

  systemFields.forEach((field) => {
    container.appendChild(
      createFieldCard(
        field,
        false
      )
    );
  });
}


/* =========================================
   FIELD CARD
========================================= */

function createFieldCard(
  field,
  isCustom
) {
  const card =
    document.createElement("div");

  card.className =
    "field-card" +
    (field.required ? " required" : "");

  if (isCustom) {
    card.classList.add(
      "custom-field-card"
    );
  }

  /*
   * CUSTOM FIELD
   */
  if (isCustom) {
    card.innerHTML = `
      <div class="custom-field-top">

        <span class="custom-field-number">
          CUSTOM FIELD
        </span>

        <button
          class="remove-field-button"
          type="button"
          data-remove-custom="${escapeHtml(
            field.id
          )}"
        >
          Remove
        </button>

      </div>

      <div class="custom-field-grid">

        <div>
          <label class="small-label">
            Field name
          </label>

          <input
            class="field-control custom-label-input"
            data-custom-label="${escapeHtml(
              field.id
            )}"
            value="${escapeHtml(
              field.label
            )}"
            placeholder="e.g. Duration"
            maxlength="100"
          >
        </div>

        <div>
          <label class="small-label">
            Field type
          </label>

          <select
            class="field-control custom-type-select"
            data-custom-type="${escapeHtml(
              field.id
            )}"
          >
            ${renderTypeOptions(
              field.dataType
            )}
          </select>
        </div>

      </div>

      <div class="field-option-row">

        <label class="check-option">

          <input
            type="checkbox"
            data-custom-required="${escapeHtml(
              field.id
            )}"
            ${
              field.required
                ? "checked"
                : ""
            }
          >

          Required

        </label>

      </div>
    `;

    return card;
  }


  /*
   * SYSTEM FIELD
   */

  const fieldId =
    `field-${field.id}`;

  const currentValue =
    fieldValues[field.slug] ?? "";

  const config =
    getFieldConfig(field);

  card.innerHTML = `
    <div class="field-label">

      <label for="${escapeHtml(
        fieldId
      )}">
        ${escapeHtml(
          field.label
        )}
      </label>

      ${
        field.required
          ? `<span class="required-mark">Required</span>`
          : `<span class="required-mark">Optional</span>`
      }

    </div>

    ${
      config.description
        ? `
          <p class="field-help">
            ${escapeHtml(
              config.description
            )}
          </p>
        `
        : ""
    }

    ${renderInput(
      field,
      fieldId,
      currentValue
    )}
  `;

  return card;
}


/* =========================================
   DYNAMIC INPUT
========================================= */

function renderInput(
  field,
  fieldId,
  value
) {
  const type =
    String(
      field.dataType || "text"
    ).toLowerCase();

  const safeValue =
    value == null
      ? ""
      : value;

  const config =
    getFieldConfig(field);


  /*
   * LONG TEXT
   */

  if (
    type === "long_text" ||
    type === "textarea" ||
    type === "text_area"
  ) {
    return `
      <textarea
        id="${escapeHtml(fieldId)}"
        class="field-control"
        data-system-field="${escapeHtml(
          field.slug
        )}"
        ${
          field.required
            ? "required"
            : ""
        }
      >${escapeHtml(
        safeValue
      )}</textarea>
    `;
  }


  /*
   * STANDARD INPUT TYPES
   */

  if (
    type === "url" ||
    type === "email" ||
    type === "tel" ||
    type === "number" ||
    type === "date"
  ) {
    return `
      <input
        id="${escapeHtml(fieldId)}"
        class="field-control"
        data-system-field="${escapeHtml(
          field.slug
        )}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(
          safeValue
        )}"
        ${
          field.required
            ? "required"
            : ""
        }
        ${
          type === "number"
            ? 'inputmode="decimal"'
            : ""
        }
      >
    `;
  }


  /*
   * SELECT
   */

  const options =
    Array.isArray(config.options)
      ? config.options
      : Array.isArray(config.choices)
      ? config.choices
      : [];

  if (
    type === "select" ||
    type === "dropdown"
  ) {
    return `
      <select
        id="${escapeHtml(fieldId)}"
        class="field-control"
        data-system-field="${escapeHtml(
          field.slug
        )}"
        ${
          field.required
            ? "required"
            : ""
        }
      >

        <option value="">
          Select an option
        </option>

        ${options
          .map((option) => {
            const optionValue =
              typeof option === "object"
                ? option.value
                : option;

            const optionLabel =
              typeof option === "object"
                ? option.label ||
                  option.value
                : option;

            return `
              <option
                value="${escapeHtml(
                  optionValue
                )}"
                ${
                  String(
                    safeValue
                  ) ===
                  String(
                    optionValue
                  )
                    ? "selected"
                    : ""
                }
              >
                ${escapeHtml(
                  optionLabel
                )}
              </option>
            `;
          })
          .join("")}

      </select>
    `;
  }


  /*
   * BOOLEAN
   */

  if (
    type === "boolean" ||
    type === "checkbox"
  ) {
    return `
      <label class="check-option">

        <input
          type="checkbox"
          data-system-field="${escapeHtml(
            field.slug
          )}"
          ${
            safeValue === true ||
            safeValue === "true"
              ? "checked"
              : ""
          }
        >

        Yes

      </label>
    `;
  }


  /*
   * DEFAULT TEXT
   */

  return `
    <input
      id="${escapeHtml(fieldId)}"
      class="field-control"
      data-system-field="${escapeHtml(
        field.slug
      )}"
      type="text"
      value="${escapeHtml(
        safeValue
      )}"
      ${
        field.required
          ? "required"
          : ""
      }
    >
  `;
}


/* =========================================
   CUSTOM FIELD TYPE OPTIONS
========================================= */

function renderTypeOptions(
  selected
) {
  const types = [
    ["text", "Text"],
    ["long_text", "Long text"],
    ["number", "Number"],
    ["url", "URL"],
    ["email", "Email"],
    ["tel", "Phone"],
    ["date", "Date"],
    ["boolean", "Yes / No"],
    ["select", "Dropdown"]
  ];

  return types
    .map(
      ([value, label]) =>
        `
        <option
          value="${value}"
          ${
            selected === value
              ? "selected"
              : ""
          }
        >
          ${label}
        </option>
        `
    )
    .join("");
}


/* =========================================
   CUSTOM FIELD RENDER
========================================= */

function renderCustomFields() {
  const section =
    document.getElementById(
      "custom-fields-section"
    );

  const container =
    document.getElementById(
      "custom-fields-list"
    );

  container.innerHTML = "";

  if (!customFields.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  customFields.forEach((field) => {
    container.appendChild(
      createFieldCard(
        field,
        true
      )
    );
  });
}


/* =========================================
   ADD CUSTOM FIELD
========================================= */

function addCustomField() {
  const id =
    crypto.randomUUID();

  customFields.push({
    id,

    source: "custom",

    slug:
      `custom-field-${
        customFields.length + 1
      }`,

    label: "",

    dataType: "text",

    required: false,

    visible: true,

    sortOrder:
      customFields.length + 1,

    config: {}
  });

  renderCustomFields();

  const input =
    document.querySelector(
      `[data-custom-label="${CSS.escape(
        id
      )}"]`
    );

  if (input) {
    input.focus();
  }

  persistCurrentState();
}


/* =========================================
   REMOVE CUSTOM FIELD
========================================= */

function removeCustomField(id) {
  customFields =
    customFields.filter(
      (field) =>
        String(field.id) !==
        String(id)
    );

  renderCustomFields();

  persistCurrentState();
}


/* =========================================
   SYNC CUSTOM FIELDS
========================================= */

function syncCustomFields() {

  document
    .querySelectorAll(
      "[data-custom-label]"
    )
    .forEach((input) => {

      const id =
        input.dataset.customLabel;

      const field =
        customFields.find(
          (item) =>
            String(item.id) ===
            String(id)
        );

      if (!field) {
        return;
      }

      field.label =
        input.value.trim();

      field.slug =
        slugify(
          field.label
        ) ||
        `custom-field-${id.slice(
          0,
          8
        )}`;
    });


  document
    .querySelectorAll(
      "[data-custom-type]"
    )
    .forEach((select) => {

      const id =
        select.dataset.customType;

      const field =
        customFields.find(
          (item) =>
            String(item.id) ===
            String(id)
        );

      if (field) {
        field.dataType =
          select.value;
      }
    });


  document
    .querySelectorAll(
      "[data-custom-required]"
    )
    .forEach((checkbox) => {

      const id =
        checkbox.dataset.customRequired;

      const field =
        customFields.find(
          (item) =>
            String(item.id) ===
            String(id)
        );

      if (field) {
        field.required =
          checkbox.checked;
      }
    });
}


/* =========================================
   COLLECT VALUES
========================================= */

function collectValues() {
  const values = {};

  document
    .querySelectorAll(
      "[data-system-field]"
    )
    .forEach((control) => {

      const slug =
        control.dataset.systemField;

      if (!slug) {
        return;
      }

      if (
        control.type ===
        "checkbox"
      ) {
        values[slug] =
          control.checked;
      } else {
        values[slug] =
          control.value;
      }
    });

  return values;
}


/* =========================================
   PERSIST CURRENT STATE
========================================= */

function persistCurrentState() {
  syncCustomFields();

  fieldValues =
    collectValues();

  state.fieldValues =
    fieldValues;

  state.customFields =
    customFields;

  saveState();
}


/* =========================================
   VALIDATION
========================================= */

function validateSystemFields() {
  const errors = [];

  for (
    const field of systemFields
  ) {

    if (!field.required) {
      continue;
    }

    const value =
      fieldValues[field.slug];

    const empty =
      value === undefined ||
      value === null ||
      String(value).trim() === "";

    if (empty) {
      errors.push(
        `${field.label} is required.`
      );
    }
  }

  return errors;
}


function validateCustomFields() {
  const errors = [];

  syncCustomFields();

  customFields.forEach(
    (field, index) => {

      if (!field.label) {
        errors.push(
          `Custom field ${
            index + 1
          } needs a name.`
        );
      }

    }
  );

  return errors;
}


/* =========================================
   ERROR
========================================= */

function showFormError(
  messages
) {
  const box =
    document.getElementById(
      "form-error"
    );

  if (!messages.length) {
    box.hidden = true;
    box.textContent = "";
    return;
  }

  box.textContent =
    messages.join(" ");

  box.hidden = false;

  box.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}


/* =========================================
   PREVIEW
========================================= */

function renderPreview() {
  const section =
    document.getElementById(
      "preview-section"
    );

  const list =
    document.getElementById(
      "preview-list"
    );

  const title =
    document.getElementById(
      "preview-title"
    );

  const count =
    document.getElementById(
      "preview-field-count"
    );

  const allFields = [
    ...systemFields,
    ...customFields
  ];

  title.textContent =
    state.entity?.name ||
    "Your type";

  count.textContent =
    String(
      allFields.length
    );

  list.innerHTML = "";

  allFields.forEach(
    (field) => {

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "preview-row";

      row.innerHTML = `
        <span>
          ${escapeHtml(
            field.label ||
            prettyLabel(
              field.slug
            )
          )}
        </span>

        <strong>
          ${
            field.required
              ? "Required"
              : "Optional"
          }
        </strong>
      `;

      list.appendChild(row);
    }
  );

  section.hidden =
    allFields.length === 0;
}


/* =========================================
   FIELD COUNT
========================================= */

function renderFieldCount() {
  const total =
    systemFields.length +
    customFields.length;

  document.getElementById(
    "field-count"
  ).textContent =
    String(total);
}


/* =========================================
   EVENTS
========================================= */

document
  .getElementById(
    "add-field-button"
  )
  .addEventListener(
    "click",
    addCustomField
  );


document
  .getElementById(
    "back-button"
  )
  .addEventListener(
    "click",
    () => {

      persistCurrentState();

      window.location.href =
        "services-entity.html";
    }
  );


document
  .getElementById(
    "next-button"
  )
  .addEventListener(
    "click",
    saveAndContinue
  );


document
  .getElementById(
    "entity-form"
  )
  .addEventListener(
    "input",
    () => {

      persistCurrentState();

      renderFieldCount();
      renderPreview();
    }
  );


document
  .getElementById(
    "entity-form"
  )
  .addEventListener(
    "change",
    (event) => {

      if (
        event.target.matches(
          "[data-remove-custom]"
        )
      ) {
        return;
      }

      persistCurrentState();

      renderFieldCount();
      renderPreview();
    }
  );


document
  .getElementById(
    "custom-fields-list"
  )
  .addEventListener(
    "click",
    (event) => {

      const button =
        event.target.closest(
          "[data-remove-custom]"
        );

      if (!button) {
        return;
      }

      removeCustomField(
        button.dataset.removeCustom
      );
    }
  );


/* =========================================
   SAVE & CONTINUE
========================================= */

async function saveAndContinue() {

  persistCurrentState();

  const errors = [
    ...validateSystemFields(),
    ...validateCustomFields()
  ];

  if (errors.length) {

    showFormError(errors);

    return;
  }

  showFormError([]);

  /*
   * IMPORTANT:
   * अभी permanent database write नहीं है.
   *
   * Wizard data पहले sessionStorage में रहेगा.
   * Final configuration/save layer बाद में
   * proper DB transaction के साथ बनेगी.
   */

  state.entityConfiguration = {
    entity: state.entity,

    template: state.template,

    fields: [
      ...systemFields,
      ...customFields
    ],

    values: fieldValues
  };

  state.setupProgress =
    "entity_configured";

  saveState();

  window.location.href =
    "services.html";
}


/* =========================================
   INITIALIZATION
========================================= */

async function init() {

  try {

    loadState();


    /*
     * Step 2 missing
     */

    if (
      !state.industry &&
      !state.customIndustry
    ) {

      window.location.href =
        "services-industry.html";

      return;
    }


    /*
     * Step 3 missing
     */

    if (
      !state.businessModel
    ) {

      window.location.href =
        "services-business-model.html";

      return;
    }


    /*
     * Step 4 missing
     */

    if (
      !state.template
    ) {

      window.location.href =
        "services-template.html";

      return;
    }


    /*
     * Step 5 missing
     */

    if (
      !state.entity
    ) {

      window.location.href =
        "services-entity.html";

      return;
    }


    renderContext();

    renderPageCopy();

    restoreValues();

    restoreCustomFields();

    await loadSystemFields();

    renderSystemFields();

    renderCustomFields();

    renderFieldCount();

    renderPreview();


    document.getElementById(
      "loading-state"
    ).hidden = true;

    document.getElementById(
      "field-section"
    ).hidden = false;

    document.getElementById(
      "next-button"
    ).disabled = false;

  } catch (error) {

    console.error(
      "Step 6 error:",
      error
    );

    document.getElementById(
      "loading-state"
    ).hidden = true;

    const errorBox =
      document.getElementById(
        "error-state"
      );

    errorBox.textContent =
      "We couldn't load the fields for this type. Please try again.";

    errorBox.hidden = false;
  }
}


init();
