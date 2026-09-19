(function () {
  "use strict";

  /* =========================================================
     GLIME — Services Foundation Add-on
     FINAL ARCHITECTURE-ALIGNED VERSION

     Purpose:
     Industry → Business Model → Template foundation

     Important:
     - Does NOT modify services.js core behavior.
     - Does NOT require a DB migration.
     - client_industry_configurations intentionally stores
       industry only. Business model belongs to
       client_template_configurations.business_model_id.
     - Uses the existing Supabase client exposed by services.js.
     ========================================================= */

  const state = window.GLIME_SERVICES_STATE;
  const getClient = window.GLIME_GET_SUPABASE_CLIENT;

  if (!state || typeof getClient !== "function") {
    console.error(
      "[GLIME Foundation Addon] services.js core is not ready."
    );
    return;
  }

  const $ = (id) => document.getElementById(id);

  let mounted = false;
  let saving = false;

  function text(value) {
    return value == null ? "" : String(value);
  }

  function slugify(value) {
    return text(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function getErrorMessage(error, fallback = "Something went wrong.") {
    if (!error) {
      return fallback;
    }

    const parts = [
      error.message,
      error.details,
      error.hint,
      error.code ? `code ${error.code}` : ""
    ]
      .map((value) => text(value).trim())
      .filter(Boolean);

    return parts.length
      ? parts.join(" — ")
      : fallback;
  }

  function notify(message, type = "info") {
    const el = $("message");

    if (!el) {
      return;
    }

    el.hidden = false;
    el.textContent = text(message);
    el.dataset.type = type;

    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => {
      if (el) {
        el.hidden = true;
      }
    }, 7000);
  }

  function setSetupState(message, type = "info") {
    const el = $("setupState");

    if (!el) {
      return;
    }

    el.textContent = text(message);
    el.dataset.type = type;
    el.className = `status ${type}`;
  }

  function setFoundationStatus(message, type = "draft") {
    const el = $("foundationAddonStatus");

    if (!el) {
      return;
    }

    el.textContent = text(message);
    el.dataset.type = type;
    el.className = `status ${type}`;
  }

  function currentClientId() {
    const id = state.client?.id;

    if (id === null || id === undefined || id === "") {
      throw new Error("Client configuration is not loaded.");
    }

    return id;
  }

  function setButtonBusy(button, busy, busyText = "Saving…") {
    if (!button) {
      return;
    }

    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent || "Save foundation";
    }

    button.disabled = Boolean(busy);
    button.textContent = busy
      ? busyText
      : button.dataset.defaultText;
  }

  function mountLayerUI() {
    if (mounted) {
      return;
    }

    const setupPanel = document.querySelector(".setup.panel");

    if (!setupPanel) {
      return;
    }

    const oldAddon = $("servicesFoundationAddon");
    if (oldAddon) {
      oldAddon.remove();
    }

    const panel = document.createElement("section");
    panel.id = "servicesFoundationAddon";
    panel.className = "services-foundation-addon panel";

    panel.innerHTML = `
      <div class="panel-head">
        <div>
          <div class="eyebrow">LAYER 02 → 04</div>
          <h2>Foundation layers</h2>
          <span class="muted">
            Complete Industry → Business Model → Template before entity creation.
          </span>
        </div>

        <span id="foundationAddonStatus" class="status draft">
          Configure
        </span>
      </div>

      <div class="foundation-addon-body">
        <div class="foundation-layer-card">
          <div class="foundation-layer-number">02</div>
          <div class="foundation-layer-content">
            <h3>Industry</h3>
            <p class="muted">
              Use a GLIME system industry or define a custom industry.
            </p>

            <div class="foundation-option-row">
              <button id="systemIndustryModeBtn" type="button" class="ghost small">
                System industry
              </button>
              <button id="customIndustryModeBtn" type="button" class="ghost small">
                Custom industry
              </button>
            </div>

            <div id="customIndustryFields" class="foundation-extra-fields" hidden>
              <label>
                Custom industry name
                <input
                  id="customIndustryName"
                  maxlength="160"
                  placeholder="e.g. Luxury Ethnic Fashion"
                >
              </label>

              <label>
                Custom industry description
                <textarea
                  id="customIndustryDescription"
                  rows="3"
                  maxlength="800"
                  placeholder="Describe this industry"
                ></textarea>
              </label>
            </div>
          </div>
        </div>

        <div class="foundation-layer-card">
          <div class="foundation-layer-number">03</div>
          <div class="foundation-layer-content">
            <h3>Business Model</h3>
            <p class="muted">
              Choose a system model or define a client-specific model in the main foundation panel.
            </p>
            <div id="customBusinessModelNote" class="foundation-note" hidden>
              Custom business model is stored separately from system business models.
            </div>
          </div>
        </div>

        <div class="foundation-layer-card">
          <div class="foundation-layer-number">04</div>
          <div class="foundation-layer-content">
            <h3>Template</h3>
            <p class="muted">
              The selected template governs the entity structure used by the next layer.
            </p>

            <label>
              Template
              <select id="foundationTemplateSelect" disabled>
                <option value="">Select template</option>
              </select>
            </label>

            <label>
              Custom template name
              <input
                id="customTemplateName"
                maxlength="160"
                placeholder="Optional for a custom structure"
              >
            </label>

            <div id="foundationTemplateDescription" class="foundation-note" hidden></div>
          </div>
        </div>

        <div class="foundation-actions">
          <button id="saveFoundationBtn" class="primary" type="button">
            Save foundation
          </button>
        </div>
      </div>
    `;

    setupPanel.insertAdjacentElement("afterend", panel);

    injectStyles();
    bindEvents();
    mounted = true;
  }

  function injectStyles() {
    if ($("servicesFoundationAddonStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "servicesFoundationAddonStyles";

    style.textContent = `
      .services-foundation-addon {
        margin-bottom: 16px;
      }

      .foundation-addon-body {
        display: grid;
        gap: 12px;
        padding: 18px;
      }

      .foundation-layer-card {
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr);
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(5, 11, 16, 0.28);
      }

      .foundation-layer-number {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        color: var(--cyan);
        border: 1px solid rgba(82, 232, 255, 0.25);
        border-radius: 10px;
        font: 500 12px "DM Mono", monospace;
      }

      .foundation-layer-content h3 {
        margin: 0 0 5px;
        font-size: 15px;
      }

      .foundation-layer-content > p {
        margin: 0 0 12px;
      }

      .foundation-option-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }

      .foundation-option-row button.active {
        color: var(--green);
        border-color: rgba(80, 245, 168, 0.35);
      }

      .foundation-extra-fields {
        padding-top: 4px;
      }

      .foundation-note {
        margin-top: 8px;
        padding: 10px 12px;
        color: var(--muted);
        border: 1px solid var(--border);
        border-radius: 9px;
        font-size: 12px;
        line-height: 1.5;
      }

      .foundation-actions {
        display: flex;
        justify-content: flex-end;
      }

      @media (max-width: 650px) {
        .foundation-layer-card {
          grid-template-columns: 1fr;
        }

        .foundation-layer-number {
          width: 40px;
          height: 40px;
        }

        .foundation-actions .primary {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function bindEvents() {
    const industry = $("industrySelect");
    const businessModel = $("businessModelSelect");
    const systemBtn = $("systemIndustryModeBtn");
    const customBtn = $("customIndustryModeBtn");
    const templateSelect = $("foundationTemplateSelect");
    const saveCoreBtn = $("saveSetupBtn");
    const saveBtn = $("saveFoundationBtn");

    systemBtn?.addEventListener("click", () => {
      setIndustryMode("system");
    });

    customBtn?.addEventListener("click", () => {
      setIndustryMode("custom");
    });

    industry?.addEventListener("change", async () => {
      if (state.foundationMode !== "system") {
        return;
      }

      try {
        await loadBusinessModels(industry.value || "");
        await refreshTemplates({ autoSelect: true });
      } catch (error) {
        console.error("[GLIME Foundation Addon] Industry change failed:", error);
        notify(getErrorMessage(error, "Could not load business models."), "error");
      }
    });

    businessModel?.addEventListener("change", async () => {
      if (state.foundationMode !== "system") {
        return;
      }

      try {
        await refreshTemplates({ autoSelect: true });
      } catch (error) {
        console.error("[GLIME Foundation Addon] Business model change failed:", error);
        notify(getErrorMessage(error, "Could not load templates."), "error");
      }
    });

    templateSelect?.addEventListener("change", updateTemplateDescription);

    /*
      Disable the legacy core save action.
      Foundation is now owned by this add-on, not the old setup handler.
    */
    saveCoreBtn?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        /*
          The visible core button remains usable, but its save
          action is delegated to this final foundation flow.
        */
        saveFoundation();
      },
      true
    );

    saveBtn?.addEventListener("click", saveFoundation);

    setIndustryMode("system", { refresh: false });
  }

   function setIndustryMode(mode, options = {}) {
    const custom = mode === "custom";
    const industry = $("industrySelect");
    const businessModel = $("businessModelSelect");
    const customFields = $("customIndustryFields");
    const systemBtn = $("systemIndustryModeBtn");
    const customBtn = $("customIndustryModeBtn");
    const note = $("customBusinessModelNote");

    if (customFields) {
      customFields.hidden = !custom;
    }

    systemBtn?.classList.toggle("active", !custom);
    customBtn?.classList.toggle("active", custom);

    if (industry) {
      industry.disabled = custom;
    }

    if (businessModel) {
      businessModel.disabled = custom;
    }

    if (note) {
      note.hidden = !custom;
    }

    state.foundationMode = custom ? "custom" : "system";

    if (options.refresh !== false) {
      refreshTemplates({ autoSelect: true }).catch((error) => {
        console.error("[GLIME Foundation Addon] Template refresh failed:", error);
      });
    }
  }

  async function refreshTemplates({ autoSelect = false, preferredTemplateId = null } = {}) {
    if (!mounted) {
      return [];
    }

    const industry = $("industrySelect");
    const businessModel = $("businessModelSelect");
    const template = $("foundationTemplateSelect");

    if (!template) {
      return [];
    }

    template.innerHTML = `
      <option value="">Select template</option>
    `;
    template.disabled = true;
    state.foundationTemplates = [];

    const industryId = industry?.value || "";
    const businessModelId = businessModel?.value || "";

    if (
      state.foundationMode === "custom" ||
      !industryId ||
      !businessModelId
    ) {
      updateTemplateDescription();
      return [];
    }

    const client = await getClient();

    const { data, error } = await client
      .from("industry_templates")
      .select(`
        id,
        industry_id,
        business_model_id,
        slug,
        name,
        description,
        status,
        is_system,
        version,
        metadata
      `)
      .eq("industry_id", industryId)
      .eq("business_model_id", businessModelId)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    state.foundationTemplates = data || [];

    for (const item of state.foundationTemplates) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      template.appendChild(option);
    }

    template.disabled = state.foundationTemplates.length === 0;

    const preferred = preferredTemplateId || "";
    const hasPreferred = state.foundationTemplates.some(
      (item) => item.id === preferred
    );

    if (hasPreferred) {
      template.value = preferred;
    } else if (autoSelect && state.foundationTemplates.length === 1) {
      template.value = state.foundationTemplates[0].id;
    } else if (autoSelect && state.foundationTemplates.length > 0 && !template.value) {
      template.value = state.foundationTemplates[0].id;
    }

    updateTemplateDescription();
    return state.foundationTemplates;
  }

  function updateTemplateDescription() {
    const select = $("foundationTemplateSelect");
    const box = $("foundationTemplateDescription");

    if (!select || !box) {
      return;
    }

    const found = (state.foundationTemplates || []).find(
      (item) => item.id === select.value
    );

    if (!found) {
      box.hidden = true;
      box.textContent = "";
      return;
    }

    box.hidden = false;
    box.textContent = found.description || "System template selected.";
  }

  async function loadBusinessModels(industryId, preferredBusinessModelId = null) {
    const client = await getClient();
    const select = $("businessModelSelect");

    if (!select) {
      return [];
    }

    select.innerHTML = `
      <option value="">Select business model</option>
    `;
    state.businessModels = [];

    if (!industryId) {
      return [];
    }

    const { data, error } = await client
      .from("business_models")
      .select(`
        id,
        industry_id,
        slug,
        name,
        description,
        status,
        is_system,
        metadata
      `)
      .eq("industry_id", industryId)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    state.businessModels = data || [];

    for (const item of state.businessModels) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    }

    const preferred = preferredBusinessModelId || "";
    const exists = state.businessModels.some((item) => item.id === preferred);

    if (exists) {
      select.value = preferred;
    }

    return state.businessModels;
  }

  async function loadExistingFoundation() {
    try {
      const client = await getClient();
      const clientId = currentClientId();

      const [industryResult, templateResult, customModelResult] = await Promise.all([
        client
          .from("client_industry_configurations")
          .select(`
            id,
            client_id,
            industry_id,
            custom_industry_name,
            custom_industry_description,
            selection_source,
            status,
            metadata,
            updated_at
          `)
          .eq("client_id", clientId)
          .in("status", ["draft", "active"])
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        client
          .from("client_template_configurations")
          .select(`
            id,
            industry_configuration_id,
            business_model_id,
            custom_business_model_id,
            template_id,
            template_name,
            status,
            config,
            metadata,
            updated_at
          `)
          .eq("client_id", clientId)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        client
          .from("client_custom_business_models")
          .select(`
            id,
            client_id,
            industry_configuration_id,
            base_business_model_id,
            name,
            slug,
            description,
            status,
            is_custom,
            metadata,
            updated_at
          `)
          .eq("client_id", clientId)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (industryResult.error) {
        throw industryResult.error;
      }

      if (templateResult.error) {
        throw templateResult.error;
      }

      if (customModelResult.error) {
        throw customModelResult.error;
      }

      const industryConfig = industryResult.data;
      const templateConfig = templateResult.data;
      const customModel = customModelResult.data;

      if (!industryConfig) {
        setFoundationStatus("Configure", "draft");
        return;
      }

      state.currentIndustryConfiguration = industryConfig;
      state.currentTemplateConfiguration = templateConfig || null;

      const customIndustry = industryConfig.selection_source !== "system";
      setIndustryMode(customIndustry ? "custom" : "system", { refresh: false });

      if (customIndustry) {
        $("customIndustryName").value = industryConfig.custom_industry_name || "";
        $("customIndustryDescription").value = industryConfig.custom_industry_description || "";

        if ($("customBusinessModel")) {
          $("customBusinessModel").value = customModel?.name || "";
        }

        const customTemplate = $("customTemplateName");
        if (customTemplate && templateConfig?.template_id == null) {
          customTemplate.value = templateConfig?.template_name || "";
        }

        setFoundationStatus(
          templateConfig ? "Ready" : "Template required",
          templateConfig ? "active" : "draft"
        );
        return;
      }

      const industry = $("industrySelect");

      if (industry && industryConfig.industry_id) {
        industry.value = industryConfig.industry_id;
        await waitForSelectValue(industry, industryConfig.industry_id);
      }

      await loadBusinessModels(
        industryConfig.industry_id || "",
        templateConfig?.business_model_id || customModel?.base_business_model_id || null
      );

      const customBusinessInput = $("customBusinessModel");
      if (customBusinessInput) {
        customBusinessInput.value = customModel?.name || "";
      }

      await refreshTemplates({
        autoSelect: true,
        preferredTemplateId: templateConfig?.template_id || null
      });

      if (templateConfig?.template_id) {
        const templateSelect = $("foundationTemplateSelect");
        if (templateSelect) {
          templateSelect.value = templateConfig.template_id;
          updateTemplateDescription();
        }
      }

      setFoundationStatus(
        templateConfig ? "Ready" : "Template required",
        templateConfig ? "active" : "draft"
      );
    } catch (error) {
      console.error(
        "[GLIME Foundation Addon] Existing foundation load failed:",
        error
      );

      setFoundationStatus("Load error", "error");
      notify(
        getErrorMessage(error, "Could not load foundation."),
        "error"
      );
    }
  }

  async function waitForSelectValue(select, value, timeout = 5000) {
    if (!select || !value) {
      return;
    }

    const start = Date.now();

    while (Date.now() - start < timeout) {
      const exists = [...select.options].some(
        (option) => option.value === value
      );

      if (exists) {
        select.value = value;
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  function selectedTemplate() {
    const templateId = $("foundationTemplateSelect")?.value || "";
    if (!templateId) {
      return null;
    }

    return (state.foundationTemplates || []).find(
      (item) => item.id === templateId
    ) || null;
  }

   async function saveFoundation() {
    if (saving) {
      return;
    }

    const saveBtn = $("saveFoundationBtn");
    const mode = state.foundationMode || "system";
    const industrySelect = $("industrySelect");
    const businessModelSelect = $("businessModelSelect");
    const customIndustryName = $("customIndustryName");
    const customIndustryDescription = $("customIndustryDescription");
    const customBusinessModel = $("customBusinessModel");
    const templateSelect = $("foundationTemplateSelect");
    const customTemplateName = $("customTemplateName");

    const systemIndustryId = industrySelect?.value || null;
    const systemBusinessModelId = businessModelSelect?.value || null;
    const customIndustry = text(customIndustryName?.value).trim();
    const customIndustryDescriptionText = text(customIndustryDescription?.value).trim();
    const customModelName = text(customBusinessModel?.value).trim();
    const templateId = templateSelect?.value || null;
    const customTemplate = text(customTemplateName?.value).trim();

    if (mode === "system" && !systemIndustryId) {
      notify("Select an industry first.", "error");
      setFoundationStatus("Industry required", "error");
      return;
    }

    if (mode === "custom" && !customIndustry) {
      notify("Enter a custom industry name.", "error");
      setFoundationStatus("Industry required", "error");
      return;
    }

    if (mode === "custom" && !customModelName) {
      notify(
        "A custom industry requires a custom business model.",
        "error"
      );
      setFoundationStatus("Business model required", "error");
      return;
    }

    if (mode === "system" && !systemBusinessModelId && !customModelName) {
      notify(
        "Select a business model or define a custom business model.",
        "error"
      );
      setFoundationStatus("Business model required", "error");
      return;
    }

    if (!templateId && !customTemplate) {
      notify(
        "Select a template or enter a custom template name.",
        "error"
      );
      setFoundationStatus("Template required", "error");
      return;
    }

    if (templateId && !selectedTemplate()) {
      notify(
        "The selected template is not valid for the current industry and business model.",
        "error"
      );
      setFoundationStatus("Invalid template", "error");
      return;
    }

    saving = true;
    setButtonBusy(saveBtn, true, "Saving foundation…");
    setSetupState("Saving foundation…", "info");
    setFoundationStatus("Saving…", "info");

    try {
      const client = await getClient();
      const clientId = currentClientId();

      /* -----------------------------------------------
         EXISTING INDUSTRY CONFIGURATION
         ----------------------------------------------- */
      const existingIndustryResult = await client
        .from("client_industry_configurations")
        .select("id")
        .eq("client_id", clientId)
        .in("status", ["draft", "active"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingIndustryResult.error) {
        throw existingIndustryResult.error;
      }

      const source = mode === "custom" ? "custom" : "system";

      /*
        IMPORTANT:
        client_industry_configurations DOES NOT have
        business_model_id. Business model is stored with
        client_template_configurations instead.
      */
      const industryPayload = {
        client_id: clientId,
        industry_id: mode === "system" ? systemIndustryId : null,
        custom_industry_name: mode === "custom" ? customIndustry : null,
        custom_industry_description:
          mode === "custom"
            ? (customIndustryDescriptionText || null)
            : null,
        selection_source: source,
        status: "active",
        metadata: {
          source: "services-foundation-addon"
        }
      };

      let industryConfig;

      if (existingIndustryResult.data?.id) {
        const result = await client
          .from("client_industry_configurations")
          .update(industryPayload)
          .eq("id", existingIndustryResult.data.id)
          .eq("client_id", clientId)
          .select()
          .single();

        if (result.error) {
          throw result.error;
        }

        industryConfig = result.data;
      } else {
        const result = await client
          .from("client_industry_configurations")
          .insert(industryPayload)
          .select()
          .single();

        if (result.error) {
          throw result.error;
        }

        industryConfig = result.data;
      }

      if (!industryConfig?.id) {
        throw new Error(
          "Industry configuration was not returned after save."
        );
      }

      /* -----------------------------------------------
         CUSTOM BUSINESS MODEL
         ----------------------------------------------- */
      let customBusinessModelId = null;

      if (customModelName) {
        const baseBusinessModelId =
          mode === "system" ? (systemBusinessModelId || null) : null;

        const baseSlug = slugify(customModelName);
        const slug = baseSlug || `custom-${Date.now().toString(36)}`;

        const payload = {
          client_id: clientId,
          industry_configuration_id: industryConfig.id,
          base_business_model_id: baseBusinessModelId,
          name: customModelName,
          slug,
          description: null,
          status: "active",
          is_custom: true,
          metadata: {
            source: "services-foundation-addon"
          }
        };

        const result = await client
          .from("client_custom_business_models")
          .insert(payload)
          .select()
          .single();

        if (result.error) {
          if (result.error.code === "23505") {
            const retry = await client
              .from("client_custom_business_models")
              .insert({
                ...payload,
                slug: `${slug}-${Date.now().toString(36)}`
              })
              .select()
              .single();

            if (retry.error) {
              throw retry.error;
            }

            customBusinessModelId = retry.data.id;
          } else {
            throw result.error;
          }
        } else {
          customBusinessModelId = result.data.id;
        }
      }

      /* -----------------------------------------------
         CREATE NEW ACTIVE TEMPLATE CONFIGURATION
         ----------------------------------------------- */
      const systemTemplate = selectedTemplate();

      const templatePayload = {
        client_id: clientId,
        industry_configuration_id: industryConfig.id,
        business_model_id: systemBusinessModelId || null,
        custom_business_model_id: customBusinessModelId,
        template_id: templateId || null,
        template_name: systemTemplate?.name || customTemplate || null,
        status: "active",
        config: {},
        metadata: {
          source: "services-foundation-addon",
          template_source: templateId ? "system" : "custom"
        }
      };

      const { data: templateConfig, error: templateError } = await client
        .from("client_template_configurations")
        .insert(templatePayload)
        .select()
        .single();

      if (templateError) {
        throw templateError;
      }

      if (!templateConfig?.id) {
        throw new Error(
          "Template configuration was not returned after save."
        );
      }

      /* -----------------------------------------------
         ARCHIVE OLDER TEMPLATE CONFIGURATIONS
         ----------------------------------------------- */
      const archiveTemplates = await client
        .from("client_template_configurations")
        .update({ status: "archived" })
        .eq("client_id", clientId)
        .eq("status", "active")
        .neq("id", templateConfig.id);

      if (archiveTemplates.error) {
        throw archiveTemplates.error;
      }

      /* -----------------------------------------------
         ARCHIVE OLDER CUSTOM BUSINESS MODELS
         ----------------------------------------------- */
      if (customBusinessModelId) {
        const archiveOtherCustomModels = await client
          .from("client_custom_business_models")
          .update({ status: "archived" })
          .eq("client_id", clientId)
          .eq("status", "active")
          .neq("id", customBusinessModelId);

        if (archiveOtherCustomModels.error) {
          throw archiveOtherCustomModels.error;
        }
      } else {
        const archiveAllCustomModels = await client
          .from("client_custom_business_models")
          .update({ status: "archived" })
          .eq("client_id", clientId)
          .eq("status", "active");

        if (archiveAllCustomModels.error) {
          throw archiveAllCustomModels.error;
        }
      }

      /* -----------------------------------------------
         RESOLVE EFFECTIVE CONFIGURATION
         ----------------------------------------------- */
      const { data: resolved, error: resolveError } = await client.rpc(
        "resolve_client_effective_configuration",
        {
          p_client_id: clientId
        }
      );

      if (resolveError) {
        throw resolveError;
      }

      state.currentIndustryConfiguration = industryConfig;
      state.currentTemplateConfiguration = templateConfig;
      state.effectiveConfiguration = resolved;
      state.foundationSaved = true;

      if (customBusinessModelId) {
        state.currentCustomBusinessModel = {
          id: customBusinessModelId,
          name: customModelName
        };
      } else {
        state.currentCustomBusinessModel = null;
      }

      setFoundationStatus("Ready", "active");
      setSetupState("Foundation ready", "success");
      notify(
        "Business foundation saved successfully.",
        "success"
      );
    } catch (error) {
      console.error(
        "[GLIME Foundation Addon] Save failed:",
        error
      );

      const message = getErrorMessage(
        error,
        "Could not save foundation."
      );

      setFoundationStatus("Save failed", "error");
      setSetupState("Foundation save failed", "error");
      notify(message, "error");
    } finally {
      saving = false;
      setButtonBusy(saveBtn, false);
    }
  }

  async function boot() {
    const start = Date.now();

    while (Date.now() - start < 15000) {
      if (state.client) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!state.client) {
      console.error(
        "[GLIME Foundation Addon] Client context not available."
      );
      setSetupState("Client context not available", "error");
      return;
    }

    mountLayerUI();

    if (!mounted) {
      return;
    }

    try {
      await loadExistingFoundation();

      /*
        When there is no saved foundation yet, the core page has
        already loaded Industry → Business Model. We simply make
        sure the matching template list is available and select
        the available system template automatically.
      */
      if (!state.foundationSaved) {
        await refreshTemplates({ autoSelect: true });
      }
    } catch (error) {
      console.error(
        "[GLIME Foundation Addon] Boot failed:",
        error
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      { once: true }
    );
  } else {
    boot();
  }
})();
