/* GI section 4 — Decisions & Next Actions.
 * get_client_decision_action_center()            -> decisions (+ their action proposal state)
 * create_client_decision_action_proposal(p_decision_id)
 * approve_client_business_action / reject_client_business_action(p_action_request_id)
 * Every approve / reject asks for confirmation in a GLIME-themed dialog. Nothing runs without the client. */
(() => {
  "use strict";
  const { $, $$, esc, isNum, num, human, stamp, IC } = GI;
  const LEAD_TYPES = ["repeat_customer_reengagement", "low_repeat_rate", "lead_followup_review"];
  const PRI = { critical: ["red", "▲ Critical"], high: ["red", "▲ High"], medium: ["amber", "◆ Medium"], low: ["blue", "▼ Low"] };
  const STC = { proposed: "amber", awaiting_approval: "amber", pending_review: "amber", open: "amber", pending: "amber", approved: "blue", queued: "blue", executing: "blue", in_progress: "blue", completed: "green", rejected: "red", failed: "red", skipped: "red", dismissed: "red" };
  const P = { all: false, menu: null, pri: {} };
  const rowStatus = d => (d.action_request_id ? d.action_status : d.decision_status);
  const canDecide = d => d.action_request_id && ["proposed", "awaiting_approval"].includes(d.action_status);
  const isLead = d => LEAD_TYPES.includes(String((d.next_best_action && (d.next_best_action.type || d.next_best_action.action_type)) || "").toLowerCase());
  const conf = c => { const v = num(c); return v === null ? "—" : Math.round(v <= 1 ? v * 100 : v) + "%"; };
  const find = id => (GI.st.decisions.data || []).find(x => String(x.decision_id) === String(id));

  function menu(d) {
    const id = esc(d.decision_id), it = [`<button data-a="details" data-id="${id}">View details</button>`];
    if (isLead(d)) it.push(`<button data-a="leads" data-id="${id}">Manage lead proposals</button>`);
    else if (!d.action_request_id) it.push(`<button data-a="prepare" data-id="${id}">Prepare action</button>`);
    if (canDecide(d)) it.push(`<button data-a="approve" data-id="${id}">Approve &amp; queue</button><button data-a="reject" data-id="${id}">Reject</button>`);
    return `<div class="gi-menu">${it.join("")}</div>`;
  }

  function render(b, st) {
    const q = GI.S.q.toLowerCase(), all = (st.data || []).filter(d => !q || ((d.title || "") + " " + (d.recommendation || "")).toLowerCase().includes(q));
    if (!all.length) { b.innerHTML = `<div class="gi-state">${(st.data || []).length ? "No decisions match your search." : "No business decisions yet. GLIME adds recommendations here when it finds a verified signal."}</div><div id="giLeadPanel"></div>`; return; }
    const rows = P.all ? all : all.slice(0, 3);
    b.innerHTML = `<div class="gi-tw"><table class="gi-tb"><thead><tr><th>Priority</th><th>Recommendation</th><th>Confidence</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
      ${rows.map(d => { const p = PRI[P.pri[d.decision_id]], s = rowStatus(d), id = esc(d.decision_id);
        return `<tr><td>${p ? `<span class="pill ${p[0]}">${p[1]}</span>` : `<span class="gi-dash">—</span>`}</td>
        <td><button class="gi-rec" type="button" data-id="${id}">${esc(d.title || "Business decision")}</button>${d.recommendation ? `<small class="gi-rs">${esc(d.recommendation)}</small>` : ""}</td>
        <td>${conf(d.confidence)}</td><td><span class="pill ${STC[s] || "blue"}">${esc(human(s))}</span></td><td>${esc(stamp(d.decision_created_at))}</td>
        <td class="gi-mc"><button class="gi-more" type="button" data-id="${id}" aria-label="Actions" aria-haspopup="true">…</button>${P.menu === String(d.decision_id) ? menu(d) : ""}</td></tr>`; }).join("")}
      </tbody></table></div>
      ${all.length > 3 ? `<button class="gi-link gi-more-btn" type="button" id="giDecAll">${P.all ? "Show less" : "View all recommendations"} →</button>` : ""}
      <div id="giLeadPanel"></div>`;
    const a = $("#giDecAll", b); if (a) a.onclick = () => { P.all = !P.all; GI.redraw("decisions"); };
    $$(".gi-rec", b).forEach(x => { x.onclick = () => modal(find(x.dataset.id)); });
    $$(".gi-more", b).forEach(x => { x.onclick = e => { e.stopPropagation(); P.menu = P.menu === x.dataset.id ? null : x.dataset.id; GI.redraw("decisions"); }; });
    $$(".gi-menu button", b).forEach(x => { x.onclick = e => { e.stopPropagation(); decide(x.dataset.a, find(x.dataset.id)); }; });
  }

  async function decide(a, d) {
    P.menu = null; GI.redraw("decisions"); if (!d) return;
    if (a === "details") return modal(d);
    if (a === "leads") { if (GI.leads) { GI.leads.open(d); } return; }
    if (a === "approve" && !(await GI.confirm("Approve this proposal and queue it for execution?", { title: "Approve & queue", confirmText: "Approve" }))) return;
    if (a === "reject" && !(await GI.confirm("Reject this proposal? No action will be executed.", { title: "Reject proposal", confirmText: "Reject", danger: true }))) return;
    try {
      if (a === "prepare") { const r = await GI.rpc("create_client_decision_action_proposal", { p_decision_id: d.decision_id }); GI.toast(r && r.proposal_created ? "Action proposal created. Your approval is still required." : "No proposal created: " + ((r && r.evaluation && r.evaluation.reason) || "no enabled specialist action is available.")); }
      else if (a === "approve") { const r = await GI.rpc("approve_client_business_action", { p_action_request_id: d.action_request_id }); GI.toast("Approved and queued" + (r && r.job_id ? " (job " + String(r.job_id).slice(0, 8) + ")" : "") + "."); }
      else if (a === "reject") { await GI.rpc("reject_client_business_action", { p_action_request_id: d.action_request_id }); GI.toast("Proposal rejected. Nothing was executed."); }
      await Promise.all([GI.load("decisions", true), GI.load("impact", true)]);
    } catch (e) { GI.toast("Could not complete: " + (e.message || e)); }
  }

  function modal(d) {
    if (!d) return;
    const nb = d.next_best_action && typeof d.next_best_action === "object" ? Object.entries(d.next_best_action).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)) : [];
    const sec = (l, v) => (v ? `<div class="row blk"><span>${l}</span><p>${esc(v)}</p></div>` : "");
    const md = GI.modal(`<h3>${esc(d.title || "Business decision")}</h3><p><span class="pill ${STC[rowStatus(d)] || "blue"}">${esc(human(rowStatus(d)))}</span> Confidence ${conf(d.confidence)} · Source ${esc(d.source || "—")} · ${esc(stamp(d.decision_created_at))}</p>
      ${sec("Problem", d.problem)}${sec("Root cause", d.root_cause)}${sec("Recommendation", d.recommendation)}
      ${nb.length ? `<div class="row blk"><span>Next best action</span><ul>${nb.map(([k, v]) => `<li>${esc(human(k))}: ${esc(v)}</li>`).join("")}</ul></div>` : ""}
      ${d.action_request_id ? `<div class="row"><span>Action</span><b>${esc(d.target_module_slug || "Specialist")} · ${esc(d.target_action || "action")} · ${esc(human(d.action_status))}</b></div>` : ""}
      ${d.impact_summary ? sec("Impact", d.impact_summary) : ""}
      <button class="gi-ask wide" type="button" id="giDecAsk"><img class="gi-av" src="${GI.ANAYA_IMG}" alt="" width="20" height="20"><span>Ask Anaya about this decision</span></button>`);
    $("#giDecAsk", md).onclick = () => { GI.closeModal(); GI.askAnaya("decisions", { question: `Explain this recommendation in simple words and tell me whether I should approve it: "${d.title || "Business decision"}"`, lines: [`Decision: ${d.title}`, d.problem && `Problem: ${d.problem}`, d.root_cause && `Root cause: ${d.root_cause}`, d.recommendation && `Recommendation: ${d.recommendation}`, `Confidence: ${conf(d.confidence)}`, `Status: ${human(rowStatus(d))}`].filter(Boolean) }); };
  }

  document.addEventListener("click", () => { if (P.menu) { P.menu = null; if (GI.st.decisions.s === "ok") GI.redraw("decisions"); } });
  GI.on("search", () => { if (GI.st.decisions.s === "ok") GI.redraw("decisions"); });
  GI.on("insights", list => { P.pri = {}; (Array.isArray(list) ? list : []).forEach(i => { if (i.decision_id && !P.pri[i.decision_id]) P.pri[i.decision_id] = i.priority; }); if (GI.st.decisions.s === "ok") GI.redraw("decisions"); });

  GI.register({
    id: "decisions", order: 4, short: "Decisions", icon: IC.bolt, title: "Decisions &amp; Next Actions", sub: "GLIME's recommendations to grow your business", rpc: "get_client_decision_action_center",
    load: async () => { const d = await GI.rpc("get_client_decision_action_center"); return Array.isArray(d) ? d : []; },
    render,
    context: st => (st.data || []).slice(0, 5).map(d => `${d.title || "Decision"} — ${human(rowStatus(d))}, confidence ${conf(d.confidence)}${d.recommendation ? ". " + d.recommendation : ""}`)
  });
})();
