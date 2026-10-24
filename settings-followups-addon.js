/* =========================================================
   GLIME SETTINGS — FOLLOW-UPS MODULE
   ---------------------------------------------------------
   Registers Settings > Follow-ups through window.GLIME_SETTINGS.
   Replaces the empty placeholder registered by settings.html.

   Data:
   - client_followup_settings (existing)  -> enabled, sending_mode
       sending_mode: 'manual_approval' | 'automatic_sending'
   - client_followup_config   (optional, backend to be added by owner)
       client_id text primary key, config jsonb, updated_by uuid, updated_at timestamptz
     If this table does not exist yet, the full configuration is kept in this
     browser (localStorage) so nothing is lost, and the UI says so. Once the
     table exists, the same code saves to it with no change.

   Frontend only. No messages are sent from this file.
   ========================================================= */
(function(){
'use strict';

const S = window.GLIME_SETTINGS;
if(!S || typeof S.register !== 'function'){
  console.warn('GLIME Follow-ups: Settings shell not found');
  return;
}

const MAX_STEPS = 10;
const MAX_DAYS = 365;

const TYPES = {
  message:  {label:'Simple message',      text:'Hi {name}, just checking in. Can I help you with anything?'},
  website:  {label:'Website link',        needs:'website',  text:'Hi {name}, you can see everything about {business} here: {website}'},
  review:   {label:'Google review link',  needs:'review',   text:'Hi {name}, thank you for choosing {business}! Would you share a quick review? {review_link}'},
  payment:  {label:'Payment reminder',    needs:'payment',  text:'Hi {name}, a gentle reminder about your pending payment. You can pay here: {payment_link}'},
  question: {label:'Ask a question',      text:'Hi {name}, what is your budget? It helps me suggest the right option for you.'},
  offer:    {label:'Offer',               text:'Hi {name}, we have a special offer for you this week from {business}. Reply YES to know more.'},
  catalog:  {label:'Catalog',             needs:'catalog',  text:'Hi {name}, here is our latest catalog: {catalog}'},
  location: {label:'Location / visit',    needs:'location', text:'Hi {name}, you are welcome to visit us anytime. Here is our location: {location}'},
  final:    {label:'Last attempt',        text:'Hi {name}, this is my last message. If you still need help, just reply here anytime.'}
};

const UNITS = [
  {v:'minutes', t:'minutes', m:1},
  {v:'hours',   t:'hours',   m:60},
  {v:'days',    t:'days',    m:1440}
];

const DAYS = [[1,'Mon'],[2,'Tue'],[3,'Wed'],[4,'Thu'],[5,'Fri'],[6,'Sat'],[7,'Sun']];

const LINKS = [
  {k:'website',  t:'Website',            h:'Your main website or landing page'},
  {k:'review',   t:'Google review link', h:'Where happy customers leave a review'},
  {k:'catalog',  t:'Catalog',            h:'Products or services catalog'},
  {k:'location', t:'Location',           h:'Google Maps link to your shop or office'},
  {k:'payment',  t:'Payment link',       h:'Razorpay / UPI payment link used in payment reminders'}
];

const PLACEHOLDERS = ['{name}','{business}','{website}','{review_link}','{catalog}','{location}','{payment_link}'];
const LINK_PLACEHOLDER = {website:'{website}', review:'{review_link}', catalog:'{catalog}', location:'{location}', payment:'{payment_link}'};

const STYLE = `
.gfu-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:18px;margin-bottom:15px}
.gfu-card h3{font-size:1.02rem;margin-bottom:3px}
.gfu-intro{color:var(--mu);font-size:.74rem;margin-bottom:8px}
.gfu-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.gfu-tag{font-size:.62rem;font-weight:800;letter-spacing:.06em;color:var(--mu);border:1px solid var(--bd);border-radius:99px;padding:2px 8px;margin-left:6px;vertical-align:middle}
.gfu-tag.on{color:var(--gr);border-color:rgba(80,245,168,.4)}
.gfu-tag.warn{color:#ffd37a;border-color:rgba(255,211,122,.4)}
.gfu-modes{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.gfu-mode{display:block;border:1px solid var(--bd);border-radius:13px;padding:12px;cursor:pointer;background:var(--surf2)}
.gfu-mode input{display:none}
.gfu-mode b{display:block;font-size:.82rem}
.gfu-mode small{display:block;color:var(--mu);font-size:.7rem;margin-top:2px;line-height:1.4}
.gfu-mode.sel{border-color:rgba(82,232,255,.55);background:rgba(82,232,255,.07)}
.gfu-step{border:1px solid var(--bd);border-radius:14px;padding:13px;margin-top:11px;background:var(--surf2)}
.gfu-step-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
.gfu-step-no{font-size:.7rem;font-weight:800;color:var(--cy);letter-spacing:.08em}
.gfu-grid{display:grid;grid-template-columns:auto auto 1fr;gap:8px;align-items:center}
.gfu-in,.gfu-ta,.gfu-sel{
  background:var(--surf);color:var(--tx);border:1px solid var(--bd);border-radius:9px;
  padding:9px 10px;outline:none;width:100%
}
.gfu-in:focus,.gfu-ta:focus,.gfu-sel:focus{border-color:rgba(82,232,255,.45)}
.gfu-in.num{width:84px;text-align:right}
.gfu-ta{min-height:78px;resize:vertical;margin-top:9px;font-size:.8rem;line-height:1.5}
.gfu-ta:disabled{opacity:.45}
.gfu-ai{display:flex;align-items:center;gap:9px;margin-top:9px;color:var(--mu);font-size:.72rem}
.gfu-ai .sw{width:40px;height:22px}
.gfu-ai .sw span:before{width:16px;height:16px}
.gfu-ai .sw input:checked+span:before{transform:translateX(18px)}
.gfu-warnline{color:#ffd37a;font-size:.68rem;margin-top:7px}
.gfu-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.gfu-chip{font-size:.66rem;color:var(--cy);border:1px solid rgba(82,232,255,.28);border-radius:99px;padding:2px 9px;background:rgba(82,232,255,.05)}
.gfu-days{display:flex;flex-wrap:wrap;gap:6px}
.gfu-day{cursor:pointer}
.gfu-day input{display:none}
.gfu-day span{display:inline-block;border:1px solid var(--bd);border-radius:9px;padding:7px 11px;font-size:.74rem;font-weight:800;color:var(--mu)}
.gfu-day input:checked+span{color:var(--cy);border-color:rgba(82,232,255,.45);background:rgba(82,232,255,.08)}
.gfu-time{display:flex;align-items:center;gap:8px}
.gfu-time input{width:auto}
.gfu-link-row{margin-top:10px}
.gfu-link-row label{display:block;font-size:.76rem;font-weight:800}
.gfu-link-row small{display:block;color:var(--mu);font-size:.68rem;margin-bottom:4px}
.gfu-tl{border-left:2px solid rgba(82,232,255,.3);margin:10px 0 0 6px;padding-left:14px}
.gfu-tl-i{position:relative;margin-bottom:12px}
.gfu-tl-i:before{content:"";position:absolute;left:-20px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--cy)}
.gfu-tl-i b{font-size:.78rem}
.gfu-tl-i span{display:block;color:var(--mu);font-size:.72rem;line-height:1.45;margin-top:1px;word-break:break-word}
.gfu-err{color:var(--rd);font-size:.74rem;margin-top:10px;display:none}
.gfu-err.show{display:block}
.gfu-where{color:var(--mu);font-size:.68rem;margin-top:8px}
.gfu-mini{border:1px solid var(--bd);background:transparent;color:var(--mu);border-radius:8px;padding:5px 9px;font-size:.68rem;font-weight:800}
.gfu-mini.del{color:var(--rd);border-color:rgba(255,130,145,.32)}
@media(max-width:760px){
  .gfu-modes{grid-template-columns:1fr}
  .gfu-grid{grid-template-columns:auto 1fr}
  .gfu-grid .gfu-type{grid-column:1 / -1}
  .gfu-card .row{flex-direction:column;align-items:stretch;gap:10px}
}
`;

function injectStyle(){
  if(document.getElementById('gfuStyle')) return;
  const el = document.createElement('style');
  el.id = 'gfuStyle';
  el.textContent = STYLE;
  document.head.appendChild(el);
}

function uid(){ return 's' + Math.random().toString(36).slice(2, 9); }

function mk(delay, unit, type){
  return {id:uid(), delay, unit, type, text:TYPES[type].text, ai:false};
}

function defaults(){
  return {
    version: 1,
    steps: [mk(2,'hours','message'), mk(1,'days','website'), mk(3,'days','offer'), mk(7,'days','final')],
    links: {website:'', review:'', catalog:'', location:'', payment:''},
    stop: {
      on_reply:true, on_purchase:true, on_optout:true, max_followups:4,
      optout_words:'stop, not interested, no thanks, nahi chahiye, नहीं चाहिए'
    },
    window: {start:'09:00', end:'21:00', days:[1,2,3,4,5,6,7]},
    audience: {mode:'all', tags:'', skip_buyers_days:7},
    limits: {cooldown_days:14, max_per_day:0},
    style: {language:'auto', tone:'friendly'}
  };
}

function merge(base, extra){
  if(!extra || typeof extra !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : {...base};
  Object.keys(extra).forEach(k => {
    const v = extra[k];
    if(Array.isArray(v)) out[k] = v;
    else if(v && typeof v === 'object' && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = merge(base[k], v);
    else if(v !== undefined) out[k] = v;
  });
  return out;
}

function minutesOf(step){
  const u = UNITS.find(x => x.v === step.unit) || UNITS[1];
  return Math.round(Number(step.delay) * u.m);
}

function sortSteps(cfg){
  cfg.steps.sort((a,b) => minutesOf(a) - minutesOf(b));
}

function delayLabel(step){
  const n = Number(step.delay);
  const unit = step.unit === 'minutes' ? 'minute' : step.unit === 'hours' ? 'hour' : 'day';
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

function setByPath(obj, path, value){
  const parts = path.split('.');
  let o = obj;
  for(let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}

function isUrl(v){
  return /^(https?:\/\/|upi:\/\/)\S+$/i.test(v);
}

function validate(cfg){
  if(!cfg.steps.length) return 'Add at least one follow-up step.';
  if(cfg.steps.length > MAX_STEPS) return `You can add up to ${MAX_STEPS} steps.`;

  for(let i = 0; i < cfg.steps.length; i++){
    const s = cfg.steps[i];
    const n = Number(s.delay);
    if(!Number.isInteger(n) || n < 1) return `Step ${i+1}: enter a whole number of ${s.unit} (1 or more).`;
    if(minutesOf(s) > MAX_DAYS * 1440) return `Step ${i+1}: the delay cannot be more than ${MAX_DAYS} days.`;
    if(!s.ai && !String(s.text || '').trim()) return `Step ${i+1}: write the message, or turn on "Let AI write this message".`;
    const need = TYPES[s.type] && TYPES[s.type].needs;
    if(need && !s.ai && !String(s.text).includes(LINK_PLACEHOLDER[need])){
      return `Step ${i+1}: this is a ${TYPES[s.type].label.toLowerCase()} step, so the message must include ${LINK_PLACEHOLDER[need]}.`;
    }
    if(need && !String(cfg.links[need] || '').trim()){
      return `Step ${i+1} needs your ${LINKS.find(l => l.k === need).t.toLowerCase()}. Add it under "Your links".`;
    }
  }

  const times = cfg.steps.map(minutesOf);
  for(let i = 1; i < times.length; i++){
    if(times[i] === times[i-1]) return `Steps ${i} and ${i+1} are set for the same time. Give each step a different delay.`;
  }

  for(const l of LINKS){
    const v = String(cfg.links[l.k] || '').trim();
    if(v && !isUrl(v)) return `${l.t}: enter a full link starting with https://`;
  }

  const m = Number(cfg.stop.max_followups);
  if(!Number.isInteger(m) || m < 1 || m > MAX_STEPS) return `Maximum follow-ups must be between 1 and ${MAX_STEPS}.`;

  if(!cfg.window.days.length) return 'Choose at least one day for sending.';
  if(!cfg.window.start || !cfg.window.end || cfg.window.start >= cfg.window.end){
    return 'Sending window: the start time must be earlier than the end time.';
  }

  if(cfg.audience.mode === 'tags' && !String(cfg.audience.tags || '').trim()){
    return 'Add at least one tag, or choose a different audience.';
  }

  const cd = Number(cfg.limits.cooldown_days);
  if(!Number.isInteger(cd) || cd < 0 || cd > 365) return 'Wait before restarting: enter 0 to 365 days.';
  const mp = Number(cfg.limits.max_per_day);
  if(!Number.isInteger(mp) || mp < 0 || mp > 10000) return 'New follow-ups per day: enter 0 (no limit) to 10000.';
  const sb = Number(cfg.audience.skip_buyers_days);
  if(!Number.isInteger(sb) || sb < 0 || sb > 365) return 'Skip recent buyers: enter 0 to 365 days.';

  return '';
}

function sample(text, cfg, business){
  const map = {
    '{name}':'Rahul', '{business}':business || 'your business',
    '{website}':cfg.links.website || '[website link not set]',
    '{review_link}':cfg.links.review || '[review link not set]',
    '{catalog}':cfg.links.catalog || '[catalog link not set]',
    '{location}':cfg.links.location || '[location link not set]',
    '{payment_link}':cfg.links.payment || '[payment link not set]'
  };
  return String(text).replace(/\{(name|business|website|review_link|catalog|location|payment_link)\}/g, m => map[m]);
}

S.register({
  id:'followups',
  label:'Follow-ups',
  order:40,
  render: async function({container, api, state, ui}){
    injectStyle();
    const esc = ui.escapeHtml;
    const sb = api.supabase;
    const clientId = state.client && state.client.client_id;
    const business = state.client && (state.client.business_name || state.client.name) || '';

    container.innerHTML = `
      <div class="section-head"><h2>Follow-ups</h2><p>Set up automatic follow-up messages for customers who go quiet.</p></div>
      <div class="loading">Loading follow-up settings…</div>`;

    if(!sb || !clientId){
      container.innerHTML += '<div class="error">Your account could not be identified. Please refresh the page.</div>';
      return;
    }

    const lsKey = 'glime_followup_cfg_' + clientId;

    /* ---- load ---- */
    const setRes = await sb.from('client_followup_settings')
      .select('client_id,enabled,sending_mode').eq('client_id', clientId).maybeSingle();
    if(setRes.error) throw setRes.error;
    const row = setRes.data;
    let enabled = !!(row && row.enabled);
    let mode = (row && row.sending_mode) || 'manual_approval';

    let cfg = defaults();
    let storedWhere = 'none';
    const cfgRes = await sb.from('client_followup_config').select('config').eq('client_id', clientId).maybeSingle();
    if(!cfgRes.error && cfgRes.data && cfgRes.data.config){
      cfg = merge(cfg, cfgRes.data.config);
      storedWhere = 'server';
    }else{
      try{
        const raw = localStorage.getItem(lsKey);
        if(raw){ cfg = merge(cfg, JSON.parse(raw)); storedWhere = 'device'; }
      }catch(e){}
    }
    cfg.steps = (cfg.steps || []).filter(s => s && TYPES[s.type]).map(s => ({
      id: s.id || uid(), delay: s.delay, unit: UNITS.some(u => u.v === s.unit) ? s.unit : 'hours',
      type: s.type, text: s.text || '', ai: !!s.ai
    }));
    sortSteps(cfg);

    /* ---- render ---- */
    function tokenNote(){
      const n = cfg.steps.filter(s => s.ai).length;
      return n
        ? `${n} of ${cfg.steps.length} steps use AI to write the message. Those use your AI tokens (see Automation limits). Steps with your own text use no tokens.`
        : `All steps use your own text, so follow-ups use no AI tokens.`;
    }

    function stepHtml(s, i){
      const t = TYPES[s.type];
      const needs = t.needs;
      const long = minutesOf(s) > 1440;
      return `
        <div class="gfu-step" data-step="${i}">
          <div class="gfu-step-top">
            <span class="gfu-step-no">STEP ${i+1}</span>
            <button type="button" class="gfu-mini del" data-act="remove" data-i="${i}">Remove</button>
          </div>
          <div class="gfu-grid">
            <input class="gfu-in num" type="number" inputmode="numeric" min="1" step="1" value="${esc(s.delay)}" data-sk="delay" data-i="${i}" aria-label="Delay">
            <select class="gfu-sel" data-sk="unit" data-i="${i}" aria-label="Unit">
              ${UNITS.map(u => `<option value="${u.v}" ${u.v===s.unit?'selected':''}>${u.t} later</option>`).join('')}
            </select>
            <select class="gfu-sel gfu-type" data-sk="type" data-i="${i}" aria-label="Step type">
              ${Object.keys(TYPES).map(k => `<option value="${k}" ${k===s.type?'selected':''}>${esc(TYPES[k].label)}</option>`).join('')}
            </select>
          </div>
          <textarea class="gfu-ta" data-sk="text" data-i="${i}" maxlength="1000" ${s.ai?'disabled':''}
            placeholder="${s.ai ? 'AI will write this message for the customer' : 'Write your message'}">${esc(s.text)}</textarea>
          <label class="gfu-ai">
            <span class="sw"><input type="checkbox" data-sk="ai" data-i="${i}" ${s.ai?'checked':''}><span></span></span>
            Let AI write this message (uses AI tokens)
          </label>
          ${needs && !String(cfg.links[needs]||'').trim() ? `<div class="gfu-warnline">Add your ${esc(LINKS.find(l=>l.k===needs).t.toLowerCase())} under "Your links" for this step.</div>` : ''}
          ${long ? `<div class="gfu-warnline">After 24 hours, WhatsApp and Instagram can limit free-form messages. GLIME sends this step only where the platform allows it.</div>` : ''}
        </div>`;
    }

    function previewHtml(){
      return cfg.steps.map((s, i) => `
        <div class="gfu-tl-i">
          <b>${i+1}. After ${esc(delayLabel(s))} · ${esc(TYPES[s.type].label)}${i >= Number(cfg.stop.max_followups) ? ' <span class="gfu-tag warn">NOT SENT: above max</span>' : ''}</b>
          <span>${s.ai ? 'AI writes this message based on the conversation.' : esc(sample(s.text, cfg, business))}</span>
        </div>`).join('');
    }

    function refreshSteps(){
      sortSteps(cfg);
      container.querySelector('#gfuSteps').innerHTML = cfg.steps.map(stepHtml).join('');
      container.querySelector('#gfuAdd').disabled = cfg.steps.length >= MAX_STEPS;
      refreshPreview();
    }

    function refreshPreview(){
      container.querySelector('#gfuPreview').innerHTML = previewHtml();
      container.querySelector('#gfuTokens').textContent = tokenNote();
    }

    function modeBox(v, title, help){
      return `
        <label class="gfu-mode ${mode===v?'sel':''}" data-mode-box="${v}">
          <input type="radio" name="gfuMode" value="${v}" ${mode===v?'checked':''}>
          <b>${title}</b><small>${help}</small>
        </label>`;
    }

    function whereText(){
      if(storedWhere === 'server') return 'Saved to your account.';
      if(storedWhere === 'device') return 'Saved on this device only for now. It will sync to your account once follow-up sync is switched on.';
      return 'Not saved yet.';
    }

    container.innerHTML = `
      <div class="section-head">
        <h2>Follow-ups</h2>
        <p>Automatic follow-up messages for customers who go quiet, on WhatsApp and Instagram.</p>
      </div>

      <section class="gfu-card">
        <div class="gfu-head">
          <div>
            <h3>Follow-ups <span class="gfu-tag ${enabled?'on':''}" id="gfuState">${enabled?'ACTIVE':'PAUSED'}</span></h3>
            <p class="gfu-intro" style="margin:0">Turn the whole follow-up system on or off. Your steps stay saved.</p>
          </div>
          <label class="sw" title="Follow-ups on/off"><input type="checkbox" id="gfuEnabled" ${enabled?'checked':''}><span></span></label>
        </div>
        <div class="gfu-modes">
          ${modeBox('manual_approval','Manual approval','You review each follow-up before it is sent')}
          ${modeBox('automatic_sending','Automatic sending','Follow-ups go out by themselves on schedule')}
        </div>
      </section>

      <section class="gfu-card">
        <h3>Follow-up steps</h3>
        <p class="gfu-intro">Choose when each message goes, counted from the customer's last message. Steps are kept in time order.</p>
        <div id="gfuSteps"></div>
        <div class="actions">
          <button type="button" class="btn" id="gfuAdd" data-act="add">+ Add step</button>
          <button type="button" class="btn" data-act="preset">Use suggested steps</button>
        </div>
        <div class="gfu-chips" title="Use these inside your messages">
          ${PLACEHOLDERS.map(p => `<span class="gfu-chip">${p}</span>`).join('')}
        </div>
        <p class="note">These words in { } are replaced automatically with the customer's name, your business name and your links.</p>
        <p class="note" id="gfuTokens"></p>
      </section>

      <section class="gfu-card">
        <h3>Your links</h3>
        <p class="gfu-intro">Fill these once. They are used in every step that needs them.</p>
        ${LINKS.map(l => `
          <div class="gfu-link-row">
            <label for="gfuL_${l.k}">${esc(l.t)}</label>
            <small>${esc(l.h)}</small>
            <input class="gfu-in" id="gfuL_${l.k}" type="url" inputmode="url" placeholder="https://" value="${esc(cfg.links[l.k])}" data-path="links.${l.k}" maxlength="500">
          </div>`).join('')}
      </section>

      <section class="gfu-card">
        <h3>When to stop</h3>
        <p class="gfu-intro">GLIME stops following up as soon as any of these happen.</p>
        <div class="row"><div class="row-info"><b>Customer replies</b><small>Stop when the customer sends any reply.</small></div>
          <label class="sw"><input type="checkbox" data-path="stop.on_reply" ${cfg.stop.on_reply?'checked':''}><span></span></label></div>
        <div class="row"><div class="row-info"><b>Customer buys</b><small>Stop when an order or payment is received.</small></div>
          <label class="sw"><input type="checkbox" data-path="stop.on_purchase" ${cfg.stop.on_purchase?'checked':''}><span></span></label></div>
        <div class="row"><div class="row-info"><b>Customer says no</b><small>Stop when the message contains any of the words below.</small></div>
          <label class="sw"><input type="checkbox" data-path="stop.on_optout" ${cfg.stop.on_optout?'checked':''}><span></span></label></div>
        <div class="gfu-link-row">
          <label for="gfuOpt">Words that mean "no"</label>
          <small>Separate with commas. Hindi and English both work.</small>
          <input class="gfu-in" id="gfuOpt" type="text" data-path="stop.optout_words" value="${esc(cfg.stop.optout_words)}" maxlength="400">
        </div>
        <div class="row">
          <div class="row-info"><b>Maximum follow-ups per customer</b><small>No more than this many messages are sent in one follow-up run.</small></div>
          <input class="gfu-in num" type="number" inputmode="numeric" min="1" max="${MAX_STEPS}" step="1" data-path="stop.max_followups" data-num="1" value="${esc(cfg.stop.max_followups)}">
        </div>
      </section>

      <section class="gfu-card">
        <h3>When to send</h3>
        <p class="gfu-intro">Follow-ups never go out at night. Anything due outside this window waits for the next opening (India time).</p>
        <div class="gfu-time">
          <input class="gfu-in" type="time" data-path="window.start" value="${esc(cfg.window.start)}" aria-label="From">
          <span style="color:var(--mu)">to</span>
          <input class="gfu-in" type="time" data-path="window.end" value="${esc(cfg.window.end)}" aria-label="Until">
        </div>
        <div class="gfu-days" style="margin-top:12px">
          ${DAYS.map(d => `<label class="gfu-day"><input type="checkbox" data-day="${d[0]}" ${cfg.window.days.includes(d[0])?'checked':''}><span>${d[1]}</span></label>`).join('')}
        </div>
      </section>

      <section class="gfu-card">
        <h3>Who gets follow-ups</h3>
        <div class="row">
          <div class="row-info"><b>Customers</b><small>Choose which leads are followed up.</small></div>
          <select class="gfu-sel" data-path="audience.mode" style="max-width:230px">
            <option value="all" ${cfg.audience.mode==='all'?'selected':''}>All leads</option>
            <option value="hot" ${cfg.audience.mode==='hot'?'selected':''}>Hot leads only</option>
            <option value="warm_hot" ${cfg.audience.mode==='warm_hot'?'selected':''}>Warm and hot leads</option>
            <option value="tags" ${cfg.audience.mode==='tags'?'selected':''}>Only leads with these tags</option>
          </select>
        </div>
        <div class="gfu-link-row" id="gfuTagsRow" style="${cfg.audience.mode==='tags'?'':'display:none'}">
          <label for="gfuTags">Tags</label>
          <small>Separate with commas, for example: wedding, bulk</small>
          <input class="gfu-in" id="gfuTags" type="text" data-path="audience.tags" value="${esc(cfg.audience.tags)}" maxlength="300">
        </div>
        <div class="row">
          <div class="row-info"><b>Skip recent buyers</b><small>Do not follow up with customers who bought in the last few days. Enter 0 to turn off.</small></div>
          <div class="gfu-time"><input class="gfu-in num" type="number" inputmode="numeric" min="0" max="365" step="1" data-path="audience.skip_buyers_days" data-num="1" value="${esc(cfg.audience.skip_buyers_days)}"><span style="color:var(--mu);font-size:.7rem">days</span></div>
        </div>
      </section>

      <section class="gfu-card">
        <h3>Smart limits</h3>
        <p class="gfu-intro">Keeps follow-ups polite and protects your daily limits.</p>
        <div class="row">
          <div class="row-info"><b>Wait before following up again</b><small>After a full run ends, wait this many days before starting a new one for the same customer. Enter 0 for no wait.</small></div>
          <div class="gfu-time"><input class="gfu-in num" type="number" inputmode="numeric" min="0" max="365" step="1" data-path="limits.cooldown_days" data-num="1" value="${esc(cfg.limits.cooldown_days)}"><span style="color:var(--mu);font-size:.7rem">days</span></div>
        </div>
        <div class="row">
          <div class="row-info"><b>New follow-ups per day</b><small>Most customers that can start a follow-up in one day. Enter 0 for no limit. Your Automation limits still apply.</small></div>
          <input class="gfu-in num" type="number" inputmode="numeric" min="0" max="10000" step="1" data-path="limits.max_per_day" data-num="1" value="${esc(cfg.limits.max_per_day)}">
        </div>
        <div class="row">
          <div class="row-info"><b>Language</b><small>Language of AI-written follow-ups.</small></div>
          <select class="gfu-sel" data-path="style.language" style="max-width:230px">
            <option value="auto" ${cfg.style.language==='auto'?'selected':''}>Same as the customer</option>
            <option value="hindi" ${cfg.style.language==='hindi'?'selected':''}>Hindi</option>
            <option value="english" ${cfg.style.language==='english'?'selected':''}>English</option>
            <option value="hinglish" ${cfg.style.language==='hinglish'?'selected':''}>Hinglish</option>
          </select>
        </div>
        <div class="row">
          <div class="row-info"><b>Tone</b><small>How AI-written follow-ups should sound.</small></div>
          <select class="gfu-sel" data-path="style.tone" style="max-width:230px">
            <option value="friendly" ${cfg.style.tone==='friendly'?'selected':''}>Friendly</option>
            <option value="professional" ${cfg.style.tone==='professional'?'selected':''}>Professional</option>
            <option value="short" ${cfg.style.tone==='short'?'selected':''}>Short and direct</option>
          </select>
        </div>
      </section>

      <section class="gfu-card">
        <h3>Preview</h3>
        <p class="gfu-intro">How a customer named Rahul would see your follow-ups.</p>
        <div class="gfu-tl" id="gfuPreview"></div>
      </section>

      <div class="gfu-err" id="gfuErr"></div>
      <div class="actions">
        <button type="button" class="btn primary" id="gfuSave">Save follow-up settings</button>
      </div>
      <p class="gfu-where" id="gfuWhere">${esc(whereText())}</p>`;

    refreshSteps();

    /* ---- events ---- */
    const err = container.querySelector('#gfuErr');
    function showErr(msg){ err.textContent = msg; err.classList.toggle('show', !!msg); }

    container.querySelector('#gfuEnabled').addEventListener('change', e => {
      enabled = e.target.checked;
      const tag = container.querySelector('#gfuState');
      tag.textContent = enabled ? 'ACTIVE' : 'PAUSED';
      tag.classList.toggle('on', enabled);
    });

    container.querySelectorAll('input[name="gfuMode"]').forEach(r => {
      r.addEventListener('change', () => {
        mode = r.value;
        container.querySelectorAll('[data-mode-box]').forEach(b => b.classList.toggle('sel', b.dataset.modeBox === mode));
      });
    });

    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if(!btn) return;
      const act = btn.dataset.act;
      if(act === 'add'){
        if(cfg.steps.length >= MAX_STEPS) return;
        const last = cfg.steps[cfg.steps.length - 1];
        const next = last ? mk(Math.max(1, Number(last.delay) + 1), last.unit, 'message') : mk(2, 'hours', 'message');
        cfg.steps.push(next);
        refreshSteps();
      }else if(act === 'remove'){
        cfg.steps.splice(Number(btn.dataset.i), 1);
        refreshSteps();
      }else if(act === 'preset'){
        cfg.steps = defaults().steps;
        cfg.stop.max_followups = cfg.steps.length;
        container.querySelector('[data-path="stop.max_followups"]').value = cfg.steps.length;
        refreshSteps();
      }
    });

    /* Step fields */
    function onStepField(e){
      const el = e.target.closest('[data-sk]');
      if(!el) return;
      const i = Number(el.dataset.i);
      const s = cfg.steps[i];
      if(!s) return;
      const k = el.dataset.sk;
      if(k === 'text'){ s.text = el.value; refreshPreview(); return; }
      if(k === 'delay'){ s.delay = el.value === '' ? '' : Number(el.value); if(e.type === 'change') refreshSteps(); else refreshPreview(); return; }
      if(e.type !== 'change') return;
      if(k === 'unit'){ s.unit = el.value; refreshSteps(); }
      else if(k === 'ai'){ s.ai = el.checked; refreshSteps(); }
      else if(k === 'type'){
        const old = TYPES[s.type];
        if(!String(s.text).trim() || s.text === old.text) s.text = TYPES[el.value].text;
        s.type = el.value;
        refreshSteps();
      }
    }
    container.addEventListener('input', onStepField);
    container.addEventListener('change', onStepField);

    /* Generic fields */
    function onPath(e){
      const el = e.target.closest('[data-path]');
      if(!el) return;
      let v;
      if(el.type === 'checkbox') v = el.checked;
      else if(el.dataset.num) v = el.value === '' ? '' : Number(el.value);
      else v = el.value;
      setByPath(cfg, el.dataset.path, v);
      if(el.dataset.path === 'audience.mode'){
        container.querySelector('#gfuTagsRow').style.display = v === 'tags' ? '' : 'none';
      }
      if(el.dataset.path.startsWith('links.') || el.dataset.path === 'stop.max_followups'){
        if(e.type === 'change') refreshSteps(); else refreshPreview();
      }
    }
    container.addEventListener('input', onPath);
    container.addEventListener('change', onPath);

    container.querySelectorAll('[data-day]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d = Number(cb.dataset.day);
        const set = new Set(cfg.window.days);
        if(cb.checked) set.add(d); else set.delete(d);
        cfg.window.days = [...set].sort((a,b) => a - b);
      });
    });

    /* ---- save ---- */
    container.querySelector('#gfuSave').addEventListener('click', async ev => {
      const button = ev.currentTarget;
      sortSteps(cfg);
      cfg.links = Object.fromEntries(Object.entries(cfg.links).map(([k, v]) => [k, String(v || '').trim()]));
      const problem = validate(cfg);
      showErr(problem);
      if(problem){ err.scrollIntoView({behavior:'smooth', block:'center'}); return; }

      button.disabled = true;
      const now = new Date().toISOString();

      /* 1. existing settings row: enabled + sending_mode */
      let res;
      if(row){
        res = await sb.from('client_followup_settings')
          .update({enabled, sending_mode:mode, updated_at:now}).eq('client_id', clientId);
      }else{
        res = await sb.from('client_followup_settings')
          .insert({client_id:clientId, enabled, sending_mode:mode});
      }
      if(res.error){
        button.disabled = false;
        console.error(res.error);
        ui.toast(res.error.message || 'Could not save follow-up settings', true);
        return;
      }

      /* 2. full configuration: server table if present, otherwise this device */
      const payload = {version:1, ...cfg, steps: cfg.steps.map(({id, ...rest}) => rest)};
      const cres = await sb.from('client_followup_config').upsert({
        client_id: clientId,
        config: payload,
        updated_by: state.session.user.id,
        updated_at: now
      }, {onConflict:'client_id'});

      if(cres.error){
        try{ localStorage.setItem(lsKey, JSON.stringify(payload)); }catch(e){}
        storedWhere = 'device';
        ui.toast('Follow-up settings saved');
      }else{
        storedWhere = 'server';
        ui.toast('Follow-up settings saved');
      }
      button.disabled = false;
      container.querySelector('#gfuWhere').textContent = whereText();
    });
  }
});
})();
