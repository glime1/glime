/* =========================================================
   GLIME — CONNECTOR MANAGE ADD-ON (Settings > Connector)
   ---------------------------------------------------------
   Frontend only. Adds, inside each connected connector card:
   - Permissions list (same look as Shiprocket Cargo)
   - Disconnect button (where the card had none)

   Backend actions used (all already exist):
     Google Sheets : glime-connector-gateway?action=disconnect (POST)
     Razorpay      : glime-razorpay-oauth?mode=disconnect      (POST)
     Calendar      : glime-calendar-gateway?action=permissions.update
   Permissions for Sheets / Razorpay / Shopify are READ from
   connector_permissions (RLS: client can view own rows). Toggling them
   needs a backend action, so they are shown read-only for now.

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
/* connector_accounts.provider value for each card */
const DB_PROVIDER={'google-sheets':'google','google-calendar':'google-calendar',razorpay:'razorpay',shopify:'shopify'};

function esc(v){
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function cleanMsg(e){
  if(e&&e.code==='SESSION_EXPIRED')return 'Your session has expired. Please sign in again.';
  const m=String((e&&e.message)||'').trim();
  return (m&&m.length<=200)?m:'Request failed. Please try again.';
}
function mkErr(message,code){const e=new Error(message);e.code=code;return e;}

function mount(hub,opts){
  opts=opts||{};
  const sb=opts.sb;
  if(!hub||!sb||hub._gcxManage)return;
  hub._gcxManage=true;
  const base=String(opts.supabaseUrl||sb.supabaseUrl||'').replace(/\/$/,'');
  const apiKey=opts.apiKey||sb.supabaseKey||'';
  const store={};   /* provider id -> {perms:{key:bool}|null, loading, err, busy:{}, msg} */
  let busyDisconnect=null;
  let scheduled=false;

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
    const st=store[id]||(store[id]={perms:null,loading:false,err:'',busy:{},msg:null});
    if(st.loading||st.perms)return;
    st.loading=true;st.err='';
    try{
      if(id==='google-calendar'){
        const r=await call('glime-calendar-gateway','?action=permissions.list','POST',{});
        st.perms=(r&&r.permissions)||{};
      }else{
        const a=await sb.from('connector_accounts').select('id').eq('provider',DB_PROVIDER[id]).eq('status','connected').maybeSingle();
        if(a.error)throw a.error;
        const perms={};
        if(a.data){
          const p=await sb.from('connector_permissions').select('permission_key,enabled').eq('account_id',a.data.id);
          if(p.error)throw p.error;
          (p.data||[]).forEach(x=>{perms[x.permission_key]=x.enabled===true;});
        }
        st.perms=perms;
      }
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
    const editable=id==='google-calendar';
    const keys=editable?ORDER[id].slice():ORDER[id].filter(k=>k in st.perms);
    Object.keys(st.perms||{}).forEach(k=>{if(keys.indexOf(k)<0)keys.push(k);});
    if(!keys.length)return '<p class="gcx-small" style="margin-top:0">No permissions are recorded for this connector yet.</p>';
    const err=st.err?`<div class="gcx-status err" role="alert">${esc(st.err)}</div>`:'';
    const rows=keys.map(k=>{
      const on=st.perms[k]===true;
      const name=LABELS[k]||k;
      const busy=st.busy[k];
      const flag=DESTRUCTIVE[k]?' <small style="color:var(--gcx-rd)">· changes data</small>':'';
      const ctl=editable
        ?`<label class="gcx-check" style="margin:0"><input type="checkbox" data-gcm-perm="${esc(k)}" ${on?'checked':''} ${busy?'disabled':''} aria-label="${esc((on?'Disable ':'Enable ')+name)}"><b class="${on?'allowed':'blocked'}">${on?'ON':'OFF'}</b></label>`
        :`<b class="${on?'allowed':'blocked'}">${on?'ON':'OFF'}</b>`;
      return `<div class="gcx-perm"><span>${esc(name)}${flag}</span>${ctl}</div>`;
    }).join('');
    const note=editable?'':'<p class="gcx-small">These permissions are set by GLIME when you connect. They are enforced server-side.</p>';
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
    if(id!=='google-calendar')return;
    const st=store[id];
    const key=t.dataset.gcmPerm;
    const want=t.checked;
    st.busy[key]=true;st.msg=null;st.err='';st.perms[key]=want;schedule();
    try{
      const r=await call('glime-calendar-gateway','?action=permissions.update','POST',{permission_key:key,enabled:want});
      if(r&&r.permissions)st.perms=r.permissions;
    }catch(e){
      console.error('GLIME calendar permission error:',e);
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
    const st=store[id]||(store[id]={perms:null,loading:false,err:'',busy:{},msg:null});
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
