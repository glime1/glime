/* GLIME — Lead AI Employee — Phase 8 Handoff
   Human approval + editable draft + existing specialist execution.
   Does not modify leads.js or GLIME CARE.
*/

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!window.supabase) {
    console.error("[GLIME Phase 8] Supabase client not available.");
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  let activeLeadId = null;
  let requestId = null;
  let rendering = false;

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
    const { data, error } = await db.functions.invoke(
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
        error.message || "Phase 8 request failed"
      );
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  }

  async function loadRequests(leadId) {
    const {
      data: { user },
    } = await db.auth.getUser();

    if (!user) return [];

    const { data: clientData } = await db
      .from("client_data")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!clientData?.client_id) {
      return [];
    }

    const { data } = await db
      .from("client_action_requests")
      .select(
        "id,status,target_module_slug,target_action,action_payload,created_at,updated_at,result_payload,error_message"
      )
      .eq("client_id", clientData.client_id)
      .eq("target_type", "lead")
      .eq("target_id", leadId)
      .order("created_at", {
        ascending: false,
      })
      .limit(8);

    return data || [];
  }

  function renderSection(leadId, rows) {
    const section = document.createElement("section");

    section.id = "leadPhase8Handoff";
    section.className = "lead-phase8-section";

    const current =
      rows.find((row) => row.status === "proposed") ||
      rows[0];

    const payload =
      current?.action_payload || {};

    requestId = current?.id || null;

    section.innerHTML = `
      <div class="lead-phase8-head">

        <div>
          <h3>Agent Handoff</h3>

          <p>
            Lead AI drafts the follow-up.
            You can edit it before the final approval.
          </p>
        </div>

        <span class="lead-phase8-badge">
          Phase 8
        </span>

      </div>

      ${
        current
          ? `
            <div class="lead-phase8-card">

              <div class="lead-phase8-row">
                <span>Channel</span>
                <strong>
                  ${escapeHtml(payload.channel || "—")}
                </strong>
              </div>

              <div class="lead-phase8-row">
                <span>Specialist</span>
                <strong>
                  ${escapeHtml(
                    current.target_module_slug || "—"
                  )}
                </strong>
              </div>

              <div class="lead-phase8-row">
                <span>Status</span>
                <strong>
                  ${escapeHtml(current.status || "—")}
                </strong>
              </div>

              ${
                current.status === "proposed"
                  ? `
                    <label class="lead-phase8-label">
                      Follow-up message
                    </label>

                    <textarea
                      id="phase8Message"
                      class="lead-phase8-textarea"
                      maxlength="2000"
                    >${escapeHtml(
                      payload.message || ""
                    )}</textarea>

                    <div class="lead-phase8-note">
                      AI draft is editable.
                      Approve & Send will send exactly
                      the text currently in this box.
                    </div>

                    <div class="lead-phase8-actions">

                      <button
                        class="ghost-btn"
                        data-phase8="save"
                      >
                        Save edit
                      </button>

                      <button
                        class="ghost-btn"
                        data-phase8="regen"
                      >
                        Regenerate
                      </button>

                      <button
                        class="primary-btn"
                        data-phase8="send"
                      >
                        Approve & Send
                      </button>

                    </div>
                  `
                  : `
                    <div class="lead-phase8-final">

                      <b>
                        Final message
                      </b>

                      <div>
                        ${escapeHtml(
                          payload.message || "—"
                        )}
                      </div>

                    </div>
                  `
              }

            </div>
          `
          : `
            <div class="lead-phase8-empty">

              <b>
                No follow-up draft yet.
              </b>

              <span>
                Generate a draft when the next action
                is follow-up.
              </span>

              <button
                class="primary-btn"
                data-phase8="create"
              >
                Generate Follow-up Draft
              </button>

            </div>
          `
      }
    `;

    return section;
  }

  async function render(leadId) {
    if (!leadId || rendering) {
      return;
    }

    const detail =
      document.getElementById("detailContent");

    if (!detail) {
      return;
    }

    rendering = true;

    try {
      const rows =
        await loadRequests(leadId);

      if (activeLeadId !== leadId) {
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
        renderSection(leadId, rows);

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
        detail.appendChild(section);
      }

      bindActions(
        section,
        leadId
      );

    } finally {
      rendering = false;
    }
  }

  function bindActions(
    section,
    leadId
  ) {
    section
      .querySelectorAll(
        "[data-phase8]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            const type =
              button.dataset.phase8;

            button.disabled = true;

            try {

              if (type === "create") {

                await invoke(
                  "create_draft",
                  {
                    lead_id: leadId,
                    channel: "instagram",
                  }
                );

              }

              else if (type === "save") {

                const textarea =
                  section.querySelector(
                    "#phase8Message"
                  );

                const message =
                  textarea?.value.trim();

                if (!message) {
                  throw new Error(
                    "Message cannot be empty"
                  );
                }

                await invoke(
                  "save_draft",
                  {
                    request_id: requestId,
                    message,
                  }
                );
              }

              else if (type === "regen") {

                throw new Error(
                  "Regenerate is available after the current draft is cancelled. The current Phase 8 version keeps one proposed draft per approval cycle."
                );

              }

              else if (type === "send") {

                if (!requestId) {
                  throw new Error(
                    "Draft not found"
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
                    "Message cannot be empty"
                  );
                }

                /*
                 * Save the exact text currently
                 * visible in the textarea.
                 */
                await invoke(
                  "save_draft",
                  {
                    request_id: requestId,
                    message,
                  }
                );

                /*
                 * Final human confirmation.
                 */
                const confirmed =
                  window.confirm(
                    "Approve and send this exact message through the connected Instagram specialist?"
                  );

                if (!confirmed) {
                  return;
                }

                await invoke(
                  "approve_and_send",
                  {
                    request_id: requestId,
                  }
                );
              }

              await render(
                leadId
              );

            } catch (error) {

              console.error(
                "[GLIME Phase 8]",
                error
              );

              window.alert(
                error.message ||
                  "Unable to complete Phase 8 action"
              );

            } finally {

              button.disabled = false;

            }

          }
        );

      });
  }

  /*
   * Detect when a lead is opened.
   */
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
          () => render(activeLeadId),
          220
        );
      }

      const closeButton =
        event.target.closest(
          "[data-close]"
        );

      if (closeButton) {
        activeLeadId = null;
        requestId = null;
      }

    },
    true
  );

  /*
   * Watch the existing Lead detail panel.
   * This keeps leads.js untouched.
   */
  const observer =
    new MutationObserver(() => {

      if (
        activeLeadId &&
        !document.getElementById(
          "leadPhase8Handoff"
        )
      ) {

        setTimeout(
          () => render(activeLeadId),
          100
        );

      }

    });

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

  /*
   * Public refresh API.
   */
  window.GLIMELeadPhase8 = {

    refresh: () => {
      if (activeLeadId) {
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
    "[GLIME Phase 8] Agent handoff addon loaded."
  );

})();
