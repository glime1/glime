/* GLIME Settings addon: "Broadcast"  (Omni plan only)
   Lets the client send one Meta-approved WhatsApp template (for example a Diwali offer) to the leads saved in GLIME,
   and see how it performed: sent, delivered, read, replies and the latest replies.
   - Omni plan only. Growth clients see a locked card with an upgrade button instead (same Omni rule as the Follow-up page:
     active "ai-connections" module in client_modules). The backend must enforce the same rule, see BROADCAST_BACKEND_SPEC.md.
   - Only approved templates can be used (WhatsApp rule for customers silent for more than 24 hours).
   - Client chooses who gets it (everyone, buyers, hot leads, by status, keyword), how many, and when.
   - If the template has an Image header, the client adds the photo (for example a Diwali poster) here.
   - Frontend only. Nothing is sent from this file: it calls the RPCs described in BROADCAST_BACKEND_SPEC.md
     (create_whatsapp_broadcast, get_whatsapp_broadcast_report, cancel_whatsapp_broadcast).
   Reads: modules, client_modules, client_followup_templates, leads, client_broadcasts (history and counts, optional). */
(function () {
  'use strict';
  var G = window.GLIME_SETTINGS;
  if (!G || typeof G.register !== 'function') return;
  var sb = G.api.supabase, esc = G.ui.escapeHtml, toast = G.ui.toast;

  var MAX_PER_BROADCAST = 1000;
  var COST = { utility: 0.8, marketing: 1.2 };
  var PHOTO_BUCKET = 'client-assets';
  var PHOTO_MAX = 5 * 1024 * 1024;
  var PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };
  var POLL_MS = 15000;
  var STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  var STATUS_LABEL = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Bought', lost: 'Lost' };
  var SEGS = [
    ['all', 'All leads'],
    ['buyers', 'Only customers who bought'],
    ['hot', 'Hot leads (high or urgent priority)'],
    ['notbought', 'Leads who have not bought yet'],
    ['status', 'Choose by lead status']
  ];
  var HIST = { queued: 'Queued', scheduled: 'Scheduled', sending: 'Sending', sent: 'Done', partial: 'Partly sent', failed: 'Failed', cancelled: 'Cancelled' };

  var pollT = null;

  var STYLE = '' +
    '.gbc-sum{border:1px solid var(--bd);background:var(--surf2);border-radius:14px;padding:14px;margin-top:12px}' +
    '.gbc-big{font-size:1.5rem;font-weight:800}' +
    '.gbc-sub{color:var(--mu);font-size:.72rem;margin-top:3px;line-height:1.5}' +
    '.gbc-warn{color:#ffd37a;font-size:.72rem;margin-top:8px}' +
    '.gbc-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}' +
    '.gbc-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--bd);border-radius:99px;padding:5px 11px;font-size:.72rem;cursor:pointer;background:var(--surf2)}' +
    '.gbc-chip input{margin:0}' +
    '.gbc-prev{margin-top:10px;font-size:.74rem;color:var(--mu);line-height:1.7}' +
    '.gbc-in{background:var(--surf2);color:var(--tx);border:1px solid var(--bd);border-radius:9px;padding:9px 10px;outline:none;max-width:100%}' +
    '.gbc-in.num{width:100px}.gbc-in.txt{width:230px}' +
    /* lock */
    '.gbc-lock{text-align:center;padding:26px 18px}' +
    '.gbc-lock h3{font-size:1.1rem;margin:10px 0 6px}' +
    '.gbc-lock p{color:var(--mu);font-size:.78rem;max-width:520px;margin:0 auto}' +
    '.gbc-lock ul{list-style:none;display:inline-block;text-align:left;margin:14px 0;color:var(--mu);font-size:.76rem;line-height:1.9}' +
    '.gbc-lock li:before{content:"\\2713";color:var(--gr);margin-right:8px;font-weight:800}' +
    '.gbc-lock .actions{justify-content:center}.gbc-lock .btn{display:inline-block}' +
    /* report */
    '.gbc-rhead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}' +
    '.gbc-rhead .select{min-width:0;max-width:100%;flex:1 1 180px}' +
    '.gbc-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}' +
    '.gbc-st{background:var(--surf2);border:1px solid var(--bd);border-radius:14px;padding:13px 13px 11px;position:relative;overflow:hidden}' +
    '.gbc-st:before{content:"";position:absolute;left:0;top:0;height:3px;width:46%;background:var(--c);border-radius:0 0 6px 0}' +
    '.gbc-st em{display:block;font-style:normal;font-size:.62rem;font-weight:800;letter-spacing:.1em;color:var(--mu);text-transform:uppercase}' +
    '.gbc-st strong{display:block;font-size:1.55rem;font-weight:800;line-height:1.2;margin-top:4px;color:var(--tx)}' +
    '.gbc-st small{display:block;color:var(--mu);font-size:.68rem;margin-top:2px}' +
    '.gbc-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;color:var(--mu);font-size:.72rem}' +
    '.gbc-bar{height:6px;background:#1b2a3a;border-radius:99px;overflow:hidden;margin-top:10px}' +
    '.gbc-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gr),var(--cy));width:0;transition:width .4s}' +
    '.gbc-rl{margin-top:14px;border:1px solid var(--bd);border-radius:14px;background:var(--surf2);padding:4px 14px}' +
    '.gbc-rlh{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 0 6px}' +
    '.gbc-rlh b{font-size:.66rem;letter-spacing:.1em;color:var(--mu);text-transform:uppercase}' +
    '.gbc-rep{display:flex;gap:11px;align-items:center;padding:11px 0;border-top:1px solid var(--bd)}' +
    '.gbc-av{width:34px;height:34px;border-radius:50%;background:rgba(80,245,168,.12);color:var(--gr);display:grid;place-items:center;font-weight:800;font-size:.8rem;flex:none}' +
    '.gbc-rt{min-width:0;flex:1}' +
    '.gbc-rt b{display:block;font-size:.8rem}' +
    '.gbc-rt span{display:block;color:var(--mu);font-size:.74rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.gbc-tm{color:var(--mu);font-size:.66rem;flex:none;text-align:right}' +
    '.gbc-tick{color:#53bdeb;font-size:.8rem;display:block}' +
    '.gbc-ract{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}' +
    '.gbc-hrow{cursor:pointer}.gbc-hrow.sel .row-info b{color:var(--cy)}' +
    '.gbc-mini{border:1px solid var(--bd);background:transparent;color:var(--tx);border-radius:8px;padding:6px 10px;font-size:.7rem;font-weight:800}' +
    '.gbc-mini.danger{color:var(--rd);border-color:rgba(255,130,145,.38)}' +
    /* preview + photo */
    '.gbc-wa{background:#0b141a;border-radius:14px;padding:12px;max-width:330px;margin-top:12px}' +
    '.gbc-bub{background:#202c33;border-radius:10px;padding:8px 10px;font-size:.78rem;line-height:1.5;white-space:pre-wrap;word-break:break-word}' +
    '.gbc-bub img,.gbc-ph{display:block;width:100%;border-radius:8px;margin-bottom:6px;aspect-ratio:16/9;object-fit:cover}' +
    '.gbc-ph{background:#2a3942;color:#8696a0;display:grid;place-items:center;font-size:.7rem}' +
    '.gbc-bub small{display:block;color:#8696a0;font-size:.68rem;margin-top:4px}' +
    '.gbc-bt{background:#202c33;color:#53bdeb;text-align:center;border-radius:10px;padding:8px;margin-top:4px;font-size:.76rem;font-weight:700}' +
    '.gbc-pc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}' +
    '.gbc-pc img{width:52px;height:52px;border-radius:9px;object-fit:cover;border:1px solid var(--bd)}' +
    '@media(max-width:760px){.gbc-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.gbc-pc{justify-content:flex-start}}';

  function injectStyle() {
    if (document.getElementById('gbcStyle')) return;
    var el = document.createElement('style');
    el.id = 'gbcStyle';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  /* Omni = active "ai-connections" module for this client (same rule as the Follow-up page). */
  async function checkOmni(cid) {
    try {
      var m = await sb.from('modules').select('id').eq('slug', 'ai-connections').maybeSingle();
      if (!m.data) return false;
      var q = await sb.from('client_modules').select('enabled,visible_to_client,status,expires_at').eq('module_id', m.data.id).eq('client_id', cid).maybeSingle();
      var a = q.data;
      return !!a && a.enabled === true && a.visible_to_client === true && (a.status === 'active' || a.status === 'trial') && (!a.expires_at || new Date(a.expires_at).getTime() > Date.now());
    } catch (e) { return false; }
  }

  function lockHtml() {
    return '<div class="section-head"><h2>Broadcast</h2><p>Send an offer to your saved leads on WhatsApp.</p></div>' +
      '<section class="channel-card gbc-lock"><span class="badge on">Omni</span><h3>Broadcast is part of the Omni plan</h3>' +
      '<p>Send one Meta-approved WhatsApp message, such as a Diwali offer with a photo, to thousands of saved leads at once, and see how many received it, read it and replied.</p>' +
      '<ul><li>Pick who gets it: all leads, buyers, hot leads, or by status</li><li>Add a photo to your offer</li><li>Live report: sent, delivered, read and replies</li><li>Schedule it for the best time</li></ul>' +
      '<div class="actions"><a class="btn primary" href="billing.html?plan=omni">Upgrade to Omni</a></div>' +
      '<p class="note">Everything else in your current plan keeps working.</p></section>';
  }

  function phoneOf(l) {
    var d = String(l.whatsapp || l.mobile || '').replace(/\D/g, '');
    if (d.length === 10) d = '91' + d;
    else if (d.length === 11 && d.charAt(0) === '0') d = '91' + d.slice(1);
    return d.length >= 11 && d.length <= 15 ? d : '';
  }

  function maskName(l) {
    var n = String(l.name || 'Customer').trim() || 'Customer';
    var p = phoneOf(l);
    return n + (p ? ' (…' + p.slice(-4) + ')' : '');
  }

  function fmt(v) {
    try { return new Date(v).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function money(n) { return '₹' + n.toFixed(2).replace(/\.00$/, ''); }

  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }

  function pct(a, b) { return b > 0 ? Math.min(100, Math.round(a / b * 100)) + '%' : '—'; }

  function wa(s) {
    return esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>');
  }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  }

  function isImageHeader(t) {
    return !!(t && t.header && String(t.header.type || '').toLowerCase() === 'image');
  }

  function isLive(status) { return status === 'queued' || status === 'sending'; }

  async function render(ctx) {
    injectStyle();
    clearTimeout(pollT);
    var container = ctx.container;
    var cid = ctx.state.client && ctx.state.client.client_id;
    container.innerHTML = '<div class="section-head"><h2>Broadcast</h2><p>Send an offer to your saved leads on WhatsApp.</p></div><div class="loading">Loading…</div>';
    if (!sb || !cid) { container.innerHTML += '<div class="error">Your account could not be identified. Please refresh the page.</div>'; return; }

    if (!(await checkOmni(cid))) { container.innerHTML = lockHtml(); return; }

    var HIST_FULL = 'id,name,status,total_count,sent_count,delivered_count,read_count,reply_count,failed_count,scheduled_at,created_at';
    var HIST_BASIC = 'id,name,status,total_count,sent_count,failed_count,scheduled_at,created_at';

    async function loadHistory() {
      var q = await sb.from('client_broadcasts').select(HIST_FULL).eq('client_id', cid).order('created_at', { ascending: false }).limit(15);
      if (q.error) q = await sb.from('client_broadcasts').select(HIST_BASIC).eq('client_id', cid).order('created_at', { ascending: false }).limit(15);
      return q.error ? null : (q.data || []);
    }

    var res = await Promise.all([
      sb.from('client_followup_templates').select('id,name,category,language,status,header,body,footer,buttons,samples,var_map').eq('client_id', cid).eq('status', 'approved').order('updated_at', { ascending: false }),
      sb.from('leads').select('id,name,mobile,whatsapp,city_area,interest,product_service,status,priority,last_contacted_at,created_at').eq('client_id', cid).order('created_at', { ascending: false }).limit(5000),
      loadHistory()
    ]);
    if (res[0].error) throw res[0].error;
    if (res[1].error) throw res[1].error;
    var templates = res[0].data || [];
    var leads = res[1].data || [];
    var history = res[2];

    var conn = (ctx.state.connections || []).filter(function (x) { return x.channel === 'whatsapp'; })[0];
    var connected = !!(conn && conn.status === 'connected');

    var f = {
      name: '', tpl: templates.length ? templates[0].id : '',
      seg: 'all', statuses: {}, key: '', skipDays: 0, skipLost: true,
      mode: 'all', n: 50, order: 'new', when: 'now', at: '',
      photo: null, photoUrl: ''
    };
    var selected = history && history.length ? history[0].id : null;
    var rep = null;

    function audience() {
      var kw = f.key.trim().toLowerCase();
      var now = Date.now();
      var rows = leads.filter(function (l) {
        var st = l.status || 'new', pr = l.priority;
        if (f.seg === 'buyers' && st !== 'won') return false;
        if (f.seg === 'hot' && !((pr === 'high' || pr === 'urgent') && st !== 'won' && st !== 'lost')) return false;
        if (f.seg === 'notbought' && (st === 'won' || st === 'lost')) return false;
        if (f.seg === 'status' && !f.statuses[st]) return false;
        if (f.seg === 'all' && f.skipLost && st === 'lost') return false;
        if (kw) {
          var hay = [l.city_area, l.interest, l.product_service, l.name].join(' ').toLowerCase();
          if (hay.indexOf(kw) === -1) return false;
        }
        if (f.skipDays > 0 && l.last_contacted_at && (now - new Date(l.last_contacted_at).getTime()) < f.skipDays * 86400000) return false;
        return true;
      });
      var matched = rows.length;
      rows = rows.slice().sort(function (a, b) {
        var ta = new Date(f.order === 'recent' ? (a.last_contacted_at || 0) : a.created_at).getTime();
        var tb = new Date(f.order === 'recent' ? (b.last_contacted_at || 0) : b.created_at).getTime();
        return f.order === 'old' ? ta - tb : tb - ta;
      });
      var seen = {}, list = [], noPhone = 0, dupes = 0;
      rows.forEach(function (l) {
        var p = phoneOf(l);
        if (!p) { noPhone++; return; }
        if (seen[p]) { dupes++; return; }
        seen[p] = 1;
        list.push(l);
      });
      var eligible = list.length;
      var want = f.mode === 'limit' ? Math.max(0, Math.floor(Number(f.n) || 0)) : eligible;
      var cap = Math.min(want, MAX_PER_BROADCAST, eligible);
      return { matched: matched, noPhone: noPhone, dupes: dupes, eligible: eligible, final: list.slice(0, cap), capped: want > MAX_PER_BROADCAST && eligible > MAX_PER_BROADCAST };
    }

    function selTpl() { return templates.filter(function (t) { return t.id === f.tpl; })[0]; }
    function selHist() { return (history || []).filter(function (h) { return h.id === selected; })[0]; }

    function tplOptions() {
      return templates.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === f.tpl ? ' selected' : '') + '>' + esc(t.name) + ' (' + esc(t.language) + ', ' + esc(t.category) + ')</option>';
      }).join('');
    }

    var warn = [];
    if (!connected) warn.push('WhatsApp is not connected. Connect it in Channels before sending.');
    if (!templates.length) warn.push('You have no template that Meta has approved yet. Create one on the Follow-up page, get it approved in Meta Business Manager, then press "Refresh status from Meta" in Template follow-ups.');

    container.innerHTML =
      '<div class="section-head"><h2>Broadcast</h2><p>Send one Meta-approved template, such as a Diwali offer, to the leads saved in GLIME. Choose who gets it and how many, then watch how many saw it and replied.</p></div>' +
      (warn.length ? '<div class="empty" style="margin-bottom:14px;color:#ffd58a">' + warn.map(function (w) { return '• ' + esc(w); }).join('<br>') + '</div>' : '') +

      '<section class="channel-card" id="bcRep"></section>' +

      '<section class="channel-card">' +
      '<div class="row" style="border-top:0"><div class="row-info"><b>Campaign name</b><small>Only for you, for example "Diwali offer 2026".</small></div>' +
      '<input class="gbc-in txt" id="bcName" type="text" maxlength="80" placeholder="Diwali offer"></div>' +
      '<div class="row"><div class="row-info"><b>Template to send</b><small>Only templates approved by Meta are listed.</small></div>' +
      '<select class="select" id="bcTpl">' + (templates.length ? tplOptions() : '<option value="">— none approved —</option>') + '</select></div>' +
      '<div class="row" id="bcPhotoRow"><div class="row-info"><b>Photo</b><small id="bcPhotoHelp"></small></div><div class="gbc-pc" id="bcPhotoCtl"></div></div>' +
      '<input type="file" id="bcFile" accept="image/jpeg,image/png" hidden>' +
      '<div id="bcPv"></div>' +
      '</section>' +

      '<section class="channel-card" style="margin-top:14px">' +
      '<div class="row" style="border-top:0"><div class="row-info"><b>Who should get it</b><small>Pick a group of your leads.</small></div>' +
      '<select class="select" id="bcSeg">' + SEGS.map(function (s) { return '<option value="' + s[0] + '">' + esc(s[1]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="gbc-chips" id="bcStatusRow" style="display:none">' +
      STATUSES.map(function (s) { return '<label class="gbc-chip"><input type="checkbox" data-st="' + s + '">' + esc(STATUS_LABEL[s]) + '</label>'; }).join('') + '</div>' +
      '<div class="row"><div class="row-info"><b>Keyword (optional)</b><small>Only leads whose city, interest or product contains this word.</small></div>' +
      '<input class="gbc-in txt" id="bcKey" type="text" maxlength="60" placeholder="e.g. Jaipur or sofa"></div>' +
      '<div class="row"><div class="row-info"><b>Skip leads contacted recently</b><small>Do not message leads you contacted in the last few days. 0 means do not skip.</small></div>' +
      '<div style="display:flex;align-items:center;gap:7px"><input class="gbc-in num" id="bcSkip" type="number" inputmode="numeric" min="0" max="90" value="0"><span style="color:var(--mu);font-size:.7rem">days</span></div></div>' +
      '<div class="row" id="bcLostRow"><div class="row-info"><b>Skip lost leads</b><small>Leads you marked as lost are not messaged.</small></div>' +
      '<label class="sw"><input type="checkbox" id="bcLost" checked><span></span></label></div>' +
      '<div class="row"><div class="row-info"><b>How many</b><small>Send to everyone who matches, or only a set number.</small></div>' +
      '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end">' +
      '<select class="select" id="bcMode"><option value="all">Everyone who matches</option><option value="limit">Only a number</option></select>' +
      '<input class="gbc-in num" id="bcN" type="number" inputmode="numeric" min="1" max="' + MAX_PER_BROADCAST + '" value="50" style="display:none"></div></div>' +
      '<div class="row"><div class="row-info"><b>Pick leads by</b><small>Matters when you send to a limited number.</small></div>' +
      '<select class="select" id="bcOrder"><option value="new">Newest leads first</option><option value="old">Oldest leads first</option><option value="recent">Most recently contacted first</option></select></div>' +
      '<div class="gbc-sum"><div class="gbc-big" id="bcCount">0</div><div class="gbc-sub" id="bcSub"></div><div class="gbc-warn" id="bcWarn" style="display:none"></div><div class="gbc-prev" id="bcPrev"></div></div>' +
      '</section>' +

      '<section class="channel-card" style="margin-top:14px">' +
      '<div class="row" style="border-top:0"><div class="row-info"><b>When to send</b><small>Now, or at a time you choose (within 30 days).</small></div>' +
      '<select class="select" id="bcWhen"><option value="now">Send now</option><option value="later">Schedule for later</option></select></div>' +
      '<div class="row" id="bcAtRow" style="display:none"><div class="row-info"><b>Date and time</b><small>Your local time.</small></div><input class="gbc-in" id="bcAt" type="datetime-local"></div>' +
      '<div class="actions"><button class="btn primary" id="bcSend"' + (!connected || !templates.length ? ' disabled' : '') + '>Send broadcast</button></div>' +
      '<p class="note">Each message uses your WhatsApp wallet: utility templates cost ' + money(COST.utility) + ' and marketing templates ' + money(COST.marketing) + ' per message. Customers who replied STOP are skipped automatically. Up to ' + MAX_PER_BROADCAST + ' leads per broadcast.</p>' +
      '</section>' +

      '<div class="section-head" style="margin-top:20px"><h2>Recent broadcasts</h2><p>Tap a broadcast to see its report.</p></div><div id="bcHist"></div>';

    var $ = function (id) { return document.getElementById(id); };

    /* ---------- report ---------- */

    function baseReport(h) {
      return {
        status: h.status, total: num(h.total_count), sent: num(h.sent_count), delivered: num(h.delivered_count),
        read: num(h.read_count), replied: num(h.reply_count), failed: num(h.failed_count),
        replies: [], repliesKnown: false, at: h.scheduled_at || h.created_at
      };
    }

    async function loadReport() {
      var h = selHist();
      if (!h) { rep = null; renderReport(); return; }
      var r = baseReport(h);
      var q = await sb.rpc('get_whatsapp_broadcast_report', { p_broadcast_id: h.id });
      if (!q.error && q.data) {
        var d = Array.isArray(q.data) ? q.data[0] : q.data;
        if (d && typeof d === 'object') {
          r.total = num(d.total) || r.total; r.sent = num(d.sent); r.delivered = num(d.delivered);
          r.read = num(d.read); r.replied = num(d.replied); r.failed = num(d.failed);
          r.status = d.status || r.status;
          r.replies = Array.isArray(d.replies) ? d.replies : [];
          r.repliesKnown = true;
        }
      }
      if (h.id === selected) { rep = r; renderReport(); }
    }

    function renderReport() {
      var el = $('bcRep');
      if (!el) return;
      var head = '<div class="gbc-rhead"><div class="channel-name">Campaign report</div>' +
        (history && history.length ? '<select class="select" id="bcPick">' + history.map(function (h) {
          return '<option value="' + esc(h.id) + '"' + (h.id === selected ? ' selected' : '') + '>' + esc((h.name || 'Broadcast') + ' · ' + fmt(h.scheduled_at || h.created_at)) + '</option>';
        }).join('') + '</select>' : '') + '</div>';

      if (history === null) { el.innerHTML = head + '<div class="empty">Reports will appear here once broadcasting is switched on for your account.</div>'; return; }
      if (!history.length) { el.innerHTML = head + '<div class="empty">No broadcasts yet. Send your first broadcast below and its report will appear here: how many were sent, delivered, read and replied.</div>'; return; }
      if (!rep) { el.innerHTML = head + '<div class="loading">Loading report…</div>'; bindPick(); return; }

      var st = [
        ['Sent', rep.sent, '#8b7bff', 'of ' + rep.total + ' leads'],
        ['Delivered', rep.delivered, 'var(--gr)', pct(rep.delivered, rep.sent) + ' of sent'],
        ['Read', rep.read, '#4aa3ff', pct(rep.read, rep.delivered) + ' of delivered'],
        ['Replies', rep.replied, '#ffb04a', pct(rep.replied, rep.delivered) + ' of delivered']
      ];
      var live = isLive(rep.status);
      var h = selHist() || {};
      var meta = '<span class="badge ' + (rep.status === 'sent' ? 'on' : (rep.status === 'failed' ? 'off' : '')) + '">' + esc(HIST[rep.status] || rep.status || '') + '</span>' +
        '<span>' + esc(fmt(rep.at)) + '</span>' +
        (rep.failed ? '<span class="badge off">' + rep.failed + ' failed</span>' : '') +
        (live ? '<span>Updating live…</span>' : '');

      var replies = (rep.replies || []).slice(0, 20);
      var list;
      if (!rep.repliesKnown) list = '<div class="gbc-sub" style="padding:6px 0 12px">The latest replies will show here once reply tracking is switched on for your account.</div>';
      else if (!replies.length) list = '<div class="gbc-sub" style="padding:6px 0 12px">No replies yet. They appear here as customers answer.</div>';
      else list = replies.map(function (r) {
        var nm = String(r.name || '').trim() || (r.phone ? '…' + String(r.phone).replace(/\D/g, '').slice(-4) : 'Customer');
        return '<div class="gbc-rep"><div class="gbc-av">' + esc(nm.charAt(0).toUpperCase()) + '</div>' +
          '<div class="gbc-rt"><b>' + esc(nm) + '</b><span>' + esc(r.text || '') + '</span></div>' +
          '<div class="gbc-tm"><i class="gbc-tick">✓✓</i>' + esc(r.at ? fmt(r.at) : '') + '</div></div>';
      }).join('');

      el.innerHTML = head +
        '<div class="gbc-stats">' + st.map(function (s) {
          return '<div class="gbc-st" style="--c:' + s[2] + '"><em>' + esc(s[0]) + '</em><strong>' + s[1].toLocaleString() + '</strong><small>' + esc(s[3]) + '</small></div>';
        }).join('') + '</div>' +
        (live ? '<div class="gbc-bar"><i style="width:' + (rep.total ? Math.min(100, Math.round(rep.sent / rep.total * 100)) : 0) + '%"></i></div>' : '') +
        '<div class="gbc-meta">' + meta + '</div>' +
        '<div class="gbc-rl"><div class="gbc-rlh"><b>Latest replies</b></div>' + list + '</div>' +
        '<div class="gbc-ract"><button class="gbc-mini" id="bcReuse">Use this campaign again</button>' +
        (replies.length ? '<button class="gbc-mini" id="bcCsv">Download replies (CSV)</button>' : '') + '</div>';

      bindPick();
      var ru = $('bcReuse');
      if (ru) ru.onclick = function () {
        f.name = h.name || '';
        $('bcName').value = f.name;
        $('bcName').scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Name filled in. Choose the template and who gets it, then send.');
      };
      var cv = $('bcCsv');
      if (cv) cv.onclick = function () {
        var lines = [['Name', 'Phone', 'Reply', 'Time'].map(csvCell).join(',')];
        (rep.replies || []).forEach(function (r) {
          lines.push([r.name || '', r.phone || '', r.text || '', r.at || ''].map(csvCell).join(','));
        });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        a.download = 'broadcast-replies.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      };
      schedulePoll();
    }

    function bindPick() {
      var p = $('bcPick');
      if (p) p.onchange = function (e) { selectBroadcast(e.target.value, false); };
    }

    function selectBroadcast(id, scroll) {
      selected = id;
      rep = null;
      renderReport();
      renderHistory();
      loadReport();
      if (scroll) $('bcRep').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function schedulePoll() {
      clearTimeout(pollT);
      if (!rep || !isLive(rep.status)) return;
      pollT = setTimeout(async function () {
        if (!document.body.contains($('bcRep'))) return;
        var fresh = await loadHistory();
        if (fresh) { history = fresh; renderHistory(); }
        await loadReport();
      }, POLL_MS);
    }

    /* ---------- history ---------- */

    function renderHistory() {
      var el = $('bcHist');
      if (history === null) { el.innerHTML = '<div class="empty">Broadcast history will appear here once broadcasting is switched on for your account.</div>'; return; }
      if (!history.length) { el.innerHTML = '<div class="empty">No broadcasts yet.</div>'; return; }
      el.innerHTML = history.map(function (h) {
        var det = (h.sent_count || 0) + ' of ' + (h.total_count || 0) + ' sent' + (h.failed_count ? ', ' + h.failed_count + ' failed' : '') + ' · ' + fmt(h.scheduled_at || h.created_at);
        var cancel = (h.status === 'scheduled' || h.status === 'queued') ? '<button class="gbc-mini danger" data-cancel="' + esc(h.id) + '">Cancel</button>' : '';
        return '<div class="row gbc-hrow' + (h.id === selected ? ' sel' : '') + '" data-bid="' + esc(h.id) + '"><div class="row-info"><b>' + esc(h.name || 'Broadcast') + '</b><small>' + esc(det) + '</small></div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex:none"><span class="badge ' + (h.status === 'sent' ? 'on' : (h.status === 'failed' ? 'off' : '')) + '">' + esc(HIST[h.status] || h.status) + '</span>' + cancel + '</div></div>';
      }).join('');
      el.querySelectorAll('[data-bid]').forEach(function (row) {
        row.onclick = function () { selectBroadcast(row.getAttribute('data-bid'), true); };
      });
      el.querySelectorAll('[data-cancel]').forEach(function (b) {
        b.onclick = async function (e) {
          e.stopPropagation();
          var id = b.getAttribute('data-cancel');
          var ok = await G.ui.confirm('Cancel this broadcast? Messages that have not gone out yet will not be sent.', { title: 'Cancel broadcast', confirmText: 'Cancel broadcast', danger: true });
          if (!ok) return;
          b.disabled = true;
          var r = await sb.rpc('cancel_whatsapp_broadcast', { p_broadcast_id: id });
          if (r.error) {
            b.disabled = false;
            var m = String(r.error.message || '');
            toast(r.error.code === 'PGRST202' || /could not find the function|does not exist/i.test(m) ? 'Cancelling is not switched on yet.' : (m || 'Could not cancel the broadcast.'), true);
            return;
          }
          toast('Broadcast cancelled');
          var fresh = await loadHistory();
          if (fresh) history = fresh;
          renderHistory();
          loadReport();
        };
      });
    }

    /* ---------- preview and photo ---------- */

    function renderPhoto() {
      var t = selTpl();
      var help = $('bcPhotoHelp'), ctl = $('bcPhotoCtl');
      if (!t) { help.textContent = 'Choose a template first.'; ctl.innerHTML = ''; return; }
      if (!isImageHeader(t)) {
        help.textContent = 'This template has no photo slot, so it is sent as text. To send a photo, create a template with a Photo header on the Follow-up page (Templates > WhatsApp templates).';
        ctl.innerHTML = '';
        return;
      }
      help.textContent = 'This template shows a photo at the top, for example your Diwali poster. JPG or PNG, up to 5 MB.';
      ctl.innerHTML = (f.photoUrl ? '<img alt="Selected photo" src="' + esc(f.photoUrl) + '">' : '') +
        '<button class="gbc-mini" type="button" id="bcPick1">' + (f.photo ? 'Change photo' : 'Choose photo') + '</button>' +
        (f.photo ? '<button class="gbc-mini danger" type="button" id="bcPhotoRm">Remove</button>' : '');
      $('bcPick1').onclick = function () { $('bcFile').click(); };
      var rm = $('bcPhotoRm');
      if (rm) rm.onclick = function () { clearPhoto(); renderPhoto(); renderPreview(); };
    }

    function clearPhoto() {
      if (f.photoUrl) { try { URL.revokeObjectURL(f.photoUrl); } catch (e) { /* ignore */ } }
      f.photo = null; f.photoUrl = '';
      $('bcFile').value = '';
    }

    function renderPreview() {
      var t = selTpl(), el = $('bcPv');
      if (!t) { el.innerHTML = ''; return; }
      var lead = audience().final[0] || null;
      var fill = function (s) {
        return String(s || '').replace(/\{\{(\d+)\}\}/g, function (m, n) {
          var key = (t.var_map || [])[n - 1];
          var v = lead && key ? lead[key] : '';
          if (!v) v = (t.samples || [])[n - 1];
          return v ? String(v) : '[' + (key || n) + ']';
        });
      };
      var hd = t.header || {}, top = '';
      if (isImageHeader(t)) top = f.photoUrl ? '<img alt="" src="' + esc(f.photoUrl) + '">' : '<div class="gbc-ph">Your photo appears here</div>';
      else if (String(hd.type || '').toLowerCase() === 'text' && hd.text) top = '<b>' + wa(fill(hd.text)) + '</b><br>';
      el.innerHTML = '<div class="gbc-wa"><div class="gbc-bub">' + top + wa(fill(t.body)) + (t.footer ? '<small>' + esc(t.footer) + '</small>' : '') + '</div>' +
        (t.buttons || []).slice(0, 3).map(function (b) { return '<div class="gbc-bt">' + esc(b.text) + '</div>'; }).join('') + '</div>' +
        '<p class="note">Preview for the first lead on the list. Each customer gets their own details.</p>';
    }

    function refresh() {
      var a = audience();
      var t = selTpl();
      var rate = t ? (COST[t.category] || COST.marketing) : COST.marketing;
      $('bcCount').textContent = a.final.length + (a.final.length === 1 ? ' lead will get this' : ' leads will get this');
      var bits = [a.matched + ' leads match'];
      if (a.noPhone) bits.push(a.noPhone + ' skipped: no valid WhatsApp number');
      if (a.dupes) bits.push(a.dupes + ' skipped: same number twice');
      $('bcSub').textContent = bits.join(' · ') + '. Estimated cost ' + money(a.final.length * rate) + '.';
      var w = $('bcWarn');
      if (a.capped) { w.style.display = ''; w.textContent = 'Only the first ' + MAX_PER_BROADCAST + ' leads can go in one broadcast. Send another broadcast for the rest.'; }
      else if (f.seg === 'status' && !Object.keys(f.statuses).some(function (k) { return f.statuses[k]; })) { w.style.display = ''; w.textContent = 'Tick at least one lead status above.'; }
      else w.style.display = 'none';
      $('bcPrev').innerHTML = a.final.length
        ? 'First leads: ' + a.final.slice(0, 5).map(function (l) { return esc(maskName(l)); }).join(', ') + (a.final.length > 5 ? ' and ' + (a.final.length - 5) + ' more' : '')
        : '';
      $('bcStatusRow').style.display = f.seg === 'status' ? '' : 'none';
      $('bcLostRow').style.display = f.seg === 'all' ? '' : 'none';
      $('bcN').style.display = f.mode === 'limit' ? '' : 'none';
      $('bcAtRow').style.display = f.when === 'later' ? '' : 'none';
      renderPreview();
      return a;
    }

    /* ---------- events ---------- */

    $('bcName').oninput = function (e) { f.name = e.target.value; };
    $('bcTpl').onchange = function (e) { f.tpl = e.target.value; if (!isImageHeader(selTpl())) clearPhoto(); renderPhoto(); refresh(); };
    $('bcSeg').onchange = function (e) { f.seg = e.target.value; refresh(); };
    $('bcKey').oninput = function (e) { f.key = e.target.value; refresh(); };
    $('bcSkip').oninput = function (e) { var v = parseInt(e.target.value, 10); f.skipDays = isFinite(v) && v > 0 ? Math.min(v, 90) : 0; refresh(); };
    $('bcLost').onchange = function (e) { f.skipLost = e.target.checked; refresh(); };
    $('bcMode').onchange = function (e) { f.mode = e.target.value; refresh(); };
    $('bcN').oninput = function (e) { f.n = e.target.value; refresh(); };
    $('bcOrder').onchange = function (e) { f.order = e.target.value; refresh(); };
    $('bcWhen').onchange = function (e) { f.when = e.target.value; refresh(); };
    $('bcAt').onchange = function (e) { f.at = e.target.value; };
    container.querySelectorAll('[data-st]').forEach(function (cb) {
      cb.onchange = function () { f.statuses[cb.getAttribute('data-st')] = cb.checked; refresh(); };
    });

    $('bcFile').onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!PHOTO_TYPES[file.type]) { toast('Choose a JPG or PNG photo.', true); e.target.value = ''; return; }
      if (file.size > PHOTO_MAX) { toast('The photo is over 5 MB. Choose a smaller one.', true); e.target.value = ''; return; }
      if (f.photoUrl) { try { URL.revokeObjectURL(f.photoUrl); } catch (x) { /* ignore */ } }
      f.photo = file;
      f.photoUrl = URL.createObjectURL(file);
      renderPhoto();
      renderPreview();
    };

    $('bcSend').onclick = async function (e) {
      var btn = e.currentTarget;
      var t = selTpl();
      if (!connected) { toast('Connect WhatsApp first.', true); return; }
      if (!t) { toast('Choose an approved template.', true); return; }
      if (isImageHeader(t) && !f.photo) { toast('This template needs a photo. Choose one above.', true); return; }
      var a = audience();
      if (f.seg === 'status' && !Object.keys(f.statuses).some(function (k) { return f.statuses[k]; })) { toast('Tick at least one lead status.', true); return; }
      if (f.mode === 'limit' && !(Number(f.n) >= 1)) { toast('Enter how many leads to send to.', true); return; }
      if (!a.final.length) { toast('No leads match. Change the options above.', true); return; }
      var at = null;
      if (f.when === 'later') {
        var d = f.at ? new Date(f.at) : null;
        if (!d || isNaN(d.getTime())) { toast('Choose the date and time to send.', true); return; }
        if (d.getTime() < Date.now() + 5 * 60000) { toast('Pick a time at least 5 minutes from now.', true); return; }
        if (d.getTime() > Date.now() + 30 * 86400000) { toast('You can schedule up to 30 days ahead.', true); return; }
        at = d.toISOString();
      }
      var rate = COST[t.category] || COST.marketing;
      var name = f.name.trim() || ('Broadcast ' + new Date().toLocaleDateString());
      var ok = await G.ui.confirm(
        'Send "' + t.name + '" to ' + a.final.length + ' lead' + (a.final.length === 1 ? '' : 's') + (at ? ' on ' + fmt(at) : ' now') + '? Estimated cost ' + money(a.final.length * rate) + '. This cannot be undone once messages start going out.',
        { title: 'Send broadcast', confirmText: at ? 'Schedule' : 'Send' }
      );
      if (!ok) return;

      btn.disabled = true;
      var mediaPath = null;
      if (isImageHeader(t) && f.photo) {
        mediaPath = cid + '/broadcasts/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + PHOTO_TYPES[f.photo.type];
        var up = await sb.storage.from(PHOTO_BUCKET).upload(mediaPath, f.photo, { contentType: f.photo.type, upsert: false, cacheControl: '3600' });
        if (up.error) {
          btn.disabled = false;
          toast(up.error.message || 'Could not upload the photo. Nothing was sent.', true);
          return;
        }
      }
      var args = {
        p_name: name,
        p_template_id: t.id,
        p_lead_ids: a.final.map(function (l) { return l.id; }),
        p_filters: { segment: f.seg, statuses: Object.keys(f.statuses).filter(function (k) { return f.statuses[k]; }), keyword: f.key.trim(), skip_contacted_days: f.skipDays, mode: f.mode, limit: f.mode === 'limit' ? Number(f.n) : null, order: f.order },
        p_schedule_at: at
      };
      if (mediaPath) args.p_media_path = mediaPath;
      var r = await sb.rpc('create_whatsapp_broadcast', args);
      btn.disabled = false;
      if (r.error) {
        if (mediaPath) { try { await sb.storage.from(PHOTO_BUCKET).remove([mediaPath]); } catch (x) { /* ignore */ } }
        var m = String(r.error.message || '');
        if (r.error.code === 'PGRST202' || /could not find the function|does not exist/i.test(m)) toast('Broadcast sending is not switched on yet. Nothing was sent.', true);
        else toast(m || 'Could not start the broadcast. Nothing was sent.', true);
        return;
      }
      toast(at ? 'Broadcast scheduled' : 'Broadcast started');
      render(ctx);
    };

    renderPhoto();
    renderHistory();
    renderReport();
    refresh();
    if (selected) loadReport();
  }

  G.register({ id: 'broadcast', label: 'Broadcast', order: 46, render: render });
})();
