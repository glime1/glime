/* =========================================================
   GLIME — SHIPROCKET CARGO CONNECTOR (Settings > Connector)
   ---------------------------------------------------------
   Frontend only. Backend already exists:
     glime-shiprocket-cargo-gateway   (verify_jwt = true)
       GET  ?action=cargo.status
       POST ?action=cargo.connect          {cargo_client_id, access_token, refresh_token}
       POST ?action=cargo.disconnect
       GET  ?action=cargo.permissions
       POST ?action=cargo.permission.set   {permission_key, enabled}
     glime-shiprocket-cargo-webhook   (called by the Cargo portal, not by this page)

   Rules:
   - Cargo credentials are sent once to the gateway over HTTPS and are
     never stored in the browser (no localStorage / sessionStorage).
   - Webhook tokens returned by cargo.connect are kept in memory only,
     shown masked, and dropped when the panel is closed.
   - Never shows "Connected" unless the gateway status says so.
   - Uses the shared Connector styles (gcx-*) from connector-ui.js.
   Loaded on demand by settings-connector-addon.js. If this file
   fails to load, the rest of the Connector page is unaffected.
   ========================================================= */
(function(){
'use strict';
if(window.GLIME_CARGO)return;

const FN='glime-shiprocket-cargo-gateway';
const STREAMS=[
  ['shipment_updates','Shipment updates URL','Shipment lifecycle events'],
  ['tracking_updates','Tracking updates URL','Scan and status events'],
  ['pod','Proof of Delivery (POD) URL','Signed POD / e-proof link']
];
const BADGE={
  connected:['Connected ✓','on'],
  not_connected:['Not connected',''],
  loading:['Loading…',''],
  error:['Status error','off']
};
const TRUCK='<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>';

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
      const m=data&&(data.message||(typeof data.error==='string'?data.error:''));
      throw mkErr(m||'Shiprocket Cargo request failed.',(data&&data.error)||res.status);
    }
    return data||{};
  }

  return {
    status:()=>call('cargo.status',{method:'GET'}),
    connect:(body)=>call('cargo.connect',{body}),
    disconnect:()=>call('cargo.disconnect',{body:{}}),
    permissions:()=>call('cargo.permissions',{method:'GET'}),
    setPermission:(permission_key,enabled)=>call('cargo.permission.set',{body:{permission_key,enabled}})
  };
}

/* ---------- Rendering ---------- */
function copyRow(label,value,display,aria){
  return `
    <div class="gcx-label">${esc(label)}</div>
    <div class="gcx-ep" style="margin-bottom:10px">
      <code>${esc(display==null?value:display)}</code>
      <button type="button" class="gcx-btn" data-cargo-act="copy" data-cargo-copy="${esc(value)}" aria-label="${esc(aria||('Copy '+label))}">Copy</button>
    </div>`;
}

