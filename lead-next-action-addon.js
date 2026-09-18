/* =========================================================
   GLIME — Lead Next Best Action
   Phase 7

   - Uses dedicated lead-next-best-action Edge Function
   - Uses existing lead_actions table
   - Human approval workflow
   - Does NOT send calls/messages
   - Does NOT modify leads.js
   - Does NOT touch GLIME CARE
========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!window.supabase) {
    console.error(
      "[GLIME Lead Action] Supabase client missing."
    );
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  let activeLeadId = null;
  let clientId = null;
  let rendering = false;


  /* =========================================================
     HELPERS
  ========================================================= */

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char])
    );
  }


  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString("en-IN");
  }


  function actionLabel(value) {
    return String(
      value || "review_lead"
    )
      .replaceAll("_", " ")
      .replace(
        /\b\w/g,
        (char) => char.toUpperCase()
      );
  }


  /* =========================================================
     CLIENT
  ========================================================= */

  async function getClientId() {

    if (clientId) {
      return clientId;
    }

    const {
      data: { user },
      error
    } = await db.auth.getUser();

    if (error || !user) {
      return null;
    }

    const {
      data,
      error: clientError
    } = await db
      .from("client_data")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (clientError) {
      console.error(
        "[GLIME Lead Action] Client lookup error:",
        clientError
      );

      return null;
    }

    clientId =
      data?.client_id || null;

    return clientId;
  }


  /* =========================================================
     LOAD ACTIONS
  ========================================================= */

  async function loadActions(leadId) {

    const cid =
      await getClientId();

    if (!cid) {
      return {
        rows: [],
        error: "Client not found."
      };
    }

    const {
      data,
      error
    } = await db
      .from("lead_actions")
      .select(
        `
        id,
        lead_id,
        action_type,
        status,
        reason,
        scheduled_for,
        completed_at,
        metadata,
        created_at,
        updated_at
        `
      )
      .eq("client_id", cid)
      .eq("lead_id", leadId)
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(10);

    return {
      rows: data || [],
      error
    };
  }


  /* =========================================================
     GENERATE NEXT BEST ACTION
  ========================================================= */

  async function recommend(leadId) {

    const {
      data,
      error
    } = await db.functions.invoke(
      "lead-next-best-action",
      {
        body: {
          lead_id: leadId
        }
      }
    );

    if (error) {
      throw new Error(
        error.message ||
          "Unable to generate next action."
      );
    }

    if (data?.error) {
      throw new Error(
        data.error
      );
    }

    return data;
  }


  /* =========================================================
     UPDATE ACTION STATUS
  ========================================================= */

  async function updateAction(
    actionId,
    status
  ) {

    const cid =
      await getClientId();

    if (!cid) {
      throw new Error(
        "Client not found."
      );
    }

    const patch = {
      status
    };

    if (
      status === "completed"
    ) {
      patch.completed_at =
        new Date().toISOString();
    }

    const {
      data,
      error
    } = await db
      .from("lead_actions")
      .update(patch)
      .eq("id", actionId)
      .eq("client_id", cid)
      .select("*")
      .single();

    if (error) {
      throw error;
    }


    /* =======================================================
       TIMELINE EVENT
    ======================================================= */

    await db
      .from("lead_timeline")
      .insert({

        client_id: cid,

        lead_id:
          activeLeadId,

        event_type:
          "lead_action_updated",

        title:
          `Next action ${status}`,

        description:
          `Recommended action was marked as ${status.replace(
            "_",
            " "
          )} by the user.`,

        source:
          "lead_action_engine",

        metadata: {
          action_id: actionId,
          status
        }

      });


    return data;
  }


  /* =========================================================
     RENDER SECTION
  ========================================================= */

  function renderSection(
    leadId,
    rows,
    message = ""
  ) {

    const section =
      document.createElement(
        "section"
      );

    section.id =
      "leadNextActionPhase7";

    section.className =
      "lead-phase7-section";


    const current =
      rows.find(
        (row) =>
          [
            "recommended",
            "approved",
            "in_progress"
          ].includes(
            row.status
          )
      ) || rows[0];


    const history =
      rows.filter(
        (row) =>
          row.id !==
          current?.id
      );


    section.innerHTML = `

      <div class="lead-phase7-header">

        <div>

          <h3>
            Next Best Action
          </h3>

          <p>
            GLIME recommends the next business
            step from the lead's current status,
            intelligence, follow-up and
            duplicate evidence.
          </p>

        </div>

      </div>


      <div class="lead-phase7-current">

        ${
          current
            ? `

              <div class="lead-phase7-top">

                <div>

                  <span class="lead-phase7-label">
                    Recommended action
                  </span>

                  <strong>
                    ${escapeHtml(
                      actionLabel(
                        current.action_type
                      )
                    )}
                  </strong>

                </div>


                <span
                  class="
                    lead-phase7-status
                    lead-phase7-status-${escapeHtml(
                      current.status
                    )}
                  "
                >

                  ${escapeHtml(
                    current.status
                  )}

                </span>

              </div>


              <p class="lead-phase7-reason">

                ${escapeHtml(
                  current.reason ||
                    "No reason recorded."
                )}

              </p>


              <div class="lead-phase7-meta">

                <span>

                  <b>
                    Scheduled:
                  </b>

                  ${escapeHtml(
                    formatDate(
                      current.scheduled_for
                    )
                  )}

                </span>


                <span>

                  <b>
                    Created:
                  </b>

                  ${escapeHtml(
                    formatDate(
                      current.created_at
                    )
                  )}

                </span>

              </div>


              ${
                [
                  "recommended",
                  "approved",
                  "in_progress"
                ].includes(
                  current.status
                )
                  ? `

                    <div
                      class="lead-phase7-actions"
                    >

                      ${
                        current.status ===
                        "recommended"
                          ? `

                            <button
                              class="primary-btn"
                              data-action7="approve"
                              data-id="${escapeHtml(
                                current.id
                              )}"
                            >
                              Approve
                            </button>

                          `
                          : ""
                      }


                      ${
                        current.status !==
                        "in_progress"
                          ? `

                            <button
                              class="ghost-btn"
                              data-action7="dismiss"
                              data-id="${escapeHtml(
                                current.id
                              )}"
                            >
                              Dismiss
                            </button>

                          `
                          : ""
                      }


                      ${
                        current.status ===
                        "approved"
                          ? `

                            <button
                              class="ghost-btn"
                              data-action7="progress"
                              data-id="${escapeHtml(
                                current.id
                              )}"
                            >
                              Start
                            </button>

                          `
                          : ""
                      }


                      ${
                        current.status ===
                        "in_progress"
                          ? `

                            <button
                              class="primary-btn"
                              data-action7="complete"
                              data-id="${escapeHtml(
                                current.id
                              )}"
                            >
                              Mark complete
                            </button>

                          `
                          : ""
                      }

                    </div>

                  `
                  : ""
              }

            `
            : `

              <div class="lead-phase7-empty">

                <strong>
                  No recommendation yet.
                </strong>

                <span>
                  Run the engine to generate one.
                </span>

              </div>

            `
        }

      </div>


      <button
        id="runLeadNextAction"
        class="primary-btn lead-phase7-run"
      >

        ${
          message ||
          "Refresh recommendation"
        }

      </button>


      ${
        history.length
          ? `

            <details
              class="lead-phase7-history"
            >

              <summary>
                Action history
                (${history.length})
              </summary>


              ${history
                .map(
                  (row) => `

                    <div
                      class="lead-phase7-history-row"
                    >

                      <span>
                        ${escapeHtml(
                          actionLabel(
                            row.action_type
                          )
                        )}
                      </span>

                      <b>
                        ${escapeHtml(
                          row.status
                        )}
                      </b>

                      <small>
                        ${escapeHtml(
                          formatDate(
                            row.created_at
                          )
                        )}
                      </small>

                    </div>

                  `
                )
                .join("")}

            </details>

          `
          : ""
      }

    `;


    return section;
  }


  /* =========================================================
     RENDER PHASE 7
  ========================================================= */

  async function render(
    leadId
  ) {

    if (
      !leadId ||
      rendering
    ) {
      return;
    }

    const detail =
      document.getElementById(
        "detailContent"
      );

    if (!detail) {
      return;
    }

    rendering = true;


    try {

      const result =
        await loadActions(
          leadId
        );


      if (
        activeLeadId !==
        leadId
      ) {
        return;
      }


      document
        .getElementById(
          "leadNextActionPhase7"
        )
        ?.remove();


      const section =
        renderSection(
          leadId,
          result.rows || []
        );


      const duplicate =
        document.getElementById(
          "leadDuplicatesPhase6"
        );


      const source =
        document.getElementById(
          "leadSourcesPhase5"
        );


      if (
        duplicate?.parentNode
      ) {

        duplicate.parentNode.insertBefore(
          section,
          duplicate.nextSibling
        );

      }

      else if (
        source?.parentNode
      ) {

        source.parentNode.insertBefore(
          section,
          source
        );

      }

      else {

        detail.appendChild(
          section
        );

      }


      bind(
        section,
        leadId
      );

    }

    finally {

      rendering =
        false;

    }

  }


  /* =========================================================
     BUTTON ACTIONS
  ========================================================= */

  function bind(
    section,
    leadId
  ) {


    const runButton =
      section.querySelector(
        "#runLeadNextAction"
      );


    if (runButton) {

      runButton.addEventListener(
        "click",
        async () => {

          runButton.disabled =
            true;

          runButton.textContent =
            "Analyzing…";


          try {

            await recommend(
              leadId
            );


            await render(
              leadId
            );

          }

          catch (error) {

            console.error(
              "[GLIME Lead Action]",
              error
            );


            alert(
              error.message ||
                "Unable to generate recommendation."
            );


            runButton.disabled =
              false;

            runButton.textContent =
              "Refresh recommendation";

          }

        }
      );

    }


    /* =======================================================
       APPROVE / DISMISS / START / COMPLETE
    ======================================================= */

    section
      .querySelectorAll(
        "[data-action7]"
      )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            async () => {

              const id =
                button.dataset.id;

              const type =
                button.dataset.action7;


              const statusMap = {

                approve:
                  "approved",

                dismiss:
                  "dismissed",

                progress:
                  "in_progress",

                complete:
                  "completed"

              };


              const status =
                statusMap[type];


              if (
                !id ||
                !status
              ) {
                return;
              }


              button.disabled =
                true;


              try {

                await updateAction(
                  id,
                  status
                );


                await render(
                  leadId
                );

              }

              catch (error) {

                console.error(
                  "[GLIME Lead Action] Update error:",
                  error
                );


                alert(
                  error.message ||
                    "Unable to update action."
                );


                button.disabled =
                  false;

              }

            }
          );

        }
      );

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
            render(
              activeLeadId
            ),
          180
        );

      }


      const closeButton =
        event.target.closest(
          "[data-close]"
        );


      if (closeButton) {

        activeLeadId =
          null;

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

        if (
          !activeLeadId
        ) {
          return;
        }


        const detail =
          document.getElementById(
            "detailContent"
          );


        if (!detail) {
          return;
        }


        if (
          !document.getElementById(
            "leadNextActionPhase7"
          )
        ) {

          setTimeout(
            () =>
              render(
                activeLeadId
              ),
            100
          );

        }

      }
    );


  /* =========================================================
     START OBSERVER
  ========================================================= */

  function start() {

    const detail =
      document.getElementById(
        "detailContent"
      );


    if (!detail) {

      setTimeout(
        start,
        250
      );

      return;

    }


    observer.observe(
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

  window.GLIMELeadNextAction = {

    refresh() {

      if (
        activeLeadId
      ) {

        render(
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

  start();


  console.log(
    "[GLIME Lead Action] Phase 7 addon loaded."
  );

})();
