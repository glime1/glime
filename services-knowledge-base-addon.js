/* =========================================================
   GLIME - SERVICES: CLIENT KNOWLEDGE SUMMARY (v2)
   ---------------------------------------------------------
   Client knowledge now lives in ONE place: Settings > AI > Knowledge.
   WhatsApp, Instagram and Voice all read from it.

   This card (Step 5 of the service wizard) only shows a live summary
   of that central knowledge and links to it. It never edits knowledge,
   so there is no second Knowledge Base to keep in sync.

   - Same client-storage-knowledge Edge Function as Settings
   - Same client_business_profiles table as Settings
   - Client is resolved from the signed-in user (never from browser input)
   - Uses the Supabase client created by services.js
========================================================= */
(() => {
  'use strict';

  const HOST_ID = 'knowledgeBaseHost';
  const SETTINGS_URL = 'settings.html#ai-knowledge';

  const SPECIALIST_CATS = ['lead_generation', 'appointments', 'support', 'negotiation', 'collections'];

  let mounted = false;

  const $ = id => document.getElementById(id);

  const esc = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[c]));

  function sb() {
    // services.js declares: const supabaseClient = window.supabase.createClient(...)
    // A top-level const is shared between classic scripts, but is not on window.
    if (typeof supabaseClient !== 'undefined' && supabaseClient?.functions) return supabaseClient;
    if (window.supabaseClient?.functions) return window.supabaseClient;
    return null;
  }

  async function listKnowledge(client) {
    const { data, error } = await client.functions.invoke('client-storage-knowledge', {
      body: { action: 'list_knowledge' }
    });

    if (error) {
      let message = error.message || 'Could not load knowledge.';
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      } catch (_) { /* keep default */ }
      throw new Error(message);
    }

    if (!data || data.ok === false) throw new Error(data?.error || 'Could not load knowledge.');
    return Array.isArray(data.items) ? data.items : [];
  }

  async function loadProfile(client) {
    const { data, error } = await client
      .from('client_business_profiles')
      .select('business_type,description,location,working_hours')
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  function scopeOf(item) {
    const scope = item.knowledge_scope || 'general';
    if (scope === 'general') {
      const legacy = item.metadata && item.metadata.use_case_category;
      if (SPECIALIST_CATS.includes(legacy)) return 'specialist';
    }
    return scope;
  }

  function profileState(p) {
    if (!p) return { label: 'Not set', ok: false };

    const hours = p.working_hours && typeof p.working_hours === 'object'
      && Object.values(p.working_hours).some(d => d && d.enabled === true);

    const filled = [p.business_type, p.description, p.location].filter(v => String(v || '').trim()).length + (hours ? 1 : 0);

    if (filled >= 4) return { label: 'Complete', ok: true };
    if (filled > 0) return { label: 'Incomplete', ok: false };
    return { label: 'Not set', ok: false };
  }

  function summarize(items, profile) {
    const active = items.filter(i => i.status === 'active');
    const count = scope => active.filter(i => {
      const s = scopeOf(i);
      return scope === 'specialist' ? s === 'specialist' || s === 'general' : s === scope;
    }).length;

    return {
      profile: profileState(profile),
      faq: count('faq'),
      policy: count('policy'),
      rule: count('rule'),
      specialist: count('specialist')
    };
  }

  function tile(label, value, done) {
    return `
      <div class="kbs-tile ${done ? 'done' : ''}">
        <span class="kbs-val">${esc(value)}</span>
        <span class="kbs-lab">${esc(label)}</span>
      </div>`;
  }

  function render(host, state) {
    if (state.status === 'loading') {
      host.innerHTML = `
        <section class="kbs">
          ${header()}
          <div class="kbs-load">Loading your knowledge…</div>
        </section>`;
      return;
    }

    if (state.status === 'error') {
      host.innerHTML = `
        <section class="kbs">
          ${header()}
          <div class="kbs-err"><b>Could not load your knowledge.</b>${esc(state.error)}</div>
          <div class="kbs-actions">
            <button type="button" class="kbs-btn ghost" id="kbsRetry">Try again</button>
            <a class="kbs-btn" href="${SETTINGS_URL}">Open Knowledge →</a>
          </div>
        </section>`;
      $('kbsRetry')?.addEventListener('click', load);
      return;
    }

    const s = state.summary;
    const missing = [];
    if (!s.profile.ok) missing.push('your Business Profile');
    if (!s.faq) missing.push('FAQs');
    if (!s.policy) missing.push('policies');
    if (!s.rule) missing.push('business rules');

    const tip = missing.length
      ? `Tip: add ${missing.slice(0, 3).join(', ')} so AI answers consistently.`
      : 'Your AI has a complete knowledge base to work with.';

    host.innerHTML = `
      <section class="kbs">
        ${header()}
        <div class="kbs-grid">
          ${tile('Business Profile', s.profile.label, s.profile.ok)}
          ${tile('FAQs', s.faq, s.faq > 0)}
          ${tile('Policies', s.policy, s.policy > 0)}
          ${tile('Rules', s.rule, s.rule > 0)}
          ${tile('Specialist', s.specialist, s.specialist > 0)}
        </div>
        <p class="kbs-tip">${esc(tip)}</p>
        <div class="kbs-actions">
          <a class="kbs-btn" href="${SETTINGS_URL}">Manage Knowledge →</a>
        </div>
      </section>`;
  }

  function header() {
    return `
      <div class="kbs-head">
        <span class="kbs-kicker">CLIENT KNOWLEDGE</span>
        <h4>One knowledge base for WhatsApp, Instagram &amp; Voice</h4>
        <p>Services and pricing are managed here. FAQs, policies, rules and your business profile are managed in Settings → AI, so every channel gives customers the same answers.</p>
      </div>`;
  }

  async function load() {
    const host = $(HOST_ID);
    if (!host) return;

    render(host, { status: 'loading' });

    const client = sb();
    if (!client) {
      render(host, { status: 'error', error: 'The GLIME connection is not available. Please refresh the page.' });
      return;
    }

    try {
      const [items, profile] = await Promise.all([
        listKnowledge(client),
        loadProfile(client).catch(error => {
          console.error('[GLIME Services] business profile load error:', error);
          return null;
        })
      ]);

      render(host, { status: 'ready', summary: summarize(items, profile) });
    } catch (error) {
      console.error('[GLIME Services] knowledge summary error:', error);
      render(host, { status: 'error', error: error?.message || 'Unknown error.' });
    }
  }

  function injectStyles() {
    if ($('glimeKnowledgeSummaryStyles')) return;

    const style = document.createElement('style');
    style.id = 'glimeKnowledgeSummaryStyles';
    style.textContent = `
      #knowledgeBaseHost{margin:16px 0 20px}
      .kbs{border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:16px;background:rgba(255,255,255,.03);color:#fff}
      .kbs-kicker{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.14em;color:#fff;opacity:.8}
      .kbs-head h4{margin:5px 0 6px;font-size:1.05rem;line-height:1.3}
      .kbs-head p{margin:0 0 14px;font-size:.82rem;line-height:1.55;color:rgba(255,255,255,.82)}
      .kbs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .kbs-tile{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:12px;background:rgba(0,0,0,.2);min-width:0}
      .kbs-tile.done{border-color:rgba(255,255,255,.4)}
      .kbs-val{display:block;font-size:1.15rem;font-weight:800;line-height:1.2;word-break:break-word}
      .kbs-lab{display:block;margin-top:3px;font-size:.74rem;color:rgba(255,255,255,.78)}
      .kbs-tip{margin:12px 0 0;font-size:.8rem;line-height:1.5;color:rgba(255,255,255,.88)}
      .kbs-actions{display:flex;flex-direction:column;gap:8px;margin-top:14px}
      .kbs-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:12px;border:0;background:linear-gradient(135deg,#00ff88,#00f0ff);color:#061016;font-weight:800;font-size:.9rem;text-decoration:none;cursor:pointer}
      .kbs-btn.ghost{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.3)}
      .kbs-load{padding:18px 0;font-size:.85rem;color:rgba(255,255,255,.8);text-align:center}
      .kbs-err{border:1px solid rgba(255,100,114,.4);background:rgba(255,100,114,.07);border-radius:12px;padding:12px;font-size:.82rem;color:#fff}
      .kbs-err b{display:block;margin-bottom:3px}
      @media(min-width:600px){
        .kbs-grid{grid-template-columns:repeat(5,minmax(0,1fr))}
        .kbs-actions{flex-direction:row}
      }
    `;
    document.head.appendChild(style);
  }

  function start() {
    if (mounted) return;
    if (!$(HOST_ID)) return;

    mounted = true;
    injectStyles();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
