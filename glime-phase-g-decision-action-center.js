/* GLIME Phase G — Decision / Action Center v2
   Uses secure unified RPC for client-scoped lifecycle + impact.
   No GLIME CARE changes.
*/

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  // ==================================================
  // SUPABASE CLIENT
  // ==================================================

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

  // ==================================================
  // HELPERS
  // ==================================================

  const esc = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  const pretty = (value) => {
    if (
      value === null ||
      value === undefined
    ) {
      return "—";
    }

    if (
      typeof value === "object"
    ) {
      return JSON.stringify(
        value,
        null,
        2
      );
    }

    return String(value);
  };

  const rpc = async (
    functionName,
    args = {}
  ) => {

    const {
      data,
      error
    } = await sb.rpc(
      functionName,
      args
    );

    if (error) {
      throw error;
    }

    return data;
  };

  const badge = (status) => {

    const safeStatus =
      String(
        status ||
        "unknown"
      )
        .toLowerCase()
        .replace(
          /\s+/g,
          "_"
        );

    return `
      <span
        class="gG2-badge gG2-${esc(
          safeStatus
        )}"
      >
        ${esc(
          safeStatus.replace(
            /_/g,
            " "
          )
        )}
      </span>
    `;
  };

  // ==================================================
  // STYLES
  // ==================================================

  function injectStyles() {

    if (
      document.getElementById(
        "glime-phase-g2-style"
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "glime-phase-g2-style";

    style.textContent = `

      .gG2-card {
        margin: 20px 0;
        padding: 22px;
        border: 1px solid
          rgba(120,120,120,.18);
        border-radius: 18px;
        background:
          var(--card-bg,#fff);
        box-shadow:
          0 8px 30px
          rgba(0,0,0,.06);
      }

      .gG2-head {
        display:flex;
        justify-content:
          space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
      }

      .gG2-title {
        font-size:20px;
        font-weight:700;
      }

      .gG2-sub {
        margin-top:4px;
        font-size:13px;
        opacity:.68;
      }

      .gG2-list {
        display:grid;
        gap:14px;
        margin-top:18px;
      }

      .gG2-item {
        padding:16px;
        border:1px solid
          rgba(120,120,120,.16);
        border-radius:15px;
      }

      .gG2-row {
        display:flex;
        justify-content:
          space-between;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }

      .gG2-section {
        margin-top:11px;
      }

      .gG2-label {
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.04em;
        opacity:.55;
      }

      .gG2-text {
        margin-top:3px;
        line-height:1.45;
      }

      .gG2-pre {
        margin-top:4px;
        padding:10px;
        border-radius:9px;
        background:
          rgba(120,120,120,.07);
        white-space:pre-wrap;
        overflow:auto;
        font-size:12px;
      }

      .gG2-actions {
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:14px;
      }

      .gG2-btn {
        border:0;
        border-radius:10px;
        padding:9px 13px;
        cursor:pointer;
        font-weight:600;
      }

      .gG2-btn:disabled {
        opacity:.55;
        cursor:not-allowed;
      }

      .gG2-primary {
        background:#111;
        color:#fff;
      }

      .gG2-danger {
        background:#eee;
        color:#111;
      }

      .gG2-badge {
        display:inline-block;
        padding:4px 8px;
        border-radius:999px;
        font-size:11px;
        font-weight:700;
        background:
          rgba(120,120,120,.12);
      }

      .gG2-proposed {
        background:
          rgba(245,166,35,.15);
      }

      .gG2-approved,
      .gG2-queued,
      .gG2-running {
        background:
          rgba(52,152,219,.14);
      }

      .gG2-completed {
        background:
          rgba(46,204,113,.15);
      }

      .gG2-failed,
      .gG2-rejected {
        background:
          rgba(231,76,60,.14);
      }

      .gG2-life {
        display:flex;
        gap:5px;
        flex-wrap:wrap;
        align-items:center;
        margin-top:10px;
      }

      .gG2-arrow {
        opacity:.4;
      }

      .gG2-impact {
        padding:10px;
        border-radius:10px;
        background:
          rgba(120,120,120,.07);
      }

      .gG2-msg {
        margin-top:10px;
        font-size:13px;
        opacity:.68;
      }

    `;

    document.head.appendChild(
      style
    );
  }

  // ==================================================
  // LIFECYCLE
  // ==================================================

  function renderLifecycle(
    row
  ) {

    const states = [

      [
        "proposal",
        row.action_request_id
          ? (
              row.action_status ||
              "created"
            )
          : "pending"
      ],

      [
        "approval",
        row.action_request_id
          ? (
              row.action_status ||
              "pending"
            )
          : "pending"
      ],

      [
        "execution",
        row.execution_job_id
          ? (
              row.execution_status ||
              "created"
            )
          : "pending"
      ],

      [
        "impact",
        row.impact_id
          ? (
              row.impact_status ||
              "pending"
            )
          : "pending"
      ]

    ];

    return `
      <div class="gG2-life">

        ${
          states
            .map(
              (state, index) => {

                return `
                  ${
                    index
                      ? `
                        <span
                          class="gG2-arrow"
                        >
                          →
                        </span>
                      `
                      : ""
                  }

                  <span>
                    ${esc(
                      state[0]
                    )}:

                    ${badge(
                      state[1]
                    )}
                  </span>
                `;
              }
            )
            .join("")
        }

      </div>
    `;
  }

  // ==================================================
  // LOAD
  // ==================================================

  async function load() {

    const card =
      document.getElementById(
        "glime-phase-g2-card"
      );

    if (!card) {
      return;
    }

    const list =
      card.querySelector(
        ".gG2-list"
      );

    list.innerHTML = `
      <div class="gG2-msg">
        Loading decision lifecycle…
      </div>
    `;

    // -----------------------------------------------
    // SECURE UNIFIED RPC
    // -----------------------------------------------

    const rows =
      await rpc(
        "get_client_decision_action_center"
      );

    if (
      !Array.isArray(rows) ||
      !rows.length
    ) {

      list.innerHTML = `
        <div class="gG2-msg">
          No business decisions available yet.
        </div>
      `;

      return;
    }

    // -----------------------------------------------
    // RENDER DECISIONS
    // -----------------------------------------------

    list.innerHTML =
      rows
        .map(
          (row) => {

            const impact =
              row.metric_deltas ||
              null;

            const hasImpact =
              row.impact_id ||
              row.impact_status;

            return `

              <article
                class="gG2-item"
                data-decision-id="${esc(
                  row.decision_id
                )}"
              >

                <!-- HEADER -->

                <div class="gG2-row">

                  <div>

                    <div class="gG2-title">
                      ${esc(
                        row.title ||
                        "Business Decision"
                      )}
                    </div>

                    <div class="gG2-sub">

                      Confidence:
                      ${esc(
                        row.confidence ??
                        "—"
                      )}

                      · Source:

                      ${esc(
                        row.source ||
                        "—"
                      )}

                    </div>

                  </div>

                  ${badge(
                    row.decision_status
                  )}

                </div>


                <!-- LIFECYCLE -->

                ${renderLifecycle(
                  row
                )}


                <!-- PROBLEM -->

                <div class="gG2-section">

                  <div class="gG2-label">
                    Problem
                  </div>

                  <div class="gG2-text">
                    ${esc(
                      row.problem ||
                      "—"
                    )}
                  </div>

                </div>


                <!-- ROOT CAUSE -->

                <div class="gG2-section">

                  <div class="gG2-label">
                    Root Cause
                  </div>

                  <div class="gG2-text">
                    ${esc(
                      row.root_cause ||
                      "—"
                    )}
                  </div>

                </div>


                <!-- RECOMMENDATION -->

                <div class="gG2-section">

                  <div class="gG2-label">
                    Recommendation
                  </div>

                  <div class="gG2-text">
                    ${esc(
                      row.recommendation ||
                      "—"
                    )}
                  </div>

                </div>


                <!-- NEXT BEST ACTION -->

                <div class="gG2-section">

                  <div class="gG2-label">
                    Next Best Action
                  </div>

                  <div class="gG2-pre">
                    ${esc(
                      pretty(
                        row.next_best_action
                      )
                    )}
                  </div>

                </div>


                <!-- ACTION -->

                ${
                  row.action_request_id
                    ? `

                      <div
                        class="gG2-section"
                      >

                        <div
                          class="gG2-label"
                        >
                          Action
                        </div>

                        <div
                          class="gG2-text"
                        >

                          ${esc(
                            row.target_module_slug ||
                            "Specialist"
                          )}

                          ·

                          ${esc(
                            row.target_action ||
                            "action"
                          )}

                          ${badge(
                            row.action_status
                          )}

                          ${
                            row.approval_required
                              ? " · Approval required"
                              : ""
                          }

                        </div>

                      </div>

                    `
                    : ""
                }


                <!-- EXECUTION -->

                ${
                  row.execution_job_id
                    ? `

                      <div
                        class="gG2-section"
                      >

                        <div
                          class="gG2-label"
                        >
                          Execution
                        </div>

                        <div
                          class="gG2-text"
                        >

                          ${badge(
                            row.execution_status
                          )}

                          ${
                            row.error_code
                              ? `
                                · ${esc(
                                  row.error_code
                                )}
                              `
                              : ""
                          }

                          ${
                            row.error_message
                              ? `
                                · ${esc(
                                  row.error_message
                                )}
                              `
                              : ""
                          }

                        </div>

                      </div>

                    `
                    : ""
                }


                <!-- IMPACT -->

                ${
                  hasImpact
                    ? `

                      <div
                        class="gG2-section"
                      >

                        <div
                          class="gG2-label"
                        >
                          Impact Analysis
                        </div>

                        <div
                          class="gG2-impact"
                        >

                          ${badge(
                            row.impact_status ||
                            "pending"
                          )}

                          <div
                            class="gG2-text"
                          >
                            ${esc(
                              row.impact_summary ||
                              "Impact measurement is pending."
                            )}
                          </div>

                          ${
                            row.impact_status === "pending" && row.observation_until
                              ? `
                                <div class="gG2-msg">
                                  Observation window:
                                  ${esc(
                                    new Date(row.observation_until).toLocaleString()
                                  )}
                                </div>
                              `
                              : ""
                          }

                          ${
                            row.selected_metrics &&
                            Array.isArray(row.selected_metrics) &&
                            row.selected_metrics.length
                              ? `
                                <div class="gG2-msg">
                                  Metrics:
                                  ${esc(
                                    row.selected_metrics.join(", ")
                                  )}
                                </div>
                              `
                              : ""
                          }

                          ${
                            impact
                              ? `
                                <div
                                  class="gG2-pre"
                                >
                                  ${esc(
                                    pretty(
                                      impact
                                    )
                                  )}
                                </div>
                              `
                              : ""
                          }

                        </div>

                      </div>

                    `
                    : ""
                }


                <!-- BUTTONS -->

                <div
                  class="gG2-actions"
                >

                  ${
                    !row.action_request_id
                      ? `

                        <button
                          class="gG2-btn gG2-primary gG2-prepare"
                        >
                          Prepare Action
                        </button>

                      `
                      : ""
                  }


                  ${
                    row.action_request_id &&
                    [
                      "proposed",
                      "awaiting_approval"
                    ].includes(
                      row.action_status
                    )
                      ? `

                        <button
                          class="gG2-btn gG2-primary gG2-edit"
                          data-request-id="${esc(
                            row.action_request_id
                          )}"
                        >
                          Edit Proposal
                        </button>

                        <button
                          class="gG2-btn gG2-primary gG2-approve"
                          data-request-id="${esc(
                            row.action_request_id
                          )}"
                        >
                          Approve & Queue
                        </button>

                        <button
                          class="gG2-btn gG2-danger gG2-reject"
                          data-request-id="${esc(
                            row.action_request_id
                          )}"
                        >
                          Reject
                        </button>

                      `
                      : ""
                  }

                </div>


                <div
                  class="gG2-msg"
                ></div>

              </article>

            `;
          }
        )
        .join("");


    // =================================================
    // BUTTON HANDLERS
    // =================================================

    rows.forEach(
      (row) => {

        const item =
          card.querySelector(
            `[data-decision-id="${CSS.escape(
              row.decision_id
            )}"]`
          );

        if (!item) {
          return;
        }

        const message =
          item.querySelector(
            ".gG2-msg"
          );


        // =============================================
        // PREPARE ACTION
        // =============================================

        const prepare =
          item.querySelector(
            ".gG2-prepare"
          );

        if (prepare) {

          prepare.onclick =
            async () => {

              prepare.disabled =
                true;

              message.textContent =
                "Checking capability and preparing proposal…";

              try {

                const result =
                  await rpc(
                    "create_client_decision_action_proposal",
                    {
                      p_decision_id:
                        row.decision_id
                    }
                  );

                if (
                  result &&
                  result.proposal_created
                ) {

                  message.textContent =
                    "Action proposal created. Client approval is still required.";

                } else {

                  message.textContent =
                    `No action proposal created: ${
                      result?.evaluation?.reason ||
                      "No enabled specialist action is available."
                    }`;
                }

                await load();

              } catch (
                error
              ) {

                message.textContent =
                  `Could not prepare action: ${
                    error.message ||
                    error
                  }`;

                prepare.disabled =
                  false;
              }
            };
        }


        // =============================================
        // EDIT PROPOSAL
        // =============================================

        const edit =
          item.querySelector(
            ".gG2-edit"
          );

        if (edit) {

          edit.onclick =
            async () => {

              edit.disabled = true;

              message.textContent =
                "Opening editable proposal fields…";

              try {

                const current =
                  row.action_payload || {};

                const editable =
                  current?.contract?.editable_fields || [];

                if (!editable.length) {
                  throw new Error(
                    "No editable proposal fields are available."
                  );
                }

                const patch = {};

                if (
                  editable.includes("message")
                ) {

                  const value =
                    window.prompt(
                      "Edit proposed message:",
                      current.message || ""
                    );

                  if (value === null) {
                    return;
                  }

                  patch.message = value;
                }

                if (
                  editable.includes(
                    "target_reference"
                  )
                ) {

                  const value =
                    window.prompt(
                      "Edit target reference:",
                      current.target_reference || ""
                    );

                  if (value === null) {
                    return;
                  }

                  patch.target_reference = value;
                }

                if (
                  editable.includes(
                    "scheduled_for"
                  )
                ) {

                  const value =
                    window.prompt(
                      "Edit scheduled time (ISO format):",
                      current.scheduled_for || ""
                    );

                  if (value === null) {
                    return;
                  }

                  if (value.trim()) {
                    patch.scheduled_for =
                      value.trim();
                  }
                }

                if (
                  !Object.keys(patch).length
                ) {

                  message.textContent =
                    "No proposal changes made.";

                  return;
                }

                await rpc(
                  "update_client_action_proposal",
                  {
                    p_action_request_id:
                      edit.dataset.requestId,

                    p_changes:
                      patch
                  }
                );

                message.textContent =
                  "Proposal updated. Client approval is still required.";

                await load();

              } catch (
                error
              ) {

                message.textContent =
                  `Could not update proposal: ${
                    error.message ||
                    error
                  }`;

              } finally {

                edit.disabled =
                  false;
              }
            };
        }


        // =============================================
        // APPROVE & QUEUE
        // =============================================

        const approve =
          item.querySelector(
            ".gG2-approve"
          );

        if (approve) {

          approve.onclick =
            async () => {

              approve.disabled =
                true;

              message.textContent =
                "Approving and queueing…";

              try {

                const result =
                  await rpc(
                    "approve_client_business_action",
                    {
                      p_action_request_id:
                        approve.dataset
                          .requestId
                    }
                  );

                message.textContent =
                  `Queued successfully. Job: ${
                    result?.job_id ||
                    "created"
                  }`;

                await load();

              } catch (
                error
              ) {

                message.textContent =
                  `Approval failed: ${
                    error.message ||
                    error
                  }`;

                approve.disabled =
                  false;
              }
            };
        }


        // =============================================
        // REJECT
        // =============================================

        const reject =
          item.querySelector(
            ".gG2-reject"
          );

        if (reject) {

          reject.onclick =
            async () => {

              reject.disabled =
                true;

              message.textContent =
                "Rejecting proposal…";

              try {

                await rpc(
                  "reject_client_business_action",
                  {
                    p_action_request_id:
                      reject.dataset
                        .requestId
                  }
                );

                message.textContent =
                  "Action proposal rejected. No execution job was created.";

                await load();

              } catch (
                error
              ) {

                message.textContent =
                  `Reject failed: ${
                    error.message ||
                    error
                  }`;

                reject.disabled =
                  false;
              }
            };
        }

      }
    );
  }

  // ==================================================
  // INITIALIZE
  // ==================================================

  async function init() {

    injectStyles();

    // Remove previous versions
    document
      .getElementById(
        "glime-phase-g-card"
      )
      ?.remove();

    document
      .getElementById(
        "glime-phase-g2-card"
      )
      ?.remove();


    const anchor =
      document.querySelector(
        ".progress-card"
      ) ||
      document.querySelector(
        "main"
      ) ||
      document.body;

    if (
      !anchor ||
      !anchor.parentNode
    ) {
      return;
    }


    const card =
      document.createElement(
        "section"
      );

    card.id =
      "glime-phase-g2-card";

    card.className =
      "gG2-card";


    card.innerHTML = `

      <div
        class="gG2-head"
      >

        <div>

          <div
            class="gG2-title"
          >
            🧠 GLIME Decision /
            Action Center
          </div>

          <div
            class="gG2-sub"
          >
            Decision →
            Proposal →
            Approval →
            Execution →
            Impact
          </div>

        </div>


        <button
          class="gG2-btn gG2-primary gG2-refresh"
        >
          Refresh
        </button>

      </div>


      <div
        class="gG2-list"
      ></div>

    `;


    anchor.parentNode.insertBefore(
      card,
      anchor
    );


    card
      .querySelector(
        ".gG2-refresh"
      )
      .onclick =
      () =>
        load()
          .catch(
            console.error
          );


    await load();
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
