/* =========================================================
   GLIME CARE — UNIVERSAL ADMIN ACCESS CONTROL
   ---------------------------------------------------------
   Additive addon for the existing admin.html.

   IMPORTANT:
   - Does NOT replace admin.html.
   - Does NOT modify admin-modules-addon.js.
   - CARE is controlled separately from client_modules.
   - Only the existing GLIME Admin identity can change CARE.
   - Backend authorization is enforced by Supabase RPC.
========================================================= */

(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const SECTION_ID =
    'glime-care-admin-access';

  const STYLE_ID =
    'glime-care-admin-access-style';

  let db = null;
  let lastClientId = null;
  let initialized = false;

  const $ = (id) =>
    document.getElementById(id);

  function esc(value) {
    return String(value ?? '')
      .replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[c]));
  }

  function showStatus(text, type = 'info') {
    const el = $('careAdminStatus');

    if (!el) return;

    el.textContent = text || '';
    el.className = 'gca-status ' + type;
    el.style.display = text ? 'block' : 'none';
  }

  function addStyles() {
    if ($(STYLE_ID)) return;

    const style = document.createElement('style');

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

  function createSection() {

    if ($(SECTION_ID)) return;

    const controlRoom =
      $('control-room');

    if (!controlRoom) {
      console.error(
        'GLIME CARE Admin: #control-room not found.'
      );
      return;
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
        Admin controls whether this client is allowed
        to use GLIME CARE. CARE permissions and actions
        are managed separately inside CARE.
      </div>

      <div class="gca-card">

        <div class="gca-head">
          <div>
            <div class="gca-name"
                 id="careAdminClientName">
              No client selected
            </div>

            <div class="gca-id"
                 id="careAdminClientId">
              Fetch a client first.
            </div>
          </div>

          <span
            id="careAdminBadge"
            class="gca-badge none">
            Not enabled
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
              placeholder="Optional"
            >
          </div>

          <label class="gca-check">
            <input
              id="careAdminEnabled"
              type="checkbox"
            >
            Enable GLIME CARE for this client
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

    $('careAdminSave')
      ?.addEventListener(
        'click',
        saveAccess
      );
  }

  async function verifyAdmin() {

    const {
      data,
      error
    } = await db.auth.getSession();

    if (error) throw error;

    const email =
      (
        data?.session?.user?.email ||
        ''
      )
      .trim()
      .toLowerCase();

    return email ===
      'admin@glime.online';
  }

  function getCurrentClientId() {

    const el =
      $('clientCodeView');

    if (!el) return '';

    return (
      el.textContent ||
      ''
    ).trim();
  }

  function getCurrentClientName() {

    const el =
      $('clientEmailView');

    return (
      el?.textContent ||
      ''
    ).trim();
  }

  async function loadAccess(clientId) {

    if (!clientId) {
      resetSection();
      return;
    }

    lastClientId = clientId;

    showStatus(
      'Checking CARE access…',
      'info'
    );

    const {
      data,
      error
    } = await db.rpc(
      'care_admin_get_access',
      {
        p_client_id: clientId
      }
    );

    if (error) throw error;

    const profile =
      data?.profile || null;

    const enabled =
      data?.enabled === true;

    $('careAdminEnabled').checked =
      enabled;

    $('careAdminDisplayName').value =
      profile?.display_name || '';

    const badge =
      $('careAdminBadge');

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

    $('careAdminClientName').textContent =
      getCurrentClientName() ||
      profile?.display_name ||
      'Selected client';

    $('careAdminClientId').textContent =
      'Client ID: ' + clientId;

    $('careAdminSave').disabled =
      false;

    showStatus('', 'info');
  }

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

    const enabled =
      $('careAdminEnabled').checked;

    const displayName =
      (
        $('careAdminDisplayName').value ||
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

      const {
        data,
        error
      } = await db.rpc(
        'care_admin_set_access',
        {
          p_client_id: clientId,
          p_enabled: enabled,
          p_display_name:
            displayName || null
        }
      );

      if (error) throw error;

      const actualEnabled =
        data?.enabled === true;

      const badge =
        $('careAdminBadge');

      if (actualEnabled) {

        badge.textContent =
          '● Active';

        badge.className =
          'gca-badge active';

        showStatus(
          'GLIME CARE is now enabled for this client.',
          'success'
        );

      } else {

        badge.textContent =
          '● Paused';

        badge.className =
          'gca-badge paused';

        showStatus(
          'GLIME CARE has been paused. CARE data was not deleted.',
          'success'
        );
      }

    } catch (error) {

      console.error(
        'GLIME CARE Admin:',
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

  function resetSection() {

    const badge =
      $('careAdminBadge');

    if (badge) {

      badge.textContent =
        '● Not enabled';

      badge.className =
        'gca-badge none';
    }

    if ($('careAdminEnabled')) {

      $('careAdminEnabled').checked =
        false;
    }

    if ($('careAdminDisplayName')) {

      $('careAdminDisplayName').value =
        '';
    }

    if ($('careAdminSave')) {

      $('careAdminSave').disabled =
        true;
    }

    if ($('careAdminClientName')) {

      $('careAdminClientName').textContent =
        'No client selected';
    }

    if ($('careAdminClientId')) {

      $('careAdminClientId').textContent =
        'Fetch a client first.';
    }

    showStatus('', 'info');

    lastClientId = null;
  }

  function watchClientSelection() {

    const target =
      $('clientCodeView');

    if (!target) return;

    const observer =
      new MutationObserver(() => {

        const clientId =
          getCurrentClientId();

        if (!clientId) {

          resetSection();

          return;
        }

        if (clientId === lastClientId) {

          return;
        }

        loadAccess(clientId)
          .catch((error) => {

            console.error(
              'GLIME CARE Admin load:',
              error
            );

            showStatus(
              error?.message ||
              'Unable to load CARE access.',
              'error'
            );
          });
      });

    observer.observe(
      target,
      {
        childList: true,
        characterData: true,
        subtree: true
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

  async function initialize() {

    if (initialized) return;

    initialized = true;

    try {

      db =
        window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_KEY
        );

      createSection();

      const admin =
        await verifyAdmin();

      if (!admin) {

        const section =
          $(SECTION_ID);

        if (section) {
          section.remove();
        }

        console.warn(
          'GLIME CARE Admin: unauthorized user.'
        );

        return;
      }

      watchClientSelection();

    } catch (error) {

      console.error(
        'GLIME CARE Admin initialization:',
        error
      );
    }
  }

  function start() {

    if (
      document.readyState ===
      'loading'
    ) {

      document.addEventListener(
        'DOMContentLoaded',
        initialize,
        { once: true }
      );

    } else {

      initialize();
    }
  }

  start();

})();
