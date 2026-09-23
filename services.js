const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

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
  capabilities: {}
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const esc = (v) =>
  String(v ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));

const slugify = (v) =>
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
  const host = $('#toastHost');
  if (!host) return;

  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;

  host.appendChild(el);

  setTimeout(() => el.remove(), 3200);
}

function setBoot(v) {
  if ($('#bootScreen')) {
    $('#bootScreen').style.display = v ? 'flex' : 'none';
  }
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

  const response = await fetch(
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

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.ok === false) {
    throw new Error(result.error || 'Request failed.');
  }

  return result;
}


/* =========================================================
   INIT
========================================================= */

async function init() {
  try {
    const { data, error } =
      await supabaseClient.auth.getSession();

    if (error || !data.session?.user) {
      location.replace('login.html');
      return;
    }

    state.user = data.session.user;

    const {
      data: client,
      error: clientError
    } = await supabaseClient
      .from('client_data')
      .select(
        'id,client_id,auth_user_id,business_name,client_name,full_name,name'
      )
      .eq('auth_user_id', state.user.id)
      .limit(1)
      .maybeSingle();

    if (clientError || !client?.client_id) {
      throw new Error('Client profile not found.');
    }

    state.client = client;

    if ($('#businessName')) {
      $('#businessName').textContent =
        client.business_name ||
        client.client_name ||
        client.full_name ||
        client.name ||
        'Business';
    }

    if ($('#clientId')) {
      $('#clientId').textContent = client.client_id;
    }

    await Promise.all([
      loadFoundation(),
      loadCategories(),
      loadServices()
    ]);

    bindUI();
    renderAll();

    setBoot(false);

  } catch (error) {
    console.error('Services init error:', error);

    toast(
      error.message || 'Services could not be loaded.',
      'bad'
    );

    setTimeout(() => {
      location.replace('dashboard.html');
    }, 1400);
  }
}


/* =========================================================
   FOUNDATION
========================================================= */

async function loadFoundation() {
  const result = await edge(
    'services-foundation',
    {
      action: 'get'
    }
  );

  state.catalog = result.catalog || null;

  state.types = (result.types || [])
    .filter(
      (item) =>
        item.is_active ||
        item.source === 'system'
    );

  fillTypeSelect();
}

async function loadCategories() {
  const {
    data,
    error
  } = await supabaseClient
    .from('offer_categories')
    .select(
      'id,name,slug,description,sort_order,is_active'
    )
    .eq(
      'client_id',
      state.client.client_id
    )
    .eq('is_active', true)
    .order('sort_order', {
      ascending: true
    })
    .order('name');

  if (error) throw error;

  state.categories = data || [];

  renderCategories();
}

async function loadServices() {
  const {
    data,
    error
  } = await supabaseClient
    .from('offers')
    .select(
      'id,client_id,name,slug,short_description,description,category_id,status,offer_type,current_version_id,updated_at'
    )
    .eq(
      'client_id',
      state.client.client_id
    )
    .order('updated_at', {
      ascending: false
    });

  if (error) throw error;

  const ids = (data || [])
    .map((item) => item.current_version_id)
    .filter(Boolean);

  let versions = [];
  let prices = [];

  if (ids.length) {
    const versionResult =
      await supabaseClient
        .from('offer_versions')
        .select(
          'id,offer_id,version_number,status,title,description,metadata'
        )
        .in('id', ids);

    if (versionResult.error) {
      throw versionResult.error;
    }

    versions = versionResult.data || [];

    const priceResult =
      await supabaseClient
        .from('offer_prices')
        .select(
          'offer_version_id,amount,currency,price_type,billing_period,is_active'
        )
        .in('offer_version_id', ids)
        .eq('is_active', true);

    if (priceResult.error) {
      throw priceResult.error;
    }

    prices = priceResult.data || [];
  }

  const versionMap =
    new Map(
      versions.map((item) => [
        item.id,
        item
      ])
    );

  const priceMap =
    new Map(
      prices.map((item) => [
        item.offer_version_id,
        item
      ])
    );

  state.services = (data || []).map(
    (offer) => ({
      ...offer,
      version:
        versionMap.get(
          offer.current_version_id
        ) || null,

      price:
        priceMap.get(
          offer.current_version_id
        ) || null
    })
  );
}


/* =========================================================
   TYPE / CATEGORY UI
========================================================= */

function fillTypeSelect() {
  const select = $('#fType');

  if (!select) return;

  select.innerHTML =
    state.types
      .map(
        (type) =>
          `<option value="${esc(type.type_key)}">${esc(type.label)}</option>`
      )
      .join('');

  updateCapabilities();
}

