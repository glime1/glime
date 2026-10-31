/* =========================================================
   GLIME SETTINGS — PAYMENTS MODULE
   ---------------------------------------------------------
   Registers Settings > Payments through window.GLIME_SETTINGS.
   Frontend only. Every number comes from the backend; the browser never
   decides a balance or a withdrawal limit. Spec: PAYMENTS_BACKEND_SPEC.md

   Two ways to collect customer payments:
   - "own"   : client's own Razorpay account (Settings > Connector). Nothing to do here.
   - "glime" : GLIME Payments (Razorpay Route). One-time KYC, then the client sees
               payments received, GLIME fee, net earnings and withdraws only
               what was actually received.

   Backend calls (see the spec):
   RPC   get_my_payments_overview()
   RPC   set_my_payment_mode(p_mode)
   RPC   list_my_gateway_payments(p_limit,p_offset,p_status)
   RPC   list_my_payouts(p_limit,p_offset)
   RPC   request_my_payout(p_amount_paise,p_idempotency_key)
   Edge  POST /functions/v1/glime-payments-kyc   (PAN and bank details go here only)

   Sensitive data rule: PAN, bank account number and IFSC are kept in memory
   only while the form is open. Nothing is written to localStorage, the URL or
   the console, and the form is wiped after a successful submit.

   Deep link: settings.html#payments

   Terms gate: choosing "GLIME Payments" first opens the Terms & Conditions
   (glime-payments-terms.html). The client must scroll to the end, tick both
   boxes and accept. The accepted version comes from glime-payments-config.js
   (loaded by this file). Acceptance is recorded with the optional RPC
   accept_my_payments_terms(p_version); the KYC call also carries the version.
   Fee shown = payment_accounts.fee_bps, split into Razorpay charges and the
   GLIME service fee (serviceBps in the config).
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
  return fallback||'Something went wrong. Please try again.';
}
function badge(map,key){
  const x=map[key]||[String(key||'—'),'off'];
  return '<span class="badge '+x[1]+'">'+esc(x[0])+'</span>';
}
function norm(d){return Array.isArray(d)?(d[0]||null):d;}

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
.gpay-opts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px}
.gpay-opt{background:var(--surf);border:1px solid var(--bd);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.gpay-opt.sel{border-color:rgba(80,245,168,.45)}
.gpay-opt-t{font-weight:800;font-size:.92rem}
.gpay-opt p{color:var(--mu);font-size:.74rem;line-height:1.5;flex:1}
.gpay-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:15px}
.gpay-stat{background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:14px}
.gpay-stat small{display:block;color:var(--mu);font-size:.66rem;font-weight:800;letter-spacing:.07em}
.gpay-stat b{display:block;font-size:1.12rem;margin-top:4px}
.gpay-stat.hi{border-color:rgba(80,245,168,.4)}
.gpay-stat.hi b{color:var(--gr)}
.gpay-tabs{display:flex;gap:7px;overflow:auto;margin-bottom:14px;align-items:center}
.gpay-tabs button{flex:none;border:1px solid var(--bd);background:transparent;color:var(--mu);padding:8px 12px;border-radius:9px;font-size:.74rem;font-weight:800}
.gpay-tabs button.active{color:var(--cy);border-color:rgba(82,232,255,.35);background:rgba(82,232,255,.07)}
.gpay-tabs .gpay-refresh{margin-left:auto}
.gpay-steps{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.gpay-steps span{font-size:.7rem;font-weight:800;padding:5px 11px;border-radius:99px;border:1px solid var(--bd);color:var(--mu)}
.gpay-steps span.on{color:var(--cy);border-color:rgba(82,232,255,.4)}
.gpay-steps span.done{color:var(--gr);border-color:rgba(80,245,168,.35)}
.gpay-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.gpay-fld{display:flex;flex-direction:column;gap:5px;min-width:0}
.gpay-fld.full{grid-column:1/-1}
.gpay-fld span{font-size:.72rem;font-weight:800}
.gpay-fld small{color:var(--mu);font-size:.66rem}
.gpay-input{width:100%;background:var(--surf2);color:var(--tx);border:1px solid var(--bd);border-radius:9px;padding:10px 11px;outline:none}
.gpay-input:focus{border-color:rgba(82,232,255,.45)}
.gpay-check{display:flex;gap:9px;align-items:flex-start;font-size:.74rem;color:var(--mu);line-height:1.5}
.gpay-check input{margin-top:3px}
.gpay-msg{color:var(--rd);font-size:.75rem;margin-top:12px;min-height:1em}
.gpay-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--bd)}
.gpay-item:first-child{border-top:0}
.gpay-item .l{min-width:0}
.gpay-item .l b{display:block;font-size:.8rem;overflow:hidden;text-overflow:ellipsis}
.gpay-item .l small{display:block;color:var(--mu);font-size:.68rem;margin-top:2px}
.gpay-item .r{text-align:right;flex:none}
.gpay-item .r b{display:block;font-size:.84rem;margin-bottom:3px}
.gpay-wd{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:12px}
.gpay-wd .gpay-input{max-width:200px}
.gpay-big{font-size:1.6rem;font-weight:800;color:var(--gr);letter-spacing:-.02em}
.badge.warn{color:#ffd166;border-color:rgba(255,209,102,.38)}
.gpay-terms-box{max-height:280px;overflow:auto;background:var(--surf2);border:1px solid var(--bd);border-radius:12px;padding:12px 14px 12px 32px;margin:12px 0;font-size:.76rem;line-height:1.6;color:var(--mu)}
.gpay-terms-box li{margin:0 0 8px}
.gpay-fee{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--bd);font-size:.8rem}
.gpay-fee:first-of-type{border-top:0}
.gpay-fee.tot{font-weight:800}
.gpay-gate .gpay-check{margin:10px 0}
.gpay-kv{display:grid;grid-template-columns:150px 1fr;gap:8px 12px;font-size:.78rem}
.gpay-kv dt{color:var(--mu)}
.gpay-kv dd{margin:0;word-break:break-word}
@media(max-width:760px){
  .gpay-opts,.gpay-form{grid-template-columns:1fr}
  .gpay-grid{grid-template-columns:1fr 1fr}
  .gpay-kv{grid-template-columns:1fr}
}`;
  document.head.appendChild(st);
}

/* ---------- render ---------- */
async function render({container,api,state,ui}){
  injectCss();
  await loadConfig();
  const ctx={
    container,api,state,ui,
    body:null,ov:null,tab:'overview',step:0,form:{},busy:false,gate:false,idle:null,
    wdKey:newKey(),wdKeyAmount:0,
    lists:{
      payments:{rows:[],done:false,loading:false,error:'',filter:''},
      payouts:{rows:[],done:false,loading:false,error:''}
    }
  };
  container.innerHTML=`
    <div class="section-head">
      <h2>Payments</h2>
      <p>Collect customer payments through GLIME and withdraw what you have earned.</p>
    </div>
    <div id="gpayBody"><div class="loading">Loading Payments…</div></div>`;
  ctx.body=container.querySelector('#gpayBody');
  ctx.body.addEventListener('click',e=>onClick(ctx,e));
  ctx.body.addEventListener('input',e=>onInput(ctx,e));
  ctx.body.addEventListener('change',e=>onChange(ctx,e));
  await load(ctx);
}

