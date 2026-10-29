/* =========================================================
   GLIME ADMIN - Feedback inbox
   Adds a "Feedback" tab to the admin sidebar. Everything clients
   send from the in-app Feedback form (glime-app-shell.js) lands
   here, split by type: Problem, Idea, Question, Praise, Other.
   The admin sees which client sent it (business, client id,
   contact), the rating, the page it was sent from and the device,
   and can reply, add a note and move it to resolved.
   Reads : rpc admin_feedback_list (fallback: table client_feedback)
   Writes: rpc admin_feedback_set_status (fallback: table update)
   See ADMIN_FEEDBACK_BACKEND_SPEC.md
========================================================= */
(() => {
  "use strict";
  const URL_ = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const VIEW = "view-feedback";
  const TYPES = [
    { k: "all", name: "All", hint: "Everything clients sent" },
    { k: "bug", name: "Problems", hint: "Something is not working" },
    { k: "idea", name: "Ideas", hint: "Feature requests" },
    { k: "question", name: "Questions", hint: "Clients asking for help" },
    { k: "praise", name: "Praise", hint: "What is working well" },
    { k: "other", name: "Other", hint: "Anything else" }
  ];
  const TYPE_LABEL = { bug: "Problem", idea: "Idea", question: "Question", praise: "Praise", other: "Other" };
  const STATUS_LABEL = { new: "New", in_progress: "In progress", resolved: "Resolved", closed: "Closed" };
  const TODO = {
    bug: "Open the client in Clients and try to reproduce it on the page they named. Check Audit Logs for errors, then reply with a fix or a workaround.",
    idea: "Note the request and how many clients ask for the same thing. Reply to say it is noted, and mark it resolved once decided.",
    question: "Answer the question directly. If many clients ask the same thing, add it to the Help Center.",
    praise: "Thank them. If they agree, this can become a testimonial or a case study.",
    other: "Read the message and reply to find out more."
  };

  let sb = null, rows = [], tab = "all", statusF = "open", lowOnly = false, query = "", missing = false, timer = null, loaded = false;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (v) => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); };
  function client() {
    if (sb) return sb;
    if (window.supabaseClient && window.supabaseClient.rpc) return (sb = window.supabaseClient);
    if (window.supabase && typeof window.supabase.createClient === "function") sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return sb;
  }

  /* ---------- one row -> what the screen needs ---------- */
  function parse(r) {
    let meta = r.metadata;
    if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
    meta = meta && typeof meta === "object" ? meta : {};
    const status = String(r.status || "new").toLowerCase().replace(/\s+/g, "_");
    const type = TYPE_LABEL[r.type] ? r.type : "other";
    const rating = Number(r.rating) || 0;
    const ref = r.reference || (r.ref_no ? "FB-" + String(r.ref_no).padStart(6, "0") : "");
    return { r, meta, status, type, rating, ref, who: r.business_name || r.client_name || r.client_id || "Unknown client" };
  }
  const isOpen = (p) => p.status === "new" || p.status === "in_progress";

  /* ---------- styles ---------- */
  function css() {
    if ($("gfStyle")) return;
    const s = document.createElement("style"); s.id = "gfStyle";
    s.textContent = `
      #${VIEW} .gf-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      #${VIEW} .gf-stat{padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03)}
      #${VIEW} .gf-stat b{display:block;font-size:1.35rem;letter-spacing:-.02em}#${VIEW} .gf-stat span{color:#9ba7b7;font-size:.72rem}
      #${VIEW} .gf-tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:14px}
      #${VIEW} .gf-tab{text-align:left;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#fff;cursor:pointer;font:inherit}
      #${VIEW} .gf-tab.on{border-color:#00f0ff;background:rgba(0,240,255,.08);box-shadow:0 0 0 1px rgba(0,240,255,.3)}
      #${VIEW} .gf-tab b{display:block;font-size:.88rem}#${VIEW} .gf-tab small{display:block;color:#9ba7b7;font-size:.66rem;margin-top:3px}
      #${VIEW} .gf-n{float:right;min-width:22px;text-align:center;padding:2px 7px;border-radius:999px;background:#ff5263;color:#fff;font-size:.68rem;font-weight:700}
      #${VIEW} .gf-n.zero{background:rgba(255,255,255,.1);color:#9ba7b7}
      #${VIEW} .gf-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
      #${VIEW} .gf-bar input[type=search],#${VIEW} .gf-bar select{padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit}
      #${VIEW} .gf-bar input[type=search]{flex:1 1 200px;min-width:0}
      #${VIEW} .gf-bar label{display:flex;gap:6px;align-items:center;color:#c9d3df;font-size:.78rem}
      #${VIEW} .gf-card{padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.02);margin-bottom:12px}
      #${VIEW} .gf-card.bug{border-color:rgba(255,82,99,.45);background:rgba(255,82,99,.04)}
      #${VIEW} .gf-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px}
      #${VIEW} .gf-name{font-weight:700;font-size:.95rem}#${VIEW} .gf-meta{color:#7b8797;font-size:.7rem;margin-top:3px}
      #${VIEW} .gf-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      #${VIEW} .gf-chip{padding:3px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.14);color:#c9d3df;white-space:nowrap}
      #${VIEW} .gf-chip.new{color:#ff9f43;border-color:rgba(255,159,67,.5)}#${VIEW} .gf-chip.in_progress{color:#6cc7ff;border-color:rgba(108,199,255,.5)}
      #${VIEW} .gf-chip.resolved{color:#00ff88;border-color:rgba(0,255,136,.45)}
      #${VIEW} .gf-chip.t-bug{color:#ff7a8a;border-color:rgba(255,82,99,.55)}#${VIEW} .gf-chip.t-idea{color:#ffc857;border-color:rgba(255,200,87,.5)}
      #${VIEW} .gf-chip.t-praise{color:#00ff88;border-color:rgba(0,255,136,.45)}
      #${VIEW} .gf-chip.code{font-family:ui-monospace,Menlo,monospace;letter-spacing:1px;color:#00f0ff;border-color:rgba(0,240,255,.4);cursor:pointer}
      #${VIEW} .gf-stars{color:#ffc83d;letter-spacing:1px;font-size:.85rem}#${VIEW} .gf-stars i{color:#46546a;font-style:normal}
      #${VIEW} .gf-ask{padding:12px 14px;border-radius:12px;background:rgba(0,240,255,.05);border:1px solid rgba(0,240,255,.2);margin:10px 0}
      #${VIEW} .gf-ask small{display:block;color:#6cc7ff;font-weight:700;font-size:.68rem;letter-spacing:.8px;text-transform:uppercase;margin-bottom:4px}
      #${VIEW} .gf-ask.todo{background:rgba(0,255,136,.05);border-color:rgba(0,255,136,.22);font-size:.8rem;line-height:1.55}#${VIEW} .gf-ask.todo small{color:#00ff88}
      #${VIEW} .gf-msg{white-space:pre-wrap;word-break:break-word;font-size:.84rem;line-height:1.6;color:#e6edf5}
      #${VIEW} dl{display:grid;grid-template-columns:120px 1fr;gap:5px 10px;font-size:.76rem;margin:10px 0}
      #${VIEW} dt{color:#7b8797}#${VIEW} dd{margin:0;color:#dfe7ef;word-break:break-word}#${VIEW} dd a{color:#00f0ff}
      #${VIEW} .gf-act{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
      #${VIEW} .gf-act button,#${VIEW} .gf-act a{border:0;border-radius:9px;padding:8px 13px;font:700 .76rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.1);color:#fff;text-decoration:none}
      #${VIEW} .gf-act .wa{background:#25d366;color:#04200f}#${VIEW} .gf-act .go{background:#00ff88;color:#06100b}
      #${VIEW} .gf-act button:disabled{opacity:.5}
      #${VIEW} .gf-act input{flex:1 1 200px;min-width:0;padding:8px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;font-size:.76rem}
      #${VIEW} .gf-empty{padding:22px;border:1px dashed rgba(255,255,255,.14);border-radius:14px;color:#9ba7b7;text-align:center;font-size:.82rem;line-height:1.6}
      #${VIEW} .gf-note{padding:12px 14px;border-radius:12px;background:rgba(255,200,87,.07);border:1px solid rgba(255,200,87,.35);color:#ffd98a;font-size:.78rem;line-height:1.55;margin-bottom:12px}
      .gf-badge{margin-left:8px;padding:1px 7px;border-radius:999px;background:#ff5263;color:#fff;font-size:.66rem;font-weight:700}
      @media(max-width:900px){#${VIEW} .gf-tabs{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:760px){#${VIEW} .gf-stats{grid-template-columns:1fr 1fr}#${VIEW} .gf-tabs{grid-template-columns:1fr 1fr}#${VIEW} dl{grid-template-columns:96px 1fr}}`;
    document.head.appendChild(s);
  }

  /* ---------- data ---------- */
  async function load() {
    const c = client(); if (!c) return;
    let data = null;
    try {
      const r = await c.rpc("admin_feedback_list", { p_type: null, p_status: null, p_search: null, p_limit: 300 });
      if (r.error) throw r.error;
      data = Array.isArray(r.data) ? r.data : [];
      missing = false;
    } catch (e) {
      try {
        const r = await c.from("client_feedback").select("*").order("created_at", { ascending: false }).limit(300);
        if (r.error) throw r.error;
        data = r.data || [];
      } catch (e2) { data = []; }
      missing = !data.length;
    }
    rows = data.map(parse);
    loaded = true;
    badge();
    if ($(VIEW) && $(VIEW).classList.contains("active")) render();
  }
  function badge() {
    const n = rows.filter((p) => p.status === "new").length;
    const b = document.querySelector('nav button[data-view="feedback"]'); if (!b) return;
    let el = b.querySelector(".gf-badge");
    if (!n) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("span"); el.className = "gf-badge"; b.appendChild(el); }
    el.textContent = n;
  }

  /* ---------- render ---------- */
  function counts(k) { const l = rows.filter((p) => k === "all" || p.type === k); return { all: l.length, fresh: l.filter((p) => p.status === "new").length }; }
  function visible() {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (tab !== "all" && p.type !== tab) return false;
      if (statusF === "open" ? !isOpen(p) : statusF !== "all" && p.status !== statusF) return false;
      if (lowOnly && !(p.rating && p.rating <= 2)) return false;
      if (!q) return true;
      return [p.who, p.r.client_id, p.r.client_name, p.r.client_email, p.r.client_phone, p.ref, p.r.message, p.r.page].join(" ").toLowerCase().indexOf(q) > -1;
    }).sort((a, b) => ((b.type === "bug" && b.status === "new") - (a.type === "bug" && a.status === "new")) || new Date(b.r.created_at) - new Date(a.r.created_at));
  }
  function stars(n) { return n ? `<span class="gf-stars" title="${n} out of 5">${"\u2605".repeat(n)}<i>${"\u2605".repeat(5 - n)}</i></span>` : ""; }
  function waLink(p) {
    const phone = String(p.r.client_phone || "").replace(/\D/g, "");
    if (!phone) return "";
    const num = phone.length === 10 ? "91" + phone : phone;
    const text = "Hi " + (p.r.client_name || "") + ", this is the GLIME team about your feedback " + (p.ref ? "(" + p.ref + ")" : "") + ".";
    return "https://wa.me/" + num + "?text=" + encodeURIComponent(text);
  }
  function device(p) {
    const m = p.meta, bits = [];
    if (m.viewport) bits.push(m.viewport);
    if (m.theme) bits.push(m.theme + " theme");
    if (m.language) bits.push(m.language);
    if (m.app_version) bits.push("v" + m.app_version);
    if (m.queued) bits.push("sent later (was offline)");
    const ua = String(m.user_agent || "");
    const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
    const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "";
    if (br || os) bits.unshift([br, os].filter(Boolean).join(" on "));
    return bits.join(" \u00b7 ") || "\u2014";
  }
  function card(p) {
    const r = p.r, st = p.status;
    const wa = waLink(p);
    const contactBits = [r.client_name && esc(r.client_name), r.client_email && `<a href="mailto:${esc(r.client_email)}">${esc(r.client_email)}</a>`, r.client_phone && `<a href="tel:${esc(r.client_phone)}">${esc(r.client_phone)}</a>`].filter(Boolean).join(" \u00b7 ");
    return `<div class="gf-card${p.type === "bug" ? " bug" : ""}" data-id="${esc(r.id)}">
      <div class="gf-top"><div><div class="gf-name">${esc(p.who)}${r.client_name && r.business_name ? ` <span style="color:#7b8797;font-weight:500">\u00b7 ${esc(r.client_name)}</span>` : ""}</div>
        <div class="gf-meta">${esc(when(r.created_at))}${p.ref ? " \u00b7 " + esc(p.ref) : ""}</div></div>
        <div class="gf-chips">${stars(p.rating)}<span class="gf-chip t-${esc(p.type)}">${esc(TYPE_LABEL[p.type])}</span>${r.client_id ? `<span class="gf-chip code" data-copy="${esc(r.client_id)}" title="Tap to copy client ID">${esc(r.client_id)}</span>` : ""}<span class="gf-chip ${esc(st)}">${esc(STATUS_LABEL[st] || st)}</span></div></div>
      <div class="gf-ask"><small>What they wrote</small><div class="gf-msg">${esc(r.message)}</div></div>
      <div class="gf-ask todo"><small>What to do</small>${esc(TODO[p.type])}</div>
      <dl><dt>Client</dt><dd>${esc(p.who)}${r.client_id ? " \u00b7 " + esc(r.client_id) : ""}</dd>
        <dt>Contact</dt><dd>${contactBits || "\u2014"}${r.can_contact === false ? ' \u00b7 <b>asked not to be contacted</b>' : r.can_contact ? " \u00b7 OK to contact" : ""}</dd>
        <dt>Sent from</dt><dd>${esc(r.page || "\u2014")}${r.page_url ? ` \u00b7 <a href="${esc(r.page_url)}" target="_blank" rel="noopener noreferrer">open page</a>` : ""}</dd>
        <dt>Device</dt><dd>${esc(device(p))}</dd>
        ${r.resolved_at ? `<dt>Resolved</dt><dd>${esc(when(r.resolved_at))}${r.resolved_by ? " by " + esc(r.resolved_by) : ""}</dd>` : ""}</dl>
      <div class="gf-act">
        ${wa && r.can_contact !== false ? `<a class="wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">Reply on WhatsApp</a>` : ""}
        ${r.client_email && r.can_contact !== false ? `<a href="mailto:${esc(r.client_email)}?subject=${encodeURIComponent("GLIME: your feedback " + (p.ref || ""))}">Email</a>` : ""}
        ${st === "new" ? '<button data-st="in_progress">Start working</button>' : ""}
        ${st !== "resolved" && st !== "closed" ? '<button class="go" data-st="resolved">Mark resolved</button><button data-st="closed">Close</button>' : '<button data-st="new">Reopen</button>'}
      </div>
      <div class="gf-act"><input type="text" data-note placeholder="Private admin note (only admins see this)" value="${esc(r.admin_notes || "")}" maxlength="500"><button data-st="${esc(st)}" data-savenote>Save note</button></div></div>`;
  }
  function render() {
    const v = $(VIEW); if (!v) return;
    const list = visible();
    const rated = rows.filter((p) => p.rating);
    const avg = rated.length ? (rated.reduce((a, p) => a + p.rating, 0) / rated.length).toFixed(1) : "\u2014";
    const openBugs = rows.filter((p) => p.type === "bug" && isOpen(p)).length;
    v.innerHTML = `<div class="card">
      ${missing ? `<div class="gf-note">No feedback is visible yet. If clients have sent some, the admin read access (RPC <b>admin_feedback_list</b> or a read policy on <b>client_feedback</b>) is not set up. See ADMIN_FEEDBACK_BACKEND_SPEC.md.</div>` : ""}
      <div class="gf-stats"><div class="gf-stat"><b>${rows.length}</b><span>Total feedback</span></div><div class="gf-stat"><b>${rows.filter((p) => p.status === "new").length}</b><span>New, not yet read</span></div><div class="gf-stat"><b>${openBugs}</b><span>Open problems</span></div><div class="gf-stat"><b>${avg}${rated.length ? " \u2605" : ""}</b><span>Average rating (${rated.length})</span></div></div>
      <div class="gf-tabs">${TYPES.map((k) => { const c = counts(k.k); return `<button type="button" class="gf-tab${tab === k.k ? " on" : ""}" data-tab="${k.k}"><span class="gf-n${c.fresh ? "" : " zero"}">${c.fresh}</span><b>${k.name}</b><small>${c.all} total</small></button>`; }).join("")}</div>
      <div class="gf-bar"><input id="gfSearch" type="search" placeholder="Search client, client ID, reference or message" value="${esc(query)}">
        <select id="gfStatus"><option value="open"${statusF === "open" ? " selected" : ""}>Open (New + In progress)</option>${[["all", "All"], ["new", "New"], ["in_progress", "In progress"], ["resolved", "Resolved"], ["closed", "Closed"]].map((s) => `<option value="${s[0]}"${statusF === s[0] ? " selected" : ""}>${s[1]}</option>`).join("")}</select>
        <label><input type="checkbox" id="gfLow"${lowOnly ? " checked" : ""}> Low ratings only (1-2)</label>
        <button class="btn" id="gfRefresh" type="button">&#8635; Refresh</button></div>
      <div id="gfList">${list.length ? list.map(card).join("") : `<div class="gf-empty">${loaded ? "No feedback here right now." : "Loading..."}</div>`}</div></div>`;
    $("gfSearch").addEventListener("input", (e) => { query = e.target.value; renderList(); });
  }
  function renderList() { const l = $("gfList"); if (!l) return; const list = visible(); l.innerHTML = list.length ? list.map(card).join("") : `<div class="gf-empty">No feedback here right now.</div>`; }

  /* ---------- actions ---------- */
  async function setStatus(id, status, btn, note) {
    const c = client(); if (!c) return;
    btn.disabled = true;
    try {
      let r = await c.rpc("admin_feedback_set_status", { p_id: id, p_status: status, p_note: note });
      if (r.error && /function|schema cache|PGRST202|42883/i.test(String(r.error.message) + String(r.error.code))) {
        const patch = { status, updated_at: new Date().toISOString() };
        if (note !== null) patch.admin_notes = note;
        if (status === "resolved" || status === "closed") patch.resolved_at = new Date().toISOString();
        else { patch.resolved_at = null; patch.resolved_by = null; }
        r = await c.from("client_feedback").update(patch).eq("id", id);
      }
      if (r.error) throw r.error;
      await load(); render();
    } catch (e) { window.alert("Could not update: " + String((e && e.message) || e)); btn.disabled = false; }
  }

  function onClick(e) {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; render(); return; }
    const cp = e.target.closest("[data-copy]");
    if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy); const o = cp.textContent; cp.textContent = "Copied"; setTimeout(() => (cp.textContent = o), 1200); return; }
    const s = e.target.closest("[data-st]");
    if (s) {
      const card = s.closest(".gf-card");
      const inp = card.querySelector("[data-note]");
      const typed = inp ? inp.value.trim() : "";
      const old = (rows.find((p) => String(p.r.id) === card.dataset.id) || { r: {} }).r.admin_notes || "";
      setStatus(card.dataset.id, s.dataset.st, s, typed !== old || s.hasAttribute("data-savenote") ? typed : null);
      return;
    }
    if (e.target.id === "gfRefresh") { load().then(render); }
  }

  function open() {
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    $(VIEW).classList.add("active");
    document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x.dataset.view === "feedback"));
    const ti = $("title"); if (ti) ti.textContent = "Feedback";
    render();
    load().then(render);
    clearInterval(timer);
    timer = setInterval(() => { if ($(VIEW).classList.contains("active")) load(); else clearInterval(timer); }, 60000);
  }

  function create() {
    if ($(VIEW)) return true;
    const main = document.querySelector("#app main"), nav = document.querySelector("#app nav");
    if (!main || !nav) return false;
    css();
    const sec = document.createElement("section"); sec.className = "view"; sec.id = VIEW;
    main.appendChild(sec);
    sec.addEventListener("click", onClick);
    sec.addEventListener("change", (e) => {
      if (e.target.id === "gfStatus") { statusF = e.target.value; renderList(); }
      else if (e.target.id === "gfLow") { lowOnly = e.target.checked; renderList(); }
    });
    const b = document.createElement("button"); b.type = "button"; b.dataset.view = "feedback"; b.textContent = "Feedback";
    nav.insertBefore(b, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    b.addEventListener("click", open);
    load();
    return true;
  }

  let tries = 0;
  const t = setInterval(() => { tries++; if (create() || tries > 40) clearInterval(t); }, 800);
})();
