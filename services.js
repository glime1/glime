const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  user: null,
  client: null,
  catalog: null,
  types: [],
  categories: [],
  services: [],
  category: 'all',
  search: '',
  status: 'all',
  step: 1,
  offerId: null,
  versionId: null,
  variants: [],
  media: [],
  days: [],
  capabilities: {},
  customFields: [],
  customValues: {}
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const esc = v =>
  String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));

const slugify = v =>
  String(v || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);

const money = (v, c = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: c,
    maximumFractionDigits: 2
  }).format(Number(v || 0));

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;

  const host = $('#toastHost');
  if (host) host.appendChild(el);

  setTimeout(() => el.remove(), 3200);
}

function setBoot(v) {
  const el = $('#bootScreen');
  if (el) el.style.display = v ? 'flex' : 'none';
}

function showAlert(msg, success = false) {
  const el = $('#wizardAlert');
  if (!el) return;

  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
  el.classList.toggle('success', success);
}

async function getToken() {
  const { data } = await supabaseClient.auth.getSession();
  return data?.session?.access_token || '';
}

async function edge(slug, body) {
  const token = await getToken();

  if (!token) {
    throw new Error('Active login session is missing.');
  }

  const r = await fetch(
    `${SUPABASE_URL}/functions/v1/${slug}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );

  const j = await r.json().catch(() => ({}));

  if (!r.ok || j.ok === false) {
    throw new Error(
      typeof j.error === 'string'
        ? j.error
        : j.error?.message || 'Request failed.'
    );
  }

  return j;
}

/* =========================================================
   INIT
========================================================= */

async function init() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error || !data.session?.user) {
      location.replace('login.html');
      return;
    }

    state.user = data.session.user;

    const { data: client, error: ce } =
      await supabaseClient
        .from('client_data')
        .select(
          'id,client_id,auth_user_id,business_name,client_name,full_name,name'
        )
        .eq('auth_user_id', state.user.id)
        .limit(1)
        .maybeSingle();

    if (ce || !client?.client_id) {
      throw new Error('Client profile not found.');
    }

    state.client = client;

    $('#businessName').textContent =
      client.business_name ||
      client.client_name ||
      client.full_name ||
      client.name ||
      'Business';

    $('#clientId').textContent = client.client_id;

    await Promise.all([
      loadFoundation(),
      loadCategories(),
      loadServices(),
      loadCustomFields()
    ]);

    bindUI();
    renderAll();
    setBoot(false);
  } catch (e) {
    console.error(e);
    toast(e.message, 'bad');

    setTimeout(
      () => location.replace('dashboard.html'),
      1400
    );
  }
}

/* =========================================================
   FOUNDATION / TYPES
========================================================= */

async function loadFoundation() {
  const j = await edge(
    'services-foundation',
    {
      action: 'get'
    }
  );

  state.catalog = j.catalog || null;

  state.types = (j.types || [])
    .filter(x => x.is_active || x.source === 'system');

  fillTypeSelect();
}

/* =========================================================
   CATEGORIES
   GLOBAL + TENANT PRIVATE
========================================================= */

async function loadCategories() {
  const { data, error } =
    await supabaseClient
      .from('offer_categories')
      .select(
        'id,name,slug,description,sort_order,is_active,is_global'
      )
      .eq('is_active', true)
      .or(
        `is_global.eq.true,client_id.eq.${state.client.client_id}`
      )
      .order('sort_order', { ascending: true })
      .order('name');

  if (error) throw error;

  state.categories = data || [];

  renderCategories();
}

/* =========================================================
   CUSTOM FIELDS
========================================================= */

async function loadCustomFields() {
  const { data, error } =
    await supabaseClient
      .from('custom_field_defs')
      .select(
        'id,name,field_key,field_type,label,description,options,is_required,is_active,sort_order'
      )
      .eq('client_id', state.client.client_id)
      .eq('is_active', true)
      .order('sort_order')
      .order('label');

  if (error) throw error;

  state.customFields = data || [];

  renderDynamicFields();
}

function renderDynamicFields() {
  const host = $('#dynamicFields');

  if (!host) return;

  host.innerHTML = state.customFields
    .map(f => {
      const v = state.customValues[f.id] ?? '';

      const opts =
        Array.isArray(f.options?.options)
          ? f.options.options
          : [];

      let control = '';

      if (f.field_type === 'select') {
        control = `
          <select data-cf="${f.id}">
            <option value="">Select…</option>
            ${opts
              .map(
                o =>
                  `<option value="${esc(o)}"
                    ${
                      String(v) === String(o)
                        ? 'selected'
                        : ''
                    }>
                    ${esc(o)}
                  </option>`
              )
              .join('')}
          </select>
        `;
      } else if (f.field_type === 'textarea') {
        control = `
          <textarea
            data-cf="${f.id}"
            rows="4"
          >${esc(v)}</textarea>
        `;
      } else {
        control = `
          <input
            data-cf="${f.id}"
            type="${
              f.field_type === 'number'
                ? 'number'
                : 'text'
            }"
            value="${esc(v)}"
          >
        `;
      }

      return `
        <label class="dynamic-card">
          <span>
            ${esc(f.label)}
            ${f.is_required ? '<em>*</em>' : ''}
          </span>

          ${
            f.description
              ? `<small>${esc(f.description)}</small>`
              : ''
          }

          ${control}
        </label>
      `;
    })
    .join('');
}

/* =========================================================
   STRUCTURED DATA
========================================================= */

async function loadStructured() {
  if (!state.versionId) return;

  const [
    vr,
    ar,
    mr,
    cr
  ] = await Promise.all([
    supabaseClient
      .from('offer_variants')
      .select(
        'id,name,sku,description,attributes,is_active,sort_order'
      )
      .eq('offer_version_id', state.versionId)
      .order('sort_order'),

    supabaseClient
      .from('offer_availability')
      .select(
        'id,day_of_week,start_time,end_time,timezone,capacity,is_available,notes'
      )
      .eq('offer_version_id', state.versionId)
      .order('day_of_week'),

    supabaseClient
      .from('offer_media')
      .select(
        'id,media_type,storage_path,file_url,alt_text,sort_order,is_primary,metadata'
      )
      .eq('offer_version_id', state.versionId)
      .order('sort_order'),

    supabaseClient
      .from('custom_field_values')
      .select(
        'field_def_id,value_text,value_json'
      )
      .eq('offer_version_id', state.versionId)
  ]);

  if (vr.error) throw vr.error;
  if (ar.error) throw ar.error;
  if (mr.error) throw mr.error;
  if (cr.error) throw cr.error;

  state.variants =
    (vr.data || []).map(v => ({
      id: v.id,
      name: v.name,
      sku: v.sku || '',
      price: v.attributes?.price || '',
      description: v.description || ''
    }));

  state.days = ar.data || [];

  state.media =
    (mr.data || []).map(m => ({
      id: m.id,
      url: m.file_url || '',
      alt: m.alt_text || '',
      primary: m.is_primary,
      type: m.media_type
    }));

  state.customValues = {};

  (cr.data || []).forEach(v => {
    state.customValues[v.field_def_id] =
      v.value_text ?? v.value_json ?? '';
  });

  renderVariants();
  renderMedia();
  renderDynamicFields();
  renderDaysFromState();
}

function renderDaysFromState() {
  if (!state.days.length) {
    renderDays();
    return;
  }

  const map = new Map(
    state.days.map(d => [
      Number(d.day_of_week),
      d
    ])
  );

  $$('#dayRows [data-day-start]')
    .forEach(el => {
      const d = map.get(
        Number(el.dataset.dayStart)
      );

      if (d) {
        el.value =
          (d.start_time || '').slice(0, 5);
      }
    });

  $$('#dayRows [data-day-end]')
    .forEach(el => {
      const d = map.get(
        Number(el.dataset.dayEnd)
      );

      if (d) {
        el.value =
          (d.end_time || '').slice(0, 5);
      }
    });

  $$('#dayRows [data-day-on]')
    .forEach(el => {
      const d = map.get(
        Number(el.dataset.dayOn)
      );

      if (d) {
        el.checked = !!d.is_available;
      }
    });
}

/* =========================================================
   STATUS
========================================================= */

function derivedStatus(s) {
  const vs = s.version?.status || '';

  if (
    vs === 'published' ||
    s.status === 'active'
  ) {
    return 'published';
  }

  if (
    vs === 'review' ||
    vs === 'approved'
  ) {
    return 'review';
  }

  if (
    vs === 'archived' ||
    s.status === 'archived'
  ) {
    return 'archived';
  }

  return 'draft';
}

/* =========================================================
   SAVE STRUCTURED DATA
========================================================= */

async function saveStructured() {
  if (!state.versionId) return;

  /* ---------- VARIANTS ---------- */

  const variantRows =
    state.variants
      .filter(v => v.name.trim())
      .map((v, i) => ({
        offer_version_id: state.versionId,
        name: v.name.trim(),
        sku: v.sku?.trim() || null,
        description:
          v.description?.trim() || null,
        attributes: {
          price:
            v.price === ''
              ? null
              : Number(v.price)
        },
        is_active: true,
        sort_order: i
      }));

  const oldV =
    await supabaseClient
      .from('offer_variants')
      .select('id')
      .eq(
        'offer_version_id',
        state.versionId
      );

  if (oldV.error) throw oldV.error;

  if (oldV.data?.length) {
    const del =
      await supabaseClient
        .from('offer_variants')
        .delete()
        .eq(
          'offer_version_id',
          state.versionId
        );

    if (del.error) throw del.error;
  }

  if (variantRows.length) {
    const r =
      await supabaseClient
        .from('offer_variants')
        .insert(variantRows);

    if (r.error) throw r.error;
  }

  /* ---------- AVAILABILITY ---------- */

  const days =
    $$('#dayRows [data-day-start]')
      .map(el => {
        const i =
          Number(el.dataset.dayStart);

        const end =
          $(
            `#dayRows [data-day-end="${i}"]`
          )?.value || '';

        const on =
          $(
            `#dayRows [data-day-on="${i}"]`
          )?.checked;

        return {
          offer_version_id:
            state.versionId,

          day_of_week: i,

          start_time:
            on && el.value
              ? el.value
              : null,

          end_time:
            on && end
              ? end
              : null,

          timezone:
            $('#fTimezone').value ||
            'Asia/Kolkata',

          is_available: !!on
        };
      });

  const deleteAvailability =
    await supabaseClient
      .from('offer_availability')
      .delete()
      .eq(
        'offer_version_id',
        state.versionId
      );

  if (deleteAvailability.error) {
    throw deleteAvailability.error;
  }

  const ad =
    await supabaseClient
      .from('offer_availability')
      .insert(days);

  if (ad.error) throw ad.error;

  /* ---------- CUSTOM FIELD VALUES ---------- */

  const vals =
    Object.entries(state.customValues)
      .filter(
        ([_, v]) =>
          v !== '' &&
          v != null
      )
      .map(
        ([field_def_id, value_text]) => ({
          offer_version_id:
            state.versionId,

          field_def_id,

          value_text:
            String(value_text),

          value_json: null
        })
      );

  const deleteValues =
    await supabaseClient
      .from('custom_field_values')
      .delete()
      .eq(
        'offer_version_id',
        state.versionId
      );

  if (deleteValues.error) {
    throw deleteValues.error;
  }

  if (vals.length) {
    const cv =
      await supabaseClient
        .from('custom_field_values')
        .insert(vals);

    if (cv.error) throw cv.error;
  }
}

