const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let clientId = null;
let allLeads = [];
let customFields = [];

/*
  Prevents accidental double-click / duplicate form submission.
*/
let leadSaveInProgress = false;

const $ = (id) => document.getElementById(id);

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));

const fmtDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
};


/* =========================================================
   MESSAGE
========================================================= */

function showMessage(text, error = false) {
  const element = $("message");

  if (!element) return;

  element.textContent = text;
  element.classList.remove("hidden");

  element.style.color = error
    ? "#ffb4bc"
    : "#dffcff";

  setTimeout(() => {
    element.classList.add("hidden");
  }, 4500);
}


/* =========================================================
   AUTH + CLIENT
========================================================= */

async function requireClient() {

  const {
    data: { user },
    error: authError
  } = await db.auth.getUser();

  if (authError || !user) {
    window.location.href = "login.html";
    return false;
  }

  const {
    data,
    error
  } = await db
    .from("client_data")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.client_id) {
    throw new Error(
      "No client profile is linked to this account."
    );
  }

  clientId = data.client_id;

  if ($("clientBadge")) {
    $("clientBadge").textContent = clientId;
  }

  return true;
}


/* =========================================================
   STATS
========================================================= */

function updateStats() {

  if ($("statTotal")) {
    $("statTotal").textContent =
      allLeads.length;
  }

  if ($("statNew")) {
    $("statNew").textContent =
      allLeads.filter(
        (lead) => lead.status === "new"
      ).length;
  }

  if ($("statFollowup")) {

    const now = new Date();

    $("statFollowup").textContent =
      allLeads.filter((lead) => {

        if (!lead.next_follow_up_at) {
          return false;
        }

        const followupDate =
          new Date(lead.next_follow_up_at);

        return (
          followupDate <= now &&
          !["won", "lost"].includes(
            lead.status
          )
        );

      }).length;
  }

  if ($("statWon")) {
    $("statWon").textContent =
      allLeads.filter(
        (lead) => lead.status === "won"
      ).length;
  }
}


/* =========================================================
   FILTERING
========================================================= */

function filteredLeads() {

  const search =
    $("searchInput")?.value
      ?.trim()
      .toLowerCase() || "";

  const status =
    $("statusFilter")?.value || "";

  const source =
    $("sourceFilter")?.value || "";

  return allLeads.filter((lead) => {

    const searchableText = [
      lead.name,
      lead.mobile,
      lead.whatsapp,
      lead.interest,
      lead.product_service,
      lead.city_area,
      lead.notes
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !search ||
      searchableText.includes(search);

    const matchesStatus =
      !status ||
      lead.status === status;

    const matchesSource =
      !source ||
      lead.source === source;

    return (
      matchesSearch &&
      matchesStatus &&
      matchesSource
    );
  });
}


/* =========================================================
   RENDER LEADS
========================================================= */

function render() {

  const body = $("leadsBody");

  if (!body) return;

  const leads = filteredLeads();

  if (!leads.length) {

    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          No leads found.
        </td>
      </tr>
    `;

    updateStats();

    return;
  }

  body.innerHTML = leads
    .map((lead) => {

      const displayName =
        lead.name || "Unnamed";

      const phone =
        lead.mobile ||
        lead.whatsapp ||
        "No phone";

      const interest =
        lead.interest ||
        lead.product_service ||
        "—";

      return `
        <tr>

          <td>

            <div class="lead-name">
              ${esc(displayName)}
            </div>

            <div class="sub">
              ${esc(phone)}
            </div>

          </td>

          <td>

            ${esc(interest)}

            <div class="sub">
              ${esc(lead.city_area || "")}
            </div>

          </td>

          <td>

            <span class="pill">
              ${esc(lead.source || "offline")}
            </span>

          </td>

          <td>

            <span
              class="pill status-${esc(
                lead.status || "new"
              )}"
            >
              ${esc(lead.status || "new")}
            </span>

          </td>

          <td>

            <span class="pill">
              ${esc(lead.priority || "normal")}
            </span>

          </td>

          <td>
            ${fmtDate(
              lead.next_follow_up_at
            )}
          </td>

          <td>

            <button
              class="row-action"
              data-open="${esc(lead.id)}"
            >
              View
            </button>

          </td>

        </tr>
      `;

    })
    .join("");

  updateStats();
}


/* =========================================================
   LOAD LEADS
========================================================= */

async function loadLeads() {

  const body = $("leadsBody");

  if (body) {

    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          Loading…
        </td>
      </tr>
    `;
  }

  const {
    data,
    error
  } = await db
    .from("leads")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  allLeads = data || [];

  render();
}


