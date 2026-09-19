/* =========================================================
   GLIME — Services / Offers Manager
   FINAL ARCHITECTURE-ALIGNED CORE
   Part 1 / 5
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     SUPABASE
     ========================================================= */

  const SUPABASE_URL =
    window.GLIME_SUPABASE_URL ||
    window.SUPABASE_URL ||
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_ANON_KEY =
    window.GLIME_SUPABASE_ANON_KEY ||
    window.SUPABASE_ANON_KEY ||
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  /*
    IMPORTANT:
    window.supabase = Supabase library namespace.
    It is NOT the configured Supabase client.

    Only accept an already-created client if it actually
    exposes the expected Supabase client methods.
  */

  const existingClient =
    window.supabaseClient ||
    window.sb ||
    null;

  let supabaseClient =
    existingClient &&
    typeof existingClient.from === "function" &&
    existingClient.auth &&
    typeof existingClient.auth.getUser === "function"
      ? existingClient
      : null;

  async function getSupabaseClient() {
    if (supabaseClient) {
      return supabaseClient;
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY
    ) {
      throw new Error(
        "GLIME Supabase configuration is missing."
      );
    }

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      throw new Error(
        "Supabase library is not loaded."
      );
    }

    supabaseClient =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );

    return supabaseClient;
  }

  /* =========================================================
     STATE
     ========================================================= */

  const state = {
    client: null,

    industries: [],
    businessModels: [],
    customBusinessModels: [],
    templates: [],

    categories: [],
    offers: [],

    currentOffer: null,
    currentVersion: null,
    currentBinding: null,
    sourceVersion: null,

    currentStep: 1,
    totalSteps: 7,

    availability: [],

    setupSaved: false,
    saving: false,
    initialized: false
  };

  /* =========================================================
     DOM HELPERS
     ========================================================= */

  const $ = (id) =>
    document.getElementById(id);

  const qs = (
    selector,
    root = document
  ) =>
    root.querySelector(selector);

  const qsa = (
    selector,
    root = document
  ) =>
    [...root.querySelectorAll(selector)];

  function safeText(value) {
    return value == null
      ? ""
      : String(value);
  }

  function setText(
    id,
    value
  ) {
    const el = $(id);

    if (el) {
      el.textContent =
        safeText(value);
    }
  }

  function setValue(
    id,
    value
  ) {
    const el = $(id);

    if (!el) {
      return;
    }

    el.value =
      value == null
        ? ""
        : value;
  }

  function getValue(id) {
    const el = $(id);

    return el
      ? String(
          el.value || ""
        ).trim()
      : "";
  }

  function getRawValue(id) {
    const el = $(id);

    return el
      ? el.value || ""
      : "";
  }

  function show(
    el,
    visible = true
  ) {
    if (!el) {
      return;
    }

    el.hidden =
      !visible;
  }

  function setDisabled(
    id,
    disabled
  ) {
    const el = $(id);

    if (el) {
      el.disabled =
        !!disabled;
    }
  }

  /* =========================================================
     NOTIFICATIONS
     ========================================================= */

  function notify(
    message,
    type = "info"
  ) {
    const el =
      $("message");

    if (!el) {
      return;
    }

    el.textContent =
      safeText(message);

    el.dataset.type =
      type;

    clearTimeout(
      notify._timer
    );

    notify._timer =
      setTimeout(() => {
        if (el) {
          el.textContent =
            "";
        }
      }, 5000);
  }

  function handleError(
    error,
    fallback =
      "Something went wrong."
  ) {
    console.error(
      "[GLIME Services]",
      error
    );

    const message =
      error?.message ||
      error?.error_description ||
      error?.details ||
      fallback;

    notify(
      message,
      "error"
    );
  }

  /* =========================================================
     TEXT / DATA HELPERS
     ========================================================= */

  function slugify(value) {
    return safeText(value)
      .toLowerCase()
      .trim()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(
        0,
        100
      );
  }

  function parseJson(
    value,
    fallback = {}
  ) {
    if (!value) {
      return fallback;
    }

    if (
      typeof value ===
      "object"
    ) {
      return value;
    }

    try {
      return JSON.parse(
        value
      );
    } catch {
      return fallback;
    }
  }

  function getMetadata(
    object
  ) {
    return parseJson(
      object?.metadata,
      {}
    );
  }

  function arrayFromText(
    value
  ) {
    if (!value) {
      return [];
    }

    return String(value)
      .split(/\r?\n/)
      .map(
        (item) =>
          item.trim()
      )
      .filter(Boolean);
  }

  function textFromArray(
    value
  ) {
    if (
      !Array.isArray(value)
    ) {
      return "";
    }

    return value.join(
      "\n"
    );
  }

  function escapeHtml(
    value
  ) {
    return safeText(value)
      .replaceAll(
        "&",
        "&amp;"
      )
      .replaceAll(
        "<",
        "&lt;"
      )
      .replaceAll(
        ">",
        "&gt;"
      )
      .replaceAll(
        '"',
        "&quot;"
      )
      .replaceAll(
        "'",
        "&#039;"
      );
  }

  /* =========================================================
     TENANT HELPERS
     ========================================================= */

  function tenantConfigId() {
    const id =
      state.client?.id;

    if (
      id === undefined ||
      id === null ||
      id === ""
    ) {
      throw new Error(
        "Client configuration is not loaded."
      );
    }

    return id;
  }

  function tenantOfferId() {
    const id =
      state.client?.client_id;

    if (
      id === undefined ||
      id === null ||
      id === ""
    ) {
      throw new Error(
        "Client ID is not loaded."
      );
    }

    return String(id);
  }

  /* =========================================================
     SAFE SUPABASE READ
     ========================================================= */

  async function selectRows(
    table,
    columns = "*",
    filters = {},
    options = {}
  ) {
    const client =
      await getSupabaseClient();

    let query =
      client
        .from(table)
        .select(columns);

    for (
      const [
        key,
        value
      ] of Object.entries(
        filters || {}
      )
    ) {
      if (
        value === null
      ) {
        query =
          query.is(
            key,
            null
          );
      } else if (
        Array.isArray(value)
      ) {
        query =
          query.in(
            key,
            value
          );
      } else {
        query =
          query.eq(
            key,
            value
          );
      }
    }

    if (
      options.order
    ) {
      query =
        query.order(
          options.order.column,
          {
            ascending:
              options.order
                .ascending !==
              false
          }
        );
    }

    if (
      Number.isInteger(
        options.limit
      )
    ) {
      query =
        query.limit(
          options.limit
        );
    }

    const {
      data,
      error
    } =
      await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /* =========================================================
     SESSION / AUTH
     ========================================================= */

  async function getCurrentUser() {
    const client =
      await getSupabaseClient();

    const {
      data,
      error
    } =
      await client.auth.getUser();

    if (error) {
      throw error;
    }

    return data?.user ||
      null;
  }

  /* =========================================================
     CURRENT USER → CLIENT PROFILE
     ========================================================= */

  async function loadClientProfile() {
    const user =
      await getCurrentUser();

    if (!user) {
      throw new Error(
        "Please sign in to continue."
      );
    }

    const rows =
      await selectRows(
        "client_data",
        "*",
        {
          auth_user_id:
            user.id
        },
        {
          limit: 1
        }
      );

    if (
      !rows.length
    ) {
      throw new Error(
        "No GLIME client profile is linked to this account."
      );
    }

    state.client =
      rows[0];

    setText(
      "clientBadge",
      state.client.client_id
        ? `Client ${state.client.client_id}`
        : "Client"
    );

    return state.client;
  }

  /* =========================================================
     COMMON ERROR-SAFE EVENT WRAPPER
     ========================================================= */

  function safeAsync(
    handler,
    fallback
  ) {
    return async function (
      event
    ) {
      try {
        if (event) {
          event.preventDefault();
        }

        await handler(
          event
        );
      } catch (
        error
      ) {
        handleError(
          error,
          fallback
        );
      }
    };
  }

  /* =========================================================
     FORM JSON HELPERS
     ========================================================= */

  function normalizeJsonArray(
    value
  ) {
    if (
      Array.isArray(value)
    ) {
      return value;
    }

    return arrayFromText(
      value
    );
  }

  function normalizeJsonObject(
    value
  ) {
    if (
      value &&
      typeof value ===
        "object" &&
      !Array.isArray(
        value
      )
    ) {
      return value;
    }

    return {};
  }

  /* =========================================================
     PART 1 END
     ========================================================= */

  window.GLIME_SERVICES_STATE =
    state;

  window.GLIME_GET_SUPABASE_CLIENT =
    getSupabaseClient;

     /* =========================================================
     CLIENT SETUP
     Industry → Business Model → Custom Business Model
     → Template Configuration
     ========================================================= */

  async function loadClientSetup() {
    const client = await getSupabaseClient();
    const clientId = tenantConfigId();

    if (!clientId) {
      throw new Error("Client ID is not available.");
    }

    const { data, error } = await client
      .from("client_industry_configurations")
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
        created_at,
        updated_at
      `)
      .eq("client_id", clientId)
      .in("status", ["draft", "active"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      state.setupSaved = false;
      return null;
    }

    state.setupSaved = true;
    state.currentIndustryConfiguration = data;

    return data;
  }


  /* =========================================================
     LOAD INDUSTRIES
     ========================================================= */

  async function loadIndustries() {
    const client = await getSupabaseClient();

    const { data, error } = await client
      .from("industries")
      .select(`
        id,
        slug,
        name,
        description,
        status,
        is_system,
        metadata
      `)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    state.industries = data || [];

    const select = $("industrySelect");

    if (!select) {
      return state.industries;
    }

    select.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select industry";
    select.appendChild(placeholder);

    state.industries.forEach((industry) => {
      const option = document.createElement("option");

      option.value = industry.id;
      option.textContent = industry.name;

      select.appendChild(option);
    });

    return state.industries;
  }


  /* =========================================================
     LOAD BUSINESS MODELS
     ========================================================= */

  async function loadBusinessModels(industryId) {
    const client = await getSupabaseClient();

    state.businessModels = [];
    state.customBusinessModels = [];

    const businessModelSelect = $("businessModelSelect");

    if (businessModelSelect) {
      businessModelSelect.innerHTML = "";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select business model";
      businessModelSelect.appendChild(placeholder);
    }

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

    if (businessModelSelect) {
      state.businessModels.forEach((model) => {
        const option = document.createElement("option");

        option.value = model.id;
        option.textContent = model.name;

        businessModelSelect.appendChild(option);
      });
    }

    return state.businessModels;
  }


  /* =========================================================
     LOAD CLIENT CUSTOM BUSINESS MODELS
     ========================================================= */

  async function loadCustomBusinessModels(
    industryConfigurationId = null
  ) {
    const client = await getSupabaseClient();
    const clientId = tenantConfigId();

    if (!clientId) {
      return [];
    }

    let query = client
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
        created_at,
        updated_at
      `)
      .eq("client_id", clientId)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (industryConfigurationId) {
      query = query.or(
        `industry_configuration_id.eq.${industryConfigurationId},industry_configuration_id.is.null`
      );
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    state.customBusinessModels = data || [];

    return state.customBusinessModels;
  }


  /* =========================================================
     LOAD TEMPLATES
     ========================================================= */

  async function loadTemplates(industryId, businessModelId) {
    const client = await getSupabaseClient();

    state.templates = [];

    if (!industryId || !businessModelId) {
      return [];
    }

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

    state.templates = data || [];

    return state.templates;
  }


  /* =========================================================
     SAVE / UPDATE INDUSTRY CONFIGURATION
     ========================================================= */

  async function saveIndustryConfiguration({
    industryId = null,
    customIndustryName = null,
    customIndustryDescription = null,
    businessModelId = null,
    selectionSource = "system"
  } = {}) {

    const client = await getSupabaseClient();
    const clientId = tenantConfigId();

    if (!clientId) {
      throw new Error("Client ID is missing.");
    }

    /*
      Backend contract:
      selection_source MUST be:
      system | custom | ai

      Never use values such as:
      services-ui
      manual
      frontend
      ui
    */

    const allowedSources = ["system", "custom", "ai"];

    if (!allowedSources.includes(selectionSource)) {
      selectionSource = "system";
    }

    if (
      selectionSource === "system" &&
      !industryId
    ) {
      throw new Error(
        "A system industry must have an industry ID."
      );
    }

    if (
      (selectionSource === "custom" ||
        selectionSource === "ai") &&
      !String(customIndustryName || "").trim()
    ) {
      throw new Error(
        "Custom or AI industry requires an industry name."
      );
    }

    const payload = {
      client_id: clientId,
      industry_id: industryId || null,
      custom_industry_name:
        customIndustryName
          ? String(customIndustryName).trim()
          : null,
      custom_industry_description:
        customIndustryDescription
          ? String(customIndustryDescription).trim()
          : null,
      business_model_id: businessModelId || null,
      selection_source: selectionSource,
      status: "active",
      metadata: {
        source: "services-ui",
        updated_by: "client"
      }
    };

    const existing = await loadClientSetup();

    let result;

    if (existing?.id) {
      result = await client
        .from("client_industry_configurations")
        .update(payload)
        .eq("id", existing.id)
        .eq("client_id", clientId)
        .select()
        .single();
    } else {
      result = await client
        .from("client_industry_configurations")
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    state.currentIndustryConfiguration = result.data;
    state.setupSaved = true;

    return result.data;
  }


  /* =========================================================
     SAVE CUSTOM BUSINESS MODEL
     ========================================================= */

  async function saveCustomBusinessModel({
    name,
    description = "",
    baseBusinessModelId = null,
    industryConfigurationId = null
  } = {}) {

    const client = await getSupabaseClient();
    const clientId = tenantConfigId();

    const cleanName = String(name || "").trim();

    if (!clientId) {
      throw new Error("Client ID is missing.");
    }

    if (!cleanName) {
      throw new Error(
        "Custom business model name is required."
      );
    }

    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

    if (!slug) {
      throw new Error(
        "Could not create a valid business model slug."
      );
    }

    const payload = {
      client_id: clientId,
      industry_configuration_id:
        industryConfigurationId || null,
      base_business_model_id:
        baseBusinessModelId || null,
      name: cleanName,
      slug,
      description:
        String(description || "").trim() || null,
      status: "active",
      is_custom: true,
      metadata: {
        source: "services-ui"
      }
    };

    const { data, error } = await client
      .from("client_custom_business_models")
      .insert(payload)
      .select()
      .single();

    if (error) {
      /*
        If the slug already exists, generate a stable suffix.
      */

      if (error.code === "23505") {
        const retryPayload = {
          ...payload,
          slug: `${slug}-${Date.now().toString(36)}`
        };

        const retry = await client
          .from("client_custom_business_models")
          .insert(retryPayload)
          .select()
          .single();

        if (retry.error) {
          throw retry.error;
        }

        state.customBusinessModels = [
          ...(state.customBusinessModels || []),
          retry.data
        ];

        return retry.data;
      }

      throw error;
    }

    state.customBusinessModels = [
      ...(state.customBusinessModels || []),
      data
    ];

    return data;
  }


  /* =========================================================
     SAVE TEMPLATE CONFIGURATION
     ========================================================= */

  async function saveTemplateConfiguration({
    industryConfigurationId,
    businessModelId = null,
    customBusinessModelId = null,
    templateId = null,
    templateName = null,
    config = {},
    metadata = {}
  } = {}) {

    const client = await getSupabaseClient();
    const clientId = tenantConfigId();

    if (!clientId) {
      throw new Error("Client ID is missing.");
    }

    if (
      !templateId &&
      !String(templateName || "").trim()
    ) {
      throw new Error(
        "A template ID or template name is required."
      );
    }

    const payload = {
      client_id: clientId,
      industry_configuration_id:
        industryConfigurationId || null,
      business_model_id:
        businessModelId || null,
      custom_business_model_id:
        customBusinessModelId || null,
      template_id:
        templateId || null,
      template_name:
        templateName
          ? String(templateName).trim()
          : null,
      status: "active",
      config: config || {},
      metadata: metadata || {}
    };

    /*
      There must be only one active template configuration
      for the client.

      Archive previous active configurations first.
    */

    const archiveResult = await client
      .from("client_template_configurations")
      .update({
        status: "archived"
      })
      .eq("client_id", clientId)
      .eq("status", "active");

    if (archiveResult.error) {
      throw archiveResult.error;
    }

    const { data, error } = await client
      .from("client_template_configurations")
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    state.currentTemplateConfiguration = data;

    return data;
  }


  /* =========================================================
     READ ACTIVE TEMPLATE CONFIGURATION
     ========================================================= */

  async function loadTemplateConfiguration() {
    const client = await getSupabaseClient();
    const clientId = tenantConfigId();

    if (!clientId) {
      return null;
    }

    const { data, error } = await client
      .from("client_template_configurations")
      .select(`
        id,
        client_id,
        industry_configuration_id,
        business_model_id,
        custom_business_model_id,
        template_id,
        template_name,
        status,
        config,
        metadata,
        created_at,
        updated_at
      `)
      .eq("client_id", clientId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    state.currentTemplateConfiguration = data || null;

    return data || null;
  }


  /* =========================================================
     UI SETUP STATE
     ========================================================= */

  function setSetupMessage(message, type = "info") {
    const element = $("message");

    if (!element) {
      return;
    }

    element.textContent = message || "";

    element.dataset.type = type;

    element.classList.remove(
      "success",
      "error",
      "warning",
      "info"
    );

    element.classList.add(type);
  }


  function setSetupState(text, type = "info") {
    const element = $("setupState");

    if (!element) {
      return;
    }

    element.textContent = text || "";

    element.dataset.type = type;
  }


  /* =========================================================
     INDUSTRY CHANGE
     ========================================================= */

  async function handleIndustryChange() {
    const select = $("industrySelect");

    if (!select) {
      return;
    }

    const industryId = select.value || null;

    if (!industryId) {
      state.businessModels = [];

      const businessModelSelect =
        $("businessModelSelect");

      if (businessModelSelect) {
        businessModelSelect.innerHTML = `
          <option value="">Select business model</option>
        `;
      }

      return;
    }

    setSetupState(
      "Loading business models…",
      "info"
    );

    try {
      await loadBusinessModels(industryId);

      setSetupState(
        "Business models loaded.",
        "success"
      );
    } catch (error) {
      console.error(
        "[GLIME] Business model load failed:",
        error
      );

      setSetupState(
        "Could not load business models.",
        "error"
      );

      setSetupMessage(
        error.message ||
          "Could not load business models.",
        "error"
      );
    }
  }


  /* =========================================================
     SAVE SETUP BUTTON
     ========================================================= */

  async function handleSaveSetup() {
    if (state.saving) {
      return;
    }

    const industrySelect = $("industrySelect");
    const businessModelSelect =
      $("businessModelSelect");
    const customBusinessModel =
      $("customBusinessModel");

    const industryId =
      industrySelect?.value || null;

    const businessModelId =
      businessModelSelect?.value || null;

    const customBusinessModelName =
      customBusinessModel?.value?.trim() || "";

    if (!industryId) {
      setSetupMessage(
        "Please select an industry first.",
        "error"
      );
      return;
    }

    if (
      !businessModelId &&
      !customBusinessModelName
    ) {
      setSetupMessage(
        "Select a business model or enter a custom business model.",
        "error"
      );
      return;
    }

    state.saving = true;

    setSetupState(
      "Saving business setup…",
      "info"
    );

    try {
      const existing =
        await loadClientSetup();

      let selectedBusinessModelId =
        businessModelId;

      let customBusinessModelId = null;

      /*
        If the user entered a custom model,
        persist it in the dedicated custom-model table.
      */

      if (customBusinessModelName) {
        const customModel =
          await saveCustomBusinessModel({
            name: customBusinessModelName,
            description:
              "Custom business model created from Services setup.",
            baseBusinessModelId:
              businessModelId || null,
            industryConfigurationId:
              existing?.id || null
          });

        customBusinessModelId =
          customModel.id;

        /*
          A custom business model does not replace
          the system business_model_id.
          The custom ID is stored separately.
        */
      }

      const industryConfiguration =
        await saveIndustryConfiguration({
          industryId,
          customIndustryName: null,
          customIndustryDescription: null,
          businessModelId:
            selectedBusinessModelId || null,
          selectionSource: "system"
        });

      /*
        Load available templates for the selected
        system business model.
      */

      const templates =
        await loadTemplates(
          industryId,
          selectedBusinessModelId
        );

      /*
        If a custom business model exists and no
        system template can be resolved, the UI can
        still continue with a custom template name.
      */

      let selectedTemplate =
        templates[0] || null;

      if (selectedTemplate) {
        await saveTemplateConfiguration({
          industryConfigurationId:
            industryConfiguration.id,
          businessModelId:
            selectedBusinessModelId || null,
          customBusinessModelId,
          templateId:
            selectedTemplate.id,
          templateName:
            selectedTemplate.name,
          config: {},
          metadata: {
            source: "services-ui",
            auto_selected: true
          }
        });
      }

      state.setupSaved = true;

      setSetupState(
        "Business setup saved.",
        "success"
      );

      setSetupMessage(
        selectedTemplate
          ? "Business setup and template saved successfully."
          : "Business setup saved. Template can be configured later.",
        "success"
      );

      await loadOffers();

    } catch (error) {
      console.error(
        "[GLIME] Setup save failed:",
        error
      );

      setSetupState(
        "Setup could not be saved.",
        "error"
      );

      setSetupMessage(
        error.message ||
          "Could not save business setup.",
        "error"
      );

    } finally {
      state.saving = false;
    }
  }


  /* =========================================================
     RESTORE SETUP INTO UI
     ========================================================= */

  async function restoreSetupUI() {
    try {
      const configuration =
        await loadClientSetup();

      if (!configuration) {
        setSetupState(
          "Business setup not configured yet.",
          "warning"
        );

        return null;
      }

      const industrySelect =
        $("industrySelect");

      const businessModelSelect =
        $("businessModelSelect");

      if (industrySelect && configuration.industry_id) {
        industrySelect.value =
          configuration.industry_id;

        await loadBusinessModels(
          configuration.industry_id
        );
      }

      if (
        businessModelSelect &&
        configuration.business_model_id
      ) {
        businessModelSelect.value =
          configuration.business_model_id;
      }

      await loadCustomBusinessModels(
        configuration.id
      );

      await loadTemplateConfiguration();

      setSetupState(
        "Business setup is active.",
        "success"
      );

      return configuration;

    } catch (error) {
      console.error(
        "[GLIME] Setup restore failed:",
        error
      );

      setSetupState(
        "Could not restore business setup.",
        "error"
      );

      return null;
    }
  }


  /* =========================================================
     SETUP EVENT BINDINGS
     ========================================================= */

  function bindSetupEvents() {

    const industrySelect =
      $("industrySelect");

    if (industrySelect) {
      industrySelect.addEventListener(
        "change",
        handleIndustryChange
      );
    }

    const saveSetupBtn =
      $("saveSetupBtn");

    if (saveSetupBtn) {
      saveSetupBtn.addEventListener(
        "click",
        handleSaveSetup
      );
    }
  }

     /* =========================================================
     CATEGORIES
     ========================================================= */

  async function loadCategories() {
    const client = await getSupabaseClient();
    const clientId = tenantOfferId();

    if (!clientId) {
      state.categories = [];
      return [];
    }

    const { data, error } = await client
      .from("offer_categories")
      .select(`
        id,
        client_id,
        name,
        slug,
        description,
        sort_order,
        is_active,
        created_at,
        updated_at
      `)
      .eq("client_id", clientId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    state.categories = data || [];

    renderCategories();
    populateCategorySelect();

    return state.categories;
  }


  function renderCategories() {
    const list = $("categoryList");

    if (!list) {
      return;
    }

    list.innerHTML = "";

    if (!state.categories.length) {
      const empty = document.createElement("div");

      empty.className = "empty-state";
      empty.textContent =
        "No categories created yet.";

      list.appendChild(empty);

      return;
    }

    state.categories.forEach((category) => {
      const item = document.createElement("div");

      item.className = "category-item";

      item.innerHTML = `
        <div class="category-item-main">
          <strong></strong>
          <span></span>
        </div>
      `;

      const name =
        item.querySelector("strong");

      const slug =
        item.querySelector("span");

      if (name) {
        name.textContent =
          category.name || "Unnamed category";
      }

      if (slug) {
        slug.textContent =
          category.slug
            ? `/${category.slug}`
            : "";
      }

      list.appendChild(item);
    });
  }


  function populateCategorySelect() {
    const select = $("offerCategory");

    if (!select) {
      return;
    }

    const currentValue =
      select.value || "";

    select.innerHTML = `
      <option value="">No category</option>
    `;

    state.categories.forEach((category) => {
      const option =
        document.createElement("option");

      option.value = category.id;
      option.textContent = category.name;

      select.appendChild(option);
    });

    if (
      currentValue &&
      state.categories.some(
        (category) =>
          category.id === currentValue
      )
    ) {
      select.value = currentValue;
    }
  }


  async function createCategory() {
    const client = await getSupabaseClient();
    const clientId = tenantOfferId();

    if (!clientId) {
      throw new Error(
        "Client ID is not available."
      );
    }

    const name = window.prompt(
      "Enter category name:"
    );

    const cleanName =
      String(name || "").trim();

    if (!cleanName) {
      return null;
    }

    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

    if (!slug) {
      throw new Error(
        "Could not create a valid category slug."
      );
    }

    const nextSortOrder =
      state.categories.length
        ? Math.max(
            ...state.categories.map(
              (item) =>
                Number(item.sort_order) || 0
            )
          ) + 1
        : 0;

    const { data, error } = await client
      .from("offer_categories")
      .insert({
        client_id: clientId,
        name: cleanName,
        slug,
        description: null,
        sort_order: nextSortOrder,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    state.categories.push(data);

    renderCategories();
    populateCategorySelect();

    const categorySelect =
      $("offerCategory");

    if (categorySelect) {
      categorySelect.value = data.id;
    }

    return data;
  }


  /* =========================================================
     ENTITY TYPES
     ========================================================= */

  async function loadEntityTypes() {
    const client = await getSupabaseClient();

    const { data, error } = await client
      .from("entity_types")
      .select(`
        id,
        name,
        slug,
        description,
        status,
        metadata
      `)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    state.entityTypes = data || [];

    return state.entityTypes;
  }


  /*
    UI type → database offer_type

    Database currently permits only:
      service
      product
      package
      offer

    Rich entity identity is preserved through
    offer_catalog_bindings.entity_type_id.
  */

  function mapUIOfferTypeToDatabase(
    uiType
  ) {
    const value =
      String(uiType || "service")
        .trim()
        .toLowerCase();

    const mapping = {
      service: "service",
      product: "product",
      package: "package",

      /*
        These are richer entity types but the
        offers table currently uses generic "offer".
      */
      plan: "offer",
      property: "offer",
      "menu-item": "offer",
      custom: "offer"
    };

    return mapping[value] || "service";
  }


  function normalizeUIOfferType(
    uiType
  ) {
    const value =
      String(uiType || "service")
        .trim()
        .toLowerCase();

    const allowed = [
      "service",
      "product",
      "package",
      "plan",
      "property",
      "menu-item",
      "custom"
    ];

    return allowed.includes(value)
      ? value
      : "service";
  }


  function getEntityTypeCandidates(
    uiType
  ) {
    const type =
      normalizeUIOfferType(uiType);

    const names = {
      service: [
        "service"
      ],

      product: [
        "product"
      ],

      package: [
        "package"
      ],

      plan: [
        "plan"
      ],

      property: [
        "property"
      ],

      "menu-item": [
        "menu item",
        "menu-item",
        "menu_item",
        "menuitem"
      ],

      custom: [
        "custom"
      ]
    };

    return names[type] || [
      type
    ];
  }


  function findEntityTypeForUIType(
    uiType
  ) {
    const candidates =
      getEntityTypeCandidates(uiType);

    const normalizedCandidates =
      candidates.map(
        (value) =>
          String(value)
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .trim()
      );

    return (
      state.entityTypes.find((entity) => {
        const name =
          String(entity.name || "")
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .trim();

        const slug =
          String(entity.slug || "")
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .trim();

        return (
          normalizedCandidates.includes(name) ||
          normalizedCandidates.includes(slug)
        );
      }) || null
    );
  }


  /* =========================================================
     OFFER LIST
     ========================================================= */

  async function loadOffers() {
    const client = await getSupabaseClient();
    const clientId = tenantOfferId();

    if (!clientId) {
      state.offers = [];
      renderOfferList();
      updateOfferCount();
      return [];
    }

    const { data, error } = await client
      .from("offers")
      .select(`
        id,
        client_id,
        offer_type,
        name,
        slug,
        short_description,
        description,
        category_id,
        status,
        current_version_id,
        created_at,
        updated_at
      `)
      .eq("client_id", clientId)
      .order("updated_at", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    state.offers = data || [];

    renderOfferList();
    updateOfferCount();

    return state.offers;
  }


  function updateOfferCount() {
    const count = $("offerCount");

    if (!count) {
      return;
    }

    count.textContent =
      String(state.offers.length);
  }


  function renderOfferList() {
    const list = $("offerList");

    if (!list) {
      return;
    }

    list.innerHTML = "";

    if (!state.offers.length) {
      const empty =
        document.createElement("div");

      empty.className = "empty-state";

      empty.textContent =
        "No services or offers created yet.";

      list.appendChild(empty);

      return;
    }

    state.offers.forEach((offer) => {
      const item =
        document.createElement("button");

      item.type = "button";
      item.className = "offer-list-item";

      const status =
        String(offer.status || "draft");

      item.innerHTML = `
        <div class="offer-list-main">
          <strong></strong>
          <span></span>
        </div>
        <div class="offer-list-meta">
          <span class="offer-type"></span>
          <span class="offer-status"></span>
        </div>
      `;

      const title =
        item.querySelector("strong");

      const description =
        item.querySelector("span");

      const type =
        item.querySelector(".offer-type");

      const statusElement =
        item.querySelector(".offer-status");

      if (title) {
        title.textContent =
          offer.name || "Untitled";
      }

      if (description) {
        description.textContent =
          offer.short_description || "";
      }

      if (type) {
        type.textContent =
          normalizeUIOfferType(
            offer.offer_type
          );
      }

      if (statusElement) {
        statusElement.textContent =
          status;
      }

      item.addEventListener(
        "click",
        () => openOffer(offer.id)
      );

      list.appendChild(item);
    });
  }


  /* =========================================================
     CREATE NEW OFFER
     ========================================================= */

  function createSlug(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);
  }


  async function createNewOffer(
    requestedType = "service"
  ) {
    const client = await getSupabaseClient();
    const clientId = tenantOfferId();

    if (!clientId) {
      throw new Error(
        "Client ID is not available."
      );
    }

    const uiType =
      normalizeUIOfferType(
        requestedType
      );

    const dbType =
      mapUIOfferTypeToDatabase(
        uiType
      );

    const entityType =
      findEntityTypeForUIType(uiType);

    if (!entityType) {
      throw new Error(
        `Entity type "${uiType}" is not configured in the database.`
      );
    }

    const defaultName =
      uiType === "service"
        ? "New Service"
        : uiType === "product"
          ? "New Product"
          : uiType === "package"
            ? "New Package"
            : uiType === "plan"
              ? "New Plan"
              : uiType === "property"
                ? "New Property"
                : uiType === "menu-item"
                  ? "New Menu Item"
                  : "New Custom Offer";

    const baseSlug =
      createSlug(defaultName);

    /*
      Avoid guessing that a slug is unique.
      Generate a client-safe unique slug.
    */

    const slug =
      `${baseSlug}-${Date.now().toString(36)}`;

    const { data: offer, error } =
      await client
        .from("offers")
        .insert({
          client_id: clientId,
          offer_type: dbType,
          name: defaultName,
          slug,
          short_description: "",
          description: "",
          category_id: null,
          status: "draft"
        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    /*
      Version 1 starts as draft.
    */

    const { data: version, error: versionError } =
      await client
        .from("offer_versions")
        .insert({
          offer_id: offer.id,
          version_number: 1,
          status: "draft",
          title: defaultName,
          description: "",
          sales_talking_points: [],
          allowed_claims: [],
          restrictions: [],
          customer_eligibility: [],
          metadata: {
            ui_offer_type: uiType,
            entity_type_id: entityType.id,
            created_from: "services-ui"
          }
        })
        .select()
        .single();

    if (versionError) {
      /*
        Roll back the offer if version creation fails.
      */

      await client
        .from("offers")
        .delete()
        .eq("id", offer.id)
        .eq("client_id", clientId);

      throw versionError;
    }

    /*
      Current version points to version 1.
    */

    const { data: updatedOffer,
      error: updateError } =
      await client
        .from("offers")
        .update({
          current_version_id: version.id
        })
        .eq("id", offer.id)
        .eq("client_id", clientId)
        .select()
        .single();

    if (updateError) {
      throw updateError;
    }

    /*
      Binding is mandatory because entity_type_id
      is NOT NULL in the database.
    */

    const binding =
      await ensureOfferBinding(
        updatedOffer.id,
        version.id,
        uiType
      );

    state.offers.unshift(
      updatedOffer
    );

    renderOfferList();
    updateOfferCount();

    state.currentOffer =
      updatedOffer;

    state.currentVersion =
      version;

    state.currentBinding =
      binding;

    state.sourceVersion = null;

    showEditor();

    loadOfferIntoForm(
      updatedOffer,
      version,
      binding
    );

    return {
      offer: updatedOffer,
      version,
      binding
    };
  }


  /* =========================================================
     ENSURE CATALOG BINDING
     ========================================================= */

  async function ensureOfferBinding(
    offerId,
    versionId,
    uiType = null
  ) {
    const client =
      await getSupabaseClient();

    const clientId =
      tenantOfferId();

    if (!offerId || !clientId) {
      throw new Error(
        "Offer or client ID is missing."
      );
    }

    /*
      First check existing binding.
    */

    const { data: existing,
      error: existingError } =
      await client
        .from("offer_catalog_bindings")
        .select(`
          id,
          offer_id,
          client_id,
          entity_type_id,
          template_configuration_id,
          status,
          custom_data,
          metadata,
          created_at,
          updated_at
        `)
        .eq("offer_id", offerId)
        .eq("client_id", clientId)
        .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    let resolvedUIType =
      uiType ||
      state.currentBinding?.metadata?.ui_offer_type ||
      state.currentVersion?.metadata?.ui_offer_type ||
      state.currentOffer?.offer_type ||
      "service";

    resolvedUIType =
      normalizeUIOfferType(
        resolvedUIType
      );

    const entityType =
      findEntityTypeForUIType(
        resolvedUIType
      );

    if (!entityType) {
      throw new Error(
        `No entity type exists for "${resolvedUIType}".`
      );
    }

    const metadata = {
      ...(existing?.metadata || {}),
      ui_offer_type: resolvedUIType,
      db_offer_type:
        mapUIOfferTypeToDatabase(
          resolvedUIType
        ),
      entity_type_id:
        entityType.id,
      source: "services-ui"
    };

    const customData = {
      ...(existing?.custom_data || {}),
      ui_offer_type: resolvedUIType
    };

    if (existing) {
      const { data, error } =
        await client
          .from("offer_catalog_bindings")
          .update({
            entity_type_id:
              entityType.id,
            status:
              existing.status === "active"
                ? "active"
                : "draft",
            custom_data: customData,
            metadata
          })
          .eq("id", existing.id)
          .eq("client_id", clientId)
          .select()
          .single();

      if (error) {
        throw error;
      }

      state.currentBinding =
        data;

      return data;
    }

    /*
      Resolve the active client template configuration.
    */

    const { data: templateConfig,
      error: templateError } =
      await client
        .from("client_template_configurations")
        .select(`
          id,
          template_id,
          template_name,
          status
        `)
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("updated_at", {
          ascending: false
        })
        .limit(1)
        .maybeSingle();

    if (templateError) {
      throw templateError;
    }

    const { data, error } =
      await client
        .from("offer_catalog_bindings")
        .insert({
          offer_id: offerId,
          client_id: clientId,
          entity_type_id:
            entityType.id,
          template_configuration_id:
            templateConfig?.id || null,
          status: "draft",
          custom_data: customData,
          metadata
        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    state.currentBinding =
      data;

    return data;
  }


  /* =========================================================
     OPEN EXISTING OFFER
     ========================================================= */

  async function openOffer(
    offerId
  ) {
    const client =
      await getSupabaseClient();

    const clientId =
      tenantOfferId();

    if (!offerId || !clientId) {
      throw new Error(
        "Offer ID or client ID is missing."
      );
    }

    const { data: offer,
      error: offerError } =
      await client
        .from("offers")
        .select(`
          id,
          client_id,
          offer_type,
          name,
          slug,
          short_description,
          description,
          category_id,
          status,
          current_version_id,
          created_at,
          updated_at
        `)
        .eq("id", offerId)
        .eq("client_id", clientId)
        .single();

    if (offerError) {
      throw offerError;
    }

    const { data: versions,
      error: versionsError } =
      await client
        .from("offer_versions")
        .select(`
          id,
          offer_id,
          version_number,
          status,
          title,
          description,
          sales_talking_points,
          allowed_claims,
          restrictions,
          customer_eligibility,
          metadata,
          published_at,
          created_at,
          updated_at
        `)
        .eq("offer_id", offerId)
        .order("version_number", {
          ascending: false
        });

    if (versionsError) {
      throw versionsError;
    }

    if (!versions?.length) {
      throw new Error(
        "No version exists for this offer."
      );
    }

    /*
      Prefer current_version_id.
      Fall back to latest version.
    */

    const currentVersion =
      versions.find(
        (version) =>
          version.id ===
          offer.current_version_id
      ) ||
      versions[0];

    /*
      Binding.
    */

    const { data: binding,
      error: bindingError } =
      await client
        .from("offer_catalog_bindings")
        .select(`
          id,
          offer_id,
          client_id,
          entity_type_id,
          template_configuration_id,
          status,
          custom_data,
          metadata,
          created_at,
          updated_at,
          entity_types (
            id,
            name,
            slug
          )
        `)
        .eq("offer_id", offerId)
        .eq("client_id", clientId)
        .maybeSingle();

    if (bindingError) {
      throw bindingError;
    }

    /*
      Ensure binding exists for legacy offers.
    */

    let finalBinding =
      binding;

    if (!finalBinding) {
      finalBinding =
        await ensureOfferBinding(
          offer.id,
          currentVersion.id,
          currentVersion?.metadata?.ui_offer_type ||
            offer.offer_type
        );
    }

    /*
      Load availability.
    */

    const { data: availability,
      error: availabilityError } =
      await client
        .from("offer_availability")
        .select(`
          id,
          offer_version_id,
          day_of_week,
          start_time,
          end_time,
          timezone,
          capacity,
          is_available,
          notes
        `)
        .eq(
          "offer_version_id",
          currentVersion.id
        )
        .order("day_of_week", {
          ascending: true
        });

    if (availabilityError) {
      throw availabilityError;
    }

    state.currentOffer =
      offer;

    state.currentVersion =
      currentVersion;

    state.currentBinding =
      finalBinding;

    state.availability =
      availability || [];

    state.sourceVersion =
      null;

    showEditor();

    await loadOfferIntoForm(
      offer,
      currentVersion,
      finalBinding
    );

    return {
      offer,
      versions,
      version: currentVersion,
      binding: finalBinding,
      availability:
        state.availability
    };
  }


  /* =========================================================
     EDITOR VISIBILITY
     ========================================================= */

  function showEditor() {
    const empty =
      $("editorEmpty");

    const form =
      $("offerForm");

    if (empty) {
      empty.hidden = true;
    }

    if (form) {
      form.hidden = false;
    }
  }


  function hideEditor() {
    const empty =
      $("editorEmpty");

    const form =
      $("offerForm");

    if (empty) {
      empty.hidden = false;
    }

    if (form) {
      form.hidden = true;
    }
  }


  /* =========================================================
     NEW OFFER BUTTON
     ========================================================= */

  async function handleNewOffer() {
    try {
      const selectedType =
        $("offerType")?.value ||
        "service";

      await createNewOffer(
        selectedType
      );

      setSetupMessage(
        "New draft created.",
        "success"
      );

    } catch (error) {
      console.error(
        "[GLIME] New offer creation failed:",
        error
      );

      setSetupMessage(
        error.message ||
          "Could not create the new offer.",
        "error"
      );
    }
  }


  /* =========================================================
     REFRESH
     ========================================================= */

  async function refreshServicesData() {
    try {
      setSetupState(
        "Refreshing…",
        "info"
      );

      await Promise.all([
        loadEntityTypes(),
        loadCategories(),
        loadOffers()
      ]);

      await restoreSetupUI();

      setSetupState(
        "Ready.",
        "success"
      );

    } catch (error) {
      console.error(
        "[GLIME] Services refresh failed:",
        error
      );

      setSetupState(
        "Refresh failed.",
        "error"
      );

      setSetupMessage(
        error.message ||
          "Could not refresh Services.",
        "error"
      );
    }
  }


  /* =========================================================
     PART 3 COMPLETE
     ========================================================= */

     /* =========================================================
     PART 4/5
     OFFER FORM + VERSION DATA + PRICING
     + VARIANTS + AVAILABILITY + DRAFT SAVE
     ========================================================= */


  /* =========================================================
     FORM VALUE HELPERS
     ========================================================= */

  function setFieldValue(
    id,
    value
  ) {
    const element = $(id);

    if (!element) {
      return;
    }

    if (
      element.type === "checkbox"
    ) {
      element.checked =
        Boolean(value);

      return;
    }

    element.value =
      value == null
        ? ""
        : String(value);
  }


  function getFieldValue(
    id
  ) {
    const element = $(id);

    if (!element) {
      return "";
    }

    if (
      element.type === "checkbox"
    ) {
      return element.checked;
    }

    return element.value;
  }


  function parseJSONField(
    value,
    fallback = []
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return fallback;
    }

    if (
      Array.isArray(value) ||
      typeof value === "object"
    ) {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }


  function arrayToText(
    value
  ) {
    const array =
      parseJSONField(
        value,
        []
      );

    if (!Array.isArray(array)) {
      return String(
        value || ""
      );
    }

    return array
      .map((item) => {
        if (
          typeof item === "string"
        ) {
          return item;
        }

        return JSON.stringify(item);
      })
      .join("\n");
  }


  function textToArray(
    value
  ) {
    return String(value || "")
      .split("\n")
      .map(
        (item) =>
          item.trim()
      )
      .filter(Boolean);
  }


  /* =========================================================
     ENTITY TYPE → UI TYPE
     ========================================================= */

  function resolveUITypeFromBinding(
    binding,
    offer,
    version
  ) {
    const metadataType =
      binding?.metadata?.ui_offer_type ||
      binding?.custom_data?.ui_offer_type ||
      version?.metadata?.ui_offer_type;

    if (metadataType) {
      return normalizeUIOfferType(
        metadataType
      );
    }

    const entity =
      binding?.entity_types;

    if (entity) {
      const name =
        String(
          entity.name || ""
        )
          .toLowerCase()
          .trim();

      const slug =
        String(
          entity.slug || ""
        )
          .toLowerCase()
          .trim();

      if (
        name === "menu item" ||
        slug === "menu-item" ||
        slug === "menu_item"
      ) {
        return "menu-item";
      }

      if (
        name === "plan" ||
        slug === "plan"
      ) {
        return "plan";
      }

      if (
        name === "property" ||
        slug === "property"
      ) {
        return "property";
      }

      if (
        name === "custom" ||
        slug === "custom"
      ) {
        return "custom";
      }

      if (
        name === "package" ||
        slug === "package"
      ) {
        return "package";
      }

      if (
        name === "product" ||
        slug === "product"
      ) {
        return "product";
      }

      if (
        name === "service" ||
        slug === "service"
      ) {
        return "service";
      }
    }

    return normalizeUIOfferType(
      offer?.offer_type ||
        "service"
    );
  }


  /* =========================================================
     LOAD OFFER INTO FORM
     ========================================================= */

  async function loadOfferIntoForm(
    offer,
    version,
    binding
  ) {
    if (!offer || !version) {
      return;
    }

    const client =
      await getSupabaseClient();

    /*
      UI entity type must come from binding/version
      rather than blindly using offers.offer_type.
    */

    const uiOfferType =
      resolveUITypeFromBinding(
        binding,
        offer,
        version
      );

    setFieldValue(
      "offerName",
      offer.name ||
        version.title ||
        ""
    );

    setFieldValue(
      "offerType",
      uiOfferType
    );

    setFieldValue(
      "offerCategory",
      offer.category_id ||
        ""
    );

    setFieldValue(
      "shortDescription",
      offer.short_description ||
        ""
    );

    setFieldValue(
      "offerDescription",
      version.description ||
        offer.description ||
        ""
    );

    setFieldValue(
      "eligibility",
      arrayToText(
        version.customer_eligibility
      )
    );

    setFieldValue(
      "talkingPoints",
      arrayToText(
        version.sales_talking_points
      )
    );

    setFieldValue(
      "allowedClaims",
      arrayToText(
        version.allowed_claims
      )
    );

    setFieldValue(
      "restrictions",
      arrayToText(
        version.restrictions
      )
    );


    /*
      Rich metadata stores fields that are not direct
      columns in offer_versions.
    */

    const metadata =
      version.metadata || {};

    setFieldValue(
      "detailDuration",
      metadata.duration ||
        ""
    );

    setFieldValue(
      "included",
      arrayToText(
        metadata.included
      )
    );

    setFieldValue(
      "excluded",
      arrayToText(
        metadata.excluded
      )
    );

    setFieldValue(
      "faqs",
      arrayToText(
        metadata.faqs
      )
    );

    setFieldValue(
      "policies",
      arrayToText(
        metadata.policies
      )
    );

    setFieldValue(
      "qualification",
      arrayToText(
        metadata.qualification
      )
    );

    setFieldValue(
      "aiInstructions",
      metadata.ai_instructions ||
        ""
    );

    setFieldValue(
      "websiteLink",
      metadata.links?.website ||
        ""
    );

    setFieldValue(
      "bookingLink",
      metadata.links?.booking ||
        ""
    );

    setFieldValue(
      "instagramLink",
      metadata.links?.instagram ||
        ""
    );

    setFieldValue(
      "facebookLink",
      metadata.links?.facebook ||
        ""
    );

    setFieldValue(
      "mediaUrls",
      arrayToText(
        metadata.media_urls
      )
    );

    setFieldValue(
      "aliases",
      arrayToText(
        metadata.aliases
      )
    );

    /*
      Pricing.
    */

    await loadPricingIntoForm(
      version.id
    );

    /*
      Availability.
    */

    await loadAvailability(
      version.id
    );

    renderAvailability();

    /*
      UI status.
    */

    setEditorStatus(
      version.status
    );

    setEditorTitle(
      offer.name ||
        version.title ||
        "Offer"
    );

    updateProgress();

    return {
      offer,
      version,
      binding
    };
  }


  /* =========================================================
     EDITOR HEADER
     ========================================================= */

  function setEditorTitle(
    value
  ) {
    const element =
      $("editorTitle");

    if (element) {
      element.textContent =
        value || "Offer";
    }
  }


  function setEditorStatus(
    status
  ) {
    const element =
      $("editorStatus");

    if (!element) {
      return;
    }

    element.textContent =
      status || "draft";

    element.dataset.status =
      status || "draft";
  }


  /* =========================================================
     LOAD PRICING
     ========================================================= */

  async function loadPricingIntoForm(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    const { data, error } =
      await client
        .from("offer_prices")
        .select(`
          id,
          offer_version_id,
          variant_id,
          amount,
          currency,
          price_type,
          min_amount,
          max_amount,
          billing_period,
          is_active
        `)
        .eq(
          "offer_version_id",
          versionId
        )
        .eq(
          "is_active",
          true
        )
        .order("id", {
          ascending: true
        });

    if (error) {
      throw error;
    }

    const price =
      data?.[0] || null;

    if (!price) {
      setFieldValue(
        "priceAmount",
        ""
      );

      setFieldValue(
        "priceCurrency",
        "INR"
      );

      setFieldValue(
        "priceType",
        "fixed"
      );

      setFieldValue(
        "billingPeriod",
        ""
      );

      setFieldValue(
        "minAmount",
        ""
      );

      setFieldValue(
        "maxAmount",
        ""
      );

      toggleRangeFields(
        "fixed"
      );

      return data || [];
    }

    setFieldValue(
      "priceAmount",
      price.amount
    );

    setFieldValue(
      "priceCurrency",
      price.currency ||
        "INR"
    );

    setFieldValue(
      "priceType",
      price.price_type ||
        "fixed"
    );

    setFieldValue(
      "billingPeriod",
      price.billing_period ||
        ""
    );

    setFieldValue(
      "minAmount",
      price.min_amount
    );

    setFieldValue(
      "maxAmount",
      price.max_amount
    );

    toggleRangeFields(
      price.price_type
    );

    return data;
  }


  function toggleRangeFields(
    priceType
  ) {
    const rangeRow =
      $("rangeRow");

    if (!rangeRow) {
      return;
    }

    const show =
      priceType === "range";

    rangeRow.hidden =
      !show;
  }


  /* =========================================================
     SAVE PRICING
     ========================================================= */

  async function savePricing(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    if (!versionId) {
      throw new Error(
        "Version ID is required for pricing."
      );
    }

    const priceType =
      String(
        getFieldValue(
          "priceType"
        ) || "fixed"
      ).toLowerCase();

    const currency =
      String(
        getFieldValue(
          "priceCurrency"
        ) || "INR"
      )
        .trim()
        .toUpperCase();

    let amount =
      parseFloat(
        getFieldValue(
          "priceAmount"
        )
      );

    let minAmount =
      parseFloat(
        getFieldValue(
          "minAmount"
        )
      );

    let maxAmount =
      parseFloat(
        getFieldValue(
          "maxAmount"
        )
      );

    if (
      Number.isNaN(amount)
    ) {
      amount = null;
    }

    if (
      Number.isNaN(minAmount)
    ) {
      minAmount = null;
    }

    if (
      Number.isNaN(maxAmount)
    ) {
      maxAmount = null;
    }

    /*
      Database requires amount NOT NULL.

      For range pricing, use min_amount as the
      base amount when the main amount is empty.
    */

    if (
      priceType === "range"
    ) {
      if (
        minAmount === null &&
        maxAmount !== null
      ) {
        minAmount =
          maxAmount;
      }

      if (
        amount === null &&
        minAmount !== null
      ) {
        amount =
          minAmount;
      }

      if (
        amount === null &&
        maxAmount !== null
      ) {
        amount =
          maxAmount;
      }

      if (
        minAmount !== null &&
        maxAmount !== null &&
        minAmount > maxAmount
      ) {
        throw new Error(
          "Minimum price cannot be greater than maximum price."
        );
      }
    }

    /*
      Custom pricing can legitimately have no numeric
      customer-facing price. Database still requires
      a non-null amount, so zero is used as the storage
      placeholder while price_type=custom carries the
      actual semantic meaning.
    */

    if (
      amount === null &&
      priceType === "custom"
    ) {
      amount = 0;
    }

    /*
      Starting-from pricing requires a usable amount.
    */

    if (
      amount === null &&
      priceType === "starting_from"
    ) {
      if (
        minAmount !== null
      ) {
        amount =
          minAmount;
      } else {
        throw new Error(
          "Starting-from pricing requires an amount."
        );
      }
    }

    if (
      amount === null
    ) {
      throw new Error(
        "Please enter a valid price."
      );
    }

    if (
      amount < 0
    ) {
      throw new Error(
        "Price cannot be negative."
      );
    }

    if (
      minAmount !== null &&
      minAmount < 0
    ) {
      throw new Error(
        "Minimum price cannot be negative."
      );
    }

    if (
      maxAmount !== null &&
      maxAmount < 0
    ) {
      throw new Error(
        "Maximum price cannot be negative."
      );
    }

    /*
      Disable previous active prices first.
    */

    const deactivate =
      await client
        .from("offer_prices")
        .update({
          is_active: false
        })
        .eq(
          "offer_version_id",
          versionId
        )
        .eq(
          "is_active",
          true
        );

    if (deactivate.error) {
      throw deactivate.error;
    }

    const payload = {
      offer_version_id:
        versionId,
      variant_id: null,
      amount,
      currency,
      price_type:
        priceType,
      min_amount:
        priceType === "range"
          ? minAmount
          : null,
      max_amount:
        priceType === "range"
          ? maxAmount
          : null,
      billing_period:
        String(
          getFieldValue(
            "billingPeriod"
          ) || ""
        ).trim() || null,
      is_active: true
    };

    const { data, error } =
      await client
        .from("offer_prices")
        .insert(payload)
        .select()
        .single();

    if (error) {
      throw error;
    }

    return data;
  }


  /* =========================================================
     AVAILABILITY
     ========================================================= */

  async function loadAvailability(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    const { data, error } =
      await client
        .from("offer_availability")
        .select(`
          id,
          offer_version_id,
          day_of_week,
          start_time,
          end_time,
          timezone,
          capacity,
          is_available,
          notes
        `)
        .eq(
          "offer_version_id",
          versionId
        )
        .order("day_of_week", {
          ascending: true
        });

    if (error) {
      throw error;
    }

    state.availability =
      data || [];

    return state.availability;
  }


  function renderAvailability() {
    const list =
      $("availabilityList");

    if (!list) {
      return;
    }

    list.innerHTML = "";

    if (!state.availability.length) {
      const empty =
        document.createElement("div");

      empty.className =
        "empty-state";

      empty.textContent =
        "No availability rules added.";

      list.appendChild(empty);

      return;
    }

    state.availability.forEach(
      (item, index) => {
        const row =
          document.createElement("div");

        row.className =
          "availability-item";

        const day =
          item.day_of_week === null
            ? "Any day"
            : [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday"
              ][
                Number(
                  item.day_of_week
                )
              ] || "Day";

        const time =
          item.start_time &&
          item.end_time
            ? `${item.start_time} – ${item.end_time}`
            : "All day";

        row.innerHTML = `
          <div>
            <strong></strong>
            <span></span>
          </div>
          <button
            type="button"
            class="availability-remove"
            data-index="${index}"
          >
            Remove
          </button>
        `;

        const strong =
          row.querySelector(
            "strong"
          );

        const span =
          row.querySelector(
            "span"
          );

        if (strong) {
          strong.textContent =
            day;
        }

        if (span) {
          span.textContent =
            `${time} · ${
              item.timezone ||
              "UTC"
            }`;
        }

        const removeButton =
          row.querySelector(
            ".availability-remove"
          );

        if (removeButton) {
          removeButton.addEventListener(
            "click",
            () =>
              removeAvailability(
                index
              )
          );
        }

        list.appendChild(row);
      }
    );
  }


  async function addAvailability() {
    const versionId =
      state.currentVersion?.id;

    if (!versionId) {
      setSetupMessage(
        "Create or open an offer first.",
        "error"
      );

      return;
    }

    const dayInput =
      window.prompt(
        "Day of week (0=Sunday, 1=Monday ... 6=Saturday). Leave empty for every day:"
      );

    let dayOfWeek =
      String(dayInput || "")
        .trim();

    if (dayOfWeek === "") {
      dayOfWeek = null;
    } else {
      dayOfWeek =
        Number(dayOfWeek);

      if (
        !Number.isInteger(
          dayOfWeek
        ) ||
        dayOfWeek < 0 ||
        dayOfWeek > 6
      ) {
        setSetupMessage(
          "Day must be between 0 and 6.",
          "error"
        );

        return;
      }
    }

    const startTime =
      window.prompt(
        "Start time (HH:MM), or leave empty for all day:"
      );

    const endTime =
      window.prompt(
        "End time (HH:MM), or leave empty for all day:"
      );

    const timezone =
      window.prompt(
        "Timezone:",
        "Asia/Kolkata"
      ) || "Asia/Kolkata";

    const capacityInput =
      window.prompt(
        "Capacity (optional):"
      );

    let capacity =
      capacityInput
        ? Number(capacityInput)
        : null;

    if (
      capacity !== null &&
      (
        !Number.isFinite(
          capacity
        ) ||
        capacity <= 0
      )
    ) {
      setSetupMessage(
        "Capacity must be greater than zero.",
        "error"
      );

      return;
    }

    const client =
      await getSupabaseClient();

    const payload = {
      offer_version_id:
        versionId,
      day_of_week:
        dayOfWeek,
      start_time:
        String(
          startTime || ""
        ).trim() || null,
      end_time:
        String(
          endTime || ""
        ).trim() || null,
      timezone:
        String(
          timezone
        ).trim() ||
        "Asia/Kolkata",
      capacity,
      is_available: true,
      notes: null
    };

    if (
      (
        payload.start_time &&
        !payload.end_time
      ) ||
      (
        !payload.start_time &&
        payload.end_time
      )
    ) {
      setSetupMessage(
        "Start and end time must both be provided.",
        "error"
      );

      return;
    }

    const { data, error } =
      await client
        .from("offer_availability")
        .insert(payload)
        .select()
        .single();

    if (error) {
      throw error;
    }

    state.availability.push(
      data
    );

    renderAvailability();

    return data;
  }


  async function removeAvailability(
    index
  ) {
    const item =
      state.availability[index];

    if (!item) {
      return;
    }

    const client =
      await getSupabaseClient();

    const { error } =
      await client
        .from("offer_availability")
        .delete()
        .eq(
          "id",
          item.id
        )
        .eq(
          "offer_version_id",
          state.currentVersion.id
        );

    if (error) {
      throw error;
    }

    state.availability.splice(
      index,
      1
    );

    renderAvailability();
  }


  /* =========================================================
     BUILD VERSION METADATA FROM FORM
     ========================================================= */

  function buildVersionMetadata() {
    return {
      duration:
        String(
          getFieldValue(
            "detailDuration"
          ) || ""
        ).trim() || null,

      included:
        textToArray(
          getFieldValue(
            "included"
          )
        ),

      excluded:
        textToArray(
          getFieldValue(
            "excluded"
          )
        ),

      faqs:
        textToArray(
          getFieldValue(
            "faqs"
          )
        ),

      policies:
        textToArray(
          getFieldValue(
            "policies"
          )
        ),

      qualification:
        textToArray(
          getFieldValue(
            "qualification"
          )
        ),

      ai_instructions:
        String(
          getFieldValue(
            "aiInstructions"
          ) || ""
        ).trim(),

      aliases:
        textToArray(
          getFieldValue(
            "aliases"
          )
        ),

      media_urls:
        textToArray(
          getFieldValue(
            "mediaUrls"
          )
        ),

      links: {
        website:
          String(
            getFieldValue(
              "websiteLink"
            ) || ""
          ).trim(),

        booking:
          String(
            getFieldValue(
              "bookingLink"
            ) || ""
          ).trim(),

        instagram:
          String(
            getFieldValue(
              "instagramLink"
            ) || ""
          ).trim(),

        facebook:
          String(
            getFieldValue(
              "facebookLink"
            ) || ""
          ).trim()
      },

      ui_offer_type:
        normalizeUIOfferType(
          getFieldValue(
            "offerType"
          )
        ),

      saved_from:
        "services-ui"
    };
  }


  /* =========================================================
     SAVE OFFER DRAFT
     ========================================================= */

  async function saveCurrentDraft() {
    if (!state.currentOffer) {
      throw new Error(
        "No offer is currently open."
      );
    }

    const client =
      await getSupabaseClient();

    const clientId =
      tenantOfferId();

    if (!clientId) {
      throw new Error(
        "Client ID is missing."
      );
    }

    state.saving = true;

    try {
      /*
        If current version is not draft, create a new
        draft version first instead of modifying a
        review/approved/published version.
      */

      if (
        !state.currentVersion ||
        state.currentVersion.status !==
          "draft"
      ) {
        await createDraftFromCurrent();
      }

      const offer =
        state.currentOffer;

      const version =
        state.currentVersion;

      const uiOfferType =
        normalizeUIOfferType(
          getFieldValue(
            "offerType"
          ) ||
            version?.metadata?.ui_offer_type ||
            offer.offer_type
        );

      const dbOfferType =
        mapUIOfferTypeToDatabase(
          uiOfferType
        );

      const name =
        String(
          getFieldValue(
            "offerName"
          ) || ""
        ).trim();

      if (!name) {
        throw new Error(
          "Offer name is required."
        );
      }

      const shortDescription =
        String(
          getFieldValue(
            "shortDescription"
          ) || ""
        ).trim();

      const description =
        String(
          getFieldValue(
            "offerDescription"
          ) || ""
        ).trim();

      const metadata =
        buildVersionMetadata();

      /*
        Keep the UI entity identity in metadata.
      */

      metadata.ui_offer_type =
        uiOfferType;

      metadata.db_offer_type =
        dbOfferType;


      /* -----------------------------------------------
         UPDATE OFFER
         ----------------------------------------------- */

      const { data: updatedOffer,
        error: offerError } =
        await client
          .from("offers")
          .update({
            offer_type:
              dbOfferType,
            name,
            short_description:
              shortDescription,
            description,
            category_id:
              getFieldValue(
                "offerCategory"
              ) || null
          })
          .eq("id", offer.id)
          .eq(
            "client_id",
            clientId
          )
          .select()
          .single();

      if (offerError) {
        throw offerError;
      }


      /* -----------------------------------------------
         UPDATE VERSION
         ----------------------------------------------- */

      const { data: updatedVersion,
        error: versionError } =
        await client
          .from("offer_versions")
          .update({
            title: name,
            description,
            sales_talking_points:
              textToArray(
                getFieldValue(
                  "talkingPoints"
                )
              ),
            allowed_claims:
              textToArray(
                getFieldValue(
                  "allowedClaims"
                )
              ),
            restrictions:
              textToArray(
                getFieldValue(
                  "restrictions"
                )
              ),
            customer_eligibility:
              textToArray(
                getFieldValue(
                  "eligibility"
                )
              ),
            metadata
          })
          .eq(
            "id",
            version.id
          )
          .eq(
            "offer_id",
            offer.id
          )
          .eq(
            "status",
            "draft"
          )
          .select()
          .single();

      if (versionError) {
        throw versionError;
      }


      /* -----------------------------------------------
         PRICING
         ----------------------------------------------- */

      await savePricing(
        updatedVersion.id
      );


      /* -----------------------------------------------
         BINDING
         ----------------------------------------------- */

      const binding =
        await ensureOfferBinding(
          offer.id,
          updatedVersion.id,
          uiOfferType
        );


      /* -----------------------------------------------
         UPDATE LOCAL STATE
         ----------------------------------------------- */

      state.currentOffer =
        updatedOffer;

      state.currentVersion =
        updatedVersion;

      state.currentBinding =
        binding;

      state.sourceVersion =
        null;

      setEditorTitle(
        updatedOffer.name
      );

      setEditorStatus(
        updatedVersion.status
      );

      await loadAvailability(
        updatedVersion.id
      );

      renderAvailability();

      await loadOffers();

      updateProgress();

      setSetupMessage(
        "Draft saved successfully.",
        "success"
      );

      return {
        offer:
          updatedOffer,
        version:
          updatedVersion,
        binding
      };

    } finally {
      state.saving = false;
    }
  }


  /* =========================================================
     CREATE DRAFT FROM NON-DRAFT VERSION
     ========================================================= */

  async function createDraftFromCurrent() {
    const client =
      await getSupabaseClient();

    const offer =
      state.currentOffer;

    const source =
      state.currentVersion;

    if (!offer || !source) {
      throw new Error(
        "No source version is available."
      );
    }

    /*
      Determine next version number.
    */

    const { data: versions,
      error: versionsError } =
      await client
        .from("offer_versions")
        .select(`
          id,
          version_number,
          status
        `)
        .eq(
          "offer_id",
          offer.id
        )
        .order(
          "version_number",
          {
            ascending: false
          }
        );

    if (versionsError) {
      throw versionsError;
    }

    const maxVersion =
      versions?.reduce(
        (
          maximum,
          item
        ) =>
          Math.max(
            maximum,
            Number(
              item.version_number
            ) || 0
          ),
        0
      ) || 0;

    const nextVersion =
      maxVersion + 1;

    const sourceMetadata =
      source.metadata || {};

    const draftMetadata = {
      ...sourceMetadata,
      cloned_from_version_id:
        source.id,
      cloned_at:
        new Date().toISOString(),
      ui_offer_type:
        sourceMetadata.ui_offer_type ||
        state.currentBinding?.metadata?.ui_offer_type ||
        normalizeUIOfferType(
          offer.offer_type
        )
    };

    const { data: draft,
      error: draftError } =
      await client
        .from("offer_versions")
        .insert({
          offer_id:
            offer.id,
          version_number:
            nextVersion,
          status:
            "draft",
          title:
            source.title ||
            offer.name ||
            "Untitled",
          description:
            source.description ||
            offer.description ||
            "",
          sales_talking_points:
            source.sales_talking_points ||
            [],
          allowed_claims:
            source.allowed_claims ||
            [],
          restrictions:
            source.restrictions ||
            [],
          customer_eligibility:
            source.customer_eligibility ||
            [],
          metadata:
            draftMetadata
        })
        .select()
        .single();

    if (draftError) {
      throw draftError;
    }


    /* -----------------------------------------------
       CLONE PRICES
       ----------------------------------------------- */

    const { data: prices,
      error: pricesError } =
      await client
        .from("offer_prices")
        .select(`
          variant_id,
          amount,
          currency,
          price_type,
          min_amount,
          max_amount,
          billing_period
        `)
        .eq(
          "offer_version_id",
          source.id
        )
        .eq(
          "is_active",
          true
        );

    if (pricesError) {
      throw pricesError;
    }

    if (prices?.length) {
      const priceRows =
        prices.map(
          (price) => ({
            offer_version_id:
              draft.id,
            variant_id:
              null,
            amount:
              Number(
                price.amount
              ) || 0,
            currency:
              price.currency ||
              "INR",
            price_type:
              price.price_type ||
              "fixed",
            min_amount:
              price.min_amount ??
              null,
            max_amount:
              price.max_amount ??
              null,
            billing_period:
              price.billing_period ??
              null,
            is_active:
              true
          })
        );

      const {
        error
      } = await client
        .from("offer_prices")
        .insert(
          priceRows
        );

      if (error) {
        throw error;
      }
    }


    /* -----------------------------------------------
       CLONE VARIANTS
       ----------------------------------------------- */

    const { data: variants,
      error: variantsError } =
      await client
        .from("offer_variants")
        .select(`
          name,
          sku,
          description,
          attributes,
          is_active,
          sort_order
        `)
        .eq(
          "offer_version_id",
          source.id
        )
        .eq(
          "is_active",
          true
        )
        .order(
          "sort_order",
          {
            ascending: true
          }
        );

    if (variantsError) {
      throw variantsError;
    }

    if (variants?.length) {
      const variantRows =
        variants.map(
          (variant) => ({
            offer_version_id:
              draft.id,
            name:
              variant.name,
            sku:
              variant.sku ||
              null,
            description:
              variant.description ||
              null,
            attributes:
              variant.attributes ||
              {},
            is_active:
              true,
            sort_order:
              Number(
                variant.sort_order
              ) || 0
          })
        );

      const {
        error
      } = await client
        .from("offer_variants")
        .insert(
          variantRows
        );

      if (error) {
        throw error;
      }
    }


    /* -----------------------------------------------
       CLONE AVAILABILITY
       ----------------------------------------------- */

    const { data: availability,
      error: availabilityError } =
      await client
        .from("offer_availability")
        .select(`
          day_of_week,
          start_time,
          end_time,
          timezone,
          capacity,
          is_available,
          notes
        `)
        .eq(
          "offer_version_id",
          source.id
        );

    if (availabilityError) {
      throw availabilityError;
    }

    if (availability?.length) {
      const availabilityRows =
        availability.map(
          (item) => ({
            offer_version_id:
              draft.id,
            day_of_week:
              item.day_of_week,
            start_time:
              item.start_time,
            end_time:
              item.end_time,
            timezone:
              item.timezone ||
              "Asia/Kolkata",
            capacity:
              item.capacity ??
              null,
            is_available:
              item.is_available !== false,
            notes:
              item.notes ||
              null
          })
        );

      const {
        error
      } = await client
        .from("offer_availability")
        .insert(
          availabilityRows
        );

      if (error) {
        throw error;
      }
    }


    /* -----------------------------------------------
       POINT CURRENT VERSION TO NEW DRAFT
       ----------------------------------------------- */

    const { data: updatedOffer,
      error: updateError } =
      await client
        .from("offers")
        .update({
          current_version_id:
            draft.id,
          status:
            "draft"
        })
        .eq(
          "id",
          offer.id
        )
        .eq(
          "client_id",
          tenantOfferId()
        )
        .select()
        .single();

    if (updateError) {
      throw updateError;
    }


    /*
      Binding remains attached to the offer, but its
      metadata is refreshed for the new draft.
    */

    const binding =
      await ensureOfferBinding(
        offer.id,
        draft.id,
        draftMetadata.ui_offer_type
      );

    state.currentOffer =
      updatedOffer;

    state.currentVersion =
      draft;

    state.currentBinding =
      binding;

    state.sourceVersion =
      source;

    await loadAvailability(
      draft.id
    );

    return {
      offer:
        updatedOffer,
      version:
        draft,
      binding
    };
  }


  /* =========================================================
     STEP PROGRESS
     ========================================================= */

  function updateProgress() {
    const progress =
      $("progress");

    const stepLabel =
      $("stepLabel");

    if (progress) {
      const percentage =
        Math.round(
          (
            state.currentStep /
            state.totalSteps
          ) * 100
        );

      progress.style.width =
        `${percentage}%`;
    }

    if (stepLabel) {
      stepLabel.textContent =
        `Step ${state.currentStep} of ${state.totalSteps}`;
    }
  }


  /* =========================================================
     PRICE TYPE UI
     ========================================================= */

  function bindPricingEvents() {
    const priceType =
      $("priceType");

    if (!priceType) {
      return;
    }

    priceType.addEventListener(
      "change",
      () => {
        toggleRangeFields(
          priceType.value
        );
      }
    );
  }


  /* =========================================================
     PART 4 COMPLETE
     ========================================================= */

     /* =========================================================
     PART 5/5
     REVIEW → AI CHECK → APPROVAL → PUBLISH
     NAVIGATION → EVENTS → INITIALIZATION
     ========================================================= */


  /* =========================================================
     SAVE DRAFT BUTTON
     ========================================================= */

  async function handleSaveDraft() {
    if (state.saving) {
      return;
    }

    try {
      setSetupState(
        "Saving draft…",
        "info"
      );

      await saveCurrentDraft();

      setEditorStatus(
        state.currentVersion?.status ||
          "draft"
      );

      setSetupState(
        "Draft saved.",
        "success"
      );

    } catch (error) {
      console.error(
        "[GLIME] Save draft failed:",
        error
      );

      setSetupState(
        "Draft save failed.",
        "error"
      );

      setSetupMessage(
        error.message ||
          "Could not save draft.",
        "error"
      );
    }
  }


  /* =========================================================
     AI CHECK
     ========================================================= */

  function buildAICheckResult() {
    const errors = [];
    const warnings = [];
    const passed = [];

    const name =
      String(
        getFieldValue(
          "offerName"
        ) || ""
      ).trim();

    const description =
      String(
        getFieldValue(
          "offerDescription"
        ) || ""
      ).trim();

    const shortDescription =
      String(
        getFieldValue(
          "shortDescription"
        ) || ""
      ).trim();

    const priceType =
      String(
        getFieldValue(
          "priceType"
        ) || ""
      ).trim();

    const priceAmount =
      String(
        getFieldValue(
          "priceAmount"
        ) || ""
      ).trim();

    const policies =
      textToArray(
        getFieldValue(
          "policies"
        )
      );

    const eligibility =
      textToArray(
        getFieldValue(
          "eligibility"
        )
      );

    const restrictions =
      textToArray(
        getFieldValue(
          "restrictions"
        )
      );

    const allowedClaims =
      textToArray(
        getFieldValue(
          "allowedClaims"
        )
      );

    /*
      Required business truth.
    */

    if (!name) {
      errors.push(
        "Offer name is missing."
      );
    } else {
      passed.push(
        "Offer name is present."
      );
    }

    if (!shortDescription) {
      warnings.push(
        "Short description is empty."
      );
    } else {
      passed.push(
        "Short description is present."
      );
    }

    if (!description) {
      warnings.push(
        "Detailed description is empty."
      );
    } else {
      passed.push(
        "Detailed description is present."
      );
    }

    /*
      Pricing.
    */

    if (!priceType) {
      errors.push(
        "Pricing type is not selected."
      );
    } else if (
      priceType === "custom"
    ) {
      passed.push(
        "Custom pricing is explicitly configured."
      );
    } else if (
      priceType === "range"
    ) {
      const min =
        Number(
          getFieldValue(
            "minAmount"
          )
        );

      const max =
        Number(
          getFieldValue(
            "maxAmount"
          )
        );

      if (
        !Number.isFinite(min) &&
        !Number.isFinite(max)
      ) {
        errors.push(
          "Range pricing requires a minimum or maximum amount."
        );
      } else if (
        Number.isFinite(min) &&
        Number.isFinite(max) &&
        min > max
      ) {
        errors.push(
          "Minimum price is greater than maximum price."
        );
      } else {
        passed.push(
          "Range pricing is valid."
        );
      }

    } else if (!priceAmount) {
      errors.push(
        "Price amount is missing."
      );
    } else {
      const numericPrice =
        Number(priceAmount);

      if (
        !Number.isFinite(
          numericPrice
        ) ||
        numericPrice < 0
      ) {
        errors.push(
          "Price amount is invalid."
        );
      } else {
        passed.push(
          "Pricing is valid."
        );
      }
    }

    /*
      Customer truth.
    */

    if (
      eligibility.length
    ) {
      passed.push(
        "Customer eligibility is defined."
      );
    } else {
      warnings.push(
        "Customer eligibility is not defined."
      );
    }

    if (
      policies.length
    ) {
      passed.push(
        "Policies are defined."
      );
    } else {
      warnings.push(
        "Policies are not defined."
      );
    }

    /*
      AI safety truth.
    */

    if (
      allowedClaims.length
    ) {
      passed.push(
        "Allowed claims are defined."
      );
    } else {
      warnings.push(
        "Allowed claims are not explicitly defined."
      );
    }

    if (
      restrictions.length
    ) {
      passed.push(
        "Restricted claims/instructions are defined."
      );
    } else {
      warnings.push(
        "Restrictions are not explicitly defined."
      );
    }

    /*
      Availability is optional depending on business model,
      therefore it is a warning rather than a hard error.
    */

    if (
      state.availability?.length
    ) {
      passed.push(
        "Availability information is configured."
      );
    } else {
      warnings.push(
        "No availability rules are configured."
      );
    }

    /*
      Final determination.

      This is intentionally a local deterministic
      completeness check. It is NOT presented as an
      external AI certification.
    */

    return {
      ok:
        errors.length === 0,

      errors,
      warnings,
      passed,

      checked_at:
        new Date().toISOString(),

      engine:
        "GLIME deterministic business-truth check",

      version:
        "1.0"
    };
  }


  async function runAICheck() {
    if (!state.currentOffer) {
      setSetupMessage(
        "Open an offer first.",
        "error"
      );

      return null;
    }

    try {
      /*
        Save current draft first so the check uses
        the same business truth that will enter review.
      */

      if (
        state.currentVersion?.status ===
        "draft"
      ) {
        await saveCurrentDraft();
      }

      const result =
        buildAICheckResult();

      const aiCheck =
        $("aiCheck");

      if (aiCheck) {
        aiCheck.textContent =
          JSON.stringify(
            result,
            null,
            2
          );

        aiCheck.dataset.status =
          result.ok
            ? "passed"
            : "failed";
      }

      if (result.ok) {
        setSetupMessage(
          result.warnings.length
            ? `AI check passed with ${result.warnings.length} warning(s).`
            : "AI check passed.",
          result.warnings.length
            ? "warning"
            : "success"
        );
      } else {
        setSetupMessage(
          `AI check found ${result.errors.length} blocking issue(s).`,
          "error"
        );
      }

      return result;

    } catch (error) {
      console.error(
        "[GLIME] AI check failed:",
        error
      );

      setSetupMessage(
        error.message ||
          "AI check failed.",
        "error"
      );

      return null;
    }
  }


  /* =========================================================
     SUBMIT FOR REVIEW
     ========================================================= */

  async function submitForReview() {
    if (!state.currentVersion?.id) {
      throw new Error(
        "No offer version is open."
      );
    }

    /*
      Only draft versions should enter review.
    */

    if (
      state.currentVersion.status !==
      "draft"
    ) {
      throw new Error(
        `Only a draft can be submitted. Current status: ${state.currentVersion.status}.`
      );
    }

    /*
      Save the latest form changes first.
    */

    await saveCurrentDraft();

    const check =
      buildAICheckResult();

    if (!check.ok) {
      throw new Error(
        `Resolve ${check.errors.length} blocking issue(s) before review.`
      );
    }

    const client =
      await getSupabaseClient();

    const { data, error } =
      await client.rpc(
        "client_submit_offer_version_for_review",
        {
          p_version_id:
            state.currentVersion.id
        }
      );

    if (error) {
      throw error;
    }

    /*
      RPC may return the updated version,
      depending on the function definition.
    */

    if (
      data &&
      typeof data === "object" &&
      data.id
    ) {
      state.currentVersion =
        Array.isArray(data)
          ? data[0]
          : data;
    } else {
      /*
        Re-read version when RPC returns no row.
      */

      const { data: version,
        error: versionError } =
        await client
          .from("offer_versions")
          .select("*")
          .eq(
            "id",
            state.currentVersion.id
          )
          .single();

      if (versionError) {
        throw versionError;
      }

      state.currentVersion =
        version;
    }

    setEditorStatus(
      state.currentVersion.status
    );

    setSetupMessage(
      "Offer submitted for review.",
      "success"
    );

    return state.currentVersion;
  }


  /* =========================================================
     APPROVE OFFER
     ========================================================= */

  async function approveOffer() {
    if (!state.currentVersion?.id) {
      throw new Error(
        "No offer version is open."
      );
    }

    if (
      state.currentVersion.status !==
      "review"
    ) {
      throw new Error(
        "Only a version in review can be approved."
      );
    }

    const client =
      await getSupabaseClient();

    const notes =
      window.prompt(
        "Approval notes (optional):",
        ""
      ) || "";

    const { data, error } =
      await client.rpc(
        "client_approve_offer_version",
        {
          p_version_id:
            state.currentVersion.id,
          p_notes:
            notes.trim() || null
        }
      );

    if (error) {
      throw error;
    }

    /*
      Re-read version to guarantee local state
      matches database state.
    */

    const { data: version,
      error: versionError } =
      await client
        .from("offer_versions")
        .select("*")
        .eq(
          "id",
          state.currentVersion.id
        )
        .single();

    if (versionError) {
      throw versionError;
    }

    state.currentVersion =
      version;

    setEditorStatus(
      version.status
    );

    setSetupMessage(
      "Offer version approved.",
      "success"
    );

    return version;
  }


  /* =========================================================
     REJECT OFFER
     ========================================================= */

  async function rejectOffer() {
    if (!state.currentVersion?.id) {
      throw new Error(
        "No offer version is open."
      );
    }

    if (
      state.currentVersion.status !==
      "review"
    ) {
      throw new Error(
        "Only a version in review can be rejected."
      );
    }

    const client =
      await getSupabaseClient();

    const notes =
      window.prompt(
        "Rejection reason:",
        ""
      ) || "";

    if (!notes.trim()) {
      setSetupMessage(
        "A rejection reason is required.",
        "warning"
      );

      return null;
    }

    const { error } =
      await client.rpc(
        "client_reject_offer_version",
        {
          p_version_id:
            state.currentVersion.id,
          p_notes:
            notes.trim()
        }
      );

    if (error) {
      throw error;
    }

    const { data: version,
      error: versionError } =
      await client
        .from("offer_versions")
        .select("*")
        .eq(
          "id",
          state.currentVersion.id
        )
        .single();

    if (versionError) {
      throw versionError;
    }

    state.currentVersion =
      version;

    setEditorStatus(
      version.status
    );

    setSetupMessage(
      "Offer review was rejected.",
      "warning"
    );

    return version;
  }


  /* =========================================================
     PUBLISH OFFER
     ========================================================= */

  async function publishOffer() {
    if (!state.currentVersion?.id) {
      throw new Error(
        "No offer version is open."
      );
    }

    if (
      state.currentVersion.status !==
      "approved"
    ) {
      throw new Error(
        "Only an approved version can be published."
      );
    }

    const client =
      await getSupabaseClient();

    const confirmed =
      window.confirm(
        "Publish this approved offer? Published business truth can be used by customer-facing AI systems."
      );

    if (!confirmed) {
      return null;
    }

    const { error } =
      await client.rpc(
        "client_publish_offer_version",
        {
          p_version_id:
            state.currentVersion.id
        }
      );

    if (error) {
      throw error;
    }

    /*
      Re-read offer and version.
    */

    const { data: version,
      error: versionError } =
      await client
        .from("offer_versions")
        .select("*")
        .eq(
          "id",
          state.currentVersion.id
        )
        .single();

    if (versionError) {
      throw versionError;
    }

    const { data: offer,
      error: offerError } =
      await client
        .from("offers")
        .select("*")
        .eq(
          "id",
          state.currentOffer.id
        )
        .eq(
          "client_id",
          tenantOfferId()
        )
        .single();

    if (offerError) {
      throw offerError;
    }

    state.currentVersion =
      version;

    state.currentOffer =
      offer;

    setEditorStatus(
      version.status
    );

    await loadOffers();

    setSetupMessage(
      "Offer published successfully.",
      "success"
    );

    return {
      offer,
      version
    };
  }


  /* =========================================================
     SHARE PREVIEW
     ========================================================= */

  function buildSharePreview() {
    if (!state.currentOffer) {
      return "";
    }

    const offer =
      state.currentOffer;

    const version =
      state.currentVersion;

    const uiType =
      resolveUITypeFromBinding(
        state.currentBinding,
        offer,
        version
      );

    const lines = [
      offer.name ||
        "Untitled Offer",
      "",
      offer.short_description ||
        "",
      "",
      `Type: ${uiType}`,
      `Status: ${
        version?.status ||
        offer.status ||
        "draft"
      }`
    ];

    const website =
      version?.metadata?.links?.website;

    const booking =
      version?.metadata?.links?.booking;

    if (website) {
      lines.push(
        "",
        `Website: ${website}`
      );
    }

    if (booking) {
      lines.push(
        `Booking: ${booking}`
      );
    }

    return lines
      .filter(
        (line) =>
          line !== undefined
      )
      .join("\n");
  }


  function updateSharePreview() {
    const preview =
      $("sharePreview");

    if (!preview) {
      return;
    }

    preview.textContent =
      buildSharePreview();
  }


  async function copySharePreview() {
    const text =
      buildSharePreview();

    if (!text) {
      setSetupMessage(
        "Nothing is available to share.",
        "warning"
      );

      return;
    }

    try {
      if (
        navigator.clipboard &&
        navigator.clipboard.writeText
      ) {
        await navigator.clipboard.writeText(
          text
        );
      } else {
        const textarea =
          document.createElement(
            "textarea"
          );

        textarea.value =
          text;

        document.body.appendChild(
          textarea
        );

        textarea.select();

        document.execCommand(
          "copy"
        );

        textarea.remove();
      }

      setSetupMessage(
        "Share preview copied.",
        "success"
      );

    } catch (error) {
      console.error(
        "[GLIME] Copy failed:",
        error
      );

      setSetupMessage(
        "Could not copy share preview.",
        "error"
      );
    }
  }


  /* =========================================================
     STEP NAVIGATION
     ========================================================= */

  function getStepSections() {
    return Array.from(
      document.querySelectorAll(
        "[data-step]"
      )
    );
  }


  function showStep(
    step
  ) {
    const numericStep =
      Number(step);

    if (
      !Number.isInteger(
        numericStep
      )
    ) {
      return;
    }

    state.currentStep =
      Math.max(
        1,
        Math.min(
          state.totalSteps,
          numericStep
        )
      );

    getStepSections()
      .forEach(
        (section) => {
          const sectionStep =
            Number(
              section.dataset.step
            );

          section.hidden =
            sectionStep !==
            state.currentStep;
        }
      );

    updateProgress();

    const previous =
      $("prevStepBtn");

    const next =
      $("nextStepBtn");

    if (previous) {
      previous.disabled =
        state.currentStep <= 1;
    }

    if (next) {
      next.disabled =
        state.currentStep >=
        state.totalSteps;
    }
  }


  function nextStep() {
    if (
      state.currentStep <
      state.totalSteps
    ) {
      showStep(
        state.currentStep + 1
      );
    }
  }


  function previousStep() {
    if (
      state.currentStep > 1
    ) {
      showStep(
        state.currentStep - 1
      );
    }
  }


  /* =========================================================
     EDITOR CLOSE
     ========================================================= */

  function closeEditor() {
    state.currentOffer =
      null;

    state.currentVersion =
      null;

    state.currentBinding =
      null;

    state.sourceVersion =
      null;

    state.availability =
      [];

    hideEditor();

    showStep(1);
  }


  /* =========================================================
     BUTTON HANDLERS
     ========================================================= */

  async function handleSubmitReview() {
    try {
      setSetupState(
        "Submitting for review…",
        "info"
      );

      await submitForReview();

      setSetupState(
        "Submitted for review.",
        "success"
      );

    } catch (error) {
      console.error(
        "[GLIME] Submit review failed:",
        error
      );

      setSetupMessage(
        error.message ||
          "Could not submit for review.",
        "error"
      );
    }
  }


  async function handleApprove() {
    try {
      setSetupState(
        "Approving…",
        "info"
      );

      await approveOffer();

      setSetupState(
        "Approved.",
        "success"
      );

    } catch (error) {
      console.error(
        "[GLIME] Approval failed:",
        error
      );

      setSetupMessage(
        error.message ||
          "Could not approve offer.",
        "error"
      );
    }
  }


  async function handlePublish() {
    try {
      setSetupState(
        "Publishing…",
        "info"
      );

      await publishOffer();

      updateSharePreview();

      setSetupState(
        "Published.",
        "success"
      );

    } catch (error) {
      console.error(
        "[GLIME] Publish failed:",
        error
      );

      setSetupMessage(
        error.message ||
          "Could not publish offer.",
        "error"
      );
    }
  }


  /* =========================================================
     EVENT BINDINGS
     ========================================================= */

  function bindOfferEvents() {

    const newOfferBtn =
      $("newOfferBtn");

    if (newOfferBtn) {
      newOfferBtn.addEventListener(
        "click",
        handleNewOffer
      );
    }


    const emptyNewBtn =
      $("emptyNewBtn");

    if (emptyNewBtn) {
      emptyNewBtn.addEventListener(
        "click",
        handleNewOffer
      );
    }


    const refreshBtn =
      $("refreshBtn");

    if (refreshBtn) {
      refreshBtn.addEventListener(
        "click",
        refreshServicesData
      );
    }


    const addCategoryBtn =
      $("addCategoryBtn");

    if (addCategoryBtn) {
      addCategoryBtn.addEventListener(
        "click",
        async () => {
          try {
            await createCategory();

            setSetupMessage(
              "Category created.",
              "success"
            );

          } catch (error) {
            console.error(
              "[GLIME] Category creation failed:",
              error
            );

            setSetupMessage(
              error.message ||
                "Could not create category.",
              "error"
            );
          }
        }
      );
    }


    const saveDraftBtn =
      $("saveDraftBtn");

    if (saveDraftBtn) {
      saveDraftBtn.addEventListener(
        "click",
        handleSaveDraft
      );
    }


    const runCheckBtn =
      $("runCheckBtn");

    if (runCheckBtn) {
      runCheckBtn.addEventListener(
        "click",
        runAICheck
      );
    }


    const submitReviewBtn =
      $("submitReviewBtn");

    if (submitReviewBtn) {
      submitReviewBtn.addEventListener(
        "click",
        handleSubmitReview
      );
    }


    const approveBtn =
      $("approveBtn");

    if (approveBtn) {
      approveBtn.addEventListener(
        "click",
        handleApprove
      );
    }


    const publishBtn =
      $("publishBtn");

    if (publishBtn) {
      publishBtn.addEventListener(
        "click",
        handlePublish
      );
    }


    const closeEditorBtn =
      $("closeEditorBtn");

    if (closeEditorBtn) {
      closeEditorBtn.addEventListener(
        "click",
        closeEditor
      );
    }


    const prevStepBtn =
      $("prevStepBtn");

    if (prevStepBtn) {
      prevStepBtn.addEventListener(
        "click",
        previousStep
      );
    }


    const nextStepBtn =
      $("nextStepBtn");

    if (nextStepBtn) {
      nextStepBtn.addEventListener(
        "click",
        nextStep
      );
    }


    const addAvailabilityBtn =
      $("addAvailabilityBtn");

    if (addAvailabilityBtn) {
      addAvailabilityBtn.addEventListener(
        "click",
        async () => {
          try {
            await addAvailability();

            setSetupMessage(
              "Availability added.",
              "success"
            );

          } catch (error) {
            console.error(
              "[GLIME] Availability creation failed:",
              error
            );

            setSetupMessage(
              error.message ||
                "Could not add availability.",
              "error"
            );
          }
        }
      );
    }


    const copyShareBtn =
      $("copyShareBtn");

    if (copyShareBtn) {
      copyShareBtn.addEventListener(
        "click",
        copySharePreview
      );
    }


    bindPricingEvents();
  }


  /* =========================================================
     STATUS-BASED ACTION VISIBILITY
     ========================================================= */

  function updateLifecycleButtons() {
    const status =
      state.currentVersion?.status ||
      "draft";

    const saveDraftBtn =
      $("saveDraftBtn");

    const submitReviewBtn =
      $("submitReviewBtn");

    const approveBtn =
      $("approveBtn");

    const publishBtn =
      $("publishBtn");

    if (saveDraftBtn) {
      saveDraftBtn.disabled =
        !state.currentVersion ||
        status !== "draft";
    }

    if (submitReviewBtn) {
      submitReviewBtn.disabled =
        !state.currentVersion ||
        status !== "draft";
    }

    if (approveBtn) {
      approveBtn.disabled =
        !state.currentVersion ||
        status !== "review";
    }

    if (publishBtn) {
      publishBtn.disabled =
        !state.currentVersion ||
        status !== "approved";
    }
  }


  /* =========================================================
     SAFE INITIALIZATION
     ========================================================= */

  async function initializeServices() {
    if (state.initialized) {
      return;
    }

    state.initialized = true;

    try {
      setSetupState(
        "Connecting…",
        "info"
      );

      /*
        This is the critical Supabase initialization.

        We intentionally use getSupabaseClient()
        rather than window.supabase directly.
      */

      const client =
        await getSupabaseClient();

      state.client =
        client;


      /* -----------------------------------------------
         AUTH CHECK
         ----------------------------------------------- */

      const user =
        await getCurrentUser();

      if (!user) {
        throw new Error(
          "No authenticated user is available. Please sign in again."
        );
      }


      /* -----------------------------------------------
         CLIENT PROFILE
         ----------------------------------------------- */

      const profile =
        await loadClientProfile();

      if (!profile) {
        throw new Error(
          "Your authenticated account is not linked to a GLIME client."
        );
      }


      /* -----------------------------------------------
         CLIENT BADGE
         ----------------------------------------------- */

      const clientBadge =
        $("clientBadge");

      if (clientBadge) {
        clientBadge.textContent =
          profile.project_name ||
          profile.client_id ||
          "Client";
      }


      /* -----------------------------------------------
         LOAD CORE DATA
         ----------------------------------------------- */

      setSetupState(
        "Loading business configuration…",
        "info"
      );

      await loadEntityTypes();

      await loadIndustries();

      await loadCategories();

      await restoreSetupUI();

      await loadOffers();


      /* -----------------------------------------------
         INITIAL EDITOR
         ----------------------------------------------- */

      hideEditor();

      showStep(1);

      updateLifecycleButtons();

      updateSharePreview();


      /* -----------------------------------------------
         READY
         ----------------------------------------------- */

      setSetupState(
        "Ready.",
        "success"
      );

      state.initialized =
        true;

    } catch (error) {
      console.error(
        "[GLIME] Services initialization failed:",
        error
      );

      state.initialized =
        false;

      const clientBadge =
        $("clientBadge");

      if (clientBadge) {
        clientBadge.textContent =
          "Client unavailable";
      }

      setSetupState(
        "Services could not initialize.",
        "error"
      );

      setSetupMessage(
        error.message ||
          "Could not initialize Services.",
        "error"
      );
    }
  }


  /* =========================================================
     GLOBAL ERROR HANDLING
     ========================================================= */

  window.addEventListener(
    "error",
    (event) => {
      console.error(
        "[GLIME] Services runtime error:",
        event.error ||
          event.message
      );
    }
  );


  window.addEventListener(
    "unhandledrejection",
    (event) => {
      console.error(
        "[GLIME] Services unhandled promise rejection:",
        event.reason
      );
    }
  );


  /* =========================================================
     DOM READY
     ========================================================= */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        bindSetupEvents();
        bindOfferEvents();
        initializeServices();
      },
      {
        once: true
      }
    );
  } else {
    bindSetupEvents();
    bindOfferEvents();
    initializeServices();
  }


  /* =========================================================
     PUBLIC SERVICES API
     ========================================================= */

  window.GLIME_SERVICES = {
    refresh:
      refreshServicesData,

    loadOffers:
      loadOffers,

    createOffer:
      createNewOffer,

    openOffer:
      openOffer,

    saveDraft:
      saveCurrentDraft,

    runAICheck:
      runAICheck,

    submitForReview:
      submitForReview,

    approve:
      approveOffer,

    reject:
      rejectOffer,

    publish:
      publishOffer,

    getState:
      () => state
  };


  /* =========================================================
     FINAL INITIALIZATION STATE
     ========================================================= */

  window.GLIME_SERVICES_STATE =
    state;


  /* =========================================================
     END OF GLIME SERVICES CORE
     ========================================================= */

})();
    
       

