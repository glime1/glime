/* =========================================================
   GLIME OTHERS > INVOICE GENERATOR
   ---------------------------------------------------------
   Adds an "Invoice Generator" section to others.html.

   Deep link: others.html#invoices

   What it does
   - Builds an invoice in the browser and prints / saves it as PDF.
   - Logo / photo: the client can tick "Show my business logo" and/or
     "Show my profile photo". The pictures are the ones already uploaded
     in Settings > Profile (shared photo system, glime-avatar.js). They
     are NOT shown in the options, only inside the invoice preview.
   - WhatsApp invoices: the client chooses
       auto    GLIME creates and sends invoices on WhatsApp automatically
               (how it works today, so this is the default)
       manual  nothing is sent automatically; the client makes each
               invoice here and sends it
     This is saved as a small settings object.

   BACKEND CONTRACT for the saved settings (frontend is ready; until the
   two RPCs exist the choice is kept on this device only and the page
   says so):
     rpc client_get_invoice_settings()  returns jsonb
     rpc client_save_invoice_settings(p_settings jsonb)  returns jsonb
   p_settings shape:
     { "invoice_mode": "auto" | "manual",
       "use_logo": boolean,
       "use_owner_photo": boolean }
   Both run as the signed-in client (client_id from auth.uid()). The
   WhatsApp invoice job should skip automatic sending when
   invoice_mode = "manual". The invoice itself is not stored anywhere.
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
    '.oi h3{font-size:1.02rem;margin:0 0 12px}' +
    '.oi .oi-sub{color:var(--mu);font-size:.78rem;margin:-6px 0 6px}' +
    '.oi label.oi-opt{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--bd);border-radius:12px;padding:12px;margin:10px 0 0;cursor:pointer;color:var(--tx);font-weight:400;font-size:.86rem}' +
    '.oi label.oi-opt.on{border-color:rgba(14,116,144,.6);background:rgba(14,116,144,.08)}' +
    '.oi label.oi-opt.off{opacity:.6;cursor:default}' +
    '.oi .oi-opt input{width:20px;height:20px;flex:none;padding:0;margin:2px 0 0;accent-color:#0e7490}' +
    '.oi .oi-opt b{display:block;font-size:.88rem;font-weight:800}' +
    '.oi .oi-opt em{display:block;font-style:normal;font-size:.74rem;color:var(--mu);margin-top:2px}' +
    '.oi .oi-opt em a{color:inherit;text-decoration:underline}' +
    '.oi .oi-note{font-size:.74rem;color:var(--mu);margin-top:10px;min-height:1em}' +
    '.oi .oi-note.ok{color:var(--gr)}' +
    'html[data-theme="light"] .oi .oi-note.ok{color:#047857}' +
    '.oi .oi-row{display:grid;grid-template-columns:1fr 70px 110px 110px 38px;gap:8px;align-items:center;margin-bottom:9px}' +
    '.oi .oi-amt{font-size:.84rem;font-weight:800;text-align:right;padding-right:4px}' +
    '.oi .oi-x{width:38px;height:38px;padding:0;display:inline-flex;align-items:center;justify-content:center}' +
    '.oi .oi-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}' +
    '.oi .oi-sum{margin-left:auto;max-width:320px;font-size:.84rem}' +
    '.oi .oi-sum div{display:flex;justify-content:space-between;padding:4px 0;color:var(--mu)}' +
    '.oi .oi-sum .g{color:var(--tx);font-weight:800;font-size:1rem;border-top:1px solid var(--bd);margin-top:5px;padding-top:9px}' +
    '@media(max-width:760px){' +
      '.oi .oi-grid{grid-template-columns:1fr}' +
      '.oi input,.oi textarea{font-size:16px}' +
      '.oi .oi-row{grid-template-columns:1fr 1fr 38px}' +
      '.oi .oi-row .oi-d{grid-column:1/-1}' +
      '.oi .oi-amt{text-align:left}' +
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

  function todayStr() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function prettyDate(v) {
    if (!v) return '';
    var d = new Date(v + 'T00:00:00');
    if (isNaN(d.getTime())) return v;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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
    var today = todayStr();

    /* shared photo system (loaded by the app shell) */
    var Photo = window.GlimePhoto || null;
    if (Photo) { try { await Photo.ready(); } catch (e) { /* ignore */ } }

    var cfg = { invoice_mode: 'auto', use_logo: false, use_owner_photo: false };

    function readLocal() {
      try { return JSON.parse(localStorage.getItem(LS_KEY + clientId) || 'null'); } catch (e) { return null; }
    }

    function mergeCfg(src) {
      if (!src || typeof src !== 'object') return;
      if (src.invoice_mode === 'auto' || src.invoice_mode === 'manual') cfg.invoice_mode = src.invoice_mode;
      if (typeof src.use_logo === 'boolean') cfg.use_logo = src.use_logo;
      if (typeof src.use_owner_photo === 'boolean') cfg.use_owner_photo = src.use_owner_photo;
    }

    mergeCfg(readLocal());
    try {
      var got = await sb.rpc('client_get_invoice_settings');
      if (!got.error) mergeCfg(Array.isArray(got.data) ? got.data[0] : got.data);
    } catch (e) { /* settings RPC not available yet: keep the local copy */ }

    function photoUrl(type) {
      if (!Photo || !clientId) return null;
      try { return Photo.url(type, clientId) || null; } catch (e) { return null; }
    }

    var data = {
      sellerName: client.business_name || client.name || '',
      sellerInfo: '',
      invNo: 'INV-' + today.replace(/-/g, '') + '-001',
      invDate: today,
      dueDate: '',
      custName: '',
      custInfo: '',
      taxPct: 0,
      discount: 0,
      notes: 'Thank you for your business.'
    };
    var items = [{ d: '', q: 1, r: 0 }];

    function nl(v) { return esc(v).replace(/\n/g, '<br>'); }

    function totals() {
      var sub = 0;
      items.forEach(function (it) { sub += num(it.q) * num(it.r); });
      var disc = Math.min(num(data.discount), sub);
      var taxable = sub - disc;
      var tax = taxable * num(data.taxPct) / 100;
      return { sub: sub, disc: disc, tax: tax, total: taxable + tax };
    }

    function brandImages() {
      var h = '';
      var logo = cfg.use_logo ? photoUrl('business') : null;
      var owner = cfg.use_owner_photo ? photoUrl('owner') : null;
      if (logo) h += '<img class="p-logo" src="' + esc(logo) + '" alt="" referrerpolicy="no-referrer">';
      if (owner) h += '<img class="p-photo" src="' + esc(owner) + '" alt="" referrerpolicy="no-referrer">';
      return h;
    }

    function paperHtml() {
      var t = totals();
      var rows = '';
      var n = 0;
      items.forEach(function (it) {
        var amt = num(it.q) * num(it.r);
        if (!String(it.d).trim() && !amt) return;
        n++;
        rows += '<tr><td>' + n + '</td><td>' + nl(it.d) + '</td><td class="r">' + esc(String(num(it.q))) +
          '</td><td class="r">' + money(num(it.r)) + '</td><td class="r">' + money(amt) + '</td></tr>';
      });
      if (!rows) rows = '<tr><td colspan="5" class="p-muted">No items added yet.</td></tr>';

      var tot = '<div><span>Subtotal</span><span>' + money(t.sub) + '</span></div>';
      if (t.disc > 0) tot += '<div><span>Discount</span><span>- ' + money(t.disc) + '</span></div>';
      if (num(data.taxPct) > 0) tot += '<div><span>Tax (' + esc(String(num(data.taxPct))) + '%)</span><span>' + money(t.tax) + '</span></div>';
      tot += '<div class="g"><span>Total</span><span>' + money(t.total) + '</span></div>';

      return '<div class="oi-paper">' +
        '<div class="p-head">' +
          '<div class="p-brandrow">' + brandImages() +
            '<div><div class="p-brand">' + (esc(data.sellerName) || 'Your business') + '</div>' +
            '<div class="p-muted">' + nl(data.sellerInfo) + '</div></div></div>' +
          '<div class="p-title"><b>INVOICE</b>' +
            '<div class="p-muted">No: ' + esc(data.invNo) + '</div>' +
            '<div class="p-muted">Date: ' + esc(prettyDate(data.invDate)) + '</div>' +
            (data.dueDate ? '<div class="p-muted">Due: ' + esc(prettyDate(data.dueDate)) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="p-bill"><div class="p-lbl">BILL TO</div>' +
          '<div><b>' + (esc(data.custName) || '&mdash;') + '</b></div>' +
          '<div class="p-muted">' + nl(data.custInfo) + '</div></div>' +
        '<div class="p-wrap"><table><thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>' +
        '<div class="p-tot">' + tot + '</div>' +
        (String(data.notes).trim() ? '<div class="p-notes"><div class="p-lbl">NOTES</div>' + nl(data.notes) + '</div>' : '') +
      '</div>';
    }

    function itemRowsHtml() {
      return items.map(function (it, i) {
        return '<div class="oi-row" data-i="' + i + '">' +
          '<input class="oi-d" data-f="d" placeholder="Item / service description" value="' + esc(it.d) + '">' +
          '<input data-f="q" type="number" min="0" step="any" inputmode="decimal" placeholder="Qty" value="' + esc(String(it.q)) + '">' +
          '<input data-f="r" type="number" min="0" step="any" inputmode="decimal" placeholder="Rate" value="' + (it.r ? esc(String(it.r)) : '') + '">' +
          '<div class="oi-amt" data-amt>' + money(num(it.q) * num(it.r)) + '</div>' +
          '<button type="button" class="btn danger oi-x" data-del="' + i + '" aria-label="Remove item">&times;</button>' +
        '</div>';
      }).join('');
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
          '<p>Create a clean invoice for your customer and save it as a PDF.</p>' +
        '</div>' +

        '<div class="card">' +
          '<h3>WhatsApp invoices</h3>' +
          '<p class="oi-sub">Choose how invoices reach your customers.</p>' +
          '<label class="oi-opt' + (cfg.invoice_mode === 'auto' ? ' on' : '') + '">' +
            '<input type="radio" name="oiMode" value="auto"' + (cfg.invoice_mode === 'auto' ? ' checked' : '') + '>' +
            '<span><b>Send automatically</b><em>GLIME creates the invoice on WhatsApp and sends it to your customer on its own.</em></span></label>' +
          '<label class="oi-opt' + (cfg.invoice_mode === 'manual' ? ' on' : '') + '">' +
            '<input type="radio" name="oiMode" value="manual"' + (cfg.invoice_mode === 'manual' ? ' checked' : '') + '>' +
            '<span><b>I will create my own invoices</b><em>Nothing is sent automatically. You make each invoice below and send it yourself.</em></span></label>' +
          '<div class="oi-note" id="oiSaveNote" role="status"></div>' +
        '</div>' +

        '<div class="card">' +
          '<h3>Your business</h3>' +
          '<div class="oi-grid">' +
            '<div><label for="oiSeller">Business name</label><input id="oiSeller" data-k="sellerName" value="' + esc(data.sellerName) + '"></div>' +
            '<div><label for="oiNo">Invoice number</label><input id="oiNo" data-k="invNo" value="' + esc(data.invNo) + '"></div>' +
            '<div class="oi-full"><label for="oiSellerInfo">Address, phone, GSTIN (optional)</label><textarea id="oiSellerInfo" data-k="sellerInfo"></textarea></div>' +
            '<div><label for="oiDate">Invoice date</label><input id="oiDate" type="date" data-k="invDate" value="' + esc(data.invDate) + '"></div>' +
            '<div><label for="oiDue">Due date (optional)</label><input id="oiDue" type="date" data-k="dueDate"></div>' +
          '</div>' +
          brandOptionHtml('use_logo', 'Use my business logo on the invoice', 'business', 'Your logo from Settings &gt; Profile appears in the invoice preview.') +
          brandOptionHtml('use_owner_photo', 'Use my profile picture on the invoice', 'owner', 'Your photo from Settings &gt; Profile appears in the invoice preview.') +
        '</div>' +

        '<div class="card">' +
          '<h3>Customer</h3>' +
          '<div class="oi-grid">' +
            '<div><label for="oiCust">Customer name</label><input id="oiCust" data-k="custName" placeholder="Customer or company name"></div>' +
            '<div><label for="oiCustInfo">Address, phone, GSTIN (optional)</label><textarea id="oiCustInfo" data-k="custInfo"></textarea></div>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<h3>Items</h3>' +
          '<div id="oiItems">' + itemRowsHtml() + '</div>' +
          '<div class="oi-actions"><button type="button" class="btn" id="oiAdd">+ Add item</button></div>' +
          '<div class="oi-grid" style="margin-top:16px">' +
            '<div><label for="oiTax">Tax / GST %</label><input id="oiTax" data-k="taxPct" type="number" min="0" step="any" inputmode="decimal" value="0"></div>' +
            '<div><label for="oiDisc">Discount (flat amount)</label><input id="oiDisc" data-k="discount" type="number" min="0" step="any" inputmode="decimal" value="0"></div>' +
            '<div class="oi-full"><label for="oiNotes">Notes / payment terms</label><textarea id="oiNotes" data-k="notes">' + esc(data.notes) + '</textarea></div>' +
          '</div>' +
          '<div class="oi-sum" id="oiSum" style="margin-top:16px"></div>' +
        '</div>' +

        '<div class="card">' +
          '<h3>Preview</h3>' +
          '<div id="oiPaper"></div>' +
          '<div class="oi-actions" style="margin-top:14px">' +
            '<button type="button" class="btn primary" id="oiPrint">Print / Save as PDF</button>' +
            '<button type="button" class="btn" id="oiReset">Start new invoice</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var root = ctx.container.querySelector('.oi');
    var itemsBox = root.querySelector('#oiItems');
    var sumBox = root.querySelector('#oiSum');
    var paperBox = root.querySelector('#oiPaper');
    var noteBox = root.querySelector('#oiSaveNote');

    function refresh() {
      var t = totals();
      var h = '<div><span>Subtotal</span><span>' + money(t.sub) + '</span></div>';
      if (t.disc > 0) h += '<div><span>Discount</span><span>- ' + money(t.disc) + '</span></div>';
      if (num(data.taxPct) > 0) h += '<div><span>Tax</span><span>' + money(t.tax) + '</span></div>';
      h += '<div class="g"><span>Total</span><span>' + money(t.total) + '</span></div>';
      sumBox.innerHTML = h;
      paperBox.innerHTML = paperHtml();
    }

    function setNote(text, ok) {
      noteBox.textContent = text || '';
      noteBox.className = 'oi-note' + (ok ? ' ok' : '');
    }

    var saveSeq = 0;
    async function saveCfg() {
      var mine = ++saveSeq;
      try { localStorage.setItem(LS_KEY + clientId, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
      try {
        var r = await sb.rpc('client_save_invoice_settings', { p_settings: cfg });
        if (r.error) throw r.error;
        if (mine === saveSeq) setNote('Saved.', true);
      } catch (err) {
        if (mine !== saveSeq) return;
        setNote(isMissingFn(err)
          ? 'Saved on this device. It will take effect on WhatsApp once invoice settings are switched on for your account.'
          : ((err && err.message) || 'Could not save this choice. Please try again.'));
      }
    }

    root.addEventListener('input', function (e) {
      var el = e.target;
      var k = el.getAttribute('data-k');
      if (k) {
        data[k] = el.value;
        refresh();
        return;
      }
      var f = el.getAttribute('data-f');
      if (f) {
        var row = el.closest('.oi-row');
        var i = parseInt(row.getAttribute('data-i'), 10);
        items[i][f] = el.value;
        var amtEl = row.querySelector('[data-amt]');
        if (amtEl) amtEl.textContent = money(num(items[i].q) * num(items[i].r));
        refresh();
      }
    });

    root.addEventListener('change', function (e) {
      var el = e.target;
      if (el.name === 'oiMode') {
        cfg.invoice_mode = el.value === 'manual' ? 'manual' : 'auto';
        root.querySelectorAll('input[name="oiMode"]').forEach(function (r) {
          r.closest('.oi-opt').classList.toggle('on', r.checked);
        });
        saveCfg();
        return;
      }
      var key = el.getAttribute('data-cfg');
      if (key) {
        cfg[key] = !!el.checked;
        el.closest('.oi-opt').classList.toggle('on', el.checked);
        refresh();
        saveCfg();
      }
    });

    root.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) {
        var i = parseInt(del.getAttribute('data-del'), 10);
        items.splice(i, 1);
        if (!items.length) items.push({ d: '', q: 1, r: 0 });
        itemsBox.innerHTML = itemRowsHtml();
        refresh();
      }
    });

    root.querySelector('#oiAdd').onclick = function () {
      items.push({ d: '', q: 1, r: 0 });
      itemsBox.innerHTML = itemRowsHtml();
      var inputs = itemsBox.querySelectorAll('.oi-d');
      if (inputs.length) inputs[inputs.length - 1].focus();
      refresh();
    };

    root.querySelector('#oiReset').onclick = async function () {
      var ok = await ctx.ui.confirm('Start a new invoice? Everything entered here will be cleared.');
      if (!ok) return;
      await renderInvoices(ctx);
    };

    root.querySelector('#oiPrint').onclick = function () {
      if (!String(data.custName).trim()) {
        ctx.ui.toast('Please enter the customer name.', true);
        return;
      }
      var hasItem = items.some(function (it) { return String(it.d).trim() && num(it.q) * num(it.r) > 0; });
      if (!hasItem) {
        ctx.ui.toast('Add at least one item with a quantity and rate.', true);
        return;
      }
      var doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc('Invoice ' + data.invNo) +
        '</title><style>body{margin:0;padding:24px;background:#fff}' + PAPER_CSS +
        '.oi-paper{padding:0}@page{margin:14mm}</style></head><body>' + paperHtml() + '</body></html>';
      var frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(frame);
      var fd = frame.contentWindow.document;
      fd.open();
      fd.write(doc);
      fd.close();
      var cleaned = false;
      function clean() {
        if (cleaned) return;
        cleaned = true;
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }
      frame.contentWindow.addEventListener('afterprint', clean);

      /* wait for the logo / photo to load before the print dialog opens */
      var waits = Array.prototype.filter.call(fd.images, function (im) { return !im.complete; }).map(function (im) {
        return new Promise(function (res) { im.onload = im.onerror = res; });
      });
      Promise.race([
        Promise.all(waits),
        new Promise(function (res) { setTimeout(res, 3000); })
      ]).then(function () {
        setTimeout(function () {
          try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
          } catch (err) {
            ctx.ui.toast('Could not open the print dialog.', true);
            clean();
          }
        }, 200);
      });
      setTimeout(clean, 120000);
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
