/* =========================================================
   GLIME ADMIN - Export Network
   Adds an "Export Network" tab to the admin sidebar with five sections:

   1. Distributors
        - Applications sent from export-program.html (pending first)
        - Approve (optionally marking "trade licence checked"), reject with
          a written reason, revoke an approved listing with a reason,
          approve a rejected or revoked one again
        - ADD DISTRIBUTOR MANUALLY: admin fills the same details and the
          listing is published straight away. It shows in the Export Network
          directory on others.html for approved clients.
        - Edit any listing
   2. Client access
        - Choose which clients can open the Export Network in Others.
          Grant or revoke per client.
   3. Requests
        - Introduction requests sent by clients. Admin sets the status the
          client sees (Requested, In progress, Connected, Declined, Closed)
          and keeps a private note.
   4. Agent conversations
        - Read every Export Agent WhatsApp conversation (translated into
          the language the admin picks, original shown under each message),
          pause, resume or end any conversation.
   5. Agent settings
        - Switch the whole Export Agent on or off, daily limit of new
          conversations per client, message limit per conversation, and
          the countries conversations are allowed in (UAE first).

   Frontend only. Does not modify any other addon.
   Backend contract: EXPORT_NETWORK_ADMIN_BACKEND_SPEC.md (sections 1-3)
                     EXPORT_AGENT_BACKEND_SPEC.md (sections 1-2 of the admin part)

   RPCs used (all must check is_glime_admin()):
     admin_export_distributors_list(p_status text)
     admin_export_application_review(p_application_id uuid, p_action text,
                                     p_note text, p_licence_verified boolean)
     admin_export_distributor_create(p_distributor jsonb)
     admin_export_distributor_update(p_id uuid, p_distributor jsonb)
     admin_export_access_list(p_search text)
     admin_export_access_set(p_client_id text, p_allow boolean, p_note text)
     admin_export_requests_list(p_status text)
     admin_export_request_update(p_request_id uuid, p_status text, p_note text)
     admin_export_agent_conversations(p_status text, p_search text, p_limit int, p_offset int)
     admin_export_agent_messages(p_conversation_id uuid, p_view_language text)
     admin_export_agent_control(p_conversation_id uuid, p_action text, p_note text)
     admin_export_agent_settings_get()
     admin_export_agent_settings_set(p_settings jsonb)
========================================================= */
(() => {
  "use strict";
  const ID = "glime-export-admin";
  const STYLE = ID + "-style";
  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  const MAX_NOTE = 500;
  const FIRST_MARKET = "AE";
  const CPAGE = 30;

  /* ---------- reference lists (same as export-program.html) ---------- */
  const COUNTRIES = ("AF|Afghanistan;AL|Albania;DZ|Algeria;AD|Andorra;AO|Angola;AG|Antigua and Barbuda;AR|Argentina;AM|Armenia;AU|Australia;AT|Austria;AZ|Azerbaijan;BS|Bahamas;BH|Bahrain;BD|Bangladesh;BB|Barbados;BY|Belarus;BE|Belgium;BZ|Belize;BJ|Benin;BT|Bhutan;BO|Bolivia;BA|Bosnia and Herzegovina;BW|Botswana;BR|Brazil;BN|Brunei;BG|Bulgaria;BF|Burkina Faso;BI|Burundi;CV|Cabo Verde;KH|Cambodia;CM|Cameroon;CA|Canada;CF|Central African Republic;TD|Chad;CL|Chile;CN|China;CO|Colombia;KM|Comoros;CG|Congo;CD|Congo (Democratic Republic);CR|Costa Rica;CI|C\u00f4te d\u2019Ivoire;HR|Croatia;CU|Cuba;CY|Cyprus;CZ|Czechia;DK|Denmark;DJ|Djibouti;DM|Dominica;DO|Dominican Republic;EC|Ecuador;EG|Egypt;SV|El Salvador;GQ|Equatorial Guinea;ER|Eritrea;EE|Estonia;SZ|Eswatini;ET|Ethiopia;FJ|Fiji;FI|Finland;FR|France;GA|Gabon;GM|Gambia;GE|Georgia;DE|Germany;GH|Ghana;GR|Greece;GD|Grenada;GT|Guatemala;GN|Guinea;GW|Guinea-Bissau;GY|Guyana;HT|Haiti;HN|Honduras;HK|Hong Kong;HU|Hungary;IS|Iceland;IN|India;ID|Indonesia;IR|Iran;IQ|Iraq;IE|Ireland;IL|Israel;IT|Italy;JM|Jamaica;JP|Japan;JO|Jordan;KZ|Kazakhstan;KE|Kenya;KI|Kiribati;XK|Kosovo;KW|Kuwait;KG|Kyrgyzstan;LA|Laos;LV|Latvia;LB|Lebanon;LS|Lesotho;LR|Liberia;LY|Libya;LI|Liechtenstein;LT|Lithuania;LU|Luxembourg;MO|Macao;MG|Madagascar;MW|Malawi;MY|Malaysia;MV|Maldives;ML|Mali;MT|Malta;MH|Marshall Islands;MR|Mauritania;MU|Mauritius;MX|Mexico;FM|Micronesia;MD|Moldova;MC|Monaco;MN|Mongolia;ME|Montenegro;MA|Morocco;MZ|Mozambique;MM|Myanmar;NA|Namibia;NR|Nauru;NP|Nepal;NL|Netherlands;NZ|New Zealand;NI|Nicaragua;NE|Niger;NG|Nigeria;MK|North Macedonia;NO|Norway;OM|Oman;PK|Pakistan;PW|Palau;PS|Palestine;PA|Panama;PG|Papua New Guinea;PY|Paraguay;PE|Peru;PH|Philippines;PL|Poland;PT|Portugal;QA|Qatar;RO|Romania;RU|Russia;RW|Rwanda;KN|Saint Kitts and Nevis;LC|Saint Lucia;VC|Saint Vincent and the Grenadines;WS|Samoa;SM|San Marino;ST|S\u00e3o Tom\u00e9 and Pr\u00edncipe;SA|Saudi Arabia;SN|Senegal;RS|Serbia;SC|Seychelles;SL|Sierra Leone;SG|Singapore;SK|Slovakia;SI|Slovenia;SB|Solomon Islands;SO|Somalia;ZA|South Africa;KR|South Korea;SS|South Sudan;ES|Spain;LK|Sri Lanka;SD|Sudan;SR|Suriname;SE|Sweden;CH|Switzerland;SY|Syria;TW|Taiwan;TJ|Tajikistan;TZ|Tanzania;TH|Thailand;TL|Timor-Leste;TG|Togo;TO|Tonga;TT|Trinidad and Tobago;TN|Tunisia;TR|T\u00fcrkiye;TM|Turkmenistan;TV|Tuvalu;UG|Uganda;UA|Ukraine;AE|United Arab Emirates;GB|United Kingdom;US|United States;UY|Uruguay;UZ|Uzbekistan;VU|Vanuatu;VE|Venezuela;VN|Vietnam;YE|Yemen;ZM|Zambia;ZW|Zimbabwe")
    .split(";").map((r) => { const p = r.split("|"); return { id: p[0], label: p[1] }; });
  const BUSINESS_TYPES = ["Importer", "Distributor", "Wholesaler", "Retailer or chain store", "Trading company", "Sales agent or representative", "E-commerce seller", "Other"];
  const CATEGORIES = ["Food and beverages", "Spices and agro products", "Rice, grains and pulses", "Tea and coffee", "Textiles and fabrics", "Garments and apparel", "Footwear and leather", "Jewellery and accessories", "Home decor and handicrafts", "Furniture", "Electronics and appliances", "Beauty and personal care", "Health and wellness", "Pharma and medical supplies", "Machinery and industrial equipment", "Auto parts and accessories", "Chemicals and plastics", "Building materials and hardware", "Stationery and toys", "Packaging", "Other"];
  const IMPORT_VOL = ["Under $50,000", "$50,000 to $250,000", "$250,000 to $1 million", "$1 million to $5 million", "Over $5 million", "Prefer not to say"];
  const ORDER_VAL = ["Under $1,000", "$1,000 to $5,000", "$5,000 to $25,000", "$25,000 to $100,000", "Over $100,000"];
  const PAY_TERMS = ["Advance payment", "Letter of credit (LC)", "Net 30 days", "Net 60 days", "Escrow", "Other"];
  const SHIP_TERMS = ["EXW", "FOB", "CIF", "CFR", "DDP"];
  const LANGS = ["English", "Arabic", "Hindi", "Russian", "Chinese (Mandarin)", "French", "Spanish", "Portuguese", "German", "Italian", "Turkish", "Persian (Farsi)", "Urdu", "Bengali", "Tamil", "Indonesian", "Vietnamese", "Thai", "Japanese", "Korean", "Swahili", "Dutch"];
  const REQ_STATUS = [["requested", "Requested"], ["in_progress", "In progress"], ["active", "Connected"], ["declined", "Declined"], ["closed", "Closed"]];
  const CONV_FILTERS = [["all", "All"], ["needs_you", "Needs client"], ["active", "Active"], ["paused", "Paused"], ["closed", "Closed"], ["failed", "Failed"]];
  const CONV_LABEL = { queued: "Queued", active: "Active", needs_you: "Needs client", paused: "Paused", closed: "Closed", failed: "Failed" };

  /* ---------- state ---------- */
  let sb = null, sub = "dist";
  let dists = [], access = [], reqs = [];
  let dFilter = "pending", aFilter = "all", rFilter = "requested";
  let panel = null;          // { id, kind: 'approve' | 'reject' | 'revoke' }
  let form = null;           // null or { id: uuid|null, data: {...} }
  let busyId = null;
  const draft = {};          // note drafts keyed by record id
  let convs = [], convTotal = 0, convCounts = {}, cFilter = "all", openC = null, cMsgs = [], viewLang = "English", cTimer = null;
  let settings = null;

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const rows = (d) => (Array.isArray(d) ? d : d && Array.isArray(d.rows) ? d.rows : []);
  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
  const obj = (d) => { if (Array.isArray(d)) d = d[0]; return d && typeof d === "object" ? d : {}; };
  const st = (r) => String(r.status || "").toLowerCase();
  const day = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "\u2014"; };
  const dtm = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "\u2014"; };
  const isUrl = (u) => /^https?:\/\//i.test(String(u || ""));
  const fixUrl = (v) => (v && !/^https?:\/\//i.test(v) ? "https://" + v : v);
  const validUrl = (v) => /^https?:\/\/[^\s\/$.?#][^\s]*\.[^\s]{2,}$/i.test(v);
  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const validPhone = (v) => /^\+\d{8,15}$/.test(String(v).replace(/[^\d+]/g, ""));
  const link = (u) => (isUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>` : esc(u || "\u2014"));
  const openBtn = (u, label) => (isUrl(u) ? `<a class="gx-open" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} \u2197</a>` : "");
  const countryName = (code) => (COUNTRIES.find((c) => c.id === code) || {}).label || code || "";

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

  async function rpc(name, args) {
    const c = getSb();
    if (!c) throw new Error("Supabase client unavailable.");
    const { data, error } = await c.rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  function msg(t, kind) { const m = $("gxMsg"); if (!m) return; m.textContent = t || ""; m.className = "gx-msg" + (t ? " " + kind : ""); }
  function errText(e) {
    const m = String((e && e.message) || "").toLowerCase();
    if (m.includes("not_admin")) return "Admin access is required.";
    if (m.includes("note_required")) return "Please write the reason.";
    if (m.includes("note_too_long")) return "The reason is too long (maximum " + MAX_NOTE + " characters).";
    if (m.includes("invalid_transition")) return "This record was already changed. Refresh the list.";
    if (m.includes("not_found")) return "This record no longer exists. Refresh the list.";
    if (m.includes("duplicate")) return "A distributor with this email already has an open listing.";
    if (m.includes("invalid")) return "Some details are missing or not valid.";
    if (/could not find the function|pgrst202|does not exist/.test(m)) return "Backend is not ready: the Export Network admin functions are missing in Supabase.";
    return (e && e.message) || "Request failed.";
  }

  /* ---------- styles ---------- */
  function styles() {
    if ($(STYLE)) return;
    const s = document.createElement("style");
    s.id = STYLE;
    s.textContent = `
      #${ID}{padding-top:4px}
      #${ID} .gx-title{color:#7c9cff;font-weight:600;font-size:1rem;margin-bottom:7px}
      #${ID} .gx-sub{color:#9ba7b7;font-size:.75rem;line-height:1.5;margin-bottom:14px}
      #${ID} .gx-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}
      #${ID} .gx-sum div{padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.02)}
      #${ID} .gx-sum small{display:block;color:#687587;font-size:.68rem;margin-bottom:4px}
      #${ID} .gx-sum b{color:#fff;font-size:1.15rem}
      #${ID} .gx-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      #${ID} .gx-main{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.08)}
      #${ID} .gx-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      #${ID} .gx-bar input{flex:1 1 200px;min-width:0;padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#fff;font:inherit;box-sizing:border-box}
      #${ID} .gx-bar select{padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:#101826;color:#fff;font:inherit}
      #${ID} .gx-card{padding:15px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02);margin-bottom:12px}
      #${ID} .gx-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
      #${ID} .gx-name{color:#fff;font-weight:700;font-size:.92rem;word-break:break-word}
      #${ID} .gx-meta{color:#687587;font-size:.68rem;margin-top:3px;word-break:break-all}
      #${ID} .gx-st{padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.1);color:#9ba7b7;white-space:nowrap}
      #${ID} .gx-st.approved,#${ID} .gx-st.active{color:#00ff88;border-color:rgba(0,255,136,.3)}
      #${ID} .gx-st.pending,#${ID} .gx-st.requested,#${ID} .gx-st.in_progress,#${ID} .gx-st.needs_you,#${ID} .gx-st.queued{color:#ffc857;border-color:rgba(255,200,87,.35)}
      #${ID} .gx-st.rejected,#${ID} .gx-st.revoked,#${ID} .gx-st.declined,#${ID} .gx-st.failed{color:#ff5263;border-color:rgba(255,82,99,.35)}
      #${ID} .gx-chip{display:inline-block;padding:3px 9px;border-radius:8px;border:1px solid rgba(124,156,255,.4);background:rgba(124,156,255,.08);color:#a9bcff;font:700 .74rem ui-monospace,SFMono-Regular,Menlo,monospace;margin-right:6px;user-select:all}
      #${ID} .gx-chip.ok{border-color:rgba(0,255,136,.35);background:rgba(0,255,136,.07);color:#00ff88;font-family:system-ui,sans-serif;user-select:auto}
      #${ID} .gx-chip.mu{border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#9ba7b7;font-family:system-ui,sans-serif;user-select:auto}
      #${ID} dl{display:grid;grid-template-columns:130px 1fr;gap:5px 10px;font-size:.76rem;margin:0 0 12px}
      #${ID} dt{color:#687587}#${ID} dd{margin:0;color:#dfe7ef;word-break:break-word}
      #${ID} dd a{color:#7c9cff}
      #${ID} .gx-why{margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,82,99,.3);background:rgba(255,82,99,.06);color:#ffd5da;font-size:.76rem;line-height:1.5;word-break:break-word}
      #${ID} .gx-priv{margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#c7d0dc;font-size:.76rem;line-height:1.5;word-break:break-word}
      #${ID} .gx-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      #${ID} .gx-row + .gx-row{margin-top:8px}
      #${ID} .gx-open{display:inline-flex;align-items:center;gap:4px;border-radius:9px;padding:9px 13px;font:700 .76rem system-ui,sans-serif;text-decoration:none;background:rgba(124,156,255,.16);color:#a9bcff;border:1px solid rgba(124,156,255,.35)}
      #${ID} button{border:0;border-radius:9px;padding:9px 13px;font:700 .76rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.09);color:#fff}
      #${ID} button.on{background:#7c9cff;color:#07101f}
      #${ID} button.ok{background:#00c878;color:#04140c}
      #${ID} button.no{background:#ff5263;color:#1a0408}
      #${ID} button.pri{background:#7c9cff;color:#07101f}
      #${ID} button:disabled{opacity:.55;cursor:not-allowed}
      #${ID} .gx-panel{margin-top:12px;padding:12px;border-radius:12px;border:1px solid rgba(124,156,255,.3);background:rgba(124,156,255,.05)}
      #${ID} .gx-panel.bad{border-color:rgba(255,82,99,.3);background:rgba(255,82,99,.05)}
      #${ID} .gx-panel label{display:block;color:#dfe7ef;font-size:.74rem;font-weight:600;margin-bottom:6px}
      #${ID} textarea,#${ID} .gx-f input[type=text],#${ID} .gx-f input[type=email],#${ID} .gx-f input[type=tel],#${ID} .gx-f input[type=url],#${ID} .gx-f input[type=number],#${ID} .gx-f select{width:100%;padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#fff;font:inherit;font-size:.8rem;box-sizing:border-box}
      #${ID} textarea{min-height:78px;resize:vertical}
      #${ID} .gx-f select option{background:#101826;color:#fff}
      #${ID} .gx-cnt{color:#687587;font-size:.68rem;margin:4px 0 10px;text-align:right}
      #${ID} .gx-chk{display:flex;gap:8px;align-items:center;margin:0 0 10px;color:#dfe7ef;font-size:.78rem;font-weight:600}
      #${ID} .gx-chk input{width:17px;height:17px;margin:0;accent-color:#00c878}
      #${ID} .gx-form{padding:16px;border:1px solid rgba(124,156,255,.3);border-radius:14px;background:rgba(124,156,255,.04);margin-bottom:14px}
      #${ID} .gx-form h3{margin:0 0 4px;color:#fff;font-size:.95rem}
      #${ID} .gx-form .gx-sub{margin-bottom:12px}
      #${ID} .gx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #${ID} .gx-f{margin-bottom:12px;min-width:0}
      #${ID} .gx-f>label{display:block;color:#c7d0dc;font-size:.72rem;font-weight:700;margin-bottom:5px}
      #${ID} .gx-f small{display:block;color:#687587;font-size:.68rem;margin-top:4px}
      #${ID} .gx-f.full{grid-column:1/-1}
      #${ID} .gx-pills{display:flex;flex-wrap:wrap;gap:7px}
      #${ID} .gx-pill{position:relative;cursor:pointer}
      #${ID} .gx-pill input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
      #${ID} .gx-pill span{display:inline-block;padding:6px 11px;border-radius:99px;border:1px solid rgba(255,255,255,.15);color:#9ba7b7;font-size:.74rem;font-weight:600}
      #${ID} .gx-pill input:checked+span{background:rgba(124,156,255,.16);border-color:rgba(124,156,255,.6);color:#fff}
      #${ID} .gx-pill input:focus-visible+span{outline:2px solid #7c9cff;outline-offset:2px}
      #${ID} .gx-chat{background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:12px;max-height:520px;overflow:auto;margin-bottom:12px}
      #${ID} .gx-bub{max-width:86%;padding:9px 12px;border-radius:13px;font-size:.78rem;margin-bottom:9px;white-space:pre-wrap;word-break:break-word;color:#e8eef5}
      #${ID} .gx-bub small{display:block;color:#7d8a9b;font-size:.64rem;font-weight:700;margin-bottom:3px}
      #${ID} .gx-bub.in{background:rgba(124,156,255,.1);border:1px solid rgba(124,156,255,.25)}
      #${ID} .gx-bub.out{margin-left:auto;background:rgba(0,200,120,.1);border:1px solid rgba(0,200,120,.28)}
      #${ID} .gx-bub.note{margin-left:auto;background:rgba(255,200,87,.08);border:1px dashed rgba(255,200,87,.45)}
      #${ID} .gx-bub.sys{margin:0 auto 9px;text-align:center;color:#9ba7b7;border:1px solid rgba(255,255,255,.1)}
      #${ID} .gx-bub .og{margin-top:6px;padding-top:6px;border-top:1px dashed rgba(255,255,255,.14);color:#9ba7b7;font-size:.72rem}
      #${ID} .gx-bub .tm{margin-top:4px;color:#687587;font-size:.62rem}
      #${ID} .gx-msg{margin-top:10px;padding:10px 12px;border-radius:9px;font-size:.74rem;display:none}
      #${ID} .gx-msg.s{display:block;color:#00ff88;background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.25)}
      #${ID} .gx-msg.e{display:block;color:#ff5263;background:rgba(255,82,99,.07);border:1px solid rgba(255,82,99,.25)}
      #${ID} .gx-empty{padding:16px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;color:#9ba7b7;font-size:.78rem;text-align:center}
      @media(max-width:650px){#${ID} dl{grid-template-columns:100px 1fr}#${ID} .gx-grid{grid-template-columns:1fr}#${ID} .gx-bub{max-width:94%}}`;
    document.head.appendChild(s);
  }

  /* ---------- data ---------- */
  async function loadDists() {
    msg("Loading distributors...", "s");
    try { dists = rows(await rpc("admin_export_distributors_list", { p_status: null })); msg("", ""); }
    catch (e) { dists = []; msg(errText(e), "e"); }
    render();
  }
  async function loadAccess() {
    msg("Loading clients...", "s");
    try { access = rows(await rpc("admin_export_access_list", { p_search: null })); msg("", ""); }
    catch (e) { access = []; msg(errText(e), "e"); }
    render();
  }
  async function loadReqs() {
    msg("Loading requests...", "s");
    try { reqs = rows(await rpc("admin_export_requests_list", { p_status: null })); msg("", ""); }
    catch (e) { reqs = []; msg(errText(e), "e"); }
    render();
  }
  async function loadConvs(append) {
    if (!append) msg("Loading conversations...", "s");
    try {
      const term = String((($("gxSearch") || {}).value) || "").trim();
      const d = obj(await rpc("admin_export_agent_conversations", { p_status: cFilter === "all" ? "" : cFilter, p_search: term, p_limit: CPAGE, p_offset: append ? convs.length : 0 }));
      convs = append ? convs.concat(arr(d.items)) : arr(d.items);
      convTotal = typeof d.total === "number" ? d.total : convs.length;
      convCounts = d.counts || {};
      msg("", "");
    } catch (e) { if (!append) { convs = []; convTotal = 0; } msg(errText(e), "e"); }
    render();
  }
  async function loadSettings() {
    msg("Loading settings...", "s");
    try { settings = obj(await rpc("admin_export_agent_settings_get")); msg("", ""); }
    catch (e) { settings = null; msg(errText(e), "e"); }
    render();
  }
  function loadCurrent() {
    if (sub === "dist") return loadDists();
    if (sub === "access") return loadAccess();
    if (sub === "reqs") return loadReqs();
    if (sub === "convs") return openC ? openConv(openC.id, false) : loadConvs(false);
    return loadSettings();
  }

  async function review(id, action, note, licence) {
    busyId = id; render(); msg("", "");
    try {
      await rpc("admin_export_application_review", { p_application_id: id, p_action: action, p_note: note || null, p_licence_verified: !!licence });
      const name = (dists.find((x) => x.id === id) || {}).company_name || "Distributor";
      panel = null; delete draft[id]; busyId = null;
      await loadDists();
      const done = { approve: " approved and listed for clients.", reject: " rejected. The reason is saved with the application.", revoke: " removed from the directory. The reason is saved." }[action] || " updated.";
      msg(name + done, "s");
    } catch (e) { busyId = null; render(); msg(errText(e), "e"); }
  }

  async function setAccess(clientId, allow) {
    busyId = clientId; render(); msg("", "");
    try {
      await rpc("admin_export_access_set", { p_client_id: clientId, p_allow: allow, p_note: null });
      busyId = null;
      await loadAccess();
      msg(clientId + (allow ? " can now open the Export Network." : " can no longer open the Export Network."), "s");
    } catch (e) { busyId = null; render(); msg(errText(e), "e"); }
  }

  async function updateReq(id, status) {
    const note = String(draft["r:" + id] ?? "").trim();
    if (note.length > MAX_NOTE) { msg(errText({ message: "note_too_long" }), "e"); return; }
    busyId = id; render(); msg("", "");
    try {
      await rpc("admin_export_request_update", { p_request_id: id, p_status: status, p_note: note || null });
      busyId = null; delete draft["r:" + id];
      await loadReqs();
      msg("Request updated.", "s");
    } catch (e) { busyId = null; render(); msg(errText(e), "e"); }
  }

  /* ---------- agent conversations ---------- */
  function stopCTimer() { if (cTimer) { clearInterval(cTimer); cTimer = null; } }
  async function openConv(id, silent) {
    if (!silent) msg("Loading conversation...", "s");
    try {
      const d = obj(await rpc("admin_export_agent_messages", { p_conversation_id: id, p_view_language: viewLang }));
      openC = Object.assign({}, (openC && openC.id === id ? openC : convs.find((x) => x.id === id)) || { id }, d.conversation || {});
      cMsgs = arr(d.messages);
      if (!silent) msg("", "");
    } catch (e) { if (!silent) msg(errText(e), "e"); return; }
    stopCTimer();
    cTimer = setInterval(() => { if (!$(ID) || sub !== "convs" || !openC) { stopCTimer(); return; } if (!document.hidden) openConv(openC.id, true); }, 15000);
    render();
  }
  async function convControl(id, action) {
    let note = null;
    if (action !== "resume") { const n = window.prompt("Reason (optional, private):", ""); if (n === null) return; note = n.trim().slice(0, MAX_NOTE) || null; }
    busyId = id; render(); msg("", "");
    try {
      await rpc("admin_export_agent_control", { p_conversation_id: id, p_action: action, p_note: note });
      busyId = null;
      await openConv(id, true);
      msg("Conversation updated.", "s");
    } catch (e) { busyId = null; render(); msg(errText(e), "e"); }
  }

  async function saveSettings() {
    const g = (i) => ($(i) || {});
    const codes = String(g("gxs-codes").value || "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
    const bad = codes.find((c) => !/^[A-Z]{2}$/.test(c));
    const daily = Number(g("gxs-daily").value), maxm = Number(g("gxs-max").value);
    if (bad) { msg('"' + bad + '" is not a 2-letter country code. Example: AE, SA, QA.', "e"); return; }
    if (!Number.isInteger(daily) || daily < 1 || daily > 200) { msg("Daily new conversations must be a whole number from 1 to 200.", "e"); return; }
    if (!Number.isInteger(maxm) || maxm < 10 || maxm > 1000) { msg("Messages per conversation must be a whole number from 10 to 1000.", "e"); return; }
    if (!codes.length) { msg("Allow at least one country.", "e"); return; }
    const enabled = !!g("gxs-enabled").checked;
    if (!window.confirm((enabled ? "Save settings? The Export Agent stays ON." : "Switch the Export Agent OFF? No new messages will be sent until you switch it on.") )) return;
    busyId = "settings"; render(); msg("", "");
    try {
      await rpc("admin_export_agent_settings_set", { p_settings: { enabled, daily_new_conversations: daily, max_messages_per_conversation: maxm, allowed_country_codes: codes } });
      busyId = null;
      await loadSettings();
      msg("Agent settings saved.", "s");
    } catch (e) { busyId = null; render(); msg(errText(e), "e"); }
  }

  /* ---------- distributor form (manual add / edit) ---------- */
  const emptyForm = () => ({ categories: [], payment_terms: [], shipping_terms: [], languages: [], licence_verified: false, country_code: "" });
  const fld = (label, inner, cls, hint) => `<div class="gx-f ${cls || ""}"><label>${label}</label>${inner}${hint ? `<small>${hint}</small>` : ""}</div>`;
  const inp = (id, v, ph, type) => `<input id="gxf-${id}" type="${type || "text"}" value="${esc(v)}" placeholder="${esc(ph || "")}" maxlength="250">`;
  const selOpts = (list, cur, ph) => `<option value="">${esc(ph)}</option>` + list.map((o) => {
    const v = typeof o === "string" ? o : o.id, l = typeof o === "string" ? o : o.label;
    return `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`;
  }).join("");
  const pills = (name, list, cur) => list.map((v) => `<label class="gx-pill"><input type="checkbox" name="${name}" value="${esc(v)}"${cur.includes(v) ? " checked" : ""}><span>${esc(v)}</span></label>`).join("");

  function formHtml() {
    const d = form.data, editing = !!form.id;
    const yNow = new Date().getFullYear(), years = [];
    for (let y = yNow; y >= 1900; y--) years.push(String(y));
    const langs = arr(d.languages);
    const extra = langs.filter((l) => !LANGS.includes(l)).join(", ");
    return `<div class="gx-form" id="gxForm">
      <h3>${editing ? "Edit distributor" : "Add a distributor manually"}</h3>
      <div class="gx-sub">${editing ? "Changes show in the client directory straight away for approved listings." : "The listing is published immediately and appears in the Export Network on Others for approved clients. Clients never see the contact details."}</div>
      <div class="gx-grid">
        ${fld("Registered company name *", inp("company_name", d.company_name))}
        ${fld("Trading or brand name", inp("trade_name", d.trade_name))}
        ${fld("Business type *", `<select id="gxf-business_type">${selOpts(BUSINESS_TYPES, d.business_type, "Select one")}</select>`)}
        ${fld("Year established", `<select id="gxf-established_year">${selOpts(years, String(d.established_year || ""), "Select year")}</select>`)}
        ${fld("Country *", `<select id="gxf-country_code">${selOpts(COUNTRIES, d.country_code, "Select country")}</select>`, "", "UAE is the first market.")}
        ${fld("City *", inp("city", d.city))}
        ${fld("Business address", inp("address", d.address), "full")}
        ${fld("Registration or trade licence number", inp("registration_number", d.registration_number))}
        ${fld("Issuing authority", inp("issuing_authority", d.issuing_authority))}
        ${fld("Tax or VAT number", inp("tax_id", d.tax_id))}
        ${fld("Company website", inp("website", d.website, "www.example.com", "url"))}
        ${fld("Link to licence or company profile", inp("docs_link", d.docs_link, "Google Drive, Dropbox or LinkedIn link", "url"), "full")}
        ${fld("About the business", `<textarea id="gxf-about" maxlength="600">${esc(d.about || "")}</textarea>`, "full")}
        ${fld("Product categories * (choose all that apply)", `<div class="gx-pills">${pills("gxcat", CATEGORIES, arr(d.categories))}</div>`, "full")}
        ${fld("Specific products", `<textarea id="gxf-products_text" maxlength="800">${esc(d.products_text || "")}</textarea>`, "full")}
        ${fld("Yearly import volume", `<select id="gxf-import_volume">${selOpts(IMPORT_VOL, d.import_volume, "Select a range")}</select>`)}
        ${fld("Typical order value", `<select id="gxf-order_value">${selOpts(ORDER_VAL, d.order_value, "Select a range")}</select>`)}
        ${fld("Payment terms accepted", `<div class="gx-pills">${pills("gxpay", PAY_TERMS, arr(d.payment_terms))}</div>`, "full")}
        ${fld("Shipping terms preferred", `<div class="gx-pills">${pills("gxship", SHIP_TERMS, arr(d.shipping_terms))}</div>`, "full")}
        ${fld("Certifications required", inp("certifications", d.certifications, "For example: Halal, FSSAI, ISO 22000"), "full")}
        ${fld("Contact person *", inp("contact_name", d.contact_name))}
        ${fld("Job title", inp("designation", d.designation))}
        ${fld("Business email", inp("email", d.email, "", "email"))}
        ${fld("Phone (with country code)", inp("phone", d.phone, "+971 50 123 4567", "tel"))}
        ${fld("WhatsApp (with country code)", inp("whatsapp", d.whatsapp, "+971 50 123 4567", "tel"), "", "At least one of email, phone or WhatsApp is needed. These are private and never shown to clients. The Export Agent uses the WhatsApp number (or phone) to message the distributor.")}
        ${fld("Languages * (choose all that apply)", `<div class="gx-pills">${pills("gxlang", LANGS, langs)}</div>`, "full")}
        ${fld("Other languages", inp("langextra", extra, "Separate with commas"), "full")}
        ${fld("Preferred language for messages *", `<select id="gxf-primary_language">${selOpts(langs, d.primary_language, "Select one")}</select>`, "", "The Export Agent talks to this distributor in this language.")}
        ${fld("Admin note (private)", `<textarea id="gxf-admin_note" maxlength="${MAX_NOTE}">${esc(d.admin_note || "")}</textarea>`, "full")}
      </div>
      <label class="gx-chk"><input type="checkbox" id="gxf-licence_verified"${d.licence_verified ? " checked" : ""}> Trade licence checked (clients see a "Licence checked" badge)</label>
      <div class="gx-row"><button class="ok" data-act="form-save" type="button" ${busyId === "form" ? "disabled" : ""}>${busyId === "form" ? "Saving..." : editing ? "Save changes" : "Add and publish"}</button><button data-act="form-cancel" type="button">Cancel</button></div>
    </div>`;
  }

  function readForm() {
    const g = (id) => String(($("gxf-" + id) || {}).value || "").trim();
    const checks = (name) => [...document.querySelectorAll(`#${ID} input[name="${name}"]:checked`)].map((i) => i.value);
    const langs = [...new Set(checks("gxlang").concat(g("langextra").split(",").map((x) => x.trim()).filter(Boolean)))];
    const code = g("country_code");
    return {
      company_name: g("company_name"), trade_name: g("trade_name"), business_type: g("business_type"),
      established_year: g("established_year") ? Number(g("established_year")) : null,
      country: countryName(code), country_code: code, city: g("city"), address: g("address"),
      registration_number: g("registration_number"), issuing_authority: g("issuing_authority"), tax_id: g("tax_id"),
      website: fixUrl(g("website")), docs_link: fixUrl(g("docs_link")), about: g("about"),
      categories: checks("gxcat"), products_text: g("products_text"), import_volume: g("import_volume"), order_value: g("order_value"),
      payment_terms: checks("gxpay"), shipping_terms: checks("gxship"), certifications: g("certifications"),
      contact_name: g("contact_name"), designation: g("designation"), email: g("email").toLowerCase(),
      phone: g("phone").replace(/[^\d+]/g, ""), whatsapp: g("whatsapp").replace(/[^\d+]/g, ""),
      languages: langs, primary_language: g("primary_language"),
      licence_verified: !!($("gxf-licence_verified") || {}).checked, admin_note: g("admin_note")
    };
  }

  function validateForm(o) {
    if (!o.company_name) return "Enter the company name.";
    if (!o.business_type) return "Choose the business type.";
    if (!o.country_code) return "Choose the country.";
    if (!o.city) return "Enter the city.";
    if (!o.categories.length) return "Choose at least one product category.";
    if (!o.contact_name) return "Enter the contact person.";
    if (!o.email && !o.phone && !o.whatsapp) return "Add at least one of email, phone or WhatsApp.";
    if (o.email && !validEmail(o.email)) return "The email is not valid.";
    if (o.phone && !validPhone(o.phone)) return "Enter the phone with the country code, for example +971 50 123 4567.";
    if (o.whatsapp && !validPhone(o.whatsapp)) return "Enter the WhatsApp number with the country code.";
    if (o.website && !validUrl(o.website)) return "The website address is not valid.";
    if (o.docs_link && !validUrl(o.docs_link)) return "The licence or profile link is not valid.";
    if (!o.languages.length) return "Choose at least one language.";
    if (!o.primary_language) return "Choose the preferred language for messages.";
    if (!o.languages.includes(o.primary_language)) return "The preferred language must be one of the selected languages.";
    if (o.admin_note.length > MAX_NOTE) return "The admin note is too long (maximum " + MAX_NOTE + " characters).";
    return "";
  }

  function syncPrimary() {
    const s = $("gxf-primary_language"); if (!s) return;
    const keep = s.value;
    const checked = [...document.querySelectorAll(`#${ID} input[name="gxlang"]:checked`)].map((i) => i.value);
    const extra = String(($("gxf-langextra") || {}).value || "").split(",").map((x) => x.trim()).filter(Boolean);
    const all = [...new Set(checked.concat(extra))];
    s.innerHTML = selOpts(all, all.includes(keep) ? keep : (all.length === 1 ? all[0] : ""), "Select one");
  }

  async function saveForm() {
    const o = readForm();
    const bad = validateForm(o);
    if (bad) { msg(bad, "e"); return; }
    if (!form.id && o.country_code !== FIRST_MARKET && !window.confirm("This distributor is outside the UAE (" + o.country + "). UAE is the first market. Add it anyway?")) return;
    busyId = "form"; render(); msg("", "");
    try {
      if (form.id) await rpc("admin_export_distributor_update", { p_id: form.id, p_distributor: o });
      else await rpc("admin_export_distributor_create", { p_distributor: o });
      const created = !form.id;
      form = null; busyId = null;
      if (created) dFilter = "approved";
      await loadDists();
      msg(created ? o.company_name + " added. It is now visible in the client directory." : "Changes saved.", "s");
    } catch (e) { busyId = null; render(); msg(errText(e), "e"); }
  }

  /* ---------- render: distributors ---------- */
  function dFiltered() {
    const term = (($("gxSearch") || {}).value || "").trim().toLowerCase();
    return dists.filter((r) => {
      if (dFilter !== "all" && st(r) !== dFilter) return false;
      return !term || [r.company_name, r.trade_name, r.contact_name, r.email, r.phone, r.whatsapp, r.city, r.country, r.reference_id, arr(r.categories).join(" ")].join(" ").toLowerCase().includes(term);
    });
  }

  function dCard(r) {
    const s = st(r), busy = busyId === r.id, dis = busy ? "disabled" : "";
    const where = [r.city, r.country || countryName(r.country_code)].filter(Boolean).join(", ");
    const src = r.source === "admin" ? "Added by admin" : "Public application";
    const open = panel && panel.id === r.id ? panel.kind : "";
    let actions = "";
    if (!open) {
      const edit = `<button data-act="edit" ${dis}>Edit</button>`;
      if (s === "pending") actions = `<div class="gx-row"><button class="ok" data-act="approve-open" ${dis}>Approve</button><button class="no" data-act="reject-open" ${dis}>Reject</button>${edit}</div>`;
      else if (s === "approved") actions = `<div class="gx-row"><button class="no" data-act="revoke-open" ${dis}>Remove from directory</button>${edit}</div>`;
      else actions = `<div class="gx-row"><button class="ok" data-act="approve-open" ${dis}>Approve again</button>${edit}</div>`;
    }
    let pan = "";
    if (open === "approve") {
      pan = `<div class="gx-panel"><label class="gx-chk" style="margin-bottom:10px"><input type="checkbox" data-licence ${r.licence_verified ? "checked" : ""}> Trade licence checked (clients see a "Licence checked" badge)</label>
        <div class="gx-row"><button class="ok" data-act="approve-send" ${dis}>${busy ? "Please wait..." : "Approve and list for clients"}</button><button data-act="panel-cancel" ${dis}>Cancel</button></div></div>`;
    } else if (open === "reject" || open === "revoke") {
      const note = draft[r.id] || "";
      pan = `<div class="gx-panel bad"><label>${open === "revoke" ? "Reason for removing this listing" : "Reason for rejection"}</label>
        <textarea data-note maxlength="${MAX_NOTE}" placeholder="${open === "revoke" ? "For example: Licence could not be confirmed after the listing was approved." : "For example: We could not verify the trade licence number."}">${esc(note)}</textarea>
        <div class="gx-cnt"><span data-count>${note.length}</span>/${MAX_NOTE}</div>
        <div class="gx-row"><button class="no" data-act="note-send" ${dis}>${busy ? "Sending..." : open === "revoke" ? "Remove and save reason" : "Reject and save reason"}</button><button data-act="panel-cancel" ${dis}>Cancel</button></div></div>`;
    }
    const wa = String(r.whatsapp || "").replace(/[^\d]/g, "");
    const openRow = (isUrl(r.website) || isUrl(r.docs_link) || wa)
      ? `<div class="gx-row" style="margin-bottom:10px">${openBtn(r.website, "Open website")}${openBtn(r.docs_link, "Open licence / profile")}${wa ? openBtn("https://wa.me/" + wa, "Open WhatsApp") : ""}</div>` : "";
    return `<div class="gx-card" data-id="${esc(r.id)}">
      <div class="gx-head"><div><div class="gx-name">${esc(r.company_name || "Unnamed company")}${r.trade_name ? " (" + esc(r.trade_name) + ")" : ""}</div>
        <div class="gx-meta">${esc(where || "\u2014")} \u00b7 ${esc(src)} \u00b7 ${day(r.created_at)}</div></div><span class="gx-st ${esc(s)}">${esc(s || "unknown")}</span></div>
      <div style="margin-bottom:10px">${r.reference_id ? `<span class="gx-chip">${esc(r.reference_id)}</span>` : ""}${r.licence_verified ? '<span class="gx-chip ok">Licence checked</span>' : '<span class="gx-chip mu">Licence not checked</span>'}</div>
      <dl>
        <dt>Business type</dt><dd>${esc(r.business_type || "\u2014")}${r.established_year ? " \u00b7 est. " + esc(r.established_year) : ""}</dd>
        <dt>Registration</dt><dd>${esc(r.registration_number || "\u2014")}${r.issuing_authority ? " (" + esc(r.issuing_authority) + ")" : ""}</dd>
        <dt>Tax / VAT</dt><dd>${esc(r.tax_id || "\u2014")}</dd>
        <dt>Contact</dt><dd>${esc(r.contact_name || "\u2014")}${r.designation ? ", " + esc(r.designation) : ""}</dd>
        <dt>Email</dt><dd>${esc(r.email || "\u2014")}</dd>
        <dt>Phone</dt><dd>${esc(r.phone || "\u2014")}</dd>
        <dt>WhatsApp</dt><dd>${esc(r.whatsapp || "\u2014")}</dd>
        <dt>Website</dt><dd>${link(r.website)}</dd>
        <dt>Buys</dt><dd>${esc(arr(r.categories).join(", ") || "\u2014")}</dd>
        <dt>Products</dt><dd>${esc(r.products_text || "\u2014")}</dd>
        <dt>Languages</dt><dd>${esc(arr(r.languages).join(", ") || "\u2014")}${r.primary_language ? " \u00b7 preferred: " + esc(r.primary_language) : ""}</dd>
        <dt>Order value</dt><dd>${esc(r.order_value || "\u2014")}</dd>
        <dt>Yearly imports</dt><dd>${esc(r.import_volume || "\u2014")}</dd>
        <dt>Payment terms</dt><dd>${esc(arr(r.payment_terms).join(", ") || "\u2014")}</dd>
        <dt>Shipping terms</dt><dd>${esc(arr(r.shipping_terms).join(", ") || "\u2014")}</dd>
        <dt>Certifications</dt><dd>${esc(r.certifications || "\u2014")}</dd>
        <dt>About</dt><dd>${esc(r.about || "\u2014")}</dd>
        ${r.reviewed_at ? `<dt>Reviewed</dt><dd>${day(r.reviewed_at)}</dd>` : ""}
      </dl>
      ${r.admin_note ? `<div class="gx-priv"><b>Admin note (private):</b> ${esc(r.admin_note)}</div>` : ""}
      ${(s === "rejected" || s === "revoked") && r.reject_reason ? `<div class="gx-why"><b>Reason:</b> ${esc(r.reject_reason)}</div>` : ""}
      ${openRow}${actions}${pan}
    </div>`;
  }

  function renderDists() {
    const n = (s) => dists.filter((r) => st(r) === s).length;
    const sum = [["Pending review", n("pending")], ["Listed (approved)", n("approved")], ["Rejected", n("rejected")], ["Removed", n("revoked")], ["Total", dists.length]];
    const tabs = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["revoked", "Removed"], ["all", "All"]];
    const items = dFiltered();
    const emptyText = dFilter === "pending" ? "No distributor applications waiting for review." : "No distributors found.";
    return `<div class="gx-sum">${sum.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>
      <div class="gx-row" style="margin-bottom:14px"><button class="pri" data-act="add" type="button">+ Add distributor manually</button></div>
      ${form ? formHtml() : ""}
      <div class="gx-tabs">${tabs.map(([k, l]) => `<button type="button" data-act="dfilter" data-k="${k}" class="${dFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="gx-bar"><input id="gxSearch" type="search" placeholder="Search company, contact, email, phone, city or reference" value="${esc((($("gxSearch") || {}).value) || "")}"><button id="gxRefresh" type="button">Refresh</button></div>
      <div>${items.length ? items.map(dCard).join("") : `<div class="gx-empty">${emptyText}</div>`}</div>`;
  }

  /* ---------- render: client access ---------- */
  function aFiltered() {
    const term = (($("gxSearch") || {}).value || "").trim().toLowerCase();
    return access.filter((c) => {
      if (aFilter === "approved" && !c.approved) return false;
      if (aFilter === "not" && c.approved) return false;
      return !term || [c.client_id, c.business_name, c.full_name, c.email].join(" ").toLowerCase().includes(term);
    });
  }
  function renderAccess() {
    const on = access.filter((c) => c.approved).length;
    const items = aFiltered();
    const tabs = [["all", "All clients"], ["approved", "Has access"], ["not", "No access"]];
    return `<div class="gx-sum"><div><small>Clients with access</small><b>${on}</b></div><div><small>Clients without access</small><b>${access.length - on}</b></div><div><small>Total clients</small><b>${access.length}</b></div></div>
      <div class="gx-tabs">${tabs.map(([k, l]) => `<button type="button" data-act="afilter" data-k="${k}" class="${aFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="gx-bar"><input id="gxSearch" type="search" placeholder="Search Client ID, name, business or email" value="${esc((($("gxSearch") || {}).value) || "")}"><button id="gxRefresh" type="button">Refresh</button></div>
      <div>${items.length ? items.map((c) => {
        const busy = busyId === c.client_id;
        return `<div class="gx-card" data-cid="${esc(c.client_id)}"><div class="gx-head"><div><div class="gx-name">${esc(c.full_name || c.business_name || c.email || c.client_id)}</div>
          <div class="gx-meta"><span class="gx-chip">${esc(c.client_id)}</span>${esc([c.business_name, c.email].filter(Boolean).join(" \u00b7 "))}${c.granted_at ? " \u00b7 access since " + day(c.granted_at) : ""}</div></div>
          <span class="gx-st ${c.approved ? "approved" : ""}">${c.approved ? "has access" : "no access"}</span></div>
          <div class="gx-row">${c.approved ? `<button class="no" data-act="access-revoke" ${busy ? "disabled" : ""}>${busy ? "Please wait..." : "Remove access"}</button>` : `<button class="ok" data-act="access-grant" ${busy ? "disabled" : ""}>${busy ? "Please wait..." : "Give access"}</button>`}</div></div>`;
      }).join("") : '<div class="gx-empty">No clients found.</div>'}</div>`;
  }

  /* ---------- render: requests ---------- */
  function rFiltered() {
    const term = (($("gxSearch") || {}).value || "").trim().toLowerCase();
    return reqs.filter((r) => {
      if (rFilter !== "all" && st(r) !== rFilter) return false;
      return !term || [r.client_id, r.business_name, r.email, r.company_name, r.country, r.city, r.note].join(" ").toLowerCase().includes(term);
    });
  }
  function renderReqs() {
    const n = (s) => reqs.filter((r) => st(r) === s).length;
    const items = rFiltered();
    const tabs = REQ_STATUS.concat([["all", "All"]]);
    return `<div class="gx-sum"><div><small>New requests</small><b>${n("requested")}</b></div><div><small>In progress</small><b>${n("in_progress")}</b></div><div><small>Connected</small><b>${n("active")}</b></div><div><small>Total</small><b>${reqs.length}</b></div></div>
      <div class="gx-tabs">${tabs.map(([k, l]) => `<button type="button" data-act="rfilter" data-k="${k}" class="${rFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="gx-bar"><input id="gxSearch" type="search" placeholder="Search client, company or country" value="${esc((($("gxSearch") || {}).value) || "")}"><button id="gxRefresh" type="button">Refresh</button></div>
      <div>${items.length ? items.map((r) => {
        const s = st(r), busy = busyId === r.id, dis = busy ? "disabled" : "";
        const note = draft["r:" + r.id] ?? (r.admin_note || "");
        const where = [r.city, r.country].filter(Boolean).join(", ");
        const btn = (k, l, cls) => (s === k ? "" : `<button class="${cls || ""}" data-act="req-set" data-s="${k}" ${dis}>${l}</button>`);
        return `<div class="gx-card" data-rid="${esc(r.id)}"><div class="gx-head"><div><div class="gx-name">${esc(r.company_name || "Distributor")}</div>
          <div class="gx-meta">${esc(where)} \u00b7 requested ${day(r.created_at)}</div></div><span class="gx-st ${esc(s)}">${esc((REQ_STATUS.find((x) => x[0] === s) || [0, s])[1])}</span></div>
          <dl><dt>Client</dt><dd><span class="gx-chip">${esc(r.client_id || "")}</span>${esc([r.business_name, r.email].filter(Boolean).join(" \u00b7 "))}</dd>
          <dt>Client note</dt><dd>${esc(r.note || "\u2014")}</dd></dl>
          <div class="gx-panel"><label>Admin note (private, the client does not see it)</label>
          <textarea data-rnote maxlength="${MAX_NOTE}">${esc(note)}</textarea>
          <div class="gx-row" style="margin-top:8px">${btn("in_progress", "Mark in progress", "on")}${btn("active", "Mark connected", "ok")}${btn("declined", "Decline", "no")}${btn("closed", "Close")}${s !== "requested" ? btn("requested", "Back to requested") : ""}</div></div></div>`;
      }).join("") : '<div class="gx-empty">No requests found.</div>'}</div>`;
  }

  /* ---------- render: agent conversations ---------- */
  function langSelect() { return `<select id="gxLang" aria-label="Show conversation in">${LANGS.map((l) => `<option${l === viewLang ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`; }
  function renderConvs() {
    if (openC) return renderThread();
    const c = convCounts || {};
    const tabs = CONV_FILTERS.map(([k, l]) => `<button type="button" data-act="cfilter" data-k="${k}" class="${cFilter === k ? "on" : ""}">${l}${typeof c[k] === "number" ? " (" + c[k] + ")" : ""}</button>`).join("");
    return `<div class="gx-sum"><div><small>All conversations</small><b>${esc(typeof c.all === "number" ? c.all : convTotal)}</b></div><div><small>Waiting for client</small><b>${esc(c.needs_you ?? "\u2014")}</b></div><div><small>Active</small><b>${esc(c.active ?? "\u2014")}</b></div><div><small>Paused</small><b>${esc(c.paused ?? "\u2014")}</b></div></div>
      <div class="gx-tabs">${tabs}</div>
      <div class="gx-bar"><input id="gxSearch" type="search" placeholder="Search client, company or country (press Enter)" value="${esc((($("gxSearch") || {}).value) || "")}"><div>${langSelect()}</div><button id="gxRefresh" type="button">Refresh</button></div>
      <div>${convs.length ? convs.map((x) => `<div class="gx-card" data-cvid="${esc(x.id)}"><div class="gx-head"><div><div class="gx-name">${esc(x.business_name || x.client_id || "Client")} \u2192 ${esc(x.company_name || "Distributor")}</div>
        <div class="gx-meta"><span class="gx-chip">${esc(x.client_id || "")}</span>${esc([x.city, x.country].filter(Boolean).join(", "))} \u00b7 ${esc(x.language || "")} \u00b7 ${esc(x.mode === "manual" ? "client replying" : "agent replying")} \u00b7 ${esc(x.message_count ?? 0)} messages \u00b7 last ${esc(dtm(x.last_message_at))}</div></div>
        <span class="gx-st ${esc(x.status)}">${esc(CONV_LABEL[x.status] || x.status)}</span></div>
        <div class="gx-row"><button class="pri" data-act="cv-open">Read conversation</button></div></div>`).join("") + (convs.length < convTotal ? '<div class="gx-row" style="justify-content:center"><button data-act="cv-more">Show more</button></div>' : "") : '<div class="gx-empty">No conversations found.</div>'}</div>`;
  }
  function renderThread() {
    const x = openC, busy = busyId === x.id, dis = busy ? "disabled" : "";
    const bubbles = cMsgs.length ? cMsgs.map((m) => {
      const s = m.sender || "system";
      const cls = s === "distributor" ? "in" : (s === "system" || m.kind === "notice") ? "sys" : m.kind === "instruction" ? "note" : "out";
      const who = m.kind === "instruction" ? "Client's private instruction to the agent" : { agent: "Agent", distributor: "Distributor", client: "Client", system: "GLIME" }[s] || s;
      const og = m.original_text && m.original_text !== m.text ? `<div class="og"><b>Original${m.original_language ? " (" + esc(m.original_language) + ")" : ""}</b><br>${esc(m.original_text)}</div>` : "";
      return `<div class="gx-bub ${cls}">${cls === "sys" ? "" : `<small>${esc(who)}</small>`}${esc(m.text || "")}${og}<div class="tm">${esc(dtm(m.created_at))}${m.delivery && cls === "out" && m.kind !== "instruction" ? " \u00b7 " + esc(m.delivery) : ""}</div></div>`;
    }).join("") : '<div class="gx-empty">No messages yet.</div>';
    const closed = x.status === "closed" || x.status === "failed";
    return `<div class="gx-row" style="margin-bottom:12px"><button data-act="cv-back">\u2190 Back</button><button id="gxRefresh" type="button">Refresh</button><div class="gx-bar" style="margin:0">${langSelect()}</div></div>
      <div class="gx-card"><div class="gx-head"><div><div class="gx-name">${esc(x.business_name || x.client_id || "Client")} \u2192 ${esc(x.company_name || "Distributor")}</div>
        <div class="gx-meta"><span class="gx-chip">${esc(x.client_id || "")}</span>${esc([x.city, x.country].filter(Boolean).join(", "))} \u00b7 talking in ${esc(x.language || "")} \u00b7 ${esc(x.mode === "manual" ? "client replying" : "agent replying")}</div></div>
        <span class="gx-st ${esc(x.status)}">${esc(CONV_LABEL[x.status] || x.status)}</span></div>
        ${x.needs_you_reason ? `<div class="gx-priv"><b>Waiting for client:</b> ${esc(x.needs_you_reason)}</div>` : ""}
        <div class="gx-chat">${bubbles}</div>
        ${closed ? '<div class="gx-empty">This conversation is closed.</div>' : `<div class="gx-row">${x.status === "paused" ? `<button class="ok" data-act="cv-resume" ${dis}>Resume agent</button>` : `<button class="on" data-act="cv-pause" ${dis}>Pause agent</button>`}<button class="no" data-act="cv-close" ${dis}>End conversation</button></div>`}
      </div>`;
  }

  /* ---------- render: agent settings ---------- */
  function renderSettings() {
    if (!settings) return `<div class="gx-empty">Settings could not be loaded. <button id="gxRefresh" type="button">Try again</button></div>`;
    const s = settings, busy = busyId === "settings";
    return `<div class="gx-form"><h3>Export Agent settings</h3>
      <div class="gx-sub">These controls apply to every client. Use them to stop the agent quickly if something goes wrong, and to keep WhatsApp sending volume safe.</div>
      <label class="gx-chk"><input type="checkbox" id="gxs-enabled"${s.enabled !== false ? " checked" : ""}> Export Agent is ON (when off, no new conversations start and no messages are sent)</label>
      <div class="gx-grid">
        ${fld("New conversations per client per day", `<input id="gxs-daily" type="number" min="1" max="200" step="1" value="${esc(s.daily_new_conversations ?? 10)}">`, "", "Whole number, 1 to 200. Keep it low at first.")}
        ${fld("Maximum messages per conversation", `<input id="gxs-max" type="number" min="10" max="1000" step="1" value="${esc(s.max_messages_per_conversation ?? 200)}">`, "", "The agent stops and asks the client after this many messages.")}
        ${fld("Allowed distributor countries", `<input id="gxs-codes" type="text" value="${esc(arr(s.allowed_country_codes).join(", ") || "AE")}" maxlength="120">`, "full", "Two-letter codes separated by commas. UAE only for now: AE.")}
      </div>
      <div class="gx-row"><button class="ok" data-act="settings-save" ${busy ? "disabled" : ""}>${busy ? "Saving..." : "Save settings"}</button></div></div>`;
  }

  /* ---------- render root ---------- */
  function render() {
    const body = $("gxBody"); if (!body) return;
    ["dist", "access", "reqs", "convs", "agent"].forEach((k) => { const b = $("gxMain-" + k); if (b) b.classList.toggle("on", sub === k); });
    const hadSearch = document.activeElement && document.activeElement.id === "gxSearch";
    body.innerHTML = sub === "dist" ? renderDists() : sub === "access" ? renderAccess() : sub === "reqs" ? renderReqs() : sub === "convs" ? renderConvs() : renderSettings();
    if (hadSearch) { const s = $("gxSearch"); if (s) { s.focus(); const l = s.value.length; try { s.setSelectionRange(l, l); } catch (e) { /* ignore */ } } }
    const ch = body.querySelector(".gx-chat"); if (ch) ch.scrollTop = ch.scrollHeight;
  }

  /* ---------- events ---------- */
  function onClick(e) {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "gxRefresh") { loadCurrent(); return; }
    if (b.id && b.id.startsWith("gxMain-")) { sub = b.id.slice(7); panel = null; openC = null; stopCTimer(); msg("", ""); render(); loadCurrent(); return; }
    const act = b.dataset.act; if (!act) return;
    if (act === "dfilter") { dFilter = b.dataset.k; panel = null; render(); return; }
    if (act === "afilter") { aFilter = b.dataset.k; render(); return; }
    if (act === "rfilter") { rFilter = b.dataset.k; render(); return; }
    if (act === "cfilter") { cFilter = b.dataset.k; loadConvs(false); return; }
    if (act === "cv-more") { loadConvs(true); return; }
    if (act === "cv-back") { openC = null; stopCTimer(); render(); loadConvs(false); return; }
    if (act === "settings-save") { if (!busyId) saveSettings(); return; }
    if (act === "add") { form = { id: null, data: emptyForm() }; panel = null; msg("", ""); render(); const f = $("gxForm"); if (f) f.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (act === "form-cancel") { form = null; render(); return; }
    if (act === "form-save") { if (!busyId) saveForm(); return; }

    const card = b.closest(".gx-card");
    if (act === "cv-open") { const cid = card && card.dataset.cvid; if (cid) openConv(cid, false); return; }
    if (act === "cv-pause" || act === "cv-resume" || act === "cv-close") {
      if (!openC || busyId) return;
      const action = act.slice(3);
      if (action === "close" && !window.confirm("End this conversation? The agent stops and no more messages are sent.")) return;
      convControl(openC.id, action);
      return;
    }
    if (act === "access-grant" || act === "access-revoke") {
      const cid = card && card.dataset.cid; if (!cid || busyId) return;
      const grant = act === "access-grant";
      if (window.confirm((grant ? "Give " : "Remove ") + cid + (grant ? " access to the Export Network?" : "'s access to the Export Network?"))) setAccess(cid, grant);
      return;
    }
    if (act === "req-set") {
      const rid = card && card.dataset.rid; if (!rid || busyId) return;
      const target = b.dataset.s;
      const label = (REQ_STATUS.find((x) => x[0] === target) || [0, target])[1];
      if (window.confirm('Set this request to "' + label + '"? The client will see the new status.')) updateReq(rid, target);
      return;
    }

    const id = card && card.dataset.id;
    if (!id || busyId) return;
    const r = dists.find((x) => x.id === id); if (!r) return;
    const nm = r.company_name || "this distributor";
    if (act === "edit") { form = { id, data: Object.assign(emptyForm(), r) }; panel = null; msg("", ""); render(); const f = $("gxForm"); if (f) f.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (act === "approve-open") { panel = { id, kind: "approve" }; msg("", ""); render(); }
    else if (act === "reject-open" || act === "revoke-open") { panel = { id, kind: act === "revoke-open" ? "revoke" : "reject" }; msg("", ""); render(); const t = card.parentNode.querySelector(`.gx-card[data-id="${id.replace(/"/g, "")}"] [data-note]`); if (t) t.focus(); }
    else if (act === "panel-cancel") { panel = null; delete draft[id]; render(); }
    else if (act === "approve-send") {
      const lic = !!card.querySelector("[data-licence]")?.checked;
      let ok = true;
      if ((r.country_code || "") !== FIRST_MARKET) ok = window.confirm(nm + " is outside the UAE. UAE is the first market. Approve anyway?");
      if (ok && window.confirm("Approve " + nm + "? It will be listed for approved clients in Others.")) review(id, "approve", null, lic);
    } else if (act === "note-send") {
      const note = String(draft[id] || "").trim();
      if (!note) { msg("Please write the reason.", "e"); const t = card.querySelector("[data-note]"); if (t) t.focus(); return; }
      if (note.length > MAX_NOTE) { msg(errText({ message: "note_too_long" }), "e"); return; }
      const revoke = panel && panel.kind === "revoke";
      if (window.confirm((revoke ? "Remove " + nm + " from the directory?" : "Reject " + nm + "?"))) review(id, revoke ? "revoke" : "reject", note, false);
    }
  }

  function onInput(e) {
    const t = e.target; if (!t || !t.matches) return;
    if (t.id === "gxLang") { viewLang = t.value; if (openC) openConv(openC.id, false); else loadConvs(false); return; }
    if (t.id === "gxSearch") { if (sub !== "convs") render(); return; }
    if (t.matches("[data-note]")) {
      const id = t.closest(".gx-card").dataset.id;
      draft[id] = t.value;
      const c = t.closest(".gx-panel").querySelector("[data-count]"); if (c) c.textContent = t.value.length;
    } else if (t.matches("[data-rnote]")) {
      draft["r:" + t.closest(".gx-card").dataset.rid] = t.value;
    } else if (t.name === "gxlang" || t.id === "gxf-langextra") {
      syncPrimary();
    }
  }
  function onKey(e) {
    if (e.key === "Enter" && e.target && e.target.id === "gxSearch" && sub === "convs") { e.preventDefault(); loadConvs(false); }
  }

  /* ---------- mount ---------- */
  function create() {
    if ($(ID)) return true;
    const main = document.querySelector("#app main"), nav = document.querySelector("#app nav");
    if (!main || !nav) return false;
    const view = document.createElement("section");
    view.className = "view"; view.id = "view-exportnet";
    main.appendChild(view);
    const nb = document.createElement("button");
    nb.type = "button"; nb.dataset.view = "exportnet"; nb.textContent = "Export Network";
    nav.insertBefore(nb, nav.querySelector('[data-view="settings"]') || nav.querySelector(".logout"));
    nb.addEventListener("click", () => {
      document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
      view.classList.add("active");
      document.querySelectorAll("nav button[data-view]").forEach((x) => x.classList.toggle("active", x === nb));
      const ti = $("title"); if (ti) ti.textContent = "Export Network";
      loadCurrent();
    });
    styles();
    const s = document.createElement("div");
    s.id = ID;
    s.innerHTML = `<div class="gx-title">Export Network</div>
      <div class="gx-sub">Overseas distributors who apply on the Export Network page are reviewed here. Approved listings show in the Export Network section of Others, but only for clients you give access to. You can also add a distributor yourself and it is published straight away. Contact details stay private. Approved clients can also run the Export Agent, which talks to distributors on WhatsApp from the GLIME number. You can read and stop any of those conversations here.</div>
      <div class="gx-main"><button id="gxMain-dist" class="on" type="button">Distributors</button><button id="gxMain-access" type="button">Client access</button><button id="gxMain-reqs" type="button">Requests</button><button id="gxMain-convs" type="button">Agent conversations</button><button id="gxMain-agent" type="button">Agent settings</button></div>
      <div id="gxBody"><div class="gx-empty">Open this tab to load the Export Network.</div></div><div id="gxMsg" class="gx-msg"></div>`;
    view.appendChild(s);
    s.addEventListener("click", onClick);
    s.addEventListener("input", onInput);
    s.addEventListener("change", onInput);
    s.addEventListener("keydown", onKey);
    return true;
  }

  function init() {
    let tries = 0;
    const t = setInterval(() => { tries++; if (create() || tries > 25) clearInterval(t); }, 800);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
