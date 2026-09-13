(() => {
  /*
   * GLIME Instagram AI Sales Agent
   * DASHBOARD ADD-ON
   *
   * Existing dashboard.html को replace नहीं करता।
   */

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const MODULE_SLUG =
    'instagram_ai_sales_agent';

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const STYLE_ID =
    'glime-instagram-dashboard-style';

  const CARD_ID =
    'glime-instagram-dashboard-card';

  const NAV_ID =
    'glime-instagram-dashboard-nav';


  /* =====================================================
     STYLES
  ====================================================== */

  function addStyles() {

    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style =
      document.createElement('style');

    style.id = STYLE_ID;

    style.textContent = `

      #${NAV_ID} {
        position: relative;
      }

      #${NAV_ID} .glime-module-dot {
        display:inline-block;
        width:7px;
        height:7px;
        margin-left:6px;
        border-radius:50%;
        background:var(--neon-green,#00ff88);
        box-shadow:0 0 8px rgba(0,255,136,.55);
        vertical-align:middle;
      }

      #${CARD_ID} {
        margin-bottom:30px;
        position:relative;
        overflow:hidden;
      }

      #${CARD_ID} .glime-agent-top {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:20px;
      }

      #${CARD_ID} .glime-agent-badge {
        display:inline-flex;
        align-items:center;
        gap:7px;
        padding:6px 10px;
        border-radius:999px;
        font-size:.72rem;
        font-weight:700;
        color:var(--neon-green,#00ff88);
        background:rgba(0,255,136,.08);
        border:1px solid rgba(0,255,136,.25);
        white-space:nowrap;
      }

      #${CARD_ID} .glime-agent-dot {
        width:7px;
        height:7px;
        border-radius:50%;
        background:currentColor;
      }

      #${CARD_ID} .glime-agent-copy {
        color:var(--text-muted,#9ca3af);
        font-size:.86rem;
        line-height:1.7;
        margin:8px 0 18px;
        max-width:720px;
      }

      #${CARD_ID} .glime-agent-grid {
        display:grid;
        grid-template-columns:
          repeat(3,minmax(0,1fr));
        gap:12px;
        margin-bottom:18px;
      }

      #${CARD_ID} .glime-agent-stat {
        padding:14px;
        border-radius:10px;
        background:rgba(255,255,255,.025);
        border:1px solid rgba(255,255,255,.06);
      }

      #${CARD_ID} .glime-agent-stat small {
        display:block;
        color:var(--text-muted,#9ca3af);
        font-size:.7rem;
        margin-bottom:4px;
      }

      #${CARD_ID} .glime-agent-stat strong {
        color:#fff;
        font-size:.9rem;
      }

      #${CARD_ID} .glime-agent-actions {
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      #${CARD_ID} .glime-agent-btn {
        display:inline-block;
        padding:11px 16px;
        border-radius:9px;
        font-weight:700;
        font-size:.82rem;
        text-decoration:none;
        border:1px solid rgba(0,255,136,.35);
        background:rgba(0,255,136,.08);
        color:var(--neon-green,#00ff88);
      }

      #${CARD_ID} .glime-agent-btn:hover {
        background:var(--neon-green,#00ff88);
        color:#06100b;
      }

      #${CARD_ID} .glime-agent-lock {
        color:var(--text-muted,#9ca3af);
        font-size:.82rem;
        line-height:1.6;
      }

      @media(max-width:700px) {

        #${CARD_ID} .glime-agent-top {
          flex-direction:column;
        }

        #${CARD_ID} .glime-agent-grid {
          grid-template-columns:1fr;
        }

        #${CARD_ID} .glime-agent-actions {
          flex-direction:column;
        }

        #${CARD_ID} .glime-agent-btn {
          text-align:center;
          width:100%;
        }

      }
    `;

    document.head.appendChild(style);
  }


  /* =====================================================
     CLIENT
  ====================================================== */

  async function getAuthenticatedClient() {

    const {
      data,
      error
    } =
      await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    const user =
      data?.session?.user;

    if (!user) {
      return null;
    }

    let {
      data: client,
      error: clientError
    } =
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
        .eq(
          'auth_user_id',
          user.id
        )
        .maybeSingle();

    if (clientError) {
      throw clientError;
    }

    if (!client && user.email) {

      const fallback =
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
            user.email.trim().toLowerCase()
          )
          .order(
            'created_at',
            {
              ascending:false
            }
          )
          .limit(1)
          .maybeSingle();

      if (fallback.error) {
        throw fallback.error;
      }

      client =
        fallback.data;
    }

    return client;
  }


  /* =====================================================
     MODULE ACCESS
  ====================================================== */

  async function getModuleAccess(clientId) {

    const moduleResult =
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

    if (moduleResult.error) {
      throw moduleResult.error;
    }

    if (!moduleResult.data) {

      return {
        module:null,
        access:null
      };

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
          clientId
        )
        .eq(
          'module_id',
          moduleResult.data.id
        )
        .maybeSingle();

    if (accessResult.error) {
      throw accessResult.error;
    }

    return {
      module:
        moduleResult.data,

      access:
        accessResult.data
    };
  }


  /* =====================================================
     LOOKBOOK
  ====================================================== */

  async function getCatalogue(clientId) {

    const lookbookResult =
      await supabase
        .from('lookbooks')
        .select(`
          id,
          name,
          enabled
        `)
        .eq(
          'client_id',
          clientId
        )
        .eq(
          'enabled',
          true
        )
        .order(
          'created_at',
          {
            ascending:true
          }
        )
        .limit(1)
        .maybeSingle();

    if (lookbookResult.error) {
      throw lookbookResult.error;
    }

    if (!lookbookResult.data) {

      return {
        name:'No active Lookbook',
        count:0
      };

    }

    const countResult =
      await supabase
        .from('lookbook_items')
        .select(
          'id',
          {
            count:'exact',
            head:true
          }
        )
        .eq(
          'client_id',
          clientId
        )
        .eq(
          'lookbook_id',
          lookbookResult.data.id
        )
        .eq(
          'published',
          true
        );

    if (countResult.error) {
      throw countResult.error;
    }

    return {

      name:
        lookbookResult.data.name ||
        'Lookbook',

      count:
        countResult.count || 0
    };
  }


  /* =====================================================
     NAVIGATION
  ====================================================== */

  function insertNav() {

    if (
      document.getElementById(NAV_ID)
    ) {
      return;
    }

    const sidebar =
      document.querySelector('.sidebar');

    if (!sidebar) {
      return;
    }

    const nav =
      document.createElement('a');

    nav.id = NAV_ID;

    nav.className =
      'nav-item';

    nav.href =
      'instagram-agent.html';

    nav.innerHTML =
      `
        🤖 AI Sales Agent
        <span class="glime-module-dot"></span>
      `;

    const logout =
      sidebar.querySelector(
        '.logout-btn'
      );

    if (logout) {

      sidebar.insertBefore(
        nav,
        logout
      );

    } else {

      sidebar.appendChild(nav);

    }
  }


  /* =====================================================
     CARD
  ====================================================== */

  function createCard(
    active,
    catalogue
  ) {

    if (
      document.getElementById(CARD_ID)
    ) {
      return;
    }

    const card =
      document.createElement('div');

    card.id =
      CARD_ID;

    card.className =
      'card';


    if (active) {

      card.innerHTML = `

        <div class="glime-agent-top">

          <div>

            <h3
              class="card-title"
              style="margin-bottom:8px;"
            >
              🤖 GLIME AI Sales Agent
            </h3>

            <p class="glime-agent-copy">

              Instagram enquiries को
              आपके existing Lookbook catalogue
              के आधार पर automatically handle
              करने के लिए तैयार.

            </p>

          </div>

          <span class="glime-agent-badge">

            <span
              class="glime-agent-dot"
            ></span>

            Active

          </span>

        </div>


        <div class="glime-agent-grid">

          <div class="glime-agent-stat">

            <small>
              Catalogue
            </small>

            <strong>
              ${escapeHtml(
                catalogue.name
              )}
            </strong>

          </div>


          <div class="glime-agent-stat">

            <small>
              Published Products
            </small>

            <strong>
              ${catalogue.count}
            </strong>

          </div>


          <div class="glime-agent-stat">

            <small>
              Instagram
            </small>

            <strong>
              Not Connected
            </strong>

          </div>

        </div>


        <div class="glime-agent-actions">

          <a
            class="glime-agent-btn"
            href="instagram-agent.html"
          >
            Open AI Sales Agent →
          </a>

        </div>

      `;

    } else {

      card.innerHTML = `

        <div class="glime-agent-top">

          <div>

            <h3
              class="card-title"
              style="margin-bottom:8px;"
            >
              🤖 GLIME AI Sales Agent
            </h3>

            <p class="glime-agent-copy">

              Instagram enquiries को AI से
              automatically handle करें.

              यह paid module है और GLIME Admin
              activation के बाद उपलब्ध होगा.

            </p>

          </div>


          <span
            class="glime-agent-badge"
            style="
              color:var(--text-muted,#9ca3af);
              border-color:rgba(255,255,255,.1);
              background:rgba(255,255,255,.03);
            "
          >

            <span
              class="glime-agent-dot"
            ></span>

            Locked

          </span>

        </div>


        <div class="glime-agent-lock">

          यह module अभी आपके account पर
          active नहीं है.

        </div>

      `;
    }


    const progressCard =
      document.querySelector(
        '.progress-card'
      );

    const main =
      document.querySelector(
        '.main-content'
      );


    if (
      progressCard &&
      progressCard.parentNode
    ) {

      progressCard.parentNode.insertBefore(
        card,
        progressCard
      );

    } else if (main) {

      main.insertBefore(
        card,
        main.firstChild
      );

    }
  }


  /* =====================================================
     ESCAPE HTML
  ====================================================== */

  function escapeHtml(value) {

    return String(
      value ?? ''
    )
      .replace(
        /&/g,
        '&amp;'
      )
      .replace(
        /</g,
        '&lt;'
      )
      .replace(
        />/g,
        '&gt;'
      )
      .replace(
        /"/g,
        '&quot;'
      )
      .replace(
        /'/g,
        '&#039;'
      );
  }


  /* =====================================================
     INIT
  ====================================================== */

  async function init() {

    try {

      addStyles();

      const client =
        await getAuthenticatedClient();

      if (
        !client?.client_id
      ) {
        return;
      }


      const {
        access
      } =
        await getModuleAccess(
          client.client_id
        );


      const active =
        access?.enabled === true &&
        (
          !access?.expires_at ||
          new Date(
            access.expires_at
          ) > new Date()
        );


      /*
       * Admin ने client को module दिखाने की
       * permission नहीं दी है तो dashboard पर
       * कुछ भी नहीं दिखेगा.
       */

      if (
        access?.visible_to_client !== true &&
        !active
      ) {
        return;
      }


      insertNav();


      const catalogue =
        active
          ? await getCatalogue(
              client.client_id
            )
          : {
              name:'—',
              count:0
            };


      createCard(
        active,
        catalogue
      );


    } catch (error) {

      console.error(
        'GLIME Dashboard Instagram Agent:',
        error
      );

    }

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
