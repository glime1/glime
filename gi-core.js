/* GLIME Business Growth Intelligence — core runtime (v2).
 * Shared by every gi-*.js section module. It owns: the Supabase session, RPC and
 * edge-function calls, section loading/empty/error states, search, date range,
 * the "Ask Anaya" hook, modal, toast.
 * Rules: the client is always resolved on the server from the signed-in session
 * (no client_id is ever sent). Missing data stays missing; nothing is invented. */
(() => {
  "use strict";
  if (window.GI) return;

  const SB_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SB_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const RANGES = {
    "7d": { tab: "7 Days", label: "Last 7 Days", title: "over the last 7 days", cmp: "previous 7 days" },
    "30d": { tab: "30 Days", label: "Last 30 Days", title: "over the last 30 days", cmp: "previous 30 days" },
    "this_month": { tab: "This Month", label: "This Month", title: "so far this month", cmp: "same days last month" }
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNum = v => typeof v === "number" && isFinite(v);
  const num = v => (v === null || v === undefined || v === "" ? null : (isFinite(Number(v)) ? Number(v) : null));
  const sum = a => a.reduce((x, y) => x + y, 0);
  const cnt = n => Math.round(n).toLocaleString("en-IN");
  const dayLabel = iso => { const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z"); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
  const fullLabel = iso => (!iso ? "—" : dayLabel(iso) + " " + String(iso).slice(0, 4));
  const stamp = v => { const d = new Date(v); return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); };
  const clock = v => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); };
  const human = s => String(s || "—").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- icons ---------- */
  const I = (p, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    pulse: I('<path d="M3 12h4l2-6 4 12 2-6h6"/>'), target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
    bars: I('<path d="M5 20V11M12 20V4M19 20v-7"/>'), bolt: I('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    rupee: I('<path d="M6 4h12M6 9h12M9 4c5 0 6 5 0 6l6 9"/>'), cart: I('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 12h11l2-8H6"/>'),
    users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6"/>'),
    userplus: I('<circle cx="10" cy="8" r="3.8"/><path d="M3 20c0-3.8 3.2-6.2 7-6.2s7 2.4 7 6.2M19 8v6M16 11h6"/>'),
    search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 16), refresh: I('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    cal: I('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 15), chev: I('<path d="m9 6 6 6-6 6"/>', 16),
    bulb: I('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>', 20),
    ig: I('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".8" fill="currentColor"/>'),
    wa: I('<path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.5z"/><path d="M9 9c0 3 3 6 6 6l1-1.6-2-1-1 .8c-.8-.4-1.6-1.2-2-2l.8-1-1-2z"/>'),
    mail: I('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>'), spark: I('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
    trend: I('<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>'), flag: I('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    heart: I('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'), clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    compass: I('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'), trophy: I('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 21h8M9 17h6"/>'),
    box: I('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'), news: I('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
    share: I('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>'),
    globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'), plus: I('<path d="M12 5v14M5 12h14"/>', 16),
    send: I('<path d="m4 12 16-8-6 16-2-7z"/>', 17), x: I('<path d="M6 6l12 12M18 6 6 18"/>', 16), phone: I('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>', 22)
  };
  const ANAYA_IMG = "glime-library/anaya-avatar-primary.webp";

  const GI = window.GI = { RANGES, $, $$, esc, isNum, num, sum, cnt, dayLabel, fullLabel, stamp, clock, human, I, IC, ANAYA_IMG, reduceMotion,
    S: { key: "7d", q: "", cur: null, sb: null, session: null }, defs: [], st: {}, ev: {}, cache: {} };

  /* ---------- tiny event bus ---------- */
  GI.on = (e, fn) => { (GI.ev[e] = GI.ev[e] || []).push(fn); };
  GI.emit = (e, a) => (GI.ev[e] || []).forEach(fn => { try { fn(a); } catch (x) { console.error("[GI]", e, x); } });

  /* ---------- money ---------- */
  GI.money = (n, code, compactIt) => {
    if (!isNum(n)) return "—";
    const c = code === undefined ? (GI.S.cur || "INR") : code;
    const sym = c === "INR" ? "₹" : c === "USD" ? "$" : c === "EUR" ? "€" : c ? c + " " : "";
    if (compactIt) {
      const a = Math.abs(n), s = n < 0 ? "-" : "";
      return s + sym + (a >= 1e7 ? (a / 1e7).toFixed(1).replace(/\.0$/, "") + "Cr" : a >= 1e5 ? (a / 1e5).toFixed(1).replace(/\.0$/, "") + "L" : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K" : String(Math.round(a)));
    }
    return sym + Math.round(n).toLocaleString(c === "INR" || !c ? "en-IN" : "en-US");
  };
  GI.pct = (n, d = 0) => (isNum(n) ? (n > 0 ? "+" : "") + n.toFixed(d) + "%" : "—");

  /* ---------- chart helpers (shared by pulse + forecast) ---------- */
  GI.niceStep = raw => { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); return ([1, 2, 2.5, 5, 10].find(m => m * p >= raw) || 10) * p; };
  GI.smooth = pts => {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, k = 0.18;
      d += `C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
    }
    return d;
  };

  /* ---------- Supabase ---------- */
  function client() {
    if (GI.S.sb) return GI.S.sb;
    if (window.supabaseClient) return (GI.S.sb = window.supabaseClient);
    if (window.supabase && window.supabase.createClient) { window.supabaseClient = window.supabase.createClient(SB_URL, SB_KEY); return (GI.S.sb = window.supabaseClient); }
    return null;
  }
  const mkErr = (code, message) => { const e = new Error(message || code); e.code = code; return e; };
  GI.rpc = async (name, args) => {
    const { data, error } = await GI.S.sb.rpc(name, args || {});
    if (error) throw mkErr(error.code, error.message || "Request failed");
    if (typeof data === "string") { try { return JSON.parse(data); } catch { return null; } }
    return data;
  };
  GI.session = async () => {
    try { const r = await GI.S.sb.auth.getSession(); return (r.data && r.data.session) || null; } catch { return null; }
  };
  /* POST to an edge function with the user's JWT. Returns parsed JSON or throws a coded Error. */
  GI.edge = async (fn, body, ms) => {
    const sess = await GI.session();
    if (!sess) throw mkErr("AUTH_REQUIRED");
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms || 60000);
    let res;
    try { res = await fetch(`${SB_URL}/functions/v1/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token }, body: JSON.stringify(body || {}), signal: ctl.signal }); }
    catch (e) { clearTimeout(timer); throw mkErr(e && e.name === "AbortError" ? "TIMEOUT" : "NETWORK"); }
    let data = null; try { data = await res.json(); } catch { data = null; } clearTimeout(timer);
    if (res.status === 401) throw mkErr("AUTH_REQUIRED");
    if (res.status === 404) throw mkErr("FN_MISSING");
    if (res.status === 402 || (data && (data.code === "AI_CREDITS_EXHAUSTED" || data.error_code === "AI_CREDITS_EXHAUSTED"))) throw mkErr("CREDITS");
    if (res.status === 429) throw mkErr("RATE", data && data.error);
    if (!res.ok || !data || data.error) throw mkErr("BACKEND", data && data.error);
    return data;
  };
  GI.src = (key, fn, force) => (!force && GI.cache[key]) || (GI.cache[key] = Promise.resolve().then(fn).catch(e => { delete GI.cache[key]; throw e; }));
  const isMissing = e => !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "FN_MISSING" || /could not find the function|does not exist/i.test(e.message || ""));
  GI.isMissing = isMissing;
  GI.errText = e => {
    const c = e && e.code, m = (e && e.message) || "";
    if (c === "AUTH_REQUIRED" || /AUTH_REQUIRED/.test(m)) return "Please sign in again.";
    if (/CLIENT_NOT_FOUND/.test(m)) return "No client account is linked to this login.";
    if (c === "CREDITS") return "Your AI credits are finished. Add credits in Billing to continue.";
    if (c === "RATE") return "Too many requests. Please try again in a little while.";
    if (c === "NETWORK") return "Network problem. Check your connection and retry.";
    if (c === "TIMEOUT") return "This took too long. Please retry.";
    return "Could not load this section.";
  };

  /* ---------- dialogs / modal / toast ---------- */
  GI.confirm = (m, o) => (window.GLIME_DIALOG ? window.GLIME_DIALOG.confirm(m, o) : Promise.resolve(window.confirm(m)));
  GI.prompt = (m, d, o) => (window.GLIME_DIALOG ? window.GLIME_DIALOG.prompt(m, d, o) : Promise.resolve(window.prompt(m, d)));
  GI.toast = msg => { const t = $("#giToast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(GI.toast.t); GI.toast.t = setTimeout(() => t.classList.remove("show"), 3400); };
  let lastFocus = null;
  GI.modal = (html, o) => {
    const md = $("#giMd"); lastFocus = document.activeElement;
    md.className = "gi-md" + (o && o.wide ? " wide" : "");
    md.innerHTML = `<button class="x" type="button" data-close>Close</button>${html}`;
    $("#giModal").hidden = false; const f = $("input,textarea,select,button:not(.x)", md); if (f) f.focus(); else $(".x", md).focus();
    return md;
  };
  GI.closeModal = () => { const m = $("#giModal"); if (m && !m.hidden) { m.hidden = true; try { lastFocus && lastFocus.focus(); } catch { /* ignore */ } } };

  /* ---------- sections ---------- */
  const byId = {}, seq = {};
  GI.register = def => { GI.defs.push(def); byId[def.id] = def; GI.st[def.id] = { s: "idle" }; };
  GI.def = id => byId[id];
  GI.body = id => $("#gi-body-" + id);
  const subOf = (d, st) => (typeof d.sub === "function" ? d.sub(st) : d.sub || "");
  const askBtn = d => `<button class="gi-ask" type="button" data-ask="${d.id}" aria-label="Ask Anaya about ${esc(d.title)}"><img class="gi-av" src="${ANAYA_IMG}" alt="" width="20" height="20" decoding="async"><span>Ask Anaya</span></button>`;
  const stateBox = (st, d) => {
    if (st.s === "idle" || st.s === "loading") return `<div class="gi-state"><span class="gi-spin"></span>Loading…</div>`;
    if (st.s === "missing") return `<div class="gi-state">This report is being set up and will appear here soon. No numbers are shown until it is ready.${d.rpc ? ` <small class="gi-code">${esc(d.rpc)}</small>` : ""}</div>`;
    if (st.s === "error") return `<div class="gi-state err">${esc(GI.errText(st.error))} <button class="gi-link" type="button" data-retry="${d.id}">Retry</button></div>`;
    return null;
  };
  GI.paint = id => {
    const d = byId[id], st = GI.st[id], el = $("#gi-sec-" + id); if (!el) return;
    const right = d.ctrl && (st.s === "ok" || d.ctrlAlways) ? d.ctrl(st) : "";
    const badge = d.num === "★" ? `<span class="gi-num star">★</span>` : `<span class="gi-num">${d.num}</span>`;
    el.innerHTML = `<div class="gi-sh">${badge}<span class="gi-ico">${d.icon}</span><div class="gi-st"><h2>${d.title}</h2><p>${subOf(d, st)}</p></div><div class="gi-ctrl">${right}${st.s === "ok" && d.ask !== false ? askBtn(d) : ""}</div></div><div class="gi-body" id="gi-body-${id}"></div>`;
    GI.redraw(id);
    if (d.wire && (st.s === "ok" || d.ctrlAlways)) d.wire(el, st);
  };
  GI.redraw = id => {
    const d = byId[id], st = GI.st[id], b = GI.body(id); if (!b) return;
    const box = stateBox(st, d);
    if (box !== null) b.innerHTML = box; else d.render(b, st);
  };
  GI.load = async (id, quiet) => {
    const d = byId[id], my = (seq[id] = (seq[id] || 0) + 1);
    GI.st[id] = { s: "loading", data: (GI.st[id] || {}).data };
    if (!quiet) GI.paint(id);
    try { const data = await d.load(GI.S.key); if (seq[id] !== my) return; GI.st[id] = { s: "ok", data: data == null ? {} : data }; }
    catch (e) { if (seq[id] !== my) return; console.error("[GI]", id, e); GI.st[id] = { s: isMissing(e) ? "missing" : "error", error: e }; }
    GI.paint(id); GI.emit("loaded", id);
  };
  GI.reloadAll = () => { GI.cache = {}; GI.defs.forEach(d => { if (GI.st[d.id].s !== "idle") GI.load(d.id); }); loadHero(true); };
  GI.setRange = key => {
    if (key === GI.S.key || !RANGES[key]) return; GI.S.key = key; GI.S.cur = null;
    const sel = $("#giRange"); if (sel) sel.value = key;
    GI.defs.forEach(d => { if (d.onRange) d.onRange(key); if (d.ranged && GI.st[d.id].s !== "idle") GI.load(d.id); });
  };
  GI.periodLabel = () => { const t = GI.st.pulse && GI.st.pulse.data, r = t && t.meta && t.meta.current_range; return RANGES[GI.S.key].label + (r ? ` (${dayLabel(r.start)} – ${fullLabel(r.end)})` : ""); };
  GI.contextFor = id => { const d = byId[id], st = GI.st[id]; return d && d.context && st.s === "ok" ? d.context(st) : []; };

  /* ---------- hero insight ---------- */
  let insIdx = 0;
  function loadHero(force) {
    const el = $("#giInsightText"); if (!el) return Promise.resolve();
    el.textContent = "Loading insight…";
    return GI.src("insights", () => GI.rpc("get_client_proactive_insights", { p_limit: 10 }), force)
      .then(list => { GI.emit("insights", list); drawHero(list); })
      .catch(() => { el.textContent = "Insights are unavailable right now."; });
  }
  function drawHero(list) {
    const el = $("#giInsightText"); if (!el) return;
    const l = (Array.isArray(list) ? list : []).map(i => i.summary || i.title).filter(Boolean);
    el.textContent = l.length ? l[insIdx % l.length] : "No open insights right now. GLIME will show one when it finds a verified signal.";
  }

  /* ---------- page skeleton + start ---------- */
  function skeleton(root) {
    const defs = GI.defs.slice().sort((a, b) => a.order - b.order);
    let n = 0; defs.forEach(d => { d.num = d.num || ++n; });
    root.innerHTML = `
      <div class="gi-tools">
        <label class="gi-search">${IC.search}<input id="giSearch" type="search" placeholder="Search actions and decisions…" autocomplete="off"><kbd>Ctrl + K</kbd></label>
        <label class="gi-select">${IC.cal}<select id="giRange" aria-label="Date range">${Object.keys(RANGES).map(k => `<option value="${k}">${RANGES[k].label}</option>`).join("")}</select></label>
        <button class="gi-bell" type="button" aria-label="Refresh data" title="Refresh data" id="giRefresh">${IC.refresh}</button>
        <div class="gi-avatar" id="giAvatar" aria-hidden="true">G</div>
      </div>
      <header class="gi-head">
        <div><h1>Business Growth <span>Intelligence</span></h1><p>See what changed, understand why it matters, and know what to do next.</p></div>
        <button class="gi-insight" type="button" id="giInsight" aria-label="Next insight"><span class="bulb">${IC.bulb}</span><span><b>GLIME AI Insight</b><span id="giInsightText">Loading insight…</span></span><span class="nx">${IC.chev}</span></button>
      </header>
      <div class="gi-banner" id="giBanner" role="alert" hidden></div>
      <nav class="gi-jump" id="giJump" aria-label="Jump to a section">${defs.map(d => `<a href="#gi-sec-${d.id}" data-jump="${d.id}">${esc(d.short || d.title)}</a>`).join("")}</nav>
      <div id="giSecs">${defs.map(d => `<section class="gi-sec${d.num === "★" ? " gi-sec-top" : ""}" id="gi-sec-${d.id}" data-sec="${d.id}" aria-label="${esc(d.title)}"></section>`).join("")}</div>
      <div class="gi-toast" id="giToast" role="status" aria-live="polite"></div>
      <div class="gi-modal" id="giModal" hidden><div class="gi-md" id="giMd" role="dialog" aria-modal="true"></div></div>`;
    GI.defs = defs;
  }

  function wireGlobal() {
    $("#giRange").onchange = e => GI.setRange(e.target.value);
    $("#giInsight").onclick = () => { insIdx++; GI.src("insights", () => GI.rpc("get_client_proactive_insights", { p_limit: 10 })).then(drawHero).catch(() => {}); };
    $("#giRefresh").onclick = () => { if (GI.S.sb) { GI.reloadAll(); GI.toast("Refreshing…"); } };
    $("#giSearch").oninput = e => { GI.S.q = e.target.value.trim(); GI.emit("search", GI.S.q); };
    $("#giModal").onclick = e => { if (e.target.id === "giModal") GI.closeModal(); };
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") { e.preventDefault(); $("#giSearch").focus(); }
      if (e.key === "Escape") GI.closeModal();
    });
    document.addEventListener("click", e => {
      const t = e.target.closest && e.target.closest("[data-close],[data-retry],[data-ask],[data-jump]"); if (!t) return;
      if (t.hasAttribute("data-close")) GI.closeModal();
      else if (t.dataset.retry) GI.load(t.dataset.retry);
      else if (t.dataset.ask) { if (GI.askAnaya) GI.askAnaya(t.dataset.ask); else GI.toast("Anaya is not available right now."); }
      else if (t.dataset.jump) {
        e.preventDefault(); const id = t.dataset.jump, el = $("#gi-sec-" + id);
        if (GI.st[id].s === "idle") GI.load(id);
        if (el) el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    });
    /* Anaya photo missing -> sparkle fallback */
    document.addEventListener("error", e => {
      const im = e.target;
      if (im && im.tagName === "IMG" && im.classList.contains("gi-av")) { const s = document.createElement("i"); s.className = "gi-av-fb"; s.textContent = "✦"; im.replaceWith(s); }
    }, true);
    /* highlight the section chip that is on screen */
    let tick = false;
    addEventListener("scroll", () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => {
        tick = false; let cur = GI.defs[0] && GI.defs[0].id;
        GI.defs.forEach(d => { const el = $("#gi-sec-" + d.id); if (el && el.getBoundingClientRect().top < 150) cur = d.id; });
        $$("#giJump a").forEach(a => a.classList.toggle("on", a.dataset.jump === cur));
      });
    }, { passive: true });
  }

  function banner(msg) { const b = $("#giBanner"); b.textContent = msg; b.hidden = !msg; }

  async function start() {
    const root = $("#giRoot"); if (!root) return;
    skeleton(root); wireGlobal();
    GI.defs.forEach(d => GI.paint(d.id));
    if (!client()) { banner("Could not connect to GLIME. Please refresh the page."); return; }
    const sess = await GI.session(); GI.S.session = sess;
    if (!sess) {
      banner("Please sign in to see your Business Growth Intelligence.");
      $("#giInsightText").textContent = "Sign in to see your insights.";
      GI.defs.forEach(d => { const b = GI.body(d.id); if (b) b.innerHTML = `<div class="gi-state">Sign in required. <a class="gi-link" href="login.html">Sign in</a></div>`; });
      return;
    }
    const em = (sess.user && sess.user.email) || ""; if (em) $("#giAvatar").textContent = em[0].toUpperCase();
    const lazy = GI.defs.filter(d => d.lazy);
    GI.defs.filter(d => !d.lazy).forEach(d => GI.load(d.id));
    loadHero(false);
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); if (GI.st[en.target.dataset.sec].s === "idle") GI.load(en.target.dataset.sec); } }), { rootMargin: "500px 0px" });
      lazy.forEach(d => io.observe($("#gi-sec-" + d.id)));
    } else lazy.forEach(d => GI.load(d.id));
  }
  /* modules are plain scripts placed after this one, so they have all registered by DOMContentLoaded */
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start, { once: true }) : setTimeout(start, 0);
})();
