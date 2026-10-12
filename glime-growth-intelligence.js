/* GLIME Business Growth Intelligence — live data from Supabase RPCs.
 *
 * Every number on this page comes from an RPC that resolves the client from the
 * signed-in session (no client_id is ever sent):
 *   get_client_business_growth_trend(p_range)   -> KPIs, trend, sources, channels, funnel
 *   get_client_business_growth_overview(p_selected_date) -> clicked-day details (last 7 days)
 *   get_client_action_impact_cards(p_limit)     -> GLIME Action Impact
 *   get_client_evidence_metrics()               -> Evidence & Confidence
 *   get_client_decision_action_center()         -> Decisions & Next Actions
 *   get_client_proactive_insights(p_limit)      -> AI Insight card + decision priority
 *   approve_client_business_action / reject_client_business_action /
 *   create_client_decision_action_proposal      -> decision actions (explicit confirmation)
 * Missing values stay missing ("—" / "Not tracked"); nothing is invented.
 */
(() => {
  "use strict";

  const SB_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SB_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const RANGES = {
    "7d": { tab: "7 Days", label: "Last 7 Days", title: "over the last 7 days", cmp: "previous 7 days" },
    "30d": { tab: "30 Days", label: "Last 30 Days", title: "over the last 30 days", cmp: "previous 30 days" },
    "this_month": { tab: "This Month", label: "This Month", title: "so far this month", cmp: "same days last month" }
  };
  const LEAD_SPECIFIC = ["repeat_customer_reengagement", "low_repeat_rate", "lead_followup_review"];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const isNum = v => typeof v === "number" && isFinite(v);
  const num = v => (v === null || v === undefined || v === "" ? null : (isFinite(Number(v)) ? Number(v) : null));
  const sum = a => a.reduce((x, y) => x + y, 0);
  const cnt = n => Math.round(n).toLocaleString("en-IN");
  const dayLabel = iso => { const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z"); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
  const fullLabel = iso => !iso ? "—" : dayLabel(iso) + " " + String(iso).slice(0, 4);
  const stamp = v => { const d = new Date(v); return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); };
  const clock = v => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); };
  const human = s => String(s || "—").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  const dayDiff = (a, b) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- icons ---------- */
  const I = (p, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC = {
    pulse: I('<path d="M3 12h4l2-6 4 12 2-6h6"/>'), target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
    bars: I('<path d="M5 20V11M12 20V4M19 20v-7"/>'), bolt: I('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    rupee: I('<path d="M6 4h12M6 9h12M9 4c5 0 6 5 0 6l6 9"/>'), cart: I('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 12h11l2-8H6"/>'),
    users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6"/>'),
    userplus: I('<circle cx="10" cy="8" r="3.8"/><path d="M3 20c0-3.8 3.2-6.2 7-6.2s7 2.4 7 6.2M19 8v6M16 11h6"/>'),
    search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 16), refresh: I('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    cal: I('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 15), chev: I('<path d="m9 6 6 6-6 6"/>', 16),
    bulb: I('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>', 20),
    ig: I('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".8" fill="currentColor"/>'),
    wa: I('<path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.5z"/><path d="M9 9c0 3 3 6 6 6l1-1.6-2-1-1 .8c-.8-.4-1.6-1.2-2-2l.8-1-1-2z"/>'),
    mail: I('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>'), spark: I('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>')
  };
  const CHANNEL = {
    instagram: { icon: IC.ig, bg: "linear-gradient(135deg,#f9a03f,#e1306c 55%,#833ab4)" },
    whatsapp: { icon: IC.wa, bg: "#1fb66a" }, email: { icon: IC.mail, bg: "#2f7df6" }, other: { icon: IC.spark, bg: "#5b6b7d" }
  };
  const PALETTE = ["#ff4d8d", "#19e68c", "#a06bff", "#ff9a2e", "#3aa0ff", "#ffd23f", "#2ec4b6", "#ef6f6c"];

  /* ---------- Supabase ---------- */
  let sb = null;
  function client() {
    if (window.supabaseClient) return (sb = window.supabaseClient);
    if (window.supabase && window.supabase.createClient) { window.supabaseClient = window.supabase.createClient(SB_URL, SB_KEY); return (sb = window.supabaseClient); }
    return null;
  }
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) { const e = new Error(error.message || "Request failed"); e.code = error.code; throw e; }
    if (typeof data === "string") { try { return JSON.parse(data); } catch { return null; } }
    return data;
  }
  const Source = {
    trend: k => rpc("get_client_business_growth_trend", { p_range: k }),
    day: d => rpc("get_client_business_growth_overview", { p_selected_date: d }),
    impact: () => rpc("get_client_action_impact_cards", { p_limit: 20 }),
    evidence: () => rpc("get_client_evidence_metrics"),
    decisions: () => rpc("get_client_decision_action_center"),
    insights: () => rpc("get_client_proactive_insights", { p_limit: 10 })
  };
  const errText = e => e && (e.code === "PGRST202" || e.code === "42883") ? "This report is not available yet (database function missing)."
    : e && /AUTH_REQUIRED/.test(e.message || "") ? "Please sign in again." : e && /CLIENT_NOT_FOUND/.test(e.message || "") ? "No client account is linked to this login." : "Could not load this section.";

  /* ---------- state ---------- */
  const S = {
    key: "7d", q: "", insight: 0, allActions: false, allDecisions: false, openEv: null, openMenu: null, idx: 0, dayTab: "orders", sel: null,
    trend: { s: "loading" }, impact: { s: "loading" }, evidence: { s: "loading" }, decisions: { s: "loading" }, insights: { s: "loading" }, day: { s: "idle" },
    seq: 0, daySeq: 0, gLoaded: false
  };

  /* ---------- money ---------- */
  function cur() { const c = S.trend.data && S.trend.data.meta && S.trend.data.meta.data_quality && S.trend.data.meta.data_quality.currencies; return c && c.length === 1 ? c[0] : null; }
  function money(n, c, compactIt) {
    if (!isNum(n)) return "—";
    const code = c === undefined ? cur() : c, sym = code === "INR" ? "₹" : code === "USD" ? "$" : code === "EUR" ? "€" : code ? code + " " : "";
    if (compactIt) { const a = Math.abs(n), s = n < 0 ? "-" : ""; return s + sym + (a >= 1e7 ? (a / 1e7).toFixed(1).replace(/\.0$/, "") + "Cr" : a >= 1e5 ? (a / 1e5).toFixed(1).replace(/\.0$/, "") + "L" : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K" : String(Math.round(a))); }
    return sym + Math.round(n).toLocaleString(code === "INR" || !code ? "en-IN" : "en-US");
  }

  /* ---------- skeleton ---------- */
  function skeleton() {
    $("#giRoot").innerHTML = `
      <div class="gi-tools">
        <label class="gi-search">${IC.search}<input id="giSearch" type="search" placeholder="Search actions and decisions…" autocomplete="off"><kbd>Ctrl + K</kbd></label>
        <label class="gi-select">${IC.cal}<select id="giRange" aria-label="Date range">${Object.keys(RANGES).map(k => `<option value="${k}">${RANGES[k].label}</option>`).join("")}</select></label>
        <button class="gi-bell" type="button" aria-label="Refresh data" title="Refresh data" id="giRefresh">${IC.refresh}</button>
        <div class="gi-avatar" id="giAvatar" aria-hidden="true">G</div>
      </div>
      <header class="gi-head">
        <div><h1>Business Growth <span>Intelligence</span></h1>
          <p>See what changed, understand why it matters, and know what to do next.</p></div>
        <button class="gi-insight" type="button" id="giInsight" aria-label="Next insight">
          <span class="bulb">${IC.bulb}</span><span><b>GLIME AI Insight</b><span id="giInsightText">Loading insight…</span></span><span class="nx">${IC.chev}</span></button>
      </header>
      <div class="gi-banner" id="giBanner" role="alert" hidden></div>
      <section class="gi-sec" id="glime-growth-overview-slot" aria-label="Daily Business Pulse"></section>
      <section class="gi-sec" id="glime-action-impact-slot" aria-label="GLIME Action Impact"></section>
      <section class="gi-sec" id="glime-evidence-confidence-slot" aria-label="Evidence and Confidence"></section>
      <section class="gi-sec" id="glime-decisions-table-slot" aria-label="Decisions and Next Actions"></section>
      <details class="gi-adv" id="giAdv"><summary>Advanced: lead-level proposals (search, channels, approve per lead)</summary><div id="glime-decision-action-slot"></div></details>
      <div class="gi-toast" id="giToast" role="status" aria-live="polite"></div>
      <div class="gi-modal" id="giModal" hidden><div class="gi-md" id="giMd" role="dialog" aria-modal="true"></div></div>`;
  }
  const head = (n, icon, title, sub, right = "") =>
    `<div class="gi-sh"><span class="gi-num">${n}</span><span class="gi-ico">${icon}</span><div class="gi-st"><h2>${title}</h2><p>${sub}</p></div><div class="gi-ctrl">${right}</div></div>`;
  const stateBox = (st, retry) => st.s === "loading" ? `<div class="gi-state">Loading…</div>`
    : `<div class="gi-state err">${esc(errText(st.error))} <button class="gi-link" type="button" data-retry="${retry}">Retry</button></div>`;
  const wireRetry = () => $$("[data-retry]").forEach(b => b.onclick = () => loadPart(b.dataset.retry));

  /* ---------- 1. Daily Business Pulse ---------- */
  function renderPulse() {
    const slot = $("#glime-growth-overview-slot"), st = S.trend, R = RANGES[S.key];
    const tabs = Object.keys(RANGES).map(k => `<button type="button" data-k="${k}" class="${k === S.key ? "on" : ""}">${RANGES[k].tab}</button>`).join("");
    const cr = st.data && st.data.meta && st.data.meta.current_range;
    const chip = cr ? `<div class="gi-chip">${IC.cal}${esc(dayLabel(cr.start))} - ${esc(fullLabel(cr.end))}</div>` : "";
    const hd = head(1, IC.pulse, "Daily Business Pulse", `Your business performance ${esc(R.title)}`, `<div class="gi-tabs">${tabs}</div>${chip}`);
    if (st.s !== "ok") { slot.innerHTML = hd + stateBox(st, "trend"); wireTabs(); wireRetry(); return; }
    const t = st.data, sm = t.summary || {}, ch = t.change_pct || {}, dq = (t.meta && t.meta.data_quality) || {};
    const revOk = sm.revenue_available === true && sm.collected_revenue !== null && sm.collected_revenue !== undefined;
    const kp = [];
    kp.push(revOk ? ["revenue", "Revenue", IC.rupee, "k-green", num(sm.collected_revenue), ch.collected_revenue, v => money(v)]
      : ["revenue", "Revenue", IC.rupee, "k-green", null, null, null]);
    kp.push(["orders", "Orders", IC.cart, "k-blue", num(sm.orders_created), ch.orders_created, cnt]);
    kp.push(["leads", "New Leads", IC.users, "k-purple", num(sm.leads_created), ch.leads_created, cnt]);
    kp.push(["customers", "New Customers", IC.userplus, "k-orange", num(sm.customers_added), ch.customers_added, cnt]);
    const tiles = kp.map(([id, label, icon, cls, v, pct, f]) => {
      const has = isNum(pct), up = has && pct >= 0;
      const val = v === null ? `<div class="v small">Not tracked</div>` : `<div class="v" data-count="${v}" data-fmt="${id}">${f(v)}</div>`;
      const sub = id === "revenue" && !revOk ? `<div class="d"><small>Order value ${esc(money(num(sm.gross_order_value)))} created (not collected)</small></div>`
        : `<div class="d ${has ? (up ? "up" : "down") : ""}">${has ? (up ? "↑ " : "↓ ") + Math.abs(pct) + "%" : "—"}<small>${has ? "vs " + esc(R.cmp) : "no previous data to compare"}</small></div>`;
      return `<div class="gi-kpi ${cls}"><div class="ic">${icon}</div>${val}<div class="l">${label}</div>${sub}
        <svg class="deco" width="30" height="24" viewBox="0 0 30 24" fill="currentColor" opacity=".85"><rect x="2" y="12" width="5" height="10" rx="1.5"/><rect x="12" y="6" width="5" height="16" rx="1.5"/><rect x="22" y="1" width="5" height="21" rx="1.5"/></svg></div>`;
    }).join("");

    const daily = t.daily || [], n = daily.length, days = (t.meta && t.meta.days_in_range) || n || 1;
    const series = daily.map(d => revOk ? num(d.collected_revenue) : num(d.gross_order_value));
    const bestI = series.reduce((b, v, i) => (isNum(v) && (b < 0 || v > series[b]) ? i : b), -1);
    const orders = num(sm.orders_created) || 0, linked = num(sm.lead_linked_orders);
    const chips = [
      ["Best day", bestI >= 0 && series[bestI] > 0 ? `${dayLabel(daily[bestI].date)} · ${money(series[bestI], undefined, true)}` : "—", revOk ? "by revenue" : "by order value"],
      ["Avg orders / day", (orders / days).toFixed(1), `${days} day${days === 1 ? "" : "s"}`],
      ["Cancelled orders", cnt(num(sm.cancelled_orders) || 0), "in this range"],
      ["Lead-linked orders", linked === null ? "—" : `${cnt(linked)} of ${cnt(orders)}`, "orders tied to a lead"]
    ].map(([a, b, c]) => `<div class="gi-mini"><small>${a}</small><b>${esc(b)}</b><em>${c}</em></div>`).join("");

    const notes = [];
    if (!revOk) notes.push("Payment tracking is not available yet, so collected revenue is not shown. The chart uses order value (not collected money).");
    if (dq.currencies && dq.currencies.length > 1) notes.push("Orders use more than one currency, so amounts add different currencies together.");
    if (t.meta && t.meta.today_may_be_incomplete) notes.push("Today's numbers may still change.");

    slot.innerHTML = hd + `<div class="gi-kpis">${tiles}</div>
      <div class="gi-pulse">
        <div class="gi-box"><h3>${revOk ? "Revenue" : "Order value"} &amp; Orders Trend <em style="--c:#19e68c">${revOk ? "Revenue" : "Order value"}</em><em style="--c:#3aa0ff">Orders</em></h3>
          <div class="gi-chart" id="giChart"></div><p class="gi-hint">Hover to compare days. Click a day to see its orders, conversions and leads.</p></div>
        <div class="gi-box"><h3>Leads by Source</h3><div class="gi-donut" id="giDonut"></div></div>
      </div>
      <div class="gi-minis">${chips}</div>
      <div id="giDayBox"></div>
      <div class="gi-pulse2">
        <div class="gi-box"><h3>Lead-to-Order Flow <em style="--c:#8b97a6">counts in this range</em></h3><div id="giFunnel"></div></div>
        <div class="gi-box"><h3>Orders by Channel</h3><div id="giChannels"></div></div>
      </div>
      ${notes.length ? `<p class="gi-note">${notes.map(esc).join(" ")}</p>` : ""}`;
    wireTabs(); countUp();
    const hasActivity = sum(daily.map(d => (num(d.orders_created) || 0) + (num(d.leads_created) || 0))) > 0;
    S.idx = bestI >= 0 && series[bestI] > 0 ? bestI : Math.max(0, n - 1);
    drawTrend(series, revOk, hasActivity); drawDonut(sm.lead_sources || {}); drawFunnel(sm); drawChannels(sm.order_source_channels || {}); renderDay();
  }
  const wireTabs = () => $$(".gi-tabs button").forEach(b => b.onclick = () => setRange(b.dataset.k));

  function countUp() {
    if (reduceMotion) return;
    $$(".gi-kpi .v[data-count]").forEach(el => {
      const to = +el.dataset.count, f = el.dataset.fmt === "revenue" ? (v => money(v)) : cnt, t0 = performance.now();
      const step = t => { const p = Math.min(1, (t - t0) / 650); el.textContent = f(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); return ([1, 2, 2.5, 5, 10].find(m => m * p >= raw) || 10) * p; }
  function smooth(pts) {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, k = 0.18;
      d += `C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  function drawTrend(series, revOk, hasActivity) {
    const host = $("#giChart"); if (!host || S.trend.s !== "ok") return;
    const t = S.trend.data, daily = t.daily || [], n = daily.length;
    if (!n) { host.innerHTML = `<div class="gi-state">No days in this range yet.</div>`; return; }
    const W = Math.max(260, host.clientWidth), H = 250, m = { l: 48, r: 34, t: 12, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const rv = series.map(v => (isNum(v) ? v : 0)), od = daily.map(d => num(d.orders_created) || 0);
    const rs = niceStep(Math.max(...rv, 1) / 4), rmax = rs * 4, os = niceStep(Math.max(...od, 1) / 4), omax = os * 4;
    const X = i => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw), YR = v => m.t + ih - (v / rmax) * ih, YO = v => m.t + ih - (v / omax) * ih;
    const rp = rv.map((v, i) => [X(i), YR(v)]), op = od.map((v, i) => [X(i), YO(v)]), base = m.t + ih, rl = smooth(rp), ol = smooth(op);
    let grid = "";
    for (let g = 0; g <= 4; g++) {
      const y = m.t + ih - (g / 4) * ih;
      grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.06)"/>
        <text x="${m.l - 8}" y="${y + 3}" text-anchor="end" fill="#7d8a99" font-size="9.5">${g ? money(rs * g, undefined, true) : "0"}</text>
        <text x="${W - m.r + 8}" y="${y + 3}" fill="#7d8a99" font-size="9.5">${os * g}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / (W < 420 ? 4 : 8))); let xl = "";
    daily.forEach((d, i) => { if (i % every === 0 || i === n - 1) xl += `<text x="${X(i)}" y="${H - 7}" text-anchor="middle" fill="#7d8a99" font-size="9.5">${dayLabel(d.date)}</text>`; });
    const a = Math.min(S.idx, n - 1), ax = X(a), d = daily[a], pinned = S.sel && String(d.date).slice(0, 10) === S.sel;
    const area = (line, id) => n > 1 ? `<path d="${line}L${X(n - 1)},${base}L${X(0)},${base}Z" fill="url(#${id})"/>` : "";
    host.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Trend of ${revOk ? "revenue" : "order value"} and orders">
      <defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#19e68c" stop-opacity=".45"/><stop offset="1" stop-color="#19e68c" stop-opacity="0"/></linearGradient>
      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3aa0ff" stop-opacity=".22"/><stop offset="1" stop-color="#3aa0ff" stop-opacity="0"/></linearGradient></defs>
      ${grid}${xl}${area(ol, "gB")}${area(rl, "gA")}
      ${n > 1 ? `<path d="${ol}" fill="none" stroke="#3aa0ff" stroke-width="2"/><path d="${rl}" fill="none" stroke="#19e68c" stroke-width="2.4"/>` : ""}
      <line x1="${ax}" x2="${ax}" y1="${m.t}" y2="${base}" stroke="${pinned ? "#ffd23f" : "rgba(25,230,140,.7)"}" stroke-dasharray="3 3"/>
      <circle cx="${ax}" cy="${YR(rv[a])}" r="4.5" fill="#19e68c" stroke="#06100c" stroke-width="2"/><circle cx="${ax}" cy="${YO(od[a])}" r="4.5" fill="#3aa0ff" stroke="#06100c" stroke-width="2"/></svg>
      <div class="gi-tip" id="giTip"><b>${esc(fullLabel(d.date))}${pinned ? " · selected" : ""}</b>
        <div><i style="background:#19e68c"></i>${revOk ? "Revenue" : "Order value"}<strong>${isNum(series[a]) ? money(series[a]) : "—"}</strong></div>
        <div><i style="background:#3aa0ff"></i>Orders<strong>${od[a]}</strong></div>
        <div><i style="background:#ff4d8d"></i>New Leads<strong>${num(d.leads_created) ?? "—"}</strong></div>
        <div><i style="background:#ff9a2e"></i>New Customers<strong>${num(d.customers_added) ?? "—"}</strong></div></div>
      ${hasActivity ? "" : `<div class="gi-empty">No orders or leads in this range yet</div>`}`;
    const tip = $("#giTip"), tw = tip.offsetWidth || 170;
    tip.style.left = Math.max(4, Math.min(W - tw - 4, ax - tw / 2)) + "px";
    tip.style.top = Math.max(6, Math.min(YR(rv[a]), YO(od[a])) - tip.offsetHeight - 10) + "px";
    const at = e => { const x = e.clientX - host.getBoundingClientRect().left; return Math.max(0, Math.min(n - 1, Math.round(((x - m.l) / iw) * (n - 1)))); };
    const move = e => { const i = at(e); if (i !== S.idx) { S.idx = i; drawTrend(series, revOk, hasActivity); } };
    host.onpointermove = move; host.onpointerdown = move;
    host.onclick = e => selectDay(String(daily[at(e)].date).slice(0, 10));
  }

  function drawDonut(obj) {
    const host = $("#giDonut"); if (!host) return;
    let list = Object.entries(obj).map(([name, count]) => ({ name, count: num(count) || 0 })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);
    if (list.length > 6) { const rest = sum(list.slice(5).map(x => x.count)); list = list.slice(0, 5).concat({ name: "Other", count: rest }); }
    const total = sum(list.map(x => x.count));
    if (!total) { host.innerHTML = `<div class="gi-state">No new leads in this range.</div>`; return; }
    const color = (x, i) => x.name === "Unknown" ? "#6b7886" : PALETTE[i % PALETTE.length], R = 54, C = 2 * Math.PI * R, gap = list.length > 1 ? 3 : 0;
    let off = 0, arcs = "";
    list.forEach((x, i) => { const len = Math.max(0, (x.count / total) * C - gap);
      arcs += `<circle data-i="${i}" cx="70" cy="70" r="${R}" fill="none" stroke="${color(x, i)}" stroke-width="15" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += (x.count / total) * C; });
    host.innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Leads by source">${arcs}
      <text x="70" y="68" text-anchor="middle" fill="#fff" font-size="22" font-weight="700">${cnt(total)}</text><text x="70" y="84" text-anchor="middle" fill="#8b97a6" font-size="9.5">Total Leads</text></svg>
      <div class="gi-legend">${list.map((x, i) => `<div data-i="${i}"><i style="background:${color(x, i)}"></i>${esc(x.name)}<span>${Math.round(x.count / total * 100)}% (${cnt(x.count)})</span></div>`).join("")}</div>`;
    const hl = (i, on) => { $$("circle", host).forEach(c => c.style.opacity = on && +c.dataset.i !== i ? ".35" : "1"); $$(".gi-legend div", host).forEach(d => d.classList.toggle("hl", on && +d.dataset.i === i)); };
    $$("[data-i]", host).forEach(el => { el.onmouseenter = () => hl(+el.dataset.i, true); el.onmouseleave = () => hl(0, false); });
  }

  const barRows = (rows, color) => { const mx = Math.max(...rows.map(r => r.v), 1);
    return `<div class="gi-bars">${rows.map(r => `<div class="gi-bar"><span>${esc(r.l)}</span><div><i style="width:${Math.max(3, r.v / mx * 100)}%;background:${r.c || color}"></i></div><b>${r.t === undefined ? cnt(r.v) : esc(r.t)}</b></div>`).join("")}</div>`; };

  function drawFunnel(sm) {
    const host = $("#giFunnel"); if (!host) return;
    const leads = num(sm.leads_created), won = num(sm.won_conversions), linked = num(sm.lead_linked_orders), paid = num(sm.paid_orders), orders = num(sm.orders_created);
    const rows = [
      { l: "New leads", v: leads || 0, c: "#a06bff" },
      { l: "Won conversions", v: won || 0, c: "#19e68c", t: won === null ? "Not tracked" : cnt(won) + (leads ? ` · ${(won / leads * 100).toFixed(0)}% of leads` : "") },
      { l: "Orders from leads", v: linked || 0, c: "#3aa0ff", t: linked === null ? "—" : cnt(linked) + (orders ? ` of ${cnt(orders)} orders` : "") },
      { l: "Paid orders", v: paid || 0, c: "#ff9a2e", t: paid === null ? "Not tracked" : cnt(paid) }
    ];
    host.innerHTML = barRows(rows) + `<p class="gi-hint">Each bar counts events in this range. It is not a strict funnel: a lead and its order can fall in different ranges.</p>`;
  }
  function drawChannels(obj) {
    const host = $("#giChannels"); if (!host) return;
    const rows = Object.entries(obj).map(([l, v]) => ({ l, v: num(v) || 0 })).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
    if (!rows.length) { host.innerHTML = `<div class="gi-state">No orders in this range.</div>`; return; }
    const total = sum(rows.map(r => r.v));
    host.innerHTML = barRows(rows.slice(0, 7).map((r, i) => ({ ...r, c: r.l === "Unknown" ? "#6b7886" : PALETTE[(i + 4) % PALETTE.length], t: `${cnt(r.v)} · ${Math.round(r.v / total * 100)}%` })));
  }

  /* ----- clicked day details (get_client_business_growth_overview) ----- */
  function selectDay(date) {
    S.sel = date; S.dayTab = "orders"; S.day = { s: "loading" };
    const t = S.trend.data, end = t && t.meta && t.meta.current_range && String(t.meta.current_range.end).slice(0, 10);
    if (end && dayDiff(date, end) > 6) { S.day = { s: "far" }; renderDay(); drawTrendAgain(); return; }
    renderDay(); drawTrendAgain();
    const my = ++S.daySeq;
    Source.day(date).then(d => { if (my === S.daySeq) { S.day = { s: "ok", data: d }; renderDay(); } })
      .catch(e => { if (my === S.daySeq) { S.day = { s: "error", error: e }; renderDay(); } });
  }
  function drawTrendAgain() { if (S.trend.s === "ok") renderTrendOnly(); }
  function renderTrendOnly() {
    const t = S.trend.data, sm = t.summary || {}, daily = t.daily || [], revOk = sm.revenue_available === true && sm.collected_revenue != null;
    const series = daily.map(d => revOk ? num(d.collected_revenue) : num(d.gross_order_value));
    drawTrend(series, revOk, sum(daily.map(d => (num(d.orders_created) || 0) + (num(d.leads_created) || 0))) > 0);
  }
  const DAY_TABS = [["orders", "Orders", "orders_created"], ["won", "Won", "lead_conversions"], ["leads", "New leads", "new_leads"], ["customers", "Customers", "new_customers"], ["status", "Status changes", "order_status_changes"]];
  function dayRow(tab, r) {
    if (tab === "orders") return `<li><b>${esc(r.order_number ? "#" + r.order_number : String(r.order_id || "").slice(0, 8))}</b> ${esc(r.customer_name || r.lead_name || "—")}<span>${esc(money(num(r.total_amount), r.currency || undefined))} · ${esc(human(r.status))} · ${esc(human(r.payment_status))} · ${esc(r.source_channel)}</span></li>`;
    if (tab === "won") return `<li><b>${esc(r.lead_name || "Lead")}</b> ${esc(human(r.previous_status))} → ${esc(human(r.new_status))}<span>${esc(clock(r.occurred_at))} · source ${esc(r.event_source)} · ${r.has_linked_order ? "order linked" : "no linked order"}</span></li>`;
    if (tab === "leads") return `<li><b>${esc(r.name || "Lead")}</b> ${esc(r.interest || r.product_service || "")}<span>${esc(clock(r.created_at))} · ${esc(r.source)} · now ${esc(human(r.current_status))}</span></li>`;
    if (tab === "customers") return `<li><b>${esc(r.name || "Customer")}</b><span>${esc(clock(r.created_at))}</span></li>`;
    return `<li><b>${esc(r.order_number ? "#" + r.order_number : "Order")}</b> ${esc(human(r.from_status))} → ${esc(human(r.to_status))}<span>${esc(clock(r.created_at))}${r.reason ? " · " + esc(r.reason) : ""}</span></li>`;
  }
  function renderDay() {
    const host = $("#giDayBox"); if (!host) return;
    if (!S.sel) { host.innerHTML = ""; return; }
    const st = S.day, title = `<div class="gi-dayh"><b>${esc(fullLabel(S.sel))}</b><button class="gi-link" type="button" id="giDayX">Close</button></div>`;
    let body;
    if (st.s === "loading") body = `<div class="gi-state">Loading day details…</div>`;
    else if (st.s === "far") body = `<div class="gi-state">Day-level details are available for the last 7 days only.</div>`;
    else if (st.s === "error") body = `<div class="gi-state err">${esc(errText(st.error))}</div>`;
    else {
      const sd = st.data && st.data.selected_day; if (!sd) body = `<div class="gi-state">No details for this day.</div>`;
      else {
        const tabs = DAY_TABS.map(([k, l, f]) => `<button type="button" data-t="${k}" class="${S.dayTab === k ? "on" : ""}">${l} <em>${(sd[f] && sd[f].total) || 0}</em></button>`).join("");
        const [, , f] = DAY_TABS.find(x => x[0] === S.dayTab), sec = sd[f] || { rows: [], total: 0 };
        body = `<div class="gi-dtabs">${tabs}</div>${(sec.rows || []).length ? `<ul class="gi-dlist">${sec.rows.map(r => dayRow(S.dayTab, r)).join("")}</ul>` : `<div class="gi-state">Nothing recorded here.</div>`}
          ${sec.total > (sec.rows || []).length ? `<p class="gi-hint">Showing ${sec.rows.length} of ${sec.total}.</p>` : ""}`;
      }
    }
    host.innerHTML = `<div class="gi-box gi-day">${title}${body}</div>`;
    $("#giDayX").onclick = () => { S.sel = null; S.daySeq++; renderDay(); drawTrendAgain(); };
    $$(".gi-dtabs button", host).forEach(b => b.onclick = () => { S.dayTab = b.dataset.t; renderDay(); });
  }

  /* ---------- 2. Action Impact ---------- */
  const METRIC_LABEL = { customers: "Customers", paidOrders: "Paid orders", revenue: "Revenue", leads: "Leads (unverified)", enquiries: "Enquiries", newCustomers30d: "New customers (30d)" };
  function deltaOf(a, k) {
    const d = a.metric_deltas && a.metric_deltas[k], b = a.baseline_metrics && a.baseline_metrics[k], af = a.after_metrics && a.after_metrics[k];
    if (d && isNum(d.delta)) return d.delta; return isNum(b) && isNum(af) ? af - b : null;
  }
  const chKey = a => { const c = String(a.channel || a.executor_module_slug || "").toLowerCase(); return c.startsWith("instagram") ? "instagram" : c.startsWith("whatsapp") ? "whatsapp" : c.startsWith("email") ? "email" : "other"; };
  const impStatus = a => a.impact_status === "measured" ? ["green", "Measured"] : a.impact_status === "pending" ? (a.awaiting_measurement ? ["amber", "Awaiting"] : ["amber", "Pending"])
    : a.impact_status === "insufficient_data" ? ["blue", "Not enough data"] : ["blue", human(a.impact_status)];
  function renderImpact() {
    const slot = $("#glime-action-impact-slot"), st = S.impact;
    const hd = head(2, IC.target, "GLIME Action Impact", "Real results from approved GLIME actions",
      st.s === "ok" && st.data.length ? `<button class="gi-link" type="button" id="giAllActions">${S.allActions ? "Show less" : "View all actions"} →</button>` : "");
    if (st.s !== "ok") { slot.innerHTML = hd + stateBox(st, "impact"); wireRetry(); return; }
    const q = S.q.toLowerCase(), list = st.data.filter(a => !q || (a.title + " " + (a.channel || "")).toLowerCase().includes(q));
    if (!list.length) { slot.innerHTML = hd + `<div class="gi-state">${st.data.length ? "No actions match your search." : "No approved actions have been measured yet. Results appear here after a GLIME action runs and its observation window ends."}</div>`; wireAll(); return; }
    const cards = list.map(a => {
      const ch = CHANNEL[chKey(a)], [pc, pt] = impStatus(a), m = a.impact_status === "measured";
      const stat = (k, label, f) => { const v = deltaOf(a, k); return `<div>${v === null ? `<b class="nil">—</b>` : `<b class="${v > 0 ? "pos" : v < 0 ? "neg" : "nil"}">${v > 0 ? "+" : ""}${f(v)}</b>`}<small>${label}</small></div>`; };
      const foot = m ? "Measured on " + stamp(a.measured_at) : a.awaiting_measurement ? "Observation ended, awaiting measurement" : a.observation_until ? "Expected by " + stamp(a.observation_until) : "Observation window not set";
      return `<article class="gi-imp ${m ? "measured" : ""}"><div class="gi-imp-h"><span class="lg" style="background:${ch.bg}">${ch.icon}</span><b>${esc(a.title)}</b><span class="pill ${pc}">${pt}</span></div>
        <div class="gi-stats">${stat("customers", "Customers", cnt)}${stat("paidOrders", "Paid orders", cnt)}${stat("revenue", "Revenue", v => money(v, undefined, true))}</div>
        <div class="gi-imp-f">${esc(foot)}</div><button class="gi-btn" type="button" data-id="${esc(a.impact_id)}">View Details →</button></article>`;
    }).join("");
    slot.innerHTML = hd + `<div class="gi-imp-wrap"><div class="gi-track ${S.allActions ? "wrap" : ""}" id="giTrack">${cards}</div>
      ${S.allActions || list.length <= 3 ? "" : `<button class="gi-next" type="button" id="giNext" aria-label="Next actions">${IC.chev}</button>`}</div>`;
    wireAll();
    $$("#giTrack .gi-btn").forEach(b => b.onclick = () => impactModal(st.data.find(x => String(x.impact_id) === b.dataset.id)));
    const nx = $("#giNext"); if (nx) nx.onclick = () => { const tr = $("#giTrack"); tr.scrollBy({ left: tr.clientWidth * .6, behavior: "smooth" }); };
  }
  function impactModal(a) {
    if (!a) return; const [pc, pt] = impStatus(a);
    const keys = Array.from(new Set([].concat(a.selected_metrics || [], Object.keys(a.metric_deltas || {}))));
    const fmt = (k, v) => !isNum(v) ? "—" : k === "revenue" ? money(v) : cnt(v);
    const rows = keys.map(k => { const d = deltaOf(a, k), b = a.baseline_metrics && a.baseline_metrics[k], af = a.after_metrics && a.after_metrics[k];
      return `<div class="row"><span>${esc(METRIC_LABEL[k] || k)}</span><b>${fmt(k, b)} → ${fmt(k, af)} <em>${d === null ? "" : (d > 0 ? "+" : "") + fmt(k, d)}</em></b></div>`; }).join("");
    modal(`<h3>${esc(a.title)}</h3><p><span class="pill ${pc}">${pt}</span> ${a.job_completed_at ? "Action completed " + esc(stamp(a.job_completed_at)) : ""}</p>
      ${a.observation_days ? `<div class="row"><span>Observation window</span><b>${esc(a.observation_days)} days${a.observation_until ? " · until " + esc(stamp(a.observation_until)) : ""}</b></div>` : ""}
      ${rows || `<p>No measured values yet.</p>`}${a.summary ? `<p>${esc(a.summary)}</p>` : ""}
      <p style="color:#8b97a6">${esc(a.causality_note || "Observed change after an action does not by itself prove the action caused it.")}</p>`);
  }

  /* ---------- 3. Evidence & Confidence ---------- */
  const CONF = { high: ["#19e68c", "High Confidence"], medium: ["#ff9a2e", "Medium Confidence"], low: ["#ff4d5e", "Low Confidence"], insufficient_data: ["#6b7886", "Not enough data"] };
  function ring(pct, color, text) {
    const R = 26, C = 2 * Math.PI * R, p = isNum(pct) ? Math.max(0, Math.min(100, pct)) : 0;
    return `<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
      <circle cx="32" cy="32" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C * p / 100} ${C}" transform="rotate(-90 32 32)"/>
      <text x="32" y="36" text-anchor="middle" fill="#fff" font-size="${text.length > 5 ? 10.5 : 13}" font-weight="700">${esc(text)}</text></svg>`;
  }
  function renderEvidence() {
    const slot = $("#glime-evidence-confidence-slot"), st = S.evidence;
    const list = st.s === "ok" ? ((st.data && st.data.metrics) || []) : [], open = list.find(e => e.key === S.openEv);
    const hd = head(3, IC.bars, "Evidence &amp; Confidence", "What the data tells us and how confident we are",
      list.length ? `<button class="gi-link" type="button" id="giFull">${open ? "Hide analysis" : "View full analysis"} →</button>` : "");
    if (st.s !== "ok") { slot.innerHTML = hd + stateBox(st, "evidence"); wireRetry(); return; }
    if (!list.length) { slot.innerHTML = hd + `<div class="gi-state">No evidence metrics available yet.</div>`; return; }
    const cards = list.map(e => {
      const [color, label] = CONF[e.confidence_level] || CONF.insufficient_data, v = num(e.value), pct = e.unit === "percent";
      const text = v === null ? "—" : pct ? Math.round(v) + "%" : e.mixed_currency ? "Mixed" : money(v, e.currency || undefined, true);
      const basis = `Based on ${cnt(e.sample_size || 0)} ${e.sample_label || "records"}${e.window_days ? ` · last ${e.window_days} days` : ""}`;
      return `<button type="button" class="gi-evc" data-k="${esc(e.key)}"><b>${esc(e.label)}</b><div class="gi-evr">${ring(pct ? v : 0, color, text)}<div><strong style="color:${color}">${label}</strong><small>${esc(basis)}</small></div></div></button>`;
    }).join("");
    slot.innerHTML = hd + `<div class="gi-ev">${cards}<div class="gi-evx" ${open ? "" : "hidden"}>${open ? `<b>${esc(open.label)}</b><br>${esc(open.definition || "")}<br><span style="color:#ffcf99">Limitation: ${esc(open.limitation || "—")}</span><br><span style="color:#8b97a6">${esc((st.data.meta && st.data.meta.note) || "Confidence reflects sample size only. It does not prove causation.")}</span>` : ""}</div></div>`;
    $$(".gi-evc").forEach(b => b.onclick = () => { S.openEv = S.openEv === b.dataset.k ? null : b.dataset.k; renderEvidence(); });
    $("#giFull").onclick = () => { S.openEv = open ? null : list[0].key; renderEvidence(); };
  }

  /* ---------- 4. Decisions ---------- */
  const PRI = { critical: ["red", "▲ Critical"], high: ["red", "▲ High"], medium: ["amber", "◆ Medium"], low: ["blue", "▼ Low"] };
  const STC = { proposed: "amber", awaiting_approval: "amber", pending_review: "amber", open: "amber", pending: "amber", approved: "blue", queued: "blue", executing: "blue", in_progress: "blue", completed: "green", rejected: "red", failed: "red", skipped: "red", dismissed: "red" };
  const rowStatus = d => d.action_request_id ? d.action_status : d.decision_status;
  const canDecide = d => d.action_request_id && ["proposed", "awaiting_approval"].includes(d.action_status);
  const leadSpecific = d => LEAD_SPECIFIC.includes(String((d.next_best_action && (d.next_best_action.type || d.next_best_action.action_type)) || "").toLowerCase());
  const conf = c => { const v = num(c); return v === null ? "—" : Math.round(v <= 1 ? v * 100 : v) + "%"; };
  function priorityMap() { const m = {}; if (S.insights.s === "ok") S.insights.data.forEach(i => { if (i.decision_id && !m[i.decision_id]) m[i.decision_id] = i.priority; }); return m; }
  function renderDecisions() {
    const slot = $("#glime-decisions-table-slot"), st = S.decisions;
    const hd = head(4, IC.bolt, "Decisions &amp; Next Actions", "GLIME's recommendations to grow your business",
      st.s === "ok" && st.data.length > 3 ? `<button class="gi-link" type="button" id="giAllDec">${S.allDecisions ? "Show less" : "View all recommendations"} →</button>` : "");
    if (st.s !== "ok") { slot.innerHTML = hd + stateBox(st, "decisions"); wireRetry(); return; }
    const q = S.q.toLowerCase(), all = st.data.filter(d => !q || ((d.title || "") + " " + (d.recommendation || "")).toLowerCase().includes(q));
    if (!all.length) { slot.innerHTML = hd + `<div class="gi-state">${st.data.length ? "No decisions match your search." : "No business decisions yet. GLIME adds recommendations here when it finds a verified signal."}</div>`; wireAll(); return; }
    const rows = S.allDecisions ? all : all.slice(0, 3), pm = priorityMap();
    slot.innerHTML = hd + `<div class="gi-tw"><table class="gi-tb"><thead><tr><th>Priority</th><th>Recommendation</th><th>Confidence</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
      ${rows.map(d => { const p = PRI[pm[d.decision_id]], s = rowStatus(d), id = esc(d.decision_id);
        return `<tr><td>${p ? `<span class="pill ${p[0]}">${p[1]}</span>` : `<span class="gi-dash">—</span>`}</td>
        <td><button class="gi-rec" type="button" data-id="${id}">${esc(d.title || "Business decision")}</button>${d.recommendation ? `<small class="gi-rs">${esc(d.recommendation)}</small>` : ""}</td>
        <td>${conf(d.confidence)}</td><td><span class="pill ${STC[s] || "blue"}">${esc(human(s))}</span></td><td>${esc(stamp(d.decision_created_at))}</td>
        <td style="position:relative;text-align:right"><button class="gi-more" type="button" data-id="${id}" aria-label="Actions">…</button>${S.openMenu === d.decision_id ? menu(d) : ""}</td></tr>`; }).join("")}
      </tbody></table></div>`;
    wireAll();
    $$(".gi-rec").forEach(b => b.onclick = () => decisionModal(st.data.find(x => String(x.decision_id) === b.dataset.id)));
    $$(".gi-more").forEach(b => b.onclick = e => { e.stopPropagation(); S.openMenu = S.openMenu === b.dataset.id ? null : b.dataset.id; renderDecisions(); });
    $$(".gi-menu button").forEach(b => b.onclick = e => { e.stopPropagation(); decide(b.dataset.a, st.data.find(x => String(x.decision_id) === b.dataset.id)); });
  }
  function menu(d) {
    const id = esc(d.decision_id), items = [`<button data-a="details" data-id="${id}">View details</button>`];
    if (leadSpecific(d)) items.push(`<button data-a="leads" data-id="${id}">Manage lead proposals</button>`);
    else if (!d.action_request_id) items.push(`<button data-a="prepare" data-id="${id}">Prepare action</button>`);
    if (canDecide(d)) items.push(`<button data-a="approve" data-id="${id}">Approve &amp; queue</button><button data-a="reject" data-id="${id}">Reject</button>`);
    return `<div class="gi-menu">${items.join("")}</div>`;
  }
  async function decide(a, d) {
    S.openMenu = null; if (!d) return renderDecisions();
    if (a === "details") { renderDecisions(); return decisionModal(d); }
    if (a === "leads") { renderDecisions(); const adv = $("#giAdv"); adv.open = true; loadG(); adv.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); return; }
    if (a === "approve" && !window.confirm("Approve this proposal and queue it for execution?")) return renderDecisions();
    if (a === "reject" && !window.confirm("Reject this proposal? No action will be executed.")) return renderDecisions();
    renderDecisions();
    try {
      if (a === "prepare") { const r = await rpc("create_client_decision_action_proposal", { p_decision_id: d.decision_id }); toast(r && r.proposal_created ? "Action proposal created. Your approval is still required." : "No proposal created: " + ((r && r.evaluation && r.evaluation.reason) || "no enabled specialist action is available.")); }
      else if (a === "approve") { const r = await rpc("approve_client_business_action", { p_action_request_id: d.action_request_id }); toast("Approved and queued" + (r && r.job_id ? " (job " + String(r.job_id).slice(0, 8) + ")" : "") + "."); }
      else if (a === "reject") { await rpc("reject_client_business_action", { p_action_request_id: d.action_request_id }); toast("Proposal rejected. Nothing was executed."); }
      await Promise.all([loadPart("decisions"), loadPart("impact")]);
    } catch (e) { toast("Could not complete: " + (e.message || e)); }
  }
  function decisionModal(d) {
    if (!d) return; const nb = d.next_best_action && typeof d.next_best_action === "object" ? Object.entries(d.next_best_action).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)) : [];
    const sec = (l, v) => v ? `<div class="row" style="display:block"><span style="color:#8b97a6">${l}</span><p style="margin:4px 0 0">${esc(v)}</p></div>` : "";
    modal(`<h3>${esc(d.title || "Business decision")}</h3><p><span class="pill ${STC[rowStatus(d)] || "blue"}">${esc(human(rowStatus(d)))}</span> Confidence ${conf(d.confidence)} · Source ${esc(d.source || "—")} · ${esc(stamp(d.decision_created_at))}</p>
      ${sec("Problem", d.problem)}${sec("Root cause", d.root_cause)}${sec("Recommendation", d.recommendation)}
      ${nb.length ? `<div class="row" style="display:block"><span style="color:#8b97a6">Next best action</span><ul>${nb.map(([k, v]) => `<li>${esc(human(k))}: ${esc(v)}</li>`).join("")}</ul></div>` : ""}
      ${d.action_request_id ? `<div class="row"><span>Action</span><b>${esc(d.target_module_slug || "Specialist")} · ${esc(d.target_action || "action")} · ${esc(human(d.action_status))}</b></div>` : ""}
      ${d.impact_summary ? sec("Impact", d.impact_summary) : ""}`);
  }
  function loadG() {
    if (S.gLoaded) return; S.gLoaded = true;
    const s = document.createElement("script"); s.src = "glime-phase-g-decision-action-center.js"; document.body.appendChild(s);
  }

  /* ---------- hero insight ---------- */
  function renderInsight() {
    const el = $("#giInsightText"), st = S.insights;
    if (st.s === "loading") { el.textContent = "Loading insight…"; return; }
    if (st.s !== "ok") { el.textContent = "Insights are unavailable right now."; return; }
    const l = st.data.map(i => i.summary || i.title).filter(Boolean);
    el.textContent = l.length ? l[S.insight % l.length] : "No open insights right now. GLIME will show one when it finds a verified signal.";
  }

  /* ---------- helpers ---------- */
  function toast(msg) { const t = $("#giToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3200); }
  function modal(html) { $("#giMd").innerHTML = `<button class="x" type="button" id="giX">Close</button>${html}`; $("#giModal").hidden = false; $("#giX").onclick = closeModal; }
  function closeModal() { $("#giModal").hidden = true; }
  function wireAll() {
    const a = $("#giAllActions"); if (a) a.onclick = () => { S.allActions = !S.allActions; renderImpact(); };
    const d = $("#giAllDec"); if (d) d.onclick = () => { S.allDecisions = !S.allDecisions; renderDecisions(); };
    wireRetry();
  }
  function banner(msg) { const b = $("#giBanner"); b.textContent = msg; b.hidden = !msg; }

  const PARTS = { trend: [() => Source.trend(S.key), renderPulse], impact: [Source.impact, renderImpact], evidence: [Source.evidence, renderEvidence], decisions: [Source.decisions, renderDecisions], insights: [Source.insights, () => { renderInsight(); if (S.decisions.s === "ok") renderDecisions(); }] };
  async function loadPart(name) {
    const [fn, draw] = PARTS[name], my = name === "trend" ? ++S.seq : null;
    S[name] = { s: "loading" }; if (name !== "insights") draw();
    try { const data = await fn(); if (my !== null && my !== S.seq) return; S[name] = { s: "ok", data: Array.isArray(data) || (data && typeof data === "object") ? data : (name === "evidence" ? { metrics: [] } : []) }; }
    catch (e) { if (my !== null && my !== S.seq) return; console.error("[GLIME Growth]", name, e); S[name] = { s: "error", error: e }; }
    draw();
  }
  const loadAll = () => Promise.all(Object.keys(PARTS).map(loadPart));

  async function setRange(key) {
    if (key === S.key) return; S.key = key; S.sel = null; S.day = { s: "idle" }; S.daySeq++; $("#giRange").value = key; await loadPart("trend");
  }

  async function init() {
    skeleton();
    $("#giRange").onchange = e => setRange(e.target.value);
    $("#giInsight").onclick = () => { S.insight++; renderInsight(); };
    $("#giRefresh").onclick = () => { if (sb) { loadAll(); toast("Refreshing…"); } };
    $("#giModal").onclick = e => { if (e.target.id === "giModal") closeModal(); };
    $("#giSearch").oninput = e => { S.q = e.target.value.trim(); if (S.impact.s === "ok") renderImpact(); if (S.decisions.s === "ok") renderDecisions(); };
    $("#giAdv").addEventListener("toggle", e => { if (e.target.open) loadG(); });
    document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#giSearch").focus(); } if (e.key === "Escape") closeModal(); });
    document.addEventListener("click", () => { if (S.openMenu) { S.openMenu = null; if (S.decisions.s === "ok") renderDecisions(); } });
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (S.trend.s === "ok") renderTrendOnly(); }, 120); });

    if (!client()) { banner("Could not connect to GLIME. Please refresh the page."); return; }
    let session = null;
    try { const r = await sb.auth.getSession(); session = r.data && r.data.session; } catch (e) { console.error(e); }
    if (!session) {
      banner("Please sign in to see your Business Growth Intelligence."); $("#giInsightText").textContent = "Sign in to see your insights.";
      ["glime-growth-overview-slot", "glime-action-impact-slot", "glime-evidence-confidence-slot", "glime-decisions-table-slot"].forEach(id => { $("#" + id).innerHTML = `<div class="gi-state">Sign in required. <a class="gi-link" href="login.html">Sign in</a></div>`; });
      return;
    }
    const em = (session.user && session.user.email) || ""; if (em) $("#giAvatar").textContent = em[0].toUpperCase();
    loadAll();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init, { once: true }) : init();
})();