/* =========================================================
   CUSTOM FIELDS
========================================================= */

async function loadCustomFields() {

  const {
    data,
    error
  } = await db
    .from("lead_custom_field_definitions")
    .select("*")
    .eq("client_id", clientId)
    .order("sort_order", {
      ascending: true
    })
    .order("created_at", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  customFields = data || [];

  renderCustomFieldSummary();
  renderDynamicFields();
  renderFieldDefinitions();
}


/* =========================================================
   CUSTOM FIELD SUMMARY
========================================================= */

function renderCustomFieldSummary() {

  const box =
    $("customFieldsSummary");

  if (!box) return;

  const active =
    customFields.filter(
      (field) => field.is_active
    );

  if (!active.length) {

    box.innerHTML = `
      <span class="sub">
        No custom fields yet.
        Add fields for your business
        from “Manage fields”.
      </span>
    `;

    return;
  }

  box.innerHTML = active
    .map(
      (field) => `
        <span class="field-chip">
          ${esc(field.field_label)}

          <small>
            ${esc(field.field_type)}
          </small>
        </span>
      `
    )
    .join("");
}


/* =========================================================
   DYNAMIC LEAD FIELDS
========================================================= */

function renderDynamicFields() {

  const box =
    $("dynamicLeadFields");

  if (!box) return;

  const active =
    customFields.filter(
      (field) => field.is_active
    );

  if (!active.length) {

    box.innerHTML = "";

    return;
  }

  box.innerHTML = `
    <div class="dynamic-fields-title">
      Custom fields
    </div>

    <div class="dynamic-fields-grid">

      ${active
        .map(renderFieldInput)
        .join("")}

    </div>
  `;
}


/* =========================================================
   CUSTOM FIELD INPUT
========================================================= */

function renderFieldInput(field) {

  const required =
    field.is_required
      ? "required"
      : "";

  const name =
    `custom_${field.id}`;

  let control = "";

  /* SELECT / MULTISELECT */

  if (
    field.field_type === "select" ||
    field.field_type === "multiselect"
  ) {

    const options =
      Array.isArray(field.options)
        ? field.options
        : [];

    control = `
      <select
        class="input"
        name="${esc(name)}"
        ${
          field.field_type ===
          "multiselect"
            ? "multiple"
            : ""
        }
        ${required}
      >

        ${
          field.field_type ===
          "multiselect"
            ? ""
            : `
              <option value="">
                Select an option
              </option>
            `
        }

        ${options
          .map(
            (option) => `
              <option
                value="${esc(option)}"
              >
                ${esc(option)}
              </option>
            `
          )
          .join("")}

      </select>
    `;

  }

  /* NUMBER */

  else if (
    field.field_type === "number"
  ) {

    control = `
      <input
        class="input"
        name="${esc(name)}"
        type="number"
        step="any"
        ${required}
      >
    `;

  }

  /* DATE */

  else if (
    field.field_type === "date"
  ) {

    control = `
      <input
        class="input"
        name="${esc(name)}"
        type="date"
        ${required}
      >
    `;

  }

  /* BOOLEAN */

  else if (
    field.field_type === "boolean"
  ) {

    control = `
      <select
        class="input"
        name="${esc(name)}"
        ${required}
      >

        <option value="">
          Select
        </option>

        <option value="true">
          Yes
        </option>

        <option value="false">
          No
        </option>

      </select>
    `;

  }

  /* TEXT */

  else {

    control = `
      <input
        class="input"
        name="${esc(name)}"
        type="text"
        maxlength="1000"
        ${required}
      >
    `;
  }

  return `
    <label>

      ${esc(field.field_label)}

      ${
        field.is_required
          ? " *"
          : ""
      }

      ${control}

    </label>
  `;
}


/* =========================================================
   FIELD DEFINITIONS
========================================================= */

function renderFieldDefinitions() {

  const box =
    $("fieldDefinitionsList");

  if (!box) return;

  if (!customFields.length) {

    box.innerHTML = `
      <div class="sub">
        No custom fields created yet.
      </div>
    `;

    return;
  }

  box.innerHTML =
    customFields
      .map(
        (field) => `
          <div
            class="field-definition-row"
          >

            <div>

              <strong>
                ${esc(
                  field.field_label
                )}
              </strong>

              <div class="sub">

                ${esc(
                  field.field_key
                )}

                ·

                ${esc(
                  field.field_type
                )}

                ·

                ${
                  field.is_required
                    ? "Required"
                    : "Optional"
                }

              </div>

            </div>

            <button
              class="row-action field-toggle"
              data-field-id="${esc(
                field.id
              )}"
              data-active="${field.is_active}"
            >

              ${
                field.is_active
                  ? "Disable"
                  : "Enable"
              }

            </button>

          </div>
        `
      )
      .join("");
}


/* =========================================================
   MODALS
========================================================= */

function openModal(id) {

  const element = $(id);

  if (!element) return;

  element.classList.remove(
    "hidden"
  );
}


function closeModal(id) {

  const element = $(id);

  if (!element) return;

  element.classList.add(
    "hidden"
  );
}


/* =========================================================
   FIELD HELPERS
========================================================= */

function parseOptions(raw) {

  return String(raw || "")
    .split(/\r?\n|,/)
    .map(
      (value) => value.trim()
    )
    .filter(Boolean)
    .filter(
      (value, index, array) =>
        array.indexOf(value) === index
    );
}


function makeFieldKey(label) {

  return String(label || "")
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "_"
    )
    .replace(
      /^_+|_+$/g,
      ""
    )
    .slice(0, 70);
}


