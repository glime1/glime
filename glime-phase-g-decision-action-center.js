/* GLIME Phase G — Decision / Action Center
   Additive dashboard module.
   No GLIME CARE changes.
*/

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  // --------------------------------------------------
  // SUPABASE CLIENT
  // --------------------------------------------------

  const sb =
    window.supabaseClient ||
    (
      window.supabase?.createClient
        ? (
            window.__glimePhaseGSupabase ||=
              window.supabase.createClient(
                SUPABASE_URL,
                SUPABASE_KEY
              )
          )
        : null
    );

  if (!sb) {
    console.warn(
      "[GLIME Phase G] Supabase client not found."
    );
    return;
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const pretty = (value) => {
    if (value === null || value === undefined) {
      return "—";
    }

    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  };

  const rpc = async (name, args = {}) => {
    const { data, error } = await sb.rpc(
      name,
      args
    );

    if (error) {
      throw error;
    }

    return data;
  };

  const badge = (status) => {
    const safeStatus =
      String(status || "unknown")
        .toLowerCase()
        .replace(/\s+/g, "_");

    return `
      <span class="gG-badge gG-${esc(safeStatus)}">
        ${esc(safeStatus.replace(/_/g, " "))}
      </span>
    `;
  };

  // --------------------------------------------------
  // STYLES
  // --------------------------------------------------

  function injectStyles() {
    if (
      document.getElementById(
        "glime-phase-g-style"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "glime-phase-g-style";

    style.textContent = `
      .gG-card {
        margin: 20px 0;
        padding: 22px;
        border: 1px solid rgba(120,120,120,.18);
        border-radius: 18px;
        background: var(--card-bg, #fff);
        box-shadow: 0 8px 30px rgba(0,0,0,.06);
      }

      .gG-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .gG-title {
        font-size: 20px;
        font-weight: 700;
      }

      .gG-sub {
        margin-top: 4px;
        font-size: 13px;
        opacity: .68;
      }

      .gG-list {
        display: grid;
        gap: 14px;
        margin-top: 18px;
      }

      .gG-item {
        padding: 16px;
        border: 1px solid rgba(120,120,120,.16);
        border-radius: 15px;
      }

      .gG-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .gG-section {
        margin-top: 11px;
      }

      .gG-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .04em;
        opacity: .55;
      }

      .gG-text {
        margin-top: 3px;
        line-height: 1.45;
      }

      .gG-pre {
        margin-top: 4px;
        padding: 10px;
        border-radius: 9px;
        background: rgba(120,120,120,.07);
        white-space: pre-wrap;
        overflow: auto;
        font-size: 12px;
      }

      .gG-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 14px;
      }

      .gG-btn {
        border: 0;
        border-radius: 10px;
        padding: 9px 13px;
        cursor: pointer;
        font-weight: 600;
      }

      .gG-btn:disabled {
        opacity: .55;
        cursor: not-allowed;
      }

      .gG-primary {
        background: #111;
        color: #fff;
      }

      .gG-danger {
        background: #eee;
        color: #111;
      }

      .gG-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        background: rgba(120,120,120,.12);
      }

      .gG-proposed {
        background: rgba(245,166,35,.15);
      }

      .gG-approved,
      .gG-queued,
      .gG-running {
        background: rgba(52,152,219,.14);
      }

      .gG-completed {
        background: rgba(46,204,113,.15);
      }

      .gG-failed,
      .gG-rejected {
        background: rgba(231,76,60,.14);
      }

      .gG-msg {
        margin-top: 10px;
        font-size: 13px;
        opacity: .68;
      }
    `;

    document.head.appendChild(style);
  }

  // --------------------------------------------------
  // LOAD DECISIONS
  // --------------------------------------------------

  async function loadDecisions() {
    const card =
      document.getElementById(
        "glime-phase-g-card"
      );

    if (!card) {
      return;
    }

    const list =
      card.querySelector(
        ".gG-list"
      );

    list.innerHTML =
      `<div class="gG-msg">
        Loading decisions…
      </div>`;

    // ------------------------------------------------
    // CLIENT-SCOPED DECISIONS
    // RLS protects client isolation.
    // ------------------------------------------------

    const {
      data: decisions,
      error: decisionError
    } = await sb
      .from("client_business_decisions")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(10);

    if (decisionError) {
      throw decisionError;
    }

    const rows =
      decisions || [];

    if (!rows.length) {
      list.innerHTML =
        `<div class="gG-msg">
          No business decisions available yet.
        </div>`;

      return;
    }

    // ------------------------------------------------
    // LOAD ACTION REQUESTS
    // ------------------------------------------------

    const {
      data: requests,
      error: requestError
    } = await sb
      .from("client_action_requests")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(50);

    if (requestError) {
      throw requestError;
    }

    const requestRows =
      requests || [];

    // ------------------------------------------------
    // FIND REQUEST LINKED TO DECISION
    // ------------------------------------------------

    const linkedRequest =
      (decisionId) =>
        requestRows.find(
          (request) =>
            request.action_payload &&
            request.action_payload.decision_id ===
              decisionId
        );

    // ------------------------------------------------
    // RENDER
    // ------------------------------------------------

    list.innerHTML =
      rows
        .map((decision) => {

          const request =
            linkedRequest(
              decision.id
            );

          const nextBestAction =
            decision.next_best_action ||
            {};

          return `
            <article
              class="gG-item"
              data-decision-id="${esc(
                decision.id
              )}"
            >

              <div class="gG-row">

                <div>

                  <div class="gG-title">
                    ${esc(
                      decision.title ||
                      "Business Decision"
                    )}
                  </div>

                  <div class="gG-sub">
                    Confidence:
                    ${esc(
                      decision.confidence ??
                      "—"
                    )}

                    · Source:
                    ${esc(
                      decision.source ||
                      "—"
                    )}
                  </div>

                </div>

                ${badge(
                  decision.status
                )}

              </div>


              <!-- PROBLEM -->

              <div class="gG-section">

                <div class="gG-label">
                  Problem
                </div>

                <div class="gG-text">
                  ${esc(
                    decision.problem ||
                    "—"
                  )}
                </div>

              </div>


              <!-- ROOT CAUSE -->

              <div class="gG-section">

                <div class="gG-label">
                  Why / Root Cause
                </div>

                <div class="gG-text">
                  ${esc(
                    decision.root_cause ||
                    "—"
                  )}
                </div>

              </div>


              <!-- RECOMMENDATION -->

              <div class="gG-section">

                <div class="gG-label">
                  Recommendation
                </div>

                <div class="gG-text">
                  ${esc(
                    decision.recommendation ||
                    "—"
                  )}
                </div>

              </div>


              <!-- NEXT BEST ACTION -->

              <div class="gG-section">

                <div class="gG-label">
                  Next Best Action
                </div>

                <div class="gG-pre">
                  ${esc(
                    pretty(
                      nextBestAction
                    )
                  )}
                </div>

              </div>


              <!-- EXISTING ACTION PROPOSAL -->

              ${
                request
                  ? `
                    <div class="gG-section">

                      <div class="gG-label">
                        Action Proposal
                      </div>

                      <div class="gG-text">

                        ${esc(
                          request.module ||
                          request.agent ||
                          "Specialist"
                        )}

                        ·

                        ${esc(
                          request.action_type ||
                          request.action ||
                          "action"
                        )}

                        ${badge(
                          request.status
                        )}

                      </div>

                    </div>
                  `
                  : ""
              }


              <!-- ACTION BUTTONS -->

              <div class="gG-actions">

                ${
                  !request
                    ? `
                      <button
                        class="gG-btn gG-primary gG-prepare"
                      >
                        Prepare Action
                      </button>
                    `
                    : ""
                }


                ${
                  request &&
                  [
                    "proposed",
                    "awaiting_approval"
                  ].includes(
                    request.status
                  )
                    ? `

                      <button
                        class="gG-btn gG-primary gG-approve"
                        data-request-id="${esc(
                          request.id
                        )}"
                      >
                        Approve & Queue
                      </button>

                      <button
                        class="gG-btn gG-danger gG-reject"
                        data-request-id="${esc(
                          request.id
                        )}"
                      >
                        Reject
                      </button>

                    `
                    : ""
                }

              </div>


              <div class="gG-msg"></div>

            </article>
          `;
        })
        .join("");

    // ------------------------------------------------
    // BUTTON HANDLERS
    // ------------------------------------------------

    rows.forEach(
      (decision) => {

        const item =
          card.querySelector(
            `[data-decision-id="${CSS.escape(
              decision.id
            )}"]`
          );

        if (!item) {
          return;
        }

        const message =
          item.querySelector(
            ".gG-msg"
          );


        // --------------------------------------------
        // PREPARE ACTION
        // --------------------------------------------

        const prepareButton =
          item.querySelector(
            ".gG-prepare"
          );

        if (prepareButton) {

          prepareButton.onclick =
            async () => {

              prepareButton.disabled =
                true;

              message.textContent =
                "Checking capability and preparing proposal…";

              try {

                const result =
                  await rpc(
                    "create_client_decision_action_proposal",
                    {
                      p_decision_id:
                        decision.id
                    }
                  );

                if (
                  result &&
                  result.proposal_created
                ) {

                  message.textContent =
                    "Action proposal created. Client approval is still required.";

                } else {

                  const reason =
                    result?.evaluation?.reason ||
                    "No enabled specialist action is available.";

                  message.textContent =
                    `No action proposal created: ${reason}`;

                }

                await loadDecisions();

              } catch (error) {

                message.textContent =
                  `Could not prepare action: ${
                    error.message ||
                    error
                  }`;

                prepareButton.disabled =
                  false;
              }
            };
        }


        // --------------------------------------------
        // APPROVE & QUEUE
        // --------------------------------------------

        const approveButton =
          item.querySelector(
            ".gG-approve"
          );

        if (approveButton) {

          approveButton.onclick =
            async () => {

              approveButton.disabled =
                true;

              message.textContent =
                "Approving and queueing…";

              try {

                const result =
                  await rpc(
                    "approve_client_business_action",
                    {
                      p_action_request_id:
                        approveButton.dataset
                          .requestId
                    }
                  );

                message.textContent =
                  `Queued successfully. Job: ${
                    result?.job_id ||
                    "created"
                  }`;

                await loadDecisions();

              } catch (error) {

                message.textContent =
                  `Approval failed: ${
                    error.message ||
                    error
                  }`;

                approveButton.disabled =
                  false;
              }
            };
        }


        // --------------------------------------------
        // REJECT
        // --------------------------------------------

        const rejectButton =
          item.querySelector(
            ".gG-reject"
          );

        if (rejectButton) {

          rejectButton.onclick =
            async () => {

              rejectButton.disabled =
                true;

              message.textContent =
                "Rejecting proposal…";

              try {

                await rpc(
                  "reject_client_business_action",
                  {
                    p_action_request_id:
                      rejectButton.dataset
                        .requestId
                  }
                );

                message.textContent =
                  "Action proposal rejected. No execution job was created.";

                await loadDecisions();

              } catch (error) {

                message.textContent =
                  `Reject failed: ${
                    error.message ||
                    error
                  }`;

                rejectButton.disabled =
                  false;
              }
            };
        }

      }
    );
  }

  // --------------------------------------------------
  // INITIALIZE DASHBOARD CARD
  // --------------------------------------------------

  async function init() {

    injectStyles();

    const anchor =
      document.querySelector(
        ".progress-card"
      ) ||
      document.querySelector(
        "main"
      ) ||
      document.body;

    if (!anchor) {
      return;
    }

    // Prevent duplicate card
    if (
      document.getElementById(
        "glime-phase-g-card"
      )
    ) {
      return;
    }

    const card =
      document.createElement(
        "section"
      );

    card.id =
      "glime-phase-g-card";

    card.className =
      "gG-card";

    card.innerHTML = `

      <div class="gG-head">

        <div>

          <div class="gG-title">
            🧠 GLIME Decision / Action Center
          </div>

          <div class="gG-sub">
            Problem → Root Cause →
            Recommendation →
            Next Best Action →
            Approval → Execution
          </div>

        </div>

        <button
          class="gG-btn gG-primary gG-refresh"
        >
          Refresh
        </button>

      </div>

      <div class="gG-list"></div>

    `;

    anchor.parentNode.insertBefore(
      card,
      anchor
    );

    card
      .querySelector(
        ".gG-refresh"
      )
      .onclick = () =>
        loadDecisions()
          .catch(console.error);

    await loadDecisions();
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
      () =>
        init().catch(
          console.error
        ),
      {
        once: true
      }
    );

  } else {

    init().catch(
      console.error
    );
  }

})();
