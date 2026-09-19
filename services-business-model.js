(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const STORAGE_KEY =
    'glime_services_wizard';

  const els = {
    industryName:
      document.getElementById('industryName'),

    status:
      document.getElementById('modelStatus'),

    list:
      document.getElementById('modelList'),

    customBtn:
      document.getElementById('customModelBtn'),

    customForm:
      document.getElementById('customModelForm'),

    customName:
      document.getElementById('customModelName'),

    customDescription:
      document.getElementById('customModelDescription'),

    closeCustom:
      document.getElementById('closeCustomBtn'),

    cancelCustom:
      document.getElementById('cancelCustomBtn'),

    useCustom:
      document.getElementById('useCustomBtn'),

    message:
      document.getElementById('message'),

    next:
      document.getElementById('nextBtn'),

    back:
      document.getElementById('backBtn'),

    selectedBadge:
      document.getElementById('selectedBadge')
  };


  const state = {
    systemModels: [],
    selected: null
  };


  function getWizardState() {

    try {

      const raw =
        sessionStorage.getItem(
          STORAGE_KEY
        );

      if (!raw) {
        return {};
      }

      const parsed =
        JSON.parse(raw);

      return parsed &&
        typeof parsed === 'object'
        ? parsed
        : {};

    } catch (error) {

      console.warn(
        'GLIME wizard state read failed:',
        error
      );

      return {};
    }
  }


  function saveWizardState(patch) {

    const next = {
      ...getWizardState(),
      ...patch
    };

    try {

      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(next)
      );

    } catch (error) {

      console.warn(
        'GLIME wizard state save failed:',
        error
      );
    }

    return next;
  }


  function slugify(value) {

    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
  }


  function escapeHtml(value) {

    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  function initials(name) {

    const words =
      String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!words.length) {
      return 'B';
    }

    return words
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase();
  }


  function setStatus(
    text,
    type = ''
  ) {

    els.status.textContent =
      text;

    els.status.className =
      `status${type ? ` ${type}` : ''}`;
  }


  function showMessage(text) {

    els.message.hidden =
      !text;

    els.message.textContent =
      text || '';
  }


  function updateNavigation() {

    els.next.disabled =
      !state.selected;

    els.selectedBadge.hidden =
      !state.selected;

    if (state.selected) {

      els.selectedBadge.textContent =
        state.selected.source === 'custom'
          ? 'Custom selected'
          : 'Selected';
    }
  }


  function clearDownstreamState() {

    saveWizardState({

      template: null,

      entity: null,

      fields: null

    });
  }


  function selectSystemModel(model) {

    const wizard =
      getWizardState();

    state.selected = {

      source: 'system',

      id: model.id,

      name: model.name,

      slug:
        model.slug ||
        slugify(model.name),

      description:
        model.description ||
        null,

      industryId:
        wizard.industry?.id ||
        null
    };


    saveWizardState({

      businessModelSource:
        'system',

      businessModel:
        state.selected

    });


    clearDownstreamState();

    closeCustomForm(false);

    showMessage('');

    renderModels();

    setStatus(
      `${model.name} selected.`,
      'success'
    );

    updateNavigation();
  }


  function selectCustomModel() {

    const name =
      els.customName.value.trim();

    const description =
      els.customDescription.value.trim();


    if (!name) {

      showMessage(
        'Please enter your business model name.'
      );

      els.customName.focus();

      return;
    }


    const industry =
      getWizardState().industry ||
      {};


    state.selected = {

      source: 'custom',

      id: null,

      name,

      slug:
        slugify(name),

      description:
        description || null,

      industryId:
        industry.id || null
    };


    saveWizardState({

      businessModelSource:
        'custom',

      businessModel:
        state.selected

    });


    clearDownstreamState();

    closeCustomForm(false);

    showMessage('');

    renderModels();


    setStatus(
      `${name} selected as your custom business model.`,
      'success'
    );

    updateNavigation();
  }


  function renderModels() {

    els.list.innerHTML = '';


    if (!state.systemModels.length) {

      setStatus(
        'No predefined business model is available for this industry. You can create your own below.',
        'no-match'
      );

      updateNavigation();

      return;
    }


    setStatus(
      `${state.systemModels.length} business model${
        state.systemModels.length === 1
          ? ''
          : 's'
      } available.`
    );


    const fragment =
      document.createDocumentFragment();


    state.systemModels.forEach(
      model => {

        const button =
          document.createElement('button');

        button.type = 'button';

        button.className =
          'model-option';


        const selected =
          state.selected &&
          state.selected.source === 'system' &&
          String(state.selected.id) ===
            String(model.id);


        if (selected) {
          button.classList.add(
            'selected'
          );
        }


        button.innerHTML = `
          <span class="model-icon">
            ${escapeHtml(
              initials(model.name)
            )}
          </span>

          <span class="model-copy">

            <strong>
              ${escapeHtml(
                model.name
              )}
            </strong>

            <small>
              ${
                escapeHtml(
                  model.description ||
                  'GLIME system business model'
                )
              }
            </small>

          </span>

          <span
            class="check"
            aria-hidden="true"
          >
            ✓
          </span>
        `;


        button.addEventListener(
          'click',
          () =>
            selectSystemModel(model)
        );


        fragment.appendChild(
          button
        );
      }
    );


    els.list.appendChild(
      fragment
    );


    updateNavigation();
  }


  function openCustomForm() {

    els.customForm.hidden =
      false;

    els.customBtn.hidden =
      true;

    showMessage('');


    if (
      state.selected?.source ===
      'custom'
    ) {

      els.customName.value =
        state.selected.name || '';

      els.customDescription.value =
        state.selected.description || '';
    }


    requestAnimationFrame(
      () =>
        els.customName.focus()
    );
  }


  function closeCustomForm(
    clearDraft
  ) {

    els.customForm.hidden =
      true;

    els.customBtn.hidden =
      false;


    if (clearDraft) {

      els.customName.value =
        '';

      els.customDescription.value =
        '';
    }
  }


  function restoreSavedState() {

    const saved =
      getWizardState();

    const industry =
      saved.industry;


    if (
      !industry ||
      !saved.industrySource
    ) {

      els.industryName.textContent =
        'No industry selected';

      setStatus(
        'Please return to Step 2 and select an industry.',
        'no-match'
      );

      els.next.disabled =
        true;

      return false;
    }


    els.industryName.textContent =
      industry.name ||
      'Selected industry';


    const savedModel =
      saved.businessModel;


    if (
      savedModel &&
      saved.businessModelSource
    ) {

      state.selected = {

        source:
          saved.businessModelSource,

        id:
          savedModel.id ||
          null,

        name:
          savedModel.name ||
          '',

        slug:
          savedModel.slug ||
          slugify(
            savedModel.name
          ),

        description:
          savedModel.description ||
          null,

        industryId:
          industry.id ||
          null
      };


      if (
        state.selected.source ===
        'custom'
      ) {

        els.customName.value =
          state.selected.name;

        els.customDescription.value =
          state.selected.description ||
          '';


        setStatus(
          `${state.selected.name} is your custom business model.`,
          'success'
        );
      }
    }


    updateNavigation();

    return true;
  }


  async function loadModels() {

    if (!restoreSavedState()) {
      return;
    }


    const saved =
      getWizardState();

    const industry =
      saved.industry;


    /*
      Custom industry:
      there may be no predefined
      system mapping.

      Custom business model remains
      available.
    */

    if (
      saved.industrySource ===
      'custom'
    ) {

      state.systemModels =
        [];

      renderModels();

      return;
    }


    if (
      !window.supabase ||
      !window.supabase.createClient
    ) {

      setStatus(
        'System business models could not be loaded. You can still create a custom one below.',
        'no-match'
      );

      return;
    }


    try {

      const client =
        window.supabase.createClient(

          SUPABASE_URL,

          SUPABASE_PUBLISHABLE_KEY,

          {

            auth: {

              persistSession:
                false,

              autoRefreshToken:
                false,

              detectSessionInUrl:
                false
            }
          }
        );


      /*
        IMPORTANT:

        We query the Industry →
        Industry Template →
        Business Model relationship.

        We do NOT load every business
        model globally.

        This prevents unrelated models
        and duplicate global rows from
        appearing to the client.
      */

      const {
        data: mappings,
        error
      } = await client

        .from(
          'industry_templates'
        )

        .select(`
          business_model_id,
          business_models (
            id,
            name,
            slug,
            status
          )
        `)

        .eq(
          'industry_id',
          industry.id
        )

        .eq(
          'status',
          'active'
        );


      if (error) {
        throw error;
      }


      const unique =
        new Map();


      (mappings || []).forEach(
        row => {

          const model =
            row.business_models;


          if (
            model &&
            model.status ===
              'active' &&
            !unique.has(
              String(model.id)
            )
          ) {

            unique.set(
              String(model.id),

              {

                id:
                  model.id,

                name:
                  model.name,

                slug:
                  model.slug,

                description:
                  null
              }
            );
          }
        }
      );


      state.systemModels =
        Array.from(
          unique.values()
        );


      renderModels();


      /*
        If a previously selected
        system model is no longer
        valid for this industry,
        clear it instead of allowing
        an invalid configuration.
      */

      if (

        state.selected?.source ===
          'system' &&

        !state.systemModels.some(
          model =>
            String(model.id) ===
            String(
              state.selected.id
            )
        )

      ) {

        state.selected =
          null;


        saveWizardState({

          businessModelSource:
            null,

          businessModel:
            null,

          template:
            null,

          entity:
            null,

          fields:
            null
        });


        renderModels();
      }


    } catch (error) {

      console.error(
        'GLIME business model catalog error:',
        error
      );


      state.systemModels =
        [];


      setStatus(
        'System business models could not be loaded. You can still create a custom one below.',
        'no-match'
      );


      updateNavigation();
    }
  }


  function goNext() {

    if (!state.selected) {

      showMessage(
        'Please select a system business model or create a custom one first.'
      );

      return;
    }


    saveWizardState({

      businessModelSource:
        state.selected.source,

      businessModel:
        state.selected
    });


    window.location.href =
      'services-template.html';
  }


  function goBack() {

    window.location.href =
      'services-industry.html';
  }


  els.customBtn.addEventListener(
    'click',
    openCustomForm
  );


  els.closeCustom.addEventListener(
    'click',
    () =>
      closeCustomForm(false)
  );


  els.cancelCustom.addEventListener(
    'click',
    () =>
      closeCustomForm(true)
  );


  els.useCustom.addEventListener(
    'click',
    selectCustomModel
  );


  els.next.addEventListener(
    'click',
    goNext
  );


  els.back.addEventListener(
    'click',
    goBack
  );


  els.customName.addEventListener(
    'input',
    () =>
      showMessage('')
  );


  els.customDescription.addEventListener(
    'input',
    () =>
      showMessage('')
  );


  els.customName.addEventListener(
    'keydown',
    event => {

      if (
        event.key ===
        'Enter'
      ) {

        event.preventDefault();

        selectCustomModel();
      }
    }
  );


  document.addEventListener(
    'keydown',
    event => {

      if (
        event.key ===
          'Escape' &&
        !els.customForm.hidden
      ) {

        closeCustomForm(false);
      }
    }
  );


  /*
    STEP 3 RESPONSIBILITY

    This page handles only:

      Industry
        ↓
      Business Model

    No permanent configuration
    is written to Supabase here.

    Final setup persistence is handled
    later after the guided setup is
    complete.
  */


  loadModels();

})();
