(() => {
const U='https://ufoulgbiqgjriwapuopc.supabase.co',K='sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA',db=supabase.createClient(U,K);
let clientId='',mode=localStorage.getItem('glime_instagram_mode')||'auto';
const $=x=>document.getElementById(x);
async function boot(){const {data:{session}}=await db.auth.getSession();if(!session){location.href='login.html';return}const {data:c,error}=await db.from('client_data').select('client_id,business_name,name,full_name').eq('auth_user_id',session.user.id).maybeSingle();if(error||!c?.client_id)throw new Error(error?.message||'Client account not found');clientId=c.client_id;$('businessName').textContent=c.business_name||c.name||c.full_name||'Business';$('clientId').textContent=clientId;await checkConnection();setMode(mode);$('boot').remove()}
async function checkConnection(){const {data}=await db.from('instagram_connections').select('status,username,instagram_user_id').eq('client_id',clientId).maybeSingle();const ok=data?.status==='connected';$('connection').textContent=ok?'● Instagram connected':'● Instagram not connected';$('connect').textContent=ok?'Instagram Connected':'Connect Instagram'}
function setMode(m){mode=m;localStorage.setItem('glime_instagram_mode',m);document.querySelectorAll('.modes button').forEach(b=>b.classList.toggle('active',b.dataset.mode===m))}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
$('logout').onclick=async()=>{await db.auth.signOut();location.href='login.html'};$('refresh').onclick=checkConnection;$('connect').onclick=()=>alert('Instagram connection flow will use the same secure Meta connection pattern.');document.querySelectorAll('.modes button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('addLead').onclick=()=>alert('Select an Instagram conversation first.');boot().catch(e=>{$('boot').innerHTML=`<span style="color:#ff6472">${esc(e.message)}</span>`});
})();
