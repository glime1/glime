/* =========================================================
   GLIME — TELEGRAM CONNECTOR (Settings > Connector and Connector Hub)
   ---------------------------------------------------------
   Frontend only. The backend is built separately. Expected contract:

     glime-telegram-gateway   (verify_jwt = true, Authorization: Bearer <user jwt>)
       GET  ?action=telegram.status
            -> { connected, enabled, phone_masked, telegram_username, telegram_name,
                 connected_at, last_sent_at, last_error, bot_username, settings }
       POST ?action=telegram.connect.start    { phone }
            -> { bot_username, deep_link, code, expires_at | expires_in }
               (deep_link = https://t.me/<bot>?start=<code>; the bot links the chat on /start)
       POST ?action=telegram.enable.set       { enabled }      (pause / resume all messages)
       POST ?action=telegram.settings.save    { settings }     -> { settings }
       POST ?action=telegram.test             {}               (sends a test message)
       POST ?action=telegram.report.send_now  {}               (sends today's report so far)
       POST ?action=telegram.disconnect       {}
     Errors: non-2xx, or { ok:false, message }.

     settings = {
       timezone, language: 'en' | 'hi',
       daily:  { enabled, days:[1..7 (Mon=1)], times:['HH:MM', ...] },
       weekly: { enabled, day:1..7, time:'HH:MM' },
       sections: { <report content key>: boolean },
       alerts:   { <instant alert key>: boolean },
       quiet:    { enabled, start:'HH:MM', end:'HH:MM' }   (applies to instant alerts only)
     }

   Rules:
   - Nothing is stored in the browser (no localStorage / sessionStorage).
   - Never shows "Connected" unless the gateway status says so.
   - Telegram turns ON / OFF like the Calendar card: OFF only pauses messages,
     the connection and saved settings stay.
   - Uses the shared Connector styles (gcx-*) from connector-ui.js.
   Loaded on demand by settings-connector-addon.js and ai-connections.html.
   If this file fails to load, the rest of the Connector page is unaffected.
   ========================================================= */
