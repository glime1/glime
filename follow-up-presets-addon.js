/* GLIME Follow-up: ready-made WhatsApp templates (add-on, does not change existing code)
   - Shows Glime's ready-made, Meta-friendly templates inside Templates > WhatsApp templates.
   - "Add to my templates" copies one into the client's own list (client_followup_templates) as a Draft.
     The copy is fully editable with the existing Edit button. The ready-made list itself is read-only.
   - The client submits to Meta himself (Meta Business Manager) and then sets the status on the card.
   Needs: follow-up-pro-addon.js loaded before this file, tables whatsapp_template_presets + client_followup_templates. */
(function () {
  'use strict';
  if (window.__fuPresets || !window.supabase) return;
  window.__fuPresets = 1;
  var U = 'https://ufoulgbiqgjriwapuopc.supabase.co', K = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  var db = window.supabase.createClient(U, K);
  var VARMAP = {
    order_confirmation: ['name', ''],
    payment_reminder: ['name', '', ''],
    enquiry_followup: ['name', 'interest'],
    offer_update: ['name', 'product_service'],
    order_confirmation_en: ['name', ''],
    order_shipped_en: ['name', '', ''],
    payment_reminder_en: ['name', '', ''],
    appointment_reminder_en: ['name', '', ''],
    offer_update_en: ['name', 'product_service'],
    new_arrival_en: ['name', 'product_service'],
    festive_sale_en: ['name', ''],
    we_miss_you_en: ['name', 'interest']
  };
  var S = { cid: null, presets: null, added: {}, open: false, busy: false };

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); }
  function fill(s, vals) { return String(s || '').replace(/\{\{(\d+)\}\}/g, function (_, n) { return vals[n - 1] || '{{' + n + '}}'; }); }

  async function load() {
    var u = await db.auth.getUser(); if (!u.data || !u.data.user) return false;
    var c = await db.from('client_data').select('client_id').eq('auth_user_id', u.data.user.id).maybeSingle();
    if (!c.data) return false; S.cid = c.data.client_id;
    var p = await db.from('whatsapp_template_presets').select('*').eq('is_active', true).order('sort_order');
    if (p.error) return false; S.presets = p.data || [];
    await loadAdded();
    return true;
  }
  async function loadAdded() {
    var r = await db.from('client_followup_templates').select('preset_key').eq('client_id', S.cid).not('preset_key', 'is', null);
    S.added = {}; (r.data || []).forEach(function (x) { S.added[x.preset_key] = 1; });
  }

  function html() {
    var n = S.presets.length;
    var head = '<button type="button" class="btn sm ghost" data-pre="toggle">' + (S.open ? 'Hide' : 'Show') + ' ready-made templates (' + n + ')</button>';
    if (!S.open) return '<div class="fup-note" style="margin:10px 0">' + head + '</div>';
    return '<div style="margin:10px 0">' + head +
      '<p class="fup-note">Ready-made, Meta-friendly templates. Add one to your list, edit it if needed, then submit it in Meta Business Manager.</p>' +
      '<div class="fup-cards">' + S.presets.map(function (p) {
        var sv = p.sample_values || [], done = S.added[p.key];
        return '<article class="fup-card"><header><b>' + esc(p.name) + '</b><span class="fup-st draft">Ready-made</span></header>' +
          '<div class="fup-meta"><span>' + esc(p.category.charAt(0) + p.category.slice(1).toLowerCase()) + '</span><span>' + esc(p.language) + '</span></div>' +
          '<div class="fup-bub">' + esc(fill(p.body_text, sv)).replace(/\n/g, '<br>') + (p.footer_text ? '<small>' + esc(p.footer_text) + '</small>' : '') + '</div>' +
          (p.description ? '<p class="fup-note">' + esc(p.description) + '</p>' : '') +
          '<footer><button class="btn sm primary" type="button" data-pre="add" data-key="' + esc(p.key) + '"' + (done ? ' disabled' : '') + '>' + (done ? 'Added' : 'Add to my templates') + '</button>' +
          '<button class="btn sm ghost" type="button" data-pre="copy" data-key="' + esc(p.key) + '">Copy text</button></footer></article>';
      }).join('') + '</div></div>';
  }

  function mount() {
    var m = $('fupMeta'); if (!m || !S.presets) return;
    var top = m.querySelector('.fup-top'); if (!top) return;   /* only for Omni clients (same rule as the page) */
    var box = $('fupPre');
    if (!box) { box = document.createElement('div'); box.id = 'fupPre'; top.parentNode.insertBefore(box, top.nextSibling); }
    box.innerHTML = html();
  }

  async function add(key, btn) {
    if (S.busy) return; var p = S.presets.filter(function (x) { return x.key === key; })[0]; if (!p) return;
    S.busy = true; btn.disabled = true;
    try {
      var row = {
        client_id: S.cid, name: p.name, category: p.category.toLowerCase(), language: p.language,
        header: { type: 'none', text: '' }, body: p.body_text, footer: p.footer_text || '', buttons: p.buttons || [],
        samples: p.sample_values || [], var_map: VARMAP[key] || [], status: 'draft', rejection_reason: '', preset_key: key
      };
      var r = await db.from('client_followup_templates').insert(row); if (r.error) throw r.error;
      S.added[key] = 1;
      toast('Added to your templates as Draft.', 'success');
      try { sessionStorage.setItem('fup_reopen_meta', '1'); } catch (e) { }
      location.reload();   /* reload so the existing list shows the new template */
    } catch (e) { toast('Could not add: ' + (e.message || 'error'), 'error'); btn.disabled = false; S.busy = false; }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-pre]'); if (!a) return;
    var k = a.getAttribute('data-pre'), key = a.getAttribute('data-key');
    if (k === 'toggle') { S.open = !S.open; mount(); }
    else if (k === 'add') add(key, a);
    else if (k === 'copy') {
      var p = S.presets.filter(function (x) { return x.key === key; })[0]; if (!p) return;
      (navigator.clipboard ? navigator.clipboard.writeText(p.body_text) : Promise.reject()).then(
        function () { toast('Template text copied.', 'success'); },
        function () { toast('Copy is not available in this browser.', 'error'); });
    }
  });

  function start() {
    load().then(function (ok) {
      if (!ok) return;
      var m = $('fupMeta');
      if (m) new MutationObserver(function () { if (!$('fupPre') && m.querySelector('.fup-top')) mount(); }).observe(m, { childList: true, subtree: true });
      try {
        if (sessionStorage.getItem('fup_reopen_meta')) {
          sessionStorage.removeItem('fup_reopen_meta'); S.open = true;
          setTimeout(function () {
            var tb = document.querySelector('[data-tab="templates"]'); if (tb) tb.click();
            var sg = document.querySelector('[data-seg="meta"]'); if (sg) sg.click();
          }, 700);
        }
      } catch (e) { }
      mount();
    }).catch(function (e) { if (window.console) console.warn('Presets add-on:', e); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
