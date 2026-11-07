/* GLIME Follow-up Pro add-on (frontend only)
   1. Templates tab: "24-hour quick replies" (all plans) + "WhatsApp templates" (Omni only, Meta format)
   2. Delete option for follow-up drafts (Smart Tasks list + lead panel)
   3. WhatsApp 24-hour window chip on every WhatsApp draft
   Backend it expects (all optional, page works without them):
   - table client_followup_templates(id uuid pk default gen_random_uuid(), client_id, name text, category text,
     language text, header jsonb, body text, footer text, buttons jsonb, samples jsonb, var_map jsonb,
     status text, rejection_reason text, created_at, updated_at) with RLS on client_id. Missing table => saved in this browser only.
   - lead-followup-handoff-v2 action "delete_draft" {request_id}. Until it exists the delete dialog says so.
   - Omni = active "ai-connections" module in client_modules (same rule as the Connectors page). */
(function () {
  'use strict';
  if (window.__fuPro || !window.supabase) return;
  window.__fuPro = 1;
  var U = 'https://ufoulgbiqgjriwapuopc.supabase.co', K = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  var db = window.supabase.createClient(U, K), HANDOFF = U + '/functions/v1/lead-followup-handoff-v2', TBL = 'client_followup_templates';
  var WIN = 24 * 3600000 - 600000;
  var ST = { cid: null, omni: null, remote: true, tpls: [], pend: {}, wa: {}, seg: 'quick', q: '', fs: '', fc: '', syncing: false };
  var STATUS = { draft: 'Draft', submitted: 'Submitted to Meta', approved: 'Approved', rejected: 'Rejected', paused: 'Paused' };
  var CAT = { marketing: 'Marketing', utility: 'Utility', authentication: 'Authentication' };
  var LANG = [['en', 'English'], ['en_US', 'English (US)'], ['hi', 'Hindi'], ['mr', 'Marathi'], ['gu', 'Gujarati'], ['ta', 'Tamil'], ['te', 'Telugu'], ['kn', 'Kannada'], ['bn', 'Bengali'], ['pa', 'Punjabi'], ['ml', 'Malayalam'], ['ur', 'Urdu']];
  var MAPS = [['', 'Ask me each time'], ['name', 'Lead name'], ['interest', 'Interest'], ['product_service', 'Product / service'], ['city_area', 'City / area']];

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 't' + Date.now() + Math.random().toString(16).slice(2); }
  function vars(s) { var o = {}, m, re = /\{\{(\d+)\}\}/g; while ((m = re.exec(s || ''))) o[+m[1]] = 1; return Object.keys(o).map(Number).sort(function (a, b) { return a - b; }); }
  function fill(s, vals) { return String(s || '').replace(/\{\{(\d+)\}\}/g, function (_, n) { return vals[n - 1] || '{{' + n + '}}'; }); }
  function wa(s) { return esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>').replace(/\n/g, '<br>'); }
  function left(ms) { var m = Math.max(0, Math.floor(ms / 60000)); return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; }
  function newTpl() { return { id: '', name: '', category: 'utility', language: 'en', header: { type: 'none', text: '' }, body: '', footer: '', buttons: [], samples: [], var_map: [], status: 'draft', rejection_reason: '' }; }

  /* ---------- data ---------- */
  async function init() {
    var u = await db.auth.getUser(); if (!u.data || !u.data.user) return;
    var c = await db.from('client_data').select('client_id').eq('auth_user_id', u.data.user.id).maybeSingle();
    if (!c.data) return; ST.cid = c.data.client_id;
    await Promise.all([checkOmni(), loadTpls(), syncPending()]);
    renderTpl(); enhance();
  }
  async function checkOmni() {
    try {
      var m = await db.from('modules').select('id').eq('slug', 'ai-connections').maybeSingle();
      var a = m.data ? (await db.from('client_modules').select('enabled,visible_to_client,status,expires_at').eq('module_id', m.data.id).eq('client_id', ST.cid).maybeSingle()).data : null;
      ST.omni = !!a && a.enabled === true && a.visible_to_client === true && (a.status === 'active' || a.status === 'trial') && (!a.expires_at || new Date(a.expires_at).getTime() > Date.now());
    } catch (e) { ST.omni = false; }
  }
  function lsKey() { return 'glime_fu_tpl_' + ST.cid; }
  function lsRead() { try { return JSON.parse(localStorage.getItem(lsKey()) || '[]'); } catch (e) { return []; } }
  function lsWrite(a) { try { localStorage.setItem(lsKey(), JSON.stringify(a)); } catch (e) { } }
  async function loadTpls() {
    var r = await db.from(TBL).select('*').eq('client_id', ST.cid).order('updated_at', { ascending: false });
    if (r.error) { ST.remote = false; ST.tpls = lsRead(); } else { ST.remote = true; ST.tpls = r.data || []; }
  }
  async function saveTpl(t) {
    t.updated_at = new Date().toISOString();
    if (ST.remote) {
      var row = Object.assign({}, t, { client_id: ST.cid }); if (!row.id) delete row.id; delete row.created_at;
      var r = await db.from(TBL).upsert(row).select().single(); if (r.error) throw r.error;
    } else {
      var a = lsRead();
      if (!t.id) { t.id = uid(); t.created_at = t.updated_at; a.unshift(t); } else a = a.map(function (x) { return x.id === t.id ? Object.assign({}, x, t) : x; });
      lsWrite(a);
    }
    await loadTpls();
  }
  async function delTpl(id) {
    if (ST.remote) { var r = await db.from(TBL).delete().eq('id', id).eq('client_id', ST.cid); if (r.error) throw r.error; } else lsWrite(lsRead().filter(function (x) { return x.id !== id; }));
    await loadTpls();
  }
  async function syncPending() {
    if (ST.syncing) return; ST.syncing = true;
    try {
      var r = await db.from('client_action_requests').select('id,action_payload').eq('client_id', ST.cid).eq('intent', 'lead_follow_up').eq('status', 'proposed').limit(200);
      ST.pend = {}; (r.data || []).forEach(function (x) { var p = x.action_payload || {}; ST.pend[x.id] = { id: x.id, lead: p.lead_id || p.target_id, ch: String(p.channel || 'instagram'), msg: String(p.message || '').trim() }; });
      var w = await db.from('whatsapp_conversations').select('lead_id,last_inbound_at').eq('client_id', ST.cid).not('lead_id', 'is', null);
      ST.wa = {}; (w.data || []).forEach(function (c) { var t = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : 0; if (!ST.wa[c.lead_id] || t > ST.wa[c.lead_id]) ST.wa[c.lead_id] = t; });
    } catch (e) { } finally { ST.syncing = false; }
  }
  async function callHandoff(body) {
    var s = await db.auth.getSession(), tok = s.data && s.data.session && s.data.session.access_token;
    var res = await fetch(HANDOFF, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, apikey: K }, body: JSON.stringify(body) });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || j.ok === false) { var e = new Error(j.error || 'Request failed'); e.code = j.error_code; throw e; }
    return j;
  }

  /* ---------- Meta rules ---------- */
  function check(t) {
    var er = [], wn = [], v = vars(t.body), b = String(t.body || '').trim();
    if (!/^[a-z0-9_]+$/.test(t.name || '')) er.push('Name: use only lowercase letters, numbers and underscores.');
    if (!b) er.push('Body is required.'); else if (b.length > 1024) er.push('Body is over 1024 characters.');
    v.forEach(function (n, i) { if (n !== i + 1) er.push('Variables must run {{1}}, {{2}}, {{3}} without gaps.'); });
    er = er.filter(function (x, i) { return er.indexOf(x) === i; });
    if (/^\{\{\d+\}\}/.test(b) || /\{\{\d+\}\}[\s.,!?]*$/.test(b)) er.push('Body cannot start or end with a variable.');
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(b)) er.push('Two variables cannot sit next to each other.');
    v.forEach(function (n) { if (!String((t.samples || [])[n - 1] || '').trim()) er.push('Add a sample value for {{' + n + '}}.'); });
    if (t.header.type === 'text') { if (!t.header.text.trim()) er.push('Header text is empty.'); if (t.header.text.length > 60) er.push('Header is over 60 characters.'); if (vars(t.header.text).length > 1) er.push('Header can have only one variable.'); }
    if (t.footer.length > 60) er.push('Footer is over 60 characters.'); if (vars(t.footer).length) er.push('Footer cannot have variables.');
    t.buttons.forEach(function (x, i) {
      if (!x.text.trim() || x.text.length > 25) er.push('Button ' + (i + 1) + ': text is required, up to 25 characters.');
      if (x.type === 'url' && !/^https:\/\/\S+$/.test(x.value)) er.push('Button ' + (i + 1) + ': URL must start with https://');
      if (x.type === 'phone' && !/^\+\d{8,15}$/.test(x.value)) er.push('Button ' + (i + 1) + ': phone must look like +919876543210');
    });
    if (v.length > 0 && b.split(/\s+/).length < v.length * 3) wn.push('Too many variables for such a short message. Meta may reject it.');
    if (t.category === 'marketing') wn.push('Marketing templates need the customer\'s opt-in, and Meta reviews them more strictly.');
    if (t.category === 'authentication') wn.push('Authentication templates are for OTP codes only.');
    return { er: er, wn: wn };
  }

  /* ---------- Templates tab ---------- */
  function mount() {
    var pane = $('pane-templates'); if (!pane || $('fup')) return;
    var grid = $('tplGrid'), box = document.createElement('div'); box.id = 'fup'; box.className = 'fup';
    box.innerHTML = '<div class="fup-seg" id="fupSeg"><button type="button" data-seg="quick">24-hour quick replies</button><button type="button" data-seg="meta">WhatsApp templates <em>Omni</em></button></div>' +
      '<section id="fupQuick"><p class="fup-note">Free-form messages. WhatsApp allows them within 24 hours of the customer\'s last message. Available on every plan.</p></section><section id="fupMeta" hidden></section>';
    pane.insertBefore(box, pane.firstChild); $('fupQuick').appendChild(grid);
  }
  function renderTpl() {
    mount(); var seg = $('fupSeg'); if (!seg) return;
    Array.prototype.forEach.call(seg.children, function (b) { b.classList.toggle('on', b.getAttribute('data-seg') === ST.seg); });
    $('fupQuick').hidden = ST.seg !== 'quick'; $('fupMeta').hidden = ST.seg !== 'meta';
    var m = $('fupMeta'); if (ST.seg !== 'meta') return;
    if (ST.omni === null) { m.innerHTML = '<div class="empty">Checking your plan…</div>'; return; }
    if (!ST.omni) { m.innerHTML = lockHtml(); return; }
    var cnt = {}; ST.tpls.forEach(function (t) { cnt[t.status] = (cnt[t.status] || 0) + 1; });
    var list = ST.tpls.filter(function (t) { return (!ST.fs || t.status === ST.fs) && (!ST.fc || t.category === ST.fc) && (!ST.q || (t.name + ' ' + t.body).toLowerCase().indexOf(ST.q) > -1); });
    m.innerHTML = '<div class="fup-top"><div><h3>WhatsApp message templates</h3><p class="fup-note">Pre-approved by Meta, so you can message customers after the 24-hour window closes. Set the status yourself after checking Meta Business Manager.</p></div><button class="btn primary" type="button" data-fup="new">+ New template</button></div>' +
      (ST.remote ? '' : '<div class="fup-warn">Backend table not connected yet. Templates are saved in this browser only.</div>') +
      '<div class="fup-chips"><button type="button" class="' + (!ST.fs ? 'on' : '') + '" data-fs="">All <b>' + ST.tpls.length + '</b></button>' + Object.keys(STATUS).map(function (k) { return '<button type="button" class="' + (ST.fs === k ? 'on' : '') + '" data-fs="' + k + '">' + STATUS[k] + ' <b>' + (cnt[k] || 0) + '</b></button>'; }).join('') + '</div>' +
      '<div class="fup-bar"><input class="fup-in" id="fupQ" type="search" placeholder="Search templates…" value="' + esc(ST.q) + '"><select class="fup-in" id="fupC"><option value="">All categories</option>' + Object.keys(CAT).map(function (k) { return '<option value="' + k + '"' + (ST.fc === k ? ' selected' : '') + '>' + CAT[k] + '</option>'; }).join('') + '</select></div>' +
      (list.length ? '<div class="fup-cards">' + list.map(cardHtml).join('') + '</div>' : '<div class="empty">' + (ST.tpls.length ? 'No template matches this filter.' : 'No templates yet. Create your first one.') + '</div>');
  }
  function cardHtml(t) {
    var sv = (t.samples || []);
    return '<article class="fup-card"><header><b>' + esc(t.name) + '</b><span class="fup-st ' + esc(t.status) + '">' + esc(STATUS[t.status] || t.status) + '</span></header>' +
      '<div class="fup-meta"><span>' + esc(CAT[t.category] || t.category) + '</span><span>' + esc(t.language) + '</span><span>' + vars(t.body).length + ' variables</span></div>' +
      '<div class="fup-bub">' + (t.header && t.header.type === 'text' ? '<strong>' + wa(fill(t.header.text, sv)) + '</strong>' : '') + wa(fill(t.body, sv)) + (t.footer ? '<small>' + esc(t.footer) + '</small>' : '') + '</div>' +
      (t.buttons || []).map(function (b) { return '<div class="fup-btn">' + esc(b.text) + '</div>'; }).join('') +
      (t.status === 'rejected' && t.rejection_reason ? '<p class="fup-rej">Reason: ' + esc(t.rejection_reason) + '</p>' : '') +
      '<footer><select class="fup-in sm" data-fup-st="' + esc(t.id) + '" aria-label="Status">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (t.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('') + '</select>' +
      '<button class="btn sm ghost" type="button" data-fup="edit" data-id="' + esc(t.id) + '">Edit</button><button class="btn sm ghost" type="button" data-fup="dup" data-id="' + esc(t.id) + '">Duplicate</button><button class="btn sm ghost fup-red" type="button" data-fup="del" data-id="' + esc(t.id) + '">Delete</button></footer></article>';
  }
  function lockHtml() {
    return '<div class="fup-lock"><span class="fup-crown">Omni</span><h3>WhatsApp Meta-approved templates</h3><p>Reach customers after the 24-hour window closes with templates approved by Meta. Included in the GLIME Omni plan.</p>' +
      '<ul><li>Create templates in Meta\'s exact format with a live WhatsApp preview</li><li>Meta rule checks before you submit</li><li>Auto-fill variables from the lead\'s name, interest and more</li><li>Track Draft, Submitted, Approved and Rejected</li></ul>' +
      '<a class="btn primary" href="billing.html?plan=omni">Upgrade to Omni</a><small>24-hour quick replies keep working on your current plan.</small></div>';
  }

  /* ---------- overlay + editor ---------- */
  var ED = null;
  function overlay(html, wide) { var x = $('fupOv'); if (x) x.remove(); var o = document.createElement('div'); o.className = 'fup-ov'; o.id = 'fupOv'; o.innerHTML = '<div class="fup-box' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>'; document.body.appendChild(o); return o; }
  function closeOv() { var o = $('fupOv'); if (o) o.remove(); ED = null; }
  function openEditor(t) {
    ED = JSON.parse(JSON.stringify(t || newTpl()));
    var o = overlay('<header><h3>' + (ED.id ? 'Edit template' : 'New WhatsApp template') + '</h3><button class="fup-x" type="button" data-x aria-label="Close">×</button></header><div class="fup-grid"><div class="fup-form">' +
      f('Template name', '<input class="fup-in" id="eName" maxlength="512" placeholder="order_followup_1" value="' + esc(ED.name) + '"><small>Lowercase letters, numbers, underscores</small>') +
      '<div class="fup-two">' + f('Category', '<select class="fup-in" id="eCat">' + Object.keys(CAT).map(function (k) { return '<option value="' + k + '"' + (ED.category === k ? ' selected' : '') + '>' + CAT[k] + '</option>'; }).join('') + '</select>') +
      f('Language', '<select class="fup-in" id="eLang">' + LANG.map(function (l) { return '<option value="' + l[0] + '"' + (ED.language === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select>') + '</div>' +
      f('Header (optional)', '<input class="fup-in" id="eHead" maxlength="80" placeholder="Short title, up to 60 characters" value="' + esc(ED.header.text) + '">') +
      f('Body', '<textarea class="fup-in" id="eBody" rows="6" maxlength="1100" placeholder="Hi {{1}}, thanks for your interest in {{2}}. Reply YES and we will share the details.">' + esc(ED.body) + '</textarea><div class="fup-row"><small id="eCnt"></small><button class="btn sm ghost" type="button" data-fup="addvar">+ Add variable</button></div>') +
      '<div id="eVars"></div>' + f('Footer (optional)', '<input class="fup-in" id="eFoot" maxlength="80" value="' + esc(ED.footer) + '">') +
      '<div class="fup-lab">Buttons (optional)</div><div id="eBtns"></div><div class="fup-row"><button class="btn sm ghost" type="button" data-fup="addbtn" data-t="quick">+ Quick reply</button><button class="btn sm ghost" type="button" data-fup="addbtn" data-t="url">+ Link</button><button class="btn sm ghost" type="button" data-fup="addbtn" data-t="phone">+ Call</button></div>' +
      '<div class="fup-two">' + f('Status', '<select class="fup-in" id="eSt">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (ED.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('') + '</select>') + f('Rejection reason', '<input class="fup-in" id="eRej" value="' + esc(ED.rejection_reason) + '" placeholder="Only if rejected">') + '</div>' +
      '</div><aside class="fup-side"><div class="fup-lab">Preview</div><div class="fup-phone"><div class="fup-bub" id="ePrev"></div><div id="ePrevBtns"></div></div><div id="eIss"></div></aside></div>' +
      '<footer class="fup-foot"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn primary" type="button" data-fup="save">Save template</button></footer>', true);
    drawVars(); drawBtns(); refresh(); setTimeout(function () { $('eName').focus(); }, 30);
  }
  function f(l, inner) { return '<label class="fup-f"><span class="fup-lab">' + l + '</span>' + inner + '</label>'; }
  function drawVars() {
    var v = vars(ED.body); ED.samples.length = Math.max(ED.samples.length, v.length); ED.var_map.length = Math.max(ED.var_map.length, v.length);
    $('eVars').innerHTML = v.length ? '<div class="fup-lab">Sample values (Meta needs one for each variable)</div>' + v.map(function (n) {
      return '<div class="fup-var"><b>{{' + n + '}}</b><input class="fup-in" data-sv="' + (n - 1) + '" placeholder="Example, e.g. Rahul" value="' + esc(ED.samples[n - 1] || '') + '"><select class="fup-in" data-vm="' + (n - 1) + '">' + MAPS.map(function (m) { return '<option value="' + m[0] + '"' + ((ED.var_map[n - 1] || '') === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select></div>';
    }).join('') : '';
  }
  function drawBtns() {
    var L = { quick: 'Quick reply', url: 'Link', phone: 'Call' };
    $('eBtns').innerHTML = ED.buttons.map(function (b, i) {
      return '<div class="fup-var"><b>' + L[b.type] + '</b><input class="fup-in" data-bt="' + i + '" maxlength="25" placeholder="Button text" value="' + esc(b.text) + '">' +
        (b.type === 'quick' ? '<span></span>' : '<input class="fup-in" data-bv="' + i + '" placeholder="' + (b.type === 'url' ? 'https://…' : '+919876543210') + '" value="' + esc(b.value || '') + '">') + '<button class="fup-x" type="button" data-fup="rmbtn" data-i="' + i + '" aria-label="Remove">×</button></div>';
    }).join('');
  }
  function refresh() {
    if (!ED) return; var t = ED, sv = t.samples;
    $('eCnt').textContent = t.body.length + ' / 1024';
    $('ePrev').innerHTML = (t.header.type === 'text' ? '<strong>' + wa(fill(t.header.text, sv)) + '</strong>' : '') + (t.body ? wa(fill(t.body, sv)) : '<span class="fup-dim">Your message appears here</span>') + (t.footer ? '<small>' + esc(t.footer) + '</small>' : '');
    $('ePrevBtns').innerHTML = t.buttons.map(function (b) { return '<div class="fup-btn">' + esc(b.text || 'Button') + '</div>'; }).join('');
    var c = check(t); $('eIss').innerHTML = c.er.map(function (x) { return '<p class="fup-iss er">' + esc(x) + '</p>'; }).join('') + c.wn.map(function (x) { return '<p class="fup-iss wn">' + esc(x) + '</p>'; }).join('') + (!c.er.length ? '<p class="fup-iss ok">Looks good for Meta review.</p>' : '');
  }
  function readForm() {
    ED.name = $('eName').value.trim(); ED.category = $('eCat').value; ED.language = $('eLang').value; ED.body = $('eBody').value; ED.footer = $('eFoot').value.trim();
    ED.header = { type: $('eHead').value.trim() ? 'text' : 'none', text: $('eHead').value.trim() }; ED.status = $('eSt').value; ED.rejection_reason = $('eRej').value.trim();
  }
  async function saveEditor(btn) {
    readForm(); var c = check(ED), blocking = ED.status !== 'draft' ? c.er : c.er.filter(function (x) { return /Name|Body is required/.test(x); });
    if (blocking.length) { toast(blocking[0], 'error'); return; }
    var v = vars(ED.body).length; ED.samples = ED.samples.slice(0, v); ED.var_map = ED.var_map.slice(0, v);
    btn.disabled = true;
    try { await saveTpl(ED); closeOv(); renderTpl(); toast('Template saved.', 'success'); } catch (e) { toast('Could not save: ' + (e.message || 'error'), 'error'); btn.disabled = false; }
  }

  /* ---------- confirm + delete drafts ---------- */
  function confirmBox(title, text, okLabel, run) {
    var o = overlay('<header><h3>' + esc(title) + '</h3></header><p class="fup-note">' + esc(text) + '</p><p class="fup-iss er" id="cErr" hidden></p><footer class="fup-foot"><button class="btn ghost" type="button" data-x>Cancel</button><button class="btn primary fup-redb" type="button" id="cOk">' + esc(okLabel) + '</button></footer>');
    $('cOk').onclick = async function () {
      var b = $('cOk'); b.disabled = true; b.textContent = 'Please wait…';
      try { await run(); closeOv(); } catch (e) { var er = $('cErr'); er.hidden = false; er.textContent = e.code === 'UNSUPPORTED_ACTION' ? 'Deleting drafts is not switched on in the server yet. Ask GLIME support to enable "delete_draft".' : (e.message || 'Something went wrong.'); b.disabled = false; b.textContent = okLabel; }
    };
  }
  async function delDraft(id) { await callHandoff({ action: 'delete_draft', request_id: id }); delete ST.pend[id]; if (window.loadFollowUpSpecialist) await window.loadFollowUpSpecialist(); toast('Draft deleted. Nothing was sent.', 'success'); }
  async function delAll() { var ids = Object.keys(ST.pend); for (var i = 0; i < ids.length; i++) { await callHandoff({ action: 'delete_draft', request_id: ids[i] }); delete ST.pend[ids[i]]; } if (window.loadFollowUpSpecialist) await window.loadFollowUpSpecialist(); toast('All drafts deleted. Nothing was sent.', 'success'); }

  /* ---------- picker (use an approved template for a lead) ---------- */
  async function openPicker(reqId) {
    var p = ST.pend[reqId]; if (!p) return;
    var ap = ST.tpls.filter(function (t) { return t.status === 'approved'; }), lead = {};
    try { lead = (await db.from('leads').select('name,interest,product_service,city_area').eq('id', p.lead).eq('client_id', ST.cid).maybeSingle()).data || {}; } catch (e) { }
    if (!ap.length) { overlay('<header><h3>No approved template yet</h3><button class="fup-x" type="button" data-x>×</button></header><p class="fup-note">Create a template in Templates > WhatsApp templates and set its status to Approved once Meta approves it.</p><footer class="fup-foot"><button class="btn primary" type="button" data-fup="gotpl">Open templates</button></footer>'); return; }
    var cur = ap[0], vals = [];
    function setT(t) { cur = t; vals = vars(t.body).map(function (n) { var k = (t.var_map || [])[n - 1]; return (k && lead[k]) || ''; }); draw(); }
    function draw() {
      var o = $('fupOv'); o.firstChild.innerHTML = '<header><h3>Send with approved template</h3><button class="fup-x" type="button" data-x>×</button></header><label class="fup-f"><span class="fup-lab">Template</span><select class="fup-in" id="pSel">' + ap.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === cur.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></label>' +
        vars(cur.body).map(function (n, i) { return '<div class="fup-var"><b>{{' + n + '}}</b><input class="fup-in" data-pv="' + i + '" placeholder="Value" value="' + esc(vals[i] || '') + '"></div>'; }).join('') +
        '<div class="fup-phone"><div class="fup-bub" id="pPrev">' + wa(fill(cur.body, vals)) + '</div></div><footer class="fup-foot"><button class="btn ghost" type="button" data-x>Close</button><button class="btn primary" type="button" id="pCopy">Copy message</button></footer>';
      $('pSel').onchange = function () { setT(ap.filter(function (t) { return t.id === this.value; }.bind(this))[0]); };
      Array.prototype.forEach.call(o.querySelectorAll('[data-pv]'), function (i) { i.oninput = function () { vals[+i.getAttribute('data-pv')] = i.value; $('pPrev').innerHTML = wa(fill(cur.body, vals)); }; });
      $('pCopy').onclick = function () { var txt = fill(cur.body, vals); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Message copied.', 'success'); }, function () { toast('Copy is not available in this browser.', 'error'); }); };
    }
    overlay(''); setT(cur);
  }

  /* ---------- enhance existing lists ---------- */
  function enhance() {
    var al = $('approvalsList'); if (al && ST.cid) {
      var missing = false, cards = al.querySelectorAll('.row-card');
      Array.prototype.forEach.call(cards, function (c) {
        if (c.getAttribute('data-fupd')) return; var b = c.querySelector('[data-act="approve-send"]'); if (!b) return;
        var id = b.getAttribute('data-id'), p = ST.pend[id]; if (!p) { missing = true; return; } c.setAttribute('data-fupd', '1');
        var acts = c.querySelector('.row-acts'); if (!acts) return;
        if (/^whatsapp$/i.test(p.ch)) {
          var t = ST.wa[p.lead], open = t && Date.now() < t + WIN, chip = document.createElement('div'); chip.className = 'fup-win ' + (open ? 'ok' : 'closed');
          chip.innerHTML = open ? 'WhatsApp window open · ' + left(t + WIN - Date.now()) + ' left' : 'WhatsApp window closed' + (ST.omni ? ' · <button type="button" data-fup="pick" data-id="' + esc(id) + '">Use approved template</button>' : ' · <a href="billing.html?plan=omni">Omni can send approved templates</a>');
          c.insertBefore(chip, acts);
        }
        var d = document.createElement('button'); d.type = 'button'; d.className = 'btn sm ghost fup-red'; d.setAttribute('data-fup', 'deldraft'); d.setAttribute('data-id', id); d.textContent = 'Delete'; acts.insertBefore(d, acts.firstChild);
      });
      var hd = document.querySelector('#pane-tasks .card-h'), n = Object.keys(ST.pend).length;
      if (hd && !$('fupDelAll')) { var a = document.createElement('button'); a.id = 'fupDelAll'; a.type = 'button'; a.className = 'btn sm ghost fup-red'; a.setAttribute('data-fup', 'delall'); a.textContent = 'Delete all drafts'; hd.appendChild(a); }
      if ($('fupDelAll')) $('fupDelAll').hidden = n < 2;
      if (missing) resync();
    }
    var lp = $('lpBody'); if (lp && ST.cid) Array.prototype.forEach.call(lp.querySelectorAll('.bub.out'), function (bb) {
      if (bb.getAttribute('data-fupd')) return; var sm = bb.querySelector('small'); if (!sm || !/^Draft/.test(sm.textContent)) return;
      var txt = (bb.firstChild && bb.firstChild.textContent || '').trim(), id = Object.keys(ST.pend).filter(function (k) { return ST.pend[k].msg === txt; })[0];
      bb.setAttribute('data-fupd', '1'); if (!id) { resync(); return; }
      var d = document.createElement('button'); d.type = 'button'; d.className = 'fup-link fup-red'; d.setAttribute('data-fup', 'deldraft'); d.setAttribute('data-id', id); d.textContent = 'Delete draft'; bb.appendChild(d);
    });
  }
  var rt = null; function resync() { clearTimeout(rt); rt = setTimeout(function () { syncPending().then(enhance); }, 400); }
  var et = null; function later() { clearTimeout(et); et = setTimeout(enhance, 60); }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target; if (t.closest && t.closest('[data-x]')) { closeOv(); return; }
    var ov = $('fupOv'); if (ov && t === ov) { closeOv(); return; }
    var sg = t.closest && t.closest('[data-seg]'); if (sg) { ST.seg = sg.getAttribute('data-seg'); renderTpl(); return; }
    var fs = t.closest && t.closest('[data-fs]'); if (fs) { ST.fs = fs.getAttribute('data-fs'); renderTpl(); return; }
    var a = t.closest && t.closest('[data-fup]'); if (!a) return; var k = a.getAttribute('data-fup'), id = a.getAttribute('data-id');
    var tp = ST.tpls.filter(function (x) { return x.id === id; })[0];
    if (k === 'new') openEditor();
    else if (k === 'edit' && tp) openEditor(tp);
    else if (k === 'dup' && tp) { var c = JSON.parse(JSON.stringify(tp)); c.id = ''; c.name = (tp.name + '_copy').slice(0, 512); c.status = 'draft'; c.rejection_reason = ''; openEditor(c); }
    else if (k === 'del' && tp) confirmBox('Delete template?', 'This removes "' + tp.name + '" from GLIME. It does not delete it from Meta.', 'Delete template', async function () { await delTpl(id); renderTpl(); toast('Template deleted.', 'success'); });
    else if (k === 'addvar') { var b = $('eBody'), n = vars(b.value).length + 1; b.value += '{{' + n + '}}'; b.focus(); readForm(); drawVars(); refresh(); }
    else if (k === 'addbtn' && ED) { readForm(); var ty = a.getAttribute('data-t'), cn = ED.buttons.filter(function (x) { return x.type === ty; }).length, mx = { quick: 3, url: 2, phone: 1 }[ty]; if (cn >= mx) { toast('You can add up to ' + mx + ' of this button type.', 'error'); return; } ED.buttons.push({ type: ty, text: '', value: '' }); drawBtns(); refresh(); }
    else if (k === 'rmbtn' && ED) { ED.buttons.splice(+a.getAttribute('data-i'), 1); drawBtns(); refresh(); }
    else if (k === 'save' && ED) saveEditor(a);
    else if (k === 'deldraft') confirmBox('Delete this draft?', 'The message will not be sent. The lead and its chat stay as they are.', 'Delete draft', function () { return delDraft(id); });
    else if (k === 'delall') confirmBox('Delete all drafts?', Object.keys(ST.pend).length + ' drafts waiting for approval will be deleted. Nothing will be sent.', 'Delete all', delAll);
    else if (k === 'pick') openPicker(id);
    else if (k === 'gotpl') { closeOv(); var tb = document.querySelector('[data-tab="templates"]'); if (tb) tb.click(); ST.seg = 'meta'; renderTpl(); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target; if (t.id === 'fupQ') { ST.q = t.value.trim().toLowerCase(); var p = t.selectionStart; renderTpl(); var q = $('fupQ'); if (q) { q.focus(); q.setSelectionRange(p, p); } return; }
    if (!ED) return;
    if (t.hasAttribute('data-sv')) ED.samples[+t.getAttribute('data-sv')] = t.value;
    else if (t.hasAttribute('data-vm')) ED.var_map[+t.getAttribute('data-vm')] = t.value;
    else if (t.hasAttribute('data-bt')) ED.buttons[+t.getAttribute('data-bt')].text = t.value;
    else if (t.hasAttribute('data-bv')) ED.buttons[+t.getAttribute('data-bv')].value = t.value.trim();
    else if (t.id === 'eBody') { readForm(); drawVars(); }
    else if (t.id) readForm();
    refresh();
  });
  document.addEventListener('change', async function (e) {
    var t = e.target; if (t.id === 'fupC') { ST.fc = t.value; renderTpl(); return; }
    if (t.hasAttribute && t.hasAttribute('data-fup-st')) {
      var tp = ST.tpls.filter(function (x) { return x.id === t.getAttribute('data-fup-st'); })[0]; if (!tp) return;
      if (t.value === 'rejected') { var c = JSON.parse(JSON.stringify(tp)); c.status = 'rejected'; openEditor(c); return; }
      try { await saveTpl(Object.assign({}, tp, { status: t.value, rejection_reason: '' })); renderTpl(); } catch (er) { toast('Could not update status.', 'error'); renderTpl(); }
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOv(); });

  function start() {
    mount(); renderTpl();
    try { var mo = new MutationObserver(later); ['approvalsList', 'lpBody'].forEach(function (id) { var el = $(id); if (el) mo.observe(el, { childList: true, subtree: true }); }); } catch (e) { }
    init().catch(function (e) { if (window.console) console.warn('Follow-up Pro add-on:', e); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