/* =========================================================
   CREATE CUSTOM FIELD
========================================================= */

async function createCustomField(event) {

  event.preventDefault();

  const form =
    new FormData(event.target);

  const label =
    String(
      form.get("field_label") || ""
    ).trim();

  const key =
    String(
      form.get("field_key") || ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9_]+/g,
        "_"
      )
      .replace(
        /^_+|_+$/g,
        ""
      );

  const type =
    String(
      form.get("field_type") ||
      "text"
    );

  if (!label) {

    showMessage(
      "Field label is required.",
      true
    );

    return;
  }

  if (!key) {

    showMessage(
      "Field key is required.",
      true
    );

    return;
  }

  const options =
    (
      type === "select" ||
      type === "multiselect"
    )
      ? parseOptions(
          form.get("options")
        )
      : [];

  if (
    (
      type === "select" ||
      type === "multiselect"
    ) &&
    !options.length
  ) {

    showMessage(
      "Add at least one option for this field type.",
      true
    );

    return;
  }

  const {
    error
  } = await db
    .from(
      "lead_custom_field_definitions"
    )
    .insert({

      client_id:
        clientId,

      field_key:
        key,

      field_label:
        label,

      field_type:
        type,

      options:
        options,

      is_required:
        form.get(
          "is_required"
        ) === "on",

      is_active:
        true,

      sort_order:
        Number(
          form.get(
            "sort_order"
          ) || 0
        )

    });

  if (error) {
    throw error;
  }

  event.target.reset();

  if ($("fieldType")) {

    $("fieldType")
      .dispatchEvent(
        new Event("change")
      );
  }

  await loadCustomFields();

  showMessage(
    "Custom field created."
  );
}


/* =========================================================
   ENABLE / DISABLE CUSTOM FIELD
========================================================= */

async function toggleCustomField(
  id,
  active
) {

  const {
    error
  } = await db
    .from(
      "lead_custom_field_definitions"
    )
    .update({
      is_active: !active
    })
    .eq(
      "id",
      id
    )
    .eq(
      "client_id",
      clientId
    );

  if (error) {
    throw error;
  }

  await loadCustomFields();

  showMessage(
    !active
      ? "Custom field enabled."
      : "Custom field disabled."
  );
}


/* =========================================================
   COLLECT CUSTOM VALUES
========================================================= */