/* =========================================================
   LOAD SERVICES
========================================================= */

async function loadServices() {
  const { data, error } =
    await supabaseClient
      .from('offers')
      .select(
        'id,client_id,name,slug,short_description,description,category_id,status,offer_type,current_version_id,updated_at'
      )
      .eq(
        'client_id',
        state.client.client_id
      )
      .order(
        'updated_at',
        { ascending: false }
      );

  if (error) throw error;

  const ids =
    (data || [])
      .map(
        x => x.current_version_id
      )
      .filter(Boolean);

  let versions = [];
  let prices = [];

  if (ids.length) {
    const vr =
      await supabaseClient
        .from('offer_versions')
        .select(
          'id,offer_id,version_number,status,title,description,metadata'
        )
        .in('id', ids);

    if (vr.error) throw vr.error;

    versions = vr.data || [];

    const pr =
      await supabaseClient
        .from('offer_prices')
        .select(
          'offer_version_id,amount,currency,price_type,billing_period,is_active'
        )
        .in(
          'offer_version_id',
          ids
        )
        .eq(
          'is_active',
          true
        );

    if (pr.error) throw pr.error;

    prices = pr.data || [];
  }

  const vm = new Map(
    versions.map(v => [
      v.id,
      v
    ])
  );

  const pm = new Map(
    prices.map(p => [
      p.offer_version_id,
      p
    ])
  );

  state.services =
    (data || []).map(o => ({
      ...o,
      version:
        vm.get(
          o.current_version_id
        ) || null,
      price:
        pm.get(
          o.current_version_id
        ) || null
    }));
}

