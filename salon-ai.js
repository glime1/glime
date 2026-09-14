(() => {
'use strict';

const SUPABASE_URL='https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY='sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const MODULE_SLUG='salon_ai';

const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let currentClientId=null;

const $=id=>document.getElementById(id);

function escapeHtml(value){
    return String(value??'')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#039;');
}

function showMessage(text,type='ok'){
    const el=$('message');
    el.textContent=text;
    el.className='message show';

    el.style.borderColor=type==='error'
        ?'rgba(255,92,108,.35)'
        :'rgba(0,255,136,.25)';

    el.style.color=type==='error'
        ?'#ff9aa5'
        :'#9fffc8';

    clearTimeout(showMessage.timer);

    showMessage.timer=setTimeout(()=>{
        el.className='message';
    },4000);
}

function setAccess(ok,text){
    $('accessDot').className=ok?'ok':'bad';
    $('accessText').textContent=text;
}

async function getClient(){

    const {
        data:{user},
        error:authError
    }=await db.auth.getUser();

    if(authError||!user)
        throw new Error('Please login to GLIME first.');

    const {data,error}=await db
        .from('client_data')
        .select('id,client_id,auth_user_id,email')
        .eq('auth_user_id',user.id)
        .maybeSingle();

    if(error) throw error;

    if(!data)
        throw new Error('No GLIME client profile found for this account.');

    return data;
}

async function checkModuleAccess(clientId){

    const {
        data:module,
        error:moduleError
    }=await db
        .from('modules')
        .select('id,slug,name')
        .eq('slug',MODULE_SLUG)
        .maybeSingle();

    if(moduleError) throw moduleError;

    if(!module)
        throw new Error(
            'Salon AI module is not registered yet. Add a modules row with slug "salon_ai".'
        );

    const {
        data:access,
        error:accessError
    }=await db
        .from('client_modules')
        .select(
            'enabled,visible_to_client,status,plan,activated_at,expires_at'
        )
        .eq('client_id',clientId)
        .eq('module_id',module.id)
        .maybeSingle();

    if(accessError) throw accessError;

    const expired=access?.expires_at
        ?new Date(access.expires_at).getTime()<Date.now()
        :false;

    const active=!!access &&
        access.enabled===true &&
        ['active','trial'].includes(access.status) &&
        !expired;

    const visible=!!access &&
        (access.visible_to_client===true||active);

    if(!visible)
        throw new Error('Salon AI is not enabled for this client.');

    return {active};
}

async function loadProfile(){

    const {data,error}=await db
        .from('salon_profiles')
        .select('*')
        .eq('client_id',currentClientId)
        .maybeSingle();

    if(error) throw error;

    if(!data) return;

    $('businessName').value=data.business_name||'';
    $('phone').value=data.phone||'';
    $('whatsapp').value=data.whatsapp_number||'';
    $('email').value=data.email||'';
    $('address').value=data.address||'';
    $('description').value=data.description||'';
}

async function saveProfile(){

    const payload={
        client_id:currentClientId,
        business_name:$('businessName').value.trim()||null,
        phone:$('phone').value.trim()||null,
        whatsapp_number:$('whatsapp').value.trim()||null,
        email:$('email').value.trim()||null,
        address:$('address').value.trim()||null,
        description:$('description').value.trim()||null,
        updated_at:new Date().toISOString()
    };

    const {error}=await db
        .from('salon_profiles')
        .upsert(payload,{onConflict:'client_id'});

    if(error) throw error;

    showMessage('Salon Profile saved successfully.');
}

async function loadAISettings(){

    const {data,error}=await db
        .from('salon_ai_settings')
        .select('*')
        .eq('client_id',currentClientId)
        .maybeSingle();

    if(error) throw error;

    if(!data){

        $('agentName').value='GLIME Salon Assistant';
        $('language').value='hi-en';
        $('bookingEnabled').checked=true;
        $('handoffEnabled').checked=true;

        return;
    }

    $('agentName').value=
        data.agent_name||'GLIME Salon Assistant';

    $('language').value=
        data.language||'hi-en';

    $('greeting').value=
        data.greeting||'';

    $('instructions').value=
        data.custom_instructions||'';

    $('bookingEnabled').checked=
        data.booking_enabled!==false;

    $('handoffEnabled').checked=
        data.human_handoff_enabled!==false;
}

async function saveAISettings(){

    const payload={
        client_id:currentClientId,
        agent_name:
            $('agentName').value.trim()||
            'GLIME Salon Assistant',

        language:$('language').value,

        greeting:
            $('greeting').value.trim()||null,

        custom_instructions:
            $('instructions').value.trim()||null,

        booking_enabled:
            $('bookingEnabled').checked,

        human_handoff_enabled:
            $('handoffEnabled').checked,

        updated_at:new Date().toISOString()
    };

    const {error}=await db
        .from('salon_ai_settings')
        .upsert(payload,{onConflict:'client_id'});

    if(error) throw error;

    showMessage('AI Settings saved successfully.');
}

async function loadStats(){

    const qs=await Promise.all([

        db
        .from('salon_services')
        .select('id',{count:'exact',head:true})
        .eq('client_id',currentClientId)
        .eq('active',true),

        db
        .from('salon_staff')
        .select('id',{count:'exact',head:true})
        .eq('client_id',currentClientId)
        .eq('active',true),

        db
        .from('salon_leads')
        .select('id',{count:'exact',head:true})
        .eq('client_id',currentClientId),

        db
        .from('salon_appointments')
        .select('id',{count:'exact',head:true})
        .eq('client_id',currentClientId)
    ]);

    qs.forEach(q=>{
        if(q.error) throw q.error;
    });

    $('serviceCount').textContent=qs[0].count??0;
    $('staffCount').textContent=qs[1].count??0;
    $('leadCount').textContent=qs[2].count??0;
    $('appointmentCount').textContent=qs[3].count??0;
}

async function loadServices(){

    const {data,error}=await db
        .from('salon_services')
        .select(
            'id,name,duration_minutes,price,gender,description'
        )
        .eq('client_id',currentClientId)
        .order('created_at',{ascending:false});

    if(error) throw error;

    const box=$('services');

    if(!data?.length){

        box.innerHTML=
            '<div class="empty">No services added yet. Click “+ Add Service”.</div>';

        return;
    }

    box.innerHTML=data.map(x=>`

        <div class="item">

            <strong>
                ${escapeHtml(x.name)}
            </strong>

            <br>

            <small>

                ${
                    x.price!=null
                    ?'₹'+escapeHtml(
                        Number(x.price)
                        .toLocaleString('en-IN')
                    )
                    :'Price not set'
                }

                · ${escapeHtml(x.duration_minutes)} min

                ${
                    x.gender
                    ?' · '+escapeHtml(x.gender)
                    :''
                }

            </small>

        </div>

    `).join('');
}

async function loadStaff(){

    const {data,error}=await db
        .from('salon_staff')
        .select('id,name,role,bio')
        .eq('client_id',currentClientId)
        .order('created_at',{ascending:false});

    if(error) throw error;

    const box=$('staff');

    if(!data?.length){

        box.innerHTML=
            '<div class="empty">No staff added yet. Click “+ Add Staff”.</div>';

        return;
    }

    box.innerHTML=data.map(x=>`

        <div class="item">

            <strong>
                ${escapeHtml(x.name)}
            </strong>

            <br>

            <small>
                ${escapeHtml(x.role||'Staff')}
            </small>

        </div>

    `).join('');
}

async function addService(){

    const name=prompt('Service name?');

    if(!name?.trim()) return;

    const p=prompt('Price? Example: 300');

    const d=prompt(
        'Duration in minutes? Example: 30'
    );

    const price=
        p?.trim()
        ?Number(p)
        :null;

    const duration=
        d?.trim()
        ?Number(d)
        :30;

    if(p?.trim()&&!Number.isFinite(price)){

        showMessage(
            'Invalid price.',
            'error'
        );

        return;
    }

    if(!Number.isFinite(duration)||duration<=0){

        showMessage(
            'Invalid duration.',
            'error'
        );

        return;
    }

    const {error}=await db
        .from('salon_services')
        .insert({
            client_id:currentClientId,
            name:name.trim(),
            price,
            duration_minutes:duration,
            active:true
        });

    if(error) throw error;

    await Promise.all([
        loadServices(),
        loadStats()
    ]);

    showMessage('Service added.');
}

async function addStaff(){

    const name=prompt('Staff name?');

    if(!name?.trim()) return;

    const role=prompt(
        'Role? Example: Hair Stylist'
    );

    const {error}=await db
        .from('salon_staff')
        .insert({
            client_id:currentClientId,
            name:name.trim(),
            role:role?.trim()||null,
            active:true
        });

    if(error) throw error;

    await Promise.all([
        loadStaff(),
        loadStats()
    ]);

    showMessage('Staff member added.');
}

async function init(){

    try{

        setAccess(
            false,
            'Checking access…'
        );

        const client=await getClient();

        currentClientId=client.client_id;

        const result=
            await checkModuleAccess(
                currentClientId
            );

        setAccess(
            true,
            result.active
            ?'Salon AI Active'
            :'Module Visible'
        );

        await Promise.all([

            loadProfile(),
            loadAISettings(),
            loadServices(),
            loadStaff(),
            loadStats()

        ]);

    }catch(error){

        console.error(
            'Salon AI init error:',
            error
        );

        setAccess(
            false,
            'Access unavailable'
        );

        showMessage(
            error.message||
            'Unable to load Salon AI.',
            'error'
        );

        document
            .querySelectorAll(
                'button,input,textarea,select'
            )
            .forEach(el=>{
                el.disabled=true;
            });
    }
}

$('saveProfile')
    .addEventListener(
        'click',
        ()=>saveProfile()
            .catch(e=>
                showMessage(
                    e.message,
                    'error'
                )
            )
    );

$('saveAI')
    .addEventListener(
        'click',
        ()=>saveAISettings()
            .catch(e=>
                showMessage(
                    e.message,
                    'error'
                )
            )
    );

$('addService')
    .addEventListener(
        'click',
        ()=>addService()
            .catch(e=>
                showMessage(
                    e.message,
                    'error'
                )
            )
    );

$('addStaff')
    .addEventListener(
        'click',
        ()=>addStaff()
            .catch(e=>
                showMessage(
                    e.message,
                    'error'
                )
            )
    );

init();

})();
