/* =========================================================
   GLIME — WEBHOOK CONNECTOR (Connector Hub)
   ---------------------------------------------------------
   Frontend only. Lets a client send GLIME events (new lead, new order,
   payment, message ...) to Zapier, Make, n8n or their own server.
   No third-party approval is needed, so it works for every client.

   Backend contract (to be built by GLIME, see GLIME_Webhook_Backend_Spec.md):
     glime-webhook-gateway   (verify_jwt = true)
       GET  ?action=webhook.status
              -> {connected, enabled, url, events[], secret_last4, auto_paused,
                  last_delivery_at, last_status_code, last_error}
       POST ?action=webhook.save          {url, events[], enabled}
              -> {secret?}                (secret only on first save)
       POST ?action=webhook.set_enabled   {enabled}
       POST ?action=webhook.test          {}
              -> {delivered, status_code, duration_ms, message}
       POST ?action=webhook.rotate_secret {}
              -> {secret}
       GET  ?action=webhook.deliveries
              -> {deliveries:[{id, event_key, ok, status_code, duration_ms, error, created_at}]}
       POST ?action=webhook.disconnect    {}

   Rules:
   - The signing secret is returned once, kept in memory only, shown masked,
     and dropped when the panel is closed. It is never put in localStorage.
   - Never shows "On" unless the gateway status says so.
   - If the gateway is not deployed yet (HTTP 404) the card shows "Coming soon"
     and the rest of the Connector page is unaffected.
   - URL checks here are only a convenience. The backend must repeat them.
   - Uses the shared Connector styles (gcx-*) from connector-ui.js.
   Loaded on demand; if it fails, the rest of the page is unaffected.
   ========================================================= */
(function(){
'use strict';
if(window.GLIME_WEBHOOK)return;

const FN='glime-webhook-gateway';
const EVENTS=[
  ['lead.created','New lead','A new lead is added to GLIME'],
  ['lead.stage_changed','Lead stage changed','A lead moves to another pipeline stage'],
  ['order.created','New order','An order is created'],
  ['order.paid','Order paid','Payment for an order is received'],
  ['message.received','Message received','A customer sends a WhatsApp or Instagram message'],
  ['booking.created','New booking','An appointment or booking is created']
];
const DEFAULT_EVENTS=['lead.created','order.created'];
const KNOWN=EVENTS.map(e=>e[0]);
const BADGE={
  connected:['On ✓','on'],
  paused:['Paused',''],
  not_connected:['Not connected',''],
  soon:['Coming soon','soon'],
  loading:['Loading…',''],
  error:['Status error','off']
};
const ICON='<path d="M10 13a4 4 0 0 1 0-5.7l2-2a4 4 0 0 1 5.7 5.7l-1 1"/><path d="M14 11a4 4 0 0 1 0 5.7l-2 2a4 4 0 0 1-5.7-5.7l1-1"/>';
const SAMPLE='{\n  "id": "evt_01H...",\n  "event": "lead.created",\n  "created_at": "2026-11-04T10:00:00Z",\n  "data": { ... }\n}';

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
function fmtTime(iso){
  const d=new Date(iso);
  return isNaN(d)?'':d.toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
}
function hostOf(u){try{return new URL(u).host;}catch(e){return '';}}
function eventLabel(key){
  const f=EVENTS.find(e=>e[0]===key);
  return f?f[1]:(key==='webhook.test'?'Test event':String(key||'Event'));
}
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

/* Basic URL check (the backend must check again, including private addresses). */
function checkUrl(raw){
  const v=String(raw||'').trim();
  if(!v)return 'Enter your webhook URL.';
  if(v.length>2000)return 'This URL is too long.';
  let u;
  try{u=new URL(v);}catch(e){return 'Enter a full URL that starts with https://';}
  if(u.protocol!=='https:')return 'The URL must start with https://';
  if(u.username||u.password)return 'Remove the user name and password from the URL.';
  const h=u.hostname.toLowerCase();
  if(h.indexOf('.')<0||h==='localhost'||/\.(local|localhost|internal|lan)$/.test(h))return 'Use a public web address, not a local one.';
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(h)||h.charAt(0)==='[')return 'Use a domain name, not an IP address.';
  return '';
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
    if(res.status===404)throw mkErr('Webhooks are not available yet.','NOT_DEPLOYED');
    const data=await res.json().catch(()=>null);
    if(!res.ok||(data&&data.ok===false)){
      const m=data&&(data.message||(typeof data.error==='string'?data.error:''));
      throw mkErr(m||'Webhook request failed.',(data&&data.error)||res.status);
    }
    return data||{};
  }

  return {
    status:()=>call('webhook.status',{method:'GET'}),
    save:(body)=>call('webhook.save',{body}),
    setEnabled:(enabled)=>call('webhook.set_enabled',{body:{enabled}}),
    test:()=>call('webhook.test',{body:{}}),
    rotate:()=>call('webhook.rotate_secret',{body:{}}),
    deliveries:()=>call('webhook.deliveries',{method:'GET'}),
    disconnect:()=>call('webhook.disconnect',{body:{}})
  };
}