/* =========================================================
   SELECTS
========================================================= */

function fillTypeSelect() {
  const sel = $('#fType');

  if (!sel) return;

  sel.innerHTML =
    state.types
      .map(
        t =>
          `<option value="${esc(
            t.type_key
          )}">
            ${esc(t.label)}
          </option>`
      )
      .join('');

  updateCapabilities();
}

function fillCategorySelect() {
  $('#fCategory').innerHTML =
    '<option value="">No category</option>' +
    state.categories
      .map(
        c =>
          `<option value="${c.id}">
            ${esc(c.name)}
          </option>`
      )
      .join('');
}

/* =========================================================
   CATEGORY SIDEBAR
========================================================= */

function renderCategories() {
  $('#categoryCount').textContent =
    state.categories.length;

  const counts = {};

  state.services.forEach(s => {
    const key =
      s.category_id ||
      'uncategorized';

    counts[key] =
      (counts[key] || 0) + 1;
  });

  const items = [
    {
      id: 'all',
      name: 'All Services',
      n: state.services.length
    },

    {
      id: 'uncategorized',
      name: 'Uncategorized',
      n: counts.uncategorized || 0
    },

    ...state.categories.map(c => ({
      id: c.id,
      name: c.name,
      n: counts[c.id] || 0
    }))
  ];

  $('#categoryList').innerHTML =
    items
      .map(
        x =>
          `<button
            class="category-item ${
              state.category === x.id
                ? 'active'
                : ''
            }"
            data-category="${esc(x.id)}"
          >
            <span>${esc(x.name)}</span>
            <small>${x.n}</small>
          </button>`
      )
      .join('');
}

/* =========================================================
   FILTER
========================================================= */

function filtered() {
  const q =
    state.search
      .toLowerCase()
      .trim();

  return state.services.filter(s => {
    const cat =
      state.category === 'all' ||
      s.category_id ===
        state.category ||
      (
        state.category ===
          'uncategorized' &&
        !s.category_id
      );

    const ds =
      derivedStatus(s);

    const status =
      state.status === 'all' ||
      ds === state.status;

    const text =
      `${s.name} ${
        s.short_description || ''
      } ${
        s.description || ''
      }`.toLowerCase();

    return (
      cat &&
      status &&
      (!q || text.includes(q))
    );
  });
}

/* =========================================================
   SERVICE GRID
========================================================= */

function renderGrid() {
  const rows = filtered();

  const grid = $('#serviceGrid');
  const empty = $('#emptyState');

  $('#gridTitle').textContent =
    state.category === 'all'
      ? 'All Services'
      : (
          state.categories.find(
            c =>
              c.id ===
              state.category
          )?.name ||
          'Uncategorized'
        );

  $('#gridMeta').textContent =
    `${rows.length} service${
      rows.length === 1
        ? ''
        : 's'
    } · no page reload`;

  grid.innerHTML =
    rows
      .map(
        (s, i) => {
          const status =
            derivedStatus(s);

          return `
            <article
              class="service-card"
              style="animation-delay:${i * 35}ms"
            >

              <div class="service-media">
                <span>✦</span>

                <span
                  class="service-status ${esc(
                    status
                  )}"
                >
                  ${
                    status ===
                    'published'
                      ? 'Published'
                      : status ===
                        'review'
                      ? 'In review'
                      : status ===
                        'archived'
                      ? 'Archived'
                      : 'Draft'
                  }
                </span>
              </div>

              <div class="service-body">

                <div class="service-category">
                  ${esc(
                    (
                      state.categories.find(
                        c =>
                          c.id ===
                          s.category_id
                      ) || {}
                    ).name ||
                      'GENERAL'
                  )}
                </div>

                <h3 title="${esc(
                  s.name
                )}">
                  ${esc(s.name)}
                </h3>

                <p>
                  ${esc(
                    s.short_description ||
                      s.description ||
                      'No description yet.'
                  )}
                </p>

                <div class="service-meta">
                  <strong class="price">
                    ${
                      s.price
                        ? money(
                            s.price.amount,
                            s.price.currency
                          )
                        : 'Price not set'
                    }
                  </strong>

                  <span class="meta-small">
                    ${esc(
                      s.offer_type ||
                        'service'
                    )}
                  </span>
                </div>

                <div class="card-actions">
                  <button
                    class="secondary-btn edit-service"
                    data-id="${s.id}"
                  >
                    Open
                  </button>

                  <button
                    class="ghost-btn duplicate-service"
                    data-id="${s.id}"
                  >
                    Duplicate
                  </button>
                </div>

              </div>
            </article>
          `;
        }
      )
      .join('');

  empty.classList.toggle(
    'hidden',
    rows.length > 0
  );

  grid.classList.toggle(
    'hidden',
    rows.length === 0
  );
}

