(() => {
const SUPABASE_URL='https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY='sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const MODULE='instagram_ai_sales_agent';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);

let state={
  user:null,session:null,clientId:null,connection:null,
  conversations:[],previews:{},messages:[],local:[],selected:null,lead:null,
  services:[],business:null,knowledge:[],catalogContext:null,
  filter:'all',
  mode:localStorage.getItem('glime_instagram_mode')||'manual',
  aiSession:sessionStorage.getItem('glime_instagram_ai_session')||null
};

/* ---------- helpers ---------- */
function esc(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function time(value){
  if(!value)return '';
  try{return new Date(value).toLocaleString([],{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch{return ''}
}
function ago(value){
  if(!value)return '';
  const s=(Date.now()-new Date(value).getTime())/1000;
  if(s<60)return 'now';
  if(s<3600)return Math.floor(s/60)+'m';
  if(s<86400)return Math.floor(s/3600)+'h';
  if(s<604800)return Math.floor(s/86400)+'d';
  return new Date(value).toLocaleDateString([],{day:'2-digit',month:'short'});
}
function sepLabel(ms){
  const d=new Date(ms),n=new Date();
  const hm=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const days=Math.round((new Date(n.getFullYear(),n.getMonth(),n.getDate())-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);
  if(days===0)return `Today ${hm}`;
  if(days===1)return `Yesterday ${hm}`;
  return `${d.toLocaleDateString([],{day:'2-digit',month:'short'})}, ${hm}`;
}
function fmt(text){
  return esc(text).replace(/https?:\/\/[^\s<]+/g,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}
function mediaLabel(type){
  const k=String(type||'').toLowerCase();
  if(k.includes('image')||k.includes('photo'))return '📷 Photo';
  if(k.includes('video'))return '🎥 Video';
  if(k.includes('audio')||k.includes('voice'))return '🎤 Voice message';
  if(k.includes('story'))return '📖 Story reply';
  if(k.includes('share')||k.includes('post'))return '🔗 Shared post';
  if(k.includes('like')||k.includes('heart'))return '❤️';
  return k?`[${k}]`:'[message]';
}
function toast(message,error=false){
  const old=document.querySelector('.toast');
  if(old)old.remove();
  const el=document.createElement('div');
  el.className=`toast ${error?'error':''}`;
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3800);
}
function autosize(){
  const i=$('input');
  i.style.height='auto';
  i.style.height=Math.min(i.scrollHeight,120)+'px';
  $('send').disabled=!i.value.trim();
}

/* ---------- auth / functions ---------- */
async function session(){
  const {data,error}=await db.auth.getSession();
  if(error)throw error;
  if(!data.session){location.href='login.html';return null}
  state.session=data.session;
  state.user=data.session.user;
  const {data:c,error:e}=await db.from('client_data').select('client_id,business_name,name,full_name').eq('auth_user_id',state.user.id).maybeSingle();
  if(e)throw e;
  if(!c?.client_id)throw new Error('Client account not found');
  state.clientId=c.client_id;
  $('businessName').textContent=c.business_name||c.name||c.full_name||'Business';
  $('clientId').textContent=c.client_id;
  return data.session;
}

/* Surfaces the real server message instead of a generic non-2xx error. */
async function fn(name,body={}){
  const {data,error}=await db.functions.invoke(name,{body});
  if(error){
    let detail='';
    try{
      const res=error.context;
      if(res&&typeof res.json==='function'){
        const j=await res.json();
        detail=j?.message||j?.error||'';
      }
    }catch{}
    throw new Error(detail||error.message||'Function request failed');
  }
  if(data?.error)throw new Error(data.message||data.error);
  return data||{};
}

async function loadConnection(){
  try{
    const data=await fn('instagram-connection-status');
    state.connection=data;
    const connected=data?.connected===true;
    $('connection').className=`connection-badge ${connected?'online':'offline'}`;
    $('connection').textContent=connected?`● Connected${data.username?` @${data.username}`:''}`:(data?.expired?'● Token expired':'● Not connected');
    $('connect').textContent=connected?'Reconnect':'Connect Instagram';
    $('connect').classList.toggle('connected',connected);
    return connected;
  }catch(error){
    console.error('Instagram connection check:',error);
    state.connection=null;
    $('connection').className='connection-badge offline';
    $('connection').textContent='● Check failed';
    $('connect').textContent='Connect Instagram';
    $('connect').classList.remove('connected');
    return false;
  }
}

async function connectInstagram(){
  const s=await session();
  if(!s)return;
  try{
    const response=await fetch(`${SUPABASE_URL}/functions/v1/instagram-oauth-start`,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,Authorization:`Bearer ${s.access_token}`},
      body:'{}'
    });
    const data=await response.json();
    if(!response.ok||!data.url)throw new Error(data.error||'Unable to start Instagram connection.');
    location.href=data.url;
  }catch(error){toast(error.message,true)}
}

async function loadServices(){
  try{
    const s=await db.auth.getSession();
    const token=s.data.session?.access_token;
    if(!token){state.catalogContext=null;state.business=null;state.knowledge=[];state.services=[];renderServices();return}
    const response=await fetch(`${SUPABASE_URL}/functions/v1/catalog-context`,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`},
      body:'{}'
    });
    if(!response.ok)throw new Error(`catalog-context ${response.status}`);
    const result=await response.json();
    state.catalogContext=result||{};
    state.business=result.business||null;
    state.knowledge=Array.isArray(result.knowledge)?result.knowledge:[];
    state.services=(Array.isArray(result.catalog)?result.catalog:[]).map(item=>({...item,short_desc:item.short_description||item.description||''}));
  }catch(error){
    console.error('Instagram catalog error:',error);
    state.catalogContext=null;state.business=null;state.knowledge=[];state.services=[];
  }
  renderServices();
}

function renderServices(){
  const active=state.services.filter(i=>i.status==='active'||i.status==='published');
  const rows=(active.length?active:state.services).slice(0,8);
  $('serviceContext').innerHTML=rows.map(i=>`<div class="service-chip"><b>${esc(i.name||i.title||'Service')}</b><span>${esc(i.short_desc||'Catalog service')}</span></div>`).join('')||'<span>No services published yet.</span>';
}

/* ---------- conversations ---------- */
async function loadPreviews(){
  try{
    const ids=state.conversations.map(c=>c.id);
    if(!ids.length){state.previews={};return}
    const {data,error}=await db.from('instagram_messages')
      .select('conversation_id,direction,text_body,message_type,created_at')
      .eq('client_id',state.clientId).in('conversation_id',ids)
      .order('created_at',{ascending:false}).limit(400);
    if(error)throw error;
    const map={};
    for(const m of data||[]){if(!map[m.conversation_id])map[m.conversation_id]=m}
    state.previews=map;
  }catch(error){
    console.error('Instagram previews:',error);
    state.previews={};
  }
}

async function loadConversations(){
  let query=db.from('instagram_conversations').select('*').eq('client_id',state.clientId).order('last_message_at',{ascending:false,nullsFirst:false});
  if(state.filter!=='all')query=query.eq('status',state.filter);
  const {data,error}=await query.limit(100);
  if(error)throw error;
  state.conversations=data||[];
  await loadPreviews();
  renderConversations();
  if(state.selected){
    const fresh=state.conversations.find(i=>i.id===state.selected.id);
    if(fresh)await selectConversation(fresh,false);
  }
}

function renderConversations(){
  const search=$('search').value.toLowerCase().trim();
  const rows=state.conversations.filter(c=>!search||`${c.username||''} ${c.instagram_user_id||''}`.toLowerCase().includes(search));
  $('list').innerHTML=rows.map(c=>{
    const p=state.previews[c.id];
    const needs=!!p&&p.direction==='inbound'&&c.status!=='closed';
    const name=c.username||c.instagram_user_id||'Instagram Customer';
    const preview=p?`${p.direction==='inbound'?'':'You: '}${p.text_body||mediaLabel(p.message_type)}`:`@${c.username||'instagram'}`;
    return `<div class="conversation-item ${state.selected?.id===c.id?'active':''}" data-id="${esc(c.id)}">`+
      `<div class="avatar${needs?' ring':''}">${esc(name.slice(0,1).toUpperCase())}</div>`+
      `<div class="conv-copy"><div class="conv-top"><strong>${esc(name)}</strong><span class="conv-time">${esc(ago(c.last_message_at||c.updated_at))}</span></div>`+
      `<div class="conv-sub"><span class="conv-preview${needs?' unread':''}">${esc(preview)}</span>${c.status==='closed'?'<span class="conv-closed">Closed</span>':''}</div></div>`+
      `${needs?'<span class="conv-dot"></span>':''}</div>`;
  }).join('')||'<div class="loading-state">No Instagram conversations yet.</div>';
  document.querySelectorAll('.conversation-item').forEach(item=>{
    item.onclick=()=>{
      const c=state.conversations.find(x=>x.id===item.dataset.id);
      if(c)selectConversation(c);
    };
  });
}

async function selectConversation(conversation,focus=true){
  state.selected=conversation;
  $('empty').classList.add('hidden');
  $('view').classList.remove('hidden');
  const username=conversation.username||'Instagram Customer';
  $('name').textContent=username;
  $('handle').textContent=`@${username} · ${conversation.status==='closed'?'Closed':'Open'}`;
  $('avatar').textContent=username.slice(0,1).toUpperCase();
  $('avatar').className=`avatar${conversation.status==='closed'?'':' ring'}`;
  $('ctxName').textContent=username;
  $('ctxUsername').textContent=`@${username}`;
  $('ctxInstagramId').textContent=conversation.instagram_user_id||'—';
  $('openLead').href=conversation.lead_id?`leads.html?lead=${encodeURIComponent(conversation.lead_id)}`:'leads.html';
  document.querySelectorAll('.conversation-item').forEach(i=>i.classList.toggle('active',i.dataset.id===conversation.id));
  await loadMessages(conversation.id);
  await loadLeadContext(conversation);
  await loadPendingApproval();
  if(focus&&matchMedia('(pointer:fine)').matches)$('input').focus();
}

/* ---------- messages ---------- */
function mergeLocal(){
  const now=Date.now();
  state.local=state.local.filter(l=>l.conversation_id===state.selected?.id&&now-l._t<300000);
  state.local=state.local.filter(l=>!state.messages.some(m=>m.direction!=='inbound'&&String(m.text_body||'').trim()===l.text_body&&Math.abs(new Date(m.created_at).getTime()-l._t)<300000));
  for(const l of state.local)state.messages.push(l);
}

async function loadMessages(conversationId){
  const {data,error}=await db.from('instagram_messages').select('*').eq('client_id',state.clientId).eq('conversation_id',conversationId).order('created_at',{ascending:true}).limit(300);
  if(error)throw error;
  state.messages=data||[];
  mergeLocal();
  renderMessages();
}

function bubbleHtml(m){
  const text=String(m.text_body||'').trim();
  const url=m.media_url||m.attachment_url||'';
  if(url&&/^https?:\/\//i.test(url)){
    return `<div class="ig-media"><img src="${esc(url)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>`+(text?`<div class="bubble">${fmt(text)}</div>`:'');
  }
  if(text)return `<div class="bubble">${fmt(text)}</div>`;
  return `<div class="bubble media">${esc(mediaLabel(m.message_type))}</div>`;
}

function renderMessages(){
  const list=state.messages;
  if(!list.length){$('messages').innerHTML='<div class="loading-state">No messages in this conversation.</div>';return}
  const initial=esc((state.selected?.username||'I').slice(0,1).toUpperCase());
  const stamp=m=>new Date(m.created_at||m.provider_timestamp||Date.now()).getTime();
  let lastOut=-1;
  list.forEach((m,i)=>{if(m.direction!=='inbound')lastOut=i});
  let html='';
  list.forEach((m,i)=>{
    const t=stamp(m),prev=list[i-1],next=list[i+1];
    const isIn=m.direction==='inbound';
    const newBlock=!prev||(t-stamp(prev))>3600000;
    const sameAsPrev=!!prev&&!newBlock&&(prev.direction==='inbound')===isIn;
    const sameAsNext=!!next&&(stamp(next)-t)<=3600000&&(next.direction==='inbound')===isIn;
    if(newBlock)html+=`<div class="ig-sep">${esc(sepLabel(t))}</div>`;
    const cls=`message-row ${isIn?'in':'out'}${sameAsPrev?'':' first'}${sameAsNext?'':' last'}`;
    const av=isIn?`<span class="m-av${sameAsNext?' sp':''}">${initial}</span>`:'';
    html+=`<div class="${cls}" data-message-id="${esc(m.id)}" data-direction="${esc(m.direction||'')}">${av}<div class="bubble-wrap">${bubbleHtml(m)}<span class="ig-time">${esc(time(m.created_at||m.provider_timestamp))}</span></div></div>`;
    if(i===lastOut&&!isIn){
      const s=String(m.status||'').toLowerCase();
      const failed=s==='failed'||s==='error';
      const label=failed?'Failed to send':(s==='read'||s==='seen')?'Seen':s==='delivered'?'Delivered':'Sent';
      html+=`<div class="ig-status${failed?' fail':''}">${label}</div>`;
    }
  });
  $('messages').innerHTML=html;
  requestAnimationFrame(()=>{$('messages').scrollTop=$('messages').scrollHeight});
}

async function loadLeadContext(conversation){
  let lead=null;
  if(conversation.lead_id){
    const {data}=await db.from('leads').select('*').eq('id',conversation.lead_id).eq('client_id',state.clientId).maybeSingle();
    lead=data;
  }
  if(!lead){
    const {data}=await db.from('leads').select('*').eq('client_id',state.clientId).eq('instagram_user_id',conversation.instagram_user_id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
    lead=data;
  }
  state.lead=lead;
  $('leadStatus').textContent=lead?'Lead':'New';
  $('interest').textContent=lead?.interest||'—';
  $('budget').textContent=lead?.budget?`${lead.budget} ${lead.budget_currency||'INR'}`:'—';
  $('product').textContent=lead?.product_service||'—';
  $('source').textContent=lead?.source||'Instagram';
  await loadTimeline(lead?.id);
}

async function loadTimeline(leadId){
  if(!leadId){$('timeline').innerHTML='<span>No lead timeline yet.</span>';return}
  const {data,error}=await db.from('lead_timeline').select('event_type,title,description,created_at').eq('client_id',state.clientId).eq('lead_id',leadId).order('created_at',{ascending:false}).limit(8);
  if(error){console.error(error);return}
  $('timeline').innerHTML=(data||[]).map(i=>`<div class="timeline-item"><strong>${esc(i.title||i.event_type||'Event')}</strong><small>${esc(i.description||'')} · ${time(i.created_at)}</small></div>`).join('')||'<span>No events yet.</span>';
}

function setMode(mode){
  state.mode=mode;
  localStorage.setItem('glime_instagram_mode',mode);
  document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('sendHint').textContent=mode==='auto'?'AI can send':mode==='approval'?'Approval required':'Manual send';
}

/* ---------- sending ---------- */
async function sendMessage(){
  if(!state.selected){toast('Select an Instagram conversation first.',true);return}
  const message=$('input').value.trim();
  if(!message)return;
  if(message.length>2000){toast('Instagram message is too long.',true);return}
  $('send').disabled=true;
  try{
    const result=await fn('instagram-action-request',{conversation_id:state.selected.id,message,mode:state.mode});
    if(!result.ok)throw new Error(result.message||result.error||'Instagram action failed.');
    $('input').value='';
    autosize();
    if(state.mode==='approval'){
      toast('Reply is waiting for approval.');
    }else{
      if(result.job_id){
        const executed=await fn('business-action-executor',{job_id:result.job_id});
        if(executed?.ok===false)throw new Error(executed.message||executed.error||'Instagram message failed.');
      }
      state.local.push({id:`local-${Date.now()}`,conversation_id:state.selected.id,direction:'outbound',text_body:message,status:'sent',message_type:'text',created_at:new Date().toISOString(),_t:Date.now()});
      toast('Sent');
    }
    await loadMessages(state.selected.id);
    await loadConversations();
    await loadPendingApproval();
  }catch(error){
    console.error('Instagram send:',error);
    toast(error.message||'Instagram message failed.',true);
  }finally{
    autosize();
  }
}

async function findProposedApproval(targetId){
  const {data}=await db.from('client_action_requests').select('id,status,action_payload,created_at').eq('client_id',state.clientId).eq('target_module_slug',MODULE).eq('target_action','message').eq('target_id',targetId).eq('status','proposed').order('created_at',{ascending:false}).limit(1).maybeSingle();
  return data||null;
}

async function loadPendingApproval(){
  $('approvalBox').classList.add('hidden');
  if(!state.selected)return;
  let approval=null;
  const target=state.selected.lead_id||state.lead?.id;
  if(target)approval=await findProposedApproval(target);
  if(!approval)approval=await findProposedApproval(state.selected.id);
  if(!approval)return;
  $('approvalText').textContent=approval.action_payload?.message||'Instagram reply pending approval.';
  $('approvalBox').classList.remove('hidden');
  $('approveBtn').onclick=()=>approvePending(approval.id);
  $('rejectBtn').onclick=()=>rejectPending(approval.id);
}

async function approvePending(requestId){
  try{
    $('approveBtn').disabled=true;
    const {data,error}=await db.rpc('approve_client_business_action',{p_action_request_id:requestId});
    if(error)throw error;
    if(data?.job_id){
      const result=await fn('business-action-executor',{job_id:data.job_id});
      if(result?.ok===false)throw new Error(result.message||result.error||'Instagram provider failed.');
    }
    toast('Approved and sent.');
    await loadPendingApproval();
    await loadMessages(state.selected.id);
    await loadConversations();
  }catch(error){toast(error.message,true)}
  finally{$('approveBtn').disabled=false}
}

async function rejectPending(requestId){
  try{
    const {error}=await db.rpc('reject_client_business_action',{p_action_request_id:requestId});
    if(error)throw error;
    toast('Instagram reply rejected.');
    await loadPendingApproval();
  }catch(error){toast(error.message,true)}
}

async function suggestReply(){
  if(!state.selected){toast('Select a conversation first.',true);return}
  $('suggest').disabled=true;
  try{
    const recent=state.messages.slice(-12).map(m=>`${m.direction==='inbound'?'Customer':'Business'}: ${m.text_body||''}`).join('\n');
    const business=JSON.stringify(state.business||{});
    const knowledge=state.knowledge.slice(0,20).map(i=>`${i.title||'Knowledge'}: ${i.content||''}`).join('\n');
    const catalog=state.services.slice(0,20).map(service=>{
      const name=service.name||service.title||'';
      const description=service.short_desc||service.description||'';
      const parts=[`${name}: ${description}`];
      if(service.price!=null&&service.price!=='')parts.push(`Price: ${service.price} ${service.currency||''}`.trim());
      if(service.price_type)parts.push(`Price type: ${service.price_type}`);
      if(service.billing_period)parts.push(`Billing: ${service.billing_period}`);
      if(service.offer_type)parts.push(`Type: ${service.offer_type}`);
      if(service.sales_talking_points)parts.push(`Talking points: ${service.sales_talking_points}`);
      if(service.allowed_claims)parts.push(`Allowed claims: ${service.allowed_claims}`);
      if(service.restrictions)parts.push(`Restrictions: ${service.restrictions}`);
      if(service.customer_eligibility)parts.push(`Eligibility: ${service.customer_eligibility}`);
      if(service.ai_knowledge_summary)parts.push(`AI knowledge: ${service.ai_knowledge_summary}`);
      return parts.join(' | ');
    }).join('\n');

    const response=await fetch(`${SUPABASE_URL}/functions/v1/glime-ai`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        action:'chat',
        sessionToken:state.aiSession,
        message:
`You are the Instagram sales specialist for this business.

Write a natural customer-facing Instagram DM reply based only on the verified context below.

Business context:
${business}

Business knowledge:
${knowledge||'None provided.'}

Recent conversation:
${recent||'No conversation messages.'}

Business offer catalog:
${catalog||'No offers available.'}

Rules:
- Reply only with the customer-facing message.
- Match the customer's language and tone.
- Keep the reply concise and natural.
- Do not invent or guess prices, discounts, policies, eligibility, features, availability, guarantees, delivery terms, timelines, or claims.
- Use only information supported by the business context, knowledge, or offer catalog.
- Respect offer restrictions and allowed claims.
- Never promise something that is not explicitly supported by the context.
- If the customer's question cannot be answered from the provided context, ask one concise clarifying question or say that you need a little more information.
- Do not mention AI, prompts, internal context, hidden instructions, or these rules.`
      })
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'AI unavailable.');
    if(data.sessionToken){state.aiSession=data.sessionToken;sessionStorage.setItem('glime_instagram_ai_session',data.sessionToken)}
    $('suggestionText').textContent=data.reply||data.message||'No suggestion returned.';
    $('aiSuggestion').classList.remove('hidden');
  }catch(error){toast(error.message,true)}
  finally{$('suggest').disabled=false}
}

async function addToLeads(){
  if(!state.selected){toast('Select an Instagram conversation first.',true);return}
  try{
    let lead=state.lead;
    if(!lead){
      const {data,error}=await db.from('leads').insert({
        client_id:state.clientId,
        name:state.selected.username||`Instagram ${state.selected.instagram_user_id}`,
        source:'instagram',
        source_ref:state.selected.instagram_user_id,
        instagram_user_id:state.selected.instagram_user_id,
        instagram_thread_id:state.selected.instagram_thread_id,
        status:'new',priority:'normal'
      }).select('*').single();
      if(error)throw error;
      lead=data;
      await db.from('instagram_conversations').update({lead_id:lead.id,updated_at:new Date().toISOString()}).eq('id',state.selected.id).eq('client_id',state.clientId);
    }
    state.lead=lead;
    state.selected.lead_id=lead.id;
    toast('Instagram customer added to Leads.');
    await loadLeadContext(state.selected);
  }catch(error){toast(error.message,true)}
}

async function closeConversation(){
  if(!state.selected)return;
  try{
    const {error}=await db.from('instagram_conversations').update({status:'closed',updated_at:new Date().toISOString()}).eq('id',state.selected.id).eq('client_id',state.clientId);
    if(error)throw error;
    toast('Conversation closed.');
    await loadConversations();
  }catch(error){toast(error.message,true)}
}

/* ---------- wiring ---------- */
$('logout').onclick=async()=>{await db.auth.signOut();location.href='login.html'};
$('connect').onclick=connectInstagram;
$('refresh').onclick=async()=>{
  try{
    await loadConnection();
    await loadServices();
    await loadConversations();
    toast('Inbox refreshed');
  }catch(error){toast(error.message,true)}
};
$('search').oninput=renderConversations;
$('send').onclick=sendMessage;
$('suggest').onclick=suggestReply;
$('refreshSuggestion').onclick=suggestReply;
$('useSuggestion').onclick=()=>{$('input').value=$('suggestionText').textContent.trim();autosize();$('input').focus()};
$('addLead').onclick=addToLeads;
$('closeConversation').onclick=closeConversation;

document.querySelectorAll('.mode').forEach(b=>{b.onclick=()=>setMode(b.dataset.mode)});
document.querySelectorAll('.filters button').forEach(button=>{
  button.onclick=async()=>{
    document.querySelectorAll('.filters button').forEach(i=>i.classList.remove('active'));
    button.classList.add('active');
    state.filter=button.dataset.filter;
    try{await loadConversations()}catch(error){toast(error.message,true)}
  };
});

$('messages').addEventListener('click',e=>{
  const row=e.target.closest('.message-row');
  if(row&&!e.target.closest('a'))row.classList.toggle('show-time');
});

$('input').addEventListener('input',autosize);
$('input').addEventListener('keydown',event=>{
  if(event.key!=='Enter')return;
  const desktop=matchMedia('(pointer:fine)').matches;
  if((desktop&&!event.shiftKey)||event.ctrlKey||event.metaKey){
    event.preventDefault();
    sendMessage();
  }
});

async function boot(){
  try{
    if(!(await session()))return;
    /* Connection and catalog problems are non-fatal: the inbox must still load. */
    await loadConnection();
    await loadServices();
    setMode(state.mode);
    autosize();
    await loadConversations();
    $('boot').remove();
  }catch(error){
    console.error('Instagram Sales boot:',error);
    $('boot').innerHTML=`<span style="color:#ff8a94;max-width:400px;text-align:center;">${esc(error.message||'Unable to load Instagram Sales Specialist.')}</span><button class="primary-btn" onclick="location.reload()">Retry</button>`;
  }
}

boot();
})();
