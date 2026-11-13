/* =========================================================
   GLIME ADMIN - Promo Codes
   Adds a "Promo Codes" tab to the admin sidebar. The admin can create a
   short code (GLM100 = 100 people) for a YouTube video or a festival offer,
   see how many people used it, pause/resume it, and see who used it.
   Clients type the code in the Referral code box on signup.html.
   Frontend only. Backend RPCs (see PROMO_CODE_BACKEND_SPEC.md):
     admin_promo_create, admin_promo_list, admin_promo_set_active,
     admin_promo_redemptions
   Does not change any other addon.
========================================================= */
(() => {
  "use strict";
  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const VIEW = "view-promo";
  const MAX_TOKENS = 10000000, MAX_USERS = 100000;
  const sb = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => new Intl.NumberFormat("en-IN").format(Number(v) || 0);
  const dt = (v) => (v ? new Date(v).toLocaleString("en-IN") : "—");

  const ERR = {
    not_admin: "आप admin नहीं हैं या 2FA पूरा नहीं हुआ",
    CODE_EXISTS: "यह code पहले से मौजूद है, दूसरा code बनाएँ",
    INVALID_CODE: "Code 4 से 12 अक्षर/अंकों का हो (सिर्फ़ A-Z और 0-9, signup के box में इतना ही आता है)",
    INVALID_TOKENS: "Tokens 1 से 10,000,000 के बीच हों",
    INVALID_LIMIT: "लोगों की संख्या 1 से 100,000 के बीच हो",
    INVALID_EXPIRY: "समाप्ति की तारीख़ आगे की होनी चाहिए",
    PROMO_NOT_FOUND: "यह promo code नहीं मिला"
  };
  const NOT_READY = /could not find the function|PGRST202|does not exist|schema cache/i;
  function errText(e) {
    const m = String((e && e.message) || e || "");
    if (NOT_READY.test(m)) return "Backend अभी तैयार नहीं है। PROMO_CODE_BACKEND_SPEC.md देखकर Supabase में functions बनाएँ।";
    for (const k in ERR) if (m.includes(k)) return ERR[k];
    return m || "Request failed.";
  }

  let promos = [], busy = false, createKey = "";
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "k-" + Date.now() + "-" + Math.random().toString(16).slice(2));

  /* Short code: letters + number of people, e.g. GLM100 = 100 people.
     A custom word works too (DIWALI -> DIWALI500). If the code is already
     taken, a letter is added (GLM100A, GLM100B ...). */
  let codeTouched = false;
  function genCode() {
    const cur = ($("pmCode") && $("pmCode").value || "").toUpperCase();
    const m = cur.match(/^[A-Z]+/);
    const n = Math.floor(Number($("pmMax") && $("pmMax").value)) || 0;
    const digits = String(n > 0 ? n : "");
    let prefix = (m ? m[0] : "GLM");
    prefix = prefix.slice(0, Math.max(1, 12 - digits.length - 1));
    const base = prefix + digits;
    const taken = new Set(promos.map((p) => String(p.code).toUpperCase()));
    if (!taken.has(base)) return base;
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!taken.has(base + ch)) return base + ch;
    return base;
  }

  function statusOf(p) {
    if (p.is_active === false) return ["Paused", "gray"];
    if (p.expires_at && new Date(p.expires_at) < new Date()) return ["Expired", "red"];
    if (Number(p.redeemed_count) >= Number(p.max_redemptions)) return ["Full", "orange"];
    return ["Live", "green"];
  }

  function css() {
    if ($("pmStyle")) return;
    const s = document.createElement("style"); s.id = "pmStyle";
    s.textContent = `
      #${VIEW} .pm-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
      #${VIEW} .pm-stat{padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03)}
      #${VIEW} .pm-stat small{display:block;color:#9ba7b7;font-size:.7rem;text-transform:uppercase;letter-spacing:.7px}
      #${VIEW} .pm-stat strong{font-size:1.4rem}
      #${VIEW} .pm-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      #${VIEW} .pm-form .full{grid-column:1/-1}
      #${VIEW} label{display:block;margin:0 0 5px;color:#9ba7b7;font-size:.72rem;text-transform:uppercase;letter-spacing:.8px;font-weight:600}
      #${VIEW} input,#${VIEW} textarea{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;box-sizing:border-box}
      #${VIEW} .pm-row{display:flex;gap:8px}
      #${VIEW} .pm-row input{flex:1}
      #${VIEW} .pm-btn{border:0;border-radius:10px;padding:10px 14px;font:700 .8rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.08);color:#fff;white-space:nowrap}
      #${VIEW} .pm-btn.main{background:#00ff88;color:#06100b;width:100%;padding:12px;margin-top:4px}
      #${VIEW} .pm-btn.sm{padding:6px 10px;font-size:.72rem}
      #${VIEW} .pm-btn:disabled{opacity:.5;cursor:not-allowed}
      #${VIEW} .pm-preview{padding:12px 14px;border-radius:12px;border:1px dashed rgba(0,255,136,.4);background:rgba(0,255,136,.05);font-size:.85rem;line-height:1.6}
      #${VIEW} .pm-preview b{color:#00ff88}
      #${VIEW} .pm-msg{margin-top:10px;padding:10px 12px;border-radius:10px;font-size:.8rem;display:none;line-height:1.5}
      #${VIEW} .pm-msg.s{display:block;color:#00ff88;background:rgba(0,255,136,.08);border:1px solid rgba(0,255,136,.25)}
      #${VIEW} .pm-msg.e{display:block;color:#ff6b7a;background:rgba(255,71,87,.08);border:1px solid rgba(255,71,87,.25)}
      #${VIEW} .pm-msg.w{display:block;color:#ffd98a;background:rgba(255,200,87,.08);border:1px solid rgba(255,200,87,.3)}
      #${VIEW} .pm-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.5px}
      #${VIEW} .pm-bar{height:6px;border-radius:6px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:5px;min-width:90px}
      #${VIEW} .pm-bar i{display:block;height:100%;background:#00ff88}
      #${VIEW} .pm-acts{display:flex;gap:6px;flex-wrap:wrap}
      #${VIEW} .pm-gray{color:#9ba7b7}
      #${VIEW} table{width:100%;border-collapse:collapse;font-size:.78rem}
      #${VIEW} th,#${VIEW} td{padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left;vertical-align:top}
      #${VIEW} th{color:#7b8797;font-weight:600}
      @media(max-width:860px){#${VIEW} .pm-stats{grid-template-columns:1fr 1fr}#${VIEW} .pm-form{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  function skeleton() {
    return `
      <div class="pm-stats">
        <div class="pm-stat"><small>Total codes</small><strong id="pmStTotal">0</strong></div>
        <div class="pm-stat"><small>Live codes</small><strong id="pmStLive">0</strong></div>
        <div class="pm-stat"><small>Total redemptions</small><strong id="pmStUsed">0</strong></div>
        <div class="pm-stat"><small>Tokens given</small><strong id="pmStTokens">0</strong></div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:4px">Create Promo Code</h3>
        <p class="sub">YouTube या किसी भी campaign के लिए code बनाइए। जितने लोगों की limit रखेंगे, उतने लोग ही code इस्तेमाल कर पाएँगे। हर client एक code सिर्फ़ एक बार use कर सकता है।</p>
        <div class="pm-form">
          <div class="full"><label for="pmCode">Code</label>
            <div class="pm-row"><input id="pmCode" maxlength="12" autocomplete="off" spellcheck="false" placeholder="GLM100"><button class="pm-btn" id="pmGen" type="button">Generate</button></div>
            <div class="sub" style="margin-top:6px">Code छोटा रखा है: GLM के पीछे लोगों की संख्या (GLM100 = 100 लोग)। चाहें तो अपना नाम लिखें, जैसे DIWALI500। Client इसे signup पेज के "Referral code" box में डालेगा।</div></div>
          <div><label for="pmTokens">Tokens हर व्यक्ति को</label><input id="pmTokens" type="number" min="1" max="${MAX_TOKENS}" step="1" inputmode="numeric" value="20000"></div>
          <div><label for="pmMax">कितने लोगों के लिए (पहले N लोग)</label><input id="pmMax" type="number" min="1" max="${MAX_USERS}" step="1" inputmode="numeric" value="100"></div>
          <div><label for="pmExp">आख़िरी तारीख़ (optional)</label><input id="pmExp" type="datetime-local"></div>
          <div><label for="pmNote">अपने लिए note (optional)</label><input id="pmNote" maxlength="200" placeholder="e.g. YouTube launch video"></div>
          <div class="full"><div class="pm-preview" id="pmPreview"></div></div>
          <div class="full"><button class="pm-btn main" id="pmCreate" type="button">Create Promo Code</button><div class="pm-msg" id="pmMsg" role="alert"></div></div>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px"><h3 style="margin:0">All Promo Codes</h3><button class="pm-btn sm" id="pmReload" type="button">↻ Reload</button></div>
        <div class="pm-msg" id="pmListMsg" role="alert"></div>
        <div style="overflow:auto"><table><thead><tr><th>Code</th><th>Tokens</th><th>Used</th><th>Status</th><th>Expiry</th><th>Note</th><th></th></tr></thead><tbody id="pmRows"><tr><td colspan="7" class="sub">Loading…</td></tr></tbody></table></div>
      </div>
      <div class="card" style="margin-top:14px;display:none" id="pmRedeemCard">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px"><h3 style="margin:0" id="pmRedeemTitle">Who used this code</h3><button class="pm-btn sm" id="pmRedeemClose" type="button">Close</button></div>
        <div style="overflow:auto"><table><thead><tr><th>Client</th><th>Business</th><th>Phone</th><th>Email</th><th>Tokens</th><th>Date</th></tr></thead><tbody id="pmRedeemRows"></tbody></table></div>
      </div>`;
  }

  function say(id, text, kind) { const m = $(id); m.textContent = text; m.className = "pm-msg " + (kind || ""); if (!text) m.className = "pm-msg"; }

  function preview() {
    const code = ($("pmCode").value || "").trim().toUpperCase() || "—";
    const t = Number($("pmTokens").value) || 0, n = Number($("pmMax").value) || 0;
    $("pmPreview").innerHTML = `वीडियो में बोलने के लिए: <b>पहले ${num(n)} लोगों</b> को <b>${num(t)} tokens</b> मिलेंगे। Signup में Referral code box में डालें: <b class="pm-code">${esc(code)}</b><br><span class="pm-gray">कुल ज़्यादा से ज़्यादा tokens जो बँट सकते हैं: ${num(t * n)}</span>`;
  }

  function renderStats() {
    $("pmStTotal").textContent = num(promos.length);
    $("pmStLive").textContent = num(promos.filter((p) => statusOf(p)[0] === "Live").length);
    $("pmStUsed").textContent = num(promos.reduce((a, p) => a + (Number(p.redeemed_count) || 0), 0));
    $("pmStTokens").textContent = num(promos.reduce((a, p) => a + (Number(p.redeemed_count) || 0) * (Number(p.tokens) || 0), 0));
  }

  function renderRows() {
    renderStats();
    $("pmRows").innerHTML = promos.length ? promos.map((p, i) => {
      const st = statusOf(p), used = Number(p.redeemed_count) || 0, max = Number(p.max_redemptions) || 0;
      const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
      const paused = p.is_active === false;
      return `<tr>
        <td><span class="pm-code">${esc(p.code)}</span><br><span class="sub">${esc(dt(p.created_at))}</span></td>
        <td>${num(p.tokens)}</td>
        <td>${num(used)} / ${num(max)}<div class="pm-bar"><i style="width:${pct}%"></i></div></td>
        <td><span class="badge ${st[1]}">${st[0]}</span></td>
        <td>${p.expires_at ? esc(dt(p.expires_at)) : "—"}</td>
        <td>${esc(p.note || "")}</td>
        <td><div class="pm-acts"><button class="pm-btn sm" data-a="copy" data-i="${i}" type="button">Copy</button><button class="pm-btn sm" data-a="users" data-i="${i}" type="button">Users</button><button class="pm-btn sm" data-a="toggle" data-i="${i}" type="button">${paused ? "Resume" : "Pause"}</button></div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="7" class="sub">अभी कोई promo code नहीं है। ऊपर से पहला code बनाइए।</td></tr>`;
  }

  async function load() {
    say("pmListMsg", "", "");
    try {
      const { data, error } = await sb.rpc("admin_promo_list", { p_limit: 200 });
      if (error) throw error;
      promos = Array.isArray(data) ? data : (data && Array.isArray(data.promos) ? data.promos : []);
      renderRows();
      if (!codeTouched && $("pmCode")) { $("pmCode").value = genCode(); preview(); }
    } catch (e) {
      promos = []; renderRows();
      say("pmListMsg", errText(e), NOT_READY.test(String((e && e.message) || e)) ? "w" : "e");
    }
  }

  async function create() {
    if (busy) return;
    const code = $("pmCode").value.trim().toUpperCase();
    const tokens = Number($("pmTokens").value), max = Number($("pmMax").value);
    const expVal = $("pmExp").value, note = $("pmNote").value.trim();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) { say("pmMsg", ERR.INVALID_CODE, "e"); return; }
    if (!Number.isInteger(tokens) || tokens < 1 || tokens > MAX_TOKENS) { say("pmMsg", ERR.INVALID_TOKENS, "e"); return; }
    if (!Number.isInteger(max) || max < 1 || max > MAX_USERS) { say("pmMsg", ERR.INVALID_LIMIT, "e"); return; }
    let expiresAt = null;
    if (expVal) { const d = new Date(expVal); if (isNaN(d) || d <= new Date()) { say("pmMsg", ERR.INVALID_EXPIRY, "e"); return; } expiresAt = d.toISOString(); }
    if (!window.confirm("Promo code बनाया जाएगा।\nCode: " + code + "\nहर व्यक्ति को: " + num(tokens) + " tokens\nलोगों की limit: " + num(max) + "\nकुल ज़्यादा से ज़्यादा: " + num(tokens * max) + " tokens\nक्या आप पक्का बनाना चाहते हैं?")) return;
    busy = true; $("pmCreate").disabled = true; say("pmMsg", "बनाया जा रहा है…", "w");
    try {
      if (!createKey) createKey = uuid();
      const { data, error } = await sb.rpc("admin_promo_create", { p_code: code, p_tokens: tokens, p_max_redemptions: max, p_expires_at: expiresAt, p_note: note || null, p_idempotency_key: createKey });
      if (error) throw error;
      createKey = "";
      say("pmMsg", "Promo code बन गया: " + ((data && data.code) || code) + ". अब इसे वीडियो में बोल सकते हैं।", "s");
      await load();
      codeTouched = false; $("pmCode").value = genCode(); $("pmNote").value = ""; $("pmExp").value = "";
      preview();
    } catch (e) {
      const m = String((e && e.message) || e || "");
      if (m.includes("CODE_EXISTS")) createKey = "";
      say("pmMsg", errText(e), "e");
    }
    busy = false; $("pmCreate").disabled = false;
  }

  async function toggle(p) {
    const pause = p.is_active !== false;
    if (!window.confirm((pause ? "इस code को रोक दें?" : "इस code को फिर चालू करें?") + "\n" + p.code)) return;
    try {
      const { error } = await sb.rpc("admin_promo_set_active", { p_code: p.code, p_active: !pause });
      if (error) throw error;
      await load();
    } catch (e) { say("pmListMsg", errText(e), "e"); }
  }

  async function users(p) {
    const card = $("pmRedeemCard");
    card.style.display = "block";
    $("pmRedeemTitle").textContent = "इस code को किसने use किया: " + p.code;
    $("pmRedeemRows").innerHTML = `<tr><td colspan="6" class="sub">Loading…</td></tr>`;
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    try {
      const { data, error } = await sb.rpc("admin_promo_redemptions", { p_code: p.code, p_limit: 500 });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : (data && Array.isArray(data.redemptions) ? data.redemptions : []);
      $("pmRedeemRows").innerHTML = rows.length ? rows.map((r) => `<tr><td><b>${esc(r.full_name || "—")}</b><br><span class="sub">${esc(r.client_id || "—")}</span></td><td>${esc(r.business_name || "—")}</td><td>${esc(r.phone || "—")}</td><td>${esc(r.email || "—")}</td><td>${num(r.tokens)}</td><td>${esc(dt(r.redeemed_at || r.created_at))}</td></tr>`).join("") : `<tr><td colspan="6" class="sub">अभी तक किसी ने use नहीं किया।</td></tr>`;
    } catch (e) { $("pmRedeemRows").innerHTML = `<tr><td colspan="6"><div class="pm-msg e">${esc(errText(e))}</div></td></tr>`; }
  }

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch (x) { /* ignore */ }
      document.body.removeChild(t);
    }
    if (btn) { const o = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(() => { btn.textContent = o; }, 1400); }
  }

  function open() {
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    $(VIEW).classList.add("active");
    document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x.dataset.view === "promo"));
    const ti = $("title"); if (ti) ti.textContent = "Promo Codes";
    load();
  }

  function retirePlaceholder() {
    const old = $("promoCode");
    const card = old && old.closest(".card");
    if (card) card.innerHTML = `<h3>Promotional Code</h3><p class="sub">Promo codes अब अलग "Promo Codes" tab में बनते हैं।</p>`;
  }

  function create_() {
    if ($(VIEW)) return true;
    const main = document.querySelector("#app main, main"), nav = document.querySelector("aside.sidebar nav, #app nav");
    if (!main || !nav) return false;
    css();
    const sec = document.createElement("section"); sec.className = "view"; sec.id = VIEW; sec.innerHTML = skeleton();
    main.appendChild(sec);
    const b = document.createElement("button"); b.type = "button"; b.dataset.view = "promo"; b.textContent = "Promo Codes";
    nav.insertBefore(b, nav.querySelector('[data-view="notifications"]') || nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    b.addEventListener("click", open);
    $("pmCode").value = genCode();
    $("pmTokens").addEventListener("input", preview);
    $("pmMax").addEventListener("input", () => { if (!codeTouched) $("pmCode").value = genCode(); preview(); });
    $("pmCode").addEventListener("input", (e) => { codeTouched = true; e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); preview(); });
    $("pmGen").addEventListener("click", () => { codeTouched = false; $("pmCode").value = genCode(); preview(); });
    $("pmCreate").addEventListener("click", create);
    $("pmReload").addEventListener("click", load);
    $("pmRedeemClose").addEventListener("click", () => { $("pmRedeemCard").style.display = "none"; });
    $("pmRows").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-a]"); if (!btn) return;
      const p = promos[Number(btn.dataset.i)]; if (!p) return;
      if (btn.dataset.a === "copy") copy(p.code, btn);
      else if (btn.dataset.a === "users") users(p);
      else if (btn.dataset.a === "toggle") toggle(p);
    });
    preview(); retirePlaceholder();
    return true;
  }

  let tries = 0;
  const t = setInterval(() => { tries++; if (create_() || tries > 40) clearInterval(t); }, 800);
})();