function renderAll() {
  fillCategorySelect();
  renderCategories();
  renderGrid();
  updateNudge();
}

/* =========================================================
   AI NUDGE
========================================================= */

function updateNudge() {
  const incomplete =
    state.services.filter(
      s =>
        s.status === 'draft' &&
        (
          !s.description ||
          !s.price
        )
    ).length;

  if (incomplete) {
    $('#aiNudge')
      .classList
      .remove('hidden');

    $('#nudgeText').textContent =
      `${incomplete} draft service${
        incomplete === 1
          ? ' is'
          : 's are'
      } missing key business information.`;
  } else {
    $('#aiNudge')
      .classList
      .add('hidden');
  }
}

/* =========================================================
   WIZARD
========================================================= */

function openWizard(service = null) {
  resetWizard(service);

  $('#wizardOverlay')
    .classList
    .remove('hidden');

  document.body.style.overflow =
    'hidden';

  setStep(1);
}

function closeWizard() {
  $('#wizardOverlay')
    .classList
    .add('hidden');

  document.body.style.overflow = '';
}

function resetWizard(service) {
  state.offerId =
    service?.id || null;

  state.versionId =
    service?.version?.status ===
    'draft'
      ? service?.current_version_id
      : null;

  state.variants = [];
  state.media = [];

  state.customValues = {};

  $('#wizardTitle').textContent =
    service
      ? 'Edit service'
      : 'Create service';

  $('#fName').value =
    service?.name || '';

  $('#fShort').value =
    service?.short_description ||
    '';

  $('#fDescription').value =
    service?.description ||
    service?.version?.description ||
    '';

  $('#fCategory').value =
    service?.category_id || '';

  $('#fType').value =
    service?.offer_type ||
    'service';

  $('#fPrice').value =
    service?.price?.amount || '';

  $('#fCurrency').value =
    service?.price?.currency ||
    'INR';

  $('#fPriceType').value =
    service?.price?.price_type ===
    'starting_at'
      ? 'starting_from'
      : (
          service?.price?.price_type ||
          'fixed'
        );

  $('#fBilling').value =
    service?.price?.billing_period ||
    '';

  $('#fDuration').value = '';

  $('#fKnowledge').value =
    service?.version?.metadata
      ?.ai_knowledge_summary ||
    '';

  renderVariants();
  renderMedia();
  renderDays();
  updateCapabilities();
  updateChecklist();
  showAlert('');

  if (
    service?.id &&
    state.versionId
  ) {
    loadStructured()
      .catch(e =>
        showAlert(e.message)
      );
  }
}

function setStep(n) {
  state.step = n;

  $$('.wizard-step')
    .forEach(x =>
      x.classList.toggle(
        'active',
        Number(
          x.dataset.panel
        ) === n
      )
    );

  $$('.stepper .step')
    .forEach(x => {
      const s =
        Number(x.dataset.step);

      x.classList.toggle(
        'active',
        s === n
      );

      x.classList.toggle(
        'done',
        s < n
      );
    });

  $('#prevStep')
    .classList.toggle(
      'hidden',
      n === 1
    );

  $('#nextStep')
    .classList.toggle(
      'hidden',
      n === 5
    );

  $('#publishBtn')
    .classList.toggle(
      'hidden',
      n !== 5
    );

  $('#saveDraftBtn')
    .classList.toggle(
      'hidden',
      n === 5
    );

  if (n === 5) {
    updateChecklist();
  }
}

/* =========================================================
   VALIDATION
========================================================= */

function validateStep(n) {
  if (n === 1) {
    if (
      !$('#fName')
        .value
        .trim()
    ) {
      return 'Service name is required.';
    }

    if (!$('#fType').value) {
      return 'Choose a catalog type.';
    }

    return '';
  }

  if (n === 2) {
    if (
      $('#fPrice').value === '' ||
      Number(
        $('#fPrice').value
      ) < 0
    ) {
      return 'A valid price is required.';
    }
  }

  return '';
}

/* =========================================================
   SAVE DRAFT
========================================================= */

