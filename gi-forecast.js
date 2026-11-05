/* GI section 11 — Forecast & Goals.
 * get_growth_forecast(p_horizon_days) -> { meta:{method, confidence, history_days, enough_data, currency},
 *   history:[{date,revenue,orders}], forecast:[{date,revenue,orders,low,high}], totals:{expected_revenue,low,high,expected_orders} }
 * get_growth_goals() -> [{ id, metric, target, period_start, period_end, current, progress_pct, expected_pct_today, status }]
 * set_growth_goal(p_metric,p_target,p_period_start,p_period_end) / delete_growth_goal(p_id)
 * A forecast is shown only when there is enough history. It is a range, never a promise. */
(() => {
  "use strict";
  const { $, $$, esc, isNum, num, cnt, dayLabel, stamp, human, IC } = GI;
  const M = { m: "revenue" };
  const METRICS = { revenue: "Revenue", orders: "Orders", leads: "New leads", customers: "New customers" };
  const ST = { achieved: ["green", "Achieved"], ahead: ["green", "Ahead"], on_track: ["blue", "On track"], behind: ["amber", "Behind"], missed: ["red", "Missed"] };
  const fmtM = (k, v) => (k === "revenue" ? GI.money(v) : cnt(v));
  const ist = () => new Date(Date.now() + 5.5 * 3600e3);
  const iso = d => d.toISOString().slice(0, 10);

  function chart(f) {
    const key = M.m, hist = (f.history || []).slice(-30), fc = f.forecast || [], all = hist.concat(fc), n = all.length;
    if (n < 2) return `<div class="gi-state">Not enough points to draw a chart yet.</div>`;
    const W = 640, H = 230, m = { l: 48, r: 14, t: 12, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b, band = key === "revenue";
    const vals = all.map(x => num(x[key]) || 0).concat(band ? fc.map(x => num(x.high) || 0) : []);
    const step = GI.niceStep(Math.max(...vals, 1) / 4), mx = step * 4, X = i => m.l + (i / (n - 1)) * iw, Y = v => m.t + ih - (v / mx) * ih;
    const hp = hist.map((x, i) => [X(i), Y(num(x[key]) || 0)]), fp = [hp[hp.length - 1]].concat(fc.map((x, i) => [X(hist.length + i), Y(num(x[key]) || 0)]));
    let grid = ""; for (let g = 0; g <= 4; g++) { const y = m.t + ih - (g / 4) * ih; grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="rgba(128,140,155,.18)"/><text x="${m.l - 8}" y="${y + 3}" text-anchor="end" fill="#7d8a99" font-size="9.5">${g ? (key === "revenue" ? GI.money(step * g, undefined, true) : step * g) : "0"}</text>`; }
    const lab = all.map((x, i) => (i % Math.ceil(n / 7) === 0 ? `<text x="${X(i)}" y="${H - 7}" text-anchor="middle" fill="#7d8a99" font-size="9.5">${dayLabel(x.date)}</text>` : "")).join("");
    const bandPath = band && fc.length ? `<path d="M${fc.map((x, i) => `${X(hist.length + i)},${Y(num(x.high) || 0)}`).join("L")}L${fc.map((x, i) => `${X(hist.length + fc.length - 1 - i)},${Y(num(fc[fc.length - 1 - i].low) || 0)}`).join("L")}Z" fill="rgba(160,107,255,.18)"/>` : "";
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${METRICS[key]} history and forecast">${grid}${lab}${bandPath}
      <path d="${GI.smooth(hp)}" fill="none" stroke="#19e68c" stroke-width="2.4"/><path d="${GI.smooth(fp)}" fill="none" stroke="#a06bff" stroke-width="2.4" stroke-dasharray="5 4"/>
      <line x1="${X(hist.length - 1)}" x2="${X(hist.length - 1)}" y1="${m.t}" y2="${m.t + ih}" stroke="rgba(128,140,155,.5)" stroke-dasharray="2 3"/></svg>
      <div class="gi-leg"><span><i style="background:#19e68c"></i>Actual</span><span><i style="background:#a06bff"></i>Forecast${band ? " (shaded = likely range)" : ""}</span></div>`;
  }

  function goalModal() {
    const t = ist(), end = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0))), in30 = iso(new Date(t.getTime() + 29 * 864e5));
    const md = GI.modal(`<h3>Set a goal</h3><form class="gi-form" id="giGoalForm" novalidate>
      <label>What do you want to grow?<select name="metric">${Object.entries(METRICS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      <label>Target<input name="target" inputmode="decimal" placeholder="e.g. 50000"></label>
      <label>Time period<select name="period"><option value="month">Until end of this month (${esc(stamp(end))})</option><option value="30">Next 30 days (until ${esc(stamp(in30))})</option></select></label>
      <div class="gi-form-err" id="giGoalErr" role="alert"></div><div class="gi-form-a"><button type="button" class="gi-btn2" data-close>Cancel</button><button type="submit" class="gi-btn2 ok">Save goal</button></div></form>`);
    $("#giGoalForm", md).onsubmit = async e => {
      e.preventDefault(); const f = e.target, tg = Number(String(f.elements.target.value).replace(/[,\s₹]/g, "")), err = $("#giGoalErr", md);
      if (!isFinite(tg) || tg <= 0) { err.textContent = "Please enter a target greater than zero."; return; }
      const btn = f.querySelector("[type=submit]"); btn.disabled = true;
      try { await GI.rpc("set_growth_goal", { p_metric: f.elements.metric.value, p_target: tg, p_period_start: iso(t), p_period_end: f.elements.period.value === "month" ? end : in30 }); GI.closeModal(); GI.toast("Goal saved."); await GI.load("forecast", true); }
      catch (x) { btn.disabled = false; err.textContent = "Could not save: " + (x.message || x); }
    };
  }

  const ctrl = () => `<button class="gi-btn2 ok" type="button" id="giGoalAdd">${IC.plus} Set a goal</button>`;
  const wire = el => { $("#giGoalAdd", el).onclick = goalModal; };

  function render(b, st) {
    const d = st.data || {}, f = d.forecast || {}, meta = f.meta || {}, goals = d.goals || [], tot = f.totals || {}, key = M.m;
    const enough = meta.enough_data !== false && (f.forecast || []).length > 0;
    const fc = enough ? `<div class="gi-seg-tabs"><button type="button" class="${key === "revenue" ? "on" : ""}" data-m="revenue">Revenue</button><button type="button" class="${key === "orders" ? "on" : ""}" data-m="orders">Orders</button></div>
      <div class="gi-minis three"><div class="gi-mini"><small>Expected revenue · next ${(f.forecast || []).length} days</small><b>${isNum(num(tot.expected_revenue)) ? GI.money(num(tot.expected_revenue), meta.currency || undefined, true) : "—"}</b><em>${isNum(num(tot.low)) && isNum(num(tot.high)) ? `likely ${GI.money(num(tot.low), meta.currency || undefined, true)} – ${GI.money(num(tot.high), meta.currency || undefined, true)}` : ""}</em></div>
      <div class="gi-mini"><small>Expected orders</small><b>${isNum(num(tot.expected_orders)) ? cnt(num(tot.expected_orders)) : "—"}</b></div><div class="gi-mini"><small>Forecast confidence</small><b>${esc(human(meta.confidence || "low"))}</b><em>${esc(meta.method ? human(meta.method) : "")}</em></div></div>
      <div class="gi-box">${chart(f)}</div>`
      : `<div class="gi-state">A forecast needs at least 14 days of order history${isNum(num(meta.history_days)) ? ` (you have ${cnt(num(meta.history_days))})` : ""}. It will appear automatically as your data grows.</div>`;
    const gl = goals.length ? `<div class="gi-goals">${goals.map(g => { const p = Math.max(0, Math.min(100, num(g.progress_pct) || 0)), e = num(g.expected_pct_today), s = ST[g.status] || ["blue", human(g.status)];
      return `<div class="gi-goal" data-id="${esc(g.id)}"><div class="gi-goal-h"><b>${esc(METRICS[g.metric] || human(g.metric))}</b><span class="pill ${s[0]}">${s[1]}</span><button class="gi-x" data-del aria-label="Delete goal">${IC.x}</button></div>
        <div class="gi-goal-n"><b>${fmtM(g.metric, num(g.current) || 0)}</b> of ${fmtM(g.metric, num(g.target) || 0)} <small>by ${esc(stamp(g.period_end))}</small></div>
        <div class="gi-prog"><i style="width:${p}%"></i>${isNum(e) ? `<u style="left:${Math.max(0, Math.min(100, e))}%" title="Where you should be today"></u>` : ""}</div></div>`; }).join("")}</div>`
      : `<div class="gi-state">No goals yet. Set one and GLIME will tell you every day whether you are on track.</div>`;
    b.innerHTML = fc + `<h3 class="gi-h3">Your goals</h3>${gl}<p class="gi-hint">The thin marker on a goal shows where you should be today to finish on time. A forecast is a likely range based on your own history, not a promise.</p>`;
    $$("[data-m]", b).forEach(x => { x.onclick = () => { M.m = x.dataset.m; GI.redraw("forecast"); }; });
    $$("[data-del]", b).forEach(x => { x.onclick = async () => { if (!(await GI.confirm("Delete this goal?", { title: "Delete goal", confirmText: "Delete", danger: true }))) return; try { await GI.rpc("delete_growth_goal", { p_id: x.closest(".gi-goal").dataset.id }); await GI.load("forecast", true); } catch (e) { GI.toast("Could not delete: " + (e.message || e)); } }; });
  }

  GI.register({
    id: "forecast", order: 11, short: "Forecast & Goals", icon: IC.trend, title: "Forecast &amp; Goals", sub: "Where you are heading, and whether you will hit your targets", rpc: "get_growth_forecast", lazy: true, ctrl, wire,
    load: async () => { const f = await GI.rpc("get_growth_forecast", { p_horizon_days: 30 }); const g = await GI.rpc("get_growth_goals").catch(() => []); return { forecast: f || {}, goals: Array.isArray(g) ? g : [] }; },
    render,
    context: st => { const d = st.data || {}, t = (d.forecast && d.forecast.totals) || {}, out = []; if (isNum(num(t.expected_revenue))) out.push(`Expected revenue next 30 days: ${GI.money(num(t.expected_revenue))} (likely ${GI.money(num(t.low))} to ${GI.money(num(t.high))}), confidence ${(d.forecast.meta || {}).confidence || "low"}`); else out.push("Forecast not available yet (not enough history)"); (d.goals || []).slice(0, 4).forEach(g => out.push(`Goal ${METRICS[g.metric] || g.metric}: ${fmtM(g.metric, num(g.current) || 0)} of ${fmtM(g.metric, num(g.target) || 0)} by ${g.period_end}, ${human(g.status)}`)); return out; }
  });
})();
