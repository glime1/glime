(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  var APK_URL = 'https://github.com/glime1/glime-companion/releases/latest/download/glime-companion.apk';

  var ERRORS = {
    UPI_LOCKED: 'This feature is locked. Only the GLIME admin can enable it.',
    INVALID_UPI_ID: 'Please enter a valid UPI ID (for example name@bank).'
  };

  function errText(e) {
    var m = String((e && e.message) || e || '');
    for (var k in ERRORS) if (m.indexOf(k) !== -1) return ERRORS[k];
    return 'Something went wrong. Please try again.';
  }

  window.GLIME_OTHERS.register({
    id: 'upi',
    label: 'UPI Payments',
    order: 60,
    render: async function (ctx) {
      var container = ctx.container, api = ctx.api, ui = ctx.ui, esc = ui.escapeHtml;
      var sb = api.supabase;

      async function load() {
        var r = await sb.rpc('get_my_upi_settings');
        if (r.error) throw r.error;
        return r.data || {};
      }

      function draw(s, newToken) {
        if (!s.unlocked) {
          container.innerHTML =
            '<div class="card" style="padding:16px">' +
            '<h3 style="margin:0 0 8px">UPI Payments 🔒</h3>' +
            '<p>Direct UPI payments (money goes straight to your bank account) are locked. ' +
            'Only the GLIME admin can enable this for your account. Please contact GLIME support.</p></div>';
          return;
        }
        var fee = Number(s.fee_percent || 0);
        var bal = Number(s.wallet_balance || 0).toFixed(2);
        var seen = s.device_last_seen_at ? new Date(s.device_last_seen_at).toLocaleString() : 'Never';
        container.innerHTML =
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
          '<h4 style="margin:0">GLIME Companion app (Android)</h4>' +
          '<p style="margin:0">Install the Companion app on the phone that receives your bank SMS / UPI alerts, then paste the device token there. Last seen: ' + esc(seen) + '.</p>' +
          '<a id="upiApk" class="btn" href="' + APK_URL + '" download style="text-align:center;text-decoration:none">Download Companion app (APK)</a>' +
          '<p style="margin:0;font-size:13px;opacity:.8">If Google Play Protect shows "App blocked", open Play Store → profile → Play Protect → settings and turn off "Scan apps with Play Protect", install the app, then turn it back on.</p>' +
          (newToken
            ? '<div><p style="margin:0 0 6px"><b>Copy this token now. It will not be shown again.</b></p><input id="upiTok" readonly style="width:100%" value="' + esc(newToken) + '"><button id="upiCopy" class="btn" style="margin-top:6px">Copy token</button></div>'
            : '') +
          '<button id="upiRotate" class="btn">' + (s.token_set ? 'Generate a new token' : 'Generate device token') + '</button>' +
          '</div>';

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
      }

      try { draw(await load()); }
      catch (e) { container.innerHTML = '<p>Could not load UPI settings.</p>'; }
    }
  });
})();
