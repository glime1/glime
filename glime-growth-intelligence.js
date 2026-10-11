/* GLIME Business Growth Intelligence — FRONTEND ONLY.
 *
 * All data comes from ONE place: Source.load(rangeKey). Right now it returns demo
 * data (DEMO_MODE = true). When the backend is ready, replace the body of
 * Source.load with a real call and set DEMO_MODE = false. Nothing else changes.
 *
 * Source.load(rangeKey) must resolve to (rangeKey: '7d' | '30d' | 'month'):
 * {
 *   range:   { label:'Last 7 Days', from:'2026-10-04', to:'2026-10-10', compareLabel:'previous 7 days' },
 *   kpis:    { revenue:{value, deltaPct}, orders:{...}, leads:{...}, customers:{...} },   // deltaPct may be null
 *   trend:   { dates:['2026-10-04',...], revenue:[..], orders:[..], leads:[..], customers:[..] },
 *   sources: [ { name:'Instagram', count:147 }, ... ],                                   // sum = total leads
 *   impact:  [ { id, channel:'instagram|whatsapp|email', title, status:'measured|pending',
 *                newLeads, orders, revenue, measuredOn|expectedBy, note } ],              // null values => "—"
 *   evidence:[ { id, label, valuePct, confidence:'High|Medium|Low', basis:'Based on 186 leads', explain } ],
 *   decisions:[ { id, priority:'High|Medium|Low', title, expectedImpact, status:'Pending Review|Approved|In Progress|Rejected', createdOn } ],
 *   insights:[ 'text', ... ]
 * }
 * Approve / Reject on a decision should call a backend action; today it only changes local state.
 */