async function saveDraft(silent = false) {
  try {
    const stepErr =
      validateStep(
        Math.min(state.step, 2)
      );

    if (stepErr) {
      showAlert(stepErr);
      return false;
    }

    const name =
      $('#fName')
        .value
        .trim();

    const type =
      $('#fType').value ||
      'service';

    const newSlug =
      slugify(name) +
      '-' +
      Math.random()
        .toString(36)
        .slice(2, 8);

    const payload = {
      client_id:
        state.client.client_id,

      offer_type: type,

      name,

      slug: newSlug,

      short_description:
        $('#fShort')
          .value
          .trim(),

      description:
        $('#fDescription')
          .value
          .trim(),

      category_id:
        $('#fCategory').value ||
        null,

      status: 'draft',

      current_version_id: null
    };

    let offer;

    /* ---------- EXISTING OFFER ---------- */

    if (state.offerId) {
      const updatePayload = {
        client_id:
          state.client.client_id,

        offer_type: type,

        name,

        short_description:
          $('#fShort')
            .value
            .trim(),

        description:
          $('#fDescription')
            .value
            .trim(),

        category_id:
          $('#fCategory').value ||
          null,

        status: 'draft'
      };

      const u =
        await supabaseClient
          .from('offers')
          .update(updatePayload)
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

      if (u.error) {
        throw u.error;
      }

      offer = u.data;
    }

    /* ---------- NEW OFFER ---------- */

    else {
      const ins =
        await supabaseClient
          .from('offers')
          .insert(payload)
          .select()
          .single();

      if (ins.error) {
        throw ins.error;
      }

      offer = ins.data;

      state.offerId =
        offer.id;
    }

    /* ---------- VERSION ---------- */

    if (!state.versionId) {
      const latest =
        await supabaseClient
          .from('offer_versions')
          .select(
            'version_number'
          )
          .eq(
            'offer_id',
            offer.id
          )
          .order(
            'version_number',
            {
              ascending: false
            }
          )
          .limit(1)
          .maybeSingle();

      if (latest.error) {
        throw latest.error;
      }

      const nextVersion =
        Number(
          latest.data
            ?.version_number || 0
        ) + 1;

      const ins =
        await supabaseClient
          .from('offer_versions')
          .insert({
            offer_id:
              offer.id,

            version_number:
              nextVersion,

            status: 'draft',

            title: name,

            description:
              $('#fDescription')
                .value
                .trim(),

            metadata: {
              ai_knowledge_summary:
                $('#fKnowledge')
                  .value
                  .trim()
            }
          })
          .select()
          .single();

      if (ins.error) {
        throw ins.error;
      }

      state.versionId =
        ins.data.id;

      const up =
        await supabaseClient
          .from('offers')
          .update({
            current_version_id:
              ins.data.id
          })
          .eq(
            'id',
            offer.id
          );

      if (up.error) {
        throw up.error;
      }
    }

    /* ---------- EXISTING VERSION ---------- */

    else {
      const up =
        await supabaseClient
          .from('offer_versions')
          .update({
            title: name,

            description:
              $('#fDescription')
                .value
                .trim(),

            metadata: {
              ai_knowledge_summary:
                $('#fKnowledge')
                  .value
                  .trim()
            }
          })
          .eq(
            'id',
            state.versionId
          );

      if (up.error) {
        throw up.error;
      }
    }

    /* ---------- PRICE ---------- */

    const price =
      Number(
        $('#fPrice').value || 0
      );

    const old =
      await supabaseClient
        .from('offer_prices')
        .select('id')
        .eq(
          'offer_version_id',
          state.versionId
        )
        .limit(1)
        .maybeSingle();

    if (old.error) {
      throw old.error;
    }

    const priceType =
      $('#fPriceType').value ||
      'fixed';

    const priceRow = {
      offer_version_id:
        state.versionId,

      amount: price,

      currency:
        $('#fCurrency').value ||
        'INR',

      price_type:
        priceType === 'starting_at'
          ? 'starting_from'
          : priceType,

      billing_period:
        $('#fBilling').value ||
        null,

      is_active: true
    };

    if (old.data) {
      const u =
        await supabaseClient
          .from('offer_prices')
          .update(priceRow)
          .eq(
            'id',
            old.data.id
          );

      if (u.error) {
        throw u.error;
      }
    } else {
      const i =
        await supabaseClient
          .from('offer_prices')
          .insert(priceRow);

      if (i.error) {
        throw i.error;
      }
    }

    await saveStructured();

    await loadServices();

    renderAll();

    if ($('#saveState1') ) {
      $('#saveState1').textContent =
        'Saved';
    }

    if (!silent) {
      toast(
        'Draft saved',
        'ok'
      );
    }

    return true;

  } catch (e) {
    console.error(e);

    showAlert(
      e.message ||
      'Draft could not be saved.'
    );

    return false;
  }
}

/* =========================================================
   PUBLISH / REVIEW
========================================================= */

async function submitPublish() {
  const missing = [];

  if (
    !$('#fName')
      .value
      .trim()
  ) {
    missing.push(
      'service name'
    );
  }

  if (
    !$('#fDescription')
      .value
      .trim()
  ) {
    missing.push(
      'description'
    );
  }

  if (
    $('#fPrice').value === '' ||
    Number(
      $('#fPrice').value
    ) < 0
  ) {
    missing.push('price');
  }

  if (missing.length) {
    showAlert(
      `Complete before publishing: ${missing.join(', ')}.`
    );

    return;
  }

  if (
    !state.offerId ||
    !state.versionId
  ) {
    const ok =
      await saveDraft(true);

    if (!ok) return;
  }

  try {
    /*
      Structured data must be saved
      while version is still draft.
    */

    await saveStructured();

    const u =
      await supabaseClient
        .from('offer_versions')
        .update({
          status: 'review',

          title:
            $('#fName')
              .value
              .trim(),

          description:
            $('#fDescription')
              .value
              .trim(),

          metadata: {
            ai_knowledge_summary:
              $('#fKnowledge')
                .value
                .trim()
          }
        })
        .eq(
          'id',
          state.versionId
        );

    if (u.error) {
      throw u.error;
    }

    /*
      Important:
      offers.status stays draft during review.
      review is stored on offer_versions.
    */

    if (
      (
        state.user.email ||
        ''
      ).toLowerCase() ===
      'admin@glime.online'
    ) {
      try {
        await edge(
          'services-offer-approval',
          {
            action: 'approve',
            version_id:
              state.versionId
          }
        );

        await edge(
          'services-offer-approval',
          {
            action: 'publish',
            version_id:
              state.versionId
          }
        );

        toast(
          'Service published',
          'ok'
        );

      } catch (e) {
        console.warn(e);

        toast(
          'Submitted for review. Admin publish step is still pending.',
          'ok'
        );
      }

    } else {
      toast(
        'Service submitted for GLIME review.',
        'ok'
      );
    }

    await loadServices();

    renderAll();

    closeWizard();

  } catch (e) {
    console.error(e);

    showAlert(
      e.message ||
      'Publish submission failed.'
    );
  }
}

/* =========================================================
   CAPABILITIES
========================================================= */

