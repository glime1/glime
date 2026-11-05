/* GI section 5 — Channel ROI.
 * get_growth_channel_roi(p_range) -> { meta:{currency, ai_cost_available}, channels:[{ channel, leads, won, orders, paid_orders,
 *   revenue|null, avg_first_response_seconds|null, ai_messages|null, ai_cost|null, lead_to_won_pct|null }] }
 * Shows which channel earns the most, converts best and replies fastest. Missing values stay "—". */
(() => {
  "use strict";
  const { esc, isNum, num, cnt, human, IC } = GI;
  const META = {
    instagram: { icon: IC.ig, bg: "linear-gradient(135deg,#f9a03f,#e1306c 55%,#833ab4)", n: "Instagram" }, whatsapp: { icon: IC.wa, bg: "#1fb66a", n: "WhatsApp" },
    voice: { icon: IC.phone, bg: "#a06bff", n: "Voice AI" }, website: { icon: IC.globe, bg: "#3aa0ff", n: "Website" }, manual: { icon: IC.users, bg: "#5b6b7d", n: "Manual" }
  };
  const m = c => META[c] || { icon: IC.spark, bg: "#5b6b7d", n: human(c) };
  const dur = s => (!isNum(s) ? "—" : s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + " min" : (s / 3600).toFixed(1) + " h");
  const active = c => (num(c.leads) || 0) + (num(c.orders) || 0) + (num(c.won) || 0) > 0;

  function render(b, st) {
    const d = st.data || {}, all = (d.channels || []).filter(active), cur = d.meta && d.meta.currency;
    if (!all.length) { b.innerHTML = `<div class="gi-state">No channel activity in this range yet.</div>`; return; }
    const pick = (f, better) => { const c = all.filter(x => isNum(num(f(x)))); if (c.length < 2) return null; return c.reduce((a, x) => (better(num(f(x)), num(f(a))) ? x : a)); };
    const bestRev = pick(x => x.revenue, (a, z) => a > z), bestConv = pick(x => ((num(x.leads) || 0) >= 5 ? x.lead_to_won_pct : null), (a, z) => a > z), fastest = pick(x => x.avg_first_response_seconds, (a, z) => a < z);
    const tr = all.reduce((s, x) => s + (num(x.revenue) || 0), 0);
    const cards = all.map(c => {
      const k = m(c.channel), tags = [bestRev === c && "Top revenue", bestConv === c && "Best conversion", fastest === c && "Fastest reply"].filter(Boolean);
      const rev = num(c.revenue), cost = num(c.ai_cost), roi = isNum(rev) && isNum(cost) && cost > 0 ? rev / cost : null, conv = num(c.lead_to_won_pct);
      return `<article class="gi-ch"><div class="gi-ch-h"><span class="lg" style="background:${k.bg}">${k.icon}</span><b>${esc(k.n)}</b></div>
        ${tags.length ? `<div class="gi-tags">${tags.map(t => `<span class="gi-tag">${t}</span>`).join("")}</div>` : ""}
        <div class="gi-big">${isNum(rev) ? GI.money(rev, cur || undefined) : `<span class="gi-na">Not tracked</span>`}</div><small class="gi-sm">revenue collected${isNum(rev) && tr > 0 ? ` · ${Math.round(rev / tr * 100)}% of total` : ""}</small>
        <div class="gi-stats four"><div><b>${cnt(num(c.leads) || 0)}</b><small>Leads</small></div><div><b>${cnt(num(c.won) || 0)}</b><small>Won</small></div><div><b>${cnt(num(c.orders) || 0)}</b><small>Orders</small></div><div><b>${cnt(num(c.paid_orders) || 0)}</b><small>Paid</small></div></div>
        <div class="gi-meter"><span>Lead → won</span><div><i style="width:${Math.min(100, conv || 0)}%"></i></div><b>${isNum(conv) ? conv.toFixed(0) + "%" : "—"}</b></div>
        <div class="gi-kv"><span>First reply</span><b>${dur(num(c.avg_first_response_seconds))}</b></div>
        ${d.meta && d.meta.ai_cost_available ? `<div class="gi-kv"><span>AI cost</span><b>${isNum(cost) ? GI.money(cost, cur || undefined) : "—"}</b></div><div class="gi-kv"><span>Revenue per ₹1 of AI</span><b>${isNum(roi) ? roi.toFixed(1) + "×" : "—"}</b></div>` : ""}</article>`;
    }).join("");
    b.innerHTML = `<div class="gi-chgrid">${cards}</div><p class="gi-hint">Revenue is shown only where payments are tracked. A lead's channel is the channel it first came from.</p>`;
  }

  GI.register({
    id: "channels", order: 5, short: "Channel ROI", icon: IC.share, title: "Channel ROI", sub: "Which channel earns you the most", rpc: "get_growth_channel_roi", lazy: true, ranged: true,
    load: key => GI.rpc("get_growth_channel_roi", { p_range: key }), render,
    context: st => ((st.data && st.data.channels) || []).filter(active).map(c => `${m(c.channel).n}: ${num(c.leads) || 0} leads, ${num(c.won) || 0} won, ${num(c.orders) || 0} orders, revenue ${isNum(num(c.revenue)) ? GI.money(num(c.revenue)) : "not tracked"}, first reply ${dur(num(c.avg_first_response_seconds))}`)
  });
})();
