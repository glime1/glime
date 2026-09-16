/*
  GLIME — Voice AI Business Setup Addon
  ---------------------------------------------------------
  Loads client-specific Voice AI configuration through secure
  Supabase RPCs. Does NOT replace or modify voice-ai.js.
*/

(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const css = `
    .glime-va-setup-btn{
      margin-top:14px;
      width:100%;
      padding:12px 16px;
      border:1px solid rgba(80,245,168,.35);
      border-radius:12px;
      background:rgba(80,245,168,.08);
      color:#50f5a8;
      font-weight:700;
      cursor:pointer;
      font-size:14px
    }

    .glime-va-setup-btn:hover{
      background:rgba(80,245,168,.14)
    }

    .glime-va-overlay{
      position:fixed;
      inset:0;
      z-index:99999;
      background:rgba(3,8,12,.86);
      backdrop-filter:blur(10px);
      display:none;
      align-items:flex-start;
      justify-content:center;
      padding:24px;
      overflow:auto
    }

    .glime-va-overlay.open{
      display:flex
    }

    .glime-va-modal{
      width:min(980px,100%);
      background:#081119;
      color:#f4fbfd;
      border:1px solid rgba(82,232,255,.2);
      border-radius:20px;
      box-shadow:0 24px 80px rgba(0,0,0,.5);
      padding:22px
    }

    .glime-va-head{
      display:flex;
      justify-content:space-between;
      gap:15px;
      align-items:flex-start
    }

    .glime-va-head h2{
      margin:0;
      color:#50f5a8;
      font-size:22px
    }

    .glime-va-head p{
      margin:7px 0 0;
      color:#9cabb9;
      font-size:13px;
      line-height:1.5
    }

    .glime-va-close{
      border:0;
      background:transparent;
      color:#9cabb9;
      font-size:24px;
      cursor:pointer
    }

    .glime-va-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
      margin-top:18px
    }

    .glime-va-field{
      display:flex;
      flex-direction:column;
      gap:7px
    }

    .glime-va-field.full{
      grid-column:1/-1
    }

    .glime-va-field label{
      font-size:12px;
      font-weight:700;
      color:#c9d7df
    }

    .glime-va-field input,
    .glime-va-field textarea,
    .glime-va-field select{
      width:100%;
      box-sizing:border-box;
      background:#050b10;
      color:#f4fbfd;
      border:1px solid #243642;
      border-radius:10px;
      padding:11px 12px;
      outline:none;
      font:inherit
    }

    .glime-va-field textarea{
      min-height:90px;
      resize:vertical;
      line-height:1.45
    }

    .glime-va-field input:focus,
    .glime-va-field textarea:focus,
    .glime-va-field select:focus{
      border-color:#52e8ff
    }

    .glime-va-section{
      grid-column:1/-1;
      margin-top:8px;
      padding-top:17px;
      border-top:1px solid #1b2b35
    }

    .glime-va-section h3{
      margin:0 0 5px;
      color:#52e8ff;
      font-size:15px
    }

    .glime-va-section p{
      margin:0;
      color:#81929e;
      font-size:12px
    }

    .glime-va-switches{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:12px;
      margin-top:12px
    }

    .glime-va-switch{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:13px;
      border:1px solid #243642;
      border-radius:12px;
      background:#050b10
    }

    .glime-va-switch span{
      font-size:13px
    }

    .glime-va-switch button{
      border:0;
      border-radius:999px;
      padding:7px 13px;
      font-weight:800;
      cursor:pointer
    }

    .glime-va-switch button.on{
      background:#50f5a8;
      color:#04100a
    }

    .glime-va-switch button.off{
      background:#26343d;
      color:#b8c4ca
    }

    .glime-va-actions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:20px
    }

    .glime-va-actions button{
      border:0;
      border-radius:10px;
      padding:11px 17px;
      font-weight:800;
      cursor:pointer
    }

    .glime-va-cancel{
      background:#17242c;
      color:#d7e2e7
    }

    .glime-va-save{
      background:#50f5a8;
      color:#04100a
    }

    .glime-va-status{
      margin-top:12px;
      min-height:18px;
      font-size:12px;
      color:#9cabb9
    }

    .glime-va-status.ok{
      color:#50f5a8
    }

    .glime-va-status.err{
      color:#ff8d8d
    }

    @media(max-width:700px){
      .glime-va-overlay{
        padding:10px
      }

      .glime-va-modal{
        padding:16px;
        border-radius:15px
      }

      .glime-va-grid,
      .glime-va-switches{
        grid-template-columns:1fr
      }

      .glime-va-field.full{
        grid-column:auto
      }
    }
  `;

  const esc = (value) => String(value ?? '');

  function addStyles(){
    if(document.getElementById('glime-va-setup-style')){
      return;
    }

    const style = document.createElement('style');

    style.id = 'glime-va-setup-style';

    style.textContent = css;

    document.head.appendChild(style);
  }

  function createUI(){

    if(document.getElementById('glimeVoiceSetupButton')){
      return;
    }

    const card =
      document.querySelector('.voice-card');

    if(!card){
      return;
    }

    addStyles();

    const button =
      document.createElement('button');

    button.id =
      'glimeVoiceSetupButton';

    button.className =
      'glime-va-setup-btn';

    button.type =
      'button';

    button.textContent =
      '⚙️ Configure Voice AI';

    button.addEventListener(
      'click',
      openModal
    );

    card.appendChild(button);

    const overlay =
      document.createElement('div');

    overlay.id =
      'glimeVoiceSetupOverlay';

    overlay.className =
      'glime-va-overlay';

    overlay.innerHTML = `

      <div
        class="glime-va-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="glimeVaTitle"
      >

        <div class="glime-va-head">

          <div>

            <h2 id="glimeVaTitle">
              🎙️ Voice AI Business Setup
            </h2>

            <p>
              Yahan client apne business ki
              information aur AI rules khud set
              kar sakta hai. Ye settings sirf isi
              client ke Voice AI ke liye hain.
            </p>

          </div>

          <button
            id="glimeVaClose"
            class="glime-va-close"
            type="button"
          >
            ×
          </button>

        </div>


        <div class="glime-va-grid">


          <div class="glime-va-section">

            <h3>
              1. Business Information
            </h3>

            <p>
              AI ke paas business ka verified
              source of truth rahega.
            </p>

          </div>


          <div class="glime-va-field">

            <label>
              Business Name
            </label>

            <input
              id="gvaBusinessName"
              placeholder="Example: ABC Salon"
            >

          </div>


          <div class="glime-va-field">

            <label>
              Business Type
            </label>

            <input
              id="gvaBusinessType"
              placeholder="Salon, Boutique, Clinic, Agency..."
            >

          </div>


          <div class="glime-va-field full">

            <label>
              Business Description
            </label>

            <textarea
              id="gvaDescription"
              placeholder="Business kya karta hai, kis type ke customers ko serve karta hai..."
            ></textarea>

          </div>


          <div class="glime-va-field">

            <label>
              Location
            </label>

            <input
              id="gvaLocation"
              placeholder="Jaipur, Rajasthan"
            >

          </div>


          <div class="glime-va-field">

            <label>
              Working Hours
            </label>

            <textarea
              id="gvaHours"
              placeholder="Mon: 10:00-19:00
Tue: 10:00-19:00
Sunday: Closed"
            ></textarea>

          </div>


          <div class="glime-va-section">

            <h3>
              2. Services, Pricing & FAQs
            </h3>

            <p>
              Har line ko AI customer ko
              information ke roop mein use karega.
              Unknown price ko guess nahi karega.
            </p>

          </div>


          <div class="glime-va-field full">

            <label>
              Services & Prices — one item per line
            </label>

            <textarea
              id="gvaServices"
              placeholder="Haircut — ₹300
Hair Spa — ₹800
Bridal Package — ₹5000"
            ></textarea>

          </div>


          <div class="glime-va-field full">

            <label>
              FAQs — Question | Answer,
              one per line
            </label>

            <textarea
              id="gvaFaqs"
              placeholder="Appointment kaise book karein? | WhatsApp ya phone par booking karein.
Walk-in available hai? | Haan, subject to availability."
            ></textarea>

          </div>


          <div class="glime-va-field">

            <label>
              Policies
            </label>

            <textarea
              id="gvaPolicies"
              placeholder="Cancellation: 24 hours notice
Refund: ...
Payment: ..."
            ></textarea>

          </div>


          <div class="glime-va-field">

            <label>
              Lead Questions / Fields
            </label>

            <textarea
              id="gvaLeadFields"
              placeholder="Name
Phone
Service interested in
Preferred date"
            ></textarea>

          </div>


          <div class="glime-va-section">

            <h3>
              3. AI Behaviour
            </h3>

            <p>
              Client decide karega AI ka goal,
              tone, greeting aur detailed rules.
            </p>

          </div>


          <div class="glime-va-field">

            <label>
              AI Goal
            </label>

            <input
              id="gvaGoal"
              placeholder="Answer questions, qualify leads and help with bookings"
            >

          </div>


          <div class="glime-va-field">

            <label>
              Language
            </label>

            <select id="gvaLanguage">

              <option value="hinglish">
                Hinglish
              </option>

              <option value="hindi">
                Hindi
              </option>

              <option value="english">
                English
              </option>

            </select>

          </div>


          <div class="glime-va-field">

            <label>
              Tone
            </label>

            <select id="gvaTone">

              <option value="friendly">
                Friendly
              </option>

              <option value="professional">
                Professional
              </option>

              <option value="premium">
                Premium
              </option>

              <option value="concise">
                Concise
              </option>

            </select>

          </div>


          <div class="glime-va-field">

            <label>
              Greeting
            </label>

            <input
              id="gvaGreeting"
              placeholder="Namaste! Main aapki kaise madad kar sakta hoon?"
            >

          </div>


          <div class="glime-va-field full">

            <label>
              What AI SHOULD / MUST NOT DO
            </label>

            <textarea
              id="gvaInstructions"
              placeholder="SHOULD:
- Friendly aur concise raho.
- Sirf verified business information use karo.
- Interested customer ka naam aur requirement poochho.

MUST NOT:
- Price guess mat karo.
- Fake booking/availability promise mat karo.
- Business ke baare mein information invent mat karo."
            ></textarea>

          </div>


          <div class="glime-va-field full">

            <label>
              Human Handoff Rules
            </label>

            <textarea
              id="gvaHandoff"
              placeholder="Agar customer human se baat karna chahe, complaint ho, ya AI ke paas answer na ho to human handoff request note karo."
            ></textarea>

          </div>


          <div class="glime-va-section">

            <h3>
              4. Call Controls
            </h3>

            <p>
              Incoming aur outbound controls
              independent hain. Outbound call
              automatic nahi hogi.
            </p>

          </div>


          <div class="glime-va-switches">

            <div class="glime-va-switch">

              <span>
                Incoming Calls
              </span>

              <button
                id="gvaIncoming"
                type="button"
                class="off"
              >
                OFF
              </button>

            </div>


            <div class="glime-va-switch">

              <span>
                Outbound Calls
              </span>

              <button
                id="gvaOutbound"
                type="button"
                class="off"
              >
                OFF
              </button>

            </div>

          </div>


          <div class="glime-va-actions full">

            <button
              id="glimeVaCancel"
              class="glime-va-cancel"
              type="button"
            >
              Cancel
            </button>

            <button
              id="glimeVaSave"
              class="glime-va-save"
              type="button"
            >
              Save Voice AI Settings
            </button>

          </div>


          <div
            id="glimeVaStatus"
            class="glime-va-status full"
          ></div>


        </div>

      </div>
    `;

    document.body.appendChild(overlay);


    document.getElementById(
      'glimeVaClose'
    ).onclick = closeModal;


    document.getElementById(
      'glimeVaCancel'
    ).onclick = closeModal;


    document.getElementById(
      'glimeVaSave'
    ).onclick = saveConfig;


    document.getElementById(
      'gvaIncoming'
    ).onclick = () =>
      toggle('gvaIncoming');


    document.getElementById(
      'gvaOutbound'
    ).onclick = () =>
      toggle('gvaOutbound');


    overlay.addEventListener(
      'click',
      (e) => {

        if(e.target === overlay){

          closeModal();

        }

      }
    );

  }


  function setValue(id,value){

    const el =
      document.getElementById(id);

    if(el){

      el.value =
        esc(value);

    }

  }


  function getValue(id){

    return (
      document
        .getElementById(id)
        ?.value
        ?.trim()
    ) || '';

  }


  function linesToArray(text){

    return text
      .split(/\r?\n/)
      .map(v => v.trim())
      .filter(Boolean);

  }


  function servicesFromJson(value){

    if(!Array.isArray(value)){
      return '';
    }

    return value
      .map(v => {

        if(typeof v === 'string'){
          return v;
        }

        const name =
          v.name ||
          v.service ||
          '';

        const price =
          v.price ?? '';

        return price !== ''
          ? `${name} — ${price}`
          : name;

      })
      .filter(Boolean)
      .join('\n');

  }


  function faqsFromJson(value){

    if(!Array.isArray(value)){
      return '';
    }

    return value
      .map(v => {

        if(typeof v === 'string'){
          return v;
        }

        return `${v.question || v.q || ''} | ${v.answer || v.a || ''}`;

      })
      .filter(Boolean)
      .join('\n');

  }


  function jsonToLines(value){

    if(!Array.isArray(value)){
      return '';
    }

    return value
      .map(v => {

        if(typeof v === 'string'){
          return v;
        }

        return (
          v.name ||
          v.label ||
          v.field ||
          ''
        );

      })
      .filter(Boolean)
      .join('\n');

  }


  function linesToServiceObjects(text){

    return linesToArray(text)
      .map(line => {

        const parts =
          line.split(/\s*[—|-]\s*/);

        return {

          name:
            parts[0]?.trim() ||
            line,

          price:
            parts
              .slice(1)
              .join(' — ')
              .trim()

        };

      });

  }


  function linesToFaqObjects(text){

    return linesToArray(text)
      .map(line => {

        const parts =
          line.split('|');

        return {

          question:
            parts[0]?.trim() ||
            '',

          answer:
            parts
              .slice(1)
              .join('|')
              .trim()

        };

      });

  }


  function toggle(id,force){

    const button =
      document.getElementById(id);

    if(!button){
      return false;
    }

    const next =
      typeof force === 'boolean'
        ? force
        : !button.classList.contains('on');

    button.classList.toggle(
      'on',
      next
    );

    button.classList.toggle(
      'off',
      !next
    );

    button.textContent =
      next
        ? 'ON'
        : 'OFF';

    return next;

  }


  async function loadConfig(){

    const status =
      document.getElementById(
        'glimeVaStatus'
      );

    status.textContent =
      'Loading your Voice AI settings…';

    status.className =
      'glime-va-status';


    const {
      data,
      error
    } =
      await db.rpc(
        'client_get_voice_ai_config'
      );


    if(error){
      throw error;
    }


    const agent =
      data?.agent ||
      {};

    const profile =
      data?.business_profile ||
      {};


    setValue(
      'gvaBusinessName',
      profile.business_name
    );


    setValue(
      'gvaBusinessType',
      profile.business_type
    );


    setValue(
      'gvaDescription',
      profile.description
    );


    setValue(
      'gvaLocation',
      profile.location
    );


    const hours =
      profile.working_hours &&
      typeof profile.working_hours === 'object'

        ? Object
            .entries(
              profile.working_hours
            )
            .map(
              ([k,v]) =>
                `${k}: ${v}`
            )
            .join('\n')

        : '';


    setValue(
      'gvaHours',
      hours
    );


    setValue(
      'gvaServices',
      servicesFromJson(
        profile.services
      )
    );


    setValue(
      'gvaFaqs',
      faqsFromJson(
        profile.faqs
      )
    );


    const policies =
      profile.policies &&
      typeof profile.policies === 'object'

        ? Object
            .entries(
              profile.policies
            )
            .map(
              ([k,v]) =>
                `${k}: ${v}`
            )
            .join('\n')

        : '';


    setValue(
      'gvaPolicies',
      policies
    );


    setValue(
      'gvaLeadFields',
      jsonToLines(
        profile.lead_fields
      )
    );


    setValue(
      'gvaGoal',
      agent.goal
    );


    setValue(
      'gvaLanguage',
      agent.language ||
      'hinglish'
    );


    setValue(
      'gvaTone',
      agent.tone ||
      'friendly'
    );


    setValue(
      'gvaGreeting',
      agent.greeting
    );


    setValue(
      'gvaInstructions',
      agent.instructions
    );


    setValue(
      'gvaHandoff',

      profile.handoff_rules &&
      typeof profile.handoff_rules === 'object'

        ? (
            profile
              .handoff_rules
              .instructions ||
            ''
          )

        : ''
    );


    toggle(
      'gvaIncoming',
      agent.incoming_enabled === true
    );


    toggle(
      'gvaOutbound',
      agent.outbound_enabled === true
    );


    status.textContent =
      'Settings loaded.';

    status.className =
      'glime-va-status ok';

  }


  function textToObject(text){

    const out = {};

    linesToArray(text)
      .forEach(line => {

        const index =
          line.indexOf(':');

        if(index > 0){

          out[
            line
              .slice(0,index)
              .trim()
          ] =
            line
              .slice(index + 1)
              .trim();

        }

      });

    return out;

  }


  async function saveConfig(){

    const status =
      document.getElementById(
        'glimeVaStatus'
      );

    const save =
      document.getElementById(
        'glimeVaSave'
      );


    save.disabled =
      true;


    status.textContent =
      'Saving Voice AI settings…';

    status.className =
      'glime-va-status';


    const businessProfile = {

      business_name:
        getValue(
          'gvaBusinessName'
        ),

      business_type:
        getValue(
          'gvaBusinessType'
        ),

      description:
        getValue(
          'gvaDescription'
        ),

      location:
        getValue(
          'gvaLocation'
        ),

      working_hours:
        textToObject(
          getValue(
            'gvaHours'
          )
        ),

      services:
        linesToServiceObjects(
          getValue(
            'gvaServices'
          )
        ),

      faqs:
        linesToFaqObjects(
          getValue(
            'gvaFaqs'
          )
        ),

      policies:
        textToObject(
          getValue(
            'gvaPolicies'
          )
        ),

      lead_fields:
        linesToArray(
          getValue(
            'gvaLeadFields'
          )
        )
        .map(
          name => ({
            name
          })
        ),

      handoff_rules:{
        instructions:
          getValue(
            'gvaHandoff'
          )
      }

    };


    try{

      const {
        data,
        error
      } =
        await db.rpc(
          'client_save_voice_ai_config',
          {

            p_goal:
              getValue(
                'gvaGoal'
              ),

            p_language:
              getValue(
                'gvaLanguage'
              ),

            p_tone:
              getValue(
                'gvaTone'
              ),

            p_greeting:
              getValue(
                'gvaGreeting'
              ),

            p_instructions:
              getValue(
                'gvaInstructions'
              ),

            p_incoming_enabled:
              document
                .getElementById(
                  'gvaIncoming'
                )
                .classList
                .contains(
                  'on'
                ),

            p_outbound_enabled:
              document
                .getElementById(
                  'gvaOutbound'
                )
                .classList
                .contains(
                  'on'
                ),

            p_business_profile:
              businessProfile

          }
        );


      if(error){
        throw error;
      }


      if(!data?.success){

        throw new Error(
          'Settings save nahi hui.'
        );

      }


      status.textContent =
        '✓ Voice AI settings saved successfully.';

      status.className =
        'glime-va-status ok';


    }catch(error){

      console.error(
        'GLIME Voice AI setup save error:',
        error
      );


      status.textContent =
        error?.message ||
        'Settings save failed.';

      status.className =
        'glime-va-status err';


    }finally{

      save.disabled =
        false;

    }

  }


  function openModal(){

    const overlay =
      document.getElementById(
        'glimeVoiceSetupOverlay'
      );

    if(!overlay){
      return;
    }


    overlay.classList.add(
      'open'
    );


    loadConfig()
      .catch(error => {

        console.error(
          error
        );

        const status =
          document.getElementById(
            'glimeVaStatus'
          );

        status.textContent =
          error?.message ||
          'Voice AI settings load failed.';

        status.className =
          'glime-va-status err';

      });

  }


  function closeModal(){

    document
      .getElementById(
        'glimeVoiceSetupOverlay'
      )
      ?.classList
      .remove(
        'open'
      );

  }


  function start(){

    createUI();

    if(
      !document.getElementById(
        'glimeVoiceSetupButton'
      )
    ){

      setTimeout(
        createUI,
        700
      );

    }

  }


  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      start,
      {
        once:true
      }
    );

  }else{

    start();

  }

})();
