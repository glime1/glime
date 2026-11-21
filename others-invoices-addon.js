/* =========================================================
   GLIME OTHERS > INVOICE GENERATOR  (details for the automatic invoice)
   ---------------------------------------------------------
   Deep link: others.html#invoices

   How invoices work in GLIME (already built in the backend)
   - When a customer's payment is completed, the Edge Function
     glime-razorpay-commerce-webhook sends the customer a WhatsApp
     message and then an invoice PDF built by order-pdf.ts.
   - The PDF header is read from:
       table client_profile_details (columns)
         business_display_name, contact_phone, contact_email,
         address_line1, address_line2, city, state, postal_code, website
         (falls back to client_data: business_name, phone, email)
       logo: profile_media, entity_type "business" (Settings > Profile)
   - This tab edits exactly those columns and shows a preview that
     follows the PDF layout. Nothing else is stored here.
   - The logo is not a setting: it appears automatically on every
     invoice once it is uploaded in Settings > Profile.

   Invoice number (set by the system, the client cannot change it)
     {CLIENT_ID}-{YYYYMMDD}        for example GLM-0006-20261121
   The preview shows it read-only. The PDF generator and the numbering
   are backend work (see the note in the page and in the reply).

   BACKEND CONTRACT for saving (frontend is ready):
   The client can only READ client_profile_details (RLS has a SELECT
   policy only), so saving needs one function:
     rpc client_save_invoice_profile(p_details jsonb)  returns jsonb
   - client_id comes from auth.uid() (client_data.auth_user_id), never
     from the browser
   - upserts client_profile_details for that client and sets
     updated_at / updated_by
   - p_details keys (all text, trimmed; empty string = clear the value):
       business_display_name, contact_phone, contact_email,
       address_line1, address_line2, city, state, postal_code, website
   Until it exists the page says saving is not switched on yet.
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  var STYLE_ID = 'othInvStyle';

  var COLS = ['business_display_name', 'contact_phone', 'contact_email', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'website'];

  var PAPER_CSS =
    '.oi-paper{background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;padding:26px;border-radius:12px}' +
    '.oi-paper *{box-sizing:border-box}' +
    '.oi-paper .p-head{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;border-bottom:1px solid #dbdfe6;padding-bottom:14px;margin-bottom:16px}' +
    '.oi-paper .p-brandrow{display:flex;align-items:flex-start;gap:12px}' +
    '.oi-paper .p-logo{width:56px;height:56px;object-fit:contain;flex:none}' +
    '.oi-paper .p-brand{font-size:18px;font-weight:800;color:#1c2130}' +
    '.oi-paper .p-muted{color:#667085;font-size:12px}' +
    '.oi-paper .p-title{text-align:right}' +
    '.oi-paper .p-title b{display:block;font-size:16px;letter-spacing:.06em;color:#1c2130}' +
    '.oi-paper .p-badge{display:inline-block;margin-top:8px;border:1px solid #0d8c54;color:#0d8c54;font-weight:800;font-size:11px;padding:2px 12px}' +
    '.oi-paper .p-lbl{font-size:10px;font-weight:800;letter-spacing:.12em;color:#667085;margin-bottom:4px}' +
    '.oi-paper .p-two{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:16px}' +
    '.oi-paper .p-two>div{flex:1 1 220px;min-width:0}' +
    '.oi-paper .p-kv{display:flex;gap:10px;font-size:12px;margin-bottom:2px}' +
    '.oi-paper .p-kv span{color:#667085;min-width:92px}' +
    '.oi-paper .p-kv b{word-break:break-all}' +
    '.oi-paper .p-wrap{overflow-x:auto}' +
    '.oi-paper table{width:100%;border-collapse:collapse;margin-bottom:12px;min-width:420px}' +
    '.oi-paper th{background:#f2f4f8;color:#667085;text-align:left;font-size:10px;letter-spacing:.08em;padding:8px 9px}' +
    '.oi-paper td{padding:8px 9px;border-bottom:1px solid #e5e7eb;vertical-align:top}' +
    '.oi-paper .r{text-align:right}' +
    '.oi-paper .p-tot{margin-left:auto;width:100%;max-width:290px}' +
    '.oi-paper .p-tot div{display:flex;justify-content:space-between;padding:4px 0;color:#667085}' +
    '.oi-paper .p-tot .g{border-top:1px solid #dbdfe6;margin-top:5px;padding-top:8px;font-size:14px;font-weight:800;color:#1c2130}' +
    '.oi-paper .p-foot{display:flex;justify-content:space-between;margin-top:22px;padding-top:10px;border-top:1px solid #dbdfe6;color:#667085;font-size:11px}' +
    '.oi-paper .p-glime{text-align:center;margin-top:12px;padding:8px 0;border-top:1px solid #d3dedc;border-bottom:1px solid #d3dedc;color:#667085;font-size:11px}' +
    '.oi-paper .p-glime b{display:block;color:#0f8f87;font-size:13px;margin-top:2px}';

  var PAGE_CSS =
    '.oi .oi-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
    '.oi .oi-full{grid-column:1/-1}' +
    '.oi label{display:block;font-size:.72rem;font-weight:800;color:var(--mu);margin-bottom:5px}' +
    '.oi input{width:100%;background:transparent;color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:11px 12px;font:inherit;font-size:.86rem}' +
    '.oi input:focus{outline:2px solid rgba(14,116,144,.45);outline-offset:1px}' +
    '.oi small{display:block;color:var(--mu);font-size:.7rem;margin-top:4px}' +
    '.oi h3{font-size:1.02rem;margin:0 0 12px}' +
    '.oi .oi-sub{color:var(--mu);font-size:.78rem;margin:-6px 0 12px}' +
    '.oi .oi-info{border:1px solid var(--bd);border-radius:14px;padding:13px 14px;margin-bottom:15px;font-size:.8rem;color:var(--mu);background:var(--surf)}' +
    '.oi .oi-info b{color:var(--tx)}' +
    '.oi .oi-info code{font-family:inherit;font-weight:800;color:var(--tx)}' +
    '.oi .oi-logo{display:flex;gap:12px;align-items:center;border:1px solid var(--bd);border-radius:12px;padding:12px;margin-top:14px;font-size:.82rem}' +
    '.oi .oi-logo em{display:block;font-style:normal;font-size:.74rem;color:var(--mu);margin-top:2px}' +
    '.oi .oi-logo a{color:inherit;text-decoration:underline}' +
    '.oi .oi-dot{flex:none;width:10px;height:10px;border-radius:50%;background:#19e68c}' +
    '.oi .oi-dot.off{background:#9aa5b1}' +
    '.oi .oi-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}' +
    '.oi .oi-note{font-size:.76rem;color:var(--mu);min-height:1em}' +
    '.oi .oi-note.ok{color:var(--gr)}.oi .oi-note.err{color:var(--rd)}' +
    'html[data-theme="light"] .oi .oi-note.ok{color:#047857}' +
    'html[data-theme="light"] .oi .oi-note.err{color:#c62828}' +
    '@media(max-width:760px){' +
      '.oi .oi-grid{grid-template-columns:1fr}' +
      '.oi input{font-size:16px}' +
      '.oi .oi-paper{padding:18px}' +
    '}';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = PAGE_CSS + PAPER_CSS;
    document.head.appendChild(s);
  }

  function money(n) {
    return 'Rs. ' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function yyyymmdd() {
    var d = new Date();
    return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  }

  function prettyToday() {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function isMissingFn(err) {
    var m = String((err && err.message) || '');
    return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist|schema cache/i.test(m));
  }

  function t(v) { return String(v == null ? '' : v).trim(); }

  async function renderInvoices(ctx) {
    injectStyle();

    var esc = ctx.ui.escapeHtml;
    var sb = ctx.api.supabase;
    var client = ctx.state.client || {};
    var clientId = client.client_id || '';

    /* shared photo system (loaded by the app shell): used only to show the logo in the preview */
    var Photo = window.GlimePhoto || null;
    if (Photo) { try { await Photo.ready(); } catch (e) { /* ignore */ } }

    /* current values: the same sources the invoice PDF reads */
    var cpd = {}, cd = {};
    try {
      var r1 = await sb.from('client_profile_details').select(COLS.join(',')).eq('client_id', clientId).maybeSingle();
      if (!r1.error && r1.data) cpd = r1.data;
    } catch (e) { /* ignore */ }
    try {
      var r2 = await sb.from('client_data').select('business_name,project_name,client_name,phone,email').eq('client_id', clientId).maybeSingle();
      if (!r2.error && r2.data) cd = r2.data;
    } catch (e) { /* ignore */ }

    var v = {};
    COLS.forEach(function (k) { v[k] = t(cpd[k]); });
    if (!v.business_display_name) v.business_display_name = t(cd.business_name) || t(cd.project_name) || t(cd.client_name) || t(client.business_name) || t(client.name);
    if (!v.contact_phone) v.contact_phone = t(cd.phone);
    if (!v.contact_email) v.contact_email = t(cd.email);

    function logoUrl() {
      if (!Photo || !clientId) return null;
      try { return Photo.url('business', clientId) || null; } catch (e) { return null; }
    }

    function nl(x) { return esc(x); }

    function paperHtml() {
      var logo = logoUrl();
      var addr = [v.address_line1, v.address_line2, v.city, v.state, v.postal_code].map(t).filter(Boolean).join(', ');
      var contact = [v.contact_phone, v.contact_email].map(t).filter(Boolean).join('  |  ');
      var invNo = clientId ? clientId + '-' + yyyymmdd() : '';

      return '<div class="oi-paper">' +
        '<div class="p-head">' +
          '<div class="p-brandrow">' +
            (logo ? '<img class="p-logo" src="' + esc(logo) + '" alt="" referrerpolicy="no-referrer">' : '') +
            '<div><div class="p-brand">' + (nl(v.business_display_name) || 'Your business') + '</div>' +
            (addr ? '<div class="p-muted">' + nl(addr) + '</div>' : '') +
            (contact ? '<div class="p-muted">' + nl(contact) + '</div>' : '') +
            (t(v.website) ? '<div class="p-muted">' + nl(v.website) + '</div>' : '') +
            '</div></div>' +
          '<div class="p-title"><b>INVOICE</b><span class="p-badge">PAID</span></div>' +
        '</div>' +
        '<div class="p-two">' +
          '<div><div class="p-lbl">INVOICE DETAILS</div>' +
            '<div class="p-kv"><span>Invoice no.</span><b>' + esc(invNo) + '</b></div>' +
            '<div class="p-kv"><span>Order no.</span><b>GLM-1A2B3C4D5E</b></div>' +
            '<div class="p-kv"><span>Order date</span><b>' + esc(prettyToday()) + '</b></div>' +
            '<div class="p-kv"><span>Paid on</span><b>' + esc(prettyToday()) + '</b></div>' +
            '<div class="p-kv"><span>Payment method</span><b>UPI</b></div></div>' +
          '<div><div class="p-lbl">DELIVER TO</div>' +
            '<div><b>Sample Customer</b></div>' +
            '<div class="p-muted">+91 98765 43210</div>' +
            '<div class="p-muted">Sample address, City, State, 000000</div></div>' +
        '</div>' +
        '<div class="p-wrap"><table><thead><tr><th>ITEM</th><th class="r">QTY</th><th class="r">PRICE</th><th class="r">AMOUNT</th></tr></thead>' +
          '<tbody><tr><td><b>Sample product</b></td><td class="r">2</td><td class="r">' + money(500) + '</td><td class="r"><b>' + money(1000) + '</b></td></tr></tbody></table></div>' +
        '<div class="p-tot"><div><span>Subtotal</span><span>' + money(1000) + '</span></div>' +
          '<div class="g"><span>Total</span><span>' + money(1000) + '</span></div>' +
          '<div><span>Amount paid</span><span>' + money(1000) + '</span></div></div>' +
        '<div class="p-foot"><span>Thank you for your order!</span><span>Page 1 of 1</span></div>' +
        '<div class="p-glime">This is a computer-generated invoice issued by GLIME billing.<b>glime.online</b></div>' +
      '</div>';
    }

    var hasLogo = !!logoUrl();

    ctx.container.innerHTML =
      '<div class="oi">' +
        '<div class="section-head">' +
          '<h2>Invoice Generator</h2>' +
          '<p>Set the details that appear on your invoices.</p>' +
        '</div>' +

        '<div class="oi-info"><b>Invoices go out automatically.</b> As soon as a customer\u2019s payment is completed, GLIME sends the invoice PDF on WhatsApp. ' +
          'You only keep the details below up to date.<br><br>' +
          '<b>Invoice number</b> is set by GLIME: your client ID and the date, for example <code>' + esc((clientId || 'GLM-0000') + '-' + yyyymmdd()) + '</code>. It cannot be changed, and it always shows which business an order belongs to.</div>' +

        '<div class="card">' +
          '<h3>Details on the invoice</h3>' +
          '<div class="oi-grid">' +
            '<div class="oi-full"><label for="oiName">Business name</label><input id="oiName" data-k="business_display_name" maxlength="120" value="' + esc(v.business_display_name) + '"></div>' +
            '<div><label for="oiPhone">Mobile number</label><input id="oiPhone" data-k="contact_phone" type="tel" inputmode="tel" maxlength="20" placeholder="+91 98765 43210" value="' + esc(v.contact_phone) + '"></div>' +
            '<div><label for="oiEmail">Email</label><input id="oiEmail" data-k="contact_email" type="email" inputmode="email" maxlength="120" value="' + esc(v.contact_email) + '"></div>' +
            '<div class="oi-full"><label for="oiA1">Address line 1</label><input id="oiA1" data-k="address_line1" maxlength="160" value="' + esc(v.address_line1) + '"></div>' +
            '<div class="oi-full"><label for="oiA2">Address line 2 (optional)</label><input id="oiA2" data-k="address_line2" maxlength="160" value="' + esc(v.address_line2) + '"></div>' +
            '<div><label for="oiCity">City</label><input id="oiCity" data-k="city" maxlength="80" value="' + esc(v.city) + '"></div>' +
            '<div><label for="oiState">State</label><input id="oiState" data-k="state" maxlength="80" value="' + esc(v.state) + '"></div>' +
            '<div><label for="oiPin">PIN / postal code</label><input id="oiPin" data-k="postal_code" maxlength="10" inputmode="text" value="' + esc(v.postal_code) + '"></div>' +
            '<div><label for="oiWeb">Website (optional)</label><input id="oiWeb" data-k="website" type="url" inputmode="url" maxlength="200" placeholder="https://" value="' + esc(v.website) + '"></div>' +
          '</div>' +
          '<div class="oi-logo"><span class="oi-dot' + (hasLogo ? '' : ' off') + '"></span><div>' +
            '<b>' + (hasLogo ? 'Your business logo is on every invoice' : 'No business logo yet') + '</b>' +
            '<em>' + (hasLogo ? 'Change it any time in <a href="settings.html">Settings &gt; Profile</a>.' : 'Upload it in <a href="settings.html">Settings &gt; Profile</a> and it will appear on every invoice automatically.') + '</em>' +
          '</div></div>' +
          '<div class="oi-actions">' +
            '<button type="button" class="btn primary" id="oiSave">Save invoice details</button>' +
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
      v[k] = e.target.value;
      setNote('');
      refresh();
    });

    saveBtn.onclick = async function () {
      var payload = {};
      COLS.forEach(function (k) { payload[k] = t(v[k]); });

      if (payload.contact_phone && !/^\+?[0-9 ()-]{7,20}$/.test(payload.contact_phone)) {
        setNote('Please enter a valid mobile number.', 'err'); return;
      }
      if (payload.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contact_email)) {
        setNote('Please enter a valid email address.', 'err'); return;
      }
      if (payload.postal_code && !/^[A-Za-z0-9 -]{3,10}$/.test(payload.postal_code)) {
        setNote('Please enter a valid PIN / postal code.', 'err'); return;
      }
      if (payload.website && !/^https?:\/\//i.test(payload.website)) {
        payload.website = 'https://' + payload.website;
        v.website = payload.website;
        root.querySelector('#oiWeb').value = payload.website;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      setNote('');
      try {
        var r = await sb.rpc('client_save_invoice_profile', { p_details: payload });
        if (r.error) throw r.error;
        setNote('Saved. Your next invoices will use these details.', 'ok');
        ctx.ui.toast('Invoice details saved');
        refresh();
      } catch (err) {
        setNote(isMissingFn(err)
          ? 'Saving is not switched on for your account yet, so nothing was changed.'
          : ((err && err.message) || 'Could not save. Please try again.'), 'err');
      }
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save invoice details';
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