async function load(ctx){
  try{
    ctx.ov=norm(await rpc(ctx.api,'get_my_payments_overview'));
  }catch(e){
    console.error('GLIME Payments load error:',e&&e.message);
    if(String((e&&e.message)||'').indexOf('NOT_AUTHENTICATED')!==-1){location.href='login.html';return;}
    if(!ctx.body.isConnected)return;
    ctx.body.innerHTML='<div class="error">Could not load Payments. '+esc(errText(e,'Please refresh the page.'))+'</div>';
    return;
  }
  if(!ctx.body.isConnected)return;
  ctx.lists.payments.rows=[];ctx.lists.payments.done=false;
  ctx.lists.payouts.rows=[];ctx.lists.payouts.done=false;
  draw(ctx);
}

function draw(ctx){
  const ov=ctx.ov;
  if(!ov||ov.enabled===false){
    ctx.body.innerHTML='<div class="empty">GLIME Payments is not enabled for your account yet. You can keep collecting payments with your own Razorpay account under Connector.</div>';
    return;
  }
  if(ctx.gate||(ov.mode==='glime'&&!termsAccepted(ctx))){
    ctx.body.innerHTML=termsGate(ctx);
    bindGate(ctx);
    return;
  }
  let h=modeCards(ctx);
  if(ov.mode==='glime')h+=glimeArea(ctx);
  else if(ov.mode==='own')h+=ownArea(ctx);
  else h+='<div class="empty">Choose how you want to collect customer payments.</div>';
  ctx.body.innerHTML=h;
  if(ov.mode==='glime'&&kycStatus(ctx)==='verified')showTab(ctx);
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
  return '<div class="gpay-fee"><span>Razorpay charges (incl. GST)</span><b>'+esc(pct(p.gateway))+'</b></div>'+
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
    ?esc(pct(p.total))+' of each payment (Razorpay charges '+esc(pct(p.gateway))+' plus GLIME service fee '+esc(pct(p.service))+')'
    :'a fee on each payment (Razorpay charges plus GLIME service fee '+esc(pct(c.serviceBps))+')';
  const items=[
    "GLIME collects your customers' payments through its payment partner Razorpay and passes your share to a payment account created for your business. GLIME is not a bank and does not keep your money as a wallet.",
    "You must complete a one-time KYC with true details (PAN, business and bank). Collecting payments starts only after it is verified.",
    "Fee: "+feeText+" is deducted automatically. You receive the net amount. GST and income tax are your own responsibility.",
    "Each payment is held for a short period to cover refunds and disputes before it becomes available.",
    "You can withdraw only what your own customers actually paid (after fee, refunds and amounts on hold), and only to your verified bank account. One withdrawal at a time, with a minimum amount.",
    "Refunds, disputes and chargebacks are deducted from your balance. If it is not enough, the shortfall is taken from future earnings or you pay it on request.",
    "Only lawful goods and services are allowed. Anything prohibited by law, Razorpay or the banks is not allowed.",
    "GLIME or Razorpay may hold payments, freeze withdrawals or suspend the service for risk, fraud or compliance reasons.",
    "Keep your login private. Anyone who can log in can request withdrawals. Report anything suspicious at once to "+esc(c.supportEmail)+".",
    "Your PAN and bank details go securely to Razorpay. GLIME stores only the last 4 digits, your bank name and IFSC.",
    "If the Terms change, you must accept the new version before you continue. Fee increases need 30 days' notice.",
    "You can switch back to your own Razorpay account only when you have no balance, no payment on hold and no withdrawal in progress."
  ];
  return '<section class="channel-card gpay-gate">'+
    '<div class="channel-head"><div class="channel-name">GLIME Payments: Terms &amp; Conditions</div><span class="badge warn">Please read</span></div>'+
    '<p class="note" style="margin-top:0">Version '+esc(c.termsVersion)+'. Scroll the key terms below to the end to continue. Full text: '+linksHtml()+'.</p>'+
    (p?feeRows(p):'')+
    '<div class="gpay-terms-box" id="gpayTermsBox" tabindex="0" role="region" aria-label="Key terms"><ol>'+items.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ol></div>'+
    '<label class="gpay-check"><input type="checkbox" data-g="1" disabled><span style="font-weight:600">I have read and agree to the GLIME Payments Terms &amp; Conditions (version '+esc(c.termsVersion)+').</span></label>'+
    '<label class="gpay-check"><input type="checkbox" data-g="2" disabled><span style="font-weight:600">I understand that '+(p?esc(pct(p.total)):'the fee')+' is deducted from every payment (Razorpay charges plus GLIME '+esc(pct(p?p.service:c.serviceBps))+') and that I receive only the net amount.</span></label>'+
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
  const fee=ov.fee_bps!=null?pct(ov.fee_bps):'';
  return `<div class="gpay-opts">
    <div class="gpay-opt ${m==='own'?'sel':''}">
      <div class="gpay-opt-t">My own Razorpay account</div>
      <p>Customers pay straight into your Razorpay account. ${ov.own_razorpay_connected?'Your account is connected.':'Connect it under Connector.'}</p>
      ${m==='own'?'<span class="badge on">● Active</span>':'<button class="btn" type="button" data-act="mode" data-mode="own">Use my own account</button>'}
    </div>
    <div class="gpay-opt ${m==='glime'?'sel':''}">
      <div class="gpay-opt-t">GLIME Payments</div>
      <p>No Razorpay account needed. Complete a one-time KYC, collect payments through GLIME and withdraw your earnings to your bank.${fee?' Total fee: '+esc(fee)+' per payment (Razorpay charges plus GLIME '+esc(pct(cfg().serviceBps))+').':''} ${linksHtml()}</p>
      ${m==='glime'?'<span class="badge on">● Active</span>':'<button class="btn primary" type="button" data-act="start-glime">Use GLIME Payments</button>'}
    </div>
  </div>`;
}

