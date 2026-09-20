/* GLIME Phase G — Decision / Action Center v3
   Lead-specific decision proposals.
   20/page, server-side search/filter/pagination, channel selection/switch,
   skip/restore per decision, approval-gated execution.
   No GLIME CARE changes.
*/
(() => {
  "use strict";

  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const PAGE_SIZE = 20;

  const sb =
    window.supabaseClient ||
    (window.supabase?.createClient
      ? (window.__glimePhaseGSupabase ||= window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY))
      : null);

  if (!sb) {
    console.warn("[GLIME Phase G] Supabase client not found.");
    return;
  }

  const esc = (v) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const pretty = (v) =>
    v === null || v === undefined
      ? "—"
      : typeof v === "object"
        ? JSON.stringify(v, null, 2)
        : String(v);

  const rpc = async (name, args = {}) => {
    const { data, error } = await sb.rpc(name, args);

    if (error) {
      throw error;
    }

    return data;
  };

  const badge = (status) => {
    const s = String(status || "unknown")
      .toLowerCase()
      .replace(/\s+/g, "_");

    return `
      <span class="gG2-badge gG2-${esc(s)}">
        ${esc(s.replace(/_/g, " "))}
      </span>
    `;
  };

  const debounce = (fn, wait = 350) => {
    let timer;

    return (...args) => {
      clearTimeout(timer);

      timer = setTimeout(() => {
        fn(...args);
      }, wait);
    };
  };

  function injectStyles() {
    if (document.getElementById("glime-phase-g2-style")) {
      return;
    }

    const style = document.createElement("style");

    style.id = "glime-phase-g2-style";

    style.textContent = `
      .gG2-card {
        margin: 20px 0;
        padding: 22px;
        border: 1px solid rgba(120,120,120,.18);
        border-radius: 18px;
        background: var(--card-bg,#fff);
        box-shadow: 0 8px 30px rgba(0,0,0,.06);
      }

      .gG2-head,
      .gG2-row,
      .gG2-lead-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .gG2-title {
        font-size: 20px;
        font-weight: 700;
      }

      .gG2-sub {
        margin-top: 4px;
        font-size: 13px;
        opacity: .68;
      }

      .gG2-list {
        display: grid;
        gap: 16px;
        margin-top: 18px;
      }

      .gG2-item {
        padding: 16px;
        border: 1px solid rgba(120,120,120,.16);
        border-radius: 15px;
      }

      .gG2-section {
        margin-top: 12px;
      }

      .gG2-label,
      .gG2-channel-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .04em;
        opacity: .55;
      }

      .gG2-text {
        margin-top: 4px;
        line-height: 1.45;
      }

      .gG2-pre {
        margin-top: 5px;
        padding: 10px;
        border-radius: 9px;
        background: rgba(120,120,120,.07);
        white-space: pre-wrap;
        overflow: auto;
        font-size: 12px;
      }

      .gG2-actions,
      .gG2-channel-row,
      .gG2-toolbar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .gG2-actions {
        margin-top: 14px;
      }

      .gG2-btn {
        border: 0;
        border-radius: 10px;
        padding: 9px 13px;
        cursor: pointer;
        font-weight: 600;
      }

      .gG2-btn:disabled {
        opacity: .48;
        cursor: not-allowed;
      }

      .gG2-primary {
        background: #111;
        color: #fff;
      }

      .gG2-danger {
        background: #eee;
        color: #111;
      }

      .gG2-channel {
        border: 1px solid rgba(120,120,120,.2);
        background: transparent;
        color: inherit;
      }

      .gG2-channel.gG2-selected {
        background: #111;
        color: #fff;
      }

      .gG2-channel.gG2-unavailable {
        opacity: .45;
      }

      .gG2-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        background: rgba(120,120,120,.12);
      }

      .gG2-proposed,
      .gG2-awaiting_approval {
        background: rgba(245,166,35,.15);
      }

      .gG2-approved,
      .gG2-queued,
      .gG2-executing {
        background: rgba(52,152,219,.14);
      }

      .gG2-completed {
        background: rgba(46,204,113,.15);
      }

      .gG2-failed,
      .gG2-rejected,
      .gG2-skipped {
        background: rgba(231,76,60,.14);
      }

      .gG2-life {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 10px;
      }

      .gG2-arrow {
        opacity: .4;
      }

      .gG2-impact {
        padding: 10px;
        border-radius: 10px;
        background: rgba(120,120,120,.07);
      }

      .gG2-msg {
        font-size: 13px;
        opacity: .68;
      }

      .gG2-toolbar {
        margin-top: 15px;
        padding: 12px;
        border-radius: 12px;
        background: rgba(120,120,120,.055);
      }

      .gG2-input,
      .gG2-select {
        min-width: 150px;
        border: 1px solid rgba(120,120,120,.22);
        border-radius: 9px;
        padding: 9px 10px;
        background: transparent;
        color: inherit;
      }

      .gG2-input {
        flex: 1;
        min-width: 220px;
      }

      .gG2-pagination {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 14px;
      }

      .gG2-lead-name {
        font-weight: 700;
        font-size: 16px;
      }

      .gG2-channel-label {
        margin-top: 12px;
      }

      .gG2-counter {
        font-size: 12px;
        opacity: .68;
      }
    `;

    document.head.appendChild(style);
  }

  function renderLifecycle(row) {
    const states = [
      [
        "proposal",
        row.action_request_id
          ? row.action_status || "created"
          : "pending"
      ],

      [
        "approval",
        row.action_request_id
          ? row.action_status || "pending"
          : "pending"
      ],

      [
        "execution",
        row.execution_job_id
          ? row.execution_status || "created"
          : "pending"
      ],

      [
        "impact",
        row.impact_id
          ? row.impact_status || "pending"
          : "pending"
      ]
    ];

    return `
      <div class="gG2-life">
        ${states.map((x, i) => `
          ${i
            ? '<span class="gG2-arrow">→</span>'
            : ""}

          <span>
            ${esc(x[0])}:
            ${badge(x[1])}
          </span>
        `).join("")}
      </div>
    `;
  }

  async function invokeProposal(body) {
    const {
      data,
      error
    } = await sb.functions.invoke(
      "client-decision-action-proposal",
      {
        body
      }
    );

    if (error) {
      throw error;
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  }

  function channelButton(
    channel,
    available,
    selected,
    requestId,
    leadId
  ) {
    const label = {
      instagram: "Instagram",
      whatsapp: "WhatsApp",
      email: "Email"
    }[channel];

    return `
      <button
        class="gG2-btn gG2-channel
          ${selected === channel ? "gG2-selected" : ""}
          ${!available ? "gG2-unavailable" : ""}"
        data-channel="${esc(channel)}"
        data-request-id="${esc(requestId || "")}"
        data-lead-id="${esc(leadId)}"
        ${available ? "" : "disabled"}
        title="${
          available
            ? `Use ${label} for this lead`
            : channel === "email"
              ? "Email is not connected to GLIME lead/customer records yet."
              : `${label} is not currently available for this lead.`
        }"
      >
        ${label}
      </button>
    `;
  }

  async function editProposal(row, message) {
    const current =
      row.action_payload || {};

    const editable =
      current?.contract?.editable_fields ||
      current?.editable_fields ||
      [];

    if (!editable.length) {
      throw new Error(
        "No editable proposal fields are available."
      );
    }

    const patch = {};

    if (editable.includes("message")) {
      const value = window.prompt(
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
      const value = window.prompt(
        "Edit target reference:",
        current.target_reference ||
        row.lead_id ||
        ""
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
      const value = window.prompt(
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
          row.action_request_id,

        p_changes:
          patch
      }
    );

    message.textContent =
      "Proposal updated. Client approval is still required.";
  }

  async function renderLeadSpecificDecision(
    row,
    container
  ) {
    const state = {
      page: 1,
      search: "",
      channel: "all",
      status: "all"
    };

    container.innerHTML = `
      <div class="gG2-toolbar">

        <input
          class="gG2-input gG2-lead-search"
          placeholder="Search leads by name, mobile, interest…"
        />

        <select
          class="gG2-select gG2-channel-filter"
        >
          <option value="all">
            All channels
          </option>

          <option value="instagram">
            Instagram
          </option>

          <option value="whatsapp">
            WhatsApp
          </option>

          <option value="email">
            Email
          </option>
        </select>

        <select
          class="gG2-select gG2-status-filter"
        >
          <option value="all">
            All statuses
          </option>

          <option value="pending">
            Pending
          </option>

          <option value="proposed">
            Proposed
          </option>

          <option value="awaiting_approval">
            Awaiting approval
          </option>

          <option value="approved">
            Approved
          </option>

          <option value="queued">
            Queued
          </option>

          <option value="executing">
            Executing
          </option>

          <option value="completed">
            Completed
          </option>

          <option value="rejected">
            Rejected
          </option>

          <option value="skipped">
            Skipped
          </option>
        </select>

      </div>

      <div class="gG2-msg gG2-lead-loading">
        Loading lead proposals…
      </div>

      <div class="gG2-lead-list"></div>

      <div class="gG2-pagination">

        <button
          class="gG2-btn gG2-danger gG2-prev"
        >
          Previous
        </button>

        <span class="gG2-counter gG2-page-info"></span>

        <button
          class="gG2-btn gG2-danger gG2-next"
        >
          Next
        </button>

      </div>
    `;

    const searchInput =
      container.querySelector(
        ".gG2-lead-search"
      );

    const channelFilter =
      container.querySelector(
        ".gG2-channel-filter"
      );

    const statusFilter =
      container.querySelector(
        ".gG2-status-filter"
      );

    const loadLeads = async () => {
      const loading =
        container.querySelector(
          ".gG2-lead-loading"
        );

      const list =
        container.querySelector(
          ".gG2-lead-list"
        );

      loading.textContent =
        "Loading lead proposals…";

      list.innerHTML = "";

      try {
        const result =
          await rpc(
            "get_client_decision_leads",
            {
              p_decision_id:
                row.decision_id,

              p_page:
                state.page,

              p_page_size:
                PAGE_SIZE,

              p_search:
                state.search || null,

              p_channel:
                state.channel,

              p_status:
                state.status
            }
          );

        if (!result?.ok) {
          throw new Error(
            result?.error ||
            "Could not load lead proposals."
          );
        }

        const rows =
          Array.isArray(
            result.rows
          )
            ? result.rows
            : [];

        loading.textContent =
          rows.length
            ? `Showing ${rows.length} of ${result.total} matching leads.`
            : (
                state.status === "skipped"
                  ? "No skipped leads for this decision."
                  : "No matching leads on this page."
              );

        list.innerHTML =
          rows
            .map(
              (lead) => {
                const available =
                  lead.available_channels ||
                  {};

                const payload =
                  lead.action_payload ||
                  {};

                const selected =
                  payload.channel ||
                  "";

                return `
                  <article
                    class="gG2-item"
                    data-lead-id="${esc(
                      lead.lead_id
                    )}"
                  >

                    <div
                      class="gG2-lead-head"
                    >

                      <div>

                        <div
                          class="gG2-lead-name"
                        >
                          ${esc(
                            lead.name ||
                            "Unnamed lead"
                          )}
                        </div>

                        <div
                          class="gG2-lead-meta"
                        >
                          ${esc(
                            lead.interest ||
                            lead.product_service ||
                            "No interest recorded"
                          )}

                          ·

                          ${esc(
                            lead.status ||
                            "unknown"
                          )}

                          ${
                            lead.mobile
                              ? ` · ${esc(
                                  lead.mobile
                                )}`
                              : ""
                          }
                        </div>

                      </div>

                      ${badge(
                        lead.decision_status ||
                        "pending"
                      )}

                    </div>


                    <div
                      class="gG2-section"
                    >

                      <div
                        class="gG2-label"
                      >
                        Lead-specific context
                      </div>

                      <div
                        class="gG2-text"
                      >
                        ${esc(
                          lead.product_service ||
                          lead.interest ||
                          "GLIME will use available lead context."
                        )}
                      </div>

                    </div>


                    <div
                      class="gG2-channel-label"
                    >
                      Send via
                    </div>


                    <div
                      class="gG2-channel-row"
                    >

                      ${channelButton(
                        "instagram",
                        !!available.instagram,
                        selected,
                        lead.action_request_id,
                        lead.lead_id
                      )}

                      ${channelButton(
                        "whatsapp",
                        !!available.whatsapp,
                        selected,
                        lead.action_request_id,
                        lead.lead_id
                      )}

                      ${channelButton(
                        "email",
                        !!available.email,
                        selected,
                        lead.action_request_id,
                        lead.lead_id
                      )}

                    </div>


                    ${
                      lead.action_request_id
                        ? `
                          <div
                            class="gG2-section"
                          >

                            <div
                              class="gG2-label"
                            >
                              AI Proposed Message
                            </div>

                            <div
                              class="gG2-pre"
                            >
                              ${esc(
                                payload.message ||
                                "Proposal created; message is not available yet."
                              )}
                            </div>

                          </div>


                          <div
                            class="gG2-section gG2-text"
                          >

                            ${esc(
                              lead.target_module_slug ||
                              "Specialist"
                            )}

                            ·

                            ${esc(
                              lead.target_action ||
                              "follow_up"
                            )}

                            ${badge(
                              lead.action_status ||
                              "proposed"
                            )}

                            ${
                              lead.approval_required
                                ? " · Approval required"
                                : ""
                            }

                          </div>
                        `
                        : `
                          <div
                            class="gG2-msg"
                          >
                            Choose a channel to create the proposal for this lead.
                          </div>
                        `
                    }


                    ${
                      lead.skip_reason
                        ? `
                          <div
                            class="gG2-msg"
                          >
                            Skipped for this decision:
                            ${esc(
                              lead.skip_reason
                            )}
                          </div>
                        `
                        : ""
                    }

                     <div
                      class="gG2-actions"
                    >

                      ${
                        lead.action_request_id &&
                        [
                          "proposed",
                          "awaiting_approval"
                        ].includes(
                          lead.action_status
                        )
                          ? `
                            <button
                              class="gG2-btn gG2-primary gG2-lead-edit"
                            >
                              Edit Proposal
                            </button>

                            <button
                              class="gG2-btn gG2-primary gG2-lead-approve"
                            >
                              Approve & Queue
                            </button>

                            <button
                              class="gG2-btn gG2-danger gG2-lead-reject"
                            >
                              Reject
                            </button>
                          `
                          : ""
                      }


                      ${
                        lead.decision_status ===
                        "skipped"
                          ? `
                            <button
                              class="gG2-btn gG2-danger gG2-lead-restore"
                            >
                              Restore for this decision
                            </button>
                          `
                          : `
                            <button
                              class="gG2-btn gG2-danger gG2-lead-skip"
                            >
                              Don't contact this lead
                            </button>
                          `
                      }

                    </div>


                    <div
                      class="gG2-msg gG2-lead-message"
                    ></div>

                  </article>
                `;
              }
            )
            .join("");


        const pageInfo =
          container.querySelector(
            ".gG2-page-info"
          );

        pageInfo.textContent =
          `Page ${result.page} of ${
            result.total_pages || 1
          } · ${result.total} total`;


        const prev =
          container.querySelector(
            ".gG2-prev"
          );

        const next =
          container.querySelector(
            ".gG2-next"
          );

        prev.disabled =
          result.page <= 1;

        next.disabled =
          result.page >=
          (result.total_pages || 1);


        prev.onclick =
          async () => {
            if (state.page > 1) {
              state.page--;

              await loadLeads();
            }
          };


        next.onclick =
          async () => {
            if (
              state.page <
              (result.total_pages || 1)
            ) {
              state.page++;

              await loadLeads();
            }
          };


        /*
         * CHANNEL SELECT / SWITCH
         */

        container
          .querySelectorAll(
            ".gG2-channel"
          )
          .forEach(
            (button) => {

              button.onclick =
                async () => {

                  const item =
                    button.closest(
                      "[data-lead-id]"
                    );

                  const leadId =
                    button.dataset.leadId;

                  const selectedChannel =
                    button.dataset.channel;

                  const requestId =
                    button.dataset.requestId;

                  const msg =
                    item.querySelector(
                      ".gG2-lead-message"
                    );

                  button.disabled = true;

                  msg.textContent =
                    requestId
                      ? `Switching proposal to ${selectedChannel} and regenerating the channel-specific draft…`
                      : `Preparing ${selectedChannel} proposal for this lead…`;

                  try {

                    await invokeProposal(
                      requestId
                        ? {
                            mode:
                              "switch",

                            decision_id:
                              row.decision_id,

                            lead_id:
                              leadId,

                            channel:
                              selectedChannel,

                            action_request_id:
                              requestId
                          }
                        : {
                            mode:
                              "prepare",

                            decision_id:
                              row.decision_id,

                            lead_id:
                              leadId,

                            channel:
                              selectedChannel
                          }
                    );

                    msg.textContent =
                      `Proposal ready for ${selectedChannel}. Client approval is still required.`;

                    await loadLeads();

                  } catch (
                    error
                  ) {

                    msg.textContent =
                      `Could not prepare/switch channel: ${
                        error.message ||
                        error
                      }`;

                    button.disabled =
                      false;
                  }
                };
            }
          );


        /*
         * SKIP LEAD
         */

        container
          .querySelectorAll(
            ".gG2-lead-skip"
          )
          .forEach(
            (button) => {

              button.onclick =
                async () => {

                  const item =
                    button.closest(
                      "[data-lead-id]"
                    );

                  const leadId =
                    item.dataset.leadId;

                  const msg =
                    item.querySelector(
                      ".gG2-lead-message"
                    );

                  if (
                    !window.confirm(
                      "Remove this lead from this decision's proposal list? The lead will NOT be deleted."
                    )
                  ) {
                    return;
                  }

                  button.disabled =
                    true;

                  msg.textContent =
                    "Skipping this lead for this decision…";

                  try {

                    await rpc(
                      "skip_client_decision_lead",
                      {
                        p_decision_id:
                          row.decision_id,

                        p_lead_id:
                          leadId
                      }
                    );

                    msg.textContent =
                      "Lead skipped for this decision. It remains in the Leads section.";

                    await loadLeads();

                  } catch (
                    error
                  ) {

                    msg.textContent =
                      `Could not skip lead: ${
                        error.message ||
                        error
                      }`;

                    button.disabled =
                      false;
                  }
                };
            }
          );


        /*
         * RESTORE LEAD
         */

        container
          .querySelectorAll(
            ".gG2-lead-restore"
          )
          .forEach(
            (button) => {

              button.onclick =
                async () => {

                  const item =
                    button.closest(
                      "[data-lead-id]"
                    );

                  const leadId =
                    item.dataset.leadId;

                  const msg =
                    item.querySelector(
                      ".gG2-lead-message"
                    );

                  button.disabled =
                    true;

                  msg.textContent =
                    "Restoring this lead for the decision…";

                  try {

                    await rpc(
                      "restore_client_decision_lead",
                      {
                        p_decision_id:
                          row.decision_id,

                        p_lead_id:
                          leadId
                      }
                    );

                    msg.textContent =
                      "Lead restored for this decision.";

                    await loadLeads();

                  } catch (
                    error
                  ) {

                    msg.textContent =
                      `Could not restore lead: ${
                        error.message ||
                        error
                      }`;

                    button.disabled =
                      false;
                  }
                };
            }
          );


        /*
         * EDIT PROPOSAL
         */

        container
          .querySelectorAll(
            ".gG2-lead-edit"
          )
          .forEach(
            (button) => {

              button.onclick =
                async () => {

                  const item =
                    button.closest(
                      "[data-lead-id]"
                    );

                  const lead =
                    rows.find(
                      (x) =>
                        String(
                          x.lead_id
                        ) ===
                        String(
                          item.dataset.leadId
                        )
                    );

                  const msg =
                    item.querySelector(
                      ".gG2-lead-message"
                    );

                  button.disabled =
                    true;

                  msg.textContent =
                    "Opening editable proposal fields…";

                  try {

                    await editProposal(
                      lead,
                      msg
                    );

                    await loadLeads();

                  } catch (
                    error
                  ) {

                    msg.textContent =
                      `Could not update proposal: ${
                        error.message ||
                        error
                      }`;

                  } finally {

                    button.disabled =
                      false;
                  }
                };
            }
          );


        /*
         * APPROVE
         */

        container
          .querySelectorAll(
            ".gG2-lead-approve"
          )
          .forEach(
            (button) => {

              button.onclick =
                async () => {

                  const item =
                    button.closest(
                      "[data-lead-id]"
                    );

                  const lead =
                    rows.find(
                      (x) =>
                        String(
                          x.lead_id
                        ) ===
                        String(
                          item.dataset.leadId
                        )
                    );

                  const msg =
                    item.querySelector(
                      ".gG2-lead-message"
                    );

                  if (
                    !lead?.action_request_id
                  ) {
                    return;
                  }

                  button.disabled =
                    true;

                  msg.textContent =
                    "Approving and queueing…";

                  try {

                    const result =
                      await rpc(
                        "approve_client_business_action",
                        {
                          p_action_request_id:
                            lead.action_request_id
                        }
                      );

                    msg.textContent =
                      `Queued successfully. Job: ${
                        result?.job_id ||
                        "created"
                      }`;

                    await loadLeads();

                  } catch (
                    error
                  ) {

                    msg.textContent =
                      `Approval failed: ${
                        error.message ||
                        error
                      }`;

                    button.disabled =
                      false;
                  }
                };
            }
          );


        /*
         * REJECT
         */

        container
          .querySelectorAll(
            ".gG2-lead-reject"
          )
          .forEach(
            (button) => {

              button.onclick =
                async () => {

                  const item =
                    button.closest(
                      "[data-lead-id]"
                    );

                  const lead =
                    rows.find(
                      (x) =>
                        String(
                          x.lead_id
                        ) ===
                        String(
                          item.dataset.leadId
                        )
                    );

                  const msg =
                    item.querySelector(
                      ".gG2-lead-message"
                    );

                  if (
                    !lead?.action_request_id
                  ) {
                    return;
                  }

                  button.disabled =
                    true;

                  msg.textContent =
                    "Rejecting proposal…";

                  try {

                    await rpc(
                      "reject_client_business_action",
                      {
                        p_action_request_id:
                          lead.action_request_id
                      }
                    );

                    msg.textContent =
                      "Proposal rejected. No execution job was created.";

                    await loadLeads();

                  } catch (
                    error
                  ) {

                    msg.textContent =
                      `Reject failed: ${
                        error.message ||
                        error
                      }`;

                    button.disabled =
                      false;
                  }
                };
            }
          );

      } catch (
        error
      ) {

        loading.textContent =
          `Could not load lead proposals: ${
            error.message ||
            error
          }`;
      }
    };


    searchInput.oninput =
      debounce(
        async () => {

          state.search =
            searchInput.value.trim();

          state.page =
            1;

          await loadLeads();
        }
      );


    channelFilter.onchange =
      async () => {

        state.channel =
          channelFilter.value;

        state.page =
          1;

        await loadLeads();
      };


    statusFilter.onchange =
      async () => {

        state.status =
          statusFilter.value;

        state.page =
          1;

        await loadLeads();
      };


    await loadLeads();
  }

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

    list.innerHTML =
      '<div class="gG2-msg">Loading decision lifecycle…</div>';


    const rows =
      await rpc(
        "get_client_decision_action_center"
      );


    if (
      !Array.isArray(rows) ||
      !rows.length
    ) {

      list.innerHTML =
        '<div class="gG2-msg">No business decisions available yet.</div>';

      return;
    }


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

            const actionType =
              String(
                row.next_best_action?.type ||
                row.next_best_action?.action_type ||
                ""
              ).toLowerCase();

            const leadSpecific =
              [
                "repeat_customer_reengagement",
                "low_repeat_rate",
                "lead_followup_review"
              ].includes(
                actionType
              );


            return `
              <article
                class="gG2-item"
                data-decision-id="${esc(
                  row.decision_id
                )}"
              >

                <div
                  class="gG2-row"
                >

                  <div>

                    <div
                      class="gG2-title"
                    >
                      ${esc(
                        row.title ||
                        "Business Decision"
                      )}
                    </div>

                    <div
                      class="gG2-sub"
                    >
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


                ${renderLifecycle(
                  row
                )}


                <div
                  class="gG2-section"
                >
                  <div
                    class="gG2-label"
                  >
                    Problem
                  </div>

                  <div
                    class="gG2-text"
                  >
                    ${esc(
                      row.problem ||
                      "—"
                    )}
                  </div>
                </div>


                <div
                  class="gG2-section"
                >
                  <div
                    class="gG2-label"
                  >
                    Root Cause
                  </div>

                  <div
                    class="gG2-text"
                  >
                    ${esc(
                      row.root_cause ||
                      "—"
                    )}
                  </div>
                </div>


                <div
                  class="gG2-section"
                >
                  <div
                    class="gG2-label"
                  >
                    Recommendation
                  </div>

                  <div
                    class="gG2-text"
                  >
                    ${esc(
                      row.recommendation ||
                      "—"
                    )}
                  </div>
                </div>


                <div
                  class="gG2-section"
                >
                  <div
                    class="gG2-label"
                  >
                    Next Best Action
                  </div>

                 <div
                    class="gG2-pre"
                  >
                    ${esc(
                      pretty(
                        row.next_best_action
                      )
                    )}
                  </div>
                </div>


                ${
                  leadSpecific
                    ? `
                      <div
                        class="gG2-section gG2-lead-manager"
                      ></div>
                    `
                    : `
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
                    `
                }


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
                            row.impact_status ===
                              "pending" &&
                            row.observation_until
                              ? `
                                <div
                                  class="gG2-msg"
                                >
                                  Observation window:
                                  ${esc(
                                    new Date(
                                      row.observation_until
                                    ).toLocaleString()
                                  )}
                                </div>
                              `
                              : ""
                          }


                          ${
                            Array.isArray(
                              row.selected_metrics
                            ) &&
                            row.selected_metrics.length
                              ? `
                                <div
                                  class="gG2-msg"
                                >
                                  Metrics:
                                  ${esc(
                                    row.selected_metrics.join(
                                      ", "
                                    )
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


                <div
                  class="gG2-msg gG2-decision-message"
                ></div>

              </article>
            `;
          }
        )
        .join("");


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
            ".gG2-decision-message"
          );

        const actionType =
          String(
            row.next_best_action?.type ||
            row.next_best_action?.action_type ||
            ""
          ).toLowerCase();

        const leadSpecific =
          [
            "repeat_customer_reengagement",
            "low_repeat_rate",
            "lead_followup_review"
          ].includes(
            actionType
          );


        if (leadSpecific) {

          renderLeadSpecificDecision(
            row,
            item.querySelector(
              ".gG2-lead-manager"
            )
          ).catch(
            (error) => {

              item.querySelector(
                ".gG2-lead-manager"
              ).innerHTML =
                `
                  <div
                    class="gG2-msg"
                  >
                    Could not load lead proposals:
                    ${esc(
                      error.message ||
                      error
                    )}
                  </div>
                `;
            }
          );

          return;
        }


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

                message.textContent =
                  result?.proposal_created
                    ? "Action proposal created. Client approval is still required."
                    : `No action proposal created: ${
                        result?.evaluation?.reason ||
                        "No enabled specialist action is available."
                      }`;

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


        const edit =
          item.querySelector(
            ".gG2-edit"
          );


        if (edit) {

          edit.onclick =
            async () => {

              edit.disabled =
                true;

              message.textContent =
                "Opening editable proposal fields…";

              try {

                const payload =
                  row.action_payload ||
                  {};

                const editable =
                  payload?.contract?.editable_fields ||
                  payload?.editable_fields ||
                  [];

                if (
                  !editable.length
                ) {
                  throw new Error(
                    "No editable proposal fields are available."
                  );
                }

                const patch =
                  {};

                if (
                  editable.includes(
                    "message"
                  )
                ) {

                  const value =
                    window.prompt(
                      "Edit proposed message:",
                      payload.message ||
                      ""
                    );

                  if (
                    value === null
                  ) {
                    return;
                  }

                  patch.message =
                    value;
                }


                if (
                  editable.includes(
                    "target_reference"
                  )
                ) {

                  const value =
                    window.prompt(
                      "Edit target reference:",
                      payload.target_reference ||
                      ""
                    );

                  if (
                    value === null
                  ) {
                    return;
                  }

                  patch.target_reference =
                    value;
                }


                if (
                  editable.includes(
                    "scheduled_for"
                  )
                ) {

                  const value =
                    window.prompt(
                      "Edit scheduled time (ISO format):",
                      payload.scheduled_for ||
                      ""
                    );

                  if (
                    value === null
                  ) {
                    return;
                  }

                  if (
                    value.trim()
                  ) {
                    patch.scheduled_for =
                      value.trim();
                  }
                }


                if (
                  !Object.keys(
                    patch
                  ).length
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
                        approve.dataset.requestId
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
                      reject.dataset.requestId
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


  async function init() {

    injectStyles();

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
      !anchor?.parentNode
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
            🧠 GLIME Decision / Action Center
          </div>

          <div
            class="gG2-sub"
          >
            Decision →
            Lead-specific Proposal →
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
        load().catch(
          console.error
        );


    await load();
  }


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
