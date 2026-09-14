/* =========================================================
   GLIME — UNIVERSAL ADMIN MODULE MANAGER
   ---------------------------------------------------------
   One common module access control for all GLIME modules.
   Does not replace admin.html.
========================================================= */

(() => {
  'use strict';

  /* =======================================================
     CONFIG
  ======================================================= */

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const ADMIN_EMAIL =
    'admin@glime.online';

  const SECTION_ID =
    'glime-universal-module-manager';

  const STYLE_ID =
    'glime-universal-module-manager-style';


  /* =======================================================
     STATE
  ======================================================= */

  let supabaseClient = null;

  let currentClient = null;

  let modules = [];

  let accessMap = {};


  /* =======================================================
     HELPERS
  ======================================================= */

  const $ = (id) =>
    document.getElementById(id);


  function escapeHtml(value) {

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  }


  function showMessage(text, type = 'info') {

    const el = $('glimeModuleMessage');

    if (!el) return;

    el.textContent = text || '';

    el.style.display =
      text ? 'block' : 'none';

    el.className =
      'gm-message ' + type;

  }


  /* =======================================================
     STYLES
  ======================================================= */

  function addStyles() {

    if ($(STYLE_ID)) return;

    const style =
      document.createElement('style');

    style.id = STYLE_ID;

    style.textContent = `

      #${SECTION_ID} {
        margin-top:22px;
        padding-top:20px;
        border-top:1px solid rgba(255,255,255,.09);
      }

      #${SECTION_ID} .gm-title {
        color:#ff9f43;
        font-weight:600;
        font-size:1rem;
        margin-bottom:7px;
      }

      #${SECTION_ID} .gm-subtitle {
        color:#9ba7b7;
        font-size:.75rem;
        line-height:1.5;
        margin-bottom:15px;
      }

      #${SECTION_ID} .gm-list {
        display:flex;
        flex-direction:column;
        gap:12px;
      }

      #${SECTION_ID} .gm-card {
        padding:16px;
        border:1px solid rgba(255,255,255,.09);
        border-radius:14px;
        background:rgba(255,255,255,.02);
      }

      #${SECTION_ID} .gm-head {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        margin-bottom:14px;
      }

      #${SECTION_ID} .gm-name {
        color:#fff;
        font-size:.92rem;
        font-weight:700;
      }

      #${SECTION_ID} .gm-slug {
        color:#687587;
        font-size:.66rem;
        margin-top:3px;
      }

      #${SECTION_ID} .gm-status {
        display:inline-flex;
        align-items:center;
        padding:5px 9px;
        border-radius:999px;
        font-size:.68rem;
        font-weight:700;
        white-space:nowrap;
      }

      #${SECTION_ID} .gm-status.off {
        color:#9ba7b7;
        background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.08);
      }

      #${SECTION_ID} .gm-status.on {
        color:#00ff88;
        background:rgba(0,255,136,.07);
        border:1px solid rgba(0,255,136,.25);
      }

      #${SECTION_ID} .gm-grid {
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;
      }

      #${SECTION_ID} .gm-field label {
        display:block;
        color:#9ba7b7;
        font-size:.69rem;
        font-weight:600;
        margin-bottom:6px;
      }

      #${SECTION_ID} .gm-field input {
        width:100%;
        box-sizing:border-box;
        padding:10px 11px;
        border-radius:9px;
        border:1px solid rgba(255,255,255,.09);
        background:rgba(255,255,255,.025);
        color:#fff;
        outline:none;
        font:inherit;
      }

      #${SECTION_ID} .gm-check {
        display:flex;
        align-items:center;
        gap:8px;
        min-height:40px;
        padding:9px 11px;
        border:1px solid rgba(255,255,255,.09);
        border-radius:9px;
        background:rgba(255,255,255,.025);
        color:#fff;
        font-size:.76rem;
        cursor:pointer;
      }

      #${SECTION_ID} .gm-check input {
        width:auto;
        accent-color:#00ff88;
      }

      #${SECTION_ID} .gm-save {
        width:100%;
        margin-top:11px;
        background:#00ff88;
        color:#06100b;
        border:0;
        border-radius:9px;
        padding:10px 14px;
        font:700 .82rem Poppins,system-ui,sans-serif;
        cursor:pointer;
      }

      #${SECTION_ID} .gm-save:disabled {
        opacity:.55;
        cursor:not-allowed;
      }

      #${SECTION_ID} .gm-message {
        display:none;
        margin-top:14px;
        padding:10px 12px;
        border-radius:9px;
        font-size:.74rem;
        line-height:1.5;
      }

      #${SECTION_ID} .gm-message.success {
        display:block;
        color:#00ff88;
        background:rgba(0,255,136,.07);
        border:1px solid rgba(0,255,136,.25);
      }

      #${SECTION_ID} .gm-message.error {
        display:block;
        color:#ff5263;
        background:rgba(255,82,99,.07);
        border:1px solid rgba(255,82,99,.25);
      }

      #${SECTION_ID} .gm-message.info {
        display:block;
        color:#9ba7b7;
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.08);
      }

      #${SECTION_ID} .gm-empty {
        padding:16px;
        border:1px dashed rgba(255,255,255,.12);
        border-radius:12px;
        color:#9ba7b7;
        font-size:.78rem;
        text-align:center;
      }

      @media(max-width:650px) {

        #${SECTION_ID} .gm-grid {
          grid-template-columns:1fr;
        }

        #${SECTION_ID} .gm-head {
          flex-direction:column;
        }

      }

    `;

    document.head.appendChild(style);

  }


  /* =======================================================
     CREATE MODULE SECTION
  ======================================================= */

  function createSection() {

    if ($(SECTION_ID)) {
      return true;
    }

    const controlRoom =
      $('control-room');

    if (!controlRoom) {
      console.error(
        'GLIME Module Manager: #control-room not found.'
      );
      return false;
    }

    addStyles();

    const section =
      document.createElement('div');

    section.id =
      SECTION_ID;

    section.innerHTML = `

      <div class="gm-title">
        5. Module Access Control
      </div>

      <div class="gm-subtitle">
        Select which GLIME modules this client
        is allowed to use.
      </div>

      <div
        id="glimeModuleList"
        class="gm-list"
      >

        <div class="gm-empty">
          Fetch a client to load modules.
        </div>

      </div>

      <div
        id="glimeModuleMessage"
        class="gm-message"
      ></div>

    `;

    controlRoom.appendChild(section);

    return true;

  }


  /* =======================================================
     ADMIN CHECK
  ======================================================= */

  async function isAdmin() {

    if (!supabaseClient) {
      return false;
    }

    try {

      const {
        data,
        error
      } =
        await supabaseClient.auth.getSession();

      if (error) {
        console.error(
          'GLIME admin session error:',
          error
        );
        return false;
      }

      const user =
        data?.session?.user;

      if (!user) {
        return false;
      }

      const email =
        (user.email || '')
          .trim()
          .toLowerCase();

      return email ===
        ADMIN_EMAIL.toLowerCase();

    } catch (error) {

      console.error(
        'GLIME admin check failed:',
        error
      );

      return false;

    }

  }


  /* =======================================================
     LOAD ALL MODULES
  ======================================================= */

  async function loadModules() {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('modules')
        .select(`
          id,
          name,
          slug
        `)
        .order(
          'id',
          {
            ascending:true
          }
        );

    if (error) {
      throw error;
    }

    modules =
      data || [];

    return modules;

  }


  /* =======================================================
     LOAD CLIENT MODULE ACCESS
  ======================================================= */

  async function loadClientAccess(
    clientId
  ) {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('client_modules')
        .select(`
          id,
          client_id,
          module_id,
          enabled,
          visible_to_client,
          status,
          plan,
          activated_at,
          expires_at
        `)
        .eq(
          'client_id',
          clientId
        );

    if (error) {
      throw error;
    }

    accessMap = {};

    (data || []).forEach(
      row => {

        accessMap[
          String(row.module_id)
        ] = row;

      }
    );

    return data || [];

  }


  /* =======================================================
     DATE FORMAT
  ======================================================= */

  function toDateTimeLocal(
    value
  ) {

    if (!value) {
      return '';
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '';
    }

    const pad =
      n =>
        String(n)
          .padStart(2,'0');

    return (
      date.getFullYear() +
      '-' +
      pad(
        date.getMonth() + 1
      ) +
      '-' +
      pad(
        date.getDate()
      ) +
      'T' +
      pad(
        date.getHours()
      ) +
      ':' +
      pad(
        date.getMinutes()
      )
    );

  }


  /* =======================================================
     RENDER MODULES
  ======================================================= */

  function renderModules() {

    const list =
      $('glimeModuleList');

    if (!list) {
      return;
    }

    if (!modules.length) {

      list.innerHTML = `
        <div class="gm-empty">
          No modules registered in GLIME yet.
        </div>
      `;

      return;
    }

    list.innerHTML =
      modules.map(
        module => {

          const row =
            accessMap[
              String(module.id)
            ] || null;

          const enabled =
            row?.enabled === true ||
            row?.status === 'active' ||
            row?.status === 'trial';

          const visible =
            row?.visible_to_client === true;

          const plan =
            row?.plan || '';

          const expires =
            row?.expires_at
              ? toDateTimeLocal(
                  row.expires_at
                )
              : '';

          return `

            <div
              class="gm-card"
              data-module-id="${escapeHtml(module.id)}"
            >

              <div class="gm-head">

                <div>

                  <div class="gm-name">

                    ${escapeHtml(
                      module.name
                    )}

                  </div>

                  <div class="gm-slug">

                    ${escapeHtml(
                      module.slug
                    )}

                  </div>

                </div>

                <span
                  class="gm-status ${
                    enabled
                      ? 'on'
                      : 'off'
                  }"
                  data-status
                >
                  ${
                    enabled
                      ? '● Active'
                      : '● Inactive'
                  }
                </span>

              </div>


              <div class="gm-grid">

                <div class="gm-field">

                  <label>
                    Plan
                  </label>

                  <input
                    type="text"
                    data-plan
                    value="${escapeHtml(plan)}"
                    placeholder="e.g. 500"
                  >

                </div>


                <div class="gm-field">

                  <label>
                    Expiry Date
                  </label>

                  <input
                    type="datetime-local"
                    data-expiry
                    value="${escapeHtml(expires)}"
                  >

                </div>


                <label class="gm-check">

                  <input
                    type="checkbox"
                    data-visible
                    ${visible ? 'checked' : ''}
                  >

                  Show module to client

                </label>


                <label class="gm-check">

                  <input
                    type="checkbox"
                    data-enabled
                    ${enabled ? 'checked' : ''}
                  >

                  Activate module

                </label>

              </div>


              <button
                type="button"
                class="gm-save"
                data-save
              >
                Save Module Access
              </button>

            </div>

          `;

        }
      )
      .join('');


    /* ENABLE / DISABLE STATUS */

    list
      .querySelectorAll(
        '[data-enabled]'
      )
      .forEach(
        checkbox => {

          checkbox.addEventListener(
            'change',
            () => {

              const card =
                checkbox.closest(
                  '.gm-card'
                );

              const status =
                card?.querySelector(
                  '[data-status]'
                );

              if (!status) {
                return;
              }

              status.textContent =
                checkbox.checked
                  ? '● Active'
                  : '● Inactive';

              status.className =
                'gm-status ' +
                (
                  checkbox.checked
                    ? 'on'
                    : 'off'
                );

            }
          );

        }
      );


    /* SAVE BUTTONS */

    list
      .querySelectorAll(
        '[data-save]'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            () => {
              saveModule(button);
            }
          );

        }
      );

  }


  /* =======================================================
     SAVE MODULE
  ======================================================= */

  async function saveModule(
    button
  ) {

    if (
      !currentClient ||
      !currentClient.client_id
    ) {

      showMessage(
        'पहले Client Fetch करें।',
        'error'
      );

      return;

    }


    const card =
      button.closest(
        '.gm-card'
      );

    if (!card) {
      return;
    }


    const moduleId =
      Number(
        card.dataset.moduleId
      );

    const enabled =
      card.querySelector(
        '[data-enabled]'
      ).checked;

    const visible =
      card.querySelector(
        '[data-visible]'
      ).checked;

    const plan =
      card.querySelector(
        '[data-plan]'
      ).value.trim();

    const expiryRaw =
      card.querySelector(
        '[data-expiry]'
      ).value;


    button.disabled =
      true;

    button.textContent =
      'Saving...';


    try {

      const old =
        accessMap[
          String(moduleId)
        ] || {};


      const payload = {

        client_id:
          currentClient.client_id,

        module_id:
          moduleId,

        enabled:
          enabled,

        visible_to_client:
          visible,

        status:
          enabled
            ? 'active'
            : 'inactive',

        plan:
          plan || null,

        activated_at:
          enabled
            ? (
                old.activated_at ||
                new Date().toISOString()
              )
            : null,

        expires_at:
          expiryRaw
            ? new Date(
                expiryRaw
              ).toISOString()
            : null

      };


      const {
        error
      } =
        await supabaseClient
          .from('client_modules')
          .upsert(
            payload,
            {
              onConflict:
                'client_id,module_id'
            }
          );


      if (error) {
        throw error;
      }


      accessMap[
        String(moduleId)
      ] = payload;


      showMessage(
        'Module access successfully saved.',
        'success'
      );


      renderModules();

    } catch (error) {

      console.error(
        'GLIME Module Save Error:',
        error
      );

      showMessage(
        'Module save failed: ' +
        (
          error?.message ||
          String(error)
        ),
        'error'
      );

    } finally {

      button.disabled =
        false;

      button.textContent =
        'Save Module Access';

    }

  }


  /* =======================================================
     FIND CLIENT
  ======================================================= */

  async function findClient() {

    const input =
      $('clientEmail');

    const email =
      (
        input?.value ||
        ''
      )
      .trim()
      .toLowerCase();


    if (!email) {

      showMessage(
        'पहले Client Email डालें।',
        'error'
      );

      return;

    }


    showMessage(
      'Client और modules load हो रहे हैं...',
      'info'
    );


    try {

      /* FIND CLIENT */

      const {
        data,
        error
      } =
        await supabaseClient
          .from('client_data')
          .select('*')
          .ilike(
            'email',
            email
          )
          .limit(1)
          .maybeSingle();


      if (error) {
        throw error;
      }


      if (!data) {

        throw new Error(
          'इस email से कोई client नहीं मिला।'
        );

      }


      currentClient =
        data;


      /* LOAD MODULES */

      await loadModules();


      /* LOAD ACCESS */

      await loadClientAccess(
        data.client_id
      );


      /* RENDER */

      renderModules();


      showMessage(
        `${data.client_id} के लिए ${modules.length} modules loaded.`,
        'success'
      );


    } catch (error) {

      console.error(
        'GLIME Module Manager Error:',
        error
      );


      const list =
        $('glimeModuleList');

      if (list) {

        list.innerHTML = `
          <div class="gm-empty">
            Modules load नहीं हो सके।
          </div>
        `;

      }


      showMessage(
        'Module Manager Error: ' +
        (
          error?.message ||
          String(error)
        ),
        'error'
      );

    }

  }


  /* =======================================================
     REMOVE SECTION
  ======================================================= */

  function removeSection() {

    const section =
      $(SECTION_ID);

    if (section) {
      section.remove();
    }

  }

 /* =======================================================
     INITIALIZE
  ======================================================= */

  async function init() {

    /* WAIT FOR SUPABASE LIBRARY */

    if (
      !window.supabase ||
      typeof window.supabase.createClient !==
        'function'
    ) {

      console.error(
        'GLIME Module Manager: Supabase library unavailable.'
      );

      return;

    }


    /* CREATE CLIENT */

    supabaseClient =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
          auth: {
            persistSession:true,
            autoRefreshToken:true,
            detectSessionInUrl:true
          }
        }
      );


    /* WAIT UNTIL ADMIN HTML IS READY */

    const start =
      async () => {

        const controlRoom =
          $('control-room');

        if (!controlRoom) {
          return;
        }


        const admin =
          await isAdmin();


        if (admin) {

          createSection();

        } else {

          removeSection();

        }

      };


    await start();


    /* AUTH CHANGES */

    supabaseClient.auth.onAuthStateChange(
      (
        event,
        session
      ) => {

        setTimeout(
          async () => {

            const email =
              (
                session?.user?.email ||
                ''
              )
              .trim()
              .toLowerCase();


            if (
              email ===
              ADMIN_EMAIL.toLowerCase()
            ) {

              createSection();

            } else {

              removeSection();

            }

          },
          0
        );

      }
    );


    /* FETCH CLIENT BUTTON */

    const fetchBtn =
      $('fetchBtn');


    if (fetchBtn) {

      fetchBtn.addEventListener(
        'click',
        findClient
      );

    } else {

      console.error(
        'GLIME Module Manager: #fetchBtn not found.'
      );

    }

  }


  /* =======================================================
     START
  ======================================================= */

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once:true
      }
    );

  } else {

    init();

  }

})();
