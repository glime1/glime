const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  user:null, client:null, catalog:null, types:[], categories:[], services:[],
  category:'all', search:'', status:'all', step:1, offerId:null, versionId:null,
  variants:[], media:[], days:[], capabilities:{}
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  "'":'&#39;',
  '"':'&quot;'
}[c]));

const slugify = v => String(v||'')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g,'-')
  .replace(/^-+|-+$/g,'')
  .slice(0,70);

const money = (v,c='INR') =>
  new Intl.NumberFormat('en-IN',{
    style:'currency',
    currency:c,
    maximumFractionDigits:2
  }).format(Number(v||0));

function toast(message,type=''){
  const el=document.createElement('div');
  el.className='toast '+type;
  el.textContent=message;
  $('#toastHost').appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

function setBoot(v){
  $('#bootScreen').style.display=v?'flex':'none';
}

function showAlert(msg,success=false){
  const el=$('#wizardAlert');
  el.textContent=msg;
  el.classList.toggle('hidden',!msg);
  el.classList.toggle('success',success);
}

function getToken(){
  return supabaseClient.auth.getSession()
    .then(({data})=>data?.session?.access_token||'');
}

async function edge(slug,body){
  const token=await getToken();

  if(!token){
    throw new Error('Active login session is missing.');
  }

  const r=await fetch(
    `${SUPABASE_URL}/functions/v1/${slug}`,
    {
      method:'POST',
      headers:{
        Authorization:`Bearer ${token}`,
        apikey:SUPABASE_KEY,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(body)
    }
  );

  const j=await r.json().catch(()=>({}));

  if(!r.ok || j.ok===false){
    throw new Error(j.error||'Request failed.');
  }

  return j;
}

async function init(){
  try{
    const {data,error}=await supabaseClient.auth.getSession();

    if(error || !data.session?.user){
      location.replace('login.html');
      return;
    }

    state.user=data.session.user;

    const {data:client,error:ce}=await supabaseClient
      .from('client_data')
      .select(
        'id,client_id,auth_user_id,business_name,client_name,full_name,name'
      )
      .eq('auth_user_id',state.user.id)
      .limit(1)
      .maybeSingle();

    if(ce || !client?.client_id){
      throw new Error('Client profile not found.');
    }

    state.client=client;

    $('#businessName').textContent =
      client.business_name ||
      client.client_name ||
      client.full_name ||
      client.name ||
      'Business';

    $('#clientId').textContent=client.client_id;

    await Promise.all([
      loadFoundation(),
      loadCategories(),
      loadServices()
    ]);

    bindUI();
    renderAll();
    setBoot(false);

  }catch(e){
    console.error(e);
    toast(e.message,'bad');

    setTimeout(
      ()=>location.replace('dashboard.html'),
      1400
    );
  }
}

async function loadFoundation(){
  const j=await edge(
    'services-foundation',
    {action:'get'}
  );

  state.catalog=j.catalog||null;

  state.types=(j.types||[])
    .filter(x=>x.is_active||x.source==='system');

  fillTypeSelect();
}

async function loadCategories(){

  const {data,error}=await supabaseClient
    .from('offer_categories')
    .select(
      'id,name,slug,description,sort_order,is_active'
    )
    .eq('client_id',state.client.client_id)
    .eq('is_active',true)
    .order('sort_order',{ascending:true})
    .order('name');

  if(error){
    throw error;
  }

  state.categories=data||[];

  renderCategories();
}

async function loadServices(){

  const {data,error}=await supabaseClient
    .from('offers')
    .select(
      'id,client_id,name,slug,short_description,description,category_id,status,offer_type,current_version_id,updated_at'
    )
    .eq('client_id',state.client.client_id)
    .order('updated_at',{ascending:false});

  if(error){
    throw error;
  }

  const ids=(data||[])
    .map(x=>x.current_version_id)
    .filter(Boolean);

  let versions=[];
  let prices=[];

  if(ids.length){

    const vr=await supabaseClient
      .from('offer_versions')
      .select(
        'id,offer_id,version_number,status,title,description,metadata'
      )
      .in('id',ids);

    if(vr.error){
      throw vr.error;
    }

    versions=vr.data||[];

    const pr=await supabaseClient
      .from('offer_prices')
      .select(
        'offer_version_id,amount,currency,price_type,billing_period,is_active'
      )
      .in('offer_version_id',ids)
      .eq('is_active',true);

    if(pr.error){
      throw pr.error;
    }

    prices=pr.data||[];
  }

  const vm=new Map(
    versions.map(v=>[v.id,v])
  );

  const pm=new Map(
    prices.map(p=>[p.offer_version_id,p])
  );

  state.services=(data||[]).map(o=>({
    ...o,
    version:vm.get(o.current_version_id)||null,
    price:pm.get(o.current_version_id)||null
  }));
}

function fillTypeSelect(){

  const sel=$('#fType');

  sel.innerHTML=state.types
    .map(t=>
      `<option value="${esc(t.type_key)}">
        ${esc(t.label)}
      </option>`
    )
    .join('');

  updateCapabilities();
}

function fillCategorySelect(){

  $('#fCategory').innerHTML=
    '<option value="">No category</option>'+
    state.categories
      .map(c=>
        `<option value="${c.id}">
          ${esc(c.name)}
        </option>`
      )
      .join('');
}

function renderCategories(){

  $('#categoryCount').textContent=
    state.categories.length;

  const counts={};

  state.services.forEach(s=>{
    const key=s.category_id||'uncategorized';

    counts[key]=
      (counts[key]||0)+1;
  });

  const items=[
    {
      id:'all',
      name:'All Services',
      n:state.services.length
    },
    {
      id:'uncategorized',
      name:'Uncategorized',
      n:counts.uncategorized||0
    },
    ...state.categories.map(c=>({
      id:c.id,
      name:c.name,
      n:counts[c.id]||0
    }))
  ];

  $('#categoryList').innerHTML=
    items.map(x=>`
      <button
        class="category-item ${state.category===x.id?'active':''}"
        data-category="${esc(x.id)}"
      >
        <span>${esc(x.name)}</span>
        <small>${x.n}</small>
      </button>
    `).join('');
}

function filtered(){

  const q=state.search.toLowerCase().trim();

  return state.services.filter(s=>{

    const cat=
      state.category==='all' ||
      s.category_id===state.category ||
      (
        state.category==='uncategorized' &&
        !s.category_id
      );

    const status=
      state.status==='all' ||
      s.status===state.status ||
      s.version?.status===state.status;

    const text=
      `${s.name} ${s.short_description||''} ${s.description||''}`
      .toLowerCase();

    return cat &&
      status &&
      (!q || text.includes(q));
  });
}

function renderGrid(){

  const rows=filtered();

  const grid=$('#serviceGrid');
  const empty=$('#emptyState');

  $('#gridTitle').textContent=
    state.category==='all'
      ? 'All Services'
      : (
        state.categories.find(
          c=>c.id===state.category
        )?.name ||
        'Uncategorized'
      );

  $('#gridMeta').textContent=
    `${rows.length} service${rows.length===1?'':'s'} · no page reload`;

  grid.innerHTML=rows.map((s,i)=>`

    <article
      class="service-card"
      style="animation-delay:${i*35}ms"
    >

      <div class="service-media">

        <span>✦</span>

        <span
          class="service-status ${esc(s.status)}"
        >
          ${
            s.status==='active'
              ? 'Published'
              : s.status==='review'
                ? 'In review'
                : 'Draft'
          }
        </span>

      </div>

      <div class="service-body">

        <div class="service-category">
          ${esc(
            (state.categories.find(
              c=>c.id===s.category_id
            )||{}).name ||
            'GENERAL'
          )}
        </div>

        <h3 title="${esc(s.name)}">
          ${esc(s.name)}
        </h3>

        <p>
          ${esc(
            s.short_description ||
            s.description ||
            'No description yet.'
          )}
        </p>

        <div class="service-meta">

          <strong class="price">
            ${
              s.price
                ? money(
                    s.price.amount,
                    s.price.currency
                  )
                : 'Price not set'
            }
          </strong>

          <span class="meta-small">
            ${esc(s.offer_type||'service')}
          </span>

        </div>

        <div class="card-actions">

          <button
            class="secondary-btn edit-service"
            data-id="${s.id}"
          >
            Open
          </button>

          <button
            class="ghost-btn duplicate-service"
            data-id="${s.id}"
          >
            Duplicate
          </button>

        </div>

      </div>

    </article>

  `).join('');

  empty.classList.toggle(
    'hidden',
    rows.length>0
  );

  grid.classList.toggle(
    'hidden',
    rows.length===0
  );
}

function renderAll(){
  fillCategorySelect();
  renderCategories();
  renderGrid();
  updateNudge();
}

function updateNudge(){

  const incomplete=
    state.services.filter(
      s =>
        s.status==='draft' &&
        (!s.description || !s.price)
    ).length;

  if(incomplete){

    $('#aiNudge').classList.remove('hidden');

    $('#nudgeText').textContent=
      `${incomplete} draft service${
        incomplete===1?' is':'s are'
      } missing key business information.`;

  }else{

    $('#aiNudge').classList.add('hidden');

  }
}

function openWizard(service=null){

  resetWizard(service);

  $('#wizardOverlay')
    .classList.remove('hidden');

  document.body.style.overflow='hidden';

  setStep(1);
}

function closeWizard(){

  $('#wizardOverlay')
    .classList.add('hidden');

  document.body.style.overflow='';
}

function resetWizard(service){

  state.offerId=service?.id||null;
  state.versionId=service?.current_version_id||null;

  state.variants=[];
  state.media=[];

  $('#wizardTitle').textContent=
    service
      ? 'Edit service'
      : 'Create service';

  $('#fName').value=
    service?.name||'';

  $('#fShort').value=
    service?.short_description||'';

  $('#fDescription').value=
    service?.description ||
    service?.version?.description ||
    '';

  $('#fCategory').value=
    service?.category_id||'';

  $('#fType').value=
    service?.offer_type||'service';

  $('#fPrice').value=
    service?.price?.amount||'';

  $('#fCurrency').value=
    service?.price?.currency||'INR';

  $('#fPriceType').value=
    service?.price?.price_type||'fixed';

  $('#fBilling').value=
    service?.price?.billing_period||'';

  $('#fDuration').value='';

  $('#fKnowledge').value=
    service?.version?.metadata?.ai_knowledge_summary ||
    '';

  renderVariants();
  renderMedia();
  renderDays();
  updateCapabilities();
  updateChecklist();
  showAlert('');
}

function setStep(n){

  state.step=n;

  $$('.wizard-step').forEach(x=>
    x.classList.toggle(
      'active',
      Number(x.dataset.panel)===n
    )
  );

  $$('.stepper .step').forEach(x=>{

    const s=Number(x.dataset.step);

    x.classList.toggle(
      'active',
      s===n
    );

    x.classList.toggle(
      'done',
      s<n
    );

  });

  $('#prevStep')
    .classList.toggle(
      'hidden',
      n===1
    );

  $('#nextStep')
    .classList.toggle(
      'hidden',
      n===5
    );

  $('#publishBtn')
    .classList.toggle(
      'hidden',
      n!==5
    );

  $('#saveDraftBtn')
    .classList.toggle(
      'hidden',
      n===5
    );

  if(n===5){
    updateChecklist();
  }
}

function validateStep(n){

  if(n===1){

    if(!$('#fName').value.trim()){
      return 'Service name is required.';
    }

    if(!$('#fType').value){
      return 'Choose a catalog type.';
    }

    return '';
  }

  if(n===2){

    if(
      $('#fPrice').value==='' ||
      Number($('#fPrice').value)<0
    ){
      return 'A valid price is required.';
    }
  }

  return '';
}

async function saveDraft(silent=false){

  try{

    const stepErr=
      validateStep(
        Math.min(state.step,2)
      );

    if(stepErr){

      showAlert(stepErr);

      return false;
    }

    const name=
      $('#fName').value.trim();

    const type=
      $('#fType').value||'service';

    const payload={
      client_id:state.client.client_id,
      offer_type:type,
      name,
      slug:
        slugify(name)+
        '-'+
        Math.random()
          .toString(36)
          .slice(2,8),
      short_description:
        $('#fShort').value.trim(),
      description:
        $('#fDescription').value.trim(),
      category_id:
        $('#fCategory').value||null,
      status:'draft',
      current_version_id:null
    };

    let offer;

    if(state.offerId){

      const u=
        await supabaseClient
          .from('offers')
          .update({
            ...payload,
            slug:undefined
          })
          .eq('id',state.offerId)
          .eq(
            'client_id',
            state.client.client_id
          )
          .select()
          .single();

      if(u.error){
        throw u.error;
      }

      offer=u.data;

    }else{

      const ins=
        await supabaseClient
          .from('offers')
          .insert(payload)
          .select()
          .single();

      if(ins.error){
        throw ins.error;
      }

      offer=ins.data;
      state.offerId=offer.id;
    }

    if(!state.versionId){

      const ins=
        await supabaseClient
          .from('offer_versions')
          .insert({
            offer_id:offer.id,
            version_number:1,
            status:'draft',
            title:name,
            description:
              $('#fDescription')
                .value
                .trim(),
            metadata:{
              ai_knowledge_summary:
                $('#fKnowledge')
                  .value
                  .trim()
            }
          })
          .select()
          .single();

      if(ins.error){
        throw ins.error;
      }

      state.versionId=ins.data.id;

      const up=
        await supabaseClient
          .from('offers')
          .update({
            current_version_id:
              ins.data.id
          })
          .eq('id',offer.id);

      if(up.error){
        throw up.error;
      }

    }else{

      const up=
        await supabaseClient
          .from('offer_versions')
          .update({
            title:name,
            description:
              $('#fDescription')
                .value
                .trim(),
            metadata:{
              ai_knowledge_summary:
                $('#fKnowledge')
                  .value
                  .trim()
            }
          })
          .eq('id',state.versionId);

      if(up.error){
        throw up.error;
      }
    }

    const price=
      Number(
        $('#fPrice').value||0
      );

    const old=
      await supabaseClient
        .from('offer_prices')
        .select('id')
        .eq(
          'offer_version_id',
          state.versionId
        )
        .limit(1)
        .maybeSingle();

    if(old.error){
      throw old.error;
    }

    const priceRow={
      offer_version_id:
        state.versionId,
      amount:price,
      currency:
        $('#fCurrency').value||'INR',
      price_type:
        $('#fPriceType').value||'fixed',
      billing_period:
        $('#fBilling').value||null,
      is_active:true
    };

    if(old.data){

      const u=
        await supabaseClient
          .from('offer_prices')
          .update(priceRow)
          .eq('id',old.data.id);

      if(u.error){
        throw u.error;
      }

    }else{

      const i=
        await supabaseClient
          .from('offer_prices')
          .insert(priceRow);

      if(i.error){
        throw i.error;
      }
    }

    await loadServices();

    renderAll();

    $('#saveState1').textContent='Saved';

    if(!silent){
      toast(
        'Draft saved',
        'ok'
      );
    }

    return true;

  }catch(e){

    console.error(e);

    showAlert(
      e.message ||
      'Draft could not be saved.'
    );

    return false;
  }
}

async function submitPublish(){

  const missing=[];

  if(!$('#fName').value.trim()){
    missing.push('service name');
  }

  if(!$('#fDescription').value.trim()){
    missing.push('description');
  }

  if(
    $('#fPrice').value==='' ||
    Number($('#fPrice').value)<0
  ){
    missing.push('price');
  }

  if(missing.length){

    showAlert(
      `Complete before publishing: ${missing.join(', ')}.`
    );

    return;
  }

  if(
    !state.offerId ||
    !state.versionId
  ){

    const ok=
      await saveDraft(true);

    if(!ok){
      return;
    }
  }

  try{

    const u=
      await supabaseClient
        .from('offer_versions')
        .update({
          status:'review',
          title:
            $('#fName')
              .value
              .trim(),
          description:
            $('#fDescription')
              .value
              .trim(),
          metadata:{
            ai_knowledge_summary:
              $('#fKnowledge')
                .value
                .trim()
          }
        })
        .eq('id',state.versionId);

    if(u.error){
      throw u.error;
    }

    const o=
      await supabaseClient
        .from('offers')
        .update({
          status:'review'
        })
        .eq('id',state.offerId);

    if(o.error){
      throw o.error;
    }

    if(
      (state.user.email||'')
        .toLowerCase()==='admin@glime.online'
    ){

      try{

        await edge(
          'services-offer-approval',
          {
            action:'approve',
            version_id:state.versionId
          }
        );

        await edge(
          'services-offer-approval',
          {
            action:'publish',
            version_id:state.versionId
          }
        );

        toast(
          'Service published',
          'ok'
        );

      }catch(e){

        toast(
          'Submitted for review. Admin publish step is still pending.',
          'ok'
        );
      }

    }else{

      toast(
        'Service submitted for GLIME review.',
        'ok'
      );
    }

    await loadServices();

    renderAll();

    closeWizard();

  }catch(e){

    console.error(e);

    showAlert(
      e.message ||
      'Publish submission failed.'
    );
  }
}

function updateCapabilities(){

  const t=
    state.types.find(
      x =>
        x.type_key===
        $('#fType')?.value
    )||{};

  state.capabilities=
    t.capabilities||{};

  const c=
    state.capabilities;

  $('#capabilityNote').innerHTML=`
    <span>✦</span>
    <div>
      <strong>
        ${esc(t.label||'Service')} configuration
      </strong>

      <p>
        ${
          c.duration
            ? 'Duration enabled · '
            : ''
        }

        ${
          c.variants
            ? 'Variants enabled · '
            : ''
        }

        ${
          c.availability
            ? 'Availability enabled · '
            : ''
        }

        ${
          c.booking
            ? 'Booking enabled · '
            : ''
        }

        ${
          !Object.keys(c).length
            ? 'Standard fields only.'
            : ''
        }
      </p>
    </div>
  `;

  $('#availabilityDisabled')
    .classList.toggle(
      'hidden',
      !!c.availability
    );

  $('#availabilityEditor')
    .classList.toggle(
      'hidden',
      !c.availability
    );

  $('#fDuration')
    .closest('.field')
    .style.display=
      c.duration
        ? 'block'
        : 'none';

  $('#variantList')
    .closest('.wizard-step') &&
    (
      document
        .querySelector(
          '[data-panel="2"] .subsection-head'
        )
        .style.display=
          c.variants
            ? 'flex'
            : 'none'
    );

  $('#variantList')
    .style.display=
      c.variants
        ? 'flex'
        : 'none';
}

function renderVariants(){

  $('#variantList').innerHTML=
    state.variants
      .map((v,i)=>`

        <div class="variant-row">

          <input
            data-v="name"
            data-i="${i}"
            value="${esc(v.name)}"
            placeholder="Variant name"
          >

          <input
            data-v="price"
            data-i="${i}"
            type="number"
            value="${esc(v.price||'')}"
            placeholder="Price"
          >

          <input
            data-v="sku"
            data-i="${i}"
            value="${esc(v.sku||'')}"
            placeholder="SKU"
          >

          <button
            class="remove-row"
            data-remove-variant="${i}"
          >
            ×
          </button>

        </div>

      `)
      .join('');
}

function renderDays(){

  const names=[
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ];

  $('#dayRows').innerHTML=
    names.map((n,i)=>`

      <div class="day-row">

        <label>${n}</label>

        <input
          type="time"
          data-day-start="${i}"
          value="${i<6?'09:00':''}"
        >

        <input
          type="time"
          data-day-end="${i}"
          value="${i<6?'18:00':''}"
        >

        <label>
          <input
            type="checkbox"
            data-day-on="${i}"
            ${i<6?'checked':''}
          >
          Available
        </label>

      </div>

    `)
    .join('');
}

function renderMedia(){

  $('#mediaList').innerHTML=
    state.media
      .map((m,i)=>`

        <div class="media-item">

          <div class="media-thumb">
            ${
              m.url
                ? `<img
                    src="${esc(m.url)}"
                    alt=""
                   >`
                : '▶'
            }
          </div>

          <div class="media-info">

            <input
              value="${esc(m.alt||'')}"
              data-media-alt="${i}"
              placeholder="Alt text"
            >

            <div class="media-controls">

              <button
                data-primary="${i}"
                class="${m.primary?'primary-mini':''}"
              >
                ${
                  m.primary
                    ? '★ Primary'
                    : 'Set primary'
                }
              </button>

              <button
                data-remove-media="${i}"
              >
                Remove
              </button>

            </div>

          </div>

        </div>

      `)
      .join('');

  const p=
    state.media.find(
      m=>m.primary
    );

  $('#previewMedia').innerHTML=
    p?.url
      ? `<img
          src="${esc(p.url)}"
          alt=""
         >`
      : 'No primary media';
}

function updateChecklist(){

  const checks=[

    [
      'Service name',
      !!$('#fName').value.trim(),
      'Customer-facing name is present.'
    ],

    [
      'Description',
      !!$('#fDescription').value.trim(),
      'Full business description is present.'
    ],

    [
      'Price',
      !!$('#fPrice').value &&
      Number($('#fPrice').value)>=0,
      'A valid commercial price is configured.'
    ],

    [
      'Catalog type',
      !!$('#fType').value,
      'The service is assigned to a catalog type.'
    ]

  ];

  const ok=
    checks.filter(
      x=>x[1]
    ).length;

  $('#checkCount').textContent=
    `${ok}/${checks.length}`;

  $('#publishChecklist').innerHTML=
    checks.map(x=>`

      <div
        class="check-row ${x[1]?'ok':''}"
      >

        <span class="check-icon">
          ${x[1]?'✓':'!'}
        </span>

        <div>

          <strong>
            ${esc(x[0])}
          </strong>

          <small>
            ${esc(x[2])}
          </small>

        </div>

      </div>

    `).join('');

  $('#publishBtn').disabled=
    ok!==checks.length;

  $('#previewName').textContent=
    $('#fName').value.trim() ||
    'Service name';

  $('#previewDescription').textContent=
    $('#fDescription').value.trim() ||
    'Description preview will appear here.';

  $('#previewPrice').textContent=
    $('#fPrice').value
      ? money(
          $('#fPrice').value,
          $('#fCurrency').value
        )
      : '₹0';
}

function bindUI(){

  $('#openSidebar').onclick=
    ()=>$('#sidebar')
      .classList.add('open');

  $('#closeSidebar').onclick=
    ()=>$('#sidebar')
      .classList.remove('open');

  $('#logoutBtn').onclick=
    async()=>{
      await supabaseClient.auth.signOut({
        scope:'local'
      });

      location.replace('login.html');
    };

  $('#refreshBtn').onclick=
    async()=>{
      await Promise.all([
        loadCategories(),
        loadServices()
      ]);

      renderAll();

      toast(
        'Catalog refreshed',
        'ok'
      );
    };

  $('#addServiceBtn').onclick=
    ()=>openWizard();

  $('#emptyAddBtn').onclick=
    ()=>openWizard();

  $('#serviceSearch').oninput=
    e=>{
      state.search=e.target.value;
      renderGrid();
    };

  $('#statusFilter').onchange=
    e=>{
      state.status=e.target.value;
      renderGrid();
    };

  $('#categoryList').onclick=
    e=>{

      const b=
        e.target.closest(
          '[data-category]'
        );

      if(!b){
        return;
      }

      state.category=
        b.dataset.category;

      renderCategories();
      renderGrid();
    };

  $('#closeNudge').onclick=
    ()=>$('#aiNudge')
      .classList.add('hidden');

  $('#closeWizard').onclick=
    closeWizard;

  $('#wizardCancel').onclick=
    closeWizard;

  $('#prevStep').onclick=
    ()=>setStep(
      Math.max(
        1,
        state.step-1
      )
    );

  $('#nextStep').onclick=
    async()=>{

      const err=
        validateStep(
          state.step
        );

      if(err){
        showAlert(err);
        return;
      }

      if(state.step<5){

        if(
          state.step===1 ||
          state.step===2
        ){
          await saveDraft(true);
        }

        setStep(
          state.step+1
        );
      }
    };

  $('#saveDraftBtn').onclick=
    ()=>saveDraft();

  $('#publishBtn').onclick=
    submitPublish;

  $('#fType').onchange=
    ()=>{
      updateCapabilities();
      updateChecklist();
    };

  [
    'fName',
    'fDescription',
    'fPrice',
    'fCurrency',
    'fShort',
    'fKnowledge'
  ].forEach(id=>
    $('#'+id)?.addEventListener(
      'input',
      updateChecklist
    )
  );

  $('#addVariantBtn').onclick=
    ()=>{
      state.variants.push({
        name:'',
        price:'',
        sku:''
      });

      renderVariants();
    };

  $('#variantList').oninput=
    e=>{

      const i=
        Number(
          e.target.dataset.i
        );

      if(Number.isInteger(i)){
        state.variants[i][
          e.target.dataset.v
        ]=e.target.value;
      }
    };

  $('#variantList').onclick=
    e=>{

      const b=
        e.target.closest(
          '[data-remove-variant]'
        );

      if(b){

        state.variants.splice(
          Number(
            b.dataset.removeVariant
          ),
          1
        );

        renderVariants();
      }
    };

  $('#chooseMediaBtn').onclick=
    ()=>$('#mediaInput').click();

  $('#mediaInput').onchange=
    e=>
      handleFiles(
        [...e.target.files]
      );

  $('#uploadZone').ondragover=
    e=>{
      e.preventDefault();
      $('#uploadZone')
        .classList.add('drag');
    };

  $('#uploadZone').ondragleave=
    ()=>{
      $('#uploadZone')
        .classList.remove('drag');
    };

  $('#uploadZone').ondrop=
    e=>{
      e.preventDefault();

      $('#uploadZone')
        .classList.remove('drag');

      handleFiles(
        [...e.dataTransfer.files]
      );
    };

  $('#mediaList').oninput=
    e=>{

      const i=
        Number(
          e.target.dataset.mediaAlt
        );

      if(Number.isInteger(i)){
        state.media[i].alt=
          e.target.value;
      }
    };

  $('#mediaList').onclick=
    e=>{

      const p=
        e.target.closest(
          '[data-primary]'
        );

      const r=
        e.target.closest(
          '[data-remove-media]'
        );

      if(p){

        state.media.forEach(
          (m,i)=>
            m.primary=
              i===
              Number(
                p.dataset.primary
              )
        );

        renderMedia();
      }

      if(r){

        state.media.splice(
          Number(
            r.dataset.removeMedia
          ),
          1
        );

        renderMedia();
      }
    };

  $$('.stepper .step')
    .forEach(b=>
      b.onclick=
        ()=>{
          const n=
            Number(
              b.dataset.step
            );

          if(n<=state.step){
            setStep(n);
          }
        }
    );

  $('#serviceGrid').onclick=
    e=>{

      const edit=
        e.target.closest(
          '.edit-service'
        );

      const dup=
        e.target.closest(
          '.duplicate-service'
        );

      if(edit){

        const s=
          state.services.find(
            x=>x.id===edit.dataset.id
          );

        if(s){
          openWizard(s);
        }
      }

      if(dup){

        const s=
          state.services.find(
            x=>x.id===dup.dataset.id
          );

        if(s){

          openWizard({
            ...s,
            id:null,
            current_version_id:null,
            name:`${s.name} Copy`,
            status:'draft'
          });

          toast(
            'Duplicate opened as a new draft',
            'ok'
          );
        }
      }
    };

  $('#addCategoryBtn').onclick=
    addCategory;

  $('#commandBtn').onclick=
    openCommand;

  $('#closeCommand').onclick=
    closeCommand;

  $('#commandInput').oninput=
    renderCommand;

  $('#commandOverlay').onclick=
    e=>{
      if(e.target===$('#commandOverlay')){
        closeCommand();
      }
    };

  document.addEventListener(
    'keydown',
    e=>{

      if(
        (e.ctrlKey||e.metaKey) &&
        e.key.toLowerCase()==='k'
      ){

        e.preventDefault();
        openCommand();
      }

      if(e.key==='Escape'){

        closeCommand();

        if(
          !$('#wizardOverlay')
            .classList.contains('hidden')
        ){
          closeWizard();
        }
      }

      if(
        e.key==='/' &&
        document.activeElement.tagName!=='INPUT' &&
        document.activeElement.tagName!=='TEXTAREA'
      ){

        e.preventDefault();

        $('#serviceSearch').focus();
      }
    }
  );
}

function handleFiles(files){

  files
    .filter(
      f=>
        f.type.startsWith('image/') ||
        f.type.startsWith('video/')
    )
    .forEach(file=>{

      const url=
        URL.createObjectURL(file);

      state.media.push({
        file,
        url,
        alt:
          file.name.replace(
            /\.[^.]+$/,
            ''
          ),
        primary:
          state.media.length===0
      });

    });

  renderMedia();

  toast(
    'Media added to this draft',
    'ok'
  );
}

async function addCategory(){

  const name=
    prompt(
      'New category name'
    );

  if(!name?.trim()){
    return;
  }

  const slug=
    slugify(name);

  const {error}=
    await supabaseClient
      .from('offer_categories')
      .insert({
        client_id:
          state.client.client_id,
        name:name.trim(),
        slug,
        sort_order:
          state.categories.length,
        is_active:true
      });

  if(error){

    toast(
      error.message,
      'bad'
    );

    return;
  }

  await loadCategories();

  renderAll();

  toast(
    'Category created',
    'ok'
  );
}

function openCommand(){

  $('#commandOverlay')
    .classList.remove('hidden');

  $('#commandInput').value='';

  renderCommand();

  setTimeout(
    ()=>$('#commandInput').focus(),
    30
  );
}

function closeCommand(){

  $('#commandOverlay')
    .classList.add('hidden');
}

function renderCommand(){

  const q=
    $('#commandInput')
      .value
      .toLowerCase()
      .trim();

  const results=[];

  if(
    !q ||
    'add service'.includes(q)
  ){

    results.push({
      title:'Add Service',
      meta:'Create a new service',

      action:()=>{
        closeCommand();
        openWizard();
      }
    });
  }

  state.services
    .filter(
      s=>
        !q ||
        s.name
          .toLowerCase()
          .includes(q)
    )
    .slice(0,8)
    .forEach(s=>
      results.push({

        title:s.name,

        meta:
          `${s.status} · ${
            s.price
              ? money(
                  s.price.amount,
                  s.price.currency
                )
              : 'No price'
          }`,

        action:()=>{
          closeCommand();
          openWizard(s);
        }

      })
    );

  state.categories
    .filter(
      c=>
        !q ||
        c.name
          .toLowerCase()
          .includes(q)
    )
    .slice(0,5)
    .forEach(c=>
      results.push({

        title:c.name,
        meta:'Category',

        action:()=>{
          closeCommand();

          state.category=c.id;

          renderCategories();
          renderGrid();
        }

      })
    );

  $('#commandResults').innerHTML=
    results.length
      ? results.map((r,i)=>`

          <button
            class="command-item"
            data-command-index="${i}"
          >

            <strong>
              ${esc(r.title)}
            </strong>

            <small>
              ${esc(r.meta)}
            </small>

          </button>

        `).join('')

      : `

          <div class="command-item">

            <strong>
              No results
            </strong>

            <small>
              Try another search.
            </small>

          </div>

        `;

  $('#commandResults').onclick=
    e=>{

      const b=
        e.target.closest(
          '[data-command-index]'
        );

      if(b){

        results[
          Number(
            b.dataset.commandIndex
          )
        ].action();

      }
    };
}

supabaseClient
  .channel('services-live')

  .on(
    'postgres_changes',
    {
      event:'*',
      schema:'public',
      table:'offers'
    },
    ()=>
      loadServices()
        .then(renderAll)
        .catch(console.warn)
  )

  .on(
    'postgres_changes',
    {
      event:'*',
      schema:'public',
      table:'offer_versions'
    },
    ()=>
      loadServices()
        .then(renderAll)
        .catch(console.warn)
  )

  .subscribe();

init();
