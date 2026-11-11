/* =========================================================
   GLIME — CALENDAR CONNECTOR (Settings > Connector and Connector page)
   ---------------------------------------------------------
   Frontend only. A card with an ON / OFF switch for the GLIME Calendar
   (appointments + AI booking agent, calendar.html).
   - ON  : "Calendar" appears in the app-shell sidebar (glime-calendar-nav-addon.js)
           and calendar.html opens.
   - OFF : the sidebar link is removed and calendar.html shows a short
           "turn it on in Connector" message. No bookings are deleted.
   The choice is kept per signed-in user in this browser
   (localStorage key glime_cal_on_<auth user id>). When a backend flag is
   added later, only isOn / setOn below need to change.
   Loaded on demand; if it fails, the rest of the Connector page is unaffected.
   Uses the shared Connector styles (gcx-*) from connector-ui.js.
   ========================================================= */
(function(){
'use strict';
if(window.GLIME_CALENDAR_CONNECTOR)return;

var PREFIX='glime_cal_on_';
var ICON='<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h3M13 14h3M8 17.5h3"/>';

function isOn(uid){
  try{return !!uid&&localStorage.getItem(PREFIX+uid)==='1';}catch(e){return false;}
}
/* Also kept on the server (connector.get / connector.set) so every phone and computer sees the same switch. */
function gw(sb,action,body){
  return sb.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;if(!s)throw new Error('no session');
    return fetch(String(sb.supabaseUrl).replace(/\/$/,'')+'/functions/v1/glime-glimecal-gateway?action='+action,{method:'POST',headers:{Authorization:'Bearer '+s.access_token,apikey:sb.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(body||{})}).then(function(x){return x.json();});
  });
}
function setOn(uid,on){
  if(!uid)return false;
  try{
    if(on)localStorage.setItem(PREFIX+uid,'1');
    else localStorage.removeItem(PREFIX+uid);
  }catch(e){return false;}
  try{window.dispatchEvent(new CustomEvent('glime-calendar-connector',{detail:{on:!!on}}));}catch(e){}
  return true;
}

function mount(container,opts){
  opts=opts||{};
  var sb=opts.sb;
  var UI=window.GLIME_CONNECTOR_UI;
  if(!container||container._gcxCal||!sb||!UI)return;
  container._gcxCal=true;
  UI.injectStyles();
  container.classList.add('gcx');

  var st={uid:'',on:false,err:''};

  function draw(){
    if(!container.isConnected||!st.uid)return;
    var on=st.on;
    var err=st.err?'<div class="gcx-status err" role="alert">'+st.err+'</div>':'';
    container.innerHTML=
      '<section class="gcx-group" aria-label="Business tools">'+
        '<h3 class="gcx-group-title">Business tools</h3>'+
        err+
        '<div class="gcx-grid">'+
          '<article class="gcx-card" data-provider="glime-calendar" data-state="'+(on?'connected':'not_connected')+'">'+
            '<div class="gcx-top">'+
              '<span class="gcx-ico" aria-hidden="true"><svg viewBox="0 0 24 24">'+ICON+'</svg></span>'+
              '<div class="gcx-titles">'+
                '<h4 class="gcx-name">GLIME Calendar</h4>'+
                '<span class="gcx-badge '+(on?'on':'')+'">'+(on?'On ✓':'Off')+'</span>'+
              '</div>'+
            '</div>'+
            '<p class="gcx-desc">Appointment calendar for your business, with an AI agent that checks free time and books, reschedules and cancels for your customers. Turn it on to show Calendar in your menu.</p>'+
            '<div class="gcx-actions">'+
              '<button type="button" class="gcx-btn'+(on?'':' primary')+'" data-cal-act="toggle" aria-label="'+(on?'Turn off GLIME Calendar':'Turn on GLIME Calendar')+'">'+(on?'Turn off':'Turn on')+'</button>'+
              (on?'<a class="gcx-btn primary" href="calendar.html" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none">Open Calendar</a>':'')+
            '</div>'+
            '<p class="gcx-small">Turning it off only hides Calendar from your menu. Your bookings are not deleted.</p>'+
          '</article>'+
        '</div>'+
      '</section>';
  }

  container.addEventListener('click',function(ev){
    var b=ev.target.closest('[data-cal-act="toggle"]');
    if(!b||!container.contains(b))return;
    var want=!st.on;
    if(setOn(st.uid,want)){
      st.on=want;st.err='';
      gw(sb,'connector.set',{enabled:want}).catch(function(e){console.warn('Calendar connector not saved on server:',e&&e.message);});
    }else{
      st.err='This setting could not be saved in your browser. Please allow site storage and try again.';
    }
    draw();
    var again=container.querySelector('[data-cal-act="toggle"]');
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
    return gw(sb,'connector.get').then(function(d){
      if(d&&typeof d.enabled==='boolean'&&d.enabled!==st.on){setOn(st.uid,d.enabled);st.on=d.enabled;draw();}
      else if(d&&d.enabled==null&&st.on)gw(sb,'connector.set',{enabled:true}).catch(function(){});
    }).catch(function(){});
  }).catch(function(e){console.error('GLIME Calendar connector error:',e);});
}

window.GLIME_CALENDAR_CONNECTOR={mount:mount,isOn:isOn,setOn:setOn};
})();
