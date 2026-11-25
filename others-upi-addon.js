(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  var APK_URL = 'https://github.com/glime1/glime-companion/releases/latest/download/glime-companion.apk';
  var PAYMENTS_FILE = 'settings-payments-addon.js';

  var ERRORS = {
    UPI_LOCKED: 'This feature is locked. Only the GLIME admin can enable it.',
    INVALID_UPI_ID: 'Please enter a valid UPI ID (for example name@bank).'
  };

  function errText(e) {
    var m = String((e && e.message) || e || '');
    for (var k in ERRORS) if (m.indexOf(k) !== -1) return ERRORS[k];
    return 'Something went wrong. Please try again.';
  }

  /* GLIME Payments (its code lives in settings-payments-addon.js) now shows inside this tab.
     That file registers itself through window.GLIME_SETTINGS, so a small stand-in captures
     its module here and hands it to this page. */
  function loadPaymentsModule(ctx) {
    return new Promise(function (resolve, reject) {
      if (window.GLIME_PAYMENTS_MODULE) return resolve(window.GLIME_PAYMENTS_MODULE);
      var prev = window.GLIME_SETTINGS;
      window.GLIME_SETTINGS = {
        register: function (m) { window.GLIME_PAYMENTS_MODULE = m; },
        ui: ctx.ui,
        state: ctx.state,
        api: ctx.api
      };
      var s = document.createElement('script');
      s.src = PAYMENTS_FILE;
      s.onload = function () {
        window.GLIME_SETTINGS = prev;
        if (window.GLIME_PAYMENTS_MODULE) resolve(window.GLIME_PAYMENTS_MODULE);
        else reject(new Error('GLIME Payments could not start'));
      };
      s.onerror = function () {
        window.GLIME_SETTINGS = prev;
        reject(new Error('Could not load GLIME Payments'));
      };
      document.head.appendChild(s);
    });
  }

  /* Settings-page classes that GLIME Payments uses, scoped so they only apply inside this tab. */
  function injectPaymentsCss() {
    if (document.getElementById('gpay-others-css')) return;
    var st = document.createElement('style');
    st.id = 'gpay-others-css';
    st.textContent =
      '.gpay-root .channel-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:18px;margin-bottom:15px}' +
      '.gpay-root .channel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}' +
      '.gpay-root .channel-name{display:flex;align-items:center;gap:9px;font-size:1.02rem;font-weight:800}' +
      '.gpay-root .badge{font-size:.66rem;font-weight:800;padding:4px 9px;border-radius:99px;border:1px solid var(--bd);color:var(--mu)}' +
      '.gpay-root .badge.on{color:var(--gr);border-color:rgba(80,245,168,.38)}' +
      '.gpay-root .badge.off{color:var(--rd);border-color:rgba(255,130,145,.32)}' +
      '.gpay-root .row-info{min-width:0}' +
      '.gpay-root .row-info b{display:block;font-size:.82rem}' +
      '.gpay-root .row-info small{display:block;color:var(--mu);font-size:.71rem;line-height:1.45;margin-top:2px}' +
      '.gpay-root .actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}' +
      '.gpay-root .note{color:var(--mu);font-size:.7rem;margin-top:9px}';
    document.head.appendChild(st);
  }

  window.GLIME_OTHERS.register({
    id: 'upi',
    label: 'UPI Payments',
    order: 60,
    render: async function (ctx) {
      var container = ctx.container, api = ctx.api, ui = ctx.ui, esc = ui.escapeHtml;
      var sb = api.supabase;
      var agreed = false;
      var paymentsStarted = false;

      container.innerHTML = '<div id="upiBox"></div><div id="gpaySec" class="gpay-root" style="margin-top:22px"></div>';
      var box = container.querySelector('#upiBox');
      var sec = container.querySelector('#gpaySec');

      /* Buttons inside GLIME Payments that pointed at Settings tabs */
      sec.addEventListener('click', function (e) {
        var el = e.target.closest('[data-act]');
        if (!el) return;
        if (el.dataset.act === 'goto-connector') {
          e.stopPropagation();
          location.href = 'settings.html#connector';
          return;
        }
        if (el.dataset.act === 'cancel-gate') {
          setTimeout(function () {
            if (sec.querySelector('#gpayTermsBox')) {
              var b = document.querySelector('.oth .nav [data-module]:not([data-module="upi"])');
              if (b) b.click();
            }
          }, 250);
        }
      }, true);

      function startPayments() {
        if (paymentsStarted) return;
        paymentsStarted = true;
        injectPaymentsCss();
        sec.innerHTML = '<div class="loading">Loading GLIME Payments…</div>';
        loadPaymentsModule(ctx).then(function (m) {
          return m.render({ container: sec, api: api, state: ctx.state, ui: ui });
        }).catch(function (err) {
          console.error('GLIME Payments load error:', err);
          sec.innerHTML = '<div class="error">Could not load GLIME Payments. Please refresh the page.</div>';
        });
      }

      async function load() {
        var r = await sb.rpc('get_my_upi_settings');
        if (r.error) throw r.error;
        return r.data || {};
      }

      function draw(s, newToken) {
        if (!s.unlocked) {
          box.innerHTML =
            '<div class="card" style="padding:16px">' +
            '<h3 style="margin:0 0 8px">UPI Payments 🔒</h3>' +
            '<p>Direct UPI payments (money goes straight to your bank account) are locked. ' +
            'Only the GLIME admin can enable this for your account. Please contact GLIME support.</p></div>';
          return;
        }
        var fee = Number(s.fee_percent || 0);
        var bal = Number(s.wallet_balance || 0).toFixed(2);
        var seen = s.device_last_seen_at ? new Date(s.device_last_seen_at).toLocaleString() : 'Never';
        box.innerHTML =
          '<div class="card" style="padding:16px;display:grid;gap:12px;max-width:560px">' +
          '<h3 style="margin:0">UPI Payments</h3>' +
          '<p style="margin:0">Customers pay directly to your UPI ID. GLIME never holds your money. ' +
          'A fee of ' + esc(String(fee)) + '% is deducted from your GLIME wallet for each payment GLIME detects. ' +
          'Wallet balance: ₹' + esc(bal) + '. If the wallet is too low, payment links are not sent and you get a notification.</p>' +
          '<label>UPI ID<input id="upiId" type="text" autocomplete="off" value="' + esc(s.upi_id || '') + '" placeholder="name@bank" style="width:100%"></label>' +
          '<label>Payee name<input id="upiPayee" type="text" value="' + esc(s.payee_name || '') + '" style="width:100%"></label>' +
          '<label style="display:flex;gap:8px;align-items:center"><input id="upiEnabled" type="checkbox"' + (s.enabled ? ' checked' : '') + '> Enable direct UPI payments</label>' +
          '<button id="upiSave" class="btn">Save</button>' +
          '<hr>' +
          '<h4 style="margin:0">GLIME UPI Pay (Android)</h4>' +
          '<p style="margin:0">Install GLIME UPI Pay on the phone that receives your bank SMS / UPI alerts, then paste the device token there. Last seen: ' + esc(seen) + '.</p>' +
          '<label style="display:flex;gap:8px;align-items:flex-start"><input id="upiAgree" type="checkbox" style="margin-top:3px"' + (agreed ? ' checked' : '') + '> <span>I understand that GLIME UPI Pay is used only to verify my customers’ payments.</span></label>' +
          '<a id="upiApk" class="btn" style="text-align:center;text-decoration:none">Download GLIME UPI Pay</a>' +
          '<p style="margin:0;font-size:13px;opacity:.8">If Google Play Protect shows "App blocked", open Play Store → profile → Play Protect → settings and turn off "Scan apps with Play Protect", install the app, then turn it back on.</p>' +
          (newToken
            ? '<div><p style="margin:0 0 6px"><b>Copy this token now. It will not be shown again.</b></p><input id="upiTok" readonly style="width:100%" value="' + esc(newToken) + '"><button id="upiCopy" class="btn" style="margin-top:6px">Copy token</button></div>'
            : '') +
          '<button id="upiRotate" class="btn">' + (s.token_set ? 'Generate a new token' : 'Generate device token') + '</button>' +
          '</div>';

        var agree = container.querySelector('#upiAgree');
        var dl = container.querySelector('#upiApk');
        function syncDownload() {
          agreed = agree.checked;
          if (agreed) {
            dl.setAttribute('href', APK_URL);
            dl.setAttribute('download', '');
            dl.style.opacity = '';
            dl.style.pointerEvents = '';
            dl.removeAttribute('aria-disabled');
          } else {
            dl.removeAttribute('href');
            dl.removeAttribute('download');
            dl.style.opacity = '.45';
            dl.style.pointerEvents = 'none';
            dl.setAttribute('aria-disabled', 'true');
          }
        }
        agree.onchange = syncDownload;
        syncDownload();

        container.querySelector('#upiSave').onclick = async function () {
          var r = await sb.rpc('save_my_upi_settings', {
            p_upi_id: container.querySelector('#upiId').value.trim(),
            p_payee_name: container.querySelector('#upiPayee').value.trim(),
            p_enabled: container.querySelector('#upiEnabled').checked
          });
          if (r.error) return ui.toast(errText(r.error));
          ui.toast('Saved');
          draw(await load());
        };
        container.querySelector('#upiRotate').onclick = async function () {
          if (s.token_set && !(await ui.confirm('A new token will stop the old one from working. Continue?'))) return;
          var r = await sb.rpc('rotate_my_upi_device_token');
          if (r.error) return ui.toast(errText(r.error));
          draw(await load(), r.data);
        };
        var cp = container.querySelector('#upiCopy');
        if (cp) cp.onclick = function () {
          var t = container.querySelector('#upiTok');
          t.select();
          try { navigator.clipboard.writeText(t.value); ui.toast('Copied'); } catch (e) { document.execCommand('copy'); }
        };

        /* UPI is unlocked: show GLIME Payments below (once, so Save does not reset it) */
        startPayments();
      }

      try { draw(await load()); }
      catch (e) { box.innerHTML = '<p>Could not load UPI settings.</p>'; }
    }
  });
})();
