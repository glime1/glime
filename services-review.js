(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const WIZARD_KEY =
    "glime_services_wizard";


  let supabaseClient = null;
  let state = {};


  const els = {
    loading:
      document.getElementById("loadingState"),

    error:
      document.getElementById("errorState"),

    errorText:
      document.getElementById("errorText"),

    content:
      document.getElementById("reviewContent"),

    readinessScore:
      document.getElementById("readinessScore"),

    readinessText:
      document.getElementById("readinessText"),

    profileGrid:
      document.getElementById("profileGrid"),

    understanding:
      document.getElementById("understandingText"),

    contextPath:
      document.getElementById("contextPath"),

    fieldCount:
      document.getElementById("fieldCount"),

    systemFieldCount:
      document.getElementById("systemFieldCount"),

    customFieldCount:
      document.getElementById("customFieldCount"),

    systemFields:
      document.getElementById("systemFields"),

    customFields:
      document.getElementById("customFields"),

    checkList:
      document.getElementById("checkList"),

    saveMessage:
      document.getElementById("saveMessage"),

    saveButton:
      document.getElementById("saveButton"),

    saveButtonText:
      document.getElementById("saveButtonText"),

    saveSpinner:
      document.getElementById("saveSpinner"),

    saveArrow:
      document.getElementById("saveArrow"),

    backButton:
      document.getElementById("backButton"),

    restartButton:
      document.getElementById("restartButton")
  };


  /* =========================================
     SUPABASE
  ========================================= */

  function getSupabase() {

    if (supabaseClient) {
      return supabaseClient;
    }

    if (
      !window.supabase ||
      typeof window.supabase.createClient !==
        "function"
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


  /* =========================================
     STATE
  ========================================= */

  function loadWizardState() {

    try {

      const raw =
        sessionStorage.getItem(
          WIZARD_KEY
        );

      if (!raw) {
        return {};
      }

      const parsed =
        JSON.parse(raw);

      if (
        parsed &&
        typeof parsed === "object"
      ) {
        return parsed;
      }

    } catch (error) {

      console.error(
        "GLIME wizard state error:",
        error
      );
    }

    return {};
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


  function getIndustry() {

    return (
      state.industry ||
      state.customIndustry ||
      null
    );
  }


  function getBusinessModel() {

    return (
      state.businessModel ||
      null
    );
  }


  function getTemplate() {

    return (
      state.template ||
      null
    );
  }


  function getEntity() {

    return (
      state.entity ||
      null
    );
  }


  function getEntityFields() {

    const configuration =
      state.entityConfiguration;

    if (
      configuration &&
      Array.isArray(
        configuration.fields
      )
    ) {
      return configuration.fields;
    }

    if (
      Array.isArray(state.fields)
    ) {
      return state.fields;
    }

    return [];
  }


  function getCustomFields() {

    return getEntityFields()
      .filter(
        field =>
          field &&
          field.source === "custom"
      );
  }


  function getSystemFields() {

    return getEntityFields()
      .filter(
        field =>
          !field ||
          field.source !== "custom"
      );
  }


  function showError(message) {

    els.loading.hidden = true;

    els.content.hidden = true;

    els.error.hidden = false;

    els.errorText.textContent =
      message;
  }


  function showSaveMessage(
    message,
    type = ""
  ) {

    els.saveMessage.hidden =
      !message;

    els.saveMessage.textContent =
      message;

    els.saveMessage.className =
      `save-message${
        type
          ? ` ${type}`
          : ""
      }`;
  }


  /* =========================================
     READINESS
  ========================================= */

  function calculateReadiness() {

    const checks = [

      Boolean(getIndustry()),

      Boolean(getBusinessModel()),

      Boolean(getTemplate()),

      Boolean(getEntity()),

      getEntityFields().length >= 0

    ];

    const completed =
      checks.filter(Boolean).length;

    return Math.round(
      (completed / checks.length) * 100
    );
  }


  function renderReadiness() {

    const score =
      calculateReadiness();

    els.readinessScore.textContent =
      `${score}%`;

    if (score === 100) {

      els.readinessText.textContent =
        "Your core business configuration is complete and ready to be saved.";

    } else {

      els.readinessText.textContent =
        "Some setup information is still missing. Please return to the relevant step.";
    }
  }


  /* =========================================
     PROFILE
  ========================================= */

  function addProfileCard(
    label,
    value,
    source
  ) {

    const card =
      document.createElement("div");

    card.className =
      "profile-card";

    card.innerHTML = `

      <span class="profile-label">
        ${escapeHtml(label)}
      </span>

      <div class="profile-value">
        ${escapeHtml(value || "Not configured")}
      </div>

      ${
        source
          ? `
            <div class="profile-source">
              ${escapeHtml(source)}
            </div>
          `
          : ""
      }

    `;

    els.profileGrid.appendChild(card);
  }


  function renderProfile() {

    const industry =
      getIndustry();

    const model =
      getBusinessModel();

    const template =
      getTemplate();

    const entity =
      getEntity();


    els.profileGrid.innerHTML = "";


    addProfileCard(
      "Industry",
      industry?.name,
      industry?.source === "custom"
        ? "Custom configuration"
        : "GLIME system configuration"
    );


    addProfileCard(
      "Business Model",
      model?.name,
      model?.source === "custom"
        ? "Custom configuration"
        : "GLIME system configuration"
    );


    addProfileCard(
      "Business Structure",
      template?.name,
      template?.source === "custom"
        ? "Custom configuration"
        : "GLIME system configuration"
    );


    addProfileCard(
      "Entity Type",
      entity?.name,
      entity?.source === "custom"
        ? "Custom configuration"
        : "Selected entity"
    );
  }


  /* =========================================
     GLIME UNDERSTANDING
  ========================================= */

  function renderUnderstanding() {

    const industry =
      getIndustry()?.name ||
      "your industry";

    const model =
      getBusinessModel()?.name ||
      "your selected business model";

    const template =
      getTemplate()?.name ||
      "your business structure";

    const entity =
      getEntity()?.name ||
      "your business entity";


    els.understanding.textContent =
      `GLIME has mapped ${industry} with ${model}, using ${template} as the business structure and ${entity} as the primary type. This configuration can now be used as the foundation for future business workflows.`;


    els.contextPath.innerHTML = "";


    [
      industry,
      model,
      template,
      entity
    ].forEach(
      (item, index, array) => {

        const node =
          document.createElement("span");

        node.className =
          "context-node";

        node.textContent =
          item;

        els.contextPath.appendChild(node);


        if (
          index <
          array.length - 1
        ) {

          const arrow =
            document.createElement("span");

          arrow.className =
            "context-arrow";

          arrow.textContent =
            "→";

          els.contextPath.appendChild(
            arrow
          );
        }

      }
    );
  }


  /* =========================================
     FIELDS
  ========================================= */

  function renderFieldList(
    container,
    fields,
    emptyText
  ) {

    container.innerHTML = "";


    if (!fields.length) {

      const empty =
        document.createElement("span");

      empty.className =
        "empty-chip";

      empty.textContent =
        emptyText;

      container.appendChild(
        empty
      );

      return;
    }


    fields.forEach(
      field => {

        const chip =
          document.createElement(
            "span"
          );

        chip.className =
          "field-chip";

        chip.textContent =
          field.label ||
          field.slug ||
          "Field";

        container.appendChild(
          chip
        );

      }
    );
  }


  function renderFields() {

    const systemFields =
      getSystemFields();

    const customFields =
      getCustomFields();

    const total =
      systemFields.length +
      customFields.length;


    els.systemFieldCount.textContent =
      String(
        systemFields.length
      );

    els.customFieldCount.textContent =
      String(
        customFields.length
      );

    els.fieldCount.textContent =
      `${total} ${
        total === 1
          ? "field"
          : "fields"
      }`;


    renderFieldList(
      els.systemFields,
      systemFields,
      "No additional system fields"
    );


    renderFieldList(
      els.customFields,
      customFields,
      "No custom fields added"
    );
  }


  /* =========================================
     CHECKLIST
  ========================================= */

  function renderChecks() {

    const checks = [

      [
        Boolean(getIndustry()),
        "Industry configured"
      ],

      [
        Boolean(getBusinessModel()),
        "Business model configured"
      ],

      [
        Boolean(getTemplate()),
        "Business structure configured"
      ],

      [
        Boolean(getEntity()),
        "Entity type configured"
      ],

      [
        Array.isArray(
          getEntityFields()
        ),
        "Field configuration loaded"
      ]

    ];


    els.checkList.innerHTML = "";


    checks.forEach(
      ([valid, label]) => {

        const item =
          document.createElement("div");

        item.className =
          "check-item";

        item.innerHTML = `

          <span class="check-icon">
            ${valid ? "✓" : "!"}
          </span>

          <span>
            ${escapeHtml(label)}
          </span>

        `;

        els.checkList.appendChild(
          item
        );
      }
    );
  }


  /* =========================================
     DATA NORMALIZATION
  ========================================= */

  function normalizeDataType(
    value
  ) {

    const type =
      String(
        value || "text"
      ).toLowerCase();


    const mapping = {

      number: "decimal",

      integer: "integer",

      decimal: "decimal",

      tel: "phone",

      phone: "phone",

      boolean: "boolean",

      checkbox: "boolean",

      textarea: "long_text",

      text_area: "long_text",

      long_text: "long_text",

      select: "select",

      dropdown: "select",

      datetime: "datetime",

      date: "date",

      time: "time",

      url: "url",

      email: "email",

      json: "json",

      media: "media"

    };


    return (
      mapping[type] ||
      "text"
    );
  }


  function getClientIdFromRow(
    row
  ) {

    if (!row) {
      return null;
    }

    return row.id;
  }


  /* =========================================
     AUTH / CLIENT
  ========================================= */

  async function getClientRecord() {

    const supabase =
      getSupabase();


    const {
      data: {
        user
      },
      error: authError
    } =
      await supabase.auth.getUser();


    if (authError) {
      throw authError;
    }


    if (!user) {

      throw new Error(
        "Your login session has expired. Please sign in again."
      );
    }


    const {
      data,
      error
    } =
      await supabase
        .from("client_data")
        .select(
          "id,client_id,auth_user_id"
        )
        .eq(
          "auth_user_id",
          user.id
        )
        .maybeSingle();


    if (error) {
      throw error;
    }


    if (!data) {

      throw new Error(
        "GLIME could not find your client profile."
      );
    }


    return data;
  }


  /* =========================================
     INDUSTRY CONFIG
  ========================================= */

  async function saveIndustryConfiguration(
    clientId
  ) {

    const supabase =
      getSupabase();

    const industry =
      getIndustry();


    if (!industry) {
      throw new Error(
        "Industry configuration is missing."
      );
    }


    const payload = {

      client_id:
        clientId,

      industry_id:
        industry.source === "custom"
          ? null
          : industry.id,

      custom_industry_name:
        industry.source === "custom"
          ? industry.name
          : null,

      custom_industry_description:
        industry.source === "custom"
          ? (
              industry.description ||
              null
            )
          : null,

      selection_source:
        industry.source === "custom"
          ? "custom"
          : "system",

      status: "active",

      metadata: {}

    };


    const {
      data: existing,
      error: existingError
    } =
      await supabase
        .from(
          "client_industry_configurations"
        )
        .select("id")
        .eq(
          "client_id",
          clientId
        )
        .eq(
          "status",
          "active"
        )
        .maybeSingle();


    if (existingError) {
      throw existingError;
    }


    if (existing?.id) {

      const {
        data,
        error
      } =
        await supabase
          .from(
            "client_industry_configurations"
          )
          .update(payload)
          .eq(
            "id",
            existing.id
          )
          .select()
          .single();


      if (error) {
        throw error;
      }

      return data;
    }


    const {
      data,
      error
    } =
      await supabase
        .from(
          "client_industry_configurations"
        )
        .insert(payload)
        .select()
        .single();


    if (error) {
      throw error;
    }


    return data;
  }


  /* =========================================
     CUSTOM BUSINESS MODEL
  ========================================= */

  async function saveCustomBusinessModel(
    clientId,
    industryConfigurationId
  ) {

    const model =
      getBusinessModel();


    if (
      !model ||
      model.source !== "custom"
    ) {
      return null;
    }


    const supabase =
      getSupabase();


    const slug =
      String(
        model.slug ||
        model.name ||
        ""
      )
        .trim()
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-+|-+$/g,
          ""
        );


    const {
      data: existing,
      error: findError
    } =
      await supabase
        .from(
          "client_custom_business_models"
        )
        .select("id")
        .eq(
          "client_id",
          clientId
        )
        .eq(
          "name",
          model.name
        )
        .eq(
          "status",
          "active"
        )
        .maybeSingle();


    if (findError) {
      throw findError;
    }


    const payload = {

      client_id:
        clientId,

      industry_configuration_id:
        industryConfigurationId,

      base_business_model_id:
        null,

      name:
        model.name,

      slug:
        slug || "custom-business-model",

      description:
        model.description ||
        null,

      status:
        "active",

      is_custom:
        true,

      metadata: {}

    };


    if (existing?.id) {

      const {
        data,
        error
      } =
        await supabase
          .from(
            "client_custom_business_models"
          )
          .update(payload)
          .eq(
            "id",
            existing.id
          )
          .select()
          .single();


      if (error) {
        throw error;
      }

      return data;
    }


    const {
      data,
      error
    } =
      await supabase
        .from(
          "client_custom_business_models"
        )
        .insert(payload)
        .select()
        .single();


    if (error) {
      throw error;
    }


    return data;
  }


  /* =========================================
     TEMPLATE CONFIGURATION
  ========================================= */

  async function saveTemplateConfiguration(
    clientId,
    industryConfigurationId,
    customBusinessModel
  ) {

    const supabase =
      getSupabase();

    const template =
      getTemplate();

    const model =
      getBusinessModel();


    if (!template) {

      throw new Error(
        "Business structure configuration is missing."
      );
    }


    const payload = {

      client_id:
        clientId,

      industry_configuration_id:
        industryConfigurationId,

      business_model_id:
        model?.source === "system"
          ? model.id
          : null,

      custom_business_model_id:
        customBusinessModel?.id ||
        null,

      template_id:
        template.source === "system"
          ? template.id
          : null,

      template_name:
        template.name ||
        null,

      status:
        "active",

      config: {

        entity:
          getEntity(),

        field_values:
          state.entityConfiguration?.values ||
          {},

        setup_source:
          "guided_wizard"

      },

      metadata: {

        version: 1

      }

    };


    const {
      data: existing,
      error: findError
    } =
      await supabase
        .from(
          "client_template_configurations"
        )
        .select("id")
        .eq(
          "client_id",
          clientId
        )
        .eq(
          "status",
          "active"
        )
        .maybeSingle();


    if (findError) {
      throw findError;
    }


    if (existing?.id) {

      const {
        data,
        error
      } =
        await supabase
          .from(
            "client_template_configurations"
          )
          .update(payload)
          .eq(
            "id",
            existing.id
          )
          .select()
          .single();


      if (error) {
        throw error;
      }

      return data;
    }


    const {
      data,
      error
    } =
      await supabase
        .from(
          "client_template_configurations"
        )
        .insert(payload)
        .select()
        .single();


    if (error) {
      throw error;
    }


    return data;
  }


  /* =========================================
     CUSTOM FIELDS
  ========================================= */

  async function saveCustomFields(
    clientId,
    templateConfigurationId
  ) {

    const supabase =
      getSupabase();

    const entity =
      getEntity();

    const customFields =
      getCustomFields();


    /*
     * Existing custom fields belonging
     * to this active configuration are
     * replaced by the current wizard state.
     */

    const {
      error: deleteError
    } =
      await supabase
        .from(
          "client_custom_fields"
        )
        .delete()
        .eq(
          "client_id",
          clientId
        )
        .eq(
          "template_configuration_id",
          templateConfigurationId
        );


    if (deleteError) {
      throw deleteError;
    }


    if (!customFields.length) {
      return [];
    }


    const rows =
      customFields.map(
        (field, index) => ({

          client_id:
            clientId,

          template_configuration_id:
            templateConfigurationId,

          entity_type_id:
            entity?.id ||
            null,

          field_definition_id:
            field.fieldDefinitionId ||
            null,

          slug:
            field.slug ||
            `custom-field-${index + 1}`,

          label:
            field.label ||
            `Custom Field ${index + 1}`,

          data_type:
            normalizeDataType(
              field.dataType
            ),

          is_required:
            Boolean(
              field.required
            ),

          is_visible:
            field.visible !== false,

          sort_order:
            Number.isFinite(
              field.sortOrder
            )
              ? field.sortOrder
              : index + 1,

          config:
            field.config || {},

          status:
            "active"

        })
      );


    const {
      data,
      error
    } =
      await supabase
        .from(
          "client_custom_fields"
        )
        .insert(rows)
        .select();


    if (error) {
      throw error;
    }


    return data || [];
  }


  /* =========================================
     CLIENT PROGRESS
  ========================================= */

  async function updateClientProgress(
    clientId
  ) {

    const supabase =
      getSupabase();


    const {
      error
    } =
      await supabase
        .from("client_data")
        .update({

          step1_status:
            "completed",

          step2_status:
            "completed",

          step3_status:
            "completed",

          progress_percent:
            100

        })
        .eq(
          "id",
          clientId
        );


    if (error) {
      throw error;
    }
  }


  /* =========================================
     FINAL SAVE
  ========================================= */

  async function persistSetup() {

    const client =
      await getClientRecord();

    const clientId =
      getClientIdFromRow(
        client
      );


    /*
     * 1. Industry
     */

    const industryConfiguration =
      await saveIndustryConfiguration(
        clientId
      );


    /*
     * 2. Custom business model
     *    only when selected.
     */

    const customBusinessModel =
      await saveCustomBusinessModel(
        clientId,
        industryConfiguration.id
      );


    /*
     * 3. Template configuration
     */

    const templateConfiguration =
      await saveTemplateConfiguration(
        clientId,
        industryConfiguration.id,
        customBusinessModel
      );


    /*
     * 4. Custom fields
     */

    await saveCustomFields(
      clientId,
      templateConfiguration.id
    );


    /*
     * 5. Client progress
     */

    await updateClientProgress(
      clientId
    );


    /*
     * Mark wizard complete locally.
     */

    state.setupProgress =
      "completed";

    state.setupCompleted =
      true;

    state.savedConfigurationId =
      templateConfiguration.id;

    state.savedAt =
      new Date().toISOString();


    sessionStorage.setItem(
      WIZARD_KEY,
      JSON.stringify(state)
    );


    return {
      clientId,
      industryConfiguration,
      templateConfiguration
    };
  }


  /* =========================================
     BUTTON STATE
  ========================================= */

  function setSaving(
    saving
  ) {

    els.saveButton.disabled =
      saving;

    els.backButton.disabled =
      saving;

    els.saveButtonText.textContent =
      saving
        ? "Saving setup…"
        : "Save & Finish Setup";

    els.saveSpinner.hidden =
      !saving;

    els.saveArrow.hidden =
      saving;
  }


  /* =========================================
     FINISH
  ========================================= */

  async function handleSave() {

    if (
      calculateReadiness() <
      100
    ) {

      showSaveMessage(
        "Please complete the missing setup information before saving.",
        "error"
      );

      return;
    }


    setSaving(true);

    showSaveMessage(
      "GLIME is securely saving your business configuration…"
    );


    try {

      const result =
        await persistSetup();


      showSaveMessage(
        "Your business configuration has been saved successfully.",
        "success"
      );


      /*
       * Do not create an offer here.
       *
       * Actual Service / Product /
       * Package records belong to the
       * next business-data layer.
       */

      setTimeout(
        () => {

          window.location.href =
            "dashboard.html";

        },
        900
      );


    } catch (error) {

      console.error(
        "GLIME setup save error:",
        error
      );


      showSaveMessage(
        error?.message ||
        "We couldn't save your setup. Please try again.",
        "error"
      );


      setSaving(false);
    }
  }


  /* =========================================
     NAVIGATION
  ========================================= */

  function goBack() {

    window.location.href =
      "services-entity-form.html";
  }


  function restartSetup() {

    sessionStorage.removeItem(
      WIZARD_KEY
    );

    window.location.href =
      "services.html";
  }


  /* =========================================
     INITIALIZATION
  ========================================= */

  function init() {

    state =
      loadWizardState();


    const required = [

      [
        getIndustry(),
        "Industry"
      ],

      [
        getBusinessModel(),
        "Business model"
      ],

      [
        getTemplate(),
        "Business structure"
      ],

      [
        getEntity(),
        "Entity type"
      ]

    ];


    const missing =
      required.find(
        ([value]) =>
          !value
      );


    if (missing) {

      showError(
        `${missing[1]} is missing. Please return to the setup flow.`
      );

      return;
    }


    renderReadiness();

    renderProfile();

    renderUnderstanding();

    renderFields();

    renderChecks();


    els.loading.hidden =
      true;

    els.content.hidden =
      false;
  }


  /* =========================================
     EVENTS
  ========================================= */

  els.saveButton.addEventListener(
    "click",
    handleSave
  );


  els.backButton.addEventListener(
    "click",
    goBack
  );


  els.restartButton.addEventListener(
    "click",
    restartSetup
  );


  init();

})();
