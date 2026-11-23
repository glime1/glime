/* GLIME: small screen shown before Instagram opens, listing the permissions that will be asked.
   Only people tapping Connect see it. Scripted clicks (Continue, or the app-to-Chrome handoff) pass straight through,
   so the existing connect flow in instagram-sales-specialist.js and glime-connect-app.js is unchanged. */
(() => {
'use strict';
if (window.__igConsent) return; window.__igConsent = true;

const PERMS = [
  ['👤', 'See your account', 'Your Instagram username and account type, so GLIME can show which account is connected.', 'instagram_business_basic'],
  ['💬', 'Read and reply to messages', 'See DMs from your customers and reply to them. This includes the DM GLIME sends to someone who comments on your post.', 'instagram_business_manage_messages'],
  ['🗨️', 'Manage comments', 'See comments on your posts and reels, reply to them, hide or unhide them, and delete them.', 'instagram_business_manage_comments'],
];

const CSS = `
.cns{position:fixed;inset:0;z-index:2147483200;display:none;align-items:flex-end;justify-content:center;background:rgba(3,8,14,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.cns.on{display:flex}
.cns-b{width:min(520px,100%);max-height:92vh;overflow:auto;box-sizing:border-box;background:var(--gcard,#fff);color:var(--gtxt,#0b1b26);border:1px solid var(--gline,#e3ebf0);border-radius:22px 22px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -18px 50px rgba(0,0,0,.35);animation:cnsUp .22s ease}
@keyframes cnsUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
.cns h3{margin:0 0 4px;font-size:20px}
.cns .sub{margin:0 0 14px;color:var(--gmut,#64748b);font-size:14px;line-height:1.5}
.cns ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.cns li{display:flex;gap:12px;padding:12px;border:1px solid var(--gline,#e3ebf0);border-radius:14px;background:var(--gcard2,#f4f8fa)}
.cns .ic{flex:0 0 40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:19px;background:linear-gradient(135deg,#00f08a,#00e5ff)}
.cns li b{display:block;font-size:15px}
.cns li span{display:block;color:var(--gmut,#64748b);font-size:13px;line-height:1.45;margin-top:2px}
.cns li em{display:block;font-style:normal;font-size:11px;margin-top:5px;color:var(--gpri,#0a9d63);word-break:break-all}
.cns .safe{margin:14px 0;padding:11px 12px;border-radius:12px;background:var(--gpriS,rgba(0,200,120,.12));font-size:13px;line-height:1.5}
.cns .safe p{margin:0}.cns .safe p+p{margin-top:8px}
.cns .act{display:flex;gap:10px}
.cns .act button{flex:1;padding:14px 10px;border-radius:14px;font-weight:700;font-size:15px;font-family:inherit;border:1px solid var(--gline,#e3ebf0);background:transparent;color:inherit;cursor:pointer}
.cns .act .go{flex:1.6;border:0;color:#04130d;background:linear-gradient(135deg,#00f08a,#00e5ff);box-shadow:0 8px 22px rgba(0,229,200,.28)}
`;

let box = null;
function build() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  box = document.createElement('div'); box.className = 'cns'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'cnsT');
  box.innerHTML = `<div class='cns-b'>
    <h3 id='cnsT'>Connect your Instagram</h3>
    <p class='sub'>Next, Instagram will ask you to allow the permissions below. Here is exactly what GLIME uses each one for.</p>
    <ul>${PERMS.map(p => `<li><div class='ic'>${p[0]}</div><div><b>${p[1]}</b><span>${p[2]}</span><em>${p[3]}</em></div></li>`).join('')}</ul>
    <div class='safe'>
      <p>🔒 You log in on Instagram's own page. GLIME never sees your password and does not publish posts or stories for you.</p>
      <p>🔌 You can disconnect any time: in GLIME go to Settings, open Instagram and tap Disconnect Instagram. You can also remove access from your Instagram settings under Apps and websites.</p>
    </div>
    <div class='act'><button type='button' id='cnsNo'>Cancel</button><button type='button' id='cnsGo' class='go'>Continue to Instagram</button></div>
  </div>`;
  document.body.appendChild(box);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelector('#cnsNo').onclick = close;
  box.querySelector('#cnsGo').onclick = () => { close(); const b = document.getElementById('connect'); if (b) b.click(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('on')) close(); });
}
function open() { if (!box) build(); box.classList.add('on'); }
function close() { if (box) box.classList.remove('on'); }

document.addEventListener('click', e => {
  const t = e.target && e.target.closest ? e.target.closest('#connect') : null;
  if (!t || !e.isTrusted) return;
  e.preventDefault(); e.stopImmediatePropagation(); open();
}, true);
})();