function updateCapabilities() {
  const t =
    state.types.find(
      x =>
        x.type_key ===
        $('#fType')?.value
    ) || {};

  state.capabilities =
    t.capabilities || {};

  const c =
    state.capabilities;

  $('#capabilityNote').innerHTML = `
    <span>✦</span>

    <div>
      <strong>
        ${esc(
          t.label ||
          'Service'
        )}
        configuration
      </strong>

      <p>
        ${
          c.duration
            ? 'Duration enabled · '
            : ''
        }

        ${
          c.variants
            ? 'Variants enabled · '
            : ''
        }

        ${
          c.availability
            ? 'Availability enabled · '
            : ''
        }

        ${
          c.booking
            ? 'Booking enabled · '
            : ''
        }

        ${
          !Object.keys(c).length
            ? 'Standard fields only.'
            : ''
        }
      </p>
    </div>
  `;

  $('#availabilityDisabled')
    .classList.toggle(
      'hidden',
      !!c.availability
    );

  $('#availabilityEditor')
    .classList.toggle(
      'hidden',
      !c.availability
    );

  const durationField =
    $('#fDuration')?.closest(
      '.field'
    );

  if (durationField) {
    durationField.style.display =
      c.duration
        ? 'block'
        : 'none';
  }

  const subsection =
    document.querySelector(
      '[data-panel="2"] .subsection-head'
    );

  if (subsection) {
    subsection.style.display =
      c.variants
        ? 'flex'
        : 'none';
  }

  $('#variantList').style.display =
    c.variants
      ? 'flex'
      : 'none';
}

/* =========================================================
   VARIANTS
========================================================= */

function renderVariants() {
  $('#variantList').innerHTML =
    state.variants
      .map(
        (v, i) =>
          `
          <div class="variant-row">

            <input
              data-v="name"
              data-i="${i}"
              value="${esc(v.name)}"
              placeholder="Variant name"
            >

            <input
              data-v="price"
              data-i="${i}"
              type="number"
              value="${esc(v.price || '')}"
              placeholder="Price"
            >

            <input
              data-v="sku"
              data-i="${i}"
              value="${esc(v.sku || '')}"
              placeholder="SKU"
            >

            <button
              class="remove-row"
              data-remove-variant="${i}"
            >
              ×
            </button>

          </div>
          `
      )
      .join('');
}

/* =========================================================
   DAYS
========================================================= */

function renderDays() {
  const names = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];

  $('#dayRows').innerHTML =
    names
      .map(
        (n, i) =>
          `
          <div class="day-row">

            <label>
              ${n}
            </label>

            <input
              type="time"
              data-day-start="${i}"
              value="${
                i < 6
                  ? '09:00'
                  : ''
              }"
            >

            <input
              type="time"
              data-day-end="${i}"
              value="${
                i < 6
                  ? '18:00'
                  : ''
              }"
            >

            <label>
              <input
                type="checkbox"
                data-day-on="${i}"
                ${
                  i < 6
                    ? 'checked'
                    : ''
                }
              >
              Available
            </label>

          </div>
          `
      )
      .join('');
}

/* =========================================================
   MEDIA
========================================================= */

function renderMedia() {
  $('#mediaList').innerHTML =
    state.media
      .map(
        (m, i) =>
          `
          <div class="media-item">

            <div class="media-thumb">
              ${
                m.url
                  ? `<img
                      src="${esc(m.url)}"
                      alt=""
                    >`
                  : '▶'
              }
            </div>

            <div class="media-info">

              <input
                value="${esc(
                  m.alt || ''
                )}"
                data-media-alt="${i}"
                placeholder="Alt text"
              >

              <div class="media-controls">

                <button
                  data-primary="${i}"
                  class="${
                    m.primary
                      ? 'primary-mini'
                      : ''
                  }"
                >
                  ${
                    m.primary
                      ? '★ Primary'
                      : 'Set primary'
                  }
                </button>

                <button
                  data-remove-media="${i}"
                >
                  Remove
                </button>

              </div>

            </div>
          </div>
          `
      )
      .join('');

  const p =
    state.media.find(
      m => m.primary
    );

  $('#previewMedia').innerHTML =
    p?.url
      ? `<img
          src="${esc(p.url)}"
          alt=""
        >`
      : 'No primary media';
}

/* =========================================================
   CHECKLIST
========================================================= */

function updateChecklist() {
  const checks = [
    [
      'Service name',
      !!$('#fName').value.trim(),
      'Customer-facing name is present.'
    ],

    [
      'Description',
      !!$('#fDescription')
        .value
        .trim(),
      'Full business description is present.'
    ],

    [
      'Price',
      !!$('#fPrice').value &&
        Number(
          $('#fPrice').value
        ) >= 0,
      'A valid commercial price is configured.'
    ],

    [
      'Catalog type',
      !!$('#fType').value,
      'The service is assigned to a catalog type.'
    ]
  ];

  const ok =
    checks.filter(
      x => x[1]
    ).length;

  $('#checkCount').textContent =
    `${ok}/${checks.length}`;

  $('#publishChecklist').innerHTML =
    checks
      .map(
        x =>
          `
          <div
            class="check-row ${
              x[1] ? 'ok' : ''
            }"
          >

            <span class="check-icon">
              ${x[1] ? '✓' : '!'}
            </span>

            <div>
              <strong>
                ${esc(x[0])}
              </strong>

              <small>
                ${esc(x[2])}
              </small>
            </div>

          </div>
          `
      )
      .join('');

  $('#publishBtn').disabled =
    ok !== checks.length;

  $('#previewName').textContent =
    $('#fName')
      .value
      .trim() ||
    'Service name';

  $('#previewDescription')
    .textContent =
      $('#fDescription')
        .value
        .trim() ||
      'Description preview will appear here.';

  $('#previewPrice')
    .textContent =
      $('#fPrice').value
        ? money(
            $('#fPrice').value,
            $('#fCurrency').value
          )
        : '₹0';
}

/* =========================================================
   GLIME AI
========================================================= */

