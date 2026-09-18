/* =========================================================
   GLIME — LEAD AI EMPLOYEE
   Lead Intelligence UI Add-on
   ---------------------------------------------------------
   - Does NOT modify leads.js
   - Uses its own Supabase client
   - Loads existing lead intelligence
   - Keeps technical/internal workflow details hidden
========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!window.supabase) {
    console.error(
      "GLIME Lead AI: Supabase library not available."
    );
    return;
  }

  const aiDb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  let activeLeadId = null;
  let panelObserver = null;

  /* =========================================================
     HELPERS
  ========================================================= */

  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[char]
    );

  const safeArray = (value) =>
    Array.isArray(value) ? value : [];

  const pretty = (value) => {
    if (!value) return "Unknown";

    return String(value)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) =>
        char.toUpperCase()
      );
  };

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short"
    });
  };

  /* =========================================================
     STATUS
  ========================================================= */

  function setStatus(message, error = false) {
    const element =
      document.getElementById("leadAiStatus");

    if (!element) return;

    element.textContent = message;

    element.style.color = error
      ? "#ffb4bc"
      : "";
  }

  /* =========================================================
     CREATE PANEL
  ========================================================= */

  function ensurePanel() {
    const detail =
      document.getElementById("detailContent");

    if (!detail) {
      return null;
    }

    let panel =
      document.getElementById("leadAiPanel");

    if (panel) {
      return panel;
    }

    panel = document.createElement("section");

    panel.id = "leadAiPanel";
    panel.className = "lead-ai-panel";

    panel.innerHTML = `
      <div class="lead-ai-panel-header">

        <div>
          <div class="lead-ai-eyebrow">
            GLIME LEAD INTELLIGENCE
          </div>

          <h3>
            Lead AI Employee
          </h3>
        </div>

        <button
          type="button"
          id="analyzeLeadBtn"
          class="primary-btn"
        >
          Analyze Lead
        </button>

      </div>

      <div
        id="leadAiStatus"
        class="lead-ai-status"
      >
        Ready to analyze this lead.
      </div>

      <div
        id="leadAiContent"
      ></div>
    `;

    detail.prepend(panel);

    const analyzeButton =
      document.getElementById(
        "analyzeLeadBtn"
      );

    analyzeButton?.addEventListener(
      "click",
      () => {

        if (!activeLeadId) {

          setStatus(
            "No lead selected.",
            true
          );

          return;
        }

        analyzeLead(activeLeadId);
      }
    );

    return panel;
  }

  /* =========================================================
     READY STATE
  ========================================================= */

  function renderReadyState() {

    const content =
      document.getElementById(
        "leadAiContent"
      );

    if (!content) return;

    content.innerHTML = `
      <div class="lead-ai-section">

        <div class="lead-ai-section-title">
          Lead Analysis
        </div>

        <div class="lead-ai-summary">
          Analyze this lead to understand
          intent, urgency, buying signals,
          risk signals and supporting evidence.
        </div>

      </div>
    `;
  }

  /* =========================================================
     RENDER ANALYSIS
  ========================================================= */

  function renderAnalysis(result) {

    const content =
      document.getElementById(
        "leadAiContent"
      );

    if (!content) return;

    const profile =
      result?.profile || {};

    const buyingSignals =
      safeArray(
        result?.buying_signals ||
        profile.buying_signals
      );

    const riskSignals =
      safeArray(
        result?.risk_signals ||
        profile.risk_signals
      );

    const evidence =
      safeArray(
        result?.evidence
      );

    const intent =
      result?.intent ||
      profile.intent ||
      "unknown";

    const urgency =
      result?.urgency ||
      profile.urgency ||
      "unknown";

    const summary =
      result?.ai_summary ||
      profile.ai_summary ||
      "No AI summary available.";

    content.innerHTML = `

      <div class="lead-ai-grid">

        <div class="lead-ai-metric">
          <span>Intent</span>

          <strong>
            ${esc(pretty(intent))}
          </strong>
        </div>

        <div class="lead-ai-metric">
          <span>Urgency</span>

          <strong>
            ${esc(pretty(urgency))}
          </strong>
        </div>

        <div class="lead-ai-metric">
          <span>Estimated Value</span>

          <strong>
            ${
              profile.estimated_value
                ? esc(
                    profile.estimated_value
                  )
                : "—"
            }
          </strong>
        </div>

      </div>

      <div class="lead-ai-section">

        <div class="lead-ai-section-title">
          AI Summary
        </div>

        <div class="lead-ai-summary">
          ${esc(summary)}
        </div>

      </div>

      <div class="lead-ai-two-column">

        <div class="lead-ai-section">

          <div class="lead-ai-section-title">
            Buying Signals
          </div>

          <div class="lead-ai-list">

            ${
              buyingSignals.length
                ? buyingSignals
                    .map(
                      (signal) => `
                        <div
                          class="lead-ai-list-item"
                        >
                          ${esc(signal)}
                        </div>
                      `
                    )
                    .join("")
                : `
                    <div class="sub">
                      No strong buying signals
                      detected.
                    </div>
                  `
            }

          </div>

        </div>

        <div class="lead-ai-section">

          <div class="lead-ai-section-title">
            Risk Signals
          </div>

          <div class="lead-ai-list">

            ${
              riskSignals.length
                ? riskSignals
                    .map(
                      (signal) => `
                        <div
                          class="lead-ai-list-item"
                        >
                          ${esc(signal)}
                        </div>
                      `
                    )
                    .join("")
                : `
                    <div class="sub">
                      No significant risk signals
                      detected.
                    </div>
                  `
            }

          </div>

        </div>

      </div>

      <div class="lead-ai-section">

        <div class="lead-ai-section-title">
          Decision Evidence
        </div>

        <div class="lead-ai-evidence">

          ${
            evidence.length
              ? evidence
                  .map(
                    (item) => `
                      <div
                        class="lead-ai-evidence-item"
                      >

                        <strong>
                          ${esc(
                            item.label ||
                            item.evidence_type ||
                            "Evidence"
                          )}
                        </strong>

                        <span>
                          ${esc(
                            typeof item.value ===
                            "object"
                              ? JSON.stringify(
                                  item.value
                                )
                              : item.value
                          )}
                        </span>

                        ${
                          item.source
                            ? `
                              <small>
                                Source:
                                ${esc(
                                  item.source
                                )}
                              </small>
                            `
                            : ""
                        }

                      </div>
                    `
                  )
                  .join("")
              : `
                  <div class="sub">
                    No evidence records available
                    yet.
                  </div>
                `
          }

        </div>

      </div>

      <div class="lead-ai-section">

        <div class="lead-ai-section-title">
          Analysis Metadata
        </div>

        <div class="lead-ai-summary">
          Last analyzed:
          ${esc(
            formatDate(
              result?.analyzed_at ||
              profile.updated_at
            )
          )}
        </div>

      </div>

    `;
  }

  /* =========================================================
     LOAD EXISTING ANALYSIS
  ========================================================= */

  async function loadExistingAnalysis(
    leadId
  ) {

    try {

      const [
        profileResult,
        evidenceResult
      ] = await Promise.all([

        aiDb
          .from("lead_profiles")
          .select("*")
          .eq("lead_id", leadId)
          .maybeSingle(),

        aiDb
          .from("lead_evidence")
          .select("*")
          .eq("lead_id", leadId)
          .eq(
            "evidence_type",
            "intelligence"
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          )

      ]);

      if (profileResult.error) {
        throw profileResult.error;
      }

      if (evidenceResult.error) {
        throw evidenceResult.error;
      }

      const profile =
        profileResult.data;

      const evidence =
        evidenceResult.data || [];

      if (!profile) {

        renderReadyState();

        setStatus(
          "No AI analysis yet. Click Analyze Lead."
        );

        return;
      }

      renderAnalysis({

        profile,

        evidence,

        intent:
          profile.intent,

        urgency:
          profile.urgency,

        ai_summary:
          profile.ai_summary,

        buying_signals:
          profile.buying_signals,

        risk_signals:
          profile.risk_signals,

        analyzed_at:
          profile.updated_at

      });

      setStatus(
        "Existing AI analysis loaded."
      );

    } catch (error) {

      console.error(
        "GLIME Lead AI load error:",
        error
      );

      renderReadyState();

      setStatus(
        "Could not load existing AI analysis.",
        true
      );
    }
  }

  /* =========================================================
     ANALYZE LEAD
  ========================================================= */

  async function analyzeLead(
    leadId
  ) {

    const button =
      document.getElementById(
        "analyzeLeadBtn"
      );

    if (button) {

      button.disabled = true;

      button.textContent =
        "Analyzing…";
    }

    setStatus(
      "Lead AI is analyzing this lead…"
    );

    try {

      const {
        data,
        error
      } = await aiDb.functions.invoke(
        "lead-intelligence",
        {
          body: {
            lead_id: leadId
          }
        }
      );

      if (error) {
        throw error;
      }

      if (!data) {

        throw new Error(
          "No analysis response received."
        );
      }

      const analysisResult =
        Array.isArray(data?.results)
          ? data.results.find(
              (item) =>
                item?.lead_id === leadId
            ) ||
            data.results[0]
          : data;

      if (!analysisResult) {

        throw new Error(
          "Lead analysis response did not contain a result for this lead."
        );
      }

      renderAnalysis(
        analysisResult
      );

      await loadExistingAnalysis(
        leadId
      );

      setStatus(
        "Lead analysis completed successfully."
      );

    } catch (error) {

      console.error(
        "GLIME Lead AI analysis error:",
        error
      );

      setStatus(
        error?.message ||
          "Lead analysis failed.",
        true
      );

    } finally {

      if (button) {

        button.disabled = false;

        button.textContent =
          "Analyze Lead";
      }
    }
  }

  /* =========================================================
     DETECT LEAD OPEN
  ========================================================= */

  function handleDocumentClick(
    event
  ) {

    const button =
      event.target.closest(
        "[data-open]"
      );

    if (!button) {
      return;
    }

    const leadId =
      button.dataset.open;

    if (!leadId) {
      return;
    }

    activeLeadId =
      leadId;

    setTimeout(() => {

      const panel =
        ensurePanel();

      if (!panel) {
        return;
      }

      setStatus(
        "Loading lead intelligence…"
      );

      loadExistingAnalysis(
        leadId
      );

    }, 100);
  }

  /* =========================================================
     OBSERVE DETAIL MODAL
  ========================================================= */

  function startObserver() {

    const detail =
      document.getElementById(
        "detailContent"
      );

    if (!detail) {
      return;
    }

    if (panelObserver) {
      panelObserver.disconnect();
    }

    panelObserver =
      new MutationObserver(() => {

        if (!activeLeadId) {
          return;
        }

        const panel =
          document.getElementById(
            "leadAiPanel"
          );

        if (!panel) {
          ensurePanel();
        }

      });

    panelObserver.observe(
      detail,
      {
        childList: true,
        subtree: true
      }
    );
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  window.GLIMELeadAI = {

    analyze:
      analyzeLead,

    refresh: () => {

      if (activeLeadId) {

        return loadExistingAnalysis(
          activeLeadId
        );
      }
    }

  };

  /* =========================================================
     INIT
  ========================================================= */

  document.addEventListener(
    "click",
    handleDocumentClick
  );

  startObserver();

  console.log(
    "GLIME Lead AI Employee loaded."
  );

})();