function collectCustomValues(
  form
) {

  const values = [];

  const active =
    customFields.filter(
      (field) => field.is_active
    );

  for (const field of active) {

    const element =
      form.elements[
        `custom_${field.id}`
      ];

    if (!element) {
      continue;
    }

    let value = null;

    /* MULTISELECT */

    if (
      field.field_type ===
      "multiselect"
    ) {

      value =
        Array.from(
          element.selectedOptions
        )
          .map(
            (option) =>
              option.value
          )
          .filter(Boolean);
    }

    /* BOOLEAN */

    else if (
      field.field_type ===
      "boolean"
    ) {

      value =
        element.value === ""
          ? null
          : element.value === "true";
    }

    /* NORMAL */

    else {

      value =
        element.value?.trim
          ? element.value.trim()
          : element.value;
    }

    if (
      value !== null &&
      value !== "" &&
      !(
        Array.isArray(value) &&
        !value.length
      )
    ) {

      values.push({
        field_definition_id:
          field.id,

        value:
          value
      });
    }
  }

  return values;
}


/* =========================================================
   SAVE CUSTOM VALUES
========================================================= */

async function saveCustomValues(
  leadId,
  form
) {

  const values =
    collectCustomValues(form);

  if (!values.length) {
    return;
  }

  const rows =
    values.map(
      (value) => ({
        lead_id:
          leadId,

        field_definition_id:
          value.field_definition_id,

        value:
          value.value
      })
    );

  const {
    error
  } = await db
    .from(
      "lead_custom_field_values"
    )
    .upsert(
      rows,
      {
        onConflict:
          "lead_id,field_definition_id"
      }
    );

  if (error) {
    throw error;
  }
}


/* =========================================================
   CREATE OFFLINE LEAD
========================================================= */

async function createLead(event) {

  event.preventDefault();

  /*
    IMPORTANT:
    Prevent two submissions from the same click / double-click.
  */

  if (leadSaveInProgress) {
    return;
  }

  leadSaveInProgress = true;

  const submitButton =
    event.submitter ||
    event.target.querySelector(
      'button[type="submit"]'
    );

  const originalSubmitText =
    submitButton?.textContent ||
    "Save Lead";

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent =
      "Saving…";
  }

  const form =
    event.target;

  const formData =
    new FormData(form);

  const clean =
    (value) =>
      String(
        value || ""
      ).trim();

  const payload = {

    client_id:
      clientId,

    name:
      clean(
        formData.get("name")
      ),

    mobile:
      clean(
        formData.get("mobile")
      ) || null,

    whatsapp:
      clean(
        formData.get("whatsapp")
      ) || null,

    city_area:
      clean(
        formData.get("city_area")
      ) || null,

    interest:
      clean(
        formData.get("interest")
      ) || null,

    product_service:
      clean(
        formData.get(
          "product_service"
        )
      ) || null,

    budget:
      formData.get("budget")
        ? Number(
            formData.get("budget")
          )
        : null,

    priority:
      clean(
        formData.get(
          "priority"
        )
      ) || "normal",

    next_follow_up_at:
      formData.get(
        "next_follow_up_at"
      )
        ? new Date(
            formData.get(
              "next_follow_up_at"
            )
          ).toISOString()
        : null,

    notes:
      clean(
        formData.get("notes")
      ) || null,

    source:
      "offline"
  };


  /* =======================================================
     VALIDATION
  ======================================================= */

  if (!payload.name) {

    leadSaveInProgress = false;

    if (submitButton) {
      submitButton.disabled =
        false;

      submitButton.textContent =
        originalSubmitText;
    }

    showMessage(
      "Name is required.",
      true
    );

    return;
  }


  /* =======================================================
     CREATE LEAD
  ======================================================= */

  const {
    data: lead,
    error
  } = await db
    .from("leads")
    .insert(payload)
    .select("*")
    .single();

  if (error) {

    leadSaveInProgress = false;

    if (submitButton) {
      submitButton.disabled =
        false;

      submitButton.textContent =
        originalSubmitText;
    }

    throw error;
  }


  /* =======================================================
     SOURCE
  ======================================================= */

  const {
    error: sourceError
  } = await db
    .from("lead_sources")
    .insert({

      client_id:
        clientId,

      lead_id:
        lead.id,

      source_type:
        "offline",

      source_ref:
        null,

      metadata: {
        capture:
          "dashboard_offline"
      }

    });

  if (sourceError) {

    console.error(
      "Lead source creation failed:",
      sourceError
    );
  }


  /* =======================================================
     TIMELINE
  ======================================================= */

  const {
    error: timelineError
  } = await db
    .from("lead_timeline")
    .insert({

      client_id:
        clientId,

      lead_id:
        lead.id,

      event_type:
        "lead_created",

      title:
        "Lead captured offline",

      description:
        "Lead added from the GLIME Leads dashboard.",

      source:
        "offline",

      metadata: {
        capture:
          "dashboard_offline"
      }

    });

  if (timelineError) {

    console.error(
      "Timeline creation failed:",
      timelineError
    );
  }


  /* =======================================================
     BASIC PROFILE
  ======================================================= */

  const {
    error: profileError
  } = await db
    .from("lead_profiles")
    .insert({

      lead_id:
        lead.id,

      intent:
        "unknown",

      urgency:
        "unknown"

    });

  if (profileError) {

    console.error(
      "Lead profile creation failed:",
      profileError
    );
  }


  /* =======================================================
     CUSTOM VALUES
  ======================================================= */

  try {

    await saveCustomValues(
      lead.id,
      form
    );

  } catch (error) {

    console.error(
      "Custom field save failed:",
      error
    );

    showMessage(
      "Lead saved, but custom fields could not be saved.",
      true
    );
  }


  /* =======================================================
     RESET
  ======================================================= */

  form.reset();

  closeModal(
    "leadModal"
  );

  await loadLeads();


  /*
    Unlock only after the entire save flow finishes.
  */

  leadSaveInProgress =
    false;

  if (submitButton) {

    submitButton.disabled =
      false;

    submitButton.textContent =
      originalSubmitText;
  }

  showMessage(
    "Lead saved successfully."
  );
}


