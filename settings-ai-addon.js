/* =========================================================
   GLIME - SETTINGS > AI  (v2: Central AI Brain + Knowledge Base)
   ---------------------------------------------------------
   One Client AI Brain per client. WhatsApp, Instagram and Voice
   all read the same brain and the same central knowledge.

   Tabs:  Behaviour | Knowledge | Channels | Handoff | Health

   Data sources (all client-scoped, resolved from the signed-in user):
   - client_ai_brains               AI behaviour, handoff rules, lead capture config
   - client_knowledge_items         FAQs, policies, rules, specialist knowledge
                                    (through the client-storage-knowledge Edge Function)
   - client_business_profiles       central business profile
   - lead_custom_field_definitions  custom lead-capture fields
   - offers / offer_versions        read-only counts (managed in Services)
   - client_ai_brain_channels, client_channel_settings,
     client_channel_connections     read-only channel linkage

   Never exposed here: model_provider, model_name,
   system_instructions, safety_instructions (GLIME controlled).
========================================================= */
(() => {
  'use strict';

  const shell = window.GLIME_SETTINGS;
  if (!shell?.state || !shell?.api || !shell?.ui) {
    throw new Error('GLIME Settings shell is not initialized.');
  }

  const { state, api, ui } = shell;
  const db = api.supabase;
  const esc = ui.escapeHtml;

  /* ---------------------------------------------------------
     CONSTANTS
  --------------------------------------------------------- */
  const BRAIN_COLS =
    'id,client_id,brain_key,name,status,language,tone,sales_instructions,' +
    'knowledge_enabled,conversation_memory_enabled,lead_context_enabled,' +
    'goal,greeting,handoff_rules,lead_capture_config,created_at,updated_at';

  const GOALS = [
    ['generate_leads', 'Generate Leads'],
    ['book_appointments', 'Book Appointments'],
    ['answer_questions', 'Answer Customer Questions'],
    ['sell', 'Sell Products / Services'],
    ['support', 'Support Customers'],
    ['collect_payments', 'Collect Payments'],
    ['general_assistant', 'General Business Assistant'],
    ['custom', 'Custom']
  ];

  const LANGS = [
    ['hinglish', 'Hinglish'],
    ['hindi', 'Hindi'],
    ['english', 'English'],
    ['gujarati', 'Gujarati'],
    ['marathi', 'Marathi'],
    ['punjabi', 'Punjabi'],
    ['tamil', 'Tamil'],
    ['telugu', 'Telugu'],
    ['bengali', 'Bengali'],
    ['auto', 'Auto (match the customer)']
  ];

  const TONES = [
    ['friendly', 'Friendly'],
    ['professional', 'Professional'],
    ['premium', 'Premium'],
    ['casual', 'Casual'],
    ['persuasive', 'Persuasive'],
    ['helpful', 'Helpful'],
    ['formal', 'Formal'],
    ['custom', 'Custom']
  ];

  const POLICY_CATS = [
    ['cancellation', 'Cancellation'],
    ['refund', 'Refund'],
    ['payment', 'Payment'],
    ['shipping', 'Shipping'],
    ['return', 'Return'],
    ['warranty', 'Warranty'],
    ['privacy', 'Privacy'],
    ['other', 'Other']
  ];

  const SPECIALIST_CATS = [
    ['lead_generation', 'Lead Generation'],
    ['appointments', 'Appointments'],
    ['support', 'Support'],
    ['negotiation', 'Negotiation'],
    ['collections', 'Collections']
  ];

  const SPECIALIST_HINTS = {
    lead_generation: 'Lead qualification rules, ideal customer details, follow-up rules',
    appointments: 'Booking rules, timings, rescheduling and no-show policy',
    support: 'Product help, troubleshooting steps, common support answers',
    negotiation: 'Allowed discounts, negotiation limits, payment plans',
    collections: 'Payment reminder rules, overdue process, approved wording'
  };

  const DAYS = [
    ['monday', 'Monday'],
    ['tuesday', 'Tuesday'],
    ['wednesday', 'Wednesday'],
    ['thursday', 'Thursday'],
    ['friday', 'Friday'],
    ['saturday', 'Saturday'],
    ['sunday', 'Sunday']
  ];

  const BUSINESS_LANGS = [
    ['hi', 'Hindi'],
    ['en', 'English'],
    ['gu', 'Gujarati'],
    ['mr', 'Marathi'],
    ['pa', 'Punjabi'],
    ['ta', 'Tamil'],
    ['te', 'Telugu'],
    ['bn', 'Bengali']
  ];

  const CORE_FIELDS = [
    // key, default label, type, enabled by default, required by default
    ['name', 'Name', 'text', true, true],
    ['phone', 'Phone number', 'text', true, true],
    ['email', 'Email', 'text', false, false],
    ['service', 'Service interested in', 'text', true, false],
    ['preferred_date', 'Preferred date', 'date', false, false],
    ['budget', 'Budget', 'number', false, false],
    ['location', 'Location', 'text', false, false],
    ['message', 'Message / requirement', 'text', true, false]
  ];

  const CUSTOM_TYPES = [
    ['text', 'Text'],
    ['number', 'Number'],
    ['boolean', 'Yes / No'],
    ['date', 'Date'],
    ['select', 'Single choice'],
    ['multiselect', 'Multiple choice']
  ];

  const HANDOFF_RULES = [
    ['explicit_request', 'Customer asks for a human', 'The customer explicitly asks to talk to a person.'],
    ['complaint', 'Complaint or escalation', 'The customer is unhappy or the issue needs escalation.'],
    ['missing_info', 'Missing business information', 'AI has no approved answer and cannot respond safely.'],
    ['high_value', 'High-value lead', 'The enquiry looks like a big or important opportunity.'],
    ['negotiation_limit', 'Negotiation limit exceeded', 'The customer asks for more than your allowed limits.'],
    ['sensitive', 'Sensitive situation', 'Health, legal, safety or other delicate topics.']
  ];

  const DEFAULT_HANDOFF_MESSAGE =
    'This needs a quick check from our team. Please share your preferred contact details and we will follow up.';

  const TABS = [
    ['behaviour', 'Behaviour'],
    ['knowledge', 'Knowledge'],
    ['channels', 'Channels'],
    ['handoff', 'Handoff'],
    ['health', 'Health']
  ];

  const KB_SECTIONS = [
    { key: 'profile', label: 'Business Profile', owner: 'Managed here' },
    { key: 'services', label: 'Services & Offers', owner: 'Managed in Services' },
    { key: 'faq', label: 'FAQs', owner: 'Managed here', scope: 'faq' },
    { key: 'policy', label: 'Policies', owner: 'Managed here', scope: 'policy' },
    { key: 'rule', label: 'Business Rules', owner: 'Managed here', scope: 'rule' },
    { key: 'lead', label: 'Lead Capture', owner: 'Managed here' },
    { key: 'specialist', label: 'Specialist Knowledge', owner: 'Managed here', scope: 'specialist' }
  ];

  const EMPTY_TEXT = {
    faq: ['No FAQs added yet.', 'Add your most common customer questions so AI can answer consistently.'],
    policy: ['No policies added yet.', 'Add cancellation, refund, payment and shipping policies so AI never has to guess.'],
    rule: ['No business rules added yet.', 'Add hard rules such as maximum discount or when to escalate to a human.'],
    specialist: ['No specialist knowledge added yet.', 'Add focused guidance for lead generation, appointments, support, negotiation or collections.']
  };

  /* ---------------------------------------------------------
     MODULE STATE
  --------------------------------------------------------- */
  const M = {
    brain: null,
    brainError: null,
    identity: null,
    profile: null,
    profileError: null,
    items: [],
    itemsError: null,
    offers: { published: 0, draft: 0, archived: 0, names: [] },
    offersError: null,
    leadDefs: [],
    leadDefsError: null,
    brainChannels: [],
    tab: 'behaviour',
    kb: 'profile',
    dirty: false,
    editing: null,
    filter: { q: '', status: 'all' }
  };

  let ROOT = null;

  /* ---------------------------------------------------------
     SMALL HELPERS
  --------------------------------------------------------- */
  const clientId = () => state.client?.client_id || '';
  const errMsg = e => (e && (e.message || e.error_description)) || String(e || 'Unknown error');
  const q = sel => (ROOT ? ROOT.querySelector(sel) : null);
  const qa = sel => (ROOT ? Array.from(ROOT.querySelectorAll(sel)) : []);
  const val = sel => (q(sel)?.value ?? '').toString().trim();
  const checked = sel => q(sel)?.checked === true;
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

  function sw(id, on, attrs = '') {
    return `<label class="sw"><input type="checkbox" id="${esc(id)}" ${on ? 'checked' : ''} ${attrs}><span></span></label>`;
  }

  function opts(list, selected) {
    return list
      .map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(l)}</option>`)
      .join('');
  }

  function labelOf(list, key) {
    const f = list.find(x => x[0] === key);
    return f ? f[1] : key || '';
  }

  function markDirty() {
    M.dirty = true;
  }

  async function withBusy(btn, busyLabel, fn) {
    const original = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = busyLabel;
    }
    try {
      return await fn();
    } finally {
      if (btn && btn.isConnected) {
        btn.disabled = false;
        btn.textContent = original;
      }
    }
  }

  function slug(text) {
    const s = String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    return s || 'field';
  }

  /* ---------------------------------------------------------
     DATA ACCESS
  --------------------------------------------------------- */
  async function knowledgeApi(action, payload = {}) {
    const { data, error } = await db.functions.invoke('client-storage-knowledge', {
      body: { action, ...payload }
    });

    if (error) {
      let message = error.message || 'Knowledge request failed.';
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      } catch (_) { /* keep default message */ }
      throw new Error(message);
    }

    if (!data || data.ok === false) {
      throw new Error(data?.error || 'Knowledge request failed.');
    }

    return data;
  }

  async function fetchBrain() {
    const { data, error } = await db
      .from('client_ai_brains')
      .select(BRAIN_COLS)
      .eq('client_id', clientId())
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Central Client AI Brain is not initialized for this client.');
    return data;
  }

  async function fetchBrainChannels() {
    const { data, error } = await db
      .from('client_ai_brain_channels')
      .select('channel,enabled')
      .eq('client_id', clientId());
    if (error) throw error;
    return data || [];
  }

  async function fetchIdentity() {
    const { data, error } = await db
      .from('client_data')
      .select('business_name,name,phone')
      .eq('client_id', clientId())
      .maybeSingle();
    if (error) throw error;
    return data || {};
  }

  async function fetchProfile() {
    const { data, error } = await db
      .from('client_business_profiles')
      .select('client_id,business_type,description,location,whatsapp,website,instagram,working_hours,holidays,languages,updated_at')
      .eq('client_id', clientId())
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function fetchItems() {
    const result = await knowledgeApi('list_knowledge');
    return Array.isArray(result.items) ? result.items : [];
  }

  async function fetchOffers() {
    const summary = { published: 0, draft: 0, archived: 0, names: [] };
    const { data, error } = await db
      .from('offers')
      .select('id,name,status,offer_versions!offers_current_version_fk(status)')
      .eq('client_id', clientId())
      .limit(500);

    if (error) throw error;

    (data || []).forEach(o => {
      const v = Array.isArray(o.offer_versions) ? o.offer_versions[0] : o.offer_versions;
      const vs = v?.status;
      if (o.status === 'archived' || vs === 'archived') {
        summary.archived += 1;
      } else if (o.status === 'active' && vs === 'published') {
        summary.published += 1;
        if (o.name) summary.names.push(o.name);
      } else {
        summary.draft += 1;
      }
    });

    return summary;
  }

  async function fetchLeadDefs() {
    const { data, error } = await db
      .from('lead_custom_field_definitions')
      .select('id,field_key,field_label,field_type,options,is_required,is_active,sort_order')
      .eq('client_id', clientId())
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function loadAll() {
    const attempt = async fn => {
      try {
        return { ok: true, v: await fn() };
      } catch (e) {
        console.error('[GLIME AI Settings] load error:', e);
        return { ok: false, e };
      }
    };

    const [brain, channels, identity, profile, items, offers, leadDefs] = await Promise.all([
      attempt(fetchBrain),
      attempt(fetchBrainChannels),
      attempt(fetchIdentity),
      attempt(fetchProfile),
      attempt(fetchItems),
      attempt(fetchOffers),
      attempt(fetchLeadDefs)
    ]);

    M.brain = brain.ok ? brain.v : null;
    M.brainError = brain.ok ? null : errMsg(brain.e);
    M.brainChannels = channels.ok ? channels.v : [];
    M.identity = identity.ok ? identity.v : null;
    M.profile = profile.ok ? profile.v : null;
    M.profileError = profile.ok ? null : errMsg(profile.e);
    M.items = items.ok ? items.v : [];
    M.itemsError = items.ok ? null : errMsg(items.e);
    M.offers = offers.ok ? offers.v : { published: 0, draft: 0, archived: 0, names: [] };
    M.offersError = offers.ok ? null : errMsg(offers.e);
    M.leadDefs = leadDefs.ok ? leadDefs.v : [];
    M.leadDefsError = leadDefs.ok ? null : errMsg(leadDefs.e);
  }

  /* ---------------------------------------------------------
     KNOWLEDGE ITEM HELPERS
  --------------------------------------------------------- */
  function normalize(item) {
    let scope = item.knowledge_scope || 'general';
    let category = item.category || '';

    if (scope === 'general') {
      const legacy = item.metadata && item.metadata.use_case_category;
      if (SPECIALIST_CATS.some(c => c[0] === legacy)) {
        scope = 'specialist';
        category = legacy;
      }
    }
    return { scope, category };
  }

  function itemsFor(sectionScope) {
    return M.items.filter(item => {
      const n = normalize(item);
      if (sectionScope === 'specialist') return n.scope === 'specialist' || n.scope === 'general';
      return n.scope === sectionScope;
    });
  }

  const activeCount = scope => itemsFor(scope).filter(i => i.status === 'active').length;

  /* ---------------------------------------------------------
     PROFILE / LEAD CONFIG HELPERS
  --------------------------------------------------------- */
  function hasHours(wh) {
    return isObj(wh) && DAYS.some(([d]) => isObj(wh[d]) && wh[d].enabled === true);
  }

  function profileScore() {
    const p = M.profile;
    if (!p) return 0;
    let n = 0;
    if (String(p.business_type || '').trim()) n += 1;
    if (String(p.description || '').trim()) n += 1;
    if (String(p.location || '').trim()) n += 1;
    if (hasHours(p.working_hours)) n += 1;
    return n;
  }

  function leadConfig() {
    const cfg = isObj(M.brain?.lead_capture_config) ? M.brain.lead_capture_config : {};
    const saved = isObj(cfg.core_fields) ? cfg.core_fields : null;

    const rows = CORE_FIELDS.map(([key, label, type, en, req], index) => {
      const s = saved && isObj(saved[key]) ? saved[key] : null;
      return {
        key,
        type,
        enabled: s ? s.enabled === true : saved ? false : en,
        required: s ? s.required === true : saved ? false : req,
        label: s && s.label ? String(s.label) : label,
        defaultLabel: label,
        sort: s && Number.isFinite(Number(s.sort_order)) ? Number(s.sort_order) : (index + 1) * 10
      };
    }).sort((a, b) => a.sort - b.sort);

    return {
      configured: !!saved,
      enabled: cfg.enabled !== false,
      rows
    };
  }

  function handoffConfig() {
    const h = isObj(M.brain?.handoff_rules) ? M.brain.handoff_rules : {};
    const rules = isObj(h.rules) ? h.rules : {};
    return {
      configured: Object.keys(h).length > 0,
      enabled: h.enabled === true,
      rules: Object.fromEntries(HANDOFF_RULES.map(([k]) => [k, h.rules ? rules[k] === true : true])),
      message: typeof h.message === 'string' && h.message ? h.message : DEFAULT_HANDOFF_MESSAGE
    };
  }

  /* ---------------------------------------------------------
     READINESS / HEALTH
  --------------------------------------------------------- */
  function computeHealth() {
    const b = M.brain;
    const rows = [];

    // AI Behaviour
    let behaviour;
    if (!b) {
      behaviour = ['miss', M.brainError || 'AI brain unavailable.'];
    } else if (!b.goal && !String(b.sales_instructions || '').trim() && !String(b.greeting || '').trim()) {
      behaviour = ['miss', 'Choose an AI goal and add a greeting.'];
    } else if (!b.goal || !b.language || !b.tone) {
      behaviour = ['warn', 'Choose an AI goal to finish setup.'];
    } else if (!String(b.greeting || '').trim() && !String(b.sales_instructions || '').trim()) {
      behaviour = ['warn', 'Add a greeting or sales instructions.'];
    } else {
      behaviour = ['ok', `${labelOf(GOALS, b.goal) || 'Goal set'} · ${labelOf(LANGS, b.language)} · ${labelOf(TONES, b.tone)}`];
    }
    rows.push({ key: 'behaviour', label: 'AI Behaviour', owner: 'Managed here', state: behaviour[0], detail: behaviour[1], go: ['behaviour'] });

    // Business Profile
    const ps = profileScore();
    rows.push({
      key: 'profile',
      label: 'Business Profile',
      owner: 'Managed here',
      state: M.profileError ? 'warn' : ps >= 4 ? 'ok' : ps > 0 ? 'warn' : 'miss',
      detail: M.profileError ? 'Could not load profile.' : ps >= 4 ? 'Type, description, location and hours set.' : ps > 0 ? 'Add the missing profile details.' : 'No business profile yet.',
      go: ['knowledge', 'profile']
    });

    // Services
    const o = M.offers;
    rows.push({
      key: 'services',
      label: 'Services',
      owner: 'Managed in Services',
      state: M.offersError ? 'warn' : o.published > 0 ? 'ok' : o.draft > 0 ? 'warn' : 'miss',
      detail: M.offersError ? 'Could not load services.' : o.published > 0 ? `${o.published} published` : o.draft > 0 ? `${o.draft} not published yet` : 'No services yet.',
      go: ['knowledge', 'services']
    });

    // FAQs
    const faq = activeCount('faq');
    rows.push({
      key: 'faq',
      label: 'FAQs',
      owner: 'Managed here',
      state: M.itemsError ? 'warn' : faq >= 3 ? 'ok' : faq > 0 ? 'warn' : 'miss',
      detail: M.itemsError ? 'Could not load knowledge.' : `${faq} active${faq > 0 && faq < 3 ? ' - add a few more' : ''}`,
      go: ['knowledge', 'faq']
    });

    // Policies
    const pol = activeCount('policy');
    rows.push({
      key: 'policy',
      label: 'Policies',
      owner: 'Managed here',
      state: M.itemsError ? 'warn' : pol > 0 ? 'ok' : 'miss',
      detail: M.itemsError ? 'Could not load knowledge.' : `${pol} active`,
      go: ['knowledge', 'policy']
    });

    // Lead Capture
    const lc = leadConfig();
    const enabledFields = lc.rows.filter(r => r.enabled).length;
    rows.push({
      key: 'lead',
      label: 'Lead Capture',
      owner: 'Managed here',
      state: !lc.configured ? 'miss' : !lc.enabled || enabledFields === 0 ? 'warn' : 'ok',
      detail: !lc.configured ? 'Not configured yet.' : !lc.enabled ? 'Lead capture is switched off.' : `${enabledFields} core field${enabledFields === 1 ? '' : 's'} + ${M.leadDefs.filter(d => d.is_active).length} custom`,
      go: ['knowledge', 'lead']
    });

    // Business Rules
    const rule = activeCount('rule');
    rows.push({
      key: 'rule',
      label: 'Business Rules',
      owner: 'Managed here',
      state: M.itemsError ? 'warn' : rule > 0 ? 'ok' : 'miss',
      detail: M.itemsError ? 'Could not load knowledge.' : `${rule} active`,
      go: ['knowledge', 'rule']
    });

    // Specialist
    const spec = activeCount('specialist');
    rows.push({
      key: 'specialist',
      label: 'Specialist Knowledge',
      owner: 'Managed here',
      state: M.itemsError ? 'warn' : spec > 0 ? 'ok' : 'miss',
      detail: M.itemsError ? 'Could not load knowledge.' : `${spec} active`,
      go: ['knowledge', 'specialist']
    });

    // Overall
    const notes = [];
    let overall;

    if (!state.client?.client_id) {
      overall = 'NOT_READY';
      notes.push('Client identity is unavailable. Sign in again.');
    } else if (!b) {
      overall = 'NOT_READY';
      notes.push('The central AI brain is unavailable for this client.');
    } else if (behaviour[0] === 'miss') {
      overall = 'NOT_READY';
      notes.push('AI Behaviour is not set up yet.');
    } else {
      const sources =
        M.offers.published + M.items.filter(i => i.status === 'active').length + (ps > 0 ? 1 : 0);
      const profileOk = ps > 0;
      const behaviourOk = behaviour[0] === 'ok';
      const noneCritical = !M.itemsError;
      overall = behaviourOk && profileOk && sources > 0 && noneCritical ? 'READY' : 'NEEDS_ATTENTION';
      if (!profileOk) notes.push('Add at least some Business Profile details.');
      if (sources === 0) notes.push('Add at least one service, FAQ, policy or rule.');
      if (M.itemsError) notes.push('Knowledge could not be loaded: ' + M.itemsError);
    }

    if (b && b.status !== 'active') {
      notes.push('AI is paused. Customers will not receive AI replies until you set it to Active.');
      if (overall === 'READY') overall = 'NEEDS_ATTENTION';
    }
    if (b && b.knowledge_enabled !== true) {
      notes.push('Knowledge Usage is off, so AI ignores everything in the Knowledge Base.');
      if (overall === 'READY') overall = 'NEEDS_ATTENTION';
    }
    if (b) {
      const attached = ['whatsapp', 'instagram'].filter(c => M.brainChannels.some(r => r.channel === c && r.enabled !== false));
      if (!attached.length) {
        notes.push('No channel is attached to the AI brain yet. It attaches automatically on the first AI reply.');
      }
    }

    return { overall, rows, notes };
  }

  const STATE_GLYPH = { ok: '✓', warn: '⚠', miss: '✕' };
  const STATE_WORD = { ok: 'Complete', warn: 'Needs attention', miss: 'Missing' };
  const OVERALL_LABEL = {
    READY: '✓ READY',
    NEEDS_ATTENTION: '⚠ NEEDS ATTENTION',
    NOT_READY: '✕ NOT READY'
  };

  /* ---------------------------------------------------------
     STYLES
  --------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById('glimeAiSettingsStyles')) return;

    const style = document.createElement('style');
    style.id = 'glimeAiSettingsStyles';
    style.textContent = `
      .ai-root{color:#fff}
      .ai-root *{box-sizing:border-box}
      .ai-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      .ai-head h2{font-size:1.25rem;line-height:1.2}
      .ai-head p{font-size:.78rem;color:rgba(255,255,255,.72);margin-top:4px;max-width:560px}
      .ai-ready{flex:none;font-size:.68rem;font-weight:800;letter-spacing:.06em;padding:7px 11px;border-radius:99px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.06);white-space:nowrap}
      .ai-tabs{display:flex;gap:8px;overflow-x:auto;padding:2px 0 12px;margin-bottom:6px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
      .ai-tabs::-webkit-scrollbar{display:none}
      .ai-tab{flex:none;min-height:42px;padding:0 16px;border-radius:12px;border:1px solid var(--bd);background:var(--surf);color:#fff;font-size:.8rem;font-weight:800}
      .ai-tab.active{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.55)}
      .ai-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:16px;margin-bottom:14px}
      .ai-card h3{font-size:.98rem;margin-bottom:3px}
      .ai-card .ai-sub{font-size:.74rem;color:rgba(255,255,255,.72);margin-bottom:12px}
      .ai-sub{color:rgba(255,255,255,.72);font-size:.74rem}
      .ai-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .ai-full{grid-column:1/-1}
      .ai-field label.ai-label{display:block;font-size:.74rem;font-weight:800;margin-bottom:6px}
      .ai-field .ai-hint{display:block;font-size:.68rem;color:rgba(255,255,255,.62);margin-top:5px}
      .ai-input,.ai-select,.ai-textarea{width:100%;background:var(--surf2);color:#fff;border:1px solid var(--bd);border-radius:12px;padding:12px;font-size:16px;outline:none;font-family:inherit}
      .ai-input::placeholder,.ai-textarea::placeholder{color:rgba(255,255,255,.42)}
      .ai-input:focus,.ai-select:focus,.ai-textarea:focus{border-color:rgba(255,255,255,.6)}
      .ai-input[readonly]{opacity:.75}
      .ai-textarea{min-height:110px;resize:vertical;line-height:1.5}
      .ai-select option{background:#0b1520;color:#fff}
      .ai-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-top:1px solid var(--bd)}
      .ai-toggle-row:first-of-type{border-top:0}
      .ai-toggle-row b{display:block;font-size:.82rem}
      .ai-toggle-row small{display:block;font-size:.7rem;color:rgba(255,255,255,.66);margin-top:2px;line-height:1.45}
      .ai-actions{position:sticky;bottom:0;z-index:5;display:flex;gap:10px;flex-wrap:wrap;padding:12px 0 6px;margin-top:10px;background:linear-gradient(to top,var(--bg) 72%,rgba(7,16,22,0))}
      .ai-btn{min-height:44px;padding:0 18px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:.8rem;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;cursor:pointer}
      .ai-btn.primary{background:linear-gradient(105deg,var(--gr),var(--cy));color:#031014;border:0}
      .ai-btn.danger{color:var(--rd);border-color:rgba(255,130,145,.5)}
      .ai-btn.small{min-height:36px;padding:0 12px;font-size:.74rem;border-radius:10px}
      .ai-btn:disabled{opacity:.5;cursor:default}
      .ai-note{font-size:.7rem;color:rgba(255,255,255,.66);margin-top:10px;line-height:1.5}
      .ai-pill{display:inline-block;font-size:.64rem;font-weight:800;padding:3px 9px;border-radius:99px;border:1px solid rgba(255,255,255,.28);color:#fff;white-space:nowrap}
      .ai-empty{border:1px dashed rgba(255,255,255,.22);border-radius:14px;padding:22px 16px;text-align:center;font-size:.78rem;color:rgba(255,255,255,.8)}
      .ai-empty b{display:block;margin-bottom:4px;font-size:.84rem;color:#fff}
      .ai-err{border:1px solid rgba(255,130,145,.45);border-radius:14px;padding:14px;font-size:.78rem;color:#fff;background:rgba(255,130,145,.07);margin-bottom:12px}
      .ai-err b{display:block;margin-bottom:3px}
      .ai-loading{padding:26px 0;text-align:center;font-size:.8rem;color:rgba(255,255,255,.75)}
      .ai-kbgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .ai-kbcard{text-align:left;color:#fff;background:var(--surf);border:1px solid var(--bd);border-radius:16px;padding:13px;min-height:92px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;cursor:pointer}
      .ai-kbcard.active{border-color:rgba(255,255,255,.7);background:rgba(255,255,255,.08)}
      .ai-kbcard b{font-size:.82rem;line-height:1.25}
      .ai-kbcard small{display:block;font-size:.66rem;color:rgba(255,255,255,.64);margin-top:2px}
      .ai-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
      .ai-tools .ai-input{flex:1 1 180px;min-width:0}
      .ai-chips{display:flex;gap:6px;flex-wrap:wrap}
      .ai-fchip{min-height:36px;padding:0 12px;border-radius:99px;border:1px solid var(--bd);background:transparent;color:#fff;font-size:.72rem;font-weight:800;cursor:pointer}
      .ai-fchip.active{background:#fff;color:#031014;border-color:#fff}
      .ai-item{border:1px solid var(--bd);background:var(--surf2);border-radius:14px;padding:13px;margin-bottom:10px}
      .ai-item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .ai-item h4{font-size:.86rem;line-height:1.35;word-break:break-word}
      .ai-item-meta{display:flex;gap:6px;flex-wrap:wrap;margin:7px 0}
      .ai-item p{font-size:.76rem;color:rgba(255,255,255,.82);line-height:1.55;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .ai-item-actions{display:flex;gap:8px;margin-top:10px}
      .ai-editor{border:1px solid rgba(255,255,255,.4);background:var(--surf2);border-radius:16px;padding:14px;margin-bottom:14px}
      .ai-editor h3{font-size:.92rem;margin-bottom:10px}
      .ai-stat{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}
      .ai-stat div{background:var(--surf2);border:1px solid var(--bd);border-radius:14px;padding:12px;text-align:center}
      .ai-stat b{display:block;font-size:1.25rem}
      .ai-stat span{font-size:.68rem;color:rgba(255,255,255,.72)}
      .ai-hours{display:grid;gap:8px}
      .ai-hour{display:grid;grid-template-columns:minmax(92px,1fr) auto minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:center}
      .ai-hour span.day{font-size:.78rem;font-weight:700}
      .ai-hour .ai-input{padding:9px}
      .ai-hol{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:8px;margin-bottom:8px;align-items:center}
      .ai-lchips{display:flex;gap:7px;flex-wrap:wrap}
      .ai-lchip input{display:none}
      .ai-lchip span{display:inline-flex;align-items:center;min-height:38px;padding:0 14px;border-radius:99px;border:1px solid var(--bd);font-size:.76rem;font-weight:700;cursor:pointer}
      .ai-lchip input:checked+span{background:#fff;color:#031014;border-color:#fff}
      .ai-core{border:1px solid var(--bd);background:var(--surf2);border-radius:14px;padding:12px;margin-bottom:10px}
      .ai-core-top{display:flex;gap:8px;align-items:center;margin-bottom:10px}
      .ai-core-top .ai-input{flex:1;min-width:0;padding:10px}
      .ai-core-flags{display:flex;gap:18px;flex-wrap:wrap;align-items:center}
      .ai-core-flags label{display:flex;align-items:center;gap:8px;font-size:.74rem;font-weight:700}
      .ai-order{display:flex;gap:4px;flex:none}
      .ai-order button{width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:transparent;color:#fff;font-size:.9rem;cursor:pointer}
      .ai-health-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--bd)}
      .ai-health-row:first-of-type{border-top:0}
      .ai-glyph{flex:none;width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:900}
      .ai-health-main{flex:1;min-width:0}
      .ai-health-main b{display:block;font-size:.84rem}
      .ai-health-main small{display:block;font-size:.7rem;color:rgba(255,255,255,.7);line-height:1.4}
      .ai-overall{text-align:center;padding:18px 12px}
      .ai-overall .big{font-size:1.15rem;font-weight:900;letter-spacing:.05em}
      .ai-flow{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;font-size:.74rem;font-weight:800;margin:12px 0}
      .ai-flow span.box{border:1px solid rgba(255,255,255,.35);border-radius:10px;padding:8px 12px;background:var(--surf2)}
      .ai-flow span.arrow{opacity:.7}
      .ai-chrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px solid var(--bd);flex-wrap:wrap}
      .ai-chrow:first-of-type{border-top:0}
      .ai-chrow b{font-size:.84rem}
      .ai-chrow .tags{display:flex;gap:6px;flex-wrap:wrap}
      .hidden{display:none!important}
      @media(max-width:640px){
        .ai-grid{grid-template-columns:1fr}
        .ai-head{flex-direction:column}
        .ai-hour{grid-template-columns:1fr auto;grid-template-areas:"day sw" "open close"}
        .ai-hour span.day{grid-area:day}
        .ai-hol{grid-template-columns:1fr auto}
        .ai-hol input[type=date]{grid-column:1/-1}
        .ai-btn{flex:1}
        .ai-actions .ai-btn{flex:1 1 100%}
        .ai-item-actions .ai-btn{flex:1}
      }
      @media(min-width:900px){
        .ai-kbgrid{grid-template-columns:repeat(4,minmax(0,1fr))}
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------
     SHELL (header + tabs + pane)
  --------------------------------------------------------- */
  function renderShell() {
    if (!ROOT) return;

    const health = computeHealth();

    ROOT.innerHTML = `
      <div class="ai-head">
        <div>
          <h2>AI</h2>
          <p>One central AI brain and one central knowledge base. WhatsApp, Instagram and Voice all use exactly the same information.</p>
        </div>
        <span class="ai-ready" id="aiReadyBadge">${esc(OVERALL_LABEL[health.overall])}</span>
      </div>

      <div class="ai-tabs" role="tablist">
        ${TABS.map(([k, l]) => `
          <button type="button" role="tab" class="ai-tab ${M.tab === k ? 'active' : ''}" data-act="tab" data-v="${k}">${esc(l)}</button>
        `).join('')}
      </div>

      <div id="aiPane">${paneHtml(health)}</div>
    `;
  }

  function paneHtml(health) {
    if (M.tab === 'behaviour') return behaviourHtml();
    if (M.tab === 'knowledge') return knowledgeHtml();
    if (M.tab === 'channels') return channelsHtml();
    if (M.tab === 'handoff') return handoffHtml();
    return healthHtml(health || computeHealth());
  }

  function brainMissingHtml() {
    return `
      <div class="ai-err">
        <b>Central Client AI Brain is not available.</b>
        ${esc(M.brainError || 'The AI brain has not been initialized for this client.')}
      </div>
      <div class="ai-actions"><button class="ai-btn primary" data-act="retry">Try again</button></div>
    `;
  }

  function go(tab, kb) {
    if (M.dirty && !window.confirm('You have unsaved changes. Discard them?')) return false;
    M.dirty = false;
    M.editing = null;
    if (tab) M.tab = tab;
    if (kb) M.kb = kb;
    renderShell();
    ROOT?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    return true;
  }

  /* ---------------------------------------------------------
     TAB 1 - BEHAVIOUR
  --------------------------------------------------------- */
  function behaviourHtml() {
    const b = M.brain;
    if (!b) return brainMissingHtml();

    const goalPreset = GOALS.some(g => g[0] === b.goal && g[0] !== 'custom');
    const goalMode = b.goal ? (goalPreset ? b.goal : 'custom') : '';
    const goalCustom = b.goal && !goalPreset && b.goal !== 'custom' ? b.goal : '';

    const tonePreset = TONES.some(t => t[0] === b.tone && t[0] !== 'custom');
    const toneMode = b.tone ? (tonePreset ? b.tone : 'custom') : 'friendly';
    const toneCustom = b.tone && !tonePreset && b.tone !== 'custom' ? b.tone : '';

    const langKnown = LANGS.some(l => l[0] === b.language);
    const langList = langKnown || !b.language ? LANGS : [[b.language, b.language], ...LANGS];

    return `
      <div data-form="behaviour">
        <div class="ai-card">
          <h3>AI Behaviour</h3>
          <p class="ai-sub">How your AI talks to customers on every channel.</p>

          <div class="ai-grid">
            <div class="ai-field">
              <label class="ai-label" for="aiStatus">AI status</label>
              <select class="ai-select" id="aiStatus">
                <option value="active" ${b.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="paused" ${b.status === 'paused' ? 'selected' : ''}>Paused</option>
              </select>
              <span class="ai-hint">Paused means AI sends no replies on any channel.</span>
            </div>

            <div class="ai-field">
              <label class="ai-label" for="aiGoal">AI goal</label>
              <select class="ai-select" id="aiGoal">
                <option value="" disabled ${goalMode ? '' : 'selected'}>Select a goal…</option>
                ${opts(GOALS, goalMode)}
              </select>
              <input class="ai-input ${goalMode === 'custom' ? '' : 'hidden'}" id="aiGoalCustom" style="margin-top:8px" maxlength="300" placeholder="Describe your goal" value="${esc(goalCustom)}">
            </div>

            <div class="ai-field">
              <label class="ai-label" for="aiLanguage">Language</label>
              <select class="ai-select" id="aiLanguage">${opts(langList, b.language || 'hinglish')}</select>
            </div>

            <div class="ai-field">
              <label class="ai-label" for="aiTone">Tone</label>
              <select class="ai-select" id="aiTone">${opts(TONES, toneMode)}</select>
              <input class="ai-input ${toneMode === 'custom' ? '' : 'hidden'}" id="aiToneCustom" style="margin-top:8px" maxlength="120" placeholder="Describe your tone" value="${esc(toneCustom)}">
            </div>

            <div class="ai-field ai-full">
              <label class="ai-label" for="aiGreeting">Greeting</label>
              <textarea class="ai-textarea" id="aiGreeting" style="min-height:80px" maxlength="500" placeholder="Hi! Welcome to our store. How can I help you today?">${esc(b.greeting || '')}</textarea>
              <span class="ai-hint">Used when a new conversation starts or a customer says hello.</span>
            </div>

            <div class="ai-field ai-full">
              <label class="ai-label" for="aiSales">Sales instructions</label>
              <textarea class="ai-textarea" id="aiSales" maxlength="5000" placeholder="Describe how AI should sell, what to highlight and what to avoid…">${esc(b.sales_instructions || '')}</textarea>
            </div>
          </div>
        </div>

        <div class="ai-card">
          <h3>What AI is allowed to use</h3>
          <p class="ai-sub">Switch these on so replies feel informed and personal.</p>

          <div class="ai-toggle-row">
            <div><b>Knowledge usage</b><small>AI uses your Business Profile, services, FAQs, policies and rules.</small></div>
            ${sw('aiKnowledge', b.knowledge_enabled === true)}
          </div>
          <div class="ai-toggle-row">
            <div><b>Conversation memory</b><small>AI remembers earlier messages in the same conversation.</small></div>
            ${sw('aiMemory', b.conversation_memory_enabled === true)}
          </div>
          <div class="ai-toggle-row">
            <div><b>Lead context</b><small>AI sees the lead details already collected for this customer.</small></div>
            ${sw('aiLeadCtx', b.lead_context_enabled === true)}
          </div>

          <p class="ai-note">AI provider, model and core safety rules are managed by GLIME and cannot be edited here.</p>
        </div>

        <div class="ai-actions">
          <button class="ai-btn primary" data-act="save-behaviour">Save Changes</button>
        </div>
      </div>
    `;
  }

  async function saveBehaviour(btn) {
    const b = M.brain;
    if (!b) return;

    const goalSel = val('#aiGoal');
    const goal = goalSel === 'custom' ? val('#aiGoalCustom') : goalSel;
    const language = val('#aiLanguage');
    const toneSel = val('#aiTone');
    const tone = toneSel === 'custom' ? val('#aiToneCustom') : toneSel;

    if (!goal) return ui.toast(goalSel === 'custom' ? 'Describe your custom goal.' : 'Choose an AI goal.', true);
    if (!language) return ui.toast('Choose a language.', true);
    if (!tone) return ui.toast(toneSel === 'custom' ? 'Describe your custom tone.' : 'Choose a tone.', true);

    const payload = {
      status: val('#aiStatus') === 'paused' ? 'paused' : 'active',
      goal,
      language,
      tone,
      greeting: val('#aiGreeting').slice(0, 500),
      sales_instructions: val('#aiSales').slice(0, 5000),
      knowledge_enabled: checked('#aiKnowledge'),
      conversation_memory_enabled: checked('#aiMemory'),
      lead_context_enabled: checked('#aiLeadCtx'),
      updated_by: state.session.user.id,
      updated_at: new Date().toISOString()
    };

    await withBusy(btn, 'Saving…', async () => {
      try {
        const { data, error } = await db
          .from('client_ai_brains')
          .update(payload)
          .eq('id', b.id)
          .eq('client_id', clientId())
          .select(BRAIN_COLS)
          .single();
        if (error) throw error;
        M.brain = data;
        M.dirty = false;
        renderShell();
        ui.toast('AI settings saved successfully.');
      } catch (e) {
        console.error('[GLIME AI Settings] save behaviour:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  /* ---------------------------------------------------------
     TAB 2 - KNOWLEDGE
  --------------------------------------------------------- */
  function kbStat(section) {
    if (section.key === 'profile') {
      const s = profileScore();
      return s >= 4 ? 'Complete' : s > 0 ? 'Incomplete' : 'Not set';
    }
    if (section.key === 'services') return `${M.offers.published} Published`;
    if (section.key === 'lead') {
      const lc = leadConfig();
      return lc.configured ? `${lc.rows.filter(r => r.enabled).length} fields` : 'Not set';
    }
    return `${activeCount(section.scope)} Active`;
  }

  function knowledgeHtml() {
    const section = KB_SECTIONS.find(s => s.key === M.kb) || KB_SECTIONS[0];

    return `
      <div class="ai-kbgrid">
        ${KB_SECTIONS.map(s => `
          <button type="button" class="ai-kbcard ${s.key === section.key ? 'active' : ''}" data-act="kb" data-v="${s.key}">
            <div><b>${esc(s.label)}</b><small>${esc(s.owner)}</small></div>
            <span class="ai-pill">${esc(kbStat(s))}</span>
          </button>
        `).join('')}
      </div>

      ${M.itemsError && section.scope ? `
        <div class="ai-err"><b>Could not load knowledge.</b>${esc(M.itemsError)}
          <div style="margin-top:10px"><button class="ai-btn small" data-act="retry">Try again</button></div>
        </div>` : ''}

      <div id="aiKbBody">${kbBodyHtml(section)}</div>
    `;
  }

  function kbBodyHtml(section) {
    if (section.key === 'profile') return profileHtml();
    if (section.key === 'services') return servicesHtml();
    if (section.key === 'lead') return leadHtml();
    return collectionHtml(section);
  }

  /* ---- Business Profile ---- */
  function profileHtml() {
    if (M.profileError) {
      return `<div class="ai-err"><b>Could not load the business profile.</b>${esc(M.profileError)}
        <div style="margin-top:10px"><button class="ai-btn small" data-act="retry">Try again</button></div></div>`;
    }

    const p = M.profile || {};
    const idn = M.identity || {};
    const wh = isObj(p.working_hours) ? p.working_hours : {};
    const hasSavedHours = Object.keys(wh).length > 0;
    const hols = Array.isArray(p.holidays) ? p.holidays : [];
    const langs = Array.isArray(p.languages) ? p.languages : [];

    return `
      <div data-form="profile">
        <div class="ai-card">
          <h3>Business Profile</h3>
          <p class="ai-sub">The facts about your business that AI shares with customers on every channel.</p>

          <div class="ai-grid">
            <div class="ai-field">
              <label class="ai-label">Business name</label>
              <input class="ai-input" value="${esc(idn.business_name || idn.name || '')}" readonly>
              <span class="ai-hint">Taken from your account details.</span>
            </div>
            <div class="ai-field">
              <label class="ai-label">Phone</label>
              <input class="ai-input" value="${esc(idn.phone || '')}" readonly>
              <span class="ai-hint">Taken from your account details.</span>
            </div>
            <div class="ai-field">
              <label class="ai-label" for="bpType">Business type</label>
              <input class="ai-input" id="bpType" list="bpTypeList" maxlength="120" placeholder="e.g. Salon, Clothing store, Clinic" value="${esc(p.business_type || '')}">
              <datalist id="bpTypeList">
                ${['Retail store', 'Clothing & fashion', 'Salon & beauty', 'Restaurant & food', 'Clinic & healthcare', 'Education & coaching', 'Real estate', 'Fitness & wellness', 'Travel & hospitality', 'Services & agency'].map(t => `<option value="${esc(t)}">`).join('')}
              </datalist>
            </div>
            <div class="ai-field">
              <label class="ai-label" for="bpLocation">Location</label>
              <input class="ai-input" id="bpLocation" maxlength="300" placeholder="Area, city" value="${esc(p.location || '')}">
            </div>
            <div class="ai-field ai-full">
              <label class="ai-label" for="bpDesc">Description</label>
              <textarea class="ai-textarea" id="bpDesc" style="min-height:90px" maxlength="1500" placeholder="What your business does, who it serves and what makes it special.">${esc(p.description || '')}</textarea>
            </div>
            <div class="ai-field">
              <label class="ai-label" for="bpWhatsapp">WhatsApp number</label>
              <input class="ai-input" id="bpWhatsapp" inputmode="tel" maxlength="40" placeholder="+91…" value="${esc(p.whatsapp || '')}">
            </div>
            <div class="ai-field">
              <label class="ai-label" for="bpWebsite">Website</label>
              <input class="ai-input" id="bpWebsite" inputmode="url" maxlength="200" placeholder="https://" value="${esc(p.website || '')}">
            </div>
            <div class="ai-field ai-full">
              <label class="ai-label" for="bpInstagram">Instagram</label>
              <input class="ai-input" id="bpInstagram" maxlength="100" placeholder="@yourbusiness" value="${esc(p.instagram || '')}">
            </div>
          </div>
        </div>

        <div class="ai-card">
          <h3>Working hours</h3>
          <p class="ai-sub">AI uses these when customers ask if you are open.</p>
          <div class="ai-hours">
            ${DAYS.map(([k, l]) => {
              const d = isObj(wh[k]) ? wh[k] : null;
              const enabled = d ? d.enabled === true : hasSavedHours ? false : k !== 'sunday';
              return `
                <div class="ai-hour" data-day="${k}">
                  <span class="day">${esc(l)}</span>
                  ${sw('bpDay_' + k, enabled)}
                  <input class="ai-input" type="time" id="bpOpen_${k}" value="${esc((d && d.open) || '09:00')}" aria-label="${esc(l)} opening time">
                  <input class="ai-input" type="time" id="bpClose_${k}" value="${esc((d && d.close) || '18:00')}" aria-label="${esc(l)} closing time">
                </div>`;
            }).join('')}
          </div>
        </div>

        <div class="ai-card">
          <h3>Holidays</h3>
          <p class="ai-sub">Days your business is closed.</p>
          <div id="aiHolidayList">
            ${hols.map(h => holidayRowHtml(h.date, h.name)).join('')}
          </div>
          <button type="button" class="ai-btn small" data-act="hol-add">+ Add holiday</button>
        </div>

        <div class="ai-card">
          <h3>Languages you serve</h3>
          <p class="ai-sub">Languages your team can support.</p>
          <div class="ai-lchips">
            ${BUSINESS_LANGS.map(([k, l]) => `
              <label class="ai-lchip"><input type="checkbox" data-lang="${k}" ${langs.includes(k) ? 'checked' : ''}><span>${esc(l)}</span></label>
            `).join('')}
          </div>
        </div>

        <div class="ai-actions">
          <button class="ai-btn primary" data-act="save-profile">Save Changes</button>
        </div>
      </div>
    `;
  }

  function holidayRowHtml(date, name) {
    return `
      <div class="ai-hol" data-hol>
        <input class="ai-input" type="date" data-hol-date value="${esc(date || '')}" aria-label="Holiday date">
        <input class="ai-input" data-hol-name maxlength="80" placeholder="Holiday name" value="${esc(name || '')}" aria-label="Holiday name">
        <button type="button" class="ai-btn small danger" data-act="hol-del">Remove</button>
      </div>`;
  }

  async function saveProfile(btn) {
    const working_hours = {};
    for (const [k, l] of DAYS) {
      const enabled = checked('#bpDay_' + k);
      const open = val('#bpOpen_' + k) || '09:00';
      const close = val('#bpClose_' + k) || '18:00';
      if (enabled && open >= close) {
        return ui.toast(`${l}: closing time must be after opening time.`, true);
      }
      working_hours[k] = { enabled, open, close };
    }

    const holidays = [];
    for (const row of qa('[data-hol]')) {
      const date = row.querySelector('[data-hol-date]')?.value?.trim() || '';
      const name = row.querySelector('[data-hol-name]')?.value?.trim() || '';
      if (!date && !name) continue;
      if (!date) return ui.toast('Every holiday needs a date.', true);
      holidays.push({ date, name });
    }
    holidays.sort((a, b) => a.date.localeCompare(b.date));

    const languages = qa('[data-lang]').filter(el => el.checked).map(el => el.dataset.lang);

    const payload = {
      client_id: clientId(),
      business_type: val('#bpType').slice(0, 120) || null,
      description: val('#bpDesc').slice(0, 1500) || null,
      location: val('#bpLocation').slice(0, 300) || null,
      whatsapp: val('#bpWhatsapp').slice(0, 40) || null,
      website: val('#bpWebsite').slice(0, 200) || null,
      instagram: val('#bpInstagram').slice(0, 100) || null,
      working_hours,
      holidays,
      languages,
      updated_by: state.session.user.id,
      updated_at: new Date().toISOString()
    };

    await withBusy(btn, 'Saving…', async () => {
      try {
        const { data, error } = await db
          .from('client_business_profiles')
          .upsert(payload, { onConflict: 'client_id' })
          .select('client_id,business_type,description,location,whatsapp,website,instagram,working_hours,holidays,languages,updated_at')
          .single();
        if (error) throw error;
        M.profile = data;
        M.profileError = null;
        M.dirty = false;
        renderShell();
        ui.toast('AI settings saved successfully.');
      } catch (e) {
        console.error('[GLIME AI Settings] save profile:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  /* ---- Services (read-only) ---- */
  function servicesHtml() {
    const o = M.offers;

    return `
      <div class="ai-card">
        <h3>Services & Offers</h3>
        <p class="ai-sub">Services &amp; pricing are managed in Services. AI automatically uses published service information.</p>

        ${M.offersError ? `<div class="ai-err"><b>Could not load services.</b>${esc(M.offersError)}</div>` : `
        <div class="ai-stat">
          <div><b>${o.published}</b><span>Published</span></div>
          <div><b>${o.draft}</b><span>Draft</span></div>
          <div><b>${o.archived}</b><span>Archived</span></div>
        </div>`}

        ${o.names.length ? `
          <p class="ai-sub" style="margin-bottom:6px">Live for customers:</p>
          <div class="ai-chips" style="margin-bottom:12px">
            ${o.names.slice(0, 12).map(n => `<span class="ai-pill">${esc(n)}</span>`).join('')}
            ${o.names.length > 12 ? `<span class="ai-pill">+${o.names.length - 12} more</span>` : ''}
          </div>` : (!M.offersError ? `
          <div class="ai-empty" style="margin-bottom:12px"><b>No published services yet.</b>Publish a service in Services so AI can quote it to customers.</div>` : '')}

        <div class="ai-actions" style="position:static;background:none;padding:0;margin-top:4px">
          <a class="ai-btn primary" href="services.html">Manage Services →</a>
        </div>
        <p class="ai-note">Prices are never entered here, so customers always get one consistent price.</p>
      </div>
    `;
  }

  /* ---- Lead capture ---- */
  function leadHtml() {
    const lc = leadConfig();

    return `
      <div data-form="lead">
        <div class="ai-card">
          <h3>Lead Capture</h3>
          <p class="ai-sub">Choose which details AI collects when a customer shows interest. This is configuration only, not business knowledge.</p>

          <div class="ai-toggle-row">
            <div><b>Collect lead details in chat</b><small>AI asks for these details naturally, one at a time.</small></div>
            ${sw('leadEnabled', lc.enabled)}
          </div>

          ${lc.configured ? '' : '<p class="ai-note" style="margin-bottom:10px">Showing suggested defaults. Save to apply them.</p>'}

          <div id="aiCoreList" style="margin-top:12px">
            ${lc.rows.map(r => `
              <div class="ai-core" data-core="${r.key}">
                <div class="ai-core-top">
                  <input class="ai-input" data-core-label maxlength="60" value="${esc(r.label)}" aria-label="Field label">
                  <div class="ai-order">
                    <button type="button" data-act="move-up" aria-label="Move up">↑</button>
                    <button type="button" data-act="move-down" aria-label="Move down">↓</button>
                  </div>
                </div>
                <div class="ai-core-flags">
                  <label>${sw('', r.enabled, 'data-core-enabled')} Enabled</label>
                  <label>${sw('', r.required, 'data-core-required')} Required</label>
                  <span class="ai-pill">${esc(labelOf(CUSTOM_TYPES, r.type))}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="ai-actions">
          <button class="ai-btn primary" data-act="save-lead">Save Changes</button>
        </div>
      </div>

      <div class="ai-card">
        <h3>Custom fields</h3>
        <p class="ai-sub">Extra details specific to your business, for example "Event date" or "Preferred stylist".</p>
        ${M.leadDefsError ? `<div class="ai-err"><b>Could not load custom fields.</b>${esc(M.leadDefsError)}</div>` : ''}
        <div id="aiCustomList">
          ${M.leadDefs.length ? M.leadDefs.map(customRowHtml).join('') : `<div class="ai-empty" id="aiCustomEmpty"><b>No custom fields yet.</b>Add a field if you need information beyond the core ones.</div>`}
        </div>
        <button type="button" class="ai-btn small" data-act="cf-add" style="margin-top:6px">+ Add custom field</button>
      </div>
    `;
  }

  function customRowHtml(d) {
    const isNew = !d || !d.id;
    const needsOptions = d && (d.field_type === 'select' || d.field_type === 'multiselect');
    const options = d && Array.isArray(d.options) ? d.options.join(', ') : '';

    return `
      <div class="ai-core" data-cf="${isNew ? '' : esc(d.id)}" data-key="${isNew ? '' : esc(d.field_key)}">
        <div class="ai-grid" style="margin-bottom:10px">
          <div class="ai-field">
            <label class="ai-label">Label</label>
            <input class="ai-input" data-cf-label maxlength="60" value="${esc(d ? d.field_label : '')}" placeholder="Field name">
          </div>
          <div class="ai-field">
            <label class="ai-label">Type</label>
            <select class="ai-select" data-cf-type ${isNew ? '' : 'disabled'}>
              ${opts(CUSTOM_TYPES, d ? d.field_type : 'text')}
            </select>
          </div>
          <div class="ai-field ai-full ${isNew || needsOptions ? '' : 'hidden'}" data-cf-options-wrap>
            <label class="ai-label">Choices</label>
            <input class="ai-input" data-cf-options maxlength="400" value="${esc(options)}" placeholder="Comma separated, e.g. Basic, Standard, Premium">
          </div>
        </div>
        <div class="ai-core-flags">
          <label>${sw('', d ? d.is_required === true : false, 'data-cf-required')} Required</label>
          <label>${sw('', d ? d.is_active !== false : true, 'data-cf-active')} Active</label>
        </div>
        <div class="ai-item-actions">
          <button type="button" class="ai-btn small primary" data-act="cf-save">${isNew ? 'Add field' : 'Update field'}</button>
          <button type="button" class="ai-btn small danger" data-act="cf-del">${isNew ? 'Cancel' : 'Delete'}</button>
        </div>
      </div>`;
  }

  async function saveLead(btn) {
    const rows = qa('[data-core]');
    const core_fields = {};

    rows.forEach((row, index) => {
      const key = row.dataset.core;
      const def = CORE_FIELDS.find(f => f[0] === key);
      const required = row.querySelector('[data-core-required]')?.checked === true;
      const enabled = required || row.querySelector('[data-core-enabled]')?.checked === true;
      core_fields[key] = {
        enabled,
        required,
        label: (row.querySelector('[data-core-label]')?.value || '').trim().slice(0, 60) || (def ? def[1] : key),
        type: def ? def[2] : 'text',
        sort_order: (index + 1) * 10
      };
    });

    const previous = isObj(M.brain?.lead_capture_config) ? M.brain.lead_capture_config : {};
    const lead_capture_config = { ...previous, enabled: checked('#leadEnabled'), core_fields };

    await withBusy(btn, 'Saving…', async () => {
      try {
        const { data, error } = await db
          .from('client_ai_brains')
          .update({
            lead_capture_config,
            updated_by: state.session.user.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', M.brain.id)
          .eq('client_id', clientId())
          .select(BRAIN_COLS)
          .single();
        if (error) throw error;
        M.brain = data;
        M.dirty = false;
        renderShell();
        ui.toast('AI settings saved successfully.');
      } catch (e) {
        console.error('[GLIME AI Settings] save lead capture:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function saveCustomField(btn) {
    const row = btn.closest('[data-cf]');
    if (!row) return;

    const id = row.dataset.cf || '';
    const label = (row.querySelector('[data-cf-label]')?.value || '').trim();
    const type = row.querySelector('[data-cf-type]')?.value || 'text';
    const required = row.querySelector('[data-cf-required]')?.checked === true;
    const active = row.querySelector('[data-cf-active]')?.checked !== false;
    const rawOptions = (row.querySelector('[data-cf-options]')?.value || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (!label) return ui.toast('Give the field a label.', true);

    const needsOptions = type === 'select' || type === 'multiselect';
    if (needsOptions && rawOptions.length < 2) {
      return ui.toast('Add at least two choices, separated by commas.', true);
    }

    const options = needsOptions ? rawOptions : [];

    await withBusy(btn, 'Saving…', async () => {
      try {
        if (id) {
          const { error } = await db
            .from('lead_custom_field_definitions')
            .update({
              field_label: label.slice(0, 60),
              options,
              is_required: required,
              is_active: active,
              updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('client_id', clientId());
          if (error) throw error;
        } else {
          const taken = new Set([
            ...CORE_FIELDS.map(f => f[0]),
            ...M.leadDefs.map(d => d.field_key)
          ]);
          let key = slug(label);
          let n = 2;
          while (taken.has(key)) {
            key = `${slug(label).slice(0, 34)}_${n}`;
            n += 1;
          }

          const maxSort = M.leadDefs.reduce((m, d) => Math.max(m, Number(d.sort_order) || 0), 0);

          const { error } = await db.from('lead_custom_field_definitions').insert({
            client_id: clientId(),
            field_key: key,
            field_label: label.slice(0, 60),
            field_type: type,
            options,
            is_required: required,
            is_active: active,
            sort_order: maxSort + 10
          });
          if (error) throw error;
        }

        M.leadDefs = await fetchLeadDefs();
        M.leadDefsError = null;
        renderShell();
        ui.toast('AI settings saved successfully.');
      } catch (e) {
        console.error('[GLIME AI Settings] save custom field:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function deleteCustomField(btn) {
    const row = btn.closest('[data-cf]');
    if (!row) return;

    const id = row.dataset.cf || '';
    if (!id) {
      row.remove();
      return;
    }

    const label = row.querySelector('[data-cf-label]')?.value || 'this field';
    if (!window.confirm(`Delete "${label}"? Values already stored on existing leads are kept.`)) return;

    await withBusy(btn, 'Deleting…', async () => {
      try {
        const { error } = await db
          .from('lead_custom_field_definitions')
          .delete()
          .eq('id', id)
          .eq('client_id', clientId());
        if (error) throw error;
        M.leadDefs = M.leadDefs.filter(d => d.id !== id);
        renderShell();
        ui.toast('Custom field deleted.');
      } catch (e) {
        console.error('[GLIME AI Settings] delete custom field:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  /* ---- Collections: FAQ / Policy / Rule / Specialist ---- */
  const COLLECTION_COPY = {
    faq: {
      title: 'FAQs',
      sub: 'Questions customers ask often, with the answer you approve.',
      add: '+ Add FAQ',
      titleLabel: 'Question',
      contentLabel: 'Answer'
    },
    policy: {
      title: 'Policies',
      sub: 'Cancellation, refund, payment, shipping and other official policies.',
      add: '+ Add policy',
      titleLabel: 'Policy name',
      contentLabel: 'Policy details'
    },
    rule: {
      title: 'Business Rules',
      sub: 'Hard rules AI must always follow. Rules outrank ordinary knowledge.',
      add: '+ Add rule',
      titleLabel: 'Rule name',
      contentLabel: 'Exact rule'
    },
    specialist: {
      title: 'Specialist Knowledge',
      sub: 'Focused guidance for lead generation, appointments, support, negotiation and collections.',
      add: '+ Add knowledge',
      titleLabel: 'Title',
      contentLabel: 'Knowledge'
    }
  };

  function collectionHtml(section) {
    const scope = section.scope;
    const copy = COLLECTION_COPY[scope];

    return `
      <div class="ai-card">
        <div class="ai-head" style="margin-bottom:10px">
          <div>
            <h3>${esc(copy.title)}</h3>
            <p class="ai-sub" style="margin-bottom:0">${esc(copy.sub)} Only <b>Active</b> items are used by AI.</p>
          </div>
          <button type="button" class="ai-btn primary small" data-act="kb-add" style="flex:none">${esc(copy.add)}</button>
        </div>

        <div id="aiEditorHost">${M.editing && M.editing.scope === scope ? editorHtml(scope) : ''}</div>

        <div class="ai-tools">
          <input class="ai-input" id="aiSearch" type="search" placeholder="Search ${esc(copy.title.toLowerCase())}…" value="${esc(M.filter.q)}">
          <div class="ai-chips">
            ${[['all', 'All'], ['active', 'Active'], ['draft', 'Draft'], ['archived', 'Archived']].map(([v, l]) => `
              <button type="button" class="ai-fchip ${M.filter.status === v ? 'active' : ''}" data-act="kb-filter" data-v="${v}">${l}</button>
            `).join('')}
          </div>
        </div>

        <div id="aiKbList">${collectionListHtml(scope)}</div>
      </div>
    `;
  }

  function collectionListHtml(scope) {
    const copy = COLLECTION_COPY[scope];
    const all = itemsFor(scope);
    const term = M.filter.q.toLowerCase();

    const rows = all
      .filter(i => M.filter.status === 'all' || i.status === M.filter.status)
      .filter(i => {
        if (!term) return true;
        return `${i.title} ${i.content} ${i.category || ''}`.toLowerCase().includes(term);
      })
      .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50) || String(b.updated_at).localeCompare(String(a.updated_at)));

    if (!all.length) {
      const [t, s] = EMPTY_TEXT[scope];
      return `<div class="ai-empty"><b>${esc(t)}</b>${esc(s)}</div>`;
    }

    if (!rows.length) {
      return `<div class="ai-empty"><b>Nothing matches.</b>Try a different search or filter.</div>`;
    }

    return rows.map(i => {
      const n = normalize(i);
      const catLabel =
        scope === 'policy' ? labelOf(POLICY_CATS, n.category)
        : scope === 'specialist' ? (n.scope === 'general' ? 'General' : labelOf(SPECIALIST_CATS, n.category))
        : n.category;

      return `
        <article class="ai-item">
          <div class="ai-item-top"><h4>${esc(i.title)}</h4></div>
          <div class="ai-item-meta">
            <span class="ai-pill">${esc(i.status === 'active' ? 'Active' : i.status === 'draft' ? 'Draft' : 'Archived')}</span>
            ${catLabel ? `<span class="ai-pill">${esc(catLabel)}</span>` : ''}
            ${scope !== 'rule' ? '' : ''}
            <span class="ai-pill">Priority ${esc(i.priority ?? 50)}</span>
          </div>
          <p>${esc(i.content)}</p>
          <div class="ai-item-actions">
            <button type="button" class="ai-btn small" data-act="kb-edit" data-id="${esc(i.id)}">Edit</button>
            <button type="button" class="ai-btn small danger" data-act="kb-delete" data-id="${esc(i.id)}">Delete</button>
          </div>
        </article>`;
    }).join('') || `<div class="ai-empty"><b>${esc(copy.title)}</b></div>`;
  }

  function editorHtml(scope) {
    const copy = COLLECTION_COPY[scope];
    const existing = M.editing.id ? M.items.find(i => i.id === M.editing.id) : null;
    const n = existing ? normalize(existing) : { scope, category: '' };

    const categoryField =
      scope === 'policy'
        ? `<div class="ai-field">
            <label class="ai-label" for="kbCategory">Category</label>
            <select class="ai-select" id="kbCategory">
              <option value="" disabled ${n.category ? '' : 'selected'}>Select a category…</option>
              ${opts(POLICY_CATS, n.category)}
            </select>
          </div>`
        : scope === 'specialist'
          ? `<div class="ai-field">
              <label class="ai-label" for="kbCategory">Use case</label>
              <select class="ai-select" id="kbCategory">
                ${opts([...SPECIALIST_CATS, ['general', 'General (no category)']], existing ? (n.scope === 'general' ? 'general' : n.category) : 'lead_generation')}
              </select>
              <span class="ai-hint" id="kbCatHint">${esc(SPECIALIST_HINTS[n.category || 'lead_generation'] || '')}</span>
            </div>`
          : scope === 'faq'
            ? `<div class="ai-field">
                <label class="ai-label" for="kbCategory">Category <span style="font-weight:400;opacity:.7">(optional)</span></label>
                <input class="ai-input" id="kbCategory" list="kbCatList" maxlength="60" placeholder="e.g. Delivery, Pricing" value="${esc(n.category || '')}">
                <datalist id="kbCatList">
                  ${[...new Set(itemsFor('faq').map(i => i.category).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}
                </datalist>
              </div>`
            : '';

    return `
      <div class="ai-editor" id="aiEditor" data-form="kb">
        <h3>${existing ? 'Edit' : 'New'} ${esc(copy.title.replace(/s$/, ''))}</h3>
        <div class="ai-grid">
          <div class="ai-field ai-full">
            <label class="ai-label" for="kbTitle">${esc(copy.titleLabel)}</label>
            <input class="ai-input" id="kbTitle" maxlength="200" autocomplete="off" value="${esc(existing ? existing.title : '')}">
          </div>
          <div class="ai-field ai-full">
            <label class="ai-label" for="kbContent">${esc(copy.contentLabel)}</label>
            <textarea class="ai-textarea" id="kbContent" maxlength="10000">${esc(existing ? existing.content : '')}</textarea>
          </div>
          ${categoryField}
          <div class="ai-field">
            <label class="ai-label" for="kbPriority">Priority (0-100)</label>
            <input class="ai-input" id="kbPriority" type="number" min="0" max="100" step="1" inputmode="numeric" value="${esc(existing ? existing.priority ?? 50 : 50)}">
            <span class="ai-hint">Higher priority items are shown to AI first.</span>
          </div>
          <div class="ai-field">
            <label class="ai-label" for="kbStatus">Status</label>
            <select class="ai-select" id="kbStatus">
              ${opts([['active', 'Active'], ['draft', 'Draft'], ['archived', 'Archived']], existing ? existing.status : 'active')}
            </select>
            <span class="ai-hint">Only Active items reach customers.</span>
          </div>
        </div>
        <div class="ai-item-actions" style="margin-top:14px">
          <button type="button" class="ai-btn primary" data-act="kb-save">Save</button>
          <button type="button" class="ai-btn" data-act="kb-cancel">Cancel</button>
        </div>
      </div>
    `;
  }

  function openEditor(scope, id) {
    if (M.dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    M.dirty = false;
    M.editing = { scope, id: id || null };
    const host = q('#aiEditorHost');
    if (host) {
      host.innerHTML = editorHtml(scope);
      q('#aiEditor')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      q('#kbTitle')?.focus?.();
    }
  }

  function closeEditor() {
    M.editing = null;
    M.dirty = false;
    const host = q('#aiEditorHost');
    if (host) host.innerHTML = '';
  }

  async function saveItem(btn) {
    if (!M.editing) return;

    const scope = M.editing.scope;
    const existing = M.editing.id ? M.items.find(i => i.id === M.editing.id) : null;
    const copy = COLLECTION_COPY[scope];

    const title = val('#kbTitle');
    const content = val('#kbContent');
    const status = val('#kbStatus') || 'active';
    const priorityRaw = val('#kbPriority');
    const priority = priorityRaw === '' ? 50 : Number(priorityRaw);

    if (!title) return ui.toast(`${copy.titleLabel} is required.`, true);
    if (!content) return ui.toast(`${copy.contentLabel} is required.`, true);
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
      return ui.toast('Priority must be a whole number from 0 to 100.', true);
    }

    let category = q('#kbCategory') ? val('#kbCategory') : '';
    let knowledgeScope = scope;
    const metadata = isObj(existing?.metadata) ? { ...existing.metadata } : {};

    if (scope === 'policy' && !category) {
      return ui.toast('Choose a policy category.', true);
    }

    if (scope === 'specialist') {
      if (category === 'general' || !category) {
        knowledgeScope = 'general';
        category = '';
        delete metadata.use_case_category;
      } else {
        metadata.use_case_category = category;
        metadata.knowledge_scope = 'client';
      }
    }

    await withBusy(btn, 'Saving…', async () => {
      try {
        const result = await knowledgeApi('save_knowledge', {
          id: existing ? existing.id : undefined,
          title,
          content,
          source_type: existing ? existing.source_type : 'manual',
          document_id: existing ? existing.document_id : undefined,
          status,
          knowledge_scope: knowledgeScope,
          category: category || null,
          priority,
          metadata
        });

        const saved = result.item;
        if (!saved) throw new Error('Knowledge was not returned after saving.');

        M.items = existing
          ? M.items.map(i => (i.id === saved.id ? saved : i))
          : [saved, ...M.items];

        M.editing = null;
        M.dirty = false;
        M.itemsError = null;
        renderShell();
        ui.toast('AI settings saved successfully.');
      } catch (e) {
        console.error('[GLIME AI Settings] save knowledge:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  async function deleteItem(btn) {
    const id = btn.dataset.id;
    const item = M.items.find(i => i.id === id);
    if (!item) return;

    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;

    await withBusy(btn, 'Deleting…', async () => {
      try {
        await knowledgeApi('delete_knowledge', { id });
        M.items = M.items.filter(i => i.id !== id);
        if (M.editing && M.editing.id === id) M.editing = null;
        renderShell();
        ui.toast('Knowledge deleted.');
      } catch (e) {
        console.error('[GLIME AI Settings] delete knowledge:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  /* ---------------------------------------------------------
     TAB 3 - CHANNELS & AI ACCESS (read-only linkage)
  --------------------------------------------------------- */
  function channelsHtml() {
    const settings = api.getSettings() || [];
    const connections = api.getConnections() || [];

    const row = (key, name) => {
      const link = M.brainChannels.find(r => r.channel === key);
      const attached = link ? link.enabled !== false : false;
      const s = settings.find(x => x.channel === key);
      const c = connections.find(x => x.channel === key);
      const connected = c && c.status === 'connected';

      return `
        <div class="ai-chrow">
          <b>${esc(name)}</b>
          <div class="tags">
            <span class="ai-pill">${connected ? 'Connected' : 'Not connected'}</span>
            <span class="ai-pill">${attached ? 'Uses this AI brain' : 'Attaches on first AI reply'}</span>
            <span class="ai-pill">AI replies ${s ? (s.ai_enabled ? 'on' : 'off') : 'on'}</span>
            <span class="ai-pill">Mode: ${esc(s?.ai_mode || 'manual')}</span>
          </div>
        </div>`;
    };

    const voiceLinked = M.brainChannels.some(r => r.channel === 'voice' && r.enabled !== false);

    return `
      <div class="ai-card">
        <h3>Channels & AI access</h3>
        <p class="ai-sub">Every channel uses the same brain and the same Knowledge Base. You never maintain separate information per channel.</p>

        <div class="ai-flow">
          <span class="box">Client AI Brain</span><span class="arrow">→</span>
          <span class="box">Knowledge Base</span><span class="arrow">→</span>
          <span class="box">WhatsApp · Instagram · Voice</span>
        </div>

        ${row('whatsapp', 'WhatsApp')}
        ${row('instagram', 'Instagram')}
        <div class="ai-chrow">
          <b>Voice</b>
          <div class="tags">
            <span class="ai-pill">${voiceLinked ? 'Uses this AI brain' : 'Set up in Voice AI'}</span>
          </div>
        </div>

        <p class="ai-note">This view is read-only. Switching a channel on or off, AI replies, automation and AI mode are controlled in Channels.</p>

        <div class="ai-actions" style="position:static;background:none;padding:0">
          <button type="button" class="ai-btn primary" data-act="goto-channels">Open Channels →</button>
        </div>
      </div>
    `;
  }

  /* ---------------------------------------------------------
     TAB 4 - HUMAN HANDOFF
  --------------------------------------------------------- */
  function handoffHtml() {
    if (!M.brain) return brainMissingHtml();
    const h = handoffConfig();

    return `
      <div data-form="handoff">
        <div class="ai-card">
          <h3>Human handoff</h3>
          <p class="ai-sub">Tell AI when a person from your team should take over.</p>

          <div class="ai-toggle-row">
            <div><b>Human handoff enabled</b><small>AI will recommend a human follow-up in the situations you choose below.</small></div>
            ${sw('hoEnabled', h.enabled)}
          </div>

          ${HANDOFF_RULES.map(([k, l, d]) => `
            <div class="ai-toggle-row">
              <div><b>${esc(l)}</b><small>${esc(d)}</small></div>
              ${sw('hoRule_' + k, h.rules[k])}
            </div>
          `).join('')}
        </div>

        <div class="ai-card">
          <h3>Handoff message</h3>
          <p class="ai-sub">What AI says when it hands a conversation over.</p>
          <textarea class="ai-textarea" id="hoMessage" style="min-height:90px" maxlength="600">${esc(h.message)}</textarea>
          <p class="ai-note">AI will never claim that a person has already joined unless a real handoff system confirms it. Keep this message to a request for follow-up.</p>
        </div>

        <div class="ai-actions">
          <button class="ai-btn primary" data-act="save-handoff">Save Changes</button>
        </div>
      </div>
    `;
  }

  async function saveHandoff(btn) {
    const message = val('#hoMessage').slice(0, 600);
    const enabled = checked('#hoEnabled');

    if (enabled && !message) return ui.toast('Add a handoff message.', true);

    const rules = {};
    HANDOFF_RULES.forEach(([k]) => {
      rules[k] = checked('#hoRule_' + k);
    });

    const handoff_rules = { enabled, rules, message };

    await withBusy(btn, 'Saving…', async () => {
      try {
        const { data, error } = await db
          .from('client_ai_brains')
          .update({
            handoff_rules,
            updated_by: state.session.user.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', M.brain.id)
          .eq('client_id', clientId())
          .select(BRAIN_COLS)
          .single();
        if (error) throw error;
        M.brain = data;
        M.dirty = false;
        renderShell();
        ui.toast('AI settings saved successfully.');
      } catch (e) {
        console.error('[GLIME AI Settings] save handoff:', e);
        ui.toast(errMsg(e), true);
      }
    });
  }

  /* ---------------------------------------------------------
     TAB 5 - AI HEALTH
  --------------------------------------------------------- */
  function healthHtml(health) {
    const summary =
      health.overall === 'READY'
        ? 'Your AI has what it needs to answer customers safely.'
        : health.overall === 'NEEDS_ATTENTION'
          ? 'AI can still reply safely, but a few things would make it much better.'
          : 'AI is not ready yet. Fix the items below first.';

    return `
      <div class="ai-card ai-overall">
        <div class="big">${esc(OVERALL_LABEL[health.overall])}</div>
        <p class="ai-sub" style="margin:6px 0 0">${esc(summary)}</p>
      </div>

      ${health.notes.length ? `
        <div class="ai-card">
          <h3>To do</h3>
          ${health.notes.map(n => `<p class="ai-note" style="margin:8px 0 0">• ${esc(n)}</p>`).join('')}
        </div>` : ''}

      <div class="ai-card">
        <h3>Knowledge health</h3>
        <p class="ai-sub">Empty optional sections never block your AI. They simply give it less to work with.</p>
        ${health.rows.map(r => `
          <div class="ai-health-row">
            <div class="ai-glyph" aria-label="${esc(STATE_WORD[r.state])}">${STATE_GLYPH[r.state]}</div>
            <div class="ai-health-main">
              <b>${esc(r.label)}</b>
              <small>${esc(r.owner)} · ${esc(r.detail)}</small>
            </div>
            ${r.state === 'ok' ? '' : `<button type="button" class="ai-btn small" data-act="fix" data-tab="${esc(r.go[0])}" data-kb="${esc(r.go[1] || '')}">${r.state === 'miss' ? 'Set up' : 'Improve'}</button>`}
          </div>
        `).join('')}
      </div>
    `;
  }

  /* ---------------------------------------------------------
     EVENT DELEGATION
  --------------------------------------------------------- */
  function refreshList() {
    const section = KB_SECTIONS.find(s => s.key === M.kb);
    const list = q('#aiKbList');
    if (list && section?.scope) list.innerHTML = collectionListHtml(section.scope);
  }

  async function reloadAll() {
    const pane = q('#aiPane');
    if (pane) pane.innerHTML = '<div class="ai-loading">Loading…</div>';
    await loadAll();
    M.dirty = false;
    renderShell();
  }

  function onClick(e) {
    const el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || !ROOT || !ROOT.contains(el)) return;

    const act = el.dataset.act;

    switch (act) {
      case 'tab':
        go(el.dataset.v);
        break;
      case 'kb':
        go('knowledge', el.dataset.v);
        break;
      case 'fix':
        go(el.dataset.tab, el.dataset.kb || null);
        break;
      case 'retry':
        reloadAll();
        break;
      case 'goto-channels': {
        const nav = document.querySelector('[data-module="channels"]');
        if (nav) nav.click();
        break;
      }
      case 'save-behaviour':
        saveBehaviour(el);
        break;
      case 'save-profile':
        saveProfile(el);
        break;
      case 'save-lead':
        saveLead(el);
        break;
      case 'save-handoff':
        saveHandoff(el);
        break;
      case 'kb-add': {
        const s = KB_SECTIONS.find(x => x.key === M.kb);
        if (s?.scope) openEditor(s.scope, null);
        break;
      }
      case 'kb-edit': {
        const s = KB_SECTIONS.find(x => x.key === M.kb);
        if (s?.scope) openEditor(s.scope, el.dataset.id);
        break;
      }
      case 'kb-cancel':
        closeEditor();
        break;
      case 'kb-save':
        saveItem(el);
        break;
      case 'kb-delete':
        deleteItem(el);
        break;
      case 'kb-filter':
        M.filter.status = el.dataset.v || 'all';
        qa('[data-act="kb-filter"]').forEach(b => b.classList.toggle('active', b.dataset.v === M.filter.status));
        refreshList();
        break;
      case 'hol-add': {
        const list = q('#aiHolidayList');
        if (list) {
          list.insertAdjacentHTML('beforeend', holidayRowHtml('', ''));
          markDirty();
        }
        break;
      }
      case 'hol-del':
        el.closest('[data-hol]')?.remove();
        markDirty();
        break;
      case 'move-up':
      case 'move-down': {
        const row = el.closest('[data-core]');
        if (!row) break;
        if (act === 'move-up' && row.previousElementSibling) {
          row.parentNode.insertBefore(row, row.previousElementSibling);
          markDirty();
        }
        if (act === 'move-down' && row.nextElementSibling) {
          row.parentNode.insertBefore(row.nextElementSibling, row);
          markDirty();
        }
        break;
      }
      case 'cf-add': {
        const list = q('#aiCustomList');
        if (list) {
          q('#aiCustomEmpty')?.remove();
          list.insertAdjacentHTML('beforeend', customRowHtml(null));
          list.lastElementChild?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        }
        break;
      }
      case 'cf-save':
        saveCustomField(el);
        break;
      case 'cf-del':
        deleteCustomField(el);
        break;
      default:
        break;
    }
  }

  function onChange(e) {
    const t = e.target;
    if (!t || !ROOT) return;

    if (t.id === 'aiGoal') {
      q('#aiGoalCustom')?.classList.toggle('hidden', t.value !== 'custom');
    }
    if (t.id === 'aiTone') {
      q('#aiToneCustom')?.classList.toggle('hidden', t.value !== 'custom');
    }
    if (t.id === 'kbCategory' && M.editing?.scope === 'specialist') {
      const hint = q('#kbCatHint');
      if (hint) hint.textContent = SPECIALIST_HINTS[t.value] || '';
    }
    if (t.matches && t.matches('[data-cf-type]')) {
      const wrap = t.closest('[data-cf]')?.querySelector('[data-cf-options-wrap]');
      if (wrap) wrap.classList.toggle('hidden', !(t.value === 'select' || t.value === 'multiselect'));
    }
  }

  function onInput(e) {
    const t = e.target;
    if (!t || !ROOT) return;

    if (t.id === 'aiSearch') {
      M.filter.q = t.value;
      refreshList();
      return;
    }

    if (t.closest && t.closest('[data-form]')) markDirty();
  }

  function onFormChange(e) {
    const t = e.target;
    if (t && t.closest && t.closest('[data-form]')) markDirty();
  }

  /* ---------------------------------------------------------
     MODULE REGISTRATION
  --------------------------------------------------------- */
  shell.register({
    id: 'ai',
    label: 'AI',
    order: 20,

    render: async ({ container }) => {
      injectStyles();

      container.innerHTML = '<div class="ai-root" id="aiRoot"><div class="ai-loading">Loading AI settings…</div></div>';
      ROOT = container.querySelector('#aiRoot');

      if (!ROOT) return;

      ROOT.addEventListener('click', onClick);
      ROOT.addEventListener('change', onChange);
      ROOT.addEventListener('change', onFormChange);
      ROOT.addEventListener('input', onInput);

      M.dirty = false;
      M.editing = null;

      try {
        await loadAll();
        renderShell();
      } catch (error) {
        console.error('[GLIME AI Settings] Load error:', error);
        ROOT.innerHTML = `
          <div class="ai-err"><b>Could not load AI settings.</b>${esc(errMsg(error))}
            <div style="margin-top:10px"><button class="ai-btn small" data-act="retry">Try again</button></div>
          </div>`;
      }
    }
  });
})();