(function(){
'use strict';
if(window.GLIME_TELEGRAM)return;

const FN='glime-telegram-gateway';
const MAX_TIMES=4;
const DAYS=[[1,'Mon'],[2,'Tue'],[3,'Wed'],[4,'Thu'],[5,'Fri'],[6,'Sat'],[7,'Sun']];
const DAY_FULL={1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday',7:'Sunday'};

/* [key, label, description, default on] */
const SECTIONS=[
  ['new_leads','New leads','How many leads came in, with names and source',true],
  ['hot_leads','Hot leads','Leads that look ready to buy',true],
  ['followups','Pending follow-ups','Follow-ups that are due or overdue',true],
  ['orders','Orders','New, pending and delivered orders',true],
  ['revenue','Revenue','Sales and money collected',true],
  ['payments','Payments','Paid, pending and failed payments',true],
  ['whatsapp','WhatsApp','Conversations and messages handled by AI',true],
  ['instagram','Instagram','DMs and comments handled by AI',true],
  ['appointments','Appointments','Booked, changed and cancelled',true],
  ['ai_usage','AI usage','Tokens and daily limit used',false],
  ['ai_insights','AI insights','Short highlights and what to do next',true]
];
const ALERTS=[
  ['new_lead','New lead','Instantly when a new lead arrives',true],
  ['hot_lead','Hot lead','When a lead is ready to buy',true],
  ['new_order','New order','When an order is placed',true],
  ['payment_received','Payment received','When a payment is successful',true],
  ['payment_failed','Payment failed','When a payment fails',true],
  ['appointment_booked','Appointment booked','When a customer books a slot',false],
  ['appointment_cancelled','Appointment cancelled','When a booking is cancelled',false],
  ['human_handover','Needs your attention','When AI hands a chat over to you',true],
  ['limit_reached','Daily limit reached','When a token or message limit is hit',true],
  ['channel_issue','Channel problem','When WhatsApp or Instagram disconnects',true]
];
const TG_ICON='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z';
const BADGE={
  on:['On ✓','on'],
  paused:['Paused',''],
  not_connected:['Not connected',''],
  loading:['Loading…',''],
  error:['Status error','off']
};

const CSS=`
.gtg-sec{margin-top:18px}
.gtg-chips{display:flex;flex-wrap:wrap;gap:8px}
.gtg-chip{min-height:40px;padding:8px 14px;border-radius:99px;border:1px solid var(--gcx-bd);background:transparent;color:var(--gcx-tx);font:inherit;font-size:.76rem;font-weight:800;cursor:pointer}
.gtg-chip[aria-pressed=true]{background:rgba(80,245,168,.1);border-color:rgba(80,245,168,.45);color:var(--gcx-gr)}
.gtg-chip:focus-visible{outline:2px solid var(--gcx-cy);outline-offset:2px}
.gtg-times{display:flex;flex-direction:column;gap:8px;margin-bottom:8px}
.gtg-time{display:flex;gap:8px;align-items:center}
.gtg-time .gcx-input{flex:1;min-width:0}
.gtg-time .gcx-btn{flex:none;width:auto}
.gtg-savebar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid var(--gcx-bd)}
.gtg-link{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
`;

function esc(v){
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function mkErr(message,code){const e=new Error(message);e.code=code;return e;}
function cleanMsg(e){
  if(e&&e.code==='SESSION_EXPIRED')return 'Your session has expired. Please sign in again.';
  const m=String((e&&e.message)||'').trim();
  return (m&&m.length<=320)?m:'Request failed. Please try again.';
}
function fmtDate(iso){
  const d=new Date(iso);
  return isNaN(d)?'':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
}
function fmtDateTime(iso){
  const d=new Date(iso);
  return isNaN(d)?'':d.toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
}
/* GLIME-themed confirm box; falls back to the native one if glime-dialog.js is missing. */
function gdConfirm(message,options){
  return window.GLIME_DIALOG?window.GLIME_DIALOG.confirm(message,options):Promise.resolve(window.confirm(message));
}
async function copyText(text){
  try{
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}
  }catch(e){}
  try{
    const t=document.createElement('textarea');
    t.value=text;t.setAttribute('readonly','');
    t.style.position='fixed';t.style.opacity='0';
    document.body.appendChild(t);t.select();
    const ok=document.execCommand('copy');
    t.remove();
    return ok;
  }catch(e){return false;}
}
function injectStyles(){
  if(document.getElementById('gtg-styles'))return;
  const s=document.createElement('style');
  s.id='gtg-styles';
  s.textContent=CSS;
  document.head.appendChild(s);
}

/* ---------- Settings model ---------- */
function detectTz(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Kolkata';}catch(e){return 'Asia/Kolkata';}
}
function isTime(v){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''));}

function defaults(){
  const sections={},alerts={};
  SECTIONS.forEach(s=>{sections[s[0]]=s[3];});
  ALERTS.forEach(a=>{alerts[a[0]]=a[3];});
  return {
    timezone:detectTz(),
    language:'en',
    daily:{enabled:true,days:[1,2,3,4,5,6,7],times:['21:00']},
    weekly:{enabled:false,day:7,time:'20:00'},
    sections:sections,
    alerts:alerts,
    quiet:{enabled:false,start:'22:00',end:'07:00'}
  };
}

function normalize(raw){
  const d=defaults();
  if(!raw||typeof raw!=='object')return d;
  if(typeof raw.timezone==='string'&&raw.timezone)d.timezone=raw.timezone;
  if(raw.language==='hi'||raw.language==='en')d.language=raw.language;
  const dl=raw.daily;
  if(dl&&typeof dl==='object'){
    if(typeof dl.enabled==='boolean')d.daily.enabled=dl.enabled;
    if(Array.isArray(dl.days)){
      d.daily.days=Array.from(new Set(dl.days.map(Number).filter(n=>n>=1&&n<=7))).sort((a,b)=>a-b);
    }
    if(Array.isArray(dl.times)){
      const t=Array.from(new Set(dl.times.filter(isTime))).slice(0,MAX_TIMES);
      if(t.length)d.daily.times=t;
    }
  }
  const wk=raw.weekly;
  if(wk&&typeof wk==='object'){
    if(typeof wk.enabled==='boolean')d.weekly.enabled=wk.enabled;
    if(Number(wk.day)>=1&&Number(wk.day)<=7)d.weekly.day=Number(wk.day);
    if(isTime(wk.time))d.weekly.time=wk.time;
  }
  ['sections','alerts'].forEach(group=>{
    const src=raw[group];
    if(!src||typeof src!=='object')return;
    Object.keys(d[group]).forEach(k=>{if(typeof src[k]==='boolean')d[group][k]=src[k];});
  });
  const q=raw.quiet;
  if(q&&typeof q==='object'){
    if(typeof q.enabled==='boolean')d.quiet.enabled=q.enabled;
    if(isTime(q.start))d.quiet.start=q.start;
    if(isTime(q.end))d.quiet.end=q.end;
  }
  return d;
}

function tidy(d){
  const o=JSON.parse(JSON.stringify(d));
  o.daily.days=Array.from(new Set(o.daily.days)).sort((a,b)=>a-b);
  o.daily.times=Array.from(new Set(o.daily.times)).sort();
  return o;
}

function validate(d){
  const anySection=Object.keys(d.sections).some(k=>d.sections[k]);
  if(d.daily.enabled){
    if(!d.daily.days.length)return 'Choose at least one day for the daily report.';
    if(!d.daily.times.length||!d.daily.times.every(isTime))return 'Set a valid time for every daily report.';
    if(new Set(d.daily.times).size!==d.daily.times.length)return 'Two daily reports have the same time.';
  }
  if(d.weekly.enabled&&!isTime(d.weekly.time))return 'Set a valid time for the weekly summary.';
  if((d.daily.enabled||d.weekly.enabled)&&!anySection)return 'Choose at least one thing to include in your reports.';
  if(d.quiet.enabled){
    if(!isTime(d.quiet.start)||!isTime(d.quiet.end))return 'Set both quiet hours times.';
    if(d.quiet.start===d.quiet.end)return 'Quiet hours start and end cannot be the same.';
  }
  return '';
}

function setPath(obj,path,val){
  const parts=path.split('.');
  let o=obj;
  for(let i=0;i<parts.length-1;i++){
    if(!o[parts[i]]||typeof o[parts[i]]!=='object')return;
    o=o[parts[i]];
  }
  o[parts[parts.length-1]]=val;
}

function normPhone(raw){
  let v=String(raw||'').replace(/[\s\-().]/g,'');
  if(v.indexOf('00')===0)v='+'+v.slice(2);
  if(/^\d{10}$/.test(v))v='+91'+v;
  if(!/^\+\d{8,15}$/.test(v))return '';
  return v;
}

function tzList(current){
  const list=['Asia/Kolkata','Asia/Dubai','Asia/Singapore','Europe/London','America/New_York','America/Los_Angeles','Australia/Sydney'];
  [detectTz(),current].forEach(z=>{if(z&&list.indexOf(z)<0)list.unshift(z);});
  return list;
}

/* ---------- API client ---------- */
function createApi(sb,cfg){
  cfg=cfg||{};
  const base=String(cfg.supabaseUrl||sb.supabaseUrl||'').replace(/\/$/,'');
  const apiKey=cfg.apiKey||sb.supabaseKey||'';

  async function call(action,o){
    o=o||{};
    const r=await sb.auth.getSession();
    const s=r&&r.data&&r.data.session;
    if(!s)throw mkErr('Your session has expired. Please sign in again.','SESSION_EXPIRED');
    const headers={Authorization:'Bearer '+s.access_token};
    if(apiKey)headers.apikey=apiKey;
    const method=o.method||'POST';
    const init={method,headers};
    if(method!=='GET'){headers['Content-Type']='application/json';init.body=JSON.stringify(o.body||{});}
    let res;
    try{res=await fetch(base+'/functions/v1/'+FN+'?action='+encodeURIComponent(action),init);}
    catch(e){throw mkErr('Unable to reach GLIME right now. Please try again.','NETWORK');}
    const data=await res.json().catch(()=>null);
    if(!res.ok||(data&&data.ok===false)){
      const em=data&&(data.message||(typeof data.error==='string'?data.error:(data.error&&data.error.message)));
      throw mkErr(em||'Telegram request failed.',(data&&data.error)||res.status);
    }
    return data||{};
  }

  return {
    status:()=>call('telegram.status',{method:'GET'}),
    connectStart:(phone)=>call('telegram.connect.start',{body:{phone}}),
    setEnabled:(enabled)=>call('telegram.enable.set',{body:{enabled}}),
    saveSettings:(settings)=>call('telegram.settings.save',{body:{settings}}),
    test:()=>call('telegram.test',{body:{}}),
    sendNow:()=>call('telegram.report.send_now',{body:{}}),
    disconnect:()=>call('telegram.disconnect',{body:{}})
  };
}

/* ---------- Rendering ---------- */
function toggleRow(path,label,desc,on,dis){
  return `
    <div class="gcx-perm">
      <span>${esc(label)}${desc?`<br><small style="color:var(--gcx-mu)">${esc(desc)}</small>`:''}</span>
      <label class="gcx-check" style="margin:0">
        <input type="checkbox" data-tg-path="${esc(path)}" ${on?'checked':''} ${dis?'disabled':''} aria-label="${esc(label)}">
        <b class="${on?'allowed':'blocked'}">${on?'ON':'OFF'}</b>
      </label>
    </div>`;
}

function msgHtml(m){
  return m?`<div class="gcx-status ${m.type==='ok'?'ok':'err'}" role="${m.type==='ok'?'status':'alert'}">${esc(m.text)}</div>`:'';
}

function connectPanel(st){
  const c=st.connect;
  const connected=st.state==='connected';
  const dis=st.busy?'disabled':'';
  if(c.step===2&&c.link){
    const l=c.link;
    const waiting=c.expired
      ?'<div class="gcx-status err" role="alert">This link has expired. Get a new one to continue.</div>'
      :'<div class="gcx-status" role="status">Waiting for you to press Start in Telegram…</div>';
    return `
    <div class="gcx-panel" id="gcx-panel-telegram">
      <p class="gcx-panel-title">Open Telegram and press Start</p>
      <ol class="gcx-steps">
        <li>Tap Open Telegram below. It opens the GLIME bot${l.bot?' (@'+esc(l.bot)+')':''}.</li>
        <li>Press Start in Telegram. If the bot asks you to share your number, tap Share so GLIME can verify it.</li>
        <li>Come back here. This page connects by itself.</li>
      </ol>
      ${msgHtml(st.msg)}
      ${waiting}
      <div class="gcx-cal-bar">
        ${c.expired
          ?`<button type="button" class="gcx-btn primary" data-tg-act="connect-start" ${dis}>Get a new link</button>`
          :`<a class="gcx-btn primary gtg-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Open Telegram</a>
            <button type="button" class="gcx-btn" data-tg-act="connect-check" ${dis}>${st.busy==='check'?'Checking…':'I pressed Start'}</button>`}
        <button type="button" class="gcx-btn" data-tg-act="connect-back" ${dis}>Back</button>
      </div>
      ${l.code?`
      <div class="gcx-label" style="margin-top:6px">Link not opening? Send this to the bot</div>
      <div class="gcx-ep">
        <code>/start ${esc(l.code)}</code>
        <button type="button" class="gcx-btn" data-tg-act="copy" data-tg-copy="/start ${esc(l.code)}" aria-label="Copy start command">Copy</button>
      </div>`:''}
    </div>`;
  }
  return `
    <div class="gcx-panel" id="gcx-panel-telegram">
      <p class="gcx-panel-title">${connected?'Change Telegram number':'Connect Telegram'}</p>
      <ol class="gcx-steps">
        <li>Enter the mobile number you use on Telegram, with country code.</li>
        <li>Open the GLIME bot in Telegram and press Start.</li>
        <li>GLIME starts sending your reports and alerts there. Telegram does not charge per message.</li>
      </ol>
      ${msgHtml(st.msg)}
      <label class="gcx-field"><span class="gcx-label">Telegram mobile number</span><input class="gcx-input" data-tg-phone type="tel" inputmode="tel" autocomplete="tel" placeholder="+91 98765 43210" maxlength="24" value="${esc(c.phone)}" ${dis}></label>
      <div class="gcx-cal-bar" style="margin-bottom:0">
        <button type="button" class="gcx-btn primary" data-tg-act="connect-start" ${dis}>${st.busy==='connect'?'Please wait…':(connected?'Continue':'Connect Telegram')}</button>
        ${connected?`<button type="button" class="gcx-btn" data-tg-act="connect-back" ${dis}>Cancel</button>`:''}
      </div>
      <p class="gcx-small">A 10 digit number is treated as an Indian number (+91). Your number is used only to link your Telegram account to this business.</p>
    </div>`;
}

function managePanel(st){
  const d=st.draft;
  const info=st.info||{};
  const busy=!!st.busy;
  const dis=busy?'disabled':'';
  const dirty=JSON.stringify(d)!==st.saved;

  const days=DAYS.map(x=>`<button type="button" class="gtg-chip" data-tg-act="day" data-d="${x[0]}" aria-pressed="${d.daily.days.indexOf(x[0])>=0?'true':'false'}" aria-label="${esc(DAY_FULL[x[0]])}">${x[1]}</button>`).join('');
  const times=d.daily.times.map((t,i)=>`
    <div class="gtg-time">
      <input class="gcx-input" type="time" data-tg-time="${i}" value="${esc(t)}" aria-label="Daily report time ${i+1}">
      ${d.daily.times.length>1?`<button type="button" class="gcx-btn" data-tg-act="time-del" data-i="${i}" aria-label="Remove report time ${i+1}">Remove</button>`:''}
    </div>`).join('');
  const dayOpts=DAYS.map(x=>`<option value="${x[0]}" ${d.weekly.day===x[0]?'selected':''}>${DAY_FULL[x[0]]}</option>`).join('');
  const tzOpts=tzList(d.timezone).map(z=>`<option value="${esc(z)}" ${z===d.timezone?'selected':''}>${esc(z)}</option>`).join('');

  const daily=`
    <div class="gtg-sec">
      <p class="gcx-panel-title">Daily business report</p>
      ${toggleRow('daily.enabled','Send a daily report','A summary of how your business did',d.daily.enabled)}
      ${d.daily.enabled?`
      <div class="gcx-label" style="margin-top:12px">Days</div>
      <div class="gtg-chips">
        ${days}
        <button type="button" class="gtg-chip" data-tg-act="days-preset" data-p="all" aria-label="Select every day">Every day</button>
        <button type="button" class="gtg-chip" data-tg-act="days-preset" data-p="weekdays" aria-label="Select Monday to Friday">Mon to Fri</button>
      </div>
      <div class="gcx-label" style="margin-top:14px">Send at</div>
      <div class="gtg-times">${times}</div>
      ${d.daily.times.length<MAX_TIMES?'<button type="button" class="gcx-btn" data-tg-act="time-add">Add another time</button>':''}
      <p class="gcx-small">Times use your selected timezone below. Add a morning and an evening report if you like.</p>`:''}
    </div>`;

  const weekly=`
    <div class="gtg-sec">
      <p class="gcx-panel-title">Weekly summary</p>
      ${toggleRow('weekly.enabled','Send a weekly summary','Week-on-week growth, best days and top results',d.weekly.enabled)}
      ${d.weekly.enabled?`
      <div class="gcx-row2" style="margin-top:12px">
        <label class="gcx-field"><span class="gcx-label">Day</span><select class="gcx-input" data-tg-path="weekly.day" data-tg-num aria-label="Weekly summary day">${dayOpts}</select></label>
        <label class="gcx-field"><span class="gcx-label">Time</span><input class="gcx-input" type="time" data-tg-path="weekly.time" value="${esc(d.weekly.time)}" aria-label="Weekly summary time"></label>
      </div>`:''}
    </div>`;

  const sections=`
    <div class="gtg-sec">
      <p class="gcx-panel-title">What to include in reports</p>
      <div class="gcx-perm-list">${SECTIONS.map(s=>toggleRow('sections.'+s[0],s[1],s[2],!!d.sections[s[0]])).join('')}</div>
    </div>`;

  const alerts=`
    <div class="gtg-sec">
      <p class="gcx-panel-title">Instant alerts</p>
      <div class="gcx-perm-list">${ALERTS.map(a=>toggleRow('alerts.'+a[0],a[1],a[2],!!d.alerts[a[0]])).join('')}</div>
      <div style="margin-top:12px">${toggleRow('quiet.enabled','Quiet hours','No instant alerts during this time. Reports still arrive on schedule.',d.quiet.enabled)}</div>
      ${d.quiet.enabled?`
      <div class="gcx-row2" style="margin-top:12px">
        <label class="gcx-field"><span class="gcx-label">From</span><input class="gcx-input" type="time" data-tg-path="quiet.start" value="${esc(d.quiet.start)}" aria-label="Quiet hours start"></label>
        <label class="gcx-field"><span class="gcx-label">Until</span><input class="gcx-input" type="time" data-tg-path="quiet.end" value="${esc(d.quiet.end)}" aria-label="Quiet hours end"></label>
      </div>`:''}
    </div>`;

  const prefs=`
    <div class="gtg-sec">
      <p class="gcx-panel-title">Language and timezone</p>
      <div class="gcx-row2">
        <label class="gcx-field"><span class="gcx-label">Report language</span>
          <select class="gcx-input" data-tg-path="language" aria-label="Report language">
            <option value="en" ${d.language==='en'?'selected':''}>English</option>
            <option value="hi" ${d.language==='hi'?'selected':''}>Hindi</option>
          </select></label>
        <label class="gcx-field"><span class="gcx-label">Timezone</span><select class="gcx-input" data-tg-path="timezone" aria-label="Timezone">${tzOpts}</select></label>
      </div>
    </div>`;

  const who=[];
  if(info.telegram_username)who.push('@'+esc(String(info.telegram_username).replace(/^@/,'')));
  else if(info.telegram_name)who.push(esc(info.telegram_name));
  if(info.phone_masked)who.push(esc(info.phone_masked));

  return `
    <div class="gcx-panel" id="gcx-panel-telegram">
      <p class="gcx-panel-title">Telegram reports and alerts</p>
      ${msgHtml(st.msg)}
      ${info.enabled===false?'<div class="gcx-status" role="status">Telegram messages are paused. Turn Telegram on to receive reports and alerts again.</div>':''}
      <p class="gcx-small" style="margin-top:0">Sending to ${who.length?'<b>'+who.join(' · ')+'</b>':'your connected Telegram'}.</p>
      <div class="gcx-cal-bar">
        <button type="button" class="gcx-btn" data-tg-act="test" ${dis}>${st.busy==='test'?'Sending…':'Send test message'}</button>
        <button type="button" class="gcx-btn" data-tg-act="send-now" ${dis}>${st.busy==='now'?'Sending…':'Send report now'}</button>
        <button type="button" class="gcx-btn" data-tg-act="change-number" ${dis}>Change number</button>
      </div>
      ${daily}${weekly}${sections}${alerts}${prefs}
      <div class="gtg-savebar">
        <button type="button" class="gcx-btn primary" data-tg-act="save" ${(!dirty||busy)?'disabled':''}>${st.busy==='save'?'Saving…':'Save settings'}</button>
        ${dirty?`<button type="button" class="gcx-btn" data-tg-act="discard" ${dis}>Discard changes</button><span class="gcx-small" style="margin:0">You have unsaved changes.</span>`:''}
      </div>
      <div class="gcx-danger-zone">
        <button type="button" class="gcx-btn danger" data-tg-act="disconnect" ${dis} aria-label="Disconnect Telegram">${st.busy==='disconnect'?'Disconnecting…':'Disconnect Telegram'}</button>
        <p class="gcx-small">Disconnecting stops all Telegram messages and removes the link to your Telegram account. Your GLIME data is not deleted.</p>
      </div>
    </div>`;
}

function cardHtml(st){
  const state=st.state;
  const info=st.info||{};
  const connected=state==='connected';
  const stable=connected||state==='not_connected';
  const on=connected&&info.enabled!==false;
  const bk=connected?(on?'on':'paused'):state;
  const b=BADGE[bk]||BADGE.error;

  let action='';
  if(connected){
    action=`
      <button type="button" class="gcx-btn ${on?'':'primary'}" data-tg-act="enable" ${st.busy?'disabled':''} aria-label="${on?'Turn off Telegram':'Turn on Telegram'}">${st.busy==='enable'?'Please wait…':(on?'Turn off':'Turn on')}</button>
      <button type="button" class="gcx-btn" data-tg-act="toggle" aria-expanded="${st.open?'true':'false'}" aria-controls="gcx-panel-telegram" aria-label="${st.open?'Hide Telegram settings':'Manage Telegram'}">${st.open?'Hide':'Manage'}</button>`;
  }else if(state==='not_connected'){
    action=`<button type="button" class="gcx-btn ${st.open?'':'primary'}" data-tg-act="toggle" aria-expanded="${st.open?'true':'false'}" aria-controls="gcx-panel-telegram" aria-label="${st.open?'Hide Telegram setup':'Connect Telegram'}">${st.open?'Hide':'Connect'}</button>`;
  }else if(state==='error'){
    action='<button type="button" class="gcx-btn" data-tg-act="retry" aria-label="Retry Telegram status">Retry</button>';
  }else{
    action='<button type="button" class="gcx-btn" disabled aria-disabled="true">Loading…</button>';
  }

  let meta='';
  if(connected){
    const bits=[];
    if(info.telegram_username)bits.push('@'+esc(String(info.telegram_username).replace(/^@/,'')));
    else if(info.telegram_name)bits.push(esc(info.telegram_name));
    if(info.phone_masked)bits.push(esc(info.phone_masked));
    if(info.last_sent_at)bits.push('Last message '+esc(fmtDateTime(info.last_sent_at)));
    else if(info.connected_at)bits.push('Connected '+esc(fmtDate(info.connected_at)));
    meta=(bits.length?`<p class="gcx-meta">${bits.join(' · ')}</p>`:'')+
      (info.last_error?'<p class="gcx-meta warn">The last Telegram message could not be delivered. Open Manage and send a test message, or reconnect.</p>':'');
  }else if(state==='error'){
    meta=`<p class="gcx-meta warn">${esc(st.loadErr||'Status could not be loaded.')}</p>`;
  }

  let panel='';
  if(st.open&&stable){
    panel=(connected&&st.mode!=='connect')?managePanel(st):connectPanel(st);
  }

  return `
  <article class="gcx-card${st.open?' wide':''}" data-provider="telegram" data-state="${connected?(on?'connected':'paused'):esc(state)}">
    <div class="gcx-top">
      <span class="gcx-ico gcx-logo" style="color:#26A5E4" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="${TG_ICON}"/></svg></span>
      <div class="gcx-titles">
        <h4 class="gcx-name">Telegram</h4>
        <span class="gcx-badge ${b[1]}">${esc(b[0])}</span>
      </div>
    </div>
    <p class="gcx-desc">Get your daily business report, new leads, orders and alerts on Telegram. Telegram does not charge per message.</p>
    ${meta}
    <div class="gcx-actions" style="display:flex;gap:8px;flex-wrap:wrap">${action}</div>
    ${panel}
  </article>`;
}

/* ---------- Mount ---------- */
function mount(container,opts){
  opts=opts||{};
  if(!container||container._gcxTelegram)return;
  const sb=opts.sb;
  const UI=window.GLIME_CONNECTOR_UI;
  if(!sb||!UI)return;
  container._gcxTelegram=true;
  UI.injectStyles();
  injectStyles();
  container.classList.add('gcx');

  const api=createApi(sb,{supabaseUrl:opts.supabaseUrl,apiKey:opts.apiKey});
  const st={
    state:'loading',info:null,loadErr:'',open:false,mode:'manage',busy:'',msg:null,banner:null,
    draft:defaults(),saved:'',
    connect:{phone:'',step:1,link:null,expired:false,expiresAt:0}
  };
  st.saved=JSON.stringify(st.draft);
  const alive=()=>container.isConnected;
  let timer=null,polling=false;

  const isDirty=()=>JSON.stringify(st.draft)!==st.saved;

  function draw(){
    if(!alive())return;
    const banner=st.banner?`<div class="gcx-status ${st.banner.type==='ok'?'ok':'err'}" role="${st.banner.type==='ok'?'status':'alert'}">${esc(st.banner.text)}</div>`:'';
    container.innerHTML=`
      <section class="gcx-group" aria-label="Notifications">
        <h3 class="gcx-group-title">Notifications</h3>
        ${banner}
        <div class="gcx-grid">${cardHtml(st)}</div>
      </section>`;
  }

  function stopPoll(){if(timer){clearInterval(timer);timer=null;}}

  function applyStatus(r,keepDraft){
    st.info=r||null;
    st.state=(r&&r.connected)?'connected':'not_connected';
    if(st.state==='connected'&&!(keepDraft&&isDirty())){
      st.draft=normalize(r.settings);
      st.saved=JSON.stringify(st.draft);
    }
  }

  async function loadStatus(){
    st.state='loading';st.loadErr='';draw();
    try{
      applyStatus(await api.status());
    }catch(e){
      console.error('GLIME Telegram status error:',e);
      st.state='error';st.loadErr=cleanMsg(e);
    }
    draw();
  }

  function startPoll(){
    stopPoll();
    timer=setInterval(async()=>{
      if(!alive()){stopPoll();return;}
      if(st.connect.expiresAt&&Date.now()>st.connect.expiresAt){
        stopPoll();st.connect.expired=true;draw();return;
      }
      if(polling)return;
      polling=true;
      try{
        const r=await api.status();
        if(r&&r.connected)finishConnect(r);
      }catch(e){/* keep waiting */}
      polling=false;
    },3000);
  }

  function finishConnect(r){
    stopPoll();
    applyStatus(r);
    st.connect={phone:'',step:1,link:null,expired:false,expiresAt:0};
    st.mode='manage';st.open=true;st.msg=null;
    st.banner={type:'ok',text:'Telegram connected successfully.'};
    draw();
  }

  function resetConnect(){
    stopPoll();
    st.connect={phone:'',step:1,link:null,expired:false,expiresAt:0};
  }

  async function run(kind,fn){
    if(st.busy)return;
    st.busy=kind;st.msg=null;st.banner=null;draw();
    try{await fn();}
    catch(e){
      console.error('GLIME Telegram '+kind+' error:',e);
      st.msg={type:'err',text:cleanMsg(e)};
    }
    st.busy='';draw();
  }

  container.addEventListener('input',ev=>{
    const t=ev.target;
    if(t&&t.matches&&t.matches('[data-tg-phone]'))st.connect.phone=t.value;
  });

  container.addEventListener('change',ev=>{
    const t=ev.target;
    if(!t||!t.matches)return;
    if(t.matches('[data-tg-path]')){
      let v=t.type==='checkbox'?t.checked:t.value;
      if(t.hasAttribute('data-tg-num'))v=Number(v);
      setPath(st.draft,t.dataset.tgPath,v);
      st.msg=null;draw();
      return;
    }
    if(t.matches('[data-tg-time]')){
      const i=Number(t.dataset.tgTime);
      if(i>=0&&i<st.draft.daily.times.length)st.draft.daily.times[i]=t.value;
      st.msg=null;draw();
    }
  });

  container.addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-tg-act]');
    if(!b||!container.contains(b))return;
    const act=b.dataset.tgAct;

    if(act==='copy'){
      const ok=await copyText(b.dataset.tgCopy||'');
      const old=b.textContent;
      b.textContent=ok?'Copied':'Copy failed';
      setTimeout(()=>{if(b.isConnected)b.textContent=old;},1600);
      return;
    }
    if(act==='retry'){await loadStatus();return;}

    if(act==='toggle'){
      st.open=!st.open;st.msg=null;st.banner=null;
      if(!st.open){resetConnect();st.mode='manage';}
      else if(st.state==='not_connected')st.mode='connect';
      draw();
      const again=container.querySelector('[data-tg-act="toggle"]');
      if(again)again.focus();
      return;
    }

    if(act==='day'){
      const n=Number(b.dataset.d);
      const days=st.draft.daily.days;
      const i=days.indexOf(n);
      if(i>=0)days.splice(i,1);else days.push(n);
      days.sort((a,c)=>a-c);
      st.msg=null;draw();return;
    }
    if(act==='days-preset'){
      st.draft.daily.days=b.dataset.p==='weekdays'?[1,2,3,4,5]:[1,2,3,4,5,6,7];
      st.msg=null;draw();return;
    }
    if(act==='time-add'){
      if(st.draft.daily.times.length<MAX_TIMES){st.draft.daily.times.push('09:00');st.msg=null;draw();}
      return;
    }
    if(act==='time-del'){
      const i=Number(b.dataset.i);
      if(st.draft.daily.times.length>1){st.draft.daily.times.splice(i,1);st.msg=null;draw();}
      return;
    }
    if(act==='discard'){
      st.draft=JSON.parse(st.saved);st.msg=null;draw();return;
    }

    if(act==='change-number'){
      resetConnect();st.mode='connect';st.msg=null;draw();return;
    }
    if(act==='connect-back'){
      resetConnect();st.msg=null;
      if(st.state==='connected')st.mode='manage';else st.open=false;
      draw();return;
    }

    if(act==='connect-start'){
      if(st.busy)return;
      const phone=normPhone(st.connect.phone);
      if(!phone){
        st.msg={type:'err',text:'Enter a valid mobile number with country code, like +91 98765 43210.'};
        draw();return;
      }
      await run('connect',async()=>{
        const r=await api.connectStart(phone);
        const url=String(r&&r.deep_link||'');
        if(!/^https:\/\/(t|telegram)\.me\//i.test(url))throw mkErr('Telegram link could not be created. Please try again.','LINK');
        let exp=r&&r.expires_at?Date.parse(r.expires_at):NaN;
        if(isNaN(exp))exp=Date.now()+((Number(r&&r.expires_in)||600)*1000);
        st.connect={phone:st.connect.phone,step:2,link:{url:url,code:r.code?String(r.code):'',bot:r.bot_username?String(r.bot_username).replace(/^@/,''):''},expired:false,expiresAt:exp};
        startPoll();
      });
      return;
    }
    if(act==='connect-check'){
      await run('check',async()=>{
        const r=await api.status();
        if(r&&r.connected){finishConnect(r);return;}
        st.msg={type:'err',text:'Telegram is not linked yet. Press Start in the GLIME bot, then try again.'};
      });
      return;
    }

    if(act==='enable'){
      const want=!(st.info&&st.info.enabled!==false);
      await run('enable',async()=>{
        await api.setEnabled(want);
        st.info=Object.assign({},st.info,{enabled:want});
        st.banner={type:'ok',text:want?'Telegram is on. Reports and alerts will be sent.':'Telegram is off. No messages will be sent until you turn it on.'};
      });
      return;
    }

    if(act==='save'){
      const problem=validate(st.draft);
      if(problem){st.msg={type:'err',text:problem};draw();return;}
      await run('save',async()=>{
        const r=await api.saveSettings(tidy(st.draft));
        st.draft=normalize((r&&r.settings)||tidy(st.draft));
        st.saved=JSON.stringify(st.draft);
        st.msg={type:'ok',text:'Settings saved.'};
      });
      return;
    }
    if(act==='test'){
      await run('test',async()=>{
        await api.test();
        st.msg={type:'ok',text:'Test message sent. Check your Telegram.'};
      });
      return;
    }
    if(act==='send-now'){
      await run('now',async()=>{
        await api.sendNow();
        st.msg={type:'ok',text:'Report sent. Check your Telegram.'};
      });
      return;
    }

    if(act==='disconnect'){
      if(st.busy)return;
      if(!(await gdConfirm('Disconnect Telegram? GLIME will stop sending reports and alerts to your Telegram.',{title:'Disconnect Telegram',confirmText:'Disconnect',danger:true})))return;
      await run('disconnect',async()=>{
        await api.disconnect();
        st.state='not_connected';st.info=null;
        st.draft=defaults();st.saved=JSON.stringify(st.draft);
        st.open=false;st.mode='manage';resetConnect();
        st.banner={type:'ok',text:'Telegram disconnected.'};
      });
      return;
    }
  });

  /* Coming back from the back/forward cache: refresh the real status. */
  window.addEventListener('pageshow',ev=>{
    if(!ev.persisted||!alive()||st.busy)return;
    api.status().then(r=>{applyStatus(r,true);draw();}).catch(()=>{});
  });

  loadStatus();
}

window.GLIME_TELEGRAM={mount};
})();
