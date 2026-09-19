const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const WIZARD_KEY = "glime_services_wizard";

let supabaseClient = null;
let state = null;
let selectedTemplate = null;

const $ = (id) => document.getElementById(id);

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

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
    state = JSON.parse(sessionStorage.getItem(WIZARD_KEY) || "{}");
  } catch {
    state = {};
  }

  return state;
}

function saveState() {
  sessionStorage.setItem(WIZARD_KEY, JSON.stringify(state));
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
    state?.industry?.name ||
    state?.customIndustry?.name ||
    "";

  const businessModelName =
    state?.businessModel?.name ||
    "";

  if (!industryName && !businessModelName) {
    context.hidden = true;
    return;
  }

  const parts = [];

  if (industryName) {
    parts.push(`<strong>Industry:</strong> ${escapeHtml(industryName)}`);
  }

  if (businessModelName) {
    parts.push(
      `<strong>Business model:</strong> ${escapeHtml(businessModelName)}`
    );
  }

  context.innerHTML = parts.join("<br>");
  context.hidden = false;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clearSelection() {
  selectedTemplate = null;
  $("next-button").disabled = true;

  document
    .querySelectorAll(".system-template-card")
    .forEach((card) => card.classList.remove("selected"));
}

function selectSystemTemplate(template) {
  selectedTemplate = {
    source: "system",
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description || "",
    industryId: state.industry?.id || null,
    businessModelId: state.businessModel?.id || null
  };

  state.templateSource = "system";
  state.template = selectedTemplate;

  delete state.entity;
  delete state.fields;

  saveState();

  document
    .querySelectorAll(".system-template-card")
    .forEach((card) => {
      card.classList.toggle(
        "selected",
        card.dataset.templateId === String(template.id)
      );
    });

  $("custom-form").hidden = true;
  $("next-button").disabled = false;
}

function selectCustomTemplate(name, description) {
  selectedTemplate = {
    source: "custom",
    id: null,
    name,
    slug: slugify(name),
    description: description || "",
    industryId: state.industry?.id || null,
    businessModelId: state.businessModel?.id || null
  };

  state.templateSource = "custom";
  state.template = selectedTemplate;

  delete state.entity;
  delete state.fields;

  saveState();

  document
    .querySelectorAll(".system-template-card")
    .forEach((card) => card.classList.remove("selected"));

  $("next-button").disabled = false;
}

function renderSystemTemplates(templates) {
  const section = $("system-section");
  const container = $("system-templates");

  container.innerHTML = "";

  if (!templates.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  templates.forEach((template) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "option-card system-template-card";

    button.dataset.templateId = template.id;

    button.innerHTML = `
      <span class="option-icon">✓</span>
      <span>
        <strong>${escapeHtml(template.name)}</strong>
        <small>
          ${escapeHtml(
            template.description ||
            "A ready-made structure for this type of business."
          )}
        </small>
      </span>
    `;

    button.addEventListener("click", () => {
      selectSystemTemplate(template);
    });

    container.appendChild(button);
  });

  if (
    state.templateSource === "system" &&
    state.template?.id
  ) {
    const existing = templates.find(
      (template) => String(template.id) === String(state.template.id)
    );

    if (existing) {
      selectSystemTemplate(existing);
    }
  }
}

async function loadSystemTemplates() {
  const industry = state.industry;
  const businessModel = state.businessModel;

  if (
    !industry?.id ||
    !businessModel?.id ||
    state.industrySource === "custom" ||
    state.businessModelSource === "custom"
  ) {
    renderSystemTemplates([]);
    return;
  }

  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from("industry_templates")
    .select(`
      id,
      name,
      slug,
      status,
      is_system,
      industry_id,
      business_model_id
    `)
    .eq("industry_id", industry.id)
    .eq("business_model_id", businessModel.id)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  const uniqueTemplates = [];
  const seen = new Set();

  for (const row of data || []) {
    if (!row.id || seen.has(row.id)) continue;

    seen.add(row.id);

    uniqueTemplates.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: ""
    });
  }

  renderSystemTemplates(uniqueTemplates);
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

  const name = $("custom-name").value.trim();
  const description = $("custom-description").value.trim();

  if (!name) {
    $("custom-name").focus();
    return;
  }

  selectCustomTemplate(name, description);

  $("custom-form").hidden = true;
}

function goBack() {
  window.location.href = "services-business-model.html";
}

function goNext() {
  if (!selectedTemplate) return;

  window.location.href = "services-entity.html";
}

async function init() {
  try {
    loadState();

    if (!state.industry && !state.customIndustry) {
      window.location.href = "services-industry.html";
      return;
    }

    if (!state.businessModel) {
      window.location.href = "services-business-model.html";
      return;
    }

    showContext();

    await loadSystemTemplates();

    $("loading-state").hidden = true;
  } catch (error) {
    console.error("Step 4 error:", error);

    $("loading-state").hidden = true;
    $("error-state").textContent =
      "We couldn't load the available structures. Please try again.";
    $("error-state").hidden = false;
  }
}

$("custom-trigger").addEventListener("click", openCustomForm);
$("custom-cancel").addEventListener("click", closeCustomForm);
$("custom-form").addEventListener("submit", handleCustomSubmit);
$("back-button").addEventListener("click", goBack);
$("next-button").addEventListener("click", goNext);

init();
