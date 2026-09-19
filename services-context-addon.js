(function () {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const CONTEXT_FUNCTION =
    SUPABASE_URL + "/functions/v1/offer-context-resolver";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function money(price) {
    if (!price) return "";

    if (price.price_type === "custom") {
      return "Custom pricing";
    }

    const currency = String(price.currency || "").trim();

    if (price.price_type === "range") {
      return `${currency} ${price.min_amount ?? ""}–${price.max_amount ?? ""}`.trim();
    }

    if (price.price_type === "starting_from") {
      return `From ${currency} ${
        price.min_amount ?? price.amount ?? ""
      }`.trim();
    }

    return `${currency} ${price.amount ?? ""}`.trim();
  }

  function ensurePanel() {
    let panel = document.getElementById(
      "servicesAiContextPanel"
    );

    if (panel) return panel;

    panel = document.createElement("section");

    panel.id = "servicesAiContextPanel";
    panel.className = "services-ai-context-panel";

    panel.innerHTML = `
      <div class="services-ai-context-head">

        <div>

          <div class="services-ai-context-eyebrow">
            AI CONTEXT
          </div>

          <h2>
            Published catalog context
          </h2>

          <p>
            This is the published Services & Offers context available to
            your Instagram, WhatsApp, Voice and Follow-up specialists.
          </p>

        </div>

        <button
          id="servicesAiContextRefresh"
          type="button"
          class="ghost"
        >
          Refresh
        </button>

      </div>

      <div
        id="servicesAiContextStatus"
        class="services-ai-context-status"
      >
        Loading context...
      </div>

      <div
        id="servicesAiContextList"
        class="services-ai-context-list"
      ></div>
    `;

    const style = document.createElement("style");

    style.textContent = `
      .services-ai-context-panel {
        margin: 0 0 18px;
        padding: 18px 20px;
        background: rgba(16, 27, 41, 0.78);
        border: 1px solid var(
          --border,
          rgba(184, 222, 234, 0.13)
        );
        border-radius: 18px;
      }

      .services-ai-context-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
      }

      .services-ai-context-eyebrow {
        color: var(--cyan, #52e8ff);
        font: 500 10px "DM Mono", monospace;
        letter-spacing: 0.14em;
      }

      .services-ai-context-panel h2 {
        margin: 7px 0 8px;
        font-size: 17px;
      }

      .services-ai-context-panel p {
        max-width: 760px;
        margin: 0;
        color: var(--muted, #9cabb9);
        line-height: 1.55;
        font-size: 12px;
      }

      .services-ai-context-status {
        margin-top: 15px;
        padding: 10px 12px;
        color: var(--muted, #9cabb9);
        border: 1px solid var(
          --border,
          rgba(184, 222, 234, 0.13)
        );
        border-radius: 10px;
        font: 500 11px "DM Mono", monospace;
      }

      .services-ai-context-status.success {
        color: var(--green, #50f5a8);
      }

      .services-ai-context-status.error {
        color: #ff9ba7;
        border-color: rgba(255, 100, 117, 0.35);
      }

      .services-ai-context-list {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }

      .services-ai-context-item {
        padding: 11px 12px;
        border: 1px solid var(
          --border,
          rgba(184, 222, 234, 0.13)
        );
        border-radius: 10px;
      }

      .services-ai-context-item-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .services-ai-context-name {
        font-size: 13px;
        font-weight: 700;
      }

      .services-ai-context-meta {
        margin-top: 5px;
        color: var(--dim, #6f818c);
        font: 10px "DM Mono", monospace;
      }

      @media (max-width: 720px) {

        .services-ai-context-head {
          flex-direction: column;
        }

        .services-ai-context-head .ghost {
          width: 100%;
        }

      }
    `;

    document.head.appendChild(style);

    const message =
      document.getElementById("message");

    if (message?.parentNode) {

      message.parentNode.insertBefore(
        panel,
        message
      );

    } else {

      const hero =
        document.querySelector(".hero");

      if (hero?.parentNode) {

        hero.parentNode.insertBefore(
          panel,
          hero.nextSibling
        );

      } else {

        document.body.prepend(panel);

      }
    }

    document
      .getElementById("servicesAiContextRefresh")
      ?.addEventListener(
        "click",
        refresh
      );

    return panel;
  }

  async function getAccessToken() {

    if (!window.supabase?.createClient) {

      throw new Error(
        "Supabase client library is not loaded."
      );

    }

    if (!window.__glimeServicesContextClient) {

      window.__glimeServicesContextClient =
        window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY
        );

    }

    const {
      data: { session },
      error
    } =
      await window.__glimeServicesContextClient.auth.getSession();

    if (error) {
      throw error;
    }

    if (!session?.access_token) {

      throw new Error(
        "Active client session not found."
      );

    }

    return session.access_token;
  }

  function renderContext(data) {

    const status =
      document.getElementById(
        "servicesAiContextStatus"
      );

    const list =
      document.getElementById(
        "servicesAiContextList"
      );

    if (!status || !list) {
      return;
    }

    const count =
      Number(data?.count || 0);

    const businessName =
      data?.client?.business_name ||
      "Client";

    status.className =
      "services-ai-context-status " +
      (data?.ok ? "success" : "");

    status.textContent =
      `${businessName} · ${count} published offer${
        count === 1 ? "" : "s"
      } available to AI specialists · drafts excluded`;

    if (!count) {

      list.innerHTML = `
        <div class="services-ai-context-item">
          No published Services & Offers are available yet.
        </div>
      `;

      return;
    }

    list.innerHTML =
      (data.offers || [])
        .slice(0, 12)
        .map((offer) => {

          const price =
            offer.prices?.[0]
              ? money(offer.prices[0])
              : "";

          const category =
            offer.category?.name ||
            offer.offer_type ||
            "offer";

          return `
            <div class="services-ai-context-item">

              <div class="services-ai-context-item-top">

                <div class="services-ai-context-name">
                  ${escapeHtml(offer.name)}
                </div>

                <span class="status published">
                  Published
                </span>

              </div>

              <div class="services-ai-context-meta">

                ${escapeHtml(category)}

                ${
                  price
                    ? " · " + escapeHtml(price)
                    : ""
                }

                ${
                  offer.version?.number
                    ? " · v" +
                      escapeHtml(
                        offer.version.number
                      )
                    : ""
                }

              </div>

            </div>
          `;

        })
        .join("");
  }

  async function refresh() {

    ensurePanel();

    const status =
      document.getElementById(
        "servicesAiContextStatus"
      );

    if (status) {

      status.className =
        "services-ai-context-status";

      status.textContent =
        "Resolving published catalog context...";

    }

    try {

      const token =
        await getAccessToken();

      const response =
        await fetch(
          CONTEXT_FUNCTION,
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${token}`,

              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              action: "resolve",
              limit: 100
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        throw new Error(
          data?.error ||
          "Context resolver request failed."
        );

      }

      renderContext(data);

      return data;

    } catch (error) {

      console.error(
        "Services AI context refresh failed:",
        error
      );

      if (status) {

        status.className =
          "services-ai-context-status error";

        status.textContent =
          error.message ||
          "Unable to load AI context.";

      }

      return null;
    }
  }

  window.GLIMEServicesAIContext = {
    refresh
  };

  ensurePanel();

  refresh();

  const saveButtons = [
    document.getElementById(
      "saveDraftBtn"
    ),

    document.getElementById(
      "savePublishBtn"
    )
  ].filter(Boolean);

  saveButtons.forEach((button) => {

    button.addEventListener(
      "click",
      () => {

        window.setTimeout(
          refresh,
          2500
        );

      }
    );

  });

  window.setInterval(
    refresh,
    30000
  );

})();
