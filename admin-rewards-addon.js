/* =========================================================
   GLIME ADMIN - Give Tokens (AI credits) and Wallet adjust
   Adds a "Tokens & Wallet" tab to the admin sidebar with two cards:
   Give Tokens and Wallet Adjust.
   RPCs: admin_clients_list, admin_grant_ai_credits, admin_wallet_adjust
   Edge function: admin-billing-read (balances and history)
   Only admin@glime.online with 2FA can use it (backend enforces this).
   Does not change admin.html or any other addon.
========================================================= */
(() => {
  "use strict";
  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const ADMIN_EMAIL = "admin@glime.online";
  const VIEW = "view-tokens";

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dt = (v) => (v ? new Date(v).toLocaleString("en-IN") : "—");
  const num = (v) => new Intl.NumberFormat("en-IN").format(Number(v) || 0);
  const inr = (v) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(v) || 0);

  const ERR = {
    not_admin: "आप admin नहीं हैं या 2FA पूरा नहीं हुआ",
    CLIENT_REQUIRED: "पहले client चुनें",
    CLIENT_NOT_FOUND: "यह client नहीं मिला",
    INVALID_CREDITS: "Tokens 0 से ज़्यादा और 10,000,000 तक हों",
    INVALID_AMOUNT: "रक़म 0 नहीं हो सकती और ±1,000,000 तक हो",
    REASON_REQUIRED: "कारण लिखना ज़रूरी है",
    REASON_TOO_LONG: "कारण 500 अक्षर से कम रखें",
    REFERENCE_REQUIRED: "Reference लिखना ज़रूरी है",
    insufficient_wallet_balance: "Wallet में इतना balance नहीं है",
    wallet_not_active: "इस client का wallet चालू नहीं है"
  };
  function errText(e) {
    const m = String((e && e.message) || e || "");
    for (const k in ERR) if (m.includes(k)) return ERR[k];
    return m || "Request failed.";
  }

  let selected = null, tokenKey = "", walletRef = "", results = [], timer = null, busy = false;

  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "k-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  function suggestRef() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return "ADM-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  function css() {
    if ($("gtStyle")) return;
    const s = document.createElement("style"); s.id = "gtStyle";
    s.textContent = `
      #${VIEW} .gt-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      #${VIEW} .gt-card{padding:18px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.02)}
      #${VIEW} h3{margin:0 0 6px;font-size:1rem}#${VIEW} .gt-sub{color:#9ba7b7;font-size:.76rem;line-height:1.5;margin:0 0 12px}
      #${VIEW} label{display:block;margin:10px 0 5px;color:#9ba7b7;font-size:.72rem;text-transform:uppercase;letter-spacing:.8px;font-weight:600}
      #${VIEW} input,#${VIEW} textarea{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;box-sizing:border-box}
      #${VIEW} button.gt-btn{margin-top:14px;border:0;border-radius:10px;padding:11px 16px;font:700 .82rem system-ui,sans-serif;cursor:pointer;background:#00ff88;color:#06100b;width:100%}
      #${VIEW} button.gt-btn.w{background:#00f0ff}#${VIEW} button:disabled{opacity:.5;cursor:not-allowed}
      #${VIEW} .gt-res{margin-top:8px;max-height:230px;overflow:auto}
      #${VIEW} .gt-pick{display:block;width:100%;text-align:left;padding:9px 12px;margin-bottom:6px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#fff;cursor:pointer;font:inherit;font-size:.8rem}
      #${VIEW} .gt-pick:hover{border-color:#00f0ff}#${VIEW} .gt-pick small{display:block;color:#9ba7b7}
      #${VIEW} .gt-sel{padding:14px;border-radius:14px;border:1px solid rgba(0,255,136,.3);background:rgba(0,255,136,.05);margin:12px 0}
      #${VIEW} .gt-sel b{font-size:.95rem}#${VIEW} .gt-sel small{display:block;color:#9ba7b7;margin-top:2px}
      #${VIEW} .gt-bal{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      #${VIEW} .gt-bal div{padding:10px;border-radius:12px;background:rgba(255,255,255,.04)}#${VIEW} .gt-bal small{display:block;color:#9ba7b7;font-size:.68rem}#${VIEW} .gt-bal strong{font-size:1.15rem}
      #${VIEW} .gt-msg{margin-top:12px;padding:10px 12px;border-radius:10px;font-size:.8rem;display:none;line-height:1.5}
      #${VIEW} .gt-msg.s{display:block;color:#00ff88;background:rgba(0,255,136,.08);border:1px solid rgba(0,255,136,.25)}
      #${VIEW} .gt-msg.e{display:block;color:#ff6b7a;background:rgba(255,71,87,.08);border:1px solid rgba(255,71,87,.25)}
      #${VIEW} .gt-msg.w{display:block;color:#ffd98a;background:rgba(255,200,87,.08);border:1px solid rgba(255,200,87,.3)}
      #${VIEW} table{width:100%;border-collapse:collapse;font-size:.76rem}#${VIEW} th,#${VIEW} td{padding:8px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left}
      #${VIEW} th{color:#7b8797;font-weight:600}#${VIEW} .pos{color:#00ff88}#${VIEW} .neg{color:#ff6b7a}
      @media(max-width:860px){#${VIEW} .gt-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  /* ---------- skeleton ---------- */
  function skeleton() {
    return `<div class="card">
      <h3 style="margin-bottom:4px">Tokens & Wallet</h3>
      <p class="gt-sub">Give a client AI tokens (credits) or adjust their wallet balance. Every action is recorded in Audit Logs. These cannot be taken back.</p>
      <div id="gtAuth"></div>
      <label for="gtSearch">Find a client (email or client ID)</label>
      <input id="gtSearch" type="search" autocomplete="off" placeholder="e.g. GLM-0002 or name@email.com">
      <div class="gt-res" id="gtResults"></div>
      <div id="gtSel"></div>
      <div class="gt-grid" id="gtCards" style="display:none;margin-top:6px">
        <div class="gt-card"><h3>Give Tokens</h3><p class="gt-sub">AI credits are added to the client right away.</p>
          <label for="gtCredits">Tokens (1 to 10,000,000)</label><input id="gtCredits" type="number" min="1" max="10000000" step="1" inputmode="numeric">
          <label for="gtTReason">Reason (required)</label><textarea id="gtTReason" rows="2" maxlength="500" placeholder="e.g. Goodwill reward"></textarea>
          <button class="gt-btn" id="gtGiveBtn" type="button">Give Tokens</button><div class="gt-msg" id="gtTMsg" role="alert"></div></div>
        <div class="gt-card"><h3>Wallet Adjust</h3><p class="gt-sub">Use a positive amount to add and a negative amount to subtract.</p>
          <label for="gtAmount">Amount in &#8377; (&#177;1,000,000)</label><input id="gtAmount" type="number" step="0.01" inputmode="decimal" placeholder="100 or -100">
          <label for="gtWReason">Reason (required)</label><textarea id="gtWReason" rows="2" maxlength="500" placeholder="e.g. Refund for failed payment"></textarea>
          <label for="gtRef">Reference (must be different each time)</label><input id="gtRef" type="text" maxlength="80">
          <button class="gt-btn w" id="gtWalletBtn" type="button">Apply to Wallet</button><div class="gt-msg" id="gtWMsg" role="alert"></div></div>
      </div>
      <div id="gtHistory"></div>
    </div>`;
  }

  /* ---------- admin check ---------- */
  async function checkAdmin() {
    const box = $("gtAuth");
    try {
      const { data } = await sb.auth.getSession();
      const email = (data && data.session && data.session.user && data.session.user.email) || "";
      box.innerHTML = email.toLowerCase() === ADMIN_EMAIL ? "" : `<div class="gt-msg w">यह सुविधा सिर्फ़ ${ADMIN_EMAIL} (2FA के साथ) के लिए है। बाक़ी खातों को backend मना कर देगा।</div>`;
    } catch (e) { box.innerHTML = ""; }
  }

  /* ---------- client search ---------- */
  async function search(text) {
    const box = $("gtResults");
    if (text.trim().length < 2) { box.innerHTML = ""; return; }
    try {
      const { data, error } = await sb.rpc("admin_clients_list", { p_search: text.trim(), p_status: null, p_limit: 20 });
      if (error) throw error;
      results = Array.isArray(data) ? data : [];
      box.innerHTML = results.length ? results.map((c, i) => `<button type="button" class="gt-pick" data-i="${i}">${esc(c.business_name || c.full_name || c.client_id)}<small>${esc(c.client_id)} · ${esc(c.email || "")}</small></button>`).join("") : `<div class="gt-sub">कोई client नहीं मिला।</div>`;
    } catch (e) { box.innerHTML = `<div class="gt-msg e">${esc(errText(e))}</div>`; }
  }

  function pick(c) {
    selected = c; tokenKey = uuid(); walletRef = suggestRef();
    $("gtResults").innerHTML = ""; $("gtSearch").value = "";
    $("gtSel").innerHTML = `<div class="gt-sel"><b>${esc(c.business_name || c.full_name || c.client_id)}</b><small>${esc(c.client_id)} · ${esc(c.email || "")}</small><div class="gt-bal"><div><small>Tokens balance</small><strong id="gtBalT">…</strong></div><div><small>Wallet balance</small><strong id="gtBalW">…</strong></div></div></div>`;
    $("gtCards").style.display = "grid";
    $("gtRef").value = walletRef;
    ["gtTMsg", "gtWMsg"].forEach((id) => { $(id).className = "gt-msg"; $(id).textContent = ""; });
    readBilling();
  }

  async function readBilling() {
    if (!selected) return;
    try {
      const { data, error } = await sb.functions.invoke("admin-billing-read", { body: { client_id: selected.client_id, limit: 20 } });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || "Billing read failed.");
      const bal = (data.ai_credit_balances || [])[0], w = (data.wallets || [])[0];
      $("gtBalT").textContent = bal ? num(bal.balance_credits) : "0";
      $("gtBalW").textContent = w ? inr(w.balance) : "—";
      history(data);
    } catch (e) {
      if ($("gtBalT")) { $("gtBalT").textContent = "—"; $("gtBalW").textContent = "—"; }
      $("gtHistory").innerHTML = `<div class="gt-msg e">${esc(errText(e))}</div>`;
    }
  }

  function history(d) {
    const at = d.ai_credit_transactions || [], w = d.wallets || [];
    const amt = (x) => (x.credits != null ? x.credits : x.amount != null ? x.amount : x.delta != null ? x.delta : x.credit_delta);
    $("gtHistory").innerHTML = `<h3 style="margin:18px 0 8px">Recent token history</h3><div style="overflow:auto"><table><thead><tr><th>Date</th><th>Type</th><th>Tokens</th><th>Note</th></tr></thead><tbody>` +
      (at.length ? at.map((x) => { const v = Number(amt(x)); return `<tr><td>${esc(dt(x.created_at))}</td><td>${esc(x.transaction_type || x.type || x.kind || "—")}</td><td class="${v < 0 ? "neg" : "pos"}">${isNaN(v) ? "—" : (v > 0 ? "+" : "") + num(v)}</td><td>${esc(x.reason || x.description || x.reference || "")}</td></tr>`; }).join("") : `<tr><td colspan="4">No token history yet.</td></tr>`) +
      `</tbody></table></div><h3 style="margin:18px 0 8px">Wallet</h3><div style="overflow:auto"><table><thead><tr><th>Status</th><th>Balance</th><th>Updated</th></tr></thead><tbody>` +
      (w.length ? w.map((x) => `<tr><td>${esc(x.status || "—")}</td><td>${inr(x.balance)}</td><td>${esc(dt(x.updated_at || x.created_at))}</td></tr>`).join("") : `<tr><td colspan="3">No wallet yet.</td></tr>`) + `</tbody></table></div>`;
  }

  /* ---------- actions ---------- */
  function say(id, text, kind) { const m = $(id); m.textContent = text; m.className = "gt-msg " + kind; }

  async function giveTokens() {
    if (busy) return;
    if (!selected) { say("gtTMsg", ERR.CLIENT_REQUIRED, "e"); return; }
    const credits = Number($("gtCredits").value), reason = $("gtTReason").value.trim();
    if (!Number.isInteger(credits) || credits <= 0 || credits > 10000000) { say("gtTMsg", ERR.INVALID_CREDITS, "e"); return; }
    if (!reason) { say("gtTMsg", ERR.REASON_REQUIRED, "e"); return; }
    if (reason.length > 500) { say("gtTMsg", ERR.REASON_TOO_LONG, "e"); return; }
    if (!window.confirm("यह रक़म/tokens client को तुरंत मिल जाएँगे और वापस नहीं लिए जा सकते।\nClient: " + selected.client_id + "\nTokens: " + num(credits) + "\nकारण: " + reason + "\nक्या आप पक्का देना चाहते हैं?")) return;
    busy = true; $("gtGiveBtn").disabled = true; say("gtTMsg", "भेजा जा रहा है…", "w");
    try {
      const { data, error } = await sb.rpc("admin_grant_ai_credits", { p_client_id: selected.client_id, p_credits: credits, p_reason: reason, p_idempotency_key: tokenKey });
      if (error) throw error;
      if (data && data.duplicate === true) { say("gtTMsg", "यह पहले ही लग चुका है, दोबारा नहीं जोड़ा गया।", "w"); }
      else { say("gtTMsg", "Tokens दे दिए गए। नया balance: " + num(data && data.balance_credits), "s"); }
      $("gtCredits").value = ""; $("gtTReason").value = ""; tokenKey = uuid();
      await readBilling();
    } catch (e) { say("gtTMsg", errText(e), "e"); }
    busy = false; $("gtGiveBtn").disabled = false;
  }

  async function adjustWallet() {
    if (busy) return;
    if (!selected) { say("gtWMsg", ERR.CLIENT_REQUIRED, "e"); return; }
    const amount = Number($("gtAmount").value), reason = $("gtWReason").value.trim(), ref = $("gtRef").value.trim();
    if (!amount || Math.abs(amount) > 1000000) { say("gtWMsg", ERR.INVALID_AMOUNT, "e"); return; }
    if (!reason) { say("gtWMsg", ERR.REASON_REQUIRED, "e"); return; }
    if (reason.length > 500) { say("gtWMsg", ERR.REASON_TOO_LONG, "e"); return; }
    if (!ref) { say("gtWMsg", ERR.REFERENCE_REQUIRED, "e"); return; }
    const line = amount > 0 ? "Wallet: ₹" + amount + " जोड़ा जाएगा" : "Wallet: ₹" + Math.abs(amount) + " घटाया जाएगा";
    if (!window.confirm("यह रक़म/tokens client को तुरंत मिल जाएँगे और वापस नहीं लिए जा सकते।\nClient: " + selected.client_id + "\n" + line + "\nकारण: " + reason + "\nक्या आप पक्का देना चाहते हैं?")) return;
    busy = true; $("gtWalletBtn").disabled = true; say("gtWMsg", "भेजा जा रहा है…", "w");
    try {
      const { data, error } = await sb.rpc("admin_wallet_adjust", { p_client_id: selected.client_id, p_amount: amount, p_reason: reason, p_reference: ref });
      if (error) throw error;
      if (data && data.duplicate === true) { say("gtWMsg", "यह पहले ही लग चुका है, दोबारा नहीं जोड़ा गया।", "w"); }
      else { say("gtWMsg", "Wallet अपडेट हो गया। नया balance: " + inr(data && data.balance), "s"); }
      $("gtAmount").value = ""; $("gtWReason").value = ""; walletRef = suggestRef(); $("gtRef").value = walletRef;
      await readBilling();
    } catch (e) { say("gtWMsg", errText(e), "e"); }
    busy = false; $("gtWalletBtn").disabled = false;
  }

  /* ---------- wiring ---------- */
  function open() {
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    $(VIEW).classList.add("active");
    document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x.dataset.view === "tokens"));
    const ti = $("title"); if (ti) ti.textContent = "Tokens & Wallet";
    checkAdmin();
  }

  function create() {
    if ($(VIEW)) return true;
    const main = document.querySelector("#app main, main"), nav = document.querySelector("aside.sidebar nav, #app nav");
    if (!main || !nav) return false;
    css();
    const sec = document.createElement("section"); sec.className = "view"; sec.id = VIEW; sec.innerHTML = skeleton();
    main.appendChild(sec);
    const b = document.createElement("button"); b.type = "button"; b.dataset.view = "tokens"; b.textContent = "Tokens & Wallet";
    nav.insertBefore(b, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    b.addEventListener("click", open);
    $("gtSearch").addEventListener("input", (e) => { clearTimeout(timer); const v = e.target.value; timer = setTimeout(() => search(v), 300); });
    sec.addEventListener("click", (e) => {
      const p = e.target.closest(".gt-pick"); if (p) pick(results[Number(p.dataset.i)]);
    });
    $("gtGiveBtn").addEventListener("click", giveTokens);
    $("gtWalletBtn").addEventListener("click", adjustWallet);
    return true;
  }

  let tries = 0;
  const t = setInterval(() => { tries++; if (create() || tries > 40) clearInterval(t); }, 800);
})();
