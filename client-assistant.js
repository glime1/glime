(() => {
'use strict';

const SUPABASE_URL='https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY='sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const FUNCTION_URL=`${SUPABASE_URL}/functions/v1/client-assistant`;

const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const $=id=>document.getElementById(id);

const messages=$('messages');
const form=$('chatForm');
const input=$('messageInput');
const send=$('sendBtn');
const status=$('status');

let history=[];


/* =====================================================
   NORMAL MESSAGE
===================================================== */

function addMessage(role,text){

  const row=document.createElement('div');

  row.className=`message ${role}`;

  const label=document.createElement('div');

  label.className='message-label';

  label.textContent=
    role==='user'
      ?'YOU'
      :'GLIME AI';

  const bubble=document.createElement('div');

  bubble.className='bubble';

  bubble.textContent=text;

  row.append(label,bubble);

  messages.appendChild(row);

  messages.scrollTop=messages.scrollHeight;

  history.push({
    role,
    content:text
  });

  if(history.length>12){

    history=history.slice(-12);

  }

}


/* =====================================================
   MONEY FORMAT
===================================================== */

function money(value){

  return `₹${Number(value||0).toLocaleString(
    'en-IN',
    {
      maximumFractionDigits:2
    }
  )}`;

}


/* =====================================================
   BUSINESS REPORT
===================================================== */

function addReport(report){

  if(!report?.overview)return;


  const row=document.createElement('div');

  row.className='message assistant';


  const label=document.createElement('div');

  label.className='message-label';

  label.textContent='GLIME AI';


  const card=document.createElement('div');

  card.className='report-card';


  /* TITLE */

  const title=document.createElement('div');

  title.className='report-title';

  title.innerHTML=
    '<span class="report-spark">✦</span>' +
    '<strong>Business Quick Report</strong>';

  card.appendChild(title);


  /* METRICS */

  const grid=document.createElement('div');

  grid.className='report-grid';


  const metrics=[

    [
      '👥',
      report.overview.customers ?? 0,
      'Customers',
      'Total'
    ],

    [
      '🛒',
      report.overview.orders ?? 0,
      'Orders',
      'Total'
    ],

    [
      '₹',
      money(report.overview.revenue),
      'Revenue',
      'Paid sales'
    ],

    [
      '📈',
      report.overview.leads ?? 0,
      'Leads',
      'Total'
    ]

  ];


  metrics.forEach(item=>{

    const metric=document.createElement('div');

    metric.className='report-metric';


    metric.innerHTML=`

      <div class="report-icon">
        ${item[0]}
      </div>

      <div class="report-value">
        ${String(item[1])}
      </div>

      <div class="report-name">
        ${item[2]}
      </div>

      <div class="report-sub">
        ${item[3]}
      </div>

    `;

    grid.appendChild(metric);

  });


  card.appendChild(grid);


  /* INSIGHTS */

  if(
    Array.isArray(report.insights) &&
    report.insights.length
  ){

    const section=document.createElement('div');

    section.className='report-section';


    section.innerHTML=
      '<div class="report-section-title">💡 Insights</div>';


    const list=document.createElement('ul');


    report.insights
      .slice(0,5)
      .forEach(text=>{

        const li=document.createElement('li');

        li.textContent=text;

        list.appendChild(li);

      });


    section.appendChild(list);

    card.appendChild(section);

  }


  /* DATA NOTE */

  const note=document.createElement('div');

  note.className='report-note';

  note.textContent=
    report.data_note ||
    'यह report आपके authenticated business data से तैयार की गई है।';

  card.appendChild(note);


  /* ACTION BUTTONS */

  const actions=document.createElement('div');

  actions.className='report-actions';


  const actionItems=[

    [
      'Customers list',
      'मेरे customers की list दिखाओ'
    ],

    [
      'Recent orders',
      'मेरे recent orders दिखाओ'
    ],

    [
      'Top customers',
      'मेरे top customers कौन हैं?'
    ],

    [
      'Next step',
      'मेरे business के लिए अभी सबसे जरूरी next step क्या है?'
    ]

  ];


  actionItems.forEach(item=>{

    const button=document.createElement('button');

    button.type='button';

    button.textContent=item[0];


    button.onclick=()=>{

      input.value=item[1];

      updateCharacterCount();

      input.focus();

    };


    actions.appendChild(button);

  });


  card.appendChild(actions);


  row.append(label,card);

  messages.appendChild(row);

  messages.scrollTop=messages.scrollHeight;

}


/* =====================================================
   AUTH INITIALIZE
===================================================== */

async function initialize(){

  try{

    const{
      data,
      error
    }=await db.auth.getSession();


    if(error)throw error;


    if(!data?.session?.user){

      location.href='login.html';

      return;

    }


    const clientName=$('clientName');


    if(clientName){

      clientName.textContent=
        ` • ${data.session.user.email||''}`;

    }


  }catch(error){

    console.error(error);

    status.textContent=
      'Login session verify नहीं हो सकी।';

  }

}


/* =====================================================
   SEND MESSAGE
===================================================== */

form.addEventListener(
  'submit',
  async event=>{

    event.preventDefault();


    const text=input.value.trim();


    if(!text)return;


    addMessage(
      'user',
      text
    );


    input.value='';

    updateCharacterCount();


    send.disabled=true;


    status.textContent=
      'आपके business data को सुरक्षित रूप से check किया जा रहा है…';


    try{

      const{
        data,
        error
      }=await db.auth.getSession();


      if(error)throw error;


      if(!data?.session){

        throw Error(
          'Login required'
        );

      }


      const response=
        await fetch(
          FUNCTION_URL,
          {

            method:'POST',

            headers:{

              'Content-Type':
                'application/json',

              'Authorization':
                `Bearer ${data.session.access_token}`

            },

            body:
              JSON.stringify({

                message:text,

                history:history

              })

          }
        );


      const result=
        await response.json();


      if(!response.ok){

        throw Error(
          result?.error ||
          'Assistant unavailable'
        );

      }


      addMessage(
        'assistant',
        result?.answer ||
        'कोई उत्तर नहीं मिला।'
      );


      /* REPORT */

      if(result?.report){

        addReport(
          result.report
        );

      }


      status.textContent='';


    }catch(error){

      console.error(error);


      addMessage(
        'assistant',
        error?.message ||
        'अभी assistant उपलब्ध नहीं है।'
      );


      status.textContent='';


    }finally{

      send.disabled=false;

      input.focus();

    }

  }
);


/* =====================================================
   CLEAR CHAT
===================================================== */

$('clearBtn')?.addEventListener(
  'click',
  ()=>{

    history=[];

    messages.innerHTML='';


    addMessage(
      'assistant',
      'चैट साफ हो गई। अब अपना business सवाल पूछें।'
    );


    status.textContent='';

  }
);


/* =====================================================
   QUICK SUGGESTIONS
===================================================== */

document
  .querySelectorAll('[data-prompt]')
  .forEach(button=>{

    button.addEventListener(
      'click',
      ()=>{

        input.value=
          button.dataset.prompt||'';

        updateCharacterCount();

        input.focus();

      }
    );

  });


/* =====================================================
   CHARACTER COUNT
===================================================== */

function updateCharacterCount(){

  const counter=$('charCount');

  if(counter){

    counter.textContent=
      `${input.value.length} / 2000`;

  }

}


input.addEventListener(
  'input',
  updateCharacterCount
);


/* =====================================================
   ENTER SEND
===================================================== */

input.addEventListener(
  'keydown',
  event=>{

    if(
      event.key==='Enter' &&
      !event.shiftKey
    ){

      event.preventDefault();

      form.requestSubmit();

    }

  }
);


/* =====================================================
   START
===================================================== */

updateCharacterCount();

initialize();

})();