function connectPanel(st){
  const f=st.form;
  const msg=st.msg?`<div class="gcx-status ${st.msg.type==='ok'?'ok':'err'}" role="${st.msg.type==='ok'?'status':'alert'}">${esc(st.msg.text)}</div>`:'';
  const updating=st.state==='connected';
  const dis=st.busy?'disabled':'';
  return `
    <div class="gcx-panel" id="gcx-panel-shiprocket-cargo">
      <p class="gcx-panel-title">${updating?'Update Shiprocket Cargo credentials':'Connect Shiprocket Cargo'}</p>
      <ol class="gcx-steps">
        <li>Open your Shiprocket Cargo portal: Account Settings, Additional Settings, API Tokens.</li>
        <li>Copy the Client ID, Access Token and Refresh Token.</li>
        <li>Paste them below and connect. GLIME verifies them and stores them encrypted.</li>
      </ol>
      ${msg}
      <label class="gcx-field"><span class="gcx-label">Client ID</span><input class="gcx-input" data-cargo-field="cargo_client_id" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="64" value="${esc(f.cargo_client_id)}" ${dis}></label>
      <label class="gcx-field"><span class="gcx-label">Access token</span><input class="gcx-input" data-cargo-field="access_token" type="password" autocomplete="off" spellcheck="false" maxlength="10000" value="${esc(f.access_token)}" ${dis}></label>
      <label class="gcx-field"><span class="gcx-label">Refresh token</span><input class="gcx-input" data-cargo-field="refresh_token" type="password" autocomplete="off" spellcheck="false" maxlength="10000" value="${esc(f.refresh_token)}" ${dis}></label>
      <div class="gcx-cal-bar" style="margin-bottom:0">
        <button type="button" class="gcx-btn primary" data-cargo-act="connect" ${dis}>${st.busy?'Connecting…':(updating?'Save credentials':'Connect Shiprocket Cargo')}</button>
        ${updating?`<button type="button" class="gcx-btn" data-cargo-act="back" ${dis}>Cancel</button>`:''}
      </div>
      <p class="gcx-small">If you regenerate the API token in the Cargo portal, the old refresh token stops working. Come back here and update the credentials.</p>
    </div>`;
}

function setupPanel(st){
  const rows=STREAMS.map(s=>{
    const w=st.setup&&st.setup[s[0]];
    if(!w)return '';
    return `
      <div class="gcx-panel" style="margin-bottom:10px">
        <p class="gcx-panel-title">${esc(s[1])}</p>
        <p class="gcx-small" style="margin:0 0 8px">${esc(s[2])}</p>
        ${copyRow('Webhook URL',w.url||'',null,'Copy '+s[1])}
        ${copyRow('Auth token / secret',w.authorization_token||'','••••••••••••••••••••','Copy auth token for '+s[1])}
      </div>`;
  }).join('');
  return `
    <div class="gcx-panel" id="gcx-panel-shiprocket-cargo">
      <p class="gcx-panel-title">Connected. Finish webhook setup in Cargo</p>
      <ol class="gcx-steps">
        <li>In the Cargo portal open API Tokens, then Webhook push URLs.</li>
        <li>For each stream below, paste the Webhook URL and the Auth token / secret.</li>
        <li>Turn webhooks on and press Save URLs.</li>
      </ol>
      ${rows}
      <p class="gcx-small">These tokens are shown only now and are kept in this page's memory. To see them again later, use Update credentials and save again.</p>
      <div class="gcx-cal-bar" style="margin-bottom:0"><button type="button" class="gcx-btn primary" data-cargo-act="done">Done</button></div>
    </div>`;
}

function permsHtml(st){
  if(st.permLoading)return '<div class="gcx-status" role="status">Loading permissions…</div>';
  if(st.permErr&&!st.perms)return `<div class="gcx-status err" role="alert">${esc(st.permErr)} <button type="button" class="gcx-btn" data-cargo-act="perm-retry" style="min-height:36px;margin-left:8px">Retry</button></div>`;
  if(!st.perms)return '';
  if(!st.perms.length)return '<div class="gcx-status">No permissions are defined for this connector yet.</div>';
  const err=st.permErr?`<div class="gcx-status err" role="alert">${esc(st.permErr)}</div>`:'';
  return err+'<div class="gcx-perm-list">'+st.perms.map(p=>{
    const busy=st.permBusy&&st.permBusy[p.permission_key];
    const name=p.display_name||p.permission_key;
    return `
    <div class="gcx-perm">
      <span>${esc(name)}${p.destructive?' <small style="color:var(--gcx-rd)">· changes data</small>':''}</span>
      <label class="gcx-check" style="margin:0">
        <input type="checkbox" data-cargo-perm="${esc(p.permission_key)}" ${p.enabled?'checked':''} ${busy?'disabled':''} aria-label="${esc((p.enabled?'Disable ':'Enable ')+name)}">
        <b class="${p.enabled?'allowed':'blocked'}">${p.enabled?'ON':'OFF'}</b>
      </label>
    </div>`;
  }).join('')+'</div>';
}

