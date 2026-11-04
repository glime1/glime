/* =========================================================
   GLIME — CONNECTOR ADD-ON CARDS (one shared list)
   ---------------------------------------------------------
   Used by BOTH pages, so a new connector card is added in ONE place:
   - settings-connector-addon.js  (Settings > Connector)
   - ai-connections.html          (Connector Hub)

   TO ADD A NEW CONNECTOR CARD:
     1. Build its file, e.g. connector-xyz-addon.js, which sets
        window.GLIME_XYZ = { mount(container, {sb, supabaseUrl, apiKey}) }.
     2. Add ONE line to ADDONS below. Nothing else needs to change.

   How it works:
   - mountAll() makes one place per card, in the order listed here.
   - Each card file is loaded on its own. If one fails to load or throws,
     the other cards and the rest of the page keep working.
   - Every card gets the same options: {sb, supabaseUrl, apiKey}.
     A card that does not need some of them simply ignores them.
   - When you change a card file, bump its ?v= number here (one place).
   - The main provider cards (ChatGPT, Claude, Shopify, Sheets, Razorpay ...)
     are NOT here; they come from the registry in connector-ui.js.
   ========================================================= */
(function(){
'use strict';
if(window.GLIME_CONNECTOR_ADDONS)return;

const ADDONS=[
  {id:'cargo',    src:'connector-shiprocket-addon.js',   global:'GLIME_CARGO'},
  {id:'calendar', src:'connector-calendar-addon.js?v=1', global:'GLIME_CALENDAR_CONNECTOR'},
  {id:'telegram', src:'connector-telegram-addon.js?v=1', global:'GLIME_TELEGRAM'},
  {id:'webhook',  src:'connector-webhook-addon.js?v=1',  global:'GLIME_WEBHOOK'}
];

function load(a){
  return new Promise(function(resolve){
    if(window[a.global])return resolve(true);
    const s=document.createElement('script');
    s.src=a.src;
    s.onload=function(){resolve(!!window[a.global]);};
    s.onerror=function(){resolve(false);};
    document.head.appendChild(s);
  });
}

function mountAll(container,opts){
  opts=opts||{};
  if(!container||!opts.sb)return;
  container.innerHTML='';
  ADDONS.forEach(function(a){
    const host=document.createElement('div');
    host.setAttribute('data-gcx-addon',a.id);
    host.style.marginTop='6px';
    container.appendChild(host);
    load(a).then(function(ok){
      if(!ok||!host.isConnected)return;
      try{
        window[a.global].mount(host,{sb:opts.sb,supabaseUrl:opts.supabaseUrl,apiKey:opts.apiKey});
      }catch(e){
        console.error('GLIME connector add-on error ('+a.id+'):',e);
      }
    });
  });
}

window.GLIME_CONNECTOR_ADDONS={mountAll:mountAll,list:function(){return ADDONS.map(function(a){return a.id;});}};
})();