/* =========================================================
   DELETE LEAD
========================================================= */

async function deleteLead(id) {

  const lead =
    allLeads.find(
      (item) =>
        item.id === id
    );

  if (!lead) {
    return;
  }

  /*
    Explicit confirmation prevents accidental deletion.
  */

  const confirmed =
    window.confirm(
      `Delete lead "${lead.name || "Unnamed Lead"}"? This will also remove its timeline, custom data and related lead records.`
    );

  if (!confirmed) {
    return;
  }

  const button =
    $("deleteLead");

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Deleting…";
  }

  const {
    error
  } = await db
    .from("leads")
    .delete()
    .eq(
      "id",
      id
    )
    .eq(
      "client_id",
      clientId
    );

  if (error) {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Delete lead";
    }

    throw error;
  }

  closeModal(
    "detailModal"
  );

  await loadLeads();

  showMessage(
    "Lead deleted successfully."
  );
}


/* =========================================================
   FORMAT CUSTOM VALUE
========================================================= */

function formatCustomValue(
  field,
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  if (
    field.field_type ===
    "boolean"
  ) {

    return (
      value === true ||
      value === "true"
    )
      ? "Yes"
      : "No";
  }

  if (
    field.field_type ===
    "multiselect"
  ) {

    if (Array.isArray(value)) {
      return value.join(", ");
    }
  }

  return String(value);
}


/* =========================================================
   LEAD DETAIL
========================================================= */

