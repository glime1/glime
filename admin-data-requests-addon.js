/* =========================================================
   GLIME ADMIN — Data Deletion Requests
   Adds a "Data Requests" tab. Clients ask for their business data to be
   deleted; the backend keeps the request for 30 days, then the admin can
   purge it here.
   RPCs: admin_list_data_deletion_requests, admin_purge_client_business_data,
         admin_clients_list (only to show the client's name).
   The purge is permanent. The button stays disabled until the 30-day wait
   is over AND the admin has typed the client id.
========================================================= */
(() => {
  "use strict";
  const ID = "glime-datareq-admin", STYLE = ID + "-style";
  let list = [], names = {};

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const day = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"; };
  const getSb = () => (window.supabaseClient && window.supabaseClient.rpc ? window.supabaseClient : null);

  function styles() {
    if ($(STYLE)) return;
    const s = document.createElement("style");
    s.id = STYLE;
    s.textContent = `
      #${ID} .gd-title{color:#ff9f43;font-weight:600;font-size:1rem;margin-bottom:7px}
      #${ID} .gd-sub{color:#9ba7b7;font-size:.75rem;line-height:1.5;margin-bottom:14px}
      #${ID} .gd-card{padding:15px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:12px}
      #${ID} .gd-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
      #${ID} .gd-name{color:#fff;font-weight:700;font-size:.92rem;word-break:break-word}
      #${ID} .gd-id{color:#687587;font-size:.68rem;margin-top:3px}
      #${ID} .gd-st{padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.1);color:#ffc857;border-color:rgba(255,200,87,.35);white-space:nowrap}
      #${ID} .gd-st.due{color:#ff5263;border-color:rgba(255,82,99,.35)}
      #${ID} dl{display:grid;grid-template-columns:120px 1fr;gap:5px 10px;font-size:.76rem;margin:0 0 12px}
      #${ID} dt{color:#687587}#${ID} dd{margin:0;color:#dfe7ef}
      #${ID} .gd-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
      #${ID} .gd-row input{flex:1 1 200px;min-width:0;padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;box-sizing:border-box}
      #${ID} button{border:0;border-radius:9px;padding:9px 13px;font:700 .76rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.09);color:#fff}
      #${ID} button.no{background:#ff5263;color:#fff}
      #${ID} button:disabled{opacity:.45;cursor:not-allowed}
      #${ID} .gd-warn{padding:10px 12px;border-radius:9px;font-size:.72rem;color:#ffc857;background:rgba(255,200,87,.07);border:1px solid rgba(255,200,87,.25);margin-bottom:14px;line-height:1.5}
      #${ID} .gd-msg{margin-top:10px;padding:10px 12px;border-radius:9px;font-size:.74rem;display:none;word-break:break-word}
      #${ID} .gd-msg.s{display:block;color:#00ff88;background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.25)}
      #${ID} .gd-msg.e{display:block;color:#ff5263;background:rgba(255,82,99,.07);border:1px solid rgba(255,82,99,.25)}
      #${ID} .gd-empty{padding:16px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;color:#9ba7b7;font-size:.78rem;text-align:center}
      @media(max-width:650px){#${ID} dl{grid-template-columns:95px 1fr}}`;
    document.head.appendChild(s);
  }

  function msg(t, kind) { const m = $("gdMsg"); if (!m) return; m.textContent = t || ""; m.className = "gd-msg" + (t ? " " + kind : ""); }
  function errText(e) {
    const m = String((e && e.message) || "");
    if (/Admin only/i.test(m)) return "Admin access is required.";
    if (/waiting period/i.test(m)) return "The 30-day waiting period is not over yet.";
    if (/not pending/i.test(m)) return "This request is no longer pending.";
    return m || "Request failed.";
  }
  const daysLeft = (r) => Math.ceil((new Date(r.scheduled_for).getTime() - Date.now()) / 864e5);

  async function load() {
    const c = getSb(); if (!c) { msg("Supabase client unavailable.", "e"); return; }
    msg("Loading requests...", "s");
    try {
      const [r, cl] = await Promise.all([c.rpc("admin_list_data_deletion_requests"), c.rpc("admin_clients_list", { p_search: null, p_status: null, p_limit: 500 })]);
      if (r.error) throw r.error;
      list = Array.isArray(r.data) ? r.data : [];
      names = {};
      (Array.isArray(cl.data) ? cl.data : []).map((x) => x.client || x).forEach((x) => { if (x && x.client_id) names[x.client_id] = x; });
      msg("", ""); render();
    } catch (e) { list = []; render(); msg(errText(e), "e"); }
  }

  function render() {
    const box = $("gdList"); if (!box) return;
    if (!list.length) { box.innerHTML = `<div class="gd-empty">No pending deletion requests.</div>`; return; }
    box.innerHTML = list.map((r) => {
      const c = names[r.client_id] || {}, due = !!r.is_due, left = daysLeft(r);
      return `<div class="gd-card" data-id="${esc(r.id)}" data-cid="${esc(r.client_id)}" data-due="${due ? 1 : 0}">
        <div class="gd-head"><div><div class="gd-name">${esc(c.full_name || c.client_name || c.business_name || r.client_id)}</div><div class="gd-id">${esc(r.client_id)}${c.email ? " · " + esc(c.email) : ""}</div></div><span class="gd-st${due ? " due" : ""}">${due ? "Ready to purge" : left + " day(s) left"}</span></div>
        <dl><dt>Requested</dt><dd>${day(r.requested_at)}</dd><dt>Can be purged on</dt><dd>${day(r.scheduled_for)}</dd></dl>
        <div class="gd-row"><input data-confirm placeholder="Type ${esc(r.client_id)} to enable" ${due ? "" : "disabled"} autocomplete="off"><button class="no" data-do="purge" disabled>Purge business data</button></div>
      </div>`;
    }).join("");
  }

  function onInput(e) {
    const i = e.target.closest("[data-confirm]"); if (!i) return;
    const card = i.closest(".gd-card");
    card.querySelector('[data-do="purge"]').disabled = !(card.dataset.due === "1" && i.value.trim() === card.dataset.cid);
  }

  async function onClick(e) {
    const b = e.target.closest("[data-do]"); if (!b) return;
    if (b.dataset.do === "refresh") { load(); return; }
    const card = b.closest(".gd-card"), c = getSb(); if (!c) return;
    if (!window.confirm("PERMANENTLY delete the business data of " + card.dataset.cid + "? This cannot be undone.")) return;
    b.disabled = true; msg("", "");
    try {
      const { data, error } = await c.rpc("admin_purge_client_business_data", { p_request_id: card.dataset.id });
      if (error) throw error;
      msg("Purge done for " + card.dataset.cid + (data ? ". Result: " + JSON.stringify(data) : "."), "s");
      await load();
    } catch (err) { msg(errText(err), "e"); b.disabled = false; }
  }

  function create() {
    if ($(ID)) return true;
    const main = document.querySelector("#app main"), nav = document.querySelector("#app nav");
    if (!main || !nav) return false;
    const view = document.createElement("section");
    view.className = "view"; view.id = "view-datareq";
    main.appendChild(view);
    const nb = document.createElement("button");
    nb.type = "button"; nb.dataset.view = "datareq"; nb.textContent = "Data Requests";
    nav.insertBefore(nb, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    nb.addEventListener("click", () => {
      document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
      view.classList.add("active");
      document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x === nb));
      const ti = $("title"); if (ti) ti.textContent = "Data Requests";
      load();
    });
    styles();
    const s = document.createElement("div");
    s.id = ID;
    s.innerHTML = `<div class="gd-title">Data Deletion Requests</div>
      <div class="gd-sub">Clients who asked for their data to be deleted. Each request waits 30 days before it can be purged.</div>
      <div class="gd-warn">Purge permanently deletes the client's business data (orders, leads, customers, conversations, knowledge items and similar). It cannot be undone. The button unlocks only after the waiting period, and only when you type the client id.</div>
      <div class="gd-row" style="margin:0 0 12px"><button data-do="refresh" type="button">Refresh</button></div>
      <div id="gdList"><div class="gd-empty">Open this tab to load requests.</div></div><div id="gdMsg" class="gd-msg"></div>`;
    view.appendChild(s);
    s.addEventListener("click", onClick);
    s.addEventListener("input", onInput);
    return true;
  }

  function init() {
    let tries = 0;
    const t = setInterval(() => { tries++; if (create() || tries > 25) clearInterval(t); }, 800);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
