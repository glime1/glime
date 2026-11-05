/* GI section 3 — Evidence & Confidence.
 * get_client_evidence_metrics() -> { metrics:[{key,label,value,unit,confidence_level,sample_size,sample_label,
 *   window_days,currency,mixed_currency,definition,limitation,next_level_at?}], meta:{note} }
 * Confidence reflects sample size only. It never claims causation. */
(() => {
  "use strict";
  const { $, $$, esc, isNum, num, cnt, IC } = GI;
  const CONF = { high: ["#19e68c", "High Confidence", 3], medium: ["#ff9a2e", "Medium Confidence", 2], low: ["#ff4d5e", "Low Confidence", 1], insufficient_data: ["#6b7886", "Not enough data", 0] };
  let open = null;

  function ring(pct, color, text) {
    const R = 26, C = 2 * Math.PI * R, p = isNum(pct) ? Math.max(0, Math.min(100, pct)) : 0;
    return `<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${R}" fill="none" stroke="rgba(128,140,155,.22)" stroke-width="6"/>
      <circle cx="32" cy="32" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C * p / 100} ${C}" transform="rotate(-90 32 32)"/>
      <text x="32" y="36" text-anchor="middle" class="gi-dn" font-size="${text.length > 5 ? 10.5 : 13}" font-weight="700">${esc(text)}</text></svg>`;
  }
  const metricText = e => { const v = num(e.value); return v === null ? "—" : e.unit === "percent" ? Math.round(v) + "%" : e.mixed_currency ? "Mixed" : GI.money(v, e.currency || undefined, true); };

  function render(b, st) {
    const list = (st.data && st.data.metrics) || [];
    if (!list.length) { b.innerHTML = `<div class="gi-state">No evidence metrics available yet.</div>`; return; }
    const good = list.filter(e => (CONF[e.confidence_level] || CONF.insufficient_data)[2] >= 2).length;
    const o = list.find(e => e.key === open);
    const cards = list.map(e => {
      const [color, label] = CONF[e.confidence_level] || CONF.insufficient_data, pct = e.unit === "percent";
      return `<button type="button" class="gi-evc ${open === e.key ? "on" : ""}" data-k="${esc(e.key)}" aria-expanded="${open === e.key}"><b>${esc(e.label)}</b>
        <div class="gi-evr">${ring(pct ? num(e.value) : 0, color, metricText(e))}<div><strong style="color:${color}">${label}</strong><small>Based on ${cnt(e.sample_size || 0)} ${esc(e.sample_label || "records")}${e.window_days ? ` · last ${e.window_days} days` : ""}</small></div></div></button>`;
    }).join("");
    const detail = o ? `<div class="gi-evx"><b>${esc(o.label)}</b><br>${esc(o.definition || "")}<br><span class="lim">Limitation: ${esc(o.limitation || "—")}</span>${isNum(num(o.next_level_at)) ? `<br><span class="nxt">To raise confidence: about ${cnt(Math.max(0, num(o.next_level_at) - (num(o.sample_size) || 0)))} more ${esc(o.sample_label || "records")} needed.</span>` : ""}</div>` : "";
    b.innerHTML = `<div class="gi-ready"><b>${good} of ${list.length}</b> measures have medium or high confidence. <span>${good === list.length ? "Your data is strong enough to act on." : "Low-confidence measures are directional only. Treat them as hints, not proof."}</span></div>
      <div class="gi-ev">${cards}</div>${detail}<p class="gi-hint">${esc((st.data.meta && st.data.meta.note) || "Confidence reflects sample size only. It does not prove causation.")}</p>`;
    $$(".gi-evc", b).forEach(x => { x.onclick = () => { open = open === x.dataset.k ? null : x.dataset.k; GI.redraw("evidence"); }; });
  }

  GI.register({
    id: "evidence", order: 3, short: "Evidence", icon: IC.bars, title: "Evidence &amp; Confidence", sub: "What the data tells us and how confident we are", rpc: "get_client_evidence_metrics",
    load: async () => { const d = await GI.rpc("get_client_evidence_metrics"); return d && typeof d === "object" ? d : { metrics: [] }; },
    render,
    context: st => ((st.data && st.data.metrics) || []).map(e => `${e.label}: ${metricText(e)} — ${(CONF[e.confidence_level] || CONF.insufficient_data)[1]} (${e.sample_size || 0} ${e.sample_label || "records"})`)
  });
})();
