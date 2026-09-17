(() => {
  "use strict";

  /*
   * GLIME Phase F
   * Evidence & Confidence Intelligence
   *
   * READ ONLY
   * ------------------------------------------------
   * - No action execution
   * - No approval
   * - No business-data mutation
   * - No arbitrary client_id
   * - Uses secure production RPC
   */

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const RPC_NAME =
    "get_client_evidence_confidence_center";

  const CARD_ID =
    "glime-evidence-confidence-card";

  const MAX_DECISIONS = 5;

  let supabaseClient = null;

  // ==================================================
  // SUPABASE CLIENT
  // ==================================================

  function getSupabaseClient() {

    if (window.supabaseClient) {
      supabaseClient =
        window.supabaseClient;

      return supabaseClient;
    }

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      console.error(
        "GLIME Phase F: Supabase JS library unavailable."
      );

      return null;
    }

    supabaseClient =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );

    window.supabaseClient =
      supabaseClient;

    return supabaseClient;
  }

  // ==================================================
  // HTML ESCAPE
  // ==================================================

  function escapeHtml(value) {

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ==================================================
  // FORMAT
  // ==================================================

  function formatPercent(value) {

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    const number =
      Number(value);

    if (Number.isNaN(number)) {
      return "—";
    }

    return `${Math.round(number * 100)}%`;
  }

  function formatNumber(value) {

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    const number =
      Number(value);

    if (Number.isNaN(number)) {
      return escapeHtml(value);
    }

    return number.toLocaleString("en-IN");
  }

  function formatDate(value) {

    if (!value) {
      return "—";
    }

    const date =
      new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString(
      "en-IN"
    );
  }

  // ==================================================
  // CONFIDENCE
  // ==================================================

  function confidenceLabel(value) {

    const number =
      Number(value);

    if (Number.isNaN(number)) {
      return "Unknown";
    }

    if (number >= 0.90) {
      return "Very High";
    }

    if (number >= 0.75) {
      return "High";
    }

    if (number >= 0.50) {
      return "Medium";
    }

    return "Low";
  }

  // ==================================================
  // EVIDENCE QUALITY
  // ==================================================

  function evidenceQuality(item) {

    /*
     * Prefer backend-provided quality.
     */

    if (item.evidence_quality) {
      return String(
        item.evidence_quality
      );
    }

    if (item.evidence?.quality) {
      return String(
        item.evidence.quality
      );
    }

    /*
     * Fallback based on evidence
     */

    const confidence =
      Number(item.confidence);

    if (!Number.isNaN(confidence)) {

      if (confidence >= 0.90) {
        return "Very High";
      }

      if (confidence >= 0.75) {
        return "High";
      }

      if (confidence >= 0.50) {
        return "Medium";
      }

      return "Low";
    }

    return "Unknown";
  }

  // ==================================================
  // FRESHNESS
  // ==================================================

  function freshnessLabel(item) {

    const timestamp =
      item.evidence?.metrics?.captured_at ||
      item.evidence?.captured_at ||
      item.updated_at ||
      item.created_at;

    if (!timestamp) {
      return "Unknown";
    }

    const date =
      new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    const age =
      Date.now() -
      date.getTime();

    const hours =
      age / 3600000;

    if (hours <= 24) {
      return "Fresh";
    }

    if (hours <= 72) {
      return "Recent";
    }

    return "Older";
  }

  // ==================================================
  // STYLES
  // ==================================================

  function addStyles() {

    if (
      document.getElementById(
        "glime-evidence-confidence-style"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "glime-evidence-confidence-style";

    style.textContent = `

      #${CARD_ID} {
        margin-bottom: 30px;
        background: var(--card-bg, #111827);
        border: 1px solid rgba(0,240,255,.14);
        border-radius: 15px;
        padding: 26px;
        box-shadow: 0 10px 30px rgba(0,0,0,.30);
      }

      #${CARD_ID} .gfc-head {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:16px;
        margin-bottom:20px;
      }

      #${CARD_ID} .gfc-title {
        color:var(--cyan-blue,#00f0ff);
        font-size:1.18rem;
        font-weight:700;
      }

      #${CARD_ID} .gfc-subtitle {
        color:var(--text-muted,#9ca3af);
        font-size:.82rem;
        margin-top:5px;
        line-height:1.55;
      }

      #${CARD_ID} .gfc-refresh {
        border:1px solid rgba(0,240,255,.25);
        background:rgba(0,240,255,.06);
        color:var(--cyan-blue,#00f0ff);
        border-radius:9px;
        padding:9px 12px;
        font-weight:700;
        cursor:pointer;
      }

      #${CARD_ID} .gfc-refresh:disabled {
        opacity:.55;
        cursor:wait;
      }

      #${CARD_ID} .gfc-list {
        display:grid;
        gap:16px;
      }

      #${CARD_ID} .gfc-item {
        border:1px solid rgba(255,255,255,.07);
        background:rgba(255,255,255,.025);
        border-radius:13px;
        padding:18px;
      }

      #${CARD_ID} .gfc-decision-title {
        color:#fff;
        font-size:1rem;
        font-weight:700;
        line-height:1.5;
        margin-bottom:14px;
      }

      #${CARD_ID} .gfc-grid {
        display:grid;
        grid-template-columns:
          repeat(3, minmax(0,1fr));
        gap:10px;
        margin-bottom:16px;
      }

      #${CARD_ID} .gfc-stat {
        border:1px solid rgba(255,255,255,.06);
        border-radius:10px;
        padding:12px;
        background:rgba(255,255,255,.02);
      }

      #${CARD_ID} .gfc-stat-label {
        color:#9ca3af;
        font-size:.68rem;
        margin-bottom:5px;
      }

      #${CARD_ID} .gfc-stat-value {
        color:#fff;
        font-size:.88rem;
        font-weight:700;
      }

      #${CARD_ID} .gfc-section {
        margin-top:14px;
      }

      #${CARD_ID} .gfc-section-title {
        color:var(--cyan-blue,#00f0ff);
        font-size:.76rem;
        font-weight:800;
        margin-bottom:7px;
      }

      #${CARD_ID} .gfc-section-text {
        color:#cbd5e1;
        font-size:.82rem;
        line-height:1.65;
      }

      #${CARD_ID} .gfc-metrics {
        display:grid;
        grid-template-columns:
          repeat(2, minmax(0,1fr));
        gap:8px;
      }

      #${CARD_ID} .gfc-metric {
        display:flex;
        justify-content:space-between;
        gap:10px;
        padding:8px 10px;
        border-radius:8px;
        background:rgba(255,255,255,.025);
        font-size:.75rem;
      }

      #${CARD_ID} .gfc-metric-name {
        color:#9ca3af;
      }

      #${CARD_ID} .gfc-metric-value {
        color:#fff;
        font-weight:700;
      }

      #${CARD_ID} .gfc-limitation {
        margin-top:14px;
        padding:12px;
        border-radius:10px;
        border:1px solid rgba(255,209,102,.15);
        background:rgba(255,209,102,.04);
        color:#d1d5db;
        font-size:.76rem;
        line-height:1.6;
      }

      #${CARD_ID} .gfc-causality {
        margin-top:10px;
        color:#9ca3af;
        font-size:.72rem;
        line-height:1.55;
      }

      #${CARD_ID} .gfc-empty,
      #${CARD_ID} .gfc-error {
        color:var(--text-muted,#9ca3af);
        padding:14px 0 4px;
        line-height:1.6;
      }

      #${CARD_ID} .gfc-error {
        color:#ff9aa5;
      }

      @media(max-width:700px) {

        #${CARD_ID} {
          padding:20px;
        }

        #${CARD_ID} .gfc-head {
          flex-direction:column;
        }

        #${CARD_ID} .gfc-refresh {
          width:100%;
        }

        #${CARD_ID} .gfc-grid {
          grid-template-columns:1fr;
        }

        #${CARD_ID} .gfc-metrics {
          grid-template-columns:1fr;
        }
      }

    `;

    document.head.appendChild(style);
  }

  // ==================================================
  // AUTH
  // ==================================================

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

    return Boolean(
      data?.session?.user?.id
    );
  }

  // ==================================================
  // PRODUCTION RPC
  // ==================================================

  async function getEvidenceCenter() {

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
     * Secure RPC.
     *
     * No client_id is supplied.
     * The database resolves the authenticated
     * client's own records.
     */

    const {
      data,
      error
    } =
      await supabase.rpc(
        RPC_NAME,
        {
          p_limit: MAX_DECISIONS
        }
      );

    if (error) {

      console.error(
        "GLIME Phase F RPC error:",
        error
      );

      throw error;
    }

    let result = data;

    if (typeof result === "string") {

      try {
        result =
          JSON.parse(result);
      } catch {

        result = [];
      }
    }

    /*
     * Accept several safe JSON response shapes.
     */

    if (Array.isArray(result)) {
      return result;
    }

    if (
      result &&
      Array.isArray(result.decisions)
    ) {
      return result.decisions;
    }

    if (
      result &&
      Array.isArray(result.items)
    ) {
      return result.items;
    }

    if (
      result &&
      Array.isArray(result.data)
    ) {
      return result.data;
    }

    return [];
  }

  // ==================================================
  // CARD
  // ==================================================

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

      <div class="gfc-head">

        <div>

          <div class="gfc-title">
            🔎 Evidence & Confidence
          </div>

          <div class="gfc-subtitle">
            GLIME explains the evidence behind each business decision.
          </div>

        </div>

        <button
          type="button"
          class="gfc-refresh"
        >
          ↻ Refresh
        </button>

      </div>

      <div class="gfc-list">

        <div class="gfc-empty">
          Checking decision evidence…
        </div>

      </div>

    `;

    /*
     * Place after Proactive Insights
     * and before Action Impact when possible.
     */

    const impactCard =
      document.getElementById(
        "glime-action-impact-card"
      );

    const decisionCard =
      document.getElementById(
        "glime-decision-action-center-card"
      );

    const progressCard =
      document.querySelector(
        ".progress-card"
      );

    const main =
      document.querySelector(
        ".main-content"
      );

    if (
      impactCard?.parentNode
    ) {

      impactCard.parentNode.insertBefore(
        card,
        impactCard
      );

    } else if (
      decisionCard?.parentNode
    ) {

      decisionCard.parentNode.insertBefore(
        card,
        decisionCard
      );

    } else if (
      progressCard?.parentNode
    ) {

      progressCard.parentNode.insertBefore(
        card,
        progressCard
      );

    } else if (main) {

      main.appendChild(card);

    } else {

      document.body.appendChild(card);
    }

    return card;
  }

  // ==================================================
  // METRICS RENDER
  // ==================================================

  function renderMetrics(metrics) {

    if (
      !metrics ||
      typeof metrics !== "object"
    ) {
      return "";
    }

    const allowedMetrics = [
      "customers",
      "orders",
      "paidOrders",
      "revenue",
      "enquiries",
      "leads",
      "newCustomers30d",
      "repeatRate"
    ];

    const labels = {
      customers: "Customers",
      orders: "Orders",
      paidOrders: "Paid orders",
      revenue: "Revenue",
      enquiries: "Enquiries",
      leads: "Leads",
      newCustomers30d:
        "New customers (30d)",
      repeatRate:
        "Repeat rate"
    };

    const rows =
      allowedMetrics
        .filter(
          key =>
            metrics[key] !== undefined &&
            metrics[key] !== null
        )
        .map(key => {

          let value =
            metrics[key];

          if (
            key === "repeatRate"
          ) {

            value =
              formatPercent(value);
          } else if (
            key === "revenue"
          ) {

            value =
              `₹${formatNumber(value)}`;
          } else {

            value =
              formatNumber(value);
          }

          return `

            <div class="gfc-metric">

              <span class="gfc-metric-name">
                ${escapeHtml(labels[key])}
              </span>

              <span class="gfc-metric-value">
                ${escapeHtml(value)}
              </span>

            </div>

          `;
        })
        .join("");

    if (!rows) {
      return "";
    }

    return `

      <div class="gfc-section">

        <div class="gfc-section-title">
          Supporting Metrics
        </div>

        <div class="gfc-metrics">
          ${rows}
        </div>

      </div>

    `;
  }

  // ==================================================
  // EVIDENCE RENDER
  // ==================================================

  function renderEvidence(item) {

    const evidence =
      item.evidence || {};

    const metrics =
      evidence.metrics ||
      evidence.supporting_metrics ||
      {};

    const confidence =
      Number(
        item.confidence ??
        evidence.confidence
      );

    const quality =
      evidenceQuality(item);

    const freshness =
      freshnessLabel(item);

    const signal =
      evidence.signal ||
      item.decision_type ||
      "Business signal detected.";

    const capturedAt =
      metrics.captured_at ||
      evidence.captured_at;

    const limitation =
      evidence.limitation ||
      evidence.limitations ||
      "Aggregate business evidence identifies the signal, but it does not establish the exact underlying cause by itself.";

    return `

      <div class="gfc-item">

        <div class="gfc-decision-title">

          ${escapeHtml(
            item.title ||
            "Business decision"
          )}

        </div>

        <div class="gfc-grid">

          <div class="gfc-stat">

            <div class="gfc-stat-label">
              Confidence
            </div>

            <div class="gfc-stat-value">
              ${
                Number.isNaN(confidence)
                  ? "Unknown"
                  : `${formatPercent(confidence)} · ${escapeHtml(
                      confidenceLabel(confidence)
                    )}`
              }
            </div>

          </div>

          <div class="gfc-stat">

            <div class="gfc-stat-label">
              Evidence Quality
            </div>

            <div class="gfc-stat-value">
              ${escapeHtml(quality)}
            </div>

          </div>

          <div class="gfc-stat">

            <div class="gfc-stat-label">
              Freshness
            </div>

            <div class="gfc-stat-value">
              ${escapeHtml(freshness)}
            </div>

          </div>

        </div>

        <div class="gfc-section">

          <div class="gfc-section-title">
            Signal
          </div>

          <div class="gfc-section-text">
            ${escapeHtml(signal)}
          </div>

        </div>

        ${renderMetrics(metrics)}

        ${
          capturedAt
            ? `
              <div class="gfc-section">

                <div class="gfc-section-title">
                  Evidence captured
                </div>

                <div class="gfc-section-text">
                  ${escapeHtml(
                    formatDate(capturedAt)
                  )}
                </div>

              </div>
            `
            : ""
        }

        <div class="gfc-limitation">

          <strong>
            Evidence limitation
          </strong>

          <br>

          ${escapeHtml(
            Array.isArray(limitation)
              ? limitation.join(" ")
              : limitation
          )}

        </div>

        <div class="gfc-causality">

          ⚠️ Observed business signals support
          the decision, but aggregate evidence
          alone does not prove causation.

        </div>

      </div>

    `;
  }

  // ==================================================
  // RENDER
  // ==================================================

  function render(card, decisions) {

    const list =
      card.querySelector(
        ".gfc-list"
      );

    if (!list) {
      return;
    }

    if (!decisions.length) {

      list.innerHTML = `

        <div class="gfc-empty">

          अभी कोई decision evidence उपलब्ध नहीं है।
          GLIME नए verified business signals मिलने
          पर evidence यहाँ दिखाएगा।

        </div>

      `;

      return;
    }

    list.innerHTML =
      decisions
        .map(item =>
          renderEvidence(item)
        )
        .join("");
  }

  // ==================================================
  // LOAD
  // ==================================================

  async function load(card) {

    const button =
      card.querySelector(
        ".gfc-refresh"
      );

    const list =
      card.querySelector(
        ".gfc-list"
      );

    if (button) {

      button.disabled = true;

      button.textContent =
        "Checking…";
    }

    try {

      if (list) {

        list.innerHTML = `

          <div class="gfc-empty">

            Checking production decision evidence…

          </div>

        `;
      }

      const decisions =
        await getEvidenceCenter();

      render(
        card,
        decisions
      );

    } catch (error) {

      console.error(
        "GLIME Phase F evidence:",
        error
      );

      if (list) {

        list.innerHTML = `

          <div class="gfc-error">

            Evidence & Confidence temporarily
            unavailable. कृपया Refresh करें।

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

  // ==================================================
  // INITIALIZE
  // ==================================================

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
          ".gfc-refresh"
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
        "GLIME Phase F initialization failed:",
        error
      );
    }
  }

  // ==================================================
  // START
  // ==================================================

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
