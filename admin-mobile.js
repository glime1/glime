/* GLIME Admin — mobile app shell: bottom navigation, More sheet, table-to-card labels.
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

  function sideBtns(){return [].slice.call(document.querySelectorAll('.sidebar nav button'))}
  function activeView(){
    var a=document.querySelector('.sidebar nav button[data-view].active');
    return a?a.getAttribute('data-view'):'overview';
  }
  function goView(v){
    var b=document.querySelector('.sidebar nav button[data-view="'+v+'"]');
    if(b){b.click();window.scrollTo(0,0)}
  }

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

  /* More sheet (built from the live sidebar so addon-added sections appear too) */
  var sheet=document.createElement('div');
  sheet.className='msheet';
  sheet.innerHTML='<div class="msheet-box"><h3>All sections</h3><div class="msheet-grid"></div></div>';
  var grid=sheet.querySelector('.msheet-grid');

  function openSheet(){
    var cur=activeView();
    grid.innerHTML='';
    sideBtns().forEach(function(sb){
      var b=document.createElement('button');
      b.type='button';
      b.textContent=sb.textContent.trim();
      if(sb.classList.contains('logout'))b.className='logout';
      else if(sb.getAttribute('data-view')===cur)b.className='active';
      b.onclick=function(){closeSheet();sb.click();window.scrollTo(0,0)};
      grid.appendChild(b);
    });
    sheet.classList.add('open');
    document.body.classList.add('m-lock');
  }
  function closeSheet(){
    sheet.classList.remove('open');
    document.body.classList.remove('m-lock');
  }
  more.onclick=openSheet;
  sheet.addEventListener('click',function(e){if(e.target===sheet)closeSheet()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeSheet()});

  app.appendChild(bnav);
  app.appendChild(sheet);

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
