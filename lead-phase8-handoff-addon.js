/* =========================================================
   GLIME — LEAD AI EMPLOYEE
   Follow-up Message Add-on
   ---------------------------------------------------------
   AI prepares draft
   Client can edit
   Client can regenerate
   Client explicitly approves
   Existing specialist sends the approved message

   IMPORTANT:
   - Existing CSS class names are preserved.
   - Does NOT modify leads.js.
   - Does NOT modify GLIME CARE.
========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!window.supabase) {
    console.error(
      "[GLIME Follow-up] Supabase client not available."
    );
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  let activeLeadId = null;
  let requestId = null;
  let rendering = false;

  /* =========================================================
     HELPERS
  ========================================================= */

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        }[char])
    );
  }

  async function invoke(action, body = {}) {
    const { data, error } =
      await db.functions.invoke(
        "lead-followup-handoff-v2",
        {
          body: {
            action,
            ...body,
          },
        }
      );

    if (error) {
      throw new Error(
        error.message ||
          "Unable to connect to the follow-up service."
      );
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  }

  /* =========================================================
     LOAD EXISTING FOLLOW-UP REQUESTS
  ========================================================= */

  async function loadRequests(leadId) {
    const {
      data: { user },
    } = await db.auth.getUser();

    if (!user) {
      return [];
    }

    const {
      data: clientData,
      error: clientError,
    } = await db
      .from("client_data")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (clientError) {
      console.error(
        "[GLIME Follow-up] Client lookup failed:",
        clientError
      );

      return [];
    }

    if (!clientData?.client_id) {
      return [];
    }

    const {
      data,
      error,
    } = await db
      .from("client_action_requests")
      .select(
        "id,status,target_module_slug,target_action,action_payload,created_at,updated_at,result_payload,error_message"
      )
      .eq(
        "client_id",
        clientData.client_id
      )
      .eq("target_type", "lead")
      .eq("target_id", leadId)
      .order("created_at", {
        ascending: false,
      })
      .limit(8);

    if (error) {
      console.error(
        "[GLIME Follow-up] Request loading failed:",
        error
      );

      return [];
    }

    return data || [];
  }

  /* =========================================================
     RENDER FOLLOW-UP SECTION
  ========================================================= */

  function renderSection(
    leadId,
    rows
  ) {
    const section =
      document.createElement("section");

    /*
     * IMPORTANT:
     * Keep the original ID and CSS class names
     * so existing CSS continues to work.
     */
    section.id =
      "leadPhase8Handoff";

    section.className =
      "lead-phase8-section";

    /*
     * Prefer currently proposed request.
     */
    const current =
      rows.find(
        (row) =>
          row.status === "proposed"
      ) || rows[0];

    const payload =
      current?.action_payload || {};

    requestId =
      current?.id || null;

    section.innerHTML = `
      <div class="lead-phase8-head">

        <div>

          <h3>
            Follow-up Message
          </h3>

          <p>
            AI prepares a follow-up message.
            You can edit it before sending.
          </p>

        </div>

      </div>

      ${
        current
          ? `
            <div class="lead-phase8-card">

              <div class="lead-phase8-row">

                <span>
                  Channel
                </span>

                <strong>
                  ${escapeHtml(
                    payload.channel ||
                      "—"
                  )}
                </strong>

              </div>

              <div class="lead-phase8-row">

                <span>
                  Status
                </span>

                <strong>
                  ${escapeHtml(
                    current.status ||
                      "—"
                  )}
                </strong>

              </div>

              ${
                current.status ===
                "proposed"
                  ? `
                    <label
                      class="lead-phase8-label"
                    >
                      Follow-up message
                    </label>

                    <textarea
                      id="phase8Message"
                      class="lead-phase8-textarea"
                      maxlength="2000"
                    >${escapeHtml(
                      payload.message ||
                        ""
                    )}</textarea>

                    <div
                      class="lead-phase8-note"
                    >
                      You can edit this message
                      before sending. Approve & Send
                      will use exactly the text
                      currently in this box.
                    </div>

                    <div
                      class="lead-phase8-actions"
                    >

                      <button
                        class="ghost-btn"
                        data-phase8="save"
                        type="button"
                      >
                        Save edit
                      </button>

                      <button
                        class="ghost-btn"
                        data-phase8="regen"
                        type="button"
                      >
                        Regenerate
                      </button>

                      <button
                        class="primary-btn"
                        data-phase8="send"
                        type="button"
                      >
                        Approve & Send
                      </button>

                    </div>
                  `
                  : `
                    <div
                      class="lead-phase8-final"
                    >

                      <b>
                        Final message
                      </b>

                      <div>
                        ${escapeHtml(
                          payload.message ||
                            "—"
                        )}
                      </div>

                    </div>
                  `
              }

            </div>
          `
          : `
            <div
              class="lead-phase8-empty"
            >

              <b>
                No follow-up draft yet.
              </b>

              <span>
                Prepare a follow-up message
                for this lead.
              </span>

              <button
                class="primary-btn"
                data-phase8="create"
                type="button"
              >
                Prepare Follow-up Message
              </button>

            </div>
          `
      }
    `;

    return section;
  }

  /* =========================================================
     RENDER
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

      const rows =
        await loadRequests(
          leadId
        );

      if (
        activeLeadId !==
        leadId
      ) {
        return;
      }

      const existing =
        document.getElementById(
          "leadPhase8Handoff"
        );

      if (existing) {
        existing.remove();
      }

      const section =
        renderSection(
          leadId,
          rows
        );

      /*
       * Keep the section after
       * the existing Next Best Action card.
       */
      const phase7 =
        document.getElementById(
          "leadNextActionPhase7"
        );

      if (
        phase7 &&
        phase7.parentNode
      ) {

        phase7.parentNode.insertBefore(
          section,
          phase7.nextSibling
        );

      } else {

        detail.appendChild(
          section
        );

      }

      bindActions(
        section,
        leadId
      );

    } finally {

      rendering = false;

    }
  }

  /* =========================================================
     BUTTON ACTIONS
  ========================================================= */

  function bindActions(
    section,
    leadId
  ) {

    section
      .querySelectorAll(
        "[data-phase8]"
      )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            async () => {

              const type =
                button.dataset
                  .phase8;

              button.disabled =
                true;

              try {

                /* =====================================
                   CREATE DRAFT
                ===================================== */

                if (
                  type ===
                  "create"
                ) {

                  await invoke(
                    "create_draft",
                    {
                      lead_id:
                        leadId,

                      channel:
                        "instagram",
                    }
                  );

                }

                /* =====================================
                   SAVE EDIT
                ===================================== */

                else if (
                  type ===
                  "save"
                ) {

                  const textarea =
                    section.querySelector(
                      "#phase8Message"
                    );

                  const message =
                    textarea?.value.trim();

                  if (!message) {

                    throw new Error(
                      "Message cannot be empty."
                    );

                  }

                  if (
                    message.length >
                    2000
                  ) {

                    throw new Error(
                      "Message must be 2000 characters or less."
                    );

                  }

                  if (!requestId) {

                    throw new Error(
                      "Draft not found."
                    );

                  }

                  await invoke(
                    "save_draft",
                    {
                      request_id:
                        requestId,

                      message:
                        message,
                    }
                  );

                }

                /* =====================================
                   REGENERATE DRAFT
                ===================================== */

                else if (
                  type ===
                  "regen"
                ) {

                  if (!requestId) {

                    throw new Error(
                      "Draft not found."
                    );

                  }

                  /*
                   * Backend creates a new AI draft.
                   *
                   * Previous draft remains stored
                   * inside draft_history.
                   */
                  await invoke(
                    "regenerate_draft",
                    {
                      request_id:
                        requestId,
                    }
                  );

                }

                /* =====================================
                   APPROVE & SEND
                ===================================== */

                else if (
                  type ===
                  "send"
                ) {

                  if (!requestId) {

                    throw new Error(
                      "Draft not found."
                    );

                  }

                  const textarea =
                    section.querySelector(
                      "#phase8Message"
                    );

                  const message =
                    textarea?.value.trim();

                  if (!message) {

                    throw new Error(
                      "Message cannot be empty."
                    );

                  }

                  if (
                    message.length >
                    2000
                  ) {

                    throw new Error(
                      "Message must be 2000 characters or less."
                    );

                  }

                  /*
                   * Save the exact text
                   * currently visible to client.
                   */
                  await invoke(
                    "save_draft",
                    {
                      request_id:
                        requestId,

                      message:
                        message,
                    }
                  );

                  /*
                   * Explicit human approval.
                   */
                  const confirmed =
                    window.confirm(
                      "Approve and send this exact message through the connected specialist?"
                    );

                  if (
                    !confirmed
                  ) {

                    return;

                  }

                  /*
                   * Backend performs:
                   *
                   * approval
                   * → execution job
                   * → specialist gateway
                   * → existing provider
                   */
                  await invoke(
                    "approve_and_send",
                    {
                      request_id:
                        requestId,
                    }
                  );

                }

                /*
                 * Reload the section after
                 * successful operation.
                 */
                await render(
                  leadId
                );

              } catch (
                error
              ) {

                console.error(
                  "[GLIME Follow-up]",
                  error
                );

                window.alert(
                  error.message ||
                    "Unable to complete this action."
                );

              } finally {

                button.disabled =
                  false;

              }

            }
          );

        }
      );
  }

  /* =========================================================
     DETECT LEAD OPEN
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
          () => {

            render(
              activeLeadId
            );

          },
          220
        );

      }

      const closeButton =
        event.target.closest(
          "[data-close]"
        );

      if (closeButton) {

        activeLeadId =
          null;

        requestId =
          null;

      }

    },
    true
  );

  /* =========================================================
     WATCH LEAD DETAIL PANEL
  ========================================================= */

  const observer =
    new MutationObserver(
      () => {

        if (
          activeLeadId &&
          !document.getElementById(
            "leadPhase8Handoff"
          )
        ) {

          setTimeout(
            () => {

              render(
                activeLeadId
              );

            },
            100
          );

        }

      }
    );

  function startObserver() {

    const detail =
      document.getElementById(
        "detailContent"
      );

    if (!detail) {

      setTimeout(
        startObserver,
        250
      );

      return;

    }

    observer.observe(
      detail,
      {
        childList: true,
        subtree: true,
      }
    );

  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  window.GLIMELeadFollowup = {

    refresh: () => {

      if (
        activeLeadId
      ) {

        return render(
          activeLeadId
        );

      }

    },

    getActiveLeadId: () =>
      activeLeadId,

  };

  startObserver();

  console.log(
    "[GLIME Follow-up] Follow-up message addon loaded."
  );

})();
