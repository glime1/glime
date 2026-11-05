/* GI section 6 — Product & Service Winners.
 * get_growth_product_performance(p_range) -> { meta:{currency, tracked}, items:[{ key, name, type, orders, units, revenue,
 *   share_pct, trend_pct|null, prev_units|null, repeat_customers|null }] }
 * What is selling, what is slowing down. Trend is shown only when the previous period had sales. */
(() => {
  "use strict";
  const { $$, esc, isNum, num, cnt, IC } = GI;
  const M = { by: "revenue" };
  const val = (x, by) => num(by === "units" ? x.units : x.revenue) || 0;
  const fmt = (x, by, cur) => (by === "units" ? cnt(val(x, by)) + " sold" : GI.money(val(x, by), cur || undefined));
  const trend = x => (isNum(num(x.trend_pct)) ? `<em class="${num(x.trend_pct) >= 0 ? "up" : "down"}">${num(x.trend_pct) >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(num(x.trend_pct)))}%</em>` : "");

  function render(b, st) {
    const d = st.data || {}, items = d.items || [], cur = d.meta && d.meta.currency, by = M.by;
    if (d.meta && d.meta.tracked === false) { b.innerHTML = `<div class="gi-state">Orders are not linked to your products or services yet, so winners cannot be ranked. Add items to your orders to unlock this.</div>`; return; }
    if (!items.length) { b.innerHTML = `<div class="gi-state">No product or service sales in this range yet.</div>`; return; }
    const top = items.slice().sort((a, z) => val(z, by) - val(a, by)).slice(0, 6), mx = Math.max(...top.map(x => val(x, by)), 1);
    const slow = items.filter(x => isNum(num(x.trend_pct)) && num(x.trend_pct) < 0).sort((a, z) => num(a.trend_pct) - num(z.trend_pct)).slice(0, 4);
    b.innerHTML = `<div class="gi-seg-tabs" role="tablist"><button type="button" class="${by === "revenue" ? "on" : ""}" data-by="revenue">By revenue</button><button type="button" class="${by === "units" ? "on" : ""}" data-by="units">By units sold</button></div>
      <div class="gi-two"><div class="gi-box"><h3>Top sellers</h3><div class="gi-bars">${top.map((x, i) => `<div class="gi-bar"><span title="${esc(x.name)}">${esc(x.name)}${x.type === "service" ? ' <small class="gi-sm">service</small>' : ""}</span><div><i style="width:${Math.max(3, val(x, by) / mx * 100)}%;background:${["#19e68c", "#3aa0ff", "#a06bff", "#ff9a2e", "#ff4d8d", "#2ec4b6"][i % 6]}"></i></div><b>${fmt(x, by, cur)} ${trend(x)}</b></div>`).join("")}</div></div>
      <div class="gi-box"><h3>Slowing down</h3>${slow.length ? `<ul class="gi-plain">${slow.map(x => `<li><b>${esc(x.name)}</b><span>${num(x.prev_units) != null ? `${cnt(num(x.prev_units))} → ${cnt(num(x.units) || 0)} sold` : ""} ${trend(x)}</span></li>`).join("")}</ul>` : `<div class="gi-state">Nothing is clearly slowing down in this range.</div>`}</div></div>
      <p class="gi-hint">Trend compares with the previous period of the same length and is hidden when there were no sales to compare.</p>`;
    $$("[data-by]", b).forEach(x => { x.onclick = () => { M.by = x.dataset.by; GI.redraw("products"); }; });
  }

  GI.register({
    id: "products", order: 6, short: "Winners", icon: IC.box, title: "Product &amp; Service Winners", sub: "What is selling, and what is slowing down", rpc: "get_growth_product_performance", lazy: true, ranged: true,
    load: key => GI.rpc("get_growth_product_performance", { p_range: key }), render,
    context: st => { const d = st.data || {}, cur = d.meta && d.meta.currency; return (d.items || []).slice().sort((a, z) => val(z, "revenue") - val(a, "revenue")).slice(0, 6).map(x => `${x.name}: ${cnt(num(x.units) || 0)} sold, ${GI.money(num(x.revenue) || 0, cur || undefined)}${isNum(num(x.trend_pct)) ? `, trend ${Math.round(num(x.trend_pct))}%` : ""}`); }
  });
})();
