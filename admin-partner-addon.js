/* =========================================================
   GLIME ADMIN — Partner Program (who applied, who they referred)
   Adds a "Partners" tab to the admin sidebar with two views:
     1) Partners: every partner who applied, status, referral stats,
        and the list of clients that came through each partner.
     2) All referrals: every referred client with the partner who
        brought them.
   Frontend only. Does not modify any other addon.

   RPCs this file calls (backend to be created; both must check
   is_glime_admin() and return full, unmasked data for admin):

   admin_partner_list(p_status text default null) -> json array
     [{ id, partner_code, display_name, business_name, contact_email,
        status, created_at, terms_accepted_at, payout_setup_status, tier,
        clicks, signups, active_customers, paying_customers,
        pending_earnings, lifetime_earnings, paid_out }]

   admin_partner_referrals(p_partner_id uuid default null,
                           p_limit int default 500) -> json array
     [{ referral_id, partner_id, partner_name, partner_code,
        client_id, client_name, client_email, business_name, plan,
        status, attributed_at, first_paid_at, eligible_until,
        commission_total }]
     p_partner_id = null returns referrals of all partners.
========================================================= */
(() => {
  "use strict";
  const ID = "glime-partner-admin";
  const STYLE = ID + "-style";
  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const LINK_BASE = "https://glime.online/?ref=";

  let sb = null, partners = [], allRefs = [], mode = "partners";
  const refCache = {}, openIds = new Set();

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const num = (v) => Number(v) || 0;
  const inr = (v) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(num(v));
  const day = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"; };
  const rows = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.rows) ? d.rows : []);

  function getSb() {
    if (sb) return sb;
    if (window.supabaseClient && window.supabaseClient.rpc) return (sb = window.supabaseClient);
    if (window.supabase && window.supabase.rpc) return (sb = window.supabase);
    if (window.supabase && typeof window.supabase.createClient === "function") {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      return sb;
    }
    return null;
  }

  function styles() {
    if ($(STYLE)) return;
    const s = document.createElement("style");
    s.id = STYLE;
    s.textContent = `
      #${ID}{padding-top:4px}
      #${ID} .gp-title{color:#7c9cff;font-weight:600;font-size:1rem;margin-bottom:7px}
      #${ID} .gp-sub{color:#9ba7b7;font-size:.75rem;line-height:1.5;margin-bottom:14px}
      #${ID} .gp-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}
      #${ID} .gp-sum div{padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.02)}
      #${ID} .gp-sum small{display:block;color:#687587;font-size:.68rem;margin-bottom:4px}
      #${ID} .gp-sum b{color:#fff;font-size:1.15rem}
      #${ID} .gp-tabs{display:flex;gap:8px;margin-bottom:12px}
      #${ID} .gp-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      #${ID} .gp-bar input,#${ID} .gp-bar select{padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;box-sizing:border-box}
      #${ID} .gp-bar input{flex:1 1 200px;min-width:0}
      #${ID} .gp-card{padding:15px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:12px}
      #${ID} .gp-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
      #${ID} .gp-name{color:#fff;font-weight:700;font-size:.92rem;word-break:break-word}
      #${ID} .gp-code{color:#687587;font-size:.68rem;margin-top:3px;word-break:break-all}
      #${ID} .gp-st{padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.1);color:#9ba7b7;white-space:nowrap}
      #${ID} .gp-st.active,#${ID} .gp-st.paid{color:#00ff88;border-color:rgba(0,255,136,.3)}
      #${ID} .gp-st.pending,#${ID} .gp-st.trial,#${ID} .gp-st.signed_up{color:#ffc857;border-color:rgba(255,200,87,.35)}
      #${ID} .gp-st.rejected,#${ID} .gp-st.suspended,#${ID} .gp-st.churned,#${ID} .gp-st.refunded{color:#ff5263;border-color:rgba(255,82,99,.35)}
      #${ID} dl{display:grid;grid-template-columns:110px 1fr;gap:5px 10px;font-size:.76rem;margin:0 0 12px}
      #${ID} dt{color:#687587}#${ID} dd{margin:0;color:#dfe7ef;word-break:break-word}
      #${ID} .gp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:12px}
      #${ID} .gp-stats div{padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.04);font-size:.7rem;color:#9ba7b7}
      #${ID} .gp-stats b{display:block;color:#fff;font-size:.95rem;margin-top:2px}
      #${ID} .gp-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      #${ID} button{border:0;border-radius:9px;padding:9px 13px;font:700 .76rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.09);color:#fff}
      #${ID} button.on{background:#7c9cff;color:#07101f}
      #${ID} button:disabled{opacity:.55;cursor:not-allowed}
      #${ID} .gp-refs{margin-top:12px;overflow:auto}
      #${ID} table{width:100%;border-collapse:collapse;font-size:.74rem}
      #${ID} th{text-align:left;color:#687587;font-weight:600;padding:7px 8px;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,.09)}
      #${ID} td{padding:8px;color:#dfe7ef;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top}
      #${ID} td small{color:#687587;display:block;margin-top:2px}
      #${ID} .gp-msg{margin-top:10px;padding:10px 12px;border-radius:9px;font-size:.74rem;display:none}
      #${ID} .gp-msg.s{display:block;color:#00ff88;background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.25)}
      #${ID} .gp-msg.e{display:block;color:#ff5263;background:rgba(255,82,99,.07);border:1px solid rgba(255,82,99,.25)}
      #${ID} .gp-empty{padding:16px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;color:#9ba7b7;font-size:.78rem;text-align:center}
      @media(max-width:650px){#${ID} dl{grid-template-columns:90px 1fr}}`;
    document.head.appendChild(s);
  }

  function msg(t, kind) { const m = $("gpMsg"); if (!m) return; m.textContent = t || ""; m.className = "gp-msg" + (t ? " " + kind : ""); }
  function errText(e) {
    const m = String((e && e.message) || "");
    if (m.includes("not_admin")) return "Admin access is required.";
    if (/could not find the function|PGRST202|does not exist/i.test(m)) return "Backend is not ready yet: the admin_partner_list / admin_partner_referrals functions are missing in Supabase.";
    return m || "Request failed.";
  }
  const badge = (s) => `<span class="gp-st ${esc(String(s || "").toLowerCase())}">${esc(s || "unknown")}</span>`;

  /* ---------- data ---------- */
  async function loadPartners() {
    const c = getSb(); if (!c) { msg("Supabase client unavailable.", "e"); return; }
    msg("Loading partners...", "s");
    try {
      const [p, r] = await Promise.all([
        c.rpc("admin_partner_list", { p_status: null }),
        c.rpc("admin_partner_referrals", { p_partner_id: null, p_limit: 500 })
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      partners = rows(p.data); allRefs = rows(r.data);
      Object.keys(refCache).forEach((k) => delete refCache[k]);
      msg("", ""); render();
    } catch (e) { partners = []; allRefs = []; render(); msg(errText(e), "e"); }
  }

  async function loadPartnerRefs(id) {
    if (refCache[id]) return refCache[id];
    const c = getSb(); if (!c) throw new Error("Supabase client unavailable.");
    const { data, error } = await c.rpc("admin_partner_referrals", { p_partner_id: id, p_limit: 500 });
    if (error) throw error;
    return (refCache[id] = rows(data));
  }

  /* ---------- render ---------- */
  function filteredPartners() {
    const term = ($("gpSearch")?.value || "").trim().toLowerCase();
    const st = $("gpStatus")?.value || "all";
    const sort = $("gpSort")?.value || "signups";
    const list = partners.filter((p) => {
      if (st !== "all" && String(p.status || "").toLowerCase() !== st) return false;
      return !term || [p.display_name, p.business_name, p.contact_email, p.partner_code].join(" ").toLowerCase().includes(term);
    });
    const by = {
      signups: (a, b) => num(b.signups) - num(a.signups),
      active: (a, b) => num(b.active_customers) - num(a.active_customers),
      earnings: (a, b) => num(b.lifetime_earnings) - num(a.lifetime_earnings),
      newest: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      name: (a, b) => String(a.display_name || a.business_name || "").localeCompare(String(b.display_name || b.business_name || ""))
    };
    return list.sort(by[sort] || by.signups);
  }

  function filteredRefs() {
    const term = ($("gpSearch")?.value || "").trim().toLowerCase();
    const st = $("gpStatus")?.value || "all";
    return allRefs.filter((r) => {
      if (st !== "all" && String(r.status || "").toLowerCase() !== st) return false;
      return !term || [r.client_name, r.client_email, r.client_id, r.business_name, r.partner_name, r.partner_code].join(" ").toLowerCase().includes(term);
    });
  }

  function summary() {
    const act = partners.filter((p) => String(p.status).toLowerCase() === "active").length;
    const sum = (k) => partners.reduce((t, p) => t + num(p[k]), 0);
    const cells = [
      ["Partners", partners.length], ["Active partners", act], ["Link clicks", sum("clicks")],
      ["Referred signups", sum("signups")], ["Active customers", sum("active_customers")],
      ["Commission earned", inr(sum("lifetime_earnings"))], ["Paid out", inr(sum("paid_out"))]
    ];
    $("gpSum").innerHTML = cells.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("");
  }

  function refTable(list, withPartner) {
    if (!list.length) return `<div class="gp-empty">No referred clients yet.</div>`;
    return `<table><thead><tr>${withPartner ? "<th>Partner</th>" : ""}<th>Client</th><th>Plan</th><th>Status</th><th>Signed up</th><th>First paid</th><th>Commission</th></tr></thead><tbody>${list.map((r) => `<tr>
      ${withPartner ? `<td>${esc(r.partner_name || "—")}<small>${esc(r.partner_code || "")}</small></td>` : ""}
      <td>${esc(r.client_name || r.business_name || "—")}<small>${esc(r.client_id || "")}${r.client_email ? " · " + esc(r.client_email) : ""}</small></td>
      <td>${esc(r.plan || "—")}</td><td>${badge(r.status)}</td><td>${day(r.attributed_at)}</td><td>${day(r.first_paid_at)}</td><td>${inr(r.commission_total)}</td></tr>`).join("")}</tbody></table>`;
  }

  function partnerCard(p) {
    const clicks = num(p.clicks), signups = num(p.signups);
    const conv = clicks ? Math.round((signups / clicks) * 100) + "%" : "—";
    const isOpen = openIds.has(p.id);
    return `<div class="gp-card" data-id="${esc(p.id)}">
      <div class="gp-head"><div><div class="gp-name">${esc(p.display_name || p.business_name || "Unnamed partner")}</div><div class="gp-code">${esc(p.partner_code || "")} · applied ${day(p.created_at)}</div></div>${badge(p.status)}</div>
      <dl><dt>Email</dt><dd>${esc(p.contact_email || "—")}</dd>
      <dt>Business</dt><dd>${esc(p.business_name || "—")}</dd>
      <dt>Tier</dt><dd>${esc(p.tier || "—")}</dd>
      <dt>Terms accepted</dt><dd>${day(p.terms_accepted_at)}</dd>
      <dt>Payout setup</dt><dd>${esc(p.payout_setup_status || "—")}</dd></dl>
      <div class="gp-stats">
        <div>Link clicks<b>${clicks}</b></div><div>Signups via referral<b>${signups}</b></div>
        <div>Active customers<b>${num(p.active_customers)}</b></div><div>Paying customers<b>${num(p.paying_customers)}</b></div>
        <div>Click to signup<b>${conv}</b></div><div>Pending earnings<b>${inr(p.pending_earnings)}</b></div>
        <div>Lifetime earnings<b>${inr(p.lifetime_earnings)}</b></div><div>Paid out<b>${inr(p.paid_out)}</b></div>
      </div>
      <div class="gp-row"><button data-do="refs">${isOpen ? "Hide" : "View"} referred clients (${signups})</button><button data-do="copy" data-code="${esc(p.partner_code || "")}">Copy referral link</button></div>
      <div class="gp-refs" ${isOpen ? "" : "hidden"}>${isOpen ? (refCache[p.id] ? refTable(refCache[p.id], false) : '<div class="gp-empty">Loading...</div>') : ""}</div>
    </div>`;
  }

  function render() {
    if (!$("gpList")) return;
    summary();
    $("gpTabPartners").classList.toggle("on", mode === "partners");
    $("gpTabRefs").classList.toggle("on", mode === "refs");
    const st = $("gpStatus"), cur = st.value;
    st.innerHTML = mode === "partners"
      ? `<option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option>`
      : `<option value="all">All statuses</option><option value="signed_up">Signed up</option><option value="trial">Trial</option><option value="active">Active</option><option value="churned">Churned</option><option value="refunded">Refunded</option>`;
    if ([...st.options].some((o) => o.value === cur)) st.value = cur;
    $("gpSort").style.display = mode === "partners" ? "" : "none";
    if (mode === "partners") {
      const list = filteredPartners();
      $("gpList").innerHTML = list.length ? list.map(partnerCard).join("") : `<div class="gp-empty">No partners found.</div>`;
    } else {
      const list = filteredRefs();
      $("gpList").innerHTML = `<div class="gp-card"><div class="gp-refs">${refTable(list, true)}</div></div>`;
    }
  }

  /* ---------- actions ---------- */
  async function copyLink(code, btn) {
    if (!code) return;
    const link = LINK_BASE + code;
    try { await navigator.clipboard.writeText(link); const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = t; }, 1500); }
    catch (e) { window.prompt("Copy this link:", link); }
  }

  async function toggleRefs(id) {
    if (openIds.has(id)) { openIds.delete(id); render(); return; }
    openIds.add(id); render();
    try { await loadPartnerRefs(id); }
    catch (e) { openIds.delete(id); msg(errText(e), "e"); }
    render();
  }

  const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  function exportCsv() {
    let head, body;
    if (mode === "partners") {
      head = ["Partner", "Business", "Code", "Email", "Status", "Applied", "Tier", "Clicks", "Signups", "Active customers", "Paying customers", "Pending earnings", "Lifetime earnings", "Paid out"];
      body = filteredPartners().map((p) => [p.display_name, p.business_name, p.partner_code, p.contact_email, p.status, day(p.created_at), p.tier, p.clicks, p.signups, p.active_customers, p.paying_customers, p.pending_earnings, p.lifetime_earnings, p.paid_out]);
    } else {
      head = ["Partner", "Partner code", "Client ID", "Client", "Email", "Plan", "Status", "Signed up", "First paid", "Commission"];
      body = filteredRefs().map((r) => [r.partner_name, r.partner_code, r.client_id, r.client_name || r.business_name, r.client_email, r.plan, r.status, day(r.attributed_at), day(r.first_paid_at), r.commission_total]);
    }
    if (!body.length) { msg("Nothing to export.", "e"); return; }
    const csv = "﻿" + [head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "glime-" + (mode === "partners" ? "partners" : "referrals") + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function onClick(e) {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "gpTabPartners") { mode = "partners"; render(); }
    else if (b.id === "gpTabRefs") { mode = "refs"; render(); }
    else if (b.id === "gpRefresh") loadPartners();
    else if (b.id === "gpExport") exportCsv();
    else if (b.dataset.do === "copy") copyLink(b.dataset.code, b);
    else if (b.dataset.do === "refs") toggleRefs(b.closest(".gp-card").dataset.id);
  }

  /* ---------- mount ---------- */
  function create() {
    if ($(ID)) return true;
    const main = document.querySelector("#app main"), nav = document.querySelector("#app nav");
    if (!main || !nav) return false;
    const view = document.createElement("section");
    view.className = "view"; view.id = "view-partner";
    main.appendChild(view);
    const nb = document.createElement("button");
    nb.type = "button"; nb.dataset.view = "partner"; nb.textContent = "Partners";
    nav.insertBefore(nb, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    nb.addEventListener("click", () => {
      document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
      view.classList.add("active");
      document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x === nb));
      const ti = $("title"); if (ti) ti.textContent = "Partners";
      loadPartners();
    });
    styles();
    const s = document.createElement("div");
    s.id = ID;
    s.innerHTML = `<div class="gp-title">Partner Program</div>
      <div class="gp-sub">See who applied as a partner, their status, and every client that signed up through their referral link.</div>
      <div class="gp-sum" id="gpSum"></div>
      <div class="gp-tabs"><button id="gpTabPartners" class="on" type="button">Partners</button><button id="gpTabRefs" type="button">All referrals</button></div>
      <div class="gp-bar"><input id="gpSearch" type="search" placeholder="Search name, email, code or client"><select id="gpStatus" aria-label="Status"></select><select id="gpSort" aria-label="Sort"><option value="signups">Most signups</option><option value="active">Most active customers</option><option value="earnings">Highest earnings</option><option value="newest">Newest applied</option><option value="name">Name A-Z</option></select><button id="gpRefresh" type="button">Refresh</button><button id="gpExport" type="button">Export CSV</button></div>
      <div id="gpList"><div class="gp-empty">Open this tab to load partners.</div></div><div id="gpMsg" class="gp-msg"></div>`;
    view.appendChild(s);
    $("gpSearch").addEventListener("input", render);
    $("gpStatus").addEventListener("change", render);
    $("gpSort").addEventListener("change", render);
    s.addEventListener("click", onClick);
    render();
    return true;
  }

  function init() {
    let tries = 0;
    const t = setInterval(() => { tries++; if (create() || tries > 25) clearInterval(t); }, 800);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
