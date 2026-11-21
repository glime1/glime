/* =========================================================
   GLIME OTHERS > INVOICE GENERATOR  (automatic invoice settings)
   ---------------------------------------------------------
   Deep link: others.html#invoices

   How invoices work in GLIME
   - When an order's payment completes, GLIME sends the invoice to the
     customer on WhatsApp by itself. The client does not make invoices
     by hand.
   - This tab is where the client sets WHAT appears on those invoices:
     business name, address, GSTIN, mobile number, GST %, invoice number
     prefix, notes, and whether the business logo and / or profile
     picture is shown. The client saves it once; every automatic invoice
     then uses it.
   - The logo and picture are the ones already uploaded in
     Settings > Profile (shared photo system, glime-avatar.js). They are
     not shown in the options, only inside the invoice preview.
   - The preview uses SAMPLE order data. Real invoices use the real order.

   BACKEND CONTRACT (frontend is ready; until the two RPCs exist the
   settings are kept on this device only and the page says so):
     rpc client_get_invoice_settings()  returns jsonb
     rpc client_save_invoice_settings(p_settings jsonb)  returns jsonb
   Both run as the signed-in client (client_id from auth.uid()).
   p_settings shape:
     { "business_name": text,
       "business_info": text,        -- address and other lines
       "gstin": text,
       "phone": text,                -- mobile number shown on the invoice
       "gst_percent": number 0-100,
       "invoice_prefix": text,       -- e.g. "INV"
       "notes": text,                -- footer / payment terms
       "use_logo": boolean,          -- show business logo
       "use_owner_photo": boolean }  -- show owner profile picture
   The WhatsApp invoice job reads these when it builds an invoice. The
   logo is profile_media entity_type "business" and the picture is
   entity_type "owner" (see glime-avatar.js).
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  var STYLE_ID = 'othInvStyle';
  var LS_KEY = 'glime_invoice_settings_';

  var PAPER_CSS =
    '.oi-paper{background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;padding:26px;border-radius:12px}' +
    '.oi-paper *{box-sizing:border-box}' +
    '.oi-paper .p-head{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;border-bottom:2px solid #0e7490;padding-bottom:14px;margin-bottom:16px}' +
    '.oi-paper .p-brandrow{display:flex;align-items:center;gap:12px}' +
    '.oi-paper .p-logo,.oi-paper .p-photo{width:58px;height:58px;object-fit:cover;flex:none;border:1px solid #e5e7eb;background:#fff}' +
    '.oi-paper .p-logo{border-radius:12px}' +
    '.oi-paper .p-photo{border-radius:50%}' +
    '.oi-paper .p-brand{font-size:19px;font-weight:800;color:#0b3b4a}' +
    '.oi-paper .p-muted{color:#6b7280;font-size:12px}' +
    '.oi-paper .p-title{text-align:right}' +
    '.oi-paper .p-title b{display:block;font-size:22px;letter-spacing:.08em;color:#0e7490;margin-bottom:4px}' +
    '.oi-paper .p-lbl{font-size:10.5px;font-weight:800;letter-spacing:.12em;color:#6b7280;margin-bottom:3px}' +
    '.oi-paper .p-bill{margin-bottom:16px}' +
    '.oi-paper .p-wrap{overflow-x:auto}' +
    '.oi-paper table{width:100%;border-collapse:collapse;margin-bottom:14px;min-width:420px}' +
    '.oi-paper th{background:#e6f6fa;color:#0b3b4a;text-align:left;font-size:11.5px;padding:8px 9px}' +
    '.oi-paper td{padding:8px 9px;border-bottom:1px solid #e5e7eb;vertical-align:top}' +
    '.oi-paper .r{text-align:right}' +
    '.oi-paper .p-tot{margin-left:auto;width:100%;max-width:290px}' +
    '.oi-paper .p-tot div{display:flex;justify-content:space-between;padding:4px 0}' +
    '.oi-paper .p-tot .g{border-top:2px solid #0e7490;margin-top:5px;padding-top:8px;font-size:15px;font-weight:800;color:#0b3b4a}' +
    '.oi-paper .p-notes{margin-top:18px;padding-top:12px;border-top:1px solid #e5e7eb;color:#374151;font-size:12px}';

  var PAGE_CSS =
    '.oi .oi-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
    '.oi .oi-full{grid-column:1/-1}' +
    '.oi label{display:block;font-size:.72rem;font-weight:800;color:var(--mu);margin-bottom:5px}' +
    '.oi input,.oi textarea{width:100%;background:transparent;color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:11px 12px;font:inherit;font-size:.86rem}' +
    '.oi textarea{resize:vertical;min-height:64px}' +
    '.oi input:focus,.oi textarea:focus{outline:2px solid rgba(14,116,144,.45);outline-offset:1px}' +
    '.oi small{display:block;color:var(--mu);font-size:.7rem;margin-top:4px}' +
    '.oi h3{font-size:1.02rem;margin:0 0 12px}' +
    '.oi .oi-sub{color:var(--mu);font-size:.78rem;margin:-6px 0 12px}' +
    '.oi .oi-info{border:1px solid var(--bd);border-radius:14px;padding:13px 14px;margin-bottom:15px;font-size:.8rem;color:var(--mu);background:var(--surf)}' +
    '.oi .oi-info b{color:var(--tx)}' +
    '.oi label.oi-opt{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--bd);border-radius:12px;padding:12px;margin:10px 0 0;cursor:pointer;color:var(--tx);font-weight:400;font-size:.86rem}' +
    '.oi label.oi-opt.on{border-color:rgba(14,116,144,.6);background:rgba(14,116,144,.08)}' +
    '.oi label.oi-opt.off{opacity:.6;cursor:default}' +
    '.oi .oi-opt input{width:20px;height:20px;flex:none;padding:0;margin:2px 0 0;accent-color:#0e7490}' +
    '.oi .oi-opt b{display:block;font-size:.88rem;font-weight:800}' +
    '.oi .oi-opt em{display:block;font-style:normal;font-size:.74rem;color:var(--mu);margin-top:2px}' +
    '.oi .oi-opt em a{color:inherit;text-decoration:underline}' +
    '.oi .oi-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}' +
    '.oi .oi-note{font-size:.76rem;color:var(--mu);min-height:1em}' +
    '.oi .oi-note.ok{color:var(--gr)}.oi .oi-note.err{color:var(--rd)}' +
    'html[data-theme="light"] .oi .oi-note.ok{color:#047857}' +
    'html[data-theme="light"] .oi .oi-note.err{color:#c62828}' +
    '@media(max-width:760px){' +
      '.oi .oi-grid{grid-template-columns:1fr}' +
      '.oi input,.oi textarea{font-size:16px}' +
      '.oi .oi-paper{padding:18px}' +
    '}';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = PAGE_CSS + PAPER_CSS;
    document.head.appendChild(s);
  }

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function money(n) {
    return '\u20B9' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function prettyToday() {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function isMissingFn(err) {
    var m = String((err && err.message) || '');
    return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist|schema cache/i.test(m));
  }

  async function renderInvoices(ctx) {
    injectStyle();

    var esc = ctx.ui.escapeHtml;
    var sb = ctx.api.supabase;
    var client = ctx.state.client || {};
    var clientId = client.client_id || '';

    /* shared photo system (loaded by the app shell) */
    var Photo = window.GlimePhoto || null;
    if (Photo) { try { await Photo.ready(); } catch (e) { /* ignore */ } }

    var cfg = {
      business_name: client.business_name || client.name || '',
      business_info: '',
      gstin: '',
      phone: '',
      gst_percent: 0,
      invoice_prefix: 'INV',
      notes: 'Thank you for your business.',
      use_logo: false,
      use_owner_photo: false
    };

    function mergeCfg(src) {
      if (!src || typeof src !== 'object') return;
      ['business_name', 'business_info', 'gstin', 'phone', 'invoice_prefix', 'notes'].forEach(function (k) {
        if (typeof src[k] === 'string') cfg[k] = src[k];
      });
      if (src.gst_percent != null && isFinite(parseFloat(src.gst_percent))) cfg.gst_percent = parseFloat(src.gst_percent);
      if (typeof src.use_logo === 'boolean') cfg.use_logo = src.use_logo;
      if (typeof src.use_owner_photo === 'boolean') cfg.use_owner_photo = src.use_owner_photo;
    }

    try { mergeCfg(JSON.parse(localStorage.getItem(LS_KEY + clientId) || 'null')); } catch (e) { /* ignore */ }
    try {
      var got = await sb.rpc('client_get_invoice_settings');
      if (!got.error) mergeCfg(Array.isArray(got.data) ? got.data[0] : got.data);
    } catch (e) { /* settings RPC not available yet: keep the local copy */ }

    function photoUrl(type) {
      if (!Photo || !clientId) return null;
      try { return Photo.url(type, clientId) || null; } catch (e) { return null; }
    }

    function nl(v) { return esc(v).replace(/\n/g, '<br>'); }

    function brandImages() {
      var h = '';
      var logo = cfg.use_logo ? photoUrl('business') : null;
      var owner = cfg.use_owner_photo ? photoUrl('owner') : null;
      if (logo) h += '<img class="p-logo" src="' + esc(logo) + '" alt="" referrerpolicy="no-referrer">';
      if (owner) h += '<img class="p-photo" src="' + esc(owner) + '" alt="" referrerpolicy="no-referrer">';
      return h;
    }

    /* Sample order, only for the preview */
    var SAMPLE = [
      { d: 'Sample product', q: 2, r: 500 },
      { d: 'Sample service', q: 1, r: 1000 }
    ];

    function paperHtml() {
      var sub = 0;
      var rows = SAMPLE.map(function (it, i) {
        var amt = it.q * it.r;
        sub += amt;
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.d) + '</td><td class="r">' + it.q +
          '</td><td class="r">' + money(it.r) + '</td><td class="r">' + money(amt) + '</td></tr>';
      }).join('');

      var gst = Math.min(100, num(cfg.gst_percent));
      var tax = sub * gst / 100;

      var tot = '<div><span>Subtotal</span><span>' + money(sub) + '</span></div>';
      if (gst > 0) tot += '<div><span>GST (' + esc(String(gst)) + '%)</span><span>' + money(tax) + '</span></div>';
      tot += '<div class="g"><span>Total</span><span>' + money(sub + tax) + '</span></div>';

      var lines = [];
      if (String(cfg.business_info).trim()) lines.push(nl(cfg.business_info));
      if (String(cfg.gstin).trim()) lines.push('GSTIN: ' + esc(cfg.gstin.trim()));
      if (String(cfg.phone).trim()) lines.push('Phone: ' + esc(cfg.phone.trim()));

      var prefix = String(cfg.invoice_prefix).trim();

      return '<div class="oi-paper">' +
        '<div class="p-head">' +
          '<div class="p-brandrow">' + brandImages() +
            '<div><div class="p-brand">' + (esc(cfg.business_name) || 'Your business') + '</div>' +
            '<div class="p-muted">' + lines.join('<br>') + '</div></div></div>' +
          '<div class="p-title"><b>INVOICE</b>' +
            '<div class="p-muted">No: ' + esc((prefix ? prefix + '-' : '') + '0001') + '</div>' +
            '<div class="p-muted">Date: ' + esc(prettyToday()) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="p-bill"><div class="p-lbl">BILL TO</div>' +
          '<div><b>Sample Customer</b></div>' +
          '<div class="p-muted">+91 98765 43210</div></div>' +
        '<div class="p-wrap"><table><thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>' +
        '<div class="p-tot">' + tot + '</div>' +
        (String(cfg.notes).trim() ? '<div class="p-notes"><div class="p-lbl">NOTES</div>' + nl(cfg.notes) + '</div>' : '') +
      '</div>';
    }

    function brandOptionHtml(key, title, type, hint) {
      var has = !!photoUrl(type);
      var checked = cfg[key] && has;
      return '<label class="oi-opt' + (checked ? ' on' : '') + (has ? '' : ' off') + '">' +
        '<input type="checkbox" data-cfg="' + key + '"' + (checked ? ' checked' : '') + (has ? '' : ' disabled') + '>' +
        '<span><b>' + title + '</b><em>' + (has ? hint : 'Not uploaded yet. Add it in <a href="settings.html">Settings &gt; Profile</a>.') + '</em></span></label>';
    }

    ctx.container.innerHTML =
      '<div class="oi">' +
        '<div class="section-head">' +
          '<h2>Invoice Generator</h2>' +
          '<p>Set what appears on your invoices.</p>' +
        '</div>' +

        '<div class="oi-info"><b>Invoices go out automatically.</b> As soon as a customer\u2019s payment is completed, GLIME creates the invoice and sends it on WhatsApp. ' +
          'You only choose the details below once, and every invoice will use them.</div>' +

        '<div class="card">' +
          '<h3>Details on the invoice</h3>' +
          '<div class="oi-grid">' +
            '<div><label for="oiName">Business name</label><input id="oiName" data-k="business_name" maxlength="120" value="' + esc(cfg.business_name) + '"></div>' +
            '<div><label for="oiPhone">Mobile number</label><input id="oiPhone" data-k="phone" type="tel" inputmode="tel" maxlength="20" placeholder="+91 98765 43210" value="' + esc(cfg.phone) + '"><small>Shown on the invoice so customers can reach you.</small></div>' +
            '<div class="oi-full"><label for="oiInfo">Address and other lines (optional)</label><textarea id="oiInfo" data-k="business_info" maxlength="400">' + esc(cfg.business_info) + '</textarea></div>' +
            '<div><label for="oiGstin">GSTIN (optional)</label><input id="oiGstin" data-k="gstin" maxlength="20" autocapitalize="characters" value="' + esc(cfg.gstin) + '"></div>' +
            '<div><label for="oiGst">GST %</label><input id="oiGst" data-k="gst_percent" type="number" min="0" max="100" step="any" inputmode="decimal" value="' + esc(String(cfg.gst_percent)) + '"></div>' +
            '<div><label for="oiPrefix">Invoice number prefix</label><input id="oiPrefix" data-k="invoice_prefix" maxlength="10" value="' + esc(cfg.invoice_prefix) + '"><small>For example INV gives INV-0001.</small></div>' +
            '<div class="oi-full"><label for="oiNotes">Notes / payment terms (optional)</label><textarea id="oiNotes" data-k="notes" maxlength="400">' + esc(cfg.notes) + '</textarea></div>' +
          '</div>' +
          brandOptionHtml('use_logo', 'Use my business logo on the invoice', 'business', 'Your logo from Settings &gt; Profile appears on every invoice.') +
          brandOptionHtml('use_owner_photo', 'Use my profile picture on the invoice', 'owner', 'Your photo from Settings &gt; Profile appears on every invoice.') +
          '<div class="oi-actions">' +
            '<button type="button" class="btn primary" id="oiSave">Save invoice settings</button>' +
            '<span class="oi-note" id="oiNote" role="status"></span>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<h3>Preview</h3>' +
          '<p class="oi-sub">This is a sample. Real invoices use the details of each order.</p>' +
          '<div id="oiPaper"></div>' +
        '</div>' +
      '</div>';

    var root = ctx.container.querySelector('.oi');
    var paperBox = root.querySelector('#oiPaper');
    var noteBox = root.querySelector('#oiNote');
    var saveBtn = root.querySelector('#oiSave');

    function refresh() { paperBox.innerHTML = paperHtml(); }

    function setNote(text, kind) {
      noteBox.textContent = text || '';
      noteBox.className = 'oi-note' + (kind ? ' ' + kind : '');
    }

    root.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-k');
      if (!k) return;
      if (k === 'gst_percent') {
        var n = parseFloat(e.target.value);
        cfg.gst_percent = isFinite(n) ? n : 0;
      } else if (k === 'invoice_prefix') {
        var v = e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 10);
        if (e.target.value !== v) e.target.value = v;
        cfg.invoice_prefix = v;
      } else {
        cfg[k] = e.target.value;
      }
      setNote('');
      refresh();
    });

    root.addEventListener('change', function (e) {
      var key = e.target.getAttribute('data-cfg');
      if (!key) return;
      cfg[key] = !!e.target.checked;
      e.target.closest('.oi-opt').classList.toggle('on', e.target.checked);
      setNote('');
      refresh();
    });

    saveBtn.onclick = async function () {
      var gst = parseFloat(cfg.gst_percent);
      if (!isFinite(gst) || gst < 0 || gst > 100) {
        setNote('GST % must be between 0 and 100.', 'err');
        return;
      }
      if (String(cfg.phone).trim() && !/^\+?[0-9 ()-]{7,20}$/.test(String(cfg.phone).trim())) {
        setNote('Please enter a valid mobile number.', 'err');
        return;
      }

      var payload = {
        business_name: String(cfg.business_name).trim(),
        business_info: String(cfg.business_info).trim(),
        gstin: String(cfg.gstin).trim().toUpperCase(),
        phone: String(cfg.phone).trim(),
        gst_percent: gst,
        invoice_prefix: String(cfg.invoice_prefix).trim(),
        notes: String(cfg.notes).trim(),
        use_logo: !!cfg.use_logo && !!photoUrl('business'),
        use_owner_photo: !!cfg.use_owner_photo && !!photoUrl('owner')
      };

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      setNote('');
      try { localStorage.setItem(LS_KEY + clientId, JSON.stringify(payload)); } catch (e) { /* ignore */ }
      try {
        var r = await sb.rpc('client_save_invoice_settings', { p_settings: payload });
        if (r.error) throw r.error;
        setNote('Saved. Your next invoices will use these details.', 'ok');
        ctx.ui.toast('Invoice settings saved');
      } catch (err) {
        setNote(isMissingFn(err)
          ? 'Saved on this device. It will apply to your WhatsApp invoices once invoice settings are switched on for your account.'
          : ((err && err.message) || 'Could not save. Please try again.'), isMissingFn(err) ? '' : 'err');
      }
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save invoice settings';
    };

    refresh();
  }

  window.GLIME_OTHERS.register({
    id: 'invoices',
    label: 'Invoice Generator',
    order: 20,
    render: renderInvoices
  });
})();
