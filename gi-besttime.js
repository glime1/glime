/* GI section 8 — Best Time to Reach Customers.
 * get_growth_best_time(p_range) -> { meta:{timezone:'Asia/Kolkata', sample}, matrix:[{ dow:0-6 (0=Monday), hour:0-23, inbound, won, orders }] }
 * A heatmap of when customers write, convert and order. The advice sentence is computed from the data only. */
(() => {
  "use strict";
  const { $$, esc, num, cnt, IC } = GI;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const M = { m: "inbound" };
  const LAB = { inbound: "Customer messages", won: "Leads won", orders: "Orders" };
  const hl = h => { const x = ((h % 24) + 24) % 24; return x === 0 ? "12 AM" : x < 12 ? x + " AM" : x === 12 ? "12 PM" : (x - 12) + " PM"; };

  function grid(d, key) {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0));
    (d.matrix || []).forEach(c => { if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) g[c.dow][c.hour] += num(c[key]) || 0; });
    return g;
  }
  function render(b, st) {
    const d = st.data || {}, key = M.m, g = grid(d, key), flat = [];
    g.forEach((r, i) => r.forEach((v, h) => { if (v > 0) flat.push({ i, h, v }); }));
    const total = flat.reduce((s, x) => s + x.v, 0), sample = num(d.meta && d.meta.sample) || total;
    const tabs = `<div class="gi-seg-tabs">${Object.keys(LAB).map(k => `<button type="button" class="${k === key ? "on" : ""}" data-m="${k}">${LAB[k]}</button>`).join("")}</div>`;
    if (!total) { b.innerHTML = tabs + `<div class="gi-state">No ${LAB[key].toLowerCase()} recorded in this range yet.</div>`; wire(b); return; }
    const mx = Math.max(...flat.map(x => x.v)), top = flat.slice().sort((a, z) => z.v - a.v).slice(0, 3);
    const dayTot = g.map(r => r.reduce((s, v) => s + v, 0)), bd = dayTot.indexOf(Math.max(...dayTot));
    let cells = `<div class="gi-hm-c corner"></div>` + Array.from({ length: 24 }, (_, h) => `<div class="gi-hm-c hh">${h % 3 === 0 ? hl(h).replace(" ", "") : ""}</div>`).join("");
    g.forEach((r, i) => { cells += `<div class="gi-hm-c dd">${DAYS[i]}</div>` + r.map((v, h) => `<div class="gi-hm-c" style="${v ? `background:rgba(25,230,140,${(0.14 + 0.86 * v / mx).toFixed(2)})` : ""}" title="${DAYS[i]} ${hl(h)}–${hl(h + 1)}: ${v} ${LAB[key].toLowerCase()}"></div>`).join(""); });
    b.innerHTML = `${tabs}<div class="gi-hm-wrap"><div class="gi-hm" role="img" aria-label="Heatmap of ${LAB[key]} by day and hour">${cells}</div></div>
      <div class="gi-advice"><b>Best slots:</b> ${top.map(x => `${DAYS[x.i]} ${hl(x.h)}–${hl(x.h + 1)} (${cnt(x.v)})`).join(" · ")}<br><span>${DAYS[bd]} is your busiest day. Send follow-ups and offers just before these slots so you are first in the chat.</span></div>
      <p class="gi-hint">Times are in ${esc((d.meta && d.meta.timezone) || "Asia/Kolkata")}. Based on ${cnt(sample)} ${LAB[key].toLowerCase()}.${sample < 30 ? " This is a small sample, so treat the pattern as a hint." : ""}</p>`;
    wire(b);
  }
  const wire = b => $$("[data-m]", b).forEach(x => { x.onclick = () => { M.m = x.dataset.m; GI.redraw("besttime"); }; });

  GI.register({
    id: "besttime", order: 8, short: "Best Time", icon: IC.clock, title: "Best Time to Reach Customers", sub: "When customers write, convert and order", rpc: "get_growth_best_time", lazy: true, ranged: true,
    load: key => GI.rpc("get_growth_best_time", { p_range: key }), render,
    context: st => { const d = st.data || {}, out = []; ["inbound", "won", "orders"].forEach(k => { const f = []; grid(d, k).forEach((r, i) => r.forEach((v, h) => { if (v > 0) f.push({ i, h, v }); })); f.sort((a, z) => z.v - a.v); if (f.length) out.push(`Top ${LAB[k].toLowerCase()} slots: ` + f.slice(0, 3).map(x => `${DAYS[x.i]} ${hl(x.h)} (${x.v})`).join(", ")); }); return out; }
  });
})();