/* ---------- Rendering ---------- */
function secretBlock(secret){
  return `
    <div class="gcx-status ok" role="status">Copy your signing secret now. For safety it is shown only once.</div>
    <div class="gcx-label">Signing secret</div>
    <div class="gcx-ep" style="margin-bottom:12px">
      <code>••••••••••••••••••••</code>
      <button type="button" class="gcx-btn" data-wh-act="copy" data-wh-copy="${esc(secret)}" aria-label="Copy signing secret">Copy</button>
    </div>`;
}

function deliveriesHtml(st){
  if(st.delLoading)return '<div class="gcx-status" role="status">Loading recent deliveries…</div>';
  if(st.delErr)return `<div class="gcx-status err" role="alert">${esc(st.delErr)}</div>`;
  if(!st.deliveries)return '';
  if(!st.deliveries.length)return '<p class="gcx-small" style="margin-top:0">No deliveries yet. Send a test to check your URL.</p>';
  return '<div class="gcx-perm-list">'+st.deliveries.map(d=>{
    const code=d.status_code?String(d.status_code):(d.ok?'OK':'Failed');
    const err=(!d.ok&&d.error)?`<br><small style="color:var(--gcx-rd)">${esc(String(d.error).slice(0,160))}</small>`:'';
    const ms=(d.duration_ms!=null&&d.duration_ms!=='')?' · '+esc(d.duration_ms)+' ms':'';
    return `
    <div class="gcx-perm">
      <span>${esc(eventLabel(d.event_key))} <small style="color:var(--gcx-mu)">· ${esc(fmtTime(d.created_at))}${ms}</small>${err}</span>
      <b class="${d.ok?'allowed':'blocked'}"${d.ok?'':' style="color:var(--gcx-rd)"'}>${esc(code)}</b>
    </div>`;
  }).join('')+'</div>';
}