async function openDetail(id) {

  const lead =
    allLeads.find(
      (item) =>
        item.id === id
    );

  if (!lead) {
    return;
  }

  const detail =
    $("detailContent");

  if (!detail) {
    return;
  }


  detail.innerHTML = `

    <h2>
      ${esc(
        lead.name ||
        "Unnamed Lead"
      )}
    </h2>

    <p class="modal-subtitle">
      Lead details, custom data
      and activity timeline
    </p>


    <div class="detail-grid">

      ${[
        [
          "Mobile",
          lead.mobile
        ],

        [
          "WhatsApp",
          lead.whatsapp
        ],

        [
          "City / Area",
          lead.city_area
        ],

        [
          "Interest",
          lead.interest
        ],

        [
          "Product / Service",
          lead.product_service
        ],

        [
          "Budget",
          lead.budget
            ? `${lead.budget} ${
                lead.budget_currency ||
                "INR"
              }`
            : "—"
        ],

        [
          "Status",
          lead.status
        ],

        [
          "Priority",
          lead.priority
        ],

        [
          "Source",
          lead.source
        ],

        [
          "Next follow-up",
          fmtDate(
            lead.next_follow_up_at
          )
        ],

        [
          "Last contacted",
          fmtDate(
            lead.last_contacted_at
          )
        ]

      ]
        .map(
          ([label, value]) => `

            <div class="detail-item">

              <small>
                ${esc(label)}
              </small>

              <strong>
                ${esc(
                  value || "—"
                )}
              </strong>

            </div>

          `
        )
        .join("")}


      <div class="detail-item full">

        <small>
          Notes
        </small>

        <strong>
          ${esc(
            lead.notes || "—"
          )}
        </strong>

      </div>

    </div>


    <h3>
      Custom fields
    </h3>

    <div
      id="detailCustomFields"
      class="detail-grid"
    >

      <div class="sub">
        Loading…
      </div>

    </div>


    <div>

      <label>

        Status

        <select
          id="detailStatus"
          class="input"
        >

          <option value="new">
            New
          </option>

          <option value="contacted">
            Contacted
          </option>

          <option value="qualified">
            Qualified
          </option>

          <option value="proposal">
            Proposal
          </option>

          <option value="negotiation">
            Negotiation
          </option>

          <option value="won">
            Won
          </option>

          <option value="lost">
            Lost
          </option>

          <option value="paused">
            Paused
          </option>

        </select>

      </label>

    </div>


    <div class="form-actions">

      <button
        id="saveDetail"
        class="primary-btn"
      >
        Save status
      </button>

      <button
        id="deleteLead"
        class="danger-btn"
        type="button"
      >
        Delete lead
      </button>

    </div>


    <h3>
      Timeline
    </h3>

    <div
      id="timelineBox"
      class="timeline"
    >
      Loading…
    </div>

  `;


  $("detailStatus").value =
    lead.status || "new";

  openModal(
    "detailModal"
  );


  /* =======================================================
     LOAD TIMELINE + CUSTOM VALUES
  ======================================================= */

  const [
    timelineResult,
    valuesResult
  ] = await Promise.all([

    db
      .from("lead_timeline")
      .select("*")
      .eq(
        "client_id",
        clientId
      )
      .eq(
        "lead_id",
        id
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      ),

    db
      .from(
        "lead_custom_field_values"
      )
      .select(
        "field_definition_id,value"
      )
      .eq(
        "lead_id",
        id
      )

  ]);


  /* =======================================================
     TIMELINE
  ======================================================= */

  const {
    data: events,
    error: eventError
  } = timelineResult;

  if (eventError) {

    $("timelineBox").textContent =
      "Timeline unavailable.";

  } else {

    $("timelineBox").innerHTML =
      events?.length

        ? events
            .map(
              (event) => `

                <div class="event">

                  <strong>
                    ${esc(
                      event.title
                    )}
                  </strong>

                  <div class="sub">

                    ${fmtDate(
                      event.created_at
                    )}

                    ·

                    ${esc(
                      event.source ||
                      "system"
                    )}

                  </div>

                  <p>
                    ${esc(
                      event.description ||
                      ""
                    )}
                  </p>

                </div>

              `
            )
            .join("")

        : `
          <div class="sub">
            No timeline events yet.
          </div>
        `;
        }

       /* =======================================================
     CUSTOM VALUES
  ======================================================= */

  const {
    data: values,
    error: valueError
  } = valuesResult;

  if (valueError) {

    $("detailCustomFields").innerHTML =
      `
        <div class="sub">
          Custom data unavailable.
        </div>
      `;

  } else {

    const byId =
      new Map(
        (values || []).map(
          (value) => [
            value.field_definition_id,
            value.value
          ]
        )
      );

    const active =
      customFields.filter(
        (field) =>
          field.is_active &&
          byId.has(field.id)
      );

    $("detailCustomFields").innerHTML =
      active.length

        ? active
            .map(
              (field) => `

                <div class="detail-item">

                  <small>
                    ${esc(
                      field.field_label
                    )}
                  </small>

                  <strong>
                    ${esc(
                      formatCustomValue(
                        field,
                        byId.get(
                          field.id
                        )
                      )
                    )}
                  </strong>

                </div>

              `
            )
            .join("")

        : `
          <div class="sub">
            No custom data saved
            for this lead.
          </div>
        `;
  }


  /* =======================================================
     STATUS UPDATE
  ======================================================= */

  $("saveDetail").onclick =
    async () => {

      const button =
        $("saveDetail");

      const status =
        $("detailStatus").value;

      if (button) {

        button.disabled =
          true;

        button.textContent =
          "Saving…";
      }

      const {
        data: updatedLead,
        error
      } = await db
        .from("leads")
        .update({
        status: status
       })
      .eq("id", id)
      .eq("client_id", clientId)
      .select("id, client_id, status, customer_id")
      .single();

if (error) {

  if (button) {
    button.disabled = false;
    button.textContent = "Save status";
  }

  showMessage(
    error.message,
    true
  );

  return;
}

if (!updatedLead) {

  if (button) {
    button.disabled = false;
    button.textContent = "Save status";
  }

  showMessage(
    "Lead status was not saved. Please refresh and try again.",
    true
  );

  return;
}


      const {
        error: timelineError
      } = await db
        .from("lead_timeline")
        .insert({

          client_id:
            clientId,

          lead_id:
            id,

          event_type:
            "status_changed",

          title:
            `Status changed to ${status}`,

          description:
            "Status updated from the Leads dashboard.",

          source:
            "dashboard",

          metadata: {
            status:
              status
          }

        });


      if (timelineError) {

        console.error(
          timelineError
        );
      }


      closeModal(
        "detailModal"
      );

      await loadLeads();

      showMessage(
        "Lead updated."
      );
    };


  /* =======================================================
     DELETE BUTTON
  ======================================================= */

  $("deleteLead").onclick =
    () =>
      deleteLead(id).catch(
        (error) =>
          showMessage(
            error.message,
            true
          )
      );
}


