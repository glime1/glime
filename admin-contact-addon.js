/* =========================================================
   GLIME ADMIN - Contact inbox
   Adds a "Contact" tab to the admin sidebar. Everything sent from
   contact.html lands here, split into four boxes:
   Agency, Partner, GLIME client and New project.
   For each message the admin sees what the person asks, how urgent
   it is, and what to do next, with one-tap reply buttons.
   Reads : rpc admin_contact_list (fallback: table contact_leads)
   Writes: rpc admin_contact_set_status (fallback: table update)
   See ADMIN_CONTACT_BACKEND_SPEC.md
========================================================= */
(() => {
  "use strict";
  const URL_ = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const VIEW = "view-contact";
  const KINDS = [
    { k: "agency", name: "Agency", hint: "From Agency Program members" },
    { k: "partner", name: "Partner", hint: "From Referral Partners" },
    { k: "support", name: "GLIME client", hint: "Existing clients needing help" },
    { k: "business", name: "New project", hint: "New customers and inquiries" }
  ];
  const TAGS = { "NEW INQUIRY": "business", "CLIENT SUPPORT": "support", "AGENCY": "agency", "PARTNER": "partner" };
  const STATUSES = ["New", "In progress", "Resolved", "Closed"];

  /* What to do, by request type and topic */
  const TODO = {
    agency: {
      "Wallet or top-up": "Open the Agency tab, find the agency by code, check the payment reference, then use Credit wallet if the money is received.",
      "Add or set up a client": "Check the agency wallet balance and daily limit in the Agency tab. Help add the client or share the client setup link.",
      "Plan, pricing or margin": "Check the agency tier and wholesale prices in the Agency tab, then explain the margin on WhatsApp.",
      "Billing or GST invoice": "Find the invoice for this agency and send the PDF. Fix the GST details if they are wrong.",
      "Application or documents": "Open the Agency tab and review the application. Use Documents to ask for PAN, MSME or any other document.",
      "Team access": "Check the team members for this agency and confirm the role they need.",
      "Technical issue": "Ask for a screenshot, note the client ID if given, and check the Audit Logs for errors.",
      "Something else": "Read the message, call the agency owner if it is unclear."
    },
    partner: {
      "Commission or payout": "Check the partner payouts and the 30 day hold. Confirm the payout date and any failed payout.",
      "Referral not tracked": "Ask for the customer email and sign-up date, then check the referral records for that partner.",
      "Referral link or code": "Confirm the partner code and send the correct referral link.",
      "Tier or rewards": "Check the partner customer count and tier, then explain the next tier.",
      "Dashboard issue": "Ask for a screenshot and the browser used. Check that the partner account is active.",
      "Something else": "Read the message, call the partner if it is unclear."
    },
    support: {
      "WhatsApp connection": "Open the client in Clients and check the WhatsApp connector status. Guide them through reconnecting.",
      "Instagram connection": "Open the client in Clients and check the Instagram connector. Guide them through reconnecting.",
      "AI replies or Knowledge Base": "Check the client AI settings and Knowledge Base entries, then test a reply.",
      "Billing or plan": "Open Billing for this client and check the plan, payments and credits.",
      "Leads or orders": "Check the client leads and orders, and look for sync errors in Audit Logs.",
      "Account or login": "Check the account status in Clients. Confirm the login email and help reset access.",
      "Something else": "Read the message and reply to find out more."
    },
    business: {
      "WhatsApp automation": "Call within 24 hours. Suggest the right package and send a demo.",
      "Instagram automation": "Call within 24 hours. Suggest the right package and send a demo.",
      "Website or landing page": "Ask for examples they like and share a quote.",
      "Custom software": "Set up a short call to understand the scope, then send a quote.",
      "AI voice agent": "Share the Voice AI demo and ask about call volume.",
      "Something else": "Read the message and call to understand the need."
    }
  };

  let sb = null, rows = [], tab = "agency", statusF = "open", urgentOnly = false, query = "", missing = false, timer = null, loaded = false;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (v) => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); };
  function client() {
    if (sb) return sb;
    if (window.supabaseClient && window.supabaseClient.rpc) return (sb = window.supabaseClient);
    if (window.supabase && typeof window.supabase.createClient === "function") sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return sb;
  }

  /* ---------- classify one row (works for old rows too) ---------- */
  function parse(r) {
    const msg = String(r.message || "");
    const first = msg.split("\n")[0] || "";
    const tag = (first.match(/^\[([A-Z ]+)\]/) || [])[1];
    const pick = (label) => { const m = first.match(new RegExp(label + ":\\s*([^|]+)")); return m ? m[1].trim() : ""; };
    const kind = r.inquiry_type || TAGS[tag] || "business";
    const hasHeader = !!tag;
    const parts = hasHeader ? msg.split("\n\n") : [msg];
    const body = hasHeader ? parts.slice(1).join("\n\n") || msg : msg;
    const prefers = hasHeader ? ((msg.split("\n")[1] || "").replace(/^Prefers:\s*/, "")) : "";
    return {
      r, kind,
      code: r.support_code || pick("Agency code") || pick("Partner code"),
      topic: r.topic || pick("Topic"),
      priority: r.priority || pick("Priority") || "Normal",
      ref: r.reference_id || pick("Ref"),
      clientRef: r.client_ref || "",
      prefers: r.contact_pref || prefers,
      budget: r.budget || pick("Budget"),
      body
    };
  }

  /* ---------- styles ---------- */
  function css() {
    if ($("gcStyle")) return;
    const s = document.createElement("style"); s.id = "gcStyle";
    s.textContent = `
      #${VIEW} .gc-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      #${VIEW} .gc-tab{text-align:left;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#fff;cursor:pointer;font:inherit}
      #${VIEW} .gc-tab.on{border-color:#00f0ff;background:rgba(0,240,255,.08);box-shadow:0 0 0 1px rgba(0,240,255,.3)}
      #${VIEW} .gc-tab b{display:block;font-size:.92rem}#${VIEW} .gc-tab small{display:block;color:#9ba7b7;font-size:.7rem;margin-top:3px}
      #${VIEW} .gc-n{float:right;min-width:24px;text-align:center;padding:2px 8px;border-radius:999px;background:#ff5263;color:#fff;font-size:.7rem;font-weight:700}
      #${VIEW} .gc-n.zero{background:rgba(255,255,255,.1);color:#9ba7b7}
      #${VIEW} .gc-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
      #${VIEW} .gc-bar input,#${VIEW} .gc-bar select{padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit}
      #${VIEW} .gc-bar input{flex:1 1 200px;min-width:0}
      #${VIEW} .gc-bar label{display:flex;gap:6px;align-items:center;color:#c9d3df;font-size:.78rem}
      #${VIEW} .gc-card{padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.02);margin-bottom:12px}
      #${VIEW} .gc-card.urgent{border-color:rgba(255,200,87,.55);background:rgba(255,200,87,.04)}
      #${VIEW} .gc-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;margin-bottom:10px}
      #${VIEW} .gc-name{font-weight:700;font-size:.95rem}#${VIEW} .gc-meta{color:#7b8797;font-size:.7rem;margin-top:3px}
      #${VIEW} .gc-chips{display:flex;gap:6px;flex-wrap:wrap}
      #${VIEW} .gc-chip{padding:3px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.14);color:#c9d3df;white-space:nowrap}
      #${VIEW} .gc-chip.New{color:#ff9f43;border-color:rgba(255,159,67,.5)}#${VIEW} .gc-chip.In{color:#6cc7ff;border-color:rgba(108,199,255,.5)}
      #${VIEW} .gc-chip.Resolved{color:#00ff88;border-color:rgba(0,255,136,.45)}#${VIEW} .gc-chip.Urgent{color:#ffc857;border-color:rgba(255,200,87,.6);background:rgba(255,200,87,.08)}
      #${VIEW} .gc-chip.code{font-family:ui-monospace,Menlo,monospace;letter-spacing:1px;color:#00f0ff;border-color:rgba(0,240,255,.4);cursor:pointer}
      #${VIEW} .gc-ask{padding:12px 14px;border-radius:12px;background:rgba(0,240,255,.05);border:1px solid rgba(0,240,255,.2);margin:10px 0}
      #${VIEW} .gc-ask small{display:block;color:#6cc7ff;font-weight:700;font-size:.68rem;letter-spacing:.8px;text-transform:uppercase;margin-bottom:4px}
      #${VIEW} .gc-ask.todo{background:rgba(0,255,136,.05);border-color:rgba(0,255,136,.22)}#${VIEW} .gc-ask.todo small{color:#00ff88}
      #${VIEW} .gc-msg{white-space:pre-wrap;word-break:break-word;font-size:.82rem;line-height:1.55;color:#e6edf5}
      #${VIEW} dl{display:grid;grid-template-columns:120px 1fr;gap:5px 10px;font-size:.76rem;margin:10px 0}
      #${VIEW} dt{color:#7b8797}#${VIEW} dd{margin:0;color:#dfe7ef;word-break:break-word}#${VIEW} dd a{color:#00f0ff}
      #${VIEW} .gc-act{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
      #${VIEW} .gc-act button,#${VIEW} .gc-act a{border:0;border-radius:9px;padding:8px 13px;font:700 .76rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.1);color:#fff;text-decoration:none}
      #${VIEW} .gc-act .wa{background:#25d366;color:#04200f}#${VIEW} .gc-act .go{background:#00ff88;color:#06100b}
      #${VIEW} .gc-act button:disabled{opacity:.5}
      #${VIEW} .gc-act input{flex:1 1 180px;min-width:0;padding:8px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;font-size:.76rem}
      #${VIEW} .gc-empty{padding:22px;border:1px dashed rgba(255,255,255,.14);border-radius:14px;color:#9ba7b7;text-align:center;font-size:.82rem;line-height:1.6}
      #${VIEW} .gc-note{padding:12px 14px;border-radius:12px;background:rgba(255,200,87,.07);border:1px solid rgba(255,200,87,.35);color:#ffd98a;font-size:.78rem;line-height:1.55;margin-bottom:12px}
      .gc-badge{margin-left:8px;padding:1px 7px;border-radius:999px;background:#ff5263;color:#fff;font-size:.66rem;font-weight:700}
      @media(max-width:760px){#${VIEW} .gc-tabs{grid-template-columns:1fr 1fr}#${VIEW} dl{grid-template-columns:96px 1fr}}`;
    document.head.appendChild(s);
  }

  /* ---------- data ---------- */
  async function load() {
    const c = client(); if (!c) return;
    let data = null, usedFallback = false;
    try {
      const r = await c.rpc("admin_contact_list", { p_type: null, p_status: null, p_search: null, p_limit: 300 });
      if (r.error) throw r.error;
      data = Array.isArray(r.data) ? r.data : [];
      missing = false;
    } catch (e) {
      usedFallback = true;
      try {
        const r = await c.from("contact_leads").select("*").order("created_at", { ascending: false }).limit(300);
        if (r.error) throw r.error;
        data = r.data || [];
      } catch (e2) { data = []; }
      missing = !data.length;
    }
    rows = data.map(parse);
    loaded = true;
    badge();
    if ($(VIEW) && $(VIEW).classList.contains("active")) render();
    return usedFallback;
  }
  const isOpen = (p) => p.r.status === "New" || p.r.status === "In progress";
  function badge() {
    const n = rows.filter((p) => p.r.status === "New").length;
    const b = document.querySelector('nav button[data-view="contact"]'); if (!b) return;
    let el = b.querySelector(".gc-badge");
    if (!n) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("span"); el.className = "gc-badge"; b.appendChild(el); }
    el.textContent = n;
  }

  /* ---------- render ---------- */
  function counts(k) { const l = rows.filter((p) => p.kind === k); return { all: l.length, fresh: l.filter((p) => p.r.status === "New").length }; }
  function visible() {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (p.kind !== tab) return false;
      if (statusF === "open" ? !isOpen(p) : statusF !== "all" && p.r.status !== statusF) return false;
      if (urgentOnly && p.priority !== "Urgent") return false;
      if (!q) return true;
      return [p.r.full_name, p.r.business_name, p.r.email, p.r.phone, p.code, p.ref, p.topic, p.body].join(" ").toLowerCase().indexOf(q) > -1;
    }).sort((a, b) => (b.priority === "Urgent") - (a.priority === "Urgent") || new Date(b.r.created_at) - new Date(a.r.created_at));
  }
  function waLink(p) {
    const phone = String(p.r.phone || "").replace(/\D/g, "");
    const num = phone.length === 10 ? "91" + phone : phone;
    const text = "Hi " + (p.r.full_name || "") + ", this is GLIME team about your request " + (p.ref ? "(" + p.ref + ")" : "") + (p.topic ? " on " + p.topic : "") + ".";
    return "https://wa.me/" + num + "?text=" + encodeURIComponent(text);
  }
  function card(p) {
    const r = p.r, st = r.status || "New", stc = st === "In progress" ? "In" : st;
    const todo = (TODO[p.kind] || {})[p.topic] || "Read the message and reply to find out more.";
    const codeLabel = p.kind === "agency" ? "Agency code" : "Partner code";
    return `<div class="gc-card${p.priority === "Urgent" ? " urgent" : ""}" data-id="${esc(r.id)}">
      <div class="gc-top"><div><div class="gc-name">${esc(r.full_name)} <span style="color:#7b8797;font-weight:500">· ${esc(r.business_name)}</span></div>
        <div class="gc-meta">${esc(when(r.created_at))}${p.ref ? " · " + esc(p.ref) : ""}</div></div>
        <div class="gc-chips">${p.priority === "Urgent" ? '<span class="gc-chip Urgent">URGENT</span>' : ""}${p.code ? `<span class="gc-chip code" data-copy="${esc(p.code)}" title="Tap to copy ${codeLabel}">${esc(p.code)}</span>` : ""}<span class="gc-chip ${esc(stc)}">${esc(st)}</span></div></div>
      <div class="gc-ask"><small>What they are asking</small><b>${esc(p.topic || "General request")}</b>
        <div class="gc-msg" style="margin-top:6px">${esc(p.body)}</div></div>
      <div class="gc-ask todo"><small>What to do</small>${esc(todo)}${p.kind === "agency" || p.kind === "partner" ? `<div style="margin-top:6px;color:#9ba7b7;font-size:.72rem">${codeLabel}: ${p.code ? "<b>" + esc(p.code) + "</b>" : "not given"}${p.clientRef ? " · Reference: " + esc(p.clientRef) : ""}</div>` : p.clientRef ? `<div style="margin-top:6px;color:#9ba7b7;font-size:.72rem">Reference: ${esc(p.clientRef)}</div>` : ""}</div>
      <dl><dt>Contact</dt><dd>${esc(r.full_name)} · <a href="mailto:${esc(r.email)}">${esc(r.email)}</a> · <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></dd>
        <dt>Prefers</dt><dd>${esc(p.prefers || "—")}</dd>
        <dt>Location</dt><dd>${esc([r.city, r.state, r.country].filter(Boolean).join(", ") || "—")}</dd>
        ${p.budget ? `<dt>Budget</dt><dd>${esc(p.budget)}</dd>` : ""}
        ${r.selected_package && p.kind === "business" ? `<dt>Package</dt><dd>${esc(r.selected_package)}${r.selected_addons ? " · " + esc(r.selected_addons) : ""}${r.estimated_amount ? " · ₹" + esc(r.estimated_amount) : ""}</dd>` : ""}</dl>
      <div class="gc-act">
        <a class="wa" href="${esc(waLink(p))}" target="_blank" rel="noopener noreferrer">Reply on WhatsApp</a>
        <a href="mailto:${esc(r.email)}?subject=${encodeURIComponent("GLIME: " + (p.ref || "your request"))}">Email</a>
        <a href="tel:${esc(r.phone)}">Call</a>
        ${st === "New" ? '<button data-st="In progress">Start working</button>' : ""}
        ${st !== "Resolved" && st !== "Closed" ? '<button class="go" data-st="Resolved">Mark resolved</button>' : '<button data-st="New">Reopen</button>'}
      </div></div>`;
  }
  function render() {
    const v = $(VIEW); if (!v) return;
    const list = visible();
    v.innerHTML = `<div class="card">
      ${missing ? `<div class="gc-note">No contact messages are visible yet. If people have submitted the form, the admin read access (RPC <b>admin_contact_list</b> or a read policy on <b>contact_leads</b>) is not set up. See ADMIN_CONTACT_BACKEND_SPEC.md.</div>` : ""}
      <div class="gc-tabs">${KINDS.map((k) => { const c = counts(k.k); return `<button type="button" class="gc-tab${tab === k.k ? " on" : ""}" data-tab="${k.k}"><span class="gc-n${c.fresh ? "" : " zero"}">${c.fresh}</span><b>${k.name}</b><small>${k.hint} · ${c.all} total</small></button>`; }).join("")}</div>
      <div class="gc-bar"><input id="gcSearch" type="search" placeholder="Search name, email, phone, code or reference" value="${esc(query)}">
        <select id="gcStatus"><option value="open"${statusF === "open" ? " selected" : ""}>Open (New + In progress)</option>${["all"].concat(STATUSES).map((s) => `<option value="${s}"${statusF === s ? " selected" : ""}>${s === "all" ? "All" : s}</option>`).join("")}</select>
        <label><input type="checkbox" id="gcUrgent"${urgentOnly ? " checked" : ""}> Urgent only</label>
        <button class="btn" id="gcRefresh" type="button">&#8635; Refresh</button></div>
      <div id="gcList">${list.length ? list.map(card).join("") : `<div class="gc-empty">${loaded ? "No messages here right now." : "Loading..."}</div>`}</div></div>`;
    $("gcSearch").addEventListener("input", (e) => { query = e.target.value; renderList(); });
  }
  function renderList() { const l = $("gcList"); if (!l) return; const list = visible(); l.innerHTML = list.length ? list.map(card).join("") : `<div class="gc-empty">No messages here right now.</div>`; }

  /* ---------- actions ---------- */
  async function setStatus(id, status, btn) {
    const c = client(); if (!c) return;
    btn.disabled = true;
    const note = null;
    try {
      let r = await c.rpc("admin_contact_set_status", { p_id: id, p_status: status, p_note: note });
      if (r.error) {
        if (/function|schema cache|PGRST202|42883/i.test(String(r.error.message) + String(r.error.code))) {
          r = await c.from("contact_leads").update({ status }).eq("id", id);
        }
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
    if (s) { setStatus(s.closest(".gc-card").dataset.id, s.dataset.st, s); return; }
    if (e.target.id === "gcRefresh") { load().then(render); }
  }

  function open() {
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    $(VIEW).classList.add("active");
    document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x.dataset.view === "contact"));
    const ti = $("title"); if (ti) ti.textContent = "Contact";
    if (!loaded) { const first = KINDS.find((k) => counts(k.k).fresh) ; if (first) tab = first.k; }
    render();
    load().then(() => { const f = KINDS.find((k) => counts(k.k).fresh); if (f && counts(tab).fresh === 0 && counts(tab).all === 0) tab = f.k; render(); });
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
      if (e.target.id === "gcStatus") { statusF = e.target.value; renderList(); }
      else if (e.target.id === "gcUrgent") { urgentOnly = e.target.checked; renderList(); }
    });
    const b = document.createElement("button"); b.type = "button"; b.dataset.view = "contact"; b.textContent = "Contact";
    nav.insertBefore(b, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    b.addEventListener("click", open);
    load();
    return true;
  }

  let tries = 0;
  const t = setInterval(() => { tries++; if (create() || tries > 40) clearInterval(t); }, 800);
})();
