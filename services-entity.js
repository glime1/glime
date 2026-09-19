const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const WIZARD_KEY = "glime_services_wizard";

let supabaseClient = null;
let state = {};
let selectedEntity = null;

const $ = (id) => document.getElementById(id);

async function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!window.supabase?.createClient) {
    throw new Error("Supabase client is not loaded.");
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  return supabaseClient;
}

function loadState() {
  try {
    state = JSON.parse(
      sessionStorage.getItem(WIZARD_KEY) || "{}"
    );
  } catch {
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

function showContext() {
  const context = $("selection-context");

  const industryName =
    state.industry?.name ||
    state.customIndustry?.name ||
    "";

  const businessModelName =
    state.businessModel?.name ||
    "";

  const templateName =
    state.template?.name ||
    "";

  const parts = [];

  if (industryName) {
    parts.push(
      `<strong>Industry:</strong> ${escapeHtml(industryName)}`
    );
  }

  if (businessModelName) {
    parts.push(
      `<strong>Business model:</strong> ${escapeHtml(
        businessModelName
      )}`
    );
  }

  if (templateName) {
    parts.push(
      `<strong>Structure:</strong> ${escapeHtml(
        templateName
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

function clearEntitySelection() {
  selectedEntity = null;

  $("next-button").disabled = true;

  document
    .querySelectorAll(".system-entity-card")
    .forEach((card) => {
      card.classList.remove("selected");
    });
}

function selectSystemEntity(entity) {
  selectedEntity = {
    source: "system",
    id: entity.id,
    name: entity.name,
    slug: entity.slug,
    description: entity.description || "",
    templateId: state.template?.id || null
  };

  state.entitySource = "system";
  state.entity = selectedEntity;

  delete state.fields;

  saveState();

  document
    .querySelectorAll(".system-entity-card")
    .forEach((card) => {
      card.classList.toggle(
        "selected",
        card.dataset.entityId === String(entity.id)
      );
    });

  $("custom-form").hidden = true;

  $("next-button").disabled = false;
}

function selectCustomEntity(name, description) {
  selectedEntity = {
    source: "custom",
    id: null,
    name,
    slug: slugify(name),
    description: description || "",
    templateId: state.template?.id || null
  };

  state.entitySource = "custom";
  state.entity = selectedEntity;

  delete state.fields;

  saveState();

  document
    .querySelectorAll(".system-entity-card")
    .forEach((card) => {
      card.classList.remove("selected");
    });

  $("next-button").disabled = false;
}

function renderSystemEntities(entities) {
  const section = $("system-section");
  const container = $("system-entities");

  container.innerHTML = "";

  if (!entities.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  entities.forEach((entity) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className =
      "option-card system-entity-card";

    button.dataset.entityId = entity.id;

    button.innerHTML = `
      <span class="option-icon">✓</span>
      <span>
        <strong>${escapeHtml(entity.name)}</strong>
        <small>
          ${escapeHtml(
            entity.description ||
            "A ready-made type for your selected structure."
          )}
        </small>
      </span>
    `;

    button.addEventListener("click", () => {
      selectSystemEntity(entity);
    });

    container.appendChild(button);
  });

  /*
   * Restore previous selection if the user
   * comes back to this step.
   */
  if (
    state.entitySource === "system" &&
    state.entity?.id
  ) {
    const existing = entities.find(
      (entity) =>
        String(entity.id) ===
        String(state.entity.id)
    );

    if (existing) {
      selectSystemEntity(existing);
    }
  }
}

async function loadSystemEntities() {
  /*
   * A custom structure does not have a system
   * template mapping yet.
   */
  if (
    state.templateSource === "custom" ||
    !state.template?.id
  ) {
    renderSystemEntities([]);
    return;
  }

  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from("template_entity_types")
    .select(`
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
    `)
    .eq("template_id", state.template.id);

  if (error) {
    throw error;
  }

  const entities = [];
  const seen = new Set();

  for (const row of data || []) {
    const entity = row.entity_types;

    if (!entity) {
      continue;
    }

    if (entity.status !== "active") {
      continue;
    }

    if (seen.has(entity.id)) {
      continue;
    }

    seen.add(entity.id);

    entities.push({
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      description: ""
    });
  }

  renderSystemEntities(entities);
}

function openCustomForm() {
  $("custom-form").hidden = false;

  $("custom-name").focus();
}

function closeCustomForm() {
  $("custom-form").hidden = true;

  $("custom-name").value = "";
  $("custom-description").value = "";
}

function handleCustomSubmit(event) {
  event.preventDefault();

  const name =
    $("custom-name").value.trim();

  const description =
    $("custom-description").value.trim();

  if (!name) {
    $("custom-name").focus();
    return;
  }

  selectCustomEntity(
    name,
    description
  );

  $("custom-form").hidden = true;
}

function goBack() {
  window.location.href =
    "services-template.html";
}

function goNext() {
  if (!selectedEntity) {
    return;
  }

  window.location.href =
    "services-entity-form.html";
}

async function init() {
  try {
    loadState();

    /*
     * The wizard should not allow the user
     * to enter this step without previous
     * selections.
     */
    if (
      !state.industry &&
      !state.customIndustry
    ) {
      window.location.href =
        "services-industry.html";

      return;
    }

    if (!state.businessModel) {
      window.location.href =
        "services-business-model.html";

      return;
    }

    if (!state.template) {
      window.location.href =
        "services-template.html";

      return;
    }

    showContext();

    await loadSystemEntities();

    $("loading-state").hidden = true;

  } catch (error) {
    console.error(
      "Step 5 error:",
      error
    );

    $("loading-state").hidden = true;

    $("error-state").textContent =
      "We couldn't load the available options. Please try again.";

    $("error-state").hidden = false;
  }
}

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

init();
