/* =========================================================
   GLIME — Services / Offers Manager
   FINAL ARCHITECTURE-ALIGNED CORE
   Version: 1.0
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     SUPABASE
     ========================================================= */

  const SUPABASE_URL =
    window.GLIME_SUPABASE_URL ||
    window.SUPABASE_URL ||
    "";

  const SUPABASE_ANON_KEY =
    window.GLIME_SUPABASE_ANON_KEY ||
    window.SUPABASE_ANON_KEY ||
    "";

  const sb =
    window.supabaseClient ||
    window.supabase ||
    window.sb ||
    null;

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

  function setText(id, value) {
    const el = $(id);
    if (el) {
      el.textContent =
        safeText(value);
    }
  }

  function setValue(id, value) {
    const el = $(id);
    if (!el) return;

    el.value =
      value == null
        ? ""
        : value;
  }

  function getValue(id) {
    const el = $(id);
    return el
      ? String(el.value || "").trim()
      : "";
  }

  function getRawValue(id) {
    const el = $(id);
    return el
      ? el.value || ""
      : "";
  }

  function show(el, visible = true) {
    if (!el) return;
    el.hidden = !visible;
  }

  function setDisabled(id, disabled) {
    const el = $(id);
    if (el) {
      el.disabled = !!disabled;
    }
  }

  function notify(
    message,
    type = "info"
  ) {
    const el = $("message");
    if (!el) return;

    el.textContent =
      safeText(message);

    el.dataset.type = type;

    clearTimeout(
      notify._timer
    );

    notify._timer =
      setTimeout(() => {
        if (el) {
          el.textContent = "";
        }
      }, 5000);
  }

  function handleError(
    error,
    fallback = "Something went wrong."
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
      .slice(0, 100);
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
      return JSON.parse(value);
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
    if (!value) return [];

    return String(value)
      .split(/\r?\n/)
      .map((x) =>
        x.trim()
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

    return value.join("\n");
  }

  function escapeHtml(value) {
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

  function localTimezone() {
    return (
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone ||
      "Asia/Kolkata"
    );
  }

  /* =========================================================
     SUPABASE CLIENT
     ========================================================= */

  async function getSupabaseClient() {
    if (sb) {
      return sb;
    }

    if (
      SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      window.supabase?.createClient
    ) {
      return window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );
    }

    throw new Error(
      "Supabase client is not available."
    );
  }

  async function getAuthenticatedUser() {
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

    if (!data?.user) {
      throw new Error(
        "Please sign in first."
      );
    }

    return data.user;
  }

  /* =========================================================
     DATABASE HELPERS
     ========================================================= */

  async function selectRows(
    table,
    columns = "*",
    filters = {}
  ) {
    const client =
      await getSupabaseClient();

    let query =
      client
        .from(table)
        .select(columns);

    Object.entries(
      filters
    ).forEach(
      ([key, value]) => {
        if (
          value !== undefined &&
          value !== null
        ) {
          query = query.eq(
            key,
            value
          );
        }
      }
    );

    const {
      data,
      error
    } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function insertRow(
    table,
    payload
  ) {
    const client =
      await getSupabaseClient();

    const {
      data,
      error
    } =
      await client
        .from(table)
        .insert(payload)
        .select()
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /* =========================================================
     CLIENT / TENANT
     ========================================================= */

  async function loadClient() {
    const client =
      await getSupabaseClient();

    const user =
      await getAuthenticatedUser();

    const {
      data,
      error
    } =
      await client
        .from("client_data")
        .select("*")
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
        "No GLIME client profile is connected to this account."
      );
    }

    state.client = data;

    /*
      IMPORTANT:

      client_data.id
        -> bigint
        -> used by new architecture tables

      client_data.client_id
        -> text
        -> used by legacy/current offer tables

      These MUST NOT be mixed.
    */

    setText(
      "clientBadge",
      data.business_name ||
        data.company_name ||
        data.client_name ||
        data.name ||
        data.project_name ||
        data.client_id ||
        `Client ${data.id}`
    );

    return data;
  }

  function tenantOfferId() {
    if (
      !state.client?.client_id
    ) {
      throw new Error(
        "Client tenant identifier is missing."
      );
    }

    return state.client.client_id;
  }

  function tenantConfigId() {
    if (
      !state.client?.id
    ) {
      throw new Error(
        "Client configuration identifier is missing."
      );
    }

    return state.client.id;
  }

  /* =========================================================
     INDUSTRIES
     ========================================================= */

  async function loadIndustries() {
    const rows =
      await selectRows(
        "industries",
        "id,name,slug,description,is_active",
        {
          is_active: true
        }
      );

    state.industries =
      rows.sort(
        (a, b) =>
          safeText(a.name)
            .localeCompare(
              safeText(b.name)
            )
      );

    const select =
      $("industrySelect");

    if (!select) return;

    const current =
      select.value;

    select.innerHTML =
      `<option value="">Select industry</option>` +
      state.industries
        .map(
          (item) =>
            `<option value="${escapeHtml(
              item.id
            )}">
              ${escapeHtml(
                item.name
              )}
            </option>`
        )
        .join("");

    if (current) {
      select.value =
        current;
    }
  }

  /* =========================================================
     BUSINESS MODELS
     ========================================================= */

  async function loadCustomBusinessModels() {
    if (
      !state.client?.id
    ) {
      return;
    }

    state.customBusinessModels =
      await selectRows(
        "client_custom_business_models",
        "*",
        {
          client_id:
            tenantConfigId()
        }
      );
  }

  async function loadBusinessModels(
    industryId = null
  ) {
    const rows =
      await selectRows(
        "business_models",
        "id,name,slug,industry_id,description,is_active",
        {
          is_active: true
        }
      );

    state.businessModels =
      rows;

    await loadCustomBusinessModels();

    const select =
      $("businessModelSelect");

    if (!select) return;

    const current =
      select.value;

    const filtered =
      industryId
        ? rows.filter(
            (item) =>
              !item.industry_id ||
              String(
                item.industry_id
              ) ===
                String(
                  industryId
                )
          )
        : rows;

    const custom =
      state.customBusinessModels
        .filter(
          (item) =>
            item.status !==
            "archived"
        )
        .map(
          (item) => ({
            ...item,
            __custom: true
          })
        );

    const all = [
      ...filtered,
      ...custom
    ];

    all.sort(
      (a, b) =>
        safeText(a.name)
          .localeCompare(
            safeText(b.name)
          )
    );

    select.innerHTML =
      `<option value="">Select business model</option>` +
      all
        .map((item) => {
          const value =
            item.__custom
              ? `custom:${item.id}`
              : item.id;

          const prefix =
            item.__custom
              ? "Custom — "
              : "";

          return `
            <option value="${escapeHtml(
              value
            )}">
              ${escapeHtml(
                prefix +
                  item.name
              )}
            </option>
          `;
        })
        .join("");

    if (current) {
      select.value =
        current;
    }
  }

  /* =========================================================
     CLIENT SETUP
     ========================================================= */

  async function loadClientSetup() {
    if (
      !state.client?.id
    ) {
      return;
    }

    const rows =
      await selectRows(
        "client_industry_configurations",
        "*",
        {
          client_id:
            tenantConfigId()
        }
      );

    const current =
      rows.find(
        (item) =>
          item.status ===
          "active"
      ) ||
      rows[0];

    if (current) {
      setValue(
        "industrySelect",
        current.industry_id ||
          ""
      );

      await loadBusinessModels(
        current.industry_id
      );

      /*
        Custom business model belongs to the
        client config layer. Resolve it separately.
      */

      if (
        current.id
      ) {
        const custom =
          state.customBusinessModels.find(
            (item) =>
              String(
                item.industry_configuration_id
              ) ===
              String(
                current.id
              )
          );

        if (custom) {
          setValue(
            "businessModelSelect",
            `custom:${custom.id}`
          );

          setValue(
            "customBusinessModel",
            custom.name ||
              ""
          );
        } else if (
          current.business_model_id
        ) {
          setValue(
            "businessModelSelect",
            current.business_model_id
          );
        }
      }
    } else {
      await loadBusinessModels();
    }

    updateSetupState();
  }

  async function saveSetup() {
    if (
      !state.client?.id
    ) {
      throw new Error(
        "Client profile is not loaded."
      );
    }

    const industryId =
      getValue(
        "industrySelect"
      );

    const modelValue =
      getValue(
        "businessModelSelect"
      );

    const customName =
      getValue(
        "customBusinessModel"
      );

    if (!industryId) {
      throw new Error(
        "Please select an industry."
      );
    }

    if (!modelValue) {
      throw new Error(
        "Please select a business model."
      );
    }

    const client =
      await getSupabaseClient();

    const existing =
      await selectRows(
        "client_industry_configurations",
        "*",
        {
          client_id:
            tenantConfigId()
        }
      );

    let configuration =
      existing.find(
        (item) =>
          item.status ===
          "active"
      ) ||
      existing[0] ||
      null;

    let businessModelId =
      null;

    let customBusinessModelId =
      null;

    if (
      modelValue.startsWith(
        "custom:"
      )
    ) {
      customBusinessModelId =
        modelValue.split(
          ":"
        )[1] || null;

      const custom =
        state.customBusinessModels.find(
          (item) =>
            String(
              item.id
            ) ===
            String(
              customBusinessModelId
            )
        );

      if (
        custom &&
        customName &&
        customName !==
          custom.name
      ) {
        const {
          error
        } =
          await client
            .from(
              "client_custom_business_models"
            )
            .update({
              name:
                customName,
              slug:
                slugify(
                  customName
                ),
              updated_at:
                new Date().toISOString()
            })
            .eq(
              "id",
              custom.id
            )
            .eq(
              "client_id",
              tenantConfigId()
            );

        if (error) {
          throw error;
        }
      }
    } else {
      businessModelId =
        modelValue;
    }

    const payload = {
  client_id:
    tenantConfigId(),

  industry_id:
    industryId,

  business_model_id:
    businessModelId,

    status:
      "active",

    selection_source:
      "services-ui",

    updated_at:
      new Date().toISOString()
   };

    if (configuration) {
      const {
        data,
        error
      } =
        await client
          .from(
            "client_industry_configurations"
          )
          .update(
            payload
          )
          .eq(
            "id",
            configuration.id
          )
          .eq(
            "client_id",
            tenantConfigId()
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      configuration =
        data;
    } else {
      const {
        data,
        error
      } =
        await client
          .from(
            "client_industry_configurations"
          )
          .insert(
            payload
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      configuration =
        data;
    }

    /*
      If a custom model is selected but doesn't exist yet,
      create it for this tenant only.
    */

    if (
      modelValue.startsWith(
        "custom:"
      ) &&
      customBusinessModelId
    ) {
      await client
        .from(
          "client_custom_business_models"
        )
        .update({
          industry_configuration_id:
            configuration.id,
          updated_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          customBusinessModelId
        )
        .eq(
          "client_id",
          tenantConfigId()
        );
    }

    state.setupSaved =
      true;

    updateSetupState();

    await loadTemplates();

    notify(
      "Business setup saved successfully.",
      "success"
    );
  }

  function updateSetupState() {
    const complete =
      !!getValue(
        "industrySelect"
      ) &&
      !!getValue(
        "businessModelSelect"
      );

    state.setupSaved =
      complete;

    const el =
      $("setupState");

    if (!el) return;

    el.textContent =
      complete
        ? "Business setup complete"
        : "Business setup required";

    el.dataset.state =
      complete
        ? "complete"
        : "incomplete";
  }

  /* =========================================================
     TEMPLATES
     ========================================================= */

  async function loadTemplates() {
    const industryId =
      getValue(
        "industrySelect"
      );

    if (!industryId) {
      state.templates =
        [];
      return;
    }

    state.templates =
      await selectRows(
        "industry_templates",
        "*",
        {
          industry_id:
            industryId
        }
      );
  }

  /* =========================================================
     CATEGORIES
     ========================================================= */

  async function loadCategories() {
    if (
      !state.client?.client_id
    ) {
      return;
    }

    const client =
      await getSupabaseClient();

    const {
      data,
      error
    } =
      await client
        .from(
          "offer_categories"
        )
        .select("*")
        .eq(
          "client_id",
          tenantOfferId()
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
        })
        .order(
          "name",
          {
            ascending: true
          }
        );

    if (error) {
      console.warn(
        "[GLIME] Category load failed:",
        error
      );

      state.categories =
        [];

      renderCategories();

      return;
    }

    state.categories =
      data || [];

    renderCategories();
    populateCategorySelect();
  }

  function renderCategories() {
    const list =
      $("categoryList");

    if (!list) return;

    if (
      !state.categories.length
    ) {
      list.innerHTML =
        `<div class="empty-state">
          No categories yet.
        </div>`;
      return;
    }

    list.innerHTML =
      state.categories
        .map(
          (category) => `
            <button
              type="button"
              class="category-item"
              data-category-id="${escapeHtml(
                category.id
              )}"
            >
              ${escapeHtml(
                category.name ||
                  "Unnamed"
              )}
            </button>
          `
        )
        .join("");

    qsa(
      ".category-item",
      list
    ).forEach(
      (button) => {
        button.addEventListener(
          "click",
          async () => {
            try {
              await loadOffers(
                button.dataset
                  .categoryId
              );
            } catch (
              error
            ) {
              handleError(
                error
              );
            }
          }
        );
      }
    );
  }

  function populateCategorySelect() {
    const select =
      $("offerCategory");

    if (!select) return;

    const current =
      select.value;

    select.innerHTML =
      `<option value="">No category</option>` +
      state.categories
        .map(
          (category) => `
            <option value="${escapeHtml(
              category.id
            )}">
              ${escapeHtml(
                category.name ||
                  "Unnamed"
              )}
            </option>
          `
        )
        .join("");

    if (current) {
      select.value =
        current;
    }
  }

  async function createCategory() {
    const name =
      window.prompt(
        "Enter category name:"
      );

    if (
      !name ||
      !name.trim()
    ) {
      return;
    }

    const cleanName =
      name.trim();

    const category =
      await insertRow(
        "offer_categories",
        {
          client_id:
            tenantOfferId(),

          name:
            cleanName,

          slug:
            slugify(
              cleanName
            ),

          is_active:
            true,

          sort_order:
            state.categories
              .length
        }
      );

    state.categories.push(
      category
    );

    renderCategories();
    populateCategorySelect();

    setValue(
      "offerCategory",
      category.id
    );

    notify(
      "Category created.",
      "success"
    );
  }

  /* =========================================================
     OFFERS
     ========================================================= */

  async function loadOffers(
    categoryId = null
  ) {
    if (
      !state.client?.client_id
    ) {
      return;
    }

    const client =
      await getSupabaseClient();

    let query =
      client
        .from("offers")
        .select(`
          *,
          offer_versions:offer_versions(*)
        `)
        .eq(
          "client_id",
          tenantOfferId()
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        );

    if (categoryId) {
      query =
        query.eq(
          "category_id",
          categoryId
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

    state.offers =
      data || [];

    renderOffers();

    setText(
      "offerCount",
      String(
        state.offers.length
      )
    );
  }

  function findCurrentVersion(
    offer
  ) {
    const versions =
      Array.isArray(
        offer?.offer_versions
      )
        ? offer.offer_versions
        : [];

    if (
      offer?.current_version_id
    ) {
      const exact =
        versions.find(
          (version) =>
            String(
              version.id
            ) ===
            String(
              offer.current_version_id
            )
        );

      if (exact) {
        return exact;
      }
    }

    return (
      versions.find(
        (version) =>
          version.status ===
          "draft"
      ) ||
      versions.find(
        (version) =>
          version.status ===
          "review"
      ) ||
      versions.find(
        (version) =>
          version.status ===
          "approved"
      ) ||
      versions.find(
        (version) =>
          version.status ===
          "published"
      ) ||
      versions[0] ||
      null
    );
  }

  function renderOffers() {
    const list =
      $("offerList");

    if (!list) return;

    if (
      !state.offers.length
    ) {
      list.innerHTML =
        `<div class="empty-state">
          No offers yet. Create your first service or product.
        </div>`;
      return;
    }

    list.innerHTML =
      state.offers
        .map((offer) => {
          const version =
            findCurrentVersion(
              offer
            );

          const title =
            version?.title ||
            offer.name ||
            "Untitled Offer";

          const status =
            version?.status ||
            offer.status ||
            "draft";

          return `
            <button
              type="button"
              class="offer-item"
              data-offer-id="${escapeHtml(
                offer.id
              )}"
            >
              <span class="offer-item-title">
                ${escapeHtml(
                  title
                )}
              </span>

              <span class="offer-item-meta">
                ${escapeHtml(
                  offer.offer_type ||
                    "service"
                )}
                ·
                ${escapeHtml(
                  status
                )}
              </span>
            </button>
          `;
        })
        .join("");

    qsa(
      ".offer-item",
      list
    ).forEach(
      (button) => {
        button.addEventListener(
          "click",
          async () => {
            try {
              await openOffer(
                button.dataset
                  .offerId
              );
            } catch (
              error
            ) {
              handleError(
                error,
                "Unable to open offer."
              );
            }
          }
        );
      }
    );
  }

  /* =========================================================
     CREATE NEW OFFER
     ========================================================= */

  async function createNewOffer() {
    if (
      !state.client?.client_id
    ) {
      throw new Error(
        "Client profile is not loaded."
      );
    }

    const client =
      await getSupabaseClient();

    const name =
      "New Offer";

    const uniqueSlug =
      `${slugify(
        name
      )}-${Date.now()}`;

    const {
      data: offer,
      error: offerError
    } =
      await client
        .from("offers")
        .insert({
          client_id:
            tenantOfferId(),

          name,

          slug:
            uniqueSlug,

          offer_type:
            "service",

          status:
            "draft"
        })
        .select()
        .single();

    if (offerError) {
      throw offerError;
    }

    const {
      data: version,
      error: versionError
    } =
      await client
        .from(
          "offer_versions"
        )
        .insert({
          offer_id:
            offer.id,

          version_number:
            1,

          status:
            "draft",

          title:
            name,

          description:
            "",

          sales_talking_points:
            [],

          allowed_claims:
            [],

          restrictions:
            [],

          customer_eligibility:
            [],

          metadata:
            {}
        })
        .select()
        .single();

    if (versionError) {
      await client
        .from("offers")
        .delete()
        .eq(
          "id",
          offer.id
        )
        .eq(
          "client_id",
          tenantOfferId()
        );

      throw versionError;
    }

    const {
      error:
        currentError
    } =
      await client
        .from("offers")
        .update({
          current_version_id:
            version.id,

          updated_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          offer.id
        )
        .eq(
          "client_id",
          tenantOfferId()
        );

    if (currentError) {
      throw currentError;
    }

    state.currentOffer =
      offer;

    state.currentVersion =
      version;

    state.currentBinding =
      null;

    state.sourceVersion =
      null;

    resetForm();

    setValue(
      "offerName",
      name
    );

    await ensureOfferBinding(
      offer.id,
      version.id
    );

    showEditor();

    await loadOffers();

    updateVersionActions();

    notify(
      "Draft offer created.",
      "success"
    );
  }

  /* =========================================================
     OPEN OFFER
     ========================================================= */

  async function openOffer(
    offerId
  ) {
    const client =
      await getSupabaseClient();

    const {
      data: offer,
      error: offerError
    } =
      await client
        .from("offers")
        .select("*")
        .eq(
          "id",
          offerId
        )
        .eq(
          "client_id",
          tenantOfferId()
        )
        .single();

    if (offerError) {
      throw offerError;
    }

    const {
      data: versions,
      error: versionError
    } =
      await client
        .from(
          "offer_versions"
        )
        .select("*")
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

    if (versionError) {
      throw versionError;
    }

    const version =
      findCurrentVersion({
        ...offer,
        offer_versions:
          versions || []
      });

    if (!version) {
      throw new Error(
        "No offer version found."
      );
    }

    state.currentOffer =
      offer;

    state.currentVersion =
      version;

    state.sourceVersion =
      null;

    await loadOfferBinding(
      offer.id
    );

    await loadOfferAvailability(
      version.id
    );

    await loadOfferIntoForm();

    state.currentStep =
      1;

    showEditor();

    updateStepUI();
    updateVersionActions();
  }

  /* =========================================================
     OFFER BINDING
     ========================================================= */

  async function loadOfferBinding(
    offerId
  ) {
    try {
      const rows =
        await selectRows(
          "offer_catalog_bindings",
          "*",
          {
            offer_id:
              offerId,

            client_id:
              tenantConfigId()
          }
        );

      state.currentBinding =
        rows[0] || null;

      return state.currentBinding;
    } catch (
      error
    ) {
      console.warn(
        "[GLIME] Binding load warning:",
        error
      );

      state.currentBinding =
        null;

      return null;
    }
  }

  async function ensureOfferBinding(
    offerId,
    versionId
  ) {
    const client =
      await getSupabaseClient();

    await loadOfferBinding(
      offerId
    );

    if (
      state.currentBinding
    ) {
      return state.currentBinding;
    }

    let entityTypeId =
      null;

    try {
      const entityTypes =
        await selectRows(
          "entity_types",
          "id,name,slug",
          {}
        );

      const type =
        entityTypes.find(
          (item) => {
            const value =
              safeText(
                item.slug ||
                  item.name
              ).toLowerCase();

            return [
              "service",
              "product",
              "offer"
            ].includes(
              value
            );
          }
        );

      entityTypeId =
        type?.id || null;
    } catch (
      error
    ) {
      console.warn(
        "[GLIME] Entity type lookup:",
        error
      );
    }

    const payload = {
      offer_id:
        offerId,

      client_id:
        tenantConfigId(),

      entity_type_id:
        entityTypeId,

      template_configuration_id:
        null,

      status:
        "draft",

      custom_data:
        {
          version_id:
            versionId
        },

      metadata:
        {
          source:
            "services-ui",

          version_id:
            versionId
        }
    };

    try {
      const {
        data,
        error
      } =
        await client
          .from(
            "offer_catalog_bindings"
          )
          .insert(
            payload
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      state.currentBinding =
        data;

      return data;
    } catch (
      error
    ) {
      /*
        Binding is important to the new architecture,
        but a legacy offer must not become uneditable
        because the binding is temporarily unavailable.
      */

      console.warn(
        "[GLIME] Binding creation warning:",
        error
      );

      return null;
    }
  }

     /* =========================================================
     FORM LOAD
     ========================================================= */

  async function loadOfferIntoForm() {
    const offer =
      state.currentOffer;

    const version =
      state.currentVersion;

    if (
      !offer ||
      !version
    ) {
      return;
    }

    const metadata =
      getMetadata(
        version
      );

    setValue(
      "offerName",
      version.title ||
        offer.name ||
        ""
    );

    setValue(
      "offerType",
      offer.offer_type ||
        "service"
    );

    setValue(
      "shortDescription",
      offer.short_description ||
        metadata.short_description ||
        ""
    );

    setValue(
      "offerDescription",
      version.description ||
        offer.description ||
        ""
    );

    setValue(
      "offerCategory",
      offer.category_id ||
        metadata.category_id ||
        ""
    );

    setValue(
      "detailDuration",
      metadata.duration ||
        ""
    );

    setValue(
      "eligibility",
      textFromArray(
        version.customer_eligibility
      ) ||
        metadata.eligibility ||
        ""
    );

    setValue(
      "included",
      metadata.included ||
        ""
    );

    setValue(
      "excluded",
      metadata.excluded ||
        ""
    );

    setValue(
      "faqs",
      metadata.faqs ||
        ""
    );

    setValue(
      "policies",
      metadata.policies ||
        ""
    );

    setValue(
      "qualification",
      metadata.qualification ||
        ""
    );

    setValue(
      "talkingPoints",
      textFromArray(
        version.sales_talking_points
      ) ||
        metadata.talking_points ||
        ""
    );

    setValue(
      "allowedClaims",
      textFromArray(
        version.allowed_claims
      ) ||
        metadata.allowed_claims ||
        ""
    );

    setValue(
      "restrictions",
      textFromArray(
        version.restrictions
      ) ||
        metadata.restrictions ||
        ""
    );

    setValue(
      "aiInstructions",
      metadata.ai_instructions ||
        ""
    );

    setValue(
      "websiteLink",
      metadata.website_url ||
        ""
    );

    setValue(
      "bookingLink",
      metadata.booking_url ||
        ""
    );

    setValue(
      "instagramLink",
      metadata.instagram_url ||
        ""
    );

    setValue(
      "facebookLink",
      metadata.facebook_url ||
        ""
    );

    setValue(
      "mediaUrls",
      textFromArray(
        metadata.media_urls
      )
    );

    setValue(
      "aliases",
      textFromArray(
        metadata.aliases
      )
    );

    await loadOfferPricing(
      version.id
    );

    renderShareIdentity();

    renderAICheck(
      metadata.ai_check
    );

    updateVersionActions();
  }

  /* =========================================================
     PRICING
     ========================================================= */

  async function loadOfferPricing(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    const {
      data,
      error
    } =
      await client
        .from(
          "offer_prices"
        )
        .select("*")
        .eq(
          "offer_version_id",
          versionId
        )
        .eq(
          "is_active",
          true
        )
        .is(
          "variant_id",
          null
        )
        .order(
          "created_at",
          {
            ascending: true
          }
        )
        .limit(1);

    if (error) {
      console.warn(
        "[GLIME] Pricing load:",
        error
      );

      return;
    }

    const price =
      data?.[0];

    if (price) {
      setValue(
        "priceAmount",
        price.amount ??
          ""
      );

      setValue(
        "priceCurrency",
        price.currency ||
          "INR"
      );

      setValue(
        "priceType",
        price.price_type ||
          "fixed"
      );

      setValue(
        "billingPeriod",
        price.billing_period ||
          ""
      );

      setValue(
        "minAmount",
        price.min_amount ??
          ""
      );

      setValue(
        "maxAmount",
        price.max_amount ??
          ""
      );
    } else {
      setValue(
        "priceCurrency",
        "INR"
      );

      setValue(
        "priceType",
        "fixed"
      );
    }

    renderRangeState();
  }

  function priceHasValue() {
    return (
      !!getValue(
        "priceAmount"
      ) ||
      !!getValue(
        "minAmount"
      ) ||
      !!getValue(
        "maxAmount"
      )
    );
  }

  async function savePricing(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    const amount =
      getValue(
        "priceAmount"
      );

    const minAmount =
      getValue(
        "minAmount"
      );

    const maxAmount =
      getValue(
        "maxAmount"
      );

    /*
      Do not create an empty price row.
    */

    if (
      !amount &&
      !minAmount &&
      !maxAmount
    ) {
      return;
    }

    const payload = {
      offer_version_id:
        versionId,

      variant_id:
        null,

      amount:
        amount
          ? Number(
              amount
            )
          : null,

      currency:
        getValue(
          "priceCurrency"
        ) ||
        "INR",

      price_type:
        getValue(
          "priceType"
        ) ||
        "fixed",

      min_amount:
        minAmount
          ? Number(
              minAmount
            )
          : null,

      max_amount:
        maxAmount
          ? Number(
              maxAmount
            )
          : null,

      billing_period:
        getValue(
          "billingPeriod"
        ) ||
        null,

      is_active:
        true,

      updated_at:
        new Date().toISOString()
    };

    const {
      data: existing,
      error: findError
    } =
      await client
        .from(
          "offer_prices"
        )
        .select("id")
        .eq(
          "offer_version_id",
          versionId
        )
        .eq(
          "is_active",
          true
        )
        .is(
          "variant_id",
          null
        )
        .order(
          "created_at",
          {
            ascending: true
          }
        )
        .limit(1);

    if (findError) {
      throw findError;
    }

    if (
      existing?.[0]
    ) {
      const {
        error
      } =
        await client
          .from(
            "offer_prices"
          )
          .update(
            payload
          )
          .eq(
            "id",
            existing[0].id
          );

      if (error) {
        throw error;
      }
    } else {
      const {
        error
      } =
        await client
          .from(
            "offer_prices"
          )
          .insert(
            payload
          );

      if (error) {
        throw error;
      }
    }
  }

  function renderRangeState() {
    const row =
      $("rangeRow");

    if (!row) return;

    const type =
      getValue(
        "priceType"
      );

    row.hidden =
      ![
        "range",
        "starting_from",
        "from_to"
      ].includes(
        type
      );
  }

  /* =========================================================
     AVAILABILITY
     ========================================================= */

  async function loadOfferAvailability(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    const {
      data,
      error
    } =
      await client
        .from(
          "offer_availability"
        )
        .select("*")
        .eq(
          "offer_version_id",
          versionId
        )
        .order(
          "day_of_week",
          {
            ascending: true
          }
        )
        .order(
          "start_time",
          {
            ascending: true
          }
        );

    if (error) {
      console.warn(
        "[GLIME] Availability load:",
        error
      );

      state.availability =
        [];

      renderAvailability();

      return;
    }

    state.availability =
      data || [];

    renderAvailability();
  }

  function renderAvailability() {
    const list =
      $("availabilityList");

    if (!list) return;

    if (
      !state.availability.length
    ) {
      list.innerHTML =
        `<div class="availability-empty">
          No availability rules added.
        </div>`;

      return;
    }

    const days = [
      [0, "Sunday"],
      [1, "Monday"],
      [2, "Tuesday"],
      [3, "Wednesday"],
      [4, "Thursday"],
      [5, "Friday"],
      [6, "Saturday"]
    ];

    list.innerHTML =
      state.availability
        .map(
          (item, index) => `
            <div
              class="availability-row"
              data-index="${index}"
            >

              <select
                class="availability-day"
              >
                ${days
                  .map(
                    ([value, label]) => `
                      <option
                        value="${value}"
                        ${
                          String(
                            item.day_of_week
                          ) ===
                          String(
                            value
                          )
                            ? "selected"
                            : ""
                        }
                      >
                        ${label}
                      </option>
                    `
                  )
                  .join("")}
              </select>

              <input
                type="time"
                class="availability-start"
                value="${escapeHtml(
                  item.start_time ||
                    ""
                )}"
              />

              <input
                type="time"
                class="availability-end"
                value="${escapeHtml(
                  item.end_time ||
                    ""
                )}"
              />

              <input
                type="number"
                min="0"
                class="availability-capacity"
                placeholder="Capacity"
                value="${escapeHtml(
                  item.capacity ??
                    ""
                )}"
              />

              <button
                type="button"
                class="remove-availability"
                data-index="${index}"
              >
                Remove
              </button>

            </div>
          `
        )
        .join("");

    qsa(
      ".remove-availability",
      list
    ).forEach(
      (button) => {
        button.addEventListener(
          "click",
          async () => {
            try {
              const index =
                Number(
                  button.dataset
                    .index
                );

              const row =
                state
                  .availability[
                  index
                ];

              if (row?.id) {
                const client =
                  await getSupabaseClient();

                const {
                  error
                } =
                  await client
                    .from(
                      "offer_availability"
                    )
                    .delete()
                    .eq(
                      "id",
                      row.id
                    );

                if (error) {
                  throw error;
                }
              }

              state.availability.splice(
                index,
                1
              );

              renderAvailability();
            } catch (
              error
            ) {
              handleError(
                error,
                "Unable to remove availability."
              );
            }
          }
        );
      }
    );
  }

  function addAvailabilityRow() {
    state.availability.push({
      day_of_week:
        1,

      start_time:
        "09:00",

      end_time:
        "17:00",

      timezone:
        localTimezone(),

      capacity:
        null,

      is_available:
        true,

      notes:
        null
    });

    renderAvailability();
  }

  async function saveAvailability(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    const container =
      $("availabilityList");

    if (!container) {
      return;
    }

    const rows =
      qsa(
        ".availability-row",
        container
      );

    /*
      If the user removed all rows,
      delete existing rows for this version.
    */

    if (!rows.length) {
      const {
        error
      } =
        await client
          .from(
            "offer_availability"
          )
          .delete()
          .eq(
            "offer_version_id",
            versionId
          );

      if (error) {
        throw error;
      }

      state.availability =
        [];

      return;
    }

    const submittedIds =
      new Set();

    for (
      let index = 0;
      index < rows.length;
      index++
    ) {
      const row =
        rows[index];

      const existing =
        state.availability[
          index
        ] || {};

      const day =
        Number(
          qs(
            ".availability-day",
            row
          )?.value || 0
        );

      const start =
        qs(
          ".availability-start",
          row
        )?.value ||
        null;

      const end =
        qs(
          ".availability-end",
          row
        )?.value ||
        null;

      const capacityValue =
        qs(
          ".availability-capacity",
          row
        )?.value;

      const payload = {
        offer_version_id:
          versionId,

        day_of_week:
          day,

        start_time:
          start,

        end_time:
          end,

        timezone:
          existing.timezone ||
          localTimezone(),

        capacity:
          capacityValue !==
            "" &&
          capacityValue !=
            null
            ? Number(
                capacityValue
              )
            : null,

        is_available:
          existing.is_available !==
          false,

        notes:
          existing.notes ||
          null,

        updated_at:
          new Date().toISOString()
      };

      if (
        existing.id
      ) {
        submittedIds.add(
          existing.id
        );

        const {
          error
        } =
          await client
            .from(
              "offer_availability"
            )
            .update(
              payload
            )
            .eq(
              "id",
              existing.id
            );

        if (error) {
          throw error;
        }
      } else {
        const {
          data,
          error
        } =
          await client
            .from(
              "offer_availability"
            )
            .insert(
              payload
            )
            .select()
            .single();

        if (error) {
          throw error;
        }

        state.availability[
          index
        ] = data;
      }
    }

    /*
      Remove database rows that are no longer present
      in the editor.
    */

    const existingIds =
      state.availability
        .map(
          (item) =>
            item.id
        )
        .filter(Boolean);

    const removedIds =
      existingIds.filter(
        (id) =>
          !submittedIds.has(
            id
          )
      );

    if (
      removedIds.length
    ) {
      const {
        error
      } =
        await client
          .from(
            "offer_availability"
          )
          .delete()
          .in(
            "id",
            removedIds
          );

      if (error) {
        throw error;
      }
    }
  }

  /* =========================================================
     METADATA COLLECTION
     ========================================================= */

  function collectVersionMetadata() {
    return {
      short_description:
        getValue(
          "shortDescription"
        ),

      category_id:
        getValue(
          "offerCategory"
        ) ||
        null,

      duration:
        getValue(
          "detailDuration"
        ),

      eligibility:
        getValue(
          "eligibility"
        ),

      included:
        getValue(
          "included"
        ),

      excluded:
        getValue(
          "excluded"
        ),

      faqs:
        getValue(
          "faqs"
        ),

      policies:
        getValue(
          "policies"
        ),

      qualification:
        getValue(
          "qualification"
        ),

      ai_instructions:
        getValue(
          "aiInstructions"
        ),

      website_url:
        getValue(
          "websiteLink"
        ),

      booking_url:
        getValue(
          "bookingLink"
        ),

      instagram_url:
        getValue(
          "instagramLink"
        ),

      facebook_url:
        getValue(
          "facebookLink"
        ),

      media_urls:
        arrayFromText(
          getRawValue(
            "mediaUrls"
          )
        ),

      aliases:
        arrayFromText(
          getRawValue(
            "aliases"
          )
        )
    };
  }

  function collectVersionArrays() {
    return {
      sales_talking_points:
        arrayFromText(
          getRawValue(
            "talkingPoints"
          )
        ),

      allowed_claims:
        arrayFromText(
          getRawValue(
            "allowedClaims"
          )
        ),

      restrictions:
        arrayFromText(
          getRawValue(
            "restrictions"
          )
        ),

      customer_eligibility:
        arrayFromText(
          getRawValue(
            "eligibility"
          )
        )
    };
  }

  /* =========================================================
     SAVE DRAFT
     ========================================================= */

  async function saveCurrentDraft() {
    if (
      !state.currentOffer ||
      !state.currentVersion
    ) {
      throw new Error(
        "No offer is open."
      );
    }

    /*
      Only a draft can be directly edited.

      Published / approved / review versions are immutable.
      Editing them automatically creates a new draft version.
    */

    if (
      state.currentVersion.status !==
      "draft"
    ) {
      await createDraftFromCurrent();
    }

    const client =
      await getSupabaseClient();

    const title =
      getValue(
        "offerName"
      ) ||
      "Untitled Offer";

    const offerType =
      getValue(
        "offerType"
      ) ||
      "service";

    const categoryId =
      getValue(
        "offerCategory"
      ) ||
      null;

    const description =
      getValue(
        "offerDescription"
      );

    const metadata =
      collectVersionMetadata();

    const arrays =
      collectVersionArrays();

    const slug =
      `${slugify(
        title
      )}-${String(
        state.currentOffer.id
      ).slice(0, 8)}`;

    /*
      IMPORTANT:
      offers.client_id is TEXT in the current schema.
    */

    const {
      data: updatedOffer,
      error: offerError
    } =
      await client
        .from("offers")
        .update({
          name:
            title,

          slug,

          offer_type:
            offerType,

          short_description:
            metadata.short_description ||
            null,

          description:
            description ||
            null,

          category_id:
            categoryId,

          status:
            "draft",

          current_version_id:
            state.currentVersion.id,

          updated_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          state.currentOffer.id
        )
        .eq(
          "client_id",
          tenantOfferId()
        )
        .select()
        .single();

    if (offerError) {
      throw offerError;
    }

    const {
      data: updatedVersion,
      error: versionError
    } =
      await client
        .from(
          "offer_versions"
        )
        .update({
          title,

          description,

          sales_talking_points:
            arrays.sales_talking_points,

          allowed_claims:
            arrays.allowed_claims,

          restrictions:
            arrays.restrictions,

          customer_eligibility:
            arrays.customer_eligibility,

          metadata,

          updated_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          state.currentVersion.id
        )
        .eq(
          "offer_id",
          state.currentOffer.id
        )
        .select()
        .single();

    if (versionError) {
      throw versionError;
    }

    state.currentOffer =
      updatedOffer;

    state.currentVersion =
      updatedVersion;

    await savePricing(
      updatedVersion.id
    );

    await saveAvailability(
      updatedVersion.id
    );

    await saveBinding(
      updatedOffer.id,
      updatedVersion.id
    );

    renderShareIdentity();

    await loadOffers();

    updateVersionActions();

    notify(
      "Draft saved.",
      "success"
    );

    /*
      Runtime AI context can refresh after business truth
      changes, but it never becomes the source of truth.
    */

    await refreshAIContextAddon();
  }

  /* =========================================================
     CREATE NEW DRAFT VERSION
     ========================================================= */

  async function createDraftFromCurrent() {
    const client =
      await getSupabaseClient();

    const source =
      state.currentVersion;

    const offer =
      state.currentOffer;

    if (
      !source ||
      !offer
    ) {
      throw new Error(
        "No source version found."
      );
    }

    /*
      Always calculate next version from database,
      not just from the currently loaded version.
    */

    const {
      data: versions,
      error:
        versionsError
    } =
      await client
        .from(
          "offer_versions"
        )
        .select(
          "version_number"
        )
        .eq(
          "offer_id",
          offer.id
        )
        .order(
          "version_number",
          {
            ascending: false
          }
        )
        .limit(1);

    if (versionsError) {
      throw versionsError;
    }

    const nextNumber =
      Number(
        versions?.[0]
          ?.version_number ||
          source.version_number ||
          0
      ) + 1;

    const metadata =
      getMetadata(
        source
      );

    const {
      data: draft,
      error: draftError
    } =
      await client
        .from(
          "offer_versions"
        )
        .insert({
          offer_id:
            offer.id,

          version_number:
            nextNumber,

          status:
            "draft",

          title:
            source.title ||
            offer.name ||
            "Untitled Offer",

          description:
            source.description ||
            "",

          sales_talking_points:
            Array.isArray(
              source.sales_talking_points
            )
              ? source.sales_talking_points
              : [],

          allowed_claims:
            Array.isArray(
              source.allowed_claims
            )
              ? source.allowed_claims
              : [],

          restrictions:
            Array.isArray(
              source.restrictions
            )
              ? source.restrictions
              : [],

          customer_eligibility:
            Array.isArray(
              source.customer_eligibility
            )
              ? source.customer_eligibility
              : [],

          metadata: {
            ...metadata,

            /*
              AI check belongs to the old version.
              New draft starts with a fresh check.
            */
            ai_check:
              null
          }
        })
        .select()
        .single();

    if (draftError) {
      throw draftError;
    }

    /* =====================================================
       CLONE VARIANTS
       ===================================================== */

    const {
      data: variants
    } =
      await client
        .from(
          "offer_variants"
        )
        .select("*")
        .eq(
          "offer_version_id",
          source.id
        );

    const variantMap =
      new Map();

    if (
      variants?.length
    ) {
      for (
        const variant of variants
      ) {
        const {
          data: newVariant,
          error
        } =
          await client
            .from(
              "offer_variants"
            )
            .insert({
              offer_version_id:
                draft.id,

              name:
                variant.name,

              sku:
                variant.sku,

              description:
                variant.description,

              attributes:
                variant.attributes ||
                {},

              is_active:
                variant.is_active !==
                false,

              sort_order:
                variant.sort_order ||
                0
            })
            .select()
            .single();

        if (error) {
          throw error;
        }

        variantMap.set(
          String(
            variant.id
          ),
          newVariant.id
        );
      }
    }

    /* =====================================================
       CLONE PRICES
       ===================================================== */

    const {
      data: prices,
      error: pricesError
    } =
      await client
        .from(
          "offer_prices"
        )
        .select("*")
        .eq(
          "offer_version_id",
          source.id
        );

    if (pricesError) {
      throw pricesError;
    }

    if (
      prices?.length
    ) {
      const priceRows =
        prices.map(
          (price) => ({
            offer_version_id:
              draft.id,

            variant_id:
              price.variant_id
                ? variantMap.get(
                    String(
                      price.variant_id
                    )
                  ) || null
                : null,

            amount:
              price.amount,

            currency:
              price.currency,

            price_type:
              price.price_type,

            min_amount:
              price.min_amount,

            max_amount:
              price.max_amount,

            billing_period:
              price.billing_period,

            is_active:
              price.is_active !==
              false
          })
        );

      const {
        error
      } =
        await client
          .from(
            "offer_prices"
          )
          .insert(
            priceRows
          );

      if (error) {
        throw error;
      }
    }

    /* =====================================================
       CLONE AVAILABILITY
       ===================================================== */

    const {
      data: availability,
      error:
        availabilityError
    } =
      await client
        .from(
          "offer_availability"
        )
        .select("*")
        .eq(
          "offer_version_id",
          source.id
        );

    if (availabilityError) {
      throw availabilityError;
    }

    if (
      availability?.length
    ) {
      const rows =
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
              item.timezone,

            capacity:
              item.capacity,

            is_available:
              item.is_available !==
              false,

            notes:
              item.notes
          })
        );

      const {
        error
      } =
        await client
          .from(
            "offer_availability"
          )
          .insert(
            rows
          );

      if (error) {
        throw error;
      }
    }

    /* =====================================================
       MAKE NEW DRAFT CURRENT
       ===================================================== */

    const {
      data: updatedOffer,
      error:
        offerError
    } =
      await client
        .from("offers")
        .update({
          current_version_id:
            draft.id,

          status:
            "draft",

          updated_at:
            new Date().toISOString()
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

    if (offerError) {
      throw offerError;
    }

    state.sourceVersion =
      source;

    state.currentVersion =
      draft;

    state.currentOffer =
      updatedOffer;

    await loadOfferAvailability(
      draft.id
    );

    await loadOfferBinding(
      offer.id
    );

    await loadOfferIntoForm();

    updateVersionActions();

    notify(
      `Draft v${nextNumber} created.`,
      "success"
    );
  }

  /* =========================================================
     BINDING SAVE
     ========================================================= */

  async function saveBinding(
    offerId,
    versionId
  ) {
    try {
      const binding =
        await ensureOfferBinding(
          offerId,
          versionId
        );

      if (!binding) {
        return;
      }

      const client =
        await getSupabaseClient();

      const existingMetadata =
        getMetadata(
          binding
        );

      const customData = {
        version_id:
          versionId,

        offer_type:
          getValue(
            "offerType"
          ),

        duration:
          getValue(
            "detailDuration"
          ),

        qualification:
          getValue(
            "qualification"
          )
      };

      const metadata = {
        ...existingMetadata,

        aliases:
          arrayFromText(
            getRawValue(
              "aliases"
            )
          ),

        media_urls:
          arrayFromText(
            getRawValue(
              "mediaUrls"
            )
          ),

        website_url:
          getValue(
            "websiteLink"
          ),

        booking_url:
          getValue(
            "bookingLink"
          ),

        instagram_url:
          getValue(
            "instagramLink"
          ),

        facebook_url:
          getValue(
            "facebookLink"
          )
      };

      const {
        data,
        error
      } =
        await client
          .from(
            "offer_catalog_bindings"
          )
          .update({
            status:
              "draft",

            custom_data:
              customData,

            metadata,

            updated_at:
              new Date().toISOString()
          })
          .eq(
            "id",
            binding.id
          )
          .eq(
            "client_id",
            tenantConfigId()
          )
          .select()
          .single();

      if (error) {
        throw error;
      }

      state.currentBinding =
        data;
    } catch (
      error
    ) {
      console.warn(
        "[GLIME] Binding save warning:",
        error
      );
    }
  }

     /* =========================================================
     REVIEW
     ========================================================= */

  async function submitForReview() {
    /*
      Save first. If currently published/approved/review,
      saveCurrentDraft() creates a new draft automatically.
    */

    await saveCurrentDraft();

    const versionId =
      state.currentVersion?.id;

    if (!versionId) {
      throw new Error(
        "No current version available."
      );
    }

    const client =
      await getSupabaseClient();

    const {
      error
    } =
      await client.rpc(
        "client_submit_offer_version_for_review",
        {
          p_version_id:
            versionId
        }
      );

    if (error) {
      throw error;
    }

    const {
      data: version,
      error:
        versionError
    } =
      await client
        .from(
          "offer_versions"
        )
        .select("*")
        .eq(
          "id",
          versionId
        )
        .single();

    if (versionError) {
      throw versionError;
    }

    state.currentVersion =
      version;

    await loadOfferBinding(
      state.currentOffer.id
    );

    updateVersionActions();

    notify(
      "Offer submitted for review.",
      "success"
    );
  }

  /* =========================================================
     APPROVAL
     ========================================================= */

  async function approveOffer() {
    const version =
      state.currentVersion;

    if (!version) {
      throw new Error(
        "No offer version is open."
      );
    }

    if (
      version.status !==
      "review"
    ) {
      throw new Error(
        "Only a version in review can be approved."
      );
    }

    const notes =
      window.prompt(
        "Approval note (optional):"
      ) || null;

    const client =
      await getSupabaseClient();

    const {
      error
    } =
      await client.rpc(
        "client_approve_offer_version",
        {
          p_version_id:
            version.id,

          p_notes:
            notes
        }
      );

    if (error) {
      throw error;
    }

    const {
      data: updated,
      error:
        refreshError
    } =
      await client
        .from(
          "offer_versions"
        )
        .select("*")
        .eq(
          "id",
          version.id
        )
        .single();

    if (refreshError) {
      throw refreshError;
    }

    state.currentVersion =
      updated;

    updateVersionActions();

    notify(
      "Offer version approved.",
      "success"
    );
  }

  /* =========================================================
     PUBLISH
     ========================================================= */

  async function publishOffer() {
    const version =
      state.currentVersion;

    if (!version) {
      throw new Error(
        "No offer version is open."
      );
    }

    if (
      version.status !==
      "approved"
    ) {
      throw new Error(
        "Only an approved version can be published."
      );
    }

    const client =
      await getSupabaseClient();

    /*
      Server-side RPC remains the authority.
    */

    const {
      error
    } =
      await client.rpc(
        "client_publish_offer_version",
        {
          p_version_id:
            version.id
        }
      );

    if (error) {
      throw error;
    }

    const {
      data: updatedVersion,
      error:
        versionError
    } =
      await client
        .from(
          "offer_versions"
        )
        .select("*")
        .eq(
          "id",
          version.id
        )
        .single();

    if (versionError) {
      throw versionError;
    }

    state.currentVersion =
      updatedVersion;

    /*
      Offer-level status and binding status are kept
      synchronized with the published business truth.
    */

    const {
      data: updatedOffer,
      error:
        offerError
    } =
      await client
        .from("offers")
        .update({
          status:
            "active",

          current_version_id:
            updatedVersion.id,

          updated_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          state.currentOffer.id
        )
        .eq(
          "client_id",
          tenantOfferId()
        )
        .select()
        .single();

    if (offerError) {
      throw offerError;
    }

    state.currentOffer =
      updatedOffer;

    /*
      Binding becomes active only after publish.
      Draft/incomplete data therefore does not become
      customer-facing AI truth.
    */

    if (
      state.currentBinding?.id
    ) {
      const {
        data: binding,
        error:
          bindingError
      } =
        await client
          .from(
            "offer_catalog_bindings"
          )
          .update({
            status:
              "active",

            custom_data: {
              ...(state.currentBinding
                .custom_data ||
                {}),
              version_id:
                updatedVersion.id
            },

            updated_at:
              new Date().toISOString()
          })
          .eq(
            "id",
            state.currentBinding.id
          )
          .eq(
            "client_id",
            tenantConfigId()
          )
          .select()
          .single();

      if (bindingError) {
        console.warn(
          "[GLIME] Binding activation warning:",
          bindingError
        );
      } else {
        state.currentBinding =
          binding;
      }
    }

    updateVersionActions();

    renderShareIdentity();

    await loadOffers();

    await refreshAIContextAddon();

    notify(
      "Offer published successfully.",
      "success"
    );
  }

  /* =========================================================
     AI COMPLETENESS CHECK
     ========================================================= */

  async function runAICheck() {
    if (
      !state.currentVersion
    ) {
      throw new Error(
        "Open an offer first."
      );
    }

    const result =
      $("aiCheck");

    if (result) {
      result.textContent =
        "Running AI completeness check...";

      result.dataset.state =
        "loading";
    }

    const missing = [];

    if (
      !getValue(
        "offerName"
      )
    ) {
      missing.push(
        "Offer name"
      );
    }

    if (
      !getValue(
        "offerDescription"
      )
    ) {
      missing.push(
        "Description"
      );
    }

    if (
      !priceHasValue()
    ) {
      missing.push(
        "Pricing"
      );
    }

    if (
      !getValue(
        "policies"
      )
    ) {
      missing.push(
        "Policies"
      );
    }

    if (
      !getValue(
        "faqs"
      )
    ) {
      missing.push(
        "FAQs"
      );
    }

    if (
      !getValue(
        "qualification"
      )
    ) {
      missing.push(
        "Qualification rules"
      );
    }

    if (
      !getValue(
        "detailDuration"
      ) &&
      getValue(
        "offerType"
      ) ===
        "service"
    ) {
      missing.push(
        "Duration"
      );
    }

    const score =
      Math.max(
        0,
        100 -
          missing.length *
            12
      );

    const check = {
      score,

      status:
        missing.length ===
        0
          ? "ready"
          : "needs_attention",

      missing,

      checked_at:
        new Date().toISOString()
    };

    const metadata =
      getMetadata(
        state.currentVersion
      );

    metadata.ai_check =
      check;

    const client =
      await getSupabaseClient();

    const {
      data: updated,
      error
    } =
      await client
        .from(
          "offer_versions"
        )
        .update({
          metadata,

          updated_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          state.currentVersion.id
        )
        .select()
        .single();

    if (error) {
      throw error;
    }

    state.currentVersion =
      updated;

    renderAICheck(
      check
    );

    if (
      missing.length ===
      0
    ) {
      notify(
        "AI check passed. Offer is structurally complete.",
        "success"
      );
    } else {
      notify(
        `AI check found ${missing.length} item(s) to review.`,
        "info"
      );
    }
  }

  function renderAICheck(
    check
  ) {
    const el =
      $("aiCheck");

    if (!el) return;

    if (!check) {
      el.textContent =
        "AI check has not been run yet.";

      el.dataset.state =
        "idle";

      return;
    }

    const missing =
      Array.isArray(
        check.missing
      )
        ? check.missing
        : [];

    if (
      !missing.length
    ) {
      el.innerHTML = `
        <strong>Ready</strong>
        <div>
          All core offer information is present.
        </div>
        <div>
          Score:
          ${escapeHtml(
            check.score ??
              100
          )}/100
        </div>
      `;

      el.dataset.state =
        "ready";

      return;
    }

    el.innerHTML = `
      <strong>Needs attention</strong>

      <div>
        Score:
        ${escapeHtml(
          check.score ??
            ""
        )}/100
      </div>

      <ul>
        ${missing
          .map(
            (item) =>
              `<li>${escapeHtml(
                item
              )}</li>`
          )
          .join("")}
      </ul>
    `;

    el.dataset.state =
      "needs_attention";
  }

  /* =========================================================
     SHARE IDENTITY
     ========================================================= */

  function getShareIdentity() {
    const offer =
      state.currentOffer;

    const version =
      state.currentVersion;

    if (!offer) {
      return "";
    }

    const metadata =
      getMetadata(
        version || {}
      );

    /*
      Use an actual configured public URL if one exists.
    */

    const existingUrl =
      metadata.share_url ||
      metadata.public_url ||
      metadata.share?.url;

    if (
      existingUrl
    ) {
      return existingUrl;
    }

    /*
      Stable GLIME identity.

      We deliberately DO NOT invent a website route here.
      The actual public/share route can later resolve this ID.
    */

    return `GLIME:OFFER:${offer.id}`;
  }

  function renderShareIdentity() {
    const el =
      $("sharePreview");

    if (!el) return;

    const identity =
      getShareIdentity();

    el.textContent =
      identity ||
      "Save this offer to generate its share identity.";
  }

  async function copyShareIdentity() {
    const identity =
      getShareIdentity();

    if (!identity) {
      throw new Error(
        "No offer identity is available."
      );
    }

    if (
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(
        identity
      );
    } else {
      const textarea =
        document.createElement(
          "textarea"
        );

      textarea.value =
        identity;

      document.body.appendChild(
        textarea
      );

      textarea.select();

      document.execCommand(
        "copy"
      );

      textarea.remove();
    }

    notify(
      "Offer share identity copied.",
      "success"
    );
  }

  /* =========================================================
     FORM RESET
     ========================================================= */

  function resetForm() {
    [
      "offerName",
      "shortDescription",
      "offerDescription",
      "detailDuration",
      "eligibility",
      "included",
      "excluded",
      "priceAmount",
      "billingPeriod",
      "minAmount",
      "maxAmount",
      "faqs",
      "policies",
      "qualification",
      "talkingPoints",
      "allowedClaims",
      "restrictions",
      "aiInstructions",
      "websiteLink",
      "bookingLink",
      "instagramLink",
      "facebookLink",
      "mediaUrls",
      "aliases"
    ].forEach(
      (id) =>
        setValue(
          id,
          ""
        )
    );

    setValue(
      "priceCurrency",
      "INR"
    );

    setValue(
      "priceType",
      "fixed"
    );

    setValue(
      "offerType",
      "service"
    );

    setValue(
      "offerCategory",
      ""
    );

    state.availability =
      [];

    renderAvailability();
    renderAICheck(
      null
    );
    renderShareIdentity();
    renderRangeState();
  }

  /* =========================================================
     EDITOR
     ========================================================= */

  function showEditor() {
    show(
      $("editorEmpty"),
      false
    );

    show(
      $("offerForm"),
      true
    );

    updateStepUI();
  }

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

    show(
      $("offerForm"),
      false
    );

    show(
      $("editorEmpty"),
      true
    );

    state.currentStep =
      1;

    updateStepUI();
  }

  /* =========================================================
     STEP NAVIGATION
     ========================================================= */

  function getSteps() {
    return qsa(
      ".step"
    );
  }

  function updateStepUI() {
    const steps =
      getSteps();

    if (!steps.length) {
      return;
    }

    steps.forEach(
      (step) => {
        const number =
          Number(
            step.dataset.step
          );

        const active =
          number ===
          state.currentStep;

        step.hidden =
          !active;

        step.classList.toggle(
          "active",
          active
        );
      }
    );

    setText(
      "stepLabel",
      `Step ${state.currentStep} of ${state.totalSteps}`
    );

    const progress =
      $("progress");

    if (progress) {
      const percentage =
        Math.round(
          (state.currentStep /
            state.totalSteps) *
            100
        );

      progress.style.width =
        `${percentage}%`;

      progress.setAttribute(
        "aria-valuenow",
        String(
          percentage
        )
      );
    }

    setDisabled(
      "prevStepBtn",
      state.currentStep <=
        1
    );

    setDisabled(
      "nextStepBtn",
      state.currentStep >=
        state.totalSteps
    );
  }

  function nextStep() {
    if (
      state.currentStep <
      state.totalSteps
    ) {
      state.currentStep++;

      updateStepUI();
    }
  }

  function previousStep() {
    if (
      state.currentStep >
      1
    ) {
      state.currentStep--;

      updateStepUI();
    }
  }

  /* =========================================================
     VERSION ACTION STATE
     ========================================================= */

  function updateVersionActions() {
    const version =
      state.currentVersion;

    if (!version) {
      setText(
        "editorStatus",
        ""
      );

      return;
    }

    const status =
      safeText(
        version.status ||
          "draft"
      ).toLowerCase();

    const isDraft =
      status === "draft";

    const isReview =
      status === "review";

    const isApproved =
      status === "approved";

    const isPublished =
      status === "published";

    /*
      Action buttons.
    */

    setDisabled(
      "saveDraftBtn",
      false
    );

    setDisabled(
      "submitReviewBtn",
      !isDraft
    );

    setDisabled(
      "approveBtn",
      !isReview
    );

    setDisabled(
      "publishBtn",
      !isApproved
    );

    /*
      Only draft versions are editable.

      For non-draft versions the user can still click
      Save Draft; that action creates a new draft.
    */

    const form =
      $("offerForm");

    if (form) {
      const lock =
        !isDraft;

      const actionIds = [
        "prevStepBtn",
        "nextStepBtn",
        "closeEditorBtn",
        "saveDraftBtn",
        "submitReviewBtn",
        "approveBtn",
        "publishBtn",
        "runCheckBtn",
        "copyShareBtn",
        "addAvailabilityBtn"
      ];

      qsa(
        "input, textarea, select",
        form
      ).forEach(
        (element) => {
          if (
            actionIds.includes(
              element.id
            )
          ) {
            return;
          }

          element.disabled =
            lock;
        }
      );
    }

    /*
      Status text.
    */

    if (
      isPublished
    ) {
      setText(
        "editorStatus",
        "PUBLISHED — create a new draft to edit"
      );
    } else if (
      isApproved
    ) {
      setText(
        "editorStatus",
        "APPROVED — ready to publish"
      );
    } else if (
      isReview
    ) {
      setText(
        "editorStatus",
        "IN REVIEW — waiting for approval"
      );
    } else {
      setText(
        "editorStatus",
        "DRAFT"
      );
    }
  }

  /* =========================================================
     AI CONTEXT ADDON
     ========================================================= */

  async function refreshAIContextAddon() {
    if (
      window.GLIMEServicesAIContext &&
      typeof window
        .GLIMEServicesAIContext
        .refresh ===
        "function"
    ) {
      try {
        await window
          .GLIMEServicesAIContext
          .refresh();
      } catch (
        error
      ) {
        console.warn(
          "[GLIME] AI context addon refresh failed:",
          error
        );
      }
    }
  }

  /* =========================================================
     EVENTS
     ========================================================= */

  function bindEvents() {
    $("saveSetupBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await saveSetup();
          } catch (
            error
          ) {
            handleError(
              error,
              "Unable to save business setup."
            );
          }
        }
      );

    $("industrySelect")
      ?.addEventListener(
        "change",
        async (event) => {
          try {
            await loadBusinessModels(
              event.target
                .value
            );

            updateSetupState();
          } catch (
            error
          ) {
            handleError(
              error
            );
          }
        }
      );

    $("businessModelSelect")
      ?.addEventListener(
        "change",
        updateSetupState
      );

    $("newOfferBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await createNewOffer();
          } catch (
            error
          ) {
            handleError(
              error,
              "Unable to create offer."
            );
          }
        }
      );

    $("emptyNewBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await createNewOffer();
          } catch (
            error
          ) {
            handleError(
              error,
              "Unable to create offer."
            );
          }
        }
      );

    $("refreshBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await refreshCatalog();
          } catch (
            error
          ) {
            handleError(
              error
            );
          }
        }
      );

    $("addCategoryBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await createCategory();
          } catch (
            error
          ) {
            handleError(
              error,
              "Unable to create category."
            );
          }
        }
      );

     $("closeEditorBtn")
      ?.addEventListener(
        "click",
        closeEditor
      );

    $("prevStepBtn")
      ?.addEventListener(
        "click",
        previousStep
      );

    $("nextStepBtn")
      ?.addEventListener(
        "click",
        nextStep
      );

    $("addAvailabilityBtn")
      ?.addEventListener(
        "click",
        addAvailabilityRow
      );

    $("priceType")
      ?.addEventListener(
        "change",
        renderRangeState
      );

    $("copyShareBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await copyShareIdentity();
          } catch (
            error
          ) {
            handleError(
              error
            );
          }
        }
      );

    $("runCheckBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await runAICheck();
          } catch (
            error
          ) {
            handleError(
              error,
              "AI check failed."
            );
          }
        }
      );

    $("saveDraftBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await saveCurrentDraft();
          } catch (
            error
          ) {
            handleError(
              error,
              "Unable to save draft."
            );
          }
        }
      );

    $("submitReviewBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await submitForReview();
          } catch (
            error
          ) {
            handleError(
              error,
              "Unable to submit for review."
            );
          }
        }
      );

    $("approveBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await approveOffer();
          } catch (
            error
          ) {
            handleError(
              error,
              "Unable to approve offer."
            );
          }
        }
      );

    $("publishBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await publishOffer();
          } catch (
            error
          ) {
            handleError(
              error,
              "Unable to publish offer."
            );
          }
        }
      );
  }

  /* =========================================================
     REFRESH CATALOG
     ========================================================= */

  async function refreshCatalog() {
    await loadCategories();

    await loadOffers();

    if (
      state.currentOffer
    ) {
      await loadOfferBinding(
        state.currentOffer.id
      );
    }

    await refreshAIContextAddon();

    notify(
      "Catalog refreshed.",
      "success"
    );
  }

  /* =========================================================
     INITIALIZATION
     ========================================================= */

  async function init() {
    if (
      state.initialized
    ) {
      return;
    }

    try {
      if (
        !$("offerForm")
      ) {
        console.warn(
          "[GLIME Services] services.html not detected."
        );

        return;
      }

      state.initialized =
        true;

      bindEvents();

      updateStepUI();

      show(
        $("offerForm"),
        false
      );

      show(
        $("editorEmpty"),
        true
      );

      await loadClient();

      await loadIndustries();

      await loadClientSetup();

      await loadCategories();

      await loadOffers();

      await loadTemplates();

      populateCategorySelect();

      renderRangeState();

      updateSetupState();

      console.log(
        "[GLIME Services] FINAL core initialized."
      );
    } catch (
      error
    ) {
      state.initialized =
        false;

      handleError(
        error,
        "GLIME Services could not be initialized."
      );
    }
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.GLIMEServices = {
    refresh:
      refreshCatalog,

    openOffer:
      openOffer,

    createOffer:
      createNewOffer,

    saveDraft:
      saveCurrentDraft,

    submitReview:
      submitForReview,

    approve:
      approveOffer,

    publish:
      publishOffer,

    runAICheck:
      runAICheck,

    getState:
      () => ({
        ...state
      })
  };

  /* =========================================================
     START
     ========================================================= */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once: true
      }
    );
  } else {
    init();
  }

})();
   

   
        
