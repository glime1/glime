/* =========================================================
   GLIME PAYMENTS — SETTINGS MODULE
   ---------------------------------------------------------
   Registers Settings > GLIME Payments through window.GLIME_SETTINGS.
   Frontend only. Every number comes from the backend; the browser never
   decides a balance or a withdrawal limit. Spec: PAYMENTS_BACKEND_SPEC.md

   GLIME Payments is GLIME's own product. The screen never names the
   payment partner behind it, so it keeps working whichever gateway the
   backend uses. Any client can use it, with or without a gateway account.

   Two ways to collect customer payments:
   - "own"   : the client's own gateway account (Settings > Connector).
   - "glime" : GLIME Payments. One-time KYC, then the client sees payments
               received, fees, net earnings and withdraws only what was
               actually received.

   Backend calls (unchanged, see the spec):
   RPC   get_my_payments_overview()
   RPC   set_my_payment_mode(p_mode)
   RPC   list_my_gateway_payments(p_limit,p_offset,p_status)
   RPC   list_my_payouts(p_limit,p_offset)
   RPC   request_my_payout(p_amount_paise,p_idempotency_key)
   RPC   accept_my_payments_terms(p_version)   (optional)
   Edge  POST /functions/v1/glime-payments-kyc   (PAN and bank details go here only)

   Sensitive data rule: PAN, bank account number and IFSC are kept in memory
   only while the form is open. Nothing is written to localStorage, the URL or
   the console. They are cleared after a successful submit and after 10
   minutes of inactivity. The review step shows only the last 4 digits.

   Deep link: settings.html#payments

   Terms gate: choosing GLIME Payments first opens the key terms. The client
   must scroll to the end, tick both boxes and accept. Version and fee split
   come from glime-payments-config.js (loaded by this file).
   ========================================================= */
(function(){
'use strict';

const S=window.GLIME_SETTINGS;
if(!S||typeof S.register!=='function'){
  console.warn('GLIME Payments: Settings shell not found');
  return;
}

const KYC_FN='/functions/v1/glime-payments-kyc';
const FALLBACK_URL='https://ufoulgbiqgjriwapuopc.supabase.co';
const PAGE=20;
const POLL_MS=45000;
const CFG_FILE='glime-payments-config.js';
const CFG_DEFAULT={
  termsVersion:'2026-10-31',
  serviceBps:50,
  termsUrl:'glime-payments-terms.html',
  docsUrl:'glime-payments-docs.html',
  supportEmail:'connect@glime.online',
  idleMs:10*60*1000
};
function cfg(){return Object.assign({},CFG_DEFAULT,window.GLIME_PAYMENTS_CONFIG||{});}
function loadConfig(){
  return new Promise(function(resolve){
    if(window.GLIME_PAYMENTS_CONFIG)return resolve();
    const s=document.createElement('script');
    s.src=CFG_FILE;
    s.onload=function(){resolve();};
    s.onerror=function(){resolve();};
    document.head.appendChild(s);
  });
}
function pct(bps){return (Number(bps)/100).toFixed(2).replace(/\.?0+$/,'')+'%';}

const BUSINESS_TYPES=[
  ['individual','Individual'],
  ['proprietorship','Proprietorship'],
  ['partnership','Partnership firm'],
  ['llp','LLP'],
  ['private_limited','Private limited company']
];
const COMPANY_TYPES=['partnership','llp','private_limited'];
const CATEGORIES=[
  ['retail','Retail / products'],
  ['services','Services'],
  ['food_beverage','Food & beverages'],
  ['education','Education / coaching'],
  ['beauty_wellness','Beauty & wellness'],
  ['other','Other']
];
const STATES=['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'];
const STEP_NAMES=['Business','Contact','Bank','Review'];
const PAY_FILTERS=[['','All'],['captured','Received'],['held','On hold'],['released','Released'],['settled','Settled'],['refunded','Refunded'],['partially_refunded','Part refunded']];

const PAY_STATUS={
  captured:['Received','on'],held:['On hold','warn'],released:['Released','on'],
  settled:['Settled','on'],refunded:['Refunded','off'],partially_refunded:['Part refunded','warn'],failed:['Failed','off']
};
const PAYOUT_STATUS={
  pending:['Pending','warn'],processing:['Processing','warn'],paid:['Paid','on'],
  failed:['Failed','off'],reversed:['Reversed','off'],cancelled:['Cancelled','off']
};
const KYC_STATUS={
  not_started:['Not started','off'],submitted:['Submitted','warn'],under_review:['Under review','warn'],
  needs_info:['More information needed','warn'],verified:['Verified','on'],rejected:['Rejected','off'],suspended:['Suspended','off']
};

const ERR={
  PAYMENTS_NOT_ENABLED:'GLIME Payments is not enabled for your account yet.',
  KYC_NOT_VERIFIED:'Complete and verify KYC before withdrawing.',
  INSUFFICIENT_BALANCE:'This is more than your available balance.',
  BELOW_MINIMUM:'This is below the minimum withdrawal amount.',
  PAYOUT_ALREADY_PENDING:'You already have a withdrawal in progress. Please wait until it finishes.',
  MODE_CHANGE_BLOCKED:'You cannot switch while you have a balance, a held payment or a pending withdrawal.',
  INVALID_AMOUNT:'Enter a valid amount.',
  KYC_ALREADY_SUBMITTED:'Your KYC is already submitted and under review.',
  KYC_INVALID_PAN:'The PAN could not be verified. Please check it.',
  KYC_INVALID_BANK:'The bank details could not be verified. Please check them.',
  KYC_INVALID_IFSC:'The IFSC code is not valid.',
  NOT_AUTHENTICATED:'Your session expired. Please log in again.',
  WITHDRAW_NOT_ALLOWED:'Withdrawals are not available for your account. Earnings are settled automatically.',
  PAYOUTS_FROZEN:'Withdrawals are paused on your account. Please contact support.',
  INVALID_REQUEST:'The request was not valid. Please refresh and try again.',
  INVALID_MODE:'That option is not valid.'
};

const PAN_RE=/^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE=/^[A-Z]{4}0[A-Z0-9]{6}$/;
const GST_RE=/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const inr=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2});
const money=p=>inr.format((Number(p)||0)/100);
const esc=v=>S.ui.escapeHtml(v);
const T=v=>String(v==null?'':v).trim();

const ICONS={
  card:'<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10.5h18"/><path d="M7 15h4"/>',
  shield:'<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  bank:'<path d="M3 10l9-6 9 6"/><path d="M5 10v7M10 10v7M14 10v7M19 10v7"/><path d="M3 20h18"/>',
  chart:'<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/>',
  chat:'<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  empty:'<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 10h8M8 14h5"/>'
};
function ic(name,size){
  const s=size||20;
  return '<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(ICONS[name]||'')+'</svg>';
}

