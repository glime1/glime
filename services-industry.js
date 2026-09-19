(() => {
  'use strict';

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const STORAGE_KEY = 'glime_services_wizard';

  const els = {
    search: document.getElementById('industrySearch'),
    clearSearch: document.getElementById('clearSearchBtn'),
    status: document.getElementById('industryStatus'),
    list: document.getElementById('industryList'),

    customBtn: document.getElementById('customIndustryBtn'),
    customForm: document.getElementById('customIndustryForm'),
    customName: document.getElementById('customIndustryName'),
    customDescription: document.getElementById('customIndustryDescription'),
    closeCustom: document.getElementById('closeCustomBtn'),
    cancelCustom: document.getElementById('cancelCustomBtn'),
    useCustom: document.getElementById('useCustomBtn'),

    message: document.getElementById('message'),
    next: document.getElementById('nextBtn'),
    back: document.getElementById('backBtn'),
    selectedBadge: document.getElementById('selectedBadge')
  };

  const state = {
    industries: [],
    filtered: [],
    selected: null,
    supabaseReady: false
  };

  function getWizardState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);

      return parsed && typeof parsed === 'object'
        ? parsed
        : {};
    } catch (error) {
      console.warn('GLIME wizard state read failed:', error);
      return {};
    }
  }

  function saveWizardState(patch) {
    const current = getWizardState();

    const next = {
      ...current,
      ...patch
    };

    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch (error) {
      console.warn('GLIME wizard state save failed:', error);
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
    const words = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) {
      return 'I';
    }

    return words
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase();
  }

  function showMessage(text) {
    if (!text) {
      els.message.hidden = true;
      els.message.textContent = '';
      return;
    }

    els.message.hidden = false;
    els.message.textContent = text;
  }

  function setStatus(text, type = '') {
    els.status.textContent = text;
    els.status.className =
      `status${type ? ` ${type}` : ''}`;
  }

  function updateNavigation() {
    els.next.disabled = !state.selected;

    if (state.selected) {
      els.selectedBadge.hidden = false;

      els.selectedBadge.textContent =
        state.selected.source === 'custom'
          ? 'Custom selected'
          : 'Selected';
    } else {
      els.selectedBadge.hidden = true;
    }
  }

  function selectSystemIndustry(industry) {
    state.selected = {
      source: 'system',
      id: industry.id,
      name: industry.name,
      slug: industry.slug || slugify(industry.name),
      description: industry.description || null
    };

    saveWizardState({
      industrySource: 'system',

      industry: state.selected,

      businessModel: null,
      template: null,
      entity: null,
      fields: null
    });

    closeCustomForm(false);

    showMessage('');

    renderIndustries();

    updateNavigation();

    setStatus(
      `${industry.name} selected.`,
      'success'
    );
  }

  function selectCustomIndustry() {
    const name =
      els.customName.value.trim();

    const description =
      els.customDescription.value.trim();

    if (!name) {
      showMessage(
        'Please enter your industry name.'
      );

      els.customName.focus();

      return;
    }

    state.selected = {
      source: 'custom',
      id: null,
      name,
      slug: slugify(name),
      description: description || null
    };

    saveWizardState({
      industrySource: 'custom',

      industry: state.selected,

      businessModel: null,
      template: null,
      entity: null,
      fields: null
    });

    closeCustomForm(false);

    showMessage('');

    renderIndustries();

    updateNavigation();

    setStatus(
      `${name} selected as your custom industry.`,
      'success'
    );
  }

  function renderIndustries() {
    const query =
      els.search.value.trim().toLowerCase();

    state.filtered =
      state.industries.filter(industry => {

        if (!query) {
          return true;
        }

        const haystack = [
          industry.name,
          industry.slug
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      });

    els.list.innerHTML = '';

    if (!state.filtered.length) {

      setStatus(
        query
          ? 'No system industry found. You can create a custom one below.'
          : 'No system industries are available right now. You can create a custom one below.',
        'no-match'
      );

      updateNavigation();

      return;
    }

    if (query) {
      setStatus(
        `${state.filtered.length} system industr${
          state.filtered.length === 1
            ? 'y'
            : 'ies'
        } found.`
      );
    } else {
      setStatus(
        `${state.filtered.length} system industries available.`
      );
    }

    const fragment =
      document.createDocumentFragment();

    state.filtered.forEach(industry => {

      const button =
        document.createElement('button');

      button.type = 'button';

      button.className =
        'industry-option';

      const selected =
        state.selected &&
        state.selected.source === 'system' &&
        String(state.selected.id) ===
          String(industry.id);

      if (selected) {
        button.classList.add('selected');
      }

      button.innerHTML = `
        <span class="industry-icon">
          ${escapeHtml(initials(industry.name))}
        </span>

        <span class="industry-copy">
          <strong>
            ${escapeHtml(industry.name)}
          </strong>

          <small>
            GLIME system industry
          </small>
        </span>

        <span class="check" aria-hidden="true">
          ✓
        </span>
      `;

      button.addEventListener(
        'click',
        () => selectSystemIndustry(industry)
      );

      fragment.appendChild(button);
    });

    els.list.appendChild(fragment);

    updateNavigation();
  }

  function openCustomForm() {
    els.customForm.hidden = false;
    els.customBtn.hidden = true;

    showMessage('');

    const existing =
      state.selected &&
      state.selected.source === 'custom'
        ? state.selected
        : null;

    if (existing) {
      els.customName.value =
        existing.name || '';

      els.customDescription.value =
        existing.description || '';
    }

    window.requestAnimationFrame(() => {
      els.customName.focus();
    });
  }

  function closeCustomForm(clearDraft) {
    els.customForm.hidden = true;
    els.customBtn.hidden = false;

    if (clearDraft) {
      els.customName.value = '';
      els.customDescription.value = '';
    }
  }

  function restoreSavedSelection() {
    const saved =
      getWizardState();

    const savedIndustry =
      saved.industry;

    if (
      !savedIndustry ||
      !saved.industrySource
    ) {
      state.selected = null;

      updateNavigation();

      return;
    }

    if (
      saved.industrySource === 'custom'
    ) {

      state.selected = {
        source: 'custom',
        id: null,
        name: savedIndustry.name || '',
        slug:
          savedIndustry.slug ||
          slugify(savedIndustry.name),
        description:
          savedIndustry.description ||
          null
      };

      els.customName.value =
        state.selected.name;

      els.customDescription.value =
        state.selected.description || '';

      setStatus(
        `${state.selected.name} is your custom industry.`,
        'success'
      );

      updateNavigation();

      return;
    }

    const match =
      state.industries.find(
        item =>
          String(item.id) ===
          String(savedIndustry.id)
      );

    if (match) {

      state.selected = {
        source: 'system',
        id: match.id,
        name: match.name,
        slug:
          match.slug ||
          slugify(match.name),
        description:
          match.description || null
      };

    } else {

      state.selected = {
        source: 'system',
        id: savedIndustry.id,
        name: savedIndustry.name || '',
        slug:
          savedIndustry.slug ||
          slugify(savedIndustry.name),
        description:
          savedIndustry.description ||
          null
      };
    }

    updateNavigation();
  }

  async function loadIndustries() {

    state.industries = [];

    renderIndustries();

    if (
      !window.supabase ||
      typeof window.supabase.createClient !==
        'function'
    ) {

      setStatus(
        'System catalog is unavailable. You can still create a custom industry.',
        'no-match'
      );

      restoreSavedSelection();

      return;
    }

    try {

      const client =
        window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false
            }
          }
        );

      state.supabaseReady = true;

      const {
        data,
        error
      } = await client
        .from('industries')
        .select(
          'id,name,slug,status,is_system'
        )
        .eq('status', 'active')
        .order(
          'name',
          {
            ascending: true
          }
        );

      if (error) {
        throw error;
      }

      state.industries =
        Array.isArray(data)
          ? data
          : [];

      renderIndustries();

      restoreSavedSelection();

      renderIndustries();

    } catch (error) {

      console.error(
        'GLIME industry catalog error:',
        error
      );

      state.industries = [];

      setStatus(
        'System catalog could not be loaded. You can still create a custom industry below.',
        'no-match'
      );

      restoreSavedSelection();

      renderIndustries();
    }
  }

  function goNext() {

    if (!state.selected) {

      showMessage(
        'Please select a system industry or create a custom industry first.'
      );

      return;
    }

    saveWizardState({
      industrySource:
        state.selected.source,

      industry:
        state.selected
    });

    window.location.href =
      'services-business-model.html';
  }

  function goBack() {
    window.location.href =
      'services.html';
  }

  els.search.addEventListener(
    'input',
    () => {

      els.clearSearch.hidden =
        !els.search.value;

      showMessage('');

      renderIndustries();
    }
  );

  els.clearSearch.addEventListener(
    'click',
    () => {

      els.search.value = '';

      els.clearSearch.hidden = true;

      els.search.focus();

      renderIndustries();
    }
  );

  els.customBtn.addEventListener(
    'click',
    openCustomForm
  );

  els.closeCustom.addEventListener(
    'click',
    () => closeCustomForm(false)
  );

  els.cancelCustom.addEventListener(
    'click',
    () => closeCustomForm(true)
  );

  els.useCustom.addEventListener(
    'click',
    selectCustomIndustry
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
    () => showMessage('')
  );

  els.customDescription.addEventListener(
    'input',
    () => showMessage('')
  );

  els.customName.addEventListener(
    'keydown',
    event => {

      if (event.key === 'Enter') {

        event.preventDefault();

        selectCustomIndustry();
      }
    }
  );

  document.addEventListener(
    'keydown',
    event => {

      if (
        event.key === 'Escape' &&
        !els.customForm.hidden
      ) {
        closeCustomForm(false);
      }
    }
  );

  /*
    STEP 2 RESPONSIBILITY

    This page only handles industry selection.

    It does NOT permanently write the industry
    configuration to Supabase.

    Final permanent setup will happen after
    the complete guided setup flow.
  */

  loadIndustries();

})();