/* =========================================================
   EVENTS
========================================================= */

$("searchInput")
  ?.addEventListener(
    "input",
    render
  );


$("statusFilter")
  ?.addEventListener(
    "change",
    render
  );


$("sourceFilter")
  ?.addEventListener(
    "change",
    render
  );


$("refreshBtn")
  ?.addEventListener(
    "click",
    () =>
      loadLeads()
        .catch(
          (error) =>
            showMessage(
              error.message,
              true
            )
        )
  );


$("addLeadBtn")
  ?.addEventListener(
    "click",
    () =>
      openModal(
        "leadModal"
      )
  );


$("manageFieldsBtn")
  ?.addEventListener(
    "click",
    () =>
      openModal(
        "fieldsModal"
      )
  );


$("leadForm")
  ?.addEventListener(
    "submit",
    (event) =>
      createLead(
        event
      ).catch(
        (error) => {

          leadSaveInProgress =
            false;

          showMessage(
            error.message,
            true
          );

        }
      )
  );


$("fieldForm")
  ?.addEventListener(
    "submit",
    (event) =>
      createCustomField(
        event
      ).catch(
        (error) =>
          showMessage(
            error.message,
            true
          )
      )
  );


$("fieldType")
  ?.addEventListener(
    "change",
    () => {

      const type =
        $("fieldType").value;

      $("optionsField")
        .classList.toggle(
          "hidden",
          ![
            "select",
            "multiselect"
          ].includes(type)
        );
    }
  );


/* =========================================================
   GLOBAL CLICK HANDLER
========================================================= */

document.addEventListener(
  "click",
  (event) => {

    const openId =
      event.target
        .closest(
          "[data-open]"
        )
        ?.dataset
        .open;

    if (openId) {

      openDetail(
        openId
      ).catch(
        (error) =>
          showMessage(
            error.message,
            true
          )
      );
    }


    const closeId =
      event.target
        .closest(
          "[data-close]"
        )
        ?.dataset
        .close;

    if (closeId) {

      closeModal(
        closeId
      );
    }


    const toggle =
      event.target.closest(
        ".field-toggle"
      );

    if (toggle) {

      toggleCustomField(
        toggle.dataset.fieldId,
        toggle.dataset.active ===
          "true"
      ).catch(
        (error) =>
          showMessage(
            error.message,
            true
          )
      );
    }

  }
);


/* =========================================================
   LOGOUT
========================================================= */

$("logoutBtn")
  ?.addEventListener(
    "click",
    async () => {

      await db.auth.signOut();

      window.location.href =
        "login.html";
    }
  );


/* =========================================================
   INITIAL LOAD
========================================================= */

(async () => {

  try {

    const ready =
      await requireClient();

    if (ready) {

      await Promise.all([
        loadLeads(),
        loadCustomFields()
      ]);

    }

  } catch (error) {

    console.error(
      error
    );

    showMessage(
      error.message ||
      "Could not load Leads.",
      true
    );

  } finally {

    $("loadingScreen")
      ?.classList
      .add("hidden");

    $("fieldType")
      ?.dispatchEvent(
        new Event("change")
      );
  }

})();
