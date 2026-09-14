/* =========================================================
   GLIME — UNIVERSAL ADMIN MODULE MANAGER
   ---------------------------------------------------------
   One common control room for all GLIME modules.

   IMPORTANT:
   - Does NOT replace admin.html
   - Does NOT modify existing admin logic
   - Only renders after admin authentication
   - Uses client_modules as the single access-control layer
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


  const supabase =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );


  /* =======================================================
     STATE
  ======================================================= */

  let currentClient = null;

  let modules = [];

  let accessMap = {};


  const SECTION_ID =
    'glime-universal-module-manager';

  const STYLE_ID =
    'glime-universal-module-manager-style';


  /* =======================================================
     HELPERS
  ======================================================= */

  function escapeHtml(value) {

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  }


  function getControlRoom() {

    return document.getElementById(
      'control-room'
    );

  }


  function getClientEmail() {

    const input =
      document.getElementById(
        'clientEmail'
      );

    return (
      input?.value
        ?.trim()
        ?.toLowerCase() || ''
    );

  }


  function showMessage(
    text,
    type = 'info'
  ) {

    const el =
      document.getElementById(
        'glimeModuleMessage'
      );

    if (!el) {
      return;
    }


    el.textContent =
      text || '';


    el.style.display =
      text
        ? 'block'
        : 'none';


    if (type === 'success') {

      el.style.color =
        '#00ff88';

      el.style.background =
        'rgba(0,255,136,.07)';

      el.style.border =
        '1px solid rgba(0,255,136,.25)';

    }

    else if (type === 'error') {

      el.style.color =
        '#ff5263';

      el.style.background =
        'rgba(255,82,99,.07)';

      el.style.border =
        '1px solid rgba(255,82,99,.25)';

    }

    else {

      el.style.color =
        '#9ba7b7';

      el.style.background =
        'rgba(255,255,255,.03)';

      el.style.border =
        '1px solid rgba(255,255,255,.08)';

    }

  }


  /* =======================================================
     STYLES
  ======================================================= */

  function addStyles() {

    if (
      document.getElementById(
        STYLE_ID
      )
    ) {
      return;
    }


    const style =
      document.createElement('style');


    style.id =
      STYLE_ID;


    style.textContent = `

      #${SECTION_ID} {
        margin-top:22px;
        padding-top:20px;
        border-top:
          1px solid rgba(255,255,255,.09);
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

        border:
          1px solid rgba(255,255,255,.09);

        border-radius:14px;

        background:
          rgba(255,255,255,.02);

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

        gap:6px;

        padding:5px 9px;

        border-radius:999px;

        font-size:.68rem;

        font-weight:700;

        white-space:nowrap;

      }


      #${SECTION_ID} .gm-status-dot {

        width:7px;

        height:7px;

        border-radius:50%;

        background:currentColor;

      }


      #${SECTION_ID} .gm-status.off {

        color:#9ba7b7;

        background:
          rgba(255,255,255,.04);

        border:
          1px solid rgba(255,255,255,.08);

      }


      #${SECTION_ID} .gm-status.on {

        color:#00ff88;

        background:
          rgba(0,255,136,.07);

        border:
          1px solid rgba(0,255,136,.25);

      }


      #${SECTION_ID} .gm-grid {

        display:grid;

        grid-template-columns:
          repeat(2,minmax(0,1fr));

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

        border:
          1px solid rgba(255,255,255,.09);

        background:
          rgba(255,255,255,.025);

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

        border:
          1px solid rgba(255,255,255,.09);

        border-radius:9px;

        background:
          rgba(255,255,255,.025);

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

        font:
          700 .82rem
          Poppins,
          system-ui,
          sans-serif;

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


      #${SECTION_ID} .gm-empty {

        padding:16px;

        border:
          1px dashed rgba(255,255,255,.12);

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


    document.head.appendChild(
      style
    );

  }


  /* =======================================================
     CREATE SECTION
  ======================================================= */

  function createSection() {

    if (
      document.getElementById(
        SECTION_ID
      )
    ) {
      return;
    }


    const controlRoom =
      getControlRoom();


    if (!controlRoom) {
      return;
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
        is allowed to use. Only enabled modules
        should appear in the client dashboard.

      </div>


      <div
        id="glimeModuleList"
        class="gm-list"
      >

        <div class="gm-empty">
          Loading modules...
        </div>

      </div>


      <div
        id="glimeModuleMessage"
        class="gm-message"
      ></div>

    `;


    controlRoom.appendChild(
      section
    );

  }


  /* =======================================================
     FIND CLIENT
  ======================================================= */

  async function findClient() {

    const email =
      getClientEmail();


    if (!email) {

      throw new Error(
        'पहले Client Email डालें।'
      );

    }


    const {
      data,
      error
    } =
      await supabase
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


    return data;

  }


  /* =======================================================
     LOAD MODULES
  ======================================================= */

  async function loadModules() {

    const {
      data,
      error
    } =
      await supabase
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
     LOAD CLIENT ACCESS
  ======================================================= */

  async function loadClientAccess(
    clientId
  ) {

    const {
      data,
      error
    } =
      await supabase
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
     FORMAT DATE
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
      document.getElementById(
        'glimeModuleList'
      );


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
              data-module-id="${module.id}"
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
                  data-status-for="${module.id}"
                >

                  <span
                    class="gm-status-dot"
                  ></span>

                  ${
                    enabled
                      ? 'Active'
                      : 'Inactive'
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
                    data-plan="${module.id}"
                    value="${escapeHtml(
                      plan
                    )}"
                    placeholder="e.g. 500"
                  >

                </div>


                <div class="gm-field">

                  <label>
                    Expiry Date
                  </label>


                  <input
                    type="datetime-local"
                    data-expiry="${module.id}"
                    value="${expires}"
                  >

                </div>


                <label class="gm-check">

                  <input
                    type="checkbox"
                    data-visible="${module.id}"
                    ${
                      visible
                        ? 'checked'
                        : ''
                    }
                  >

                  Show module to client

                </label>


                <label class="gm-check">

                  <input
                    type="checkbox"
                    data-enabled="${module.id}"
                    ${
                      enabled
                        ? 'checked'
                        : ''
                    }
                  >

                  Activate module

                </label>


              </div>


              <button
                type="button"
                class="gm-save"
                data-save-module="${module.id}"
              >

                Save ${escapeHtml(
                  module.name
                )} Access

              </button>


            </div>

          `;

        }
      )
      .join('');


    bindModuleButtons();

  }


  /* =======================================================
     BIND BUTTONS
  ======================================================= */

  function bindModuleButtons() {

    document
      .querySelectorAll(
        '[data-save-module]'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            async () => {

              const moduleId =
                button.dataset
                  .saveModule;


              await saveModule(
                moduleId,
                button
              );

            }
          );

        }
      );


    document
      .querySelectorAll(
        '[data-enabled]'
      )
      .forEach(
        checkbox => {

          checkbox.addEventListener(
            'change',
            () => {

              updateVisualStatus(
                checkbox.dataset
                  .enabled,
                checkbox.checked
              );

            }
          );

        }
      );

  }


  /* =======================================================
     UPDATE VISUAL STATUS
  ======================================================= */

  function updateVisualStatus(
    moduleId,
    enabled
  ) {

    const status =
      document.querySelector(
        `[data-status-for="${moduleId}"]`
      );


    if (!status) {
      return;
    }


    status.className =
      'gm-status ' +
      (
        enabled
          ? 'on'
          : 'off'
      );


    status.innerHTML = `

      <span
        class="gm-status-dot"
      ></span>

      ${
        enabled
          ? 'Active'
          : 'Inactive'
      }

    `;

  }

  /* =======================================================
     SHOW AFTER LOGIN
  ======================================================= */

  async function showAfterLogin() {

    const isAdmin =
      await checkAdminSession();


    if (!isAdmin) {

      removeSection();

      return;

    }


    createSection();


    /*
     * Existing admin.html fetch button
     * must remain the source of client selection.
     */

    setTimeout(
      () => {

        hookFetchButton();

      },
      300
    );


    setTimeout(
      () => {

        hookFetchButton();

      },
      1200
    );

  }


  /* =======================================================
     REMOVE BEFORE LOGOUT
  ======================================================= */

  function removeSection() {

    const section =
      document.getElementById(
        SECTION_ID
      );


    if (section) {

      section.remove();

    }


    currentClient =
      null;

    modules =
      [];

    accessMap =
      {};

  }


  /* =======================================================
     AUTH LISTENER
  ======================================================= */

  function listenAuthChanges() {

    supabase.auth.onAuthStateChange(
      (
        event,
        session
      ) => {

        setTimeout(
          () => {

            if (
              session?.user
            ) {

              showAfterLogin()
                .catch(
                  console.error
                );

            }

            else {

              removeSection();

            }

          },
          0
        );

      }
    );

  }


  /* =======================================================
     INIT
  ======================================================= */

  async function init() {

    try {

      /*
       * IMPORTANT:
       * We check authentication BEFORE
       * creating the module manager.
       */

      const isAdmin =
        await checkAdminSession();


      if (!isAdmin) {

        removeSection();

        /*
         * Login screen remains completely
         * controlled by admin.html.
         */

        listenAuthChanges();

        return;

      }


      createSection();


      hookFetchButton();


      listenAuthChanges();


    } catch (error) {

      console.warn(
        'GLIME Module Manager init:',
        error.message ||
        String(error)
      );


      removeSection();

      listenAuthChanges();

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
      init
    );

  } else {

    init();

  }

})();


  

  
