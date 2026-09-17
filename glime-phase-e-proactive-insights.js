(() => {
  "use strict";

  /*
   * GLIME Phase E
   * Proactive Business Insights
   *
   * Production Secure RPC version
   *
   * READ ONLY:
   * - No action execution
   * - No fake data
   * - No arbitrary client_id from browser
   * - Client identity is resolved securely by Supabase RPC
   */

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const RPC_NAME =
    "get_client_proactive_insights";

  const CARD_ID =
    "glime-proactive-insights-card";

  const MAX_INSIGHTS = 5;

  let supabaseClient = null;

  // --------------------------------------------------
  // SUPABASE CLIENT
  // --------------------------------------------------

  function getSupabaseClient() {

    // Reuse dashboard's existing client if available
    if (window.supabaseClient) {
      supabaseClient = window.supabaseClient;
      return supabaseClient;
    }

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      console.error(
        "GLIME Phase E: Supabase JS library unavailable."
      );

      return null;
    }

    supabaseClient =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );

    // Make it available to other dashboard add-ons
    window.supabaseClient = supabaseClient;

    return supabaseClient;
  }

  // --------------------------------------------------
  // HTML ESCAPE
  // --------------------------------------------------

  function escapeHtml(value) {

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --------------------------------------------------
  // PRIORITY
  // --------------------------------------------------

  function priorityMeta(priority) {

    const p =
      String(priority || "medium")
        .toLowerCase();

    if (p === "critical") {
      return {
        label: "Critical",
        cls: "high",
        icon: "🔴"
      };
    }

    if (p === "high") {
      return {
        label: "High",
        cls: "high",
        icon: "🔴"
      };
    }

    if (p === "low") {
      return {
        label: "Low",
        cls: "low",
        icon: "🟢"
      };
    }

    return {
      label: "Medium",
      cls: "medium",
      icon: "🟡"
    };
  }

  // --------------------------------------------------
  // STYLES
  // --------------------------------------------------

  function addStyles() {

    if (
      document.getElementById(
        "glime-proactive-insights-style"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "glime-proactive-insights-style";

    style.textContent = `

      #${CARD_ID} {
        margin-bottom: 30px;
        background: var(--card-bg, #111827);
        border: 1px solid rgba(0,255,136,.14);
        border-radius: 15px;
        padding: 26px;
        box-shadow: 0 10px 30px rgba(0,0,0,.35);
      }

      #${CARD_ID} .gpi-head {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:16px;
        margin-bottom:18px;
      }

      #${CARD_ID} .gpi-title {
        color: var(--neon-green,#00ff88);
        font-size:1.18rem;
        font-weight:700;
      }

      #${CARD_ID} .gpi-subtitle {
        color:var(--text-muted,#9ca3af);
        font-size:.82rem;
        margin-top:5px;
        line-height:1.55;
      }

      #${CARD_ID} .gpi-refresh {
        border:1px solid rgba(0,240,255,.25);
        background:rgba(0,240,255,.06);
        color:var(--cyan-blue,#00f0ff);
        border-radius:9px;
        padding:9px 12px;
        font-weight:700;
        cursor:pointer;
      }

      #${CARD_ID} .gpi-refresh:disabled {
        opacity:.55;
        cursor:wait;
      }

      #${CARD_ID} .gpi-list {
        display:grid;
        gap:12px;
      }

      #${CARD_ID} .gpi-item {
        border:1px solid rgba(255,255,255,.07);
        background:rgba(255,255,255,.025);
        border-radius:12px;
        padding:16px;
      }

      #${CARD_ID} .gpi-item-top {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        margin-bottom:8px;
      }

      #${CARD_ID} .gpi-item-title {
        color:#fff;
        font-weight:700;
        line-height:1.45;
      }

      #${CARD_ID} .gpi-badge {
        flex:0 0 auto;
        border-radius:999px;
        padding:5px 9px;
        font-size:.68rem;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:.4px;
      }

      #${CARD_ID} .gpi-badge.high {
        color:#ff6b7a;
        border:1px solid rgba(255,71,87,.25);
        background:rgba(255,71,87,.08);
      }

      #${CARD_ID} .gpi-badge.medium {
        color:#ffd166;
        border:1px solid rgba(255,209,102,.22);
        background:rgba(255,209,102,.07);
      }

      #${CARD_ID} .gpi-badge.low {
        color:#00ff88;
        border:1px solid rgba(0,255,136,.22);
        background:rgba(0,255,136,.07);
      }

      #${CARD_ID} .gpi-summary {
        color:#cbd5e1;
        font-size:.84rem;
        line-height:1.65;
      }

      #${CARD_ID} .gpi-meta {
        margin-top:10px;
        color:var(--text-muted,#9ca3af);
        font-size:.72rem;
      }

      #${CARD_ID} .gpi-empty,
      #${CARD_ID} .gpi-error {
        color:var(--text-muted,#9ca3af);
        padding:14px 0 4px;
        line-height:1.6;
      }

      #${CARD_ID} .gpi-error {
        color:#ff9aa5;
      }

      @media(max-width:700px) {

        #${CARD_ID} {
          padding:20px;
        }

        #${CARD_ID} .gpi-head {
          flex-direction:column;
        }

        #${CARD_ID} .gpi-refresh {
          width:100%;
        }

        #${CARD_ID} .gpi-item-top {
          align-items:flex-start;
          flex-direction:column;
        }

      }
    `;

    document.head.appendChild(style);
  }

  // --------------------------------------------------
  // AUTH CHECK
  // --------------------------------------------------

  async function ensureAuthenticated() {

    const supabase =
      getSupabaseClient();

    if (!supabase) {
      throw new Error(
        "Supabase client unavailable."
      );
    }

    const {
      data,
      error
    } =
      await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    const session =
      data?.session;

    if (!session?.user?.id) {

      return false;
    }

    return true;
  }

  // --------------------------------------------------
  // PRODUCTION RPC
  // --------------------------------------------------

  async function getInsights() {

    const supabase =
      getSupabaseClient();

    if (!supabase) {
      throw new Error(
        "Supabase client unavailable."
      );
    }

    const authenticated =
      await ensureAuthenticated();

    if (!authenticated) {

      return [];
    }

    /*
     * IMPORTANT:
     *
     * We DO NOT send client_id.
     *
     * The production RPC identifies the
     * authenticated client's own business data.
     */

    const {
      data,
      error
    } =
      await supabase.rpc(
        RPC_NAME,
        {
          p_limit: MAX_INSIGHTS
        }
      );

    if (error) {

      console.error(
        "GLIME Phase E RPC error:",
        error
      );

      throw error;
    }

    /*
     * JSONB can arrive as an array or
     * occasionally as a JSON string.
     */

    let insights = data;

    if (typeof insights === "string") {

      try {
        insights =
          JSON.parse(insights);
      } catch (parseError) {

        console.error(
          "GLIME Phase E JSON parse error:",
          parseError
        );

        insights = [];
      }
    }

    /*
     * Safety:
     * never render unexpected object shapes.
     */

    if (!Array.isArray(insights)) {

      /*
       * Some RPC implementations may
       * return { insights: [...] }.
       */

      if (
        insights &&
        Array.isArray(insights.insights)
      ) {

        insights =
          insights.insights;

      } else {

        insights = [];
      }
    }

    return insights;
  }

  // --------------------------------------------------
  // CARD
  // --------------------------------------------------

  function createCard() {

    const existing =
      document.getElementById(
        CARD_ID
      );

    if (existing) {
      return existing;
    }

    const card =
      document.createElement("section");

    card.id =
      CARD_ID;

    card.innerHTML = `

      <div class="gpi-head">

        <div>

          <div class="gpi-title">
            🧠 GLIME Business Insights
          </div>

          <div class="gpi-subtitle">
            Proactive signals detected from your authorized business data.
          </div>

        </div>

        <button
          type="button"
          class="gpi-refresh"
        >
          ↻ Refresh
        </button>

      </div>

      <div class="gpi-list">

        <div class="gpi-empty">
          Checking your latest business insights…
        </div>

      </div>

    `;

    const progressCard =
      document.querySelector(
        ".progress-card"
      );

    const main =
      document.querySelector(
        ".main-content"
      );

    if (
      progressCard?.parentNode
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

    } else {

      document.body.prepend(card);
    }

    return card;
  }

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  function render(card, insights) {

    const list =
      card.querySelector(
        ".gpi-list"
      );

    if (!list) {
      return;
    }

    if (!insights.length) {

      list.innerHTML = `

        <div class="gpi-empty">

          अभी कोई open proactive insight नहीं मिला।
          GLIME नियमित monitoring के दौरान आपके
          business signals check करता रहेगा।

        </div>

      `;

      return;
    }

    list.innerHTML =
      insights
        .map((item) => {

          const meta =
            priorityMeta(
              item.priority
            );

          const seen =
            item.last_seen_at
              ? new Date(
                  item.last_seen_at
                ).toLocaleString(
                  "en-IN"
                )
              : "—";

          const title =
            item.title ||
            "Business insight";

          const summary =
            item.summary ||
            item.description ||
            item.message ||
            "GLIME detected a business signal.";

          return `

            <article class="gpi-item">

              <div class="gpi-item-top">

                <div class="gpi-item-title">

                  ${escapeHtml(meta.icon)}
                  ${escapeHtml(title)}

                </div>

                <span class="gpi-badge ${meta.cls}">

                  ${escapeHtml(meta.label)}

                </span>

              </div>

              <div class="gpi-summary">

                ${escapeHtml(summary)}

              </div>

              <div class="gpi-meta">

                Last detected:
                ${escapeHtml(seen)}

              </div>

            </article>

          `;

        })
        .join("");
  }

  // --------------------------------------------------
  // LOAD
  // --------------------------------------------------

  async function load(card) {

    const button =
      card.querySelector(
        ".gpi-refresh"
      );

    const list =
      card.querySelector(
        ".gpi-list"
      );

    if (button) {

      button.disabled = true;
      button.textContent =
        "Checking…";
    }

    try {

      if (list) {

        list.innerHTML = `

          <div class="gpi-empty">

            Checking production business insights…

          </div>

        `;
      }

      const insights =
        await getInsights();

      render(
        card,
        insights
      );

    } catch (error) {

      console.error(
        "GLIME Phase E proactive insights:",
        error
      );

      if (list) {

        list.innerHTML = `

          <div class="gpi-error">

            Proactive insights temporarily unavailable.
            कृपया Refresh करें।

          </div>

        `;
      }

    } finally {

      if (button) {

        button.disabled = false;

        button.textContent =
          "↻ Refresh";
      }
    }
  }

  // --------------------------------------------------
  // INITIALIZE
  // --------------------------------------------------

  async function init() {

    try {

      addStyles();

      const card =
        createCard();

      if (!card) {
        return;
      }

      const button =
        card.querySelector(
          ".gpi-refresh"
        );

      if (button) {

        button.addEventListener(
          "click",
          () => load(card)
        );
      }

      await load(card);

    } catch (error) {

      console.error(
        "GLIME Phase E dashboard add-on failed:",
        error
      );
    }
  }

  // --------------------------------------------------
  // START
  // --------------------------------------------------

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );

  } else {

    init();
  }

})();
