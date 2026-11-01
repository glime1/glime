/* =========================================================
   GLIME ADMIN — Command Center (replaces the old Overview numbers)
   - Real KPIs from admin_clients_list (no placeholder counts).
   - "Needs your attention": every queue that is waiting for the admin,
     each with a one-tap jump to its tab.
   - Signups per week, trials ending soon, recent signups.
   - Quick search (press / or Ctrl+K, or the Search button): jump to any
     client or any admin tab.
   Uses only existing RPCs. A source that fails is simply skipped.
   Needs window.supabaseClient (set by admin.html).
========================================================= */
(() => {
  "use strict";
  const ID = "glime-cmd", STYLE = ID + "-style";
  let clients = [], busy = false, started = false, tick = null;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const num = (v) => Number(v) || 0;
  const day = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"; };
  const rowsOf = (r) => (r && !r.error && r.data ? (Array.isArray(r.data) ? r.data : Array.isArray(r.data.rows) ? r.data.rows : null) : null);
  const getSb = () => (window.supabaseClient && window.supabaseClient.rpc ? window.supabaseClient : null);
  const nameOf = (c) => c.full_name || c.client_name || c.business_name || c.email || c.client_id || "Client";
  const DAY = 864e5;
  const DONE = new Set(["resolved", "closed", "done", "spam", "cancelled", "completed"]);
  const isOpen = (r) => !DONE.has(String((r && r.status) || "").toLowerCase());

  function go(view) { const b = document.querySelector('nav button[data-view="' + view + '"]'); if (b) b.click(); }

  function styles() {
    if ($(STYLE)) return;
    const s = document.createElement("style");
    s.id = STYLE;
    s.textContent = `
      #${ID} .gc-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
      #${ID} .gc-top h2{margin:0;font-size:1rem;color:#fff}
      #${ID} .gc-top small{color:#687587;font-size:.7rem}
      #${ID} .gc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
      #${ID} .gc-kpi{padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02)}
      #${ID} .gc-kpi small{display:block;color:#9ba7b7;font-size:.72rem}
      #${ID} .gc-kpi b{display:block;color:#fff;font-size:1.6rem;margin:4px 0 2px}
      #${ID} .gc-kpi span{color:#687587;font-size:.68rem}
      #${ID} .gc-card{padding:15px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:14px}
      #${ID} .gc-card h3{margin:0 0 10px;font-size:.88rem;color:#fff}
      #${ID} .gc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)}
      #${ID} .gc-row:last-child{border-bottom:0}
      #${ID} .gc-row div{min-width:0;font-size:.78rem;color:#dfe7ef;word-break:break-word}
      #${ID} .gc-row small{display:block;color:#687587;font-size:.68rem;margin-top:2px}
      #${ID} .gc-n{display:inline-block;min-width:26px;text-align:center;padding:3px 8px;border-radius:999px;font-weight:700;font-size:.76rem;margin-right:8px;background:rgba(255,200,87,.15);color:#ffc857}
      #${ID} .gc-n.hot{background:rgba(255,82,99,.15);color:#ff5263}
      #${ID} button{border:0;border-radius:9px;padding:7px 12px;font:700 .72rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.09);color:#fff;white-space:nowrap}
      #${ID} .gc-clear{padding:12px;border-radius:10px;background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.25);color:#00ff88;font-size:.78rem}
      #${ID} .gc-chart{display:flex;align-items:flex-end;gap:8px;height:120px}
      #${ID} .gc-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;font-size:.65rem;color:#687587}
      #${ID} .gc-bar i{display:block;width:100%;max-width:34px;min-height:3px;border-radius:6px 6px 0 0;background:#22d3ee}
      #${ID} .gc-bar b{color:#fff;font-size:.72rem;margin-bottom:3px}
      #${ID} .gc-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      #${ID} .gc-note{color:#687587;font-size:.72rem}
      @media(max-width:760px){#${ID} .gc-two{grid-template-columns:1fr}}
      #gcPalette{position:fixed;inset:0;z-index:99999;background:rgba(3,6,12,.72);display:none;align-items:flex-start;justify-content:center;padding:8vh 14px 0}
      #gcPalette.open{display:flex}
      #gcPalette .gc-box{width:100%;max-width:560px;background:#0d1522;border:1px solid rgba(255,255,255,.14);border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
      #gcPalette input{width:100%;box-sizing:border-box;padding:15px 16px;border:0;border-bottom:1px solid rgba(255,255,255,.1);background:transparent;color:#fff;font:inherit;font-size:.95rem;outline:none}
      #gcPalette .gc-res{max-height:52vh;overflow:auto}
      #gcPalette .gc-item{display:block;width:100%;text-align:left;border:0;background:transparent;color:#dfe7ef;padding:10px 16px;font:inherit;font-size:.82rem;cursor:pointer}
      #gcPalette .gc-item small{display:block;color:#687587;font-size:.7rem}
      #gcPalette .gc-item.on,#gcPalette .gc-item:hover{background:rgba(34,211,238,.12)}
      #gcPalette .gc-h{padding:8px 16px 4px;color:#687587;font-size:.66rem;text-transform:uppercase;letter-spacing:.06em}`;
    document.head.appendChild(s);
  }

  /* ---------- data ---------- */
  async function fetchAll() {
    const c = getSb(); if (!c) return null;
    const call = (fn, a) => c.rpc(fn, a).then((r) => r, () => ({ error: true }));
    const [cl, rev, ag, ct, fb, del, pay, par] = await Promise.all([
      call("admin_clients_list", { p_search: null, p_status: null, p_limit: 500 }),
      call("admin_account_review_list", { p_status: "pending", p_limit: 200 }),
      call("admin_agency_list", { p_status: "pending" }),
      call("admin_contact_list", { p_type: null, p_status: null, p_search: null, p_limit: 500 }),
      call("admin_feedback_list", { p_type: null, p_status: null, p_search: null, p_limit: 500 }),
      call("admin_list_data_deletion_requests", {}),
      call("admin_payments_list", { p_search: null, p_limit: 500 }),
      call("admin_partner_list", { p_status: null })
    ]);
    const cr = rowsOf(cl);
    if (!cr) return null;
    return { clients: cr.map((x) => x.client || x).filter(Boolean), rev: rowsOf(rev), ag: rowsOf(ag), ct: rowsOf(ct), fb: rowsOf(fb), del: rowsOf(del), pay: rowsOf(pay), par: rowsOf(par) };
  }

  function compute(d) {
    const now = Date.now(), cl = d.clients;
    const st = (c) => String(c.account_status || "").toLowerCase();
    const tr = (c) => String(c.free_trial_status || "").toLowerCase();
    const ts = (c) => (c.created_at ? new Date(c.created_at).getTime() : 0);
    const k = {
      total: cl.length,
      active: cl.filter((c) => st(c) === "active").length,
      suspended: cl.filter((c) => st(c) === "suspended").length,
      trial: cl.filter((c) => tr(c) === "active").length,
      converted: cl.filter((c) => tr(c) === "converted").length,
      expired: cl.filter((c) => tr(c) === "expired").length,
      new7: cl.filter((c) => now - ts(c) <= 7 * DAY).length,
      new30: cl.filter((c) => now - ts(c) <= 30 * DAY).length
    };
    const trials = cl.filter((c) => tr(c) === "active" && c.free_trial_ends_at).map((c) => ({ c, left: Math.ceil((new Date(c.free_trial_ends_at).getTime() - now) / DAY) })).sort((a, b) => a.left - b.left);
    k.trialsSoon = trials.filter((t) => t.left <= 7);
    const weeks = Array.from({ length: 8 }, (_, i) => ({ start: now - (7 - i) * 7 * DAY, n: 0 }));
    cl.forEach((c) => { const i = 7 - Math.floor((now - ts(c)) / (7 * DAY)); if (i >= 0 && i <= 7) weeks[i].n++; });
    k.weeks = weeks;
    k.recent = cl.slice().sort((a, b) => ts(b) - ts(a)).slice(0, 8);
    const pay = d.pay || [], par = d.par || [];
    const KYC_WAIT = ["submitted", "pending", "under_review", "in_review"];
    k.q = {
      reviews: d.rev ? d.rev.length : 0,
      agencies: d.ag ? d.ag.length : 0,
      partnersPending: par.filter((p) => String(p.status).toLowerCase() === "pending").length,
      contacts: d.ct ? d.ct.filter(isOpen).length : 0,
      feedback: d.fb ? d.fb.filter(isOpen).length : 0,
      deletionsDue: d.del ? d.del.filter((r) => r.is_due).length : 0,
      failedPayouts: pay.reduce((t, p) => t + num(p.failed_payouts), 0),
      kycPending: pay.filter((p) => KYC_WAIT.includes(String(p.kyc_status).toLowerCase())).length,
      trialsEnding: trials.filter((t) => t.left <= 3).length
    };
    k.hasPay = !!d.pay; k.hasPar = !!d.par;
    k.payAccounts = pay.length; k.payVerified = pay.filter((p) => String(p.kyc_status).toLowerCase() === "verified").length;
    k.partners = par.length; k.partnerSignups = par.reduce((t, p) => t + num(p.signups), 0);
    return k;
  }

  /* ---------- render ---------- */
  const ATT = [
    ["reviews", "Suspended clients asking for an account review", "reviews", 1],
    ["agencies", "Agency applications waiting for approval", "agency", 1],
    ["partnersPending", "Partner applications waiting", "partner", 1],
    ["deletionsDue", "Data deletion requests past the 30-day wait", "datareq", 1],
    ["failedPayouts", "Failed payouts", "payments", 1],
    ["contacts", "Open contact leads and support requests", "contact", 0],
    ["feedback", "Open feedback items", "feedback", 0],
    ["kycPending", "Payment accounts waiting for KYC review", "payments", 0],
    ["trialsEnding", "Free trials ending within 3 days", "clients", 0]
  ];

  function render(k) {
    const box = $("gcBody"); if (!box) return;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "—");
    const conv = k.converted + k.expired;
    const kpis = [
      ["Total clients", k.total, k.new7 + " new in 7 days · " + k.new30 + " in 30 days"],
      ["Active accounts", k.active, pct(k.active, k.total) + " of all clients"],
      ["On free trial", k.trial, k.trialsSoon.length + " ending within 7 days"],
      ["Trial conversion", conv ? pct(k.converted, conv) : "—", k.converted + " converted · " + k.expired + " expired"],
      ["Suspended", k.suspended, "accounts blocked by admin"]
    ];
    if (k.hasPar) kpis.push(["Partners", k.partners, k.partnerSignups + " signups via referral"]);
    if (k.hasPay) kpis.push(["Payment accounts", k.payAccounts, k.payVerified + " KYC verified"]);
    const att = ATT.filter((a) => k.q[a[0]] > 0);
    const max = Math.max(1, ...k.weeks.map((w) => w.n));
    box.innerHTML = `
      <div class="gc-kpis">${kpis.map(([a, b, c]) => `<div class="gc-kpi"><small>${esc(a)}</small><b>${esc(b)}</b><span>${esc(c)}</span></div>`).join("")}</div>
      <div class="gc-card"><h3>Needs your attention</h3>${att.length ? att.map(([key, label, view, hot]) => `<div class="gc-row"><div><span class="gc-n${hot ? " hot" : ""}">${k.q[key]}</span>${esc(label)}</div><button data-go="${view}">Open</button></div>`).join("") : `<div class="gc-clear">All clear. Nothing is waiting for you.</div>`}</div>
      <div class="gc-two">
        <div class="gc-card"><h3>New signups per week</h3><div class="gc-chart">${k.weeks.map((w) => `<div class="gc-bar"><b>${w.n}</b><i style="height:${Math.round((w.n / max) * 90)}px"></i>${esc(day(w.start))}</div>`).join("")}</div></div>
        <div class="gc-card"><h3>Free trials ending soon</h3>${k.trialsSoon.length ? k.trialsSoon.slice(0, 6).map((t) => `<div class="gc-row"><div>${esc(nameOf(t.c))}<small>${t.left < 0 ? "ended " + Math.abs(t.left) + " day(s) ago" : t.left === 0 ? "ends today" : t.left + " day(s) left"} · ${esc(t.c.client_id || "")}</small></div><button data-open="${esc(t.c.id)}">View</button></div>`).join("") : `<div class="gc-note">No trial ends in the next 7 days.</div>`}</div>
      </div>
      <div class="gc-card"><h3>Recent signups</h3>${k.recent.length ? k.recent.map((c) => `<div class="gc-row"><div>${esc(nameOf(c))}<small>${esc(c.client_id || "")}${c.business_name ? " · " + esc(c.business_name) : ""} · ${esc(day(c.created_at))}</small></div><button data-open="${esc(c.id)}">View</button></div>`).join("") : `<div class="gc-note">No clients yet.</div>`}</div>`;
    const up = $("gcUpdated"); if (up) up.textContent = "Updated " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  async function load() {
    if (busy) return; busy = true;
    try {
      const d = await fetchAll();
      if (!d) { const b = $("gcBody"); if (b && !started) b.innerHTML = `<div class="gc-note">Loading...</div>`; return; }
      clients = d.clients;
      render(compute(d));
      started = true;
      const legacy = $("legacyOverview"); if (legacy) legacy.style.display = "none";
    } catch (e) { console.warn("Command center:", e && e.message || e); }
    finally { busy = false; }
  }

  /* ---------- quick search ---------- */
  let pal = null, active = 0, items = [];
  function buildPalette() {
    if (pal) return;
    pal = document.createElement("div");
    pal.id = "gcPalette";
    pal.innerHTML = `<div class="gc-box"><input id="gcQ" type="search" autocomplete="off" placeholder="Search a client (name, email, GLM id, business) or jump to a tab"><div class="gc-res" id="gcRes"></div></div>`;
    document.body.appendChild(pal);
    pal.addEventListener("click", (e) => { if (e.target === pal) closePal(); });
    $("gcQ").addEventListener("input", () => { active = 0; paint(); });
    $("gcQ").addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePal();
      else if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(true); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); paint(true); }
      else if (e.key === "Enter") { e.preventDefault(); pick(active); }
    });
    $("gcRes").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) pick(Number(b.dataset.i)); });
  }
  function viewList() {
    return [...document.querySelectorAll("#app nav button[data-view]")].map((b) => ({ type: "view", label: b.textContent.trim(), view: b.dataset.view })).filter((v) => v.label);
  }
  function paint(keep) {
    const t = ($("gcQ").value || "").trim().toLowerCase();
    const cl = t ? clients.filter((c) => [c.client_id, c.email, c.full_name, c.client_name, c.business_name, c.phone, c.mobile].join(" ").toLowerCase().includes(t)).slice(0, 8).map((c) => ({ type: "client", c })) : [];
    const vw = viewList().filter((v) => !t || v.label.toLowerCase().includes(t)).slice(0, t ? 5 : 20);
    items = [...cl, ...vw];
    let h = "";
    if (cl.length) h += `<div class="gc-h">Clients</div>` + cl.map((x, i) => `<button class="gc-item${i === active ? " on" : ""}" data-i="${i}">${esc(nameOf(x.c))}<small>${esc(x.c.client_id || "")} · ${esc(x.c.email || "")}${x.c.business_name ? " · " + esc(x.c.business_name) : ""}</small></button>`).join("");
    if (vw.length) h += `<div class="gc-h">Go to</div>` + vw.map((x, j) => { const i = cl.length + j; return `<button class="gc-item${i === active ? " on" : ""}" data-i="${i}">${esc(x.label)}</button>`; }).join("");
    $("gcRes").innerHTML = h || `<div class="gc-h">No match</div>`;
    if (keep) { const on = $("gcRes").querySelector(".on"); if (on) on.scrollIntoView({ block: "nearest" }); }
  }
  function pick(i) {
    const x = items[i]; if (!x) return;
    closePal();
    if (x.type === "view") go(x.view);
    else if (typeof window.openClient === "function") window.openClient(x.c.id);
  }
  function openPal() {
    const app = $("app"); if (!app || app.classList.contains("hidden")) return;
    buildPalette(); pal.classList.add("open"); $("gcQ").value = ""; active = 0; paint();
    if (!clients.length) load().then(() => pal.classList.contains("open") && paint());
    setTimeout(() => $("gcQ").focus(), 30);
  }
  function closePal() { if (pal) pal.classList.remove("open"); }

  document.addEventListener("keydown", (e) => {
    const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openPal(); }
    else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); openPal(); }
  });

  /* ---------- mount ---------- */
  function create() {
    if ($(ID)) return true;
    const view = $("view-overview"), top = document.querySelector("#app .topbar");
    if (!view || !top) return false;
    styles();
    const s = document.createElement("div");
    s.id = ID;
    s.innerHTML = `<div class="gc-top"><div><h2>Command Center</h2><small id="gcUpdated">Loading...</small></div></div><div id="gcBody"><div class="gc-note">Loading...</div></div>`;
    view.insertBefore(s, view.firstChild);
    s.addEventListener("click", (e) => {
      const g = e.target.closest("[data-go]"), o = e.target.closest("[data-open]");
      if (g) go(g.dataset.go);
      else if (o && typeof window.openClient === "function") window.openClient(o.dataset.open);
    });
    const sb = document.createElement("button");
    sb.className = "btn"; sb.id = "gcSearchBtn"; sb.type = "button"; sb.textContent = "⌕ Search";
    const rf = $("refreshBtn");
    if (rf && rf.parentNode === top) top.insertBefore(sb, rf); else top.appendChild(sb);
    sb.addEventListener("click", openPal);
    if (rf) rf.addEventListener("click", load);
    return true;
  }

  function init() {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (create()) {
        const app = $("app"), c = getSb();
        if (app && !app.classList.contains("hidden") && c && !started) load();
        if (!tick) tick = setInterval(() => { const a = $("app"); if (a && !a.classList.contains("hidden") && !document.hidden) load(); }, 300000);
        if (started || tries > 600) clearInterval(t);
      } else if (tries > 60) clearInterval(t);
    }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
