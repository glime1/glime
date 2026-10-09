/* =========================================================
   GLIME SETTINGS — CONNECTOR MODULE
   ---------------------------------------------------------
   Registers Settings > Connector through window.GLIME_SETTINGS.
   Uses the shared UI layer (connector-ui.js).
   - ChatGPT / Claude: existing MCP status (read-only)
   - Google Calendar: existing backend (glime-google-calendar-oauth +
     glime-calendar-gateway). No client ID / secret in the frontend.
   - Google OAuth returns here: settings.html?connector=google-calendar&status=...#connector
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
  if(which!=='google-calendar'&&which!=='shopify')return null;

  const status=params.get('status');
  const reason=params.get('reason');
  try{history.replaceState(null,'',location.pathname+'#connector');}catch(e){}

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
        const key=b.provider==='shopify'?'shopify':'google-calendar';
        if(res.states[key]!=='connected'){
          b={type:'err',text:(key==='shopify'?'Shopify':'Google Calendar')+' connection could not be verified. Please try again.'};
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
        banner:b
      });
      if(res.entitled)UI.renderPermissions(perms,res.permissions);
    }catch(error){
      console.error('GLIME Connector load error:',error);
      if(!hub.isConnected)return;
      UI.render(hub,{...base,status:'error',states:{chatgpt:'error',claude:'error','google-calendar':'error',shopify:'error'},banner:banner});
    }
  }
});
})();
