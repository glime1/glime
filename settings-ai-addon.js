/* =========================================================
   GLIME SETTINGS — AI MODULE ADDON
   Uses existing:
   - client_ai_brains
   - client_ai_brain_channels
   - client_knowledge_items
   - offers

   Client controls:
   - AI Status
   - Language
   - Tone
   - Services & Client Knowledge
   - Conversation Memory
   - Lead Context
   - Sales Instructions

   Hidden / GLIME-managed:
   - AI Provider
   - AI Model
   - Core System Instructions
   - Safety Instructions

   Voice AI intentionally excluded.
   ========================================================= */

(function () {
  'use strict';

  const MODULE_ID = 'ai';

  const CHANNELS = ['whatsapp', 'instagram'];

  let supabaseClient = null;
  let clientId = null;
  let brain = null;
  let channelRows = [];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getSupabase() {
    if (supabaseClient) return supabaseClient;

    if (window.supabaseClient) {
      supabaseClient = window.supabaseClient;
      return supabaseClient;
    }

    if (window.supabase) {
      if (typeof window.supabase.from === 'function') {
        supabaseClient = window.supabase;
        return supabaseClient;
      }
    }

    return null;
  }

  async function resolveClientId() {
    const sb = getSupabase();

    if (!sb) {
      throw new Error('Supabase client is not available.');
    }

    const {
      data: { user },
      error: userError
    } = await sb.auth.getUser();

    if (userError) throw userError;

    if (!user) {
      throw new Error('You are not logged in.');
    }

    const { data, error } = await sb
      .from('clients')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data?.client_id) {
      throw new Error('Client account could not be resolved.');
    }

    return data.client_id;
  }

  async function loadBrain() {
    const sb = getSupabase();

    const { data, error } = await sb
      .from('client_ai_brains')
      .select([
        'id',
        'client_id',
        'brain_key',
        'name',
        'status',
        'language',
        'tone',
        'system_instructions',
        'sales_instructions',
        'safety_instructions',
        'knowledge_enabled',
        'conversation_memory_enabled',
        'lead_context_enabled',
        'created_at',
        'updated_at'
      ].join(','))
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw error;

    brain = data || null;

    return brain;
  }

  async function loadChannels() {
    const sb = getSupabase();

    const { data, error } = await sb
      .from('client_ai_brain_channels')
      .select('brain_id, client_id, channel, enabled')
      .eq('client_id', clientId)
      .in('channel', CHANNELS);

    if (error) throw error;

    channelRows = data || [];

    return channelRows;
  }

  async function loadKnowledgeCount() {
    const sb = getSupabase();

    const { count, error } = await sb
      .from('client_knowledge_items')
      .select('id', {
        count: 'exact',
        head: true
      })
      .eq('client_id', clientId)
      .eq('status', 'active');

    if (error) {
      console.warn(
        '[GLIME AI Settings] Knowledge count unavailable:',
        error
      );

      return null;
    }

    return Number(count || 0);
  }

  async function loadOffersCount() {
    const sb = getSupabase();

    const { count, error } = await sb
      .from('offers')
      .select('id', {
        count: 'exact',
        head: true
      })
      .eq('client_id', clientId)
      .eq('status', 'active');

    if (error) {
      console.warn(
        '[GLIME AI Settings] Offers count unavailable:',
        error
      );

      return null;
    }

    return Number(count || 0);
  }

  function findModuleRoot() {
    return (
      document.querySelector('[data-settings-module="ai"]') ||
      document.getElementById('settings-ai-module') ||
      document.querySelector('.settings-ai-module')
    );
  }

  function channelStatus(channel) {
    const row = channelRows.find(
      item => item.channel === channel
    );

    return row?.enabled === true;
  }

  function render(root, knowledgeCount, offersCount) {
    if (!root) {
      console.warn(
        '[GLIME AI Settings] AI module container not found.'
      );
      return;
    }

    const isActive =
      !brain || brain.status === 'active';

    const language =
      brain?.language || 'Auto';

    const tone =
      brain?.tone || 'Professional';

    const knowledgeEnabled =
      brain?.knowledge_enabled !== false;

    const memoryEnabled =
      brain?.conversation_memory_enabled !== false;

    const leadContextEnabled =
      brain?.lead_context_enabled !== false;

    const salesInstructions =
      brain?.sales_instructions || '';

    const whatsappEnabled =
      channelStatus('whatsapp');

    const instagramEnabled =
      channelStatus('instagram');

    root.innerHTML = `
      <div class="glime-ai-settings">

        <div class="glime-ai-header">
          <div>
            <h2>AI</h2>
            <p>
              आपके सभी client-facing AI specialists के लिए
              central AI context और behavior controls।
            </p>
          </div>

          <div class="glime-ai-status-pill ${
            isActive ? 'active' : 'paused'
          }">
            ${isActive ? 'AI Active' : 'AI Paused'}
          </div>
        </div>

        <div class="glime-ai-card">

          <div class="glime-ai-card-header">
            <div>
              <h3>AI Status</h3>
              <p>
                Client AI brain को active या paused रखें।
              </p>
            </div>
          </div>

          <div class="glime-ai-field">

            <label class="glime-ai-switch-row">

              <span>
                <strong>AI enabled</strong>
                <small>
                  AI specialists को responses generate करने की अनुमति।
                </small>
              </span>

              <input
                id="glime-ai-status"
                type="checkbox"
                ${isActive ? 'checked' : ''}
              >

            </label>

          </div>

        </div>


        <div class="glime-ai-card">

          <div class="glime-ai-card-header">
            <div>
              <h3>Language & Tone</h3>
              <p>
                AI बातचीत में आपकी पसंद का communication style।
              </p>
            </div>
          </div>

          <div class="glime-ai-grid">

            <div class="glime-ai-field">
              <label for="glime-ai-language">
                Language
              </label>

              <input
                id="glime-ai-language"
                type="text"
                value="${escapeHtml(language)}"
                placeholder="Auto"
              >
            </div>

            <div class="glime-ai-field">
              <label for="glime-ai-tone">
                Tone
              </label>

              <input
                id="glime-ai-tone"
                type="text"
                value="${escapeHtml(tone)}"
                placeholder="Professional"
              >
            </div>

          </div>

        </div>


        <div class="glime-ai-card">

          <div class="glime-ai-card-header">
            <div>
              <h3>Services & Client Knowledge</h3>
              <p>
                Services और saved business knowledge को
                AI context में इस्तेमाल करें।
              </p>
            </div>
          </div>

          <label class="glime-ai-switch-row">

            <span>
              <strong>Use Services & Client Knowledge</strong>
              <small>
                Active services/offers और client knowledge को
                AI context में उपलब्ध कराएँ।
              </small>
            </span>

            <input
              id="glime-ai-knowledge"
              type="checkbox"
              ${knowledgeEnabled ? 'checked' : ''}
            >

          </label>

          <div class="glime-ai-context-stats">

            <div class="glime-ai-stat">
              <span>Active Knowledge</span>
              <strong>
                ${
                  knowledgeCount === null
                    ? '—'
                    : knowledgeCount
                }
              </strong>
            </div>

            <div class="glime-ai-stat">
              <span>Active Offers</span>
              <strong>
                ${
                  offersCount === null
                    ? '—'
                    : offersCount
                }
              </strong>
            </div>

          </div>

        </div>


        <div class="glime-ai-card">

          <div class="glime-ai-card-header">
            <div>
              <h3>Conversation Memory</h3>
              <p>
                AI को previous conversation context उपलब्ध हो।
              </p>
            </div>
          </div>

          <label class="glime-ai-switch-row">

            <span>
              <strong>Conversation Memory</strong>
              <small>
                Conversation history से relevant context use करें।
              </small>
            </span>

            <input
              id="glime-ai-memory"
              type="checkbox"
              ${memoryEnabled ? 'checked' : ''}
            >

          </label>

        </div>


        <div class="glime-ai-card">

          <div class="glime-ai-card-header">
            <div>
              <h3>Lead Context</h3>
              <p>
                AI को lead/customer context उपलब्ध हो।
              </p>
            </div>
          </div>

          <label class="glime-ai-switch-row">

            <span>
              <strong>Lead Context</strong>
              <small>
                Lead information को AI conversation context में use करें।
              </small>
            </span>

            <input
              id="glime-ai-lead-context"
              type="checkbox"
              ${leadContextEnabled ? 'checked' : ''}
            >

          </label>

        </div>


        <div class="glime-ai-card">

          <div class="glime-ai-card-header">
            <div>
              <h3>Sales Instructions</h3>
              <p>
                अपने business के अनुसार AI को अतिरिक्त sales guidance दें।
              </p>
            </div>
          </div>

          <div class="glime-ai-field">

            <textarea
              id="glime-ai-sales-instructions"
              rows="7"
              placeholder="उदाहरण: ग्राहक को पहले उसकी आवश्यकता समझने में मदद करें..."
            >${escapeHtml(salesInstructions)}</textarea>

          </div>

        </div>


        <div class="glime-ai-card">

          <div class="glime-ai-card-header">
            <div>
              <h3>Central AI Brain</h3>
              <p>
                WhatsApp और Instagram एक ही client AI context से जुड़े हैं।
              </p>
            </div>
          </div>

          <div class="glime-ai-channel-grid">

            <div class="glime-ai-channel">

              <div>
                <strong>WhatsApp</strong>
                <small>
                  Central Client AI Brain
                </small>
              </div>

              <span class="${
                whatsappEnabled ? 'connected' : 'disabled'
              }">
                ${
                  whatsappEnabled
                    ? 'Enabled'
                    : 'Not Enabled'
                }
              </span>

            </div>


            <div class="glime-ai-channel">

              <div>
                <strong>Instagram</strong>
                <small>
                  Central Client AI Brain
                </small>
              </div>

              <span class="${
                instagramEnabled ? 'connected' : 'disabled'
              }">
                ${
                  instagramEnabled
                    ? 'Enabled'
                    : 'Not Enabled'
                }
              </span>

            </div>

          </div>

          <div class="glime-ai-info">
            Provider, Model, Core System Instructions और
            Safety configuration GLIME द्वारा managed हैं।
          </div>

        </div>


        <div class="glime-ai-actions">

          <button
            type="button"
            id="glime-ai-save"
            class="glime-ai-save-btn"
          >
            Save AI Settings
          </button>

          <span
            id="glime-ai-save-status"
            class="glime-ai-save-status"
          ></span>

        </div>

      </div>
    `;

    bindEvents(root);
  }

  function setStatus(message, type) {
    const el = document.getElementById(
      'glime-ai-save-status'
    );

    if (!el) return;

    el.textContent = message;

    el.className =
      'glime-ai-save-status ' +
      (type || '');
  }

  async function saveSettings(root) {
    const sb = getSupabase();

    if (!sb || !clientId) {
      throw new Error(
        'Supabase client or client ID unavailable.'
      );
    }

    const statusEl =
      document.getElementById('glime-ai-status');

    const languageEl =
      document.getElementById('glime-ai-language');

    const toneEl =
      document.getElementById('glime-ai-tone');

    const knowledgeEl =
      document.getElementById('glime-ai-knowledge');

    const memoryEl =
      document.getElementById('glime-ai-memory');

    const leadContextEl =
      document.getElementById('glime-ai-lead-context');

    const salesInstructionsEl =
      document.getElementById(
        'glime-ai-sales-instructions'
      );

    const payload = {
      status: statusEl?.checked
        ? 'active'
        : 'paused',

      language:
        languageEl?.value.trim() || 'Auto',

      tone:
        toneEl?.value.trim() || 'Professional',

      knowledge_enabled:
        knowledgeEl?.checked === true,

      conversation_memory_enabled:
        memoryEl?.checked === true,

      lead_context_enabled:
        leadContextEl?.checked === true,

      sales_instructions:
        salesInstructionsEl?.value || ''
    };

    setStatus('Saving...', 'saving');

    const { data, error } = await sb
      .from('client_ai_brains')
      .update(payload)
      .eq('client_id', clientId)
      .select([
        'id',
        'client_id',
        'brain_key',
        'name',
        'status',
        'language',
        'tone',
        'system_instructions',
        'sales_instructions',
        'safety_instructions',
        'knowledge_enabled',
        'conversation_memory_enabled',
        'lead_context_enabled',
        'created_at',
        'updated_at'
      ].join(','))
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        'AI settings could not be updated. No matching client AI brain found.'
      );
    }

    brain = data;

    setStatus(
      'AI settings saved successfully.',
      'success'
    );

    setTimeout(() => {
      setStatus('', '');
    }, 3000);
  }

  function bindEvents(root) {
    const saveButton =
      root.querySelector('#glime-ai-save');

    if (!saveButton) return;

    saveButton.addEventListener(
      'click',
      async () => {

        saveButton.disabled = true;

        try {
          await saveSettings(root);
        } catch (error) {

          console.error(
            '[GLIME AI Settings] Save failed:',
            error
          );

          setStatus(
            error?.message ||
              'AI settings save failed.',
            'error'
          );

        } finally {
          saveButton.disabled = false;
        }

      }
    );
  }

  async function ensureBrainIfMissing() {
    if (brain) return brain;

    const sb = getSupabase();

    /*
     * We intentionally do NOT create a new function/table.
     * Existing client AI brain must already exist.
     *
     * If the brain is missing, the Settings page reports it
     * instead of silently creating another architecture.
     */

    return null;
  }

  async function init() {
    try {

      supabaseClient = getSupabase();

      if (!supabaseClient) {
        throw new Error(
          'Supabase client is not available.'
        );
      }

      clientId = await resolveClientId();

      await loadBrain();

      await ensureBrainIfMissing();

      await loadChannels();

      const [
        knowledgeCount,
        offersCount
      ] = await Promise.all([
        loadKnowledgeCount(),
        loadOffersCount()
      ]);

      const root = findModuleRoot();

      if (!root) {
        throw new Error(
          'AI Settings module container was not found.'
        );
      }

      render(
        root,
        knowledgeCount,
        offersCount
      );

    } catch (error) {

      console.error(
        '[GLIME AI Settings] Initialization failed:',
        error
      );

      const root = findModuleRoot();

      if (root) {
        root.innerHTML = `
          <div class="glime-ai-error">
            <strong>AI Settings could not be loaded.</strong>
            <p>
              ${escapeHtml(
                error?.message ||
                'Unknown error'
              )}
            </p>
          </div>
        `;
      }
    }
  }

  /*
   * Register module with existing Settings shell.
   */
  function register() {

    if (
      window.GLIME_SETTINGS &&
      typeof window.GLIME_SETTINGS.register ===
        'function'
    ) {

      window.GLIME_SETTINGS.register(
        MODULE_ID,
        {
          init
        }
      );

      return true;
    }

    return false;
  }

  /*
   * Register immediately if shell is already ready.
   * Otherwise wait for DOM.
   */
  if (!register()) {

    document.addEventListener(
      'DOMContentLoaded',
      function () {
        register();
      },
      { once: true }
    );

  }

})();
