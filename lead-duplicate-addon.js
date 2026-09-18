/* =========================================================
   GLIME — Lead Duplicate Detection Add-on
   Phase 6

   - Uses dedicated lead-duplicate-detection Edge Function
   - Reads/writes only the authenticated client's duplicates
   - Human review only: Confirm / Reject
   - Never merges or deletes leads automatically
   - Does not modify leads.js
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!window.supabase) {
    console.error(
      "[GLIME Lead Duplicates] Supabase client not loaded."
    );
    return;
  }

  // Separate Supabase client.
  // leads.js is NOT modified.
  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  let activeLeadId = null;
  let clientIdCache = null;
  let rendering = false;

  /* =========================================================
     SECURITY / HTML HELPERS
     ========================================================= */

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function sourceLabel(source) {
    const map = {
      offline: "Offline",
      website: "Website",
      lookbook: "Lookbook",
      voice: "Voice AI",
      instagram: "Instagram",
      dashboard: "Dashboard",
      system: "System",
      manual: "Manual"
    };

    return (
      map[String(source || "").toLowerCase()] ||
      source ||
      "Unknown"
    );
  }

  function scoreLabel(score) {
    const n = Number(score || 0);
    return `${Math.round(n * 100)}% match`;
  }

  /* =========================================================
     CLIENT RESOLUTION
     ========================================================= */

  async function getClientId() {
    if (clientIdCache) {
      return clientIdCache;
    }

    const {
      data: { user },
      error: userError
    } = await db.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data, error } = await db
      .from("client_data")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        "[GLIME Lead Duplicates] client lookup error:",
        error
      );
      return null;
    }

    clientIdCache = data?.client_id || null;

    return clientIdCache;
  }

  /* =========================================================
     LOAD ACTIVE LEAD
     ========================================================= */

  async function loadLead(leadId) {
    const clientId = await getClientId();

    if (!clientId) {
      return {
        lead: null,
        error: "Unable to resolve client."
      };
    }

    const { data, error } = await db
      .from("leads")
      .select(
        "id, name, mobile, whatsapp, city_area, interest, product_service, source, status"
      )
      .eq("id", leadId)
      .eq("client_id", clientId)
      .maybeSingle();

    return {
      lead: data || null,
      error
    };
  }

  /* =========================================================
     LOAD DUPLICATE RECORDS
     ========================================================= */

  async function loadDuplicates(leadId) {
    const clientId = await getClientId();

    if (!clientId) {
      return {
        rows: [],
        leads: new Map(),
        error: "Unable to resolve client."
      };
    }

    const { data: rows, error } = await db
      .from("lead_duplicates")
      .select(
        "id, client_id, lead_id, possible_lead_id, match_score, match_reasons, status, reviewed_at, created_at"
      )
      .eq("client_id", clientId)
      .or(
        `lead_id.eq.${leadId},possible_lead_id.eq.${leadId}`
      )
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error(
        "[GLIME Lead Duplicates] duplicate query error:",
        error
      );

      return {
        rows: [],
        leads: new Map(),
        error
      };
    }

    const otherIds = [
      ...new Set(
        (rows || []).map((row) =>
          row.lead_id === leadId
            ? row.possible_lead_id
            : row.lead_id
        )
      )
    ];

    const leadMap = new Map();

    if (otherIds.length) {
      const {
        data: otherLeads,
        error: leadsError
      } = await db
        .from("leads")
        .select(
          "id, name, mobile, whatsapp, city_area, interest, product_service, source, status"
        )
        .eq("client_id", clientId)
        .in("id", otherIds);

      if (leadsError) {
        console.error(
          "[GLIME Lead Duplicates] candidate lead query error:",
          leadsError
        );
      } else {
        (otherLeads || []).forEach((lead) => {
          leadMap.set(lead.id, lead);
        });
      }
    }

    return {
      rows: rows || [],
      leads: leadMap,
      error: null
    };
  }

  /* =========================================================
     RUN DUPLICATE DETECTION EDGE FUNCTION
     ========================================================= */

  async function runDetection(leadId) {
    const { data, error } =
      await db.functions.invoke(
        "lead-duplicate-detection",
        {
          body: {
            lead_id: leadId
          }
        }
      );

    if (error) {
      throw new Error(
        error.message ||
          "Duplicate detection failed."
      );
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  }

  /* =========================================================
     HUMAN REVIEW
     ========================================================= */

  async function reviewDuplicate(
    duplicateId,
    status
  ) {
    const clientId = await getClientId();

    if (!clientId) {
      throw new Error(
        "Unable to resolve client."
      );
    }

    const {
      data: duplicate,
      error: duplicateError
    } = await db
      .from("lead_duplicates")
      .select(
        "id, lead_id, possible_lead_id"
      )
      .eq("id", duplicateId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (duplicateError) {
      throw duplicateError;
    }

    if (!duplicate) {
      throw new Error(
        "Duplicate record not found."
      );
    }

    const reviewedAt =
      new Date().toISOString();

    const {
      error: updateError
    } = await db
      .from("lead_duplicates")
      .update({
        status,
        reviewed_at: reviewedAt
      })
      .eq("id", duplicateId)
      .eq("client_id", clientId);

    if (updateError) {
      throw updateError;
    }

    // Record the human review in the Lead Timeline.
    await db.from("lead_timeline").insert({
      client_id: clientId,
      lead_id: activeLeadId,
      event_type: "duplicate_reviewed",

      title:
        status === "confirmed"
          ? "Possible duplicate confirmed"
          : "Possible duplicate rejected",

      description:
        status === "confirmed"
          ? "A possible duplicate was confirmed by the user."
          : "A possible duplicate was rejected by the user.",

      source: "duplicate_detection",

      metadata: {
        duplicate_id: duplicateId,
        reviewed_status: status,
        lead_id: duplicate.lead_id,
        possible_lead_id:
          duplicate.possible_lead_id
      }
    });
  }

  /* =========================================================
     FIND OTHER LEAD ID
     ========================================================= */

  function candidateIdFor(
    row,
    leadId
  ) {
    return row.lead_id === leadId
      ? row.possible_lead_id
      : row.lead_id;
  }

  /* =========================================================
     RENDER DUPLICATE SECTION
     ========================================================= */

  function renderDuplicateSection(
    leadId,
    payload
  ) {
    const section =
      document.createElement("section");

    section.id =
      "leadDuplicatesPhase6";

    section.className =
      "lead-phase6-section";

    const rows = payload.rows || [];

    const pending =
      rows.filter(
        (row) =>
          row.status === "pending"
      );

    const cards = rows.length
      ? rows
          .map((row) => {
            const candidate =
              payload.leads.get(
                candidateIdFor(
                  row,
                  leadId
                )
              );

            const reasons =
              Array.isArray(
                row.match_reasons
              )
                ? row.match_reasons
                : [];

            const statusClass =
              String(
                row.status ||
                  "pending"
              ).toLowerCase();

            return `
              <article class="lead-phase6-card">

                <div class="lead-phase6-card-head">

                  <div>

                    <strong>
                      ${escapeHtml(
                        candidate?.name ||
                          "Unnamed lead"
                      )}
                    </strong>

                    <span
                      class="lead-phase6-status lead-phase6-status-${escapeHtml(
                        statusClass
                      )}"
                    >
                      ${escapeHtml(
                        row.status ||
                          "pending"
                      )}
                    </span>

                  </div>

                  <span class="lead-phase6-score">
                    ${scoreLabel(
                      row.match_score
                    )}
                  </span>

                </div>

                <div class="lead-phase6-candidate-grid">

                  <span>
                    <b>Mobile:</b>
                    ${escapeHtml(
                      candidate?.mobile ||
                        "—"
                    )}
                  </span>

                  <span>
                    <b>WhatsApp:</b>
                    ${escapeHtml(
                      candidate?.whatsapp ||
                        "—"
                    )}
                  </span>

                  <span>
                    <b>Area:</b>
                    ${escapeHtml(
                      candidate?.city_area ||
                        "—"
                    )}
                  </span>

                  <span>
                    <b>Source:</b>
                    ${escapeHtml(
                      sourceLabel(
                        candidate?.source
                      )
                    )}
                  </span>

                  <span>
                    <b>Status:</b>
                    ${escapeHtml(
                      candidate?.status ||
                        "—"
                    )}
                  </span>

                </div>

                <div class="lead-phase6-reasons">

                  <strong>
                    Why GLIME flagged it
                  </strong>

                  ${
                    reasons.length
                      ? `
                        <ul>
                          ${reasons
                            .map(
                              (reason) => `
                                <li>
                                  ${escapeHtml(
                                    reason.observation ||
                                      reason.field ||
                                      String(
                                        reason
                                      )
                                  )}
                                </li>
                              `
                            )
                            .join("")}
                        </ul>
                      `
                      : `
                        <p>
                          No match evidence available.
                        </p>
                      `
                  }

                </div>

                ${
                  row.status ===
                  "pending"
                    ? `
                      <div class="lead-phase6-actions">

                        <button
                          class="ghost-btn lead-phase6-reject"
                          data-dup-action="reject"
                          data-dup-id="${escapeHtml(
                            row.id
                          )}"
                        >
                          Reject
                        </button>

                        <button
                          class="primary-btn lead-phase6-confirm"
                          data-dup-action="confirm"
                          data-dup-id="${escapeHtml(
                            row.id
                          )}"
                        >
                          Confirm duplicate
                        </button>

                      </div>
                    `
                    : `
                      <div class="lead-phase6-reviewed">
                        Reviewed
                        ${
                          row.reviewed_at
                            ? new Date(
                                row.reviewed_at
                              ).toLocaleString(
                                "en-IN"
                              )
                            : ""
                        }
                      </div>
                    `
                }

              </article>
            `;
          })
          .join("")
      : `
          <div class="lead-phase6-empty">

            <strong>
              No possible duplicates found.
            </strong>

            <span>
              GLIME will only flag matches when
              there is enough identity evidence.
            </span>

          </div>
        `;

    section.innerHTML = `
      <div class="lead-phase6-header">

        <div>

          <h3>
            Duplicate Detection
          </h3>

          <p>
            Possible duplicate leads are surfaced
            for human review. GLIME never merges
            or deletes a lead automatically.
          </p>

        </div>

        <span class="lead-phase6-count">
          ${pending.length}
        </span>

      </div>

      <button
        id="runLeadDuplicateCheck"
        class="primary-btn lead-phase6-run"
      >
        Check for duplicates
      </button>

      <div class="lead-phase6-results">
        ${cards}
      </div>
    `;

    return section;
  }

  /* =========================================================
     RENDER PHASE 6
     ========================================================= */

  async function renderPhase6(
    leadId
  ) {
    if (!leadId || rendering) {
      return;
    }

    const detailContent =
      document.getElementById(
        "detailContent"
      );

    if (!detailContent) {
      return;
    }

    rendering = true;

    try {
      const [
        leadResult,
        duplicateResult
      ] = await Promise.all([
        loadLead(leadId),
        loadDuplicates(leadId)
      ]);

      if (
        activeLeadId !== leadId
      ) {
        return;
      }

      const existing =
        document.getElementById(
          "leadDuplicatesPhase6"
        );

      if (existing) {
        existing.remove();
      }

      if (duplicateResult.error) {
        console.warn(
          "[GLIME Lead Duplicates]",
          duplicateResult.error
        );
      }

      const section =
        renderDuplicateSection(
          leadId,
          duplicateResult
        );

      const sourceSection =
        document.getElementById(
          "leadSourcesPhase5"
        );

      const timelineBox =
        document.getElementById(
          "timelineBox"
        );

      if (
        sourceSection?.parentNode
      ) {
        sourceSection.parentNode.insertBefore(
          section,
          sourceSection
        );
      } else if (
        timelineBox?.parentNode
      ) {
        timelineBox.parentNode.insertBefore(
          section,
          timelineBox
        );
      } else {
        detailContent.appendChild(
          section
        );
      }

      const runButton =
        section.querySelector(
          "#runLeadDuplicateCheck"
        );

      runButton?.addEventListener(
        "click",
        async () => {
          runButton.disabled =
            true;

          runButton.textContent =
            "Checking…";

          try {
            const result =
              await runDetection(
                leadId
              );

            const latest =
              await loadDuplicates(
                leadId
              );

            if (
              activeLeadId ===
              leadId
            ) {
              const replacement =
                renderDuplicateSection(
                  leadId,
                  latest
                );

              section.replaceWith(
                replacement
              );

              attachActions(
                replacement,
                leadId
              );

              const newButton =
                replacement.querySelector(
                  "#runLeadDuplicateCheck"
                );

              if (newButton) {
                newButton.textContent =
                  result?.matches_found
                    ? `Checked — ${result.matches_found} possible duplicate(s)`
                    : "Checked — no possible duplicates";
              }
            }
          } catch (error) {
            console.error(
              "[GLIME Lead Duplicates]",
              error
            );

            runButton.disabled =
              false;

            runButton.textContent =
              "Check for duplicates";

            alert(
              error.message ||
                "Duplicate detection failed."
            );
          }
        }
      );

      attachActions(
        section,
        leadId
      );

    } finally {
      rendering = false;
    }
  }

  /* =========================================================
     CONFIRM / REJECT BUTTONS
     ========================================================= */

  function attachActions(
    section,
    leadId
  ) {
    section
      .querySelectorAll(
        "[data-dup-action]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            const id =
              button.getAttribute(
                "data-dup-id"
              );

            const action =
              button.getAttribute(
                "data-dup-action"
              );

            if (!id || !action) {
              return;
            }

            button.disabled =
              true;

            try {
              await reviewDuplicate(
                id,
                action === "confirm"
                  ? "confirmed"
                  : "rejected"
              );

              // Re-render after review.
              // This keeps the UI in sync.
              await renderPhase6(
                leadId
              );

            } catch (error) {

              console.error(
                "[GLIME Lead Duplicates] review error:",
                error
              );

              button.disabled =
                false;

              alert(
                error.message ||
                  "Unable to save duplicate review."
              );
            }
          }
        );
      });
  }

  /* =========================================================
     DETECT LEAD DETAIL OPEN
     ========================================================= */

  document.addEventListener(
    "click",
    (event) => {

      const openButton =
        event.target.closest(
          "[data-open]"
        );

      if (openButton) {

        activeLeadId =
          openButton.getAttribute(
            "data-open"
          );

        setTimeout(
          () =>
            renderPhase6(
              activeLeadId
            ),
          120
        );
      }

      const closeButton =
        event.target.closest(
          "[data-close]"
        );

      if (closeButton) {
        activeLeadId = null;
      }
    },
    true
  );

  /* =========================================================
     WATCH DETAIL CONTENT
     ========================================================= */

  const observer =
    new MutationObserver(
      () => {

        if (!activeLeadId) {
          return;
        }

        const detailContent =
          document.getElementById(
            "detailContent"
          );

        if (!detailContent) {
          return;
        }

        if (
          !document.getElementById(
            "leadDuplicatesPhase6"
          )
        ) {

          setTimeout(
            () =>
              renderPhase6(
                activeLeadId
              ),
            80
          );
        }
      }
    );

  /* =========================================================
     START OBSERVER
     ========================================================= */

  function startObserver() {

    const detailContent =
      document.getElementById(
        "detailContent"
      );

    if (!detailContent) {

      setTimeout(
        startObserver,
        250
      );

      return;
    }

    observer.observe(
      detailContent,
      {
        childList: true,
        subtree: true
      }
    );
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.GLIMELeadDuplicates = {

    refresh() {
      if (activeLeadId) {
        renderPhase6(
          activeLeadId
        );
      }
    },

    getActiveLeadId() {
      return activeLeadId;
    }

  };

  /* =========================================================
     INIT
     ========================================================= */

  startObserver();

  console.log(
    "[GLIME Lead Duplicates] Phase 6 addon loaded."
  );

})();
