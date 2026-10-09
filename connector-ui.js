/* =========================================================
   GLIME — CONNECTOR UI (shared frontend layer)
   ---------------------------------------------------------
   Used by:
   - settings-connector-addon.js  (Settings > Connector)
   - ai-connections.html          (standalone Connector Hub)

   Rules:
   - No provider secrets, no client ID / client secret in the frontend.
   - OAuth is owned by the backend (glime-google-calendar-oauth);
     the frontend only receives the authorization URL and redirects.
   - Calendar data goes through glime-calendar-gateway only.
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

/* Official brand marks (24x24 viewBox, single-colour paths from the Simple Icons set). */
const LOGOS={
  'chatgpt':{c:'#10A37F',p:'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'},
  'claude':{c:'#D97757',p:'m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z'},
  'gmail':{c:'#EA4335',p:'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z'},
  'google-drive':{c:'#1FA463',p:'M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z'},
  'google-sheets':{c:'#34A853',p:'M11.318 12.545H7.91v-1.909h3.41v1.91zM14.728 0v6h6l-6-6zm1.363 10.636h-3.41v1.91h3.41v-1.91zm0 3.273h-3.41v1.91h3.41v-1.91zM20.727 6.5v15.864c0 .904-.732 1.636-1.636 1.636H4.909a1.636 1.636 0 0 1-1.636-1.636V1.636C3.273.732 4.005 0 4.909 0h9.318v6.5h6.5zm-3.273 2.773H6.545v7.909h10.91v-7.91zm-6.136 4.636H7.91v1.91h3.41v-1.91z'},
  'google-calendar':{c:'#4285F4',p:'M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z'},
  'shopify':{c:'#7AB55C',p:'M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z'},
  'slack':{c:'#4A154B',p:'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z'}
};

