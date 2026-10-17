/* =========================================================
   GLIME — CONNECTOR MANAGE ADD-ON (Settings > Connector)
   ---------------------------------------------------------
   Frontend only. Adds, inside each connected connector card:
   - Permissions list with ON/OFF toggles (same look as Shiprocket Cargo)
   - Disconnect button (where the card had none)

   Backend actions used (all already exist):
     Google Sheets : glime-connector-gateway?action=permissions.list / permissions.update
                     glime-connector-gateway?action=disconnect (POST)
     Razorpay      : glime-razorpay-oauth?mode=permissions.list / permissions.update
                     glime-razorpay-oauth?mode=disconnect      (POST)
     Shopify       : glime-shopify-gateway?action=permissions.list / permissions.update
     Calendar      : glime-calendar-gateway?action=permissions.list / permissions.update
   The backend decides what can be enabled (provider scope must be granted).
   If a scope is missing the toggle stays OFF and asks the user to reconnect.

   Loaded on demand by settings-connector-addon.js. If this file fails
   to load, the Connector page is unaffected.
   ========================================================= */
(function(){
'use strict';
if(window.GLIME_CONNECTOR_MANAGE)return;

const LABELS={
  'google.sheets.read':'Google Sheets — Read spreadsheets',
  'google.sheets.write':'Google Sheets — Write / edit cells',
  'google.calendar.read':'Google Calendar — Read calendars & events',
  'google.calendar.events':'Google Calendar — Create, edit & delete events',
  'razorpay.payments.read':'Razorpay — Read payments',
  'razorpay.payments.create':'Razorpay — Create payments',
  'razorpay.refunds.create':'Razorpay — Create refunds',
  'shopify.products.read':'Shopify — Read products',
  'shopify.inventory.read':'Shopify — Read inventory'
};
const DESTRUCTIVE={'google.sheets.write':1,'google.calendar.events':1,'razorpay.payments.create':1,'razorpay.refunds.create':1};
const ORDER={
  'google-sheets':['google.sheets.read','google.sheets.write'],
  'google-calendar':['google.calendar.read','google.calendar.events'],
  razorpay:['razorpay.payments.read','razorpay.payments.create','razorpay.refunds.create'],
  shopify:['shopify.products.read','shopify.inventory.read']
};
/* Backend function + query for listing / updating permissions of each card */
const API={
  'google-calendar':{fn:'glime-calendar-gateway',list:'?action=permissions.list',upd:'?action=permissions.update'},
  'google-sheets':{fn:'glime-connector-gateway',list:'?action=permissions.list',upd:'?action=permissions.update'},
  razorpay:{fn:'glime-razorpay-oauth',list:'?mode=permissions.list',upd:'?mode=permissions.update'},
  shopify:{fn:'glime-shopify-gateway',list:'?action=permissions.list',upd:'?action=permissions.update'}
};

function esc(v){
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function cleanMsg(e){
  if(e&&e.code==='SESSION_EXPIRED')return 'Your session has expired. Please sign in again.';
  const m=String((e&&e.message)||'').trim();
  return (m&&m.length<=200)?m:'Request failed. Please try again.';
}
function mkErr(message,code){const e=new Error(message);e.code=code;return e;}

/* Calendar returns permissions as a {key:bool} map; the other gateways return
   permission_map plus a permissions array with scope details. */
function parsePerms(id,r){
  const meta={};
  let perms={};
  if(id==='google-calendar'){
    if(r&&r.permissions&&typeof r.permissions==='object'&&!Array.isArray(r.permissions))perms=r.permissions;
  }else{
    if(r&&r.permission_map&&typeof r.permission_map==='object')perms=Object.assign({},r.permission_map);
    if(r&&Array.isArray(r.permissions)){
      r.permissions.forEach(function(p){
        if(!p||!p.permission_key)return;
        meta[p.permission_key]=p;
        if(!(p.permission_key in perms))perms[p.permission_key]=p.enabled===true;
      });
    }
  }
  return {perms:perms,meta:meta};
}

function mount(hub,opts){
  opts=opts||{};
  const sb=opts.sb;
  if(!hub||!sb||hub._gcxManage)return;
  hub._gcxManage=true;
  const base=String(opts.supabaseUrl||sb.supabaseUrl||'').replace(/\/$/,'');
  const apiKey=opts.apiKey||sb.supabaseKey||'';
  const store={};   /* provider id -> {perms:{key:bool}|null, meta:{}, loading, err, busy:{}, msg} */
  let busyDisconnect=null;
  let scheduled=false;

  function getSt(id){
    return store[id]||(store[id]={perms:null,meta:{},loading:false,err:'',busy:{},msg:null});
  }

  async function call(fn,query,method,body){
    const r=await sb.auth.getSession();
    const s=r&&r.data&&r.data.session;
    if(!s)throw mkErr('Your session has expired. Please sign in again.','SESSION_EXPIRED');
    const headers={Authorization:'Bearer '+s.access_token};
    if(apiKey)headers.apikey=apiKey;
    const init={method:method||'POST',headers};
    if(init.method!=='GET'){headers['Content-Type']='application/json';init.body=JSON.stringify(body||{});}
    let res;
    try{res=await fetch(base+'/functions/v1/'+fn+(query||''),init);}
    catch(e){throw mkErr('Unable to reach GLIME right now. Please try again.','NETWORK');}
    const data=await res.json().catch(()=>null);
    if(!res.ok){
      const em=data&&data.error;
      throw mkErr((em&&em.message)||(typeof em==='string'?em:'')||'Request failed.',res.status);
    }
    return data;
  }

  async function loadPerms(id){
    const st=getSt(id);
    if(st.loading||st.perms)return;
    st.loading=true;st.err='';
    try{
      const a=API[id];
      const r=await call(a.fn,a.list,'POST',{});
      const p=parsePerms(id,r);
      st.perms=p.perms;st.meta=p.meta;
    }catch(e){
      console.error('GLIME connector permissions error:',e);
      st.err=cleanMsg(e);
    }
    st.loading=false;
    schedule();
  }

  function permsHtml(id){
    const st=store[id];
    if(!st||st.loading||(!st.perms&&!st.err))return '<div class="gcx-status" role="status">Loading permissions…</div>';
    if(st.err&&!st.perms)return `<div class="gcx-status err" role="alert">${esc(st.err)} <button type="button" class="gcx-btn" data-gcm-act="perm-retry" style="min-height:36px;margin-left:8px">Retry</button></div>`;
    const order=ORDER[id]||[];
    const keys=Object.keys(st.perms||{});
    if(id==='google-calendar')order.forEach(k=>{if(keys.indexOf(k)<0)keys.push(k);});
    keys.sort((a,b)=>{
      const ia=order.indexOf(a),ib=order.indexOf(b);
      return (ia<0?99:ia)-(ib<0?99:ib);
    });
    if(!keys.length)return '<p class="gcx-small" style="margin-top:0">No permissions are recorded for this connector yet.</p>';
    const err=st.err?`<div class="gcx-status err" role="alert">${esc(st.err)}</div>`:'';
    const rows=keys.map(k=>{
      const on=st.perms[k]===true;
      const m=st.meta[k]||{};
      const name=LABELS[k]||m.display_name||k;
      const busy=st.busy[k];
      const needsReconnect=m.can_enable===false&&!on;
      const risky=DESTRUCTIVE[k]||m.destructive;
      const flag=risky?' <small style="color:var(--gcx-rd)">· changes data</small>':'';
      const hint=needsReconnect?' <small style="color:var(--gcx-rd)">· reconnect to enable</small>':'';
      const dis=busy||needsReconnect;
      const ctl=`<label class="gcx-check" style="margin:0"><input type="checkbox" data-gcm-perm="${esc(k)}" ${on?'checked':''} ${dis?'disabled':''} aria-label="${esc((on?'Disable ':'Enable ')+name)}"><b class="${on?'allowed':'blocked'}">${on?'ON':'OFF'}</b></label>`;
      return `<div class="gcx-perm"><span>${esc(name)}${flag}${hint}</span>${ctl}</div>`;
    }).join('');
    const note='<p class="gcx-small">Turn a permission OFF to stop GLIME AI from using it. Changes apply immediately and are enforced on the server.</p>';
    return err+'<div class="gcx-perm-list">'+rows+'</div>'+note;
  }

  function blockHtml(id,name,canDisconnect,disconnectNote){
    const st=store[id]||{};
    const msg=st.msg?`<div class="gcx-status ${st.msg.type==='ok'?'ok':'err'}" role="${st.msg.type==='ok'?'status':'alert'}">${esc(st.msg.text)}</div>`:'';
    const dis=busyDisconnect===id;
    const btn=canDisconnect?`
      <div class="gcx-danger-zone">
        <button type="button" class="gcx-btn danger" data-gcm-act="disconnect" ${dis?'disabled':''} aria-label="Disconnect ${esc(name)}">${dis?'Disconnecting…':'Disconnect '+esc(name)}</button>
        <p class="gcx-small">${esc(disconnectNote||'')}</p>
      </div>`:'';
    return `<div class="gcx-panel gcx-manage" data-gcm-for="${esc(id)}" style="margin-top:4px">
      <p class="gcx-panel-title">Permissions</p>
      ${msg}${permsHtml(id)}${btn}
    </div>`;
  }

  const CONFIG={
    'google-sheets':{name:'Google Sheets',disconnect:true,note:"Disconnecting revokes GLIME's access to your Google account and removes its permissions. Your spreadsheets in Google are not deleted."},
    razorpay:{name:'Razorpay',disconnect:true,note:"Disconnecting removes GLIME's saved Razorpay access and permissions. Your payments in Razorpay are not affected."},
    'google-calendar':{name:'Google Calendar',disconnect:false},
    shopify:{name:'Shopify',disconnect:false}
  };

  function inject(){
    scheduled=false;
    if(!hub.isConnected)return;
    hub.querySelectorAll('article.gcx-card[data-provider]').forEach(card=>{
      const id=card.dataset.provider;
      const cfg=CONFIG[id];
      if(!cfg)return;
      const old=card.querySelector(':scope > .gcx-manage');
      if(card.dataset.state!=='connected'){if(old)old.remove();return;}
      /* Shopify and Calendar already render their own panel + disconnect when opened; only add permissions. */
      if(!store[id]||!store[id].perms)loadPerms(id);
      const html=blockHtml(id,cfg.name,cfg.disconnect,cfg.note);
      if(old){
        if(old.dataset.gcmHtml===html)return;
        old.remove();
      }
      const tmp=document.createElement('div');
      tmp.innerHTML=html;
      const el=tmp.firstElementChild;
      el.dataset.gcmHtml=html;
      card.appendChild(el);
    });
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    (window.requestAnimationFrame||setTimeout)(inject);
  }

  const mo=new MutationObserver(function(muts){
    /* ignore our own changes */
    for(const m of muts){
      const t=m.target;
      if(t&&t.closest&&t.closest('.gcx-manage'))continue;
      const own=[...m.addedNodes,...m.removedNodes].every(n=>n.nodeType===1&&n.classList&&n.classList.contains('gcx-manage'));
      if(own&&m.addedNodes.length+m.removedNodes.length>0)continue;
      schedule();return;
    }
  });
  mo.observe(hub,{childList:true,subtree:true});

  hub.addEventListener('change',async function(ev){
    const t=ev.target;
    if(!t||!t.matches||!t.matches('[data-gcm-perm]'))return;
    const holder=t.closest('[data-gcm-for]');
    const id=holder&&holder.dataset.gcmFor;
    if(!id||!API[id])return;
    const st=getSt(id);
    if(!st.perms)return;
    const key=t.dataset.gcmPerm;
    const want=t.checked;
    if(st.busy[key])return;
    st.busy[key]=true;st.msg=null;st.err='';st.perms[key]=want;schedule();
    try{
      const a=API[id];
      const r=await call(a.fn,a.upd,'POST',{permission_key:key,enabled:want});
      const p=parsePerms(id,r);
      if(id!=='google-calendar'||(r&&r.permissions)){st.perms=p.perms;st.meta=p.meta;}
    }catch(e){
      console.error('GLIME connector permission update error:',e);
      st.perms[key]=!want;
      st.err=cleanMsg(e);
    }
    delete st.busy[key];schedule();
  });

  hub.addEventListener('click',async function(ev){
    const b=ev.target.closest&&ev.target.closest('[data-gcm-act]');
    if(!b||!hub.contains(b))return;
    const holder=b.closest('[data-gcm-for]');
    const id=holder&&holder.dataset.gcmFor;
    if(!id)return;
    const st=getSt(id);
    const act=b.dataset.gcmAct;
    if(act==='perm-retry'){st.err='';st.perms=null;loadPerms(id);schedule();return;}
    if(act==='disconnect'){
      if(busyDisconnect)return;
      const cfg=CONFIG[id];
      if(!window.confirm('Disconnect '+cfg.name+'? GLIME will stop using it and its permissions will be removed.'))return;
      busyDisconnect=id;st.msg=null;schedule();
      try{
        if(id==='google-sheets')await call('glime-connector-gateway','?action=disconnect','POST',{});
        else if(id==='razorpay')await call('glime-razorpay-oauth','?mode=disconnect','POST',{});
        try{sessionStorage.setItem('gcx-disconnected',cfg.name);}catch(e){}
        busyDisconnect=null;
        try{history.replaceState(null,'',location.pathname+'#connector');}catch(e){}
        location.reload();
      }catch(e){
        console.error('GLIME connector disconnect error:',e);
        busyDisconnect=null;
        st.msg={type:'err',text:cleanMsg(e)};
        schedule();
      }
    }
  });

  /* After a reload caused by disconnect, confirm it to the user. */
  try{
    const done=sessionStorage.getItem('gcx-disconnected');
    if(done){
      sessionStorage.removeItem('gcx-disconnected');
      const note=document.createElement('div');
      note.className='gcx gcx-status ok';
      note.setAttribute('role','status');
      note.textContent=done+' disconnected.';
      hub.parentNode&&hub.parentNode.insertBefore(note,hub);
      setTimeout(function(){note.remove();},6000);
    }
  }catch(e){}

  schedule();
}

window.GLIME_CONNECTOR_MANAGE={mount};
})();
