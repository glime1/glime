/* =========================================================
   GLIME ADMIN — Creators (review creator applications)
   Adds a "Creators" tab to the admin sidebar. Admin can:
     - see every creator application (pending first) with the Client ID
       that sent it
     - open the creator's Instagram / YouTube profile with one button, and
       match the verification passcode shown here against the bio / channel
       description
     - Approve a pending application
     - Reject a pending application with a written reason that the
       client sees on their Creator card (Settings > Connector)
     - Approve a rejected application again
     - Revoke an approved creator (back to rejected) with a written reason
   Frontend only. Does not modify any other addon.

   Backend used (already exists in Supabase, both check is_glime_admin()):
     admin_creator_list(p_status text default null) -> json array
       [{ id, auth_user_id, client_id, business_name, email, full_name,
          instagram_url, youtube_url, followers, category, course_name,
          status, reject_reason, verify_code, reviewed_at, created_at,
          updated_at }]
     admin_creator_review(p_application_id uuid, p_action text, p_note text)
       p_action: 'approve' (pending or rejected -> approved)
                 'reject'  (pending -> rejected, note required)
                 'revoke'  (approved -> rejected, note required)
       note: max 500 characters
========================================================= */
(() => {
  "use strict";
  const ID = "glime-creator-admin";
  const STYLE = ID + "-style";
  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const MAX_NOTE = 500;

  let sb = null, list = [], filter = "pending", noteId = null, noteAction = "reject", busyId = null;
  const draftNote = {};

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const num = (v) => Number(v) || 0;
  const rows = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.rows) ? d.rows : []);
  const day = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"; };
  const st = (r) => String(r.status || "").toLowerCase();
  const isUrl = (u) => /^https?:\/\//i.test(String(u || ""));
  const link = (u) => (isUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>` : esc(u || "—"));
  const openBtn = (u, label) => (isUrl(u) ? `<a class="gc-open" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : "");

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
      #${ID}{padding-top:4px}
      #${ID} .gc-title{color:#7c9cff;font-weight:600;font-size:1rem;margin-bottom:7px}
      #${ID} .gc-sub{color:#9ba7b7;font-size:.75rem;line-height:1.5;margin-bottom:14px}
      #${ID} .gc-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}
      #${ID} .gc-sum div{padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.02)}
      #${ID} .gc-sum small{display:block;color:#687587;font-size:.68rem;margin-bottom:4px}
      #${ID} .gc-sum b{color:#fff;font-size:1.15rem}
      #${ID} .gc-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      #${ID} .gc-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      #${ID} .gc-bar input{flex:1 1 200px;min-width:0;padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;box-sizing:border-box}
      #${ID} .gc-card{padding:15px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:12px}
      #${ID} .gc-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
      #${ID} .gc-name{color:#fff;font-weight:700;font-size:.92rem;word-break:break-word}
      #${ID} .gc-meta{color:#687587;font-size:.68rem;margin-top:3px;word-break:break-all}
      #${ID} .gc-st{padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.1);color:#9ba7b7;white-space:nowrap}
      #${ID} .gc-st.approved{color:#00ff88;border-color:rgba(0,255,136,.3)}
      #${ID} .gc-st.pending{color:#ffc857;border-color:rgba(255,200,87,.35)}
      #${ID} .gc-st.rejected{color:#ff5263;border-color:rgba(255,82,99,.35)}
      #${ID} dl{display:grid;grid-template-columns:110px 1fr;gap:5px 10px;font-size:.76rem;margin:0 0 12px}
      #${ID} dt{color:#687587}#${ID} dd{margin:0;color:#dfe7ef;word-break:break-word}
      #${ID} dd a{color:#7c9cff}
      #${ID} .gc-pass{display:inline-block;padding:3px 9px;border-radius:8px;border:1px solid rgba(255,200,87,.45);background:rgba(255,200,87,.08);color:#ffc857;font:700 .82rem ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;user-select:all}
      #${ID} .gc-cid{display:inline-block;padding:3px 9px;border-radius:8px;border:1px solid rgba(124,156,255,.4);background:rgba(124,156,255,.08);color:#a9bcff;font:700 .8rem ui-monospace,SFMono-Regular,Menlo,monospace;user-select:all}
      #${ID} .gc-why{margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,82,99,.3);background:rgba(255,82,99,.06);color:#ffd5da;font-size:.76rem;line-height:1.5;word-break:break-word}
      #${ID} .gc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      #${ID} .gc-row + .gc-row{margin-top:8px}
      #${ID} .gc-open{display:inline-flex;align-items:center;gap:4px;border-radius:9px;padding:9px 13px;font:700 .76rem system-ui,sans-serif;text-decoration:none;background:rgba(124,156,255,.16);color:#a9bcff;border:1px solid rgba(124,156,255,.35)}
      #${ID} .gc-open:hover{background:rgba(124,156,255,.26)}
      #${ID} button{border:0;border-radius:9px;padding:9px 13px;font:700 .76rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.09);color:#fff}
      #${ID} button.on{background:#7c9cff;color:#07101f}
      #${ID} button.ok{background:#00c878;color:#04140c}
      #${ID} button.no{background:#ff5263;color:#1a0408}
      #${ID} button:disabled{opacity:.55;cursor:not-allowed}
      #${ID} .gc-rej{margin-top:12px;padding:12px;border-radius:12px;border:1px solid rgba(255,82,99,.3);background:rgba(255,82,99,.05)}
      #${ID} .gc-rej label{display:block;color:#dfe7ef;font-size:.74rem;font-weight:600;margin-bottom:6px}
      #${ID} .gc-rej textarea{width:100%;min-height:78px;padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#fff;font:inherit;font-size:.8rem;resize:vertical;box-sizing:border-box}
      #${ID} .gc-cnt{color:#687587;font-size:.68rem;margin:4px 0 10px;text-align:right}
      #${ID} .gc-msg{margin-top:10px;padding:10px 12px;border-radius:9px;font-size:.74rem;display:none}
      #${ID} .gc-msg.s{display:block;color:#00ff88;background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.25)}
      #${ID} .gc-msg.e{display:block;color:#ff5263;background:rgba(255,82,99,.07);border:1px solid rgba(255,82,99,.25)}
      #${ID} .gc-empty{padding:16px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;color:#9ba7b7;font-size:.78rem;text-align:center}
      @media(max-width:650px){#${ID} dl{grid-template-columns:90px 1fr}}`;
    document.head.appendChild(s);
  }

  function msg(t, kind) { const m = $("gcMsg"); if (!m) return; m.textContent = t || ""; m.className = "gc-msg" + (t ? " " + kind : ""); }
  function errText(e) {
    const m = String((e && e.message) || "");
    if (m.includes("not_admin")) return "Admin access is required.";
    if (m.includes("NOTE_REQUIRED")) return "Please write the reason.";
    if (m.includes("NOTE_TOO_LONG")) return "The reason is too long (maximum " + MAX_NOTE + " characters).";
    if (m.includes("INVALID_TRANSITION")) return "This application was already changed. Refresh the list.";
    if (m.includes("APPLICATION_NOT_FOUND")) return "This application no longer exists. Refresh the list.";
    if (/could not find the function|PGRST202|does not exist/i.test(m)) return "Backend is not ready: admin_creator_list / admin_creator_review are missing in Supabase.";
    return m || "Request failed.";
  }

  /* ---------- data ---------- */
  async function load() {
    const c = getSb(); if (!c) { msg("Supabase client unavailable.", "e"); return; }
    msg("Loading creator applications...", "s");
    try {
      const { data, error } = await c.rpc("admin_creator_list", { p_status: null });
      if (error) throw error;
      list = rows(data);
      msg("", ""); render();
    } catch (e) { list = []; render(); msg(errText(e), "e"); }
  }

  async function review(id, action, note) {
    const c = getSb(); if (!c) { msg("Supabase client unavailable.", "e"); return; }
    busyId = id; render(); msg("", "");
    try {
      const { error } = await c.rpc("admin_creator_review", { p_application_id: id, p_action: action, p_note: note || null });
      if (error) throw error;
      const wasName = (list.find((x) => x.id === id) || {}).full_name || "Application";
      noteId = null; delete draftNote[id]; busyId = null;
      await load();
      const done = { approve: " approved.", reject: " rejected. The reason is now visible to the client.", revoke: " revoked. Creator access is removed and the reason is visible to the client." }[action] || " updated.";
      msg(wasName + done, "s");
    } catch (e) { busyId = null; render(); msg(errText(e), "e"); }
  }

  /* ---------- render ---------- */
  function filtered() {
    const term = ($("gcSearch")?.value || "").trim().toLowerCase();
    return list.filter((r) => {
      if (filter !== "all" && st(r) !== filter) return false;
      return !term || [r.full_name, r.email, r.business_name, r.client_id, r.course_name, r.category, r.instagram_url, r.youtube_url, r.verify_code].join(" ").toLowerCase().includes(term);
    });
  }

  function summary() {
    const n = (s) => list.filter((r) => st(r) === s).length;
    const cells = [["Pending review", n("pending")], ["Approved", n("approved")], ["Rejected", n("rejected")], ["Total", list.length]];
    $("gcSum").innerHTML = cells.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("");
  }

  function card(r) {
    const s = st(r), busy = busyId === r.id;
    const who = [r.business_name, r.email].filter(Boolean).join(" · ");
    const dis = busy ? "disabled" : "";
    const noteOpen = noteId === r.id && (s === "pending" || s === "approved");

    let actions = "";
    if (!noteOpen) {
      if (s === "pending") {
        actions = `<div class="gc-row"><button class="ok" data-do="approve" ${dis}>${busy ? "Please wait..." : "Approve"}</button><button class="no" data-do="reject-open" ${dis}>Reject</button></div>`;
      } else if (s === "rejected") {
        actions = `<div class="gc-row"><button class="ok" data-do="approve" ${dis}>${busy ? "Please wait..." : "Approve again"}</button></div>`;
      } else if (s === "approved") {
        actions = `<div class="gc-row"><button class="no" data-do="revoke-open" ${dis}>Revoke approval</button></div>`;
      }
    }

    const note = draftNote[r.id] || "";
    const isRevoke = s === "approved";
    const noteBox = noteOpen
      ? `<div class="gc-rej"><label for="gcNote-${esc(r.id)}">${isRevoke ? "Reason for revoking creator access" : "Reason for rejection"} (the client will see this)</label>
          <textarea id="gcNote-${esc(r.id)}" data-note maxlength="${MAX_NOTE}" placeholder="${isRevoke ? "For example: The passcode was removed from your profile before verification was complete." : "For example: We could not find the passcode on your profile. Please add it to your bio and apply again."}">${esc(note)}</textarea>
          <div class="gc-cnt"><span data-count>${note.length}</span>/${MAX_NOTE}</div>
          <div class="gc-row"><button class="no" data-do="note-send" ${dis}>${busy ? "Sending..." : isRevoke ? "Revoke and send reason" : "Reject and send reason"}</button><button data-do="note-cancel" ${dis}>Cancel</button></div></div>`
      : "";

    const openRow = (isUrl(r.instagram_url) || isUrl(r.youtube_url))
      ? `<div class="gc-row">${openBtn(r.instagram_url, "Open Instagram")}${openBtn(r.youtube_url, "Open YouTube")}</div>`
      : "";

    return `<div class="gc-card" data-id="${esc(r.id)}">
      <div class="gc-head"><div><div class="gc-name">${esc(r.full_name || "Unnamed applicant")}</div><div class="gc-meta">${esc(who || "—")} · applied ${day(r.created_at)}</div></div><span class="gc-st ${esc(s)}">${esc(s || "unknown")}</span></div>
      <dl><dt>Client ID</dt><dd>${r.client_id ? `<span class="gc-cid">${esc(r.client_id)}</span>` : "—"}</dd>
      <dt>Passcode</dt><dd>${r.verify_code ? `<span class="gc-pass">${esc(r.verify_code)}</span>` : "—"}</dd>
      <dt>Course</dt><dd>${esc(r.course_name || "—")}</dd>
      <dt>Category</dt><dd>${esc(r.category || "—")}</dd>
      <dt>Followers</dt><dd>${r.followers == null ? "—" : num(r.followers).toLocaleString("en-IN")}</dd>
      <dt>Instagram</dt><dd>${link(r.instagram_url)}</dd>
      <dt>YouTube</dt><dd>${link(r.youtube_url)}</dd>
      ${r.reviewed_at ? `<dt>Reviewed</dt><dd>${day(r.reviewed_at)}</dd>` : ""}</dl>
      ${s === "rejected" && r.reject_reason ? `<div class="gc-why"><b>Reason sent to client:</b> ${esc(r.reject_reason)}</div>` : ""}
      ${openRow}${actions}${noteBox}
    </div>`;
  }

  function render() {
    if (!$("gcList")) return;
    summary();
    ["pending", "approved", "rejected", "all"].forEach((k) => $("gcTab-" + k).classList.toggle("on", filter === k));
    const items = filtered();
    const emptyText = filter === "pending" ? "No applications waiting for review." : "No applications found.";
    $("gcList").innerHTML = items.length ? items.map(card).join("") : `<div class="gc-empty">${emptyText}</div>`;
  }

  /* ---------- events ---------- */
  function onClick(e) {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "gcRefresh") { load(); return; }
    if (b.id && b.id.startsWith("gcTab-")) { filter = b.id.slice(6); noteId = null; render(); return; }
    const cardEl = b.closest(".gc-card"); const id = cardEl && cardEl.dataset.id;
    if (!id || !b.dataset.do || busyId) return;
    const r = list.find((x) => x.id === id); if (!r) return;
    const nm = r.full_name || "this applicant";
    const d = b.dataset.do;
    if (d === "approve") {
      const again = st(r) === "rejected";
      if (window.confirm((again ? "Approve " + nm + " again" : "Approve " + nm) + " as a creator? Creator will appear in their menu.")) review(id, "approve", null);
    } else if (d === "reject-open" || d === "revoke-open") {
      noteId = id; noteAction = d === "revoke-open" ? "revoke" : "reject"; msg("", ""); render();
      const t = $("gcList").querySelector('.gc-card[data-id="' + id.replace(/"/g, "") + '"] [data-note]'); if (t) t.focus();
    } else if (d === "note-cancel") {
      noteId = null; delete draftNote[id]; render();
    } else if (d === "note-send") {
      const note = String(draftNote[id] || "").trim();
      if (!note) { msg("Please write the reason.", "e"); const t = cardEl.querySelector("[data-note]"); if (t) t.focus(); return; }
      if (note.length > MAX_NOTE) { msg(errText({ message: "NOTE_TOO_LONG" }), "e"); return; }
      const revoke = noteAction === "revoke";
      if (window.confirm((revoke ? "Revoke creator access for " : "Reject ") + nm + "? They will see your reason.")) review(id, revoke ? "revoke" : "reject", note);
    }
  }

  function onInput(e) {
    const t = e.target;
    if (!t || !t.matches || !t.matches("[data-note]")) return;
    const id = t.closest(".gc-card").dataset.id;
    draftNote[id] = t.value;
    const c = t.closest(".gc-rej").querySelector("[data-count]"); if (c) c.textContent = t.value.length;
  }

  /* ---------- mount ---------- */
  function create() {
    if ($(ID)) return true;
    const main = document.querySelector("#app main"), nav = document.querySelector("#app nav");
    if (!main || !nav) return false;
    const view = document.createElement("section");
    view.className = "view"; view.id = "view-creator";
    main.appendChild(view);
    const nb = document.createElement("button");
    nb.type = "button"; nb.dataset.view = "creator"; nb.textContent = "Creators";
    nav.insertBefore(nb, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    nb.addEventListener("click", () => {
      document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
      view.classList.add("active");
      document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x === nb));
      const ti = $("title"); if (ti) ti.textContent = "Creators";
      load();
    });
    styles();
    const s = document.createElement("div");
    s.id = ID;
    s.innerHTML = `<div class="gc-title">Creator Applications</div>
      <div class="gc-sub">Clients who applied to sell a course through GLIME. Use the Open buttons to visit their Instagram / YouTube profile and check that the passcode shown here is in the bio or channel description, then approve. If it is missing, reject with a reason. A rejected creator can be approved again, and an approved creator can be revoked with a reason. The client sees the reason on their Creator card.</div>
      <div class="gc-sum" id="gcSum"></div>
      <div class="gc-tabs"><button id="gcTab-pending" class="on" type="button">Pending</button><button id="gcTab-approved" type="button">Approved</button><button id="gcTab-rejected" type="button">Rejected</button><button id="gcTab-all" type="button">All</button></div>
      <div class="gc-bar"><input id="gcSearch" type="search" placeholder="Search name, email, course, passcode or client ID"><button id="gcRefresh" type="button">Refresh</button></div>
      <div id="gcList"><div class="gc-empty">Open this tab to load applications.</div></div><div id="gcMsg" class="gc-msg"></div>`;
    view.appendChild(s);
    $("gcSearch").addEventListener("input", render);
    s.addEventListener("click", onClick);
    s.addEventListener("input", onInput);
    render();
    return true;
  }

  function init() {
    let tries = 0;
    const t = setInterval(() => { tries++; if (create() || tries > 25) clearInterval(t); }, 800);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
