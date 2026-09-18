/* =========================================================
   GLIME — LEAD AI EMPLOYEE ADDON
   Phase 4: Lead Intelligence

   IMPORTANT:
   - This file extends leads.js.
   - Do NOT duplicate Supabase client creation here.
   - Do NOT modify leads.js for AI logic.
   - Existing Lead CRUD remains owned by leads.js.
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     STATE
  ======================================================= */

  let intelligenceLeadId = null;
  let intelligenceInProgress = false;


  /* =======================================================
     HELPERS
  ======================================================= */

  const addon$ = (id) =>
    document.getElementById(id);


  const addonEsc = (value) => {
    if (typeof window.esc === "function") {
      return window.esc(value);
    }

    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[char])
    );
  };


  const showAddonMessage = (message, error = false) => {
    if (typeof window.showMessage === "function") {
      window.showMessage(message, error);
    }
  };


  /* =======================================================
     ENSURE AI UI EXISTS
     
     We create the AI panel dynamically so leads.html
     does not need a large rewrite just for Phase 4.
  ======================================================= */

  function ensureIntelligencePanel() {
    const detailContent =
      addon$("detailContent");

    if (!detailContent) {
      return null;
    }

    let panel =
      addon$("leadAIIntelligencePanel");

    if (panel) {
      return panel;
    }

    panel = document.createElement("section");

    panel.id =
      "leadAIIntelligencePanel";

    panel.className =
      "lead-ai-panel";

    panel.innerHTML = `
      <div class="lead-ai-panel-header">

        <div>
          <div class="lead-ai-eyebrow">
            LEAD AI EMPLOYEE
          </div>

          <h3>
            AI Intelligence
          </h3>

          <p class="sub">
            AI-assisted understanding of this lead.
          </p>
        </div>

        <button
          type="button"
          class="row-action"
          id="analyzeLeadBtn"
        >
          Analyze Lead
        </button>

      </div>


      <div
        id="intelligenceStatus"
        class="lead-ai-status"
      >
        Not analyzed yet.
      </div>


      <div
        id="intelligenceGrid"
        class="lead-ai-grid"
      >

        <div class="lead-ai-metric">
          <span>Intent</span>
          <strong id="intelligenceIntent">
            —
          </strong>
        </div>

        <div class="lead-ai-metric">
          <span>Urgency</span>
          <strong id="intelligenceUrgency">
            —
          </strong>
        </div>

        <div class="lead-ai-metric">
          <span>Estimated Value</span>
          <strong id="intelligenceValue">
            —
          </strong>
        </div>

      </div>


      <div class="lead-ai-section">

        <div class="lead-ai-section-title">
          AI Summary
        </div>

        <div
          id="intelligenceSummary"
          class="lead-ai-summary"
        >
          No analysis available yet.
        </div>

      </div>


      <div class="lead-ai-two-column">

        <div class="lead-ai-section">

          <div class="lead-ai-section-title">
            Buying Signals
          </div>

          <div
            id="intelligenceBuyingSignals"
            class="lead-ai-list"
          >
            <span class="sub">
              No signals yet.
            </span>
          </div>

        </div>


        <div class="lead-ai-section">

          <div class="lead-ai-section-title">
            Risk Signals
          </div>

          <div
            id="intelligenceRiskSignals"
            class="lead-ai-list"
          >
            <span class="sub">
              No signals yet.
            </span>
          </div>

        </div>

      </div>


      <div class="lead-ai-section">

        <div class="lead-ai-section-title">
          Decision Evidence
        </div>

        <div
          id="intelligenceEvidence"
          class="lead-ai-evidence"
        >
          <span class="sub">
            Evidence will appear after analysis.
          </span>
        </div>

      </div>


      <div class="lead-ai-future-grid">

        <div class="lead-ai-future-card">

          <strong>
            Next Best Action
          </strong>

          <span>
            Phase 7
          </span>

          <small>
            Will recommend the next appropriate
            action from the lead's current state.
          </small>

        </div>


        <div class="lead-ai-future-card">

          <strong>
            Duplicate Check
          </strong>

          <span>
            Phase 6
          </span>

          <small>
            Duplicate detection and merge suggestions
            will be connected here.
          </small>

        </div>


        <div class="lead-ai-future-card">

          <strong>
            Connected Agents
          </strong>

          <span>
            Phase 8
          </span>

          <small>
            Existing communication agents will connect
            here without duplicating their responsibilities.
          </small>

        </div>

      </div>

    `;

    /*
      Put AI panel at the top of the detail view.
      This keeps the Lead Command Center structure
      ready for later phases.
    */

    detailContent.prepend(panel);

    const analyzeButton =
      addon$("analyzeLeadBtn");

    if (analyzeButton) {
      analyzeButton.addEventListener(
        "click",
        () => {

          if (!intelligenceLeadId) {
            showAddonMessage(
              "No lead selected.",
              true
            );

            return;
          }

          analyzeLead(
            intelligenceLeadId
          );

        }
      );
    }

    return panel;
  }


  /* =======================================================
     RESET UI
  ======================================================= */

  function resetIntelligenceUI() {

    if (addon$("intelligenceStatus")) {
      addon$("intelligenceStatus")
        .textContent =
        "Not analyzed yet.";
    }

    if (addon$("intelligenceIntent")) {
      addon$("intelligenceIntent")
        .textContent = "—";
    }

    if (addon$("intelligenceUrgency")) {
      addon$("intelligenceUrgency")
        .textContent = "—";
    }

    if (addon$("intelligenceValue")) {
      addon$("intelligenceValue")
        .textContent = "—";
    }

    if (addon$("intelligenceSummary")) {
      addon$("intelligenceSummary")
        .textContent =
        "No analysis available yet.";
    }

    if (addon$("intelligenceBuyingSignals")) {
      addon$("intelligenceBuyingSignals")
        .innerHTML = `
          <span class="sub">
            No signals yet.
          </span>
        `;
    }

    if (addon$("intelligenceRiskSignals")) {
      addon$("intelligenceRiskSignals")
        .innerHTML = `
          <span class="sub">
            No signals yet.
          </span>
        `;
    }

    if (addon$("intelligenceEvidence")) {
      addon$("intelligenceEvidence")
        .innerHTML = `
          <span class="sub">
            Evidence will appear after analysis.
          </span>
        `;
    }

  }


  /* =======================================================
     FORMAT VALUE
  ======================================================= */

  function formatEstimatedValue(value) {

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "—";
    }

    const number =
      Number(value);

    if (
      !Number.isFinite(number)
    ) {
      return addonEsc(value);
    }

    try {
      return new Intl.NumberFormat(
        "en-IN",
        {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0
        }
      ).format(number);

    } catch {
      return `₹${number.toLocaleString("en-IN")}`;
    }
  }


  /* =======================================================
     NORMALIZE SIGNAL
  ======================================================= */

  function normalizeSignal(signal) {

    if (
      signal === null ||
      signal === undefined
    ) {
      return "";
    }

    if (
      typeof signal === "string"
    ) {
      return signal;
    }

    if (
      typeof signal === "object"
    ) {

      return (
        signal.label ||
        signal.reason ||
        signal.signal ||
        signal.description ||
        JSON.stringify(signal)
      );

    }

    return String(signal);
  }


  /* =======================================================
     RENDER SIGNAL LIST
  ======================================================= */

  function renderSignalList(
    elementId,
    signals,
    emptyText
  ) {

    const element =
      addon$(elementId);

    if (!element) {
      return;
    }

    if (
      !Array.isArray(signals) ||
      !signals.length
    ) {

      element.innerHTML = `
        <span class="sub">
          ${addonEsc(emptyText)}
        </span>
      `;

      return;
    }

    element.innerHTML =
      signals
        .map(normalizeSignal)
        .filter(Boolean)
        .map(
          (signal) => `
            <div class="lead-ai-list-item">
              ${addonEsc(signal)}
            </div>
          `
        )
        .join("");

  }


  /* =======================================================
     RENDER EVIDENCE
  ======================================================= */

  function renderEvidence(
    evidence
  ) {

    const element =
      addon$("intelligenceEvidence");

    if (!element) {
      return;
    }

    if (
      !Array.isArray(evidence) ||
      !evidence.length
    ) {

      element.innerHTML = `
        <span class="sub">
          No factual evidence recorded yet.
        </span>
      `;

      return;
    }

    element.innerHTML =
      evidence
        .map((item) => {

          const label =
            item.label ||
            "Evidence";

          let value =
            item.value;

          if (
            typeof value === "object" &&
            value !== null
          ) {
            value =
              JSON.stringify(value);
          }

          return `
            <div class="lead-ai-evidence-item">

              <strong>
                ${addonEsc(label)}
              </strong>

              <span>
                ${addonEsc(value)}
              </span>

              ${
                item.source
                  ? `
                    <small>
                      Source:
                      ${addonEsc(item.source)}
                    </small>
                  `
                  : ""
              }

            </div>
          `;

        })
        .join("");

  }


  /* =======================================================
     RENDER PROFILE
  ======================================================= */

  function renderProfile(
    profile,
    evidence
  ) {

    if (!profile) {
      resetIntelligenceUI();
      return;
    }

    if (addon$("intelligenceStatus")) {

      const updated =
        profile.updated_at;

      addon$("intelligenceStatus")
        .textContent =
        updated
          ? `Last analyzed: ${formatDateSafe(updated)}`
          : "Analysis available.";

    }


    if (addon$("intelligenceIntent")) {

      addon$("intelligenceIntent")
        .textContent =
        profile.intent || "unknown";

    }


    if (addon$("intelligenceUrgency")) {

      addon$("intelligenceUrgency")
        .textContent =
        profile.urgency || "unknown";

    }


    if (addon$("intelligenceValue")) {

      addon$("intelligenceValue")
        .textContent =
        formatEstimatedValue(
          profile.estimated_value
        );

    }


    if (addon$("intelligenceSummary")) {

      addon$("intelligenceSummary")
        .textContent =
        profile.ai_summary ||
        "No AI summary was generated.";

    }


    renderSignalList(
      "intelligenceBuyingSignals",
      profile.buying_signals,
      "No buying signals detected."
    );


    renderSignalList(
      "intelligenceRiskSignals",
      profile.risk_signals,
      "No risk signals detected."
    );


    renderEvidence(
      evidence
    );

  }


  /* =======================================================
     SAFE DATE
  ======================================================= */

  function formatDateSafe(value) {

    if (
      typeof window.fmtDate ===
      "function"
    ) {
      return window.fmtDate(value);
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "—";
    }

    return date.toLocaleString(
      [],
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );
  }


  /* =======================================================
     LOAD SAVED INTELLIGENCE
  ======================================================= */

  async function loadLeadIntelligence(
    leadId
  ) {

    if (
      !window.db ||
      !window.db.from
    ) {
      throw new Error(
        "Supabase client is not available."
      );
    }

    const [
      profileResult,
      evidenceResult
    ] = await Promise.all([

      window.db
        .from("lead_profiles")
        .select("*")
        .eq(
          "lead_id",
          leadId
        )
        .maybeSingle(),

      window.db
        .from("lead_evidence")
        .select("*")
        .eq(
          "lead_id",
          leadId
        )
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


    if (
      profileResult.error
    ) {
      throw profileResult.error;
    }


    if (
      evidenceResult.error
    ) {
      throw evidenceResult.error;
    }


    renderProfile(
      profileResult.data,
      evidenceResult.data || []
    );

  }


  /* =======================================================
     ANALYZE LEAD
  ======================================================= */

  async function analyzeLead(
    leadId
  ) {

    if (
      intelligenceInProgress
    ) {
      return;
    }

    if (
      !leadId
    ) {
      return;
    }

    if (
      !window.db ||
      !window.db.functions
    ) {

      showAddonMessage(
        "Supabase client is not ready.",
        true
      );

      return;
    }


    intelligenceInProgress =
      true;

    intelligenceLeadId =
      leadId;


    const button =
      addon$("analyzeLeadBtn");

    const originalText =
      button?.textContent ||
      "Analyze Lead";


    if (button) {

      button.disabled = true;

      button.textContent =
        "Analyzing…";

    }


    if (
      addon$("intelligenceStatus")
    ) {

      addon$("intelligenceStatus")
        .textContent =
        "Lead AI is analyzing this lead…";

    }


    try {

      /*
        Supabase's current JavaScript client
        supports functions.invoke() with a JSON body.
      */

      const {
        data,
        error
      } = await window.db
        .functions
        .invoke(
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


      /*
        Reload persisted profile/evidence.
        This means the UI reflects the database,
        not only the function response.
      */

      await loadLeadIntelligence(
        leadId
      );


      showAddonMessage(
        "Lead intelligence updated."
      );


      /*
        Optional debugging information.
        Does not expose hidden reasoning.
      */

      if (
        data &&
        typeof data === "object"
      ) {

        console.debug(
          "[GLIME Lead AI]",
          data
        );

      }

    } catch (error) {

      console.error(
        "[GLIME Lead AI]",
        error
      );


      if (
        addon$("intelligenceStatus")
      ) {

        addon$("intelligenceStatus")
          .textContent =
          "Analysis failed. Please try again.";

      }


      showAddonMessage(
        error?.message ||
        "Lead analysis failed.",
        true
      );

    } finally {

      intelligenceInProgress =
        false;


      if (button) {

        button.disabled =
          false;

        button.textContent =
          originalText;

      }

    }

  }


  /* =======================================================
     OPEN LEAD HOOK
     
     Existing leads.js opens the detail modal.
     We watch for the modal/detail content and detect
     the selected lead without replacing existing logic.
  ======================================================= */

  function detectCurrentLead() {

    const detailModal =
      addon$("detailModal");

    if (
      !detailModal ||
      detailModal.classList.contains(
        "hidden"
      )
    ) {
      return null;
    }


    /*
      Existing leads.js stores the lead ID
      in the detail action buttons.
    */

    const deleteButton =
      detailModal.querySelector(
        "[data-delete]"
      );

    if (
      deleteButton?.dataset?.delete
    ) {
      return deleteButton.dataset.delete;
    }


    const statusSelect =
      detailModal.querySelector(
        "[data-status-lead]"
      );

    if (
      statusSelect?.dataset?.statusLead
    ) {
      return statusSelect.dataset.statusLead;
    }


    /*
      Fallback:
      look for any button carrying a lead ID.
    */

    const candidate =
      detailModal.querySelector(
        "[data-lead-id]"
      );

    if (
      candidate?.dataset?.leadId
    ) {
      return candidate.dataset.leadId;
    }


    return null;
  }


  /* =======================================================
     OBSERVE DETAIL MODAL
  ======================================================= */

  function observeDetailModal() {

    const modal =
      addon$("detailModal");

    if (!modal) {
      return;
    }


    const observer =
      new MutationObserver(
        async () => {

          if (
            modal.classList.contains(
              "hidden"
            )
          ) {
            return;
          }


          ensureIntelligencePanel();


          const leadId =
            detectCurrentLead();


          if (
            !leadId ||
            leadId === intelligenceLeadId
          ) {
            return;
          }


          intelligenceLeadId =
            leadId;


          resetIntelligenceUI();


          try {

            await loadLeadIntelligence(
              leadId
            );

          } catch (error) {

            /*
              Do not break the existing Leads UI
              if AI data cannot be loaded.
            */

            console.warn(
              "[GLIME Lead AI] Could not load intelligence:",
              error
            );

          }

        }
      );


    observer.observe(
      modal,
      {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "class",
          "data-delete",
          "data-status-lead",
          "data-lead-id"
        ]
      }
    );

  }


  /* =======================================================
     INIT
  ======================================================= */

  function initLeadAIAddon() {

    /*
      Give leads.js a moment to finish its
      initial DOM setup.
    */

    ensureIntelligencePanel();

    observeDetailModal();

    console.info(
      "[GLIME] Lead AI addon initialized."
    );

  }


  /* =======================================================
     PUBLIC API
  ======================================================= */

  window.GLIMELeadAI = {

    analyzeLead,

    loadLeadIntelligence,

    ensureIntelligencePanel

  };


  /* =======================================================
     START
  ======================================================= */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initLeadAIAddon
    );

  } else {

    initLeadAIAddon();

  }

})();
