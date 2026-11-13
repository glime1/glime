/* GLIME Settings addon: "Broadcast"
   Lets the client send one Meta-approved WhatsApp template (for example a Diwali offer) to the leads saved in GLIME.
   - Only approved templates can be used (WhatsApp rule for customers silent for more than 24 hours).
   - Client chooses who gets it (everyone, buyers, hot leads, by status, keyword), how many, and when.
   - Frontend only. Nothing is sent from this file: it calls the RPC create_whatsapp_broadcast (see BROADCAST_BACKEND_SPEC.md).
   Reads: client_followup_templates, leads, client_broadcasts (history, optional). */
(function () {
  'use strict';
  var G = window.GLIME_SETTINGS;
  if (!G || typeof G.register !== 'function') return;
  var sb = G.api.supabase, esc = G.ui.escapeHtml, toast = G.ui.toast;

  var MAX_PER_BROADCAST = 1000;
  var COST = { utility: 0.8, marketing: 1.2 };
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
    '.gbc-in.num{width:100px}.gbc-in.txt{width:230px}';

  function injectStyle() {
    if (document.getElementById('gbcStyle')) return;
    var el = document.createElement('style');
    el.id = 'gbcStyle';
    el.textContent = STYLE;
    document.head.appendChild(el);
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

  async function render(ctx) {
    injectStyle();
    var container = ctx.container;
    var cid = ctx.state.client && ctx.state.client.client_id;
    container.innerHTML = '<div class="section-head"><h2>Broadcast</h2><p>Send an offer to your saved leads on WhatsApp.</p></div><div class="loading">Loading…</div>';
    if (!sb || !cid) { container.innerHTML += '<div class="error">Your account could not be identified. Please refresh the page.</div>'; return; }

    var res = await Promise.all([
      sb.from('client_followup_templates').select('id,name,category,language,status').eq('client_id', cid).eq('status', 'approved').order('updated_at', { ascending: false }),
      sb.from('leads').select('id,name,mobile,whatsapp,city_area,interest,product_service,status,priority,last_contacted_at,created_at').eq('client_id', cid).order('created_at', { ascending: false }).limit(5000),
      sb.from('client_broadcasts').select('id,name,status,total_count,sent_count,failed_count,scheduled_at,created_at').eq('client_id', cid).order('created_at', { ascending: false }).limit(10)
    ]);
    if (res[0].error) throw res[0].error;
    if (res[1].error) throw res[1].error;
    var templates = res[0].data || [];
    var leads = res[1].data || [];
    var history = res[2].error ? null : (res[2].data || []);

    var conn = (ctx.state.connections || []).filter(function (x) { return x.channel === 'whatsapp'; })[0];
    var connected = !!(conn && conn.status === 'connected');

    var f = {
      name: '', tpl: templates.length ? templates[0].id : '',
      seg: 'all', statuses: {}, key: '', skipDays: 0, skipLost: true,
      mode: 'all', n: 50, order: 'new', when: 'now', at: ''
    };

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

    function tplOptions() {
      return templates.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === f.tpl ? ' selected' : '') + '>' + esc(t.name) + ' (' + esc(t.language) + ', ' + esc(t.category) + ')</option>';
      }).join('');
    }

    var warn = [];
    if (!connected) warn.push('WhatsApp is not connected. Connect it in Channels before sending.');
    if (!templates.length) warn.push('You have no template that Meta has approved yet. Create one on the Follow-up page, get it approved in Meta Business Manager, then press "Refresh status from Meta" in Template follow-ups.');

    container.innerHTML =
      '<div class="section-head"><h2>Broadcast</h2><p>Send one Meta-approved template, such as a Diwali offer, to the leads saved in GLIME. Choose who gets it and how many.</p></div>' +
      (warn.length ? '<div class="empty" style="margin-bottom:14px;color:#ffd58a">' + warn.map(function (w) { return '• ' + esc(w); }).join('<br>') + '</div>' : '') +

      '<section class="channel-card">' +
      '<div class="row" style="border-top:0"><div class="row-info"><b>Campaign name</b><small>Only for you, for example "Diwali offer 2026".</small></div>' +
      '<input class="gbc-in txt" id="bcName" type="text" maxlength="80" placeholder="Diwali offer"></div>' +
      '<div class="row"><div class="row-info"><b>Template to send</b><small>Only templates approved by Meta are listed.</small></div>' +
      '<select class="select" id="bcTpl">' + (templates.length ? tplOptions() : '<option value="">— none approved —</option>') + '</select></div>' +
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

      '<div class="section-head" style="margin-top:20px"><h2>Recent broadcasts</h2></div><div id="bcHist"></div>';

    var $ = function (id) { return document.getElementById(id); };

    function renderHistory() {
      var el = $('bcHist');
      if (history === null) { el.innerHTML = '<div class="empty">Broadcast history will appear here once broadcasting is switched on for your account.</div>'; return; }
      if (!history.length) { el.innerHTML = '<div class="empty">No broadcasts yet.</div>'; return; }
      el.innerHTML = history.map(function (h) {
        var det = (h.sent_count || 0) + ' of ' + (h.total_count || 0) + ' sent' + (h.failed_count ? ', ' + h.failed_count + ' failed' : '') + ' · ' + fmt(h.scheduled_at || h.created_at);
        return '<div class="row"><div class="row-info"><b>' + esc(h.name || 'Broadcast') + '</b><small>' + esc(det) + '</small></div><span class="badge ' + (h.status === 'sent' ? 'on' : (h.status === 'failed' ? 'off' : '')) + '">' + esc(HIST[h.status] || h.status) + '</span></div>';
      }).join('');
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
      return a;
    }

    $('bcName').oninput = function (e) { f.name = e.target.value; };
    $('bcTpl').onchange = function (e) { f.tpl = e.target.value; refresh(); };
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

    $('bcSend').onclick = async function (e) {
      var btn = e.currentTarget;
      var t = selTpl();
      if (!connected) { toast('Connect WhatsApp first.', true); return; }
      if (!t) { toast('Choose an approved template.', true); return; }
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
      var r = await sb.rpc('create_whatsapp_broadcast', {
        p_name: name,
        p_template_id: t.id,
        p_lead_ids: a.final.map(function (l) { return l.id; }),
        p_filters: { segment: f.seg, statuses: Object.keys(f.statuses).filter(function (k) { return f.statuses[k]; }), keyword: f.key.trim(), skip_contacted_days: f.skipDays, mode: f.mode, limit: f.mode === 'limit' ? Number(f.n) : null, order: f.order },
        p_schedule_at: at
      });
      btn.disabled = false;
      if (r.error) {
        var m = String(r.error.message || '');
        if (r.error.code === 'PGRST202' || /could not find the function|does not exist/i.test(m)) toast('Broadcast sending is not switched on yet. Nothing was sent.', true);
        else toast(m || 'Could not start the broadcast. Nothing was sent.', true);
        return;
      }
      toast(at ? 'Broadcast scheduled' : 'Broadcast started');
      render(ctx);
    };

    renderHistory();
    refresh();
  }

  G.register({ id: 'broadcast', label: 'Broadcast', order: 46, render: render });
})();
