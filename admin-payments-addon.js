/* =========================================================
   GLIME ADMIN — Payments (client payment accounts, KYC, balances)
   Adds a "Payments" tab. Uses existing secure RPCs:
     admin_payments_list, admin_payments_freeze_payouts,
     admin_payments_suspend, admin_payments_set_config
   All RPCs check is_glime_admin() and write their own audit rows.
   Money fields from the backend are in paise; shown here in rupees.
========================================================= */
(() => {
  "use strict";
  const ID = "glime-payments-admin", STYLE = ID + "-style";
  let list = [];

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const num = (v) => Number(v) || 0;
  const inrP = (p) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(num(p) / 100);
  const day = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"; };
  const getSb = () => (window.supabaseClient && window.supabaseClient.rpc ? window.supabaseClient : null);
  const bal = (a) => (a && a.balances) || {};

  function styles() {
    if ($(STYLE)) return;
    const s = document.createElement("style");
    s.id = STYLE;
    s.textContent = `
      #${ID} .gy-title{color:#22d3ee;font-weight:600;font-size:1rem;margin-bottom:7px}
      #${ID} .gy-sub{color:#9ba7b7;font-size:.75rem;line-height:1.5;margin-bottom:14px}
      #${ID} .gy-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}
      #${ID} .gy-sum div{padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.02)}
      #${ID} .gy-sum small{display:block;color:#687587;font-size:.68rem;margin-bottom:4px}
      #${ID} .gy-sum b{color:#fff;font-size:1.05rem}
      #${ID} .gy-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      #${ID} .gy-bar input,#${ID} .gy-bar select,#${ID} .gy-f input{padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;box-sizing:border-box}
      #${ID} .gy-bar input{flex:1 1 200px;min-width:0}
      #${ID} .gy-card{padding:15px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:12px}
      #${ID} .gy-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
      #${ID} .gy-name{color:#fff;font-weight:700;font-size:.92rem;word-break:break-word}
      #${ID} .gy-id{color:#687587;font-size:.68rem;margin-top:3px;word-break:break-all}
      #${ID} .gy-tags{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      #${ID} .gy-st{padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.1);color:#9ba7b7;white-space:nowrap}
      #${ID} .gy-st.g{color:#00ff88;border-color:rgba(0,255,136,.3)}
      #${ID} .gy-st.y{color:#ffc857;border-color:rgba(255,200,87,.35)}
      #${ID} .gy-st.r{color:#ff5263;border-color:rgba(255,82,99,.35)}
      #${ID} .gy-bal{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:8px;margin-bottom:12px}
      #${ID} .gy-bal div{padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.04);font-size:.68rem;color:#9ba7b7}
      #${ID} .gy-bal b{display:block;color:#fff;font-size:.88rem;margin-top:2px}
      #${ID} dl{display:grid;grid-template-columns:120px 1fr;gap:5px 10px;font-size:.75rem;margin:0 0 12px}
      #${ID} dt{color:#687587}#${ID} dd{margin:0;color:#dfe7ef;word-break:break-word}
      #${ID} .gy-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
      #${ID} .gy-row input{flex:1 1 200px;min-width:0;padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;box-sizing:border-box}
      #${ID} .gy-f{display:none;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px;padding:12px;border:1px dashed rgba(255,255,255,.14);border-radius:12px}
      #${ID} .gy-f.open{display:grid}
      #${ID} .gy-f label{font-size:.68rem;color:#9ba7b7;display:block}
      #${ID} .gy-f input{width:100%;margin-top:4px}
      #${ID} button{border:0;border-radius:9px;padding:9px 13px;font:700 .76rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.09);color:#fff}
      #${ID} button.ok{background:#00ff88;color:#06100b}#${ID} button.no{background:#ff5263;color:#fff}
      #${ID} button:disabled{opacity:.55;cursor:not-allowed}
      #${ID} .gy-msg{margin-top:10px;padding:10px 12px;border-radius:9px;font-size:.74rem;display:none}
      #${ID} .gy-msg.s{display:block;color:#00ff88;background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.25)}
      #${ID} .gy-msg.e{display:block;color:#ff5263;background:rgba(255,82,99,.07);border:1px solid rgba(255,82,99,.25)}
      #${ID} .gy-empty{padding:16px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;color:#9ba7b7;font-size:.78rem;text-align:center}
      @media(max-width:650px){#${ID} dl{grid-template-columns:100px 1fr}}`;
    document.head.appendChild(s);
  }

  function msg(t, kind) { const m = $("gyMsg"); if (!m) return; m.textContent = t || ""; m.className = "gy-msg" + (t ? " " + kind : ""); }
  const ERR = { not_admin: "Admin access is required.", REASON_REQUIRED: "A reason is required for this action.", CLIENT_NOT_FOUND: "This client has no payment account." };
  function errText(e) { const m = String((e && e.message) || ""); for (const k in ERR) if (m.includes(k)) return ERR[k]; if (/could not find the function|PGRST202/i.test(m)) return "Backend function is missing in Supabase."; return m || "Request failed."; }
  const kycClass = (s) => { s = String(s || "").toLowerCase(); return s === "verified" ? "g" : s === "suspended" || s === "rejected" ? "r" : "y"; };

  async function load() {
    const c = getSb(); if (!c) { msg("Supabase client unavailable.", "e"); return; }
    msg("Loading payment accounts...", "s");
    try {
      const { data, error } = await c.rpc("admin_payments_list", { p_search: null, p_limit: 500 });
      if (error) throw error;
      list = Array.isArray(data) ? data : [];
      msg("", ""); render();
    } catch (e) { list = []; render(); msg(errText(e), "e"); }
  }

  function filtered() {
    const t = ($("gyQ")?.value || "").trim().toLowerCase(), f = $("gyF")?.value || "all";
    return list.filter((a) => {
      const k = String(a.kyc_status || "").toLowerCase();
      if (f === "attention" ? !(num(a.failed_payouts) > 0 || a.payouts_frozen || k === "suspended") : f !== "all" && k !== f) return false;
      return !t || [a.client_id, a.business_name, a.email, a.legal_name].join(" ").toLowerCase().includes(t);
    });
  }

  function summary() {
    const sum = (k) => list.reduce((t, a) => t + num(bal(a)[k]), 0);
    const cells = [
      ["Payment accounts", list.length], ["KYC verified", list.filter((a) => String(a.kyc_status).toLowerCase() === "verified").length],
      ["Payouts frozen", list.filter((a) => a.payouts_frozen).length], ["Failed payouts", list.reduce((t, a) => t + num(a.failed_payouts), 0)],
      ["Gross collected", inrP(sum("gross_paise"))], ["GLIME fees earned", inrP(sum("fee_paise"))],
      ["Held by GLIME", inrP(sum("hold_paise") + sum("available_paise"))], ["Paid out / requested", inrP(sum("withdrawn_paise"))]
    ];
    $("gySum").innerHTML = cells.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("");
  }

  function card(a) {
    const b = bal(a), k = String(a.kyc_status || "not_started");
    return `<div class="gy-card" data-cid="${esc(a.client_id)}">
      <div class="gy-head"><div><div class="gy-name">${esc(a.business_name || a.legal_name || a.client_id)}</div><div class="gy-id">${esc(a.client_id)} · ${esc(a.email || "")}</div></div>
        <div class="gy-tags"><span class="gy-st ${kycClass(k)}">KYC: ${esc(k)}</span><span class="gy-st ${a.payments_enabled ? "g" : ""}">${a.payments_enabled ? "Payments on" : "Payments off"}</span>${a.payouts_frozen ? '<span class="gy-st r">Payouts frozen</span>' : ""}${num(a.failed_payouts) ? `<span class="gy-st r">${num(a.failed_payouts)} failed payout(s)</span>` : ""}</div></div>
      <div class="gy-bal"><div>Gross<b>${inrP(b.gross_paise)}</b></div><div>GLIME fee<b>${inrP(b.fee_paise)}</b></div><div>Refunded<b>${inrP(b.refunded_paise)}</b></div><div>Net to client<b>${inrP(b.net_paise)}</b></div><div>On hold<b>${inrP(b.hold_paise)}</b></div><div>Available<b>${inrP(b.available_paise)}</b></div><div>Withdrawn<b>${inrP(b.withdrawn_paise)}</b></div></div>
      <dl><dt>Legal name</dt><dd>${esc(a.legal_name || "—")} ${a.business_type ? "(" + esc(a.business_type) + ")" : ""}</dd>
      <dt>Bank</dt><dd>${esc(a.bank_name || "—")}${a.bank_last4 ? " ····" + esc(a.bank_last4) : ""}${a.pan_last4 ? " · PAN ····" + esc(a.pan_last4) : ""}</dd>
      <dt>Payout mode</dt><dd>${esc(a.payout_mode || "—")} · fee ${(num(a.fee_bps) / 100).toFixed(2)}% · min ${inrP(a.min_payout_paise)} · hold ${num(a.hold_days)}d · settle ${num(a.settlement_days)}d</dd>
      <dt>KYC</dt><dd>${esc(a.kyc_reason || "—")} · submitted ${day(a.kyc_submitted_at)} · verified ${day(a.verified_at)}</dd>
      <dt>Gateway account</dt><dd>${esc(a.razorpay_account_id || "—")}</dd></dl>
      <div class="gy-row"><input data-reason maxlength="500" placeholder="Reason (required to freeze or suspend)"></div>
      <div class="gy-row">
        <button class="${a.payouts_frozen ? "ok" : "no"}" data-do="freeze">${a.payouts_frozen ? "Unfreeze payouts" : "Freeze payouts"}</button>
        <button class="${String(k).toLowerCase() === "suspended" ? "ok" : "no"}" data-do="suspend">${String(k).toLowerCase() === "suspended" ? "Unsuspend payments" : "Suspend payments"}</button>
        <button data-do="cfg">Edit settings</button></div>
      <div class="gy-f" data-form>
        <label><input type="checkbox" data-k="on" ${a.payments_enabled ? "checked" : ""} style="width:auto"> Payments enabled</label>
        <label>Payout mode<input data-k="mode" value="${esc(a.payout_mode || "")}"></label>
        <label>GLIME fee (%)<input data-k="fee" type="number" min="0" max="100" step="0.01" value="${(num(a.fee_bps) / 100).toFixed(2)}"></label>
        <label>Minimum payout (₹)<input data-k="min" type="number" min="0" step="1" value="${num(a.min_payout_paise) / 100}"></label>
        <label>Hold days<input data-k="hold" type="number" min="0" step="1" value="${num(a.hold_days)}"></label>
        <label>Settlement days<input data-k="settle" type="number" min="0" step="1" value="${num(a.settlement_days)}"></label>
        <div style="grid-column:1/-1"><button class="ok" data-do="save">Save settings</button></div></div>
    </div>`;
  }

  function render() {
    if (!$("gyList")) return;
    summary();
    const f = $("gyF"), cur = f.value;
    const kycs = [...new Set(list.map((a) => String(a.kyc_status || "").toLowerCase()).filter(Boolean))];
    f.innerHTML = `<option value="all">All accounts</option><option value="attention">Needs attention</option>` + kycs.map((k) => `<option value="${esc(k)}">KYC: ${esc(k)}</option>`).join("");
    if ([...f.options].some((o) => o.value === cur)) f.value = cur;
    const rows = filtered();
    $("gyList").innerHTML = rows.length ? rows.map(card).join("") : `<div class="gy-empty">No payment accounts in this view.</div>`;
  }

  async function onClick(e) {
    const b = e.target.closest("[data-do]"); if (b && b.dataset.do === "refresh") { load(); return; }
    if (!b) return;
    const card = b.closest(".gy-card"), id = card.dataset.cid, what = b.dataset.do, c = getSb(), a = list.find((x) => x.client_id === id);
    if (what === "cfg") { card.querySelector("[data-form]").classList.toggle("open"); return; }
    if (!c || !a) return;
    const reason = card.querySelector("[data-reason]").value.trim();
    b.disabled = true; msg("", "");
    try {
      if (what === "freeze") {
        const to = !a.payouts_frozen;
        if (to && !reason) throw new Error("REASON_REQUIRED");
        if (!window.confirm((to ? "Freeze" : "Unfreeze") + " payouts for " + id + "?")) { b.disabled = false; return; }
        const { error } = await c.rpc("admin_payments_freeze_payouts", { p_client_id: id, p_frozen: to, p_reason: reason || null });
        if (error) throw error;
        msg("Payouts " + (to ? "frozen" : "unfrozen") + ".", "s");
      } else if (what === "suspend") {
        const to = String(a.kyc_status).toLowerCase() !== "suspended";
        if (to && !reason) throw new Error("REASON_REQUIRED");
        if (!window.confirm((to ? "Suspend" : "Unsuspend") + " payments for " + id + "?")) { b.disabled = false; return; }
        const { error } = await c.rpc("admin_payments_suspend", { p_client_id: id, p_suspended: to, p_reason: reason || null });
        if (error) throw error;
        msg("Payments " + (to ? "suspended" : "unsuspended") + ".", "s");
      } else if (what === "save") {
        const g = (k) => card.querySelector('[data-k="' + k + '"]');
        const fee = Number(g("fee").value), min = Number(g("min").value), hold = Number(g("hold").value), settle = Number(g("settle").value);
        if ([fee, min, hold, settle].some((n) => !isFinite(n) || n < 0) || fee > 100) throw new Error("Enter valid numbers (fee 0 to 100).");
        if (!window.confirm("Save payment settings for " + id + "?")) { b.disabled = false; return; }
        const { error } = await c.rpc("admin_payments_set_config", { p_client_id: id, p_payments_enabled: g("on").checked, p_payout_mode: g("mode").value.trim() || null, p_fee_bps: Math.round(fee * 100), p_min_payout_paise: Math.round(min * 100), p_hold_days: Math.round(hold), p_settlement_days: Math.round(settle) });
        if (error) throw error;
        msg("Settings saved.", "s");
      }
      await load();
    } catch (err) { msg(errText(err), "e"); b.disabled = false; }
  }

  function create() {
    if ($(ID)) return true;
    const main = document.querySelector("#app main"), nav = document.querySelector("#app nav");
    if (!main || !nav) return false;
    const view = document.createElement("section");
    view.className = "view"; view.id = "view-payments";
    main.appendChild(view);
    const nb = document.createElement("button");
    nb.type = "button"; nb.dataset.view = "payments"; nb.textContent = "Payments";
    nav.insertBefore(nb, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    nb.addEventListener("click", () => {
      document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
      view.classList.add("active");
      document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x === nb));
      const ti = $("title"); if (ti) ti.textContent = "Payments";
      load();
    });
    styles();
    const s = document.createElement("div");
    s.id = ID;
    s.innerHTML = `<div class="gy-title">Client Payments</div>
      <div class="gy-sub">Payment accounts of your clients: KYC status, balances, GLIME fee earned, failed payouts. Freeze payouts or suspend a payment account when something looks wrong. Every action is audited.</div>
      <div class="gy-sum" id="gySum"></div>
      <div class="gy-bar"><input id="gyQ" type="search" placeholder="Search client id, business, email"><select id="gyF" aria-label="Filter"></select><button data-do="refresh" type="button">Refresh</button></div>
      <div id="gyList"><div class="gy-empty">Open this tab to load payment accounts.</div></div><div id="gyMsg" class="gy-msg"></div>`;
    view.appendChild(s);
    $("gyQ").addEventListener("input", render);
    $("gyF").addEventListener("change", render);
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