function managePanel(st){
  const info=st.info||{};
  const urls=info.webhook_urls||{};
  const msg=st.msg?`<div class="gcx-status ${st.msg.type==='ok'?'ok':'err'}" role="${st.msg.type==='ok'?'status':'alert'}">${esc(st.msg.text)}</div>`:'';
  const hooks=STREAMS.map(s=>urls[s[0]]?copyRow(s[1],urls[s[0]],null,'Copy '+s[1]):'').join('');
  const ready=Array.isArray(info.webhook_streams_ready)?info.webhook_streams_ready.length:0;
  return `
    <div class="gcx-panel" id="gcx-panel-shiprocket-cargo">
      <p class="gcx-panel-title">Shiprocket Cargo connection</p>
      ${msg}
      <p class="gcx-small" style="margin-top:0">GLIME can create orders, book shipments, track deliveries and manage warehouses on your Cargo account, only as allowed below.</p>

      <p class="gcx-panel-title" style="margin-top:14px">Permissions</p>
      ${permsHtml(st)}

      <p class="gcx-panel-title" style="margin-top:16px">Webhook URLs</p>
      ${hooks||'<p class="gcx-small" style="margin-top:0">Webhook URLs are not available yet.</p>'}
      <p class="gcx-small" style="margin-top:0">${ready}/3 webhook streams are ready. Webhook tokens are shown only right after connecting. Use Update credentials to see them again.</p>

      <div class="gcx-cal-bar">
        <button type="button" class="gcx-btn" data-cargo-act="update">Update credentials</button>
      </div>
      <div class="gcx-danger-zone">
        <button type="button" class="gcx-btn danger" data-cargo-act="disconnect" ${st.busy?'disabled':''} aria-label="Disconnect Shiprocket Cargo">${st.busy?'Disconnecting…':'Disconnect Shiprocket Cargo'}</button>
        <p class="gcx-small">Disconnecting deletes GLIME's stored Cargo credentials and permissions. Your orders and shipments in Cargo are not deleted.</p>
      </div>
    </div>`;
}

function cardHtml(st){
  const state=st.state;
  const b=BADGE[state]||BADGE.error;
  const stable=state==='connected'||state==='not_connected';
  let action;
  if(stable){
    const label=st.open?'Hide':(state==='connected'?'Manage':'Connect');
    action=`<button type="button" class="gcx-btn ${(state==='not_connected'&&!st.open)?'primary':''}" data-cargo-act="toggle" aria-expanded="${st.open?'true':'false'}" aria-controls="gcx-panel-shiprocket-cargo" aria-label="${esc(label+' Shiprocket Cargo')}">${esc(label)}</button>`;
  }else if(state==='error'){
    action='<button type="button" class="gcx-btn" data-cargo-act="retry" aria-label="Retry Shiprocket Cargo status">Retry</button>';
  }else{
    action='<button type="button" class="gcx-btn" disabled aria-disabled="true">Loading…</button>';
  }

  const info=st.info||{};
  let meta='';
  if(state==='connected'){
    const bits=[];
    if(info.cargo_client_id)bits.push('Client ID: '+esc(info.cargo_client_id));
    if(info.last_verified_at)bits.push('Verified '+esc(fmtDate(info.last_verified_at)));
    meta=(bits.length?`<p class="gcx-meta">${bits.join(' · ')}</p>`:'')+
      (info.last_error?'<p class="gcx-meta warn">Cargo access needs attention. Open Manage and update the credentials.</p>':'');
  }else if(state==='error'){
    meta=`<p class="gcx-meta warn">${esc(st.loadErr||'Status could not be loaded.')}</p>`;
  }

  let panel='';
  if(st.open&&(state==='connected'||state==='not_connected')){
    if(st.setup)panel=setupPanel(st);
    else if(state==='connected'&&st.mode!=='connect')panel=managePanel(st);
    else panel=connectPanel(st);
  }

  return `
  <article class="gcx-card${st.open?' wide':''}" data-provider="shiprocket-cargo" data-state="${esc(state)}">
    <div class="gcx-top">
      <span class="gcx-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${TRUCK}</svg></span>
      <div class="gcx-titles">
        <h4 class="gcx-name">Shiprocket Cargo</h4>
        <span class="gcx-badge ${b[1]}">${esc(b[0])}</span>
      </div>
    </div>
    <p class="gcx-desc">Connect your Shiprocket Cargo account so GLIME can create orders, book shipments and track deliveries for your business.</p>
    ${meta}
    <div class="gcx-actions">${action}</div>
    ${panel}
  </article>`;
}

