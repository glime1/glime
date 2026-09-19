const SUPABASE_URL =
  "https://ufoulgbiqgjriwapuopc.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const WIZARD_KEY =
  "glime_services_wizard";

let supabaseClient = null;
let state = {};
let selectedEntity = null;

let allSystemEntities = [];

const $ = (id) =>
  document.getElementById(id);


/* ---------------------------------------
   SUPABASE
--------------------------------------- */

async function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    throw new Error(
      "Supabase JS client is not available."
    );
  }

  supabaseClient =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

  return supabaseClient;
}


/* ---------------------------------------
   STATE
--------------------------------------- */

function loadState() {
  try {
    state = JSON.parse(
      sessionStorage.getItem(
        WIZARD_KEY
      ) || "{}"
    );
  } catch (error) {
    console.error(
      "Wizard state parse error:",
      error
    );

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


/* ---------------------------------------
   HELPERS
--------------------------------------- */

function escapeHtml(value) {
  return String(value || "")
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


/* ---------------------------------------
   CONTEXT
--------------------------------------- */

function renderContext() {
  const context =
    $("selection-context");

  if (!context) {
    return;
  }

  const industryName =
    state.industry?.name ||
    state.customIndustry?.name ||
    "";

  const businessModelName =
    state.businessModel?.name ||
    "";

  const structureName =
    state.template?.name ||
    "";

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

  if (!parts.length) {
    context.hidden = true;
    return;
  }

  context.innerHTML =
    parts.join("<br>");

  context.hidden = false;
}


/* ---------------------------------------
   SELECTION STATUS
--------------------------------------- */

function renderSelectionStatus() {
  const box =
    $("selection-status");

  const name =
    $("selected-name");

  if (
    !box ||
    !name
  ) {
    return;
  }

  if (!selectedEntity) {
    box.hidden = true;
    name.textContent = "";
    return;
  }

  name.textContent =
    selectedEntity.name || "";

  box.hidden = false;
}


function updateContinueButton() {
  $("next-button").disabled =
    !selectedEntity;
}


/* ---------------------------------------
   SYSTEM ENTITY SELECTION
--------------------------------------- */

function selectSystemEntity(entity) {
  selectedEntity = {
    source: "system",

    id: entity.id,

    name: entity.name,

    slug: entity.slug,

    description:
      entity.description || "",

    templateId:
      state.template?.id || null,

    fieldCount:
      Number(entity.fieldCount || 0)
  };

  state.entitySource =
    "system";

  state.entity =
    selectedEntity;

  delete state.fields;

  saveState();

  document
    .querySelectorAll(
      ".system-entity-card"
    )
    .forEach((card) => {
      card.classList.toggle(
        "selected",
        card.dataset.entityId ===
          String(entity.id)
      );
    });

  renderSelectionStatus();

  updateContinueButton();

  $("custom-form").hidden = true;

  $("custom-trigger")
    .setAttribute(
      "aria-expanded",
      "false"
    );
}


/* ---------------------------------------
   CUSTOM ENTITY
--------------------------------------- */

function openCustomForm() {
  const form =
    $("custom-form");

  form.hidden = false;

  $("custom-trigger")
    .setAttribute(
      "aria-expanded",
      "true"
    );

  $("custom-name").focus();
}


function closeCustomForm() {
  const form =
    $("custom-form");

  form.hidden = true;

  $("custom-trigger")
    .setAttribute(
      "aria-expanded",
      "false"
    );
}


function selectCustomEntity(
  name,
  description
) {
  selectedEntity = {
    source: "custom",

    id: null,

    name,

    slug: slugify(name),

    description:
      description || "",

    templateId:
      state.template?.id || null,

    fieldCount: 0
  };

  state.entitySource =
    "custom";

  state.entity =
    selectedEntity;

  delete state.fields;

  saveState();

  document
    .querySelectorAll(
      ".system-entity-card"
    )
    .forEach((card) => {
      card.classList.remove(
        "selected"
      );
    });

  closeCustomForm();

  renderSelectionStatus();

  updateContinueButton();
}


/* ---------------------------------------
   SYSTEM FIELD COUNTS
--------------------------------------- */

async function loadFieldCounts(
  templateId
) {
  const counts = {};

  if (!templateId) {
    return counts;
  }

  const supabase =
    await getSupabaseClient();

  const {
    data,
    error
  } = await supabase
    .from("template_fields")
    .select(
      `
        id,
        entity_type_id,
        is_visible
      `
    )
    .eq(
      "template_id",
      templateId
    );

  if (error) {
    throw error;
  }

  for (
    const field of data || []
  ) {
    if (
      field.is_visible !== true
    ) {
      continue;
    }

    const entityId =
      String(field.entity_type_id);

    counts[entityId] =
      (counts[entityId] || 0) + 1;
  }

  return counts;
}


/* ---------------------------------------
   ENTITY UI
--------------------------------------- */

function renderSystemEntities(
  entities
) {
  allSystemEntities =
    entities || [];

  const section =
    $("system-section");

  const emptySection =
    $("empty-system-section");

  const container =
    $("system-entities");

  const countBadge =
    $("system-count");

  const searchWrap =
    $("search-wrap");

  const searchInput =
    $("entity-search");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const count =
    allSystemEntities.length;

  if (countBadge) {
    countBadge.textContent =
      String(count);
  }

  /*
   * Search is useful automatically
   * when the database grows.
   */
  if (
    searchWrap &&
    searchInput
  ) {
    searchWrap.hidden =
      count < 4;
  }

  if (!count) {
    section.hidden = true;

    if (emptySection) {
      emptySection.hidden =
        false;
    }

    return;
  }

  section.hidden = false;

  if (emptySection) {
    emptySection.hidden =
      true;
  }

  renderEntityCards(
    allSystemEntities
  );
}


function renderEntityCards(
  entities
) {
  const container =
    $("system-entities");

  const noResults =
    $("no-search-results");

  container.innerHTML = "";

  if (!entities.length) {
    if (noResults) {
      noResults.hidden = false;
    }

    return;
  }

  if (noResults) {
    noResults.hidden = true;
  }

  entities.forEach(
    (entity) => {
      const button =
        document.createElement(
          "button"
        );

      button.type = "button";

      button.className =
        "option-card system-entity-card";

      button.dataset.entityId =
        entity.id;

      let detailText =
        "Available for this structure.";

      if (
        entity.fieldCount > 0
      ) {
        detailText =
          `${entity.fieldCount} field${
            entity.fieldCount === 1
              ? ""
              : "s"
          } will be available next.`;
      }

      button.innerHTML = `
        <span class="option-icon">✓</span>

        <span class="option-copy">
          <strong>
            ${escapeHtml(
              entity.name
            )}
          </strong>

          <small>
            ${escapeHtml(
              detailText
            )}
          </small>
        </span>

        <span
          class="option-arrow"
          aria-hidden="true"
        >
          →
        </span>
      `;

      button.addEventListener(
        "click",
        () => {
          selectSystemEntity(
            entity
          );
        }
      );

      container.appendChild(
        button
      );
    }
  );

  restoreSystemSelection();
}


/* ---------------------------------------
   RESTORE SYSTEM SELECTION
--------------------------------------- */

function restoreSystemSelection() {
  if (
    state.entitySource !==
      "system" ||
    !state.entity?.id
  ) {
    return;
  }

  const existing =
    allSystemEntities.find(
      (entity) =>
        String(entity.id) ===
        String(state.entity.id)
    );

  if (!existing) {
    return;
  }

  selectedEntity = {
    ...state.entity,

    fieldCount:
      existing.fieldCount || 0
  };

  document
    .querySelectorAll(
      ".system-entity-card"
    )
    .forEach((card) => {
      card.classList.toggle(
        "selected",
        card.dataset.entityId ===
          String(existing.id)
      );
    });

  renderSelectionStatus();

  updateContinueButton();
}


/* ---------------------------------------
   LOAD SYSTEM ENTITIES
--------------------------------------- */

async function loadSystemEntities() {
  /*
   * Custom structures have no system
   * template mapping yet.
   */
  if (
    state.templateSource ===
      "custom" ||
    !state.template?.id
  ) {
    renderSystemEntities([]);

    return;
  }

  const supabase =
    await getSupabaseClient();

  const {
    data,
    error
  } = await supabase
    .from("template_entity_types")
    .select(
      `
        id,
        template_id,
        entity_type_id,
        entity_types (
          id,
          name,
          slug,
          status,
          is_system
        )
      `
    )
    .eq(
      "template_id",
      state.template.id
    );

  if (error) {
    throw error;
  }

  const fieldCounts =
    await loadFieldCounts(
      state.template.id
    );

  const entities = [];

  const seen =
    new Set();

  for (
    const row of data || []
  ) {
    const entity =
      row.entity_types;

    if (!entity) {
      continue;
    }

    if (
      entity.status !==
      "active"
    ) {
      continue;
    }

    if (
      seen.has(
        entity.id
      )
    ) {
      continue;
    }

    seen.add(
      entity.id
    );

    entities.push({
      id: entity.id,

      name: entity.name,

      slug: entity.slug,

      description: "",

      fieldCount:
        fieldCounts[
          String(entity.id)
        ] || 0
    });
  }

  renderSystemEntities(
    entities
  );
}


/* ---------------------------------------
   SEARCH
--------------------------------------- */

function filterEntities(
  searchTerm
) {
  const term =
    String(
      searchTerm || ""
    )
      .trim()
      .toLowerCase();

  if (!term) {
    renderEntityCards(
      allSystemEntities
    );

    return;
  }

  const filtered =
    allSystemEntities.filter(
      (entity) =>
        String(
          entity.name || ""
        )
          .toLowerCase()
          .includes(term) ||
        String(
          entity.slug || ""
        )
          .toLowerCase()
          .includes(term)
    );

  renderEntityCards(
    filtered
  );
}


/* ---------------------------------------
   CHANGE SELECTION
--------------------------------------- */

function changeSelection() {
  selectedEntity = null;

  state.entitySource =
    null;

  delete state.entity;

  delete state.fields;

  saveState();

  document
    .querySelectorAll(
      ".system-entity-card"
    )
    .forEach((card) => {
      card.classList.remove(
        "selected"
      );
    });

  updateContinueButton();

  renderSelectionStatus();

  const systemSection =
    $("system-section");

  if (
    systemSection &&
    !systemSection.hidden
  ) {
    systemSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } else {
    openCustomForm();
  }
}


/* ---------------------------------------
   CUSTOM FORM
--------------------------------------- */

function handleCustomSubmit(
  event
) {
  event.preventDefault();

  const name =
    $("custom-name")
      .value
      .trim();

  const description =
    $("custom-description")
      .value
      .trim();

  if (!name) {
    $("custom-name")
      .focus();

    return;
  }

  selectCustomEntity(
    name,
    description
  );
}


/* ---------------------------------------
   NAVIGATION
--------------------------------------- */

function goBack() {
  window.location.href =
    "services-template.html";
}


function goNext() {
  if (!selectedEntity) {
    return;
  }

  /*
   * Step 6 is responsible for
   * the actual field configuration.
   */
  window.location.href =
    "services-entity-form.html";
}


/* ---------------------------------------
   INITIALIZATION
--------------------------------------- */

async function init() {
  try {
    loadState();

    /*
     * Protect sequential wizard flow.
     */

    if (
      !state.industry &&
      !state.customIndustry
    ) {
      window.location.href =
        "services-industry.html";

      return;
    }

    if (
      !state.businessModel
    ) {
      window.location.href =
        "services-business-model.html";

      return;
    }

    if (
      !state.template
    ) {
      window.location.href =
        "services-template.html";

      return;
    }

    renderContext();

    /*
     * Restore custom entity
     * from previous visit.
     */
    if (
      state.entitySource ===
        "custom" &&
      state.entity?.name
    ) {
      selectedEntity = {
        ...state.entity
      };

      renderSelectionStatus();

      updateContinueButton();
    }

    await loadSystemEntities();

    $("loading-state").hidden =
      true;

  } catch (error) {
    console.error(
      "Step 5 error:",
      error
    );

    $("loading-state").hidden =
      true;

    $("error-state").textContent =
      "We couldn't load the available types. Please try again.";

    $("error-state").hidden =
      false;
  }
}


/* ---------------------------------------
   EVENTS
--------------------------------------- */

$("custom-trigger")
  .addEventListener(
    "click",
    openCustomForm
  );

$("custom-cancel")
  .addEventListener(
    "click",
    closeCustomForm
  );

$("custom-form")
  .addEventListener(
    "submit",
    handleCustomSubmit
  );

$("back-button")
  .addEventListener(
    "click",
    goBack
  );

$("next-button")
  .addEventListener(
    "click",
    goNext
  );

$("change-selection")
  .addEventListener(
    "click",
    changeSelection
  );

$("entity-search")
  .addEventListener(
    "input",
    (event) => {
      filterEntities(
        event.target.value
      );
    }
  );


/* ---------------------------------------
   START
--------------------------------------- */

init();
