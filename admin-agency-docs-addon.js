/* =========================================================
   GLIME ADMIN - Request and review agency documents
   Adds a "Documents" box to each agency card (Agency tab):
   ask for PAN, MSME certificate, FIR copy or anything else,
   view what the agency uploaded, accept or ask to upload again.
   RPCs: admin_agency_doc_request, admin_agency_doc_list,
   admin_agency_doc_review. Storage bucket: agency-docs (private).
   Load AFTER admin-agency-addon.js. See AGENCY_DOCS_BACKEND_SPEC.md
========================================================= */
(() => {
  "use strict";
  const URL_ = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const BUCKET = "agency-docs";
  const PRESETS = ["PAN card", "MSME / Udyam certificate", "GST certificate", "FIR copy", "Address proof", "Bank proof (cancelled cheque)", "ID proof (Aadhaar / Passport)"];
  let sb = null;
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const day = (v) => { const d = new Date(v); return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
  function client() {
    if (sb) return sb;
    if (window.supabaseClient && window.supabaseClient.rpc) return (sb = window.supabaseClient);
    if (window.supabase && typeof window.supabase.createClient === "function") sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return sb;
  }
  function css() {
    if (document.getElementById("gdStyle")) return;
    const s = document.createElement("style"); s.id = "gdStyle";
    s.textContent = `.gd-box{margin-top:14px;padding-top:12px;border-top:1px dashed rgba(255,255,255,.14)}
      .gd-box h4{margin:0 0 8px;color:#ffc857;font-size:.82rem}.gd-box .gd-list{margin-bottom:10px}
      .gd-doc{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;padding:9px 11px;border:1px solid rgba(255,255,255,.09);border-radius:10px;margin-bottom:7px;font-size:.76rem;color:#dfe7ef}
      .gd-doc small{color:#9ba7b7;display:block;margin-top:2px}.gd-st{padding:3px 9px;border-radius:999px;font-size:.66rem;font-weight:700;border:1px solid rgba(255,255,255,.14);color:#9ba7b7}
      .gd-st.uploaded{color:#6cc7ff}.gd-st.accepted{color:#00ff88}.gd-st.rejected{color:#ff5263}.gd-st.requested{color:#ffc857}
      .gd-btns{display:flex;gap:6px;flex-wrap:wrap}.gd-box button{border:0;border-radius:8px;padding:7px 11px;font:700 .72rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.1);color:#fff}
      .gd-box button.ok{background:#00ff88;color:#06100b}.gd-box button.no{background:#ff5263}.gd-box button:disabled{opacity:.55}
      .gd-form{display:grid;gap:8px}.gd-checks{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.76rem;color:#dfe7ef}.gd-checks label{display:flex;gap:6px;align-items:center}
      .gd-form input[type=text],.gd-form textarea{padding:8px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;font-size:.78rem;box-sizing:border-box;width:100%}
      .gd-msg{font-size:.74rem;color:#ff5263}.gd-msg.s{color:#00ff88}`;
    document.head.appendChild(s);
  }
  async function loadDocs(card) {
    const list = card.querySelector(".gd-list"), id = card.dataset.id, c = client();
    if (!c) return;
    try {
      const { data, error } = await c.rpc("admin_agency_doc_list", { p_agency_id: id });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      list.innerHTML = rows.length ? rows.map((r) => `<div class="gd-doc" data-rid="${esc(r.id)}" data-path="${esc(r.file_path || "")}">
        <div><b>${esc(r.label)}</b> <span class="gd-st ${esc(r.status)}">${esc(r.status)}</span><small>${r.file_name ? esc(r.file_name) + " · uploaded " + day(r.uploaded_at) : "Waiting for upload"}${r.note ? " · Note: " + esc(r.note) : ""}</small></div>
        <div class="gd-btns">${r.file_path ? `<button data-gd="view">View</button>` : ""}${r.status === "uploaded" ? `<button class="ok" data-gd="accept">Accept</button><button class="no" data-gd="reject">Ask again</button>` : ""}</div></div>`).join("") : `<div class="gd-doc">No documents requested yet.</div>`;
    } catch (e) { list.innerHTML = `<div class="gd-doc">Documents are not switched on yet (backend pending).</div>`; }
  }
  function enhance(card) {
    if (card.querySelector(".gd-box")) return;
    css();
    const box = document.createElement("div"); box.className = "gd-box";
    box.innerHTML = `<h4>Documents</h4><div class="gd-list"><div class="gd-doc">Loading...</div></div>
      <div class="gd-form"><div class="gd-checks">${PRESETS.map((p) => `<label><input type="checkbox" value="${esc(p)}"> ${esc(p)}</label>`).join("")}</div>
      <input type="text" data-other maxlength="80" placeholder="Other document (type the name)">
      <textarea data-dnote rows="2" maxlength="500" placeholder="Message to the agency (why it is needed)"></textarea>
      <div><button class="ok" data-gd="request">Request documents</button></div><div class="gd-msg" role="alert"></div></div>`;
    card.appendChild(box);
    loadDocs(card);
  }
  const say = (card, t, ok) => { const m = card.querySelector(".gd-msg"); if (m) { m.textContent = t; m.className = "gd-msg" + (ok ? " s" : ""); } };
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-gd]"); if (!b) return;
    const card = b.closest(".ga-card"), c = client(); if (!card || !c) return;
    const what = b.dataset.gd;
    b.disabled = true; say(card, "");
    try {
      if (what === "request") {
        const items = [...card.querySelectorAll(".gd-checks input:checked")].map((i) => i.value);
        const other = card.querySelector("[data-other]").value.trim(); if (other) items.push(other);
        if (!items.length) throw new Error("Choose at least one document.");
        const note = card.querySelector("[data-dnote]").value.trim() || null;
        const { error } = await c.rpc("admin_agency_doc_request", { p_agency_id: card.dataset.id, p_items: items, p_note: note });
        if (error) throw error;
        card.querySelectorAll(".gd-checks input").forEach((i) => (i.checked = false));
        card.querySelector("[data-other]").value = ""; card.querySelector("[data-dnote]").value = "";
        say(card, "Request sent. The agency will see it on its status page.", true); await loadDocs(card);
      } else {
        const row = b.closest(".gd-doc"), rid = row.dataset.rid;
        if (what === "view") {
          const { data, error } = await c.storage.from(BUCKET).createSignedUrl(row.dataset.path, 300);
          if (error) throw error; window.open(data.signedUrl, "_blank", "noopener");
        } else {
          let note = null;
          if (what === "reject") { note = window.prompt("Why should the agency upload this again?"); if (!note || !note.trim()) { b.disabled = false; return; } note = note.trim().slice(0, 500); }
          const { error } = await c.rpc("admin_agency_doc_review", { p_request_id: rid, p_action: what === "accept" ? "accept" : "reject", p_note: note });
          if (error) throw error; await loadDocs(card);
        }
      }
    } catch (err) { say(card, String((err && err.message) || "Request failed.")); }
    b.disabled = false;
  });
  new MutationObserver(() => document.querySelectorAll("#gaList .ga-card").forEach(enhance)).observe(document.documentElement, { childList: true, subtree: true });
})();
