/* =========================================================
   GLIME ADMIN — Agency approvals and wallet credit
   Adds an "Agency Program" section inside #control-room.
   Uses RPCs: admin_agency_list, admin_agency_review,
   admin_agency_wallet_credit (all check is_glime_admin()).
   Does not modify admin.html or any other addon.
========================================================= */
(() => {
  "use strict";
  const ID = "glime-agency-admin";
  const STYLE = "glime-agency-admin-style";
  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  let sb = null, list = [], filter = "pending";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const inr = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n) || 0);
  const day = (v) => { const d = new Date(v); return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

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
      #${ID}{margin-top:22px;padding-top:20px;border-top:1px solid rgba(255,255,255,.09)}
      #${ID} .ga-title{color:#ff9f43;font-weight:600;font-size:1rem;margin-bottom:7px}
      #${ID} .ga-sub{color:#9ba7b7;font-size:.75rem;line-height:1.5;margin-bottom:14px}
      #${ID} .ga-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      #${ID} .ga-bar select,#${ID} input,#${ID} textarea{padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;box-sizing:border-box}
      #${ID} .ga-card{padding:15px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:12px}
      #${ID} .ga-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
      #${ID} .ga-name{color:#fff;font-weight:700;font-size:.92rem}
      #${ID} .ga-code{color:#687587;font-size:.68rem;margin-top:3px}
      #${ID} .ga-st{padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.1);color:#9ba7b7;white-space:nowrap}
      #${ID} .ga-st.active{color:#00ff88;border-color:rgba(0,255,136,.3)}
      #${ID} .ga-st.pending{color:#ffc857;border-color:rgba(255,200,87,.35)}
      #${ID} .ga-st.rejected,#${ID} .ga-st.suspended{color:#ff5263;border-color:rgba(255,82,99,.35)}
      #${ID} dl{display:grid;grid-template-columns:110px 1fr;gap:5px 10px;font-size:.76rem;margin:0 0 12px}
      #${ID} dt{color:#687587}#${ID} dd{margin:0;color:#dfe7ef;word-break:break-word}
      #${ID} .ga-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
      #${ID} .ga-row textarea{flex:1 1 220px;min-height:38px;resize:vertical}
      #${ID} button{border:0;border-radius:9px;padding:9px 13px;font:700 .76rem system-ui,sans-serif;cursor:pointer}
      #${ID} button:disabled{opacity:.55;cursor:not-allowed}
      #${ID} .ok{background:#00ff88;color:#06100b}#${ID} .no{background:#ff5263;color:#fff}#${ID} .mid{background:rgba(255,255,255,.09);color:#fff}
      #${ID} .ga-msg{margin-top:10px;padding:10px 12px;border-radius:9px;font-size:.74rem;display:none}
      #${ID} .ga-msg.s{display:block;color:#00ff88;background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.25)}
      #${ID} .ga-msg.e{display:block;color:#ff5263;background:rgba(255,82,99,.07);border:1px solid rgba(255,82,99,.25)}
      #${ID} .ga-empty{padding:16px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;color:#9ba7b7;font-size:.78rem;text-align:center}
      @media(max-width:650px){#${ID} dl{grid-template-columns:90px 1fr}}`;
    document.head.appendChild(s);
  }

  function msg(t, kind) { const m = $("gaMsg"); if (!m) return; m.textContent = t || ""; m.className = "ga-msg" + (t ? " " + kind : ""); }
  const ERR = { not_admin: "Admin access is required.", NOTE_REQUIRED: "A note is required for this action.", NOTE_TOO_LONG: "Note is too long (max 500).", INVALID_TRANSITION: "That action is not allowed for the current status.", AGENCY_NOT_FOUND: "Agency not found.", INVALID_AMOUNT: "Enter a valid amount.", REFERENCE_REQUIRED: "A payment reference is required.", AGENCY_NOT_ACTIVE: "The agency must be active to credit its wallet." };
  function errText(e) { const m = String((e && e.message) || ""); for (const k in ERR) if (m.includes(k)) return ERR[k]; return m || "Request failed."; }

  async function load() {
    const c = getSb(); if (!c) { msg("Supabase client unavailable.", "e"); return; }
    msg("Loading agencies...", "s");
    try {
      const { data, error } = await c.rpc("admin_agency_list", { p_status: filter === "all" ? null : filter });
      if (error) throw error;
      list = Array.isArray(data) ? data : [];
      msg("", ""); render();
    } catch (e) { list = []; render(); msg("Could not load agencies: " + errText(e), "e"); }
  }

  function actions(a) {
    const n = `<textarea data-note placeholder="Note (required for reject / suspend)" maxlength="500"></textarea>`;
    if (a.status === "pending") return `<div class="ga-row">${n}<button class="ok" data-do="approve">Approve</button><button class="no" data-do="reject">Reject</button></div>`;
    if (a.status === "active") return `<div class="ga-row">${n}<button class="no" data-do="suspend">Suspend</button></div><div class="ga-row"><input data-amt type="number" min="1" placeholder="Credit amount ₹"><input data-ref type="text" placeholder="Payment reference" maxlength="80"><button class="mid" data-do="credit">Credit wallet</button></div>`;
    if (a.status === "rejected") return `<div class="ga-row">${n}<button class="ok" data-do="approve">Approve now</button></div>`;
    if (a.status === "suspended") return `<div class="ga-row">${n}<button class="ok" data-do="reactivate">Reactivate</button></div>`;
    return "";
  }

  function render() {
    const box = $("gaList"); if (!box) return;
    if (!list.length) { box.innerHTML = `<div class="ga-empty">No agencies in this view.</div>`; return; }
    box.innerHTML = list.map((a) => `
      <div class="ga-card" data-id="${esc(a.id)}">
        <div class="ga-head"><div><div class="ga-name">${esc(a.business_name)}</div><div class="ga-code">${esc(a.agency_code)} · applied ${day(a.created_at)}</div></div><span class="ga-st ${esc(a.status)}">${esc(a.status)}</span></div>
        <dl><dt>Contact</dt><dd>${esc(a.contact_name || "—")} · ${esc(a.contact_email || "—")} · ${esc(a.contact_phone)}</dd>
        <dt>City</dt><dd>${esc(a.city)}</dd><dt>Website</dt><dd>${esc(a.website || "—")}</dd>
        <dt>PAN / GST</dt><dd>${esc(a.pan || "—")} / ${esc(a.gst || "—")}</dd>
        <dt>About</dt><dd>${esc(a.about || "—")}</dd>
        <dt>Clients</dt><dd>${esc(a.clients)}</dd><dt>Wallet</dt><dd>${a.wallet_balance == null ? "—" : inr(a.wallet_balance)}</dd>
        ${a.review_note ? `<dt>Last note</dt><dd>${esc(a.review_note)}</dd>` : ""}</dl>
        ${actions(a)}
      </div>`).join("");
  }

  async function onClick(e) {
    const b = e.target.closest("[data-do]"); if (!b) return;
    const card = b.closest(".ga-card"), id = card.dataset.id, what = b.dataset.do, c = getSb();
    if (!c) return;
    b.disabled = true; msg("", "");
    try {
      if (what === "credit") {
        const amt = Number(card.querySelector("[data-amt]").value), ref = card.querySelector("[data-ref]").value.trim();
        if (!amt || amt <= 0) throw new Error("INVALID_AMOUNT");
        if (!ref) throw new Error("REFERENCE_REQUIRED");
        if (!window.confirm("Credit " + inr(amt) + " to this agency wallet?")) { b.disabled = false; return; }
        const { error } = await c.rpc("admin_agency_wallet_credit", { p_agency_id: id, p_amount: amt, p_reference: ref, p_note: null });
        if (error) throw error;
        msg("Wallet credited.", "s");
      } else {
        const note = card.querySelector("[data-note]")?.value.trim() || null;
        if ((what === "reject" || what === "suspend") && !note) throw new Error("NOTE_REQUIRED");
        const { error } = await c.rpc("admin_agency_review", { p_agency_id: id, p_action: what, p_note: note });
        if (error) throw error;
        msg("Agency " + what + " done.", "s");
      }
      await load();
    } catch (err) { msg(errText(err), "e"); b.disabled = false; }
  }

  function create() {
    if ($(ID)) return true;
    const room = $("control-room");
    if (!room) return false;
    styles();
    const s = document.createElement("div");
    s.id = ID;
    s.innerHTML = `<div class="ga-title">Agency Program</div>
      <div class="ga-sub">Approve agency applications, suspend or reactivate agencies, and credit a wallet after a manual payment.</div>
      <div class="ga-bar"><select id="gaFilter" aria-label="Agency status"><option value="pending">Pending approval</option><option value="active">Active</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option><option value="all">All</option></select><button class="mid" id="gaRefresh" type="button">Refresh</button></div>
      <div id="gaList"><div class="ga-empty">Loading...</div></div><div id="gaMsg" class="ga-msg"></div>`;
    room.appendChild(s);
    $("gaFilter").addEventListener("change", (e) => { filter = e.target.value; load(); });
    $("gaRefresh").addEventListener("click", load);
    s.addEventListener("click", onClick);
    load();
    return true;
  }

  function init() {
    let tries = 0;
    const t = setInterval(() => { tries++; if (create() || tries > 25) clearInterval(t); }, 800);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
