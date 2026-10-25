/* =========================================================
   GLIME AGENCY - documents requested by the admin
   Shows on agency.html (status card) and agency-dashboard.html
   (gate screen) when the admin asks for more documents, e.g. PAN,
   MSME certificate, FIR copy. The agency uploads files here.
   RPCs: agency_get_doc_requests, agency_submit_doc_upload.
   Storage bucket: agency-docs (private). See AGENCY_DOCS_BACKEND_SPEC.md
========================================================= */
(function () {
  "use strict";
  var C = window.GLIME_PARTNER;
  if (!C || !window.supabase) return;
  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  var BUCKET = "agency-docs", MAX = 5 * 1024 * 1024, TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  var rows = null, loading = false, uid = null, host = null;
  var esc = function (v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); };

  function css() {
    if (document.getElementById("adDocsCss")) return;
    var s = document.createElement("style"); s.id = "adDocsCss";
    s.textContent = "#adDocsPanel{margin-top:20px;padding:18px;border:1px solid rgba(255,200,87,.35);border-radius:16px;background:rgba(255,200,87,.05);text-align:left}" +
      "#adDocsPanel h3{margin:0 0 6px;font-size:1rem;color:#fff}#adDocsPanel .gd-sub{color:#9ba7b7;font-size:.8rem;line-height:1.5;margin:0 0 14px}" +
      "#adDocsPanel .gd-item{padding:13px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.03);margin-bottom:10px}" +
      "#adDocsPanel .gd-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}" +
      "#adDocsPanel .gd-lbl{font-weight:700;color:#fff;font-size:.9rem}#adDocsPanel .gd-note{color:#c9d3df;font-size:.78rem;margin:6px 0 0;line-height:1.45}" +
      "#adDocsPanel .gd-chip{padding:3px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.14);color:#9ba7b7;white-space:nowrap}" +
      "#adDocsPanel .gd-chip.req{color:#ffc857;border-color:rgba(255,200,87,.4)}#adDocsPanel .gd-chip.up{color:#6cc7ff;border-color:rgba(108,199,255,.4)}" +
      "#adDocsPanel .gd-chip.ok{color:#00ff88;border-color:rgba(0,255,136,.4)}#adDocsPanel .gd-chip.bad{color:#ff5263;border-color:rgba(255,82,99,.4)}" +
      "#adDocsPanel .gd-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}" +
      "#adDocsPanel input[type=file]{flex:1 1 200px;font-size:.78rem;color:#c9d3df;min-width:0}" +
      "#adDocsPanel button{border:0;border-radius:9px;padding:9px 14px;font:700 .78rem system-ui,sans-serif;cursor:pointer;background:#00ff88;color:#06100b}" +
      "#adDocsPanel button:disabled{opacity:.55;cursor:not-allowed}#adDocsPanel .gd-msg{font-size:.76rem;margin-top:8px;color:#ff5263}#adDocsPanel .gd-msg.ok{color:#00ff88}" +
      "#adDocsPanel .gd-fine{color:#687587;font-size:.72rem;margin:8px 0 0}";
    document.head.appendChild(s);
  }

  var STATUS = { requested: ["Needed", "req"], rejected: ["Upload again", "bad"], uploaded: ["Under review", "up"], accepted: ["Accepted", "ok"] };
  function view() {
    var open = rows.filter(function (r) { return r.status === "requested" || r.status === "rejected"; }).length;
    return "<h3>Documents requested by GLIME</h3><p class=\"gd-sub\">" + (open ? "Please upload the documents below so we can continue reviewing your agency. PDF, JPG, PNG or WEBP, up to 5 MB each." : "Thank you. All requested documents are with us. We will update you after review.") + "</p>" +
      rows.map(function (r) {
        var st = STATUS[r.status] || [r.status, ""], can = r.status === "requested" || r.status === "rejected";
        return "<div class=\"gd-item\" data-id=\"" + esc(r.id) + "\"><div class=\"gd-top\"><span class=\"gd-lbl\">" + esc(r.label) + "</span><span class=\"gd-chip " + st[1] + "\">" + esc(st[0]) + "</span></div>" +
          (r.note ? "<p class=\"gd-note\">" + esc(r.note) + "</p>" : "") +
          (r.reviewer_note && r.status === "rejected" ? "<p class=\"gd-note\"><b>Why again:</b> " + esc(r.reviewer_note) + "</p>" : "") +
          (r.file_name && !can ? "<p class=\"gd-note\">Uploaded: " + esc(r.file_name) + "</p>" : "") +
          (can ? "<div class=\"gd-row\"><input type=\"file\" accept=\".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*\" aria-label=\"Choose file for " + esc(r.label) + "\"><button type=\"button\" data-gd-up=\"" + esc(r.id) + "\">Upload</button></div><div class=\"gd-msg\" role=\"alert\"></div>" : "") + "</div>";
      }).join("") + "<p class=\"gd-fine\">Your files are private and visible only to GLIME admins.</p>";
  }
  function paint() {
    var p = document.getElementById("adDocsPanel");
    if (!rows || !rows.length) { if (p) p.remove(); return; }
    if (!host || !document.body.contains(host)) return;
    if (!p) { css(); p = document.createElement("div"); p.id = "adDocsPanel"; p.addEventListener("click", onClick); host.appendChild(p); }
    p.innerHTML = view();
  }
  async function load() {
    if (loading) return; loading = true;
    try {
      var s = await sb.auth.getSession(); uid = s && s.data && s.data.session && s.data.session.user.id;
      if (!uid) { rows = []; return; }
      var r = await sb.rpc("agency_get_doc_requests");
      if (r.error) throw r.error;
      rows = Array.isArray(r.data) ? r.data : [];
    } catch (e) { rows = []; }
    finally { loading = false; }
    paint();
  }
  function say(item, text, ok) { var m = item.querySelector(".gd-msg"); if (m) { m.textContent = text; m.className = "gd-msg" + (ok ? " ok" : ""); } }
  async function onClick(e) {
    var b = e.target.closest("[data-gd-up]"); if (!b) return;
    var item = b.closest(".gd-item"), id = b.getAttribute("data-gd-up"), f = item.querySelector("input[type=file]").files[0];
    if (!f) { say(item, "Please choose a file first."); return; }
    if (TYPES.indexOf(f.type) < 0) { say(item, "Only PDF, JPG, PNG or WEBP files are allowed."); return; }
    if (f.size > MAX) { say(item, "File is too large. Maximum size is 5 MB."); return; }
    b.disabled = true; b.textContent = "Uploading..."; say(item, "");
    try {
      var safe = f.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80), path = uid + "/" + id + "/" + Date.now() + "-" + safe;
      var up = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
      if (up.error) throw up.error;
      var r = await sb.rpc("agency_submit_doc_upload", { p_request_id: id, p_path: path, p_file_name: f.name.slice(0, 120), p_size: f.size, p_mime: f.type });
      if (r.error) throw r.error;
      await load();
    } catch (err) {
      say(item, /not found|does not exist|schema cache/i.test(String(err && err.message)) ? "Uploads are not switched on yet. Please contact GLIME." : "Upload failed. Please try again.");
      b.disabled = false; b.textContent = "Upload";
    }
  }

  var started = false;
  function findHost() {
    var st = document.getElementById("agStatus");
    if (st && !st.hidden && !/You are approved/.test(st.textContent)) return st;
    var nav = document.getElementById("pdNav"), v = document.getElementById("pdView");
    if (nav && nav.hidden && v && v.children.length) return v;
    return null;
  }
  setInterval(function () {
    var h = findHost();
    if (!h) { host = null; return; }
    host = h;
    if (!started) { started = true; load(); return; }
    if (rows && rows.length && !document.getElementById("adDocsPanel")) paint();
  }, 1200);
})();
