/* =========================================================
   GLIME SETTINGS — CONNECTOR MODULE
   ---------------------------------------------------------
   Registers Settings > Connector through window.GLIME_SETTINGS.
   Uses the shared UI layer (connector-ui.js).
   - ChatGPT / Claude: existing MCP status (read-only)
   - Google Calendar: existing backend (glime-google-calendar-oauth +
     glime-calendar-gateway). No client ID / secret in the frontend.
   - Razorpay: client's own account via glime-razorpay-oauth.
   - Google OAuth returns here: settings.html?connector=google-calendar&status=...#connector
   - Razorpay OAuth returns here: settings.html?connector=razorpay&status=...&reason=...#connector
   WhatsApp / Instagram stay under Channels.
   ========================================================= */
(function(){
'use strict';

const S=window.GLIME_SETTINGS;
if(!S||typeof S.register!=='function'){
  console.warn('GLIME Connector: Settings shell not found');
  return;
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
      <div id="gcxSettingsPerms" style="margin-top:22px"></div>`;

    const hub=container.querySelector('#gcxSettingsHub');
    const perms=container.querySelector('#gcxSettingsPerms');
    const UI=window.GLIME_CONNECTOR_UI;

    if(!UI){
      hub.innerHTML='<div class="error">The Connector interface could not be loaded. Please refresh the page.</div>';
      return;
    }

    const supabaseUrl=(api.supabase&&api.supabase.supabaseUrl)||'https://ufoulgbiqgjriwapuopc.supabase.co';
    const banner=oauthBanner();
    const base={
      mcpEndpoint:supabaseUrl+'/functions/v1/glime-mcp-gateway',
      note:{text:'WhatsApp and Instagram are managed under Channels.'}
    };

    UI.render(hub,{...base,status:'loading',banner:banner});

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
      if(res.entitled)UI.renderPermissions(perms,res.permissions);
    }catch(error){
      console.error('GLIME Connector load error:',error);
      if(!hub.isConnected)return;
      UI.render(hub,{...base,status:'error',states:{chatgpt:'error',claude:'error','google-calendar':'error',shopify:'error','google-sheets':'error',razorpay:'error'},banner:banner});
    }
  }
});
})();
