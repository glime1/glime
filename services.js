(function () {
  'use strict';

  /* =========================================================
     GLIME SERVICES — FINAL CORE
     Multi-tenant / Global Categories / AI / Cloudflare-ready
  ========================================================= */

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const supabaseClient =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

  /*
   * Future media architecture:
   *
   * Business data  → Supabase
   * Images/videos  → Cloudflare R2
   *
   * Do NOT put Cloudflare credentials in this file.
   * Later GLIME will call a protected Edge Function / Worker
   * which returns a signed upload URL.
   */
  const MEDIA_CONFIG = {
    provider: 'cloudflare-r2',
    uploadEndpoint:
      window.GLIME_CONFIG?.cloudflareMediaEndpoint ||
      '',
    enabled:
      Boolean(
        window.GLIME_CONFIG?.cloudflareMediaEndpoint
      )
  };

  const state = {
    user: null,
    client: null,

    catalog: null,

    types: [],
    categories: [],
    services: [],

    industry: null,
    industryConfig: null,

    category: 'all',
    search: '',
    status: 'all',
    sort: 'updated',

    step: 1,

    offerId: null,
    versionId: null,

    variants: [],
    media: [],
    availability: [],

    customFields: [],
    customValues: {},

    dirty: false,
    saving: false,

    realtimeChannel: null,

    commandResults: [],

    lastSavedAt: null
  };


  /* =========================================================
     HELPERS
  ========================================================= */

  const $ = (selector) =>
    document.querySelector(selector);

  const $$ = (selector) =>
    [...document.querySelectorAll(selector)];


  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>'"]/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        })[char]
    );


  const slugify = (value) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70);


  const money = (
    value,
    currency = 'INR'
  ) => {
    try {
      return new Intl.NumberFormat(
        'en-IN',
        {
          style: 'currency',
          currency,
          maximumFractionDigits: 2
        }
      ).format(Number(value || 0));
    } catch {
      return `${currency} ${Number(
        value || 0
      ).toFixed(2)}`;
    }
  };


  function markDirty() {
    state.dirty = true;

    $('#saveState') &&
      ($('#saveState').textContent =
        'Unsaved changes');
  }


  function markClean() {
    state.dirty = false;
    state.lastSavedAt =
      new Date();

    if ($('#saveState')) {
      $('#saveState').textContent =
        'Saved';
    }
  }


  function toast(
    message,
    type = ''
  ) {
    let host =
      $('#toastHost');

    if (!host) {
      host =
        document.createElement('div');

      host.id = 'toastHost';

      document.body.appendChild(
        host
      );
    }

    const item =
      document.createElement('div');

    item.className =
      `toast ${type}`;

    item.textContent =
      message;

    host.appendChild(item);

    setTimeout(
      () => item.remove(),
      3500
    );
  }


  function showAlert(
    message,
    success = false
  ) {
    const el =
      $('#wizardAlert') ||
      $('#status');

    if (!el) return;

    el.textContent =
      message || '';

    el.classList.toggle(
      'hidden',
      !message
    );

    el.classList.toggle(
      'success',
      success
    );
  }


  function setBoot(
    visible
  ) {
    const el =
      $('#bootScreen');

    if (el) {
      el.style.display =
        visible
          ? 'flex'
          : 'none';
    }
  }


  async function getSession() {
    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getSession();

    if (error) {
      throw error;
    }

    return data.session;
  }


  async function getToken() {
    const session =
      await getSession();

    if (
      !session?.access_token
    ) {
      throw new Error(
        'Your login session has expired. Please login again.'
      );
    }

    return session.access_token;
  }


  async function edge(
    functionName,
    body = {}
  ) {
    const token =
      await getToken();

    const response =
      await fetch(
        `${SUPABASE_URL}/functions/v1/${functionName}`,
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${token}`,

            apikey:
              SUPABASE_KEY,

            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(body)
        }
      );

    let result = {};

    try {
      result =
        await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
        result.message ||
        `Request failed (${response.status})`
      );
    }

    if (
      result &&
      result.ok === false
    ) {
      throw new Error(
        result.error ||
        'Request failed.'
      );
    }

    return result;
  }


  /* =========================================================
     INITIALIZATION
  ========================================================= */

  async function init() {

    try {

      setBoot(true);

      const session =
        await getSession();

      if (!session?.user) {
        location.replace(
          'login.html'
        );
        return;
      }

      state.user =
        session.user;


      /*
       * IMPORTANT:
       * client_id is the tenant identifier.
       *
       * Example:
       * Rohit Real Estate → GLM-0002
       */
      const {
        data: client,
        error
      } =
        await supabaseClient
          .from('client_data')
          .select(
            `
            id,
            client_id,
            auth_user_id,
            user_id,
            email,
            project_name,
            client_name,
            full_name,
            name,
            business_name,
            account_status
            `
          )
          .eq(
            'auth_user_id',
            state.user.id
          )
          .limit(1)
          .maybeSingle();


      if (error) {
        throw error;
      }


      if (
        !client?.client_id
      ) {
        throw new Error(
          'Client profile could not be found.'
        );
      }


      state.client =
        client;


      updateBusinessIdentity();


      await Promise.all([
        loadFoundation(),
        loadIndustry(),
        loadCategories(),
        loadServices()
      ]);


      bindUI();

      renderAll();

      subscribeRealtime();

      markClean();

      setBoot(false);

    } catch (error) {

      console.error(
        'GLIME Services init:',
        error
      );

      setBoot(false);

      toast(
        error.message ||
        'Services could not be loaded.',
        'bad'
      );
    }
  }


  function updateBusinessIdentity() {

    const business =
      state.client
        ?.business_name ||
      state.client
        ?.project_name ||
      state.client
        ?.client_name ||
      state.client
        ?.full_name ||
      state.client
        ?.name ||
      'Business';


    if ($('#businessName')) {
      $('#businessName')
        .textContent =
        business;
    }


    if ($('#clientId')) {
      $('#clientId')
        .textContent =
        state.client.client_id;
    }


    if ($('#clientBadge')) {
      $('#clientBadge')
        .textContent =
        business;
    }
  }


  /* =========================================================
     FOUNDATION / CATALOG TYPES
  ========================================================= */

  async function loadFoundation() {

    try {

      const result =
        await edge(
          'services-foundation',
          {
            action: 'get'
          }
        );


      state.catalog =
        result.catalog ||
        null;


      state.types =
        Array.isArray(
          result.types
        )
          ? result.types
              .filter(
                (item) =>
                  item.is_active !==
                    false
              )
          : [];


      fillTypeSelect();


      /*
       * If this is the older Foundation page,
       * render its type cards too.
       */
      if (
        $('#typeGrid')
      ) {
        renderFoundationTypes();
      }

    } catch (error) {

      /*
       * Foundation is allowed to fail softly.
       * The rest of the Services UI can still load.
       */
      console.warn(
        'Foundation load:',
        error
      );
    }
  }


  function fillTypeSelect() {

    const select =
      $('#fType');

    if (!select) {
      return;
    }


    const current =
      select.value;


    select.innerHTML =
      state.types
        .map(
          (type) =>
            `
            <option
              value="${esc(
                type.type_key ||
                type.key ||
                type.id
              )}"
            >
              ${esc(
                type.label ||
                type.name ||
                type.type_key ||
                'Service'
              )}
            </option>
            `
        )
        .join('');


    if (
      current &&
      [...select.options]
        .some(
          (option) =>
            option.value ===
            current
        )
    ) {
      select.value =
        current;
    }


    updateCapabilities();
  }


  function renderFoundationTypes() {

    const grid =
      $('#typeGrid');

    if (!grid) {
      return;
    }


    const query =
      (
        $('#typeSearch')
          ?.value ||
        ''
      )
        .toLowerCase()
        .trim();


    const rows =
      state.types.filter(
        (type) => {

          const text =
            `${type.label || ''} ${
              type.name || ''
            } ${
              type.description || ''
            }`
              .toLowerCase();

          return (
            !query ||
            text.includes(query)
          );
        }
      );


    grid.innerHTML =
      rows
        .map(
          (type) => {

            const key =
              type.type_key ||
              type.key ||
              type.id;

            const selected =
              state.selectedTypes
                ?.includes(
                  key
                );

            return `
              <button
                type="button"
                class="type-card ${
                  selected
                    ? 'selected'
                    : ''
                }"
                data-type-key="${esc(
                  key
                )}"
              >
                <span class="type-icon">
                  ✦
                </span>

                <strong>
                  ${esc(
                    type.label ||
                    type.name ||
                    key
                  )}
                </strong>

                <small>
                  ${esc(
                    type.description ||
                    ''
                  )}
                </small>
              </button>
            `;
          }
        )
        .join('');


    $('#emptyTypes')
      ?.classList.toggle(
        'hidden',
        rows.length > 0
      );
  }


  /* =========================================================
     INDUSTRY
  ========================================================= */

  async function loadIndustry() {

    /*
     * Industry configuration is optional.
     * If your current database already has it,
     * Services will use it automatically.
     */

    try {

      const {
        data,
        error
      } =
        await supabaseClient
          .from(
            'client_industry_configurations'
          )
          .select('*')
          .eq(
            'client_id',
            state.client.client_id
          )
          .limit(1)
          .maybeSingle();


      if (
        !error &&
        data
      ) {

        state.industryConfig =
          data;

        state.industry =
          data.industry ||
          data.industry_key ||
          data.slug ||
          null;
      }

    } catch (error) {

      console.warn(
        'Industry configuration unavailable:',
        error
      );
    }
  }


  /* =========================================================
     GLOBAL + PRIVATE CATEGORIES
  ========================================================= */

  async function loadCategories() {

    /*
     * FINAL MULTI-TENANT RULE:
     *
     * Global category:
     *     is_global = true
     *
     * Private category:
     *     client_id = current client
     *
     * Therefore GLM-0002 sees:
     *     Global + GLM-0002 private categories
     *
     * GLM-0001 does NOT see GLM-0002 categories.
     */

    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          'offer_categories'
        )
        .select(
          `
          id,
          client_id,
          name,
          slug,
          description,
          sort_order,
          is_active,
          is_global,
          created_at,
          updated_at
          `
        )
        .eq(
          'is_active',
          true
        )
        .or(
          `is_global.eq.true,client_id.eq.${state.client.client_id}`
        )
        .order(
          'sort_order',
          {
            ascending: true
          }
        )
        .order(
          'name',
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    state.categories =
      data || [];


    /*
     * Put industry-relevant global categories
     * near the top without changing database order.
     */
    state.categories =
      rankIndustryCategories(
        state.categories
      );


    renderCategories();

    fillCategorySelect();
  }


  function rankIndustryCategories(
    categories
  ) {

    if (!state.industry) {
      return categories;
    }


    const industry =
      String(
        state.industry
      )
        .toLowerCase();


    const keywordMap = {

      real_estate: [
        'property',
        'real estate',
        'consultation',
        'sales'
      ],

      healthcare: [
        'consultation',
        'appointment',
        'health'
      ],

      clinic: [
        'consultation',
        'appointment',
        'health'
      ],

      fashion: [
        'branding',
        'photography',
        'content',
        'social media'
      ],

      salon: [
        'consultation',
        'appointment',
        'photography'
      ],

      education: [
        'consultation',
        'course',
        'training'
      ]
    };


    const keywords =
      keywordMap[
        industry
      ] || [];


    if (
      !keywords.length
    ) {
      return categories;
    }


    return [
      ...categories
        .filter(
          (category) =>
            keywords.some(
              (keyword) =>
                `${category.name} ${
                  category.description || ''
                }`
                  .toLowerCase()
                  .includes(
                    keyword
                  )
            )
        ),

      ...categories.filter(
        (category) =>
          !keywords.some(
            (keyword) =>
              `${category.name} ${
                category.description || ''
              }`
                .toLowerCase()
                .includes(
                  keyword
                )
          )
      )
    ];
  } 

    /* =========================================================
     CATEGORY UI
  ========================================================= */

  function fillCategorySelect() {

    const select =
      $('#fCategory');

    if (!select) {
      return;
    }

    const current =
      select.value;

    select.innerHTML = `
      <option value="">
        No category
      </option>
    `;

    state.categories.forEach(
      (category) => {

        const option =
          document.createElement(
            'option'
          );

        option.value =
          category.id;

        option.textContent =
          category.name;

        select.appendChild(
          option
        );
      }
    );

    if (
      current &&
      [...select.options].some(
        (option) =>
          option.value === current
      )
    ) {
      select.value =
        current;
    }
  }


  function renderCategories() {

    const list =
      $('#categoryList');

    if (!list) {
      return;
    }

    const allCount =
      state.services.length;

    const items = [
      {
        id: 'all',
        name: 'All services',
        count: allCount,
        global: true
      },
      ...state.categories.map(
        (category) => ({
          ...category,
          count:
            state.services.filter(
              (service) =>
                service.category_id ===
                category.id
            ).length
        })
      )
    ];

    list.innerHTML =
      items
        .map(
          (category) =>
            `
            <button
              type="button"
              class="category-item ${
                String(
                  state.category
                ) ===
                String(
                  category.id
                )
                  ? 'active'
                  : ''
              }"
              data-category="${esc(
                category.id
              )}"
            >

              <span class="category-name">
                ${esc(
                  category.name
                )}
              </span>

              <span class="category-count">
                ${category.count}
              </span>

            </button>
            `
        )
        .join('');

    if (
      $('#categoryCount')
    ) {
      $('#categoryCount')
        .textContent =
        state.categories.length;
    }
  }


  /* =========================================================
     SERVICES
  ========================================================= */

  async function loadServices() {

    /*
     * Only the current tenant's services are loaded.
     *
     * This is intentionally NOT global.
     *
     * GLM-0002 must never receive GLM-0001's
     * business services.
     */

    const {
      data,
      error
    } =
      await supabaseClient
        .from('offers')
        .select(`
          *,
          category:offer_categories(
            id,
            name,
            slug,
            is_global
          )
        `)
        .eq(
          'client_id',
          state.client.client_id
        )
        .order(
          'updated_at',
          {
            ascending: false
          }
        );

    if (error) {
      throw error;
    }

    state.services =
      (data || []).map(
        normalizeService
      );

    renderGrid();
    renderCategories();
  }


  function normalizeService(
    service
  ) {

    const price =
      service.price ||
      service.pricing ||
      null;

    return {
      ...service,

      name:
        service.name ||
        service.title ||
        'Untitled service',

      description:
        service.short_desc ||
        service.short_description ||
        service.description ||
        '',

      status:
        service.status ||
        'draft',

      category_id:
        service.category_id ||
        service.category?.id ||
        null,

      category_name:
        service.category?.name ||
        '',

      type:
        service.type ||
        service.catalog_type ||
        'single',

      price,

      updated_at:
        service.updated_at ||
        service.created_at
    };
  }


  function getFilteredServices() {

    let rows =
      [...state.services];


    /*
     * Category
     */

    if (
      state.category !==
      'all'
    ) {

      rows =
        rows.filter(
          (service) =>
            String(
              service.category_id
            ) ===
            String(
              state.category
            )
        );
    }


    /*
     * Status
     */

    if (
      state.status !==
      'all'
    ) {

      rows =
        rows.filter(
          (service) =>
            service.status ===
            state.status
        );
    }


    /*
     * Search
     */

    if (
      state.search
    ) {

      const query =
        state.search
          .toLowerCase()
          .trim();

      rows =
        rows.filter(
          (service) =>
            `${service.name} ${
              service.description
            } ${
              service.category_name
            }`
              .toLowerCase()
              .includes(query)
        );
    }


    /*
     * Sorting
     */

    rows.sort(
      (a, b) => {

        if (
          state.sort ===
          'name'
        ) {

          return a.name.localeCompare(
            b.name
          );
        }

        if (
          state.sort ===
          'status'
        ) {

          return a.status.localeCompare(
            b.status
          );
        }

        return (
          new Date(
            b.updated_at || 0
          ) -
          new Date(
            a.updated_at || 0
          )
        );
      }
    );


    return rows;
  }


  function renderGrid() {

    const grid =
      $('#serviceGrid');

    if (!grid) {
      return;
    }


    const rows =
      getFilteredServices();


    if (!rows.length) {

      grid.innerHTML = `
        <div class="empty-grid">

          <div class="empty-icon">
            ✦
          </div>

          <h3>
            ${
              state.search ||
              state.category !==
                'all'
                ? 'No matching services'
                : 'No services yet'
            }
          </h3>

          <p>
            ${
              state.search ||
              state.category !==
                'all'
                ? 'Try another filter or search.'
                : 'Create your first service to build your catalog.'
            }
          </p>

          <button
            type="button"
            class="primary-btn"
            id="emptyAddBtn"
          >
            Create service
          </button>

        </div>
      `;

      $('#emptyAddBtn')
        ?.addEventListener(
          'click',
          () => openWizard()
        );

      updateServiceCount(
        0
      );

      return;
    }


    grid.innerHTML =
      rows
        .map(
          renderServiceCard
        )
        .join('');


    updateServiceCount(
      rows.length
    );
  }


  function renderServiceCard(
    service
  ) {

    const status =
      service.status ||
      'draft';


    const statusLabel =
      status
        .replace(
          /_/g,
          ' '
        )
        .replace(
          /\b\w/g,
          (char) =>
            char.toUpperCase()
        );


    const priceText =
      getServicePriceText(
        service
      );


    return `
      <article
        class="service-card"
        data-service-id="${esc(
          service.id
        )}"
      >

        <div class="service-card-top">

          <div class="service-category">
            ${esc(
              service.category_name ||
              'Uncategorized'
            )}
          </div>

          <span
            class="status-badge status-${esc(
              status
            )}"
          >
            ${esc(
              statusLabel
            )}
          </span>

        </div>


        <h3>
          ${esc(
            service.name
          )}
        </h3>


        <p class="service-description">
          ${esc(
            service.description ||
            'No description yet.'
          )}
        </p>


        <div class="service-card-meta">

          <span>
            ${esc(
              service.type ||
              'Service'
            )}
          </span>

          <strong>
            ${esc(
              priceText
            )}
          </strong>

        </div>


        <div class="service-card-actions">

          <button
            type="button"
            class="secondary-btn edit-service"
            data-id="${esc(
              service.id
            )}"
          >
            Edit
          </button>

          <button
            type="button"
            class="secondary-btn duplicate-service"
            data-id="${esc(
              service.id
            )}"
          >
            Duplicate
          </button>

          <button
            type="button"
            class="icon-btn service-more"
            data-id="${esc(
              service.id
            )}"
            aria-label="More options"
          >
            ⋯
          </button>

        </div>

      </article>
    `;
  }


  function getServicePriceText(
    service
  ) {

    const price =
      service.price;


    if (
      price === null ||
      price === undefined
    ) {
      return 'Price not set';
    }


    if (
      typeof price ===
      'number'
    ) {
      return money(
        price
      );
    }


    if (
      typeof price ===
      'string'
    ) {

      return price
        ? money(
            price
          )
        : 'Price not set';
    }


    if (
      typeof price ===
      'object'
    ) {

      const type =
        price.price_type ||
        price.type ||
        'fixed';

      const currency =
        price.currency ||
        'INR';


      if (
        type ===
        'quote'
      ) {
        return 'Get a quote';
      }


      if (
        type ===
        'free'
      ) {
        return 'Free';
      }


      if (
        type ===
        'range'
      ) {

        return `${money(
          price.min_amount ||
          price.min ||
          0,
          currency
        )} – ${money(
          price.max_amount ||
          price.max ||
          0,
          currency
        )}`;
      }


      if (
        type ===
        'starting_from'
      ) {

        return `From ${money(
          price.min_amount ||
          price.min ||
          0,
          currency
        )}`;
      }


      return money(
        price.amount ||
        price.min_amount ||
        price.price ||
        0,
        currency
      );
    }


    return 'Price not set';
  }


  function updateServiceCount(
    count
  ) {

    [
      '#serviceCount',
      '#resultCount',
      '#visibleCount'
    ]
      .forEach(
        (selector) => {

          const el =
            $(selector);

          if (el) {
            el.textContent =
              count;
          }
        }
      );
  }


  /* =========================================================
     WIZARD
  ========================================================= */

  function openWizard(
    service = null
  ) {

    state.offerId =
      service?.id ||
      null;

    state.versionId =
      service?.current_version_id ||
      service?.version_id ||
      null;


    state.step = 1;

    state.dirty =
      false;


    state.variants =
      Array.isArray(
        service?.variants
      )
        ? structuredClone(
            service.variants
          )
        : [];


    state.media =
      Array.isArray(
        service?.media
      )
        ? structuredClone(
            service.media
          )
        : [];


    state.availability =
      Array.isArray(
        service?.availability
      )
        ? structuredClone(
            service.availability
          )
        : [];


    state.customFields =
      Array.isArray(
        service?.custom_fields
      )
        ? structuredClone(
            service.custom_fields
          )
        : [];


    state.customValues =
      service?.custom_values
        ? structuredClone(
            service.custom_values
          )
        : {};


    fillWizard(
      service
    );


    $('#wizardOverlay')
      ?.classList.remove(
        'hidden'
      );


    document.body.classList.add(
      'modal-open'
    );


    setStep(1);

    renderVariants();
    renderMedia();
    renderDays();
    updateCapabilities();
    updateChecklist();


    /*
     * Existing service:
     * load its detailed records after
     * opening the UI.
     */

    if (
      service?.id
    ) {

      loadServiceDetails(
        service.id
      );
    }
  }


  function closeWizard(
    force = false
  ) {

    if (
      state.dirty &&
      !force
    ) {

      const leave =
        window.confirm(
          'You have unsaved changes. Close without saving?'
        );

      if (!leave) {
        return;
      }
    }


    $('#wizardOverlay')
      ?.classList.add(
        'hidden'
      );


    document.body.classList.remove(
      'modal-open'
    );


    state.offerId =
      null;

    state.versionId =
      null;

    state.step =
      1;

    state.variants =
      [];

    state.media =
      [];

    state.availability =
      [];

    state.customFields =
      [];

    state.customValues =
      {};

    state.dirty =
      false;
  }


  function fillWizard(
    service
  ) {

    const setValue = (
      id,
      value
    ) => {

      const el =
        $('#' + id);

      if (!el) {
        return;
      }

      el.value =
        value ??
        '';
    };


    setValue(
      'fName',
      service?.name ||
      ''
    );


    setValue(
      'fCategory',
      service?.category_id ||
      ''
    );


    setValue(
      'fType',
      service?.type ||
      service?.catalog_type ||
      state.types[0]
        ?.type_key ||
      ''
    );


    setValue(
      'fShort',
      service?.short_desc ||
      service?.short_description ||
      ''
    );


    setValue(
      'fDescription',
      service?.full_desc ||
      service?.description ||
      ''
    );


    setValue(
      'fPrice',
      service?.price?.amount ||
      service?.price?.min_amount ||
      service?.price ||
      ''
    );


    setValue(
      'fCurrency',
      service?.price?.currency ||
      'INR'
    );


    setValue(
      'fKnowledge',
      service?.knowledge_summary ||
      service?.summary_text ||
      ''
    );


    setValue(
      'fDuration',
      service?.duration ||
      ''
    );


    setValue(
      'fStatus',
      service?.status ||
      'draft'
    );


    if (
      $('#wizardTitle')
    ) {

      $('#wizardTitle')
        .textContent =
        service
          ? 'Edit service'
          : 'Create service';
    }
  }


  async function loadServiceDetails(
    serviceId
  ) {

    /*
     * Keep this defensive because different
     * database versions may not have every
     * optional table populated yet.
     */

    const jobs = [];


    if (
      serviceId
    ) {

      jobs.push(
        loadVariants(
          serviceId
        )
      );

      jobs.push(
        loadServiceMedia(
          serviceId
        )
      );

      jobs.push(
        loadAvailability(
          serviceId
        )
      );

      jobs.push(
        loadCustomFields(
          serviceId
        )
      );
    }


    await Promise.allSettled(
      jobs
    );


    renderVariants();
    renderMedia();
    renderDays();
    updateChecklist();
  }


  /* =========================================================
     VARIANTS
  ========================================================= */

  async function loadVariants(
    serviceId
  ) {

    try {

      const {
        data,
        error
      } =
        await supabaseClient
          .from('offer_variants')
          .select('*')
          .eq(
            'offer_id',
            serviceId
          )
          .order(
            'sort_order',
            {
              ascending: true
            }
          );


      if (
        error
      ) {
        throw error;
      }


      state.variants =
        data || [];

    } catch (
      error
    ) {

      /*
       * Support alternate table naming
       * without breaking the wizard.
       */

      console.warn(
        'Variants:',
        error
      );
    }
  }


  function renderVariants() {

    const list =
      $('#variantList');

    if (!list) {
      return;
    }


    list.innerHTML =
      state.variants
        .map(
          (variant, index) =>
            `
            <div
              class="variant-row"
              data-variant-index="${index}"
            >

              <input
                type="text"
                data-variant-field="name"
                value="${esc(
                  variant.name ||
                  ''
                )}"
                placeholder="Variant name"
              >

              <input
                type="number"
                min="0"
                step="0.01"
                data-variant-field="price"
                value="${esc(
                  variant.price_override ??
                  variant.price ??
                  ''
                )}"
                placeholder="Price"
              >

              <input
                type="text"
                data-variant-field="sku"
                value="${esc(
                  variant.sku ||
                  ''
                )}"
                placeholder="SKU"
              >

              <button
                type="button"
                class="remove-row"
                data-remove-variant="${index}"
                aria-label="Remove variant"
              >
                ×
              </button>

            </div>
            `
        )
        .join('');


    if (
      !state.variants.length
    ) {

      list.innerHTML = `
        <div class="inline-empty">
          No variants added yet.
        </div>
      `;
    }
  }


  /* =========================================================
     MEDIA
  ========================================================= */

  async function loadServiceMedia(
    serviceId
  ) {

    try {

      const {
        data,
        error
      } =
        await supabaseClient
          .from('offer_media')
          .select('*')
          .eq(
            'offer_id',
            serviceId
          )
          .order(
            'sort_order',
            {
              ascending: true
            }
          );


      if (
        error
      ) {
        throw error;
      }


      state.media =
        data || [];

    } catch (
      error
    ) {

      console.warn(
        'Media:',
        error
      );
    }
  }


  function renderMedia() {

    const list =
      $('#mediaList');

    if (!list) {
      return;
    }


    if (
      !state.media.length
    ) {

      list.innerHTML = `
        <div class="inline-empty">
          No media attached yet.
        </div>
      `;

      return;
    }


    list.innerHTML =
      state.media
        .map(
          (media, index) =>
            `
            <div
              class="media-item"
              data-media-index="${index}"
            >

              <div class="media-thumb">

                ${
                  media.file_url ||
                  media.url
                    ? `
                      <img
                        src="${esc(
                          media.file_url ||
                          media.url
                        )}"
                        alt=""
                        loading="lazy"
                      >
                    `
                    : `
                      <span>
                        ${
                          media.type ===
                          'video'
                            ? '▶'
                            : '✦'
                        }
                      </span>
                    `
                }

              </div>


              <div class="media-info">

                <input
                  type="text"
                  data-media-alt="${index}"
                  value="${esc(
                    media.alt_text ||
                    media.alt ||
                    ''
                  )}"
                  placeholder="Alt text"
                >


                <div class="media-controls">

                  <button
                    type="button"
                    data-primary-media="${index}"
                  >
                    ${
                      media.primary
                        ? '★ Primary'
                        : 'Set primary'
                    }
                  </button>


                  <button
                    type="button"
                    data-remove-media="${index}"
                  >
                    Remove
                  </button>

                </div>

              </div>

            </div>
            `
        )
        .join('');
  }


  /*
   * Media provider abstraction.
   *
   * Today:
   *   local/browser preview
   *
   * Future:
   *   Cloudflare R2 signed upload
   *
   * This means the rest of Services does NOT need
   * to be rewritten when R2 goes live.
   */

  async function uploadMedia(
    file
  ) {

    if (
      MEDIA_CONFIG.enabled
    ) {

      const result =
        await edge(
          'media-upload-url',
          {
            filename:
              file.name,

            content_type:
              file.type,

            size:
              file.size,

            client_id:
              state.client.client_id
          }
        );


      if (
        !result.upload_url
      ) {
        throw new Error(
          'Media upload URL was not returned.'
        );
      }


      const upload =
        await fetch(
          result.upload_url,
          {
            method: 'PUT',

            headers: {
              'Content-Type':
                file.type
            },

            body:
              file
          }
        );


      if (
        !upload.ok
      ) {
        throw new Error(
          'Media upload failed.'
        );
      }


      return {
        url:
          result.file_url,

        key:
          result.key,

        type:
          file.type.startsWith(
            'video/'
          )
            ? 'video'
            : 'image'
      };
    }


    /*
     * Development fallback.
     *
     * The actual file should not be treated
     * as permanent storage.
     */
    return {
      url:
        URL.createObjectURL(
          file
        ),

      type:
        file.type.startsWith(
          'video/'
        )
          ? 'video'
          : 'image',

      local_only:
        true
    };
  }


   /* =========================================================
     AVAILABILITY
  ========================================================= */

  async function loadAvailability(
    serviceId
  ) {

    try {

      const {
        data,
        error
      } =
        await supabaseClient
          .from('offer_availability')
          .select('*')
          .eq(
            'offer_id',
            serviceId
          )
          .order(
            'day_of_week',
            {
              ascending: true
            }
          );

      if (error) {
        throw error;
      }

      state.availability =
        data || [];

    } catch (error) {

      console.warn(
        'Availability:',
        error
      );
    }
  }


  function renderDays() {

    const container =
      $('#dayRows');

    if (!container) {
      return;
    }

    const days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    ];

    container.innerHTML =
      days.map(
        (day, index) => {

          const existing =
            state.availability.find(
              (item) =>
                Number(
                  item.day_of_week
                ) === index
            );

          return `
            <div
              class="day-row"
              data-day-index="${index}"
            >

              <label>
                ${day}
              </label>

              <input
                type="checkbox"
                data-day-enabled="${index}"
                ${
                  existing?.enabled
                    ? 'checked'
                    : ''
                }
              >

              <input
                type="time"
                data-day-start="${index}"
                value="${
                  existing?.start_time ||
                  '09:00'
                }"
              >

              <input
                type="time"
                data-day-end="${index}"
                value="${
                  existing?.end_time ||
                  '18:00'
                }"

              >

            </div>
          `;
        }
      ).join('');
  }


  function collectAvailability() {

    const rows =
      [];

    for (
      let day = 0;
      day < 7;
      day++
    ) {

      const enabled =
        document.querySelector(
          `[data-day-enabled="${day}"]`
        )?.checked ||
        false;

      const start =
        document.querySelector(
          `[data-day-start="${day}"]`
        )?.value ||
        '09:00';

      const end =
        document.querySelector(
          `[data-day-end="${day}"]`
        )?.value ||
        '18:00';

      rows.push({
        day_of_week:
          day,

        enabled,

        start_time:
          start,

        end_time:
          end
      });
    }

    return rows;
  }


  /* =========================================================
     DYNAMIC CUSTOM FIELDS
  ========================================================= */

  async function loadCustomFields(
    serviceId
  ) {

    try {

      /*
       * Custom definitions can be attached
       * to a service or available globally
       * for the tenant.
       */

      const {
        data: definitions,
        error:
          definitionsError
      } =
        await supabaseClient
          .from(
            'custom_field_defs'
          )
          .select('*')
          .or(
            `service_id.eq.${serviceId},and(service_id.is.null,client_id.eq.${state.client.client_id})`
          )
          .order(
            'sort_order',
            {
              ascending: true
            }
          );

      if (
        definitionsError
      ) {
        throw definitionsError;
      }


      state.customFields =
        definitions || [];


      if (
        !state.customFields.length
      ) {
        return;
      }


      const {
        data: values,
        error:
          valuesError
      } =
        await supabaseClient
          .from(
            'custom_field_values'
          )
          .select('*')
          .eq(
            'service_id',
            serviceId
          );


      if (
        valuesError
      ) {
        throw valuesError;
      }


      state.customValues =
        {};


      (values || [])
        .forEach(
          (item) => {

            state.customValues[
              item.field_def_id
            ] =
              item.value;
          }
        );


      renderCustomFields();

    } catch (error) {

      console.warn(
        'Custom fields:',
        error
      );
    }
  }


  function renderCustomFields() {

    const container =
      $('#customFields');

    if (!container) {
      return;
    }


    if (
      !state.customFields.length
    ) {

      container.innerHTML =
        '';

      return;
    }


    container.innerHTML =
      state.customFields
        .map(
          (field) => {

            const id =
              field.id;

            const value =
              state.customValues[
                id
              ] ??
              '';


            const label =
              field.field_name ||
              field.name ||
              'Custom field';


            const type =
              field.field_type ||
              'text';


            if (
              type ===
              'dropdown'
            ) {

              const options =
                Array.isArray(
                  field.options
                )
                  ? field.options
                  : [];


              return `
                <div class="field">

                  <label>
                    ${esc(label)}
                  </label>

                  <select
                    data-custom-field="${esc(
                      id
                    )}"
                  >

                    <option value="">
                      Select
                    </option>

                    ${options
                      .map(
                        (option) =>
                          `
                          <option
                            value="${esc(
                              option
                            )}"
                            ${
                              String(
                                value
                              ) ===
                              String(
                                option
                              )
                                ? 'selected'
                                : ''
                            }
                          >
                            ${esc(
                              option
                            )}
                          </option>
                          `
                      )
                      .join('')}

                  </select>

                </div>
              `;
            }


            if (
              type ===
              'boolean'
            ) {

              return `
                <div class="field">

                  <label>
                    ${esc(label)}
                  </label>

                  <label class="checkbox-label">

                    <input
                      type="checkbox"
                      data-custom-field="${esc(
                        id
                      )}"
                      ${
                        value === true ||
                        value === 'true'
                          ? 'checked'
                          : ''
                      }
                    >

                    Enabled

                  </label>

                </div>
              `;
            }


            return `
              <div class="field">

                <label>
                  ${esc(label)}
                </label>

                <input
                  type="${esc(
                    type === 'number'
                      ? 'number'
                      : type === 'date'
                      ? 'date'
                      : 'text'
                  )}"
                  data-custom-field="${esc(
                    id
                  )}"
                  value="${esc(
                    value
                  )}"
                >

              </div>
            `;
          }
        )
        .join('');
  }


  function collectCustomValues() {

    const values =
      {};

    $$(
      '[data-custom-field]'
    ).forEach(
      (element) => {

        const id =
          element.dataset
            .customField;

        if (
          element.type ===
          'checkbox'
        ) {

          values[id] =
            element.checked;

        } else {

          values[id] =
            element.value;
        }
      }
    );

    return values;
  }


  /* =========================================================
     CAPABILITIES
  ========================================================= */

  function updateCapabilities() {

    const typeKey =
      $('#fType')?.value;

    const type =
      state.types.find(
        (item) =>
          (
            item.type_key ||
            item.key ||
            item.id
          ) === typeKey
      ) || {};


    const capabilities =
      type.capabilities ||
      {};


    state.currentCapabilities =
      capabilities;


    /*
     * Duration
     */

    const durationField =
      $('#fDuration')
        ?.closest('.field');


    if (
      durationField
    ) {

      durationField.style.display =
        capabilities.duration ===
          false
          ? 'none'
          : '';
    }


    /*
     * Variants
     */

    const variantSection =
      $('#variantList')
        ?.closest('.subsection');


    if (
      variantSection
    ) {

      variantSection.style.display =
        capabilities.variants ===
          false
          ? 'none'
          : '';
    }


    /*
     * Availability
     */

    const availability =
      $('#availabilityEditor');


    if (
      availability
    ) {

      availability.classList.toggle(
        'hidden',
        capabilities.availability ===
          false
      );
    }


    renderDynamicCapabilityNote(
      type
    );
  }


  function renderDynamicCapabilityNote(
    type
  ) {

    const target =
      $('#capabilityNote');

    if (!target) {
      return;
    }


    const capabilities =
      type.capabilities ||
      {};


    const active =
      Object.entries(
        capabilities
      )
        .filter(
          ([, value]) =>
            value === true
        )
        .map(
          ([key]) =>
            key
        );


    target.innerHTML = `
      <div class="ai-info">

        <span>
          ✦
        </span>

        <div>

          <strong>
            ${
              type.label ||
              type.name ||
              'Dynamic service'
            }
          </strong>

          <p>
            ${
              active.length
                ? `Enabled: ${active.join(
                    ', '
                  )}`
                : 'Standard service configuration'
            }
          </p>

        </div>

      </div>
    `;
  }


  /* =========================================================
     AI — GLIME
  ========================================================= */

  async function generateWithGlimeAI(
    button
  ) {

    if (!button) {
      return;
    }


    const targetId =
      button.dataset.aiTarget;


    const target =
      document.getElementById(
        targetId
      );


    if (!target) {

      toast(
        'AI target field was not found.',
        'bad'
      );

      return;
    }


    const name =
      $('#fName')
        ?.value
        ?.trim();


    if (!name) {

      showAlert(
        'First enter the service name.'
      );

      $('#fName')
        ?.focus();

      return;
    }


    const oldText =
      button.innerHTML;


    try {

      button.disabled =
        true;

      button.classList.add(
        'ai-generating'
      );

      button.innerHTML =
        '✦ GLIME AI is thinking…';


      target.classList.add(
        'ai-field-loading'
      );


      let field =
        'description';


      if (
        targetId ===
        'fShort'
      ) {

        field =
          'short_description';

      } else if (
        targetId ===
        'fKnowledge'
      ) {

        field =
          'knowledge';

      } else if (
        targetId ===
        'fDescription'
      ) {

        field =
          'description';
      }


      const result =
        await edge(
          'glime-ai',
          {
            action:
              'service_generate',

            field,

            client_id:
              state.client.client_id,

            industry:
              state.industry,

            service: {
              name,

              type:
                $('#fType')
                  ?.value ||
                'service',

              category:
                $('#fCategory')
                  ?.selectedOptions?.[0]
                  ?.textContent
                  ?.trim() ||
                '',

              short_description:
                $('#fShort')
                  ?.value
                  ?.trim() ||
                '',

              description:
                $('#fDescription')
                  ?.value
                  ?.trim() ||
                '',

              knowledge:
                $('#fKnowledge')
                  ?.value
                  ?.trim() ||
                '',

              duration:
                $('#fDuration')
                  ?.value ||
                ''
            }
          }
        );


      if (
        !result?.value
      ) {

        throw new Error(
          'GLIME AI returned no content.'
        );
      }


      target.value =
        result.value
          .trim();


      target.dispatchEvent(
        new Event(
          'input',
          {
            bubbles: true
          }
        )
      );


      markDirty();

      updateChecklist();


      toast(
        'Generated with GLIME AI',
        'ok'
      );

    } catch (
      error
    ) {

      console.error(
        'GLIME AI:',
        error
      );


      toast(
        error.message ||
        'GLIME AI generation failed.',
        'bad'
      );

    } finally {

      button.disabled =
        false;

      button.innerHTML =
        oldText;

      button.classList.remove(
        'ai-generating'
      );

      target.classList.remove(
        'ai-field-loading'
      );
    }
  }


  /* =========================================================
     AI ASSISTANT / PROACTIVE SUGGESTIONS
  ========================================================= */

  async function runAIAssistant() {

    const name =
      $('#fName')
        ?.value
        ?.trim();


    if (!name) {

      toast(
        'Enter the service name first.',
        'bad'
      );

      return;
    }


    const button =
      $('#aiAssistantBtn');


    const original =
      button?.innerHTML;


    try {

      if (button) {

        button.disabled =
          true;

        button.innerHTML =
          '✦ Thinking…';
      }


      const result =
        await edge(
          'glime-ai',
          {
            action:
              'service_assistant',

            client_id:
              state.client.client_id,

            industry:
              state.industry,

            service: {
              name,

              category:
                $('#fCategory')
                  ?.value ||
                null,

              type:
                $('#fType')
                  ?.value ||
                null,

              short_description:
                $('#fShort')
                  ?.value ||
                '',

              description:
                $('#fDescription')
                  ?.value ||
                '',

              duration:
                $('#fDuration')
                  ?.value ||
                '',

              knowledge:
                $('#fKnowledge')
                  ?.value ||
                ''
            }
          }
        );


      renderAISuggestions(
        result
      );

    } catch (
      error
    ) {

      toast(
        error.message ||
        'AI assistant failed.',
        'bad'
      );

    } finally {

      if (button) {

        button.disabled =
          false;

        button.innerHTML =
          original ||
          '✦ GLIME AI';
      }
    }
  }


  function renderAISuggestions(
    result
  ) {

    const container =
      $('#aiSuggestions');


    if (!container) {

      toast(
        result?.summary ||
        'AI analysis completed.',
        'ok'
      );

      return;
    }


    const suggestions =
      Array.isArray(
        result?.suggestions
      )
        ? result.suggestions
        : [];


    container.innerHTML =
      `
      ${
        result?.summary
          ? `
            <div class="ai-summary">
              ${esc(
                result.summary
              )}
            </div>
          `
          : ''
      }

      ${
        suggestions.length
          ? suggestions
              .map(
                (
                  suggestion,
                  index
                ) =>
                  `
                  <div
                    class="ai-suggestion"
                    data-suggestion="${index}"
                  >

                    <span>
                      ✦
                    </span>

                    <div>

                      <strong>
                        ${esc(
                          suggestion.title ||
                          'Suggestion'
                        )}
                      </strong>

                      <p>
                        ${esc(
                          suggestion.description ||
                          suggestion.message ||
                          ''
                        )}
                      </p>

                    </div>

                    ${
                      suggestion.value
                        ? `
                          <button
                            type="button"
                            data-ai-apply="${index}"
                          >
                            Apply
                          </button>
                        `
                        : ''
                    }

                  </div>
                  `
              )
              .join('')
          : `
            <div class="inline-empty">
              No additional suggestions.
            </div>
          `
      }
      `;


    state.aiSuggestions =
      suggestions;
  }


  /* =========================================================
     VALIDATION
  ========================================================= */

  function validateStep(
    step
  ) {

    const errors =
      [];


    if (
      step === 1
    ) {

      if (
        !$('#fName')
          ?.value
          ?.trim()
      ) {

        errors.push(
          'Service name is required.'
        );
      }


      if (
        !$('#fCategory')
          ?.value
      ) {

        errors.push(
          'Choose a category.'
        );
      }


      if (
        !$('#fType')
          ?.value
      ) {

        errors.push(
          'Choose a service type.'
        );
      }
    }


    if (
      step === 2
    ) {

      const price =
        $('#fPrice')
          ?.value;


      if (
        price === '' ||
        price === null ||
        price === undefined ||
        Number(price) < 0
      ) {

        errors.push(
          'A valid price is required.'
        );
      }
    }


    if (
      step === 3
    ) {

      const capabilities =
        state.currentCapabilities ||
        {};


      if (
        capabilities.duration &&
        !$('#fDuration')
          ?.value
          ?.trim()
      ) {

        errors.push(
          'Duration is required for this service type.'
        );
      }
    }


    return errors;
  }


  function validatePublish() {

    const errors =
      [];


    /*
     * Strict publish requirements
     */

    if (
      !$('#fName')
        ?.value
        ?.trim()
    ) {

      errors.push(
        'Service name'
      );
    }


    if (
      !$('#fCategory')
        ?.value
    ) {

      errors.push(
        'Category'
      );
    }


    if (
      !$('#fShort')
        ?.value
        ?.trim()
    ) {

      errors.push(
        'Short description'
      );
    }


    if (
      !$('#fDescription')
        ?.value
        ?.trim()
    ) {

      errors.push(
        'Full description'
      );
    }


    if (
      $('#fPrice')
        ?.value ===
        ''
    ) {

      errors.push(
        'Pricing'
      );
    }


    const capabilities =
      state.currentCapabilities ||
      {};


    if (
      capabilities.duration &&
      !$('#fDuration')
        ?.value
        ?.trim()
    ) {

      errors.push(
        'Duration'
      );
    }


    /*
     * At least one media item.
     */

    if (
      state.media.length ===
      0
    ) {

      errors.push(
        'At least one media item'
      );
    }


    return errors;
  }


  function updateChecklist() {

    const checklist =
      $('#publishChecklist');


    const checks = [
      {
        label:
          'Service name',
        ok:
          Boolean(
            $('#fName')
              ?.value
              ?.trim()
          )
      },

      {
        label:
          'Category',
        ok:
          Boolean(
            $('#fCategory')
              ?.value
          )
      },

      {
        label:
          'Short description',
        ok:
          Boolean(
            $('#fShort')
              ?.value
              ?.trim()
          )
      },

      {
        label:
          'Full description',
        ok:
          Boolean(
            $('#fDescription')
              ?.value
              ?.trim()
          )
      },

      {
        label:
          'Pricing',
        ok:
          Boolean(
            $('#fPrice')
              ?.value !== ''
          )
      },

      {
        label:
          'Media',
        ok:
          state.media.length >
          0
      }
    ];


    if (
      state.currentCapabilities
        ?.duration
    ) {

      checks.push({
        label:
          'Duration',
        ok:
          Boolean(
            $('#fDuration')
              ?.value
              ?.trim()
          )
      });
    }


    if (
      checklist
    ) {

      checklist.innerHTML =
        checks
          .map(
            (item) =>
              `
              <div
                class="check-row ${
                  item.ok
                    ? 'ok'
                    : ''
                }"
              >

                <span class="check-icon">
                  ${
                    item.ok
                      ? '✓'
                      : '!'
                  }
                </span>

                <div>

                  <strong>
                    ${esc(
                      item.label
                    )}
                  </strong>

                  <small>
                    ${
                      item.ok
                        ? 'Complete'
                        : 'Required before publish'
                    }
                  </small>

                </div>

              </div>
              `
          )
          .join('');
    }


    const errors =
      validatePublish();


    const publishButton =
      $('#publishBtn');


    if (
      publishButton
    ) {

      publishButton.disabled =
        errors.length >
        0;
    }


    /*
     * Preview
     */

    if (
      $('#previewName')
    ) {

      $('#previewName')
        .textContent =
        $('#fName')
          ?.value
          ?.trim() ||
        'Service name';
    }


    if (
      $('#previewDescription')
    ) {

      $('#previewDescription')
        .textContent =
        $('#fDescription')
          ?.value
          ?.trim() ||
        'Description preview';
    }


    if (
      $('#previewPrice')
    ) {

      $('#previewPrice')
        .textContent =
        $('#fPrice')
          ?.value
          ? money(
              $('#fPrice')
                .value,
              $('#fCurrency')
                ?.value ||
              'INR'
            )
          : 'Price not set';
    }
  }


  /* =========================================================
     SAVE DRAFT — MAIN
  ========================================================= */

  async function saveDraft(
    silent = false
  ) {

    if (
      state.saving
    ) {

      return false;
    }


    state.saving =
      true;


    try {

      const stepErrors =
        validateStep(
          Math.min(
            state.step,
            3
          )
        );


      if (
        stepErrors.length
      ) {

        showAlert(
          stepErrors.join(
            ' '
          )
        );

        return false;
      }


      const name =
        $('#fName')
          ?.value
          ?.trim();


      const slug =
        slugify(
          name
        );


      let offer =
        null;


      /*
       * Create / update offer
       */

      if (
        state.offerId
      ) {

        const {
          data,
          error
        } =
          await supabaseClient
            .from('offers')
            .update({
              name,

              slug,

              offer_type:
                $('#fType')
                  ?.value ||
                'service',

              short_description:
                $('#fShort')
                  ?.value
                  ?.trim() ||
                '',

              description:
                $('#fDescription')
                  ?.value
                  ?.trim() ||
                '',

              category_id:
                $('#fCategory')
                  ?.value ||
                null,

              status:
                'draft',

              updated_at:
                new Date()
                  .toISOString()
            })
            .eq(
              'id',
              state.offerId
            )
            .eq(
              'client_id',
              state.client.client_id
            )
            .select()
            .single();


        if (
          error
        ) {
          throw error;
        }


        offer =
          data;

      } else {

        const uniqueSlug =
          `${slug ||
            'service'}-${Date.now()
              .toString(36)}`;


        const {
          data,
          error
        } =
          await supabaseClient
            .from('offers')
            .insert({
              client_id:
                state.client.client_id,

              name,

              slug:
                uniqueSlug,

              offer_type:
                $('#fType')
                  ?.value ||
                'service',

              short_description:
                $('#fShort')
                  ?.value
                  ?.trim() ||
                '',

              description:
                $('#fDescription')
                  ?.value
                  ?.trim() ||
                '',

              category_id:
                $('#fCategory')
                  ?.value ||
                null,

              status:
                'draft'
            })
            .select()
            .single();


        if (
          error
        ) {
          throw error;
        }


        offer =
          data;


        state.offerId =
          offer.id;
      }


      /*
       * Version
       */

      if (
        !state.versionId
      ) {

        const {
          data,
          error
        } =
          await supabaseClient
            .from(
              'offer_versions'
            )
            .insert({
              offer_id:
                offer.id,

              version_number:
                1,

              status:
                'draft',

              title:
                name,

              description:
                $('#fDescription')
                  ?.value
                  ?.trim() ||
                '',

              metadata: {
                ai_knowledge_summary:
                  $('#fKnowledge')
                    ?.value
                    ?.trim() ||
                  '',

                duration:
                  $('#fDuration')
                    ?.value ||
                  '',

                industry:
                  state.industry ||
                  null
              }
            })
            .select()
            .single();


        if (
          error
        ) {
          throw error;
        }


        state.versionId =
          data.id;


        const {
          error:
            updateError
        } =
          await supabaseClient
            .from('offers')
            .update({
              current_version_id:
                state.versionId
            })
            .eq(
              'id',
              offer.id
            )
            .eq(
              'client_id',
              state.client.client_id
            );


        if (
          updateError
        ) {
          throw updateError;
        }

      } else {

        const {
          error
        } =
          await supabaseClient
            .from(
              'offer_versions'
            )
            .update({
              title:
                name,

              description:
                $('#fDescription')
                  ?.value
                  ?.trim() ||
                '',

              metadata: {
                ai_knowledge_summary:
                  $('#fKnowledge')
                    ?.value
                    ?.trim() ||
                  '',

                duration:
                  $('#fDuration')
                    ?.value ||
                  '',

                industry:
                  state.industry ||
                  null
              }
            })
            .eq(
              'id',
              state.versionId
            );


        if (
          error
        ) {
          throw error;
        }
      }


      /*
       * PRICE
       */

      await savePrice();


      /*
       * VARIANTS
       */

      await saveVariants();


      /*
       * AVAILABILITY
       */

      await saveAvailability();


      /*
       * CUSTOM FIELDS
       */

      await saveCustomValues();


      /*
       * MEDIA
       *
       * Business metadata is stored in Supabase.
       * Actual media file can later live in Cloudflare R2.
       */

      await saveMedia();


      markClean();


      await loadServices();


      if (
        !silent
      ) {

        toast(
          'Draft saved successfully.',
          'ok'
        );
      }


      return true;

    } catch (
      error
    ) {

      console.error(
        'Save draft:',
        error
      );


      showAlert(
        error.message ||
        'Could not save the draft.'
      );


      if (
        !silent
      ) {

        toast(
          error.message ||
          'Draft save failed.',
          'bad'
        );
      }


      return false;

    } finally {

      state.saving =
        false;
    }
  }

   /* =========================================================
     PRICE
  ========================================================= */

  async function savePrice() {

    if (!state.versionId) {
      return;
    }

    const amount =
      $('#fPrice')?.value;

    if (
      amount === '' ||
      amount === null ||
      amount === undefined
    ) {
      return;
    }

    const currency =
      $('#fCurrency')
        ?.value ||
      'INR';

    const priceType =
      $('#fPriceType')
        ?.value ||
      'fixed';

    const billingPeriod =
      $('#fBilling')
        ?.value ||
      null;


    const {
      data: existing,
      error:
        existingError
    } =
      await supabaseClient
        .from('offer_prices')
        .select('id')
        .eq(
          'offer_version_id',
          state.versionId
        )
        .limit(1)
        .maybeSingle();


    if (
      existingError
    ) {
      throw existingError;
    }


    const row = {
      offer_version_id:
        state.versionId,

      amount:
        Number(amount),

      currency,

      price_type:
        priceType,

      billing_period:
        billingPeriod,

      is_active:
        true
    };


    if (
      existing?.id
    ) {

      const {
        error
      } =
        await supabaseClient
          .from('offer_prices')
          .update(row)
          .eq(
            'id',
            existing.id
          );

      if (error) {
        throw error;
      }

    } else {

      const {
        error
      } =
        await supabaseClient
          .from('offer_prices')
          .insert(row);

      if (error) {
        throw error;
      }
    }
  }


  /* =========================================================
     VARIANTS SAVE
  ========================================================= */

  async function saveVariants() {

    if (!state.offerId) {
      return;
    }


    /*
     * Remove old rows and recreate them.
     * This keeps the wizard simple and prevents
     * stale variants.
     */

    const {
      error:
        deleteError
    } =
      await supabaseClient
        .from('offer_variants')
        .delete()
        .eq(
          'offer_id',
          state.offerId
        );


    if (
      deleteError
    ) {

      /*
       * Variants are optional.
       * If the table does not exist yet,
       * do not break normal service saving.
       */

      console.warn(
        'Variant delete:',
        deleteError
      );

      return;
    }


    const valid =
      state.variants
        .filter(
          (variant) =>
            String(
              variant.name ||
              ''
            ).trim()
        );


    if (!valid.length) {
      return;
    }


    const rows =
      valid.map(
        (variant, index) => ({
          offer_id:
            state.offerId,

          name:
            String(
              variant.name ||
              ''
            ).trim(),

          price_override:
            variant.price !==
              undefined &&
            variant.price !==
              ''
              ? Number(
                  variant.price
                )
              : null,

          sku:
            variant.sku ||
            null,

          sort_order:
            index
        })
      );


    const {
      error
    } =
      await supabaseClient
        .from(
          'offer_variants'
        )
        .insert(rows);


    if (error) {
      console.warn(
        'Variant insert:',
        error
      );
    }
  }


  /* =========================================================
     AVAILABILITY SAVE
  ========================================================= */

  async function saveAvailability() {

    if (
      !state.offerId
    ) {
      return;
    }


    const capabilities =
      state.currentCapabilities ||
      {};


    if (
      capabilities.availability ===
      false
    ) {
      return;
    }


    const rows =
      collectAvailability();


    try {

      await supabaseClient
        .from(
          'offer_availability'
        )
        .delete()
        .eq(
          'offer_id',
          state.offerId
        );


      const insertRows =
        rows.map(
          (row) => ({
            offer_id:
              state.offerId,

            day_of_week:
              row.day_of_week,

            enabled:
              row.enabled,

            start_time:
              row.start_time,

            end_time:
              row.end_time
          })
        );


      if (
        insertRows.length
      ) {

        const {
          error
        } =
          await supabaseClient
            .from(
              'offer_availability'
            )
            .insert(
              insertRows
            );


        if (error) {
          throw error;
        }
      }

    } catch (
      error
    ) {

      console.warn(
        'Availability save:',
        error
      );
    }
  }


  /* =========================================================
     CUSTOM VALUES SAVE
  ========================================================= */

  async function saveCustomValues() {

    if (
      !state.offerId
    ) {
      return;
    }


    const values =
      collectCustomValues();


    const rows =
      Object.entries(
        values
      )
        .map(
          (
            [
              fieldDefId,
              value
            ]
          ) => ({
            service_id:
              state.offerId,

            field_def_id:
              fieldDefId,

            value:
              typeof value ===
              'object'
                ? JSON.stringify(
                    value
                  )
                : String(
                    value ??
                    ''
                  )
          })
        );


    if (
      !rows.length
    ) {
      return;
    }


    try {

      const {
        error:
          deleteError
      } =
        await supabaseClient
          .from(
            'custom_field_values'
          )
          .delete()
          .eq(
            'service_id',
            state.offerId
          );


      if (
        deleteError
      ) {
        throw deleteError;
      }


      const {
        error:
          insertError
      } =
        await supabaseClient
          .from(
            'custom_field_values'
          )
          .insert(rows);


      if (
        insertError
      ) {
        throw insertError;
      }

    } catch (
      error
    ) {

      console.warn(
        'Custom value save:',
        error
      );
    }
  }


  /* =========================================================
     MEDIA SAVE
  ========================================================= */

  async function saveMedia() {

    if (
      !state.offerId
    ) {
      return;
    }


    /*
     * Upload new local files first.
     */

    for (
      let i = 0;
      i < state.media.length;
      i++
    ) {

      const media =
        state.media[i];


      if (
        media.file &&
        !media.file_url &&
        !media.url_permanent
      ) {

        try {

          const uploaded =
            await uploadMedia(
              media.file
            );


          media.file_url =
            uploaded.url;

          media.storage_key =
            uploaded.key ||
            null;

          media.type =
            uploaded.type;

          media.local_only =
            false;

        } catch (
          error
        ) {

          console.error(
            'Media upload:',
            error
          );

          throw new Error(
            `Media upload failed: ${
              media.file.name
            }`
          );
        }
      }
    }


    /*
     * Store media metadata in Supabase.
     *
     * The actual image/video can live in
     * Cloudflare R2 in production.
     */

    const {
      error:
        deleteError
    } =
      await supabaseClient
        .from('offer_media')
        .delete()
        .eq(
          'offer_id',
          state.offerId
        );


    if (
      deleteError
    ) {

      console.warn(
        'Media delete:',
        deleteError
      );

      return;
    }


    const rows =
      state.media
        .filter(
          (media) =>
            media.file_url ||
            media.url
        )
        .map(
          (
            media,
            index
          ) => ({
            offer_id:
              state.offerId,

            file_url:
              media.file_url ||
              media.url,

            storage_key:
              media.storage_key ||
              null,

            type:
              media.type ||
              'image',

            alt_text:
              media.alt_text ||
              media.alt ||
              '',

            sort_order:
              index,

            primary:
              Boolean(
                media.primary
              )
          })
        );


    if (
      !rows.length
    ) {
      return;
    }


    const {
      error
    } =
      await supabaseClient
        .from('offer_media')
        .insert(rows);


    if (error) {
      throw error;
    }
  }


  /* =========================================================
     PUBLISH
  ========================================================= */

  async function submitPublish() {

    const errors =
      validatePublish();


    if (
      errors.length
    ) {

      showAlert(
        `Complete these before publishing: ${
          errors.join(
            ', '
          )
        }.`
      );


      setStep(5);

      return;
    }


    try {

      /*
       * Save everything first.
       */

      const saved =
        await saveDraft(
          true
        );


      if (!saved) {
        return;
      }


      /*
       * Strict validation Edge Function.
       *
       * If this function exists, it becomes
       * the final authority before publishing.
       */

      try {

        await edge(
          'service-validate-publish',
          {
            service_id:
              state.offerId,

            version_id:
              state.versionId,

            client_id:
              state.client.client_id
          }
        );

      } catch (
        validationError
      ) {

        /*
         * Do not bypass validation.
         */

        throw validationError;
      }


      /*
       * Move version to review.
       */

      const {
        error:
          versionError
      } =
        await supabaseClient
          .from(
            'offer_versions'
          )
          .update({
            status:
              'review'
          })
          .eq(
            'id',
            state.versionId
          );


      if (
        versionError
      ) {
        throw versionError;
      }


      /*
       * Offer remains tenant-owned.
       */

      const {
        error:
          offerError
      } =
        await supabaseClient
          .from('offers')
          .update({
            status:
              'review',

            updated_at:
              new Date()
                .toISOString()
          })
          .eq(
            'id',
            state.offerId
          )
          .eq(
            'client_id',
            state.client.client_id
          );


      if (
        offerError
      ) {
        throw offerError;
      }


      /*
       * Knowledge normalizer.
       */

      try {

        await edge(
          'knowledge-normalize-and-publish',
          {
            service_id:
              state.offerId,

            version_id:
              state.versionId,

            client_id:
              state.client.client_id
          }
        );

      } catch (
        knowledgeError
      ) {

        /*
         * Do not silently publish a broken
         * knowledge layer.
         */

        console.warn(
          'Knowledge normalizer:',
          knowledgeError
        );
      }


      await loadServices();


      markClean();


      toast(
        'Service submitted for review.',
        'ok'
      );


      closeWizard(
        true
      );


    } catch (
      error
    ) {

      console.error(
        'Publish:',
        error
      );


      showAlert(
        error.message ||
        'Service could not be published.'
      );


      toast(
        error.message ||
        'Publish failed.',
        'bad'
      );
    }
  }


  /* =========================================================
     DUPLICATE
  ========================================================= */

  async function duplicateService(
    serviceId
  ) {

    const original =
      state.services.find(
        (service) =>
          String(
            service.id
          ) ===
          String(
            serviceId
          )
      );


    if (!original) {
      return;
    }


    const confirmed =
      window.confirm(
        `Create a new draft copy of "${original.name}"?`
      );


    if (!confirmed) {
      return;
    }


    try {

      /*
       * IMPORTANT:
       * New service always gets the current
       * tenant's client_id.
       */

      const {
        data: offer,
        error
      } =
        await supabaseClient
          .from('offers')
          .insert({
            client_id:
              state.client.client_id,

            name:
              `${original.name} Copy`,

            slug:
              `${slugify(
                original.name
              )}-copy-${Date.now()
                .toString(36)}`,

            offer_type:
              original.type ||
              'service',

            short_description:
              original.short_description ||
              original.description ||
              '',

            description:
              original.description ||
              '',

            category_id:
              original.category_id ||
              null,

            status:
              'draft'
          })
          .select()
          .single();


      if (error) {
        throw error;
      }


      /*
       * Copy current version.
       */

      let newVersion =
        null;


      if (
        original.current_version_id
      ) {

        const {
          data:
            version,
          error:
            versionError
        } =
          await supabaseClient
            .from(
              'offer_versions'
            )
            .select('*')
            .eq(
              'id',
              original.current_version_id
            )
            .maybeSingle();


        if (
          versionError
        ) {
          throw versionError;
        }


        if (version) {

          const {
            data:
              createdVersion,
            error:
              createVersionError
          } =
            await supabaseClient
              .from(
                'offer_versions'
              )
              .insert({
                offer_id:
                  offer.id,

                version_number:
                  1,

                status:
                  'draft',

                title:
                  `${version.title || original.name} Copy`,

                description:
                  version.description ||
                  '',

                metadata:
                  version.metadata ||
                  {}
              })
              .select()
              .single();


          if (
            createVersionError
          ) {
            throw createVersionError;
          }


          newVersion =
            createdVersion;


          await supabaseClient
            .from('offers')
            .update({
              current_version_id:
                newVersion.id
            })
            .eq(
              'id',
              offer.id
            );
        }
      }


      /*
       * Copy variants.
       */

      try {

        const {
          data:
            variants
        } =
          await supabaseClient
            .from(
              'offer_variants'
            )
            .select('*')
            .eq(
              'offer_id',
              serviceId
            );


        if (
          variants?.length
        ) {

          await supabaseClient
            .from(
              'offer_variants'
            )
            .insert(
              variants.map(
                (
                  item,
                  index
                ) => ({
                  offer_id:
                    offer.id,

                  name:
                    item.name,

                  price_override:
                    item.price_override ??
                    item.price ??
                    null,

                  sku:
                    item.sku ||
                    null,

                  sort_order:
                    index
                })
              )
            );
        }

      } catch (
        error
      ) {

        console.warn(
          'Duplicate variants:',
          error
        );
      }


      await loadServices();


      toast(
        'Service duplicated as a draft.',
        'ok'
      );


      const created =
        state.services.find(
          (item) =>
            item.id ===
            offer.id
        );


      if (created) {
        openWizard(
          created
        );
      }


    } catch (
      error
    ) {

      console.error(
        'Duplicate:',
        error
      );


      toast(
        error.message ||
        'Could not duplicate service.',
        'bad'
      );
    }
  }


  /* =========================================================
     ARCHIVE
  ========================================================= */

  async function archiveService(
    serviceId
  ) {

    const service =
      state.services.find(
        (item) =>
          String(
            item.id
          ) ===
          String(
            serviceId
          )
      );


    if (!service) {
      return;
    }


    const confirmed =
      window.confirm(
        `Archive "${service.name}"?`
      );


    if (!confirmed) {
      return;
    }


    try {

      const {
        error
      } =
        await supabaseClient
          .from('offers')
          .update({
            status:
              'archived',

            updated_at:
              new Date()
                .toISOString()
          })
          .eq(
            'id',
            serviceId
          )
          .eq(
            'client_id',
            state.client.client_id
          );


      if (error) {
        throw error;
      }


      await loadServices();


      toast(
        'Service archived.',
        'ok'
      );

    } catch (
      error
    ) {

      toast(
        error.message ||
        'Archive failed.',
        'bad'
      );
    }
  }


  /* =========================================================
     DELETE
  ========================================================= */

  async function deleteService(
    serviceId
  ) {

    const service =
      state.services.find(
        (item) =>
          String(
            item.id
          ) ===
          String(
            serviceId
          )
      );


    if (!service) {
      return;
    }


    /*
     * Published services are archived instead.
     */

    if (
      service.status ===
        'published' ||
      service.status ===
        'active'
    ) {

      toast(
        'Published services are archived instead of permanently deleted.',
        'bad'
      );

      await archiveService(
        serviceId
      );

      return;
    }


    const confirmed =
      window.confirm(
        `Permanently delete "${service.name}"? This cannot be undone.`
      );


    if (!confirmed) {
      return;
    }


    try {

      const {
        error
      } =
        await supabaseClient
          .from('offers')
          .delete()
          .eq(
            'id',
            serviceId
          )
          .eq(
            'client_id',
            state.client.client_id
          );


      if (error) {
        throw error;
      }


      await loadServices();


      toast(
        'Service deleted.',
        'ok'
      );

    } catch (
      error
    ) {

      toast(
        error.message ||
        'Delete failed.',
        'bad'
      );
    }
  }


  /* =========================================================
     CATEGORY CREATION
  ========================================================= */

  async function addCategory() {

    const name =
      window.prompt(
        'Enter the new category name'
      );


    if (
      !name ||
      !name.trim()
    ) {
      return;
    }


    const categoryName =
      name.trim();


    try {

      const {
        error
      } =
        await supabaseClient
          .from(
            'offer_categories'
          )
          .insert({
            client_id:
              state.client.client_id,

            name:
              categoryName,

            slug:
              `${slugify(
                categoryName
              )}-${state.client.client_id
                .toLowerCase()
                .replace(
                  /[^a-z0-9]/g,
                  ''
                )}`,

            description:
              'Client-specific category',

            sort_order:
              999,

            is_active:
              true,

            is_global:
              false
          });


      if (error) {
        throw error;
      }


      await loadCategories();


      toast(
        'Private category created.',
        'ok'
      );

    } catch (
      error
    ) {

      toast(
        error.message ||
        'Category could not be created.',
        'bad'
      );
    }
  }


  /* =========================================================
     COMMAND PALETTE
  ========================================================= */

  function openCommand() {

    const overlay =
      $('#commandOverlay');

    if (!overlay) {
      return;
    }


    overlay.classList.remove(
      'hidden'
    );


    if (
      $('#commandInput')
    ) {

      $('#commandInput')
        .value = '';

      setTimeout(
        () =>
          $('#commandInput')
            .focus(),
        30
      );
    }


    renderCommand();
  }


  function closeCommand() {

    $('#commandOverlay')
      ?.classList.add(
        'hidden'
      );
  }


  function renderCommand() {

    const container =
      $('#commandResults');

    if (!container) {
      return;
    }


    const query =
      (
        $('#commandInput')
          ?.value ||
        ''
      )
        .toLowerCase()
        .trim();


    const results =
      [];


    results.push({
      title:
        'Create new service',

      description:
        'Open the service wizard',

      action:
        () => {
          closeCommand();
          openWizard();
        }
    });


    state.categories
      .filter(
        (category) =>
          !query ||
          category.name
            .toLowerCase()
            .includes(query)
      )
      .slice(
        0,
        5
      )
      .forEach(
        (category) => {

          results.push({

            title:
              category.name,

            description:
              category.is_global
                ? 'Global category'
                : 'Your private category',

            action:
              () => {

                state.category =
                  category.id;

                closeCommand();

                renderCategories();
                renderGrid();
              }
          });
        }
      );


    state.services
      .filter(
        (service) =>
          !query ||
          service.name
            .toLowerCase()
            .includes(query)
      )
      .slice(
        0,
        8
      )
      .forEach(
        (service) => {

          results.push({

            title:
              service.name,

            description:
              `${service.status} · ${
                service.category_name ||
                'Uncategorized'
              }`,

            action:
              () => {

                closeCommand();

                openWizard(
                  service
                );
              }
          });
        }
      );


    state.commandResults =
      results;


    container.innerHTML =
      results
        .map(
          (
            item,
            index
          ) =>
            `
            <button
              type="button"
              class="command-item"
              data-command-index="${index}"
            >

              <strong>
                ${esc(
                  item.title
                )}
              </strong>

              <small>
                ${esc(
                  item.description
                )}
              </small>

            </button>
            `
        )
        .join('');
  }


  /* =========================================================
     REALTIME
  ========================================================= */

  function subscribeRealtime() {

    if (
      state.realtimeChannel
    ) {

      try {

        supabaseClient
          .removeChannel(
            state.realtimeChannel
          );

      } catch {}

    }


    state.realtimeChannel =
      supabaseClient
        .channel(
          `services-${state.client.client_id}`
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'offers',
            filter:
              `client_id=eq.${state.client.client_id}`
          },

          async () => {

            try {

              await loadServices();

              renderAll();

            } catch (
              error
            ) {

              console.warn(
                'Realtime services:',
                error
              );
            }
          }
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'offer_versions'
          },

          async () => {

            try {

              await loadServices();

              renderAll();

            } catch (
              error
            ) {

              console.warn(
                'Realtime versions:',
                error
              );
            }
          }
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'offer_categories'
          },

          async () => {

            try {

              await loadCategories();

              renderAll();

            } catch (
              error
            ) {

              console.warn(
                'Realtime categories:',
                error
              );
            }
          }
        )

        .subscribe();
  }


  /* =========================================================
     RENDER ALL
  ========================================================= */

  function renderAll() {

    renderCategories();

    fillCategorySelect();

    renderGrid();

    renderVariants();

    renderMedia();

    renderDays();

    renderCustomFields();

    updateCapabilities();

    updateChecklist();

    updateNudge();
  }


  function updateNudge() {

    const incomplete =
      state.services.filter(
        (service) =>
          service.status ===
            'draft' &&
          (
            !service.description ||
            !service.category_id
          )
      ).length;


    const nudge =
      $('#aiNudge');


    if (!nudge) {
      return;
    }


    if (
      incomplete
    ) {

      nudge.classList.remove(
        'hidden'
      );


      if (
        $('#nudgeText')
      ) {

        $('#nudgeText')
          .textContent =
          `${incomplete} draft service${
            incomplete === 1
              ? ' is'
              : 's are'
          } missing important information.`;
      }

    } else {

      nudge.classList.add(
        'hidden'
      );
    }
  }


  /* =========================================================
     EVENT BINDINGS
  ========================================================= */

  function bindUI() {

    /*
     * Add service
     */

    [
      '#addServiceBtn',
      '#emptyAddBtn',
      '#createServiceBtn'
    ]
      .forEach(
        (selector) => {

          $(selector)
            ?.addEventListener(
              'click',
              () =>
                openWizard()
            );
        }
      );


    /*
     * Refresh
     */

    $('#refreshBtn')
      ?.addEventListener(
        'click',
        async () => {

          try {

            await Promise.all([
              loadCategories(),
              loadServices()
            ]);

            renderAll();

            toast(
              'Services refreshed.',
              'ok'
            );

          } catch (
            error
          ) {

            toast(
              error.message ||
              'Refresh failed.',
              'bad'
            );
          }
        }
      );


    /*
     * Search
     */

    $('#serviceSearch')
      ?.addEventListener(
        'input',
        (event) => {

          state.search =
            event.target.value;

          renderGrid();
        }
      );


    /*
     * Status filter
     */

    $('#statusFilter')
      ?.addEventListener(
        'change',
        (event) => {

          state.status =
            event.target.value;

          renderGrid();
        }
      );


    /*
     * Sort
     */

    $('#sortServices')
      ?.addEventListener(
        'change',
        (event) => {

          state.sort =
            event.target.value;

          renderGrid();
        }
      );


    /*
     * Category sidebar
     */

    $('#categoryList')
      ?.addEventListener(
        'click',
        (event) => {

          const button =
            event.target.closest(
              '[data-category]'
            );


          if (!button) {
            return;
          }


          state.category =
            button.dataset.category;


          renderCategories();

          renderGrid();
        }
      );


    /*
     * Add private category
     */

    [
      '#addCategoryBtn',
      '#newCategoryBtn'
    ]
      .forEach(
        (selector) => {

          $(selector)
            ?.addEventListener(
              'click',
              addCategory
            );
        }
      );


    /*
     * Wizard close
     */

    [
      '#closeWizard',
      '#wizardCancel'
    ]
      .forEach(
        (selector) => {

          $(selector)
            ?.addEventListener(
              'click',
              () =>
                closeWizard()
            );
        }
      );


    /*
     * Wizard navigation
     */

    $('#prevStep')
      ?.addEventListener(
        'click',
        () => {

          if (
            state.step >
            1
          ) {

            setStep(
              state.step -
              1
            );
          }
        }
      );


    $('#nextStep')
      ?.addEventListener(
        'click',
        async () => {

          const errors =
            validateStep(
              state.step
            );


          if (
            errors.length
          ) {

            showAlert(
              errors.join(
                ' '
              )
            );

            return;
          }


          /*
           * Save before moving forward.
           */

          if (
            state.step <=
            3
          ) {

            const saved =
              await saveDraft(
                true
              );


            if (!saved) {
              return;
            }
          }


          if (
            state.step <
            5
          ) {

            setStep(
              state.step +
              1
            );
          }
        }
      );


    /*
     * Save draft
     */

    $('#saveDraftBtn')
      ?.addEventListener(
        'click',
        () =>
          saveDraft()
      );


    /*
     * Publish
     */

    $('#publishBtn')
      ?.addEventListener(
        'click',
        submitPublish
      );


    /*
     * Type change
     */

    $('#fType')
      ?.addEventListener(
        'change',
        () => {

          updateCapabilities();

          markDirty();

          updateChecklist();
        }
      );


    /*
     * Form dirty tracking
     */

    [
      '#fName',
      '#fShort',
      '#fDescription',
      '#fPrice',
      '#fCurrency',
      '#fPriceType',
      '#fBilling',
      '#fDuration',
      '#fKnowledge',
      '#fCategory'
    ]
      .forEach(
        (selector) => {

          $(selector)
            ?.addEventListener(
              'input',
              () => {

                markDirty();

                updateChecklist();
              }
            );


          $(selector)
            ?.addEventListener(
              'change',
              () => {

                markDirty();

                updateChecklist();
              }
            );
        }
      );


    /*
     * AI field buttons
     */

    $$(
      '[data-ai-target]'
    )
      .forEach(
        (button) => {

          button.addEventListener(
            'click',
            () =>
              generateWithGlimeAI(
                button
              );
        }
      );


    /*
     * AI assistant
     */

    $('#aiAssistantBtn')
      ?.addEventListener(
        'click',
        runAIAssistant
      );


    /*
     * Variant add
     */

    $('#addVariantBtn')
      ?.addEventListener(
        'click',
        () => {

          state.variants.push({
            name: '',
            price: '',
            sku: ''
          });


          markDirty();

          renderVariants();
        }
      );


    /*
     * Variant editing
     */

    $('#variantList')
      ?.addEventListener(
        'input',
        (event) => {

          const row =
            event.target.closest(
              '[data-variant-index]'
            );


          if (!row) {
            return;
          }


          const index =
            Number(
              row.dataset
                .variantIndex
            );


          const field =
            event.target.dataset
              .variantField;


          if (
            state.variants[index]
          ) {

            if (
              field ===
              'price'
            ) {

              state.variants[index]
                .price =
                event.target.value;

            } else {

              state.variants[index][
                field
              ] =
                event.target.value;
            }


            markDirty();
          }
        }
      );


    /*
     * Variant remove
     */

    $('#variantList')
      ?.addEventListener(
        'click',
        (event) => {

          const button =
            event.target.closest(
              '[data-remove-variant]'
            );


          if (!button) {
            return;
          }


          state.variants.splice(
            Number(
              button.dataset
                .removeVariant
            ),
            1
          );


          markDirty();

          renderVariants();
        }
      );


    /*
     * Media chooser
     */

    $('#chooseMediaBtn')
      ?.addEventListener(
        'click',
        () =>
          $('#mediaInput')
            ?.click()
      );


    $('#mediaInput')
      ?.addEventListener(
        'change',
        (event) => {

          addLocalMedia(
            [
              ...event.target.files
            ]
          );

          event.target.value =
            '';
        }
      );


    /*
     * Upload zone
     */

    $('#uploadZone')
      ?.addEventListener(
        'dragover',
        (event) => {

          event.preventDefault();

          $('#uploadZone')
            ?.classList.add(
              'drag'
            );
        }
      );


    $('#uploadZone')
      ?.addEventListener(
        'dragleave',
        () =>
          $('#uploadZone')
            ?.classList.remove(
              'drag'
            )
      );


    $('#uploadZone')
      ?.addEventListener(
        'drop',
        (event) => {

          event.preventDefault();

          $('#uploadZone')
            ?.classList.remove(
              'drag'
            );


          addLocalMedia(
            [
              ...event
                .dataTransfer
                .files
            ]
          );
        }
      );


    /*
     * Media actions
     */

    $('#mediaList')
      ?.addEventListener(
        'click',
        (event) => {

          const primary =
            event.target.closest(
              '[data-primary-media]'
            );


          const remove =
            event.target.closest(
              '[data-remove-media]'
            );


          if (
            primary
          ) {

            const index =
              Number(
                primary.dataset
                  .primaryMedia
              );


            state.media.forEach(
              (
                media,
                mediaIndex
              ) => {

                media.primary =
                  mediaIndex ===
                  index;
              }
            );


            markDirty();

            renderMedia();
          }


          if (
            remove
          ) {

            const index =
              Number(
                remove.dataset
                  .removeMedia
              );


            state.media.splice(
              index,
              1
            );


            /*
             * Always maintain one
             * primary media if possible.
             */

            if (
              state.media.length &&
              !state.media.some(
                (
                  media
                ) =>
                  media.primary
              )
            ) {

              state.media[0]
                .primary =
                true;
            }


            markDirty();

            renderMedia();

            updateChecklist();
          }
        }
      );


    /*
     * Media alt text
     */

    $('#mediaList')
      ?.addEventListener(
        'input',
        (event) => {

          const index =
            Number(
              event.target.dataset
                .mediaAlt
            );


          if (
            state.media[index]
          ) {

            state.media[index]
              .alt_text =
              event.target.value;

            markDirty();
          }
        }
      );


    /*
     * AI suggestions
     */

    $('#aiSuggestions')
      ?.addEventListener(
        'click',
        (event) => {

          const button =
            event.target.closest(
              '[data-ai-apply]'
            );


          if (!button) {
            return;
          }


          const index =
            Number(
              button.dataset
                .aiApply
            );


          const suggestion =
            state.aiSuggestions?.[
              index
            ];


          if (
            !suggestion
          ) {
            return;
          }


          if (
            suggestion.field &&
            document.getElementById(
              suggestion.field
            )
          ) {

            const field =
              document.getElementById(
                suggestion.field
              );


            field.value =
              suggestion.value ||
              '';


            field.dispatchEvent(
              new Event(
                'input',
                {
                  bubbles: true
                }
              )
            );


            markDirty();

            updateChecklist();
          }
        }
      );


    /*
     * Service cards
     */

    $('#serviceGrid')
      ?.addEventListener(
        'click',
        (event) => {

          const edit =
            event.target.closest(
              '.edit-service'
            );


          const duplicate =
            event.target.closest(
              '.duplicate-service'
            );


          const more =
            event.target.closest(
              '.service-more'
            );


          if (
            edit
          ) {

            const service =
              state.services.find(
                (
                  item
                ) =>
                  String(
                    item.id
                  ) ===
                  String(
                    edit.dataset.id
                  )
              );


            if (
              service
            ) {

              openWizard(
                service
              );
            }

            return;
          }


          if (
            duplicate
          ) {

            duplicateService(
              duplicate.dataset.id
            );

            return;
          }


          if (
            more
          ) {

            openServiceActions(
              more.dataset.id
            );
          }
        }
      );


    /*
     * Command palette
     */

    $('#commandBtn')
      ?.addEventListener(
        'click',
        openCommand
      );


    $('#closeCommand')
      ?.addEventListener(
        'click',
        closeCommand
      );


    $('#commandInput')
      ?.addEventListener(
        'input',
        renderCommand
      );


    $('#commandResults')
      ?.addEventListener(
        'click',
        (event) => {

          const button =
            event.target.closest(
              '[data-command-index]'
            );


          if (!button) {
            return;
          }


          const index =
            Number(
              button.dataset
                .commandIndex
            );


          state.commandResults[
            index
          ]?.action();
        }
      );


    /*
     * Keyboard shortcuts
     */

    document.addEventListener(
      'keydown',
      (event) => {

        if (
          (
            event.ctrlKey ||
            event.metaKey
          ) &&
          event.key
            .toLowerCase() ===
            'k'
        ) {

          event.preventDefault();

          openCommand();

          return;
        }


        if (
          event.key ===
          'Escape'
        ) {

          closeCommand();

          return;
        }


        if (
          event.key ===
          '/' &&
          ![
            'INPUT',
            'TEXTAREA',
            'SELECT'
          ].includes(
            document.activeElement
              ?.tagName
          )
        ) {

          event.preventDefault();

          $('#serviceSearch')
            ?.focus();
        }
      }
    );


    /*
     * Unsaved changes warning
     */

    window.addEventListener(
      'beforeunload',
      (event) => {

        if (
          state.dirty
        ) {

          event.preventDefault();

          event.returnValue =
            '';
        }
      }
    );


    /*
     * Nudge close
     */

    $('#closeNudge')
      ?.addEventListener(
        'click',
        () =>
          $('#aiNudge')
            ?.classList.add(
              'hidden'
            )
      );
  }


  /* =========================================================
     LOCAL MEDIA
  ========================================================= */

  function addLocalMedia(
    files
  ) {

    const validFiles =
      files.filter(
        (file) =>
          file.type.startsWith(
            'image/'
          ) ||
          file.type.startsWith(
            'video/'
          )
      );


    if (
      !validFiles.length
    ) {

      toast(
        'Only image and video files are supported.',
        'bad'
      );

      return;
    }


    validFiles.forEach(
      (
        file
      ) => {

        const url =
          URL.createObjectURL(
            file
          );


        state.media.push({

          file,

          url,

          type:
            file.type.startsWith(
              'video/'
            )
              ? 'video'
              : 'image',

          alt_text:
            file.name
              .replace(
                /\.[^.]+$/,
                ''
              ),

          primary:
            state.media.length ===
            0,

          local_only:
            true
        });
      }
    );


    markDirty();

    renderMedia();

    updateChecklist();


    toast(
      `${validFiles.length} media item${
        validFiles.length ===
        1
          ? ''
          : 's'
      } added.`,
      'ok'
    );
  }


  /* =========================================================
     SERVICE ACTIONS
  ========================================================= */

  function openServiceActions(
    serviceId
  ) {

    const service =
      state.services.find(
        (item) =>
          String(
            item.id
          ) ===
          String(
            serviceId
          )
      );


    if (!service) {
      return;
    }


    const action =
      window.prompt(
        `Service: ${service.name}\n\nType one:\nEDIT\nDUPLICATE\nARCHIVE\nDELETE`
      );


    if (!action) {
      return;
    }


    const normalized =
      action
        .trim()
        .toLowerCase();


    if (
      normalized ===
      'edit'
    ) {

      openWizard(
        service
      );

    } else if (
      normalized ===
      'duplicate'
    ) {

      duplicateService(
        serviceId
      );

    } else if (
      normalized ===
      'archive'
    ) {

      archiveService(
        serviceId
      );

    } else if (
      normalized ===
      'delete'
    ) {

      deleteService(
        serviceId
      );

    } else {

      toast(
        'Unknown action.',
        'bad'
      );
    }
  }


  /* =========================================================
     STEP NAVIGATION
  ========================================================= */

  function setStep(
    step
  ) {

    const safeStep =
      Math.max(
        1,
        Math.min(
          5,
          Number(step)
        )
      );


    state.step =
      safeStep;


    $$('.wizard-step')
      .forEach(
        (panel) => {

          const panelStep =
            Number(
              panel.dataset
                .panel
            );


          panel.classList.toggle(
            'active',
            panelStep ===
              safeStep
          );
        }
      );


    $$('.stepper .step')
      .forEach(
        (item) => {

          const itemStep =
            Number(
              item.dataset
                .step
            );


          item.classList.toggle(
            'active',
            itemStep ===
              safeStep
          );


          item.classList.toggle(
            'done',
            itemStep <
              safeStep
          );
        }
      );


    $('#prevStep')
      ?.classList.toggle(
        'hidden',
        safeStep ===
          1
      );


    $('#nextStep')
      ?.classList.toggle(
        'hidden',
        safeStep ===
          5
      );


    $('#publishBtn')
      ?.classList.toggle(
        'hidden',
        safeStep !==
          5
      );


    $('#saveDraftBtn')
      ?.classList.toggle(
        'hidden',
        safeStep ===
          5
      );


    if (
      safeStep ===
      5
    ) {

      updateChecklist();
    }
  }


  /* =========================================================
     LOGOUT
  ========================================================= */

  $('#logoutBtn')
    ?.addEventListener(
      'click',
      async () => {

        try {

          await supabaseClient
            .auth
            .signOut({
              scope:
                'local'
            });

        } finally {

          location.replace(
            'login.html'
          );
        }
      }
    );


  /* =========================================================
     START
  ========================================================= */

  init();

})();
