(function () {
  "use strict";

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

  function notify(message, type = "info") {
    const el = $("message");

    if (!el) {
      return;
    }

    el.hidden = false;
    el.textContent = message || "";
    el.dataset.type = type;

    window.clearTimeout(
      notify.timer
    );

    notify.timer = window.setTimeout(() => {
      if (el) {
        el.hidden = true;
      }
    }, 5000);
  }

  function setSetupState(
    message,
    type = "info"
  ) {
    const el = $("setupState");

    if (!el) {
      return;
    }

    el.textContent =
      message || "";

    el.dataset.type =
      type;

    el.className =
      `status ${type}`;
  }

  function currentClientId() {
    const id =
      state.client?.id;

    if (
      id === null ||
      id === undefined ||
      id === ""
    ) {
      throw new Error(
        "Client configuration is not loaded."
      );
    }

    return id;
  }

  function mountLayerUI() {
    if (mounted) {
      return;
    }

    const setupPanel =
      document.querySelector(
        ".setup.panel"
      );

    if (!setupPanel) {
      return;
    }

    const oldAddon =
      $("servicesFoundationAddon");

    if (oldAddon) {
      oldAddon.remove();
    }

    const panel =
      document.createElement(
        "section"
      );

    panel.id =
      "servicesFoundationAddon";

    panel.className =
      "services-foundation-addon panel";

    panel.innerHTML = `
      <div class="panel-head">

        <div>

          <div class="eyebrow">
            LAYER 02 → 04
          </div>

          <h2>
            Foundation layers
          </h2>

          <span class="muted">
            Complete Industry → Business Model → Template before entity creation.
          </span>

        </div>

        <span
          id="foundationAddonStatus"
          class="status draft"
        >
          Configure
        </span>

      </div>


      <div class="foundation-addon-body">

        <!-- =========================================
             INDUSTRY
             ========================================= -->

        <div class="foundation-layer-card">

          <div class="foundation-layer-number">
            02
          </div>

          <div class="foundation-layer-content">

            <h3>
              Industry
            </h3>

            <p class="muted">
              Use a GLIME system industry or define a custom industry.
            </p>

            <div class="foundation-option-row">

              <button
                id="systemIndustryModeBtn"
                type="button"
                class="ghost small"
              >
                System industry
              </button>

              <button
                id="customIndustryModeBtn"
                type="button"
                class="ghost small"
              >
                Custom industry
              </button>

            </div>


            <div
              id="customIndustryFields"
              class="foundation-extra-fields"
              hidden
            >

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


        <!-- =========================================
             BUSINESS MODEL
             ========================================= -->

        <div class="foundation-layer-card">

          <div class="foundation-layer-number">
            03
          </div>

          <div class="foundation-layer-content">

            <h3>
              Business Model
            </h3>

            <p class="muted">
              Choose a system model or define a client-specific model.
            </p>

            <div
              id="customBusinessModelNote"
              class="foundation-note"
              hidden
            >
              Custom business model is stored separately from
              system business models.
            </div>

          </div>

        </div>


        <!-- =========================================
             TEMPLATE
             ========================================= -->

        <div class="foundation-layer-card">

          <div class="foundation-layer-number">
            04
          </div>

          <div class="foundation-layer-content">

            <h3>
              Template
            </h3>

            <p class="muted">
              Select the structure that governs the next entity layer.
            </p>


            <label>

              Template

              <select
                id="foundationTemplateSelect"
                disabled
              >

                <option value="">
                  Select template
                </option>

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


            <div
              id="foundationTemplateDescription"
              class="foundation-note"
              hidden
            ></div>

          </div>

        </div>


        <!-- =========================================
             SAVE
             ========================================= -->

        <div class="foundation-actions">

          <button
            id="saveFoundationBtn"
            class="primary"
            type="button"
          >
            Save foundation
          </button>

        </div>

      </div>
    `;

    setupPanel.insertAdjacentElement(
      "afterend",
      panel
    );

    injectStyles();
    bindEvents();

    mounted = true;
  }


  /* =========================================================
     ADDON STYLES
     ========================================================= */

  function injectStyles() {
    if (
      $("servicesFoundationAddonStyles")
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "servicesFoundationAddonStyles";

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

    document.head.appendChild(
      style
    );
  }


  /* =========================================================
     EVENTS
     ========================================================= */

  function bindEvents() {

    const industry =
      $("industrySelect");

    const businessModel =
      $("businessModelSelect");

    const systemBtn =
      $("systemIndustryModeBtn");

    const customBtn =
      $("customIndustryModeBtn");

    const templateSelect =
      $("foundationTemplateSelect");

    const saveCoreBtn =
      $("saveSetupBtn");

    const saveBtn =
      $("saveFoundationBtn");


    systemBtn?.addEventListener(
      "click",
      () => {
        setIndustryMode(
          "system"
        );
      }
    );


    customBtn?.addEventListener(
      "click",
      () => {
        setIndustryMode(
          "custom"
        );
      }
    );


    industry?.addEventListener(
      "change",
      () => {
        window.setTimeout(
          refreshTemplates,
          0
        );
      }
    );


    businessModel?.addEventListener(
      "change",
      () => {
        window.setTimeout(
          refreshTemplates,
          0
        );
      }
    );


    templateSelect?.addEventListener(
      "change",
      updateTemplateDescription
    );


    /*
      Prevent the old core save handler from
      independently saving an incomplete foundation.
    */

    saveCoreBtn?.addEventListener(
      "click",
      (event) => {

        event.preventDefault();

        event.stopImmediatePropagation();

      },
      true
    );


    saveBtn?.addEventListener(
      "click",
      saveFoundation
    );


    setIndustryMode(
      "system"
    );
  }


  /* =========================================================
     INDUSTRY MODE
     ========================================================= */

  function setIndustryMode(
    mode
  ) {

    const custom =
      mode === "custom";

    const industry =
      $("industrySelect");

    const businessModel =
      $("businessModelSelect");

    const customFields =
      $("customIndustryFields");

    const systemBtn =
      $("systemIndustryModeBtn");

    const customBtn =
      $("customIndustryModeBtn");


    if (customFields) {
      customFields.hidden =
        !custom;
    }


    if (systemBtn) {
      systemBtn.classList.toggle(
        "active",
        !custom
      );
    }


    if (customBtn) {
      customBtn.classList.toggle(
        "active",
        custom
      );
    }


    if (industry) {
      industry.disabled =
        custom;
    }


    if (businessModel) {
      businessModel.disabled =
        custom;
    }


    state.foundationMode =
      custom
        ? "custom"
        : "system";


    const note =
      $("customBusinessModelNote");

    if (note) {
      note.hidden =
        !custom;
    }


    refreshTemplates();
  }


  /* =========================================================
     LOAD TEMPLATES
     ========================================================= */

  async function refreshTemplates() {

    if (!mounted) {
      return;
    }

    const industry =
      $("industrySelect");

    const businessModel =
      $("businessModelSelect");

    const template =
      $("foundationTemplateSelect");


    if (!template) {
      return;
    }


    template.innerHTML =
      `
        <option value="">
          Select template
        </option>
      `;

    template.disabled =
      true;


    const industryId =
      industry?.value || "";

    const businessModelId =
      businessModel?.value || "";


    /*
      Custom industry has no system industry-template
      relationship. It therefore uses custom template name.
    */

    if (
      !industryId ||
      !businessModelId ||
      state.foundationMode === "custom"
    ) {
      return;
    }


    try {

      const client =
        await getClient();


      const {
        data,
        error
      } =
        await client
          .from(
            "industry_templates"
          )
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
          .eq(
            "industry_id",
            industryId
          )
          .eq(
            "business_model_id",
            businessModelId
          )
          .eq(
            "status",
            "active"
          )
          .order(
            "name",
            {
              ascending: true
            }
          );


      if (error) {
        throw error;
      }


      state.foundationTemplates =
        data || [];


      for (
        const item of
        state.foundationTemplates
      ) {

        const option =
          document.createElement(
            "option"
          );

        option.value =
          item.id;

        option.textContent =
          item.name;

        template.appendChild(
          option
        );

      }


      template.disabled =
        state.foundationTemplates.length === 0;


      updateTemplateDescription();

    } catch (error) {

      console.error(
        "[GLIME Foundation Addon] Template load failed:",
        error
      );

      notify(
        error.message ||
          "Could not load templates.",
        "error"
      );
    }
  }


  /* =========================================================
     TEMPLATE DESCRIPTION
     ========================================================= */

  function updateTemplateDescription() {

    const select =
      $("foundationTemplateSelect");

    const box =
      $("foundationTemplateDescription");


    if (!select || !box) {
      return;
    }


    const found =
      (
        state.foundationTemplates ||
        []
      ).find(
        (item) =>
          item.id ===
          select.value
      );


    if (!found) {

      box.hidden =
        true;

      box.textContent =
        "";

      return;
    }


    box.hidden =
      false;

    box.textContent =
      found.description ||
      "System template selected.";
  }


  /* =========================================================
     LOAD EXISTING FOUNDATION
     ========================================================= */

  async function loadExistingFoundation() {

    try {

      const client =
        await getClient();

      const clientId =
        currentClientId();


      const {
        data: industryConfig,
        error: industryError
      } =
        await client
          .from(
            "client_industry_configurations"
          )
          .select(`
            id,
            client_id,
            industry_id,
            custom_industry_name,
            custom_industry_description,
            business_model_id,
            selection_source,
            status,
            metadata,
            updated_at
          `)
          .eq(
            "client_id",
            clientId
          )
          .in(
            "status",
            [
              "draft",
              "active"
            ]
          )
          .order(
            "updated_at",
            {
              ascending: false
            }
          )
          .limit(1)
          .maybeSingle();


      if (industryError) {
        throw industryError;
      }


      if (!industryConfig) {

        setSetupState(
          "Foundation required",
          "warning"
        );

        return;
      }


      const customIndustry =
        industryConfig.selection_source !==
        "system";


      setIndustryMode(
        customIndustry
          ? "custom"
          : "system"
      );


      if (customIndustry) {

        const name =
          $("customIndustryName");

        const description =
          $("customIndustryDescription");


        if (name) {
          name.value =
            industryConfig.custom_industry_name ||
            "";
        }


        if (description) {
          description.value =
            industryConfig.custom_industry_description ||
            "";
        }

      } else {

        const industry =
          $("industrySelect");


        if (industry) {

          industry.value =
            industryConfig.industry_id ||
            "";

          await waitForSelectValue(
            industry,
            industryConfig.industry_id
          );

        }

      }


      if (
        industryConfig.industry_id
      ) {

        await loadBusinessModels(
          industryConfig.industry_id
        );

      }


      if (
        industryConfig.business_model_id
      ) {

        const businessModel =
          $("businessModelSelect");

        if (businessModel) {
          businessModel.value =
            industryConfig.business_model_id;
        }

      }


      await refreshTemplates();


      const {
        data: templateConfig,
        error: templateError
      } =
        await client
          .from(
            "client_template_configurations"
          )
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
          .eq(
            "client_id",
            clientId
          )
          .eq(
            "status",
            "active"
          )
          .order(
            "updated_at",
            {
              ascending: false
            }
          )
          .limit(1)
          .maybeSingle();


      if (templateError) {
        throw templateError;
      }


      if (templateConfig) {

        const templateSelect =
          $("foundationTemplateSelect");

        const customTemplate =
          $("customTemplateName");


        if (
          templateConfig.template_id &&
          templateSelect
        ) {

          templateSelect.value =
            templateConfig.template_id;

          updateTemplateDescription();

        }


        if (
          !templateConfig.template_id &&
          customTemplate
        ) {

          customTemplate.value =
            templateConfig.template_name ||
            "";

        }

      }


      const status =
        $("foundationAddonStatus");

      if (status) {

        const ready =
          Boolean(
            templateConfig
          );

        status.textContent =
          ready
            ? "Ready"
            : "Template required";

        status.className =
          `status ${
            ready
              ? "active"
              : "draft"
          }`;

      }

    } catch (error) {

      console.error(
        "[GLIME Foundation Addon] Existing foundation load failed:",
        error
      );

      notify(
        error.message ||
          "Could not load foundation.",
        "error"
      );
    }
  }


  async function waitForSelectValue(
    select,
    value,
    timeout = 5000
  ) {

    if (
      !select ||
      !value
    ) {
      return;
    }


    const start =
      Date.now();


    while (
      Date.now() -
      start <
      timeout
    ) {

      const exists =
        [
          ...select.options
        ].some(
          (option) =>
            option.value ===
            value
        );


      if (exists) {

        select.value =
          value;

        return;

      }


      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            50
          )
      );

    }
  }


  /* =========================================================
     LOAD BUSINESS MODELS
     ========================================================= */

  async function loadBusinessModels(
    industryId
  ) {

    const client =
      await getClient();

    const select =
      $("businessModelSelect");


    if (
      !select ||
      !industryId
    ) {
      return;
    }


    const {
      data,
      error
    } =
      await client
        .from(
          "business_models"
        )
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
        .eq(
          "industry_id",
          industryId
        )
        .eq(
          "status",
          "active"
        )
        .order(
          "name",
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    select.innerHTML =
      `
        <option value="">
          Select business model
        </option>
      `;


    for (
      const item of
      data || []
    ) {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        item.id;

      option.textContent =
        item.name;

      select.appendChild(
        option
      );

    }


    state.businessModels =
      data || [];
  }


  /* =========================================================
     SAVE FOUNDATION
     ========================================================= */

  async function saveFoundation() {

    if (saving) {
      return;
    }


    const mode =
      state.foundationMode ||
      "system";


    const industrySelect =
      $("industrySelect");

    const businessModelSelect =
      $("businessModelSelect");

    const customIndustryName =
      $("customIndustryName");

    const customIndustryDescription =
      $("customIndustryDescription");

    const customBusinessModel =
      $("customBusinessModel");

    const templateSelect =
      $("foundationTemplateSelect");

    const customTemplateName =
      $("customTemplateName");


    const systemIndustryId =
      industrySelect?.value ||
      null;

    const systemBusinessModelId =
      businessModelSelect?.value ||
      null;

    const customIndustry =
      text(
        customIndustryName?.value
      ).trim();

    const customIndustryDescriptionText =
      text(
        customIndustryDescription?.value
      ).trim();

    const customModelName =
      text(
        customBusinessModel?.value
      ).trim();

    const templateId =
      templateSelect?.value ||
      null;

    const customTemplate =
      text(
        customTemplateName?.value
      ).trim();


    /* -----------------------------------------------
       VALIDATION
       ----------------------------------------------- */

    if (
      mode === "system" &&
      !systemIndustryId
    ) {

      notify(
        "Select an industry first.",
        "error"
      );

      return;
    }


    if (
      mode === "custom" &&
      !customIndustry
    ) {

      notify(
        "Enter a custom industry name.",
        "error"
      );

      return;
    }


    if (
      mode === "custom" &&
      !customModelName
    ) {

      notify(
        "A custom industry requires a custom business model.",
        "error"
      );

      return;
    }


    if (
      mode === "system" &&
      !systemBusinessModelId &&
      !customModelName
    ) {

      notify(
        "Select a business model or define a custom business model.",
        "error"
      );

      return;
    }


    if (
      !templateId &&
      !customTemplate
    ) {

      notify(
        "Select a template or enter a custom template name.",
        "error"
      );

      return;
    }


    saving = true;

    setSetupState(
      "Saving foundation…",
      "info"
    );


    try {

      const client =
        await getClient();

      const clientId =
        currentClientId();


      /* -----------------------------------------------
         REMOVE STALE ACTIVE CUSTOM MODELS
         ----------------------------------------------- */

      const archiveModels =
        await client
          .from(
            "client_custom_business_models"
          )
          .update({
            status:
              "archived"
          })
          .eq(
            "client_id",
            clientId
          )
          .eq(
            "status",
            "active"
          );


      if (archiveModels.error) {
        throw archiveModels.error;
      }


      /* -----------------------------------------------
         EXISTING INDUSTRY CONFIG
         ----------------------------------------------- */

      const {
        data: existingConfig,
        error: existingError
      } =
        await client
          .from(
            "client_industry_configurations"
          )
          .select(
            "id"
          )
          .eq(
            "client_id",
            clientId
          )
          .in(
            "status",
            [
              "draft",
              "active"
            ]
          )
          .order(
            "updated_at",
            {
              ascending: false
            }
          )
          .limit(1)
          .maybeSingle();


      if (existingError) {
        throw existingError;
      }


      /* -----------------------------------------------
         INDUSTRY CONFIG
         ----------------------------------------------- */

      const source =
        mode === "custom"
          ? "custom"
          : "system";


      const industryPayload = {

        client_id:
          clientId,

        industry_id:
          mode === "system"
            ? systemIndustryId
            : null,

        custom_industry_name:
          mode === "custom"
            ? customIndustry
            : null,

        custom_industry_description:
          mode === "custom"
            ? (
                customIndustryDescriptionText ||
                null
              )
            : null,

        business_model_id:
          mode === "system"
            ? (
                systemBusinessModelId ||
                null
              )
            : null,

        selection_source:
          source,

        status:
          "active",

        metadata: {
          source:
            "services-foundation-addon"
        }

      };


      let industryConfig;


      if (
        existingConfig?.id
      ) {

        const result =
          await client
            .from(
              "client_industry_configurations"
            )
            .update(
              industryPayload
            )
            .eq(
              "id",
              existingConfig.id
            )
            .eq(
              "client_id",
              clientId
            )
            .select()
            .single();


        if (result.error) {
          throw result.error;
        }


        industryConfig =
          result.data;

      } else {

        const result =
          await client
            .from(
              "client_industry_configurations"
            )
            .insert(
              industryPayload
            )
            .select()
            .single();


        if (result.error) {
          throw result.error;
        }


        industryConfig =
          result.data;
      }


      /* -----------------------------------------------
         CUSTOM BUSINESS MODEL
         ----------------------------------------------- */

      let customBusinessModelId =
        null;


      if (
        customModelName
      ) {

        const baseBusinessModelId =
          mode === "system"
            ? (
                systemBusinessModelId ||
                null
              )
            : null;


        const baseSlug =
          slugify(
            customModelName
          );


        const slug =
          baseSlug ||
          `custom-${Date.now().toString(36)}`;


        const payload = {

          client_id:
            clientId,

          industry_configuration_id:
            industryConfig.id,

          base_business_model_id:
            baseBusinessModelId,

          name:
            customModelName,

          slug,

          description:
            null,

          status:
            "active",

          is_custom:
            true,

          metadata: {
            source:
              "services-foundation-addon"
          }

        };


        const {
          data,
          error
        } =
          await client
            .from(
              "client_custom_business_models"
            )
            .insert(
              payload
            )
            .select()
            .single();


        if (error) {

          if (
            error.code ===
            "23505"
          ) {

            const retry =
              await client
                .from(
                  "client_custom_business_models"
                )
                .insert({
                  ...payload,
                  slug:
                    `${slug}-${Date.now().toString(36)}`
                })
                .select()
                .single();


            if (retry.error) {
              throw retry.error;
            }


            customBusinessModelId =
              retry.data.id;

          } else {

            throw error;

          }

        } else {

          customBusinessModelId =
            data.id;

        }

      }


      /* -----------------------------------------------
         ARCHIVE OLD TEMPLATE CONFIGS
         ----------------------------------------------- */

      const archiveTemplates =
        await client
          .from(
            "client_template_configurations"
          )
          .update({
            status:
              "archived"
          })
          .eq(
            "client_id",
            clientId
          )
          .eq(
            "status",
            "active"
          );


      if (archiveTemplates.error) {
        throw archiveTemplates.error;
      }


      /* -----------------------------------------------
         CREATE ACTIVE TEMPLATE CONFIG
         ----------------------------------------------- */

      const selectedTemplate =
        templateId
          ? (
              state.foundationTemplates ||
              []
            ).find(
              (item) =>
                item.id ===
                templateId
            )
          : null;


      const templatePayload = {

        client_id:
          clientId,

        industry_configuration_id:
          industryConfig.id,

        business_model_id:
          systemBusinessModelId ||
          null,

        custom_business_model_id:
          customBusinessModelId,

        template_id:
          templateId ||
          null,

        template_name:
          selectedTemplate?.name ||
          customTemplate ||
          null,

        status:
          "active",

        config:
          {},

        metadata: {

          source:
            "services-foundation-addon",

          template_source:
            templateId
              ? "system"
              : "custom"

        }

      };


      const {
        data: templateConfig,
        error: templateError
      } =
        await client
          .from(
            "client_template_configurations"
          )
          .insert(
            templatePayload
          )
          .select()
          .single();


      if (templateError) {
        throw templateError;
      }


      /* -----------------------------------------------
         EFFECTIVE CONFIGURATION RESOLUTION
         ----------------------------------------------- */

      const {
        data: resolved,
        error: resolveError
      } =
        await client.rpc(
          "resolve_client_effective_configuration",
          {
            p_client_id:
              clientId
          }
        );


      if (resolveError) {
        throw resolveError;
      }


      /* -----------------------------------------------
         LOCAL STATE
         ----------------------------------------------- */

      state.currentIndustryConfiguration =
        industryConfig;

      state.currentTemplateConfiguration =
        templateConfig;

      state.effectiveConfiguration =
        resolved;

      state.foundationSaved =
        true;


      const status =
        $("foundationAddonStatus");


      if (status) {

        status.textContent =
          "Ready";

        status.className =
          "status active";

      }


      setSetupState(
        "Foundation ready",
        "success"
      );


      notify(
        "Business foundation saved successfully.",
        "success"
      );

    } catch (error) {

      console.error(
        "[GLIME Foundation Addon] Save failed:",
        error
      );

      setSetupState(
        "Foundation save failed",
        "error"
      );

      notify(
        error.message ||
          "Could not save foundation.",
        "error"
      );

    } finally {

      saving =
        false;

    }
  }


  /* =========================================================
     BOOT
     ========================================================= */

  async function boot() {

    const start =
      Date.now();


    while (
      Date.now() -
      start <
      15000
    ) {

      if (state.client) {
        break;
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            100
          )
      );

    }


    if (!state.client) {

      console.error(
        "[GLIME Foundation Addon] Client context not available."
      );

      return;
    }


    mountLayerUI();


    if (!mounted) {
      return;
    }


    await loadExistingFoundation();

    await refreshTemplates();
  }


  /* =========================================================
     START
     ========================================================= */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      boot,
      {
        once: true
      }
    );

  } else {

    boot();

  }

})();
