/* =========================================================
   GLIME CARE — UNIVERSAL ADMIN ACCESS CONTROL
   ---------------------------------------------------------
   Additive addon for existing admin.html.

   IMPORTANT:
   - Does NOT replace admin.html.
   - Does NOT modify admin-modules-addon.js.
   - CARE is controlled separately from client_modules.
   - Only GLIME Admin can change CARE.
   - Uses existing CARE Admin RPCs.
   - Waits for the existing Admin session before initializing.
========================================================= */

(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const ADMIN_EMAIL =
    'admin@glime.online';

  const SECTION_ID =
    'glime-care-admin-access';

  const STYLE_ID =
    'glime-care-admin-access-style';

  let db = null;
  let lastClientId = null;
  let initialized = false;
  let observerStarted = false;

  const $ = (id) =>
    document.getElementById(id);


  /* =========================================================
     STATUS
  ========================================================= */

  function showStatus(text, type = 'info') {

    const el = $('careAdminStatus');

    if (!el) return;

    el.textContent = text || '';
    el.className = 'gca-status ' + type;
    el.style.display = text ? 'block' : 'none';
  }


  /* =========================================================
     STYLES
  ========================================================= */

  function addStyles() {

    if ($(STYLE_ID)) return;

    const style =
      document.createElement('style');

    style.id = STYLE_ID;

    style.textContent = `

      #${SECTION_ID}{
        margin-top:22px;
        padding-top:20px;
        border-top:1px solid rgba(255,255,255,.09);
      }

      #${SECTION_ID} .gca-title{
        color:#00ff88;
        font-weight:700;
        font-size:1rem;
        margin-bottom:6px;
      }

      #${SECTION_ID} .gca-subtitle{
        color:#9ba7b7;
        font-size:.75rem;
        line-height:1.5;
        margin-bottom:15px;
      }

      #${SECTION_ID} .gca-card{
        padding:16px;
        border:1px solid rgba(0,255,136,.16);
        border-radius:14px;
        background:rgba(0,255,136,.025);
      }

      #${SECTION_ID} .gca-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        margin-bottom:14px;
      }

      #${SECTION_ID} .gca-name{
        color:#fff;
        font-size:.9rem;
        font-weight:700;
      }

      #${SECTION_ID} .gca-id{
        color:#687587;
        font-size:.68rem;
        margin-top:3px;
      }

      #${SECTION_ID} .gca-badge{
        display:inline-flex;
        padding:5px 9px;
        border-radius:999px;
        font-size:.68rem;
        font-weight:700;
        white-space:nowrap;
      }

      #${SECTION_ID} .gca-badge.active{
        color:#00ff88;
        background:rgba(0,255,136,.08);
        border:1px solid rgba(0,255,136,.25);
      }

      #${SECTION_ID} .gca-badge.paused,
      #${SECTION_ID} .gca-badge.none{
        color:#ff9f43;
        background:rgba(255,159,67,.08);
        border:1px solid rgba(255,159,67,.25);
      }

      #${SECTION_ID} .gca-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
      }

      #${SECTION_ID} .gca-field label{
        display:block;
        color:#9ba7b7;
        font-size:.69rem;
        font-weight:600;
        margin-bottom:6px;
      }

      #${SECTION_ID} .gca-field input{
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

      #${SECTION_ID} .gca-field input:focus{
        border-color:#00eaff;
        box-shadow:0 0 0 3px rgba(0,234,255,.08);
      }

      #${SECTION_ID} .gca-check{
        display:flex;
        align-items:center;
        gap:9px;
        min-height:40px;
        padding:9px 11px;
        border:1px solid rgba(255,255,255,.09);
        border-radius:9px;
        background:rgba(255,255,255,.025);
        color:#fff;
        font-size:.76rem;
        cursor:pointer;
      }

      #${SECTION_ID} .gca-check input{
        width:auto;
        accent-color:#00ff88;
      }

      #${SECTION_ID} .gca-save{
        width:100%;
        margin-top:11px;
        padding:11px 14px;
        border:0;
        border-radius:9px;
        background:#00ff88;
        color:#06100b;
        font:700 .82rem Poppins,system-ui,sans-serif;
        cursor:pointer;
      }

      #${SECTION_ID} .gca-save:hover:not(:disabled){
        transform:translateY(-1px);
        box-shadow:0 0 18px rgba(0,255,136,.16);
      }

      #${SECTION_ID} .gca-save:disabled{
        opacity:.55;
        cursor:not-allowed;
      }

      #${SECTION_ID} .gca-status{
        margin-top:12px;
        padding:10px 12px;
        border-radius:9px;
        font-size:.74rem;
        line-height:1.5;
        display:none;
      }

      #${SECTION_ID} .gca-status.success{
        color:#00ff88;
        background:rgba(0,255,136,.07);
        border:1px solid rgba(0,255,136,.25);
      }

      #${SECTION_ID} .gca-status.error{
        color:#ff5263;
        background:rgba(255,82,99,.07);
        border:1px solid rgba(255,82,99,.25);
      }

      #${SECTION_ID} .gca-status.info{
        color:#9ba7b7;
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.08);
      }

      #${SECTION_ID} .gca-help{
        color:#687587;
        font-size:.68rem;
        line-height:1.5;
        margin-top:10px;
      }

      #${SECTION_ID} .gca-loading{
        color:#9ba7b7;
        font-size:.74rem;
        padding:10px 0;
      }

      @media(max-width:650px){

        #${SECTION_ID} .gca-grid{
          grid-template-columns:1fr;
        }

        #${SECTION_ID} .gca-head{
          flex-direction:column;
        }

      }

    `;

    document.head.appendChild(style);
  }


  /* =========================================================
     CREATE CARE SECTION
  ========================================================= */

  function createSection() {

    if ($(SECTION_ID)) return true;

    const controlRoom =
      $('control-room');

    if (!controlRoom) {

      console.warn(
        'GLIME CARE Admin: #control-room not available yet.'
      );

      return false;
    }

    addStyles();

    const section =
      document.createElement('div');

    section.id = SECTION_ID;

    section.innerHTML = `

      <div class="gca-title">
        ❤️ GLIME CARE Access
      </div>

      <div class="gca-subtitle">
        Admin controls whether this client can use
        GLIME CARE. CARE permissions and actions remain
        separately controlled inside GLIME CARE.
      </div>

      <div class="gca-card">

        <div class="gca-head">

          <div>

            <div
              class="gca-name"
              id="careAdminClientName"
            >
              No client selected
            </div>

            <div
              class="gca-id"
              id="careAdminClientId"
            >
              Fetch a client first.
            </div>

          </div>

          <span
            id="careAdminBadge"
            class="gca-badge none"
          >
            ● Not enabled
          </span>

        </div>


        <div class="gca-grid">

          <div class="gca-field">

            <label for="careAdminDisplayName">
              CARE Display Name
            </label>

            <input
              id="careAdminDisplayName"
              type="text"
              maxlength="120"
              placeholder="Optional"
            >

          </div>


          <label class="gca-check">

            <input
              id="careAdminEnabled"
              type="checkbox"
            >

            <span>
              Enable GLIME CARE for this client
            </span>

          </label>

        </div>


        <button
          id="careAdminSave"
          type="button"
          class="gca-save"
          disabled
        >
          Save CARE Access
        </button>


        <div
          id="careAdminStatus"
          class="gca-status"
        ></div>


        <div class="gca-help">
          Disabling CARE pauses the CARE profile.
          Existing CARE data is not deleted.
        </div>

      </div>

    `;

    controlRoom.appendChild(section);


    const saveButton =
      $('careAdminSave');

    if (saveButton) {

      saveButton.addEventListener(
        'click',
        saveAccess
      );

    }

    return true;
  }


  /* =========================================================
     VERIFY ADMIN
  ========================================================= */

  async function verifyAdmin() {

    if (!db) return false;

    const {
      data,
      error
    } = await db.auth.getSession();

    if (error) {

      console.error(
        'GLIME CARE Admin session error:',
        error
      );

      return false;
    }

    const email =
      (
        data?.session?.user?.email || ''
      )
      .trim()
      .toLowerCase();

    return email ===
      ADMIN_EMAIL.toLowerCase();
  }


  /* =========================================================
     CURRENT CLIENT
  ========================================================= */

  function getCurrentClientId() {

    const el =
      $('clientCodeView');

    if (!el) return '';

    const value =
      (
        el.textContent || ''
      ).trim();

    if (!value) return '';

    if (
      value === '—' ||
      value === 'Not assigned'
    ) {
      return '';
    }

    return value;
  }


  function getCurrentClientName() {

    const el =
      $('clientEmailView');

    return (
      el?.textContent || ''
    ).trim();
  }


  /* =========================================================
     RESET
  ========================================================= */

  function resetSection() {

    const badge =
      $('careAdminBadge');

    if (badge) {

      badge.textContent =
        '● Not enabled';

      badge.className =
        'gca-badge none';

    }


    const enabled =
      $('careAdminEnabled');

    if (enabled) {

      enabled.checked = false;

    }


    const displayName =
      $('careAdminDisplayName');

    if (displayName) {

      displayName.value = '';

    }


    const save =
      $('careAdminSave');

    if (save) {

      save.disabled = true;

    }


    const name =
      $('careAdminClientName');

    if (name) {

      name.textContent =
        'No client selected';

    }


    const id =
      $('careAdminClientId');

    if (id) {

      id.textContent =
        'Fetch a client first.';

    }


    showStatus('', 'info');

    lastClientId = null;
  }


  /* =========================================================
     LOAD CARE ACCESS
  ========================================================= */

  async function loadAccess(clientId) {

    if (!clientId) {

      resetSection();

      return;
    }

    if (!db) return;

    lastClientId =
      clientId;

    const name =
      $('careAdminClientName');

    const id =
      $('careAdminClientId');

    const save =
      $('careAdminSave');

    if (name) {

      name.textContent =
        getCurrentClientName() ||
        'Selected client';

    }

    if (id) {

      id.textContent =
        'Client ID: ' + clientId;

    }

    if (save) {

      save.disabled = true;

    }

    showStatus(
      'Checking CARE access…',
      'info'
    );


    try {

      const admin =
        await verifyAdmin();

      if (!admin) {

        throw new Error(
          'Admin authorization required.'
        );

      }


      const {
        data,
        error
      } = await db.rpc(
        'care_admin_get_access',
        {
          p_client_id:
            clientId
        }
      );


      if (error) {

        throw error;

      }


      const profile =
        data?.profile || null;

      const enabled =
        data?.enabled === true;


      const checkbox =
        $('careAdminEnabled');

      if (checkbox) {

        checkbox.checked =
          enabled;

      }


      const display =
        $('careAdminDisplayName');

      if (display) {

        display.value =
          profile?.display_name || '';

      }


      const badge =
        $('careAdminBadge');

      if (badge) {

        if (enabled) {

          badge.textContent =
            '● Active';

          badge.className =
            'gca-badge active';

        } else if (profile) {

          badge.textContent =
            '● Paused';

          badge.className =
            'gca-badge paused';

        } else {

          badge.textContent =
            '● Not enabled';

          badge.className =
            'gca-badge none';

        }

      }


      if (save) {

        save.disabled = false;

      }

      showStatus('', 'info');

    } catch (error) {

      console.error(
        'GLIME CARE Admin load:',
        error
      );

      showStatus(
        error?.message ||
        'Unable to load CARE access.',
        'error'
      );

      if (save) {

        save.disabled = false;

      }

    }
  }


  /* =========================================================
     SAVE CARE ACCESS
  ========================================================= */

  async function saveAccess() {

    const clientId =
      lastClientId ||
      getCurrentClientId();

    if (!clientId) {

      showStatus(
        'Please fetch a client first.',
        'error'
      );

      return;
    }


    const button =
      $('careAdminSave');

    if (!button) return;


    const enabled =
      $('careAdminEnabled')?.checked === true;


    const displayName =
      (
        $('careAdminDisplayName')?.value ||
        ''
      ).trim();


    button.disabled = true;


    showStatus(
      enabled
        ? 'Enabling GLIME CARE…'
        : 'Disabling GLIME CARE…',
      'info'
    );


    try {

      const admin =
        await verifyAdmin();

      if (!admin) {

        throw new Error(
          'Admin authorization required.'
        );

      }


      const {
        data,
        error
      } = await db.rpc(
        'care_admin_set_access',
        {
          p_client_id:
            clientId,

          p_enabled:
            enabled,

          p_display_name:
            displayName || null
        }
      );


      if (error) {

        throw error;

      }


      const actualEnabled =
        data?.enabled === true;


      const badge =
        $('careAdminBadge');


      if (actualEnabled) {

        if (badge) {

          badge.textContent =
            '● Active';

          badge.className =
            'gca-badge active';

        }

        showStatus(
          'GLIME CARE is now enabled for this client.',
          'success'
        );

      } else {

        if (badge) {

          badge.textContent =
            '● Paused';

          badge.className =
            'gca-badge paused';

        }

        showStatus(
          'GLIME CARE has been paused. CARE data was not deleted.',
          'success'
        );

      }

    } catch (error) {

      console.error(
        'GLIME CARE Admin save:',
        error
      );

      showStatus(
        error?.message ||
        'Unable to update CARE access.',
        'error'
      );

    } finally {

      button.disabled = false;

    }
  }


  /* =========================================================
     WATCH CLIENT SELECTION
  ========================================================= */

  function watchClientSelection() {

    if (observerStarted) return;

    const target =
      $('clientCodeView');

    if (!target) {

      console.warn(
        'GLIME CARE Admin: clientCodeView not found yet.'
      );

      return;
    }

    observerStarted = true;


    const observer =
      new MutationObserver(() => {

        const clientId =
          getCurrentClientId();


        if (!clientId) {

          resetSection();

          return;
        }


        if (
          clientId ===
          lastClientId
        ) {

          return;
        }


        loadAccess(clientId)
          .catch((error) => {

            console.error(
              'GLIME CARE Admin watcher:',
              error
            );

          });

      });


    observer.observe(
      target,
      {
        childList:true,
        characterData:true,
        subtree:true
      }
    );


    const initialClient =
      getCurrentClientId();


    if (initialClient) {

      loadAccess(initialClient)
        .catch((error) => {

          console.error(
            'GLIME CARE Admin initial load:',
            error
          );

        });

    }
  }


  /* =========================================================
     WAIT FOR ADMIN CONTROL ROOM
  ========================================================= */

  function waitForControlRoom() {

    if ($(SECTION_ID)) {

      watchClientSelection();

      return;
    }


    if (
      $('control-room') &&
      $('clientCodeView')
    ) {

      createSection();

      watchClientSelection();

      return;
    }


    setTimeout(
      waitForControlRoom,
      250
    );
  }


  /* =========================================================
     INITIALIZE
  ========================================================= */

  async function initialize() {

    if (initialized) return;

    initialized = true;


    try {

      if (!window.supabase) {

        throw new Error(
          'Supabase library is not available.'
        );

      }


      db =
        window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_KEY,
          {
            auth:{
              persistSession:true,
              autoRefreshToken:true,
              detectSessionInUrl:true
            }
          }
        );


      /*
        IMPORTANT:

        Do NOT remove the CARE section merely because
        the first session check happens too early.

        The existing admin.html is responsible for
        showing the Control Room after Admin login.
        We wait for that state.
      */


      let attempts = 0;

      const waitForAdmin =
        async () => {

          attempts++;


          const admin =
            await verifyAdmin();


          if (admin) {

            waitForControlRoom();

            return;

          }


          /*
            Session may not exist yet because the main
            admin login script is still processing.

            Keep waiting for a short period.
          */

          if (attempts < 80) {

            setTimeout(
              waitForAdmin,
              250
            );

          } else {

            console.warn(
              'GLIME CARE Admin: Admin session was not detected.'
            );

          }

        };


      await waitForAdmin();


      /*
        Also listen for future auth changes.
        This makes the addon recover after login
        without requiring a page refresh.
      */

      db.auth.onAuthStateChange(
        async (_event, session) => {

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

            waitForControlRoom();

          } else {

            const section =
              $(SECTION_ID);

            if (section) {

              section.remove();

            }

            observerStarted = false;
            lastClientId = null;

          }

        }
      );

    } catch (error) {

      console.error(
        'GLIME CARE Admin initialization:',
        error
      );

    }
  }


  /* =========================================================
     START
  ========================================================= */

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      { once:true }
    );

  } else {

    initialize();

  }

})();