function ownArea(){
  return `<section class="channel-card">
    <div class="row-info"><b>You are using your own Razorpay account</b>
    <small>Payments go directly to your Razorpay account and settle on Razorpay's schedule. Manage the connection under Connector.</small></div>
    <div class="actions"><button class="btn primary" type="button" data-act="goto-connector">Open Connector</button></div>
  </section>`;
}

/* ---------- GLIME Payments: KYC or dashboard ---------- */
function glimeArea(ctx){
  const st=kycStatus(ctx),k=ctx.ov.kyc||{};
  if(st==='verified')return dashboard(ctx);

  if(st==='submitted'||st==='under_review'){
    return `<section class="channel-card">
      <div class="channel-head"><div class="channel-name">KYC verification</div>${badge(KYC_STATUS,st)}</div>
      <p class="note" style="margin-top:0">Your details are with our payment partner for verification. This usually takes 1 to 3 working days. You will be able to collect payments as soon as it is verified.</p>
      <p class="note">Submitted on ${esc(fmtDate(k.submitted_at))}</p>
    </section>`;
  }
  if(st==='suspended'){
    return `<section class="channel-card">
      <div class="channel-head"><div class="channel-name">GLIME Payments</div>${badge(KYC_STATUS,st)}</div>
      <p class="note" style="margin-top:0">GLIME Payments is paused for your account. Please contact <a href="mailto:connect@glime.online" style="color:var(--cy)">connect@glime.online</a>.</p>
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
  return notice+'<section class="channel-card" id="gpayKyc">'+kycForm(ctx)+'</section>';
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

function kycForm(ctx){
  const f=ctx.form,step=ctx.step;
  const names=['Business','Contact','Bank'];
  const bar='<div class="gpay-steps">'+names.map((n,i)=>`<span class="${i===step?'on':(i<step?'done':'')}">${i+1}. ${n}</span>`).join('')+'</div>';
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
  }else{
    body=fld(ctx,'account_holder','Account holder name',{full:true,hint:'Must match the name on the bank account.'})+
      fld(ctx,'account_number','Bank account number',{type:'password',mode:'numeric',max:18})+
      fld(ctx,'account_number2','Confirm account number',{type:'password',mode:'numeric',max:18})+
      fld(ctx,'ifsc','IFSC code',{ph:'HDFC0001234',max:11})+
      `<label class="gpay-check gpay-fld full"><input type="checkbox" data-f="consent" ${f.consent?'checked':''}>
        <span style="font-weight:600">I confirm these details are correct and authorise GLIME and its payment partner to verify my identity and bank account. I have accepted the GLIME Payments Terms &amp; Conditions.</span></label>`;
  }
  const back=step>0?'<button class="btn" type="button" data-act="back">Back</button>':'';
  const next=step<2?'<button class="btn primary" type="button" data-act="next">Continue</button>'
    :'<button class="btn primary" type="button" data-act="submit-kyc">Submit for verification</button>';
  return `<div class="channel-head"><div class="channel-name">Verify your business</div>${badge(KYC_STATUS,kycStatus(ctx))}</div>
    ${bar}<div class="gpay-form">${body}</div>
    <div class="gpay-msg" id="gpayMsg" role="alert"></div>
    <div class="actions">${back}${next}</div>
    <p class="note">Your PAN and bank details are sent securely to our payment partner for verification. GLIME stores only the last 4 digits.</p>`;
}

function validate(ctx,step){
  const f=ctx.form;
  if(step===0){
    if(!f.business_type)return 'Choose your business type.';
    if(!f.business_category)return 'Choose a business category.';
    if(T(f.legal_name).length<3)return 'Enter your legal name as on the PAN.';
    if(T(f.display_name).length<2)return 'Enter your business display name.';
    if(!PAN_RE.test(T(f.pan)))return 'Enter a valid PAN, for example ABCDE1234F.';
    if(COMPANY_TYPES.indexOf(f.business_type)!==-1&&!PAN_RE.test(T(f.owner_pan)))return "Enter the authorised person's PAN.";
    if(T(f.gstin)&&!GST_RE.test(T(f.gstin)))return 'The GSTIN looks invalid. Leave it empty if you do not have one.';
  }else if(step===1){
    if(T(f.contact_name).length<2)return 'Enter the contact person name.';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(T(f.email)))return 'Enter a valid email address.';
    if(!/^[6-9][0-9]{9}$/.test(T(f.phone)))return 'Enter a valid 10 digit mobile number.';
    if(T(f.address_line1).length<5)return 'Enter your address.';
    if(T(f.city).length<2)return 'Enter your city.';
    if(!f.state)return 'Choose your state.';
    if(!/^[1-9][0-9]{5}$/.test(T(f.pincode)))return 'Enter a valid 6 digit pincode.';
  }else{
    if(T(f.account_holder).length<3)return 'Enter the account holder name.';
    if(!/^[0-9]{9,18}$/.test(T(f.account_number)))return 'Enter a valid bank account number (9 to 18 digits).';
    if(T(f.account_number)!==T(f.account_number2))return 'The two account numbers do not match.';
    if(!IFSC_RE.test(T(f.ifsc)))return 'Enter a valid IFSC code, for example HDFC0001234.';
    if(!f.consent)return 'Please accept the terms to continue.';
  }
  return '';
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
    ctx.form={};ctx.formReady=false;ctx.step=0;
    ctx.ui.toast('KYC submitted for verification');
    await load(ctx);
  }catch(e){
    console.error('GLIME Payments KYC error:',e&&e.message);
    if(!ctx.body.isConnected)return;
    btn.disabled=false;btn.textContent='Submit for verification';
    if(msg)msg.textContent=errText(e,'Could not submit your KYC. Please check your details and try again.');
  }
}

/* ---------- dashboard ---------- */
function dashboard(ctx){
  const tabs=[['overview','Overview'],['payments','Payments'],['payouts','Payouts'],['account','Account']];
  return `<div class="gpay-tabs">${tabs.map(t=>`<button type="button" class="${ctx.tab===t[0]?'active':''}" data-act="tab" data-tab="${t[0]}">${t[1]}</button>`).join('')}
    <button type="button" class="gpay-refresh" data-act="refresh">↻ Refresh</button></div>
    <div id="gpayTab"></div>`;
}

function showTab(ctx){
  const host=ctx.body.querySelector('#gpayTab');
  if(!host)return;
  ctx.body.querySelectorAll('[data-act="tab"]').forEach(b=>b.classList.toggle('active',b.dataset.tab===ctx.tab));
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
  let money_out='';
  if(ov.payout_mode==='withdraw'){
    const min=Number(ov.min_payout_paise)||0;
    money_out=`<section class="channel-card">
      <div class="channel-head"><div class="channel-name">Withdraw to your bank</div></div>
      <div class="row-info"><small>Available to withdraw</small></div>
      <div class="gpay-big">${money(b.available_paise)}</div>
      ${pending?`<p class="note">A withdrawal of ${money(pending.amount_paise)} is ${esc(pending.status)}. You can request another once it finishes.</p>`:`
      <div class="gpay-wd">
        <input class="gpay-input" id="gpayAmt" type="text" inputmode="decimal" placeholder="Amount in ₹" autocomplete="off">
        <button class="btn" type="button" data-act="max">Max</button>
        <button class="btn primary" type="button" data-act="withdraw">Withdraw</button>
      </div>
      <div class="gpay-msg" id="gpayMsg" role="alert"></div>`}
      <p class="note">${min?'Minimum withdrawal '+money(min)+'. ':''}Money goes to ${esc((ov.kyc&&ov.kyc.bank_name)||'your bank')} account ending ${esc((ov.kyc&&ov.kyc.bank_last4)||'••••')}. You can only withdraw what you have actually received.</p>
    </section>`;
  }else{
    money_out=`<section class="channel-card">
      <div class="channel-head"><div class="channel-name">Automatic settlement</div></div>
      <div class="gpay-big">${money(b.available_paise)}</div>
      <p class="note">Earnings are settled to your bank account ending ${esc((ov.kyc&&ov.kyc.bank_last4)||'••••')} automatically${ov.settlement_days?', about '+esc(ov.settlement_days)+' working days after each payment':''}. No action is needed.</p>
    </section>`;
  }
  return `<div class="gpay-grid">
    ${stat('TOTAL RECEIVED',b.gross_paise)}
    ${stat('GLIME FEE',b.fee_paise)}
    ${stat('REFUNDED',b.refunded_paise)}
    ${stat('YOUR NET EARNINGS',b.net_paise,true)}
    ${stat(ov.payout_mode==='withdraw'?'WITHDRAWN':'SETTLED',b.withdrawn_paise)}
    ${stat('ON HOLD',b.hold_paise)}
  </div>${money_out}${feeHtml(ctx)}
  <p class="note">Available = net earnings − already withdrawn − amount on hold. Held amounts are released after the hold period or a refund window.</p>`;
}

function accountHtml(ctx){
  const k=ctx.ov.kyc||{};
  const row=(a,b)=>`<dt>${a}</dt><dd>${b}</dd>`;
  const bt=(BUSINESS_TYPES.filter(x=>x[0]===k.business_type)[0]||[])[1]||k.business_type||'—';
  return `<section class="channel-card">
    <div class="channel-head"><div class="channel-name">KYC and bank account</div>${badge(KYC_STATUS,k.status||'not_started')}</div>
    <dl class="gpay-kv">
      ${row('Legal name',esc(k.legal_name||'—'))}
      ${row('Business type',esc(bt))}
      ${row('PAN','•••••'+esc(k.pan_last4||'••••'))}
      ${row('Bank',esc(k.bank_name||'—'))}
      ${row('Account number','••••••'+esc(k.bank_last4||'••••'))}
      ${row('IFSC',esc(k.bank_ifsc||'—'))}
      ${row('Verified on',esc(fmtDate(k.verified_at)))}
    </dl>
    <p class="note">To change your bank account or business details, write to <a href="mailto:connect@glime.online" style="color:var(--cy)">connect@glime.online</a>. Changes need fresh verification.</p>
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
    h+=`<div class="channel-head"><div class="channel-name">Payments received</div>
      <select class="select" data-act="pfilter"><option value="">All</option>
      ${['captured','held','released','settled','refunded','partially_refunded'].map(s=>`<option value="${s}" ${st.filter===s?'selected':''}>${esc(PAY_STATUS[s][0])}</option>`).join('')}</select></div>`;
  }else{
    h+='<div class="channel-head"><div class="channel-name">Withdrawal history</div></div>';
  }
  if(st.error)h+='<div class="error">'+esc(st.error)+'</div>';
  if(!st.rows.length&&!st.loading&&!st.error){
    h+='<div class="loading">'+(kind==='payments'?'No payments yet. They appear here as customers pay.':'No withdrawals yet.')+'</div>';
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
    if(!termsAccepted(ctx)){ctx.gate=true;draw(ctx);return;}
    if(!(await ctx.ui.confirm('Use GLIME Payments? You will complete a one-time KYC. Customer payments will then be collected through GLIME instead of your own Razorpay account.',{title:'Change payment method',confirmText:'Continue'})))return;
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
      ?'Use GLIME Payments? You will complete a one-time KYC. Customer payments will then be collected through GLIME instead of your own Razorpay account.'
      :'Switch back to your own Razorpay account? You can only switch when you have no balance, held payments or pending withdrawals.';
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
      const msg=ctx.body.querySelector('#gpayMsg');
      if(problem){if(msg)msg.textContent=problem;return;}
      ctx.step=Math.min(2,ctx.step+1);
    }else ctx.step=Math.max(0,ctx.step-1);
    const host=ctx.body.querySelector('#gpayKyc');
    if(host)host.innerHTML=kycForm(ctx);
    return;
  }
  if(act==='submit-kyc'){
    const problem=validate(ctx,2);
    const msg=ctx.body.querySelector('#gpayMsg');
    if(problem){if(msg)msg.textContent=problem;return;}
    await submitKyc(ctx,el);
    return;
  }
  if(act==='tab'){ctx.tab=el.dataset.tab;showTab(ctx);return;}
  if(act==='refresh'){await load(ctx);return;}
  if(act==='more'){loadList(ctx,el.dataset.kind,false);return;}
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
  bumpIdle(ctx);
}

function onChange(ctx,e){
  const t=e.target;
  if(!t)return;
  if(t.dataset&&t.dataset.g){updateGate(ctx);return;}
  if(t.dataset&&t.dataset.act==='pfilter'){
    ctx.lists.payments.filter=t.value;
    loadList(ctx,'payments',true);
    return;
  }
  if(t.dataset&&t.dataset.f){
    const name=t.dataset.f;
    ctx.form[name]=t.type==='checkbox'?t.checked:t.value;
    if(name==='business_type'){
      const host=ctx.body.querySelector('#gpayKyc');
      if(host)host.innerHTML=kycForm(ctx);
    }
  }
}

S.register({
  id:'payments',
  label:'Payments',
  order:55,
  render:render
});
})();
