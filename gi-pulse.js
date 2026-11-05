/* GI section 1 — Daily Business Pulse.
 * get_client_business_growth_trend(p_range)          -> KPIs, daily trend, sources, channels, funnel
 * get_client_business_growth_overview(p_selected_date) -> clicked-day details (last 7 days only) */
(() => {
  "use strict";
  const { $, $$, esc, isNum, num, sum, cnt, dayLabel, fullLabel, clock, human, IC, RANGES } = GI;
  const PALETTE = ["#ff4d8d", "#19e68c", "#a06bff", "#ff9a2e", "#3aa0ff", "#ffd23f", "#2ec4b6", "#ef6f6c"];
  const dayDiff = (a, b) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);
  const P = { idx: 0, tab: "orders", sel: null, day: { s: "idle" }, seq: 0 };

  const revOk = sm => sm.revenue_available === true && sm.collected_revenue !== null && sm.collected_revenue !== undefined;

  function ctrl(st) {
    const tabs = Object.keys(RANGES).map(k => `<button type="button" data-k="${k}" class="${k === GI.S.key ? "on" : ""}">${RANGES[k].tab}</button>`).join("");
    const cr = st.s === "ok" && st.data.meta && st.data.meta.current_range;
    return `<div class="gi-tabs">${tabs}</div>${cr ? `<div class="gi-chip">${IC.cal}${esc(dayLabel(cr.start))} - ${esc(fullLabel(cr.end))}</div>` : ""}`;
  }
  const wire = el => $$(".gi-tabs button", el).forEach(b => b.onclick = () => GI.setRange(b.dataset.k));

  function render(b, st) {
    const t = st.data, sm = t.summary || {}, ch = t.change_pct || {}, dq = (t.meta && t.meta.data_quality) || {}, R = RANGES[GI.S.key];
    const ok = revOk(sm);
    const kp = [
      ok ? ["revenue", "Revenue", IC.rupee, "k-green", num(sm.collected_revenue), ch.collected_revenue, v => GI.money(v)] : ["revenue", "Revenue", IC.rupee, "k-green", null, null, null],
      ["orders", "Orders", IC.cart, "k-blue", num(sm.orders_created), ch.orders_created, cnt],
      ["leads", "New Leads", IC.users, "k-purple", num(sm.leads_created), ch.leads_created, cnt],
      ["customers", "New Customers", IC.userplus, "k-orange", num(sm.customers_added), ch.customers_added, cnt]
    ];
    const tiles = kp.map(([id, label, icon, cls, v, pct, f]) => {
      const has = isNum(pct), up = has && pct >= 0;
      const val = v === null ? `<div class="v small">Not tracked</div>` : `<div class="v" data-count="${v}" data-fmt="${id}">${f(v)}</div>`;
      const sub = id === "revenue" && !ok ? `<div class="d"><small>Order value ${esc(GI.money(num(sm.gross_order_value)))} created (not collected)</small></div>`
        : `<div class="d ${has ? (up ? "up" : "down") : ""}">${has ? (up ? "↑ " : "↓ ") + Math.abs(pct) + "%" : "—"}<small>${has ? "vs " + esc(R.cmp) : "no previous data to compare"}</small></div>`;
      return `<div class="gi-kpi ${cls}"><div class="ic">${icon}</div>${val}<div class="l">${label}</div>${sub}<svg class="deco" width="30" height="24" viewBox="0 0 30 24" fill="currentColor" opacity=".85"><rect x="2" y="12" width="5" height="10" rx="1.5"/><rect x="12" y="6" width="5" height="16" rx="1.5"/><rect x="22" y="1" width="5" height="21" rx="1.5"/></svg></div>`;
    }).join("");

    const daily = t.daily || [], n = daily.length, days = (t.meta && t.meta.days_in_range) || n || 1;
    const series = daily.map(d => (ok ? num(d.collected_revenue) : num(d.gross_order_value)));
    const bestI = series.reduce((bi, v, i) => (isNum(v) && (bi < 0 || v > series[bi]) ? i : bi), -1);
    const orders = num(sm.orders_created) || 0, linked = num(sm.lead_linked_orders);
    const chips = [
      ["Best day", bestI >= 0 && series[bestI] > 0 ? `${dayLabel(daily[bestI].date)} · ${GI.money(series[bestI], undefined, true)}` : "—", ok ? "by revenue" : "by order value"],
      ["Avg orders / day", (orders / days).toFixed(1), `${days} day${days === 1 ? "" : "s"}`],
      ["Cancelled orders", cnt(num(sm.cancelled_orders) || 0), "in this range"],
      ["Lead-linked orders", linked === null ? "—" : `${cnt(linked)} of ${cnt(orders)}`, "orders tied to a lead"]
    ].map(([a, c, d]) => `<div class="gi-mini"><small>${a}</small><b>${esc(c)}</b><em>${d}</em></div>`).join("");
    const notes = [];
    if (!ok) notes.push("Payment tracking is not available yet, so collected revenue is not shown. The chart uses order value (not collected money).");
    if (dq.currencies && dq.currencies.length > 1) notes.push("Orders use more than one currency, so amounts add different currencies together.");
    if (t.meta && t.meta.today_may_be_incomplete) notes.push("Today's numbers may still change.");

    b.innerHTML = `<div class="gi-kpis">${tiles}</div>
      <div class="gi-pulse">
        <div class="gi-box"><h3>${ok ? "Revenue" : "Order value"} &amp; Orders Trend <em style="--c:#19e68c">${ok ? "Revenue" : "Order value"}</em><em style="--c:#3aa0ff">Orders</em></h3>
          <div class="gi-chart" id="giChart"></div><p class="gi-hint">Hover to compare days. Click a day to see its orders, conversions and leads.</p></div>
        <div class="gi-box"><h3>Leads by Source</h3><div class="gi-donut" id="giDonut"></div></div>
      </div>
      <div class="gi-minis">${chips}</div><div id="giDayBox"></div>
      <div class="gi-pulse2">
        <div class="gi-box"><h3>Lead-to-Order Flow <em style="--c:#8b97a6">counts in this range</em></h3><div id="giFunnel"></div></div>
        <div class="gi-box"><h3>Orders by Channel</h3><div id="giChannels"></div></div>
      </div>${notes.length ? `<p class="gi-note">${notes.map(esc).join(" ")}</p>` : ""}`;
    countUp(b);
    const hasActivity = sum(daily.map(d => (num(d.orders_created) || 0) + (num(d.leads_created) || 0))) > 0;
    P.idx = bestI >= 0 && series[bestI] > 0 ? bestI : Math.max(0, n - 1);
    drawTrend(series, ok, hasActivity); drawDonut(sm.lead_sources || {}); drawFunnel(sm); drawChannels(sm.order_source_channels || {}); renderDay();
  }

  function countUp(b) {
    if (GI.reduceMotion) return;
    $$(".gi-kpi .v[data-count]", b).forEach(el => {
      const to = +el.dataset.count, f = el.dataset.fmt === "revenue" ? (v => GI.money(v)) : cnt, t0 = performance.now();
      const step = t => { const p = Math.min(1, (t - t0) / 650); el.textContent = f(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  function seriesNow() {
    const t = GI.st.pulse.data, sm = t.summary || {}, daily = t.daily || [], ok = revOk(sm);
    return { daily, ok, series: daily.map(d => (ok ? num(d.collected_revenue) : num(d.gross_order_value))), act: sum(daily.map(d => (num(d.orders_created) || 0) + (num(d.leads_created) || 0))) > 0 };
  }
  const redrawTrend = () => { if (GI.st.pulse.s === "ok") { const x = seriesNow(); drawTrend(x.series, x.ok, x.act); } };

  function drawTrend(series, ok, hasActivity) {
    const host = $("#giChart"); if (!host || GI.st.pulse.s !== "ok") return;
    const daily = GI.st.pulse.data.daily || [], n = daily.length;
    if (!n) { host.innerHTML = `<div class="gi-state">No days in this range yet.</div>`; return; }
    const W = Math.max(260, host.clientWidth), H = 250, m = { l: 48, r: 34, t: 12, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const rv = series.map(v => (isNum(v) ? v : 0)), od = daily.map(d => num(d.orders_created) || 0);
    const rs = GI.niceStep(Math.max(...rv, 1) / 4), rmax = rs * 4, os = GI.niceStep(Math.max(...od, 1) / 4), omax = os * 4;
    const X = i => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw), YR = v => m.t + ih - (v / rmax) * ih, YO = v => m.t + ih - (v / omax) * ih;
    const rp = rv.map((v, i) => [X(i), YR(v)]), op = od.map((v, i) => [X(i), YO(v)]), base = m.t + ih, rl = GI.smooth(rp), ol = GI.smooth(op);
    let grid = "";
    for (let g = 0; g <= 4; g++) {
      const y = m.t + ih - (g / 4) * ih;
      grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="rgba(128,140,155,.18)"/><text x="${m.l - 8}" y="${y + 3}" text-anchor="end" fill="#7d8a99" font-size="9.5">${g ? GI.money(rs * g, undefined, true) : "0"}</text><text x="${W - m.r + 8}" y="${y + 3}" fill="#7d8a99" font-size="9.5">${os * g}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / (W < 420 ? 4 : 8))); let xl = "";
    daily.forEach((d, i) => { if (i % every === 0 || i === n - 1) xl += `<text x="${X(i)}" y="${H - 7}" text-anchor="middle" fill="#7d8a99" font-size="9.5">${dayLabel(d.date)}</text>`; });
    const a = Math.min(P.idx, n - 1), ax = X(a), d = daily[a], pinned = P.sel && String(d.date).slice(0, 10) === P.sel;
    const area = (line, id) => (n > 1 ? `<path d="${line}L${X(n - 1)},${base}L${X(0)},${base}Z" fill="url(#${id})"/>` : "");
    host.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Trend of ${ok ? "revenue" : "order value"} and orders">
      <defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#19e68c" stop-opacity=".45"/><stop offset="1" stop-color="#19e68c" stop-opacity="0"/></linearGradient>
      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3aa0ff" stop-opacity=".22"/><stop offset="1" stop-color="#3aa0ff" stop-opacity="0"/></linearGradient></defs>
      ${grid}${xl}${area(ol, "gB")}${area(rl, "gA")}
      ${n > 1 ? `<path d="${ol}" fill="none" stroke="#3aa0ff" stroke-width="2"/><path d="${rl}" fill="none" stroke="#19e68c" stroke-width="2.4"/>` : ""}
      <line x1="${ax}" x2="${ax}" y1="${m.t}" y2="${base}" stroke="${pinned ? "#ffd23f" : "rgba(25,230,140,.7)"}" stroke-dasharray="3 3"/>
      <circle cx="${ax}" cy="${YR(rv[a])}" r="4.5" fill="#19e68c" stroke="#06100c" stroke-width="2"/><circle cx="${ax}" cy="${YO(od[a])}" r="4.5" fill="#3aa0ff" stroke="#06100c" stroke-width="2"/></svg>
      <div class="gi-tip" id="giTip"><b>${esc(fullLabel(d.date))}${pinned ? " · selected" : ""}</b>
        <div><i style="background:#19e68c"></i>${ok ? "Revenue" : "Order value"}<strong>${isNum(series[a]) ? GI.money(series[a]) : "—"}</strong></div>
        <div><i style="background:#3aa0ff"></i>Orders<strong>${od[a]}</strong></div>
        <div><i style="background:#ff4d8d"></i>New Leads<strong>${num(d.leads_created) ?? "—"}</strong></div>
        <div><i style="background:#ff9a2e"></i>New Customers<strong>${num(d.customers_added) ?? "—"}</strong></div></div>
      ${hasActivity ? "" : `<div class="gi-empty">No orders or leads in this range yet</div>`}`;
    const tip = $("#giTip"), tw = tip.offsetWidth || 170;
    tip.style.left = Math.max(4, Math.min(W - tw - 4, ax - tw / 2)) + "px";
    tip.style.top = Math.max(6, Math.min(YR(rv[a]), YO(od[a])) - tip.offsetHeight - 10) + "px";
    const at = e => { const x = e.clientX - host.getBoundingClientRect().left; return Math.max(0, Math.min(n - 1, Math.round(((x - m.l) / iw) * (n - 1)))); };
    const move = e => { const i = at(e); if (i !== P.idx) { P.idx = i; drawTrend(series, ok, hasActivity); } };
    host.onpointermove = move; host.onpointerdown = move;
    host.onclick = e => selectDay(String(daily[at(e)].date).slice(0, 10));
  }

  function drawDonut(obj) {
    const host = $("#giDonut"); if (!host) return;
    let list = Object.entries(obj).map(([name, count]) => ({ name, count: num(count) || 0 })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);
    if (list.length > 6) { const rest = sum(list.slice(5).map(x => x.count)); list = list.slice(0, 5).concat({ name: "Other", count: rest }); }
    const total = sum(list.map(x => x.count));
    if (!total) { host.innerHTML = `<div class="gi-state">No new leads in this range.</div>`; return; }
    const color = (x, i) => (x.name === "Unknown" ? "#6b7886" : PALETTE[i % PALETTE.length]), R = 54, C = 2 * Math.PI * R, gap = list.length > 1 ? 3 : 0;
    let off = 0, arcs = "";
    list.forEach((x, i) => { const len = Math.max(0, (x.count / total) * C - gap); arcs += `<circle data-i="${i}" cx="70" cy="70" r="${R}" fill="none" stroke="${color(x, i)}" stroke-width="15" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += (x.count / total) * C; });
    host.innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Leads by source">${arcs}<text x="70" y="68" text-anchor="middle" class="gi-dn" font-size="22" font-weight="700">${cnt(total)}</text><text x="70" y="84" text-anchor="middle" fill="#8b97a6" font-size="9.5">Total Leads</text></svg>
      <div class="gi-legend">${list.map((x, i) => `<div data-i="${i}"><i style="background:${color(x, i)}"></i>${esc(x.name)}<span>${Math.round(x.count / total * 100)}% (${cnt(x.count)})</span></div>`).join("")}</div>`;
    const hl = (i, on) => { $$("circle", host).forEach(c => { c.style.opacity = on && +c.dataset.i !== i ? ".35" : "1"; }); $$(".gi-legend div", host).forEach(d => d.classList.toggle("hl", on && +d.dataset.i === i)); };
    $$("[data-i]", host).forEach(el => { el.onmouseenter = () => hl(+el.dataset.i, true); el.onmouseleave = () => hl(0, false); });
  }

  const barRows = rows => { const mx = Math.max(...rows.map(r => r.v), 1);
    return `<div class="gi-bars">${rows.map(r => `<div class="gi-bar"><span>${esc(r.l)}</span><div><i style="width:${Math.max(3, r.v / mx * 100)}%;background:${r.c}"></i></div><b>${r.t === undefined ? cnt(r.v) : esc(r.t)}</b></div>`).join("")}</div>`; };
  function drawFunnel(sm) {
    const host = $("#giFunnel"); if (!host) return;
    const leads = num(sm.leads_created), won = num(sm.won_conversions), linked = num(sm.lead_linked_orders), paid = num(sm.paid_orders), orders = num(sm.orders_created);
    host.innerHTML = barRows([
      { l: "New leads", v: leads || 0, c: "#a06bff" },
      { l: "Won conversions", v: won || 0, c: "#19e68c", t: won === null ? "Not tracked" : cnt(won) + (leads ? ` · ${(won / leads * 100).toFixed(0)}% of leads` : "") },
      { l: "Orders from leads", v: linked || 0, c: "#3aa0ff", t: linked === null ? "—" : cnt(linked) + (orders ? ` of ${cnt(orders)} orders` : "") },
      { l: "Paid orders", v: paid || 0, c: "#ff9a2e", t: paid === null ? "Not tracked" : cnt(paid) }
    ]) + `<p class="gi-hint">Each bar counts events in this range. It is not a strict funnel: a lead and its order can fall in different ranges.</p>`;
  }
  function drawChannels(obj) {
    const host = $("#giChannels"); if (!host) return;
    const rows = Object.entries(obj).map(([l, v]) => ({ l, v: num(v) || 0 })).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
    if (!rows.length) { host.innerHTML = `<div class="gi-state">No orders in this range.</div>`; return; }
    const total = sum(rows.map(r => r.v));
    host.innerHTML = barRows(rows.slice(0, 7).map((r, i) => ({ ...r, c: r.l === "Unknown" ? "#6b7886" : PALETTE[(i + 4) % PALETTE.length], t: `${cnt(r.v)} · ${Math.round(r.v / total * 100)}%` })));
  }

  /* ----- clicked-day details ----- */
  function selectDay(date) {
    P.sel = date; P.tab = "orders"; P.day = { s: "loading" };
    const t = GI.st.pulse.data, end = t && t.meta && t.meta.current_range && String(t.meta.current_range.end).slice(0, 10);
    if (end && dayDiff(date, end) > 6) { P.day = { s: "far" }; renderDay(); redrawTrend(); return; }
    renderDay(); redrawTrend();
    const my = ++P.seq;
    GI.rpc("get_client_business_growth_overview", { p_selected_date: date })
      .then(d => { if (my === P.seq) { P.day = { s: "ok", data: d }; renderDay(); } })
      .catch(e => { if (my === P.seq) { P.day = { s: "error", error: e }; renderDay(); } });
  }
  const DAY_TABS = [["orders", "Orders", "orders_created"], ["won", "Won", "lead_conversions"], ["leads", "New leads", "new_leads"], ["customers", "Customers", "new_customers"], ["status", "Status changes", "order_status_changes"]];
  function dayRow(tab, r) {
    if (tab === "orders") return `<li><b>${esc(r.order_number ? "#" + r.order_number : String(r.order_id || "").slice(0, 8))}</b> ${esc(r.customer_name || r.lead_name || "—")}<span>${esc(GI.money(num(r.total_amount), r.currency || undefined))} · ${esc(human(r.status))} · ${esc(human(r.payment_status))} · ${esc(r.source_channel)}</span></li>`;
    if (tab === "won") return `<li><b>${esc(r.lead_name || "Lead")}</b> ${esc(human(r.previous_status))} → ${esc(human(r.new_status))}<span>${esc(clock(r.occurred_at))} · source ${esc(r.event_source)} · ${r.has_linked_order ? "order linked" : "no linked order"}</span></li>`;
    if (tab === "leads") return `<li><b>${esc(r.name || "Lead")}</b> ${esc(r.interest || r.product_service || "")}<span>${esc(clock(r.created_at))} · ${esc(r.source)} · now ${esc(human(r.current_status))}</span></li>`;
    if (tab === "customers") return `<li><b>${esc(r.name || "Customer")}</b><span>${esc(clock(r.created_at))}</span></li>`;
    return `<li><b>${esc(r.order_number ? "#" + r.order_number : "Order")}</b> ${esc(human(r.from_status))} → ${esc(human(r.to_status))}<span>${esc(clock(r.created_at))}${r.reason ? " · " + esc(r.reason) : ""}</span></li>`;
  }
  function renderDay() {
    const host = $("#giDayBox"); if (!host) return;
    if (!P.sel) { host.innerHTML = ""; return; }
    const st = P.day, title = `<div class="gi-dayh"><b>${esc(fullLabel(P.sel))}</b><button class="gi-link" type="button" id="giDayX">Close</button></div>`;
    let body;
    if (st.s === "loading") body = `<div class="gi-state">Loading day details…</div>`;
    else if (st.s === "far") body = `<div class="gi-state">Day-level details are available for the last 7 days only.</div>`;
    else if (st.s === "error") body = `<div class="gi-state err">${esc(GI.errText(st.error))}</div>`;
    else {
      const sd = st.data && st.data.selected_day;
      if (!sd) body = `<div class="gi-state">No details for this day.</div>`;
      else {
        const tabs = DAY_TABS.map(([k, l, f]) => `<button type="button" data-t="${k}" class="${P.tab === k ? "on" : ""}">${l} <em>${(sd[f] && sd[f].total) || 0}</em></button>`).join("");
        const f = DAY_TABS.find(x => x[0] === P.tab)[2], sec = sd[f] || { rows: [], total: 0 };
        body = `<div class="gi-dtabs">${tabs}</div>${(sec.rows || []).length ? `<ul class="gi-dlist">${sec.rows.map(r => dayRow(P.tab, r)).join("")}</ul>` : `<div class="gi-state">Nothing recorded here.</div>`}${sec.total > (sec.rows || []).length ? `<p class="gi-hint">Showing ${sec.rows.length} of ${sec.total}.</p>` : ""}`;
      }
    }
    host.innerHTML = `<div class="gi-box gi-day">${title}${body}</div>`;
    $("#giDayX").onclick = () => { P.sel = null; P.seq++; renderDay(); redrawTrend(); };
    $$(".gi-dtabs button", host).forEach(bt => { bt.onclick = () => { P.tab = bt.dataset.t; renderDay(); }; });
  }

  addEventListener("resize", (() => { let rt; return () => { clearTimeout(rt); rt = setTimeout(redrawTrend, 120); }; })());

  GI.register({
    id: "pulse", order: 1, short: "Pulse", icon: IC.pulse, title: "Daily Business Pulse", ranged: true, ctrlAlways: true,
    sub: () => `Your business performance ${esc(RANGES[GI.S.key].title)}`,
    rpc: "get_client_business_growth_trend",
    load: async key => {
      const t = await GI.rpc("get_client_business_growth_trend", { p_range: key });
      const c = t && t.meta && t.meta.data_quality && t.meta.data_quality.currencies; GI.S.cur = c && c.length === 1 ? c[0] : null;
      return t;
    },
    onRange: () => { P.sel = null; P.day = { s: "idle" }; P.seq++; },
    ctrl, wire, render,
    context: st => {
      const t = st.data, sm = t.summary || {}, ch = t.change_pct || {}, out = [];
      const d = (label, v, pct) => out.push(`${label}: ${v}${isNum(pct) ? ` (${pct >= 0 ? "up" : "down"} ${Math.abs(pct)}% vs previous period)` : ""}`);
      d("Collected revenue", revOk(sm) ? GI.money(num(sm.collected_revenue)) : "not tracked", ch.collected_revenue);
      d("Orders", cnt(num(sm.orders_created) || 0), ch.orders_created); d("New leads", cnt(num(sm.leads_created) || 0), ch.leads_created); d("New customers", cnt(num(sm.customers_added) || 0), ch.customers_added);
      if (sm.won_conversions != null) out.push(`Won conversions: ${sm.won_conversions}`);
      const src = Object.entries(sm.lead_sources || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", "); if (src) out.push(`Lead sources: ${src}`);
      return out;
    }
  });
})();