function fillCategorySelect() {
  const select = $('#fCategory');

  if (!select) return;

  select.innerHTML =
    '<option value="">No category</option>' +
    state.categories
      .map(
        (category) =>
          `<option value="${category.id}">
            ${esc(category.name)}
          </option>`
      )
      .join('');
}

function renderCategories() {
  if (!$('#categoryCount')) return;

  $('#categoryCount').textContent =
    state.categories.length;

  const counts = {};

  state.services.forEach((service) => {
    const key =
      service.category_id ||
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
    ...state.categories.map(
      (category) => ({
        id: category.id,
        name: category.name,
        n: counts[category.id] || 0
      })
    )
  ];

  $('#categoryList').innerHTML =
    items
      .map(
        (item) =>
          `<button
            class="category-item ${
              state.category === item.id
                ? 'active'
                : ''
            }"
            data-category="${esc(item.id)}"
          >
            <span>${esc(item.name)}</span>
            <small>${item.n}</small>
          </button>`
      )
      .join('');
}


/* =========================================================
   SERVICE GRID
========================================================= */

function filtered() {
  const query =
    state.search.toLowerCase().trim();

  return state.services.filter(
    (service) => {
      const categoryMatch =
        state.category === 'all' ||
        service.category_id ===
          state.category ||
        (
          state.category ===
            'uncategorized' &&
          !service.category_id
        );

      const statusMatch =
        state.status === 'all' ||
        service.status === state.status ||
        service.version?.status ===
          state.status;

      const text =
        `${service.name} ${
          service.short_description || ''
        } ${
          service.description || ''
        }`.toLowerCase();

      return (
        categoryMatch &&
        statusMatch &&
        (!query ||
          text.includes(query))
      );
    }
  );
}

function renderGrid() {
  const rows = filtered();

  const grid = $('#serviceGrid');
  const empty = $('#emptyState');

  if (!grid || !empty) return;

  $('#gridTitle').textContent =
    state.category === 'all'
      ? 'All Services'
      : (
          state.categories.find(
            (category) =>
              category.id ===
              state.category
          )?.name ||
          'Uncategorized'
        );

  $('#gridMeta').textContent =
    `${rows.length} service${
      rows.length === 1 ? '' : 's'
    } · no page reload`;

  grid.innerHTML =
    rows
      .map(
        (service, index) =>
          `
          <article
            class="service-card"
            style="animation-delay:${index * 35}ms"
          >

            <div class="service-media">
              <span>✦</span>

              <span
                class="service-status ${esc(
                  service.status
                )}"
              >
                ${
                  service.status === 'active'
                    ? 'Published'
                    : service.status === 'review'
                    ? 'In review'
                    : 'Draft'
                }
              </span>
            </div>

            <div class="service-body">

              <div class="service-category">
                ${esc(
                  (
                    state.categories.find(
                      (category) =>
                        category.id ===
                        service.category_id
                    ) || {}
                  ).name ||
                    'GENERAL'
                )}
              </div>

              <h3 title="${esc(service.name)}">
                ${esc(service.name)}
              </h3>

              <p>
                ${esc(
                  service.short_description ||
                    service.description ||
                    'No description yet.'
                )}
              </p>

              <div class="service-meta">

                <strong class="price">
                  ${
                    service.price
                      ? money(
                          service.price.amount,
                          service.price.currency
                        )
                      : 'Price not set'
                  }
                </strong>

                <span class="meta-small">
                  ${esc(
                    service.offer_type ||
                      'service'
                  )}
                </span>

              </div>

              <div class="card-actions">

                <button
                  class="secondary-btn edit-service"
                  data-id="${service.id}"
                >
                  Open
                </button>

                <button
                  class="ghost-btn duplicate-service"
                  data-id="${service.id}"
                >
                  Duplicate
                </button>

              </div>

            </div>

          </article>
          `
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

function updateNudge() {
  const incomplete =
    state.services.filter(
      (service) =>
        service.status === 'draft' &&
        (
          !service.description ||
          !service.price
        )
    ).length;

  if (incomplete) {
    $('#aiNudge')?.classList.remove(
      'hidden'
    );

    if ($('#nudgeText')) {
      $('#nudgeText').textContent =
        `${incomplete} draft service${
          incomplete === 1
            ? ' is'
            : 's are'
        } missing key business information.`;
    }
  } else {
    $('#aiNudge')?.classList.add(
      'hidden'
    );
  }
}


/* =========================================================
   WIZARD
========================================================= */

function openWizard(service = null) {
  resetWizard(service);

  $('#wizardOverlay')
    ?.classList.remove('hidden');

  document.body.style.overflow = 'hidden';

  setStep(1);
}

function closeWizard() {
  $('#wizardOverlay')
    ?.classList.add('hidden');

  document.body.style.overflow = '';
}

function resetWizard(service) {
  state.offerId =
    service?.id || null;

  state.versionId =
    service?.current_version_id ||
    null;

  state.variants = [];
  state.media = [];

  if ($('#wizardTitle')) {
    $('#wizardTitle').textContent =
      service
        ? 'Edit service'
        : 'Create service';
  }

  $('#fName').value =
    service?.name || '';

  $('#fShort').value =
    service?.short_description || '';

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
    service?.price?.price_type ||
    'fixed';

  $('#fBilling').value =
    service?.price?.billing_period ||
    '';

  $('#fDuration').value = '';

  $('#fKnowledge').value =
    service?.version?.metadata
      ?.ai_knowledge_summary || '';

  renderVariants();
  renderMedia();
  renderDays();

  updateCapabilities();
  updateChecklist();

  showAlert('');
}

function setStep(n) {
  state.step = n;

  $$('.wizard-step')
    .forEach(
      (element) =>
        element.classList.toggle(
          'active',
          Number(
            element.dataset.panel
          ) === n
        )
    );

  $$('.stepper .step')
    .forEach((element) => {
      const step =
        Number(element.dataset.step);

      element.classList.toggle(
        'active',
        step === n
      );

      element.classList.toggle(
        'done',
        step < n
      );
    });

  $('#prevStep')
    ?.classList.toggle(
      'hidden',
      n === 1
    );

  $('#nextStep')
    ?.classList.toggle(
      'hidden',
      n === 5
    );

  $('#publishBtn')
    ?.classList.toggle(
      'hidden',
      n !== 5
    );

  $('#saveDraftBtn')
    ?.classList.toggle(
      'hidden',
      n === 5
    );

  if (n === 5) {
    updateChecklist();
  }
}

function validateStep(n) {
  if (n === 1) {
    if (!$('#fName').value.trim()) {
      return 'Service name is required.';
    }

    if (!$('#fType').value) {
      return 'Choose a catalog type.';
    }
  }

  if (n === 2) {
    if (
      $('#fPrice').value === '' ||
      Number($('#fPrice').value) < 0
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
    const stepError =
      validateStep(
        Math.min(state.step, 2)
      );

    if (stepError) {
      showAlert(stepError);
      return false;
    }

    const name =
      $('#fName').value.trim();

    const type =
      $('#fType').value ||
      'service';

    let offer;

    if (state.offerId) {

      const updateData = {
        offer_type: type,
        name,
        short_description:
          $('#fShort').value.trim(),
        description:
          $('#fDescription').value.trim(),
        category_id:
          $('#fCategory').value ||
          null,
        status: 'draft'
      };

      const result =
        await supabaseClient
          .from('offers')
          .update(updateData)
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

      if (result.error) {
        throw result.error;
      }

      offer = result.data;

    } else {

      const baseSlug =
        slugify(name) ||
        'service';

      const uniqueSlug =
        `${baseSlug}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

      const insertData = {
        client_id:
          state.client.client_id,

        offer_type: type,

        name,

        slug: uniqueSlug,

        short_description:
          $('#fShort').value.trim(),

        description:
          $('#fDescription').value.trim(),

        category_id:
          $('#fCategory').value ||
          null,

        status: 'draft'
      };

      const result =
        await supabaseClient
          .from('offers')
          .insert(insertData)
          .select()
          .single();

      if (result.error) {
        throw result.error;
      }

      offer = result.data;

      state.offerId =
        offer.id;
    }


    /* VERSION */

    if (!state.versionId) {

      const versionResult =
        await supabaseClient
          .from('offer_versions')
          .insert({
            offer_id: offer.id,
            version_number: 1,
            status: 'draft',
            title: name,
            description:
              $('#fDescription')
                .value.trim(),

            metadata: {
              ai_knowledge_summary:
                $('#fKnowledge')
                  .value.trim()
            }
          })
          .select()
          .single();

      if (versionResult.error) {
        throw versionResult.error;
      }

      state.versionId =
        versionResult.data.id;

      const updateOffer =
        await supabaseClient
          .from('offers')
          .update({
            current_version_id:
              state.versionId
          })
          .eq(
            'id',
            offer.id
          );

      if (updateOffer.error) {
        throw updateOffer.error;
      }

    } else {

      const versionUpdate =
        await supabaseClient
          .from('offer_versions')
          .update({
            title: name,

            description:
              $('#fDescription')
                .value.trim(),

            metadata: {
              ai_knowledge_summary:
                $('#fKnowledge')
                  .value.trim()
            }
          })
          .eq(
            'id',
            state.versionId
          );

      if (versionUpdate.error) {
        throw versionUpdate.error;
      }
    }


    /* PRICE */

    const price =
      Number(
        $('#fPrice').value || 0
      );

    const oldPrice =
      await supabaseClient
        .from('offer_prices')
        .select('id')
        .eq(
          'offer_version_id',
          state.versionId
        )
        .limit(1)
        .maybeSingle();

    if (oldPrice.error) {
      throw oldPrice.error;
    }

    const priceRow = {
      offer_version_id:
        state.versionId,

      amount: price,

      currency:
        $('#fCurrency').value ||
        'INR',

      price_type:
        $('#fPriceType').value ||
        'fixed',

      billing_period:
        $('#fBilling').value ||
        null,

      is_active: true
    };

    if (oldPrice.data) {

      const updatePrice =
        await supabaseClient
          .from('offer_prices')
          .update(priceRow)
          .eq(
            'id',
            oldPrice.data.id
          );

      if (updatePrice.error) {
        throw updatePrice.error;
      }

    } else {

      const insertPrice =
        await supabaseClient
          .from('offer_prices')
          .insert(priceRow);

      if (insertPrice.error) {
        throw insertPrice.error;
      }
    }


    await loadServices();
    renderAll();

    if ($('#saveState1')) {
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

  } catch (error) {

    console.error(
      'saveDraft error:',
      error
    );

    showAlert(
      error.message ||
      'Draft could not be saved.'
    );

    return false;
  }
}


/* =========================================================
   PUBLISH
========================================================= */

async function submitPublish() {

  const missing = [];

  if (!$('#fName').value.trim()) {
    missing.push('service name');
  }

  if (!$('#fDescription').value.trim()) {
    missing.push('description');
  }

  if (
    $('#fPrice').value === '' ||
    Number($('#fPrice').value) < 0
  ) {
    missing.push('price');
  }

  if (missing.length) {

    showAlert(
      `Complete before publishing: ${
        missing.join(', ')
      }.`
    );

    return;
  }

  if (
    !state.offerId ||
    !state.versionId
  ) {

    const saved =
      await saveDraft(true);

    if (!saved) return;
  }

  try {

    const versionUpdate =
      await supabaseClient
        .from('offer_versions')
        .update({
          status: 'review',

          title:
            $('#fName')
              .value.trim(),

          description:
            $('#fDescription')
              .value.trim(),

          metadata: {
            ai_knowledge_summary:
              $('#fKnowledge')
                .value.trim()
          }
        })
        .eq(
          'id',
          state.versionId
        );

    if (versionUpdate.error) {
      throw versionUpdate.error;
    }

    if (
      (state.user.email || '')
        .toLowerCase() ===
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

      } catch (error) {

        console.error(
          'Admin publish:',
          error
        );

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

  } catch (error) {

    console.error(
      'Publish error:',
      error
    );

    showAlert(
      error.message ||
      'Publish submission failed.'
    );
  }
}


/* =========================================================
   GLIME AI
========================================================= */

async function generateWithGlimeAI(button) {

  if (!button) return;

  const targetId =
    button.dataset.aiTarget;

  const target =
    document.getElementById(
      targetId
    );

  if (!target) {
    toast(
      'AI target field not found.',
      'bad'
    );
    return;
  }

  const serviceName =
    $('#fName')?.value.trim();

  if (!serviceName) {

    showAlert(
      'First enter the service name, then use Generate with GLIME AI.'
    );

    $('#fName')?.focus();

    return;
  }

  const originalText =
    button.innerHTML;

  const originalDisabled =
    button.disabled;

  try {

    button.disabled = true;

    button.classList.add(
      'ai-generating'
    );

    button.innerHTML =
      '✦ GLIME AI is thinking…';

    target.classList.add(
      'ai-field-loading'
    );

    const field =
      targetId === 'fShort'
        ? 'short_description'
        : targetId === 'fDescription'
        ? 'description'
        : targetId === 'fKnowledge'
        ? 'knowledge'
        : null;

    if (!field) {
      throw new Error(
        'Unsupported AI field.'
      );
    }

    const result =
      await edge(
        'glime-ai',
        {
          action: 'service_generate',

          field,

          service: {
            name:
              serviceName,

            type:
              $('#fType')?.value ||
              'service',

            short_description:
              $('#fShort')?.value.trim() ||
              '',

            description:
              $('#fDescription')?.value.trim() ||
              '',

            knowledge:
              $('#fKnowledge')?.value.trim() ||
              ''
          }
        }
      );

    if (
      !result?.value
    ) {
      throw new Error(
        'GLIME AI did not return any content.'
      );
    }

    target.value =
      result.value.trim();

    target.dispatchEvent(
      new Event(
        'input',
        {
          bubbles: true
        }
      )
    );

    target.dispatchEvent(
      new Event(
        'change',
        {
          bubbles: true
        }
      )
    );

    updateChecklist();

    toast(
      'Generated with GLIME AI',
      'ok'
    );

  } catch (error) {

    console.error(
      'GLIME AI generation error:',
      error
    );

    toast(
      error.message ||
      'GLIME AI generation failed.',
      'bad'
    );

  } finally {

    button.disabled =
      originalDisabled;

    button.innerHTML =
      originalText;

    button.classList.remove(
      'ai-generating'
    );

    target.classList.remove(
      'ai-field-loading'
    );
  }
}

/* =========================================================
   CAPABILITIES
========================================================= */

function updateCapabilities() {

  const selectedType =
    $('#fType')?.value;

  const type =
    state.types.find(
      (item) =>
        item.type_key ===
        selectedType
    ) || {};

  state.capabilities =
    type.capabilities || {};

  const capabilities =
    state.capabilities;

  if ($('#capabilityNote')) {

    $('#capabilityNote').innerHTML =
      `
      <span>✦</span>

      <div>

        <strong>
          ${esc(
            type.label ||
            'Service'
          )}
          configuration
        </strong>

        <p>
          ${
            capabilities.duration
              ? 'Duration enabled · '
              : ''
          }

          ${
            capabilities.variants
              ? 'Variants enabled · '
              : ''
          }

          ${
            capabilities.availability
              ? 'Availability enabled · '
              : ''
          }

          ${
            capabilities.booking
              ? 'Booking enabled · '
              : ''
          }

          ${
            !Object.keys(
              capabilities
            ).length
              ? 'Standard fields only.'
              : ''
          }
        </p>

      </div>
      `;
  }

  $('#availabilityDisabled')
    ?.classList.toggle(
      'hidden',
      !!capabilities.availability
    );

  $('#availabilityEditor')
    ?.classList.toggle(
      'hidden',
      !capabilities.availability
    );

  const durationField =
    $('#fDuration')?.closest(
      '.field'
    );

  if (durationField) {

    durationField.style.display =
      capabilities.duration
        ? 'block'
        : 'none';
  }

  const variantHeader =
    document.querySelector(
      '[data-panel="2"] .subsection-head'
    );

  if (variantHeader) {

    variantHeader.style.display =
      capabilities.variants
        ? 'flex'
        : 'none';
  }

  if ($('#variantList')) {

    $('#variantList').style.display =
      capabilities.variants
        ? 'flex'
        : 'none';
  }
}


/* =========================================================
   VARIANTS
========================================================= */

function renderVariants() {

  if (!$('#variantList')) return;

  $('#variantList').innerHTML =
    state.variants
      .map(
        (variant, index) =>
          `
          <div class="variant-row">

            <input
              data-v="name"
              data-i="${index}"
              value="${esc(variant.name)}"
              placeholder="Variant name"
            >

            <input
              data-v="price"
              data-i="${index}"
              type="number"
              value="${esc(variant.price || '')}"
              placeholder="Price"
            >

            <input
              data-v="sku"
              data-i="${index}"
              value="${esc(variant.sku || '')}"
              placeholder="SKU"
            >

            <button
              class="remove-row"
              data-remove-variant="${index}"
              type="button"
            >
              ×
            </button>

          </div>
          `
      )
      .join('');
}


/* =========================================================
   AVAILABILITY
========================================================= */

function renderDays() {

  if (!$('#dayRows')) return;

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
        (name, index) =>
          `
          <div class="day-row">

            <label>
              ${name}
            </label>

            <input
              type="time"
              data-day-start="${index}"
              value="${
                index < 6
                  ? '09:00'
                  : ''
              }"
            >

            <input
              type="time"
              data-day-end="${index}"
              value="${
                index < 6
                  ? '18:00'
                  : ''
              }"
            >

            <label>

              <input
                type="checkbox"
                data-day-on="${index}"
                ${
                  index < 6
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

  if (!$('#mediaList')) return;

  $('#mediaList').innerHTML =
    state.media
      .map(
        (media, index) =>
          `
          <div class="media-item">

            <div class="media-thumb">

              ${
                media.url
                  ? `
                    <img
                      src="${esc(media.url)}"
                      alt=""
                    >
                  `
                  : '▶'
              }

            </div>

            <div class="media-info">

              <input
                value="${esc(media.alt || '')}"
                data-media-alt="${index}"
                placeholder="Alt text"
              >

              <div class="media-controls">

                <button
                  type="button"
                  data-primary="${index}"
                  class="${
                    media.primary
                      ? 'primary-mini'
                      : ''
                  }"
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

  const primary =
    state.media.find(
      (media) => media.primary
    );

  if ($('#previewMedia')) {

    $('#previewMedia').innerHTML =
      primary?.url
        ? `
          <img
            src="${esc(primary.url)}"
            alt=""
          >
        `
        : 'No primary media';
  }
}


/* =========================================================
   CHECKLIST
========================================================= */

function updateChecklist() {

  if (!$('#fName')) return;

  const checks = [

    [
      'Service name',
      !!$('#fName').value.trim(),
      'Customer-facing name is present.'
    ],

    [
      'Description',
      !!$('#fDescription').value.trim(),
      'Full business description is present.'
    ],

    [
      'Price',
      !!$('#fPrice').value &&
        Number($('#fPrice').value) >= 0,
      'A valid commercial price is configured.'
    ],

    [
      'Catalog type',
      !!$('#fType').value,
      'The service is assigned to a catalog type.'
    ]

  ];

  const completed =
    checks.filter(
      (item) => item[1]
    ).length;

  if ($('#checkCount')) {

    $('#checkCount').textContent =
      `${completed}/${checks.length}`;
  }

  if ($('#publishChecklist')) {

    $('#publishChecklist').innerHTML =
      checks
        .map(
          (item) =>
            `
            <div
              class="check-row ${
                item[1]
                  ? 'ok'
                  : ''
              }"
            >

              <span class="check-icon">
                ${
                  item[1]
                    ? '✓'
                    : '!'
                }
              </span>

              <div>

                <strong>
                  ${esc(item[0])}
                </strong>

                <small>
                  ${esc(item[2])}
                </small>

              </div>

            </div>
            `
        )
        .join('');
  }

  if ($('#publishBtn')) {

    $('#publishBtn').disabled =
      completed !==
      checks.length;
  }

  if ($('#previewName')) {

    $('#previewName').textContent =
      $('#fName').value.trim() ||
      'Service name';
  }

  if ($('#previewDescription')) {

    $('#previewDescription').textContent =
      $('#fDescription').value.trim() ||
      'Description preview will appear here.';
  }

  if ($('#previewPrice')) {

    $('#previewPrice').textContent =
      $('#fPrice').value
        ? money(
            $('#fPrice').value,
            $('#fCurrency').value
          )
        : '₹0';
  }
}


/* =========================================================
   UI EVENTS
========================================================= */

function bindUI() {

  $('#openSidebar')?.addEventListener(
    'click',
    () =>
      $('#sidebar')
        ?.classList.add('open')
  );

  $('#closeSidebar')?.addEventListener(
    'click',
    () =>
      $('#sidebar')
        ?.classList.remove('open')
  );


  $('#logoutBtn')?.addEventListener(
    'click',
    async () => {

      await supabaseClient.auth.signOut({
        scope: 'local'
      });

      location.replace(
        'login.html'
      );
    }
  );


  $('#refreshBtn')?.addEventListener(
    'click',
    async () => {

      try {

        await Promise.all([
          loadCategories(),
          loadServices()
        ]);

        renderAll();

        toast(
          'Catalog refreshed',
          'ok'
        );

      } catch (error) {

        toast(
          error.message,
          'bad'
        );
      }
    }
  );


  $('#addServiceBtn')?.addEventListener(
    'click',
    () => openWizard()
  );

  $('#emptyAddBtn')?.addEventListener(
    'click',
    () => openWizard()
  );


  $('#serviceSearch')?.addEventListener(
    'input',
    (event) => {

      state.search =
        event.target.value;

      renderGrid();
    }
  );


  $('#statusFilter')?.addEventListener(
    'change',
    (event) => {

      state.status =
        event.target.value;

      renderGrid();
    }
  );


  $('#categoryList')?.addEventListener(
    'click',
    (event) => {

      const button =
        event.target.closest(
          '[data-category]'
        );

      if (!button) return;

      state.category =
        button.dataset.category;

      renderCategories();
      renderGrid();
    }
  );


  $('#closeNudge')?.addEventListener(
    'click',
    () =>
      $('#aiNudge')
        ?.classList.add('hidden')
  );


  $('#closeWizard')?.addEventListener(
    'click',
    closeWizard
  );

  $('#wizardCancel')?.addEventListener(
    'click',
    closeWizard
  );


  $('#prevStep')?.addEventListener(
    'click',
    () =>
      setStep(
        Math.max(
          1,
          state.step - 1
        )
      )
  );


  $('#nextStep')?.addEventListener(
    'click',
    async () => {

      const error =
        validateStep(
          state.step
        );

      if (error) {

        showAlert(error);

        return;
      }

      if (state.step < 5) {

        if (
          state.step === 1 ||
          state.step === 2
        ) {

          const saved =
            await saveDraft(true);

          if (!saved) return;
        }

        setStep(
          state.step + 1
        );
      }
    }
  );


  $('#saveDraftBtn')?.addEventListener(
    'click',
    () => saveDraft()
  );


  $('#publishBtn')?.addEventListener(
    'click',
    submitPublish
  );


  $('#fType')?.addEventListener(
    'change',
    () => {

      updateCapabilities();
      updateChecklist();
    }
  );


  [
    'fName',
    'fDescription',
    'fPrice',
    'fCurrency',
    'fShort',
    'fKnowledge'
  ].forEach(
    (id) => {

      const element =
        $('#' + id);

      if (!element) return;

      element.addEventListener(
        'input',
        updateChecklist
      );
    }
  );


  /* =====================================================
     GLIME AI BUTTONS
  ===================================================== */

  $$('[data-ai-target]')
    .forEach(
      (button) => {

        button.addEventListener(
          'click',
          () =>
            generateWithGlimeAI(
              button
            )
        );
      }
    );


  /* =====================================================
     VARIANTS
  ===================================================== */

  $('#addVariantBtn')?.addEventListener(
    'click',
    () => {

      state.variants.push({
        name: '',
        price: '',
        sku: ''
      });

      renderVariants();
    }
  );


  $('#variantList')?.addEventListener(
    'input',
    (event) => {

      const index =
        Number(
          event.target.dataset.i
        );

      if (
        Number.isInteger(index) &&
        state.variants[index]
      ) {

        state.variants[index][
          event.target.dataset.v
        ] =
          event.target.value;
      }
    }
  );


  $('#variantList')?.addEventListener(
    'click',
    (event) => {

      const button =
        event.target.closest(
          '[data-remove-variant]'
        );

      if (!button) return;

      state.variants.splice(
        Number(
          button.dataset.removeVariant
        ),
        1
      );

      renderVariants();
    }
  );


  /* =====================================================
     MEDIA
  ===================================================== */

  $('#chooseMediaBtn')?.addEventListener(
    'click',
    () =>
      $('#mediaInput')?.click()
  );


  $('#mediaInput')?.addEventListener(
    'change',
    (event) => {

      handleFiles(
        [
          ...event.target.files
        ]
      );
    }
  );


  $('#uploadZone')?.addEventListener(
    'dragover',
    (event) => {

      event.preventDefault();

      $('#uploadZone')
        .classList.add('drag');
    }
  );


  $('#uploadZone')?.addEventListener(
    'dragleave',
    () => {

      $('#uploadZone')
        ?.classList.remove('drag');
    }
  );


  $('#uploadZone')?.addEventListener(
    'drop',
    (event) => {

      event.preventDefault();

      $('#uploadZone')
        ?.classList.remove('drag');

      handleFiles(
        [
          ...event.dataTransfer.files
        ]
      );
    }
  );


  $('#mediaList')?.addEventListener(
    'input',
    (event) => {

      const index =
        Number(
          event.target.dataset.mediaAlt
        );

      if (
        Number.isInteger(index) &&
        state.media[index]
      ) {

        state.media[index].alt =
          event.target.value;
      }
    }
  );


  $('#mediaList')?.addEventListener(
    'click',
    (event) => {

      const primaryButton =
        event.target.closest(
          '[data-primary]'
        );

      const removeButton =
        event.target.closest(
          '[data-remove-media]'
        );

      if (primaryButton) {

        const index =
          Number(
            primaryButton.dataset.primary
          );

        state.media.forEach(
          (media, i) => {
            media.primary =
              i === index;
          }
        );

        renderMedia();
      }

      if (removeButton) {

        state.media.splice(
          Number(
            removeButton.dataset
              .removeMedia
          ),
          1
        );

        renderMedia();
      }
    }
  );


  /* =====================================================
     STEPPER
  ===================================================== */

  $$('.stepper .step')
    .forEach(
      (button) => {

        button.addEventListener(
          'click',
          () => {

            const step =
              Number(
                button.dataset.step
              );

            if (
              step <= state.step
            ) {
              setStep(step);
            }
          }
        );
      }
    );


  /* =====================================================
     SERVICE GRID
  ===================================================== */

  $('#serviceGrid')?.addEventListener(
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


      if (edit) {

        const service =
          state.services.find(
            (item) =>
              item.id ===
              edit.dataset.id
          );

        if (service) {
          openWizard(service);
        }
      }


      if (duplicate) {

        const service =
          state.services.find(
            (item) =>
              item.id ===
              duplicate.dataset.id
          );

        if (service) {

          openWizard({
            ...service,

            id: null,

            current_version_id:
              null,

            name:
              `${service.name} Copy`,

            status: 'draft'
          });

          toast(
            'Duplicate opened as a new draft',
            'ok'
          );
        }
      }
    }
  );


  $('#addCategoryBtn')?.addEventListener(
    'click',
    addCategory
  );


  /* =====================================================
     COMMAND PALETTE
  ===================================================== */

  $('#commandBtn')?.addEventListener(
    'click',
    openCommand
  );

  $('#closeCommand')?.addEventListener(
    'click',
    closeCommand
  );

  $('#commandInput')?.addEventListener(
    'input',
    renderCommand
  );

  $('#commandOverlay')?.addEventListener(
    'click',
    (event) => {

      if (
        event.target ===
        $('#commandOverlay')
      ) {
        closeCommand();
      }
    }
  );


  document.addEventListener(
    'keydown',
    (event) => {

      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() ===
          'k'
      ) {

        event.preventDefault();

        openCommand();
      }


      if (event.key === 'Escape') {

        closeCommand();

        if (
          !$('#wizardOverlay')
            ?.classList.contains(
              'hidden'
            )
        ) {
          closeWizard();
        }
      }


      if (
        event.key === '/' &&
        document.activeElement &&
        document.activeElement.tagName !==
          'INPUT' &&
        document.activeElement.tagName !==
          'TEXTAREA'
      ) {

        event.preventDefault();

        $('#serviceSearch')?.focus();
      }

    }
  );
}


/* =========================================================
   MEDIA FILES
========================================================= */

function handleFiles(files) {

  files
    .filter(
      (file) =>
        file.type.startsWith('image/') ||
        file.type.startsWith('video/')
    )
    .forEach(
      (file) => {

        const url =
          URL.createObjectURL(file);

        state.media.push({
          file,
          url,
          alt:
            file.name.replace(
              /\.[^.]+$/,
              ''
            ),
          primary:
            state.media.length === 0
        });
      }
    );

  renderMedia();

  toast(
    'Media added to this draft',
    'ok'
  );
}


/* =========================================================
   CATEGORY
========================================================= */

async function addCategory() {

  const name =
    prompt(
      'New category name'
    );

  if (!name?.trim()) return;

  const slug =
    slugify(name);

  const { error } =
    await supabaseClient
      .from('offer_categories')
      .insert({
        client_id:
          state.client.client_id,

        name:
          name.trim(),

        slug,

        sort_order:
          state.categories.length,

        is_active: true
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
    ?.classList.remove(
      'hidden'
    );

  if ($('#commandInput')) {
    $('#commandInput').value = '';
  }

  renderCommand();

  setTimeout(
    () =>
      $('#commandInput')
        ?.focus(),
    30
  );
}

function closeCommand() {

  $('#commandOverlay')
    ?.classList.add(
      'hidden'
    );
}

function renderCommand() {

  const query =
    $('#commandInput')
      ?.value
      .toLowerCase()
      .trim() || '';

  const results = [];


  if (
    !query ||
    'add service'.includes(query)
  ) {

    results.push({
      title: 'Add Service',
      meta: 'Create a new service',

      action: () => {

        closeCommand();
        openWizard();
      }
    });
  }


  state.services
    .filter(
      (service) =>
        !query ||
        service.name
          .toLowerCase()
          .includes(query)
    )
    .slice(0, 8)
    .forEach(
      (service) => {

        results.push({

          title:
            service.name,

          meta:
            `${service.status} · ${
              service.price
                ? money(
                    service.price.amount,
                    service.price.currency
                  )
                : 'No price'
            }`,

          action: () => {

            closeCommand();

            openWizard(
              service
            );
          }
        });
      }
    );


  state.categories
    .filter(
      (category) =>
        !query ||
        category.name
          .toLowerCase()
          .includes(query)
    )
    .slice(0, 5)
    .forEach(
      (category) => {

        results.push({

          title:
            category.name,

          meta:
            'Category',

          action: () => {

            closeCommand();

            state.category =
              category.id;

            renderCategories();
            renderGrid();
          }
        });
      }
    );


  if ($('#commandResults')) {

    $('#commandResults').innerHTML =
      results.length
        ? results
            .map(
              (result, index) =>
                `
                <button
                  class="command-item"
                  data-command-index="${index}"
                  type="button"
                >

                  <strong>
                    ${esc(result.title)}
                  </strong>

                  <small>
                    ${esc(result.meta)}
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
  }


  $('#commandResults')?.addEventListener(
    'click',
    (event) => {

      const button =
        event.target.closest(
          '[data-command-index]'
        );

      if (!button) return;

      const index =
        Number(
          button.dataset.commandIndex
        );

      results[index]?.action();
    }
  );
}


/* =========================================================
   REALTIME
========================================================= */

supabaseClient
  .channel('services-live')

  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'offers'
    },
    () =>
      loadServices()
        .then(renderAll)
        .catch(console.warn)
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
        .catch(console.warn)
  )

  .subscribe();


/* =========================================================
   START
========================================================= */

init();