function panelHtml(st){
  const info=st.info||{};
  const saved=st.state==='connected'||st.state==='paused';
  const dis=st.busy?'disabled':'';
  const msg=st.msg?`<div class="gcx-status ${st.msg.type==='ok'?'ok':'err'}" role="${st.msg.type==='ok'?'status':'alert'}">${esc(st.msg.text)}</div>`:'';
  const steps=saved?'':`
      <ol class="gcx-steps">
        <li>Create a webhook URL in Zapier (Catch Hook), Make (Custom webhook), n8n (Webhook node) or on your own server.</li>
        <li>Paste the URL below and choose which events to send.</li>
        <li>Save, copy the signing secret if you need it, then send a test.</li>
      </ol>`;
  const evs=EVENTS.map(e=>`
      <label class="gcx-check" style="align-items:flex-start;margin-bottom:8px">
        <input type="checkbox" data-wh-event="${esc(e[0])}" ${st.form.events.indexOf(e[0])>=0?'checked':''} ${dis}>
        <span><b>${esc(e[1])}</b><br><small style="color:var(--gcx-mu)">${esc(e[2])}</small></span>
      </label>`).join('');
  const enabled=info.enabled!==false;
  const secretNote=(saved&&!st.secret&&info.secret_last4)
    ?`<p class="gcx-small" style="margin-top:0">Signing secret ends in <b>${esc(info.secret_last4)}</b>. Use Create new secret if you lost it.</p>`:'';

  return `
    <div class="gcx-panel" id="gcx-panel-webhook">
      <p class="gcx-panel-title">${saved?'Webhook settings':'Connect a webhook'}</p>
      ${steps}
      ${msg}
      ${st.secret?secretBlock(st.secret):''}
      <label class="gcx-field"><span class="gcx-label">Webhook URL</span><input class="gcx-input" data-wh-field="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" maxlength="2000" placeholder="https://hooks.example.com/your-webhook" value="${esc(st.form.url)}" ${dis}></label>
      <div class="gcx-label">Events to send</div>
      <div style="margin-bottom:6px">${evs}</div>
      <div class="gcx-cal-bar" style="margin-bottom:0">
        <button type="button" class="gcx-btn primary" data-wh-act="save" ${dis}>${st.busy==='save'?'Saving…':(saved?'Save changes':'Connect webhook')}</button>
        ${saved?`<button type="button" class="gcx-btn" data-wh-act="test" ${dis}>${st.busy==='test'?'Sending…':'Send test'}</button>`:''}
        ${saved?`<button type="button" class="gcx-btn" data-wh-act="enable" ${dis}>${st.busy==='enable'?'Please wait…':(enabled?'Pause':'Resume')}</button>`:''}
      </div>
      <p class="gcx-small">Only https:// public web addresses work. GLIME sends the events you choose, and customer details in them, to this URL, so use a URL you trust.</p>

      ${saved?`
      <p class="gcx-panel-title" style="margin-top:16px">Recent deliveries</p>
      ${deliveriesHtml(st)}
      <div class="gcx-cal-bar"><button type="button" class="gcx-btn" data-wh-act="refresh-log" ${dis}>Refresh</button></div>

      <p class="gcx-panel-title" style="margin-top:16px">Verify requests</p>
      ${secretNote}
      <p class="gcx-small" style="margin-top:0">Each event is a POST with a JSON body and the headers <b>X-GLIME-Event</b>, <b>X-GLIME-Delivery</b> and <b>X-GLIME-Signature</b> (sha256= and the HMAC-SHA256 of the raw body, made with your signing secret). Zapier and Make do not need this check. Custom servers should check it.</p>
      <pre style="margin:8px 0 0;padding:10px 12px;border-radius:9px;background:#090d13;border:1px solid var(--gcx-bd);font-size:.7rem;color:#cbd5e1;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,Consolas,monospace">${esc(SAMPLE)}</pre>
      <div class="gcx-cal-bar"><button type="button" class="gcx-btn" data-wh-act="rotate" ${dis}>${st.busy==='rotate'?'Please wait…':'Create new secret'}</button></div>

      <div class="gcx-danger-zone">
        <button type="button" class="gcx-btn danger" data-wh-act="disconnect" ${dis} aria-label="Disconnect webhook">${st.busy==='disconnect'?'Disconnecting…':'Disconnect webhook'}</button>
        <p class="gcx-small">Disconnecting deletes the saved URL and signing secret. Events already delivered are not affected.</p>
      </div>`:''}
    </div>`;
}

function cardHtml(st){
  const state=st.state;
  const b=BADGE[state]||BADGE.error;
  const stable=state==='connected'||state==='paused'||state==='not_connected';
  let action;
  if(stable){
    const label=st.open?'Hide':(state==='not_connected'?'Connect':'Manage');
    action=`<button type="button" class="gcx-btn ${(state==='not_connected'&&!st.open)?'primary':''}" data-wh-act="toggle" aria-expanded="${st.open?'true':'false'}" aria-controls="gcx-panel-webhook" aria-label="${esc(label+' webhook')}">${esc(label)}</button>`;
  }else if(state==='error'){
    action='<button type="button" class="gcx-btn" data-wh-act="retry" aria-label="Retry webhook status">Retry</button>';
  }else if(state==='soon'){
    action='<button type="button" class="gcx-btn" disabled aria-disabled="true">Coming soon</button>';
  }else{
    action='<button type="button" class="gcx-btn" disabled aria-disabled="true">Loading…</button>';
  }

  const info=st.info||{};
  let meta='';
  if(state==='connected'||state==='paused'){
    const bits=[];
    const host=hostOf(info.url);
    if(host)bits.push('Sends to '+esc(host));
    const n=Array.isArray(info.events)?info.events.filter(k=>KNOWN.indexOf(k)>=0).length:0;
    if(n)bits.push(n+(n===1?' event':' events'));
    if(info.last_delivery_at)bits.push('Last delivery '+esc(fmtDate(info.last_delivery_at)));
    meta=(bits.length?`<p class="gcx-meta">${bits.join(' · ')}</p>`:'')+
      (info.auto_paused?'<p class="gcx-meta warn">Paused automatically after repeated failures. Check your URL, then press Resume.</p>':
       (info.last_error?'<p class="gcx-meta warn">The last delivery failed. Open Manage to check your URL.</p>':''));
  }else if(state==='error'){
    meta=`<p class="gcx-meta warn">${esc(st.loadErr||'Status could not be loaded.')}</p>`;
  }

  const panel=(st.open&&stable)?panelHtml(st):'';
  return `
  <article class="gcx-card${st.open&&stable?' wide':''}" data-provider="webhook" data-state="${esc(state)}">
    <div class="gcx-top">
      <span class="gcx-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON}</svg></span>
      <div class="gcx-titles">
        <h4 class="gcx-name">Webhooks</h4>
        <span class="gcx-badge ${b[1]}">${esc(b[0])}</span>
      </div>
    </div>
    <p class="gcx-desc">Send new leads, orders, payments and messages from GLIME to Zapier, Make, n8n or your own server, so you can connect thousands of other apps.</p>
    ${meta}
    <div class="gcx-actions">${action}</div>
    ${panel}
  </article>`;
}

