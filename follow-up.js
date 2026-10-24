/* =========================================================
   GLIME — Follow-up Specialist (frontend)
   Premium pipeline UI. Uses the existing Supabase tables and
   the existing follow-up edge functions; no backend changes.
   ========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  var HANDOFF_FN = SUPABASE_URL + '/functions/v1/lead-followup-handoff-v2';
  var SPECIALIST_FN = SUPABASE_URL + '/functions/v1/follow-up-specialist';

  var db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ---------- state ---------- */
  var S = {
    user: null, client: null, settings: null,
    leads: [], fuLeads: [], requests: [], cases: [], conclusions: [], changes: [], connections: [],
    convByLead: {}, msgs: {}, loadErrors: [],
    tab: 'pipeline', range: 7, selected: null, lpTab: 'chat', expanded: {}, quick: ''
  };

  var STAGES = [
    { id: 'new', title: 'New Leads', icon: 'i-leads', color: '#4da3ff' },
    { id: 'contact', title: 'Initial Contact', icon: 'i-bubble', color: '#a77bff' },
    { id: 'due', title: 'Follow-up Due', icon: 'i-clock', color: '#ffb340' },
    { id: 'disc', title: 'In Discussion', icon: 'i-users', color: '#19e68c' },
    { id: 'conv', title: 'Converted', icon: 'i-check', color: '#2ee59d' }
  ];
  var CHANNELS = [
    { id: 'instagram', name: 'Instagram', icon: 'i-ig', color: '#e1306c' },
    { id: 'whatsapp', name: 'WhatsApp', icon: 'i-wa', color: '#25d366' },
    { id: 'email', name: 'Email', icon: 'i-mail', color: '#4da3ff' },
    { id: 'voice', name: 'Voice', icon: 'i-phone', color: '#a77bff' }
  ];
  var SENT_STATES = ['sent', 'executed', 'completed', 'delivered', 'approved_sent'];
  var PENDING_STATES = ['proposed', 'drafted'];
  var CONVERTED = ['won', 'converted', 'customer', 'closed_won', 'completed', 'paid'];
  var LOST = ['lost', 'closed_lost', 'not_interested', 'dead', 'junk', 'spam'];
  var DISCUSSION = ['in_discussion', 'discussion', 'negotiation', 'interested', 'qualified', 'proposal', 'hot', 'engaged'];
  var CONTACTED = ['contacted', 'initial_contact', 'replied', 'follow_up_sent', 'warm'];
  var DUE_STATES = ['follow_up', 'followup', 'follow_up_due', 'due'];
  var QUIET_MS = 24 * 3600000;   // we sent last and customer silent this long -> Follow-up Due
  var MSG_LIMIT = 100;           // latest messages loaded per channel in lead panel

  var TEMPLATES = [
    { tag: 'First touch', title: 'Warm welcome', body: 'Hi {name} 👋\nThanks for reaching out! I\'d be happy to share more details and help you choose what fits best. What are you looking for?' },
    { tag: 'Pricing', title: 'Price follow-up', body: 'Hi {name}, just checking in. Did you get a chance to look at the pricing I shared? I can walk you through the options or tailor one for your needs.' },
    { tag: 'Re-engage', title: 'Gentle nudge', body: 'Hi {name}, it\'s been a few days. Are you still interested? Happy to answer any questions or help you get started.' },
    { tag: 'After demo', title: 'Post-demo check-in', body: 'Hi {name}, thanks for your time earlier. Do you have any questions about what we covered? I can share next steps whenever you\'re ready.' },
    { tag: 'Closing', title: 'Ready to confirm', body: 'Hi {name}, everything is ready on our side. Shall I confirm your order/booking so we can get started?' },
    { tag: 'Thank you', title: 'Thanks & feedback', body: 'Hi {name}, thank you for choosing us! We\'d love to hear how it went. Your feedback helps us serve you better.' }
  ];

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function cap(v) { v = String(v || ''); return v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' '); }
  function lc(v) { return String(v == null ? '' : v).toLowerCase().trim().replace(/[\s-]+/g, '_'); }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
  function ts(v) { var t = v ? new Date(v).getTime() : NaN; return isNaN(t) ? 0 : t; }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/).slice(0, 2);
    return p.map(function (x) { return x.charAt(0).toUpperCase(); }).join('') || '?';
  }
  var AV = ['#2f6fed', '#a05bf0', '#0e9f6e', '#d9822b', '#c2417a', '#1f8fa8', '#7a5af8', '#b45309'];
  function avColor(seed) {
    var h = 0, s = String(seed || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AV[h % AV.length];
  }
  function ago(t) {
    if (!t) return '—';
    var d = Date.now() - t, m = Math.round(d / 60000);
    if (d < 0) return 'upcoming';
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min' + (m > 1 ? 's' : '') + ' ago';
    var h = Math.round(m / 60); if (h < 24) return h + ' hour' + (h > 1 ? 's' : '') + ' ago';
    var dd = Math.round(h / 24); if (dd < 30) return dd + ' day' + (dd > 1 ? 's' : '') + ' ago';
    return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  function fmtDate(t) {
    if (!t) return '—';
    return new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function money(n) {
    n = Math.round(n || 0);
    return '₹' + n.toLocaleString('en-IN');
  }
  function durLabel(ms) {
    var h = Math.floor(ms / 3600000);
    if (h < 24) return Math.max(1, h) + 'h';
    return Math.floor(h / 24) + 'd';
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
  function icon(id, cls) { return '<svg class="ni' + (cls ? ' ' + cls : '') + '"><use href="#' + id + '"/></svg>'; }
  function fmtVal(v) {
    if (v == null || v === '') return '—';
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
    return String(v);
  }

  function toast(msg, type) {
    var box = $('toasts'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info'); el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }
  function pageMsg(html, type) {
    var el = $('pageMsg'); if (!el) return;
    el.hidden = false; el.className = 'page-msg' + (type ? ' ' + type : ''); el.innerHTML = html;
  }
  function clearMsg() { var el = $('pageMsg'); if (el) el.hidden = true; }

  /* ---------- modal ---------- */
  function openModal(title, html) {
    $('modalTitle').textContent = title; $('modalBody').innerHTML = html; $('modal').classList.remove('hidden');
    var f = $('modalBody').querySelector('textarea,input,button'); if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeModal() { $('modal').classList.add('hidden'); }

  /* ---------- auth + data ---------- */
  function clientId() { var c = S.client || {}; return c.client_id || c.id || c.clientId || null; }

  async function loadClient() {
    var uid = S.user.id, email = S.user.email || '';
    var r = await db.from('client_data').select('*').eq('auth_user_id', uid).maybeSingle();
    if ((!r.data) && email) r = await db.from('client_data').select('*').eq('email', email).maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) throw new Error('Your client profile was not found.');
    S.client = r.data;
  }

  async function safeList(q, label) {
    var r = await q;
    if (r.error) { console.warn('Follow-up load error (' + label + '):', r.error); S.loadErrors.push(label); return []; }
    return r.data || [];
  }

  async function loadSettings() {
    var cid = clientId();
    var r = await db.from('client_followup_settings').select('*').eq('client_id', cid).maybeSingle();
    if (r.error) throw r.error;
    if (r.data) { S.settings = r.data; return; }
    var ins = await db.from('client_followup_settings').insert({ client_id: cid, enabled: false, sending_mode: 'manual_approval' }).select().single();
    if (ins.error) throw ins.error;
    S.settings = ins.data;
  }

  function buildConvIndex(wa, ig) {
    var idx = {};
    function add(c, channel) {
      if (!c.lead_id) return;
      var k = String(c.lead_id);
      var e = idx[k] || (idx[k] = { lastIn: 0, lastOut: 0, last: 0, convs: [] });
      e.lastIn = Math.max(e.lastIn, ts(c.last_inbound_at));
      e.lastOut = Math.max(e.lastOut, ts(c.last_outbound_at));
      e.last = Math.max(e.last, ts(c.last_message_at), e.lastIn, e.lastOut);
      e.convs.push({ id: c.id, channel: channel });
    }
    (wa || []).forEach(function (c) { add(c, 'whatsapp'); });
    (ig || []).forEach(function (c) { add(c, 'instagram'); });
    return idx;
  }

  function showLoadWarnings() {
    if (S.loadErrors.length) {
      pageMsg('Some data could not be loaded (' + esc(S.loadErrors.join(', ')) + '). <a href="#" id="retryLoad">Retry</a>', 'error');
    } else { clearMsg(); }
  }

  async function loadAll() {
    var cid = clientId();
    S.loadErrors = [];
    await loadSettings();
    var res = await Promise.all([
      safeList(db.from('leads').select('*').eq('client_id', cid).order('created_at', { ascending: false }), 'leads'),
      safeList(db.from('client_followup_leads').select('*').eq('client_id', cid), 'followup leads'),
      safeList(db.from('client_action_requests').select('*').eq('client_id', cid).eq('intent', 'lead_follow_up').order('created_at', { ascending: false }).limit(200), 'requests'),
      safeList(db.from('follow_up_cases').select('*').eq('client_id', cid).order('created_at', { ascending: false }).limit(100), 'cases'),
      safeList(db.from('follow_up_conclusions').select('*').eq('client_id', cid).order('created_at', { ascending: false }).limit(50), 'conclusions'),
      safeList(db.from('follow_up_proposed_changes').select('*').eq('client_id', cid).order('created_at', { ascending: false }).limit(100), 'changes'),
      safeList(db.from('client_channel_connections').select('*').eq('client_id', cid), 'connections'),
      safeList(db.from('whatsapp_conversations').select('id,lead_id,last_message_at,last_inbound_at,last_outbound_at').eq('client_id', cid).not('lead_id', 'is', null).order('last_message_at', { ascending: false }).limit(1000), 'WhatsApp conversations'),
      safeList(db.from('instagram_conversations').select('id,lead_id,last_message_at,last_inbound_at,last_outbound_at').eq('client_id', cid).not('lead_id', 'is', null).order('last_message_at', { ascending: false }).limit(1000), 'Instagram conversations')
    ]);
    S.leads = res[0]; S.fuLeads = res[1]; S.requests = res[2]; S.cases = res[3];
    S.conclusions = res[4]; S.changes = res[5]; S.connections = res[6];
    S.convByLead = buildConvIndex(res[7], res[8]);
  }

  async function initialize() {
    var s = await db.auth.getSession();
    if (s.error) throw s.error;
    if (!s.data || !s.data.session || !s.data.session.user) {
      pageMsg('<strong>Login required.</strong> Please sign in to use Follow-up Specialist. <a href="login.html">Login</a>', 'error');
      return false;
    }
    S.user = s.data.session.user;
    await loadClient();
    applyIdentity();
    await loadAll();
    return true;
  }

  function applyIdentity() {
    var c = S.client || {};
    var name = c.business_name || c.company_name || c.name || c.full_name || (S.user && S.user.email) || 'GLIME workspace';
    $('acctName').textContent = name;
    $('acctId').textContent = clientId() ? String(clientId()) : '';
    var l = initials(name).charAt(0);
    $('acctAv').textContent = l; $('meAv').textContent = l;
  }

  /* ---------- lead model ---------- */
  function fuEnabled(id) {
    var row = S.fuLeads.filter(function (r) { return String(r.lead_id) === String(id); })[0];
    return row ? row.enabled !== false : true;
  }
  function leadChannel(l) {
    if (l.instagram_thread_id) return 'instagram';
    var src = lc(l.source || l.channel || '');
    if (src.indexOf('insta') > -1) return 'instagram';
    if (src.indexOf('whats') > -1) return 'whatsapp';
    if (src.indexOf('mail') > -1) return 'email';
    if (src.indexOf('voice') > -1 || src.indexOf('call') > -1) return 'voice';
    if (l.whatsapp) return 'whatsapp';
    if (l.email) return 'email';
    return 'other';
  }
  function model(l) {
    var status = lc(l.status || l.stage || 'new');
    var nextAt = ts(l.next_follow_up_at);
    var cv = S.convByLead[String(l.id)] || null;
    var lastIn = cv ? cv.lastIn : 0, lastOut = cv ? cv.lastOut : 0;
    var last = (cv && cv.last) || ts(l.last_contacted_at) || ts(l.updated_at) || ts(l.created_at);
    var m = {
      raw: l, id: l.id,
      name: l.name || l.full_name || l.customer_name || 'Unnamed lead',
      phone: l.mobile || l.phone || l.whatsapp || '',
      status: status, nextAt: nextAt, last: last, created: ts(l.created_at), updated: ts(l.updated_at) || ts(l.created_at),
      priority: lc(l.priority || ''), channel: leadChannel(l),
      source: l.source ? cap(l.source) : (leadChannel(l) === 'other' ? 'Website' : cap(leadChannel(l))),
      interest: l.interest || l.product_service || l.service || '',
      budget: num(l.budget), hasChat: !!cv, lastIn: lastIn, lastOut: lastOut, quietMs: 0
    };
    var now = Date.now();
    var endToday = startOfDay(now) + 86400000 - 1;
    var stage;
    if (CONVERTED.indexOf(status) > -1) stage = 'conv';
    else if (LOST.indexOf(status) > -1) stage = 'lost';
    else if (DUE_STATES.indexOf(status) > -1 || (nextAt && nextAt <= endToday)) {
      stage = 'due';
      m.dueKind = (nextAt && nextAt < now) ? 'overdue' : 'today';
    }
    else if (cv && lastOut && lastOut >= lastIn && now - lastOut >= QUIET_MS) {
      stage = 'due';
      m.quietMs = now - lastOut;
      m.dueKind = m.quietMs >= 3 * 86400000 ? 'overdue' : 'today';
    }
    else if (DISCUSSION.indexOf(status) > -1) stage = 'disc';
    else if (cv && lastOut) stage = lastIn > lastOut ? 'disc' : 'contact';
    else if (CONTACTED.indexOf(status) > -1) stage = 'contact';
    else stage = 'new';
    m.stage = stage;
    return m;
  }
  function models() { return S.leads.map(model); }
  function byId(id) { return models().filter(function (m) { return String(m.id) === String(id); })[0]; }

  /* ---------- filters ---------- */
  function filtered() {
    var q = $('fSearch').value.trim().toLowerCase();
    var st = $('fStatus').value, so = $('fSource').value, ch = $('fChannel').value, pr = $('fPriority').value;
    var now = Date.now();
    return models().filter(function (m) {
      if (m.stage === 'lost') return false;
      if (st && m.stage !== st) return false;
      if (so && m.source !== so) return false;
      if (ch && m.channel !== ch) return false;
      if (pr && m.priority !== pr) return false;
      if (S.quick === 'inactive' && (m.stage === 'conv' || now - m.last < 7 * 86400000)) return false;
      if (q) {
        var hay = (m.name + ' ' + m.phone + ' ' + m.source + ' ' + m.interest + ' ' + m.channel).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function fillFilters() {
    var all = models();
    var stSel = $('fStatus'), soSel = $('fSource'), chSel = $('fChannel');
    var stVal = stSel.value, soVal = soSel.value, chVal = chSel.value;
    stSel.innerHTML = '<option value="">All Status</option>' + STAGES.map(function (s) { return '<option value="' + s.id + '">' + esc(s.title) + '</option>'; }).join('');
    var sources = {}; all.forEach(function (m) { sources[m.source] = 1; });
    soSel.innerHTML = '<option value="">All Sources</option>' + Object.keys(sources).sort().map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
    var chs = {}; all.forEach(function (m) { chs[m.channel] = 1; });
    chSel.innerHTML = '<option value="">All Channels</option>' + Object.keys(chs).sort().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c === 'other' ? 'Other' : cap(c)) + '</option>'; }).join('');
    stSel.value = stVal; soSel.value = soVal; chSel.value = chVal;
  }

  /* ---------- KPI ---------- */
  function trendHtml(cur, prev, days) {
    var tail = '<small class="vs">vs prev ' + days + 'd</small>';
    if (!cur && !prev) return '<span class="trend flat">— ' + tail + '</span>';
    if (!prev) return '<span class="trend">▲ new</span>';
    var p = Math.round(((cur - prev) / prev) * 100);
    if (p === 0) return '<span class="trend flat">0% ' + tail + '</span>';
    return '<span class="trend' + (p < 0 ? ' warn' : '') + '">' + (p > 0 ? '▲ ' : '▼ ') + Math.abs(p) + '% ' + tail + '</span>';
  }
  function inRange(t, from, to) { return t >= from && t < to; }

  function renderKPIs() {
    var days = S.range, now = Date.now(), cur0 = now - days * 86400000, prev0 = cur0 - days * 86400000;
    var ms = models();
    var curLeads = ms.filter(function (m) { return inRange(m.created, cur0, now + 1); }).length;
    var prevLeads = ms.filter(function (m) { return inRange(m.created, prev0, cur0); }).length;
    var sentReq = S.requests.filter(function (r) { return SENT_STATES.indexOf(lc(r.status)) > -1; });
    function rt(r) { return ts(r.sent_at) || ts(r.executed_at) || ts(r.updated_at) || ts(r.created_at); }
    var curSent = sentReq.filter(function (r) { return inRange(rt(r), cur0, now + 1); }).length;
    var prevSent = sentReq.filter(function (r) { return inRange(rt(r), prev0, cur0); }).length;
    var conv = ms.filter(function (m) { return m.stage === 'conv'; });
    var curConv = conv.filter(function (m) { return inRange(m.updated, cur0, now + 1); });
    var prevConv = conv.filter(function (m) { return inRange(m.updated, prev0, cur0); });
    var curRev = curConv.reduce(function (a, m) { return a + m.budget; }, 0);
    var prevRev = prevConv.reduce(function (a, m) { return a + m.budget; }, 0);
    var due = ms.filter(function (m) { return m.stage === 'due'; }).length;

    $('kTotal').textContent = ms.length.toLocaleString('en-IN');
    setTrend('kTotalT', curLeads, prevLeads, days);
    $('kPending').textContent = String(due);
    $('kPendingT').textContent = due ? 'need attention' : 'all caught up';
    $('kPendingT').className = 'trend' + (due ? ' warn' : '');
    $('kSent').textContent = String(curSent);
    setTrend('kSentT', curSent, prevSent, days);
    $('kConv').textContent = String(curConv.length);
    setTrend('kConvT', curConv.length, prevConv.length, days);
    $('kRev').textContent = money(curRev);
    setTrend('kRevT', curRev, prevRev, days);
    $('perfRange').textContent = 'Last ' + days + ' Days';
  }
  function setTrend(id, cur, prev, days) {
    var el = $(id); var tmp = document.createElement('div'); tmp.innerHTML = trendHtml(cur, prev, days);
    var node = tmp.firstChild; node.id = id; el.replaceWith(node);
  }

  /* ---------- engine ---------- */
  function renderEngine() {
    var on = !!(S.settings && S.settings.enabled);
    $('engToggle').checked = on;
    var st = $('engState'); st.textContent = on ? 'Active' : 'Paused'; st.className = 'state' + (on ? ' on' : '');
    var mode = (S.settings && S.settings.sending_mode) || 'manual_approval';
    var r = document.querySelector('input[name="sendingMode"][value="' + mode + '"]'); if (r) r.checked = true;
  }

  async function persistSettings(patch) {
    var r = await db.from('client_followup_settings').update(Object.assign({}, patch, { updated_at: new Date().toISOString() })).eq('client_id', clientId()).select().single();
    if (r.error) throw r.error;
    S.settings = r.data;
  }

  /* ---------- pipeline ---------- */
  function cardHtml(m, color) {
    var tag = '';
    if (m.stage === 'new') tag = '<span class="tag new">New</span>';
    else if (m.stage === 'contact') tag = '<span class="tag contacted">Contacted</span>';
    else if (m.stage === 'due') tag = m.quietMs
      ? '<span class="tag ' + (m.dueKind === 'overdue' ? 'overdue' : 'today') + '">Quiet ' + esc(durLabel(m.quietMs)) + '</span>'
      : (m.dueKind === 'overdue' ? '<span class="tag overdue">Overdue</span>' : '<span class="tag today">Due Today</span>');
    else if (m.stage === 'disc') tag = '<span class="tag disc">In Discussion</span>';
    else if (m.stage === 'conv') tag = '<span class="tag won">Won</span>';
    var sub = m.stage === 'conv' ? (m.budget ? money(m.budget) : cap(m.channel === 'other' ? 'website' : m.channel)) : (m.interest || m.source);
    var time = m.stage === 'due' && m.nextAt ? (m.nextAt < Date.now() ? ago(m.nextAt) : 'at ' + new Date(m.nextAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })) : ago(m.last);
    var ch = CHANNELS.filter(function (c) { return c.id === m.channel; })[0];
    return '<div class="lcard' + (String(S.selected) === String(m.id) ? ' sel-on' : '') + '" data-lead="' + esc(m.id) + '" tabindex="0" role="button" aria-label="Open ' + esc(m.name) + '" style="--cc:' + color + '">' +
      '<div class="lc-top"><span class="av" style="--avbg:' + avColor(m.name) + '">' + esc(initials(m.name)) + '</span>' +
      '<div class="lc-name"><b>' + esc(m.name) + '</b><small>' + esc(sub) + '</small></div>' + tag + '</div>' +
      '<div class="lc-bot"><span>' + esc(time) + '</span><div class="lc-acts">' +
      '<button class="lc-act" data-act="draft" data-id="' + esc(m.id) + '" title="Create AI follow-up draft" aria-label="Create AI follow-up draft">' + icon('i-send') + '</button>' +
      (m.phone ? '<a class="lc-act" href="tel:' + esc(m.phone) + '" title="Call" aria-label="Call">' + icon('i-phone') + '</a>' : '') +
      '<button class="lc-act" data-act="open" data-id="' + esc(m.id) + '" title="Open conversation" aria-label="Open conversation">' + icon('i-bubble') + '</button>' +
      '</div></div></div>';
  }

  function renderBoard() {
    var list = filtered();
    var html = STAGES.map(function (st) {
      var items = list.filter(function (m) { return m.stage === st.id; });
      if (st.id === 'due') items.sort(function (a, b) { return (a.nextAt || 9e15) - (b.nextAt || 9e15); });
      else items.sort(function (a, b) { return b.updated - a.updated; });
      var show = S.expanded[st.id] ? items : items.slice(0, 3);
      var more = items.length - show.length;
      return '<section class="col" data-stage="' + st.id + '" style="--cc:' + st.color + '" aria-label="' + esc(st.title) + '">' +
        '<div class="col-h"><span class="col-ic">' + icon(st.icon) + '</span><div><b>' + esc(st.title) + '</b><small>' + items.length + ' lead' + (items.length === 1 ? '' : 's') + '</small></div></div>' +
        '<div class="cards">' + (show.length ? show.map(function (m) { return cardHtml(m, st.color); }).join('') : '<div class="col-empty">No leads here</div>') + '</div>' +
        (more > 0 ? '<button class="col-more" data-expand="' + st.id + '" type="button">+ ' + more + ' more lead' + (more === 1 ? '' : 's') + '</button>' :
          (S.expanded[st.id] && items.length > 3 ? '<button class="col-more" data-expand="' + st.id + '" type="button">Show less</button>' : '')) +
        '</section>';
    }).join('');
    $('board').innerHTML = html;
  }

  /* ---------- tasks ---------- */
  function reqLead(r) {
    var p = r.action_payload || r.payload || {};
    var id = r.lead_id || r.target_id || p.lead_id || '';
    return byId(id);
  }
  function reqMsg(r) { var p = r.action_payload || r.payload || {}; return p.message || p.body || p.text || ''; }
  function reqChannel(r) { var p = r.action_payload || r.payload || {}; return r.channel || r.target_channel || p.channel || 'instagram'; }

  function renderTasks() {
    var pending = S.requests.filter(function (r) { return PENDING_STATES.indexOf(lc(r.status)) > -1; });
    $('approvalsList').innerHTML = pending.length ? pending.map(function (r) {
      var m = reqLead(r), name = m ? m.name : 'Lead';
      return '<div class="row-card"><div class="row-top"><span class="av" style="--avbg:' + avColor(name) + '">' + esc(initials(name)) + '</span><div><b>' + esc(name) + '</b><small>' + esc(cap(reqChannel(r))) + '</small></div><span class="tag upcoming">' + esc(cap(r.status || 'proposed')) + '</span></div>' +
        '<div class="draft">' + esc(reqMsg(r) || 'Message unavailable') + '</div>' +
        '<div class="row-acts"><button class="btn sm ghost" data-act="edit-draft" data-id="' + esc(r.id) + '" type="button">Edit</button><button class="btn sm primary" data-act="approve-send" data-id="' + esc(r.id) + '" type="button">Approve &amp; Send</button></div></div>';
    }).join('') : '<div class="empty">No drafts waiting for approval.</div>';

    var due = models().filter(function (m) { return m.stage === 'due'; }).sort(function (a, b) { return (a.nextAt || 9e15) - (b.nextAt || 9e15); });
    $('dueList').innerHTML = due.length ? due.map(function (m) {
      return '<div class="row-card"><div class="row-top"><span class="av" style="--avbg:' + avColor(m.name) + '">' + esc(initials(m.name)) + '</span><div><b>' + esc(m.name) + '</b><small>' + esc(m.interest || m.source) + ' · ' + esc(m.nextAt ? fmtDate(m.nextAt) : (m.quietMs ? 'No reply for ' + durLabel(m.quietMs) : 'follow-up due')) + '</small></div>' +
        (m.dueKind === 'overdue' ? '<span class="tag overdue">Overdue</span>' : '<span class="tag today">Due Today</span>') + '</div>' +
        '<div class="row-acts"><button class="btn sm ghost" data-act="open" data-id="' + esc(m.id) + '" type="button">Open</button><button class="btn sm primary" data-act="draft" data-id="' + esc(m.id) + '" type="button">AI follow-up</button></div></div>';
    }).join('') : '<div class="empty">Nothing is due. You\'re all caught up.</div>';

    var n = pending.length + due.length, tn = $('tabTaskN');
    tn.textContent = String(n > 99 ? '99+' : n); tn.classList.toggle('hidden', !n);
    $('bellDot').classList.toggle('hidden', !n);
  }

  /* ---------- automations ---------- */
  function renderAutomations() {
    var ms = models();
    $('leadToggles').innerHTML = ms.length ? ms.filter(function (m) { return m.stage !== 'lost'; }).slice(0, 200).map(function (m) {
      return '<div class="tog-row"><span class="av" style="--avbg:' + avColor(m.name) + '">' + esc(initials(m.name)) + '</span><div><b>' + esc(m.name) + '</b><small>' + esc(cap(m.status)) + ' · ' + esc(m.source) + '</small></div>' +
        '<label class="switch"><input type="checkbox" data-toggle-lead="' + esc(m.id) + '"' + (fuEnabled(m.id) ? ' checked' : '') + ' aria-label="Follow-up for ' + esc(m.name) + '"><span class="slider"></span></label></div>';
    }).join('') : '<div class="empty">No leads yet.</div>';
  }

  /* ---------- templates ---------- */
  function renderTemplates() {
    $('tplGrid').innerHTML = TEMPLATES.map(function (t, i) {
      return '<article class="tpl"><span class="tag disc">' + esc(t.tag) + '</span><h3>' + esc(t.title) + '</h3><p>' + esc(t.body) + '</p>' +
        '<div class="row-acts"><button class="btn sm primary" data-copy-tpl="' + i + '" type="button">Copy template</button></div></article>';
    }).join('');
  }

  /* ---------- analytics ---------- */
  function renderAnalytics() {
    var cases = S.cases.filter(function (c) { return ['applied', 'concluded'].indexOf(lc(c.status)) < 0; });
    $('casesList').innerHTML = cases.length ? cases.map(function (c) {
      var m = byId(c.lead_id), name = m ? m.name : 'Lead';
      return '<div class="row-card"><div class="row-top"><span class="av" style="--avbg:' + avColor(name) + '">' + esc(initials(name)) + '</span><div><b>' + esc(name) + '</b><small>Status: ' + esc(c.status || 'pending') + '</small></div></div>' +
        '<div class="row-acts"><button class="btn sm primary" data-act="analyze" data-id="' + esc(c.id) + '" type="button">Analyze conversation</button></div></div>';
    }).join('') : '<div class="empty">No conversations waiting for analysis.</div>';

    var ch = S.changes.filter(function (c) { return ['proposed', 'edited', 'pending', 'approved'].indexOf(lc(c.status)) > -1; });
    $('changesList').innerHTML = ch.length ? ch.map(function (c) {
      var m = byId(c.lead_id), name = m ? m.name : 'Lead';
      var field = c.field_name || c.field || 'Lead field';
      var oldV = c.current_value != null ? c.current_value : c.old_value;
      var newV = c.proposed_value != null ? c.proposed_value : c.new_value;
      var approved = lc(c.status) === 'approved';
      return '<div class="row-card"><div class="row-top"><span class="av" style="--avbg:' + avColor(name) + '">' + esc(initials(name)) + '</span><div><b>' + esc(name) + '</b><small>' + esc(field) + '</small></div><span class="tag upcoming">' + esc(cap(c.status)) + '</span></div>' +
        '<div class="chg"><div><small>Current</small>' + esc(fmtVal(oldV)) + '</div><span>→</span><div><small>Proposed</small>' + esc(fmtVal(newV)) + '</div></div>' +
        (c.reason ? '<small class="muted">' + esc(c.reason) + '</small>' : '') +
        '<div class="row-acts">' + (approved ? '<button class="btn sm primary" data-act="apply-change" data-id="' + esc(c.id) + '" type="button">Apply to Lead</button>' :
          '<button class="btn sm ghost" data-act="edit-change" data-id="' + esc(c.id) + '" type="button">Edit</button><button class="btn sm primary" data-act="approve-change" data-id="' + esc(c.id) + '" type="button">Review &amp; Approve</button>') + '</div></div>';
    }).join('') : '<div class="empty">No proposed lead changes.</div>';

    $('conclusionsList').innerHTML = S.conclusions.length ? S.conclusions.slice(0, 20).map(function (c) {
      var conf = Number(c.confidence), ctext = isFinite(conf) && c.confidence != null ? Math.round(conf <= 1 ? conf * 100 : conf) + '%' : '—';
      function kv(l, v) { return '<div><small>' + l + '</small><b>' + esc(v || '—') + '</b></div>'; }
      return '<div class="row-card"><div class="row-top"><b>' + esc(c.intent || 'Follow-up conclusion') + '</b><span class="tag disc">Confidence ' + ctext + '</span></div>' +
        '<p class="muted">' + esc(c.summary || 'No summary available.') + '</p>' +
        '<div class="concl-grid">' + kv('Interest', c.interest) + kv('Stage', c.stage) + kv('Sentiment', c.sentiment) + kv('Buying signal', c.buying_signal) + '</div>' +
        '<small class="muted"><b>Next action:</b> ' + esc(c.next_action || '—') + '</small></div>';
    }).join('') : '<div class="empty">No conclusions yet.</div>';
  }

  /* ---------- bottom widgets ---------- */
  function renderSuggestions() {
    var ms = models().filter(function (m) { return m.stage !== 'lost'; });
    var now = Date.now();
    var high = ms.filter(function (m) { return m.stage !== 'conv' && (m.priority === 'high' || m.priority === 'urgent'); }).length;
    var due = ms.filter(function (m) { return m.stage === 'due'; }).length;
    var pend = S.requests.filter(function (r) { return PENDING_STATES.indexOf(lc(r.status)) > -1; }).length;
    var stale = ms.filter(function (m) { return m.stage !== 'conv' && now - m.last >= 7 * 86400000; }).length;
    var items = [];
    if (high) items.push({ ic: 'i-star', c: '#ffb340', t: 'Follow up with ' + high + ' high-intent lead' + (high > 1 ? 's' : ''), s: 'These leads are marked high priority', b: 'View Leads', k: 'high' });
    if (due) items.push({ ic: 'i-flame', c: '#ff5d6c', t: due + ' lead' + (due > 1 ? 's need' : ' needs') + ' a follow-up now', s: 'Follow-up is due or overdue', b: 'View Leads', k: 'due' });
    if (pend) items.push({ ic: 'i-send', c: '#a77bff', t: pend + ' draft' + (pend > 1 ? 's' : '') + ' waiting for approval', s: 'Review and send with one tap', b: 'Review', k: 'drafts' });
    if (stale) items.push({ ic: 'i-clock', c: '#27d9ff', t: 'Re-engage ' + stale + ' inactive lead' + (stale > 1 ? 's' : ''), s: 'No activity in the last 7+ days', b: 'View Leads', k: 'stale' });
    $('sugList').innerHTML = items.length ? items.map(function (i) {
      return '<div class="sug" style="--sc:' + i.c + '"><span class="sug-ic">' + icon(i.ic) + '</span><div class="sug-tx"><b>' + esc(i.t) + '</b><small>' + esc(i.s) + '</small></div><button class="btn" data-sug="' + i.k + '" type="button">' + esc(i.b) + '</button></div>';
    }).join('') : '<div class="empty">You\'re all caught up. New suggestions appear as leads change.</div>';
  }

  function renderAutomationWidget() {
    var days = S.range, from = Date.now() - days * 86400000;
    function rt(r) { return ts(r.sent_at) || ts(r.executed_at) || ts(r.updated_at) || ts(r.created_at); }
    var rows = CHANNELS.map(function (c) {
      var reqs = S.requests.filter(function (r) { return reqChannel(r) === c.id; });
      var sent = reqs.filter(function (r) { return SENT_STATES.indexOf(lc(r.status)) > -1 && rt(r) >= from; }).length;
      var drafts = reqs.filter(function (r) { return PENDING_STATES.indexOf(lc(r.status)) > -1; }).length;
      var leadsN = models().filter(function (m) { return m.channel === c.id; }).length;
      return { c: c, sent: sent, drafts: drafts, leads: leadsN };
    });
    $('autoList').innerHTML = rows.map(function (r) {
      return '<div class="aut" style="--ac:' + r.c.color + '"><span class="aut-ic">' + icon(r.c.icon) + '</span><div class="aut-tx"><b>' + esc(r.c.name) + ' Follow-up</b><small>' + r.leads + ' lead' + (r.leads === 1 ? '' : 's') + ' · ' + r.drafts + ' draft' + (r.drafts === 1 ? '' : 's') + ' pending</small></div><div class="aut-n"><b>' + r.sent + '</b><small>sent</small></div></div>';
    }).join('');
  }

  function renderPerformance() {
    var days = S.range, today = startOfDay(Date.now());
    function rt(r) { return ts(r.sent_at) || ts(r.executed_at) || ts(r.updated_at) || ts(r.created_at); }
    var sent = [], conv = [], labels = [];
    for (var i = days - 1; i >= 0; i--) {
      var d0 = today - i * 86400000, d1 = d0 + 86400000;
      sent.push(S.requests.filter(function (r) { return SENT_STATES.indexOf(lc(r.status)) > -1 && inRange(rt(r), d0, d1); }).length);
      conv.push(models().filter(function (m) { return m.stage === 'conv' && inRange(m.updated, d0, d1); }).length);
      labels.push(new Date(d0).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    }
    var max = Math.max(4, Math.max.apply(null, sent), Math.max.apply(null, conv));
    var top = Math.ceil(max / 4) * 4;
    var box = $('perfChart'), W = Math.max(280, (box && box.clientWidth) || 600), H = 200, L = 34, R = 8, T = 10, B = 28, cw = W - L - R, ch = H - T - B;
    var step = cw / days, bw = Math.max(4, Math.min(26, step * 0.55));
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Follow-ups sent and conversions per day">';
    for (var g = 0; g <= 4; g++) {
      var y = T + ch - (ch * g / 4);
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="rgba(255,255,255,.07)"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" fill="#6f7d8b" font-size="11" text-anchor="end">' + Math.round(top * g / 4) + '</text>';
    }
    var pts = [];
    sent.forEach(function (v, k) {
      var x = L + step * k + step / 2, h = ch * v / top;
      svg += '<rect x="' + (x - bw / 2) + '" y="' + (T + ch - h) + '" width="' + bw + '" height="' + h + '" rx="3" fill="url(#bg)"><title>' + labels[k] + ': ' + v + ' sent</title></rect>';
      pts.push([x, T + ch - ch * conv[k] / top]);
      var every = W < 420 ? (days > 7 ? 4 : 2) : (days > 14 ? 5 : (days > 7 ? 2 : 1));
      if (k % every === 0 || k === days - 1) svg += '<text x="' + x + '" y="' + (H - 8) + '" fill="#6f7d8b" font-size="11" text-anchor="middle">' + esc(labels[k]) + '</text>';
    });
    svg += '<polyline fill="none" stroke="#27d9ff" stroke-width="2" points="' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '"/>';
    pts.forEach(function (p, k) { svg += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.2" fill="#27d9ff"><title>' + labels[k] + ': ' + conv[k] + ' converted</title></circle>'; });
    svg = svg.replace('>', '><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#19e68c"/><stop offset="1" stop-color="#0a8f56"/></linearGradient></defs>');
    svg += '</svg>';
    $('perfChart').innerHTML = svg;

    var totSent = sent.reduce(function (a, b) { return a + b; }, 0), totConv = conv.reduce(function (a, b) { return a + b; }, 0);
    var rate = (totSent && totConv <= totSent) ? Math.round(totConv / totSent * 100) + '%' : '—';
    $('perfNums').innerHTML = '<div class="pn"><b>' + totSent + '</b><small>Follow-ups Sent</small></div><div class="pn"><b>' + totConv + '</b><small>Conversions</small></div><div class="pn"><b>' + rate + '</b><small>Conversion rate</small></div>';
  }

  /* ---------- lead panel ---------- */
  function renderLeadPanel() {
    var body = $('lpBody');
    var m = S.selected ? byId(S.selected) : null;
    if (!m) { body.innerHTML = '<div class="lp-empty">Select a lead from the pipeline to see the follow-up conversation, details and history.</div>'; return; }
    var chn = CHANNELS.filter(function (c) { return c.id === m.channel; })[0];
    var stageTitle = (STAGES.filter(function (s) { return s.id === m.stage; })[0] || {}).title || cap(m.status);
    var tags = '<span class="tag disc">' + esc(stageTitle) + '</span>' + (m.priority ? ' <span class="tag ' + (m.priority === 'high' ? 'overdue' : 'upcoming') + '">' + esc(cap(m.priority)) + '</span>' : '');
    var head = '<div class="lp-person"><span class="av" style="--avbg:' + avColor(m.name) + '">' + esc(initials(m.name)) + '</span><div><b>' + esc(m.name) + '</b><small>' + esc(chn ? chn.name : 'Lead') + (m.phone ? ' · ' + esc(m.phone) : '') + '</small><div style="margin-top:6px">' + tags + '</div></div></div>' +
      '<div class="lp-tabs" role="tablist">' + ['chat', 'details', 'history', 'notes'].map(function (t) {
        return '<button class="lp-tab' + (S.lpTab === t ? ' active' : '') + '" data-lptab="' + t + '" role="tab" aria-selected="' + (S.lpTab === t) + '" type="button">' + cap(t) + '</button>';
      }).join('') + '</div>';

    var view = '', foot = '';
    var reqs = S.requests.filter(function (r) { var l = reqLead(r); return l && String(l.id) === String(m.id); }).slice().reverse();
    if (S.lpTab === 'chat') {
      var mm = S.msgs[String(m.id)];
      var drafts = reqs.filter(function (r) { return PENDING_STATES.indexOf(lc(r.status)) > -1; });
      if (!mm || mm.loading) {
        view = '<div class="empty">Loading conversation…</div>';
      } else {
        if (mm.error) view += '<div class="empty">Could not load some messages: ' + esc(mm.error) + ' <button class="btn sm ghost" data-act="reload-msgs" data-id="' + esc(m.id) + '" type="button">Retry</button></div>';
        view += mm.items.map(function (it) {
          var cls = it.dir === 'inbound' ? 'in' : 'out';
          var meta = [cap(it.channel), it.dir !== 'inbound' && it.status ? cap(it.status) : '', ago(it.t)].filter(Boolean).join(' · ');
          return '<div class="bub ' + cls + '">' + esc(it.text || '[' + cap(it.type || 'message') + ']') + '<small>' + esc(meta) + '</small></div>';
        }).join('');
        view += drafts.map(function (r) {
          return '<div class="bub out">' + esc(reqMsg(r) || '—') + '<small>Draft · waiting for approval</small></div>';
        }).join('');
        if (!mm.items.length && !drafts.length && !mm.error) view = '<div class="empty">No stored messages for this lead yet.</div>';
        view += '<div class="lp-note">Latest ' + MSG_LIMIT + ' messages per channel. WhatsApp messages may be removed after your retention period.</div>';
      }
      foot = '<div class="lp-compose"><button class="btn primary ai-btn" data-act="draft" data-id="' + esc(m.id) + '" type="button">' + icon('i-ai') + ' Create AI follow-up draft</button></div>';
    } else if (S.lpTab === 'details') {
      function kv(l, v) { return '<div><small>' + l + '</small><b>' + esc(v || '—') + '</b></div>'; }
      view = '<div class="kv">' + kv('Status', cap(m.status)) + kv('Priority', cap(m.priority)) + kv('Source', m.source) + kv('Channel', chn ? chn.name : 'Other') +
        kv('Interest', m.interest) + kv('Budget', m.budget ? money(m.budget) : '') + kv('Next follow-up', m.nextAt ? fmtDate(m.nextAt) : '') + kv('Last activity', fmtDate(m.last)) + '</div>' +
        '<div class="tog-row" style="margin-top:14px"><div><b>Follow-up for this lead</b><small>Allow the AI engine to follow up</small></div><label class="switch"><input type="checkbox" data-toggle-lead="' + esc(m.id) + '"' + (fuEnabled(m.id) ? ' checked' : '') + ' aria-label="Follow-up for this lead"><span class="slider"></span></label></div>' +
        '<div class="row-acts" style="margin-top:14px"><a class="btn sm ghost" href="leads.html">Open in Leads</a></div>';
    } else if (S.lpTab === 'history') {
      var ev = [];
      if (m.created) ev.push([m.created, 'Lead created', cap(m.source)]);
      if (ts(m.raw.last_contacted_at)) ev.push([ts(m.raw.last_contacted_at), 'Last contacted', '']);
      if (m.nextAt) ev.push([m.nextAt, 'Follow-up scheduled', '']);
      reqs.forEach(function (r) { ev.push([ts(r.created_at), 'Follow-up ' + (r.status || 'proposed'), reqMsg(r).slice(0, 80)]); });
      S.conclusions.filter(function (c) { return String(c.lead_id) === String(m.id); }).forEach(function (c) { ev.push([ts(c.created_at), 'Conversation analysis', c.summary || '']); });
      ev.sort(function (a, b) { return b[0] - a[0]; });
      view = ev.length ? '<div class="timeline">' + ev.map(function (e) { return '<div class="tl"><b>' + esc(e[1]) + '</b><small>' + esc(fmtDate(e[0])) + (e[2] ? ' · ' + esc(e[2]) : '') + '</small></div>'; }).join('') + '</div>' : '<div class="empty">No history yet.</div>';
    } else {
      view = '<div class="notes-box">' + (m.raw.notes ? esc(m.raw.notes) : '<span style="color:var(--soft)">No notes on this lead.</span>') + '</div>';
    }
    body.innerHTML = head + '<div class="lp-view">' + view + '</div>' + foot;
  }

  async function loadMessages(id, force) {
    var key = String(id);
    if (S.msgs[key] && !S.msgs[key].loading && !force) return;
    var cv = S.convByLead[key];
    if (!cv) { S.msgs[key] = { items: [], error: '', loading: false }; renderLeadPanel(); return; }
    S.msgs[key] = { items: [], error: '', loading: true };
    renderLeadPanel();
    var cid = clientId(), items = [], err = '';
    for (var i = 0; i < cv.convs.length; i++) {
      var c = cv.convs[i];
      var table = c.channel === 'whatsapp' ? 'whatsapp_messages' : 'instagram_messages';
      var r = await db.from(table).select('id,direction,message_type,text_body,status,provider_timestamp,created_at')
        .eq('client_id', cid).eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(MSG_LIMIT);
      if (r.error) { console.warn('Messages load error:', r.error); err = r.error.message || 'load failed'; continue; }
      (r.data || []).forEach(function (x) {
        items.push({ t: ts(x.provider_timestamp) || ts(x.created_at), dir: x.direction, text: x.text_body, type: x.message_type, status: x.status, channel: c.channel });
      });
    }
    items.sort(function (a, b) { return a.t - b.t; });
    S.msgs[key] = { items: items, error: err, loading: false };
    if (String(S.selected) === key) renderLeadPanel();
  }

  function selectLead(id, open) {
    S.selected = id; S.lpTab = 'chat';
    renderBoard(); renderLeadPanel();
    if (open !== false) document.body.classList.add('lp-open');
    loadMessages(id).catch(function (e) { console.error(e); });
  }

  /* ---------- render all ---------- */
  function renderAll() {
    fillFilters();
    renderEngine(); renderKPIs(); renderBoard(); renderTasks(); renderAutomations();
    renderTemplates(); renderAnalytics(); renderSuggestions(); renderAutomationWidget(); renderPerformance(); renderLeadPanel();
  }

  /* ---------- API calls (existing edge functions) ---------- */
  async function token() {
    var s = await db.auth.getSession();
    if (!s.data || !s.data.session) throw new Error('Session expired. Please log in again.');
    return s.data.session.access_token;
  }
  async function callFn(url, payload, extra) {
    var t = await token();
    var headers = Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, extra || {});
    var res = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed.');
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  var callHandoff = function (p) { return callFn(HANDOFF_FN, p); };
  var callSpecialist = function (p) { return callFn(SPECIALIST_FN, p, { apikey: SUPABASE_ANON_KEY }); };

  function connectionFor(ch) { return S.connections.filter(function (c) { return lc(c.channel) === ch; })[0] || null; }
  function canSend(ch) { var c = connectionFor(ch); return !!(c && c.status === 'connected' && c.customer_reachable !== false && c.can_send === true); }
  function pickChannel(m) {
    if (m.channel !== 'other' && canSend(m.channel)) return m.channel;
    var any = CHANNELS.filter(function (c) { return canSend(c.id); })[0];
    return any ? any.id : null;
  }

  async function reload() {
    S.msgs = {};
    await loadAll(); renderAll(); showLoadWarnings();
    if (S.selected) loadMessages(S.selected).catch(function (e) { console.error(e); });
  }

  async function requestFollowUp(id) {
    if (!S.settings || !S.settings.enabled) throw new Error('Turn the AI Follow-up Engine on first.');
    if (!fuEnabled(id)) throw new Error('Follow-up is switched off for this lead.');
    var m = byId(id); if (!m) throw new Error('Lead not found.');
    var ch = pickChannel(m);
    if (!ch) throw new Error('No connected channel can send messages yet. Connect one from the Connectors page.');
    await callHandoff({ action: 'create_draft', lead_id: id, channel: ch });
    await reload();
    toast('Follow-up draft created.', 'success');
    setTab('tasks');
  }

  function openDraftEditor(id) {
    var r = S.requests.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r) return toast('Draft not found.', 'error');
    openModal('Edit follow-up draft',
      '<input type="hidden" id="draftId" value="' + esc(id) + '"><label class="fl" for="draftMsg">Message</label>' +
      '<textarea id="draftMsg" rows="7" maxlength="2000">' + esc(reqMsg(r)) + '</textarea>' +
      '<div class="modal-acts"><button class="btn ghost" data-act="close-modal" type="button">Cancel</button><button class="btn primary" data-act="save-draft" type="button">Save draft</button></div>');
  }
  async function saveDraft() {
    var id = $('draftId').value, msg = $('draftMsg').value.trim();
    if (!msg) throw new Error('Message cannot be empty.');
    await callHandoff({ action: 'save_draft', request_id: id, message: msg });
    closeModal(); await reload(); toast('Draft updated.', 'success');
  }
  async function approveSend(id) {
    if (!S.settings || !S.settings.enabled) throw new Error('The AI Follow-up Engine is off.');
    var r = S.requests.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!r) throw new Error('Request not found.');
    var ch = reqChannel(r);
    if (!canSend(ch)) throw new Error(cap(ch) + ' is not connected or cannot send right now. Check the Connectors page.');
    if (!window.confirm('Send this follow-up now?')) return;
    await callHandoff({ action: 'approve_and_send', request_id: id });
    await reload(); toast('Follow-up approved and sent.', 'success');
  }

  async function analyzeCase(id) {
    toast('Analyzing conversation…', 'info');
    var r = await callSpecialist({ action: 'analyze_case', case_id: id });
    await reload(); toast((r && r.message) || 'Conversation analysis completed.', 'success');
  }
  function openChangeEditor(id) {
    var c = S.changes.filter(function (x) { return String(x.id) === String(id); })[0]; if (!c) return;
    var val = c.proposed_value != null ? c.proposed_value : c.new_value;
    openModal('Edit proposed change',
      '<input type="hidden" id="chgId" value="' + esc(id) + '"><p class="muted">Field: <b>' + esc(c.field_name || c.field || '') + '</b></p>' +
      '<label class="fl" for="chgVal">Proposed value</label><textarea id="chgVal" rows="4">' + esc(fmtVal(val) === '—' ? '' : fmtVal(val)) + '</textarea>' +
      '<div class="modal-acts"><button class="btn ghost" data-act="close-modal" type="button">Cancel</button><button class="btn primary" data-act="save-change" type="button">Save</button></div>');
  }
  function parseVal(v, field) {
    v = String(v).trim();
    if (field === 'budget') { var n = Number(v.replace(/,/g, '')); return isFinite(n) ? n : v; }
    if (field === 'next_follow_up_at') { var d = new Date(v); return isNaN(d.getTime()) ? v : d.toISOString(); }
    return v;
  }
  async function saveChange() {
    var id = $('chgId').value, v = $('chgVal').value.trim();
    if (!v) throw new Error('Value cannot be empty.');
    var c = S.changes.filter(function (x) { return String(x.id) === String(id); })[0];
    await callSpecialist({ action: 'edit_change', change_id: id, proposed_value: parseVal(v, c && (c.field_name || c.field)) });
    closeModal(); await reload(); toast('Proposed change updated.', 'success');
  }
  async function approveChange(id) {
    if (!window.confirm('Approve this proposed lead change?')) return;
    await callSpecialist({ action: 'approve_change', change_id: id });
    await reload(); toast('Approved. Tap "Apply to Lead" to commit it.', 'success');
  }
  async function applyChange(id) {
    if (!window.confirm('Apply this approved change to the lead?')) return;
    await callSpecialist({ action: 'apply_change', change_id: id });
    await reload(); toast('Change applied to the lead.', 'success');
  }

  async function toggleLead(id, enabled) {
    var cid = clientId();
    var existing = S.fuLeads.filter(function (r) { return String(r.lead_id) === String(id); })[0];
    if (existing) {
      var u = await db.from('client_followup_leads').update({ enabled: enabled, updated_at: new Date().toISOString() }).eq('client_id', cid).eq('lead_id', id);
      if (u.error) throw u.error; existing.enabled = enabled;
    } else {
      var i = await db.from('client_followup_leads').insert({ client_id: cid, lead_id: id, enabled: enabled }).select().single();
      if (i.error) throw i.error; if (i.data) S.fuLeads.push(i.data);
    }
    toast(enabled ? 'Follow-up ON for this lead.' : 'Follow-up OFF for this lead.', 'success');
  }

  /* ---------- tabs / navigation ---------- */
  function setTab(t) {
    S.tab = t;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      var on = b.getAttribute('data-tab') === t; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
    });
    ['pipeline', 'tasks', 'automations', 'templates', 'analytics'].forEach(function (p) { $('pane-' + p).classList.toggle('hidden', p !== t); });
  }
  function resetFilters() {
    ['fSearch', 'fStatus', 'fSource', 'fChannel', 'fPriority', 'gSearch'].forEach(function (id) { $(id).value = ''; });
    S.quick = ''; S.expanded = {}; renderBoard();
  }
  function setMenu(open) { document.body.classList.toggle('menu-open', open); }

  /* ---------- events ---------- */
  function guard(fn) {
    return function () {
      var args = arguments;
      Promise.resolve().then(function () { return fn.apply(null, args); }).catch(function (e) {
        console.error(e); toast((e && e.message) || 'Something went wrong.', 'error');
      });
    };
  }

  function bind() {
    $('burger').addEventListener('click', function () { setMenu(true); });
    $('sbClose').addEventListener('click', function () { setMenu(false); });
    $('scrim').addEventListener('click', function () { setMenu(false); });
    $('lpClose').addEventListener('click', function () { document.body.classList.remove('lp-open'); });
    $('lpScrim').addEventListener('click', function () { document.body.classList.remove('lp-open'); });
    $('modalClose').addEventListener('click', closeModal);
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); setMenu(false); document.body.classList.remove('lp-open'); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('gSearch').focus(); }
    });
    $('logoutBtn').addEventListener('click', function () {
      var done = function () { try { localStorage.removeItem('glime_client_email'); } catch (e) { /* ignore */ } location.replace('login.html'); };
      Promise.resolve(db.auth.signOut({ scope: 'local' })).then(done, done);
    });
    $('meBtn').addEventListener('click', function () { location.href = 'settings.html'; });
    $('bellBtn').addEventListener('click', function () { setTab('tasks'); $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $('manageBtn').addEventListener('click', function () { setTab('automations'); $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); });

    $('tabs').addEventListener('click', function (e) { var b = e.target.closest('.tab'); if (b) setTab(b.getAttribute('data-tab')); });

    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (S.leads) renderPerformance(); }, 150); });
    $('rangeSel').addEventListener('change', function () { S.range = Number($('rangeSel').value) || 7; renderKPIs(); renderAutomationWidget(); renderPerformance(); });
    ['fStatus', 'fSource', 'fChannel', 'fPriority'].forEach(function (id) { $(id).addEventListener('change', function () { S.quick = ''; renderBoard(); }); });
    $('fSearch').addEventListener('input', function () { $('gSearch').value = $('fSearch').value; renderBoard(); });
    $('gSearch').addEventListener('input', function () { $('fSearch').value = $('gSearch').value; setTab('pipeline'); renderBoard(); });
    $('fReset').addEventListener('click', resetFilters);

    $('engToggle').addEventListener('change', guard(async function () {
      var want = $('engToggle').checked;
      try { await persistSettings({ enabled: want }); renderEngine(); toast(want ? 'AI Follow-up Engine is active.' : 'AI Follow-up Engine paused.', 'success'); }
      catch (e) { $('engToggle').checked = !want; throw e; }
    }));
    $('saveSettings').addEventListener('click', guard(async function () {
      var mode = (document.querySelector('input[name="sendingMode"]:checked') || {}).value || 'manual_approval';
      $('saveSettings').disabled = true;
      try { await persistSettings({ sending_mode: mode }); renderEngine(); toast('Settings saved.', 'success'); }
      finally { $('saveSettings').disabled = false; }
    }));

    document.addEventListener('change', guard(async function (e) {
      var cb = e.target.closest && e.target.closest('[data-toggle-lead]');
      if (!cb) return;
      try { await toggleLead(cb.getAttribute('data-toggle-lead'), cb.checked); }
      catch (err) { cb.checked = !cb.checked; throw err; }
    }));

    document.addEventListener('click', guard(async function (e) {
      var t = e.target;
      if (t.closest('#retryLoad')) { e.preventDefault(); await reload(); return; }
      var exp = t.closest('[data-expand]');
      if (exp) { var s = exp.getAttribute('data-expand'); S.expanded[s] = !S.expanded[s]; renderBoard(); return; }

      var lpt = t.closest('[data-lptab]');
      if (lpt) { S.lpTab = lpt.getAttribute('data-lptab'); renderLeadPanel(); return; }

      var cp = t.closest('[data-copy-tpl]');
      if (cp) {
        var txt = TEMPLATES[Number(cp.getAttribute('data-copy-tpl'))].body;
        try { await navigator.clipboard.writeText(txt); toast('Template copied.', 'success'); } catch (err) { toast('Copy is not available in this browser.', 'error'); }
        return;
      }

      var sg = t.closest('[data-sug]');
      if (sg) {
        var k = sg.getAttribute('data-sug');
        if (k === 'drafts') { setTab('tasks'); }
        else {
          resetFilters(); setTab('pipeline');
          if (k === 'high') $('fPriority').value = 'high';
          if (k === 'due') $('fStatus').value = 'due';
          if (k === 'stale') S.quick = 'inactive';
          renderBoard();
        }
        $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      var act = t.closest('[data-act]');
      if (act) {
        e.stopPropagation();
        var a = act.getAttribute('data-act'), id = act.getAttribute('data-id');
        switch (a) {
          case 'draft': await requestFollowUp(id); break;
          case 'open': selectLead(id); break;
          case 'edit-draft': openDraftEditor(id); break;
          case 'save-draft': await saveDraft(); break;
          case 'approve-send': await approveSend(id); break;
          case 'analyze': await analyzeCase(id); break;
          case 'edit-change': openChangeEditor(id); break;
          case 'save-change': await saveChange(); break;
          case 'approve-change': await approveChange(id); break;
          case 'apply-change': await applyChange(id); break;
          case 'reload-msgs': await loadMessages(id, true); break;
          case 'close-modal': closeModal(); break;
        }
        return;
      }

      if (t.closest('a')) return;
      var card = t.closest('.lcard');
      if (card) selectLead(card.getAttribute('data-lead'));
    }));

    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('lcard')) {
        e.preventDefault(); selectLead(e.target.getAttribute('data-lead'));
      }
    });
  }

  /* ---------- boot ---------- */
  function hideBoot() { var b = $('boot'); if (b) { b.style.opacity = '0'; b.style.transition = 'opacity .25s'; setTimeout(function () { b.remove(); }, 260); } }

  async function start() {
    bind();
    renderTemplates();
    renderLeadPanel();
    try {
      var ok = await initialize();
      if (ok) { renderAll(); showLoadWarnings(); }
    } catch (e) {
      console.error('Follow-up Specialist init error:', e);
      pageMsg('Could not load Follow-up Specialist: ' + esc(e && e.message || 'unknown error'), 'error');
    } finally { hideBoot(); }
  }

  window.loadFollowUpSpecialist = reload;
  window.showToast = toast;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