(() => {
  "use strict";

  const DEMO_MODE = true;
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");
  const compact = n => n >= 1e5 ? (n / 1e5).toFixed(1).replace(/\.0$/, "") + "L" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(Math.round(n));
  const sum = a => a.reduce((x, y) => x + y, 0);
  const dayLabel = iso => { const d = new Date(iso + "T00:00:00Z"); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
  const fullLabel = iso => dayLabel(iso) + " " + iso.slice(0, 4);
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- icons ---------------- */
  const I = (p, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC = {
    pulse: I('<path d="M3 12h4l2-6 4 12 2-6h6"/>'),
    target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
    bars: I('<path d="M5 20V11M12 20V4M19 20v-7"/>'),
    bolt: I('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    rupee: I('<path d="M6 4h12M6 9h12M9 4c5 0 6 5 0 6l6 9"/>'),
    cart: I('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 12h11l2-8H6"/>'),
    users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6"/>'),
    userplus: I('<circle cx="10" cy="8" r="3.8"/><path d="M3 20c0-3.8 3.2-6.2 7-6.2s7 2.4 7 6.2M19 8v6M16 11h6"/>'),
    search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 16),
    bell: I('<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0"/>'),
    cal: I('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 15),
    chev: I('<path d="m9 6 6 6-6 6"/>', 16),
    bulb: I('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>', 20),
    ig: I('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".8" fill="currentColor"/>'),
    wa: I('<path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.5z"/><path d="M9 9c0 3 3 6 6 6l1-1.6-2-1-1 .8c-.8-.4-1.6-1.2-2-2l.8-1-1-2z"/>'),
    mail: I('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>')
  };
  const CHANNEL = {
    instagram: { icon: IC.ig, bg: "linear-gradient(135deg,#f9a03f,#e1306c 55%,#833ab4)" },
    whatsapp: { icon: IC.wa, bg: "#1fb66a" },
    email: { icon: IC.mail, bg: "#2f7df6" }
  };

  /* ---------------- DATA SOURCE (swap for backend) ---------------- */
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  function demoTrend(key) {
    const end = Date.UTC(2026, 9, 10);
    if (key === "7d") {
      return { dates: [4,5,6,7,8,9,10].map(d => `2026-10-${String(d).padStart(2, "0")}`),
        revenue: [28400, 31200, 35600, 48320, 33100, 36800, 35510],
        orders: [28, 33, 38, 52, 31, 32, 34],
        leads: [48, 55, 61, 78, 52, 66, 72],
        customers: [9, 11, 12, 14, 10, 14, 16] };
    }
    const n = key === "30d" ? 30 : 10, r = rng(key === "30d" ? 7 : 11);
    const t = { dates: [], revenue: [], orders: [], leads: [], customers: [] };
    for (let i = 0; i < n; i++) {
      const lift = 0.75 + (i / n) * 0.5, wk = [1, .95, 1.05, 1.1, 1.2, .9, .8][i % 7];
      const rev = Math.round((31000 * lift * wk * (0.85 + r() * 0.3)) / 10) * 10;
      t.dates.push(iso(end - (n - 1 - i) * 864e5));
      t.revenue.push(rev);
      t.orders.push(Math.max(1, Math.round(rev / (880 + r() * 220))));
      t.leads.push(Math.round(50 * lift * wk * (0.85 + r() * 0.35)));
      t.customers.push(Math.max(1, Math.round(10 * lift * wk * (0.8 + r() * 0.4))));
    }
    return t;
  }

  const DEMO = {
    impact: [
      { id: "i1", channel: "instagram", title: "Instagram Follow-up Automation", status: "measured", newLeads: 62, orders: 18, revenue: 120000, measuredOn: "2026-10-08",
        note: "Leads and orders measured for 7 days after approval, compared with the 7 days before." },
      { id: "i2", channel: "whatsapp", title: "WhatsApp Re-engagement Campaign", status: "measured", newLeads: 48, orders: 12, revenue: 86000, measuredOn: "2026-10-06",
        note: "Measured on customers who received the broadcast within the observation window." },
      { id: "i3", channel: "email", title: "Email Nurture Sequence", status: "pending", newLeads: null, orders: null, revenue: null, expectedBy: "2026-10-12",
        note: "Still inside the observation window. Results will appear once enough data exists." },
      { id: "i4", channel: "instagram", title: "Story Reply Auto-qualification", status: "measured", newLeads: 31, orders: 7, revenue: 41500, measuredOn: "2026-10-03",
        note: "Impact is an association with the action, not proof that the action caused it." },
      { id: "i5", channel: "whatsapp", title: "Abandoned Quote Reminder", status: "pending", newLeads: null, orders: null, revenue: null, expectedBy: "2026-10-14",
        note: "Observation window has not ended yet." }
    ],
    evidence: [
      { id: "e1", label: "Lead → Customer Conversion", valuePct: 72, confidence: "High", basis: "Based on 186 leads",
        explain: "Share of leads in the period that became customers. High confidence because the sample is large and every lead has a recorded status." },
      { id: "e2", label: "Instagram Lead Quality", valuePct: 68, confidence: "Medium", basis: "Based on 147 leads",
        explain: "Share of Instagram leads qualified as genuine buyers. Medium confidence: some leads have no recorded interest or budget yet." },
      { id: "e3", label: "Repeat Purchase Rate", valuePct: 35, confidence: "Medium", basis: "Based on 89 customers",
        explain: "Customers with two or more orders. Medium confidence because the customer sample is still small." },
      { id: "e4", label: "Average Order Value", valuePct: 86, confidence: "High", basis: "Based on 248 orders",
        explain: "Consistency of order value versus your target basket size. High confidence because 248 orders is a large sample." }
    ],
    decisions: [
      { id: "d1", priority: "High", title: "Re-engage 42 inactive Instagram leads", expectedImpact: "+25-40 new orders", status: "Pending Review", createdOn: "2026-10-08" },
      { id: "d2", priority: "Medium", title: "Launch WhatsApp offer for interested leads", expectedImpact: "+15-30 new orders", status: "Approved", createdOn: "2026-10-07" },
      { id: "d3", priority: "Low", title: "Follow up with pending quotes (18)", expectedImpact: "+10-20 new orders", status: "In Progress", createdOn: "2026-10-06" },
      { id: "d4", priority: "Medium", title: "Ask 30 recent customers for a repeat order", expectedImpact: "+8-14 repeat orders", status: "Pending Review", createdOn: "2026-10-05" },
      { id: "d5", priority: "Low", title: "Add product details to 12 incomplete leads", expectedImpact: "Better lead quality", status: "Pending Review", createdOn: "2026-10-04" }
    ],
    insights: [
      "Your revenue is up 18% this week. Instagram leads are converting 2x better than last week.",
      "WhatsApp re-engagement brought +12 orders. Repeat the campaign for customers inactive for 30+ days.",
      "35% repeat purchase rate is your weakest signal. A follow-up message to recent buyers is the next best action."
    ]
  };

  const Source = {
    async load(key) {
      await new Promise(r => setTimeout(r, 250));               // simulate network
      const t = demoTrend(key);
      const meta = {
        "7d": { label: "Last 7 Days", cmp: "previous 7 days", d: [18, 12, 28, 21] },
        "30d": { label: "Last 30 Days", cmp: "previous 30 days", d: [14, 9, 22, 17] },
        "month": { label: "This Month", cmp: "last month", d: [11, 8, 19, 12] }
      }[key];
      const leads = sum(t.leads), pct = [34, 28, 16, 12, 10];
      const names = ["Instagram", "WhatsApp", "Website", "Referral", "Other"];
      let src = key === "7d" ? [147, 121, 69, 52, 43] : pct.map(p => Math.round(leads * p / 100));
      if (key !== "7d") src[0] += leads - sum(src);
      return {
        range: { key, label: meta.label, from: t.dates[0], to: t.dates[t.dates.length - 1], compareLabel: meta.cmp },
        kpis: { revenue: { value: sum(t.revenue), deltaPct: meta.d[0] }, orders: { value: sum(t.orders), deltaPct: meta.d[1] },
                leads: { value: leads, deltaPct: meta.d[2] }, customers: { value: sum(t.customers), deltaPct: meta.d[3] } },
        trend: t,
        sources: names.map((name, i) => ({ name, count: src[i] })),
        ...DEMO
      };
    }
  };

  /* ---------------- state ---------------- */
  const S = { key: "7d", data: null, idx: 0, insight: 0, allActions: false, allDecisions: false, openEv: null, openMenu: null, seq: 0 };
  const SRC_COLOR = { Instagram: "#ff4d8d", WhatsApp: "#19e68c", Website: "#a06bff", Referral: "#ff9a2e", Other: "#3aa0ff" };

  /* ---------------- shell skeleton ---------------- */
  function skeleton() {
    const root = $("#giRoot");
    root.innerHTML = `
      <div class="gi-tools">
        <label class="gi-search">${IC.search}<input id="giSearch" type="search" placeholder="Search leads, customers, orders…" autocomplete="off"><kbd>Ctrl + K</kbd></label>
        <label class="gi-select">${IC.cal}<select id="giRange" aria-label="Date range">
          <option value="7d">Last 7 Days</option><option value="30d">Last 30 Days</option><option value="month">This Month</option></select></label>
        <button class="gi-bell" type="button" aria-label="Notifications" id="giBell">${IC.bell}<i></i></button>
        <div class="gi-avatar" id="giAvatar" aria-hidden="true">R</div>
      </div>
      <header class="gi-head">
        <div>
          <h1>Business Growth <span>Intelligence</span></h1>
          <p>See what changed, understand why it matters, and know what to do next.</p>
          ${DEMO_MODE ? '<span class="gi-demo" title="Numbers on this page are sample values. Backend is not connected yet.">Demo data · backend not connected</span>' : ""}
        </div>
        <button class="gi-insight" type="button" id="giInsight" aria-label="Next insight">
          <span class="bulb">${IC.bulb}</span>
          <span><b>GLIME AI Insight</b><span id="giInsightText"></span></span>
          <span class="nx">${IC.chev}</span>
        </button>
      </header>
      <section class="gi-sec" id="glime-growth-overview-slot" aria-label="Daily Business Pulse"></section>
      <section class="gi-sec" id="glime-action-impact-slot" aria-label="GLIME Action Impact"></section>
      <section class="gi-sec" id="glime-evidence-confidence-slot" aria-label="Evidence and Confidence"></section>
      <section class="gi-sec" id="glime-decision-action-slot" aria-label="Decisions and Next Actions"></section>
      <div class="gi-toast" id="giToast" role="status" aria-live="polite"></div>
      <div class="gi-modal" id="giModal" hidden><div class="gi-md" id="giMd" role="dialog" aria-modal="true"></div></div>`;
  }

  const head = (n, icon, title, sub, right = "") =>
    `<div class="gi-sh"><span class="gi-num">${n}</span><span class="gi-ico">${icon}</span>
     <div class="gi-st"><h2>${title}</h2><p>${sub}</p></div><div class="gi-ctrl">${right}</div></div>`;

  /* ---------------- 1. Daily Business Pulse ---------------- */
  function renderPulse() {
    const d = S.data, r = d.range;
    const tabs = [["7d", "7 Days"], ["30d", "30 Days"], ["month", "This Month"]]
      .map(([k, l]) => `<button type="button" data-k="${k}" class="${k === S.key ? "on" : ""}">${l}</button>`).join("");
    const kp = [
      ["revenue", "Revenue", IC.rupee, "k-green", d.kpis.revenue, inr],
      ["orders", "Orders", IC.cart, "k-blue", d.kpis.orders, n => Math.round(n).toLocaleString("en-IN")],
      ["leads", "New Leads", IC.users, "k-purple", d.kpis.leads, n => Math.round(n).toLocaleString("en-IN")],
      ["customers", "New Customers", IC.userplus, "k-orange", d.kpis.customers, n => Math.round(n).toLocaleString("en-IN")]
    ].map(([id, label, icon, cls, k, f]) => {
      const has = k.deltaPct !== null && k.deltaPct !== undefined;
      const up = has && k.deltaPct >= 0;
      return `<div class="gi-kpi ${cls}"><div class="ic">${icon}</div>
        <div class="v" data-count="${k.value}" data-fmt="${id}">${f(k.value)}</div><div class="l">${label}</div>
        <div class="d ${has ? (up ? "up" : "down") : ""}">${has ? (up ? "↑" : "↓") + " " + Math.abs(k.deltaPct) + "%" : "—"}<small>vs ${esc(r.compareLabel)}</small></div>
        <svg class="deco" width="30" height="24" viewBox="0 0 30 24" fill="currentColor" opacity=".85"><rect x="2" y="12" width="5" height="10" rx="1.5"/><rect x="12" y="6" width="5" height="16" rx="1.5"/><rect x="22" y="1" width="5" height="21" rx="1.5"/></svg></div>`;
    }).join("");
    $("#glime-growth-overview-slot").innerHTML =
      head(1, IC.pulse, "Daily Business Pulse", `Your business performance over the ${esc(r.label.toLowerCase())}`,
        `<div class="gi-tabs" role="tablist">${tabs}</div><div class="gi-chip">${IC.cal}${esc(dayLabel(r.from))} - ${esc(fullLabel(r.to))}</div>`) +
      `<div class="gi-kpis">${kp}</div>
       <div class="gi-pulse">
         <div class="gi-box"><h3>Revenue &amp; Orders Trend <em style="--c:#19e68c">Revenue (₹)</em><em style="--c:#3aa0ff">Orders</em></h3>
           <div class="gi-chart" id="giChart"></div></div>
         <div class="gi-box"><h3>Leads by Source</h3><div class="gi-donut" id="giDonut"></div></div>
       </div>`;
    $("#glime-growth-overview-slot").querySelectorAll(".gi-tabs button").forEach(b => b.onclick = () => setRange(b.dataset.k));
    countUp();
    S.idx = S.key === "7d" ? 3 : d.trend.revenue.indexOf(Math.max(...d.trend.revenue));
    drawTrend(); drawDonut();
  }

  function countUp() {
    document.querySelectorAll(".gi-kpi .v").forEach(el => {
      const to = +el.dataset.count, f = el.dataset.fmt === "revenue" ? inr : n => Math.round(n).toLocaleString("en-IN");
      if (reduceMotion) return;
      const t0 = performance.now();
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

  function drawTrend() {
    const host = $("#giChart"); if (!host || !S.data) return;
    const t = S.data.trend, n = t.dates.length, W = Math.max(260, host.clientWidth), H = 250;
    const m = { l: 46, r: 34, t: 12, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const rs = niceStep(Math.max(...t.revenue) / 4), rmax = rs * 4;
    const os = niceStep(Math.max(...t.orders) / 4), omax = os * 4;
    const X = i => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const YR = v => m.t + ih - (v / rmax) * ih, YO = v => m.t + ih - (v / omax) * ih;
    const rp = t.revenue.map((v, i) => [X(i), YR(v)]), op = t.orders.map((v, i) => [X(i), YO(v)]);
    const base = m.t + ih, rl = smooth(rp);
    let grid = "";
    for (let g = 0; g <= 4; g++) {
      const y = m.t + ih - (g / 4) * ih;
      grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,.06)"/>
        <text x="${m.l - 8}" y="${y + 3}" text-anchor="end" fill="#7d8a99" font-size="9.5">${g ? "₹" + compact(rs * g) : "0"}</text>
        <text x="${W - m.r + 8}" y="${y + 3}" fill="#7d8a99" font-size="9.5">${os * g}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / (W < 420 ? 4 : 8)));
    let xl = "";
    t.dates.forEach((dt, i) => { if (i % every === 0 || i === n - 1) xl += `<text x="${X(i)}" y="${H - 7}" text-anchor="middle" fill="#7d8a99" font-size="9.5">${dayLabel(dt)}</text>`; });
    const a = S.idx, ax = X(a);
    host.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Revenue and orders trend">
      <defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#19e68c" stop-opacity=".45"/><stop offset="1" stop-color="#19e68c" stop-opacity="0"/></linearGradient>
      <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3aa0ff" stop-opacity=".22"/><stop offset="1" stop-color="#3aa0ff" stop-opacity="0"/></linearGradient></defs>
      ${grid}${xl}
      <path d="${smooth(op)}L${X(n - 1)},${base}L${X(0)},${base}Z" fill="url(#gB)"/>
      <path d="${rl}L${X(n - 1)},${base}L${X(0)},${base}Z" fill="url(#gA)"/>
      <path d="${smooth(op)}" fill="none" stroke="#3aa0ff" stroke-width="2"/>
      <path d="${rl}" fill="none" stroke="#19e68c" stroke-width="2.4"/>
      <line x1="${ax}" x2="${ax}" y1="${m.t}" y2="${base}" stroke="rgba(25,230,140,.7)" stroke-dasharray="3 3"/>
      <circle cx="${ax}" cy="${YR(t.revenue[a])}" r="4.5" fill="#19e68c" stroke="#06100c" stroke-width="2"/>
      <circle cx="${ax}" cy="${YO(t.orders[a])}" r="4.5" fill="#3aa0ff" stroke="#06100c" stroke-width="2"/></svg>
      <div class="gi-tip" id="giTip"><b>${esc(fullLabel(t.dates[a]))}</b>
        <div><i style="background:#19e68c"></i>Revenue<strong>${inr(t.revenue[a])}</strong></div>
        <div><i style="background:#3aa0ff"></i>Orders<strong>${t.orders[a]}</strong></div>
        <div><i style="background:#ff4d8d"></i>New Leads<strong>${t.leads[a]}</strong></div>
        <div><i style="background:#ff9a2e"></i>New Customers<strong>${t.customers[a]}</strong></div></div>`;
    const tip = $("#giTip"), tw = tip.offsetWidth || 170;
    tip.style.left = Math.max(4, Math.min(W - tw - 4, ax - tw / 2)) + "px";
    tip.style.top = Math.max(0, Math.min(YR(t.revenue[a]), YO(t.orders[a])) - tip.offsetHeight - 10) + "px";
    if (tip.offsetTop < 2) tip.style.top = "6px";
    const move = e => {
      const rect = host.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const i = Math.max(0, Math.min(n - 1, Math.round(((x - m.l) / iw) * (n - 1))));
      if (i !== S.idx) { S.idx = i; drawTrend(); }
    };
    host.onpointermove = move; host.onpointerdown = move;
  }

  function drawDonut() {
    const host = $("#giDonut"); if (!host) return;
    const list = S.data.sources, total = sum(list.map(s => s.count)) || 1, R = 54, C = 2 * Math.PI * R, gap = 3;
    let off = 0, arcs = "";
    list.forEach((s, i) => {
      const len = Math.max(0, (s.count / total) * C - gap);
      arcs += `<circle data-i="${i}" cx="70" cy="70" r="${R}" fill="none" stroke="${SRC_COLOR[s.name] || "#667"}" stroke-width="15"
        stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)" stroke-linecap="butt"/>`;
      off += (s.count / total) * C;
    });
    host.innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Leads by source">
        ${arcs}<text x="70" y="68" text-anchor="middle" fill="#fff" font-size="22" font-weight="700">${total.toLocaleString("en-IN")}</text>
        <text x="70" y="84" text-anchor="middle" fill="#8b97a6" font-size="9.5">Total Leads</text></svg>
      <div class="gi-legend">${list.map((s, i) => `<div data-i="${i}"><i style="background:${SRC_COLOR[s.name] || "#667"}"></i>${esc(s.name)}<span>${Math.round(s.count / total * 100)}% (${s.count})</span></div>`).join("")}</div>`;
    const hl = (i, on) => {
      host.querySelectorAll("circle").forEach(c => c.style.opacity = on && +c.dataset.i !== i ? ".35" : "1");
      host.querySelectorAll(".gi-legend div").forEach(d => d.classList.toggle("hl", on && +d.dataset.i === i));
    };
    host.querySelectorAll("[data-i]").forEach(el => { el.onmouseenter = () => hl(+el.dataset.i, true); el.onmouseleave = () => hl(0, false); });
  }

  /* ---------------- 2. Action Impact ---------------- */
  function renderImpact() {
    const list = S.data.impact;
    const cards = list.map(a => {
      const ch = CHANNEL[a.channel] || CHANNEL.email, m = a.status === "measured";
      const num = (v, f, pre = "+") => v === null || v === undefined ? `<b class="nil">—</b>` : `<b class="pos">${pre}${f ? f(v) : v}</b>`;
      return `<article class="gi-imp ${m ? "measured" : ""}">
        <div class="gi-imp-h"><span class="lg" style="background:${ch.bg}">${ch.icon}</span><b>${esc(a.title)}</b><span class="pill ${m ? "green" : "amber"}">${m ? "Measured" : "Pending"}</span></div>
        <div class="gi-stats"><div>${num(a.newLeads)}<small>New Leads</small></div><div>${num(a.orders)}<small>Orders</small></div>
          <div>${num(a.revenue, v => "₹" + compact(v))}<small>Revenue</small></div></div>
        <div class="gi-imp-f">${m ? "Measured on " + esc(fullLabel(a.measuredOn)) : "Expected by " + esc(fullLabel(a.expectedBy))}</div>
        <button class="gi-btn" type="button" data-id="${esc(a.id)}">View Details →</button></article>`;
    }).join("");
    $("#glime-action-impact-slot").innerHTML =
      head(2, IC.target, "GLIME Action Impact", "Real results from approved GLIME actions",
        `<button class="gi-link" type="button" id="giAllActions">${S.allActions ? "Show less" : "View all actions"} →</button>`) +
      `<div class="gi-imp-wrap"><div class="gi-track ${S.allActions ? "wrap" : ""}" id="giTrack">${cards}</div>
        ${S.allActions || list.length <= 3 ? "" : `<button class="gi-next" type="button" id="giNext" aria-label="Next actions">${IC.chev}</button>`}</div>`;
    $("#giAllActions").onclick = () => { S.allActions = !S.allActions; renderImpact(); };
    const nx = $("#giNext"); if (nx) nx.onclick = () => { const tr = $("#giTrack"); tr.scrollBy({ left: tr.clientWidth * .6, behavior: "smooth" }); };
    document.querySelectorAll("#giTrack .gi-btn").forEach(b => b.onclick = () => {
      const a = list.find(x => x.id === b.dataset.id); if (!a) return;
      const m = a.status === "measured", v = (x, f) => x === null || x === undefined ? "—" : f(x);
      modal(`<h3>${esc(a.title)}</h3><p><span class="pill ${m ? "green" : "amber"}">${m ? "Measured" : "Pending"}</span></p>
        <div class="row"><span>New leads</span><b>${v(a.newLeads, x => "+" + x)}</b></div>
        <div class="row"><span>Orders</span><b>${v(a.orders, x => "+" + x)}</b></div>
        <div class="row"><span>Revenue</span><b>${v(a.revenue, x => "+" + inr(x))}</b></div>
        <div class="row"><span>${m ? "Measured on" : "Expected by"}</span><b>${esc(fullLabel(m ? a.measuredOn : a.expectedBy))}</b></div>
        <p>${esc(a.note || "")}</p><p style="color:#8b97a6">Observed change after the action. It shows association, not proven cause.</p>`);
    });
  }

  /* ---------------- 3. Evidence & Confidence ---------------- */
  function ring(pct, color) {
    const R = 26, C = 2 * Math.PI * R;
    return `<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
      <circle cx="32" cy="32" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C * pct / 100} ${C}" transform="rotate(-90 32 32)"/>
      <text x="32" y="36" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">${pct}%</text></svg>`;
  }
  function renderEvidence() {
    const list = S.data.evidence, col = c => c === "High" ? "#19e68c" : c === "Medium" ? "#ff9a2e" : "#ff4d5e";
    const open = list.find(e => e.id === S.openEv);
    $("#glime-evidence-confidence-slot").innerHTML =
      head(3, IC.bars, "Evidence &amp; Confidence", "What the data tells us and how confident we are",
        `<button class="gi-link" type="button" id="giFull">${open ? "Hide analysis" : "View full analysis"} →</button>`) +
      `<div class="gi-ev">${list.map(e => `<button type="button" class="gi-evc" data-id="${esc(e.id)}"><b>${esc(e.label)}</b>
        <div class="gi-evr">${ring(e.valuePct, col(e.confidence))}<div><strong style="color:${col(e.confidence)}">${esc(e.confidence)} Confidence</strong><small>${esc(e.basis)}</small></div></div></button>`).join("")}
        <div class="gi-evx" id="giEvx" ${open ? "" : "hidden"}>${open ? `<b>${esc(open.label)}</b><br>${esc(open.explain)}<br><span style="color:#8b97a6">Based on observed business data. This does not prove what caused the result.</span>` : ""}</div></div>`;
    document.querySelectorAll(".gi-evc").forEach(b => b.onclick = () => { S.openEv = S.openEv === b.dataset.id ? null : b.dataset.id; renderEvidence(); });
    $("#giFull").onclick = () => { S.openEv = open ? null : list[0].id; renderEvidence(); };
  }

  /* ---------------- 4. Decisions ---------------- */
  const PRI = { High: ["red", "▲ High"], Medium: ["amber", "◆ Medium"], Low: ["blue", "▼ Low"] };
  const STA = { "Pending Review": "amber", "Approved": "green", "In Progress": "blue", "Rejected": "red" };
  function renderDecisions() {
    const all = S.data.decisions, rows = S.allDecisions ? all : all.slice(0, 3);
    $("#glime-decision-action-slot").innerHTML =
      head(4, IC.bolt, "Decisions &amp; Next Actions", "GLIME's recommendations to grow your business",
        `<button class="gi-link" type="button" id="giAllDec">${S.allDecisions ? "Show less" : "View all recommendations"} →</button>`) +
      `<div class="gi-tw"><table class="gi-tb"><thead><tr><th>Priority</th><th>Recommendation</th><th>Expected Impact</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
      ${rows.map(d => `<tr><td><span class="pill ${(PRI[d.priority] || PRI.Low)[0]}">${(PRI[d.priority] || PRI.Low)[1]}</span></td><td>${esc(d.title)}</td><td>${esc(d.expectedImpact)}</td>
        <td><span class="pill ${STA[d.status] || "blue"}">${esc(d.status)}</span></td><td>${esc(fullLabel(d.createdOn))}</td>
        <td style="position:relative;text-align:right"><button class="gi-more" type="button" data-id="${esc(d.id)}" aria-label="Actions">…</button>
        ${S.openMenu === d.id ? `<div class="gi-menu"><button data-a="Approved" data-id="${esc(d.id)}">Approve</button><button data-a="In Progress" data-id="${esc(d.id)}">Mark in progress</button><button data-a="Rejected" data-id="${esc(d.id)}">Reject</button></div>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`;
    $("#giAllDec").onclick = () => { S.allDecisions = !S.allDecisions; renderDecisions(); };
    document.querySelectorAll(".gi-more").forEach(b => b.onclick = e => { e.stopPropagation(); S.openMenu = S.openMenu === b.dataset.id ? null : b.dataset.id; renderDecisions(); });
    document.querySelectorAll(".gi-menu button").forEach(b => b.onclick = e => {
      e.stopPropagation(); const d = all.find(x => x.id === b.dataset.id); if (d) d.status = b.dataset.a;
      S.openMenu = null; renderDecisions(); toast(`Marked "${b.dataset.a}" on this screen only. Backend not connected yet.`);
    });
  }

  /* ---------------- helpers ---------------- */
  function toast(msg) { const t = $("#giToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2800); }
  function modal(html) { const m = $("#giModal"); $("#giMd").innerHTML = `<button class="x" type="button" id="giX">Close</button>${html}`; m.hidden = false; $("#giX").onclick = closeModal; }
  function closeModal() { $("#giModal").hidden = true; }
  function renderInsight() { const l = S.data.insights; $("#giInsightText").textContent = l.length ? l[S.insight % l.length] : "No insight available yet."; }

  async function setRange(key) {
    if (key === S.key && S.data) return;
    S.key = key; const sel = $("#giRange"); if (sel) sel.value = key;
    await load();
  }

  async function load() {
    const my = ++S.seq;
    try {
      const data = await Source.load(S.key);
      if (my !== S.seq) return;                                  // ignore stale response
      const keep = S.data;                                       // keep local decision edits across range changes
      S.data = data; if (keep) data.decisions = keep.decisions;
      renderPulse(); renderImpact(); renderEvidence(); renderDecisions(); renderInsight();
    } catch (e) {
      console.error("[GLIME Growth]", e);
      $("#glime-growth-overview-slot").innerHTML = `<p style="color:#ff9aa5">Could not load business growth data. Please refresh.</p>`;
    }
  }

  function init() {
    skeleton();
    $("#giRange").onchange = e => setRange(e.target.value);
    $("#giInsight").onclick = () => { S.insight++; renderInsight(); };
    $("#giBell").onclick = () => toast("No new notifications.");
    $("#giModal").onclick = e => { if (e.target.id === "giModal") closeModal(); };
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#giSearch").focus(); }
      if (e.key === "Escape") closeModal();
    });
    document.addEventListener("click", () => { if (S.openMenu) { S.openMenu = null; if (S.data) renderDecisions(); } });
    $("#giSearch").onkeydown = e => { if (e.key === "Enter" && e.target.value.trim()) toast("Search will work once the backend is connected."); };
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (S.data) drawTrend(); }, 120); });
    load();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init, { once: true }) : init();
})();