/* ---------- Mount ---------- */
function mount(container,opts){
  opts=opts||{};
  if(!container||container._gcxWh)return;
  const sb=opts.sb;
  const UI=window.GLIME_CONNECTOR_UI;
  if(!sb||!UI)return;
  container._gcxWh=true;
  UI.injectStyles();
  container.classList.add('gcx');

  const api=createApi(sb,{supabaseUrl:opts.supabaseUrl,apiKey:opts.apiKey});
  const st={
    state:'loading',info:null,loadErr:'',open:false,busy:'',msg:null,banner:null,
    form:{url:'',events:DEFAULT_EVENTS.slice()},secret:null,
    deliveries:null,delLoading:false,delErr:''
  };
  const alive=()=>container.isConnected;

  function draw(){
    if(!alive())return;
    const banner=st.banner?`<div class="gcx-status ${st.banner.type==='ok'?'ok':'err'}" role="${st.banner.type==='ok'?'status':'alert'}">${esc(st.banner.text)}</div>`:'';
    container.innerHTML=`
      <section class="gcx-group" aria-label="Automation">
        <h3 class="gcx-group-title">Automation</h3>
        ${banner}
        <div class="gcx-grid">${cardHtml(st)}</div>
      </section>`;
  }

  function resetForm(){
    const info=st.info||{};
    const evs=Array.isArray(info.events)?info.events.filter(k=>KNOWN.indexOf(k)>=0):[];
    const saved=st.state==='connected'||st.state==='paused';
    st.form={url:saved?String(info.url||''):'',events:saved?evs:DEFAULT_EVENTS.slice()};
  }

  function applyStatus(r){
    st.info=r||null;
    if(!r||!r.connected)st.state='not_connected';
    else st.state=(r.enabled===false)?'paused':'connected';
  }

  /* quiet=true refreshes the real status without flashing the loading state. */
  async function loadStatus(quiet){
    if(!quiet){st.state='loading';st.loadErr='';draw();}
    try{
      applyStatus(await api.status());
    }catch(e){
      if(e&&e.code==='NOT_DEPLOYED'){st.state='soon';}
      else{
        console.error('GLIME webhook status error:',e);
        if(!quiet){st.state='error';st.loadErr=cleanMsg(e);}
        else st.msg={type:'err',text:cleanMsg(e)};
      }
    }
    draw();
  }

  async function loadDeliveries(){
    if(st.delLoading)return;
    st.delLoading=true;st.delErr='';draw();
    try{
      const r=await api.deliveries();
      st.deliveries=Array.isArray(r.deliveries)?r.deliveries.slice(0,10):[];
    }catch(e){
      console.error('GLIME webhook deliveries error:',e);
      st.delErr=cleanMsg(e);
    }
    st.delLoading=false;draw();
  }

  container.addEventListener('input',ev=>{
    const t=ev.target;
    if(t&&t.matches&&t.matches('[data-wh-field="url"]'))st.form.url=t.value;
  });

  container.addEventListener('change',ev=>{
    const t=ev.target;
    if(!t||!t.matches||!t.matches('[data-wh-event]'))return;
    const key=t.dataset.whEvent;
    const i=st.form.events.indexOf(key);
    if(t.checked&&i<0)st.form.events.push(key);
    if(!t.checked&&i>=0)st.form.events.splice(i,1);
  });

  container.addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-wh-act]');
    if(!b||!container.contains(b))return;
    const act=b.dataset.whAct;
    const saved=st.state==='connected'||st.state==='paused';

    if(act==='copy'){
      const ok=await copyText(b.dataset.whCopy||'');
      const old=b.textContent;
      b.textContent=ok?'Copied':'Copy failed';
      setTimeout(()=>{if(b.isConnected)b.textContent=old;},1600);
      return;
    }
    if(act==='retry'){await loadStatus(false);return;}
    if(act==='refresh-log'){await loadDeliveries();return;}

    if(act==='toggle'){
      st.open=!st.open;st.msg=null;st.banner=null;
      if(st.open){resetForm();}
      else{st.secret=null;}
      draw();
      if(st.open&&saved&&!st.deliveries)loadDeliveries();
      const again=container.querySelector('[data-wh-act="toggle"]');
      if(again)again.focus();
      return;
    }

    if(st.busy)return;

    if(act==='save'){
      const problem=checkUrl(st.form.url)||(st.form.events.length?'':'Choose at least one event to send.');
      if(problem){st.msg={type:'err',text:problem};draw();return;}
      st.busy='save';st.msg=null;st.banner=null;draw();
      try{
        const info=st.info||{};
        const r=await api.save({
          url:st.form.url.trim(),
          events:st.form.events.filter(k=>KNOWN.indexOf(k)>=0),
          enabled:saved?info.enabled!==false:true
        });
        st.busy='';
        if(r&&r.secret)st.secret=String(r.secret);
        st.msg={type:'ok',text:saved?'Changes saved.':'Webhook connected. Send a test to check your URL.'};
        await loadStatus(true);
        resetForm();
        draw();
        if(!st.deliveries)loadDeliveries();
      }catch(e){
        console.error('GLIME webhook save error:',e);
        st.busy='';
        st.msg={type:'err',text:cleanMsg(e)};
        draw();
      }
      return;
    }

    if(act==='test'){
      if(!saved)return;
      if(st.form.url.trim()!==String((st.info&&st.info.url)||'')){
        st.msg={type:'err',text:'Save your changes first, then send a test.'};draw();return;
      }
      st.busy='test';st.msg=null;draw();
      try{
        const r=await api.test();
        st.busy='';
        if(r&&r.delivered){
          st.msg={type:'ok',text:'Test sent. Your server replied'+(r.status_code?' '+r.status_code:'')+(r.duration_ms!=null?' in '+r.duration_ms+' ms':'')+'.'};
        }else{
          st.msg={type:'err',text:'Your server did not accept the test'+((r&&r.status_code)?' (HTTP '+r.status_code+')':'')+'.'+((r&&r.message)?' '+String(r.message).slice(0,200):'')};
        }
        draw();
        await loadDeliveries();
        loadStatus(true);
      }catch(e){
        console.error('GLIME webhook test error:',e);
        st.busy='';
        st.msg={type:'err',text:cleanMsg(e)};
        draw();
      }
      return;
    }

    if(act==='enable'){
      if(!saved)return;
      const want=st.state==='paused';
      st.busy='enable';st.msg=null;draw();
      try{
        await api.setEnabled(want);
        st.busy='';
        st.msg={type:'ok',text:want?'Webhook resumed.':'Webhook paused. No events will be sent until you resume it.'};
        await loadStatus(true);
      }catch(e){
        console.error('GLIME webhook enable error:',e);
        st.busy='';
        st.msg={type:'err',text:cleanMsg(e)};
        draw();
      }
      return;
    }

    if(act==='rotate'){
      if(!saved)return;
      if(!(await gdConfirm('Create a new signing secret? The old secret stops working right away, so update your server before the next event.',{title:'Create new secret',confirmText:'Create new secret',danger:true})))return;
      st.busy='rotate';st.msg=null;draw();
      try{
        const r=await api.rotate();
        st.busy='';
        if(r&&r.secret){st.secret=String(r.secret);st.msg={type:'ok',text:'New signing secret created.'};}
        else st.msg={type:'err',text:'The new secret could not be shown. Please try again.'};
        await loadStatus(true);
      }catch(e){
        console.error('GLIME webhook rotate error:',e);
        st.busy='';
        st.msg={type:'err',text:cleanMsg(e)};
        draw();
      }
      return;
    }

    if(act==='disconnect'){
      if(!saved)return;
      if(!(await gdConfirm('Disconnect this webhook? GLIME will stop sending events and delete the saved URL and signing secret.',{title:'Disconnect webhook',confirmText:'Disconnect',danger:true})))return;
      st.busy='disconnect';st.msg=null;draw();
      try{
        await api.disconnect();
        st.busy='';
        st.state='not_connected';st.info=null;st.secret=null;st.deliveries=null;
        st.open=false;resetForm();
        st.banner={type:'ok',text:'Webhook disconnected.'};
      }catch(e){
        console.error('GLIME webhook disconnect error:',e);
        st.busy='';
        st.msg={type:'err',text:cleanMsg(e)};
      }
      draw();
      return;
    }
  });

  /* Coming back from the back/forward cache: refresh the real status. */
  window.addEventListener('pageshow',ev=>{if(ev.persisted&&alive()&&!st.busy)loadStatus(true);});

  loadStatus(false);
}

window.GLIME_WEBHOOK={mount};
})();
