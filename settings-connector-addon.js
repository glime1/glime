/* =========================================================
   GLIME SETTINGS — CONNECTOR MODULE
   ---------------------------------------------------------
   Registers Settings > Connector through window.GLIME_SETTINGS.
   Uses the shared UI layer (connector-ui.js).
   - ChatGPT / Claude: existing MCP status (read-only)
     When a client does not have the AI Connections module, the cards stay
     visible and the button opens the Omni plan (billing.html?plan=omni).
   - Google Calendar: existing backend (glime-google-calendar-oauth +
     glime-calendar-gateway). No client ID / secret in the frontend.
   - Razorpay: client's own account via glime-razorpay-oauth.
   - Shiprocket Cargo: connector-shiprocket-addon.js (loaded on demand)
     via glime-shiprocket-cargo-gateway.
   - Google OAuth returns here: settings.html?connector=google-calendar&status=...#connector
   - Razorpay OAuth returns here: settings.html?connector=razorpay&status=...&reason=...#connector
   - connector-manage-addon.js (loaded on demand): permissions list + Disconnect inside connected cards.
   WhatsApp / Instagram stay under Channels.
   ========================================================= */
(function(){
'use strict';

const S=window.GLIME_SETTINGS;
if(!S||typeof S.register!=='function'){
  console.warn('GLIME Connector: Settings shell not found');
  return;
}

/* GLIME Omni (the Rs 1499 / month plan) */
const UPGRADE_HREF='billing.html?plan=omni';

/* ChatGPT and Claude need the AI Connections module. When a client does not have it,
   the card stays visible and the button asks for a plan upgrade instead of connecting. */
function patchUpgradeButtons(hub){
  hub.querySelectorAll('.gcx-card[data-provider="chatgpt"][data-state="unavailable"],.gcx-card[data-provider="claude"][data-state="unavailable"]').forEach(function(card){
    const act=card.querySelector('.gcx-actions');
    if(!act||act.querySelector('[data-upgrade]'))return;
    const nameEl=card.querySelector('.gcx-name');
    const name=nameEl?nameEl.textContent:'this connector';
    const a=document.createElement('a');
    a.className='gcx-btn primary';
    a.setAttribute('data-upgrade','');
    a.href=UPGRADE_HREF;
    a.style.cssText='display:inline-flex;align-items:center;justify-content:center;text-decoration:none';
    a.textContent='Upgrade plan to connect';
    a.setAttribute('aria-label','Upgrade your plan to connect '+name);
    act.textContent='';
    act.appendChild(a);
    const badge=card.querySelector('.gcx-badge');
    if(badge)badge.textContent='Plan upgrade required';
  });
}

/* Shiprocket Cargo card lives in its own file so a problem there never breaks this page. */
function loadCargo(){
  return new Promise(function(resolve){
    if(window.GLIME_CARGO)return resolve(true);
    const s=document.createElement('script');
    s.src='connector-shiprocket-addon.js';
    s.onload=function(){resolve(!!window.GLIME_CARGO);};
    s.onerror=function(){resolve(false);};
    document.head.appendChild(s);
  });
}

/* Permissions + Disconnect for connected connectors; also loaded on demand and isolated. */
function loadManage(){
  return new Promise(function(resolve){
    if(window.GLIME_CONNECTOR_MANAGE)return resolve(true);
    const s=document.createElement('script');
    s.src='connector-manage-addon.js';
    s.onload=function(){resolve(!!window.GLIME_CONNECTOR_MANAGE);};
    s.onerror=function(){resolve(false);};
    document.head.appendChild(s);
  });
}

function oauthBanner(){
  let params;
  try{params=new URLSearchParams(location.search);}catch(e){return null;}
  const which=params.get('connector');
  if(which!=='google-calendar'&&which!=='shopify'&&which!=='google-sheets'&&which!=='razorpay')return null;

  const status=params.get('status');
  const reason=params.get('reason');
  try{history.replaceState(null,'',location.pathname+'#connector');}catch(e){}

  if(which==='razorpay'){
    if(status==='connected')return {type:'ok',text:'Razorpay connected successfully.',provider:'razorpay'};
    const m={
      authorization_denied:'Razorpay authorization was cancelled.',
      missing_code_or_state:'The authorization could not be completed. Please try connecting again.',
      invalid_or_expired_state:'The authorization link expired. Please try connecting again.',
      invalid_or_replayed_state:'The authorization link expired. Please try connecting again.',
      oauth_not_configured:'Razorpay connection is not configured yet. Please contact GLIME support.',
      token_exchange_failed:'Razorpay did not complete the authorization. Please try again.',
      account_already_connected:'This Razorpay account is already connected to another GLIME account.',
      client_inactive:'Your GLIME account is not active. Please contact GLIME support.'
    };
    return {type:'err',text:m[reason]||'Razorpay could not be connected. Please try again.',provider:'razorpay'};
  }

  if(which==='google-sheets'){
    if(status==='connected')return {type:'ok',text:'Google Sheets connected successfully.',provider:'google-sheets'};
    const m={
      cancelled:'Google authorization was cancelled.',
      invalid_state:'The authorization link expired. Please try connecting again.',
      server_config:'Google connection is not configured yet. Please contact GLIME support.'
    };
    return {type:'err',text:m[reason]||'Google Sheets could not be connected. Please try again.',provider:'google-sheets'};
  }

  if(which==='shopify'){
    if(status==='connected')return {type:'ok',text:'Shopify connected successfully.',provider:'shopify'};
    const m={
      SHOPIFY_INVALID_STATE:'The authorization link expired. Please try connecting again.',
      SHOPIFY_INVALID_SHOP:'That store address could not be verified. Check the .myshopify.com address.',
      SHOPIFY_ALREADY_CONNECTED:'This Shopify store is already connected to another GLIME account.',
      SHOPIFY_SCOPE_MISSING:'Shopify did not grant the required product and inventory read access.',
      SHOPIFY_AUTH_NOT_CONFIGURED:'Shopify connection is not configured yet. Please contact GLIME support.'
    };
    return {type:'err',text:m[reason]||'Shopify could not be connected. Please try again.',provider:'shopify'};
  }

  if(status==='connected')return {type:'ok',text:'Google Calendar connected successfully.'};
  if(reason==='cancelled')return {type:'err',text:'Google authorization was cancelled.'};
  if(reason==='invalid_state')return {type:'err',text:'The authorization link expired. Please try connecting again.'};
  return {type:'err',text:'Google Calendar could not be connected. Please try again.'};
}

S.register({
  id:'connector',
  label:'Connector',
  order:50,
  render:async function({container,api,state}){
    container.innerHTML=`
      <div class="section-head">
        <h2>Connector</h2>
        <p>Connect GLIME with the tools your business already uses.</p>
      </div>
      <div id="gcxSettingsHub"></div>
      <div id="gcxSettingsCargo" style="margin-top:6px"></div>
      <div id="gcxSettingsPerms" style="margin-top:22px"></div>`;

    const hub=container.querySelector('#gcxSettingsHub');
    const cargoHost=container.querySelector('#gcxSettingsCargo');
    const perms=container.querySelector('#gcxSettingsPerms');
    const UI=window.GLIME_CONNECTOR_UI;

    if(!UI){
      hub.innerHTML='<div class="error">The Connector interface could not be loaded. Please refresh the page.</div>';
      return;
    }

    /* Keep the upgrade button in place whenever the cards are redrawn. */
    new MutationObserver(function(){patchUpgradeButtons(hub);}).observe(hub,{childList:true,subtree:true});

    const supabaseUrl=(api.supabase&&api.supabase.supabaseUrl)||'https://ufoulgbiqgjriwapuopc.supabase.co';
    const banner=oauthBanner();
    const base={
      mcpEndpoint:supabaseUrl+'/functions/v1/glime-mcp-gateway',
      note:{text:'WhatsApp and Instagram are managed under Channels.'}
    };

    UI.render(hub,{...base,status:'loading',banner:banner});

    /* Shiprocket Cargo loads and reports its own status independently of the cards above. */
    loadCargo().then(function(ok){
      if(!ok||!cargoHost.isConnected||!api.supabase)return;
      window.GLIME_CARGO.mount(cargoHost,{
        sb:api.supabase,
        supabaseUrl:supabaseUrl,
        apiKey:api.supabase.supabaseKey
      });
    });

    loadManage().then(function(ok){
      if(!ok||!hub.isConnected||!api.supabase)return;
      window.GLIME_CONNECTOR_MANAGE.mount(hub,{
        sb:api.supabase,
        supabaseUrl:supabaseUrl,
        apiKey:api.supabase.supabaseKey
      });
    });

    try{
      const res=await UI.data.loadAll(api.supabase,{
        clientId:state.client&&state.client.client_id,
        supabaseUrl:supabaseUrl,
        apiKey:api.supabase&&api.supabase.supabaseKey
      });
      if(!hub.isConnected)return;

      /* Never show a success message the real status does not confirm. */
      let b=banner;
      if(b&&b.type==='ok'){
        const key=b.provider==='razorpay'?'razorpay':(b.provider==='shopify'?'shopify':(b.provider==='google-sheets'?'google-sheets':'google-calendar'));
        const names={razorpay:'Razorpay',shopify:'Shopify','google-sheets':'Google Sheets','google-calendar':'Google Calendar'};
        if(res.states[key]!=='connected'){
          b={type:'err',text:names[key]+' connection could not be verified. Please try again.'};
        }
      }

      UI.render(hub,{
        ...base,
        status:res.failed?'error':'ready',
        errorMessage:res.failed?'Some connector statuses could not be loaded.':undefined,
        states:res.states,
        details:res.details,
        calendarApi:res.calendarApi,
        shopifyApi:res.shopifyApi,
        sheetsApi:res.sheetsApi,
        razorpayApi:res.razorpayApi,
        banner:b
      });
      patchUpgradeButtons(hub);
      if(res.entitled)UI.renderPermissions(perms,res.permissions);
    }catch(error){
      console.error('GLIME Connector load error:',error);
      if(!hub.isConnected)return;
      UI.render(hub,{...base,status:'error',states:{chatgpt:'error',claude:'error','google-calendar':'error',shopify:'error','google-sheets':'error',razorpay:'error'},banner:banner});
    }
  }
});
})();
