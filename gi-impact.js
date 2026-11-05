/* GI section 2 — GLIME Action Impact.
 * get_client_action_impact_cards(p_limit) -> approved GLIME actions with before/after numbers.
 * Every card carries an honest verdict (positive / no change / mixed / too early). We never add
 * numbers together across actions and never claim an action caused a change. */
(() => {
  "use strict";
  const { $, $$, esc, isNum, cnt, human, stamp, IC } = GI;
  const LABEL = { customers: "Customers", paidOrders: "Paid orders", revenue: "Revenue", leads: "Leads (unverified)", enquiries: "Enquiries", newCustomers30d: "New customers (30d)" };
  const CH = {
    instagram: { icon: IC.ig, bg: "linear-gradient(135deg,#f9a03f,#e1306c 55%,#833ab4)", name: "Instagram" },
    whatsapp: { icon: IC.wa, bg: "#1fb66a", name: "WhatsApp" }, email: { icon: IC.mail, bg: "#2f7df6", name: "Email" }, other: { icon: IC.spark, bg: "#5b6b7d", name: "Other" }
  };
  const F = { status: "all", ch: "all", all: false };
  const chKey = a => { const c = String(a.channel || a.executor_module_slug || "").toLowerCase(); return c.startsWith("instagram") ? "instagram" : c.startsWith("whatsapp") ? "whatsapp" : c.startsWith("email") ? "email" : "other"; };
  const keysOf = a => Array.from(new Set([].concat(a.selected_metrics || [], Object.keys(a.metric_deltas || {})))).filter(k => !(a.baseline_metrics && typeof a.baseline_metrics[k] === "object" && a.baseline_metrics[k] !== null));
  function deltaOf(a, k) {
    const d = a.metric_deltas && a.metric_deltas[k], b = a.baseline_metrics && a.baseline_metrics[k], af = a.after_metrics && a.after_metrics[k];
    if (d && isNum(d.delta)) return d.delta; return isNum(b) && isNum(af) ? af - b : null;
  }
  const fmt = (k, v) => (!isNum(v) ? "—" : k === "revenue" ? GI.money(v) : cnt(v));
  const signed = (k, v) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(k, Math.abs(v));

  /* verdict = what we can honestly say about this action */
  function verdict(a) {
    if (a.impact_status === "pending") return a.awaiting_measurement ? { c: "amber", t: "Observation ended — measuring soon" } : { c: "amber", t: "Watching results" };
    if (a.impact_status === "insufficient_data") return { c: "blue", t: "Not enough data to judge fairly" };
    if (a.impact_status !== "measured") return { c: "blue", t: human(a.impact_status) };
    const ks = keysOf(a), ds = ks.map(k => deltaOf(a, k)).filter(isNum);
    if (!ds.length) return { c: "blue", t: "Measured, but no comparable numbers" };
    const pos = ds.some(d => d > 0), neg = ds.some(d => d < 0);
    const tiny = ks.reduce((s, k) => s + Math.abs(num0(a.baseline_metrics && a.baseline_metrics[k])), 0) < 3;
    if (!pos && !neg) return { c: "grey", t: "No visible change" };
    if (pos && !neg) return tiny ? { c: "green", t: "Early positive signal (small numbers)" } : { c: "green", t: "Positive signal" };
    if (neg && !pos) return { c: "red", t: "Negative signal" };
    return { c: "amber", t: "Mixed result" };
  }
  const num0 = v => (isNum(v) ? v : 0);
  const stat = (a, k) => { const v = deltaOf(a, k); return `<div>${v === null ? `<b class="nil">—</b>` : `<b class="${v > 0 ? "pos" : v < 0 ? "neg" : "nil"}">${v === 0 ? "0" : signed(k, v)}</b>`}<small>${LABEL[k] || human(k)}</small></div>`; };
  const foot = a => a.impact_status === "measured" ? "Measured on " + stamp(a.measured_at) : a.awaiting_measurement ? "Observation ended, awaiting measurement" : a.observation_until ? "Expected by " + stamp(a.observation_until) : "Observation window not set";

  function visible(list) {
    const q = GI.S.q.toLowerCase();
    return list.filter(a => (!q || (a.title + " " + (a.channel || "")).toLowerCase().includes(q))
      && (F.status === "all" || (F.status === "measured" ? a.impact_status === "measured" : a.impact_status !== "measured"))
      && (F.ch === "all" || chKey(a) === F.ch));
  }

  function render(b, st) {
    const all = st.data || [];
    if (!all.length) { b.innerHTML = `<div class="gi-state">No approved actions have been measured yet. Results appear here after a GLIME action runs and its observation window ends.</div>`; return; }
    const vs = all.map(verdict), n = c => vs.filter(v => v.c === c).length, measured = all.filter(a => a.impact_status === "measured").length;
    const bad = all.filter((a, i) => vs[i].c === "red" || (vs[i].c === "amber" && a.impact_status === "measured")).length;
    const strip = [["Measured", measured, ""], ["Waiting", all.length - measured, "amber"], ["Positive signal", n("green"), "green"], ["No change", n("grey"), ""], ["Negative / mixed", bad, "red"]]
      .map(([l, v, c]) => `<div class="gi-mini ${c}"><small>${l}</small><b>${v}</b></div>`).join("");
    const chs = Array.from(new Set(all.map(chKey)));
    const chips = (items, cur, key) => items.map(([v, l]) => `<button type="button" class="${cur === v ? "on" : ""}" data-f="${key}:${v}">${l}</button>`).join("");
    const list = visible(all), shown = F.all ? list : list.slice(0, 6);
    const cards = shown.map(a => {
      const c = CH[chKey(a)], v = verdict(a), ks = keysOf(a), pri = ks.filter(k => ["customers", "paidOrders", "revenue"].includes(k)), use = pri.length ? pri : ks.slice(0, 3);
      return `<article class="gi-imp ${a.impact_status === "measured" ? "measured" : ""}"><div class="gi-imp-h"><span class="lg" style="background:${c.bg}">${c.icon}</span><b>${esc(a.title)}</b></div>
        <div class="gi-verdict ${v.c}"><i></i>${esc(v.t)}</div>
        ${a.impact_status === "measured" ? `<div class="gi-stats">${use.slice(0, 3).map(k => stat(a, k)).join("")}</div>` : ""}
        <div class="gi-imp-f">${esc(foot(a))}</div><button class="gi-btn" type="button" data-id="${esc(a.impact_id)}">View details →</button></article>`;
    }).join("");
    b.innerHTML = `<div class="gi-minis five">${strip}</div>
      <div class="gi-filters"><div class="gi-chips">${chips([["all", "All"], ["measured", "Measured"], ["waiting", "Waiting"]], F.status, "status")}</div>
        ${chs.length > 1 ? `<div class="gi-chips">${chips([["all", "Any channel"]].concat(chs.map(k => [k, CH[k].name])), F.ch, "ch")}</div>` : ""}</div>
      ${shown.length ? `<div class="gi-imp-grid">${cards}</div>` : `<div class="gi-state">No actions match these filters.</div>`}
      ${list.length > 6 ? `<button class="gi-link gi-more-btn" type="button" id="giImpAll">${F.all ? "Show less" : `View all ${list.length} actions`} →</button>` : ""}
      <p class="gi-hint">A result is the observed change after an action. It does not by itself prove the action caused it.</p>`;
    $$("[data-f]", b).forEach(x => { x.onclick = () => { const [k, v] = x.dataset.f.split(":"); F[k] = v; GI.redraw("impact"); }; });
    const all2 = $("#giImpAll", b); if (all2) all2.onclick = () => { F.all = !F.all; GI.redraw("impact"); };
    $$(".gi-btn[data-id]", b).forEach(x => { x.onclick = () => modal(all.find(a => String(a.impact_id) === x.dataset.id)); });
  }

  function modal(a) {
    if (!a) return; const v = verdict(a);
    const rows = keysOf(a).map(k => { const d = deltaOf(a, k), bs = a.baseline_metrics && a.baseline_metrics[k], af = a.after_metrics && a.after_metrics[k];
      return `<div class="row"><span>${esc(LABEL[k] || human(k))}</span><b>${fmt(k, bs)} → ${fmt(k, af)} <em class="${d > 0 ? "" : "neg"}">${d === null ? "" : (d > 0 ? "+" : d < 0 ? "−" : "") + fmt(k, Math.abs(d))}</em></b></div>`; }).join("");
    const md = GI.modal(`<h3>${esc(a.title)}</h3><div class="gi-verdict ${v.c}"><i></i>${esc(v.t)}</div>
      <p>${a.job_completed_at ? "Action completed " + esc(stamp(a.job_completed_at)) + ". " : ""}${a.observation_days ? `Watched for ${esc(a.observation_days)} days${a.observation_until ? " (until " + esc(stamp(a.observation_until)) + ")" : ""}.` : ""}</p>
      ${rows || "<p>No measured values yet.</p>"}${a.summary ? `<p>${esc(a.summary)}</p>` : ""}
      <p class="gi-hint">${esc(a.causality_note || "Observed change after an action does not by itself prove the action caused it.")}</p>
      <button class="gi-ask wide" type="button" id="giImpAsk"><img class="gi-av" src="${GI.ANAYA_IMG}" alt="" width="20" height="20"><span>Ask Anaya about this action</span></button>`);
    $("#giImpAsk", md).onclick = () => {
      GI.closeModal();
      GI.askAnaya("impact", { question: `Explain the result of the action "${a.title}" and tell me what to do next.`, lines: [`Action: ${a.title}`, `Verdict: ${v.t}`].concat(keysOf(a).map(k => `${LABEL[k] || human(k)}: ${fmt(k, a.baseline_metrics && a.baseline_metrics[k])} before, ${fmt(k, a.after_metrics && a.after_metrics[k])} after`)) });
    };
  }

  GI.on("search", () => { if (GI.st.impact.s === "ok") GI.redraw("impact"); });
  GI.register({
    id: "impact", order: 2, short: "Action Impact", icon: IC.target, title: "GLIME Action Impact", sub: "Real results from approved GLIME actions", rpc: "get_client_action_impact_cards",
    load: async () => { const d = await GI.rpc("get_client_action_impact_cards", { p_limit: 20 }); return Array.isArray(d) ? d : []; },
    render,
    context: st => { const all = st.data || []; return [`Approved actions tracked: ${all.length}`].concat(all.slice(0, 6).map(a => `${a.title}: ${verdict(a).t}`)); }
  });
})();
