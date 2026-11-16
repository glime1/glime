/* =========================================================
   GLIME Creator page add-on  (loads AFTER the main script of creator.html)
   - switches the backend on (creator-api)
   - copy link now points to the buyer page (course-view.html)
   - "Add to Services" button on every published course
   - Students list with name + phone number (own rows only, read via RLS)
   - Stops uploaded-but-unused files from eating storage (discard)
   - Blocks deleting a course that already has paying students
   Add ONE line before </body> in creator.html:
     <script src="creator-addon.js"></script>
========================================================= */
(function(){
  'use strict';
  if(typeof CFG==='undefined'||typeof API==='undefined'||typeof state==='undefined')return;

  CFG.BACKEND_READY=true;
  CFG.COURSE_URL='https://glime.online/course-view.html?c=';

  /* ---------- 1. Students list (name + phone) ---------- */
  const rawOverview=API.overview;
  API.overview=async function(){
    const d=await rawOverview.apply(API,arguments);
    d.buyers=[];
    try{
      const r=await sb.from('creator_buyers')
        .select('id,course_id,buyer_name,buyer_phone,channel,amount_paise,paid_at,created_at,access_expires_at')
        .eq('status','paid').order('paid_at',{ascending:false,nullsFirst:false}).limit(200);
      if(!r.error&&r.data){
        const t={};(d.courses||[]).forEach(c=>{t[c.id]=c.title;});
        d.buyers=r.data.map(b=>({
          name:b.buyer_name||'Buyer',phone:b.buyer_phone||'',channel:b.channel||'',
          course:t[b.course_id]||'Course',at:b.paid_at||b.created_at,
          until:b.access_expires_at,amount:Number(b.amount_paise||0)/100
        }));
      }
    }catch(e){console.warn('[GLIME] students list',e);}
    return d;
  };

  const rawSales=window.renderSales;
  window.renderSales=function(){
    const list=(state.data&&state.data.buyers)||[];
    if(!list.length){return rawSales?rawSales():undefined;}
    $('sales').innerHTML='<table class="sales"><thead><tr><th>Student</th><th>Course</th><th>Date</th><th class="amt">Paid</th></tr></thead><tbody>'+
      list.map(x=>{
        const ph=String(x.phone||'').replace(/\D/g,'');
        const phone=ph?'<div class="small"><a href="tel:+'+esc(ph.length===10?'91'+ph:ph)+'" style="color:var(--link);text-decoration:none">'+esc(x.phone)+'</a></div>':'<div class="muted small">No number</div>';
        const until=x.until?'<div class="muted small">Access till '+fmtDate(x.until)+'</div>':'';
        return '<tr><td>'+esc(x.name)+phone+'<div class="muted small">'+esc(x.channel)+'</div></td><td>'+esc(x.course)+until+'</td><td>'+fmtDate(x.at)+'</td><td class="amt">'+inr(x.amount)+'</td></tr>';
      }).join('')+'</tbody></table>';
  };
  try{const h=document.querySelector('#sales').closest('.card').querySelector('h2');if(h)h.textContent='Students';}catch(e){}

  /* ---------- 2. Course cards: Add to Services ---------- */
  const rawCourses=window.renderCourses;
  window.renderCourses=function(){
    rawCourses();
    (state.data.courses||[]).forEach(c=>{
      if(c.status!=='published')return;
      const card=document.querySelector('.course[data-id="'+(window.CSS&&CSS.escape?CSS.escape(c.id):c.id)+'"] .course-foot');
      if(!card||card.querySelector('[data-glime-svc]'))return;
      const a=document.createElement('a');
      a.className='btn ghost sm';a.href='services.html?creator_course='+encodeURIComponent(c.id);
      a.textContent='Add to Services';a.setAttribute('data-glime-svc','1');
      const del=card.querySelector('[data-act="del"]');
      card.insertBefore(a,del);
    });
  };

  /* ---------- 3. Delete guard (a course with students stays) ---------- */
  $('courses').addEventListener('click',function(e){
    const b=e.target.closest('[data-act="del"]');if(!b)return;
    const id=b.closest('.course').dataset.id,c=state.data.courses.find(x=>x.id===id);
    if(c&&c.students>0){
      e.stopImmediatePropagation();e.preventDefault();
      toast('This course has '+c.students+' paying student'+(c.students>1?'s':'')+', so it cannot be deleted. Remove lessons you no longer need instead.',true);
    }
  },true);

  /* ---------- 4. Discard files that never became part of a course ---------- */
  let session=0;const pending=new Set();
  const killFile=id=>{ if(!id)return; pending.delete(id); call('discard',{fileId:id}).catch(()=>{}); };

  const rawUpload=API.upload;
  API.upload=async function(file,onProgress){
    const mine=session;
    const r=await rawUpload.call(API,file,onProgress);
    if(mine!==session){killFile(r.fileId);throw new Error('Cancelled');}
    pending.add(r.fileId);
    return r;
  };

  const rawSave=API.saveCourse;
  API.saveCourse=async function(course,publish){
    const r=await rawSave.call(API,course,publish);
    (course.lessons||[]).forEach(l=>{if(l.fileId)pending.delete(l.fileId);});
    return r;
  };

  /* A lesson removed in the editor -> free its file right away */
  $('lessons').addEventListener('click',function(e){
    const b=e.target.closest('[data-act="rm"]');if(!b||!state.ed)return;
    const row=b.closest('[data-i]');const l=row&&state.ed.lessons[+row.dataset.i];
    if(l&&l.fileId&&l.status==='ready')killFile(l.fileId);
  },true);

  /* Editor closed without saving -> free whatever was uploaded in it */
  new MutationObserver(function(){
    if($('edOv').classList.contains('on'))return;
    session++;
    [...pending].forEach(killFile);
  }).observe($('edOv'),{attributes:true,attributeFilter:['class']});
})();
