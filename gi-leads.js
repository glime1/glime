/* GI — lead-specific proposals for one decision (replaces glime-phase-g-decision-action-center.js).
 * get_client_decision_leads / skip_client_decision_lead / restore_client_decision_lead
 * update_client_action_proposal / approve_client_business_action / reject_client_business_action
 * edge: client-decision-action-proposal { mode: prepare | switch, decision_id, lead_id, channel, action_request_id? }
 * All confirmations and edits use the GLIME-themed dialog. Nothing is sent without the client's approval. */
(() => {
  "use strict";
  const { $, $$, esc, human } = GI;
  const CHANNELS = { instagram: "Instagram", whatsapp: "WhatsApp", email: "Email" };
  const S = { d: null, page: 1, search: "", channel: "all", status: "all", rows: [] };
  const STATUSES = ["pending", "proposed", "awaiting_approval", "approved", "queued", "executing", "completed", "rejected", "skipped"];
  let timer = 0;

  const badge = s => `<span class="pill ${["completed"].includes(s) ? "green" : ["approved", "queued", "executing"].includes(s) ? "blue" : ["rejected", "skipped", "failed"].includes(s) ? "red" : "amber"}">${esc(human(String(s || "pending")))}</span>`;

  function chBtn(c, lead, selected) {
    const ok = !!(lead.available_channels || {})[c];
    return `<button type="button" class="gi-chb ${selected === c ? "on" : ""}" data-act="channel" data-c="${c}" ${ok ? "" : "disabled"} title="${ok ? "Use " + CHANNELS[c] + " for this lead" : c === "email" ? "Email is not connected to GLIME lead records yet." : CHANNELS[c] + " is not available for this lead."}">${CHANNELS[c]}</button>`;
  }
  function card(l) {
    const p = l.action_payload || {}, req = l.action_request_id, editable = req && ["proposed", "awaiting_approval"].includes(l.action_status);
    return `<article class="gi-lead" data-lead="${esc(l.lead_id)}" data-req="${esc(req || "")}">
      <div class="gi-lead-h"><div><b>${esc(l.name || "Unnamed lead")}</b><small>${esc(l.interest || l.product_service || "No interest recorded")} · ${esc(l.status || "unknown")}${l.mobile ? " · " + esc(l.mobile) : ""}</small></div>${badge(l.decision_status || "pending")}</div>
      <div class="gi-lead-l">Send via</div><div class="gi-chips">${Object.keys(CHANNELS).map(c => chBtn(c, l, p.channel)).join("")}</div>
      ${req ? `<div class="gi-lead-l">AI proposed message</div><div class="gi-pre">${esc(p.message || "Proposal created; message is not available yet.")}</div>
        <div class="gi-hint">${esc(l.target_module_slug || "Specialist")} · ${esc(l.target_action || "follow_up")} ${badge(l.action_status || "proposed")}${l.approval_required ? " · Approval required" : ""}</div>` : `<div class="gi-hint">Choose a channel to create the proposal for this lead.</div>`}
      ${l.skip_reason ? `<div class="gi-hint">Skipped for this decision: ${esc(l.skip_reason)}</div>` : ""}
      <div class="gi-lead-a">${editable ? `<button class="gi-btn2" data-act="edit">Edit</button><button class="gi-btn2 ok" data-act="approve">Approve &amp; queue</button><button class="gi-btn2 bad" data-act="reject">Reject</button>` : ""}
        ${l.decision_status === "skipped" ? `<button class="gi-btn2" data-act="restore">Restore</button>` : `<button class="gi-btn2" data-act="skip">Don't contact this lead</button>`}</div>
      <div class="gi-hint gi-lead-msg" aria-live="polite"></div></article>`;
  }

  async function load() {
    const host = $("#giLeadPanel"); if (!host || !S.d) return;
    const list = $(".gi-lead-list", host), info = $(".gi-lead-info", host); info.textContent = "Loading lead proposals…"; list.innerHTML = "";
    try {
      const r = await GI.rpc("get_client_decision_leads", { p_decision_id: S.d.decision_id, p_page: S.page, p_page_size: 20, p_search: S.search || null, p_channel: S.channel, p_status: S.status });
      if (!r || !r.ok) throw new Error((r && r.error) || "Could not load lead proposals.");
      S.rows = Array.isArray(r.rows) ? r.rows : [];
      info.textContent = S.rows.length ? `Showing ${S.rows.length} of ${r.total} matching leads.` : S.status === "skipped" ? "No skipped leads for this decision." : "No matching leads on this page.";
      list.innerHTML = S.rows.map(card).join("");
      $(".gi-page", host).textContent = `Page ${r.page} of ${r.total_pages || 1} · ${r.total} total`;
      $(".gi-prev", host).disabled = r.page <= 1; $(".gi-next", host).disabled = r.page >= (r.total_pages || 1);
    } catch (e) { info.textContent = "Could not load lead proposals: " + (e.message || e); }
  }

  async function act(btn) {
    const item = btn.closest("[data-lead]"), lead = S.rows.find(x => String(x.lead_id) === item.dataset.lead), msg = $(".gi-lead-msg", item), a = btn.dataset.act, req = item.dataset.req;
    const say = t => { msg.textContent = t; };
    try {
      if (a === "channel") {
        btn.disabled = true; say(req ? `Switching proposal to ${btn.dataset.c} and regenerating the draft…` : `Preparing ${btn.dataset.c} proposal…`);
        await GI.edge("client-decision-action-proposal", req ? { mode: "switch", decision_id: S.d.decision_id, lead_id: lead.lead_id, channel: btn.dataset.c, action_request_id: req } : { mode: "prepare", decision_id: S.d.decision_id, lead_id: lead.lead_id, channel: btn.dataset.c }, 90000);
        GI.toast(`Proposal ready for ${CHANNELS[btn.dataset.c]}. Your approval is still required.`); return load();
      }
      if (a === "skip") { if (!(await GI.confirm("Remove this lead from this decision's proposal list? The lead will NOT be deleted.", { title: "Don't contact this lead", confirmText: "Remove from list" }))) return; await GI.rpc("skip_client_decision_lead", { p_decision_id: S.d.decision_id, p_lead_id: lead.lead_id }); GI.toast("Lead skipped for this decision. It stays in Leads."); return load(); }
      if (a === "restore") { await GI.rpc("restore_client_decision_lead", { p_decision_id: S.d.decision_id, p_lead_id: lead.lead_id }); GI.toast("Lead restored for this decision."); return load(); }
      if (a === "approve") { if (!(await GI.confirm(`Approve this ${CHANNELS[(lead.action_payload || {}).channel] || ""} message for ${lead.name || "this lead"} and queue it to send?`, { title: "Approve & queue", confirmText: "Approve" }))) return; btn.disabled = true; say("Approving and queueing…"); const r = await GI.rpc("approve_client_business_action", { p_action_request_id: req }); GI.toast("Queued" + (r && r.job_id ? " (job " + String(r.job_id).slice(0, 8) + ")" : "") + "."); return load(); }
      if (a === "reject") { if (!(await GI.confirm("Reject this proposal? No message will be sent.", { title: "Reject proposal", confirmText: "Reject", danger: true }))) return; await GI.rpc("reject_client_business_action", { p_action_request_id: req }); GI.toast("Proposal rejected. Nothing was sent."); return load(); }
      if (a === "edit") {
        const cur = lead.action_payload || {}, fields = (cur.contract && cur.contract.editable_fields) || cur.editable_fields || [], patch = {};
        if (!fields.length) return say("No editable proposal fields are available.");
        if (fields.includes("message")) { const v = await GI.prompt("Edit the proposed message:", cur.message || "", { title: "Edit message", multiline: true, confirmText: "Save" }); if (v === null) return; patch.message = v; }
        if (fields.includes("target_reference")) { const v = await GI.prompt("Edit target reference:", cur.target_reference || lead.lead_id || "", { title: "Target reference" }); if (v === null) return; patch.target_reference = v; }
        if (fields.includes("scheduled_for")) { const v = await GI.prompt("Scheduled time (ISO format, leave empty to keep):", cur.scheduled_for || "", { title: "Schedule" }); if (v === null) return; if (v.trim()) patch.scheduled_for = v.trim(); }
        if (!Object.keys(patch).length) return say("No changes made.");
        await GI.rpc("update_client_action_proposal", { p_action_request_id: req, p_changes: patch }); GI.toast("Proposal updated. Your approval is still required."); return load();
      }
    } catch (e) { say("Could not complete: " + (e.message || GI.errText(e))); btn.disabled = false; }
  }

  GI.leads = {
    open(decision) {
      const host = $("#giLeadPanel"); if (!host) return;
      Object.assign(S, { d: decision, page: 1, search: "", channel: "all", status: "all" });
      host.innerHTML = `<div class="gi-box gi-leadbox"><div class="gi-dayh"><b>Lead proposals · ${esc(decision.title || "Decision")}</b><button class="gi-link" type="button" id="giLeadX">Close</button></div>
        <div class="gi-toolbar"><input class="gi-in gi-lead-search" type="search" placeholder="Search leads by name, mobile, interest…" aria-label="Search leads">
          <select class="gi-in gi-lead-ch" aria-label="Channel"><option value="all">All channels</option>${Object.entries(CHANNELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
          <select class="gi-in gi-lead-st" aria-label="Status"><option value="all">All statuses</option>${STATUSES.map(s => `<option value="${s}">${human(s)}</option>`).join("")}</select></div>
        <div class="gi-hint gi-lead-info"></div><div class="gi-lead-list"></div>
        <div class="gi-pager"><button class="gi-btn2 gi-prev">Previous</button><span class="gi-page gi-hint"></span><button class="gi-btn2 gi-next">Next</button></div></div>`;
      $("#giLeadX", host).onclick = () => { host.innerHTML = ""; S.d = null; };
      $(".gi-lead-search", host).oninput = e => { clearTimeout(timer); timer = setTimeout(() => { S.search = e.target.value.trim(); S.page = 1; load(); }, 350); };
      $(".gi-lead-ch", host).onchange = e => { S.channel = e.target.value; S.page = 1; load(); };
      $(".gi-lead-st", host).onchange = e => { S.status = e.target.value; S.page = 1; load(); };
      $(".gi-prev", host).onclick = () => { if (S.page > 1) { S.page--; load(); } };
      $(".gi-next", host).onclick = () => { S.page++; load(); };
      host.onclick = e => { const b = e.target.closest("[data-act]"); if (b && !b.disabled) act(b); };
      host.scrollIntoView({ behavior: GI.reduceMotion ? "auto" : "smooth", block: "start" });
      load();
    }
  };
})();
