/* GLIME Settings addon: "Template follow-ups"
   Lets the client pick which Meta-approved WhatsApp templates GLIME may use after the customer's 24-hour window closes.
   - Utility template: sent automatically.  - Marketing template: only after the client approves each one.
   - Also needs, in Settings > Channels > WhatsApp: Channel enabled, Automation and Follow-ups switched on.
   Needs tables: client_followup_templates, client_template_followup_settings, client_template_followup_log
   and the edge function whatsapp-template-sync. */
(function () {
  'use strict';
  var G = window.GLIME_SETTINGS;
  if (!G || typeof G.register !== 'function') return;
  var sb = G.api.supabase, esc = G.ui.escapeHtml, toast = G.ui.toast;

  var KIND = { utility: 'Utility (automatic)', marketing: 'Marketing (needs your approval)' };
  var ST = { sent: 'Sent', queued: 'Sending', awaiting_approval: 'Waiting for your approval', failed: 'Failed', skipped: 'Not sent', expired: 'Expired', abandoned: 'Not sent' };
  var inp = 'width:110px;background:var(--surf2);color:var(--tx);border:1px solid var(--bd);border-radius:9px;padding:9px 10px;outline:none';

  function fmt(v) { try { return new Date(v).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function opts(list, cur) {
    return '<option value="">— none —</option>' + list.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (t.id === cur ? ' selected' : '') + '>' + esc(t.name) + ' (' + esc(t.language) + ')</option>';
    }).join('');
  }
  function num(id, v, min, max) { return '<input id="' + id + '" type="number" inputmode="numeric" min="' + min + '" max="' + max + '" value="' + esc(v) + '" style="' + inp + '">'; }

  async function render(ctx) {
    var container = ctx.container, cid = ctx.state.client.client_id;
    var r = await Promise.all([
      sb.from('client_followup_templates').select('id,name,category,language,status,rejection_reason,last_synced_at').eq('client_id', cid).order('updated_at', { ascending: false }),
      sb.from('client_template_followup_settings').select('*').eq('client_id', cid).maybeSingle(),
      sb.from('client_template_followup_log').select('kind,status,error_code,created_at').eq('client_id', cid).order('created_at', { ascending: false }).limit(15)
    ]);
    if (r[0].error || r[1].error) throw (r[0].error || r[1].error);
    var tpls = r[0].data || [], s = r[1].data || {}, logs = r[2].data || [];
    var okU = tpls.filter(function (t) { return t.status === 'approved' && t.category === 'utility'; });
    var okM = tpls.filter(function (t) { return t.status === 'approved' && t.category === 'marketing'; });
    var wa = (ctx.state.settings || []).filter(function (x) { return x.channel === 'whatsapp'; })[0];
    var waOff = wa && (wa.enabled === false || wa.automation_enabled === false || wa.followups_enabled === false);
    var conn = (ctx.state.connections || []).filter(function (x) { return x.channel === 'whatsapp'; })[0];
    var last = tpls.map(function (t) { return t.last_synced_at; }).filter(Boolean).sort().pop();

    var warn = [];
    if (!conn || conn.status !== 'connected') warn.push('WhatsApp is not connected.');
    if (waOff) warn.push('In Channels > WhatsApp, switch on Channel enabled, Automation and Follow-ups. Template follow-ups will not run until then.');
    if (!okU.length && !okM.length) warn.push('You have no template that Meta has approved yet. Add one on the Follow-up page, submit it in Meta Business Manager, then press "Refresh status from Meta".');

    container.innerHTML =
      '<div class="section-head"><h2>Template follow-ups</h2><p>After a customer has been silent for more than 24 hours, WhatsApp only allows Meta-approved templates. Choose which ones GLIME may use.</p></div>' +
      (warn.length ? '<div class="empty" style="margin-bottom:14px;color:#ffd58a">' + warn.map(function (w) { return '• ' + esc(w); }).join('<br>') + '</div>' : '') +
      '<section class="channel-card">' +
      '<div class="row" style="border-top:0"><div class="row-info"><b>Use template follow-ups</b><small>Off by default. Nothing is sent to customers while this is off.</small></div>' +
      '<label class="sw"><input type="checkbox" id="tfEnabled"' + (s.enabled ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="row"><div class="row-info"><b>Utility template</b><small>Sent automatically, once, to a customer who went quiet. Costs ₹0.80 per message.</small></div>' +
      '<select class="select" id="tfUtil">' + opts(okU, s.utility_template_id) + '</select></div>' +
      '<div class="row"><div class="row-info"><b>Marketing template</b><small>GLIME prepares it, and it is sent only after you approve it. Costs ₹1.20 per message.</small></div>' +
      '<select class="select" id="tfMkt">' + opts(okM, s.marketing_template_id) + '</select></div>' +
      '<div class="row"><div class="row-info"><b>Send utility after (hours of silence)</b><small>24 to 168.</small></div>' + num('tfUH', s.utility_after_hours || 25, 24, 168) + '</div>' +
      '<div class="row"><div class="row-info"><b>Prepare marketing after (days of silence)</b><small>2 to 30.</small></div>' + num('tfMD', s.marketing_after_days || 3, 2, 30) + '</div>' +
      '<div class="row"><div class="row-info"><b>Ignore customers silent for more than (days)</b><small>2 to 30.</small></div>' + num('tfLB', s.lookback_days || 7, 2, 30) + '</div>' +
      '<div class="row"><div class="row-info"><b>Maximum template messages per day</b><small>1 to 1000. Counts utility and marketing together.</small></div>' + num('tfMX', s.max_per_day || 20, 1, 1000) + '</div>' +
      '<div class="actions"><button class="btn primary" id="tfSave">Save changes</button><button class="btn" id="tfSync">Refresh status from Meta</button></div>' +
      '<p class="note">GLIME skips customers who asked to stop, closed leads, recent buyers and customers with missing details. Messages go out between 9 AM and 9 PM IST.' + (last ? ' Template status last checked ' + esc(fmt(last)) + '.' : '') + '</p>' +
      '</section>' +
      '<div class="section-head" style="margin-top:20px"><h2>Recent activity</h2></div>' +
      (logs.length ? logs.map(function (l) {
        return '<div class="row"><div class="row-info"><b>' + esc(KIND[l.kind] || l.kind) + '</b><small>' + esc(fmt(l.created_at)) + (l.error_code ? ' · ' + esc(l.error_code) : '') + '</small></div><span class="badge ' + (l.status === 'sent' ? 'on' : (l.status === 'failed' ? 'off' : '')) + '">' + esc(ST[l.status] || l.status) + '</span></div>';
      }).join('') : '<div class="empty">Nothing yet.</div>');

    var $ = function (id) { return document.getElementById(id); };
    $('tfSync').onclick = async function (e) {
      var b = e.currentTarget; b.disabled = true;
      var res = await sb.functions.invoke('whatsapp-template-sync', { body: {} });
      b.disabled = false;
      if (res.error) { toast('Could not refresh status. Try again in a minute.', true); return; }
      var d = res.data || {};
      toast(d.throttled ? 'Status was refreshed a moment ago.' : ('Checked ' + (d.checked || 0) + ' templates, ' + (d.updated || 0) + ' changed.'));
      render(ctx);
    };
    $('tfSave').onclick = async function (e) {
      var b = e.currentTarget;
      var n = function (id, lo, hi) { var v = parseInt($(id).value, 10); return (isFinite(v) && v >= lo && v <= hi) ? v : null; };
      var row = {
        client_id: cid, enabled: $('tfEnabled').checked,
        utility_template_id: $('tfUtil').value || null, marketing_template_id: $('tfMkt').value || null,
        utility_after_hours: n('tfUH', 24, 168), marketing_after_days: n('tfMD', 2, 30), lookback_days: n('tfLB', 2, 30), max_per_day: n('tfMX', 1, 1000)
      };
      if ([row.utility_after_hours, row.marketing_after_days, row.lookback_days, row.max_per_day].some(function (x) { return x === null; })) { toast('Please check the numbers. They are outside the allowed range.', true); return; }
      if (row.enabled && !row.utility_template_id && !row.marketing_template_id) { toast('Choose at least one approved template first.', true); return; }
      if (row.enabled && !(await G.ui.confirm('Turn on template follow-ups? Utility messages will then be sent automatically to customers who went quiet.', { title: 'Turn on', confirmText: 'Turn on' }))) return;
      b.disabled = true;
      var u = await sb.from('client_template_followup_settings').upsert(row, { onConflict: 'client_id' });
      b.disabled = false;
      if (u.error) { toast(u.error.message || 'Could not save', true); return; }
      toast('Template follow-up settings saved');
    };
  }

  G.register({ id: 'template-followups', label: 'Template follow-ups', order: 45, render: render });
})();