function fmtDate(v){
  if(!v)return '—';
  const d=new Date(v);
  return isNaN(d.getTime())?'—':d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function newKey(){
  try{if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();}catch(e){}
  return 'k'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
function errText(e,fallback){
  const m=String((e&&(e.message||e.error||e.code))||'');
  for(const k in ERR){if(m.indexOf(k)!==-1)return ERR[k];}
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return 'You appear to be offline. Check your connection and try again.';
  return fallback||'Something went wrong. Please try again.';
}
function badge(map,key){
  const x=map[key]||[String(key||'—'),'off'];
  return '<span class="badge '+x[1]+'">'+esc(x[0])+'</span>';
}
function norm(d){return Array.isArray(d)?(d[0]||null):d;}
function bizType(v){return (BUSINESS_TYPES.filter(function(x){return x[0]===v;})[0]||[])[1]||v||'—';}

async function rpc(api,name,args){
  const r=await api.supabase.rpc(name,args||{});
  if(r.error)throw r.error;
  return r.data;
}

/* ---------- styles (scoped with gpay-) ---------- */
function injectCss(){
  if(document.getElementById('gpay-css'))return;
  const st=document.createElement('style');
  st.id='gpay-css';
  st.textContent=`
.gpay-hero{display:flex;align-items:center;gap:13px;background:linear-gradient(135deg,rgba(80,245,168,.09),rgba(82,232,255,.06));border:1px solid rgba(82,232,255,.22);border-radius:18px;padding:15px 16px;margin-bottom:15px}
.gpay-mark{flex:none;width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(120deg,var(--gr),var(--cy));color:#031014}
.gpay-hero-t{min-width:0;flex:1}
.gpay-hero-t b{display:block;font-size:1rem;letter-spacing:-.01em}
.gpay-hero-t small{display:block;color:var(--mu);font-size:.72rem;line-height:1.45;margin-top:2px}
.gpay-trust{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:15px}
.gpay-trust div{display:flex;gap:10px;align-items:flex-start;background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:12px}
.gpay-trust svg{flex:none;color:var(--cy);margin-top:1px}
.gpay-trust b{display:block;font-size:.76rem}
.gpay-trust small{display:block;color:var(--mu);font-size:.68rem;line-height:1.4;margin-top:2px}
.gpay-opts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px}
.gpay-opt{position:relative;background:var(--surf);border:1px solid var(--bd);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.gpay-opt.sel{border-color:rgba(80,245,168,.5)}
.gpay-opt.rec{border-color:rgba(82,232,255,.4)}
.gpay-opt-t{font-weight:800;font-size:.92rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.gpay-opt p{color:var(--mu);font-size:.74rem;line-height:1.5;flex:1}
.gpay-tag{font-size:.6rem;font-weight:800;letter-spacing:.06em;padding:3px 8px;border-radius:99px;background:rgba(82,232,255,.12);color:var(--cy)}
.gpay-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:11px 14px;margin-bottom:14px;font-size:.76rem}
.gpay-bar span{color:var(--mu)}
.gpay-bar b{color:var(--tx)}
.gpay-link{background:none;border:0;color:var(--cy);font-size:.74rem;font-weight:800;padding:6px 2px;text-decoration:underline;text-underline-offset:3px}
.gpay-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:2px 0 4px}
.gpay-flow div{background:var(--surf2);border:1px solid var(--bd);border-radius:12px;padding:11px}
.gpay-flow i{font-style:normal;display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:rgba(82,232,255,.12);color:var(--cy);font-size:.7rem;font-weight:800;margin-bottom:6px}
.gpay-flow b{display:block;font-size:.76rem}
.gpay-flow small{display:block;color:var(--mu);font-size:.67rem;line-height:1.4;margin-top:2px}
.gpay-balance{background:linear-gradient(135deg,rgba(80,245,168,.08),rgba(82,232,255,.05));border:1px solid rgba(80,245,168,.3);border-radius:18px;padding:18px;margin-bottom:14px}
.gpay-balance small.k{display:block;color:var(--mu);font-size:.66rem;font-weight:800;letter-spacing:.08em}
.gpay-balance .sub{color:var(--mu);font-size:.72rem;margin-top:2px}
.gpay-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:15px}
.gpay-stat{background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:14px}
.gpay-stat small{display:block;color:var(--mu);font-size:.64rem;font-weight:800;letter-spacing:.07em}
.gpay-stat b{display:block;font-size:1.08rem;margin-top:4px;word-break:break-word}
.gpay-stat.hi{border-color:rgba(80,245,168,.4)}
.gpay-stat.hi b{color:var(--gr)}
.gpay-tabs{display:flex;gap:7px;overflow:auto;margin-bottom:14px;align-items:center;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.gpay-tabs::-webkit-scrollbar{display:none}
.gpay-tabs button{flex:none;border:1px solid var(--bd);background:transparent;color:var(--mu);padding:9px 13px;border-radius:10px;font-size:.76rem;font-weight:800;min-height:38px}
.gpay-tabs button.active{color:var(--cy);border-color:rgba(82,232,255,.35);background:rgba(82,232,255,.07)}
.gpay-tabs .gpay-refresh{margin-left:auto}
.gpay-chips{display:flex;gap:6px;overflow:auto;margin-bottom:12px;scrollbar-width:none}
.gpay-chips::-webkit-scrollbar{display:none}
.gpay-chips button{flex:none;border:1px solid var(--bd);background:transparent;color:var(--mu);padding:6px 11px;border-radius:99px;font-size:.7rem;font-weight:800}
.gpay-chips button.active{color:var(--cy);border-color:rgba(82,232,255,.4);background:rgba(82,232,255,.07)}
.gpay-steps{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.gpay-steps span{font-size:.7rem;font-weight:800;padding:5px 11px;border-radius:99px;border:1px solid var(--bd);color:var(--mu)}
.gpay-steps span.on{color:var(--cy);border-color:rgba(82,232,255,.4)}
.gpay-steps span.done{color:var(--gr);border-color:rgba(80,245,168,.35)}
.gpay-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.gpay-fld{display:flex;flex-direction:column;gap:5px;min-width:0}
.gpay-fld.full{grid-column:1/-1}
.gpay-fld span{font-size:.72rem;font-weight:800}
.gpay-fld small{color:var(--mu);font-size:.66rem}
.gpay-input{width:100%;background:var(--surf2);color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:11px 12px;outline:none;min-height:42px}
.gpay-input:focus{border-color:rgba(82,232,255,.5);box-shadow:0 0 0 3px rgba(82,232,255,.1)}
.gpay-input.bad{border-color:rgba(255,130,145,.65)}
.gpay-check{display:flex;gap:9px;align-items:flex-start;font-size:.74rem;color:var(--mu);line-height:1.5}
.gpay-check input{margin-top:3px;width:17px;height:17px;flex:none}
.gpay-msg{color:var(--rd);font-size:.75rem;margin-top:12px;min-height:1em}
.gpay-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--bd)}
.gpay-item:first-of-type{border-top:0}
.gpay-item .l{min-width:0}
.gpay-item .l b{display:block;font-size:.8rem;overflow:hidden;text-overflow:ellipsis}
.gpay-item .l small{display:block;color:var(--mu);font-size:.68rem;margin-top:2px}
.gpay-item .r{text-align:right;flex:none}
.gpay-item .r b{display:block;font-size:.84rem;margin-bottom:3px}
.gpay-wd{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:12px}
.gpay-wd .gpay-input{max-width:200px}
.gpay-big{font-size:1.7rem;font-weight:800;color:var(--gr);letter-spacing:-.02em;margin-top:2px}
.badge.warn{color:#ffd166;border-color:rgba(255,209,102,.38)}
.gpay-terms-box{max-height:280px;overflow:auto;background:var(--surf2);border:1px solid var(--bd);border-radius:12px;padding:12px 14px 12px 32px;margin:12px 0 6px;font-size:.76rem;line-height:1.6;color:var(--mu)}
.gpay-terms-box:focus{outline:2px solid rgba(82,232,255,.4)}
.gpay-terms-box li{margin:0 0 8px}
.gpay-fee{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--bd);font-size:.8rem}
.gpay-fee:first-of-type{border-top:0}
.gpay-fee.tot{font-weight:800}
.gpay-gate .gpay-check{margin:10px 0}
.gpay-kv{display:grid;grid-template-columns:150px 1fr;gap:8px 12px;font-size:.78rem;margin-bottom:14px}
.gpay-kv dt{color:var(--mu)}
.gpay-kv dd{margin:0;word-break:break-word}
.gpay-empty{text-align:center;color:var(--mu);font-size:.78rem;padding:26px 10px}
.gpay-empty svg{display:block;margin:0 auto 8px;opacity:.6}
.gpay-skel{height:74px;border-radius:16px;background:var(--surf);border:1px solid var(--bd);margin-bottom:12px;position:relative;overflow:hidden}
.gpay-skel:after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent,rgba(255,255,255,.05),transparent);transform:translateX(-100%);animation:gpayshim 1.3s infinite}
@keyframes gpayshim{to{transform:translateX(100%)}}
@media(prefers-reduced-motion:reduce){.gpay-skel:after{animation:none}}
@media(max-width:760px){
  .gpay-opts,.gpay-form,.gpay-trust,.gpay-flow{grid-template-columns:1fr}
  .gpay-grid{grid-template-columns:1fr 1fr}
  .gpay-kv{grid-template-columns:1fr;gap:2px}
  .gpay-kv dd{margin-bottom:8px}
  .gpay-input{font-size:16px}
  .gpay-wd .gpay-input{max-width:none;flex:1 1 100%}
  .gpay-hero{padding:13px}
  .gpay-hero .badge{align-self:flex-start}
}`;
  document.head.appendChild(st);
}

/* ---------- render ---------- */
async function render({container,api,state,ui}){
  injectCss();
  await loadConfig();
  const ctx={
    container,api,state,ui,
    body:null,ov:null,tab:'overview',step:0,form:{},busy:false,gate:false,idle:null,pollT:null,
    wdKey:newKey(),wdKeyAmount:0,
    lists:{
      payments:{rows:[],done:false,loading:false,error:'',filter:''},
      payouts:{rows:[],done:false,loading:false,error:''}
    }
  };
  container.innerHTML=`
    <div class="section-head">
      <h2>GLIME Payments</h2>
      <p>Accept customer payments on WhatsApp and Instagram, and get paid straight to your bank.</p>
    </div>
    <div id="gpayBody" aria-live="polite"><div class="gpay-skel"></div><div class="gpay-skel"></div><div class="gpay-skel"></div></div>`;
  ctx.body=container.querySelector('#gpayBody');
  ctx.body.addEventListener('click',e=>onClick(ctx,e));
  ctx.body.addEventListener('input',e=>onInput(ctx,e));
  ctx.body.addEventListener('change',e=>onChange(ctx,e));
  await load(ctx);
}

async function load(ctx){
  clearTimeout(ctx.pollT);
  try{
    ctx.ov=norm(await rpc(ctx.api,'get_my_payments_overview'));
  }catch(e){
    console.error('GLIME Payments load error:',e&&e.message);
    if(String((e&&e.message)||'').indexOf('NOT_AUTHENTICATED')!==-1){location.href='login.html';return;}
    if(!ctx.body.isConnected)return;
    ctx.body.innerHTML='<div class="error">Could not load GLIME Payments. '+esc(errText(e,'Please try again.'))+'</div>'+
      '<div class="actions"><button class="btn" type="button" data-act="refresh">Try again</button></div>';
    return;
  }
  if(!ctx.body.isConnected)return;
  ctx.lists.payments.rows=[];ctx.lists.payments.done=false;
  ctx.lists.payouts.rows=[];ctx.lists.payouts.done=false;
  draw(ctx);
  schedulePoll(ctx);
}

/* While KYC is with review, quietly re-check so the client sees the result without refreshing. */
function schedulePoll(ctx){
  clearTimeout(ctx.pollT);
  const st=kycStatus(ctx);
  if(!ctx.ov||ctx.ov.mode!=='glime'||(st!=='submitted'&&st!=='under_review'))return;
  ctx.pollT=setTimeout(async function(){
    if(!ctx.body.isConnected)return;
    if(!document.hidden){
      try{
        const fresh=norm(await rpc(ctx.api,'get_my_payments_overview'));
        if(!ctx.body.isConnected)return;
        if(fresh){
          const changed=((fresh.kyc&&fresh.kyc.status)||'not_started')!==st;
          ctx.ov=fresh;
          if(changed){draw(ctx);ctx.ui.toast('Your KYC status was updated');}
        }
      }catch(e){}
    }
    schedulePoll(ctx);
  },POLL_MS);
}

function heroHtml(ctx){
  const ov=ctx.ov;
  let pill='';
  if(ov.mode==='glime')pill=badge(KYC_STATUS,kycStatus(ctx));
  else if(ov.mode==='own')pill='<span class="badge on">Own gateway</span>';
  return '<div class="gpay-hero"><div class="gpay-mark">'+ic('card',22)+'</div>'+
    '<div class="gpay-hero-t"><b>GLIME Payments</b><small>Get paid inside the chat. No separate gateway account needed.</small></div>'+pill+'</div>';
}

function trustHtml(){
  return '<div class="gpay-trust">'+
    '<div>'+ic('shield')+'<span><b>Verified once</b><small>Simple one-time KYC. Your PAN and bank details are never stored in full.</small></span></div>'+
    '<div>'+ic('chat')+'<span><b>Paid inside the chat</b><small>Customers pay from WhatsApp and Instagram without leaving the conversation.</small></span></div>'+
    '<div>'+ic('bank')+'<span><b>Straight to your bank</b><small>You see every payment, fee and payout in real time.</small></span></div>'+
  '</div>';
}

function draw(ctx){
  const ov=ctx.ov;
  if(!ov||ov.enabled===false){
    ctx.body.innerHTML='<div class="gpay-empty">'+ic('empty',34)+'GLIME Payments is not enabled for your account yet.<br>Write to <a href="mailto:'+esc(cfg().supportEmail)+'" style="color:var(--cy)">'+esc(cfg().supportEmail)+'</a> to get access. You can keep using your own gateway account under Connector meanwhile.</div>';
    return;
  }
  if(ctx.gate||(ov.mode==='glime'&&!termsAccepted(ctx))){
    ctx.body.innerHTML=termsGate(ctx);
    bindGate(ctx);
    return;
  }
  const verified=ov.mode==='glime'&&kycStatus(ctx)==='verified';
  let h=heroHtml(ctx);
  h+=verified?methodBar(ctx):modeCards(ctx);
  if(ov.mode==='glime')h+=glimeArea(ctx);
  else if(ov.mode==='own')h+=ownArea(ctx);
  else h+=trustHtml();
  ctx.body.innerHTML=h;
  if(verified)showTab(ctx);
}

function kycStatus(ctx){return (ctx.ov&&ctx.ov.kyc&&ctx.ov.kyc.status)||'not_started';}

/* ---------- terms gate ---------- */
function termsKey(ctx){return 'gpay_terms_'+cfg().termsVersion+'_'+((ctx.state.client&&ctx.state.client.client_id)||'');}
/* The server answer (ov.terms.version) is the real record. sessionStorage is only a
   convenience so the gate does not reappear on every tab switch before the backend stores it. */
function termsAccepted(ctx){
  const t=ctx.ov&&ctx.ov.terms;
  if(t&&t.version===cfg().termsVersion)return true;
  try{return sessionStorage.getItem(termsKey(ctx))==='1';}catch(e){return false;}
}
function rememberTerms(ctx){try{sessionStorage.setItem(termsKey(ctx),'1');}catch(e){}}

function feeParts(ctx){
  const raw=ctx.ov&&ctx.ov.fee_bps;
  const total=Number(raw);
  if(raw==null||!isFinite(total))return null;
  const svc=Math.min(cfg().serviceBps,total);
  return {total:total,service:svc,gateway:Math.max(0,total-svc)};
}
function feeRows(p){
  return '<div class="gpay-fee"><span>Payment processing charges (incl. GST)</span><b>'+esc(pct(p.gateway))+'</b></div>'+
    '<div class="gpay-fee"><span>GLIME service fee</span><b>'+esc(pct(p.service))+'</b></div>'+
    '<div class="gpay-fee tot"><span>Total deducted from each payment</span><b>'+esc(pct(p.total))+'</b></div>';
}
function linksHtml(){
  const c=cfg();
  return '<a href="'+esc(c.termsUrl)+'" target="_blank" rel="noopener noreferrer" style="color:var(--cy)">Terms &amp; Conditions</a> · '+
    '<a href="'+esc(c.docsUrl)+'" target="_blank" rel="noopener noreferrer" style="color:var(--cy)">Payments Guide</a>';
}
function feeHtml(ctx){
  const p=feeParts(ctx);
  if(!p)return '';
  return '<section class="channel-card"><div class="channel-head"><div class="channel-name">Fee on each payment</div></div>'+
    feeRows(p)+'<p class="note">You receive the rest of every payment. '+linksHtml()+'</p></section>';
}

function termsGate(ctx){
  const c=cfg(),p=feeParts(ctx);
  const feeText=p
    ?esc(pct(p.total))+' of each payment (payment processing charges '+esc(pct(p.gateway))+' plus GLIME service fee '+esc(pct(p.service))+')'
    :'a fee on each payment (payment processing charges plus GLIME service fee '+esc(pct(c.serviceBps))+')';
  const items=[
    "GLIME collects your customers' payments through its regulated payment partners and passes your share to a payment account created for your business. GLIME is not a bank and does not keep your money as a wallet.",
    "You must complete a one-time KYC with true details (PAN, business and bank). Collecting payments starts only after it is verified.",
    "Fee: "+feeText+" is deducted automatically. You receive the net amount. GST and income tax are your own responsibility.",
    "Each payment is held for a short period to cover refunds and disputes before it becomes available.",
    "You can withdraw only what your own customers actually paid (after fee, refunds and amounts on hold), and only to your verified bank account. One withdrawal at a time, with a minimum amount.",
    "Refunds, disputes and chargebacks are deducted from your balance. If it is not enough, the shortfall is taken from future earnings or you pay it on request.",
    "Only lawful goods and services are allowed. Anything prohibited by law, our payment partners or the banks is not allowed.",
    "GLIME or its payment partners may hold payments, freeze withdrawals or suspend the service for risk, fraud or compliance reasons.",
    "Keep your login private. Anyone who can log in can request withdrawals. Report anything suspicious at once to "+esc(c.supportEmail)+".",
    "Your PAN and bank details go securely to our payment partner for verification. GLIME stores only the last 4 digits, your bank name and IFSC.",
    "If the Terms change, you must accept the new version before you continue. Fee increases need 30 days' notice.",
    "You can switch back to your own gateway account only when you have no balance, no payment on hold and no withdrawal in progress."
  ];
  return '<section class="channel-card gpay-gate">'+
    '<div class="channel-head"><div class="channel-name">GLIME Payments: Terms &amp; Conditions</div><span class="badge warn">Please read</span></div>'+
    '<p class="note" style="margin-top:0">Version '+esc(c.termsVersion)+'. Scroll the key terms below to the end to continue. Full text: '+linksHtml()+'.</p>'+
    (p?feeRows(p):'')+
    '<div class="gpay-terms-box" id="gpayTermsBox" tabindex="0" role="region" aria-label="Key terms"><ol>'+items.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ol></div>'+
    '<p class="note" id="gpayScrollHint" style="margin:0 0 6px">↓ Scroll to the end to unlock the checkboxes.</p>'+
    '<label class="gpay-check"><input type="checkbox" data-g="1" disabled><span style="font-weight:600">I have read and agree to the GLIME Payments Terms &amp; Conditions (version '+esc(c.termsVersion)+').</span></label>'+
    '<label class="gpay-check"><input type="checkbox" data-g="2" disabled><span style="font-weight:600">I understand that '+(p?esc(pct(p.total)):'the fee')+' is deducted from every payment (payment processing charges plus GLIME '+esc(pct(p?p.service:c.serviceBps))+') and that I receive only the net amount.</span></label>'+
    '<div class="gpay-msg" id="gpayMsg" role="alert"></div>'+
    '<div class="actions"><button class="btn primary" type="button" data-act="accept-terms" disabled>Accept and continue</button>'+
    '<button class="btn" type="button" data-act="cancel-gate">Cancel</button></div>'+
    '</section>';
}

function bindGate(ctx){
  const box=ctx.body.querySelector('#gpayTermsBox');
  if(!box)return;
  const check=function(){
    if(box.scrollTop+box.clientHeight>=box.scrollHeight-6){
      ctx.body.querySelectorAll('[data-g]').forEach(function(i){i.disabled=false;});
      const hint=ctx.body.querySelector('#gpayScrollHint');
      if(hint)hint.style.display='none';
    }
  };
  box.addEventListener('scroll',check);
  setTimeout(check,60);
}
function updateGate(ctx){
  const boxes=Array.prototype.slice.call(ctx.body.querySelectorAll('[data-g]'));
  const btn=ctx.body.querySelector('[data-act="accept-terms"]');
  if(btn)btn.disabled=!boxes.length||!boxes.every(function(i){return i.checked&&!i.disabled;});
}

async function activateGlime(ctx,btn,record){
  const msg=ctx.body.querySelector('#gpayMsg');
  const fail=function(t){if(msg)msg.textContent=t;else ctx.ui.toast(t,true);};
  btn.disabled=true;
  try{
    if(record){
      try{
        await rpc(ctx.api,'accept_my_payments_terms',{p_version:cfg().termsVersion});
      }catch(e){
        const m=String((e&&(e.message||e.code))||'');
        const missing=e&&(e.code==='PGRST202'||e.code==='42883'||/could not find the function|does not exist/i.test(m));
        if(!missing)throw e;
      }
      rememberTerms(ctx);
    }
    if(!ctx.ov||ctx.ov.mode!=='glime')await rpc(ctx.api,'set_my_payment_mode',{p_mode:'glime'});
    ctx.gate=false;
    ctx.ui.toast('GLIME Payments selected');
    await load(ctx);
  }catch(e){
    console.error('GLIME Payments start error:',e&&e.message);
    if(String((e&&e.message)||'').indexOf('NOT_AUTHENTICATED')!==-1){location.href='login.html';return;}
    btn.disabled=false;
    fail(errText(e,'Could not continue. Please try again.'));
  }
}

/* ---------- inactivity: sensitive KYC fields are cleared after a while ---------- */
function wipeSensitive(ctx){
  const keys=['pan','owner_pan','account_number','account_number2','ifsc','account_holder'];
  let had=false;
  keys.forEach(function(k){if(ctx.form[k]){had=true;delete ctx.form[k];}});
  if(!had||!ctx.body||!ctx.body.isConnected)return;
  if(ctx.step===3)ctx.step=2;
  const host=ctx.body.querySelector('#gpayKyc');
  if(host){
    host.innerHTML=kycForm(ctx);
    const m=ctx.body.querySelector('#gpayMsg');
    if(m)m.textContent='For your security, the PAN and bank fields were cleared after a period of inactivity.';
  }
}
function bumpIdle(ctx){
  clearTimeout(ctx.idle);
  ctx.idle=setTimeout(function(){wipeSensitive(ctx);},cfg().idleMs);
}

/* ---------- mode selection ---------- */
function modeCards(ctx){
  const ov=ctx.ov,m=ov.mode;
  const p=feeParts(ctx);
  const feeLine=p?' Total fee: '+esc(pct(p.total))+' per payment (processing charges plus GLIME '+esc(pct(p.service))+').':'';
  return `<div class="gpay-opts">
    <div class="gpay-opt ${m==='glime'?'sel':'rec'}">
      <div class="gpay-opt-t">GLIME Payments ${m==='glime'?'':'<span class="gpay-tag">RECOMMENDED</span>'}</div>
      <p>No gateway account needed. Complete a one-time KYC, collect payments through GLIME and get paid to your bank.${feeLine} ${linksHtml()}</p>
      ${m==='glime'?'<span class="badge on">● Active</span>':'<button class="btn primary" type="button" data-act="start-glime">Use GLIME Payments</button>'}
    </div>
    <div class="gpay-opt ${m==='own'?'sel':''}">
      <div class="gpay-opt-t">My own gateway account</div>
      <p>Already have a payment gateway account? Connect it under Connector and customers pay straight into it. ${ov.own_razorpay_connected?'Your account is connected.':'It settles on your gateway\'s own schedule.'}</p>
      ${m==='own'?'<span class="badge on">● Active</span>':'<button class="btn" type="button" data-act="mode" data-mode="own">Use my own account</button>'}
    </div>
  </div>`;
}

/* Once GLIME Payments is verified and running, the picker shrinks to one line. */
function methodBar(){
  return '<div class="gpay-bar"><span>Payment method: <b>GLIME Payments</b></span>'+
    '<button class="gpay-link" type="button" data-act="mode" data-mode="own">Switch to my own gateway account</button></div>';
}

function ownArea(){
  return `<section class="channel-card">
    <div class="row-info"><b>You are using your own gateway account</b>
    <small>Payments go directly to your gateway account and settle on its schedule. Manage the connection under Connector.</small></div>
    <div class="actions"><button class="btn primary" type="button" data-act="goto-connector">Open Connector</button></div>
  </section>`;
}

/* ---------- GLIME Payments: KYC or dashboard ---------- */
function glimeArea(ctx){
  const st=kycStatus(ctx),k=ctx.ov.kyc||{};
  if(st==='verified')return dashboard(ctx);

  if(st==='submitted'||st==='under_review'){
    const stage=st==='submitted'?0:1;
    const names=['Submitted','Under review','Verified'];
    const bar='<div class="gpay-steps">'+names.map(function(n,i){return '<span class="'+(i<stage?'done':(i===stage?'on':''))+'">'+(i<stage?'✓ ':'')+esc(n)+'</span>';}).join('')+'</div>';
    return `<section class="channel-card">
      <div class="channel-head"><div class="channel-name">KYC verification</div>${badge(KYC_STATUS,st)}</div>
      ${bar}
      <p class="note" style="margin-top:0">Your details are with our payment partner for verification. This usually takes 1 to 3 working days. You can collect payments as soon as it is verified. This page updates by itself.</p>
      <p class="note">Submitted on ${esc(fmtDate(k.submitted_at))}</p>
    </section>`;
  }
  if(st==='suspended'){
    return `<section class="channel-card">
      <div class="channel-head"><div class="channel-name">GLIME Payments</div>${badge(KYC_STATUS,st)}</div>
      <p class="note" style="margin-top:0">GLIME Payments is paused for your account. Please contact <a href="mailto:${esc(cfg().supportEmail)}" style="color:var(--cy)">${esc(cfg().supportEmail)}</a>.</p>
    </section>`;
  }
  /* not_started, needs_info, rejected: show the form */
  let notice='';
  if(st==='needs_info'||st==='rejected'){
    notice=`<div class="channel-card" style="border-color:rgba(255,209,102,.38)">
      <div class="channel-head"><div class="channel-name">${st==='rejected'?'KYC was not approved':'More information needed'}</div>${badge(KYC_STATUS,st)}</div>
      <p class="note" style="margin-top:0">${esc(k.reason||'Please re-check your details and submit again.')}</p>
    </div>`;
  }
  if(!ctx.form.business_type&&!ctx.formReady){
    const p=k.prefill||{};
    ctx.form={
      legal_name:p.legal_name||'',
      display_name:(ctx.state.client&&(ctx.state.client.business_name||ctx.state.client.name))||'',
      email:p.email||'',phone:p.phone||''
    };
    ctx.formReady=true;
  }
  const intro=st==='not_started'?`<section class="channel-card"><div class="channel-head"><div class="channel-name">How it works</div></div>
    <div class="gpay-flow">
      <div><i>1</i><b>Verify once</b><small>Takes about 3 minutes. Review takes 1 to 3 working days.</small></div>
      <div><i>2</i><b>Customers pay in chat</b><small>Payment links go out on WhatsApp and Instagram.</small></div>
      <div><i>3</i><b>Get paid</b><small>See every payment and receive it in your bank account.</small></div>
    </div></section>`:'';
  return notice+intro+'<section class="channel-card" id="gpayKyc">'+kycForm(ctx)+'</section>';
}

function fld(ctx,name,label,o){
  o=o||{};
  const v=ctx.form[name]==null?'':ctx.form[name];
  return `<label class="gpay-fld ${o.full?'full':''}"><span>${esc(label)}</span>
    <input class="gpay-input" data-f="${name}" type="${o.type||'text'}" value="${esc(v)}" placeholder="${esc(o.ph||'')}"
      ${o.max?'maxlength="'+o.max+'"':''} ${o.mode?'inputmode="'+o.mode+'"':''} autocomplete="off" autocapitalize="off" spellcheck="false">
    ${o.hint?'<small>'+esc(o.hint)+'</small>':''}</label>`;
}
function sel(ctx,name,label,options,o){
  o=o||{};
  const v=ctx.form[name]||'';
  return `<label class="gpay-fld ${o.full?'full':''}"><span>${esc(label)}</span>
    <select class="gpay-input" data-f="${name}"><option value="">Select…</option>
    ${options.map(x=>{const val=Array.isArray(x)?x[0]:x,lab=Array.isArray(x)?x[1]:x;return `<option value="${esc(val)}" ${v===val?'selected':''}>${esc(lab)}</option>`;}).join('')}
    </select></label>`;
}

function reviewHtml(ctx){
  const f=ctx.form,company=COMPANY_TYPES.indexOf(f.business_type)!==-1;
  const row=(a,b)=>'<dt>'+a+'</dt><dd>'+b+'</dd>';
  const addr=[T(f.address_line1),T(f.address_line2),T(f.city),f.state,T(f.pincode)].filter(Boolean).join(', ');
  return '<dl class="gpay-kv">'+
    row('Business',esc(f.display_name)+' ('+esc(bizType(f.business_type))+')')+
    row('Legal name',esc(f.legal_name))+
    row(company?'Business PAN':'PAN','•••••'+esc(T(f.pan).slice(-4)))+
    (company?row('Authorised PAN','•••••'+esc(T(f.owner_pan).slice(-4))):'')+
    (T(f.gstin)?row('GSTIN',esc(f.gstin)):'')+
    row('Contact',esc(f.contact_name)+' · '+esc(f.phone))+
    row('Email',esc(f.email))+
    row('Address',esc(addr))+
    row('Account holder',esc(f.account_holder))+
    row('Account number','••••••'+esc(T(f.account_number).slice(-4)))+
    row('IFSC',esc(f.ifsc))+
  '</dl>'+
  `<label class="gpay-check"><input type="checkbox" data-f="consent" ${f.consent?'checked':''}>
    <span style="font-weight:600">I confirm these details are correct and authorise GLIME and its payment partner to verify my identity and bank account. I have accepted the GLIME Payments Terms &amp; Conditions.</span></label>`;
}

function kycForm(ctx){
  const f=ctx.form,step=ctx.step;
  const bar='<div class="gpay-steps">'+STEP_NAMES.map((n,i)=>`<span class="${i===step?'on':(i<step?'done':'')}">${i<step?'✓':(i+1)+'.'} ${n}</span>`).join('')+'</div>';
  let body='';
  if(step===0){
    const company=COMPANY_TYPES.indexOf(f.business_type)!==-1;
    body=sel(ctx,'business_type','Business type',BUSINESS_TYPES)+
      sel(ctx,'business_category','Business category',CATEGORIES)+
      fld(ctx,'legal_name','Legal name (as on PAN)',{ph:'Name on your PAN card'})+
      fld(ctx,'display_name','Business display name',{ph:'Name your customers know'})+
      fld(ctx,'pan',company?'Business PAN':'PAN',{ph:'ABCDE1234F',max:10,hint:company?'PAN of the firm or company.':'Your personal PAN.'})+
      (company?fld(ctx,'owner_pan',"Authorised person's PAN",{ph:'ABCDE1234F',max:10,hint:'Director or partner who signs for the business.'}):'')+
      fld(ctx,'gstin','GSTIN (optional)',{ph:'Leave empty if you do not have one',max:15,full:!company});
  }else if(step===1){
    body=fld(ctx,'contact_name','Contact person name',{})+
      fld(ctx,'email','Email',{type:'email',ph:'you@business.com'})+
      fld(ctx,'phone','Mobile number',{type:'tel',mode:'numeric',max:10,ph:'10 digit number'})+
      fld(ctx,'address_line1','Address line 1',{full:true,ph:'Shop / house, street'})+
      fld(ctx,'address_line2','Address line 2 (optional)',{full:true})+
      fld(ctx,'city','City',{})+
      sel(ctx,'state','State',STATES)+
      fld(ctx,'pincode','Pincode',{mode:'numeric',max:6});
  }else if(step===2){
    body=fld(ctx,'account_holder','Account holder name',{full:true,hint:'Must match the name on the bank account.'})+
      fld(ctx,'account_number','Bank account number',{type:'password',mode:'numeric',max:18})+
      fld(ctx,'account_number2','Confirm account number',{type:'password',mode:'numeric',max:18})+
      fld(ctx,'ifsc','IFSC code',{ph:'HDFC0001234',max:11,full:true});
  }else{
    body='<div class="gpay-fld full">'+reviewHtml(ctx)+'</div>';
  }
  const back=step>0?'<button class="btn" type="button" data-act="back">Back</button>':'';
  const next=step<3?'<button class="btn primary" type="button" data-act="next">'+(step===2?'Review details':'Continue')+'</button>'
    :'<button class="btn primary" type="button" data-act="submit-kyc">Submit for verification</button>';
  return `<div class="channel-head"><div class="channel-name">Verify your business</div>${badge(KYC_STATUS,kycStatus(ctx))}</div>
    ${bar}<div class="gpay-form">${body}</div>
    <div class="gpay-msg" id="gpayMsg" role="alert"></div>
    <div class="actions">${back}${next}</div>
    <p class="note">${ic('shield',13)} Your PAN and bank details are sent securely to our payment partner for verification. GLIME stores only the last 4 digits.</p>`;
}

function rerenderKyc(ctx){
  const host=ctx.body.querySelector('#gpayKyc');
  if(host)host.innerHTML=kycForm(ctx);
}

/* Returns null when the step is fine, otherwise {f:field, m:message}. */
function validate(ctx,step){
  const f=ctx.form;
  if(step===0){
    if(!f.business_type)return {f:'business_type',m:'Choose your business type.'};
    if(!f.business_category)return {f:'business_category',m:'Choose a business category.'};
    if(T(f.legal_name).length<3)return {f:'legal_name',m:'Enter your legal name as on the PAN.'};
    if(T(f.display_name).length<2)return {f:'display_name',m:'Enter your business display name.'};
    if(!PAN_RE.test(T(f.pan)))return {f:'pan',m:'Enter a valid PAN, for example ABCDE1234F.'};
    if(COMPANY_TYPES.indexOf(f.business_type)!==-1&&!PAN_RE.test(T(f.owner_pan)))return {f:'owner_pan',m:"Enter the authorised person's PAN."};
    if(T(f.gstin)&&!GST_RE.test(T(f.gstin)))return {f:'gstin',m:'The GSTIN looks invalid. Leave it empty if you do not have one.'};
  }else if(step===1){
    if(T(f.contact_name).length<2)return {f:'contact_name',m:'Enter the contact person name.'};
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(T(f.email)))return {f:'email',m:'Enter a valid email address.'};
    if(!/^[6-9][0-9]{9}$/.test(T(f.phone)))return {f:'phone',m:'Enter a valid 10 digit mobile number.'};
    if(T(f.address_line1).length<5)return {f:'address_line1',m:'Enter your address.'};
    if(T(f.city).length<2)return {f:'city',m:'Enter your city.'};
    if(!f.state)return {f:'state',m:'Choose your state.'};
    if(!/^[1-9][0-9]{5}$/.test(T(f.pincode)))return {f:'pincode',m:'Enter a valid 6 digit pincode.'};
  }else if(step===2){
    if(T(f.account_holder).length<3)return {f:'account_holder',m:'Enter the account holder name.'};
    if(!/^[0-9]{9,18}$/.test(T(f.account_number)))return {f:'account_number',m:'Enter a valid bank account number (9 to 18 digits).'};
    if(T(f.account_number)!==T(f.account_number2))return {f:'account_number2',m:'The two account numbers do not match.'};
    if(!IFSC_RE.test(T(f.ifsc)))return {f:'ifsc',m:'Enter a valid IFSC code, for example HDFC0001234.'};
  }else{
    if(!f.consent)return {f:'consent',m:'Please confirm the details to continue.'};
  }
  return null;
}
function firstProblem(ctx){
  for(let s=0;s<=3;s++){
    const p=validate(ctx,s);
    if(p)return Object.assign({step:s},p);
  }
  return null;
}
function showErr(ctx,p){
  const msg=ctx.body.querySelector('#gpayMsg');
  if(msg)msg.textContent=p.m;
  const el=ctx.body.querySelector('[data-f="'+p.f+'"]');
  if(el){
    el.classList.add('bad');
    el.setAttribute('aria-invalid','true');
    try{el.focus();}catch(e){}
  }
}

async function submitKyc(ctx,btn){
  const f=ctx.form;
  const company=COMPANY_TYPES.indexOf(f.business_type)!==-1;
  const payload={
    action:'submit',
    business_type:f.business_type,
    business_category:f.business_category,
    legal_name:T(f.legal_name),
    display_name:T(f.display_name),
    pan:T(f.pan),
    owner_pan:company?T(f.owner_pan):T(f.pan),
    gstin:T(f.gstin)||null,
    contact_name:T(f.contact_name),
    email:T(f.email),
    phone:T(f.phone),
    address:{line1:T(f.address_line1),line2:T(f.address_line2),city:T(f.city),state:f.state,pincode:T(f.pincode)},
    bank:{account_holder:T(f.account_holder),account_number:T(f.account_number),ifsc:T(f.ifsc)},
    consent:{accepted:true,version:cfg().termsVersion,at:new Date().toISOString()}
  };
  btn.disabled=true;btn.textContent='Submitting…';
  const msg=ctx.body.querySelector('#gpayMsg');
  try{
    const sess=await ctx.api.supabase.auth.getSession();
    const token=sess&&sess.data&&sess.data.session&&sess.data.session.access_token;
    if(!token)throw new Error('NOT_AUTHENTICATED');
    const base=(ctx.api.supabase.supabaseUrl)||FALLBACK_URL;
    const res=await fetch(base+KYC_FN,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'apikey':ctx.api.supabase.supabaseKey},
      body:JSON.stringify(payload)
    });
    let j={};
    try{j=await res.json();}catch(e){}
    if(!res.ok||j.ok===false)throw new Error(j.error||j.code||'KYC_FAILED');
    clearTimeout(ctx.idle);
    ctx.form={};ctx.formReady=false;ctx.step=0;
    ctx.ui.toast('KYC submitted for verification');
    await load(ctx);
  }catch(e){
    console.error('GLIME Payments KYC error:',e&&e.message);
    if(String((e&&e.message)||'').indexOf('NOT_AUTHENTICATED')!==-1){location.href='login.html';return;}
    if(!ctx.body.isConnected)return;
    btn.disabled=false;btn.textContent='Submit for verification';
    if(msg)msg.textContent=errText(e,'Could not submit your KYC. Please check your details and try again.');
  }
}

