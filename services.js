/* =========================================================
   GLIME — Services / Offers Manager
   Version: Architecture-aligned Services Core
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    window.GLIME_SUPABASE_URL ||
    window.SUPABASE_URL ||
    "";

  const SUPABASE_ANON_KEY =
    window.GLIME_SUPABASE_ANON_KEY ||
    window.SUPABASE_ANON_KEY ||
    "";

  /*
    This file expects one of these to already exist:
      window.supabaseClient
      window.supabase
      window.sb

    If your project initializes Supabase differently, the
    existing client is preferred.
  */

  const sb =
    window.supabaseClient ||
    window.supabase ||
    window.sb ||
    null;

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
    currentStep: 1,
    totalSteps: 7,
    editing: false,
    saving: false,
    availability: [],
    sourceVersion: null,
    setupSaved: false
  };

  /* =========================================================
     DOM HELPERS
     ========================================================= */

  const $ = (id) => document.getElementById(id);

  const qs = (selector, root = document) =>
    root.querySelector(selector);

  const qsa = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  function safeText(value) {
    return value == null ? "" : String(value);
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = safeText(value);
  }

  function setValue(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = value == null ? "" : value;
  }

  function getValue(id) {
    const el = $(id);
    return el ? el.value.trim() : "";
  }

  function getRawValue(id) {
    const el = $(id);
    return el ? el.value : "";
  }

  function show(el, visible = true) {
    if (!el) return;
    el.hidden = !visible;
  }

  function setDisabled(id, disabled) {
    const el = $(id);
    if (el) el.disabled = !!disabled;
  }

  function notify(message, type = "info") {
    const el = $("message");
    if (!el) return;

    el.textContent = message;
    el.dataset.type = type;

    clearTimeout(notify._timer);
    notify._timer = setTimeout(() => {
      if (el) el.textContent = "";
    }, 5000);
  }

  function handleError(error, fallback = "Something went wrong.") {
    console.error("[GLIME Services]", error);

    const message =
      error?.message ||
      error?.error_description ||
      error?.details ||
      fallback;

    notify(message, "error");
  }

  function slugify(value) {
    return safeText(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);
  }

  function parseJson(value, fallback) {
    if (!value) return fallback;

    if (typeof value === "object") {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function jsonOrNull(value) {
    if (!value || !String(value).trim()) return null;

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function arrayFromText(value) {
    if (!value) return [];

    return String(value)
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function textFromArray(value) {
    if (!Array.isArray(value)) return "";
    return value.join("\n");
  }

  function getMetadata(obj) {
    return parseJson(obj?.metadata, {}) || {};
  }

  /* =========================================================
     SUPABASE
     ========================================================= */

  async function getSupabaseClient() {
    if (sb) return sb;

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
      "Supabase client is not available on this page."
    );
  }

  async function getAuthenticatedUser() {
    const client = await getSupabaseClient();

    const { data, error } =
      await client.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error("Please sign in first.");
    }

    return data.user;
  }

  /* =========================================================
     CLIENT / TENANT
     ========================================================= */

  async function loadClient() {
    const client = await getSupabaseClient();
    const user = await getAuthenticatedUser();

    /*
      Existing GLIME architecture uses client_data.id as the
      tenant identity and auth_user_id as ownership.
    */

    const { data, error } = await client
      .from("client_data")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        "No GLIME client profile is connected to this account."
      );
    }

    state.client = data;

    setText(
      "clientBadge",
      data.business_name ||
        data.company_name ||
        data.name ||
        `Client ${data.id}`
    );

    return data;
  }

  /* =========================================================
     GENERIC DATABASE HELPERS
     ========================================================= */

  async function selectRows(table, columns = "*", filters = {}) {
    const client = await getSupabaseClient();

    let query = client
      .from(table)
      .select(columns);

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  }

  async function insertRow(table, payload) {
    const client = await getSupabaseClient();

    const { data, error } = await client
      .from(table)
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return data;
  }

  async function updateRow(table, filters, payload) {
    const client = await getSupabaseClient();

    let query = client
      .from(table)
      .update(payload);

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data, error } =
      await query.select().maybeSingle();

    if (error) throw error;

    return data;
  }

  /* =========================================================
     SETUP — INDUSTRY / BUSINESS MODEL
     ========================================================= */

  async function loadIndustries() {
    const rows = await selectRows(
      "industries",
      "id,name,slug,description,is_active",
      { is_active: true }
    );

    state.industries = rows;

    const select = $("industrySelect");

    if (!select) return;

    const current = select.value;

    select.innerHTML =
      `<option value="">Select industry</option>` +
      rows
        .sort((a, b) =>
          safeText(a.name).localeCompare(
            safeText(b.name)
          )
        )
        .map(
          (item) =>
            `<option value="${item.id}">
              ${escapeHtml(item.name)}
            </option>`
        )
        .join("");

    if (current) {
      select.value = current;
    }
  }

  async function loadBusinessModels(industryId = null) {
    const rows = await selectRows(
      "business_models",
      "id,name,slug,industry_id,description,is_active",
      { is_active: true }
    );

    state.businessModels = rows;

    await loadCustomBusinessModels();

    const select = $("businessModelSelect");

    if (!select) return;

    const current = select.value;

    const filtered = industryId
      ? rows.filter(
          (x) =>
            !x.industry_id ||
            String(x.industry_id) === String(industryId)
        )
      : rows;

    const customOptions =
      state.customBusinessModels.map(
        (item) => ({
          ...item,
          __custom: true
        })
      );

    const all = [...filtered, ...customOptions];

    select.innerHTML =
      `<option value="">Select business model</option>` +
      all
        .sort((a, b) =>
          safeText(a.name).localeCompare(
            safeText(b.name)
          )
        )
        .map((item) => {
          const prefix = item.__custom
            ? "Custom — "
            : "";

          return `
            <option
              value="${item.__custom ? `custom:${item.id}` : item.id}"
            >
              ${escapeHtml(prefix + item.name)}
            </option>
          `;
        })
        .join("");

    if (current) {
      select.value = current;
    }
  }

  async function loadCustomBusinessModels() {
    if (!state.client?.id) return;

    state.customBusinessModels =
      await selectRows(
        "client_custom_business_models",
        "*",
        { client_id: state.client.id }
      );
  }

  async function loadClientSetup() {
    if (!state.client?.id) return;

    const configurations =
      await selectRows(
        "client_industry_configurations",
        "*",
        { client_id: state.client.id }
      );

    const current =
      configurations.find(
        (x) =>
          x.status === "active" ||
          x.is_active === true
      ) ||
      configurations[0];

    if (current) {
      setValue(
        "industrySelect",
        current.industry_id || ""
      );

      await loadBusinessModels(
        current.industry_id
      );

      setValue(
        "businessModelSelect",
        current.business_model_id
          ? String(current.business_model_id)
          : ""
      );
    } else {
      await loadBusinessModels();
    }

    await loadClientCustomBusinessModelField();
    updateSetupState();
  }

  async function loadClientCustomBusinessModelField() {
    const rows =
      await selectRows(
        "client_custom_business_models",
        "*",
        { client_id: state.client.id }
      );

    const select =
      $("businessModelSelect");

    if (!select) return;

    const custom =
      rows.find(
        (x) =>
          x.is_active !== false
      );

    if (custom) {
      setValue(
        "customBusinessModel",
        custom.name || ""
      );
    }
  }

  async function saveSetup() {
    if (!state.client?.id) {
      throw new Error("Client profile not loaded.");
    }

    const industryId =
      getValue("industrySelect");

    let businessModelValue =
      getValue("businessModelSelect");

    const customBusinessModel =
      getValue("customBusinessModel");

    if (!industryId) {
      throw new Error(
        "Please select an industry."
      );
    }

    if (!businessModelValue) {
      throw new Error(
        "Please select a business model."
      );
    }

    const client = await getSupabaseClient();

    let businessModelId = null;

    if (
      businessModelValue.startsWith("custom:")
    ) {
      businessModelId = null;

      const customId =
        businessModelValue.split(":")[1];

      if (customId) {
        await client
          .from("client_custom_business_models")
          .update({
            name:
              customBusinessModel ||
              "Custom Business Model",
            updated_at: new Date().toISOString()
          })
          .eq("id", customId)
          .eq("client_id", state.client.id);
      }
    } else {
      businessModelId =
        businessModelValue;
    }

    /*
      Upsert using the existing tenant-scoped
      configuration model.
    */

    const existing =
      await selectRows(
        "client_industry_configurations",
        "*",
        { client_id: state.client.id }
      );

    const active =
      existing.find(
        (x) =>
          x.status === "active" ||
          x.is_active === true
      ) || existing[0];

    const payload = {
      client_id: state.client.id,
      industry_id: industryId,
      business_model_id: businessModelId,
      status: "active",
      updated_at: new Date().toISOString()
    };

    if (active) {
      await updateRow(
        "client_industry_configurations",
        {
          id: active.id,
          client_id: state.client.id
        },
        payload
      );
    } else {
      await insertRow(
        "client_industry_configurations",
        payload
      );
    }

    state.setupSaved = true;

    updateSetupState();

    notify(
      "Business setup saved successfully.",
      "success"
    );

    await loadTemplates();
  }

  function updateSetupState() {
    const industry =
      getValue("industrySelect");

    const model =
      getValue("businessModelSelect");

    const complete =
      !!industry && !!model;

    state.setupSaved = complete;

    const el = $("setupState");

    if (el) {
      el.textContent = complete
        ? "Business setup complete"
        : "Business setup required";

      el.dataset.state = complete
        ? "complete"
        : "incomplete";
    }
  }

  /* =========================================================
     TEMPLATE
     ========================================================= */

  async function loadTemplates() {
    const industryId =
      getValue("industrySelect");

    if (!industryId) {
      state.templates = [];
      return;
    }

    const rows =
      await selectRows(
        "industry_templates",
        "*",
        { industry_id: industryId }
      );

    state.templates = rows || [];
  }

  /* =========================================================
     CATEGORIES
     ========================================================= */

  async function loadCategories() {
    if (!state.client?.id) return;

    const client = await getSupabaseClient();

    let query = client
      .from("offer_categories")
      .select("*")
      .eq("client_id", state.client.id);

    const { data, error } =
      await query.order("name");

    if (error) {
      console.warn(
        "[GLIME] Category load failed:",
        error
      );

      state.categories = [];
      renderCategories();
      return;
    }

    state.categories = data || [];

    renderCategories();
    populateCategorySelect();
  }

  function renderCategories() {
    const list = $("categoryList");

    if (!list) return;

    if (!state.categories.length) {
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
                category.name || "Unnamed"
              )}
            </button>
          `
        )
        .join("");

    qsa(
      ".category-item",
      list
    ).forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const id =
            button.dataset.categoryId;

          await loadOffers(id);
        }
      );
    });
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
                category.name || "Unnamed"
              )}
            </option>
          `
        )
        .join("");

    if (current) {
      select.value = current;
    }
  }

  async function createCategory() {
    const name =
      window.prompt(
        "Enter category name:"
      );

    if (!name?.trim()) return;

    const slug =
      slugify(name);

    const category =
      await insertRow(
        "offer_categories",
        {
          client_id: state.client.id,
          name: name.trim(),
          slug
        }
      );

    state.categories.push(category);

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

  async function loadOffers(categoryId = null) {
    if (!state.client?.id) return;

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
          state.client.id
        );

    if (categoryId) {
      query = query.eq(
        "category_id",
        categoryId
      );
    }

    const { data, error } =
      await query.order(
        "created_at",
        { ascending: false }
      );

    if (error) {
      /*
        Some older GLIME databases use `category`
        instead of category_id. Retry without category
        filtering so the catalog remains usable.
      */

      const retry =
        await client
          .from("offers")
          .select("*")
          .eq(
            "client_id",
            state.client.id
          )
          .order(
            "created_at",
            { ascending: false }
          );

      if (retry.error) {
        throw error;
      }

      state.offers =
        retry.data || [];
    } else {
      state.offers =
        data || [];
    }

    renderOffers();

    setText(
      "offerCount",
      String(state.offers.length)
    );
  }

  function renderOffers() {
    const list =
      $("offerList");

    if (!list) return;

    if (!state.offers.length) {
      list.innerHTML =
        `<div class="empty-state">
          No offers yet. Create your first service or product.
        </div>`;
      return;
    }

    list.innerHTML =
      state.offers
        .map((offer) => {
          const status =
            safeText(
              offer.status || "draft"
            ).toLowerCase();

          const currentVersion =
            findCurrentVersion(
              offer
            );

          const title =
            currentVersion?.title ||
            offer.name ||
            "Untitled Offer";

          return `
            <button
              type="button"
              class="offer-item"
              data-offer-id="${escapeHtml(
                offer.id
              )}"
            >
              <span class="offer-item-title">
                ${escapeHtml(title)}
              </span>

              <span class="offer-item-meta">
                ${escapeHtml(
                  offer.offer_type ||
                  "Service"
                )}
                ·
                ${escapeHtml(status)}
              </span>
            </button>
          `;
        })
        .join("");

    qsa(
      ".offer-item",
      list
    ).forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          await openOffer(
            button.dataset.offerId
          );
        }
      );
    });
  }

  function findCurrentVersion(offer) {
    const versions =
      Array.isArray(
        offer.offer_versions
      )
        ? offer.offer_versions
        : [];

    if (
      offer.current_version_id
    ) {
      return (
        versions.find(
          (v) =>
            String(v.id) ===
            String(
              offer.current_version_id
            )
        ) ||
        versions[0]
      );
    }

    return (
      versions.find(
        (v) => v.status === "published"
      ) ||
      versions.find(
        (v) => v.status === "draft"
      ) ||
      versions[0]
    );
  }

  /* =========================================================
     CREATE OFFER
     ========================================================= */

  async function createNewOffer() {
    if (!state.client?.id) {
      throw new Error(
        "Client profile is not loaded."
      );
    }

    const client =
      await getSupabaseClient();

    const tempName =
      "New Offer";

    const slug =
      `${slugify(tempName)}-${Date.now()}`;

    const offerPayload = {
      client_id: state.client.id,
      name: tempName,
      slug,
      offer_type: "service",
      status: "draft"
    };

    const { data: offer, error } =
      await client
        .from("offers")
        .insert(offerPayload)
        .select()
        .single();

    if (error) throw error;

    const versionPayload = {
      offer_id: offer.id,
      version_number: 1,
      status: "draft",
      title: tempName,
      description: "",
      sales_talking_points: [],
      allowed_claims: [],
      restrictions: [],
      customer_eligibility: [],
      metadata: {}
    };

    const { data: version, error: versionError } =
      await client
        .from("offer_versions")
        .insert(versionPayload)
        .select()
        .single();

    if (versionError) {
      await client
        .from("offers")
        .delete()
        .eq("id", offer.id);

      throw versionError;
    }

    await client
      .from("offers")
      .update({
        current_version_id:
          version.id
      })
      .eq("id", offer.id)
      .eq(
        "client_id",
        state.client.id
      );

    state.currentOffer =
      offer;

    state.currentVersion =
      version;

    state.currentBinding =
      null;

    state.sourceVersion =
      null;

    state.editing = true;

    resetForm();

    setValue(
      "offerName",
      tempName
    );

    await ensureOfferBinding(
      offer.id,
      version.id
    );

    showEditor();

    await loadOffers();

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

    const { data: offer, error } =
      await client
        .from("offers")
        .select("*")
        .eq(
          "id",
          offerId
        )
        .eq(
          "client_id",
          state.client.id
        )
        .single();

    if (error) throw error;

    const { data: versions, error: versionError } =
      await client
        .from("offer_versions")
        .select("*")
        .eq(
          "offer_id",
          offer.id
        )
        .order(
          "version_number",
          { ascending: false }
        );

    if (versionError)
      throw versionError;

    let version =
      versions.find(
        (v) =>
          String(v.id) ===
          String(
            offer.current_version_id
          )
      ) ||
      versions.find(
        (v) =>
          v.status === "draft"
      ) ||
      versions.find(
        (v) =>
          v.status === "published"
      ) ||
      versions[0];

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

    state.editing = true;

    await loadOfferBinding(
      offer.id
    );

    await loadOfferAvailability(
      version.id
    );

    await loadOfferIntoForm();

    showEditor();

    state.currentStep = 1;

    updateStepUI();

    updateVersionActions();
  }

  /* =========================================================
     OFFER BINDING
     ========================================================= */

  async function loadOfferBinding(
    offerId
  ) {
    const rows =
      await selectRows(
        "offer_catalog_bindings",
        "*",
        {
          offer_id: offerId,
          client_id: state.client.id
        }
      );

    state.currentBinding =
      rows[0] || null;
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

    if (state.currentBinding) {
      return state.currentBinding;
    }

    const industryId =
      getValue("industrySelect");

    let entityTypeId = null;

    if (industryId) {
      const entities =
        await selectRows(
          "entity_types",
          "*",
          {}
        );

      const serviceEntity =
        entities.find(
          (x) =>
            ["service", "product", "offer"]
              .includes(
                safeText(
                  x.slug ||
                    x.name
                ).toLowerCase()
              )
        );

      entityTypeId =
        serviceEntity?.id ||
        null;
    }

    const payload = {
      offer_id: offerId,
      client_id: state.client.id,
      entity_type_id: entityTypeId,
      template_configuration_id:
        null,
      status: "draft",
      custom_data: {},
      metadata: {
        source: "services-ui",
        version_id: versionId
      }
    };

    const { data, error } =
      await client
        .from("offer_catalog_bindings")
        .insert(payload)
        .select()
        .single();

    if (error) {
      /*
        Binding is an architecture enhancement.
        Existing offer editing should not break if a
        legacy database temporarily lacks the binding.
      */
      console.warn(
        "[GLIME] Binding creation failed:",
        error
      );

      return null;
    }

    state.currentBinding =
      data;

    return data;
  }

  /* =========================================================
     FORM LOAD
     ========================================================= */

  async function loadOfferIntoForm() {
    const offer =
      state.currentOffer;

    const version =
      state.currentVersion;

    if (!offer || !version)
      return;

    const metadata =
      getMetadata(version);

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
      metadata.short_description ||
        offer.short_description ||
        ""
    );

    setValue(
      "offerDescription",
      version.description ||
        offer.description ||
        ""
    );

    const categoryId =
      offer.category_id ||
      metadata.category_id ||
      "";

    setValue(
      "offerCategory",
      categoryId
    );

    setValue(
      "detailDuration",
      metadata.duration ||
        ""
    );

    setValue(
      "eligibility",
      metadata.eligibility ||
        textFromArray(
          version.customer_eligibility
        )
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

    await loadOfferPricing(
      version.id
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

    const { data: prices, error } =
      await client
        .from("offer_prices")
        .select("*")
        .eq(
          "offer_version_id",
          versionId
        )
        .eq(
          "active",
          true
        )
        .order(
          "created_at",
          { ascending: true }
        );

    if (error) {
      console.warn(
        "[GLIME] Pricing load:",
        error
      );
    }

    const price =
      prices?.[0];

    if (price) {
      setValue(
        "priceAmount",
        price.amount ?? ""
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
    }

    renderRangeState();
  }

  async function savePricing(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    const priceType =
      getValue("priceType") ||
      "fixed";

    const amount =
      getValue("priceAmount");

    const currency =
      getValue("priceCurrency") ||
      "INR";

    const billingPeriod =
      getValue("billingPeriod");

    const minAmount =
      getValue("minAmount");

    const maxAmount =
      getValue("maxAmount");

    /*
      Don't create empty pricing records.
    */

    if (
      !amount &&
      !minAmount &&
      !maxAmount
    ) {
      return;
    }

    /*
      Update the existing active base price if
      available. Otherwise insert one.
    */

    const { data: existing, error } =
      await client
        .from("offer_prices")
        .select("*")
        .eq(
          "offer_version_id",
          versionId
        )
        .eq(
          "active",
          true
        )
        .is(
          "variant_id",
          null
        )
        .order(
          "created_at",
          { ascending: true }
        )
        .limit(1);

    if (error) throw error;

    const payload = {
      offer_version_id:
        versionId,
      variant_id: null,
      amount:
        amount
          ? Number(amount)
          : null,
      currency,
      price_type:
        priceType,
      min_amount:
        minAmount
          ? Number(minAmount)
          : null,
      max_amount:
        maxAmount
          ? Number(maxAmount)
          : null,
      billing_period:
        billingPeriod ||
        null,
      active: true
    };

    if (existing?.[0]) {
      await client
        .from("offer_prices")
        .update(payload)
        .eq(
          "id",
          existing[0].id
        );
    } else {
      await client
        .from("offer_prices")
        .insert(payload);
    }
  }

  function renderRangeState() {
    const type =
      getValue("priceType");

    const row =
      $("rangeRow");

    if (!row) return;

    const range =
      [
        "range",
        "starting_from",
        "from_to"
      ].includes(
        type
      );

    row.hidden = !range;
  }

  /* =========================================================
     AVAILABILITY
     ========================================================= */

  async function loadOfferAvailability(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    const { data, error } =
      await client
        .from("offer_availability")
        .select("*")
        .eq(
          "offer_version_id",
          versionId
        )
        .order(
          "day_of_week",
          { ascending: true }
        );

    if (error) {
      console.warn(
        "[GLIME] Availability load:",
        error
      );

      state.availability = [];
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

    if (!state.availability.length) {
      list.innerHTML =
        `<div class="availability-empty">
          No availability rules added.
        </div>`;
      return;
    }

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
                ${[
                  [0, "Sunday"],
                  [1, "Monday"],
                  [2, "Tuesday"],
                  [3, "Wednesday"],
                  [4, "Thursday"],
                  [5, "Friday"],
                  [6, "Saturday"]
                ]
                  .map(
                    ([value, label]) =>
                      `<option
                        value="${value}"
                        ${
                          String(
                            item.day_of_week
                          ) ===
                          String(value)
                            ? "selected"
                            : ""
                        }
                      >
                        ${label}
                      </option>`
                  )
                  .join("")}
              </select>

              <input
                type="time"
                class="availability-start"
                value="${escapeHtml(
                  item.start_time || ""
                )}"
              />

              <input
                type="time"
                class="availability-end"
                value="${escapeHtml(
                  item.end_time || ""
                )}"
              />

              <input
                type="number"
                min="0"
                class="availability-capacity"
                placeholder="Capacity"
                value="${escapeHtml(
                  item.capacity ?? ""
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
    ).forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const index =
            Number(
              button.dataset.index
            );

          const row =
            state.availability[index];

          if (row?.id) {
            const client =
              await getSupabaseClient();

            await client
              .from(
                "offer_availability"
              )
              .delete()
              .eq(
                "id",
                row.id
              );
          }

          state.availability.splice(
            index,
            1
          );

          renderAvailability();
        }
      );
    });
  }

  function addAvailabilityRow() {
    state.availability.push({
      day_of_week: 1,
      start_time: "09:00",
      end_time: "17:00",
      capacity: null,
      timezone:
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone ||
        "Asia/Kolkata",
      is_available: true,
      notes: null
    });

    renderAvailability();
  }

  async function saveAvailability(
    versionId
  ) {
    const client =
      await getSupabaseClient();

    const rows =
      qsa(
        ".availability-row",
        $("availabilityList")
      );

    for (let i = 0; i < rows.length; i++) {
      const row =
        rows[i];

      const existing =
        state.availability[i] ||
        {};

      const payload = {
        offer_version_id:
          versionId,
        day_of_week:
          Number(
            qs(
              ".availability-day",
              row
            )?.value || 0
          ),
        start_time:
          qs(
            ".availability-start",
            row
          )?.value ||
          null,
        end_time:
          qs(
            ".availability-end",
            row
          )?.value ||
          null,
        capacity:
          qs(
            ".availability-capacity",
            row
          )?.value
            ? Number(
                qs(
                  ".availability-capacity",
                  row
                ).value
              )
            : null,
        timezone:
          existing.timezone ||
          Intl.DateTimeFormat()
            .resolvedOptions()
            .timeZone ||
          "Asia/Kolkata",
        is_available:
          existing.is_available !==
          false,
        notes:
          existing.notes ||
          null
      };

      if (existing.id) {
        await client
          .from(
            "offer_availability"
          )
          .update(payload)
          .eq(
            "id",
            existing.id
          );
      } else {
        await client
          .from(
            "offer_availability"
          )
          .insert(payload);
      }
    }
  }

  /* =========================================================
     SAVE VERSION DATA
     ========================================================= */

  function collectVersionMetadata() {
    return {
      short_description:
        getValue(
          "shortDescription"
        ),

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
        getValue("faqs"),

      policies:
        getValue("policies"),

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

  async function saveCurrentDraft() {
    if (!state.currentOffer ||
        !state.currentVersion) {
      throw new Error(
        "No offer is open."
      );
    }

    const version =
      state.currentVersion;

    if (
      version.status !== "draft"
    ) {
      await createDraftFromCurrent();

      return saveCurrentDraft();
    }

    const client =
      await getSupabaseClient();

    const metadata =
      collectVersionMetadata();

    const arrays =
      collectVersionArrays();

    const title =
      getValue("offerName") ||
      "Untitled Offer";

    const description =
      getValue(
        "offerDescription"
      );

    const offerType =
      getValue("offerType") ||
      "service";

    const categoryId =
      getValue(
        "offerCategory"
      );

    const offerPayload = {
      name: title,
      slug:
        slugify(title) +
        `-${String(
          state.currentOffer.id
        ).slice(0, 8)}`,
      offer_type:
        offerType,
      description,
      category_id:
        categoryId ||
        null,
      status: "draft",
      updated_at:
        new Date().toISOString()
    };

    const versionPayload = {
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
      metadata
    };

    const { data: updatedOffer, error: offerError } =
      await client
        .from("offers")
        .update(offerPayload)
        .eq(
          "id",
          state.currentOffer.id
        )
        .eq(
          "client_id",
          state.client.id
        )
        .select()
        .single();

    if (offerError)
      throw offerError;

    const { data: updatedVersion, error: versionError } =
      await client
        .from("offer_versions")
        .update(versionPayload)
        .eq(
          "id",
          version.id
        )
        .eq(
          "offer_id",
          state.currentOffer.id
        )
        .select()
        .single();

    if (versionError)
      throw versionError;

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

    notify(
      "Draft saved.",
      "success"
    );
  }

  /* =========================================================
     CREATE DRAFT FROM PUBLISHED / APPROVED VERSION
     ========================================================= */

  async function createDraftFromCurrent() {
    const client =
      await getSupabaseClient();

    const source =
      state.currentVersion;

    if (!source) {
      throw new Error(
        "No source version found."
      );
    }

    const nextNumber =
      Number(
        source.version_number || 1
      ) + 1;

    const metadata =
      getMetadata(source);

    const arrays =
      {
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
          []
      };

    const payload = {
      offer_id:
        state.currentOffer.id,
      version_number:
        nextNumber,
      status: "draft",
      title:
        source.title ||
        state.currentOffer.name,
      description:
        source.description ||
        "",
      sales_talking_points:
        arrays.sales_talking_points,
      allowed_claims:
        arrays.allowed_claims,
      restrictions:
        arrays.restrictions,
      customer_eligibility:
        arrays.customer_eligibility,
      metadata
    };

    const { data: draft, error } =
      await client
        .from("offer_versions")
        .insert(payload)
        .select()
        .single();

    if (error) throw error;

    /*
      Clone prices from source version.
    */

    const { data: prices } =
      await client
        .from("offer_prices")
        .select("*")
        .eq(
          "offer_version_id",
          source.id
        );

    if (prices?.length) {
      await client
        .from("offer_prices")
        .insert(
          prices.map(
            (price) => ({
              offer_version_id:
                draft.id,
              variant_id:
                null,
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
              active:
                price.active
            })
          )
        );
    }

    /*
      Clone availability.
    */

    const { data: availability } =
      await client
        .from(
          "offer_availability"
        )
        .select("*")
        .eq(
          "offer_version_id",
          source.id
        );

    if (availability?.length) {
      await client
        .from(
          "offer_availability"
        )
        .insert(
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
                item.is_available,
              notes:
                item.notes
            })
          )
        );
    }

    /*
      Current version becomes the draft being edited.
      We intentionally do not publish anything here.
    */

    await client
      .from("offers")
      .update({
        current_version_id:
          draft.id,
        status: "draft",
        updated_at:
          new Date().toISOString()
      })
      .eq(
        "id",
        state.currentOffer.id
      )
      .eq(
        "client_id",
        state.client.id
      );

    state.sourceVersion =
      source;

    state.currentVersion =
      draft;

    state.currentOffer.current_version_id =
      draft.id;

    state.currentOffer.status =
      "draft";

    await loadOfferAvailability(
      draft.id
    );

    await loadOfferBinding(
      state.currentOffer.id
    );

    await loadOfferIntoForm();

    updateVersionActions();

    notify(
      `Draft v${nextNumber} created from the current version.`,
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

      if (!binding)
        return;

      const client =
        await getSupabaseClient();

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
        ...(getMetadata(
          binding
        ) || {}),
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

      const { data, error } =
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
            state.client.id
          )
          .select()
          .single();

      if (error) throw error;

      state.currentBinding =
        data;
    } catch (error) {
      /*
        Don't break legacy offer editing if the
        architecture binding isn't available.
      */
      console.warn(
        "[GLIME] Binding save warning:",
        error
      );
    }
  }

  /* =========================================================
     REVIEW / APPROVAL / PUBLISH
     ========================================================= */

  async function submitForReview() {
    await saveCurrentDraft();

    const versionId =
      state.currentVersion.id;

    const client =
      await getSupabaseClient();

    /*
      Existing server-side function is the source
      of truth for review lifecycle.
    */

    const { data, error } =
      await client.rpc(
        "client_submit_offer_version_for_review",
        {
          p_version_id:
            versionId
        }
      );

    if (error)
      throw error;

    /*
      Refresh current version.
    */

    const { data: version, error: versionError } =
      await client
        .from("offer_versions")
        .select("*")
        .eq(
          "id",
          versionId
        )
        .single();

    if (versionError)
      throw versionError;

    state.currentVersion =
      version;

    updateVersionActions();

    notify(
      "Offer submitted for review.",
      "success"
    );
  }

  async function approveOffer() {
    const version =
      state.currentVersion;

    if (!version) return;

    const client =
      await getSupabaseClient();

    const notes =
      window.prompt(
        "Approval note (optional):"
      ) || null;

    const { data, error } =
      await client.rpc(
        "client_approve_offer_version",
        {
          p_version_id:
            version.id,
          p_notes:
            notes
        }
      );

    if (error)
      throw error;

    const { data: updated } =
      await client
        .from("offer_versions")
        .select("*")
        .eq(
          "id",
          version.id
        )
        .single();

    state.currentVersion =
      updated || version;

    updateVersionActions();

    notify(
      "Offer version approved.",
      "success"
    );
  }

  async function publishOffer() {
    const version =
      state.currentVersion;

    if (!version) return;

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

    const { error } =
      await client.rpc(
        "client_publish_offer_version",
        {
          p_version_id:
            version.id
        }
      );

    if (error)
      throw error;

    const { data: updated } =
      await client
        .from("offer_versions")
        .select("*")
        .eq(
          "id",
          version.id
        )
        .single();

    state.currentVersion =
      updated || version;

    if (state.currentOffer) {
      state.currentOffer.status =
        "published";

      state.currentOffer.current_version_id =
        state.currentVersion.id;
    }

    updateVersionActions();

    renderShareIdentity();

    await loadOffers();

    notify(
      "Offer published successfully.",
      "success"
    );

    /*
      Notify the AI context addon if installed.
    */

    if (
      window.GLIMEServicesAIContext &&
      typeof window.GLIMEServicesAIContext.refresh ===
        "function"
    ) {
      try {
        await window.GLIMEServicesAIContext.refresh();
      } catch (error) {
        console.warn(
          "[GLIME] AI context refresh:",
          error
        );
      }
    }
  }

  /* =========================================================
     AI CHECK
     ========================================================= */

  async function runAICheck() {
    if (!state.currentVersion) {
      throw new Error(
        "Open an offer first."
      );
    }

    const resultEl =
      $("aiCheck");

    if (resultEl) {
      resultEl.textContent =
        "Running AI completeness check...";
      resultEl.dataset.state =
        "loading";
    }

    /*
      This is deliberately a local structural check.
      The AI context resolver remains responsible for
      runtime AI context.

      Later this can call a dedicated AI quality function
      without changing the services core UI.
    */

    const missing = [];

    if (
      !getValue("offerName")
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
      !getValue(
        "priceAmount"
      ) &&
      !getValue(
        "minAmount"
      ) &&
      !getValue(
        "maxAmount"
      )
    ) {
      missing.push(
        "Pricing"
      );
    }

    if (
      !getValue("policies")
    ) {
      missing.push(
        "Policies"
      );
    }

    if (
      !getValue("faqs")
    ) {
      missing.push(
        "FAQs"
      );
    }

    const score =
      Math.max(
        0,
        100 -
          missing.length * 15
      );

    const check = {
      score,
      status:
        missing.length === 0
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

    await client
      .from("offer_versions")
      .update({
        metadata
      })
      .eq(
        "id",
        state.currentVersion.id
      );

    renderAICheck(check);

    if (
      missing.length === 0
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

  function renderAICheck(check) {
    const el =
      $("aiCheck");

    if (!el) return;

    if (!check) {
      el.textContent =
        "AI check has not been run yet.";
      return;
    }

    const missing =
      Array.isArray(
        check.missing
      )
        ? check.missing
        : [];

    if (!missing.length) {
      el.innerHTML = `
        <strong>Ready</strong>
        <div>All core offer information is present.</div>
        <div>Score: ${escapeHtml(
          check.score ?? 100
        )}/100</div>
      `;
      el.dataset.state =
        "ready";
      return;
    }

    el.innerHTML = `
      <strong>Needs attention</strong>
      <div>Score: ${escapeHtml(
        check.score ?? ""
      )}/100</div>
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

    if (!offer) return "";

    const metadata =
      getMetadata(
        version || {}
      );

    const existingUrl =
      metadata.share_url ||
      metadata.public_url ||
      metadata.share?.url;

    if (existingUrl) {
      return existingUrl;
    }

    /*
      Stable internal/public recognition identity.
      This is safer than inventing a public route that
      may not exist yet.
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
        "No offer identity available."
      );
    }

    await navigator.clipboard.writeText(
      identity
    );

    notify(
      "Offer share identity copied.",
      "success"
    );
  }

  /* =========================================================
     FORM RESET / EDITOR
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
    ].forEach((id) =>
      setValue(id, "")
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

    state.availability =
      [];

    renderAvailability();
    renderAICheck(null);
    renderShareIdentity();
  }

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

    state.editing =
      false;

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

    if (!steps.length)
      return;

    steps.forEach(
      (step) => {
        const number =
          Number(
            step.dataset.step
          );

        step.hidden =
          number !==
          state.currentStep;

        step.classList.toggle(
          "active",
          number ===
            state.currentStep
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
      state.currentStep <= 1
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

    setText(
      "editorStatus",
      safeText(
        version.status ||
          "draft"
      ).toUpperCase()
    );

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
      Published / review / approved versions are
      read-only. User must create a new draft to edit.
    */

    const form =
      $("offerForm");

    if (form) {
      const lock =
        !isDraft &&
        !state.sourceVersion;

      qsa(
        "input, textarea, select",
        form
      ).forEach((element) => {
        /*
          Keep navigation / action buttons enabled.
        */
        if (
          [
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
          ].includes(
            element.id
          )
        ) {
          return;
        }

        element.disabled =
          lock;
      });
    }

    /*
      Explicit status message.
    */

    if (isPublished) {
      setText(
        "editorStatus",
        "PUBLISHED — create a new draft to edit"
      );
    } else if (isApproved) {
      setText(
        "editorStatus",
        "APPROVED — ready to publish"
      );
    } else if (isReview) {
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
     EVENTS
     ========================================================= */

  function bindEvents() {
    $("saveSetupBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await saveSetup();
          } catch (error) {
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
              event.target.value
            );

            updateSetupState();
          } catch (error) {
            handleError(error);
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
          } catch (error) {
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
          } catch (error) {
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
          } catch (error) {
            handleError(error);
          }
        }
      );

    $("addCategoryBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await createCategory();
          } catch (error) {
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
          } catch (error) {
            handleError(error);
          }
        }
      );

    $("runCheckBtn")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await runAICheck();
          } catch (error) {
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
          } catch (error) {
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
          } catch (error) {
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
          } catch (error) {
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
          } catch (error) {
            handleError(
              error,
              "Unable to publish offer."
            );
          }
        }
      );
  }

  /* =========================================================
     REFRESH
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

    if (
      window.GLIMEServicesAIContext &&
      typeof window.GLIMEServicesAIContext.refresh ===
        "function"
    ) {
      try {
        await window.GLIMEServicesAIContext.refresh();
      } catch (error) {
        console.warn(
          "[GLIME] AI context addon refresh failed:",
          error
        );
      }
    }

    notify(
      "Catalog refreshed.",
      "success"
    );
  }

  /* =========================================================
     ESCAPE HTML
     ========================================================= */

  function escapeHtml(value) {
    return safeText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll(
        "'",
        "&#039;"
      );
  }

  /* =========================================================
     INITIALIZATION
     ========================================================= */

  async function init() {
    try {
      if (!$("offerForm")) {
        console.warn(
          "[GLIME Services] services.html not detected."
        );
        return;
      }

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

      const client =
        await loadClient();

      if (!client) return;

      await loadIndustries();

      await loadClientSetup();

      await loadCategories();

      await loadOffers();

      await loadTemplates();

      renderRangeState();

      updateSetupState();

      console.log(
        "[GLIME Services] initialized successfully."
      );
    } catch (error) {
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

  /*
    Start after DOM is ready.
  */

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
