/* =========================================================
   GLIME LEADS — IMPORT ADDON (CSV + Excel)
   Sirf leads.html ke #importModal ke saath kaam karta hai.
   leads-data.js (window.GlimeLeadsData) use karta hai.
   Excel (.xlsx/.xls) padhne ke liye SheetJS tabhi load hota hai
   jab user Excel file chunta hai.
========================================================= */
(() => {
  "use strict";

  const D = window.GlimeLeadsData;
  const modal = document.getElementById("importModal");
  if (!D || !modal) return;

  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

  const MAX_ROWS = 2000;
  const MAX_BYTES = 5 * 1024 * 1024;
  const CHUNK = 100;
  const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const PRIORITIES = ["low", "normal", "high", "urgent"];

  /* header (normalised) -> lead field */
  const ALIASES = {
    name: ["name", "fullname", "leadname", "customername", "clientname", "contactname", "naam", "nam"],
    mobile: ["mobile", "mobilenumber", "mobileno", "mobno", "phone", "phonenumber", "phoneno", "contact", "contactnumber", "contactno", "number", "cell", "cellphone"],
    whatsapp: ["whatsapp", "whatsappnumber", "whatsappno", "wa", "wanumber"],
    email: ["email", "emailid", "emailaddress", "mail", "mailid"],
    address: ["address", "fulladdress", "streetaddress", "completeaddress", "pata"],
    city_area: ["cityarea", "city", "area", "location", "locality", "town"],
    interest: ["interest", "interestedin", "requirement", "enquiry", "inquiry"],
    product_service: ["productservice", "product", "service", "item"],
    budget: ["budget", "amount"],
    priority: ["priority"],
    next_follow_up_at: ["nextfollowup", "nextfollowupat", "followup", "followupdate"],
    notes: ["notes", "note", "remarks", "remark", "comment", "comments", "description"]
  };
  const LOOKUP = {};
  Object.entries(ALIASES).forEach(([field, list]) => list.forEach((a) => { LOOKUP[a] = field; }));
  const normHeader = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const LABELS = {
    name: "Name", mobile: "Mobile", whatsapp: "WhatsApp", email: "Email", address: "Address",
    city_area: "City / Area", interest: "Interest", product_service: "Product / Service",
    budget: "Budget", priority: "Priority", next_follow_up_at: "Next follow-up", notes: "Notes"
  };

  const S = { rows: [], fileName: "", busy: false };

  /* ---------- file readers ---------- */

  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, "");
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const counts = { ",": 0, ";": 0, "\t": 0 };
    let q = false;
    for (const ch of firstLine) {
      if (ch === '"') q = !q;
      else if (!q && counts[ch] !== undefined) counts[ch]++;
    }
    let delim = ",";
    if (counts[";"] > counts[delim]) delim = ";";
    if (counts["\t"] > counts[delim]) delim = "\t";

    const rows = [];
    let row = [];
    let cell = "";
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
        } else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = ""; rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function loadXlsxLib() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = XLSX_URL;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load the Excel reader. Check your internet, or save the file as CSV and try again."));
      document.head.appendChild(s);
    });
  }

  async function readFile(file) {
    const name = file.name.toLowerCase();
    const buf = await file.arrayBuffer();
    if (/\.(xlsx|xls)$/.test(name)) {
      await loadXlsxLib();
      const wb = window.XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("This Excel file has no sheet.");
      return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false });
    }
    if (/\.csv$/.test(name) || file.type === "text/csv") {
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
      catch { text = new TextDecoder("windows-1252").decode(buf); }
      return parseCSV(text);
    }
    throw new Error("Please choose a .csv or .xlsx file.");
  }

  /* ---------- cleaning ---------- */

  const last10 = (v) => String(v || "").replace(/\D/g, "").slice(-10);

  function cleanPhone(raw) {
    let s = String(raw ?? "").trim();
    if (!s) return { v: null };
    if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) s = String(Math.round(Number(s)));
    const plus = s.startsWith("+");
    let d = s.replace(/\D/g, "");
    if (!plus) {
      if (d.length === 11 && d[0] === "0") d = d.slice(1);
      if (d.length === 10) return { v: "+91" + d };
      if (d.length === 12 && d.startsWith("91")) return { v: "+" + d };
    }
    if (d.length >= 10 && d.length <= 15) return { v: "+" + d };
    return { v: null, bad: true };
  }

  function cleanDate(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return { v: null };
    let d;
    const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      d = new Date(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 10), Number(m[5] || 0));
    } else d = new Date(s);
    if (Number.isNaN(d.getTime())) return { v: null, bad: true };
    return { v: d.toISOString() };
  }

  const cut = (v, n) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, n) : null;
  };

  function buildRows(table, existing) {
    const header = table[0] || [];
    const colField = [];
    const seen = new Set();
    const ignored = [];
    header.forEach((h, i) => {
      const f = LOOKUP[normHeader(h)];
      if (f && !seen.has(f)) { seen.add(f); colField[i] = f; }
      else if (String(h || "").trim()) ignored.push(String(h).trim());
    });
    if (!seen.has("name")) {
      throw new Error('No "Name" column found. The first row of your file must have headings like Name, Mobile, Email, Address.');
    }

    const known = new Set();
    existing.forEach((l) => {
      [l.mobile, l.whatsapp].forEach((p) => { const k = last10(p); if (k.length === 10) known.add(k); });
    });

    const out = [];
    for (let r = 1; r < table.length; r++) {
      const cells = table[r];
      const raw = {};
      colField.forEach((f, i) => { if (f) raw[f] = cells[i] ?? ""; });
      if (!Object.values(raw).some((v) => String(v).trim())) continue;

      const line = r + 1;
      const warnings = [];
      const data = {
        name: cut(raw.name, 160),
        mobile: null, whatsapp: null,
        email: null,
        address: cut(raw.address, 500),
        city_area: cut(raw.city_area, 160),
        interest: cut(raw.interest, 160),
        product_service: cut(raw.product_service, 160),
        budget: null,
        priority: "normal",
        next_follow_up_at: null,
        notes: cut(raw.notes, 5000)
      };

      const mob = cleanPhone(raw.mobile);
      const wa = cleanPhone(raw.whatsapp);
      data.mobile = mob.v;
      data.whatsapp = wa.v;
      if (mob.bad) warnings.push("Mobile not valid");
      if (wa.bad) warnings.push("WhatsApp not valid");

      const em = String(raw.email ?? "").trim();
      if (em) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) data.email = em.slice(0, 160).toLowerCase();
        else warnings.push("Email not valid");
      }

      const bd = String(raw.budget ?? "").replace(/[₹,\s]|rs\.?|inr/gi, "");
      if (bd) {
        const n = Number(bd);
        if (Number.isFinite(n) && n >= 0) data.budget = n;
        else warnings.push("Budget not a number");
      }

      const pr = String(raw.priority ?? "").trim().toLowerCase();
      if (PRIORITIES.includes(pr)) data.priority = pr;

      const fu = cleanDate(raw.next_follow_up_at);
      data.next_follow_up_at = fu.v;
      if (fu.bad) warnings.push("Follow-up date not valid");

      let status = "ok";
      let reason = "";
      if (!data.name) { status = "invalid"; reason = "Name is missing"; }
      else if (mob.bad && !data.whatsapp) { status = "invalid"; reason = "Mobile number is not valid"; }
      else {
        const keys = [data.mobile, data.whatsapp].map(last10).filter((k) => k.length === 10);
        if (keys.some((k) => known.has(k))) { status = "duplicate"; reason = "Mobile already exists"; }
        else keys.forEach((k) => known.add(k));
      }
      out.push({ line, data, status, reason, warnings });
    }
    return { rows: out, ignored, mapped: Array.from(seen) };
  }

  /* ---------- UI ---------- */

  function setPreview(html) { $("importPreview").innerHTML = html; }

  function reset() {
    S.rows = [];
    S.fileName = "";
    $("importFile").value = "";
    $("importConfirm").disabled = true;
    $("importConfirm").textContent = "Import leads";
    setPreview("");
  }

  function renderPreview(info) {
    const ok = S.rows.filter((r) => r.status === "ok");
    const dup = S.rows.filter((r) => r.status === "duplicate");
    const bad = S.rows.filter((r) => r.status === "invalid");
    const warn = ok.filter((r) => r.warnings.length);

    const sample = S.rows.slice(0, 8).map((r) => `
      <tr class="imp-${r.status}">
        <td>${r.line}</td>
        <td>${esc(r.data.name || "—")}</td>
        <td>${esc(r.data.mobile || r.data.whatsapp || "—")}</td>
        <td>${esc(r.data.email || "—")}</td>
        <td>${esc(r.data.address || r.data.city_area || "—")}</td>
        <td>${r.status === "ok" ? (r.warnings.length ? "Ready*" : "Ready") : esc(r.reason)}</td>
      </tr>`).join("");

    const problems = bad.concat(dup).slice(0, 10).map((r) => `<li>Row ${r.line}: ${esc(r.reason)}</li>`).join("");

    setPreview(`
      <div class="imp-chips">
        <span class="pill status-won">Ready: ${ok.length}</span>
        <span class="pill status-paused">Duplicates (skipped): ${dup.length}</span>
        <span class="pill status-lost">Invalid (skipped): ${bad.length}</span>
      </div>
      <p class="sub">File: ${esc(S.fileName)} · Matched columns: ${info.mapped.map((f) => esc(LABELS[f])).join(", ")}</p>
      ${info.ignored.length ? `<p class="sub">Ignored columns: ${info.ignored.map(esc).join(", ")}</p>` : ""}
      ${warn.length ? `<p class="sub">* ${warn.length} lead(s) have a small issue (for example an invalid email). They will still be imported without that value.</p>` : ""}
      <div class="table-wrap"><table class="imp-table">
        <thead><tr><th>Row</th><th>Name</th><th>Mobile</th><th>Email</th><th>Address</th><th>Status</th></tr></thead>
        <tbody>${sample}</tbody>
      </table></div>
      ${S.rows.length > 8 ? `<p class="sub">Showing first 8 of ${S.rows.length} rows.</p>` : ""}
      ${problems ? `<ul class="imp-problems">${problems}</ul>` : ""}`);

    const btn = $("importConfirm");
    btn.disabled = !ok.length;
    btn.textContent = ok.length ? `Import ${ok.length} lead${ok.length === 1 ? "" : "s"}` : "Nothing to import";
  }

  async function onFile(file) {
    reset();
    if (!file) return;
    if (file.size > MAX_BYTES) { setPreview('<p class="imp-error">File is too large. Maximum size is 5 MB.</p>'); return; }
    setPreview('<p class="sub">Reading file…</p>');
    try {
      const table = (await readFile(file)).filter((row) => row.some((c) => String(c ?? "").trim()));
      if (table.length < 2) throw new Error("The file has no data rows. Row 1 should be the headings.");
      if (table.length - 1 > MAX_ROWS) throw new Error(`Too many rows. Please import up to ${MAX_ROWS} leads at a time.`);
      S.fileName = file.name;
      const existing = await D.fetchLeads();
      const info = buildRows(table, existing);
      S.rows = info.rows;
      if (!S.rows.length) throw new Error("No usable rows found in this file.");
      renderPreview(info);
    } catch (err) {
      console.error(err);
      setPreview(`<p class="imp-error">${esc(err.message || "Could not read this file.")}</p>`);
    }
  }

  async function runImport() {
    if (S.busy) return;
    const ready = S.rows.filter((r) => r.status === "ok");
    if (!ready.length) return;
    S.busy = true;
    const btn = $("importConfirm");
    btn.disabled = true;
    let done = 0;
    let errMsg = "";
    try {
      const cid = await D.ensureClient();
      for (let i = 0; i < ready.length; i += CHUNK) {
        btn.textContent = `Importing… ${done}/${ready.length}`;
        const chunk = ready.slice(i, i + CHUNK);
        const payload = chunk.map((r) => Object.assign({}, r.data, { client_id: cid, source: "offline" }));
        const { data, error } = await D.db.from("leads").insert(payload).select("id");
        if (error) { errMsg = error.message || "Insert failed."; break; }
        const ids = (data || []).map((x) => x.id);

        const meta = { capture: "dashboard_import", file: S.fileName };
        const [a, b, c] = await Promise.all([
          D.db.from("lead_sources").insert(ids.map((id) => ({ client_id: cid, lead_id: id, source_type: "offline", source_ref: null, metadata: meta }))),
          D.db.from("lead_timeline").insert(ids.map((id) => ({
            client_id: cid, lead_id: id, event_type: "lead_created", title: "Lead imported from file",
            description: `Lead imported from ${S.fileName}.`, source: "dashboard", metadata: meta
          }))),
          D.db.from("lead_profiles").insert(ids.map((id) => ({ lead_id: id, intent: "unknown", urgency: "unknown" })))
        ]);
        [a, b, c].forEach((x) => { if (x.error) console.error("[GLIME Import] related insert failed:", x.error); });
        done += ids.length;
      }
    } catch (err) {
      console.error(err);
      errMsg = err.message || "Import failed.";
    }

    const skipped = S.rows.length - ready.length;
    let hint = "";
    if (/column|schema/i.test(errMsg)) hint = " The email / address columns may not exist in the database yet.";
    setPreview(errMsg
      ? `<p class="imp-error">Imported ${done} of ${ready.length} leads. Stopped because: ${esc(errMsg)}.${esc(hint)}</p>`
      : `<p class="imp-success">Done. ${done} lead${done === 1 ? "" : "s"} imported. ${skipped} row${skipped === 1 ? "" : "s"} skipped (duplicate or invalid).</p>`);
    btn.textContent = "Import leads";
    S.rows = [];
    $("importFile").value = "";
    S.busy = false;
    if (done) document.getElementById("refreshBtn")?.click();
  }

  function downloadSample() {
    const rows = [
      ["Name", "Mobile", "WhatsApp", "Email", "Address", "City / Area", "Interest", "Product / Service", "Budget", "Priority", "Next follow-up", "Notes"],
      ["Rahul Sharma", "9876543210", "9876543210", "rahul@example.com", "12, MG Road, Near City Mall", "Pune", "Wedding collection", "Sherwani", "25000", "high", "20/11/2026 11:00", "Walk-in customer"]
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "glime-leads-sample.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $("importLeadBtn")?.addEventListener("click", () => { reset(); modal.classList.remove("hidden"); });
  $("importFile").addEventListener("change", (e) => onFile(e.target.files && e.target.files[0]));
  $("importConfirm").addEventListener("click", runImport);
  $("importSample").addEventListener("click", downloadSample);
})();
