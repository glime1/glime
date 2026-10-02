(() => {
  'use strict';

  const shell = window.GLIME_SETTINGS;

  if (!shell?.state || !shell?.api || !shell?.ui) {
    throw new Error('GLIME Settings shell is not initialized.');
  }

  const { state, api, ui } = shell;
  const db = api.supabase;
  const esc = ui.escapeHtml;

  let brain = null;
  let channels = [];
  let context = {
    knowledge: 0,
    offers: 0
  };

  async function loadBrain() {
    const { data, error } = await db
      .from('client_ai_brains')
      .select(
        'id,client_id,brain_key,name,status,language,tone,sales_instructions,knowledge_enabled,conversation_memory_enabled,lead_context_enabled,created_at,updated_at'
      )
      .eq('client_id', state.client.client_id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        'Central Client AI Brain is not initialized for this client.'
      );
    }

    brain = data;
  }

  async function loadChannels() {
    const { data, error } = await db
      .from('client_ai_brain_channels')
      .select('channel,enabled')
      .eq('client_id', state.client.client_id)
      .in('channel', ['whatsapp', 'instagram'])
      .order('channel', {
        ascending: true
      });

    if (error) throw error;

    channels = data || [];
  }

  async function loadContext() {
    const [knowledgeResult, offersResult] =
      await Promise.all([
        db
          .from('client_knowledge_items')
          .select('id', {
            count: 'exact',
            head: true
          })
          .eq('client_id', state.client.client_id)
          .eq('status', 'active'),

        db
          .from('offers')
          .select('id', {
            count: 'exact',
            head: true
          })
          .eq('client_id', state.client.client_id)
          .eq('status', 'active')
      ]);

    if (knowledgeResult.error) {
      throw knowledgeResult.error;
    }

    if (offersResult.error) {
      throw offersResult.error;
    }

    context = {
      knowledge: knowledgeResult.count || 0,
      offers: offersResult.count || 0
    };
  }

  function attached(channel) {
    const row = channels.find(
      item => item.channel === channel
    );

    return row
      ? row.enabled !== false
      : false;
  }

  function switchHtml(field, checked) {
    return `
      <label class="sw">
        <input
          type="checkbox"
          data-ai-field="${esc(field)}"
          ${checked ? 'checked' : ''}
        >
        <span></span>
      </label>
    `;
  }

  async function save(button, container) {
    if (!container || !brain) {
      return;
    }

    const languageEl =
      container.querySelector(
        '[data-ai-field="language"]'
      );

    const toneEl =
      container.querySelector(
        '[data-ai-field="tone"]'
      );

    const statusEl =
      container.querySelector(
        '[data-ai-field="status"]'
      );

    const salesInstructionsEl =
      container.querySelector(
        '[data-ai-field="sales_instructions"]'
      );

    const knowledgeEl =
      container.querySelector(
        '[data-ai-field="knowledge_enabled"]'
      );

    const memoryEl =
      container.querySelector(
        '[data-ai-field="conversation_memory_enabled"]'
      );

    const leadContextEl =
      container.querySelector(
        '[data-ai-field="lead_context_enabled"]'
      );

    const language =
      languageEl?.value.trim() || '';

    const tone =
      toneEl?.value.trim() || '';

    if (!language || !tone) {
      ui.toast(
        'Language and tone are required.',
        true
      );
      return;
    }

    const payload = {
      status:
        statusEl?.value === 'paused'
          ? 'paused'
          : 'active',

      language,

      tone,

      sales_instructions:
        salesInstructionsEl?.value.trim() || '',

      knowledge_enabled:
        knowledgeEl?.checked === true,

      conversation_memory_enabled:
        memoryEl?.checked === true,

      lead_context_enabled:
        leadContextEl?.checked === true,

      updated_by:
        state.session.user.id,

      updated_at:
        new Date().toISOString()
    };

    button.disabled = true;
    button.textContent = 'Saving...';

    try {
      const {
        data,
        error
      } = await db
        .from('client_ai_brains')
        .update(payload)
        .eq('id', brain.id)
        .eq(
          'client_id',
          state.client.client_id
        )
        .select(
          'id,client_id,brain_key,name,status,language,tone,sales_instructions,knowledge_enabled,conversation_memory_enabled,lead_context_enabled,created_at,updated_at'
        )
        .single();

      if (error) {
        throw error;
      }

      brain = data;

      ui.toast(
        'AI settings saved successfully.'
      );

      render(container);

    } catch (error) {
      console.error(
        '[GLIME AI Settings] Save error:',
        error
      );

      ui.toast(
        error?.message ||
          'Could not save AI settings.',
        true
      );

    } finally {
      button.disabled = false;
      button.textContent = 'Save AI settings';
    }
  }

  function render(container) {
    if (!brain) {
      container.innerHTML = `
        <div class="section-head">
          <h2>AI</h2>
          <p>Central Client AI Brain</p>
        </div>

        <div class="error">
          Central Client AI Brain is not initialized
          for this client.
        </div>
      `;

      return;
    }

    const isActive =
      brain.status === 'active';

    container.innerHTML = `
      <div class="section-head">
        <h2>AI</h2>

        <p>
          One central Client AI Brain for the
          client-facing AI layer.
          Provider and model selection stay
          under GLIME control.
        </p>
      </div>


      <!-- AI BRAIN -->

      <div
        class="channel-card"
        data-ai-root
      >

        <div class="channel-head">

          <div class="channel-name">
            🧠 Client AI Brain
          </div>

          <span
            class="badge ${
              isActive ? 'on' : 'off'
            }"
          >
            ${
              isActive
                ? '● Active'
                : 'Paused'
            }
          </span>

        </div>


        <!-- STATUS -->

        <div class="row">

          <div class="row-info">

            <b>AI status</b>

            <small>
              Central Client AI Brain profile status.
            </small>

          </div>

          <select
            class="select"
            data-ai-field="status"
          >

            <option
              value="active"
              ${
                isActive
                  ? 'selected'
                  : ''
              }
            >
              Active
            </option>

            <option
              value="paused"
              ${
                !isActive
                  ? 'selected'
                  : ''
              }
            >
              Paused
            </option>

          </select>

        </div>


        <!-- LANGUAGE -->

        <div class="row">

          <div class="row-info">

            <b>Language</b>

            <small>
              Preferred response language
              for the central AI profile.
            </small>

          </div>

          <input
            class="select"
            style="min-width:180px"
            data-ai-field="language"
            value="${esc(
              brain.language || ''
            )}"
            placeholder="Auto"
          >

        </div>


        <!-- TONE -->

        <div class="row">

          <div class="row-info">

            <b>Tone</b>

            <small>
              Business-facing communication tone.
            </small>

          </div>

          <input
            class="select"
            style="min-width:180px"
            data-ai-field="tone"
            value="${esc(
              brain.tone || ''
            )}"
            placeholder="Professional"
          >

        </div>


        <!-- KNOWLEDGE -->

        <div class="row">

          <div class="row-info">

            <b>
              Services & Client Knowledge
            </b>

            <small>
              Existing business knowledge
              setting in the central AI profile.
            </small>

          </div>

          ${switchHtml(
            'knowledge_enabled',
            brain.knowledge_enabled === true
          )}

        </div>


        <!-- MEMORY -->

        <div class="row">

          <div class="row-info">

            <b>
              Conversation Memory
            </b>

            <small>
              Existing central AI memory setting.
            </small>

          </div>

          ${switchHtml(
            'conversation_memory_enabled',
            brain.conversation_memory_enabled === true
          )}

        </div>


        <!-- LEAD CONTEXT -->

        <div class="row">

          <div class="row-info">

            <b>
              Lead Context
            </b>

            <small>
              Existing central AI lead/customer
              context setting.
            </small>

          </div>

          ${switchHtml(
            'lead_context_enabled',
            brain.lead_context_enabled === true
          )}

        </div>


        <!-- SALES INSTRUCTIONS -->

        <div class="row">

          <div class="row-info">

            <b>
              Sales Instructions
            </b>

            <small>
              Business-specific sales guidance.
              Core system and safety instructions
              stay under GLIME control.
            </small>

          </div>

          <textarea
            data-ai-field="sales_instructions"
            style="
              width:min(100%,520px);
              min-height:120px;
              resize:vertical;
              background:var(--surf2);
              color:var(--tx);
              border:1px solid var(--bd);
              border-radius:10px;
              padding:10px;
              outline:none
            "
            placeholder="Describe your business-specific sales guidance..."
          >${esc(
            brain.sales_instructions || ''
          )}</textarea>

        </div>


        <!-- SAVE -->

        <div class="actions">

          <button
            class="btn primary"
            data-ai-save
          >
            Save AI settings
          </button>

        </div>


        <p class="note">
          Provider, model, core system instructions
          and safety controls are managed by GLIME
          and are not editable here.
        </p>

      </div>


      <!-- CENTRAL CHANNELS -->

      <div class="channel-card">

        <div class="channel-head">

          <div class="channel-name">
            🔗 Central AI channels
          </div>

          <span class="badge">
            Existing brain links
          </span>

        </div>


        <div class="row">

          <div class="row-info">

            <b>WhatsApp</b>

            <small>
              Attached to the same Client AI Brain.
              Channel on/off behaviour remains in
              Channels.
            </small>

          </div>

          <span
            class="badge ${
              attached('whatsapp')
                ? 'on'
                : 'off'
            }"
          >
            ${
              attached('whatsapp')
                ? '● Attached'
                : 'Not attached'
            }
          </span>

        </div>


        <div class="row">

          <div class="row-info">

            <b>Instagram</b>

            <small>
              Attached to the same Client AI Brain.
              Channel on/off behaviour remains in
              Channels.
            </small>

          </div>

          <span
            class="badge ${
              attached('instagram')
                ? 'on'
                : 'off'
            }"
          >
            ${
              attached('instagram')
                ? '● Attached'
                : 'Not attached'
            }
          </span>

        </div>


        <p class="note">
          Voice AI is intentionally outside
          the central Settings AI module for now.
        </p>

      </div>


      <!-- BUSINESS CONTEXT -->

      <div class="channel-card">

        <div class="channel-head">

          <div class="channel-name">
            📚 Central business context
          </div>

          <span class="badge on">
            ● Existing data
          </span>

        </div>


        <div class="row">

          <div class="row-info">

            <b>
              Active client knowledge
            </b>

            <small>
              Existing Client Knowledge items
              from the Services knowledge layer.
            </small>

          </div>

          <span class="badge on">
            ${context.knowledge} items
          </span>

        </div>


        <div class="row">

          <div class="row-info">

            <b>
              Active offers
            </b>

            <small>
              Existing active business offers
              from the catalog architecture.
            </small>

          </div>

          <span class="badge on">
            ${context.offers} offers
          </span>

        </div>


        <p class="note">
          Read-only. Services remains the source
          of business knowledge and offers.
        </p>

      </div>
    `;

    const saveButton =
      container.querySelector(
        '[data-ai-save]'
      );

    if (saveButton) {
      saveButton.onclick = () =>
        save(saveButton, container);
    }
  }


  /*
   * IMPORTANT:
   * Register using the exact API expected
   * by the existing settings.html shell.
   */

  shell.register({
    id: 'ai',

    label: 'AI',

    order: 20,

    render: async ({ container }) => {

      container.innerHTML =
        '<div class="loading">Loading AI settings…</div>';

      try {

        await Promise.all([
          loadBrain(),
          loadChannels(),
          loadContext()
        ]);

        render(container);

      } catch (error) {

        console.error(
          '[GLIME AI Settings] Load error:',
          error
        );

        container.innerHTML = `
          <div class="error">
            Could not load AI settings.
            ${esc(
              error?.message ||
              'Unknown error'
            )}
          </div>
        `;
      }
    }
  });

})();
