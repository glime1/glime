/* =========================================================
   GLIME — Services & Offer Management
   Layer 1G
   Lifecycle:
   Draft → Review → Approved → Published

   Business Truth:
   Service / Product / Package / Plan / Property / Menu Item
   ========================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------
     1. SUPABASE
  --------------------------------------------------------- */

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_ANON_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!window.supabase) {
    console.error("GLIME: Supabase library not loaded.");
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  /* ---------------------------------------------------------
     2. GLOBAL STATE
  --------------------------------------------------------- */

  const state = {
    user: null,
    client: null,

    industries: [],
    businessModels: [],
    templates: [],
    categories: [],
    offers: [],

    selectedOffer: null,
    selectedVersion: null,

    currentDraftVersion: null,

    currentIndustryConfig: null,
    currentTemplateConfig: null,

    currentStep: 1,

    saving: false,
    loading: false
  };

  /* ---------------------------------------------------------
     3. DOM HELPERS
  --------------------------------------------------------- */

  const $ = (selector) => document.querySelector(selector);

  const $$ = (selector) =>
    Array.from(document.querySelectorAll(selector));

  function byId(id) {
    return document.getElementById(id);
  }

  function safeText(value) {
    return value == null ? "" : String(value);
  }

  function jsonOrEmpty(value) {
    if (!value) return {};
    if (typeof value === "object") return value;

    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  function setValue(id, value) {
    const el = byId(id);
    if (!el) return;

    if (el.type === "checkbox") {
      el.checked = Boolean(value);
    } else {
      el.value = value ?? "";
    }
  }

  function getValue(id) {
    const el = byId(id);
    if (!el) return "";

    if (el.type === "checkbox") {
      return el.checked;
    }

    return el.value;
  }

  function showMessage(message, type = "info") {
    console.log(`[GLIME ${type}]`, message);

    const existing = byId("glimeToast");

    if (existing) {
      existing.textContent = message;
      existing.dataset.type = type;
      existing.classList.add("show");

      setTimeout(() => {
        existing.classList.remove("show");
      }, 4000);

      return;
    }

    const toast = document.createElement("div");

    toast.id = "glimeToast";
    toast.dataset.type = type;
    toast.textContent = message;

    toast.style.position = "fixed";
    toast.style.right = "20px";
    toast.style.bottom = "20px";
    toast.style.zIndex = "99999";
    toast.style.padding = "14px 18px";
    toast.style.borderRadius = "10px";
    toast.style.background = "#111";
    toast.style.color = "#fff";
    toast.style.fontSize = "14px";
    toast.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  function setLoading(isLoading) {
    state.loading = isLoading;

    document.body.classList.toggle(
      "glime-loading",
      isLoading
    );
  }

  function setSaving(isSaving) {
    state.saving = isSaving;

    const buttons = [
      "saveDraftBtn",
      "submitReviewBtn",
      "approveBtn",
      "publishBtn",
      "aiCheckBtn"
    ];

    buttons.forEach((id) => {
      const el = byId(id);
      if (el) {
        el.disabled = isSaving;
      }
    });
  }

  function normalizeStatus(status) {
    return String(status || "").toLowerCase();
  }

  /* ---------------------------------------------------------
     4. AUTHENTICATION
  --------------------------------------------------------- */

  async function getCurrentUser() {
    const {
      data,
      error
    } = await db.auth.getUser();

    if (error) {
      throw error;
    }

    if (!data?.user) {
      throw new Error(
        "GLIME login required. Please sign in first."
      );
    }

    state.user = data.user;

    return data.user;
  }

  /* ---------------------------------------------------------
     5. LOAD CLIENT
  --------------------------------------------------------- */

  async function loadClient() {
    if (!state.user) {
      await getCurrentUser();
    }

    const {
      data,
      error
    } = await db
      .from("client_data")
      .select("*")
      .eq("auth_user_id", state.user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        "GLIME client profile not found."
      );
    }

    state.client = data;

    return data;
  }

  /* ---------------------------------------------------------
     6. LOAD INDUSTRIES
  --------------------------------------------------------- */

  async function loadIndustries() {
    const {
      data,
      error
    } = await db
      .from("industries")
      .select("*")
      .eq("status", "active")
      .order("name");

    if (error) {
      throw error;
    }

    state.industries = data || [];

    const select = byId("industrySelect");

    if (!select) return;

    select.innerHTML =
      `<option value="">Select industry</option>`;

    state.industries.forEach((industry) => {
      const option =
        document.createElement("option");

      option.value = industry.id;
      option.textContent = industry.name;

      select.appendChild(option);
    });
  }

  /* ---------------------------------------------------------
     7. LOAD BUSINESS MODELS
  --------------------------------------------------------- */

  async function loadBusinessModels(industryId) {
    const select = byId("businessModelSelect");

    if (!select) return;

    select.innerHTML =
      `<option value="">Select business model</option>`;

    if (!industryId) {
      state.businessModels = [];
      return;
    }

    const {
      data,
      error
    } = await db
      .from("business_models")
      .select("*")
      .eq("industry_id", industryId)
      .eq("status", "active")
      .order("name");

    if (error) {
      throw error;
    }

    state.businessModels = data || [];

    state.businessModels.forEach((model) => {
      const option =
        document.createElement("option");

      option.value = model.id;
      option.textContent = model.name;

      select.appendChild(option);
    });
  }

  /* ---------------------------------------------------------
     8. LOAD TEMPLATES
  --------------------------------------------------------- */

  async function loadTemplates(industryId) {
    if (!industryId) {
      state.templates = [];
      return [];
    }

    const {
      data,
      error
    } = await db
      .from("industry_templates")
      .select("*")
      .eq("industry_id", industryId)
      .eq("status", "active")
      .order("name");

    if (error) {
      throw error;
    }

    state.templates = data || [];

    return state.templates;
  }

  /* ---------------------------------------------------------
     9. SAVE INDUSTRY CONFIGURATION
  --------------------------------------------------------- */

  async function saveIndustryConfiguration() {
    if (!state.client) {
      throw new Error("Client profile not loaded.");
    }

    const industryId =
      getValue("industrySelect");

    if (!industryId) {
      throw new Error(
        "Please select an industry first."
      );
    }

    const businessModelId =
      getValue("businessModelSelect");

    const customBusinessModel =
      getValue("customBusinessModel");

    const {
      data: existing,
      error: existingError
    } = await db
      .from("client_industry_configurations")
      .select("*")
      .eq("client_id", state.client.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    let config;

    if (existing) {
      const {
        data,
        error
      } = await db
        .from("client_industry_configurations")
        .update({
          industry_id: industryId,
          custom_industry_name: null,
          custom_industry_description: null,
          selection_source: "system",
          status: "active",
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;

      config = data;
    } else {
      const {
        data,
        error
      } = await db
        .from("client_industry_configurations")
        .insert({
          client_id: state.client.id,
          industry_id: industryId,
          selection_source: "system",
          status: "active"
        })
        .select()
        .single();

      if (error) throw error;

      config = data;
    }

    state.currentIndustryConfig = config;

    /*
      Optional custom business model.
      This is tenant-owned and does not modify global models.
    */

    if (customBusinessModel.trim()) {
      const slug =
        slugify(customBusinessModel);

      const {
        data: customModel,
        error: customModelError
      } = await db
        .from("client_custom_business_models")
        .upsert(
          {
            client_id: state.client.id,
            industry_configuration_id: config.id,
            base_business_model_id:
              businessModelId || null,
            name: customBusinessModel.trim(),
            slug,
            description: null,
            status: "active",
            is_custom: true
          },
          {
            onConflict: "client_id,slug"
          }
        )
        .select()
        .single();

      if (customModelError) {
        throw customModelError;
      }

      state.currentCustomBusinessModel =
        customModel;
    }

    /*
      Resolve effective configuration.
      If the RPC is not accessible to this frontend user,
      the core configuration remains saved.
    */

    try {
      await db.rpc(
        "resolve_client_effective_configuration",
        {
          p_client_id: state.client.id
        }
      );
    } catch (rpcError) {
      console.warn(
        "GLIME effective configuration resolution skipped:",
        rpcError
      );
    }

    showMessage(
      "Business configuration saved.",
      "success"
    );

    await loadClientTemplateConfiguration();

    return config;
  }

  /* ---------------------------------------------------------
     10. TEMPLATE CONFIGURATION
  --------------------------------------------------------- */

  async function loadClientTemplateConfiguration() {
    if (!state.client) return;

    const {
      data,
      error
    } = await db
      .from("client_template_configurations")
      .select("*")
      .eq("client_id", state.client.id)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      state.currentTemplateConfig = data;
      return data;
    }

    const industryId =
      getValue("industrySelect");

    if (!industryId) return null;

    const templates =
      await loadTemplates(industryId);

    const template =
      templates.find(
        (item) => item.status === "active"
      );

    if (!template) {
      console.warn(
        "No active template found for industry."
      );

      return null;
    }

    const businessModelId =
      getValue("businessModelSelect");

    const {
      data: created,
      error: createError
    } = await db
      .from("client_template_configurations")
      .insert({
        client_id: state.client.id,
        industry_configuration_id:
          state.currentIndustryConfig?.id || null,
        business_model_id:
          businessModelId || null,
        custom_business_model_id:
          state.currentCustomBusinessModel?.id ||
          null,
        template_id: template.id,
        template_name: null,
        status: "active",
        config: {},
        metadata: {}
      })
      .select()
      .single();

    if (createError) {
      /*
        Another tab/session may have created it.
        Try reading again before failing.
      */

      const {
        data: retryData,
        error: retryError
      } = await db
        .from("client_template_configurations")
        .select("*")
        .eq("client_id", state.client.id)
        .eq("status", "active")
        .maybeSingle();

      if (retryError) {
        throw createError;
      }

      state.currentTemplateConfig =
        retryData;

      return retryData;
    }

    state.currentTemplateConfig = created;

    return created;
  }

  /* ---------------------------------------------------------
     11. LOAD CATEGORIES
  --------------------------------------------------------- */

  async function loadCategories() {
    if (!state.client) return;

    const {
      data,
      error
    } = await db
      .from("offer_categories")
      .select("*")
      .eq("client_id", state.client.client_id)
      .order("name");

    if (error) {
      throw error;
    }

    state.categories = data || [];

    const select =
      byId("offerCategory");

    if (!select) return;

    select.innerHTML =
      `<option value="">Select category</option>`;

    state.categories.forEach((category) => {
      const option =
        document.createElement("option");

      option.value = category.id;
      option.textContent = category.name;

      select.appendChild(option);
    });
  }

  /* ---------------------------------------------------------
     12. LOAD OFFERS
  --------------------------------------------------------- */

  async function loadOffers() {
    if (!state.client) return;

    const {
      data,
      error
    } = await db
      .from("offers")
      .select("*")
      .eq("client_id", state.client.client_id)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    state.offers = data || [];

    renderOfferList();

    return state.offers;
  }

  /* ---------------------------------------------------------
     13. RENDER OFFER LIST
  --------------------------------------------------------- */

  function renderOfferList() {
    const container =
      byId("offerList");

    if (!container) return;

    container.innerHTML = "";

    if (!state.offers.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No services or products yet.</p>
          <button
            type="button"
            id="createFirstOfferBtn"
            class="primary-btn"
          >
            Create first offer
          </button>
        </div>
      `;

      const button =
        byId("createFirstOfferBtn");

      if (button) {
        button.addEventListener(
          "click",
          () => createNewOffer()
        );
      }

      return;
    }

    state.offers.forEach((offer) => {
      const item =
        document.createElement("button");

      item.type = "button";
      item.className =
        "offer-list-item";

      if (
        state.selectedOffer &&
        state.selectedOffer.id === offer.id
      ) {
        item.classList.add("active");
      }

      item.innerHTML = `
        <strong>
          ${escapeHtml(
            offer.name || "Untitled Offer"
          )}
        </strong>

        <span>
          ${escapeHtml(
            offer.offer_type || "service"
          )}
        </span>

        <small>
          ${escapeHtml(
            offer.status || "draft"
          )}
        </small>
      `;

      item.addEventListener(
        "click",
        () => selectOffer(offer.id)
      );

      container.appendChild(item);
    });
  }

  /* ---------------------------------------------------------
     14. ENSURE OFFER TYPE OPTION
  --------------------------------------------------------- */

  function ensureOfferTypeOption(type) {
    const select =
      byId("offerType");

    if (!select) return;

    const normalized =
      String(type || "service");

    const exists =
      Array.from(select.options)
        .some(
          (option) =>
            option.value === normalized
        );

    if (!exists) {
      const option =
        document.createElement("option");

      option.value = normalized;
      option.textContent =
        normalized
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) =>
            c.toUpperCase()
          );

      select.appendChild(option);
    }
  }

  /* ---------------------------------------------------------
     15. SELECT OFFER
  --------------------------------------------------------- */

  async function selectOffer(offerId) {
    const offer =
      state.offers.find(
        (item) => item.id === offerId
      );

    if (!offer) return;

    state.selectedOffer = offer;

    renderOfferList();

    await loadLatestVersion(offer.id);

    fillOfferForm();

    showEditor();

    setCurrentStep(1);
  }

  /* ---------------------------------------------------------
     16. LOAD LATEST VERSION
  --------------------------------------------------------- */

  async function loadLatestVersion(offerId) {
    const {
      data,
      error
    } = await db
      .from("offer_versions")
      .select("*")
      .eq("offer_id", offerId)
      .order("version_number", {
        ascending: false
      })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    state.selectedVersion = data || null;

    /*
      If latest is not draft, it remains immutable.
      We do NOT edit it directly.
    */

    if (
      state.selectedVersion &&
      normalizeStatus(
        state.selectedVersion.status
      ) !== "draft"
    ) {
      state.currentDraftVersion = null;
    } else {
      state.currentDraftVersion =
        state.selectedVersion;
    }

    return state.selectedVersion;
  }

  /* ---------------------------------------------------------
     17. CREATE NEW OFFER
  --------------------------------------------------------- */

  async function createNewOffer() {
    if (!state.client) {
      throw new Error(
        "Client profile not loaded."
      );
    }

    const defaultName =
      "New Service";

    const slug =
      `${slugify(defaultName)}-${Date.now()}`;

    const {
      data: offer,
      error
    } = await db
      .from("offers")
      .insert({
        client_id: state.client.client_id,
        offer_type: "service",
        name: defaultName,
        slug,
        short_description: "",
        description: "",
        status: "draft",
        metadata: {}
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const {
      data: version,
      error: versionError
    } = await db
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
        customer_eligibility: {},
        metadata: {}
      })
      .select()
      .single();

    if (versionError) {
      throw versionError;
    }

    state.selectedOffer = offer;
    state.selectedVersion = version;
    state.currentDraftVersion = version;

    await loadOffers();

    fillOfferForm();

    showEditor();

    setCurrentStep(1);

    showMessage(
      "New draft created.",
      "success"
    );
  }

  /* ---------------------------------------------------------
     18. CREATE EDITABLE VERSION
  --------------------------------------------------------- */

  async function ensureEditableVersion() {
    if (!state.selectedOffer) {
      throw new Error(
        "Please select a service or product."
      );
    }

    if (
      state.currentDraftVersion &&
      normalizeStatus(
        state.currentDraftVersion.status
      ) === "draft"
    ) {
      return state.currentDraftVersion;
    }

    const source =
      state.selectedVersion;

    if (!source) {
      throw new Error(
        "Offer version not found."
      );
    }

    /*
      Published / review / approved versions
      are immutable.

      Create a new draft instead.
    */

    const {
      data: versions,
      error: versionsError
    } = await db
      .from("offer_versions")
      .select("version_number")
      .eq("offer_id", state.selectedOffer.id)
      .order("version_number", {
        ascending: false
      })
      .limit(1);

    if (versionsError) {
      throw versionsError;
    }

    const maxVersion =
      versions?.[0]?.version_number || 0;

    const {
      data: draft,
      error
    } = await db
      .from("offer_versions")
      .insert({
        offer_id:
          state.selectedOffer.id,

        version_number:
          Number(maxVersion) + 1,

        status: "draft",

        title:
          source.title ||
          state.selectedOffer.name,

        description:
          source.description || "",

        sales_talking_points:
          source.sales_talking_points || [],

        allowed_claims:
          source.allowed_claims || [],

        restrictions:
          source.restrictions || [],

        customer_eligibility:
          source.customer_eligibility || {},

        metadata:
          source.metadata || {}
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    state.currentDraftVersion =
      draft;

    state.selectedVersion =
      draft;

    showMessage(
      "A new editable draft version was created.",
      "info"
    );

    return draft;
  }

  /* ---------------------------------------------------------
     19. FILL FORM
  --------------------------------------------------------- */

  function fillOfferForm() {
    const offer =
      state.selectedOffer;

    const version =
      state.selectedVersion;

    if (!offer) return;

    ensureOfferTypeOption(
      offer.offer_type || "service"
    );

    setValue(
      "offerType",
      offer.offer_type || "service"
    );

    setValue(
      "offerName",
      version?.title ||
      offer.name ||
      ""
    );

    setValue(
      "offerSlug",
      offer.slug || ""
    );

    setValue(
      "offerCategory",
      offer.category_id || ""
    );

    setValue(
      "offerShortDescription",
      offer.short_description || ""
    );

    setValue(
      "offerDescription",
      version?.description ||
      offer.description ||
      ""
    );

    /*
      Metadata stores advanced 1G data
      without creating duplicate business-truth tables.
    */

    const metadata =
      jsonOrEmpty(version?.metadata);

    const details =
      jsonOrEmpty(metadata.details);

    const pricing =
      jsonOrEmpty(metadata.pricing);

    const availability =
      jsonOrEmpty(metadata.availability);

    const faq =
      jsonOrEmpty(metadata.faq);

    const policies =
      jsonOrEmpty(metadata.policies);

    const qualification =
      jsonOrEmpty(metadata.qualification);

    const aiContext =
      jsonOrEmpty(metadata.ai_context);

    const media =
      jsonOrEmpty(metadata.media);

    const links =
      jsonOrEmpty(metadata.links);

    const share =
      jsonOrEmpty(metadata.share);

    setValue(
      "offerDuration",
      details.duration || ""
    );

    setValue(
      "offerIncluded",
      details.included || ""
    );

    setValue(
      "offerExcluded",
      details.excluded || ""
    );

    setValue(
      "offerPrice",
      pricing.amount || ""
    );

    setValue(
      "offerCurrency",
      pricing.currency || "INR"
    );

    setValue(
      "offerPriceType",
      pricing.price_type || "fixed"
    );

    setValue(
      "offerAvailability",
      availability.notes || ""
    );

    setValue(
      "offerFaq",
      faq.content || ""
    );

    setValue(
      "offerPolicies",
      policies.content || ""
    );

    setValue(
      "offerQualification",
      qualification.questions || ""
    );

    setValue(
      "offerSalesTalkingPoints",
      arrayToText(
        version?.sales_talking_points
      )
    );

    setValue(
      "offerAllowedClaims",
      arrayToText(
        version?.allowed_claims
      )
    );

    setValue(
      "offerRestrictions",
      arrayToText(
        version?.restrictions
      )
    );

    setValue(
      "offerAiInstructions",
      aiContext.instructions || ""
    );

    setValue(
      "offerAiTone",
      aiContext.tone || ""
    );

    setValue(
      "offerAiLanguage",
      aiContext.language || ""
    );

    setValue(
      "offerWebsiteUrl",
      links.website || ""
    );

    setValue(
      "offerBookingUrl",
      links.booking || ""
    );

    setValue(
      "offerInstagramUrl",
      links.instagram || ""
    );

    setValue(
      "offerFacebookUrl",
      links.facebook || ""
    );

    setValue(
      "offerMediaUrls",
      arrayToText(
        media.urls
      )
    );

    setValue(
      "offerAliases",
      arrayToText(
        share.aliases
      )
    );

    setValue(
      "offerKeywords",
      arrayToText(
        share.keywords
      )
    );

    updateStatusUI();
  }

  /* ---------------------------------------------------------
     20. COLLECT FORM
  --------------------------------------------------------- */

  function collectFormData() {
    const metadata = {
      details: {
        duration:
          getValue("offerDuration"),

        included:
          getValue("offerIncluded"),

        excluded:
          getValue("offerExcluded")
      },

      pricing: {
        amount:
          getValue("offerPrice"),

        currency:
          getValue("offerCurrency") ||
          "INR",

        price_type:
          getValue("offerPriceType") ||
          "fixed"
      },

      availability: {
        notes:
          getValue("offerAvailability")
      },

      faq: {
        content:
          getValue("offerFaq")
      },

      policies: {
        content:
          getValue("offerPolicies")
      },

      qualification: {
        questions:
          getValue("offerQualification")
      },

      ai_context: {
        instructions:
          getValue("offerAiInstructions"),

        tone:
          getValue("offerAiTone"),

        language:
          getValue("offerAiLanguage")
      },

      media: {
        urls:
          textToArray(
            getValue("offerMediaUrls")
          )
      },

      links: {
        website:
          getValue("offerWebsiteUrl"),

        booking:
          getValue("offerBookingUrl"),

        instagram:
          getValue("offerInstagramUrl"),

        facebook:
          getValue("offerFacebookUrl")
      },

      share: {
        aliases:
          textToArray(
            getValue("offerAliases")
          ),

        keywords:
          textToArray(
            getValue("offerKeywords")
          )
      }
    };

    return {
      offer: {
        offer_type:
          getValue("offerType") ||
          "service",

        name:
          getValue("offerName").trim(),

        slug:
          slugify(
            getValue("offerSlug") ||
            getValue("offerName")
          ),

        short_description:
          getValue(
            "offerShortDescription"
          ),

        description:
          getValue(
            "offerDescription"
          ),

        category_id:
          getValue(
            "offerCategory"
          ) || null
      },

      version: {
        title:
          getValue("offerName").trim(),

        description:
          getValue(
            "offerDescription"
          ),

        sales_talking_points:
          textToArray(
            getValue(
              "offerSalesTalkingPoints"
            )
          ),

        allowed_claims:
          textToArray(
            getValue(
              "offerAllowedClaims"
            )
          ),

        restrictions:
          textToArray(
            getValue(
              "offerRestrictions"
            )
          ),

        customer_eligibility: {
          qualification:
            getValue(
              "offerQualification"
            )
        },

        metadata
      }
    };
  }

  /* ---------------------------------------------------------
     21. SAVE DRAFT
  --------------------------------------------------------- */

  async function saveDraft(showToast = true) {
    if (state.saving) return;

    setSaving(true);

    try {
      if (!state.client) {
        await loadClient();
      }

      const form =
        collectFormData();

      if (!form.offer.name) {
        throw new Error(
          "Service/Product name is required."
        );
      }

      /*
        IMPORTANT:
        If current version is Published,
        Approved or Review, create a new draft.
      */

      const draft =
        await ensureEditableVersion();

      /*
        Update offer master record.
      */

      const {
        data: updatedOffer,
        error: offerError
      } = await db
        .from("offers")
        .update({
          offer_type:
            form.offer.offer_type,

          name:
            form.offer.name,

          slug:
            form.offer.slug,

          short_description:
            form.offer.short_description,

          description:
            form.offer.description,

          category_id:
            form.offer.category_id,

          updated_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          state.selectedOffer.id
        )
        .eq(
          "client_id",
          state.client.client_id
        )
        .select()
        .single();

      if (offerError) {
        throw offerError;
      }

      /*
        Update draft version only.
      */

      const {
        data: updatedVersion,
        error: versionError
      } = await db
        .from("offer_versions")
        .update({
          title:
            form.version.title,

          description:
            form.version.description,

          sales_talking_points:
            form.version.sales_talking_points,

          allowed_claims:
            form.version.allowed_claims,

          restrictions:
            form.version.restrictions,

          customer_eligibility:
            form.version.customer_eligibility,

          metadata:
            form.version.metadata,

          updated_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          draft.id
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

      state.selectedOffer =
        updatedOffer;

      state.selectedVersion =
        updatedVersion;

      state.currentDraftVersion =
        updatedVersion;

      /*
        Save pricing in existing offer_prices table.
      */

      await savePricing(
        updatedVersion.id,
        form.version.metadata.pricing
      );

      /*
        Save availability in existing
        offer_availability table.
      */

      await saveAvailability(
        updatedVersion.id,
        form.version.metadata.availability
      );

      updateStatusUI();

      if (showToast) {
        showMessage(
          "Draft saved successfully.",
          "success"
        );
      }

      return updatedVersion;

    } catch (error) {
      console.error(
        "GLIME saveDraft error:",
        error
      );

      showMessage(
        error.message ||
        "Could not save draft.",
        "error"
      );

      throw error;

    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------
     22. SAVE PRICING
  --------------------------------------------------------- */

  async function savePricing(
    versionId,
    pricing
  ) {
    if (!pricing) return;

    /*
      Do not delete pricing from another version.
      Only operate on the current draft version.
    */

    const amount =
      Number(pricing.amount);

    if (!Number.isFinite(amount)) {
      return;
    }

    const {
      data: existing,
      error: existingError
    } = await db
      .from("offer_prices")
      .select("*")
      .eq(
        "offer_version_id",
        versionId
      )
      .eq("active", true)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      const {
        error
      } = await db
        .from("offer_prices")
        .update({
          amount,
          currency:
            pricing.currency || "INR",

          price_type:
            pricing.price_type || "fixed"
        })
        .eq(
          "id",
          existing.id
        );

      if (error) {
        throw error;
      }

    } else {
      const {
        error
      } = await db
        .from("offer_prices")
        .insert({
          offer_version_id:
            versionId,

          amount,

          currency:
            pricing.currency || "INR",

          price_type:
            pricing.price_type || "fixed",

          active: true
        });

      if (error) {
        throw error;
      }
    }
  }

  /* ---------------------------------------------------------
     23. SAVE AVAILABILITY
  --------------------------------------------------------- */

  async function saveAvailability(
    versionId,
    availability
  ) {
    if (!availability) return;

    const notes =
      availability.notes || "";

    if (!notes.trim()) {
      return;
    }

    const {
      data: existing,
      error: existingError
    } = await db
      .from("offer_availability")
      .select("*")
      .eq(
        "offer_version_id",
        versionId
      )
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      const {
        error
      } = await db
        .from("offer_availability")
        .update({
          notes
        })
        .eq(
          "id",
          existing.id
        );

      if (error) {
        throw error;
      }

    } else {
      const {
        error
      } = await db
        .from("offer_availability")
        .insert({
          offer_version_id:
            versionId,

          notes,

          is_available: true
        });

      if (error) {
        throw error;
      }
    }
  }

  /* ---------------------------------------------------------
     24. SUBMIT FOR REVIEW
  --------------------------------------------------------- */

  async function submitForReview() {
    if (state.saving) return;

    setSaving(true);

    try {
      const version =
        await saveDraft(false);

      if (!version) {
        throw new Error(
          "Draft version unavailable."
        );
      }

      const {
        data,
        error
      } = await db.rpc(
        "client_submit_offer_version_for_review",
        {
          p_version_id:
            version.id
        }
      );

      if (error) {
        throw error;
      }

      /*
        Refresh version state.
      */

      state.selectedVersion =
        await getVersionById(
          version.id
        );

      state.currentDraftVersion =
        null;

      updateStatusUI();

      showMessage(
        "Offer submitted for review.",
        "success"
      );

    } catch (error) {
      console.error(
        "GLIME review error:",
        error
      );

      showMessage(
        error.message ||
        "Could not submit for review.",
        "error"
      );

    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------
     25. APPROVE
  --------------------------------------------------------- */

  async function approveVersion() {
    if (!state.selectedVersion) {
      showMessage(
        "No offer version selected.",
        "error"
      );
      return;
    }

    setSaving(true);

    try {
      const {
        data,
        error
      } = await db.rpc(
        "client_approve_offer_version",
        {
          p_version_id:
            state.selectedVersion.id,

          p_notes:
            "Approved from GLIME Services UI."
        }
      );

      if (error) {
        throw error;
      }

      state.selectedVersion =
        await getVersionById(
          state.selectedVersion.id
        );

      state.currentDraftVersion =
        null;

      updateStatusUI();

      showMessage(
        "Offer version approved.",
        "success"
      );

    } catch (error) {
      console.error(
        "GLIME approval error:",
        error
      );

      showMessage(
        error.message ||
        "Could not approve offer.",
        "error"
      );

    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------
     26. PUBLISH
  --------------------------------------------------------- */

  async function publishVersion() {
    if (!state.selectedVersion) {
      showMessage(
        "No offer version selected.",
        "error"
      );
      return;
    }

    if (
      normalizeStatus(
        state.selectedVersion.status
      ) !== "approved"
    ) {
      showMessage(
        "Only an approved version can be published.",
        "error"
      );

      return;
    }

    setSaving(true);

    try {
      const {
        data,
        error
      } = await db.rpc(
        "client_publish_offer_version",
        {
          p_version_id:
            state.selectedVersion.id
        }
      );

      if (error) {
        throw error;
      }

      state.selectedVersion =
        await getVersionById(
          state.selectedVersion.id
        );

      state.currentDraftVersion =
        null;

      await loadOffers();

      updateStatusUI();

      showMessage(
        "Offer published successfully.",
        "success"
      );

    } catch (error) {
      console.error(
        "GLIME publish error:",
        error
      );

      showMessage(
        error.message ||
        "Could not publish offer.",
        "error"
      );

    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------
     27. AI CHECK
  --------------------------------------------------------- */

  async function runAICheck() {
    if (!state.selectedOffer) {
      showMessage(
        "Please select an offer first.",
        "error"
      );

      return;
    }

    try {
      const form =
        collectFormData();

      const issues = [];
      const suggestions = [];

      if (!form.offer.name) {
        issues.push(
          "Service/Product name is missing."
        );
      }

      if (!form.offer.description) {
        issues.push(
          "Description is missing."
        );
      }

      if (
        !form.version.metadata.details
          .duration
      ) {
        suggestions.push(
          "Consider adding service duration."
        );
      }

      if (
        !form.version.metadata.pricing
          .amount
      ) {
        suggestions.push(
          "Consider adding pricing information."
        );
      }

      if (
        !form.version.metadata.policies
          .content
      ) {
        suggestions.push(
          "Consider adding cancellation/refund policy."
        );
      }

      if (
        !form.version.metadata.faq
          .content
      ) {
        suggestions.push(
          "Consider adding common customer FAQs."
        );
      }

      if (
        !form.version.metadata
          .ai_context.instructions
      ) {
        suggestions.push(
          "Consider adding AI instructions."
        );
      }

      renderAICheckResult({
        issues,
        suggestions
      });

      showMessage(
        issues.length
          ? "AI Check found items to review."
          : "AI Check completed.",
        issues.length
          ? "info"
          : "success"
      );

    } catch (error) {
      console.error(
        "AI Check error:",
        error
      );

      showMessage(
        "AI Check failed.",
        "error"
      );
    }
  }

  /* ---------------------------------------------------------
     28. AI RESULT
  --------------------------------------------------------- */

  function renderAICheckResult(result) {
    const container =
      byId("aiCheckResult");

    if (!container) return;

    const issues =
      result.issues || [];

    const suggestions =
      result.suggestions || [];

    container.innerHTML = `
      <div class="ai-check-panel">
        <h4>AI Business Truth Check</h4>

        ${
          issues.length
            ? `
              <div class="ai-check-section">
                <strong>Needs attention</strong>
                <ul>
                  ${issues
                    .map(
                      (item) =>
                        `<li>${escapeHtml(
                          item
                        )}</li>`
                    )
                    .join("")}
                </ul>
              </div>
            `
            : `
              <div class="ai-check-success">
                No critical completeness issues detected.
              </div>
            `
        }

        ${
          suggestions.length
            ? `
              <div class="ai-check-section">
                <strong>Suggestions</strong>
                <ul>
                  ${suggestions
                    .map(
                      (item) =>
                        `<li>${escapeHtml(
                          item
                        )}</li>`
                    )
                    .join("")}
                </ul>
              </div>
            `
            : ""
        }

        <small>
          AI Check only recommends changes.
          It never publishes automatically.
        </small>
      </div>
    `;
  }

  /* ---------------------------------------------------------
     29. SHARE IDENTITY
  --------------------------------------------------------- */

  function updateShareIdentity() {
    const slug =
      getValue("offerSlug") ||
      getValue("offerName");

    const shareSlug =
      slugify(slug);

    const output =
      byId("shareIdentity");

    if (!output) return;

    output.textContent =
      shareSlug
        ? `GLIME Offer Identity: ${shareSlug}`
        : "Offer identity will appear here.";
  }

  /* ---------------------------------------------------------
     30. STATUS UI
  --------------------------------------------------------- */

  function updateStatusUI() {
    const status =
      normalizeStatus(
        state.selectedVersion?.status
      );

    const statusEl =
      byId("offerStatus");

    if (statusEl) {
      statusEl.textContent =
        status || "new";

      statusEl.dataset.status =
        status || "new";
    }

    const saveBtn =
      byId("saveDraftBtn");

    const reviewBtn =
      byId("submitReviewBtn");

    const approveBtn =
      byId("approveBtn");

    const publishBtn =
      byId("publishBtn");

    /*
      Draft:
      edit + save + submit

      Review:
      no editing

      Approved:
      no editing, publish

      Published:
      immutable; create new draft to edit
    */

    if (saveBtn) {
      saveBtn.disabled =
        status === "review" ||
        status === "approved";
    }

    if (reviewBtn) {
      reviewBtn.disabled =
        status !== "draft";
    }

    if (approveBtn) {
      approveBtn.disabled =
        status !== "review";
    }

    if (publishBtn) {
      publishBtn.disabled =
        status !== "approved";
    }

    const lockMessage =
      byId("offerLockMessage");

    if (lockMessage) {
      if (
        status === "published" ||
        status === "approved" ||
        status === "review"
      ) {
        lockMessage.textContent =
          "This version is protected. Saving changes will create a new draft version.";
      } else {
        lockMessage.textContent =
          "";
      }
    }
  }

  /* ---------------------------------------------------------
     31. STEPS
  --------------------------------------------------------- */

  function setCurrentStep(step) {
    state.currentStep =
      Number(step);

    $$(".service-step").forEach(
      (element) => {
        const stepNumber =
          Number(
            element.dataset.step
          );

        element.classList.toggle(
          "active",
          stepNumber ===
            state.currentStep
        );
      }
    );

    $$(".step-panel").forEach(
      (panel) => {
        const panelNumber =
          Number(
            panel.dataset.stepPanel
          );

        panel.hidden =
          panelNumber !==
          state.currentStep;
      }
    );

    updateStepButtons();
  }

  function updateStepButtons() {
    const back =
      byId("previousStepBtn");

    const next =
      byId("nextStepBtn");

    if (back) {
      back.disabled =
        state.currentStep <= 1;
    }

    if (next) {
      next.disabled =
        state.currentStep >= 7;
    }
  }

  function nextStep() {
    if (state.currentStep < 7) {
      setCurrentStep(
        state.currentStep + 1
      );
    }
  }

  function previousStep() {
    if (state.currentStep > 1) {
      setCurrentStep(
        state.currentStep - 1
      );
    }
  }

  /* ---------------------------------------------------------
     32. SHOW EDITOR
  --------------------------------------------------------- */

  function showEditor() {
    const editor =
      byId("offerEditor");

    if (editor) {
      editor.hidden = false;
    }

    const empty =
      byId("offerEditorEmpty");

    if (empty) {
      empty.hidden = true;
    }
  }

  /* ---------------------------------------------------------
     33. VERSION FETCH
  --------------------------------------------------------- */

  async function getVersionById(id) {
    const {
      data,
      error
    } = await db
      .from("offer_versions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /* ---------------------------------------------------------
     34. EVENT LISTENERS
  --------------------------------------------------------- */

  function bindEvents() {
    const industry =
      byId("industrySelect");

    if (industry) {
      industry.addEventListener(
        "change",
        async () => {
          try {
            await loadBusinessModels(
              industry.value
            );

            await loadTemplates(
              industry.value
            );
          } catch (error) {
            console.error(error);

            showMessage(
              error.message,
              "error"
            );
          }
        }
      );
    }

    const saveConfig =
      byId("saveConfigurationBtn");

    if (saveConfig) {
      saveConfig.addEventListener(
        "click",
        async () => {
          try {
            await saveIndustryConfiguration();
          } catch (error) {
            console.error(error);

            showMessage(
              error.message,
              "error"
            );
          }
        }
      );
    }

    const newOffer =
      byId("newOfferBtn");

    if (newOffer) {
      newOffer.addEventListener(
        "click",
        () => {
          createNewOffer()
            .catch((error) => {
              console.error(error);

              showMessage(
                error.message,
                "error"
              );
            });
        }
      );
    }

    const saveDraft =
      byId("saveDraftBtn");

    if (saveDraft) {
      saveDraft.addEventListener(
        "click",
        () => {
          saveDraft(true)
            .catch(() => {});
        }
      );
    }

    const submitReview =
      byId("submitReviewBtn");

    if (submitReview) {
      submitReview.addEventListener(
        "click",
        () => {
          submitForReview()
            .catch(() => {});
        }
      );
    }

    const approve =
      byId("approveBtn");

    if (approve) {
      approve.addEventListener(
        "click",
        () => {
          approveVersion()
            .catch(() => {});
        }
      );
    }

    const publish =
      byId("publishBtn");

    if (publish) {
      publish.addEventListener(
        "click",
        () => {
          publishVersion()
            .catch(() => {});
        }
      );
    }

    const aiCheck =
      byId("aiCheckBtn");

    if (aiCheck) {
      aiCheck.addEventListener(
        "click",
        () => {
          runAICheck()
            .catch(() => {});
        }
      );
    }

    const next =
      byId("nextStepBtn");

    if (next) {
      next.addEventListener(
        "click",
        nextStep
      );
    }

    const previous =
      byId("previousStepBtn");

    if (previous) {
      previous.addEventListener(
        "click",
        previousStep
      );
    }

    $$(".service-step").forEach(
      (step) => {
        step.addEventListener(
          "click",
          () => {
            const number =
              Number(
                step.dataset.step
              );

            if (
              Number.isFinite(number)
            ) {
              setCurrentStep(number);
            }
          }
        );
      }
    );

    [
      "offerName",
      "offerSlug"
    ].forEach((id) => {
      const el = byId(id);

      if (el) {
        el.addEventListener(
          "input",
          updateShareIdentity
        );
      }
    });
  }

  /* ---------------------------------------------------------
     35. LOAD EXISTING CONFIG
  --------------------------------------------------------- */

  async function loadExistingConfiguration() {
    if (!state.client) return;

    const {
      data,
      error
    } = await db
      .from(
        "client_industry_configurations"
      )
      .select("*")
      .eq(
        "client_id",
        state.client.id
      )
      .eq(
        "status",
        "active"
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) return;

    state.currentIndustryConfig =
      data;

    setValue(
      "industrySelect",
      data.industry_id
    );

    await loadBusinessModels(
      data.industry_id
    );

    await loadTemplates(
      data.industry_id
    );

    const {
      data: templateConfig,
      error: templateError
    } = await db
      .from(
        "client_template_configurations"
      )
      .select("*")
      .eq(
        "client_id",
        state.client.id
      )
      .eq(
        "status",
        "active"
      )
      .maybeSingle();

    if (templateError) {
      throw templateError;
    }

    state.currentTemplateConfig =
      templateConfig;

    if (templateConfig) {
      setValue(
        "businessModelSelect",
        templateConfig.business_model_id
      );
    }
  }

  /* ---------------------------------------------------------
     36. INITIALIZATION
  --------------------------------------------------------- */

  async function init() {
    if (state.loading) return;

    setLoading(true);

    try {
      bindEvents();

      await getCurrentUser();

      await loadClient();

      await loadIndustries();

      await loadExistingConfiguration();

      await loadCategories();

      await loadOffers();

      setCurrentStep(1);

      updateShareIdentity();

      console.log(
        "GLIME Services initialized."
      );

    } catch (error) {
      console.error(
        "GLIME Services initialization failed:",
        error
      );

      showMessage(
        error.message ||
        "GLIME Services could not initialize.",
        "error"
      );

    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------------------------------------
     37. UTILITY FUNCTIONS
  --------------------------------------------------------- */

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);
  }

  function textToArray(value) {
    if (!value) return [];

    return String(value)
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function arrayToText(value) {
    if (!Array.isArray(value)) {
      return "";
    }

    return value.join("\n");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ---------------------------------------------------------
     38. PUBLIC GLIME API
     Compatibility layer for addons
  --------------------------------------------------------- */

  window.GLIMEServices = {

    refresh: async function () {
      await loadOffers();
    },

    selectOffer: async function (offerId) {
      await selectOffer(offerId);
    },

    createNewOffer: async function () {
      await createNewOffer();
    },

    createNewVersion: async function () {
      return await ensureEditableVersion();
    },

    saveDraft: async function () {
      return await saveDraft(true);
    },

    submitForReview: async function () {
      return await submitForReview();
    },

    approveVersion: async function () {
      return await approveVersion();
    },

    publishVersion: async function () {
      return await publishVersion();
    },

    runAICheck: async function () {
      return await runAICheck();
    },

    getState: function () {
      return {
        user: state.user,
        client: state.client,
        selectedOffer:
          state.selectedOffer,
        selectedVersion:
          state.selectedVersion,
        currentDraftVersion:
          state.currentDraftVersion,
        currentIndustryConfig:
          state.currentIndustryConfig,
        currentTemplateConfig:
          state.currentTemplateConfig
      };
    }
  };

  /* ---------------------------------------------------------
     39. START
  --------------------------------------------------------- */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }

})();
