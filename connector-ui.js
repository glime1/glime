/* =========================================================
   GLIME — CONNECTOR UI (shared frontend layer)
   ---------------------------------------------------------
   Used by:
   - settings-connector-addon.js  (Settings > Connector)
   - ai-connections.html          (standalone Connector Hub)

   Rules:
   - No provider secrets, no provider API calls.
   - Accepts configuration + callbacks, renders cards.
   - Never marks a provider "Connected" unless real data says so.
   - data.loadAiStatus() only READS existing tables:
     modules, client_modules, ai_connections, ai_connection_permissions.
   ========================================================= */
(function(){
'use strict';
if(window.GLIME_CONNECTOR_UI)return;

const CATEGORY_ORDER=['AI Assistants','Google Workspace','Commerce','Team Communication'];

const ICONS={
  chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  spark:'<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  drive:'<path d="M9 3h6l6 10-3 6H6l-3-6z"/><path d="M3 13h18"/>',
  sheet:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bag:'<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  hash:'<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  plug:'<path d="M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0zM12 17v4"/>'
};

/* Central provider registry. Add future providers here (or via registerProvider). */
const registry=[
  {id:'chatgpt',name:'ChatGPT',category:'AI Assistants',description:'Secure GLIME MCP connection for approved business data.',icon:'chat',backend:'existing',state:'dynamic',capabilities:['Leads','Follow-ups','Services'],sort:10},
  {id:'claude',name:'Claude',category:'AI Assistants',description:'Secure GLIME MCP connection for approved business data.',icon:'spark',backend:'existing',state:'dynamic',capabilities:['Leads','Follow-ups','Services'],sort:20},
  {id:'gmail',name:'Gmail',category:'Google Workspace',description:'Connect business email workflows.',icon:'mail',backend:'not_implemented',state:'coming_soon',capabilities:[],sort:30},
  {id:'google-drive',name:'Google Drive',category:'Google Workspace',description:'Connect business files, Docs and storage.',icon:'drive',backend:'not_implemented',state:'coming_soon',capabilities:[],sort:40},
  {id:'google-sheets',name:'Google Sheets',category:'Google Workspace',description:'Connect business spreadsheets.',icon:'sheet',backend:'not_implemented',state:'coming_soon',capabilities:[],sort:50},
  {id:'google-calendar',name:'Google Calendar',category:'Google Workspace',description:'Connect business calendars and appointments.',icon:'calendar',backend:'not_implemented',state:'coming_soon',capabilities:[],sort:55},
  {id:'shopify',name:'Shopify',category:'Commerce',description:'Connect products, orders and customer data.',icon:'bag',backend:'not_implemented',state:'coming_soon',capabilities:[],sort:60},
  {id:'slack',name:'Slack',category:'Team Communication',description:'Connect team communication and workflows.',icon:'hash',backend:'not_implemented',state:'coming_soon',capabilities:[],sort:70}
];

const PERMISSION_LABELS={
  'leads.read':'Leads — Read','leads.create':'Leads — Create','leads.update':'Leads — Update','leads.delete':'Leads — Delete',
  'followups.read':'Follow-ups — Read','followups.create':'Follow-ups — Create','followups.update':'Follow-ups — Update','followups.delete':'Follow-ups — Delete',
  'services.read':'Services — Read','services.create':'Services — Create','services.update':'Services — Update','services.delete':'Services — Delete'
};
const PERMISSION_ORDER=Object.keys(PERMISSION_LABELS);

const STATE_BADGE={
  connected:['Connected ✓','on'],
  not_connected:['Not connected',''],
  coming_soon:['Coming soon','soon'],
  unavailable:['Unavailable','off'],
  loading:['Loading…',''],
  error:['Status error','off']
};
const STATE_LABEL={coming_soon:'Coming soon',unavailable:'Unavailable',loading:'Loading…',error:'Status unavailable'};

const CSS=`
.gcx{--gcx-bg:#071016;--gcx-surf:#101b29;--gcx-surf2:#0b1520;--gcx-bd:rgba(184,222,234,.13);--gcx-tx:#f4fbfd;--gcx-mu:#9cabb9;--gcx-cy:#52e8ff;--gcx-gr:#50f5a8;--gcx-rd:#ff8291;color:var(--gcx-tx);font-family:Manrope,Arial,sans-serif;line-height:1.55;min-width:0}
.gcx *{box-sizing:border-box}
.gcx-status{margin:0 0 14px;padding:12px 14px;border-radius:12px;background:var(--gcx-surf);border:1px solid var(--gcx-bd);color:var(--gcx-mu);font-size:.8rem}
.gcx-status.err{color:var(--gcx-rd);border-color:rgba(255,130,145,.32)}
.gcx-group{margin-bottom:24px}
.gcx-group-title{margin:0 2px 10px;font-size:.68rem;letter-spacing:.12em;font-weight:800;color:var(--gcx-mu);text-transform:uppercase}
.gcx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.gcx-card{display:flex;flex-direction:column;gap:10px;min-width:0;padding:16px;border-radius:18px;border:1px solid var(--gcx-bd);background:linear-gradient(160deg,rgba(82,232,255,.045),transparent 55%),var(--gcx-surf)}
.gcx-card[data-state=connected]{border-color:rgba(80,245,168,.32)}
.gcx-top{display:flex;align-items:center;gap:12px;min-width:0}
.gcx-ico{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--gcx-surf2);border:1px solid var(--gcx-bd);color:var(--gcx-cy)}
.gcx-ico svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.gcx-titles{flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.gcx-name{margin:0;font-size:1rem;font-weight:800}
.gcx-badge{font-size:.66rem;font-weight:800;padding:4px 9px;border-radius:99px;border:1px solid var(--gcx-bd);color:var(--gcx-mu);white-space:nowrap}
.gcx-badge.on{color:var(--gcx-gr);border-color:rgba(80,245,168,.38);background:rgba(80,245,168,.07)}
.gcx-badge.soon{color:var(--gcx-cy);border-color:rgba(82,232,255,.28)}
.gcx-badge.off{color:var(--gcx-rd);border-color:rgba(255,130,145,.32)}
.gcx-desc{margin:0;color:var(--gcx-mu);font-size:.8rem;overflow-wrap:anywhere}
.gcx-actions{margin-top:auto;padding-top:4px}
.gcx-btn{min-height:44px;border:1px solid var(--gcx-bd);background:transparent;color:var(--gcx-tx);border-radius:10px;padding:10px 16px;font:inherit;font-size:.78rem;font-weight:800;cursor:pointer}
.gcx-btn:hover:not(:disabled){border-color:rgba(82,232,255,.45)}
.gcx-btn.primary{background:linear-gradient(105deg,var(--gcx-gr),var(--gcx-cy));color:#031014;border:0}
.gcx-btn:disabled{opacity:.55;cursor:default}
.gcx-btn:focus-visible,.gcx-note a:focus-visible{outline:2px solid var(--gcx-cy);outline-offset:2px}
.gcx-panel{padding:14px;border-radius:14px;background:var(--gcx-surf2);border:1px solid var(--gcx-bd)}
.gcx-panel-title{margin:0 0 8px;font-size:.8rem;font-weight:800}
.gcx-steps{margin:0 0 12px;padding-left:18px;color:var(--gcx-mu);font-size:.76rem}
.gcx-steps li{margin-bottom:4px}
.gcx-label{font-size:.66rem;letter-spacing:.1em;font-weight:800;color:var(--gcx-mu);text-transform:uppercase;margin-bottom:6px}
.gcx-ep{display:flex;align-items:stretch;gap:8px;flex-wrap:wrap}
.gcx-ep code{flex:1;min-width:0;padding:10px;border-radius:9px;background:#090d13;border:1px solid var(--gcx-bd);font-size:.7rem;color:#cbd5e1;overflow-wrap:anywhere;font-family:ui-monospace,Consolas,monospace}
.gcx-small{margin:10px 0 0;color:var(--gcx-mu);font-size:.72rem}
.gcx-note{margin-top:4px;color:var(--gcx-mu);font-size:.76rem}
.gcx-note a{color:var(--gcx-cy);font-weight:800}
.gcx-perms{padding:18px;border-radius:18px;border:1px solid var(--gcx-bd);background:var(--gcx-surf)}
.gcx-perms h3{margin:0 0 4px;font-size:1.02rem}
.gcx-perm-list{margin-top:10px}
.gcx-perm{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid var(--gcx-bd);font-size:.78rem}
.gcx-perm b{font-size:.7rem;letter-spacing:.06em}
.gcx-perm .allowed{color:var(--gcx-gr)}
.gcx-perm .blocked{color:var(--gcx-mu)}
@media(max-width:700px){.gcx-grid{grid-template-columns:1fr}}
@media(max-width:520px){.gcx-btn{width:100%}.gcx-ep .gcx-btn{width:100%}.gcx-card{padding:14px}}
`;

function esc(v){
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function injectStyles(){
  if(document.getElementById('gcx-styles'))return;
  const s=document.createElement('style');
  s.id='gcx-styles';
  s.textContent=CSS;
  document.head.appendChild(s);
}

function registerProvider(p){
  if(!p||!p.id||!p.name)return;
  const item={category:'Other',description:'',icon:'plug',backend:'not_implemented',state:'coming_soon',capabilities:[],sort:1000,...p};
  const i=registry.findIndex(x=>x.id===item.id);
  if(i>=0)registry[i]=item;else registry.push(item);
}

function getProviders(opts){
  let list=registry.slice();
  if(Array.isArray(opts.only))list=list.filter(p=>opts.only.includes(p.id));
  return list.sort((a,b)=>(a.sort||0)-(b.sort||0));
}

function resolveState(p,states){
  const s=states&&states[p.id];
  if(s&&STATE_BADGE[s])return s;
  if(p.state==='dynamic')return 'loading';
  return STATE_BADGE[p.state]?p.state:'coming_soon';
}

function panelHtml(p,state,opts){
  const connected=state==='connected';
  const steps=connected?'':`
    <ol class="gcx-steps">
      <li>Open ${esc(p.name)} and start its Add MCP / connector flow.</li>
      <li>Use the GLIME MCP endpoint shown below.</li>
      <li>Approve the request on the GLIME consent screen.</li>
      <li>This page shows Connected once the connection is active.</li>
    </ol>`;
  const ep=opts.mcpEndpoint?`
    <div class="gcx-label">GLIME MCP endpoint</div>
    <div class="gcx-ep">
      <code>${esc(opts.mcpEndpoint)}</code>
      <button type="button" class="gcx-btn" data-gcx-copy="${esc(opts.mcpEndpoint)}" aria-label="Copy GLIME MCP endpoint">Copy</button>
    </div>`:'';
  const works=(p.capabilities&&p.capabilities.length)?`<p class="gcx-small">Works with: ${p.capabilities.map(esc).join(', ')}. Permissions are controlled by GLIME and enforced server-side.</p>`:'';
  return `
    <div class="gcx-panel" id="gcx-panel-${esc(p.id)}">
      <p class="gcx-panel-title">${connected?'Connected through GLIME OAuth. Access remains controlled by GLIME permissions.':'Set up '+esc(p.name)}</p>
      ${steps}${ep}${works}
      <p class="gcx-small">No database or source-code access is granted.</p>
    </div>`;
}

function cardHtml(p,state,opts,open){
  const badge=STATE_BADGE[state];
  const interactive=p.backend==='existing'&&(state==='connected'||state==='not_connected');
  let action;
  if(interactive){
    const label=open?'Hide setup':(state==='connected'?'View connection':'Open setup');
    action=`<button type="button" class="gcx-btn ${state==='not_connected'?'primary':''}" data-gcx-toggle="${esc(p.id)}" aria-expanded="${open?'true':'false'}" aria-controls="gcx-panel-${esc(p.id)}" aria-label="${esc(label+' for '+p.name)}">${esc(label)}</button>`;
  }else{
    const label=STATE_LABEL[state]||'Coming soon';
    action=`<button type="button" class="gcx-btn" disabled aria-disabled="true" aria-label="${esc(p.name+': '+label)}">${esc(label)}</button>`;
  }
  return `
  <article class="gcx-card" data-provider="${esc(p.id)}" data-state="${esc(state)}">
    <div class="gcx-top">
      <span class="gcx-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[p.icon]||ICONS.plug}</svg></span>
      <div class="gcx-titles">
        <h4 class="gcx-name">${esc(p.name)}</h4>
        <span class="gcx-badge ${badge[1]}">${esc(badge[0])}</span>
      </div>
    </div>
    <p class="gcx-desc">${esc(p.description)}</p>
    <div class="gcx-actions">${action}</div>
    ${interactive&&open?panelHtml(p,state,opts):''}
  </article>`;
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

function bind(container){
  if(container._gcxBound)return;
  container._gcxBound=true;
  container.addEventListener('click',async ev=>{
    const opts=container._gcxOpts||{};
    const toggle=ev.target.closest('[data-gcx-toggle]');
    if(toggle){
      const id=toggle.dataset.gcxToggle;
      const set=container._gcxOpen;
      const opening=!set.has(id);
      if(opening)set.add(id);else set.delete(id);
      render(container,opts);
      const again=container.querySelector('[data-gcx-toggle="'+id+'"]');
      if(again)again.focus();
      if(typeof opts.onAction==='function'){try{opts.onAction(id,opening?'setup-open':'setup-close');}catch(e){console.error(e);}}
      return;
    }
    const copy=ev.target.closest('[data-gcx-copy]');
    if(copy){
      const ok=await copyText(copy.dataset.gcxCopy);
      const old=copy.textContent;
      copy.textContent=ok?'Copied':'Copy failed';
      setTimeout(()=>{copy.textContent=old;},1600);
    }
  });
}

/*
  render(container, opts)
  opts: {
    status:   'loading' | 'ready' | 'error'
    states:   { providerId: 'connected'|'not_connected'|'unavailable'|'error'|'loading'|'coming_soon' }
    mcpEndpoint, errorMessage, only:[ids], note:{text,linkText,href}, onAction(id, action)
  }
*/
function render(container,opts){
  if(!container)return;
  opts=opts||{};
  injectStyles();
  container.classList.add('gcx');
  container._gcxOpts=opts;
  container._gcxOpen=container._gcxOpen||new Set();
  bind(container);

  const list=getProviders(opts);
  let status='';
  if(opts.status==='loading')status='<div class="gcx-status" role="status">Loading connectors…</div>';
  else if(opts.status==='error')status=`<div class="gcx-status err" role="alert">${esc(opts.errorMessage||'Connector status could not be loaded.')}</div>`;

  if(!list.length){
    container.innerHTML=status+'<div class="gcx-status">No connectors are available yet.</div>';
    return;
  }

  const cats=CATEGORY_ORDER.slice();
  list.forEach(p=>{if(!cats.includes(p.category))cats.push(p.category);});

  const groups=cats.map(cat=>{
    const items=list.filter(p=>p.category===cat);
    if(!items.length)return '';
    return `
    <section class="gcx-group" aria-label="${esc(cat)}">
      <h3 class="gcx-group-title">${esc(cat)}</h3>
      <div class="gcx-grid">
        ${items.map(p=>cardHtml(p,resolveState(p,opts.states),opts,container._gcxOpen.has(p.id))).join('')}
      </div>
    </section>`;
  }).join('');

  let note='';
  if(opts.note&&opts.note.text){
    const link=(opts.note.href&&opts.note.linkText)?` <a href="${esc(opts.note.href)}">${esc(opts.note.linkText)}</a>`:'';
    note=`<p class="gcx-note">${esc(opts.note.text)}${link}</p>`;
  }

  container.innerHTML=status+groups+note;
}

function renderPermissions(container,rows,opts){
  if(!container)return;
  opts=opts||{};
  injectStyles();
  container.classList.add('gcx');
  const map=new Map((rows||[]).map(x=>[x.permission_key,x.enabled===true]));
  const line=(label,on,fixedBlocked)=>{
    const allowed=!fixedBlocked&&on;
    return `<div class="gcx-perm"><span>${esc(label)}</span><b class="${allowed?'allowed':'blocked'}">${allowed?'ALLOWED':'BLOCKED'}</b></div>`;
  };
  const body=PERMISSION_ORDER.map(k=>line(PERMISSION_LABELS[k],map.get(k)===true,false)).join('')+
    line('Database / SQL / Schema',false,true)+
    line('Source code / prompts / secrets',false,true)+
    line('Reports / analytics / unrelated data',false,true);
  container.innerHTML=`
    <section class="gcx-perms" aria-labelledby="gcx-perm-title">
      <h3 id="gcx-perm-title">GLIME-controlled permissions</h3>
      <p class="gcx-small" style="margin-top:0">Applies to ChatGPT and Claude connections. Permissions are controlled by GLIME and enforced server-side; they cannot be changed from this page.</p>
      <div class="gcx-perm-list">${body}</div>
    </section>`;
}

/* ---------- Read-only data helper (existing tables only) ---------- */
async function loadAiStatus(sb,opts){
  opts=opts||{};
  const none={entitled:false,states:{chatgpt:'unavailable',claude:'unavailable'},permissions:[]};

  const mod=await sb.from('modules').select('id,name,slug').eq('slug','ai-connections').maybeSingle();
  if(mod.error)throw mod.error;
  if(!mod.data)return none;

  let aq=sb.from('client_modules').select('enabled,visible_to_client,status,expires_at').eq('module_id',mod.data.id);
  if(opts.clientId)aq=aq.eq('client_id',opts.clientId);
  const acc=await aq.maybeSingle();
  if(acc.error)throw acc.error;
  const a=acc.data;

  const active=!!a&&a.enabled===true&&(a.status==='active'||a.status==='trial')&&
    (!a.expires_at||new Date(a.expires_at).getTime()>Date.now());
  if(!active||a.visible_to_client!==true)return none;

  let cq=sb.from('ai_connections').select('id,provider,status').eq('status','active');
  if(opts.clientId)cq=cq.eq('client_id',opts.clientId);
  const conns=await cq;
  if(conns.error)throw conns.error;
  const rows=conns.data||[];

  const has=name=>rows.some(x=>String(x.provider||'').toLowerCase()===name);
  const states={chatgpt:has('chatgpt')?'connected':'not_connected',claude:has('claude')?'connected':'not_connected'};

  const ids=rows.map(x=>x.id);
  if(!ids.length)return {entitled:true,states,permissions:[]};

  const perms=await sb.from('ai_connection_permissions').select('connection_id,permission_key,enabled').in('connection_id',ids);
  if(perms.error)throw perms.error;

  const merged=new Map();
  (perms.data||[]).forEach(r=>{
    if(r.enabled===true)merged.set(r.permission_key,true);
    else if(!merged.has(r.permission_key))merged.set(r.permission_key,false);
  });

  return {entitled:true,states,permissions:[...merged].map(([permission_key,enabled])=>({permission_key,enabled}))};
}

window.GLIME_CONNECTOR_UI={
  render,
  renderPermissions,
  registerProvider,
  getProviders:()=>registry.slice(),
  injectStyles,
  data:{loadAiStatus}
};
})();
