/* =========================================================
   GLIME — Salon AI Admin Add-on
   Works as a separate add-on for admin.html
   Does NOT replace existing admin logic.
========================================================= */

(function () {
  'use strict';

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const MODULE_SLUG = 'salon_ai';
  const MODULE_NAME = 'Salon AI';

  let db = null;
  let currentClient = null;
  let salonModule = null;
  let salonClientModule = null;

  /* ---------------------------------------------------------
     Helpers
  --------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function findExistingElement(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function setStatus(text, type = 'info') {
    let box = document.getElementById('salonAdminStatus');

    if (!box) {
      box = document.createElement('div');
      box.id = 'salonAdminStatus';

      box.style.marginTop = '12px';
      box.style.padding = '12px 14px';
      box.style.borderRadius = '10px';
      box.style.fontSize = '14px';
      box.style.lineHeight = '1.5';

      const container =
        document.getElementById('salonAdminSection') ||
        document.body;

      container.appendChild(box);
    }

    box.textContent = text;

    if (type === 'success') {
      box.style.background = 'rgba(34,197,94,.12)';
      box.style.border = '1px solid rgba(34,197,94,.35)';
    } else if (type === 'error') {
      box.style.background = 'rgba(239,68,68,.12)';
      box.style.border = '1px solid rgba(239,68,68,.35)';
    } else {
      box.style.background = 'rgba(255,255,255,.06)';
      box.style.border = '1px solid rgba(255,255,255,.12)';
    }
  }

  function getClientEmailInput() {
    return findExistingElement([
      '#clientEmail',
      '#adminClientEmail',
      '#client_email',
      'input[name="client_email"]',
      'input[name="email"]',
      'input[type="email"]'
    ]);
  }

  function getExistingFetchButton() {
    return findExistingElement([
      '#fetchClientBtn',
      '#fetchClient',
      '#findClientBtn',
      '#searchClientBtn',
      'button[data-action="fetch-client"]'
    ]);
  }

  function getAdminContainer() {
    return findExistingElement([
      '#adminModules',
      '#moduleControls',
      '#clientModules',
      '#modulesSection',
      '#adminContent',
      'main'
    ]) || document.body;
  }

  /* ---------------------------------------------------------
     Supabase
  --------------------------------------------------------- */

  function initSupabase() {
    if (!window.supabase || !window.supabase.createClient) {
      setStatus(
        'Salon AI: Supabase library load नहीं हुई।',
        'error'
      );
      return false;
    }

    db = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

    return true;
  }

  async function getAdminSession() {
    const { data, error } = await db.auth.getSession();

    if (error) {
      throw error;
    }

    if (!data || !data.session) {
      throw new Error('Admin session नहीं मिली।');
    }

    return data.session;
  }

  /* ---------------------------------------------------------
     Find Client
  --------------------------------------------------------- */

  async function findClientByEmail(email) {
    if (!email) {
      throw new Error('Client email डालें।');
    }

    const { data, error } = await db
      .from('client_data')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        'इस email से कोई GLIME client नहीं मिला।'
      );
    }

    return data;
  }

  /* ---------------------------------------------------------
     Find Salon Module
  --------------------------------------------------------- */

  async function getSalonModule() {
    const { data, error } = await db
      .from('modules')
      .select('*')
      .eq('slug', MODULE_SLUG)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        'Salon AI module modules table में नहीं मिला।'
      );
    }

    return data;
  }

  /* ---------------------------------------------------------
     Load Existing Client Module
  --------------------------------------------------------- */

  async function loadSalonClientModule(clientId) {
    if (!salonModule) {
      salonModule = await getSalonModule();
    }

    const { data, error } = await db
      .from('client_modules')
      .select('*')
      .eq('client_id', clientId)
      .eq('module_id', salonModule.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    salonClientModule = data || null;

    return salonClientModule;
  }

  /* ---------------------------------------------------------
     UI
  --------------------------------------------------------- */

  function createSalonAdminUI() {
    if (document.getElementById('salonAdminSection')) {
      return;
    }

    const section = document.createElement('section');

    section.id = 'salonAdminSection';

    section.style.marginTop = '24px';
    section.style.padding = '20px';
    section.style.borderRadius = '16px';
    section.style.border = '1px solid rgba(255,255,255,.10)';
    section.style.background = 'rgba(255,255,255,.035)';

    section.innerHTML = `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
        margin-bottom:16px;
      ">
        <div>
          <h2 style="
            margin:0 0 5px;
            font-size:20px;
          ">
            ${MODULE_NAME}
          </h2>

          <div style="
            opacity:.65;
            font-size:13px;
          ">
            Salon AI module activation & access control
          </div>
        </div>

        <div id="salonAdminBadge" style="
          padding:7px 11px;
          border-radius:999px;
          font-size:12px;
          background:rgba(255,255,255,.07);
        ">
          Not Loaded
        </div>
      </div>

      <div style="
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
        gap:14px;
      ">

        <div>
          <label style="
            display:block;
            margin-bottom:6px;
            font-size:13px;
            opacity:.75;
          ">
            Plan
          </label>

          <input
            id="salonPlan"
            type="text"
            placeholder="e.g. 500"
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px 12px;
              border-radius:9px;
              border:1px solid rgba(255,255,255,.12);
              background:rgba(0,0,0,.18);
              color:inherit;
            "
          />
        </div>

        <div>
          <label style="
            display:block;
            margin-bottom:6px;
            font-size:13px;
            opacity:.75;
          ">
            Expiry Date
          </label>

          <input
            id="salonExpiry"
            type="datetime-local"
            style="
              width:100%;
              box-sizing:border-box;
              padding:11px 12px;
              border-radius:9px;
              border:1px solid rgba(255,255,255,.12);
              background:rgba(0,0,0,.18);
              color:inherit;
            "
          />
        </div>

      </div>

      <div style="
        margin-top:15px;
        display:flex;
        gap:18px;
        flex-wrap:wrap;
      ">

        <label style="
          display:flex;
          align-items:center;
          gap:8px;
          cursor:pointer;
        ">
          <input
            id="salonEnabled"
            type="checkbox"
          />
          <span>Activate Salon AI</span>
        </label>

        <label style="
          display:flex;
          align-items:center;
          gap:8px;
          cursor:pointer;
        ">
          <input
            id="salonVisible"
            type="checkbox"
          />
          <span>Show module to client</span>
        </label>

      </div>

      <div style="
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        margin-top:18px;
      ">

        <button
          id="salonLoadBtn"
          type="button"
          style="
            padding:10px 15px;
            border-radius:9px;
            border:1px solid rgba(255,255,255,.15);
            background:rgba(255,255,255,.07);
            color:inherit;
            cursor:pointer;
          "
        >
          Load Salon Access
        </button>

        <button
          id="salonSaveBtn"
          type="button"
          style="
            padding:10px 17px;
            border-radius:9px;
            border:0;
            background:#22c55e;
            color:#07130a;
            font-weight:700;
            cursor:pointer;
          "
        >
          Save Salon AI
        </button>

      </div>

      <div id="salonAdminStatus"></div>
    `;

    getAdminContainer().appendChild(section);

    document
      .getElementById('salonLoadBtn')
      .addEventListener('click', handleLoad);

    document
      .getElementById('salonSaveBtn')
      .addEventListener('click', handleSave);
  }

  /* ---------------------------------------------------------
     Populate UI
  --------------------------------------------------------- */

  function populateSalonUI(row) {
    const plan = document.getElementById('salonPlan');
    const expiry = document.getElementById('salonExpiry');
    const enabled = document.getElementById('salonEnabled');
    const visible = document.getElementById('salonVisible');
    const badge = document.getElementById('salonAdminBadge');

    if (!row) {
      if (plan) plan.value = '';
      if (expiry) expiry.value = '';
      if (enabled) enabled.checked = false;
      if (visible) visible.checked = false;

      if (badge) {
        badge.textContent = 'Not Activated';
      }

      return;
    }

    if (plan) {
      plan.value = row.plan || '';
    }

    if (expiry) {
      if (row.expires_at) {
        const date = new Date(row.expires_at);

        if (!Number.isNaN(date.getTime())) {
          expiry.value = toDateTimeLocal(date);
        }
      } else {
        expiry.value = '';
      }
    }

    if (enabled) {
      enabled.checked =
        row.enabled === true ||
        row.status === 'active' ||
        row.status === 'trial';
    }

    if (visible) {
      visible.checked =
        row.visible_to_client === true;
    }

    if (badge) {
      if (row.status === 'active') {
        badge.textContent = 'Active';
      } else if (row.status === 'trial') {
        badge.textContent = 'Trial';
      } else {
        badge.textContent = 'Inactive';
      }
    }
  }

  function toDateTimeLocal(date) {
    const pad = n => String(n).padStart(2, '0');

    return (
      date.getFullYear() +
      '-' +
      pad(date.getMonth() + 1) +
      '-' +
      pad(date.getDate()) +
      'T' +
      pad(date.getHours()) +
      ':' +
      pad(date.getMinutes())
    );
  }

  /* ---------------------------------------------------------
     Load
  --------------------------------------------------------- */

  async function handleLoad() {
    try {
      setStatus('Salon AI access load हो रहा है...');

      const emailInput = getClientEmailInput();

      if (!emailInput) {
        throw new Error(
          'Admin page पर client email input नहीं मिला।'
        );
      }

      const email = emailInput.value.trim();

      if (!email) {
        throw new Error('पहले client email डालें।');
      }

      currentClient = await findClientByEmail(email);
      salonModule = await getSalonModule();

      salonClientModule =
        await loadSalonClientModule(
          currentClient.client_id
        );

      populateSalonUI(salonClientModule);

      setStatus(
        `Client मिला: ${currentClient.client_id}. Salon AI access load हो गया।`,
        'success'
      );

    } catch (error) {
      console.error(
        'Salon AI load error:',
        error
      );

      setStatus(
        `Salon AI Load Error: ${error.message || error}`,
        'error'
      );
    }
  }

  /* ---------------------------------------------------------
     Save / Upsert
  --------------------------------------------------------- */

  async function handleSave() {
    try {
      setStatus('Salon AI settings save हो रही हैं...');

      if (!currentClient) {
        const emailInput = getClientEmailInput();

        if (!emailInput) {
          throw new Error(
            'Client email input नहीं मिला।'
          );
        }

        const email = emailInput.value.trim();

        if (!email) {
          throw new Error(
            'पहले client email डालें।'
          );
        }

        currentClient =
          await findClientByEmail(email);
      }

      salonModule =
        salonModule ||
        await getSalonModule();

      const enabled =
        document.getElementById('salonEnabled')
          ?.checked === true;

      const visible =
        document.getElementById('salonVisible')
          ?.checked === true;

      const plan =
        document.getElementById('salonPlan')
          ?.value
          ?.trim() || null;

      const expiryValue =
        document.getElementById('salonExpiry')
          ?.value
          ?.trim();

      const expiresAt =
        expiryValue
          ? new Date(expiryValue).toISOString()
          : null;

      const payload = {
        client_id: currentClient.client_id,
        module_id: salonModule.id,
        enabled: enabled,
        visible_to_client: visible,
        status: enabled ? 'active' : 'inactive',
        plan: plan,
        expires_at: expiresAt,
        activated_at: enabled
          ? new Date().toISOString()
          : null
      };

      const { data, error } = await db
        .from('client_modules')
        .upsert(
          payload,
          {
            onConflict: 'client_id,module_id'
          }
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      salonClientModule = data;

      populateSalonUI(data);

      setStatus(
        enabled
          ? '✅ Salon AI successfully activated और saved.'
          : '✅ Salon AI deactivated और saved.',
        'success'
      );

    } catch (error) {
      console.error(
        'Salon AI save error:',
        error
      );

      setStatus(
        `Salon AI Save Error: ${error.message || error}`,
        'error'
      );
    }
  }

  /* ---------------------------------------------------------
     Hook Existing Client Fetch Button
  --------------------------------------------------------- */

  function hookExistingFetchButton() {
    const button = getExistingFetchButton();

    if (!button) {
      return;
    }

    if (button.dataset.salonHooked === 'true') {
      return;
    }

    button.dataset.salonHooked = 'true';

    button.addEventListener('click', function () {
      setTimeout(() => {
        handleLoad().catch(console.error);
      }, 300);
    });
  }

  /* ---------------------------------------------------------
     Initialization
  --------------------------------------------------------- */

  async function init() {
    try {
      if (!initSupabase()) {
        return;
      }

      createSalonAdminUI();

      /*
       * Give existing admin.html time to initialize
       * its own controls before we hook into them.
       */
      setTimeout(() => {
        hookExistingFetchButton();
      }, 500);

      /*
       * Also retry once in case the original admin UI
       * renders its buttons later.
       */
      setTimeout(() => {
        hookExistingFetchButton();
      }, 1500);

      try {
        await getAdminSession();
      } catch (error) {
        console.warn(
          'Salon AI admin session check:',
          error.message || error
        );
      }

      setStatus(
        'Salon AI Admin Control ready.'
      );

    } catch (error) {
      console.error(
        'Salon AI initialization error:',
        error
      );

      setStatus(
        `Salon AI initialization error: ${error.message || error}`,
        'error'
      );
    }
  }

  /* ---------------------------------------------------------
     Start after DOM
  --------------------------------------------------------- */

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );
  } else {
    init();
  }

})();
