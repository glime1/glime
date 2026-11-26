/* GLIME Admin — mobile app shell: bottom navigation, grouped More sheet with "new" badges,
   table-to-card labels, and Instagram / WhatsApp buttons in the Clients list.
   Only reads/clicks the existing nav buttons; no admin logic is changed. */
(function(){
  'use strict';
  var app=document.getElementById('app');
  if(!app)return;

  var ICONS={
    overview:'<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    clients:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5a3 3 0 010 6"/><path d="M18 14c2 .6 3.5 2.6 3.5 5"/></svg>',
    billing:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/></svg>',
    safety:'<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
    more:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>'
  };
  var PRIMARY=[['overview','Home'],['clients','Clients'],['billing','Billing'],['safety','Safety']];

  /* Which sections belong together (by the data-view of the sidebar button). */
  var GROUPS=[
    {id:'partner',name:'Partner Program',views:['agency','partner','creator','rewards','promo']},
    {id:'business',name:'Business',views:['overview','clients','reviews','modules','billing','payments','upi','tokens','exportnet']},
    {id:'ai',name:'AI & Safety',views:['voice','ml-learning','safety','care','audit']},
    {id:'support',name:'Support',views:['notifications','contact','feedback','datareq','storage','settings']}
  ];
  var BADGE_SEL='.gc-badge,.gf-badge,.mb';

  /* ---------- styles for the new parts ---------- */
  var st=document.createElement('style');
  st.textContent=
    '.mb{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#ff5263;color:#fff;font-size:11px;font-weight:700;line-height:20px;text-align:center;display:inline-block;flex:none}'+
    '.msheet-grid button{position:relative}'+
    '.msheet-grid button .mb{position:absolute;top:10px;right:10px}'+
    '.msheet-grid button.grp{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;min-height:64px;padding-right:38px}'+
    '.msheet-grid button.grp .g-name{font-weight:700}'+
    '.msheet-grid button.grp .g-sub{font-size:12px;color:var(--muted);font-weight:500}'+
    '.msheet-grid button.row{padding-right:38px}'+
    '.ms-head{display:flex;align-items:center;gap:10px;margin:2px 4px 10px}'+
    '.ms-head h3{margin:0;flex:1}'+
    '.ms-back{display:inline-flex;align-items:center;background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--text);border-radius:10px;min-height:36px;padding:6px 12px;font-weight:600}'+
    '.ms-back[hidden]{display:none}'+
    '.bnav button{position:relative}'+
    '.bnav button .mb{position:absolute;top:2px;left:calc(50% + 4px);min-width:18px;height:18px;line-height:18px;font-size:10px;padding:0 5px}'+
    '.gm-conn{display:flex;flex-direction:column;gap:6px;align-items:flex-start}'+
    '.gm-b{display:inline-flex;align-items:center;min-height:34px;padding:6px 12px;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none;border:1px solid;max-width:100%;word-break:break-all}'+
    '.gm-b.ig{color:#ff7ab6;background:rgba(225,48,108,.1);border-color:rgba(225,48,108,.4)}'+
    '.gm-b.wa{color:#25d366;background:rgba(37,211,102,.1);border-color:rgba(37,211,102,.4)}'+
    '.gm-none{color:var(--muted);font-size:12px}';
  document.head.appendChild(st);

  function sideBtns(){return [].slice.call(document.querySelectorAll('.sidebar nav button'))}
  function activeView(){
    var a=document.querySelector('.sidebar nav button[data-view].active');
    return a?a.getAttribute('data-view'):'overview';
  }
  function goView(v){
    var b=document.querySelector('.sidebar nav button[data-view="'+v+'"]');
    if(b){b.click();window.scrollTo(0,0)}
  }
  function lbl(b){
    var c=b.cloneNode(true);
    [].forEach.call(c.querySelectorAll(BADGE_SEL),function(x){x.remove()});
    return c.textContent.trim();
  }
  function fmt(n){return n>99?'99+':String(n)}
  function mkBadge(n){var s=document.createElement('span');s.className='mb';s.textContent=fmt(n);return s}

  /* ---------- "new items" counts ---------- */
  var counts={};
  function total(views){return views.reduce(function(a,v){return a+(counts[v]||0)},0)}
  function allTotal(){return Object.keys(counts).reduce(function(a,k){return a+(counts[k]||0)},0)}

  /* bottom nav */
  var bnav=document.createElement('div');
  bnav.className='bnav';
  bnav.setAttribute('role','navigation');
  bnav.setAttribute('aria-label','Admin sections');
  PRIMARY.forEach(function(p){
    var b=document.createElement('button');
    b.type='button';
    b.setAttribute('data-go',p[0]);
    b.innerHTML=ICONS[p[0]]+'<span>'+p[1]+'</span>';
    b.onclick=function(){goView(p[0])};
    bnav.appendChild(b);
  });
  var more=document.createElement('button');
  more.type='button';
  more.className='bn-more';
  more.innerHTML=ICONS.more+'<span>More</span>';
  bnav.appendChild(more);

  /* More sheet: sections are grouped; built from the live sidebar so addon-added sections appear too */
  var sheet=document.createElement('div');
  sheet.className='msheet';
  sheet.innerHTML='<div class="msheet-box"><div class="ms-head"><button type="button" class="ms-back" hidden>&#8249; Back</button><h3>All sections</h3></div><div class="msheet-grid"></div></div>';
  var sheetBox=sheet.querySelector('.msheet-box');
  var grid=sheet.querySelector('.msheet-grid');
  var titleEl=sheet.querySelector('.ms-head h3');
  var backBtn=sheet.querySelector('.ms-back');
  var state={group:null};

  function model(){
    var byView={};
    sideBtns().forEach(function(b){
      var v=b.getAttribute('data-view');
      if(v&&!b.classList.contains('logout'))byView[v]=b;
    });
    var used={};
    var gs=GROUPS.map(function(g){
      var vs=g.views.filter(function(v){return byView[v]});
      vs.forEach(function(v){used[v]=1});
      return {id:g.id,name:g.name,views:vs};
    });
    var rest=Object.keys(byView).filter(function(v){return !used[v]});
    if(rest.length)gs.push({id:'other',name:'Other',views:rest});
    return {byView:byView,groups:gs.filter(function(g){return g.views.length})};
  }

  function renderSheet(){
    var m=model(),cur=activeView();
    grid.innerHTML='';
    if(state.group){
      var g=m.groups.filter(function(x){return x.id===state.group})[0];
      if(!g){state.group=null;renderSheet();return}
      titleEl.textContent=g.name;
      backBtn.hidden=false;
      g.views.forEach(function(v){
        var sb=m.byView[v];
        var b=document.createElement('button');
        b.type='button';
        b.className='row'+(v===cur?' active':'');
        b.appendChild(document.createTextNode(lbl(sb)));
        if(counts[v])b.appendChild(mkBadge(counts[v]));
        b.onclick=function(){closeSheet();sb.click();window.scrollTo(0,0)};
        grid.appendChild(b);
      });
    }else{
      titleEl.textContent='All sections';
      backBtn.hidden=true;
      m.groups.forEach(function(g){
        var b=document.createElement('button');
        b.type='button';
        b.className='grp'+(g.views.indexOf(cur)>-1?' active':'');
        var nm=document.createElement('span');nm.className='g-name';nm.textContent=g.name;
        var sub=document.createElement('span');sub.className='g-sub';sub.textContent=g.views.length+' sections';
        b.appendChild(nm);b.appendChild(sub);
        var t=total(g.views);
        if(t)b.appendChild(mkBadge(t));
        b.onclick=function(){state.group=g.id;renderSheet();sheetBox.scrollTop=0};
        grid.appendChild(b);
      });
      var lo=document.querySelector('.sidebar nav .logout');
      if(lo){
        var lb=document.createElement('button');
        lb.type='button';lb.className='logout';lb.textContent=lo.textContent.trim();
        lb.onclick=function(){closeSheet();lo.click()};
        grid.appendChild(lb);
      }
    }
  }

  function openSheet(){
    state.group=null;
    renderSheet();
    sheet.classList.add('open');
    document.body.classList.add('m-lock');
    refreshCounts();
  }
  function closeSheet(){
    sheet.classList.remove('open');
    document.body.classList.remove('m-lock');
  }
  backBtn.onclick=function(){state.group=null;renderSheet()};
  more.onclick=openSheet;
  sheet.addEventListener('click',function(e){if(e.target===sheet)closeSheet()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeSheet()});

  app.appendChild(bnav);
  app.appendChild(sheet);

  function applyBadges(){
    var old=more.querySelector('.mb');if(old)old.remove();
    var t=allTotal();
    if(t)more.appendChild(mkBadge(t));
    [].forEach.call(bnav.querySelectorAll('button[data-go]'),function(b){
      var o=b.querySelector('.mb');if(o)o.remove();
      var n=counts[b.getAttribute('data-go')];
      if(n)b.appendChild(mkBadge(n));
    });
    if(sheet.classList.contains('open'))renderSheet();
  }

  function sync(){
    var v=activeView(),inPrimary=false;
    [].forEach.call(bnav.querySelectorAll('button[data-go]'),function(b){
      var on=b.getAttribute('data-go')===v;
      if(on)inPrimary=true;
      b.classList.toggle('active',on);
    });
    more.classList.toggle('active',!inPrimary);
  }
  var nav=document.querySelector('.sidebar nav');
  if(nav)new MutationObserver(sync).observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  sync();

  /* ---------- fetching the counts (read-only admin RPCs) ---------- */
  function sbc(){return window.supabaseClient||null}
  async function call(name,args){
    var c=sbc();if(!c)return null;
    try{var r=await c.rpc(name,args||{});if(r.error)return null;return r.data}catch(e){return null}
  }
  function len(d){return Array.isArray(d)?d.length:null}
  function setc(k,v){if(v!==null&&v!==undefined)counts[k]=v}
  var busy=false;
  async function refreshCounts(){
    if(busy||app.classList.contains('hidden'))return;
    busy=true;
    try{
      var r=await Promise.all([
        call('admin_account_review_list',{p_status:'pending',p_limit:200}),
        call('admin_agency_list',{p_status:'pending'}),
        call('admin_creator_list',{p_status:'pending'}),
        call('admin_export_distributors_list',{p_status:'pending'}),
        call('admin_export_requests_list',{p_status:'requested'}),
        call('admin_contact_list',{p_type:null,p_status:null,p_search:null,p_limit:300}),
        call('admin_feedback_list',{p_type:null,p_status:null,p_search:null,p_limit:300}),
        call('admin_list_data_deletion_requests')
      ]);
      setc('reviews',len(r[0]));
      setc('agency',len(r[1]));
      setc('creator',len(r[2]));
      if(Array.isArray(r[3])||Array.isArray(r[4]))setc('exportnet',(len(r[3])||0)+(len(r[4])||0));
      if(Array.isArray(r[5]))setc('contact',r[5].filter(function(x){return x&&x.status==='New'}).length);
      if(Array.isArray(r[6]))setc('feedback',r[6].filter(function(x){return String((x&&x.status)||'').toLowerCase().replace(/\s+/g,'_')==='new'}).length);
      setc('datareq',len(r[7]));
      applyBadges();
    }finally{busy=false}
  }

  /* ---------- Clients: Instagram / WhatsApp buttons ---------- */
  var conns={};
  function mkLink(cls,text,href){
    var a=document.createElement('a');
    a.className='gm-b '+cls;a.textContent=text;a.href=href;
    a.target='_blank';a.rel='noopener noreferrer';
    return a;
  }
  function connCell(cid){
    var td=document.createElement('td');
    td.setAttribute('data-gm','1');
    td.setAttribute('data-label','Connected');
    var wrap=document.createElement('div');wrap.className='gm-conn';
    var c=conns[cid]||{},shown=0;
    var ig=c.instagram;
    if(ig&&ig.status==='connected'&&/^[A-Za-z0-9._]{1,30}$/.test(ig.username||'')){
      wrap.appendChild(mkLink('ig','Instagram @'+ig.username,'https://www.instagram.com/'+ig.username+'/'));shown++;
    }
    var wa=c.whatsapp;
    var digits=String((wa&&wa.display_phone_number)||'').replace(/\D/g,'');
    if(wa&&wa.status==='connected'&&digits.length>=8){
      wrap.appendChild(mkLink('wa','WhatsApp +'+digits,'https://wa.me/'+digits));shown++;
    }
    if(!shown){
      var n=document.createElement('span');n.className='gm-none';
      n.textContent=(ig||wa)?'Disconnected':'Not connected';
      wrap.appendChild(n);
    }
    td.appendChild(wrap);
    return td;
  }
  function decorate(){
    var tb=document.getElementById('clientRows');
    if(!tb)return;
    var table=tb.closest('table');
    var hr=table&&table.tHead&&table.tHead.rows[0];
    if(hr&&!hr.querySelector('[data-gm]')){
      var th=document.createElement('th');th.setAttribute('data-gm','1');th.textContent='Connected';
      hr.insertBefore(th,hr.lastElementChild);
    }
    [].forEach.call(tb.rows,function(tr){
      if(tr.cells.length<3||tr.querySelector('td[data-gm]'))return;
      var sub=tr.cells[0].querySelector('.sub');
      var cid=sub?sub.textContent.trim():'';
      tr.insertBefore(connCell(cid),tr.lastElementChild);
    });
  }
  async function loadConns(){
    var d=await call('admin_client_connections_list');
    if(!Array.isArray(d))return;
    var m={};
    d.forEach(function(x){if(x&&x.client_id)m[x.client_id]=x});
    conns=m;
    var tb=document.getElementById('clientRows');
    if(tb)[].forEach.call(tb.querySelectorAll('td[data-gm]'),function(td){td.remove()});
    decorate();
  }
  var ctb=document.getElementById('clientRows');
  if(ctb)new MutationObserver(decorate).observe(ctb,{childList:true});

  function tick(){
    if(app.classList.contains('hidden'))return;
    refreshCounts();
    loadConns();
  }
  setInterval(tick,60000);
  new MutationObserver(function(){if(!app.classList.contains('hidden'))tick()}).observe(app,{attributes:true,attributeFilter:['class']});
  var rb=document.getElementById('refreshBtn');
  if(rb)rb.addEventListener('click',function(){setTimeout(tick,1500)});
  tick();

  /* table cells get a data-label from their column header so CSS can show them as cards on phones */
  function labelTables(){
    [].forEach.call(document.querySelectorAll('table'),function(t){
      var hr=(t.tHead&&t.tHead.rows[0])||((t.rows[0]&&t.rows[0].querySelector('th'))?t.rows[0]:null);
      if(!hr)return;
      if(!t.tHead)hr.setAttribute('hidden','');
      var hs=[].map.call(hr.children,function(h){return h.textContent.trim()});
      [].forEach.call(t.querySelectorAll('tbody tr'),function(r){
        if(r===hr)return;
        var ci=0;
        [].forEach.call(r.children,function(c){
          if(c.tagName!=='TD')return;
          var span=c.colSpan||1;
          if(span===1&&hs[ci]&&!c.hasAttribute('data-label'))c.setAttribute('data-label',hs[ci]);
          ci+=span;
        });
      });
    });
  }
  var queued=false;
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(function(){queued=false;labelTables()});
  }
  new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
  labelTables();
})();
