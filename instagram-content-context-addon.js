/* =========================================================
   GLIME — Instagram Content Context Add-on
   ---------------------------------------------------------
   Purpose:
   - Read existing instagram_posts
   - Read current catalog through catalog-context
   - Match Instagram post content with current offers
   - Show content context inside Instagram Sales Specialist
   - Read-only integration
   - Does NOT modify instagram-sales-specialist.js
   - Does NOT use legacy services.id mapping
   - Does NOT create tables
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const CONTEXT_ID =
    "glimeInstagramContentContext";

  let db = null;
  let clientId = null;

  let posts = [];
  let catalog = [];

  let activeConversationId = null;
  let requestToken = 0;
  let initialized = false;

  /* ---------------------------------------------------------
     SUPABASE
  --------------------------------------------------------- */

  function getSupabase() {
    if (db) return db;

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      throw new Error(
        "Supabase client is not available."
      );
    }

    db = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    return db;
  }

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[m]
    );
  }

  function clean(value, max = 3000) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function fmtDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function tokenize(value) {
    return [
      ...new Set(
        clean(value, 5000)
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((word) => word.length > 2)
      )
    ];
  }

  function scoreMatch(post, offer) {
    const postText = clean(
      `${post.caption || ""} ${post.permalink || ""}`,
      5000
    ).toLowerCase();

    const offerText = clean(
      [
        offer.name,
        offer.title,
        offer.short_description,
        offer.description,
        offer.offer_type,
        offer.sales_talking_points,
        offer.allowed_claims
      ]
        .filter(Boolean)
        .join(" "),
      7000
    ).toLowerCase();

    if (!postText || !offerText) {
      return 0;
    }

    const terms = tokenize(offerText);

    let score = 0;

    for (const term of terms) {
      if (postText.includes(term)) {
        score += term.length >= 6 ? 3 : 1;
      }
    }

    const offerName =
      clean(
        offer.name || offer.title || "",
        500
      ).toLowerCase();

    if (
      offerName &&
      postText.includes(offerName)
    ) {
      score += 10;
    }

    return score;
  }

  function getBestOffer(post) {
    if (!Array.isArray(catalog) || !catalog.length) {
      return null;
    }

    let best = null;

    for (const offer of catalog) {
      const score = scoreMatch(post, offer);

      if (
        !best ||
        score > best.score
      ) {
        best = {
          offer,
          score
        };
      }
    }

    if (!best || best.score <= 0) {
      return null;
    }

    return best;
  }

  /* ---------------------------------------------------------
     CLIENT
  --------------------------------------------------------- */

  async function getClientId() {
    if (clientId) {
      return clientId;
    }

    const supabase = getSupabase();

    const {
      data,
      error
    } = await supabase.auth.getUser();

    if (error || !data?.user) {
      throw new Error(
        "Authentication session not found."
      );
    }

    const {
      data: client,
      error: clientError
    } = await supabase
      .from("client_data")
      .select("client_id")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    if (clientError) {
      throw clientError;
    }

    if (!client?.client_id) {
      throw new Error(
        "GLIME client account was not found."
      );
    }

    clientId = client.client_id;

    return clientId;
  }

  /* ---------------------------------------------------------
     LOAD INSTAGRAM POSTS
     --------------------------------------------------------- */

  async function loadInstagramPosts() {
    const supabase = getSupabase();
    const id = await getClientId();

    const {
      data,
      error
    } = await supabase
      .from("instagram_posts")
      .select(
        "id,ig_media_id,permalink,caption,media_url,fetched_at,mapped_service_id,mapping_source,confidence_score,client_id"
      )
      .eq("client_id", id)
      .order("fetched_at", {
        ascending: false
      })
      .limit(30);

    if (error) {
      throw error;
    }

    posts = data || [];

    return posts;
  }

  /* ---------------------------------------------------------
     LOAD CURRENT CATALOG
     IMPORTANT:
     Uses catalog-context.
     Does NOT use legacy services table.
  --------------------------------------------------------- */

  async function loadCatalog() {
    const supabase = getSupabase();

    const {
      data: sessionData
    } = await supabase.auth.getSession();

    const accessToken =
      sessionData?.session?.access_token || "";

    const response =
      await fetch(
        `${SUPABASE_URL}/functions/v1/catalog-context`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            apikey:
              SUPABASE_PUBLISHABLE_KEY,

            Authorization:
              `Bearer ${accessToken}`
          },

          body: "{}"
        }
      );

    let result = null;

    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (!response.ok) {
      throw new Error(
        result?.error ||
        `catalog-context request failed: ${response.status}`
      );
    }

    catalog =
      Array.isArray(result?.catalog)
        ? result.catalog
        : [];

    return catalog;
  }

  /* ---------------------------------------------------------
     POST PREPARATION
  --------------------------------------------------------- */

  function preparePost(post) {
    const match =
      getBestOffer(post);

    return {
      post,
      match
    };
  }

  function getPostTitle(post) {
    const caption =
      clean(post.caption, 180);

    if (caption) {
      return caption;
    }

    if (post.ig_media_id) {
      return `Instagram media ${post.ig_media_id}`;
    }

    return "Instagram post";
  }

  function getOfferName(offer) {
    if (!offer) {
      return "";
    }

    return clean(
      offer.name ||
      offer.title ||
      "",
      180
    );
  }

  /* ---------------------------------------------------------
     RENDER EMPTY
  --------------------------------------------------------- */

  function renderEmpty(message) {
    const root =
      document.getElementById(
        CONTEXT_ID
      );

    if (!root) return;

    root.innerHTML = `
      <div class="glime-ig-content-card">
        <div class="glime-ig-content-header">
          <div>
            <div class="glime-ig-content-kicker">
              INSTAGRAM CONTENT
            </div>

            <strong>
              Content Context
            </strong>
          </div>

          <button
            type="button"
            class="glime-ig-content-refresh"
            data-glime-ig-action="refresh"
            title="Refresh"
          >
            ↻
          </button>
        </div>

        <div class="glime-ig-content-empty">
          ${esc(message)}
        </div>
      </div>
    `;
  }

  /* ---------------------------------------------------------
     RENDER ERROR
  --------------------------------------------------------- */

  function renderError(error) {
    const message =
      error?.message ||
      "Unable to load Instagram content.";

    renderEmpty(message);
  }

  /* ---------------------------------------------------------
     RENDER CONTENT
  --------------------------------------------------------- */

  function renderContent() {
    const root =
      document.getElementById(
        CONTEXT_ID
      );

    if (!root) return;

    if (!posts.length) {
      renderEmpty(
        "No Instagram posts have been synced yet."
      );

      return;
    }

    const prepared =
      posts.map(preparePost);

    const matched =
      prepared.filter(
        (item) =>
          item.match &&
          item.match.score > 0
      );

    const visible =
      prepared.slice(0, 6);

    root.innerHTML = `
      <div class="glime-ig-content-card">

        <div class="glime-ig-content-header">
          <div>
            <div class="glime-ig-content-kicker">
              INSTAGRAM CONTENT
            </div>

            <strong>
              Content Context
            </strong>
          </div>

          <button
            type="button"
            class="glime-ig-content-refresh"
            data-glime-ig-action="refresh"
            title="Refresh"
          >
            ↻
          </button>
        </div>

        <div class="glime-ig-content-summary">
          <span>
            ${posts.length} synced
          </span>

          <span>
            ${matched.length} catalog matches
          </span>
        </div>

        <div class="glime-ig-post-list">
          ${visible
            .map(renderPost)
            .join("")}
        </div>

      </div>
    `;
  }

  function renderPost(item) {
    const post =
      item.post;

    const match =
      item.match;

    const offer =
      match?.offer || null;

    const caption =
      getPostTitle(post);

    const shortCaption =
      caption.length > 150
        ? `${caption.slice(0, 150)}…`
        : caption;

    const mediaUrl =
      clean(post.media_url, 1000);

    const permalink =
      clean(post.permalink, 1000);

    return `
      <article class="glime-ig-post">

        ${
          mediaUrl
            ? `
              <div class="glime-ig-post-media">
                <img
                  src="${esc(mediaUrl)}"
                  alt="Instagram post"
                  loading="lazy"
                  onerror="this.parentElement.style.display='none'"
                >
              </div>
            `
            : ""
        }

        <div class="glime-ig-post-body">

          <div class="glime-ig-post-caption">
            ${esc(shortCaption)}
          </div>

          <div class="glime-ig-post-meta">
            Fetched ${esc(
              fmtDate(post.fetched_at)
            )}
          </div>

          ${
            offer
              ? `
                <div class="glime-ig-match">
                  <span>
                    CATALOG MATCH
                  </span>

                  <strong>
                    ${esc(
                      getOfferName(offer)
                    )}
                  </strong>

                  <small>
                    Context score ${esc(
                      String(match.score)
                    )}
                  </small>
                </div>
              `
              : `
                <div class="glime-ig-no-match">
                  No current catalog match
                </div>
              `
          }

          ${
            permalink
              ? `
                <a
                  class="glime-ig-post-link"
                  href="${esc(permalink)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Instagram post →
                </a>
              `
              : ""
          }

        </div>

      </article>
    `;
 }

   /* ---------------------------------------------------------
     INSERT CONTEXT PANEL
     --------------------------------------------------------- */

  function ensureContextContainer() {
    let root =
      document.getElementById(
        CONTEXT_ID
      );

    if (root) {
      return root;
    }

    const context =
      document.querySelector(
        "aside.context"
      );

    if (!context) {
      return null;
    }

    root =
      document.createElement("div");

    root.id =
      CONTEXT_ID;

    /*
      Keep this addon visually inside the
      existing Instagram Sales Specialist
      context sidebar.
    */

    const cards =
      context.querySelectorAll(
        ".context-card"
      );

    if (cards.length) {
      const lastCard =
        cards[cards.length - 1];

      lastCard.insertAdjacentElement(
        "afterend",
        root
      );
    } else {
      context.appendChild(root);
    }

    return root;
  }

  /* ---------------------------------------------------------
     LOADING UI
  --------------------------------------------------------- */

  function renderLoading(message = "Loading content context…") {
    const root =
      ensureContextContainer();

    if (!root) {
      return;
    }

    root.innerHTML = `
      <div class="glime-ig-content-card">

        <div class="glime-ig-content-header">
          <div>
            <div class="glime-ig-content-kicker">
              INSTAGRAM CONTENT
            </div>

            <strong>
              Content Context
            </strong>
          </div>

          <span
            class="glime-ig-content-loading-dot"
            aria-hidden="true"
          >
            •
          </span>
        </div>

        <div class="glime-ig-content-loading">
          ${esc(message)}
        </div>

      </div>
    `;
  }

  /* ---------------------------------------------------------
     LOAD ALL CONTENT
     --------------------------------------------------------- */

  async function loadContentContext() {
    const currentToken =
      ++requestToken;

    renderLoading();

    try {
      /*
        First resolve the client.
        This also confirms the user is authenticated.
      */

      await getClientId();

      /*
        Load posts and current catalog together.
      */

      await Promise.all([
        loadInstagramPosts(),
        loadCatalog()
      ]);

      /*
        Ignore stale requests if refresh was
        clicked multiple times.
      */

      if (
        currentToken !== requestToken
      ) {
        return;
      }

      renderContent();

    } catch (error) {
      console.error(
        "[GLIME Instagram Content Context]",
        error
      );

      if (
        currentToken !== requestToken
      ) {
        return;
      }

      renderError(error);
    }
  }

  /* ---------------------------------------------------------
     ACTIVE CONVERSATION DETECTION
     ---------------------------------------------------------
     Content context is account-level because
     instagram_posts currently has no conversation_id.

     We still observe the active conversation so
     the addon can safely refresh when the specialist
     switches conversations.
  --------------------------------------------------------- */

  function getActiveConversationElement() {
    return document.querySelector(
      ".conversation-item.active"
    );
  }

  function getConversationKey(element) {
    if (!element) {
      return null;
    }

    return (
      element.dataset?.conversationId ||
      element.dataset?.conversation ||
      element.getAttribute(
        "data-conversation-id"
      ) ||
      element.getAttribute(
        "data-id"
      ) ||
      element.textContent
        ?.replace(/\s+/g, " ")
        ?.trim()
        ?.slice(0, 120) ||
      null
    );
  }

  function detectConversationChange() {
    const active =
      getActiveConversationElement();

    const key =
      getConversationKey(active);

    if (
      key === activeConversationId
    ) {
      return;
    }

    activeConversationId = key;

    /*
      Do not reload immediately on every DOM
      mutation. The account-level content is
      already loaded.

      We only make sure the panel exists.
    */

    ensureContextContainer();
  }

  /* ---------------------------------------------------------
     LIGHTWEIGHT CONVERSATION WATCHER
     --------------------------------------------------------- */

  let conversationWatcher = null;

  function startConversationWatcher() {
    if (conversationWatcher) {
      return;
    }

    conversationWatcher =
      window.setInterval(
        detectConversationChange,
        800
      );
  }

  /* ---------------------------------------------------------
     REFRESH HANDLER
     --------------------------------------------------------- */

  async function refresh() {
    try {
      /*
        Reset cached client only if authentication
        has actually disappeared.
      */

      const supabase =
        getSupabase();

      const {
        data
      } =
        await supabase.auth.getSession();

      if (!data?.session) {
        clientId = null;

        renderEmpty(
          "Please sign in to load Instagram content."
        );

        return;
      }

      await loadContentContext();

    } catch (error) {
      console.error(
        "[GLIME Instagram Content Refresh]",
        error
      );

      renderError(error);
    }
  }

  /* ---------------------------------------------------------
     EVENT DELEGATION
     --------------------------------------------------------- */

  function bindEvents() {
    document.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            '[data-glime-ig-action="refresh"]'
          );

        if (!button) {
          return;
        }

        event.preventDefault();

        refresh();
      }
    );
  }

  /* ---------------------------------------------------------
     AUTH STATE
     --------------------------------------------------------- */

  function bindAuthState() {
    const supabase =
      getSupabase();

    supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "SIGNED_OUT" ||
          !session
        ) {
          clientId = null;
          posts = [];
          catalog = [];
          activeConversationId = null;

          renderEmpty(
            "Please sign in to load Instagram content."
          );

          return;
        }

        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED"
        ) {
          /*
            Delay slightly so the existing
            specialist page can finish its
            own authentication setup.
          */

          window.setTimeout(
            () => {
              loadContentContext();
            },
            150
          );
        }
      }
    );
  }

  /* ---------------------------------------------------------
     INITIALIZATION
     --------------------------------------------------------- */

  async function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    /*
      Wait for the existing Instagram Sales
      Specialist page to create its UI.
    */

    let attempts = 0;

    while (
      !document.querySelector(
        "aside.context"
      ) &&
      attempts < 40
    ) {
      await new Promise(
        (resolve) =>
          setTimeout(resolve, 250)
      );

      attempts++;
    }

    ensureContextContainer();

    bindEvents();

    try {
      bindAuthState();
    } catch (error) {
      console.error(
        "[GLIME Instagram Content Auth]",
        error
      );
    }

    startConversationWatcher();

    await loadContentContext();
  }

  /* ---------------------------------------------------------
     SAFE START
     --------------------------------------------------------- */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once: true
      }
    );
  } else {
    init();
  }

  /* ---------------------------------------------------------
     OPTIONAL PUBLIC API
     ---------------------------------------------------------
     Useful for manual testing from the browser
     console without changing the core specialist.
  --------------------------------------------------------- */

  window.GLIMEInstagramContentContext = {
    refresh,
    loadContentContext,
    getPosts: () => [...posts],
    getCatalog: () => [...catalog]
  };

})();