async function generateAI(targetId) {
  const el =
    $('#' + targetId);

  if (!el) return;

  const name =
    $('#fName')
      .value
      .trim();

  if (!name) {
    showAlert(
      'Enter the service name before using GLIME AI.'
    );

    return;
  }

  try {
    el.disabled = true;

    el.classList.add(
      'ai-loading'
    );

    const j =
      await edge(
        'services-ai',
        {
          action:
            'generate_service_field',

          client_id:
            state.client.client_id,

          field:
            targetId,

          service_name:
            name,

          description:
            $('#fDescription')
              .value
              .trim(),

          current_value:
            el.value
        }
      );

    const text =
      j.text ||
      j.content ||
      j.output ||
      j.result?.text ||
      '';

    if (text) {
      el.value =
        typeof text ===
        'string'
          ? text
          : JSON.stringify(text);
    }

    updateChecklist();

    toast(
      'GLIME AI updated the field',
      'ok'
    );

  } catch (e) {
    showAlert(
      e.message ||
      'GLIME AI request failed.'
    );

  } finally {
    el.disabled = false;

    el.classList.remove(
      'ai-loading'
    );
  }
}

/* =========================================================
   UI EVENTS
========================================================= */

function bindUI() {

  $('#openSidebar').onclick =
    () =>
      $('#sidebar')
        .classList
        .add('open');

  $('#closeSidebar').onclick =
    () =>
      $('#sidebar')
        .classList
        .remove('open');

  $('#logoutBtn').onclick =
    async () => {
      await supabaseClient
        .auth
        .signOut({
          scope: 'local'
        });

      location.replace(
        'login.html'
      );
    };

  $('#refreshBtn').onclick =
    async () => {
      await Promise.all([
        loadCategories(),
        loadServices()
      ]);

      renderAll();

      toast(
        'Catalog refreshed',
        'ok'
      );
    };

  $('#addServiceBtn').onclick =
    () => openWizard();

  $('#emptyAddBtn').onclick =
    () => openWizard();

  $('#serviceSearch').oninput =
    e => {
      state.search =
        e.target.value;

      renderGrid();
    };

  $('#statusFilter').onchange =
    e => {
      state.status =
        e.target.value;

      renderGrid();
    };

  $('#categoryList').onclick =
    e => {
      const b =
        e.target.closest(
          '[data-category]'
        );

      if (!b) return;

      state.category =
        b.dataset.category;

      renderCategories();
      renderGrid();
    };

  $('#closeNudge').onclick =
    () =>
      $('#aiNudge')
        .classList
        .add('hidden');

  $('#closeWizard').onclick =
    closeWizard;

  $('#wizardCancel').onclick =
    closeWizard;

  $('#prevStep').onclick =
    () =>
      setStep(
        Math.max(
          1,
          state.step - 1
        )
      );

  $('#nextStep').onclick =
    async () => {
      const err =
        validateStep(
          state.step
        );

      if (err) {
        showAlert(err);
        return;
      }

      if (
        state.step < 5
      ) {
        if (
          state.step === 1 ||
          state.step === 2
        ) {
          const saved =
            await saveDraft(
              true
            );

          if (!saved) return;
        }

        setStep(
          state.step + 1
        );
      }
    };

  $('#saveDraftBtn').onclick =
    () => saveDraft();

  $('#publishBtn').onclick =
    submitPublish;

  $('#fType').onchange =
    () => {
      updateCapabilities();
      updateChecklist();
    };

  $('#dynamicFields').oninput =
    e => {
      if (
        e.target.dataset.cf
      ) {
        state.customValues[
          e.target.dataset.cf
        ] =
          e.target.value;
      }
    };

  document
    .querySelectorAll(
      '[data-ai-target]'
    )
    .forEach(b => {
      b.onclick =
        () =>
          generateAI(
            b.dataset.aiTarget
          );
    });

  [
    'fName',
    'fDescription',
    'fPrice',
    'fCurrency',
    'fShort',
    'fKnowledge'
  ].forEach(id => {
    $('#' + id)?.addEventListener(
      'input',
      updateChecklist
    );
  });

  $('#addVariantBtn').onclick =
    () => {
      state.variants.push({
        name: '',
        price: '',
        sku: ''
      });

      renderVariants();
    };

  $('#variantList').oninput =
    e => {
      const i =
        Number(
          e.target.dataset.i
        );

      if (
        Number.isInteger(i) &&
        state.variants[i]
      ) {
        state.variants[i][
          e.target.dataset.v
        ] =
          e.target.value;
      }
    };

  $('#variantList').onclick =
    e => {
      const b =
        e.target.closest(
          '[data-remove-variant]'
        );

      if (b) {
        state.variants.splice(
          Number(
            b.dataset
              .removeVariant
          ),
          1
        );

        renderVariants();
      }
    };

  $('#chooseMediaBtn').onclick =
    () =>
      $('#mediaInput').click();

  $('#mediaInput').onchange =
    e =>
      handleFiles(
        [...e.target.files]
      );

  $('#uploadZone').ondragover =
    e => {
      e.preventDefault();

      $('#uploadZone')
        .classList
        .add('drag');
    };

  $('#uploadZone').ondragleave =
    () =>
      $('#uploadZone')
        .classList
        .remove('drag');

  $('#uploadZone').ondrop =
    e => {
      e.preventDefault();

      $('#uploadZone')
        .classList
        .remove('drag');

      handleFiles(
        [...e.dataTransfer.files]
      );
    };

  $('#mediaList').oninput =
    e => {
      const i =
        Number(
          e.target.dataset
            .mediaAlt
        );

      if (
        Number.isInteger(i) &&
        state.media[i]
      ) {
        state.media[i].alt =
          e.target.value;
      }
    };

  $('#mediaList').onclick =
    e => {
      const p =
        e.target.closest(
          '[data-primary]'
        );

      const r =
        e.target.closest(
          '[data-remove-media]'
        );

      if (p) {
        const index =
          Number(
            p.dataset.primary
          );

        state.media.forEach(
          (m, i) => {
            m.primary =
              i === index;
          }
        );

        renderMedia();
      }

      if (r) {
        state.media.splice(
          Number(
            r.dataset
              .removeMedia
          ),
          1
        );

        renderMedia();
      }
    };

  $$('.stepper .step')
    .forEach(b => {
      b.onclick =
        () => {
          const n =
            Number(
              b.dataset.step
            );

          if (
            n <= state.step
          ) {
            setStep(n);
          }
        };
    });

  $('#serviceGrid').onclick =
    e => {
      const edit =
        e.target.closest(
          '.edit-service'
        );

      const dup =
        e.target.closest(
          '.duplicate-service'
        );

      if (edit) {
        const s =
          state.services.find(
            x =>
              x.id ===
              edit.dataset.id
          );

        if (s) {
          openWizard(s);
        }
      }

      if (dup) {
        const s =
          state.services.find(
            x =>
              x.id ===
              dup.dataset.id
          );

        if (s) {
          openWizard({
            ...s,
            id: null,
            current_version_id:
              null,
            name:
              `${s.name} Copy`,
            status: 'draft',
            version: null
          });

          toast(
            'Duplicate opened as a new draft',
            'ok'
          );
        }
      }
    };

  $('#addCategoryBtn').onclick =
    addCategory;

  $('#commandBtn').onclick =
    openCommand;

  $('#closeCommand').onclick =
    closeCommand;

  $('#commandInput').oninput =
    renderCommand;

  $('#commandOverlay').onclick =
    e => {
      if (
        e.target ===
        $('#commandOverlay')
      ) {
        closeCommand();
      }
    };

  document.addEventListener(
    'keydown',
    e => {

      if (
        (e.ctrlKey ||
          e.metaKey) &&
        e.key.toLowerCase() ===
          'k'
      ) {
        e.preventDefault();
        openCommand();
      }

      if (
        e.key === 'Escape'
      ) {
        closeCommand();

        if (
          !$('#wizardOverlay')
            .classList
            .contains('hidden')
        ) {
          closeWizard();
        }
      }

      if (
        e.key === '/' &&
        document.activeElement.tagName !==
          'INPUT' &&
        document.activeElement.tagName !==
          'TEXTAREA'
      ) {
        e.preventDefault();

        $('#serviceSearch')
          .focus();
      }
    }
  );
}

