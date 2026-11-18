/* =========================================================
   GLIME SETTINGS — SECURITY MODULE (TWO-FACTOR AUTHENTICATION)
   ---------------------------------------------------------
   Registers Settings > Security through window.GLIME_SETTINGS.

   What it does:
   - A client can turn on 2FA with any authenticator app
     (QR code or typed setup key + one 6-digit code to confirm).
   - A client can turn 2FA off again (needs a current 6-digit code).
   - Shows download links for two trusted authenticator apps.

   Backend: Supabase Auth MFA (TOTP). No table, RPC or SQL of ours is
   used. Supabase keeps the factor in its own auth schema.
   The login step that asks for the code lives in login.html.

   Deep link: settings.html#security
   ========================================================= */
(function(){
'use strict';

const S = window.GLIME_SETTINGS;
if(!S || typeof S.register !== 'function'){
  console.warn('GLIME 2FA: Settings shell not found');
  return;
}

/* Free authenticator apps, picked for security: app lock + encrypted backup. */
const AUTH_APPS = [
  {
    name:'Microsoft Authenticator',
    why:'Trusted by millions. Locks with fingerprint or face, and keeps an encrypted backup.',
    android:'https://play.google.com/store/apps/details?id=com.azure.authenticator',
    ios:'https://apps.apple.com/app/microsoft-authenticator/id983156458'
  },
  {
    name:'2FAS Auth',
    why:'Open source and private. App lock, encrypted backup, and no account needed.',
    android:'https://play.google.com/store/apps/details?id=com.twofasapp',
    ios:'https://apps.apple.com/app/2fas-authenticator/id1217793794'
  }
];

const STYLE = `
.g2fa-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:18px;margin-bottom:15px}
.g2fa-card.on{border-color:rgba(80,245,168,.38)}
.g2fa-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.g2fa-title b{font-size:1.02rem}
.g2fa-intro{color:var(--mu);font-size:.76rem;margin-bottom:12px;line-height:1.55}
.g2fa-flow{border-top:1px solid var(--bd);margin-top:6px;padding-top:6px}
.g2fa-step{display:flex;gap:13px;padding:13px 0;border-bottom:1px solid var(--bd)}
.g2fa-step:last-child{border-bottom:0}
.g2fa-n{
  flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:rgba(82,232,255,.10);color:var(--cy);font-size:.76rem;font-weight:800
}
.g2fa-step > div{min-width:0;flex:1}
.g2fa-step b{display:block;font-size:.84rem}
.g2fa-step small{display:block;color:var(--mu);font-size:.72rem;line-height:1.5;margin-top:2px}
.g2fa-qrwrap{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:12px}
.g2fa-qr{width:180px;height:180px;flex:none;background:#fff;border-radius:14px;padding:9px}
.g2fa-qr img{width:100%;height:100%;display:block}
.g2fa-keybox{min-width:0;flex:1}
.g2fa-keybox code{
  display:block;margin:5px 0 9px;padding:10px 12px;background:var(--surf2);border:1px solid var(--bd);
  border-radius:9px;font-size:.84rem;letter-spacing:.06em;word-break:break-all;color:var(--tx)
}
.g2fa-code{
  width:100%;max-width:230px;margin-top:10px;background:var(--surf2);color:var(--tx);
  border:1px solid var(--bd);border-radius:10px;padding:12px 12px 12px calc(12px + .45em);outline:none;
  text-align:center;font-size:1.3rem;font-weight:700;letter-spacing:.45em
}
.g2fa-code:focus{border-color:rgba(82,232,255,.45)}
.g2fa-msg{display:none;color:var(--rd);font-size:.74rem;margin-top:9px;line-height:1.5}
.g2fa-msg.show{display:block}
.g2fa-apps{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.g2fa-app{background:var(--surf2);border:1px solid var(--bd);border-radius:14px;padding:14px}
.g2fa-app b{display:block;font-size:.88rem}
.g2fa-app small{display:block;color:var(--mu);font-size:.71rem;line-height:1.5;margin:3px 0 11px}
.g2fa-links{display:flex;gap:8px;flex-wrap:wrap}
.g2fa-links .btn{display:inline-block}
@media(max-width:760px){
  .g2fa-qrwrap{justify-content:center}
  .g2fa-keybox{flex-basis:100%}
  .g2fa-code{max-width:none}
  .g2fa-links .btn{flex:1;text-align:center}
}
`;

function injectStyle(){
  if(document.getElementById('g2faStyle')) return;
  const el = document.createElement('style');
  el.id = 'g2faStyle';
  el.textContent = STYLE;
  document.head.appendChild(el);
}

function appsCard(esc){
  return `
    <section class="g2fa-card">
      <div class="g2fa-title"><b>Authenticator apps</b></div>
      <p class="g2fa-intro">
        Install one of these free apps on your phone. It makes the 6-digit codes you use to sign in.
        Any other standard authenticator app works too.
      </p>
      <div class="g2fa-apps">
        ${AUTH_APPS.map(a => `
          <div class="g2fa-app">
            <b>${esc(a.name)}</b>
            <small>${esc(a.why)}</small>
            <div class="g2fa-links">
              <a class="btn" href="${esc(a.android)}" target="_blank" rel="noopener noreferrer">Android · Google Play</a>
              <a class="btn" href="${esc(a.ios)}" target="_blank" rel="noopener noreferrer">iPhone · App Store</a>
            </div>
          </div>`).join('')}
      </div>
    </section>`;
}

S.register({
  id:'security',
  label:'Security',
  order:90,
  render: async function({container, api, ui}){
    injectStyle();
    const esc = ui.escapeHtml;
    const sb = api.supabase;

    const head = `
      <div class="section-head">
        <h2>Security</h2>
        <p>Protect your GLIME account with two-factor authentication (2FA).</p>
      </div>`;

    container.innerHTML = head + '<div class="loading">Loading security settings…</div>';

    if(!sb || !sb.auth || !sb.auth.mfa){
      container.innerHTML = head +
        '<div class="error">Two-factor authentication is not available right now. Please refresh the page.</div>';
      return;
    }

    /* Verified authenticator (if any) + half-finished setups left over from earlier tries. */
    async function loadFactors(){
      const {data, error} = await sb.auth.mfa.listFactors();
      if(error) throw error;
      const all = (data && data.all) || [];
      return {
        verified: ((data && data.totp) || []).find(f => f.status === 'verified') || null,
        unverified: all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')
      };
    }

    function showMsg(box, text){
      box.textContent = text || '';
      box.classList.toggle('show', !!text);
    }

    function friendlyCodeError(error){
      const m = String((error && error.message) || '').toLowerCase();
      if(m.includes('too many') || m.includes('rate limit')){
        return 'Too many attempts. Please wait a minute and try again.';
      }
      return 'That code is not correct or has expired. Check the latest code in your app and try again.';
    }

    async function drawStatus(){
      let info;
      try{
        info = await loadFactors();
      }catch(error){
        console.error('2FA status error:', error);
        container.innerHTML = head +
          `<div class="error">Could not load 2FA status. ${esc(error.message || 'Please try again.')}</div>`;
        return;
      }

      const on = !!info.verified;

      container.innerHTML = head + `
        <section class="g2fa-card ${on ? 'on' : ''}">
          <div class="g2fa-title">
            <b>Two-factor authentication</b>
            <span class="badge ${on ? 'on' : 'off'}">${on ? '● Enabled' : 'Not enabled'}</span>
          </div>
          <p class="g2fa-intro">
            ${on
              ? 'Signing in needs your password and a 6-digit code from your authenticator app. Your account stays safe even if someone learns your password.'
              : 'Add a second step to sign-in. Once it is on, every login asks for a 6-digit code from an authenticator app on your phone, as well as your password.'}
          </p>
          <div id="g2faPanel"></div>
          <div class="actions" id="g2faActions">
            ${on
              ? '<button class="btn danger" type="button" id="g2faDisable">Turn off 2FA</button>'
              : '<button class="btn primary" type="button" id="g2faEnable">Enable 2FA</button>'}
          </div>
          <p class="note">
            Keep your phone safe. If you lose access to your authenticator app you cannot sign in; contact GLIME support at connect@glime.online to reset 2FA.
          </p>
        </section>
        ${appsCard(esc)}`;

      const enableBtn = container.querySelector('#g2faEnable');
      if(enableBtn) enableBtn.onclick = () => startEnroll(enableBtn);

      const disableBtn = container.querySelector('#g2faDisable');
      if(disableBtn) disableBtn.onclick = () => startDisable(info.verified);
    }

    /* ---------- Turn ON ---------- */

    async function startEnroll(button){
      const panel = container.querySelector('#g2faPanel');
      const actions = container.querySelector('#g2faActions');

      button.disabled = true;
      button.textContent = 'Preparing…';

      let data;
      try{
        /* Clear any half-finished setup from an earlier attempt. */
        const info = await loadFactors();
        for(const f of info.unverified){
          const r = await sb.auth.mfa.unenroll({factorId: f.id});
          if(r.error) throw r.error;
        }

        const res = await sb.auth.mfa.enroll({
          factorType:'totp',
          issuer:'GLIME',
          friendlyName:'GLIME Authenticator ' + Date.now().toString(36)
        });
        if(res.error) throw res.error;
        data = res.data;
      }catch(error){
        console.error('2FA enroll error:', error);
        button.disabled = false;
        button.textContent = 'Enable 2FA';
        ui.toast(error.message || 'Could not start 2FA setup', true);
        return;
      }

      const factorId = data.id;
      const secret = (data.totp && data.totp.secret) || '';

      panel.innerHTML = `
        <div class="g2fa-flow">
          <div class="g2fa-step">
            <span class="g2fa-n">1</span>
            <div>
              <b>Install an authenticator app</b>
              <small>Pick one from "Authenticator apps" below, then open it on your phone.</small>
            </div>
          </div>
          <div class="g2fa-step">
            <span class="g2fa-n">2</span>
            <div>
              <b>Scan this QR code</b>
              <small>In the app tap Add (+) and scan. Cannot scan? Type the setup key instead.</small>
              <div class="g2fa-qrwrap">
                <div class="g2fa-qr" id="g2faQr"></div>
                <div class="g2fa-keybox">
                  <small>Setup key</small>
                  <code id="g2faSecret"></code>
                  <button class="btn" type="button" id="g2faCopy">Copy key</button>
                </div>
              </div>
            </div>
          </div>
          <div class="g2fa-step">
            <span class="g2fa-n">3</span>
            <div>
              <b>Enter the 6-digit code</b>
              <small>Type the code your app shows for GLIME to finish.</small>
              <input class="g2fa-code" id="g2faCode" type="text" inputmode="numeric"
                     autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="6-digit code">
              <div class="g2fa-msg" id="g2faMsg"></div>
            </div>
          </div>
        </div>`;

      const img = document.createElement('img');
      img.alt = 'QR code for setting up two-factor authentication';
      img.src = (data.totp && data.totp.qr_code) || '';
      panel.querySelector('#g2faQr').appendChild(img);

      panel.querySelector('#g2faSecret').textContent = secret.replace(/(.{4})/g, '$1 ').trim();

      panel.querySelector('#g2faCopy').onclick = async () => {
        try{
          await navigator.clipboard.writeText(secret);
          ui.toast('Setup key copied');
        }catch(e){
          ui.toast('Could not copy. Please select the key and copy it.', true);
        }
      };

      actions.innerHTML = `
        <button class="btn primary" type="button" id="g2faVerify">Verify &amp; enable</button>
        <button class="btn" type="button" id="g2faCancel">Cancel</button>`;

      const codeInput = panel.querySelector('#g2faCode');
      const msg = panel.querySelector('#g2faMsg');
      const verifyBtn = actions.querySelector('#g2faVerify');
      const cancelBtn = actions.querySelector('#g2faCancel');

      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '');
        showMsg(msg, '');
      });
      codeInput.addEventListener('keydown', e => { if(e.key === 'Enter') verifyBtn.click(); });
      codeInput.focus();

      verifyBtn.onclick = async () => {
        const code = codeInput.value.replace(/\D/g, '');
        if(code.length !== 6){
          showMsg(msg, 'Enter the 6-digit code shown in your authenticator app.');
          return;
        }

        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying…';

        const {error} = await sb.auth.mfa.challengeAndVerify({factorId, code});

        if(error){
          console.error('2FA verify error:', error);
          showMsg(msg, friendlyCodeError(error));
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify & enable';
          codeInput.select();
          return;
        }

        ui.toast('Two-factor authentication is ON');
        await drawStatus();
      };

      cancelBtn.onclick = async () => {
        cancelBtn.disabled = true;
        verifyBtn.disabled = true;
        try{ await sb.auth.mfa.unenroll({factorId}); }
        catch(e){ console.warn('2FA cancel cleanup:', e); }
        await drawStatus();
      };
    }

    /* ---------- Turn OFF ---------- */

    async function startDisable(factor){
      const ok = await ui.confirm(
        'After you turn this off, your account is protected by your password only.',
        {title:'Turn off 2FA?', confirmText:'Continue', danger:true}
      );
      if(!ok) return;

      const panel = container.querySelector('#g2faPanel');
      const actions = container.querySelector('#g2faActions');

      panel.innerHTML = `
        <div class="g2fa-flow">
          <div class="g2fa-step">
            <span class="g2fa-n">!</span>
            <div>
              <b>Confirm with your current code</b>
              <small>Enter the 6-digit code from your authenticator app to turn 2FA off.</small>
              <input class="g2fa-code" id="g2faCode" type="text" inputmode="numeric"
                     autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="6-digit code">
              <div class="g2fa-msg" id="g2faMsg"></div>
            </div>
          </div>
        </div>`;

      actions.innerHTML = `
        <button class="btn danger" type="button" id="g2faConfirmOff">Turn off 2FA</button>
        <button class="btn" type="button" id="g2faKeepOn">Keep 2FA on</button>`;

      const codeInput = panel.querySelector('#g2faCode');
      const msg = panel.querySelector('#g2faMsg');
      const offBtn = actions.querySelector('#g2faConfirmOff');
      const keepBtn = actions.querySelector('#g2faKeepOn');

      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '');
        showMsg(msg, '');
      });
      codeInput.addEventListener('keydown', e => { if(e.key === 'Enter') offBtn.click(); });
      codeInput.focus();

      keepBtn.onclick = () => drawStatus();

      offBtn.onclick = async () => {
        const code = codeInput.value.replace(/\D/g, '');
        if(code.length !== 6){
          showMsg(msg, 'Enter the 6-digit code shown in your authenticator app.');
          return;
        }

        offBtn.disabled = true;
        offBtn.textContent = 'Checking…';

        const check = await sb.auth.mfa.challengeAndVerify({factorId: factor.id, code});
        if(check.error){
          console.error('2FA off verify error:', check.error);
          showMsg(msg, friendlyCodeError(check.error));
          offBtn.disabled = false;
          offBtn.textContent = 'Turn off 2FA';
          codeInput.select();
          return;
        }

        const res = await sb.auth.mfa.unenroll({factorId: factor.id});
        if(res.error){
          console.error('2FA unenroll error:', res.error);
          showMsg(msg, res.error.message || 'Could not turn off 2FA. Please try again.');
          offBtn.disabled = false;
          offBtn.textContent = 'Turn off 2FA';
          return;
        }

        ui.toast('Two-factor authentication is OFF');
        await drawStatus();
      };
    }

    await drawStatus();
  }
});
})();