/* ---------- dashboard ---------- */
function dashboard(ctx){
  const tabs=[['overview','Overview'],['payments','Payments'],['payouts','Payouts'],['account','Account']];
  return `<div class="gpay-tabs" role="tablist" aria-label="GLIME Payments">${tabs.map(t=>`<button type="button" role="tab" aria-selected="${ctx.tab===t[0]}" class="${ctx.tab===t[0]?'active':''}" data-act="tab" data-tab="${t[0]}">${t[1]}</button>`).join('')}
    <button type="button" class="gpay-refresh" data-act="refresh" aria-label="Refresh">↻ Refresh</button></div>
    <div id="gpayTab"></div>`;
}

function showTab(ctx){
  const host=ctx.body.querySelector('#gpayTab');
  if(!host)return;
  ctx.body.querySelectorAll('[data-act="tab"]').forEach(b=>{
    const on=b.dataset.tab===ctx.tab;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  if(ctx.tab==='overview')host.innerHTML=overviewHtml(ctx);
  else if(ctx.tab==='account')host.innerHTML=accountHtml(ctx);
  else{
    host.innerHTML='<section class="channel-card" id="gpayList"></section>';
    if(!ctx.lists[ctx.tab].rows.length&&!ctx.lists[ctx.tab].done)loadList(ctx,ctx.tab,true);
    else paintList(ctx,ctx.tab);
  }
}

function overviewHtml(ctx){
  const ov=ctx.ov,b=ov.balances||{};
  const stat=(l,v,hi)=>`<div class="gpay-stat ${hi?'hi':''}"><small>${l}</small><b>${money(v)}</b></div>`;
  const pending=ov.pending_payout;
  const bank=esc((ov.kyc&&ov.kyc.bank_name)||'your bank');
  const last4=esc((ov.kyc&&ov.kyc.bank_last4)||'••••');
  const hold=Number(b.hold_paise)||0;
  let hero='';
  if(ov.payout_mode==='withdraw'){
    const min=Number(ov.min_payout_paise)||0;
    hero=`<section class="gpay-balance">
      <small class="k">AVAILABLE TO WITHDRAW</small>
      <div class="gpay-big">${money(b.available_paise)}</div>
      ${hold?'<div class="sub">'+money(hold)+' more is on hold and will become available soon.</div>':''}
      ${pending?`<p class="note">A withdrawal of ${money(pending.amount_paise)} is ${esc(pending.status)}. You can request another once it finishes.</p>`:`
      <div class="gpay-wd">
        <input class="gpay-input" id="gpayAmt" type="text" inputmode="decimal" placeholder="Amount in ₹" autocomplete="off" aria-label="Withdrawal amount in rupees">
        <button class="btn" type="button" data-act="max">Max</button>
        <button class="btn primary" type="button" data-act="withdraw">Withdraw</button>
      </div>
      <div class="gpay-msg" id="gpayMsg" role="alert"></div>`}
      <p class="note">${min?'Minimum withdrawal '+money(min)+'. ':''}Money goes to ${bank} account ending ${last4}. You can only withdraw what you have actually received.</p>
    </section>`;
  }else{
    hero=`<section class="gpay-balance">
      <small class="k">SETTLEMENT BALANCE</small>
      <div class="gpay-big">${money(b.available_paise)}</div>
      <p class="note">Earnings are settled to your bank account ending ${last4} automatically${ov.settlement_days?', about '+esc(ov.settlement_days)+' working days after each payment':''}. No action is needed.</p>
    </section>`;
  }
  return hero+`<div class="gpay-grid">
    ${stat('TOTAL RECEIVED',b.gross_paise)}
    ${stat('FEES DEDUCTED',b.fee_paise)}
    ${stat('REFUNDED',b.refunded_paise)}
    ${stat('YOUR NET EARNINGS',b.net_paise,true)}
    ${stat(ov.payout_mode==='withdraw'?'WITHDRAWN':'SETTLED',b.withdrawn_paise)}
    ${stat('ON HOLD',b.hold_paise)}
  </div>${feeHtml(ctx)}
  <p class="note">Available = net earnings − already withdrawn − amount on hold. Held amounts are released after the hold period or a refund window.</p>`;
}

function accountHtml(ctx){
  const k=ctx.ov.kyc||{};
  const row=(a,b)=>`<dt>${a}</dt><dd>${b}</dd>`;
  return `<section class="channel-card">
    <div class="channel-head"><div class="channel-name">KYC and bank account</div>${badge(KYC_STATUS,k.status||'not_started')}</div>
    <dl class="gpay-kv">
      ${row('Legal name',esc(k.legal_name||'—'))}
      ${row('Business type',esc(bizType(k.business_type)))}
      ${row('PAN','•••••'+esc(k.pan_last4||'••••'))}
      ${row('Bank',esc(k.bank_name||'—'))}
      ${row('Account number','••••••'+esc(k.bank_last4||'••••'))}
      ${row('IFSC',esc(k.bank_ifsc||'—'))}
      ${row('Verified on',esc(fmtDate(k.verified_at)))}
    </dl>
    <p class="note">To change your bank account or business details, write to <a href="mailto:${esc(cfg().supportEmail)}" style="color:var(--cy)">${esc(cfg().supportEmail)}</a>. Changes need fresh verification.</p>
  </section>`;
}

/* ---------- lists ---------- */
async function loadList(ctx,kind,reset){
  const st=ctx.lists[kind];
  if(st.loading)return;
  if(reset){st.rows=[];st.done=false;}
  st.loading=true;st.error='';
  paintList(ctx,kind);
  try{
    const isPay=kind==='payments';
    const data=await rpc(ctx.api,isPay?'list_my_gateway_payments':'list_my_payouts',
      isPay?{p_limit:PAGE,p_offset:st.rows.length,p_status:st.filter||null}:{p_limit:PAGE,p_offset:st.rows.length});
    const rows=Array.isArray(data)?data:[];
    st.rows=st.rows.concat(rows);
    st.done=rows.length<PAGE;
  }catch(e){
    console.error('GLIME Payments list error:',e&&e.message);
    st.error=errText(e,'Could not load this list.');
  }
  st.loading=false;
  paintList(ctx,kind);
}

function paintList(ctx,kind){
  if(ctx.tab!==kind)return;
  const host=ctx.body.querySelector('#gpayList');
  if(!host)return;
  const st=ctx.lists[kind];
  let h='';
  if(kind==='payments'){
    h+='<div class="channel-head"><div class="channel-name">Payments received</div></div>'+
      '<div class="gpay-chips" role="group" aria-label="Filter payments">'+
      PAY_FILTERS.map(function(x){return '<button type="button" data-act="pfilter" data-v="'+esc(x[0])+'" class="'+(st.filter===x[0]?'active':'')+'">'+esc(x[1])+'</button>';}).join('')+'</div>';
  }else{
    h+='<div class="channel-head"><div class="channel-name">Withdrawal history</div></div>';
  }
  if(st.error){
    h+='<div class="error">'+esc(st.error)+'</div><div class="actions"><button class="btn" type="button" data-act="retry-list" data-kind="'+kind+'">Try again</button></div>';
  }
  if(!st.rows.length&&!st.loading&&!st.error){
    h+='<div class="gpay-empty">'+ic('empty',34)+(kind==='payments'?'No payments yet.<br>They appear here as soon as customers pay.':'No withdrawals yet.')+'</div>';
  }
  h+=st.rows.map(r=>kind==='payments'?payItem(r):outItem(r)).join('');
  if(st.loading)h+='<div class="loading">Loading…</div>';
  else if(!st.done&&st.rows.length)h+=`<div class="actions"><button class="btn" type="button" data-act="more" data-kind="${kind}">Load more</button></div>`;
  host.innerHTML=h;
}

function payItem(r){
  const sub=[fmtDate(r.created_at),r.channel||''].filter(Boolean).join(' · ');
  return `<div class="gpay-item"><div class="l"><b>${esc(r.order_ref||r.customer_name||'Payment')}</b>
    <small>${esc(sub)}</small>
    <small>${money(r.gross_paise)} − fee ${money(r.fee_paise)}${Number(r.refunded_paise)?' − refund '+money(r.refunded_paise):''}</small></div>
    <div class="r"><b>${money(r.net_paise)}</b>${badge(PAY_STATUS,r.status)}</div></div>`;
}
function outItem(r){
  const sub=[fmtDate(r.requested_at||r.created_at),r.utr?'UTR '+r.utr:''].filter(Boolean).join(' · ');
  return `<div class="gpay-item"><div class="l"><b>Withdrawal</b><small>${esc(sub)}</small>
    ${r.failure_reason?'<small style="color:var(--rd)">'+esc(r.failure_reason)+'</small>':''}</div>
    <div class="r"><b>${money(r.amount_paise)}</b>${badge(PAYOUT_STATUS,r.status)}</div></div>`;
}

/* ---------- withdraw ---------- */
async function withdraw(ctx,btn){
  const ov=ctx.ov,b=ov.balances||{};
  const msg=ctx.body.querySelector('#gpayMsg');
  const input=ctx.body.querySelector('#gpayAmt');
  const say=t=>{if(msg)msg.textContent=t||'';};
  say('');
  const raw=T(input&&input.value).replace(/[₹,\s]/g,'');
  if(!/^\d+(\.\d{1,2})?$/.test(raw)){say('Enter a valid amount.');return;}
  const paise=Math.round(parseFloat(raw)*100);
  const min=Number(ov.min_payout_paise)||0;
  if(paise<=0){say('Enter a valid amount.');return;}
  if(min&&paise<min){say('Minimum withdrawal is '+money(min)+'.');return;}
  if(paise>(Number(b.available_paise)||0)){say('This is more than your available balance of '+money(b.available_paise)+'.');return;}
  /* Re-read the balance from the server right before asking for confirmation. */
  try{
    const fresh=norm(await rpc(ctx.api,'get_my_payments_overview'));
    if(fresh)ctx.ov=fresh;
  }catch(e){
    say(errText(e,'Could not verify your balance. Please try again.'));
    return;
  }
  const avail=Number(((ctx.ov&&ctx.ov.balances)||{}).available_paise)||0;
  if(paise>avail){say('Your available balance is now '+money(avail)+'. Please enter a smaller amount.');return;}
  const ok=await ctx.ui.confirm('Withdraw '+money(paise)+' to your bank account ending '+((ov.kyc&&ov.kyc.bank_last4)||'••••')+'?',{title:'Confirm withdrawal',confirmText:'Withdraw'});
  if(!ok)return;
  if(ctx.wdKeyAmount!==paise){ctx.wdKey=newKey();ctx.wdKeyAmount=paise;}
  btn.disabled=true;
  try{
    await rpc(ctx.api,'request_my_payout',{p_amount_paise:paise,p_idempotency_key:ctx.wdKey});
    ctx.wdKey=newKey();ctx.wdKeyAmount=0;
    ctx.ui.toast('Withdrawal requested');
    ctx.lists.payouts.rows=[];ctx.lists.payouts.done=false;
    await load(ctx);
  }catch(e){
    console.error('GLIME Payments withdraw error:',e&&e.message);
    if(!ctx.body.isConnected)return;
    btn.disabled=false;
    say(errText(e,'Could not request the withdrawal. Please try again.'));
  }
}

/* ---------- events ---------- */
async function onClick(ctx,e){
  const el=e.target.closest('[data-act]');
  if(!el||el.tagName==='SELECT')return;
  const act=el.dataset.act;

  if(act==='goto-connector'){
    const b=document.querySelector('[data-module="connector"]');
    if(b)b.click();
    return;
  }
  if(act==='start-glime'){
    if(!termsAccepted(ctx)){ctx.gate=true;draw(ctx);try{ctx.body.scrollIntoView({block:'start'});}catch(x){}return;}
    if(!(await ctx.ui.confirm('Use GLIME Payments? You will complete a one-time KYC. Customer payments will then be collected through GLIME instead of your own gateway account.',{title:'Change payment method',confirmText:'Continue'})))return;
    await activateGlime(ctx,el,false);
    return;
  }
  if(act==='accept-terms'){await activateGlime(ctx,el,true);return;}
  if(act==='cancel-gate'){
    if(ctx.ov&&ctx.ov.mode==='glime'){
      const b=document.querySelector('[data-module="channels"]');
      if(b)b.click();
      return;
    }
    ctx.gate=false;draw(ctx);return;
  }
  if(act==='mode'){
    const m=el.dataset.mode;
    const text=m==='glime'
      ?'Use GLIME Payments? You will complete a one-time KYC. Customer payments will then be collected through GLIME instead of your own gateway account.'
      :'Switch back to your own gateway account? You can only switch when you have no balance, held payments or pending withdrawals.';
    if(!(await ctx.ui.confirm(text,{title:'Change payment method',confirmText:'Continue'})))return;
    el.disabled=true;
    try{
      await rpc(ctx.api,'set_my_payment_mode',{p_mode:m});
      ctx.ui.toast('Payment method updated');
      await load(ctx);
    }catch(err){
      console.error('GLIME Payments mode error:',err&&err.message);
      el.disabled=false;
      ctx.ui.toast(errText(err,'Could not change the payment method.'),true);
    }
    return;
  }
  if(act==='next'||act==='back'){
    if(act==='next'){
      const problem=validate(ctx,ctx.step);
      if(problem){showErr(ctx,problem);return;}
      ctx.step=Math.min(3,ctx.step+1);
    }else ctx.step=Math.max(0,ctx.step-1);
    rerenderKyc(ctx);
    const host=ctx.body.querySelector('#gpayKyc');
    if(host){try{host.scrollIntoView({block:'start',behavior:'smooth'});}catch(x){}}
    return;
  }
  if(act==='submit-kyc'){
    const problem=firstProblem(ctx);
    if(problem){
      if(problem.step!==ctx.step){ctx.step=problem.step;rerenderKyc(ctx);}
      showErr(ctx,problem);
      return;
    }
    await submitKyc(ctx,el);
    return;
  }
  if(act==='tab'){ctx.tab=el.dataset.tab;showTab(ctx);return;}
  if(act==='refresh'){await load(ctx);return;}
  if(act==='more'){loadList(ctx,el.dataset.kind,false);return;}
  if(act==='retry-list'){loadList(ctx,el.dataset.kind,true);return;}
  if(act==='pfilter'){
    ctx.lists.payments.filter=el.dataset.v||'';
    loadList(ctx,'payments',true);
    return;
  }
  if(act==='max'){
    const i=ctx.body.querySelector('#gpayAmt');
    const a=Number((ctx.ov.balances||{}).available_paise)||0;
    if(i)i.value=(a/100).toFixed(2);
    return;
  }
  if(act==='withdraw'){await withdraw(ctx,el);return;}
}

function onInput(ctx,e){
  const t=e.target;
  if(!t||!t.dataset||!t.dataset.f||t.type==='checkbox'||t.tagName==='SELECT')return;
  const name=t.dataset.f;
  let v=t.value;
  if(name==='pan'||name==='owner_pan'||name==='ifsc'||name==='gstin'){
    v=v.toUpperCase().replace(/\s/g,'');
    if(v!==t.value)t.value=v;
  }else if(name==='phone'||name==='pincode'||name==='account_number'||name==='account_number2'){
    v=v.replace(/\D/g,'');
    if(v!==t.value)t.value=v;
  }
  ctx.form[name]=v;
  if(t.classList.contains('bad')){
    t.classList.remove('bad');
    t.removeAttribute('aria-invalid');
    const m=ctx.body.querySelector('#gpayMsg');
    if(m)m.textContent='';
  }
  bumpIdle(ctx);
}

function onChange(ctx,e){
  const t=e.target;
  if(!t)return;
  if(t.dataset&&t.dataset.g){updateGate(ctx);return;}
  if(t.dataset&&t.dataset.f){
    const name=t.dataset.f;
    ctx.form[name]=t.type==='checkbox'?t.checked:t.value;
    if(t.classList&&t.classList.contains('bad')){t.classList.remove('bad');t.removeAttribute('aria-invalid');}
    if(name==='business_type')rerenderKyc(ctx);
  }
}

S.register({
  id:'payments',
  label:'GLIME Payments',
  order:55,
  render:render
});
})();
