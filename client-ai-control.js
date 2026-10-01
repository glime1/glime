const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let state = {
  data: null,
  channel: 'instagram'
};

const $ = (id) => document.getElementById(id);

function note(text, ok = true) {
  const el = $('message');
  el.textContent = text;
  el.className = 'message ' + (ok ? 'ok' : 'err');
}

async function fn(body) {
  const { data, error } = await sb.functions.invoke(
    'client-ai-control',
    { body }
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

function sw(id, label, value) {
  return `
    <div class="row">
      <span>${label}</span>
      <input
        id="${id}"
        class="switch"
        type="checkbox"
        ${value ? 'checked' : ''}
      >
    </div>
  `;
}

function renderGlobal() {
  const c = state.data.control || {};

  $('globalControls').innerHTML =
    sw(
      'systemEnabled',
      'System enabled',
      c.system_enabled !== false
    ) +
    sw(
      'manualEnabled',
      'Manual messaging enabled',
      c.manual_messaging_enabled !== false
    ) +
    sw(
      'emergencyStop',
      'Emergency stop',
      c.emergency_stop_enabled === true
    ) +
    sw(
      'aiEnabled',
      'AI enabled',
      c.ai_enabled !== false
    ) +
    sw(
      'automationEnabled',
      'Automation enabled',
      c.automation_enabled !== false
    ) +
    sw(
      'followupsEnabled',
      'Follow-ups enabled',
      c.followups_enabled !== false
    );

  $('dailyMessageLimit').value =
    c.daily_message_limit || 0;

  $('dailyAiBudget').value =
    c.daily_ai_token_budget || 0;

  $('monthlyAiBudget').value =
    c.monthly_ai_token_budget || 0;
}

function renderBrain() {
  const b = state.data.brain || {};

  $('brainName').value =
    b.name || 'Client AI';

  $('brainStatus').value =
    b.status || 'active';

  $('language').value =
    b.language || 'hinglish';

  $('tone').value =
    b.tone || 'friendly';

  $('systemInstructions').value =
    b.system_instructions || '';

  $('salesInstructions').value =
    b.sales_instructions || '';

  $('safetyInstructions').value =
    b.safety_instructions || '';

  $('knowledgeEnabled').checked =
    b.knowledge_enabled !== false;

  $('memoryEnabled').checked =
    b.conversation_memory_enabled !== false;

  $('leadEnabled').checked =
    b.lead_context_enabled !== false;
}

function renderChannel() {
  const c =
    (state.data.channels || []).find(
      (x) => x.channel === state.channel
    ) || {};

  $('channelControls').innerHTML =
    sw(
      'channelEnabled',
      'Channel enabled',
      c.enabled !== false
    ) +
    sw(
      'connectionEnabled',
      'Connection enabled',
      c.connection_enabled !== false
    ) +
    sw(
      'channelAiEnabled',
      'AI enabled',
      c.ai_enabled !== false
    ) +
    sw(
      'channelAutomationEnabled',
      'Automation enabled',
      c.automation_enabled !== false
    ) +
    sw(
      'channelFollowupsEnabled',
      'Follow-ups enabled',
      c.followups_enabled !== false
    ) +
    `
      <div class="field">
        <label>AI mode</label>
        <select id="channelMode">
          <option value="manual">Manual</option>
          <option value="approval">Approval</option>
          <option value="automatic">Automatic</option>
        </select>
      </div>
    `;

  $('channelMode').value =
    c.ai_mode || 'manual';

  const l =
    (state.data.limits || []).find(
      (x) => x.channel === state.channel
    ) || {};

  $('limitDailyMsg').value =
    l.daily_message_limit || 0;

  $('limitHourlyMsg').value =
    l.hourly_message_limit || 0;

  $('limitDelay').value =
    l.minimum_message_delay_seconds || 0;

  $('limitDailyTokens').value =
    l.daily_ai_token_budget || 0;

  $('limitMonthlyTokens').value =
    l.monthly_ai_token_budget || 0;

  $('limitMaxTokens').value =
    l.maximum_response_tokens || 0;

  $('limitMaxChars').value =
    l.maximum_response_characters || 0;

  $('limitMinChars').value =
    l.minimum_response_characters || 0;

  $('limitMaxParts').value =
    l.maximum_message_parts || 1;

  $('budgetBehavior').value =
    l.budget_exhaustion_behavior || 'block';

  $('limitBehavior').value =
    l.limit_exhaustion_behavior || 'block';
}

function renderPermissions() {
  const rows = state.data.permissions || [];
  const catalog = state.data.permission_catalog || [];

  $('permissions').innerHTML =
    catalog.map((c) => {
      const r = rows.find(
        (x) =>
          x.permission_key === c.permission_key &&
          x.channel === state.channel
      );

      const value = r
        ? r.enabled === true
        : c.enabled_by_default === true;

      return `
        <div class="perm">
          <span>
            ${c.permission_key}
            <small style="display:block">
              ${c.description || ''}
            </small>
          </span>

          <input
            class="switch"
            type="checkbox"
            data-permission="${c.permission_key}"
            ${value ? 'checked' : ''}
          >
        </div>
      `;
    }).join('');
}

async function load() {
  try {
    const data = await fn({
      action: 'get'
    });

    state.data = data;

    $('clientBadge').textContent =
      data.client_id || 'Client';

    renderBrain();
    renderGlobal();
    renderChannel();
    renderPermissions();

  } catch (e) {
    note(
      e.message || 'Unable to load controls',
      false
    );
  }
}

async function saveBrain() {
  try {
    await fn({
      action: 'update_brain',

      name: $('brainName').value,

      language:
        $('language').value,

      tone:
        $('tone').value,

      system_instructions:
        $('systemInstructions').value,

      sales_instructions:
        $('salesInstructions').value,

      safety_instructions:
        $('safetyInstructions').value,

      knowledge_enabled:
        $('knowledgeEnabled').checked,

      conversation_memory_enabled:
        $('memoryEnabled').checked,

      lead_context_enabled:
        $('leadEnabled').checked,

      status:
        $('brainStatus').value
    });

    note('Brain saved.');

    await load();

  } catch (e) {
    note(
      e.message || 'Unable to save brain',
      false
    );
  }
}

async function saveGlobal() {
  try {
    await fn({
      action: 'update_control',

      system_enabled:
        $('systemEnabled').checked,

      manual_messaging_enabled:
        $('manualEnabled').checked,

      emergency_stop_enabled:
        $('emergencyStop').checked,

      ai_enabled:
        $('aiEnabled').checked,

      automation_enabled:
        $('automationEnabled').checked,

      followups_enabled:
        $('followupsEnabled').checked,

      daily_message_limit:
        Number(
          $('dailyMessageLimit').value || 0
        ),

      daily_ai_token_budget:
        Number(
          $('dailyAiBudget').value || 0
        ),

      monthly_ai_token_budget:
        Number(
          $('monthlyAiBudget').value || 0
        )
    });

    note('Global controls saved.');

    await load();

  } catch (e) {
    note(
      e.message || 'Unable to save global controls',
      false
    );
  }
}

async function saveChannel() {
  try {
    await fn({
      action: 'update_channel',

      channel:
        state.channel,

      enabled:
        $('channelEnabled').checked,

      connection_enabled:
        $('connectionEnabled').checked,

      ai_enabled:
        $('channelAiEnabled').checked,

      automation_enabled:
        $('channelAutomationEnabled').checked,

      followups_enabled:
        $('channelFollowupsEnabled').checked,

      ai_mode:
        $('channelMode').value
    });

    note(
      state.channel + ' controls saved.'
    );

    await load();

  } catch (e) {
    note(
      e.message || 'Unable to save channel controls',
      false
    );
  }
}

async function saveLimits() {
  try {
    await fn({
      action: 'update_limits',

      channel:
        state.channel,

      daily_message_limit:
        Number(
          $('limitDailyMsg').value || 0
        ),

      hourly_message_limit:
        Number(
          $('limitHourlyMsg').value || 0
        ),

      minimum_message_delay_seconds:
        Number(
          $('limitDelay').value || 0
        ),

      daily_ai_token_budget:
        Number(
          $('limitDailyTokens').value || 0
        ),

      monthly_ai_token_budget:
        Number(
          $('limitMonthlyTokens').value || 0
        ),

      maximum_response_tokens:
        Number(
          $('limitMaxTokens').value || 0
        ),

      maximum_response_characters:
        Number(
          $('limitMaxChars').value || 0
        ),

      minimum_response_characters:
        Number(
          $('limitMinChars').value || 0
        ),

      maximum_message_parts:
        Number(
          $('limitMaxParts').value || 1
        ),

      budget_exhaustion_behavior:
        $('budgetBehavior').value,

      limit_exhaustion_behavior:
        $('limitBehavior').value
    });

    note(
      state.channel + ' limits saved.'
    );

    await load();

  } catch (e) {
    note(
      e.message || 'Unable to save limits',
      false
    );
  }
}

document.addEventListener(
  'change',
  async (event) => {

    const permissionKey =
      event.target.dataset?.permission;

    if (!permissionKey) return;

    try {

      await fn({
        action: 'set_permission',

        channel:
          state.channel,

        permission_key:
          permissionKey,

        enabled:
          event.target.checked
      });

      note(
        permissionKey + ' updated.'
      );

      await load();

    } catch (error) {

      note(
        error.message ||
          'Unable to update permission',
        false
      );

      await load();
    }
  }
);

load();