/* Central provider registry. Add future providers here (or via registerProvider). */
const registry=[
  {id:'chatgpt',name:'ChatGPT',category:'AI Assistants',description:'Secure GLIME MCP connection for approved business data.',icon:'chat',backend:'existing',state:'dynamic',capabilities:['Leads','Follow-ups','Services'],sort:10},
  {id:'claude',name:'Claude',category:'AI Assistants',description:'Secure GLIME MCP connection for approved business data.',icon:'spark',backend:'existing',state:'dynamic',capabilities:['Leads','Follow-ups','Services'],sort:20},
  {id:'gmail',name:'Gmail',category:'Google Workspace',description:'Connect business email workflows.',icon:'mail',backend:'not_implemented',state:'coming_soon',capabilities:[],sort:30},
  {id:'google-drive',name:'Google Drive',category:'Google Workspace',description:'Connect business files, Docs and storage.',icon:'drive',backend:'not_implemented',state:'coming_soon',capabilities:[],sort:40},
  {id:'google-sheets',name:'Google Sheets',category:'Google Workspace',description:'Connect business spreadsheets.',icon:'sheet',backend:'existing',kind:'sheets',state:'dynamic',capabilities:[],sort:50},
  {id:'google-calendar',name:'Google Calendar',category:'Google Workspace',description:'Connect business calendars and appointments.',icon:'calendar',backend:'existing',kind:'calendar',state:'dynamic',capabilities:[],sort:55},
  {id:'shopify',name:'Shopify',category:'Commerce',description:'Connect products and inventory so GLIME AI can answer from your store.',icon:'bag',backend:'existing',kind:'shopify',state:'dynamic',capabilities:['Products','Inventory'],sort:60},
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
.gcx-status.ok{color:var(--gcx-gr);border-color:rgba(80,245,168,.32)}
.gcx-group{margin-bottom:24px}
.gcx-group-title{margin:0 2px 10px;font-size:.68rem;letter-spacing:.12em;font-weight:800;color:var(--gcx-mu);text-transform:uppercase}
.gcx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.gcx-card{display:flex;flex-direction:column;gap:10px;min-width:0;padding:16px;border-radius:18px;border:1px solid var(--gcx-bd);background:linear-gradient(160deg,rgba(82,232,255,.045),transparent 55%),var(--gcx-surf)}
.gcx-card.wide{grid-column:1/-1}
.gcx-card[data-state=connected]{border-color:rgba(80,245,168,.32)}
.gcx-top{display:flex;align-items:center;gap:12px;min-width:0}
.gcx-ico{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--gcx-surf2);border:1px solid var(--gcx-bd);color:var(--gcx-cy)}
.gcx-ico svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.gcx-ico.gcx-logo{background:#fff;border-color:rgba(255,255,255,.85)}
.gcx-ico.gcx-logo svg{width:24px;height:24px;fill:currentColor;stroke:none}
.gcx-titles{flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.gcx-name{margin:0;font-size:1rem;font-weight:800}
.gcx-badge{font-size:.66rem;font-weight:800;padding:4px 9px;border-radius:99px;border:1px solid var(--gcx-bd);color:var(--gcx-mu);white-space:nowrap}
.gcx-badge.on{color:var(--gcx-gr);border-color:rgba(80,245,168,.38);background:rgba(80,245,168,.07)}
.gcx-badge.soon{color:var(--gcx-cy);border-color:rgba(82,232,255,.28)}
.gcx-badge.off{color:var(--gcx-rd);border-color:rgba(255,130,145,.32)}
.gcx-desc{margin:0;color:var(--gcx-mu);font-size:.8rem;overflow-wrap:anywhere}
.gcx-meta{margin:0;color:var(--gcx-mu);font-size:.72rem;overflow-wrap:anywhere}
.gcx-meta.warn{color:var(--gcx-rd)}
.gcx-actions{margin-top:auto;padding-top:4px}
.gcx-btn{min-height:44px;border:1px solid var(--gcx-bd);background:transparent;color:var(--gcx-tx);border-radius:10px;padding:10px 16px;font:inherit;font-size:.78rem;font-weight:800;cursor:pointer}
.gcx-btn:hover:not(:disabled){border-color:rgba(82,232,255,.45)}
.gcx-btn.primary{background:linear-gradient(105deg,var(--gcx-gr),var(--gcx-cy));color:#031014;border:0}
.gcx-btn.danger{color:var(--gcx-rd);border-color:rgba(255,130,145,.38)}
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
.gcx-input{width:100%;min-height:44px;background:var(--gcx-surf);color:var(--gcx-tx);border:1px solid var(--gcx-bd);border-radius:10px;padding:10px 12px;font:inherit;font-size:.82rem;color-scheme:dark}
textarea.gcx-input{min-height:80px;resize:vertical}
.gcx-input:focus-visible{outline:2px solid var(--gcx-cy);outline-offset:2px}
.gcx-cal-bar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.gcx-evs{display:flex;flex-direction:column;gap:8px}
.gcx-ev{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px;border:1px solid var(--gcx-bd);border-radius:12px;background:var(--gcx-surf)}
.gcx-ev-main{min-width:0;flex:1 1 200px;display:flex;flex-direction:column}
.gcx-ev-main b{overflow-wrap:anywhere;font-size:.84rem}
.gcx-ev-main small{color:var(--gcx-mu);font-size:.72rem;overflow-wrap:anywhere}
.gcx-ev-act{display:flex;gap:8px;flex-wrap:wrap}
.gcx-form{margin:12px 0;padding:14px;border-radius:14px;border:1px solid var(--gcx-bd);background:var(--gcx-surf)}
.gcx-field{display:block;margin-bottom:10px}
.gcx-field .gcx-label{display:block}
.gcx-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gcx-check{display:flex;align-items:center;gap:8px;margin:2px 0 10px;font-size:.78rem;min-height:32px}
.gcx-check input{width:18px;height:18px;accent-color:#50f5a8}
.gcx-danger-zone{margin-top:16px;padding-top:12px;border-top:1px solid var(--gcx-bd)}
.gcx-perms{padding:18px;border-radius:18px;border:1px solid var(--gcx-bd);background:var(--gcx-surf)}
.gcx-perms h3{margin:0 0 4px;font-size:1.02rem}
.gcx-perm-list{margin-top:10px}
.gcx-perm{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid var(--gcx-bd);font-size:.78rem}
.gcx-perm b{font-size:.7rem;letter-spacing:.06em}
.gcx-perm .allowed{color:var(--gcx-gr)}
.gcx-perm .blocked{color:var(--gcx-mu)}
@media(max-width:700px){.gcx-grid{grid-template-columns:1fr}}
@media(max-width:520px){.gcx-btn{width:100%}.gcx-ep .gcx-btn{width:100%}.gcx-card{padding:14px}.gcx-row2{grid-template-columns:1fr}}
`;

function esc(v){
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function cleanMsg(e){
  if(e&&e.code==='SESSION_EXPIRED')return 'Your session has expired. Please sign in again.';
  const m=String((e&&e.message)||'').trim();
  return (m&&m.length<=160)?m:'Request failed. Please try again.';
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

function fmtDate(iso){
  const d=new Date(iso);
  return isNaN(d)?'':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
}

/* ======================================================
   GOOGLE CALENDAR — API client (backend already exists)
   OAuth start : POST  /functions/v1/glime-google-calendar-oauth
   Gateway     : /functions/v1/glime-calendar-gateway?action=...
   ====================================================== */
function mkErr(message,code){const e=new Error(message);e.code=code;return e;}

function createCalendarApi(sb,cfg){
  cfg=cfg||{};
  const base=String(cfg.baseUrl||sb.supabaseUrl||'').replace(/\/$/,'');
  const apiKey=cfg.apiKey||sb.supabaseKey||'';

  async function token(){
    const r=await sb.auth.getSession();
    const s=r&&r.data&&r.data.session;
    if(!s)throw mkErr('Your session has expired. Please sign in again.','SESSION_EXPIRED');
    return s.access_token;
  }

  async function call(fn,o){
    o=o||{};
    const t=await token();
    const headers={Authorization:'Bearer '+t};
    if(apiKey)headers.apikey=apiKey;
    const init={method:o.method||'POST',headers};
    if(init.method!=='GET'){headers['Content-Type']='application/json';init.body=JSON.stringify(o.body||{});}
    let res;
    try{res=await fetch(base+'/functions/v1/'+fn+(o.query||''),init);}
    catch(e){throw mkErr('Unable to reach GLIME right now. Please try again.','NETWORK');}
    const data=await res.json().catch(()=>null);
    if(!res.ok)throw mkErr((data&&data.error)||'Calendar request failed.',res.status);
    return data;
  }

  const gw=(action,body,method)=>call('glime-calendar-gateway',{method:method||'POST',query:'?action='+encodeURIComponent(action),body});

  return {
    async status(){
      try{
        const info=await gw('status',null,'GET');
        return {state:(info&&info.status==='connected')?'connected':'not_connected',info:info||null};
      }catch(e){
        if(e.code===400&&/not connected/i.test(e.message))return {state:'not_connected',info:null};
        throw e;
      }
    },
    async startOAuth(){
      const out=await call('glime-google-calendar-oauth',{method:'POST'});
      const url=out&&out.authorization_url;
      if(typeof url!=='string'||url.indexOf('https://accounts.google.com/')!==0)throw mkErr('Google authorization could not be started.','OAUTH');
      window.location.assign(url);
    },
    calendars:()=>gw('calendars.list',{}),
    events:(p)=>gw('events.list',p),
    createEvent:(calendar_id,event)=>gw('event.create',{calendar_id,event}),
    updateEvent:(calendar_id,event_id,event)=>gw('event.update',{calendar_id,event_id,event}),
    deleteEvent:(calendar_id,event_id)=>gw('event.delete',{calendar_id,event_id}),
    disconnect:()=>gw('disconnect',{})
  };
}

let shopMsg=null;

function createShopifyApi(sb,cfg){
  cfg=cfg||{};
  const base=String(cfg.baseUrl||sb.supabaseUrl||'').replace(/\/$/,'');
  const apiKey=cfg.apiKey||sb.supabaseKey||'';

  async function call(fn,o){
    o=o||{};
    const r=await sb.auth.getSession();
    const s=r&&r.data&&r.data.session;
    if(!s)throw mkErr('Your session has expired. Please sign in again.','SESSION_EXPIRED');
    const headers={Authorization:'Bearer '+s.access_token};
    if(apiKey)headers.apikey=apiKey;
    const init={method:o.method||'POST',headers};
    if(init.method!=='GET'){headers['Content-Type']='application/json';init.body=JSON.stringify(o.body||{});}
    let res;
    try{res=await fetch(base+'/functions/v1/'+fn+(o.query||''),init);}
    catch(e){throw mkErr('Unable to reach GLIME right now. Please try again.','NETWORK');}
    const data=await res.json().catch(()=>null);
    if(!res.ok){
      const em=data&&data.error;
      throw mkErr((em&&em.message)||(typeof em==='string'?em:'')||'Shopify request failed.',(em&&em.code)||res.status);
    }
    return data;
  }

  const gw=(action,method)=>call('glime-shopify-gateway',{method:method||'POST',query:'?action='+encodeURIComponent(action),body:{}});

  return {
    async status(){
      const info=await gw('status','GET');
      return {state:(info&&info.connected)?'connected':'not_connected',info:info||null};
    },
    async startOAuth(shop){
      const out=await call('glime-shopify-oauth',{method:'POST',body:{shop}});
      const url=out&&out.authorization_url;
      if(typeof url!=='string'||!/^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com\/admin\/oauth\/authorize\?/i.test(url))throw mkErr('Shopify authorization could not be started.','OAUTH');
      window.location.assign(url);
    },
    disconnect:()=>gw('disconnect','POST')
  };
}

function shopPanelHtml(p,state,info){
  const msg=shopMsg?`<div class="gcx-status ${shopMsg.type==='ok'?'ok':'err'}" role="${shopMsg.type==='ok'?'status':'alert'}">${esc(shopMsg.text)}</div>`:'';
  if(state==='connected'){
    return `
    <div class="gcx-panel" id="gcx-panel-${esc(p.id)}">
      <p class="gcx-panel-title">Connected store</p>
      <p class="gcx-small" style="margin-top:0"><b>${esc((info&&(info.shop_name||info.shop_domain))||'Shopify store')}</b>${info&&info.shop_domain?' · '+esc(info.shop_domain):''}</p>
      <p class="gcx-small">GLIME AI has read-only access to products and inventory. No orders, customers or write access.</p>
      ${msg}
      <div class="gcx-danger-zone">
        <button type="button" class="gcx-btn danger" data-shop-act="disconnect" aria-label="Disconnect Shopify">Disconnect Shopify</button>
        <p class="gcx-small">Disconnecting removes GLIME's saved access. To fully revoke, also uninstall the app from your Shopify admin.</p>
      </div>
    </div>`;
  }
  return `
    <div class="gcx-panel" id="gcx-panel-${esc(p.id)}">
      <p class="gcx-panel-title">Connect your Shopify store</p>
      <ol class="gcx-steps">
        <li>Enter your store's .myshopify.com address.</li>
        <li>Approve read-only access on Shopify.</li>
        <li>You return here and see Connected.</li>
      </ol>
      ${msg}
      <label class="gcx-field"><span class="gcx-label">Shop domain</span><input class="gcx-input" data-shop-input type="text" inputmode="url" autocomplete="off" placeholder="your-store.myshopify.com" maxlength="120"></label>
      <button type="button" class="gcx-btn primary" data-shop-act="connect">Connect Shopify</button>
      <p class="gcx-small">Read-only: products and inventory.</p>
    </div>`;
}

/* ======================================================
   GOOGLE SHEETS — API client (backend already exists)
   OAuth start : POST /functions/v1/glime-google-oauth
   Status      : GET  /functions/v1/glime-connector-gateway?action=status
   ====================================================== */
function createSheetsApi(sb,cfg){
  cfg=cfg||{};
  const base=String(cfg.baseUrl||sb.supabaseUrl||'').replace(/\/$/,'');
  const apiKey=cfg.apiKey||sb.supabaseKey||'';

  async function call(fn,o){
    o=o||{};
    const r=await sb.auth.getSession();
    const s=r&&r.data&&r.data.session;
    if(!s)throw mkErr('Your session has expired. Please sign in again.','SESSION_EXPIRED');
    const headers={Authorization:'Bearer '+s.access_token};
    if(apiKey)headers.apikey=apiKey;
    const init={method:o.method||'POST',headers};
    if(init.method!=='GET'){headers['Content-Type']='application/json';init.body=JSON.stringify(o.body||{});}
    let res;
    try{res=await fetch(base+'/functions/v1/'+fn+(o.query||''),init);}
    catch(e){throw mkErr('Unable to reach GLIME right now. Please try again.','NETWORK');}
    const data=await res.json().catch(()=>null);
    if(!res.ok){
      const em=data&&data.error;
      throw mkErr((typeof em==='string'?em:(em&&em.message))||'Google Sheets request failed.',res.status);
    }
    return data;
  }

  return {
    async status(){
      const info=await call('glime-connector-gateway',{method:'GET',query:'?action=status'});
      const st=info&&info.providers&&info.providers['google-sheets'];
      return {state:st==='connected'?'connected':'not_connected',info:(info&&info.google_account)||null};
    },
    async startOAuth(){
      const out=await call('glime-google-oauth',{method:'POST',body:{}});
      const url=out&&out.authorization_url;
      if(typeof url!=='string'||url.indexOf('https://accounts.google.com/')!==0)throw mkErr('Google authorization could not be started.','OAUTH');
      window.location.assign(url);
    }
  };
}

/* ---------- Calendar manager helpers ---------- */
const pad=n=>String(n).padStart(2,'0');

function localInput(iso){
  const d=new Date(iso);
  if(isNaN(d))return '';
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}

function addDays(dateStr,n){
  const d=new Date(dateStr+'T00:00:00');
  if(isNaN(d))return dateStr;
  d.setDate(d.getDate()+n);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}

function fmtEv(ev){
  const s=ev.start||{},e=ev.end||{};
  if(s.date){
    const d=new Date(s.date+'T00:00:00');
    return 'All day · '+(isNaN(d)?s.date:d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}));
  }
  const a=new Date(s.dateTime),b=new Date(e.dateTime);
  if(isNaN(a))return '';
  const day=a.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
  const t=d=>d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  return day+' · '+t(a)+(isNaN(b)?'':' – '+t(b));
}

function newForm(){
  const d=new Date();
  d.setMinutes(0,0,0);
  d.setHours(d.getHours()+1);
  const e=new Date(d.getTime()+3600000);
  return {id:null,original:null,title:'',allDay:false,start:localInput(d.toISOString()),end:localInput(e.toISOString()),location:'',description:''};
}

function toForm(ev){
  const s=ev.start||{},e=ev.end||{};
  const allDay=!!s.date;
  return {
    id:ev.id,original:ev,title:ev.summary||'',allDay,
    start:allDay?s.date:localInput(s.dateTime),
    end:allDay?addDays(e.date||s.date,-1):localInput(e.dateTime),
    location:ev.location||'',description:ev.description||''
  };
}

function stripEvent(ev){
  const o={...ev};
  ['etag','kind','htmlLink','created','updated'].forEach(k=>{delete o[k];});
  return o;
}

function buildEvent(f){
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ev={...(f.original?stripEvent(f.original):{}),summary:f.title,location:f.location,description:f.description};
  if(f.allDay){
    ev.start={date:f.start};
    ev.end={date:addDays(f.end||f.start,1)};
  }else{
    ev.start={dateTime:new Date(f.start).toISOString(),timeZone:tz};
    ev.end={dateTime:new Date(f.end).toISOString(),timeZone:tz};
  }
  return ev;
}

function validateForm(f){
  if(!f.title)return 'Please enter an event title.';
  if(!f.start)return 'Please choose a start.';
  if(f.allDay){
    if(f.end&&f.end<f.start)return 'The end date cannot be before the start date.';
  }else{
    if(!f.end||new Date(f.end)<=new Date(f.start))return 'The end must be after the start.';
  }
  return '';
}

function readForm(root,f){
  const g=k=>{const n=root.querySelector('[data-f="'+k+'"]');return n?n.value:'';};
  const ad=root.querySelector('[data-f="allDay"]');
  return {...f,title:g('title').trim(),allDay:!!(ad&&ad.checked),start:g('start'),end:g('end'),location:g('location').trim(),description:g('description').trim()};
}

function formHtml(f){
  const type=f.allDay?'date':'datetime-local';
  return `
  <div class="gcx-form" data-cal-form>
    <p class="gcx-panel-title">${f.id?'Edit event':'New event'}</p>
    <label class="gcx-field"><span class="gcx-label">Title</span><input class="gcx-input" data-f="title" maxlength="200" value="${esc(f.title)}"></label>
    <label class="gcx-check"><input type="checkbox" data-f="allDay" data-cal-allday ${f.allDay?'checked':''}> All-day event</label>
    <div class="gcx-row2">
      <label class="gcx-field"><span class="gcx-label">Start</span><input class="gcx-input" type="${type}" data-f="start" value="${esc(f.start)}"></label>
      <label class="gcx-field"><span class="gcx-label">End</span><input class="gcx-input" type="${type}" data-f="end" value="${esc(f.end)}"></label>
    </div>
    <label class="gcx-field"><span class="gcx-label">Location</span><input class="gcx-input" data-f="location" maxlength="300" value="${esc(f.location)}"></label>
    <label class="gcx-field"><span class="gcx-label">Description</span><textarea class="gcx-input" data-f="description" maxlength="2000">${esc(f.description)}</textarea></label>
    <div class="gcx-cal-bar" style="margin-bottom:0">
      <button type="button" class="gcx-btn primary" data-cal-act="save">${f.id?'Save changes':'Create event'}</button>
      <button type="button" class="gcx-btn" data-cal-act="cancel">Cancel</button>
    </div>
  </div>`;
}

function eventsHtml(st){
  if(!st.calendars)return '';
  if(st.eLoading)return '<div class="gcx-status" role="status">Loading events…</div>';
  if(st.eError)return `<div class="gcx-status err" role="alert">${esc(st.eError)}</div>`;
  if(!st.events)return '';
  if(!st.events.length)return '<div class="gcx-status">No events in the next 30 days.</div>';
  return '<div class="gcx-evs">'+st.events.map(ev=>{
    const title=ev.summary||'(No title)';
    return `
    <div class="gcx-ev">
      <div class="gcx-ev-main">
        <b>${esc(title)}</b>
        <small>${esc(fmtEv(ev))}</small>
        ${ev.location?`<small>${esc(ev.location)}</small>`:''}
      </div>
      <div class="gcx-ev-act">
        <button type="button" class="gcx-btn" data-cal-act="edit" data-id="${esc(ev.id)}" aria-label="${esc('Edit event '+title)}">Edit</button>
        <button type="button" class="gcx-btn danger" data-cal-act="delete" data-id="${esc(ev.id)}" aria-label="${esc('Delete event '+title)}">Delete</button>
      </div>
    </div>`;
  }).join('')+'</div>';
}

function calHtml(st,info){
  const acct=(info&&(info.email||info.display_name))?`<p class="gcx-small" style="margin-top:0">Connected account: <b>${esc(info.email||info.display_name)}</b></p>`:'';
  const msg=st.msg?`<div class="gcx-status ${st.msg.type==='ok'?'ok':'err'}" role="${st.msg.type==='ok'?'status':'alert'}" style="margin-top:12px">${esc(st.msg.text)}</div>`:'';
  let body='';
  if(!st.calendars){
    body=st.loading
      ?'<div class="gcx-status" role="status">Loading calendars…</div>'
      :'<div class="gcx-cal-bar"><button type="button" class="gcx-btn" data-cal-act="retry">Retry</button></div>';
  }else if(!st.calendars.length){
    body='<div class="gcx-status">No calendars were found on this Google account.</div>';
  }else{
    const opts=st.calendars.map(c=>`<option value="${esc(c.id)}" ${c.id===st.calId?'selected':''}>${esc(c.summaryOverride||c.summary||c.id)}${c.primary?' (primary)':''}</option>`).join('');
    body=`
      <label class="gcx-field"><span class="gcx-label">Calendar</span><select class="gcx-input" data-cal-select aria-label="Calendar">${opts}</select></label>
      <div class="gcx-cal-bar">
        <button type="button" class="gcx-btn primary" data-cal-act="new">New event</button>
        <button type="button" class="gcx-btn" data-cal-act="refresh">Refresh</button>
      </div>
      ${st.form?formHtml(st.form):''}
      ${eventsHtml(st)}`;
  }
  return `
    ${acct}${msg}${body}
    <div class="gcx-danger-zone">
      <button type="button" class="gcx-btn danger" data-cal-act="disconnect" aria-label="Disconnect Google Calendar">Disconnect Google Calendar</button>
      <p class="gcx-small">Disconnecting revokes GLIME's access to your Google Calendar. Your events in Google are not deleted.</p>
    </div>`;
}

function afterDisconnect(container){
  const o=container._gcxOpts||{};
  o.states=Object.assign({},o.states,{'google-calendar':'not_connected'});
  o.details=Object.assign({},o.details,{'google-calendar':null});
  if(container._gcxOpen)container._gcxOpen.delete('google-calendar');
  container._gcxCal=null;
  container._gcxBanner={type:'ok',text:'Google Calendar disconnected.'};
  render(container,o);
}

function mountCalendar(container,root){
  const opts=container._gcxOpts||{};
  const api=opts.calendarApi;
  if(!api){root.innerHTML='<div class="gcx-status err" role="alert">Calendar tools are unavailable right now.</div>';return;}
  const st=container._gcxCal||(container._gcxCal={calendars:null,calId:'primary',events:null,form:null,msg:null,loading:false,eLoading:false,eError:null});
  const info=(opts.details&&opts.details['google-calendar'])||null;
  const alive=()=>root.isConnected;
  const draw=()=>{if(alive())root.innerHTML=calHtml(st,info);};

  async function loadCalendars(){
    st.loading=true;draw();
    try{
      const r=await api.calendars();
      st.calendars=(r&&r.items)||[];
      if(!st.calendars.some(c=>c.id===st.calId)){
        const prim=st.calendars.find(c=>c.primary);
        st.calId=prim?prim.id:(st.calendars[0]&&st.calendars[0].id)||'primary';
      }
    }catch(e){
      console.error('GLIME calendar list error:',e);
      st.msg={type:'err',text:cleanMsg(e)};
    }
    st.loading=false;draw();
  }

  async function loadEvents(){
    st.eLoading=true;st.eError=null;st.events=null;draw();
    try{
      const now=new Date(),max=new Date(now.getTime()+30*864e5);
      const r=await api.events({calendar_id:st.calId,time_min:now.toISOString(),time_max:max.toISOString(),max_results:50});
      st.events=(r&&r.items)||[];
    }catch(e){
      console.error('GLIME calendar events error:',e);
      st.eError=cleanMsg(e);
    }
    st.eLoading=false;draw();
  }

  root.addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-cal-act]');
    if(!b||!root.contains(b))return;
    const act=b.dataset.calAct;
    st.msg=null;
    try{
      if(act==='refresh'){await loadEvents();return;}
      if(act==='retry'){await loadCalendars();if(st.calendars)await loadEvents();return;}
      if(act==='new'){st.form=newForm();draw();return;}
      if(act==='cancel'){st.form=null;draw();return;}
      if(act==='edit'){
        const e0=(st.events||[]).find(x=>x.id===b.dataset.id);
        if(e0){st.form=toForm(e0);draw();}
        return;
      }
      if(act==='delete'){
        if(!window.confirm('Delete this event from Google Calendar?'))return;
        b.disabled=true;
        await api.deleteEvent(st.calId,b.dataset.id);
        st.msg={type:'ok',text:'Event deleted.'};
        await loadEvents();
        return;
      }
      if(act==='save'){
        const f=readForm(root,st.form);
        st.form=f;
        const problem=validateForm(f);
        if(problem){st.msg={type:'err',text:problem};draw();return;}
        b.disabled=true;
        const body=buildEvent(f);
        if(f.id)await api.updateEvent(st.calId,f.id,body);else await api.createEvent(st.calId,body);
        st.form=null;
        st.msg={type:'ok',text:f.id?'Event updated.':'Event created.'};
        await loadEvents();
        return;
      }
      if(act==='disconnect'){
        if(!window.confirm('Disconnect Google Calendar? GLIME will stop accessing your calendar and its Google access will be revoked.'))return;
        b.disabled=true;
        await api.disconnect();
        afterDisconnect(container);
        return;
      }
    }catch(e){
      console.error('GLIME calendar action error:',e);
      st.msg={type:'err',text:cleanMsg(e)};
      draw();
    }
  });

  root.addEventListener('change',ev=>{
    const t=ev.target;
    if(!t||!t.matches)return;
    if(t.matches('[data-cal-select]')){
      st.calId=t.value;st.msg=null;st.form=null;
      loadEvents();
      return;
    }
    if(t.matches('[data-cal-allday]')&&st.form){
      const f=readForm(root,st.form);
      if(f.allDay){
        f.start=(f.start||'').slice(0,10);
        f.end=(f.end||'').slice(0,10);
      }else{
        f.start=f.start&&f.start.length===10?f.start+'T09:00':f.start;
        f.end=f.end&&f.end.length===10?f.end+'T10:00':f.end;
      }
      st.form=f;draw();
    }
  });

  st.loading=false;st.eLoading=false;
  if(!st.calendars){
    loadCalendars().then(()=>{if(st.calendars&&alive())loadEvents();});
  }else if(!st.events&&!st.eError){
    loadEvents();
  }else{
    draw();
  }
}

/* ======================================================
   Cards
   ====================================================== */
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

function iconHtml(p){
  const l=LOGOS[p.id];
  if(l)return `<span class="gcx-ico gcx-logo" style="color:${esc(l.c)}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="${esc(l.p)}"/></svg></span>`;
  return `<span class="gcx-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[p.icon]||ICONS.plug}</svg></span>`;
}

function cardHtml(p,state,opts,open){
  const badge=STATE_BADGE[state];
  const cal=p.kind==='calendar';
  const shop=p.kind==='shopify';
  const sheets=p.kind==='sheets';
  const stable=state==='connected'||state==='not_connected';
  const interactiveAi=!cal&&!shop&&!sheets&&p.backend==='existing'&&stable;
  const interactiveShop=shop&&stable;
  const interactiveSheets=sheets&&stable;
  const interactiveCal=cal&&stable;
  let action;
  if(interactiveShop){
    const label=open?'Hide':(state==='connected'?'Manage':'Connect');
    action=`<button type="button" class="gcx-btn ${state==='not_connected'?'primary':''}" data-gcx-toggle="${esc(p.id)}" aria-expanded="${open?'true':'false'}" aria-controls="gcx-panel-${esc(p.id)}" aria-label="${esc(label+' '+p.name)}">${esc(label)}</button>`;
  }else if(interactiveSheets&&state==='not_connected'){
    action=`<button type="button" class="gcx-btn primary" data-gcx-connect-sheets="${esc(p.id)}" aria-label="${esc('Connect '+p.name)}">Connect</button>`;
  }else if(interactiveSheets){
    action=`<button type="button" class="gcx-btn" disabled aria-disabled="true" aria-label="${esc(p.name+': Connected')}">Connected</button>`;
  }else if(interactiveAi){
    const label=open?'Hide setup':(state==='connected'?'View connection':'Open setup');
    action=`<button type="button" class="gcx-btn ${state==='not_connected'?'primary':''}" data-gcx-toggle="${esc(p.id)}" aria-expanded="${open?'true':'false'}" aria-controls="gcx-panel-${esc(p.id)}" aria-label="${esc(label+' for '+p.name)}">${esc(label)}</button>`;
  }else if(interactiveCal&&state==='not_connected'){
    action=`<button type="button" class="gcx-btn primary" data-gcx-connect="${esc(p.id)}" aria-label="${esc('Connect '+p.name)}">Connect</button>`;
  }else if(interactiveCal){
    const label=open?'Hide manager':'Manage';
    action=`<button type="button" class="gcx-btn" data-gcx-toggle="${esc(p.id)}" aria-expanded="${open?'true':'false'}" aria-controls="gcx-panel-${esc(p.id)}" aria-label="${esc(label+' '+p.name)}">${esc(label)}</button>`;
  }else{
    const label=STATE_LABEL[state]||'Coming soon';
    action=`<button type="button" class="gcx-btn" disabled aria-disabled="true" aria-label="${esc(p.name+': '+label)}">${esc(label)}</button>`;
  }

  const info=(cal&&state==='connected'&&opts.details)?opts.details[p.id]:null;
  const sinfo=(shop&&opts.details)?opts.details[p.id]:null;
  const smeta=sinfo?`
    <p class="gcx-meta">Store: ${esc(sinfo.shop_name||sinfo.shop_domain||'Shopify store')}${sinfo.last_verified_at?' · Verified '+esc(fmtDate(sinfo.last_verified_at)):''}</p>
    ${sinfo.last_error?'<p class="gcx-meta warn">Shopify access needs attention. Reconnect to continue.</p>':''}`:'';
  const gsinfo=(sheets&&state==='connected'&&opts.details)?opts.details[p.id]:null;
  const gmeta=gsinfo?`
    <p class="gcx-meta">Account: ${esc(gsinfo.email||gsinfo.display_name||'Google account')}</p>`:'';
  const meta=info?`
    <p class="gcx-meta">Account: ${esc(info.email||info.display_name||'Google account')}${info.last_verified_at?' · Verified '+esc(fmtDate(info.last_verified_at)):''}</p>
    ${info.last_error?'<p class="gcx-meta warn">A recent request failed. Open Manage to retry, or reconnect.</p>':''}`:(smeta||gmeta);

  let panel='';
  if(open&&interactiveShop)panel=shopPanelHtml(p,state,sinfo);
  else if(open&&interactiveAi)panel=panelHtml(p,state,opts);
  else if(open&&interactiveCal&&state==='connected')panel=`<div class="gcx-panel gcx-cal" id="gcx-panel-${esc(p.id)}" data-gcx-cal></div>`;

  const wide=(cal&&open&&state==='connected')?' wide':'';
  return `
  <article class="gcx-card${wide}" data-provider="${esc(p.id)}" data-state="${esc(state)}">
    <div class="gcx-top">
      ${iconHtml(p)}
      <div class="gcx-titles">
        <h4 class="gcx-name">${esc(p.name)}</h4>
        <span class="gcx-badge ${badge[1]}">${esc(badge[0])}</span>
      </div>
    </div>
    <p class="gcx-desc">${esc(p.description)}</p>
    ${meta}
    <div class="gcx-actions">${action}</div>
    ${panel}
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

  /* Restoring the page from the back/forward cache (e.g. after Google consent is abandoned) */
  window.addEventListener('pageshow',ev=>{
    if(ev.persisted&&container._gcxOpts)render(container,container._gcxOpts);
  });

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

    const conn=ev.target.closest('[data-gcx-connect]');
    if(conn){
      if(!opts.calendarApi)return;
      conn.disabled=true;
      conn.textContent='Redirecting…';
      try{
        await opts.calendarApi.startOAuth();
      }catch(e){
        console.error('GLIME calendar connect error:',e);
        container._gcxBanner={type:'err',text:cleanMsg(e)};
        render(container,opts);
      }
      return;
    }

    const gs=ev.target.closest('[data-gcx-connect-sheets]');
    if(gs){
      if(!opts.sheetsApi)return;
      gs.disabled=true;
      gs.textContent='Redirecting…';
      try{
        await opts.sheetsApi.startOAuth();
      }catch(e){
        console.error('GLIME Google Sheets connect error:',e);
        container._gcxBanner={type:'err',text:cleanMsg(e)};
        render(container,opts);
      }
      return;
    }

    const sh=ev.target.closest('[data-shop-act]');
    if(sh){
      if(!opts.shopifyApi)return;
      const act=sh.dataset.shopAct;
      try{
        if(act==='connect'){
          const inp=container.querySelector('[data-shop-input]');
          const val=String((inp&&inp.value)||'').trim();
          if(!val){
            shopMsg={type:'err',text:'Enter your store address, like your-store.myshopify.com.'};
            render(container,opts);
            return;
          }
          sh.disabled=true;
          sh.textContent='Redirecting…';
          await opts.shopifyApi.startOAuth(val);
          return;
        }
        if(act==='disconnect'){
          if(!window.confirm('Disconnect Shopify? GLIME will stop reading your products and inventory.'))return;
          sh.disabled=true;
          await opts.shopifyApi.disconnect();
          opts.states=Object.assign({},opts.states,{shopify:'not_connected'});
          opts.details=Object.assign({},opts.details,{shopify:null});
          container._gcxOpen.delete('shopify');
          container._gcxBanner={type:'ok',text:'Shopify disconnected.'};
          shopMsg=null;
          render(container,opts);
        }
      }catch(e){
        console.error('GLIME Shopify action error:',e);
        shopMsg={type:'err',text:cleanMsg(e)};
        render(container,opts);
      }
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
    details:  { 'google-calendar': {email, display_name, last_verified_at, last_error} }
    calendarApi, mcpEndpoint, errorMessage, banner:{type:'ok'|'err',text},
    only:[ids], note:{text,linkText,href}, onAction(id, action)
  }
*/
function render(container,opts){
  if(!container)return;
  opts=opts||{};
  injectStyles();
  container.classList.add('gcx');
  const fresh=container._gcxOpts!==opts;
  container._gcxOpts=opts;
  container._gcxOpen=container._gcxOpen||new Set();
  if(fresh&&Object.prototype.hasOwnProperty.call(opts,'banner'))container._gcxBanner=opts.banner;
  bind(container);

  const list=getProviders(opts);

  const bn=container._gcxBanner;
  let banner='';
  if(bn&&bn.text)banner=`<div class="gcx-status ${bn.type==='ok'?'ok':'err'}" role="${bn.type==='ok'?'status':'alert'}">${esc(bn.text)}</div>`;

  let status='';
  if(opts.status==='loading')status='<div class="gcx-status" role="status">Loading connectors…</div>';
  else if(opts.status==='error')status=`<div class="gcx-status err" role="alert">${esc(opts.errorMessage||'Connector status could not be loaded.')}</div>`;

  if(!list.length){
    container.innerHTML=banner+status+'<div class="gcx-status">No connectors are available yet.</div>';
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

  container.innerHTML=banner+status+groups+note;
  container.querySelectorAll('[data-gcx-cal]').forEach(root=>mountCalendar(container,root));
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

/* ---------- Read-only data helpers ---------- */
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

/* AI/MCP status and Google Calendar status load independently;
   one failing never blocks the other. */
async function loadAll(sb,opts){
  opts=opts||{};
  const cal=createCalendarApi(sb,{baseUrl:opts.supabaseUrl,apiKey:opts.apiKey});
  const shopApi=createShopifyApi(sb,{baseUrl:opts.supabaseUrl,apiKey:opts.apiKey});
  const sheetsApi=createSheetsApi(sb,{baseUrl:opts.supabaseUrl,apiKey:opts.apiKey});
  const [ai,cs,ss,gs]=await Promise.allSettled([loadAiStatus(sb,opts),cal.status(),shopApi.status(),sheetsApi.status()]);

  const states={},details={};
  let entitled=false,permissions=[],aiFailed=false,failed=false;

  if(ai.status==='fulfilled'){
    Object.assign(states,ai.value.states);
    entitled=ai.value.entitled;
    permissions=ai.value.permissions;
  }else{
    console.error('GLIME AI connection status error:',ai.reason);
    states.chatgpt='error';states.claude='error';
    aiFailed=true;failed=true;
  }

  if(cs.status==='fulfilled'){
    states['google-calendar']=cs.value.state;
    details['google-calendar']=cs.value.info||null;
  }else{
    console.error('GLIME Google Calendar status error:',cs.reason);
    states['google-calendar']='error';
    failed=true;
  }

  if(ss.status==='fulfilled'){
    states.shopify=ss.value.state;
    details.shopify=ss.value.info||null;
  }else{
    console.error('GLIME Shopify status error:',ss.reason);
    states.shopify='error';
    failed=true;
  }

  if(gs.status==='fulfilled'){
    states['google-sheets']=gs.value.state;
    details['google-sheets']=gs.value.info||null;
  }else{
    console.error('GLIME Google Sheets status error:',gs.reason);
    states['google-sheets']='error';
    failed=true;
  }

  return {states,details,entitled,permissions,aiFailed,failed,calendarApi:cal,shopifyApi:shopApi,sheetsApi:sheetsApi};
}

window.GLIME_CONNECTOR_UI={
  render,
  renderPermissions,
  registerProvider,
  getProviders:()=>registry.slice(),
  injectStyles,
  calendar:{create:createCalendarApi},
  shopify:{create:createShopifyApi},
  sheets:{create:createSheetsApi},
  data:{loadAiStatus,loadAll}
};
})();