/* =========================================================
   LOCAL MEDIA PREVIEW
========================================================= */

function handleFiles(files) {
  files
    .filter(
      f =>
        f.type.startsWith(
          'image/'
        ) ||
        f.type.startsWith(
          'video/'
        )
    )
    .forEach(file => {
      const url =
        URL.createObjectURL(
          file
        );

      state.media.push({
        file,
        url,
        alt:
          file.name.replace(
            /\.[^.]+$/,
            ''
          ),
        primary:
          state.media.length ===
          0
      });
    });

  renderMedia();

  toast(
    'Media added to this draft',
    'ok'
  );
}

/* =========================================================
   CATEGORY CREATE
========================================================= */

async function addCategory() {
  const name =
    prompt(
      'New category name'
    );

  if (!name?.trim()) {
    return;
  }

  const slug =
    slugify(name);

  const { error } =
    await supabaseClient
      .from(
        'offer_categories'
      )
      .insert({
        client_id:
          state.client.client_id,

        name:
          name.trim(),

        slug,

        sort_order:
          state.categories.length,

        is_active: true,

        is_global: false
      });

  if (error) {
    toast(
      error.message,
      'bad'
    );

    return;
  }

  await loadCategories();

  renderAll();

  toast(
    'Category created',
    'ok'
  );
}

/* =========================================================
   COMMAND PALETTE
========================================================= */

function openCommand() {
  $('#commandOverlay')
    .classList
    .remove('hidden');

  $('#commandInput').value =
    '';

  renderCommand();

  setTimeout(
    () =>
      $('#commandInput')
        .focus(),
    30
  );
}

function closeCommand() {
  $('#commandOverlay')
    .classList
    .add('hidden');
}

function renderCommand() {
  const q =
    $('#commandInput')
      .value
      .toLowerCase()
      .trim();

  const results = [];

  if (
    !q ||
    'add service'.includes(q)
  ) {
    results.push({
      title: 'Add Service',
      meta:
        'Create a new service',

      action: () => {
        closeCommand();
        openWizard();
      }
    });
  }

  state.services
    .filter(
      s =>
        !q ||
        s.name
          .toLowerCase()
          .includes(q)
    )
    .slice(0, 8)
    .forEach(s => {
      results.push({
        title: s.name,

        meta:
          `${derivedStatus(
            s
          )} · ${
            s.price
              ? money(
                  s.price.amount,
                  s.price.currency
                )
              : 'No price'
          }`,

        action: () => {
          closeCommand();
          openWizard(s);
        }
      });
    });

  state.categories
    .filter(
      c =>
        !q ||
        c.name
          .toLowerCase()
          .includes(q)
    )
    .slice(0, 5)
    .forEach(c => {
      results.push({
        title: c.name,
        meta: 'Category',

        action: () => {
          closeCommand();

          state.category =
            c.id;

          renderCategories();
          renderGrid();
        }
      });
    });

  $('#commandResults').innerHTML =
    results.length
      ? results
          .map(
            (r, i) =>
              `
              <button
                class="command-item"
                data-command-index="${i}"
              >
                <strong>
                  ${esc(r.title)}
                </strong>

                <small>
                  ${esc(r.meta)}
                </small>
              </button>
              `
          )
          .join('')
      : `
          <div class="command-item">
            <strong>
              No results
            </strong>

            <small>
              Try another search.
            </small>
          </div>
        `;

  $('#commandResults').onclick =
    e => {
      const b =
        e.target.closest(
          '[data-command-index]'
        );

      if (b) {
        results[
          Number(
            b.dataset.commandIndex
          )
        ].action();
      }
    };
}

/* =========================================================
   REALTIME
========================================================= */

function startRealtime() {
  supabaseClient
    .channel(
      `services-live-${state.client.client_id}`
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
      () =>
        loadServices()
          .then(renderAll)
          .catch(
            console.warn
          )
    )

    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'offer_versions'
      },
      () =>
        loadServices()
          .then(renderAll)
          .catch(
            console.warn
          )
    )

    .subscribe();
}

/* =========================================================
   START
========================================================= */

init()
  .then(startRealtime)
  .catch(console.warn);
