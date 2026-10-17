/* =========================================================
   GLIME SETTINGS — AUTOMATION MODULE
   ---------------------------------------------------------
   Registers Settings > Automation through window.GLIME_SETTINGS.
   Replaces the empty placeholder registered by settings.html.

   Data (existing backend, nothing new created):
   - client_channel_limits  (one row per client + channel)
       daily_message_limit, daily_ai_token_budget, monthly_ai_token_budget,
       minimum_message_delay_seconds, budget_exhaustion_behavior,
       limit_exhaustion_behavior
   - client_control_settings (one row per client)
       emergency_stop_enabled

   Rules:
   - Limits are per DAY or per MONTH only. There is no hourly limit.
   - A value of 0 in the database means "no limit".
   ========================================================= */
(function(){
'use strict';

const S = window.GLIME_SETTINGS;
if(!S || typeof S.register !== 'function'){
  console.warn('GLIME Automation: Settings shell not found');
  return;
}

const CHANNELS = [
  {key:'whatsapp',  name:'WhatsApp',  icon:'◉', defaults:{maximum_response_tokens:1200, maximum_response_characters:6000}},
  {key:'instagram', name:'Instagram', icon:'◎', defaults:{maximum_response_tokens:450,  maximum_response_characters:900}}
];

const LIMIT_COLUMNS =
  'client_id,channel,daily_message_limit,daily_ai_token_budget,monthly_ai_token_budget,' +
  'minimum_message_delay_seconds,budget_exhaustion_behavior,limit_exhaustion_behavior';

const RANGE = {
  daily_message_limit:           {min:1,    max:100000,    label:'Daily message limit'},
  daily_ai_token_budget:         {min:1000, max:100000000, label:'Daily AI token budget'},
  monthly_ai_token_budget:       {min:1000, max:1000000000, label:'Monthly AI token budget'},
  minimum_message_delay_seconds: {min:1,    max:300,       label:'Gap between automated messages'}
};

/* Rough planning aid only, shown as "approx." in the UI. */
const APPROX_TOKENS_PER_REPLY = 1500;

const BEHAVIOURS = [
  {v:'block',             t:'Stop sending until the limit resets'},
  {v:'approval_required', t:'Ask for my approval before sending'},
  {v:'fallback_to_manual',t:'Switch to manual replies'}
];

const STYLE = `
.gau-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:18px;margin-bottom:15px}
.gau-card.stop{border-color:rgba(255,130,145,.30)}
.gau-card.stop.on{background:rgba(255,130,145,.07);border-color:rgba(255,130,145,.55)}
.gau-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.gau-title b{font-size:1.02rem}
.gau-intro{color:var(--mu);font-size:.74rem;margin-bottom:6px}
.gau-field{display:flex;align-items:center;gap:10px;flex:none}
.gau-num{
  width:150px;background:var(--surf2);color:var(--tx);border:1px solid var(--bd);
  border-radius:9px;padding:9px 10px;outline:none;text-align:right
}
.gau-num:focus{border-color:rgba(82,232,255,.45)}
.gau-num:disabled{opacity:.35}
.gau-unit{color:var(--mu);font-size:.7rem;min-width:44px}
.gau-hint{display:block;color:var(--cy);font-size:.68rem;margin-top:3px}
.gau-warn{color:var(--rd);font-size:.72rem;margin-top:8px;display:none}
.gau-warn.show{display:block}
.gau-tag{font-size:.62rem;font-weight:800;letter-spacing:.06em;color:var(--mu);border:1px solid var(--bd);border-radius:99px;padding:2px 8px;margin-left:6px}
@media(max-width:760px){
  .gau-card .row{flex-direction:column;align-items:stretch;gap:10px}
  .gau-field{justify-content:space-between}
  .gau-num{flex:1;width:auto;min-width:0;text-align:left}
  .gau-card .select{width:100%}
}
`;

function injectStyle(){
  if(document.getElementById('gauStyle')) return;
  const el = document.createElement('style');
  el.id = 'gauStyle';
  el.textContent = STYLE;
  document.head.appendChild(el);
}

function fmt(n){
  try{ return Number(n).toLocaleString('en-IN'); }catch(e){ return String(n); }
}

/* GLIME-themed confirm box; falls back to the native one if glime-dialog.js is missing. */
function gdConfirm(message, options){
  return window.GLIME_DIALOG
    ? window.GLIME_DIALOG.confirm(message, options)
    : Promise.resolve(window.confirm(message));
}

function numberRow(esc, ch, field, value, opts){
  const r = RANGE[field];
  const on = Number(value) > 0;
  return `
    <div class="row">
      <div class="row-info">
        <b>${esc(opts.title)}</b>
        <small>${esc(opts.help)}</small>
        ${opts.approx ? `<span class="gau-hint" data-approx="${esc(ch)}:${esc(field)}"></span>` : ''}
      </div>
      <div class="gau-field">
        <label class="sw" title="Turn this limit on or off">
          <input type="checkbox" data-gau-on data-ch="${esc(ch)}" data-field="${esc(field)}" ${on?'checked':''}>
          <span></span>
        </label>
        <input class="gau-num" type="number" inputmode="numeric" step="1"
               min="${r.min}" max="${r.max}"
               data-gau-num data-ch="${esc(ch)}" data-field="${esc(field)}"
               value="${on ? Number(value) : ''}" placeholder="${on ? '' : 'No limit'}" ${on?'':'disabled'}>
        <span class="gau-unit">${esc(opts.unit)}</span>
      </div>
    </div>`;
}

function channelCard(esc, ch, row){
  const behaviour = row.limit_exhaustion_behavior || row.budget_exhaustion_behavior || 'block';
  return `
    <section class="gau-card" data-gau-card="${esc(ch.key)}">
      <div class="gau-title">
        <b>${ch.icon} ${esc(ch.name)}</b>
      </div>
      <p class="gau-intro">Limits reset every day (and every month for the monthly budget). Leave a limit off for no limit.</p>

      ${numberRow(esc, ch.key, 'daily_message_limit', row.daily_message_limit, {
        title:'Maximum messages per day',
        help:'Total messages GLIME may send on this channel in one day.',
        unit:'per day'
      })}

      ${numberRow(esc, ch.key, 'daily_ai_token_budget', row.daily_ai_token_budget, {
        title:'AI tokens per day',
        help:'How many AI tokens this channel may use in one day. Tokens are what the AI spends to read and write replies.',
        unit:'tokens',
        approx:true
      })}

      ${numberRow(esc, ch.key, 'monthly_ai_token_budget', row.monthly_ai_token_budget, {
        title:'AI tokens per month',
        help:'An overall monthly cap on top of the daily budget.',
        unit:'tokens'
      })}

      ${numberRow(esc, ch.key, 'minimum_message_delay_seconds', row.minimum_message_delay_seconds, {
        title:'Gap between automated messages',
        help:'Minimum wait between two automated messages, so replies never look rushed or spammy.',
        unit:'seconds'
      })}

      <div class="row">
        <div class="row-info">
          <b>When a limit is reached</b>
          <small>What GLIME should do once the daily message limit or token budget is used up.</small>
        </div>
        <select class="select" data-gau-behaviour data-ch="${esc(ch.key)}">
          ${BEHAVIOURS.map(b => `<option value="${b.v}" ${b.v===behaviour?'selected':''}>${esc(b.t)}</option>`).join('')}
        </select>
      </div>

      <div class="gau-warn" data-gau-warn="${esc(ch.key)}"></div>

      <div class="actions">
        <button class="btn primary" type="button" data-gau-save="${esc(ch.key)}">Save ${esc(ch.name)} limits</button>
      </div>
    </section>`;
}

function readCard(card){
  const out = {};
  card.querySelectorAll('[data-gau-on]').forEach(sw => {
    const field = sw.dataset.field;
    const input = card.querySelector(`[data-gau-num][data-field="${field}"]`);
    out[field] = sw.checked ? Number(input.value) : 0;
  });
  out.behaviour = card.querySelector('[data-gau-behaviour]').value;
  return out;
}

function validate(values){
  for(const field of Object.keys(RANGE)){
    const v = values[field];
    if(v === 0) continue;
    const r = RANGE[field];
    if(!Number.isInteger(v)) return `${r.label}: enter a whole number.`;
    if(v < r.min || v > r.max) return `${r.label}: use a value between ${fmt(r.min)} and ${fmt(r.max)}.`;
  }
  if(values.daily_ai_token_budget > 0 && values.monthly_ai_token_budget > 0 &&
     values.monthly_ai_token_budget < values.daily_ai_token_budget){
    return 'The monthly token budget cannot be smaller than the daily token budget.';
  }
  return '';
}

function updateApprox(card){
  const sw = card.querySelector('[data-gau-on][data-field="daily_ai_token_budget"]');
  const input = card.querySelector('[data-gau-num][data-field="daily_ai_token_budget"]');
  const hint = card.querySelector('[data-approx$=":daily_ai_token_budget"]');
  if(!sw || !input || !hint) return;
  const v = Number(input.value);
  if(sw.checked && Number.isFinite(v) && v >= RANGE.daily_ai_token_budget.min){
    hint.textContent = `≈ ${fmt(Math.max(1, Math.floor(v / APPROX_TOKENS_PER_REPLY)))} AI replies per day (approx.)`;
  }else{
    hint.textContent = '';
  }
}

S.register({
  id:'automation',
  label:'Automation',
  order:30,
  render: async function({container, api, state, ui}){
    injectStyle();
    const esc = ui.escapeHtml;
    const sb = api.supabase;
    const clientId = state.client && state.client.client_id;

    container.innerHTML = `
      <div class="section-head">
        <h2>Automation</h2>
        <p>Decide how much GLIME may send and spend each day on WhatsApp and Instagram.</p>
      </div>
      <div class="loading">Loading automation settings…</div>`;

    if(!sb || !clientId){
      container.innerHTML += '<div class="error">Your account could not be identified. Please refresh the page.</div>';
      return;
    }

    const [limitsRes, controlRes] = await Promise.all([
      sb.from('client_channel_limits').select(LIMIT_COLUMNS).eq('client_id', clientId),
      sb.from('client_control_settings').select('client_id,emergency_stop_enabled').eq('client_id', clientId).maybeSingle()
    ]);

    if(limitsRes.error) throw limitsRes.error;
    if(controlRes.error) throw controlRes.error;

    const rows = {};
    (limitsRes.data || []).forEach(r => { rows[r.channel] = r; });
    const stopped = !!(controlRes.data && controlRes.data.emergency_stop_enabled);

    container.innerHTML = `
      <div class="section-head">
        <h2>Automation</h2>
        <p>Decide how much GLIME may send and spend each day on WhatsApp and Instagram.</p>
      </div>

      <section class="gau-card stop ${stopped?'on':''}" id="gauStopCard">
        <div class="gau-title">
          <b>Emergency stop <span class="gau-tag" id="gauStopTag">${stopped?'ACTIVE':'OFF'}</span></b>
          <label class="sw" title="Emergency stop">
            <input type="checkbox" id="gauStop" ${stopped?'checked':''}>
            <span></span>
          </label>
        </div>
        <p class="gau-intro" style="margin:0">
          Instantly pauses all automated sending and AI replies on every channel. Turn it off to resume.
          Your saved limits are not changed.
        </p>
      </section>

      ${CHANNELS.map(ch => channelCard(esc, ch, rows[ch.key] || {})).join('')}

      <p class="note">
        Limits are counted per day or per month, never per hour. Changes apply to new messages from the moment you save.
      </p>`;

    /* Switch on/off enables or disables the number box */
    container.querySelectorAll('[data-gau-on]').forEach(sw => {
      sw.addEventListener('change', () => {
        const card = sw.closest('[data-gau-card]');
        const input = card.querySelector(`[data-gau-num][data-field="${sw.dataset.field}"]`);
        input.disabled = !sw.checked;
        if(sw.checked){
          if(!input.value) input.value = String(RANGE[sw.dataset.field].min === 1 ? (sw.dataset.field === 'daily_message_limit' ? 200 : 30) : 50000);
          input.focus();
        }else{
          input.value = '';
          input.placeholder = 'No limit';
        }
        updateApprox(card);
      });
    });

    container.querySelectorAll('[data-gau-num]').forEach(input => {
      input.addEventListener('input', () => updateApprox(input.closest('[data-gau-card]')));
    });
    container.querySelectorAll('[data-gau-card]').forEach(updateApprox);

    /* Save one channel */
    container.querySelectorAll('[data-gau-save]').forEach(button => {
      button.onclick = async () => {
        const key = button.dataset.gauSave;
        const ch = CHANNELS.find(c => c.key === key);
        const card = container.querySelector(`[data-gau-card="${key}"]`);
        const warn = card.querySelector(`[data-gau-warn="${key}"]`);
        const values = readCard(card);

        const problem = validate(values);
        warn.textContent = problem;
        warn.classList.toggle('show', !!problem);
        if(problem) return;

        const payload = {
          daily_message_limit: values.daily_message_limit,
          daily_ai_token_budget: values.daily_ai_token_budget,
          monthly_ai_token_budget: values.monthly_ai_token_budget,
          minimum_message_delay_seconds: values.minimum_message_delay_seconds,
          budget_exhaustion_behavior: values.behaviour,
          limit_exhaustion_behavior: values.behaviour,
          updated_by: state.session.user.id,
          updated_at: new Date().toISOString()
        };

        button.disabled = true;
        let error = null;

        if(rows[key]){
          const res = await sb.from('client_channel_limits')
            .update(payload)
            .eq('client_id', clientId)
            .eq('channel', key);
          error = res.error;
        }else{
          const res = await sb.from('client_channel_limits')
            .insert({client_id: clientId, channel: key, ...ch.defaults, ...payload});
          error = res.error;
        }

        button.disabled = false;

        if(error){
          console.error(error);
          ui.toast(error.message || 'Could not save limits', true);
          return;
        }

        rows[key] = {...(rows[key] || {}), client_id: clientId, channel: key, ...payload};
        ui.toast(`${ch.name} limits saved`);
      };
    });

    /* Emergency stop saves immediately */
    const stopBox = container.querySelector('#gauStop');
    stopBox.addEventListener('change', async () => {
      const turningOn = stopBox.checked;
      if(turningOn){
        /* The switch has already flipped; keep it OFF until the client confirms. */
        stopBox.checked = false;
        const ok = await gdConfirm(
          'GLIME will pause all automated sending and AI replies on every channel until you turn this off.',
          {title:'Turn on Emergency stop?', confirmText:'Turn on', danger:true}
        );
        if(!ok) return;
        stopBox.checked = true;
      }
      stopBox.disabled = true;
      const {error} = await sb.from('client_control_settings').upsert({
        client_id: clientId,
        emergency_stop_enabled: turningOn,
        updated_by: state.session.user.id,
        updated_at: new Date().toISOString()
      }, {onConflict:'client_id'});
      stopBox.disabled = false;

      if(error){
        console.error(error);
        stopBox.checked = !turningOn;
        ui.toast(error.message || 'Could not update Emergency stop', true);
        return;
      }
      container.querySelector('#gauStopCard').classList.toggle('on', turningOn);
      container.querySelector('#gauStopTag').textContent = turningOn ? 'ACTIVE' : 'OFF';
      ui.toast(turningOn ? 'Emergency stop is ON — automation paused' : 'Emergency stop is OFF — automation resumed');
    });
  }
});
})();
