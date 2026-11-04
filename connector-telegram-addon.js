/* =========================================================
   GLIME — TELEGRAM CONNECTOR (Settings > Connector and Connector Hub)
   ---------------------------------------------------------
   Frontend only. A card with an ON / OFF switch, built the same way as the
   GLIME Calendar card (connector-calendar-addon.js).
   - ON  : "Telegram" appears in the app-shell sidebar (glime-telegram-nav-addon.js)
           and telegram.html opens. All Telegram settings live on telegram.html.
   - OFF : the sidebar link is removed and telegram.html shows a short
           "turn it on in Connector" message. Nothing is disconnected or deleted.
   The choice is kept per signed-in user in this browser
   (localStorage key glime_tg_on_<auth user id>). When a backend flag is
   added later, only isOn / setOn below need to change.
   Loaded on demand; if it fails, the rest of the Connector page is unaffected.
   Uses the shared Connector styles (gcx-*) from connector-ui.js.
   ========================================================= */
(function(){
'use strict';
if(window.GLIME_TELEGRAM)return;

var PREFIX='glime_tg_on_';
var LOGO='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z';

function isOn(uid){
  try{return !!uid&&localStorage.getItem(PREFIX+uid)==='1';}catch(e){return false;}
}
function setOn(uid,on){
  if(!uid)return false;
  try{
    if(on)localStorage.setItem(PREFIX+uid,'1');
    else localStorage.removeItem(PREFIX+uid);
  }catch(e){return false;}
  try{window.dispatchEvent(new CustomEvent('glime-telegram-connector',{detail:{on:!!on}}));}catch(e){}
  return true;
}

function mount(container,opts){
  opts=opts||{};
  var sb=opts.sb;
  var UI=window.GLIME_CONNECTOR_UI;
  if(!container||container._gcxTg||!sb||!UI)return;
  container._gcxTg=true;
  UI.injectStyles();
  container.classList.add('gcx');

  var st={uid:'',on:false,err:''};

  function draw(){
    if(!container.isConnected||!st.uid)return;
    var on=st.on;
    var err=st.err?'<div class="gcx-status err" role="alert">'+st.err+'</div>':'';
    container.innerHTML=
      '<section class="gcx-group" aria-label="Notifications">'+
        '<h3 class="gcx-group-title">Notifications</h3>'+
        err+
        '<div class="gcx-grid">'+
          '<article class="gcx-card" data-provider="telegram" data-state="'+(on?'connected':'not_connected')+'">'+
            '<div class="gcx-top">'+
              '<span class="gcx-ico gcx-logo" style="color:#26A5E4" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="'+LOGO+'"/></svg></span>'+
              '<div class="gcx-titles">'+
                '<h4 class="gcx-name">Telegram</h4>'+
                '<span class="gcx-badge '+(on?'on':'')+'">'+(on?'On ✓':'Off')+'</span>'+
              '</div>'+
            '</div>'+
            '<p class="gcx-desc">Get your daily business report, new leads, orders and alerts on Telegram, and ask the GLIME bot for your numbers. Telegram does not charge per message. Turn it on to show Telegram in your menu.</p>'+
            '<div class="gcx-actions">'+
              '<button type="button" class="gcx-btn'+(on?'':' primary')+'" data-tg-act="toggle" aria-label="'+(on?'Turn off Telegram':'Turn on Telegram')+'">'+(on?'Turn off':'Turn on')+'</button>'+
              (on?' <a class="gcx-btn primary" href="telegram.html" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none">Open Telegram</a>':'')+
            '</div>'+
            '<p class="gcx-small">Turning it off only hides Telegram from your menu. Your Telegram connection and settings are not deleted.</p>'+
          '</article>'+
        '</div>'+
      '</section>';
  }

  container.addEventListener('click',function(ev){
    var b=ev.target.closest('[data-tg-act="toggle"]');
    if(!b||!container.contains(b))return;
    var want=!st.on;
    if(setOn(st.uid,want)){
      st.on=want;st.err='';
    }else{
      st.err='This setting could not be saved in your browser. Please allow site storage and try again.';
    }
    draw();
    var again=container.querySelector('[data-tg-act="toggle"]');
    if(again)again.focus();
  });

  window.addEventListener('storage',function(e){
    if(!st.uid||(e.key&&e.key!==PREFIX+st.uid))return;
    st.on=isOn(st.uid);draw();
  });

  sb.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;
    if(!s||!s.user)return;
    st.uid=s.user.id;
    st.on=isOn(st.uid);
    draw();
  }).catch(function(e){console.error('GLIME Telegram connector error:',e);});
}

window.GLIME_TELEGRAM={mount:mount,isOn:isOn,setOn:setOn};
})();
