(() => {

const SUPABASE_URL =
  'https://ufoulgbiqgjriwapuopc.supabase.co';

const SUPABASE_KEY =
  'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

const MODULE =
  'instagram_ai_sales_agent';

const db =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


const $ = id =>
  document.getElementById(id);


let state = {

  user:null,

  session:null,

  clientId:null,

  connection:null,

  conversations:[],

  messages:[],

  selected:null,

  lead:null,

  services:[],

  filter:'all',

  mode:
    localStorage.getItem(
      'glime_instagram_mode'
    ) || 'manual',

  aiSession:
    sessionStorage.getItem(
      'glime_instagram_ai_session'
    ) || null

};



/* --------------------------------------------------
   HELPERS
-------------------------------------------------- */

function esc(value){

  return String(value ?? '')
    .replace(/[&<>"']/g, char => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#039;'
    }[char]));

}


function time(value){

  if(!value) return '';

  try{

    return new Date(value)
      .toLocaleString([],{
        day:'2-digit',
        month:'short',
        hour:'2-digit',
        minute:'2-digit'
      });

  }catch{

    return '';

  }

}


function toast(message,error=false){

  const old =
    document.querySelector('.toast');

  if(old) old.remove();

  const el =
    document.createElement('div');

  el.className =
    `toast ${error?'error':''}`;

  el.textContent = message;

  document.body.appendChild(el);

  setTimeout(() => el.remove(),3500);

}


async function session(){

  const {
    data,
    error
  } =
    await db.auth.getSession();

  if(error)
    throw error;

  if(!data.session){

    location.href='login.html';

    return null;

  }

  state.session =
    data.session;

  state.user =
    data.session.user;

  const {
    data:c,
    error:e
  } =
    await db
      .from('client_data')
      .select(
        'client_id,business_name,name,full_name'
      )
      .eq(
        'auth_user_id',
        state.user.id
      )
      .maybeSingle();

  if(e)
    throw e;

  if(!c?.client_id)
    throw new Error(
      'Client account not found'
    );

  state.clientId =
    c.client_id;

  $('businessName').textContent =
    c.business_name ||
    c.name ||
    c.full_name ||
    'Business';

  $('clientId').textContent =
    c.client_id;

  return data.session;

}



/* --------------------------------------------------
   EDGE FUNCTION HELPER
-------------------------------------------------- */

async function fn(name,body={}){

  const {
    data,
    error
  } =
    await db.functions.invoke(
      name,
      {body}
    );

  if(error)
    throw new Error(
      error.message ||
      'Function request failed'
    );

  if(data?.error)
    throw new Error(data.error);

  return data || {};

}



/* --------------------------------------------------
   CONNECTION
-------------------------------------------------- */

async function loadConnection(){

  const data =
    await fn(
      'instagram-connection-status'
    );

  state.connection =
    data;

  const connected =
    data?.connected === true;

  $('connection').className =
    `connection-badge ${
      connected?'online':'offline'
    }`;

  if(connected){

    $('connection').textContent =
      `● Instagram connected${
        data.username
          ? ` @${data.username}`
          : ''
      }`;

    $('connect').textContent =
      'Instagram Connected';

  }else{

    $('connection').textContent =
      data?.expired
        ? '● Instagram token expired'
        : '● Instagram not connected';

    $('connect').textContent =
      'Connect Instagram';

  }

  return connected;

}



/* --------------------------------------------------
   INSTAGRAM OAUTH
-------------------------------------------------- */

async function connectInstagram(){

  const s =
    await session();

  if(!s) return;

  try{

    const response =
      await fetch(
        `${SUPABASE_URL}/functions/v1/instagram-oauth-start`,
        {
          method:'POST',
          headers:{
            'Content-Type':
              'application/json',

            apikey:
              SUPABASE_KEY,

            Authorization:
              `Bearer ${s.access_token}`
          },

          body:'{}'
        }
      );

    const data =
      await response.json();

    if(!response.ok || !data.url){

      throw new Error(
        data.error ||
        'Unable to start Instagram connection.'
      );

    }

    location.href =
      data.url;

  }catch(error){

    toast(
      error.message,
      true
    );

  }

}



/* --------------------------------------------------
   CATALOG
-------------------------------------------------- */

async function loadServices(){

  try{

    const s =
      await db.auth.getSession();

    const token =
      s.data.session?.access_token;

    if(!token){

      state.services=[];

      renderServices();

      return;

    }

    const response =
      await fetch(
        `${SUPABASE_URL}/functions/v1/catalog-context`,
        {
          method:'POST',

          headers:{
            'Content-Type':
              'application/json',

            apikey:
              SUPABASE_KEY,

            Authorization:
              `Bearer ${token}`
          },

          body:'{}'
        }
      );

    if(!response.ok)
      throw new Error(
        `catalog-context ${response.status}`
      );

    const result =
      await response.json();

    state.services =
      (result.catalog || [])
        .map(item => ({
          ...item,
          short_desc:
            item.short_description ||
            item.description ||
            ''
        }));

  }catch(error){

    console.error(
      'Instagram catalog error:',
      error
    );

    state.services=[];

  }

  renderServices();

}


function renderServices(){

  const active =
    state.services.filter(
      item =>
        item.status === 'active' ||
        item.status === 'published'
    );

  const rows =
    (active.length
      ? active
      : state.services
    ).slice(0,8);

  $('serviceContext').innerHTML =
    rows.map(item => `

      <div class="service-chip">

        <b>
          ${esc(
            item.name ||
            item.title ||
            'Service'
          )}
        </b>

        <span>
          ${esc(
            item.short_desc ||
            'Catalog service'
          )}
        </span>

      </div>

    `).join('') ||

    '<span>No services published yet.</span>';

}



/* --------------------------------------------------
   CONVERSATIONS
-------------------------------------------------- */

async function loadConversations(){

  let query =
    db
      .from('instagram_conversations')
      .select('*')
      .eq(
        'client_id',
        state.clientId
      )
      .order(
        'last_message_at',
        {
          ascending:false,
          nullsFirst:false
        }
      );

  if(state.filter !== 'all'){

    query =
      query.eq(
        'status',
        state.filter
      );

  }

  const {
    data,
    error
  } =
    await query.limit(100);

  if(error)
    throw error;

  state.conversations =
    data || [];

  renderConversations();

  if(state.selected){

    const fresh =
      state.conversations.find(
        item =>
          item.id ===
          state.selected.id
      );

    if(fresh)
      await selectConversation(
        fresh,
        false
      );

  }

}


function renderConversations(){

  const search =
    $('search')
      .value
      .toLowerCase()
      .trim();

  const rows =
    state.conversations.filter(
      c => {

        const text =
          `${c.username || ''} ${
            c.instagram_user_id || ''
          }`.toLowerCase();

        return !search ||
          text.includes(search);

      }
    );


  $('list').innerHTML =
    rows.map(c => `

      <div
        class="conversation-item ${
          state.selected?.id === c.id
            ? 'active'
            : ''
        }"
        data-id="${esc(c.id)}"
      >

        <div class="avatar">
          ${esc(
            (c.username || 'I')
              .slice(0,1)
              .toUpperCase()
          )}
        </div>

        <div class="conv-copy">

          <div class="conv-top">

            <strong>
              ${esc(
                c.username ||
                c.instagram_user_id ||
                'Instagram Customer'
              )}
            </strong>

            <span class="conv-time">
              ${time(
                c.last_message_at ||
                c.updated_at
              )}
            </span>

          </div>

          <span class="conv-preview">
            @${esc(
              c.username ||
              'instagram'
            )}
          </span>

          <span class="conv-badge">
            ${
              c.status === 'open'
                ? '● Open'
                : '○ Closed'
            }
          </span>

        </div>

      </div>

    `).join('') ||

    '<div class="loading-state">No Instagram conversations yet.</div>';


  document
    .querySelectorAll(
      '.conversation-item'
    )
    .forEach(item => {

      item.onclick = () => {

        const conversation =
          state.conversations.find(
            c =>
              c.id ===
              item.dataset.id
          );

        if(conversation)
          selectConversation(
            conversation
          );

      };

    });

}



/* --------------------------------------------------
   SELECT CONVERSATION
-------------------------------------------------- */

async function selectConversation(
  conversation,
  focus=true
){

  state.selected =
    conversation;

  $('empty')
    .classList
    .add('hidden');

  $('view')
    .classList
    .remove('hidden');


  const username =
    conversation.username ||
    'Instagram Customer';


  $('name').textContent =
    username;

  $('handle').textContent =
    `@${username}`;


  $('avatar').textContent =
    username
      .slice(0,1)
      .toUpperCase();


  $('ctxName').textContent =
    username;

  $('ctxUsername').textContent =
    `@${username}`;

  $('ctxInstagramId').textContent =
    conversation.instagram_user_id ||
    '—';


  $('openLead').href =
    conversation.lead_id
      ? `leads.html?lead=${encodeURIComponent(
          conversation.lead_id
        )}`
      : 'leads.html';


  document
    .querySelectorAll(
      '.conversation-item'
    )
    .forEach(item => {

      item.classList.toggle(
        'active',
        item.dataset.id ===
          conversation.id
      );

    });


  await loadMessages(
    conversation.id
  );

  await loadLeadContext(
    conversation
  );

  await loadPendingApproval();


  if(focus)
    $('input').focus();

}



/* --------------------------------------------------
   MESSAGES
-------------------------------------------------- */

async function loadMessages(
  conversationId
){

  const {
    data,
    error
  } =
    await db
      .from('instagram_messages')
      .select('*')
      .eq(
        'client_id',
        state.clientId
      )
      .eq(
        'conversation_id',
        conversationId
      )
      .order(
        'created_at',
        {ascending:true}
      )
      .limit(300);

  if(error)
    throw error;

  state.messages =
    data || [];

  renderMessages();

}


function renderMessages(){

  const html =
    state.messages.map(
      message => `

        <div class="message-row ${
          message.direction === 'inbound'
            ? 'inbound'
            : 'outbound'
        }">

          <div class="bubble">

            ${esc(
              message.text_body ||
              `[${message.message_type || 'message'}]`
            )}

            <span class="bubble-meta">

              ${time(
                message.created_at ||
                message.provider_timestamp
              )}

              ${
                message.status
                  ? ` · ${esc(message.status)}`
                  : ''
              }

            </span>

          </div>

        </div>

      `
    ).join('');


  $('messages').innerHTML =
    html ||

    '<div class="loading-state">No messages in this conversation.</div>';


  requestAnimationFrame(() => {

    $('messages').scrollTop =
      $('messages').scrollHeight;

  });

}



/* --------------------------------------------------
   LEAD
-------------------------------------------------- */

async function loadLeadContext(
  conversation
){

  let lead=null;


  if(conversation.lead_id){

    const {
      data
    } =
      await db
        .from('leads')
        .select('*')
        .eq(
          'id',
          conversation.lead_id
        )
        .eq(
          'client_id',
          state.clientId
        )
        .maybeSingle();

    lead=data;

  }


  if(!lead){

    const {
      data
    } =
      await db
        .from('leads')
        .select('*')
        .eq(
          'client_id',
          state.clientId
        )
        .eq(
          'instagram_user_id',
          conversation.instagram_user_id
        )
        .order(
          'updated_at',
          {ascending:false}
        )
        .limit(1)
        .maybeSingle();

    lead=data;

  }


  state.lead =
    lead;


  $('leadStatus').textContent =
    lead ? 'Lead' : 'New';

  $('interest').textContent =
    lead?.interest ||
    '—';

  $('budget').textContent =
    lead?.budget
      ? `${lead.budget} ${
          lead.budget_currency ||
          'INR'
        }`
      : '—';

  $('product').textContent =
    lead?.product_service ||
    '—';

  $('source').textContent =
    lead?.source ||
    'Instagram';


  await loadTimeline(
    lead?.id
  );

}



/* --------------------------------------------------
   TIMELINE
-------------------------------------------------- */

async function loadTimeline(
  leadId
){

  if(!leadId){

    $('timeline').innerHTML =
      '<span>No lead timeline yet.</span>';

    return;

  }


  const {
    data,
    error
  } =
    await db
      .from('lead_timeline')
      .select(
        'event_type,title,description,created_at'
      )
      .eq(
        'client_id',
        state.clientId
      )
      .eq(
        'lead_id',
        leadId
      )
      .order(
        'created_at',
        {ascending:false}
      )
      .limit(8);

  if(error){

    console.error(error);

    return;

  }


  $('timeline').innerHTML =
    (data || []).map(
      item => `

        <div class="timeline-item">

          <strong>
            ${esc(
              item.title ||
              item.event_type ||
              'Event'
            )}
          </strong>

          <small>
            ${esc(
              item.description || ''
            )}
            ·
            ${time(
              item.created_at
            )}
          </small>

        </div>

      `
    ).join('') ||

    '<span>No events yet.</span>';

}



/* --------------------------------------------------
   MODE
-------------------------------------------------- */

function setMode(mode){

  state.mode =
    mode;

  localStorage.setItem(
    'glime_instagram_mode',
    mode
  );


  document
    .querySelectorAll(
      '.mode'
    )
    .forEach(button => {

      button.classList.toggle(
        'active',
        button.dataset.mode ===
          mode
      );

    });


  $('sendHint').textContent =
    mode === 'auto'
      ? 'AI can send'
      : mode === 'approval'
        ? 'Approval required'
        : 'Manual send';

}



/* --------------------------------------------------
   SEND MESSAGE
-------------------------------------------------- */

async function sendMessage(){

  if(!state.selected){

    toast(
      'Select an Instagram conversation first.',
      true
    );

    return;

  }


  const message =
    $('input')
      .value
      .trim();


  if(!message)
    return;


  if(message.length > 2000){

    toast(
      'Instagram message is too long.',
      true
    );

    return;

  }


  $('send').disabled=true;


  try{

    const result =
      await fn(
        'instagram-action-request',
        {
          conversation_id:
            state.selected.id,

          message,

          mode:
            state.mode
        }
      );


    if(!result.ok)
      throw new Error(
        result.message ||
        result.error ||
        'Instagram action failed.'
      );


    $('input').value='';


    if(
      state.mode === 'approval'
    ){

      toast(
        'Reply is waiting for approval.'
      );

    }else{

      if(result.job_id){

        const executed =
          await fn(
            'business-action-executor',
            {
              job_id:
                result.job_id
            }
          );

        if(executed?.ok === false){

          throw new Error(
            executed.message ||
            executed.error ||
            'Instagram message failed.'
          );

        }

      }

      toast(
        'Instagram message sent.'
      );

    }


    await loadMessages(
      state.selected.id
    );

    await loadConversations();

    await loadPendingApproval();


  }catch(error){

    console.error(
      'Instagram send:',
      error
    );

    toast(
      error.message ||
      'Instagram message failed.',
      true
    );

  }finally{

    $('send').disabled=false;

  }

}



/* --------------------------------------------------
   APPROVAL
-------------------------------------------------- */

async function loadPendingApproval(){

  $('approvalBox')
    .classList
    .add('hidden');


  if(!state.selected)
    return;


  const {
    data,
    error
  } =
    await db
      .from('client_action_requests')
      .select(
        'id,status,action_payload,created_at'
      )
      .eq(
        'client_id',
        state.clientId
      )
      .eq(
        'target_module_slug',
        MODULE
      )
      .eq(
        'target_action',
        'message'
      )
      .eq(
        'target_id',
        state.selected.lead_id ||
        state.lead?.id ||
        '00000000-0000-0000-0000-000000000000'
      )
      .eq(
        'status',
        'proposed'
      )
      .order(
        'created_at',
        {ascending:false}
      )
      .limit(1)
      .maybeSingle();


  if(error){

    console.error(
      'approval lookup',
      error
    );

    return;

  }


  /*
    Some older action rows target the
    conversation directly. If lead lookup
    above did not find anything, perform
    a conversation target lookup.
  */

  let approval=data;


  if(!approval){

    const fallback =
      await db
        .from('client_action_requests')
        .select(
          'id,status,action_payload,created_at'
        )
        .eq(
          'client_id',
          state.clientId
        )
        .eq(
          'target_module_slug',
          MODULE
        )
        .eq(
          'target_action',
          'message'
        )
        .eq(
          'target_id',
          state.selected.id
        )
        .eq(
          'status',
          'proposed'
        )
        .order(
          'created_at',
          {ascending:false}
        )
        .limit(1)
        .maybeSingle();

    approval =
      fallback.data;

  }


  if(!approval)
    return;


  $('approvalText').textContent =
    approval.action_payload?.message ||
    'Instagram reply pending approval.';


  $('approvalBox')
    .classList
    .remove('hidden');


  $('approveBtn').onclick =
    () =>
      approvePending(
        approval.id
      );


  $('rejectBtn').onclick =
    () =>
      rejectPending(
        approval.id
      );

}



/* --------------------------------------------------
   APPROVE
-------------------------------------------------- */

async function approvePending(
  requestId
){

  try{

    $('approveBtn').disabled=true;

    const {
      data,
      error
    } =
      await db.rpc(
        'approve_client_business_action',
        {
          p_action_request_id:
            requestId
        }
      );

    if(error)
      throw error;


    if(data?.job_id){

      const result =
        await fn(
          'business-action-executor',
          {
            job_id:
              data.job_id
          }
        );

      if(result?.ok === false){

        throw new Error(
          result.message ||
          result.error ||
          'Instagram provider failed.'
        );

      }

    }


    toast(
      'Approved and sent.'
    );


    await loadPendingApproval();

    await loadMessages(
      state.selected.id
    );

    await loadConversations();


  }catch(error){

    toast(
      error.message,
      true
    );

  }finally{

    $('approveBtn').disabled=false;

  }

}



/* --------------------------------------------------
   REJECT
-------------------------------------------------- */

async function rejectPending(
  requestId
){

  try{

    const {
      error
    } =
      await db.rpc(
        'reject_client_business_action',
        {
          p_action_request_id:
            requestId
        }
      );

    if(error)
      throw error;

    toast(
      'Instagram reply rejected.'
    );

    await loadPendingApproval();

  }catch(error){

    toast(
      error.message,
      true
    );

  }

}



/* --------------------------------------------------
   AI SUGGESTION
-------------------------------------------------- */

async function suggestReply(){

  if(!state.selected){

    toast(
      'Select a conversation first.',
      true
    );

    return;

  }


  $('suggest')
    .disabled=true;


  try{

    const recent =
      state.messages
        .slice(-12)
        .map(
          message =>
            `${
              message.direction ===
              'inbound'
                ? 'Customer'
                : 'Business'
            }: ${
              message.text_body || ''
            }`
        )
        .join('\n');


    const catalog =
      state.services
        .slice(0,20)
        .map(service => {

          const name =
            service.name ||
            service.title ||
            '';

          const description =
            service.short_desc ||
            service.description ||
            '';

          const parts=[
            `${name}: ${description}`
          ];


          if(
            service.price != null &&
            service.price !== ''
          ){

            parts.push(
              `Price: ${
                service.price
              } ${
                service.currency || ''
              }`.trim()
            );

          }


          if(service.offer_type)
            parts.push(
              `Type: ${service.offer_type}`
            );


          if(
            service.sales_talking_points
          )
            parts.push(
              `Talking points: ${
                service.sales_talking_points
              }`
            );


          if(service.allowed_claims)
            parts.push(
              `Allowed claims: ${
                service.allowed_claims
              }`
            );


          if(service.restrictions)
            parts.push(
              `Restrictions: ${
                service.restrictions
              }`
            );


          return parts.join(' | ');

        })
        .join('\n');


    const body={

      action:'chat',

      sessionToken:
        state.aiSession,

      message:
`You are the Instagram sales specialist for a business.

Write a natural customer-facing Instagram DM reply.

Conversation:
${recent}

Business catalog:
${catalog}

Rules:
- Reply only with the message.
- Do not invent prices.
- Do not invent discounts.
- Do not invent policies.
- Keep it concise.
- Match the customer's language.
- Sound natural, not robotic.`

    };


    const response =
      await fetch(
        `${SUPABASE_URL}/functions/v1/glime-ai`,
        {
          method:'POST',

          headers:{
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(body)
        }
      );


    const data =
      await response.json();


    if(
      !response.ok
    ){

      throw new Error(
        data.error ||
        'AI unavailable.'
      );

    }


    if(data.sessionToken){

      state.aiSession =
        data.sessionToken;

      sessionStorage.setItem(
        'glime_instagram_ai_session',
        data.sessionToken
      );

    }


    $('suggestionText').textContent =
      data.reply ||
      data.message ||
      'No suggestion returned.';


    $('aiSuggestion')
      .classList
      .remove('hidden');


  }catch(error){

    toast(
      error.message,
      true
    );

  }finally{

    $('suggest')
      .disabled=false;

  }

}



/* --------------------------------------------------
   ADD LEAD
-------------------------------------------------- */

async function addToLeads(){

  if(!state.selected){

    toast(
      'Select an Instagram conversation first.',
      true
    );

    return;

  }


  try{

    let lead =
      state.lead;


    if(!lead){

      const {
        data,
        error
      } =
        await db
          .from('leads')
          .insert({

            client_id:
              state.clientId,

            name:
              state.selected.username ||
              `Instagram ${
                state.selected.instagram_user_id
              }`,

            source:
              'instagram',

            source_ref:
              state.selected.instagram_user_id,

            instagram_user_id:
              state.selected.instagram_user_id,

            instagram_thread_id:
              state.selected.instagram_thread_id,

            status:
              'new',

            priority:
              'normal'

          })
          .select('*')
          .single();


      if(error)
        throw error;


      lead=data;


      await db
        .from('instagram_conversations')
        .update({
          lead_id:
            lead.id,
          updated_at:
            new Date().toISOString()
        })
        .eq(
          'id',
          state.selected.id
        )
        .eq(
          'client_id',
          state.clientId
        );

    }


    state.lead =
      lead;


    state.selected.lead_id =
      lead.id;


    toast(
      'Instagram customer added to Leads.'
    );


    await loadLeadContext(
      state.selected
    );


  }catch(error){

    toast(
      error.message,
      true
    );

  }

}



/* --------------------------------------------------
   CLOSE CONVERSATION
-------------------------------------------------- */

async function closeConversation(){

  if(!state.selected)
    return;


  try{

    const {
      error
    } =
      await db
        .from('instagram_conversations')
        .update({
          status:'closed',
          updated_at:
            new Date().toISOString()
        })
        .eq(
          'id',
          state.selected.id
        )
        .eq(
          'client_id',
          state.clientId
        );

    if(error)
      throw error;


    toast(
      'Conversation closed.'
    );


    await loadConversations();

  }catch(error){

    toast(
      error.message,
      true
    );

  }

}



/* --------------------------------------------------
   EVENTS
-------------------------------------------------- */

$('logout').onclick =
  async () => {

    await db.auth.signOut();

    location.href =
      'login.html';

  };


$('connect').onclick =
  connectInstagram;


$('refresh').onclick =
  async () => {

    try{

      await loadConnection();

      await loadConversations();

      toast(
        'Instagram inbox refreshed.'
      );

    }catch(error){

      toast(
        error.message,
        true
      );

    }

  };


$('search').oninput =
  renderConversations;


$('send').onclick =
  sendMessage;


$('suggest').onclick =
  suggestReply;


$('refreshSuggestion').onclick =
  suggestReply;


$('useSuggestion').onclick =
  () => {

    $('input').value =
      $('suggestionText')
        .textContent
        .trim();

    $('input').focus();

  };


$('addLead').onclick =
  addToLeads;


$('closeConversation').onclick =
  closeConversation;


document
  .querySelectorAll(
    '.mode'
  )
  .forEach(button => {

    button.onclick =
      () =>
        setMode(
          button.dataset.mode
        );

  });


document
  .querySelectorAll(
    '.filters button'
  )
  .forEach(button => {

    button.onclick =
      async () => {

        document
          .querySelectorAll(
            '.filters button'
          )
          .forEach(
            item =>
              item.classList.remove(
                'active'
              )
          );

        button.classList.add(
          'active'
        );

        state.filter =
          button.dataset.filter;

        await loadConversations();

      };

  });


$('input').addEventListener(
  'keydown',
  event => {

    if(
      event.key === 'Enter' &&
      (event.ctrlKey || event.metaKey)
    ){

      event.preventDefault();

      sendMessage();

    }

  }
);



/* --------------------------------------------------
   BOOT
-------------------------------------------------- */

async function boot(){

  try{

    await session();

    await loadConnection();

    await loadServices();

    setMode(
      state.mode
    );

    await loadConversations();

    $('boot').remove();

  }catch(error){

    console.error(
      'Instagram Sales boot:',
      error
    );

    $('boot').innerHTML = `

      <span style="
        color:#ff6472;
        max-width:400px;
        text-align:center;
      ">
        ${esc(
          error.message ||
          'Unable to load Instagram Sales Specialist.'
        )}
      </span>

    `;

  }

}


boot();

})();