/* =========================================================
   GLIME — Instagram Content Context Add-on Styles
   ---------------------------------------------------------
   Injected CSS
   - No separate CSS file required
   - Scoped to GLIME Instagram Content Context
   - Does not modify core Instagram specialist styles
   ========================================================= */

(() => {
  "use strict";

  const STYLE_ID =
    "glime-instagram-content-context-style";

  if (
    document.getElementById(STYLE_ID)
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id = STYLE_ID;

  style.textContent = `
    /* -----------------------------------------------------
       MAIN CARD
    ----------------------------------------------------- */

    #glimeInstagramContentContext {
      width: 100%;
      box-sizing: border-box;
      margin: 12px 0 0;
    }

    #glimeInstagramContentContext *,
    #glimeInstagramContentContext *::before,
    #glimeInstagramContentContext *::after {
      box-sizing: border-box;
    }

    .glime-ig-content-card {
      width: 100%;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 14px;
      background: rgba(255,255,255,.025);
      overflow: hidden;
    }

    /* -----------------------------------------------------
       HEADER
    ----------------------------------------------------- */

    .glime-ig-content-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 13px 14px;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }

    .glime-ig-content-header > div {
      min-width: 0;
    }

    .glime-ig-content-header strong {
      display: block;
      margin-top: 3px;
      color: #ffffff;
      font-size: 13px;
      line-height: 1.3;
      font-weight: 650;
    }

    .glime-ig-content-kicker {
      color: rgba(255,255,255,.48);
      font-size: 9px;
      line-height: 1;
      letter-spacing: .12em;
      font-weight: 700;
    }

    /* -----------------------------------------------------
       REFRESH BUTTON
    ----------------------------------------------------- */

    .glime-ig-content-refresh {
      width: 29px;
      height: 29px;
      flex: 0 0 29px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 8px;
      background: rgba(255,255,255,.035);
      color: rgba(255,255,255,.72);
      cursor: pointer;
      font-size: 17px;
      line-height: 1;
      transition:
        background .16s ease,
        border-color .16s ease,
        color .16s ease,
        transform .16s ease;
    }

    .glime-ig-content-refresh:hover {
      background: rgba(255,255,255,.08);
      border-color: rgba(255,255,255,.18);
      color: #ffffff;
    }

    .glime-ig-content-refresh:active {
      transform: scale(.94);
    }

    /* -----------------------------------------------------
       SUMMARY
    ----------------------------------------------------- */

    .glime-ig-content-summary {
      display: flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
      padding: 9px 14px;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }

    .glime-ig-content-summary span {
      display: inline-flex;
      align-items: center;
      min-height: 21px;
      padding: 3px 7px;
      border-radius: 6px;
      background: rgba(255,255,255,.045);
      color: rgba(255,255,255,.58);
      font-size: 10px;
      line-height: 1.2;
    }

    /* -----------------------------------------------------
       POST LIST
    ----------------------------------------------------- */

    .glime-ig-post-list {
      display: flex;
      flex-direction: column;
    }

    .glime-ig-post {
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }

    .glime-ig-post:last-child {
      border-bottom: 0;
    }

    /* -----------------------------------------------------
       MEDIA
    ----------------------------------------------------- */

    .glime-ig-post-media {
      width: 100%;
      max-height: 180px;
      overflow: hidden;
      background: rgba(0,0,0,.18);
    }

    .glime-ig-post-media img {
      display: block;
      width: 100%;
      max-height: 180px;
      object-fit: cover;
    }

    /* -----------------------------------------------------
       POST BODY
    ----------------------------------------------------- */

    .glime-ig-post-body {
      padding: 11px 14px 13px;
    }

    .glime-ig-post-caption {
      color: rgba(255,255,255,.88);
      font-size: 11px;
      line-height: 1.5;
      word-break: break-word;
    }

    .glime-ig-post-meta {
      margin-top: 6px;
      color: rgba(255,255,255,.36);
      font-size: 9px;
      line-height: 1.35;
    }

    /* -----------------------------------------------------
       CATALOG MATCH
    ----------------------------------------------------- */

    .glime-ig-match {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-top: 9px;
      padding: 8px 9px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 9px;
      background: rgba(255,255,255,.035);
    }

    .glime-ig-match > span {
      color: rgba(255,255,255,.42);
      font-size: 8px;
      line-height: 1;
      letter-spacing: .10em;
      font-weight: 700;
    }

    .glime-ig-match strong {
      color: #ffffff;
      font-size: 11px;
      line-height: 1.35;
      font-weight: 600;
      word-break: break-word;
    }

    .glime-ig-match small {
      color: rgba(255,255,255,.40);
      font-size: 9px;
      line-height: 1.3;
    }

    /* -----------------------------------------------------
       NO MATCH
    ----------------------------------------------------- */

    .glime-ig-no-match {
      margin-top: 8px;
      color: rgba(255,255,255,.36);
      font-size: 9px;
      line-height: 1.4;
    }

    /* -----------------------------------------------------
       INSTAGRAM LINK
    ----------------------------------------------------- */

    .glime-ig-post-link {
      display: inline-flex;
      align-items: center;
      margin-top: 9px;
      color: rgba(255,255,255,.68);
      font-size: 10px;
      line-height: 1.3;
      text-decoration: none;
      transition: color .16s ease;
    }

    .glime-ig-post-link:hover {
      color: #ffffff;
      text-decoration: underline;
    }

    /* -----------------------------------------------------
       EMPTY STATE
    ----------------------------------------------------- */

    .glime-ig-content-empty {
      padding: 16px 14px;
      color: rgba(255,255,255,.42);
      font-size: 10px;
      line-height: 1.5;
    }

    /* -----------------------------------------------------
       LOADING STATE
    ----------------------------------------------------- */

    .glime-ig-content-loading {
      padding: 16px 14px;
      color: rgba(255,255,255,.45);
      font-size: 10px;
      line-height: 1.5;
    }

    .glime-ig-content-loading-dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 29px;
      height: 29px;
      color: rgba(255,255,255,.50);
      font-size: 18px;
      line-height: 1;
      animation:
        glimeIgContentPulse 1.1s ease-in-out infinite;
    }

    @keyframes glimeIgContentPulse {
      0%,
      100% {
        opacity: .35;
      }

      50% {
        opacity: 1;
      }
    }

    /* -----------------------------------------------------
       SMALL SCREENS
    ----------------------------------------------------- */

    @media (max-width: 700px) {
      .glime-ig-content-header {
        padding: 12px;
      }

      .glime-ig-post-body {
        padding: 10px 12px 12px;
      }

      .glime-ig-post-media,
      .glime-ig-post-media img {
        max-height: 150px;
      }
    }
  `;

  document.head.appendChild(style);
})();
