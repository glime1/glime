/* =========================================================
   GLIME ADMIN - UPI Payments
   Adds a "UPI Payments" tab to the admin sidebar. Clients see the
   Others > UPI Payments page (others-upi-addon.js) locked until the
   admin unlocks it here. Only the admin can unlock or lock a client.
   Reads : rpc admin_list_upi_clients
   Writes: rpc admin_set_upi_unlock(p_client_id, p_unlocked)
   Locking a client also turns their UPI off and clears the device token
   (done by the database function).
========================================================= */
(() => {
  "use strict";
  const URL_ = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const VIEW = "view-upi";

  let sb = null, rows = [], query = "", filter = "all", loadError = "", loaded = false;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Never"; };

  function client() {
    if (sb) return sb;
    if (window.supabaseClient && window.supabaseClient.rpc) return (sb = window.supabaseClient);
    if (window.supabase && typeof window.supabase.createClient === "function") sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return sb;
  }

  function css() {
    if ($("guStyle")) return;
    const s = document.createElement("style"); s.id = "guStyle";
    s.textContent = `
      #${VIEW} .gu-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      #${VIEW} .gu-stat{padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03)}
      #${VIEW} .gu-stat b{display:block;font-size:1.35rem;letter-spacing:-.02em}#${VIEW} .gu-stat span{color:#9ba7b7;font-size:.72rem}
      #${VIEW} .gu-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
      #${VIEW} .gu-bar input[type=search],#${VIEW} .gu-bar select{padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit}
      #${VIEW} .gu-bar input[type=search]{flex:1 1 200px;min-width:0}
      #${VIEW} .gu-card{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:10px}
      #${VIEW} .gu-name{font-weight:700;font-size:.92rem}#${VIEW} .gu-meta{color:#7b8797;font-size:.72rem;margin-top:3px;word-break:break-word}
      #${VIEW} .gu-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      #${VIEW} .gu-chip{padding:3px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.14);color:#c9d3df;white-space:nowrap}
      #${VIEW} .gu-chip.on{color:#00ff88;border-color:rgba(0,255,136,.45)}#${VIEW} .gu-chip.off{color:#ff9f43;border-color:rgba(255,159,67,.5)}
      #${VIEW} .gu-act button{border:0;border-radius:9px;padding:9px 15px;font:700 .78rem system-ui,sans-serif;cursor:pointer;background:#00ff88;color:#06100b}
      #${VIEW} .gu-act button.lock{background:rgba(255,82,99,.15);color:#ff7a8a;border:1px solid rgba(255,82,99,.5)}
      #${VIEW} .gu-act button:disabled{opacity:.5;cursor:default}
      #${VIEW} .gu-empty{padding:22px;border:1px dashed rgba(255,255,255,.14);border-radius:14px;color:#9ba7b7;text-align:center;font-size:.82rem}
      #${VIEW} .gu-note{padding:12px 14px;border-radius:12px;background:rgba(255,200,87,.07);border:1px solid rgba(255,200,87,.35);color:#ffd98a;font-size:.78rem;line-height:1.55;margin-bottom:12px}
      @media(max-width:760px){#${VIEW} .gu-stats{grid-template-columns:1fr 1fr}}`;
    document.head.appendChild(s);
  }

  async function load() {
    const c = client(); if (!c) return;
    try {
      const r = await c.rpc("admin_list_upi_clients");
      if (r.error) throw r.error;
      rows = Array.isArray(r.data) ? r.data : [];
      loadError = "";
    } catch (e) {
      rows = [];
      loadError = String((e && e.message) || e || "Could not load clients.");
    }
    loaded = true;
  }

  function visible() {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "unlocked" && !r.unlocked) return false;
      if (filter === "locked" && r.unlocked) return false;
      if (filter === "enabled" && !r.enabled) return false;
      if (!q) return true;
      return [r.client_id, r.business_name, r.upi_id].join(" ").toLowerCase().indexOf(q) > -1;
    });
  }

  function card(r) {
    return `<div class="gu-card" data-cid="${esc(r.client_id)}">
      <div><div class="gu-name">${esc(r.business_name || r.client_id)}</div>
        <div class="gu-meta">${esc(r.client_id)}${r.upi_id ? " \u00b7 " + esc(r.upi_id) : ""}</div>
        <div class="gu-chips">
          <span class="gu-chip ${r.unlocked ? "on" : "off"}">${r.unlocked ? "Unlocked" : "Locked"}</span>
          ${r.unlocked ? `<span class="gu-chip ${r.enabled ? "on" : "off"}">${r.enabled ? "UPI on" : "UPI off"}</span>` : ""}
          ${r.unlocked ? `<span class="gu-chip ${r.token_set ? "on" : "off"}">${r.token_set ? "Device linked" : "No device token"}</span>` : ""}
          ${r.token_set ? `<span class="gu-chip">Last seen: ${esc(when(r.device_last_seen_at))}</span>` : ""}
        </div></div>
      <div class="gu-act"><button type="button" class="${r.unlocked ? "lock" : ""}" data-unlock="${r.unlocked ? "0" : "1"}">${r.unlocked ? "Lock" : "Unlock"}</button></div></div>`;
  }

  function render() {
    const v = $(VIEW); if (!v) return;
    const list = visible();
    const unlocked = rows.filter((r) => r.unlocked).length;
    const enabled = rows.filter((r) => r.enabled).length;
    v.innerHTML = `<div class="card">
      <h3>UPI Payments</h3>
      <p class="sub">Clients see Others &rarr; UPI Payments locked. Unlock a client here to let them add their UPI ID and link the Companion app. Locking turns their UPI off and removes the device token.</p>
      ${loadError ? `<div class="gu-note">Could not load clients: ${esc(loadError)}</div>` : ""}
      <div class="gu-stats"><div class="gu-stat"><b>${rows.length}</b><span>Total clients</span></div><div class="gu-stat"><b>${unlocked}</b><span>Unlocked</span></div><div class="gu-stat"><b>${rows.length - unlocked}</b><span>Locked</span></div><div class="gu-stat"><b>${enabled}</b><span>UPI on</span></div></div>
      <div class="gu-bar"><input id="guSearch" type="search" placeholder="Search client, client ID or UPI ID" value="${esc(query)}">
        <select id="guFilter">${[["all", "All clients"], ["unlocked", "Unlocked"], ["locked", "Locked"], ["enabled", "UPI on"]].map((s) => `<option value="${s[0]}"${filter === s[0] ? " selected" : ""}>${s[1]}</option>`).join("")}</select>
        <button class="btn" id="guRefresh" type="button">&#8635; Refresh</button></div>
      <div id="guList">${list.length ? list.map(card).join("") : `<div class="gu-empty">${loaded ? "No clients found." : "Loading..."}</div>`}</div></div>`;
    $("guSearch").addEventListener("input", (e) => { query = e.target.value; renderList(); });
  }
  function renderList() { const l = $("guList"); if (!l) return; const list = visible(); l.innerHTML = list.length ? list.map(card).join("") : `<div class="gu-empty">No clients found.</div>`; }

  async function setUnlock(cid, unlocked, btn) {
    const c = client(); if (!c) return;
    const r0 = rows.find((x) => x.client_id === cid) || {};
    const who = r0.business_name || cid;
    const ok = unlocked
      ? window.confirm("Unlock UPI Payments for " + who + " (" + cid + ")?")
      : window.confirm("Lock UPI Payments for " + who + " (" + cid + ")? Their UPI will be turned off and the device token removed.");
    if (!ok) return;
    btn.disabled = true;
    try {
      const r = await c.rpc("admin_set_upi_unlock", { p_client_id: cid, p_unlocked: unlocked });
      if (r.error) throw r.error;
      await load(); render();
    } catch (e) { window.alert("Could not update: " + String((e && e.message) || e)); btn.disabled = false; }
  }

  function onClick(e) {
    const b = e.target.closest("[data-unlock]");
    if (b) { const card = b.closest(".gu-card"); setUnlock(card.dataset.cid, b.dataset.unlock === "1", b); return; }
    if (e.target.id === "guRefresh") load().then(render);
  }

  function open() {
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    $(VIEW).classList.add("active");
    document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x.dataset.view === "upi"));
    const ti = $("title"); if (ti) ti.textContent = "UPI Payments";
    render();
    load().then(render);
  }

  function create() {
    if ($(VIEW)) return true;
    const main = document.querySelector("#app main"), nav = document.querySelector("#app nav");
    if (!main || !nav) return false;
    css();
    const sec = document.createElement("section"); sec.className = "view"; sec.id = VIEW;
    main.appendChild(sec);
    sec.addEventListener("click", onClick);
    sec.addEventListener("change", (e) => { if (e.target.id === "guFilter") { filter = e.target.value; renderList(); } });
    const b = document.createElement("button"); b.type = "button"; b.dataset.view = "upi"; b.textContent = "UPI Payments";
    nav.insertBefore(b, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    b.addEventListener("click", open);
    return true;
  }

  let tries = 0;
  const t = setInterval(() => { tries++; if (create() || tries > 40) clearInterval(t); }, 800);
})();
