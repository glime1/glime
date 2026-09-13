(() => {
  /*
   * GLIME Instagram AI Sales Agent
   * ADMIN ADD-ON
   *
   * Existing admin.html को replace नहीं करता।
   */

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const MODULE_SLUG =
    'instagram_ai_sales_agent';

  const supabase =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

  const STYLE_ID =
    'glime-instagram-admin-style';

  const SECTION_ID =
    'glime-instagram-admin-section';


  let currentClient = null;
  let moduleRecord = null;
  let accessRecord = null;


  /* =====================================================
     STYLES
  ====================================================== */

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

      #${SECTION_ID} .glime-ia-title {
        color:#ff9f43;
        font-weight:600;
        font-size:1rem;
        margin-bottom:14px;
      }

      #${SECTION_ID} .glime-ia-box {
        padding:18px;
        border:
          1px solid rgba(255,255,255,.09);
        border-radius:14px;
        background:
          rgba(255,255,255,.02);
      }

      #${SECTION_ID} .glime-ia-head {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:15px;
        margin-bottom:16px;
      }

      #${SECTION_ID} .glime-ia-name {
        color:#fff;
        font-weight:700;
        font-size:1rem;
      }

      #${SECTION_ID} .glime-ia-desc {
        color:#9ba7b7;
        font-size:.78rem;
        line-height:1.55;
        margin-top:5px;
      }

      #${SECTION_ID} .glime-ia-status {
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:5px 9px;
        border-radius:999px;
        font-size:.7rem;
        font-weight:700;
        white-space:nowrap;
      }

      #${SECTION_ID} .glime-ia-status-dot {
        width:7px;
        height:7px;
        border-radius:50%;
        background:currentColor;
      }

      #${SECTION_ID}
      .glime-ia-status.off {

        color:#9ba7b7;

        background:
          rgba(255,255,255,.04);

        border:
          1px solid rgba(255,255,255,.08);
      }

      #${SECTION_ID}
      .glime-ia-status.on {

        color:#00ff88;

        background:
          rgba(0,255,136,.07);

        border:
          1px solid rgba(0,255,136,.25);
      }

      #${SECTION_ID}
      .glime-ia-controls {

        display:grid;

        grid-template-columns:
          repeat(2,minmax(0,1fr));

        gap:12px;
      }

      #${SECTION_ID}
      .glime-ia-field label {

        display:block;

        color:#9ba7b7;

        font-size:.72rem;

        font-weight:600;

        margin-bottom:6px;
      }

      #${SECTION_ID}
      .glime-ia-field input {

        width:100%;

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

      #${SECTION_ID}
      .glime-ia-check {

        display:flex;

        align-items:center;

        gap:9px;

        min-height:42px;

        padding:10px 12px;

        border:
          1px solid rgba(255,255,255,.09);

        border-radius:9px;

        background:
          rgba(255,255,255,.025);

        color:#fff;

        font-size:.8rem;

        cursor:pointer;
      }

      #${SECTION_ID}
      .glime-ia-check input {

        width:auto;

        accent-color:#00ff88;
      }

      #${SECTION_ID}
      .glime-ia-actions {

        display:flex;

        gap:10px;

        margin-top:14px;
      }

      #${SECTION_ID}
      .glime-ia-save {

        flex:1;

        background:#00ff88;

        color:#06100b;

        border:0;

        border-radius:9px;

        padding:11px 14px;

        font:
          700 .85rem
          Poppins,
          system-ui,
          sans-serif;

        cursor:pointer;
      }

      #${SECTION_ID}
      .glime-ia-save:disabled {

        opacity:.55;

        cursor:not-allowed;
      }

      #${SECTION_ID}
      .glime-ia-open {

        flex:1;

        text-align:center;

        text-decoration:none;

        border:
          1px solid rgba(0,234,255,.45);

        color:#00eaff;

        background:
          rgba(0,234,255,.06);

        border-radius:9px;

        padding:10px 14px;

        font-weight:700;

        font-size:.82rem;
      }

      #${SECTION_ID}
      .glime-ia-message {

        display:none;

        margin-top:10px;

        padding:9px 11px;

        border-radius:8px;

        font-size:.75rem;

        color:#9ba7b7;

        background:
          rgba(255,255,255,.03);
      }

      @media(max-width:650px) {

        #${SECTION_ID}
        .glime-ia-head {

          flex-direction:column;
        }

        #${SECTION_ID}
        .glime-ia-controls {

          grid-template-columns:1fr;
        }

        #${SECTION_ID}
        .glime-ia-actions {

          flex-direction:column;
        }

      }

    `;

    document.head.appendChild(
      style
    );
  }


  /* =====================================================
     CREATE ADMIN SECTION
  ====================================================== */

  function createSection() {

    if (
      document.getElementById(
        SECTION_ID
      )
    ) {
      return;
    }

    const container =
      document.getElementById(
        'control-room'
      ) ||
      document.querySelector(
        '.wrap'
      );

    if (!container) {
      return;
    }


    const section =
      document.createElement('div');

    section.id =
      SECTION_ID;


    section.innerHTML = `

      <div class="glime-ia-title">
        4. AI Modules
      </div>


      <div class="glime-ia-box">


        <div class="glime-ia-head">

          <div>

            <div class="glime-ia-name">
              🤖 Instagram AI Sales Agent
            </div>

            <div class="glime-ia-desc">

              Paid module. Admin decides
              whether it is visible to the
              client and whether it is active.

            </div>

          </div>


          <span
            id="glimeIaStatus"
            class="glime-ia-status off"
          >

            <span
              class="glime-ia-status-dot"
            ></span>

            Not configured

          </span>

        </div>


        <div class="glime-ia-controls">


          <div class="glime-ia-field">

            <label
              for="glimeIaPlan"
            >
              Plan
            </label>

            <input
              id="glimeIaPlan"
              type="text"
              placeholder="Instagram AI Monthly"
            >

          </div>


          <div class="glime-ia-field">

            <label
              for="glimeIaExpires"
            >
              Expiry Date
              (optional)
            </label>

            <input
              id="glimeIaExpires"
              type="datetime-local"
            >

          </div>


          <label
            class="glime-ia-check"
          >

            <input
              id="glimeIaVisible"
              type="checkbox"
            >

            Show module to client

          </label>


          <label
            class="glime-ia-check"
          >

            <input
              id="glimeIaEnabled"
              type="checkbox"
            >

            Activate module

          </label>


        </div>


        <div
          class="glime-ia-actions"
        >

          <button
            id="glimeIaSave"
            class="glime-ia-save"
            type="button"
          >
            Save Module Access
          </button>


          <a
            id="glimeIaOpen"
            class="glime-ia-open"
            href="instagram-agent.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Module →
          </a>

        </div>


        <div
          id="glimeIaMessage"
          class="glime-ia-message"
        ></div>


      </div>

    `;


    /*
     * Existing Admin sections को छेड़े बिना
     * नया section नीचे add किया जा रहा है.
     */

    container.appendChild(
      section
    );


    document
      .getElementById(
        'glimeIaSave'
      )
      ?.addEventListener(
        'click',
        saveModuleAccess
      );
  }
  
  function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  }


  /* =====================================================
     MESSAGE
  ====================================================== */

  function showMessage(text) {

    const el =
      document.getElementById(
        'glimeIaMessage'
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
  }


  /* =====================================================
     STATUS
  ====================================================== */

  function setStatus(
    text,
    active
  ) {

    const el =
      document.getElementById(
        'glimeIaStatus'
      );

    if (!el) {
      return;
    }

    el.className =
      'glime-ia-status ' +
      (
        active
          ? 'on'
          : 'off'
      );

    el.innerHTML =
      `
        <span
          class="glime-ia-status-dot"
        ></span>

        ${escapeHtml(text)}
      `;
  }


  /* =====================================================
     DATE
  ====================================================== */

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


  /* =====================================================
     FIND MODULE
  ====================================================== */

  async function findModule() {

    const result =
      await supabase
        .from('modules')
        .select(`
          id,
          name,
          slug
        `)
        .eq(
          'slug',
          MODULE_SLUG
        )
        .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data;
  }


  /* =====================================================
     FIND CLIENT
  ====================================================== */

  async function findClientByEmail(
    email
  ) {

    if (!email) {
      return null;
    }

    const result =
      await supabase
        .from('client_data')
        .select(`
          id,
          client_id,
          email,
          auth_user_id,
          client_name,
          full_name,
          name
        `)
        .ilike(
          'email',
          email.trim().toLowerCase()
        )
        .order(
          'created_at',
          {
            ascending:false
          }
        )
        .limit(1)
        .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data;
  }


  /* =====================================================
     LOAD MODULE
  ====================================================== */

  async function loadModuleForCurrentEmail() {

    const emailInput =
      document.getElementById(
        'clientEmail'
      );

    const email =
      emailInput?.value
        ?.trim()
        .toLowerCase();


    if (!email) {
      return;
    }


    try {

      const client =
        await findClientByEmail(
          email
        );

      currentClient =
        client || null;


      if (
        !client?.client_id
      ) {

        moduleRecord = null;
        accessRecord = null;

        setStatus(
          'Client not found',
          false
        );

        showMessage(
          'पहले valid client email fetch/create करें.'
        );

        return;
      }


      moduleRecord =
        await findModule();


      if (!moduleRecord) {

        setStatus(
          'Module not found',
          false
        );

        showMessage(
          'Instagram AI Sales Agent module Supabase में नहीं मिला.'
        );

        return;
      }


      const accessResult =
        await supabase
          .from('client_modules')
          .select(`
            enabled,
            status,
            visible_to_client,
            activated_at,
            expires_at,
            plan
          `)
          .eq(
            'client_id',
            client.client_id
          )
          .eq(
            'module_id',
            moduleRecord.id
          )
          .maybeSingle();


      if (accessResult.error) {
        throw accessResult.error;
      }


      accessRecord =
        accessResult.data ||
        null;


      document.getElementById(
        'glimeIaVisible'
      ).checked =
        accessRecord?.visible_to_client === true;


      document.getElementById(
        'glimeIaEnabled'
      ).checked =
        accessRecord?.enabled === true;


      document.getElementById(
        'glimeIaPlan'
      ).value =
        accessRecord?.plan || '';


      document.getElementById(
        'glimeIaExpires'
      ).value =
        toDateTimeLocal(
          accessRecord?.expires_at
        );


      const active =
        accessRecord?.enabled === true &&
        (
          !accessRecord?.expires_at ||
          new Date(
            accessRecord.expires_at
          ) > new Date()
        );


      setStatus(

        active
          ? 'Active'

          :

        accessRecord?.visible_to_client
          ? 'Visible / Inactive'

          :

        'Disabled',

        active
      );


      showMessage(
        `Client ${client.client_id} module settings loaded.`
      );


    } catch (error) {

      console.error(
        'GLIME Admin Instagram Agent:',
        error
      );

      setStatus(
        'Error',
        false
      );

      showMessage(
        'Module settings load नहीं हो सकीं: ' +
        (
          error?.message ||
          String(error)
        )
      );
    }
  }


  /* =====================================================
     SAVE
  ====================================================== */

  async function saveModuleAccess() {

    const button =
      document.getElementById(
        'glimeIaSave'
      );


    if (
      !currentClient?.client_id
    ) {

      showMessage(
        'पहले Client Email से client fetch करें.'
      );

      return;
    }


    if (
      !moduleRecord?.id
    ) {

      showMessage(
        'Instagram AI Sales Agent module उपलब्ध नहीं है.'
      );

      return;
    }


    const visible =
      document.getElementById(
        'glimeIaVisible'
      ).checked;


    const enabled =
      document.getElementById(
        'glimeIaEnabled'
      ).checked;


    const plan =
      document.getElementById(
        'glimeIaPlan'
      )
      .value
      .trim() ||
      null;


    const expiresRaw =
      document.getElementById(
        'glimeIaExpires'
      ).value;


    const expiresAt =
      expiresRaw
        ? new Date(
            expiresRaw
          ).toISOString()
        : null;


    if (button) {
      button.disabled = true;
    }


    try {

      const payload = {

        client_id:
          currentClient.client_id,

        module_id:
          moduleRecord.id,

        enabled:
          enabled,

        visible_to_client:
          visible,

        status:
          enabled
            ? 'active'
            : 'inactive',

        plan:
          plan,

        expires_at:
          expiresAt,

        activated_at:
          enabled
            ? (
                accessRecord?.activated_at ||
                new Date().toISOString()
              )
            : null
      };


      const result =
        await supabase
          .from('client_modules')
          .upsert(
            payload,
            {
              onConflict:
                'client_id,module_id'
            }
          )
          .select()
          .single();


      if (result.error) {
        throw result.error;
      }


      accessRecord =
        result.data;


      const active =
        result.data.enabled === true &&
        (
          !result.data.expires_at ||
          new Date(
            result.data.expires_at
          ) > new Date()
        );


      setStatus(

        active
          ? 'Active'

          :

        result.data.visible_to_client
          ? 'Visible / Inactive'

          :

        'Disabled',

        active
      );


      showMessage(

        active

          ?

        `Instagram AI Sales Agent activated for ${currentClient.client_id}.`

          :

        `Instagram AI Sales Agent settings saved for ${currentClient.client_id}.`

      );


    } catch (error) {

      console.error(
        'GLIME Admin Instagram Agent save:',
        error
      );

      showMessage(
        'Save failed: ' +
        (
          error?.message ||
          String(error)
        )
      );


    } finally {

      if (button) {
        button.disabled = false;
      }

    }
  }


  /* =====================================================
     EXISTING FETCH BUTTON
  ====================================================== */

  function hookExistingFetchButton() {

    const fetchButton =
      document.getElementById(
        'fetchBtn'
      );


    if (!fetchButton) {
      return;
    }


    /*
     * Existing Fetch Client handler को हटाया नहीं गया.
     * यह दूसरा listener है.
     */

    fetchButton.addEventListener(
      'click',
      () => {

        setTimeout(
          loadModuleForCurrentEmail,
          350
        );

      }
    );
  }


  /* =====================================================
     EMAIL CHANGE
  ====================================================== */

  function hookEmailChange() {

    const email =
      document.getElementById(
        'clientEmail'
      );


    if (!email) {
      return;
    }


    email.addEventListener(
      'change',
      () => {

        currentClient = null;
        moduleRecord = null;
        accessRecord = null;

        setStatus(
          'Ready',
          false
        );

        showMessage(
          'Fetch Client दबाने के बाद module settings load होंगी.'
        );

      }
    );
  }


  /* =====================================================
     INIT
  ====================================================== */

  function init() {

    addStyles();

    createSection();

    hookExistingFetchButton();

    hookEmailChange();

  }


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
