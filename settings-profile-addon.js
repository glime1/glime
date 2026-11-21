/* =========================================================
   GLIME Settings > Profile
   ---------------------------------------------------------
   1. Owner photo + business logo
      Uses the shared photo system (glime-avatar.js). This file only
      draws the two cards; storage / backend calls live in GlimePhoto.

   2. Business details  (table client_profile_details)
      Every editable column of the client's own row:
        owner:    owner_display_name, owner_title, owner_bio
        business: business_display_name, business_category,
                  business_description, website
        contact:  contact_phone, contact_email
        address:  address_line1, address_line2, city, state,
                  postal_code, country
        region:   timezone, locale
      Read:  select on client_profile_details (RLS: own client only).
      Save:  rpc client_save_profile_details(p_details jsonb)
             - client_id comes from auth.uid(), never from the browser
             - only the keys that are sent are changed
             - empty text clears an optional field; country, timezone
               and locale are required, so empty keeps the old value
      The same row is used by the invoice PDF (name, address, phone,
      email, logo) and by the website generator prefill.
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_SETTINGS || !window.GLIME_SETTINGS.register) return;

  var COLS = [
    'owner_display_name', 'owner_title', 'owner_bio',
    'business_display_name', 'business_category', 'business_description', 'website',
    'contact_phone', 'contact_email',
    'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country',
    'timezone', 'locale'
  ];

  var CSS =
    '.pf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:15px}' +
    '.pf-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:20px;text-align:center}' +
    '.pf-card h3{font-size:1rem;margin-bottom:3px}' +
    '.pf-card p{color:var(--mu);font-size:.74rem;line-height:1.5}' +
    '.pf-photo{width:132px;height:132px;border-radius:50%;margin:16px auto 14px;display:flex;align-items:center;justify-content:center;' +
    'font-size:2.6rem;font-weight:800;color:#fff;border:3px solid rgba(80,245,168,.45);background:linear-gradient(135deg,#1f9d6e,#0b141d)}' +
    '.pf-photo.sq{border-radius:30px}' +
    '.pf-actions{display:flex;gap:9px;justify-content:center;flex-wrap:wrap}' +
    '.pf-form{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:18px;margin-top:15px}' +
    '.pf-form h3{font-size:1rem;margin-bottom:12px}' +
    '.pf-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
    '.pf-full{grid-column:1/-1}' +
    '.pf-form label{display:block;font-size:.72rem;font-weight:800;color:var(--mu);margin-bottom:5px}' +
    '.pf-form input,.pf-form textarea{width:100%;background:var(--surf2);color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:11px 12px;font:inherit;font-size:.86rem;outline:none}' +
    '.pf-form textarea{resize:vertical;min-height:84px}' +
    '.pf-form input:focus,.pf-form textarea:focus{border-color:rgba(82,232,255,.45)}' +
    '.pf-save{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:15px}' +
    '.pf-msg{font-size:.76rem;color:var(--mu);min-height:1em}' +
    '.pf-msg.ok{color:var(--gr)}.pf-msg.err{color:var(--rd)}' +
    '@media(max-width:760px){.pf-fields{grid-template-columns:1fr}.pf-form input,.pf-form textarea{font-size:16px}}';

  function esc(v) { return window.GLIME_SETTINGS.ui.escapeHtml(v); }

  function letter(v) { return String(v || 'G').trim().charAt(0).toUpperCase() || 'G'; }

  function t(v) { return String(v == null ? '' : v).trim(); }

  function isMissingFn(err) {
    var m = String((err && err.message) || '');
    return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist|schema cache/i.test(m));
  }

  /* GLIME-themed confirm box; falls back to the native one if the dialog file is missing. */
  function gdConfirm(msg, o) {
    return window.GLIME_DIALOG ? window.GLIME_DIALOG.confirm(msg, o) : Promise.resolve(window.confirm(msg));
  }

  function card(type, id, title, hint, seed, square) {
    return '<section class="pf-card">' +
      '<h3>' + esc(title) + '</h3><p>' + esc(hint) + '</p>' +
      '<div class="pf-photo' + (square ? ' sq' : '') + '" data-gp-type="' + type + '" data-gp-id="' + esc(id) + '">' + esc(letter(seed)) + '</div>' +
      '<div class="pf-actions">' +
      '<button type="button" class="btn primary" data-pf-pick="' + type + '">Upload / change</button>' +
      '<button type="button" class="btn danger" data-pf-remove="' + type + '" hidden>Remove</button>' +
      '</div></section>';
  }

  /* one input or textarea */
  function field(v, key, label, o) {
    o = o || {};
    var id = 'pf_' + key;
    var cls = o.full ? ' class="pf-full"' : '';
    var control = o.area
      ? '<textarea id="' + id + '" data-k="' + key + '" maxlength="' + o.max + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>' + esc(v[key]) + '</textarea>'
      : '<input id="' + id + '" data-k="' + key + '" maxlength="' + o.max + '"' +
        (o.type ? ' type="' + o.type + '"' : '') + (o.mode ? ' inputmode="' + o.mode + '"' : '') +
        (o.list ? ' list="' + o.list + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
        ' value="' + esc(v[key]) + '">';
    return '<div' + cls + '><label for="' + id + '">' + esc(label) + '</label>' + control + '</div>';
  }

  function detailsHtml(v) {
    return '<form class="pf-form" id="pfForm" novalidate>' +
      '<h3>Owner</h3><div class="pf-fields">' +
        field(v, 'owner_display_name', 'Owner name', { max: 120 }) +
        field(v, 'owner_title', 'Title', { max: 120, ph: 'For example Founder' }) +
        field(v, 'owner_bio', 'About the owner (optional)', { max: 1000, area: true, full: true }) +
      '</div>' +
      '<h3 style="margin-top:22px">Business</h3><div class="pf-fields">' +
        field(v, 'business_display_name', 'Business name', { max: 160 }) +
        field(v, 'business_category', 'Category', { max: 120, ph: 'For example Clothing store' }) +
        field(v, 'business_description', 'About the business (optional)', { max: 1500, area: true, full: true }) +
        field(v, 'website', 'Website', { max: 500, type: 'url', mode: 'url', ph: 'https://', full: true }) +
      '</div>' +
      '<h3 style="margin-top:22px">Contact</h3><div class="pf-fields">' +
        field(v, 'contact_phone', 'Mobile number', { max: 40, type: 'tel', mode: 'tel', ph: '+91 98765 43210' }) +
        field(v, 'contact_email', 'Email', { max: 254, type: 'email', mode: 'email' }) +
      '</div>' +
      '<h3 style="margin-top:22px">Address</h3><div class="pf-fields">' +
        field(v, 'address_line1', 'Address line 1', { max: 240, full: true }) +
        field(v, 'address_line2', 'Address line 2 (optional)', { max: 240, full: true }) +
        field(v, 'city', 'City', { max: 120 }) +
        field(v, 'state', 'State', { max: 120 }) +
        field(v, 'postal_code', 'PIN / postal code', { max: 24 }) +
        field(v, 'country', 'Country', { max: 100 }) +
      '</div>' +
      '<h3 style="margin-top:22px">Region</h3><div class="pf-fields">' +
        field(v, 'timezone', 'Time zone', { max: 100, list: 'pfTz', ph: 'Asia/Kolkata' }) +
        field(v, 'locale', 'Language / format', { max: 24, list: 'pfLoc', ph: 'en-IN' }) +
      '</div>' +
      '<datalist id="pfTz"><option value="Asia/Kolkata"><option value="Asia/Dubai"><option value="Asia/Singapore"><option value="Asia/Kathmandu"><option value="Asia/Dhaka"><option value="Asia/Colombo"><option value="Europe/London"><option value="America/New_York"><option value="America/Los_Angeles"><option value="Australia/Sydney"></datalist>' +
      '<datalist id="pfLoc"><option value="en-IN"><option value="en-US"><option value="en-GB"><option value="hi-IN"></datalist>' +
      '<div class="pf-save"><button type="submit" class="btn primary" id="pfSave">Save details</button>' +
      '<span class="pf-msg" id="pfMsg" role="status"></span></div>' +
    '</form>';
  }

  window.GLIME_SETTINGS.register({
    id: 'profile',
    label: 'Profile',
    order: 15,
    render: async function (ctx) {
      var client = ctx.state.client || {};
      var id = client.client_id;
      var biz = client.business_name || client.name || 'Business';
      var sb = ctx.api.supabase;

      if (!document.getElementById('pf-style')) {
        var st = document.createElement('style'); st.id = 'pf-style'; st.textContent = CSS;
        document.head.appendChild(st);
      }

      /* current details: the saved row, with the same fallbacks the invoice uses for empty fields */
      var row = {}, cd = {};
      try {
        var r1 = await sb.from('client_profile_details').select(COLS.join(',')).eq('client_id', id).maybeSingle();
        if (!r1.error && r1.data) row = r1.data;
      } catch (e) { /* ignore */ }
      try {
        var r2 = await sb.from('client_data').select('business_name,project_name,client_name,phone,email').eq('client_id', id).maybeSingle();
        if (!r2.error && r2.data) cd = r2.data;
      } catch (e) { /* ignore */ }

      var v = {};
      COLS.forEach(function (k) { v[k] = t(row[k]); });
      if (!v.owner_display_name) v.owner_display_name = t(client.name);
      if (!v.business_display_name) v.business_display_name = t(cd.business_name) || t(cd.project_name) || t(cd.client_name) || t(client.business_name);
      if (!v.contact_phone) v.contact_phone = t(cd.phone);
      if (!v.contact_email) v.contact_email = t(cd.email);
      if (!v.country) v.country = 'India';
      if (!v.timezone) v.timezone = 'Asia/Kolkata';
      if (!v.locale) v.locale = 'en-IN';

      ctx.container.innerHTML =
        '<div class="pf">' +
        '<div class="section-head"><h2>Profile</h2>' +
        '<p>Your photo, business logo and business details are used across GLIME: sidebar, customer, lead and chat screens, and on your invoices.</p></div>' +
        '<div class="pf-grid">' +
        card('owner', id, 'Owner photo', 'Shown next to your name in the sidebar and top bar on every page.', client.name || biz, false) +
        card('business', id, 'Business logo', 'Your brand mark. Square images work best.', biz, true) +
        '</div>' +
        detailsHtml(v) +
        '</div>';

      var root = ctx.container.querySelector('.pf');
      var msg = root.querySelector('#pfMsg');
      var saveBtn = root.querySelector('#pfSave');

      function setMsg(text, kind) {
        msg.textContent = text || '';
        msg.className = 'pf-msg' + (kind ? ' ' + kind : '');
      }

      root.addEventListener('input', function (e) {
        var k = e.target.getAttribute && e.target.getAttribute('data-k');
        if (!k) return;
        v[k] = e.target.value;
        setMsg('');
      });

      root.querySelector('#pfForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var p = {};
        COLS.forEach(function (k) { p[k] = t(v[k]); });

        if (p.contact_phone && !/^\+?[0-9 ()-]{7,40}$/.test(p.contact_phone)) { setMsg('Please enter a valid mobile number.', 'err'); return; }
        if (p.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contact_email)) { setMsg('Please enter a valid email address.', 'err'); return; }
        if (p.postal_code && !/^[A-Za-z0-9 -]{3,24}$/.test(p.postal_code)) { setMsg('Please enter a valid PIN / postal code.', 'err'); return; }
        if (p.website && !/^https?:\/\//i.test(p.website)) {
          p.website = 'https://' + p.website;
          v.website = p.website;
          var web = root.querySelector('#pf_website');
          if (web) web.value = p.website;
        }
        if (p.timezone) {
          try { new Intl.DateTimeFormat('en', { timeZone: p.timezone }); }
          catch (err) { setMsg('Time zone is not valid. Use a name like Asia/Kolkata.', 'err'); return; }
        }
        if (p.locale) {
          try { Intl.getCanonicalLocales(p.locale); }
          catch (err) { setMsg('Language / format is not valid. Use a code like en-IN.', 'err'); return; }
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        setMsg('');
        try {
          var r = await sb.rpc('client_save_profile_details', { p_details: p });
          if (r.error) throw r.error;
          setMsg('Saved.', 'ok');
          ctx.ui.toast('Profile details saved');
        } catch (err) {
          console.error(err);
          setMsg(isMissingFn(err)
            ? 'Saving is not switched on yet, so nothing was changed.'
            : ((err && err.message) || 'Could not save. Please try again.'), 'err');
        }
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save details';
      });

      /* photos */
      var P = window.GlimePhoto;
      if (!P) {
        root.insertAdjacentHTML('beforeend', '<div class="error" style="margin-top:12px">The photo system could not be loaded. Please refresh the page.</div>');
        return;
      }

      function syncButtons() {
        ['owner', 'business'].forEach(function (tp) {
          var rm = root.querySelector('[data-pf-remove="' + tp + '"]');
          if (rm) rm.hidden = !P.has(tp, id);
        });
        P.apply();
      }

      root.addEventListener('click', async function (e) {
        var pk = e.target.closest('[data-pf-pick]');
        if (pk) { var tp = pk.getAttribute('data-pf-pick'); P.pick(tp, id, tp === 'owner' ? (client.name || biz) : biz); return; }
        var rm = e.target.closest('[data-pf-remove]');
        if (rm) {
          var type = rm.getAttribute('data-pf-remove');
          if (!(await gdConfirm('Remove this photo?', { title: 'Remove photo', confirmText: 'Remove', danger: true }))) return;
          P.remove(type, id).then(function () { window.GLIME_SETTINGS.ui.toast('Photo removed'); syncButtons(); })
            .catch(function (err) { window.GLIME_SETTINGS.ui.toast(err.message || 'Could not remove photo', true); });
        }
      });

      P.on(function () { if (root.isConnected) syncButtons(); });
      await P.ready();
      syncButtons();
    }
  });
})();
