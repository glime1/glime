/* =========================================================
   GLIME SETTINGS — CONNECTOR MODULE
   ---------------------------------------------------------
   Registers Settings > Connector through window.GLIME_SETTINGS.
   Uses the shared UI layer (connector-ui.js). Frontend only:
   reads existing tables, never writes, never fakes a connection.
   WhatsApp / Instagram stay under Channels.
   ========================================================= */
(function(){
'use strict';

const S=window.GLIME_SETTINGS;
if(!S||typeof S.register!=='function'){
  console.warn('GLIME Connector: Settings shell not found');
  return;
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
    const base={
      mcpEndpoint:supabaseUrl+'/functions/v1/glime-mcp-gateway',
      note:{text:'WhatsApp and Instagram are managed under Channels.'}
    };

    UI.render(hub,{...base,status:'loading'});

    try{
      const res=await UI.data.loadAiStatus(api.supabase,{clientId:state.client&&state.client.client_id});
      if(!hub.isConnected)return;
      UI.render(hub,{...base,status:'ready',states:res.states});
      if(res.entitled)UI.renderPermissions(perms,res.permissions);
    }catch(error){
      console.error('GLIME Connector load error:',error);
      if(!hub.isConnected)return;
      UI.render(hub,{...base,status:'error',states:{chatgpt:'error',claude:'error'}});
    }
  }
});
})();
