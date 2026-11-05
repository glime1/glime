/* GI section 9 — Market Demand: what is selling more in the market, and what people want.
 * get_growth_market_demand(p_range) -> { meta:{generated_at, region, business_type, source, disclaimer},
 *   items:[{ topic, demand_index 0-100, trend_pct|null, momentum:'rising'|'steady'|'falling', in_catalog:true|false|null, evidence, source_url|null }],
 *   own_top:[{ name, units }] }
 * edge growth-market-demand { refresh:true } -> re-researches the market (AI + public sources), rate limited.
 * This is an AI-assisted estimate from public information. It is always labelled as such. */
(() => {
  "use strict";
  const { $, esc, isNum, num, cnt, stamp, IC } = GI;
  let busy = false;
  const MOM = { rising: ["up", "↑ Rising"], steady: ["", "→ Steady"], falling: ["down", "↓ Falling"] };
  const safeUrl = u => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };

  const ctrl = () => `<button class="gi-btn2" type="button" id="giMktRefresh" ${busy ? "disabled" : ""}>${IC.refresh} ${busy ? "Researching…" : "Refresh with AI"}</button>`;
  function wire(el) {
    const b = $("#giMktRefresh", el); if (!b) return;
    b.onclick = async () => {
      if (busy) return; busy = true; GI.paint("market"); GI.toast("Anaya's research is running. This can take up to a minute.");
      try { await GI.edge("growth-market-demand", { refresh: true }, 120000); busy = false; GI.toast("Market research updated."); GI.load("market"); }
      catch (e) { busy = false; GI.paint("market"); GI.toast(e.code === "FN_MISSING" ? "Market research is not set up yet." : GI.errText(e)); }
    };
  }

  function render(b, st) {
    const d = st.data || {}, items = (d.items || []).slice().sort((a, z) => (num(z.demand_index) || 0) - (num(a.demand_index) || 0)), meta = d.meta || {};
    if (!items.length) { b.innerHTML = `<div class="gi-state">No market research yet. Tap <b>Refresh with AI</b> to see what customers in your area and category are asking for.</div>`; return; }
    const gaps = items.filter(x => x.in_catalog === false && (x.momentum === "rising" || (num(x.demand_index) || 0) >= 60)).slice(0, 3);
    b.innerHTML = `${gaps.length ? `<div class="gi-advice good"><b>Opportunities you don't sell yet:</b> ${gaps.map(x => esc(x.topic)).join(" · ")}</div>` : ""}
      <div class="gi-mkt">${items.slice(0, 8).map((x, i) => { const mo = MOM[x.momentum] || MOM.steady, di = Math.max(0, Math.min(100, num(x.demand_index) || 0)), u = x.source_url && safeUrl(x.source_url);
        return `<div class="gi-mkt-r"><span class="rk">${i + 1}</span><div class="mid"><b>${esc(x.topic)}</b>${x.evidence ? `<small>${esc(x.evidence)}</small>` : ""}
          <div class="gi-meter"><div><i style="width:${di}%"></i></div><b>${Math.round(di)}</b></div></div>
          <div class="rt"><em class="${mo[0]}">${mo[1]}${isNum(num(x.trend_pct)) ? " " + Math.abs(Math.round(num(x.trend_pct))) + "%" : ""}</em>
          ${x.in_catalog === true ? `<span class="gi-tag ok">You sell this</span>` : x.in_catalog === false ? `<span class="gi-tag warn">Not in your catalog</span>` : ""}${u ? `<a class="gi-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">source</a>` : ""}</div></div>`; }).join("")}</div>
      ${(d.own_top || []).length ? `<p class="gi-hint">Your own top sellers: ${d.own_top.slice(0, 4).map(x => `${esc(x.name)} (${cnt(num(x.units) || 0)})`).join(", ")}.</p>` : ""}
      <p class="gi-hint">${esc(meta.disclaimer || "AI-assisted estimate from public information for your category and area. Demand index is relative (0–100), not a sales figure. Verify before big decisions.")}${meta.generated_at ? ` Updated ${esc(stamp(meta.generated_at))}.` : ""}${meta.region ? ` Area: ${esc(meta.region)}.` : ""}</p>`;
  }

  GI.register({
    id: "market", order: 9, short: "Market Demand", icon: IC.compass, title: "Market Demand", sub: "What the market is buying and asking for", rpc: "get_growth_market_demand", lazy: true, ctrl, wire,
    load: key => GI.rpc("get_growth_market_demand", { p_range: key }), render,
    context: st => { const d = st.data || {}; return (d.items || []).slice(0, 6).map(x => `${x.topic}: demand ${Math.round(num(x.demand_index) || 0)}/100, ${x.momentum || "steady"}, ${x.in_catalog === true ? "in catalog" : x.in_catalog === false ? "not in catalog" : "catalog unknown"}`).concat(["Source: AI-assisted estimate from public information"]); }
  });
})();
