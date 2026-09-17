/*
 * GLIME — Phase E
 * Proactive Business Insights Dashboard Add-on
 *
 * Purpose:
 * - Show open proactive business insights on the client dashboard
 * - Read-only UI
 * - Does NOT execute any action
 * - Does NOT modify GLIME CARE
 */

(() => {
  "use strict";

  const SUPABASE_URL = "https://qgztludrqsxvkxmyvfer.supabase.co";

  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4Z3RsZWRycnN4dmt4bXl2ZmVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwMDAwMDAsImV4cCI6MjA1NTU1NTU5OX0.example";

  let supabaseClient = null;

  /*
   * Wait until Supabase JS is available
   */
  function waitForSupabase(callback, attempts = 40) {
    if (window.supabase) {
      callback();
      return;
    }

    if (attempts <= 0) {
      console.error("GLIME Phase E: Supabase JS not found.");
      return;
    }

    setTimeout(() => {
      waitForSupabase(callback, attempts - 1);
    }, 250);
  }

  /*
   * Escape HTML before rendering database content
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /*
   * Priority styling
   */
  function priorityClass(priority) {
    const value = String(priority || "").toLowerCase();

    if (value === "critical") return "critical";
    if (value === "high") return "high";
    if (value === "medium") return "medium";

    return "low";
  }

  /*
   * Format date/time
   */
  function formatDate(dateValue) {
    if (!dateValue) return "Recently detected";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return escapeHtml(dateValue);
    }

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  /*
   * Create UI styles
   */
  function injectStyles() {
    if (document.getElementById("glime-phase-e-styles")) return;

    const style = document.createElement("style");

    style.id = "glime-phase-e-styles";

    style.textContent = `
      .glime-phase-e-card {
        width: 100%;
        margin: 0 0 24px 0;
        padding: 22px;
        border-radius: 18px;
        background: rgba(18, 18, 24, 0.96);
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 12px 35px rgba(0,0,0,0.18);
        color: #fff;
        box-sizing: border-box;
      }

      .glime-phase-e-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 18px;
      }

      .glime-phase-e-title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
      }

      .glime-phase-e-subtitle {
        margin: 5px 0 0;
        color: rgba(255,255,255,0.58);
        font-size: 13px;
      }

      .glime-phase-e-refresh {
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: #fff;
        padding: 9px 14px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 13px;
      }

      .glime-phase-e-refresh:hover {
        background: rgba(255,255,255,0.10);
      }

      .glime-phase-e-list {
        display: grid;
        gap: 12px;
      }

      .glime-phase-e-insight {
        padding: 16px;
        border-radius: 14px;
        background: rgba(255,255,255,0.035);
        border: 1px solid rgba(255,255,255,0.07);
      }

      .glime-phase-e-insight-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
      }

      .glime-phase-e-insight-title {
        margin: 0;
        font-size: 15px;
        font-weight: 650;
      }

      .glime-phase-e-priority {
        flex-shrink: 0;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .glime-phase-e-priority.critical {
        background: rgba(255, 70, 70, 0.14);
        color: #ff7b7b;
      }

      .glime-phase-e-priority.high {
        background: rgba(255, 160, 50, 0.14);
        color: #ffb35c;
      }

      .glime-phase-e-priority.medium {
        background: rgba(255, 210, 70, 0.14);
        color: #ffd966;
      }

      .glime-phase-e-priority.low {
        background: rgba(100, 180, 255, 0.14);
        color: #8fcaff;
      }

      .glime-phase-e-summary {
        margin: 10px 0 8px;
        color: rgba(255,255,255,0.72);
        font-size: 13px;
        line-height: 1.55;
      }

      .glime-phase-e-time {
        color: rgba(255,255,255,0.42);
        font-size: 11px;
      }

      .glime-phase-e-empty {
        padding: 18px;
        text-align: center;
        color: rgba(255,255,255,0.48);
        font-size: 13px;
        border: 1px dashed rgba(255,255,255,0.10);
        border-radius: 14px;
      }

      .glime-phase-e-error {
        padding: 14px;
        border-radius: 12px;
        background: rgba(255,70,70,0.08);
        border: 1px solid rgba(255,70,70,0.15);
        color: rgba(255,255,255,0.72);
        font-size: 13px;
      }

      @media (max-width: 600px) {
        .glime-phase-e-card {
          padding: 17px;
        }

        .glime-phase-e-header {
          align-items: flex-start;
        }

        .glime-phase-e-insight-top {
          flex-direction: column;
          gap: 8px;
        }

        .glime-phase-e-refresh {
          padding: 8px 11px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /*
   * Find current client
   */
  async function getCurrentClient() {
    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session || !session.user) {
      throw new Error("User session not found.");
    }

    const { data, error } = await supabaseClient
      .from("client_data")
      .select("id")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Client profile not found.");
    }

    return data;
  }

  /*
   * Fetch proactive insights
   */
  async function getInsights(clientId) {
    const { data, error } = await supabaseClient
      .from("client_proactive_insights")
      .select(`
        id,
        title,
        priority,
        summary,
        status,
        last_seen_at,
        created_at
      `)
      .eq("client_id", clientId)
      .eq("status", "open")
      .order("priority", { ascending: true })
      .order("last_seen_at", { ascending: false })
      .limit(5);

    if (error) {
      throw error;
    }

    return data || [];
  }

  /*
   * Render insights
   */
  function renderInsights(container, insights) {
    if (!insights.length) {
      container.innerHTML = `
        <div class="glime-phase-e-empty">
          No new business insights detected right now.
        </div>
      `;

      return;
    }

    container.innerHTML = insights
      .map((insight) => {
        const priority = String(insight.priority || "low").toLowerCase();

        return `
          <div class="glime-phase-e-insight">

            <div class="glime-phase-e-insight-top">

              <h3 class="glime-phase-e-insight-title">
                ${escapeHtml(insight.title || "Business Insight")}
              </h3>

              <span class="glime-phase-e-priority ${priorityClass(priority)}">
                ${escapeHtml(priority)}
              </span>

            </div>

            <div class="glime-phase-e-summary">
              ${escapeHtml(
                insight.summary ||
                "GLIME detected a business pattern that may require attention."
              )}
            </div>

            <div class="glime-phase-e-time">
              Last detected:
              ${formatDate(insight.last_seen_at || insight.created_at)}
            </div>

          </div>
        `;
      })
      .join("");
  }

  /*
   * Create dashboard card
   */
  function createCard() {
    const existing = document.getElementById(
      "glime-phase-e-proactive-insights"
    );

    if (existing) {
      return existing;
    }

    const card = document.createElement("section");

    card.id = "glime-phase-e-proactive-insights";

    card.className = "glime-phase-e-card";

    card.innerHTML = `
      <div class="glime-phase-e-header">

        <div>
          <h2 class="glime-phase-e-title">
            Proactive Business Insights
          </h2>

          <p class="glime-phase-e-subtitle">
            GLIME automatically detects important business patterns.
          </p>
        </div>

        <button
          type="button"
          class="glime-phase-e-refresh"
          id="glime-phase-e-refresh"
        >
          Refresh
        </button>

      </div>

      <div
        class="glime-phase-e-list"
        id="glime-phase-e-list"
      >
        <div class="glime-phase-e-empty">
          Loading insights...
        </div>
      </div>
    `;

    return card;
  }

  /*
   * Insert card into dashboard
   */
  function insertCard(card) {
    const progressCard = document.querySelector(".progress-card");

    if (progressCard && progressCard.parentNode) {
      progressCard.parentNode.insertBefore(card, progressCard);
      return;
    }

    const mainContent = document.querySelector(".main-content");

    if (mainContent) {
      mainContent.prepend(card);
      return;
    }

    document.body.prepend(card);
  }

  /*
   * Load and display insights
   */
  async function loadInsights() {
    const list = document.getElementById("glime-phase-e-list");

    if (!list) return;

    list.innerHTML = `
      <div class="glime-phase-e-empty">
        Loading insights...
      </div>
    `;

    try {
      const client = await getCurrentClient();

      const insights = await getInsights(client.id);

      renderInsights(list, insights);

    } catch (error) {
      console.error(
        "GLIME Phase E: Unable to load proactive insights.",
        error
      );

      list.innerHTML = `
        <div class="glime-phase-e-error">
          Proactive insights are temporarily unavailable.
        </div>
      `;
    }
  }

  /*
   * Initialize
   */
  function init() {
    waitForSupabase(async () => {
      try {
        injectStyles();

        supabaseClient = window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_ANON_KEY
        );

        const card = createCard();

        insertCard(card);

        const refreshButton = document.getElementById(
          "glime-phase-e-refresh"
        );

        if (refreshButton) {
          refreshButton.addEventListener("click", loadInsights);
        }

        await loadInsights();

      } catch (error) {
        console.error(
          "GLIME Phase E initialization error:",
          error
        );
      }
    });
  }

  /*
   * Start after DOM is ready
   */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
