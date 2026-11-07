/* =========================================================
   GLIME ADMIN - AI Learning
   Adds an "AI Learning" tab to the admin sidebar. The admin reviews
   the customer->reply pairs collected from every channel and marks
   each one Approved / Rejected / Corrected. Approved and corrected
   examples are what the GLIME model learns from. Also sets the
   auto-reply mode per client (off / shadow / suggest / auto).
   Reads : rpc ml_admin_clients, ml_admin_list_examples, ml_admin_stats
   Writes: rpc ml_admin_review_example, ml_admin_bulk_approve,
           ml_admin_set_settings
   All of these RPCs allow admins only (is_glime_admin()).
========================================================= */
(() => {
  "use strict";
  const URL_ = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const VIEW = "view-ml-learning";
  const PAGE = 25;
  const LABELS = { pending: "Pending", approved: "Approved", corrected: "Corrected", rejected: "Rejected", all: "All" };
  const CH = { whatsapp: "WhatsApp", instagram: "Instagram", voice: "Voice", client_assistant: "Client assistant", glime_ai: "GLIME AI" };
  const MODES = {
    off: "Off - system never answers",
    shadow: "Shadow - only logs what it would answer (nothing is sent)",
    suggest: "Suggest - shows the answer as a suggestion",
    auto: "Auto - answers by itself when very sure"
  };

  let sb = null, clients = [], rows = [], total = 0, stats = null, loaded = false, editing = null, timer = null, testRes = null, testText = "", testBusy = false;
  const f = { client: "", label: "pending", channel: "", q: "", offset: 0 };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (v) => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); };
  function client() {
    if (sb) return sb;
    if (window.supabaseClient && window.supabaseClient.rpc) return (sb = window.supabaseClient);
    if (window.supabase && typeof window.supabase.createClient === "function") sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return sb;
  }
  async function rpc(name, args) {
    const c = client(); if (!c) throw new Error("Not connected");
    const r = await c.rpc(name, args || {});
    if (r.error) throw r.error;
    return r.data;
  }
  function say(text, bad) {
    const el = $("mlMsg"); if (!el) return;
    el.style.display = text ? "block" : "none";
    el.className = "ml-note" + (bad ? " bad" : "");
    el.textContent = text || "";
  }

  /* ---------- styles ---------- */
  function css() {
    if ($("mlStyle")) return;
    const s = document.createElement("style"); s.id = "mlStyle";
    s.textContent = `
      #${VIEW} .ml-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
      #${VIEW} .ml-stat{padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03)}
      #${VIEW} .ml-stat b{display:block;font-size:1.3rem;letter-spacing:-.02em}#${VIEW} .ml-stat span{color:#9ba7b7;font-size:.72rem}
      #${VIEW} .ml-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
      #${VIEW} .ml-bar input,#${VIEW} .ml-bar select,#${VIEW} .ml-set input,#${VIEW} .ml-set select,#${VIEW} textarea{padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;font-size:.8rem}
      #${VIEW} .ml-bar input[type=search]{flex:1 1 200px;min-width:0}
      #${VIEW} .ml-set{padding:14px;border:1px solid rgba(0,240,255,.25);border-radius:14px;background:rgba(0,240,255,.04);margin-bottom:14px}
      #${VIEW} .ml-set h4{margin:0 0 4px;font-size:.9rem}#${VIEW} .ml-set p{margin:0 0 10px;color:#9ba7b7;font-size:.74rem;line-height:1.5}
      #${VIEW} .ml-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
      #${VIEW} .ml-row label{display:flex;flex-direction:column;gap:4px;color:#9ba7b7;font-size:.68rem}
      #${VIEW} .ml-row input[type=number]{width:96px}
      #${VIEW} .ml-card{padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.02);margin-bottom:12px}
      #${VIEW} .ml-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px}
      #${VIEW} .ml-name{font-weight:700;font-size:.92rem}#${VIEW} .ml-meta{color:#7b8797;font-size:.7rem;margin-top:3px}
      #${VIEW} .ml-chips{display:flex;gap:6px;flex-wrap:wrap}
      #${VIEW} .ml-chip{padding:3px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.14);color:#c9d3df;white-space:nowrap}
      #${VIEW} .ml-chip.approved,#${VIEW} .ml-chip.corrected{color:#00ff88;border-color:rgba(0,255,136,.45)}
      #${VIEW} .ml-chip.rejected{color:#ff7a8a;border-color:rgba(255,82,99,.55)}#${VIEW} .ml-chip.pending{color:#ff9f43;border-color:rgba(255,159,67,.5)}
      #${VIEW} .ml-box{padding:12px 14px;border-radius:12px;margin:8px 0;font-size:.84rem;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:#e6edf5}
      #${VIEW} .ml-box small{display:block;font-weight:700;font-size:.66rem;letter-spacing:.8px;text-transform:uppercase;margin-bottom:4px}
      #${VIEW} .ml-q{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}#${VIEW} .ml-q small{color:#9ba7b7}
      #${VIEW} .ml-a{background:rgba(0,240,255,.05);border:1px solid rgba(0,240,255,.2)}#${VIEW} .ml-a small{color:#6cc7ff}
      #${VIEW} .ml-c{background:rgba(0,255,136,.05);border:1px solid rgba(0,255,136,.25)}#${VIEW} .ml-c small{color:#00ff88}
      #${VIEW} .ml-act{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
      #${VIEW} .ml-act button,#${VIEW} .ml-btn{border:0;border-radius:9px;padding:8px 13px;font:700 .76rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.1);color:#fff}
      #${VIEW} .ml-act .go,#${VIEW} .ml-btn.go{background:#00ff88;color:#06100b}#${VIEW} .ml-act .no{background:rgba(255,82,99,.25);color:#ff9aa6}
      #${VIEW} button:disabled{opacity:.5}
      #${VIEW} textarea{width:100%;min-height:90px;resize:vertical;margin-top:8px;box-sizing:border-box}
      #${VIEW} .ml-empty{padding:22px;border:1px dashed rgba(255,255,255,.14);border-radius:14px;color:#9ba7b7;text-align:center;font-size:.82rem;line-height:1.6}
      #${VIEW} .ml-note{padding:12px 14px;border-radius:12px;background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.3);color:#9bffc9;font-size:.78rem;line-height:1.55;margin-bottom:12px;display:none}
      #${VIEW} .ml-note.bad{background:rgba(255,82,99,.08);border-color:rgba(255,82,99,.4);color:#ff9aa6}
      #${VIEW} .ml-pager{display:flex;gap:10px;align-items:center;justify-content:center;margin-top:8px;color:#9ba7b7;font-size:.78rem}
      @media(max-width:900px){#${VIEW} .ml-stats{grid-template-columns:1fr 1fr}}`;
    document.head.appendChild(s);
  }

  /* ---------- data ---------- */
  async function loadList() {
    const d = await rpc("ml_admin_list_examples", { p_client_id: f.client || null, p_label: f.label, p_channel: f.channel || null, p_search: f.q || null, p_limit: PAGE, p_offset: f.offset });
    rows = (d && d.rows) || []; total = (d && d.total) || 0;
  }
  async function loadAll() {
    try {
      const r = await Promise.all([rpc("ml_admin_clients"), rpc("ml_admin_stats"), loadList()]);
      clients = r[0] || []; stats = r[1] || {};
      loaded = true;
      if ($(VIEW) && $(VIEW).classList.contains("active")) render();
    } catch (e) {
      loaded = true;
      render();
      say("Could not load: " + String((e && e.message) || e) + " (admin login required)", true);
    }
  }
  async function reloadList() { try { await loadList(); renderList(); } catch (e) { say(String((e && e.message) || e), true); } }
  function curClient() { return clients.find((c) => c.client_id === f.client) || null; }

  /* ---------- render ---------- */
  function statsHtml() {
    const by = (stats && stats.by_label) || {}, dec = (stats && stats.decisions) || {};
    const good = Object.keys(dec).filter((k) => /\/good$/.test(k)).reduce((a, k) => a + dec[k], 0);
    const bad = Object.keys(dec).filter((k) => /\/bad$/.test(k)).reduce((a, k) => a + dec[k], 0);
    const learned = (by.approved || 0) + (by.corrected || 0);
    return `<div class="ml-stats">
      <div class="ml-stat"><b>${by.pending || 0}</b><span>Waiting for your review</span></div>
      <div class="ml-stat"><b>${learned}</b><span>Approved / corrected (model learns from these)</span></div>
      <div class="ml-stat"><b>${by.rejected || 0}</b><span>Rejected</span></div>
      <div class="ml-stat"><b>${(stats && stats.awaiting_embedding) || 0}</b><span>Waiting to be processed</span></div>
      <div class="ml-stat"><b>${good + bad ? Math.round((good * 100) / (good + bad)) + "%" : "\u2014"}</b><span>Suggestions marked right (${good} right, ${bad} wrong)</span></div></div>`;
  }
  function settingsHtml() {
    const c = curClient();
    if (!c) return `<div class="ml-set"><h4>Auto-reply mode</h4><p>Pick one client above to see or change its mode.</p></div>`;
    return `<div class="ml-set"><h4>${esc(c.business_name)} - auto-reply mode</h4>
      <p>${c.approved} approved/corrected examples. Suggest and Auto need at least 20. Start with Shadow, check the results, then move up.</p>
      <div class="ml-row">
        <label>Mode<select id="mlMode">${Object.keys(MODES).map((k) => `<option value="${k}"${c.mode === k ? " selected" : ""}>${esc(MODES[k])}</option>`).join("")}</select></label>
        <label>Suggest from<input id="mlSug" type="number" step="0.01" min="0.5" max="1" value="${esc(c.suggest_threshold ?? 0.82)}"></label>
        <label>Auto from<input id="mlAuto" type="number" step="0.01" min="0.5" max="1" value="${esc(c.auto_threshold ?? 0.92)}"></label>
        <label>Auto-approve score (0 = off)<input id="mlAap" type="number" step="0.05" min="0" max="1" value="${esc(c.auto_approve_min_score ?? 0)}"></label>
        <button class="ml-btn go" data-act="save-settings">Save mode</button></div>
      <div class="ml-row" style="margin-top:12px">
        <label>Approve all pending with quality at least<input id="mlBulkQ" type="number" step="0.05" min="0" max="1" value="0.8"></label>
        <button class="ml-btn" data-act="bulk">Approve in bulk (max 100)</button></div></div>`;
  }
  const LIVE_TXT = {
    auto: "AUTO - the system would send this reply to the customer by itself",
    suggest: "SUGGEST - the reply would be shown as a suggestion",
    shadow: "SHADOW - the reply would only be logged, nothing is sent",
    blocked: "BLOCKED - sensitive words found (refund / complaint / legal), so it will not answer by itself",
    none: "NO ANSWER - the old AI would answer instead"
  };
  const WHY_TXT = {
    mode_off: "This client's mode is Off.",
    not_enough_examples: "Not enough approved examples yet.",
    low_confidence: "No example is similar enough."
  };
  function testHtml() {
    const c = curClient();
    let out = "";
    if (!c) {
      out = `<p>Pick one client above, then type a customer question to see what the system would answer.</p>`;
    } else {
      out = `<p>Type a question a customer might send to <b>${esc(c.business_name)}</b>. Nothing is saved and nothing is sent to anyone.</p>
        <textarea id="mlTestText" maxlength="500" placeholder="Example: delivery kitne din mein hogi?">${esc(testText)}</textarea>
        <div class="ml-row" style="margin-top:8px"><button class="ml-btn go" data-act="run-test"${testBusy ? " disabled" : ""}>${testBusy ? "Checking..." : "Test this question"}</button></div>`;
      if (testRes && testRes.ok) {
        const r = testRes, best = r.matches && r.matches[0];
        const note = r.awaiting_embedding ? `<p style="color:#ffd98a">${r.awaiting_embedding} approved example(s) are still being processed (up to 15 minutes). They are not included in this test yet.</p>` : "";
        out += `<div class="ml-box ml-a" style="margin-top:12px"><small>Result for this client's current mode (${esc(r.mode)})</small>${esc(LIVE_TXT[r.live] || r.live)}${r.why ? "\n" + esc(WHY_TXT[r.why] || r.why) : ""}
Examples ready: ${r.ready_examples} (need ${r.min_examples}) · Suggest from ${r.thresholds.suggest} · Auto from ${r.thresholds.auto}${r.sensitive ? "\nSensitive words found in this question." : ""}${best ? "\nIf mode were Auto, this score would give: " + r.by_score.toUpperCase() : ""}</div>${note}`;
        out += r.matches && r.matches.length
          ? r.matches.map((m, i) => `<div class="ml-box ${i === 0 ? "ml-c" : "ml-q"}"><small>${i === 0 ? "Best match" : "Match " + (i + 1)} · score ${m.score.toFixed(2)} · ${esc(m.label)}</small>Customer had asked: ${esc(m.customer_text)}\n\nReply it would give:\n${esc(m.reply)}</div>`).join("")
          : `<div class="ml-empty">No similar approved example found for this client.</div>`;
      } else if (testRes && testRes.error) {
        out += `<div class="ml-note bad" style="display:block;margin-top:12px">${esc(testRes.error)}</div>`;
      }
    }
    return `<div class="ml-set" style="border-color:rgba(0,255,136,.3);background:rgba(0,255,136,.04)"><h4>Test the system</h4>${out}</div>`;
  }
  async function runTest(btn) {
    const c = curClient(), t = $("mlTestText");
    if (!c || !t) return;
    testText = t.value.trim();
    if (testText.length < 2) { testRes = { error: "Please type a question first." }; $("mlTest").innerHTML = testHtml(); return; }
    testBusy = true; testRes = null; $("mlTest").innerHTML = testHtml();
    try {
      const cl = client();
      const r = await cl.functions.invoke("ml-admin-test", { body: { client_id: c.client_id, text: testText } });
      if (r.error) {
        let m = String(r.error.message || r.error);
        try { if (r.error.context && r.error.context.json) { const j = await r.error.context.json(); if (j && j.error) m = j.error === "forbidden" ? "Admin login required." : j.error; } } catch (e2) { /* keep m */ }
        throw new Error(m);
      }
      testRes = r.data;
      if (testRes && testRes.ok === false) testRes = { error: String(testRes.error || "Test failed") };
    } catch (e) { testRes = { error: "Test failed: " + String((e && e.message) || e) }; }
    testBusy = false;
    if ($("mlTest")) $("mlTest").innerHTML = testHtml();
  }
  function card(r) {
    const final = r.corrected_reply;
    return `<div class="ml-card" data-id="${esc(r.id)}">
      <div class="ml-top"><div><div class="ml-name">${esc(r.business_name)}</div>
        <div class="ml-meta">${esc(when(r.created_at))} \u00b7 ${esc(CH[r.channel] || r.channel)} \u00b7 quality ${Number(r.quality_score).toFixed(2)}${r.served_count ? " \u00b7 used " + r.served_count + "x" : ""}</div></div>
        <div class="ml-chips"><span class="ml-chip ${esc(r.label)}">${esc(LABELS[r.label] || r.label)}</span></div></div>
      <div class="ml-box ml-q"><small>Customer asked</small>${esc(r.customer_text)}</div>
      <div class="ml-box ml-a"><small>${final ? "Original reply" : "Reply that was sent"}</small>${esc(r.reply_text)}</div>
      ${final ? `<div class="ml-box ml-c"><small>Corrected reply (this is what is learned)</small>${esc(final)}</div>` : ""}
      ${editing === r.id ? `<textarea id="mlCorr" maxlength="1500" placeholder="Write the correct reply here">${esc(final || r.reply_text)}</textarea>` : ""}
      <div class="ml-act">
        ${editing === r.id
          ? '<button class="go" data-act="save-correct">Save corrected reply</button><button data-act="cancel">Cancel</button>'
          : `${r.label !== "approved" && r.label !== "corrected" ? '<button class="go" data-act="approve">Approve</button>' : ""}
             <button data-act="correct">${final ? "Edit correction" : "Correct"}</button>
             ${r.label !== "rejected" ? '<button class="no" data-act="reject">Reject</button>' : ""}
             ${r.label !== "pending" ? '<button data-act="pending">Back to pending</button>' : ""}`}
      </div></div>`;
  }
  function pagerHtml() {
    if (total <= PAGE) return total ? `<div class="ml-pager">${total} item${total > 1 ? "s" : ""}</div>` : "";
    const from = f.offset + 1, to = Math.min(f.offset + PAGE, total);
    return `<div class="ml-pager"><button class="ml-btn" data-page="prev"${f.offset <= 0 ? " disabled" : ""}>&larr; Previous</button><span>${from}-${to} of ${total}</span><button class="ml-btn" data-page="next"${to >= total ? " disabled" : ""}>Next &rarr;</button></div>`;
  }
  function renderList() {
    const l = $("mlList"); if (!l) return;
    l.innerHTML = rows.length ? rows.map(card).join("") + pagerHtml() : `<div class="ml-empty">${loaded ? "Nothing here right now." : "Loading..."}</div>`;
  }
  function render() {
    const v = $(VIEW); if (!v) return;
    v.innerHTML = `<div class="card">
      <div id="mlMsg" class="ml-note"></div>
      ${statsHtml()}
      <div class="ml-bar">
        <select id="mlClient"><option value="">All clients</option>${clients.map((c) => `<option value="${esc(c.client_id)}"${f.client === c.client_id ? " selected" : ""}>${esc(c.business_name)} (${c.pending} pending)</option>`).join("")}</select>
        <select id="mlLabel">${Object.keys(LABELS).map((k) => `<option value="${k}"${f.label === k ? " selected" : ""}>${LABELS[k]}</option>`).join("")}</select>
        <select id="mlChannel"><option value="">All channels</option>${Object.keys(CH).map((k) => `<option value="${k}"${f.channel === k ? " selected" : ""}>${CH[k]}</option>`).join("")}</select>
        <input id="mlSearch" type="search" placeholder="Search text" value="${esc(f.q)}">
        <button class="ml-btn" data-act="refresh" type="button">&#8635; Refresh</button></div>
      <div id="mlSettings">${settingsHtml()}</div>
      <div id="mlTest">${testHtml()}</div>
      <div id="mlList"></div></div>`;
    renderList();
    $("mlSearch").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { f.q = e.target.value; f.offset = 0; reloadList(); }, 350);
    });
  }

  /* ---------- actions ---------- */
  async function review(id, label, corrected, btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await rpc("ml_admin_review_example", { p_id: id, p_label: label, p_corrected: corrected || null });
      if (r && r.ok === false) throw new Error(r.error === "corrected_required" ? "Please write the corrected reply." : r.error);
      editing = null;
      await loadAll(); say("");
    } catch (e) { say("Could not save: " + String((e && e.message) || e), true); if (btn) btn.disabled = false; }
  }
  function num(id, fallback) { const el = $(id); const n = el ? parseFloat(el.value) : NaN; return isNaN(n) ? fallback : n; }
  async function saveSettings(btn) {
    if (!f.client) return;
    btn.disabled = true;
    try {
      const r = await rpc("ml_admin_set_settings", { p_client_id: f.client, p_mode: $("mlMode").value, p_suggest: num("mlSug", null), p_auto: num("mlAuto", null), p_auto_approve_min: num("mlAap", null), p_channels: null });
      if (r && r.ok === false) {
        throw new Error(r.error === "not_enough_approved_examples" ? `Not enough approved examples yet (have ${r.have}, need ${r.need}). Use Shadow mode until then.` : r.error);
      }
      await loadAll(); say("Saved.");
    } catch (e) { say(String((e && e.message) || e), true); }
    btn.disabled = false;
  }
  async function bulk(btn) {
    if (!f.client) return;
    const q = num("mlBulkQ", 0.8);
    if (!window.confirm("Approve up to 100 pending examples with quality " + q + " or higher for this client? Make sure they look correct first.")) return;
    btn.disabled = true;
    try {
      const r = await rpc("ml_admin_bulk_approve", { p_client_id: f.client, p_channel: f.channel || null, p_min_quality: q, p_limit: 100 });
      if (r && r.ok === false) throw new Error(r.error);
      await loadAll(); say(r.approved + " examples approved.");
    } catch (e) { say(String((e && e.message) || e), true); }
    btn.disabled = false;
  }

  function onClick(e) {
    const p = e.target.closest("[data-page]");
    if (p) { f.offset = Math.max(0, f.offset + (p.dataset.page === "next" ? PAGE : -PAGE)); reloadList(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, cardEl = b.closest(".ml-card"), id = cardEl && cardEl.dataset.id;
    if (act === "refresh") { loadAll(); return; }
    if (act === "save-settings") return saveSettings(b);
    if (act === "run-test") return runTest(b);
    if (act === "bulk") return bulk(b);
    if (act === "approve") return review(id, "approved", null, b);
    if (act === "reject") return review(id, "rejected", null, b);
    if (act === "pending") return review(id, "pending", null, b);
    if (act === "correct") { editing = id; renderList(); return; }
    if (act === "cancel") { editing = null; renderList(); return; }
    if (act === "save-correct") { const t = $("mlCorr"); return review(id, "corrected", t ? t.value.trim() : "", b); }
  }
  function onChange(e) {
    const id = e.target.id;
    if (id === "mlClient") { f.client = e.target.value; f.offset = 0; editing = null; $("mlSettings").innerHTML = settingsHtml(); testRes = null; testText = ""; $("mlTest").innerHTML = testHtml(); reloadList(); }
    else if (id === "mlLabel") { f.label = e.target.value; f.offset = 0; reloadList(); }
    else if (id === "mlChannel") { f.channel = e.target.value; f.offset = 0; reloadList(); }
  }

  function open() {
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    $(VIEW).classList.add("active");
    document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x.dataset.view === "ml-learning"));
    const ti = $("title"); if (ti) ti.textContent = "AI Learning";
    render();
    loadAll();
  }

  function create() {
    if ($(VIEW)) return true;
    const main = document.querySelector("#app main"), nav = document.querySelector("#app nav");
    if (!main || !nav) return false;
    css();
    const sec = document.createElement("section"); sec.className = "view"; sec.id = VIEW;
    main.appendChild(sec);
    sec.addEventListener("click", onClick);
    sec.addEventListener("change", onChange);
    const b = document.createElement("button"); b.type = "button"; b.dataset.view = "ml-learning"; b.textContent = "AI Learning";
    nav.insertBefore(b, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    b.addEventListener("click", open);
    return true;
  }

  let tries = 0;
  const t = setInterval(() => { tries++; if (create() || tries > 40) clearInterval(t); }, 800);
})();