/* ---------- Mount ---------- */
function mount(container,opts){
  opts=opts||{};
  if(!container||container._gcxCargo)return;
  const sb=opts.sb;
  const UI=window.GLIME_CONNECTOR_UI;
  if(!sb||!UI)return;
  container._gcxCargo=true;
  UI.injectStyles();
  container.classList.add('gcx');

  const api=createApi(sb,{supabaseUrl:opts.supabaseUrl,apiKey:opts.apiKey});
  const st={
    state:'loading',info:null,loadErr:'',open:false,mode:'manage',busy:false,msg:null,banner:null,
    form:{cargo_client_id:'',access_token:'',refresh_token:''},
    setup:null,perms:null,permLoading:false,permErr:'',permBusy:{}
  };
  const alive=()=>container.isConnected;

  function draw(){
    if(!alive())return;
    const banner=st.banner?`<div class="gcx-status ${st.banner.type==='ok'?'ok':'err'}" role="${st.banner.type==='ok'?'status':'alert'}">${esc(st.banner.text)}</div>`:'';
    container.innerHTML=`
      <section class="gcx-group" aria-label="Logistics">
        <h3 class="gcx-group-title">Logistics</h3>
        ${banner}
        <div class="gcx-grid">${cardHtml(st)}</div>
      </section>`;
  }

  function clearForm(){st.form={cargo_client_id:'',access_token:'',refresh_token:''};}

  async function loadStatus(){
    st.state='loading';st.loadErr='';draw();
    try{
      const r=await api.status();
      st.info=r||null;
      st.state=(r&&r.connected)?'connected':'not_connected';
    }catch(e){
      console.error('GLIME Shiprocket Cargo status error:',e);
      st.state='error';st.loadErr=cleanMsg(e);
    }
    draw();
  }

  async function loadPerms(){
    if(st.permLoading)return;
    st.permLoading=true;st.permErr='';draw();
    try{
      const r=await api.permissions();
      st.perms=Array.isArray(r.permissions)?r.permissions:[];
    }catch(e){
      console.error('GLIME Shiprocket Cargo permissions error:',e);
      st.permErr=cleanMsg(e);
    }
    st.permLoading=false;draw();
  }

  function validate(f){
    if(!/^[A-Za-z0-9_-]{1,64}$/.test((f.cargo_client_id||'').trim()))return 'Enter your Cargo Client ID.';
    if(!(f.access_token||'').trim())return 'Enter the Access Token.';
    if(!(f.refresh_token||'').trim())return 'Enter the Refresh Token.';
    return '';
  }

  container.addEventListener('input',ev=>{
    const t=ev.target;
    if(t&&t.matches&&t.matches('[data-cargo-field]'))st.form[t.dataset.cargoField]=t.value;
  });

  container.addEventListener('change',async ev=>{
    const t=ev.target;
    if(!t||!t.matches||!t.matches('[data-cargo-perm]')||!st.perms)return;
    const key=t.dataset.cargoPerm;
    const want=t.checked;
    const row=st.perms.find(p=>p.permission_key===key);
    if(!row)return;
    row.enabled=want;st.permBusy[key]=true;st.permErr='';draw();
    try{
      await api.setPermission(key,want);
    }catch(e){
      console.error('GLIME Shiprocket Cargo permission error:',e);
      row.enabled=!want;
      st.permErr=cleanMsg(e);
    }
    delete st.permBusy[key];draw();
  });

  container.addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-cargo-act]');
    if(!b||!container.contains(b))return;
    const act=b.dataset.cargoAct;

    if(act==='copy'){
      const ok=await copyText(b.dataset.cargoCopy||'');
      const old=b.textContent;
      b.textContent=ok?'Copied':'Copy failed';
      setTimeout(()=>{if(b.isConnected)b.textContent=old;},1600);
      return;
    }
    if(act==='retry'){await loadStatus();return;}
    if(act==='perm-retry'){await loadPerms();return;}

    if(act==='toggle'){
      st.open=!st.open;st.msg=null;st.banner=null;
      if(!st.open){st.setup=null;st.mode='manage';clearForm();}
      draw();
      if(st.open&&st.state==='connected'&&st.mode==='manage'&&!st.perms)loadPerms();
      const again=container.querySelector('[data-cargo-act="toggle"]');
      if(again)again.focus();
      return;
    }
    if(act==='update'){st.mode='connect';st.msg=null;clearForm();draw();return;}
    if(act==='back'){st.mode='manage';st.msg=null;clearForm();draw();return;}
    if(act==='done'){st.setup=null;st.open=false;st.mode='manage';draw();return;}

    if(act==='connect'){
      if(st.busy)return;
      const problem=validate(st.form);
      if(problem){st.msg={type:'err',text:problem};draw();return;}
      st.busy=true;st.msg=null;st.banner=null;draw();
      try{
        const r=await api.connect({
          cargo_client_id:st.form.cargo_client_id.trim(),
          access_token:st.form.access_token.trim(),
          refresh_token:st.form.refresh_token.trim()
        });
        clearForm();
        st.busy=false;
        try{
          const s=await api.status();
          st.info=s||null;
          st.state=(s&&s.connected)?'connected':'not_connected';
        }catch(e2){
          st.info={cargo_client_id:r.cargo_client_id||null};
          st.state='connected';
        }
        st.mode='manage';
        st.setup=(r&&r.webhook_setup)||null;
        st.perms=null;
        st.open=true;
        st.banner={type:'ok',text:'Shiprocket Cargo connected successfully.'};
        draw();
        if(!st.setup)loadPerms();
      }catch(e){
        console.error('GLIME Shiprocket Cargo connect error:',e);
        st.busy=false;
        st.msg={type:'err',text:cleanMsg(e)};
        draw();
      }
      return;
    }

    if(act==='disconnect'){
      if(st.busy)return;
      if(!(await gdConfirm('Disconnect Shiprocket Cargo? GLIME will delete the stored Cargo credentials and stop creating or tracking shipments.',{title:'Disconnect Shiprocket Cargo',confirmText:'Disconnect',danger:true})))return;
      st.busy=true;st.msg=null;draw();
      try{
        await api.disconnect();
        st.busy=false;
        st.state='not_connected';st.info=null;st.perms=null;st.setup=null;
        st.open=false;st.mode='manage';clearForm();
        st.banner={type:'ok',text:'Shiprocket Cargo disconnected.'};
      }catch(e){
        console.error('GLIME Shiprocket Cargo disconnect error:',e);
        st.busy=false;
        st.msg={type:'err',text:cleanMsg(e)};
      }
      draw();
      return;
    }
  });

  /* Coming back from the back/forward cache: refresh the real status. */
  window.addEventListener('pageshow',ev=>{if(ev.persisted&&alive()&&!st.busy)loadStatus();});

  loadStatus();
}

window.GLIME_CARGO={mount};
})();
