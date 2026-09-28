/* =========================================================
   GLIME — SERVICES CLIENT KNOWLEDGE BASE ADDON
   ---------------------------------------------------------
   Purpose:
   - Step 5 में Client Knowledge Base देना
   - हर client की knowledge अलग रखना
   - 5 Omnidim-inspired use-case categories
   - केवल TEXT knowledge
   - कोई document upload नहीं
   - कोई Voice AI Agent creation नहीं
   - Existing client-storage-knowledge Edge Function का use
   - Existing client_knowledge_items table का use
   - Admin इस flow का हिस्सा नहीं
========================================================= */

(() => {
  'use strict';

  const HOST_ID = 'knowledgeBaseHost';

  const CATEGORIES = [
    {
      key: 'lead_generation',
      label: 'Lead Generation',
      description:
        'Leads, prospects, qualification और follow-up से जुड़ी business knowledge.',
      examples: [
        'Lead qualification rules',
        'Ideal customer information',
        'Follow-up rules',
        'Common prospect questions'
      ]
    },

    {
      key: 'appointments',
      label: 'Appointments',
      description:
        'Booking, appointments, consultations और reminders से जुड़ी knowledge.',
      examples: [
        'Booking rules',
        'Appointment timings',
        'Rescheduling rules',
        'Cancellation / no-show policy'
      ]
    },

    {
      key: 'support',
      label: 'Support',
      description:
        'Customer support, product questions और business policies से जुड़ी knowledge.',
      examples: [
        'Product information',
        'Refund policy',
        'Return / warranty rules',
        'Frequently asked questions'
      ]
    },

    {
      key: 'negotiation',
      label: 'Negotiation',
      description:
        'Pricing, discounts, payment arrangements और negotiation rules.',
      examples: [
        'Allowed discounts',
        'Negotiation limits',
        'Payment plans',
        'When to escalate'
      ]
    },

    {
      key: 'collections',
      label: 'Collections',
      description:
        'Payment reminders, renewals और follow-up communication से जुड़ी knowledge.',
      examples: [
        'Payment reminder rules',
        'Overdue payment process',
        'Renewal reminders',
        'Approved follow-up wording'
      ]
    }
  ];

  let knowledgeItems = [];
  let selectedCategory = 'lead_generation';
  let editingId = null;
  let mounted = false;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[char])
    );
  }

  function getCategory(key) {
    return CATEGORIES.find(
      category => category.key === key
    );
  }

  function getCategoryLabel(key) {
    return (
      getCategory(key)?.label ||
      'Uncategorized'
    );
  }

  /* =======================================================
     SUPABASE SESSION
  ======================================================= */

  async function getSession() {

    if (
      !window.supabaseClient ||
      typeof window.supabaseClient.auth?.getSession !==
        'function'
    ) {
      throw new Error(
        'GLIME Supabase client is not available.'
      );
    }

    const {
      data,
      error
    } =
      await window.supabaseClient.auth.getSession();

    if (error) {
      throw error;
    }

    if (!data?.session) {
      throw new Error(
        'Your session has expired. Please sign in again.'
      );
    }

    return data.session;
  }

  /* =======================================================
     EXISTING EDGE FUNCTION
  ======================================================= */

  async function knowledgeApi(
    action,
    payload = {}
  ) {

    const session =
      await getSession();

    const supabaseUrl =
      window.SUPABASE_URL ||
      (
        typeof SUPABASE_URL !==
        'undefined'
          ? SUPABASE_URL
          : ''
      );

    const supabaseKey =
      window.SUPABASE_KEY ||
      (
        typeof SUPABASE_KEY !==
        'undefined'
          ? SUPABASE_KEY
          : ''
      );

    if (!supabaseUrl) {
      throw new Error(
        'Supabase URL is not configured.'
      );
    }

    const response =
      await fetch(
        `${supabaseUrl}/functions/v1/client-storage-knowledge`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${session.access_token}`,

            ...(supabaseKey
              ? {
                  apikey:
                    supabaseKey
                }
              }
              : {})
          },

          body: JSON.stringify({
            action,
            ...payload
          })
        }
      );

    const result =
      await response
        .json()
        .catch(() => ({}));

    if (
      !response.ok ||
      result?.ok === false
    ) {
      throw new Error(
        result?.error ||
        `Knowledge request failed (${response.status}).`
      );
    }

    return result;
  }

  /* =======================================================
     STATUS
  ======================================================= */

  function setStatus(
    message,
    isError = false
  ) {

    const el =
      $('kbStatus');

    if (!el) return;

    el.textContent =
      message || '';

    el.classList.toggle(
      'error',
      Boolean(isError)
    );
  }

  /* =======================================================
     CATEGORY FILTER
  ======================================================= */

  function getVisibleItems() {

    if (
      selectedCategory ===
      'all'
    ) {
      return knowledgeItems;
    }

    if (
      selectedCategory ===
      'uncategorized'
    ) {
      return knowledgeItems.filter(
        item =>
          !item?.metadata
            ?.use_case_category
      );
    }

    return knowledgeItems.filter(
      item =>
        item?.metadata
          ?.use_case_category ===
        selectedCategory
    );
  }

  /* =======================================================
     CATEGORY UI
  ======================================================= */

  function renderCategories() {

    const host =
      $('kbCategories');

    if (!host) return;

    const list = [
      {
        key: 'all',
        label: 'All'
      },

      ...CATEGORIES,

      {
        key: 'uncategorized',
        label: 'Uncategorized'
      }
    ];

    host.innerHTML =
      list
        .map(
          category => `
            <button
              type="button"
              class="kb-category ${
                selectedCategory ===
                category.key
                  ? 'active'
                  : ''
              }"
              data-kb-category="${esc(
                category.key
              )}"
            >
              ${esc(
                category.label
              )}
            </button>
          `
        )
        .join('');

    host
      .querySelectorAll(
        '[data-kb-category]'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            selectedCategory =
              button.dataset
                .kbCategory ||
              'all';

            cancelEdit(
              false
            );

            renderAll();
          }
        );
      });
  }

  /* =======================================================
     REFERENCE INFORMATION
  ======================================================= */

  function renderReference() {

    const host =
      $('kbReference');

    if (!host) return;

    if (
      selectedCategory ===
        'all' ||
      selectedCategory ===
        'uncategorized'
    ) {

      host.innerHTML = `
        <div class="kb-reference-note">
          These five categories are only for organizing
          your business knowledge. They do not create
          or configure a Voice AI Assistant.
        </div>
      `;

      return;
    }

    const category =
      getCategory(
        selectedCategory
      );

    if (!category) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = `
      <div class="kb-reference-title">
        ${esc(
          category.label
        )}
      </div>

      <p class="kb-reference-description">
        ${esc(
          category.description
        )}
      </p>

      <div class="kb-example-list">
        ${
          category.examples
            .map(
              example => `
                <div class="kb-example">
                  <span>•</span>
                  <span>
                    ${esc(example)}
                  </span>
                </div>
              `
            )
            .join('')
        }
      </div>

      <div class="kb-reference-note">
        Use these examples only as guidance.
        Enter your own actual business information below.
      </div>
    `;
  }

  /* =======================================================
     SELECTED CATEGORY LABEL
  ======================================================= */

  function updateSelectedCategoryLabel() {

    const el =
      $('kbSelectedCategory');

    if (!el) return;

    if (
      selectedCategory ===
      'all'
    ) {

      el.textContent =
        'All';

      return;
    }

    if (
      selectedCategory ===
      'uncategorized'
    ) {

      el.textContent =
        'Uncategorized';

      return;
    }

    el.textContent =
      getCategoryLabel(
        selectedCategory
      );
  }

  /* =======================================================
     KNOWLEDGE LIST
  ======================================================= */

  function renderItems() {

    const host =
      $('kbItems');

    if (!host) return;

    const items =
      getVisibleItems();

    if (!items.length) {

      host.innerHTML = `
        <div class="kb-empty">
          No knowledge has been added
          in this category yet.
        </div>
      `;

      return;
    }

    host.innerHTML =
      items
        .map(item => {

          const category =
            item?.metadata
              ?.use_case_category;

          return `
            <article
              class="kb-item"
            >

              <div
                class="kb-item-top"
              >

                <div
                  class="kb-item-heading"
                >

                  <strong>
                    ${esc(
                      item.title
                    )}
                  </strong>

                  <span
                    class="kb-pill"
                  >
                    ${esc(
                      getCategoryLabel(
                        category
                      )
                    )}
                  </span>

                </div>

                <div
                  class="kb-item-actions"
                >

                  <button
                    type="button"
                    class="kb-action"
                    data-kb-edit="${esc(
                      item.id
                    )}"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    class="kb-action danger"
                    data-kb-delete="${esc(
                      item.id
                    )}"
                  >
                    Delete
                  </button>

                </div>

              </div>

              <div
                class="kb-item-content"
              >
                ${esc(
                  item.content
                )}
              </div>

            </article>
          `;
        })
        .join('');

    host
      .querySelectorAll(
        '[data-kb-edit]'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            startEdit(
              button.dataset
                .kbEdit
            );

          }
        );

      });

    host
      .querySelectorAll(
        '[data-kb-delete]'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            deleteKnowledge(
              button.dataset
                .kbDelete
            );

          }
        );

      });
  }

  /* =======================================================
     EDITOR
  ======================================================= */

  function resetEditor() {

    const title =
      $('kbTitle');

    const content =
      $('kbContent');

    if (title) {
      title.value = '';
    }

    if (content) {
      content.value = '';
    }

    editingId = null;

    const save =
      $('kbSave');

    if (save) {
      save.textContent =
        'Save knowledge';

      save.disabled =
        false;
    }

    const cancel =
      $('kbCancel');

    if (cancel) {
      cancel.classList.add(
        'hidden'
      );
    }
  }

  function cancelEdit(
    showMessage = true
  ) {

    resetEditor();

    if (showMessage) {
      setStatus('');
    }

    renderAll();
  }

  function startEdit(id) {

    const item =
      knowledgeItems.find(
        knowledge =>
          knowledge.id === id
      );

    if (!item) return;

    editingId =
      item.id;

    selectedCategory =
      item?.metadata
        ?.use_case_category ||
      'uncategorized';

    const title =
      $('kbTitle');

    const content =
      $('kbContent');

    if (title) {
      title.value =
        item.title || '';
    }

    if (content) {
      content.value =
        item.content || '';
    }

    const save =
      $('kbSave');

    if (save) {
      save.textContent =
        'Update knowledge';
    }

    const cancel =
      $('kbCancel');

    if (cancel) {
      cancel.classList.remove(
        'hidden'
      );
    }

    renderAll();

    if (title) {
      title.focus();
    }
  }

  /* =======================================================
     SAVE KNOWLEDGE
  ======================================================= */

  async function saveKnowledge() {

    const title =
      $('kbTitle')
        ?.value
        ?.trim() ||
      '';

    const content =
      $('kbContent')
        ?.value
        ?.trim() ||
      '';

    if (!title) {

      setStatus(
        'Knowledge title is required.',
        true
      );

      return;
    }

    if (!content) {

      setStatus(
        'Knowledge content is required.',
        true
      );

      return;
    }

    if (
      selectedCategory ===
        'all' ||
      selectedCategory ===
        'uncategorized'
    ) {

      setStatus(
        'Please select one of the five use-case categories.',
        true
      );

      return;
    }

    const existing =
      editingId
        ? knowledgeItems.find(
            item =>
              item.id ===
              editingId
          )
        : null;

    const metadata = {
      ...(existing?.metadata &&
      typeof existing.metadata ===
        'object'
        ? existing.metadata
        : {}),

      use_case_category:
        selectedCategory,

      knowledge_scope:
        'client'
    };

    const saveButton =
      $('kbSave');

    try {

      if (saveButton) {
        saveButton.disabled =
          true;

        saveButton.textContent =
          editingId
            ? 'Updating...'
            : 'Saving...';
      }

      setStatus(
        'Saving knowledge...'
      );

      const result =
        await knowledgeApi(
          'save_knowledge',
          {
            id:
              editingId ||
              undefined,

            title,

            content,

            source_type:
              'manual',

            status:
              'active',

            metadata
          }
        );

      const saved =
        result?.item;

      if (!saved) {
        throw new Error(
          'Knowledge was not returned after saving.'
        );
      }

      if (editingId) {

        knowledgeItems =
          knowledgeItems.map(
            item =>
              item.id ===
              saved.id
                ? saved
                : item
          );

      } else {

        knowledgeItems = [
          saved,
          ...knowledgeItems
        ];

      }

      resetEditor();

      setStatus(
        'Knowledge saved successfully.'
      );

      renderAll();

    } catch (error) {

      console.error(
        'Knowledge save error:',
        error
      );

      setStatus(
        error?.message ||
        'Unable to save knowledge.',
        true
      );

    } finally {

      if (saveButton) {
        saveButton.disabled =
          false;

        if (!editingId) {
          saveButton.textContent =
            'Save knowledge';
        }
      }

    }
  }

  /* =======================================================
     DELETE KNOWLEDGE
  ======================================================= */

  async function deleteKnowledge(
    id
  ) {

    if (!id) return;

    const item =
      knowledgeItems.find(
        knowledge =>
          knowledge.id === id
      );

    if (!item) return;

    const confirmed =
      window.confirm(
        `Delete "${item.title}" from this client's knowledge base?`
      );

    if (!confirmed) {
      return;
    }

    try {

      setStatus(
        'Deleting knowledge...'
      );

      await knowledgeApi(
        'delete_knowledge',
        {
          id
        }
      );

      knowledgeItems =
        knowledgeItems.filter(
          knowledge =>
            knowledge.id !== id
        );

      if (
        editingId === id
      ) {
        resetEditor();
      }

      setStatus(
        'Knowledge deleted successfully.'
      );

      renderAll();

    } catch (error) {

      console.error(
        'Knowledge delete error:',
        error
      );

      setStatus(
        error?.message ||
        'Unable to delete knowledge.',
        true
      );
    }
  }

  /* =======================================================
     LOAD KNOWLEDGE
  ======================================================= */

  async function loadKnowledge() {

    try {

      setStatus(
        'Loading your business knowledge...'
      );

      const result =
        await knowledgeApi(
          'list_knowledge'
        );

      knowledgeItems =
        Array.isArray(
          result?.items
        )
          ? result.items
          : [];

      setStatus(
        knowledgeItems.length
          ? `${knowledgeItems.length} knowledge item${
              knowledgeItems.length === 1
                ? ''
                : 's'
            } loaded.`
          : 'No knowledge added yet.'
      );

      renderAll();

    } catch (error) {

      console.error(
        'Knowledge load error:',
        error
      );

      knowledgeItems = [];

      setStatus(
        error?.message ||
        'Unable to load client knowledge.',
        true
      );

      renderAll();
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  function renderAll() {

    renderCategories();

    renderReference();

    renderItems();

    updateSelectedCategoryLabel();

    const count =
      $('kbCount');

    if (count) {

      const activeCount =
        knowledgeItems.filter(
          item =>
            item.status ===
            'active'
        ).length;

      count.textContent =
        `${activeCount} active`;
    }
  }

  /* =======================================================
     MOUNT HTML
  ======================================================= */

  function mount() {

    if (mounted) {
      return;
    }

    const host =
      $(HOST_ID);

    if (!host) {
      return;
    }

    mounted = true;

    host.innerHTML = `
      <section
        id="kbRoot"
        class="kb-root"
      >

        <div
          class="kb-header"
        >

          <div>

            <span
              class="kb-kicker"
            >
              CLIENT KNOWLEDGE BASE
            </span>

            <h4>
              Your Private Business Knowledge
            </h4>

            <p>
              Add the information that your
              customer-facing specialists are
              allowed to use for this client.
            </p>

          </div>

          <span
            class="kb-count"
            id="kbCount"
          >
            0 active
          </span>

        </div>


        <div
          class="kb-warning"
        >
          <strong>
            Important:
          </strong>

          This knowledge belongs only to
          your business/client account.
          WhatsApp and Instagram specialists
          can use this client's knowledge later.
          These categories do not create a
          Voice AI Assistant.
        </div>


        <div
          class="kb-categories"
          id="kbCategories"
        ></div>


        <div
          id="kbReference"
        ></div>


        <div
          class="kb-editor"
        >

          <div
            class="kb-editor-title"
          >

            <div>

              <strong>
                Add Business Knowledge
              </strong>

              <span>
                Selected category:
                <b
                  id="kbSelectedCategory"
                >
                  Lead Generation
                </b>
              </span>

            </div>

          </div>


          <input
            id="kbTitle"
            type="text"
            maxlength="200"
            autocomplete="off"
            placeholder="Knowledge title — e.g. Refund Policy"
          />


          <textarea
            id="kbContent"
            rows="7"
            maxlength="10000"
            placeholder="Enter the exact business information that your specialist is allowed to use..."
          ></textarea>


          <div
            class="kb-editor-actions"
          >

            <button
              type="button"
              class="kb-save"
              id="kbSave"
            >
              Save knowledge
            </button>

            <button
              type="button"
              class="kb-cancel hidden"
              id="kbCancel"
            >
              Cancel
            </button>

          </div>


          <div
            id="kbStatus"
            class="kb-status"
            aria-live="polite"
          ></div>

        </div>


        <div
          class="kb-list-title"
        >
          Saved Knowledge
        </div>


        <div
          id="kbItems"
          class="kb-items"
        ></div>

      </section>
    `;


    $('kbSave')
      ?.addEventListener(
        'click',
        saveKnowledge
      );


    $('kbCancel')
      ?.addEventListener(
        'click',
        () =>
          cancelEdit(true)
      );


    renderAll();

    loadKnowledge();
  }

  /* =======================================================
     STYLES
  ======================================================= */

  function injectStyles() {

    if (
      $('glimeKnowledgeBaseStyles')
    ) {
      return;
    }

    const style =
      document.createElement(
        'style'
      );

    style.id =
      'glimeKnowledgeBaseStyles';

    style.textContent = `

      #knowledgeBaseHost {
        margin-top: 18px;
        margin-bottom: 24px;
      }


      .kb-root {
        border: 1px solid
          rgba(26, 208, 219, .24);

        border-radius: 18px;

        padding: 18px;

        background:
          rgba(8, 20, 23, .76);

        box-shadow:
          0 18px 40px
          rgba(0, 0, 0, .18);
      }


      .kb-header {
        display: flex;

        justify-content:
          space-between;

        align-items:
          flex-start;

        gap: 16px;

        margin-bottom: 14px;
      }


      .kb-kicker {
        display: inline-block;

        font-size: 11px;

        font-weight: 800;

        letter-spacing: .12em;

        opacity: .72;
      }


      .kb-header h4 {
        margin:
          5px 0 6px;

        font-size: 21px;
      }


      .kb-header p {
        margin: 0;

        line-height: 1.55;

        opacity: .76;
      }


      .kb-count {
        white-space: nowrap;

        border:
          1px solid
          rgba(26, 208, 219, .30);

        border-radius: 999px;

        padding:
          7px 11px;

        font-size: 12px;

        font-weight: 800;
      }


      .kb-warning {
        border:
          1px solid
          rgba(26, 208, 219, .18);

        border-radius: 12px;

        padding:
          11px 13px;

        background:
          rgba(26, 208, 219, .07);

        line-height: 1.55;

        font-size: 13px;

        margin-bottom: 15px;
      }


      .kb-categories {
        display: flex;

        flex-wrap: wrap;

        gap: 9px;

        margin-bottom: 14px;
      }


      .kb-category {
        appearance: none;

        border:
          1px solid
          rgba(255, 255, 255, .10);

        background:
          rgba(255, 255, 255, .05);

        color: inherit;

        border-radius: 999px;

        padding:
          9px 13px;

        cursor: pointer;

        font-weight: 800;
      }


      .kb-category.active {
        border-color:
          rgba(26, 208, 219, .55);

        background:
          rgba(26, 208, 219, .16);
      }


      .kb-reference-title {
        font-size: 15px;

        font-weight: 900;

        margin-bottom: 5px;
      }


      .kb-reference-description {
        margin:
          0 0 10px;

        font-size: 13px;

        line-height: 1.5;

        opacity: .74;
      }


      .kb-example-list {
        display: grid;

        grid-template-columns:
          repeat(
            2,
            minmax(0, 1fr)
          );

        gap: 8px;

        margin-bottom: 10px;
      }


      .kb-example {
        display: flex;

        gap: 8px;

        border:
          1px solid
          rgba(255, 255, 255, .08);

        border-radius: 11px;

        padding: 10px;

        background:
          rgba(255, 255, 255, .035);

        font-size: 12px;

        line-height: 1.45;
      }


      .kb-example span:first-child {
        opacity: .7;
      }


      .kb-reference-note {
        border-radius: 12px;

        padding:
          10px 12px;

        background:
          rgba(26, 208, 219, .06);

        border:
          1px solid
          rgba(26, 208, 219, .14);

        line-height: 1.5;

        font-size: 12px;

        margin:
          10px 0 14px;
      }


      .kb-editor {
        margin-top: 17px;

        border-top:
          1px solid
          rgba(255, 255, 255, .08);

        padding-top: 17px;
      }


      .kb-editor-title {
        margin-bottom: 7px;
      }


      .kb-editor-title strong {
        display: block;

        font-size: 15px;
      }


      .kb-editor-title span {
        display: block;

        margin-top: 4px;

        font-size: 12px;

        opacity: .65;
      }


      .kb-editor input,
      .kb-editor textarea {
        width: 100%;

        box-sizing: border-box;

        border:
          1px solid
          rgba(255, 255, 255, .10);

        background:
          rgba(0, 0, 0, .22);

        color: inherit;

        border-radius: 12px;

        padding: 12px;

        margin-top: 9px;

        outline: none;
      }


      .kb-editor input:focus,
      .kb-editor textarea:focus {
        border-color:
          rgba(26, 208, 219, .48);

        box-shadow:
          0 0 0 2px
          rgba(26, 208, 219, .08);
      }


      .kb-editor textarea {
        resize: vertical;

        min-height: 140px;

        line-height: 1.55;
      }


      .kb-editor-actions {
        display: flex;

        flex-wrap: wrap;

        gap: 9px;

        margin-top: 10px;
      }


      .kb-save,
      .kb-cancel,
      .kb-action {
        border-radius: 10px;

        border:
          1px solid
          rgba(26, 208, 219, .35);

        background:
          rgba(26, 208, 219, .10);

        color: inherit;

        padding:
          9px 13px;

        font-weight: 800;

        cursor: pointer;
      }


      .kb-save:disabled {
        opacity: .55;

        cursor: wait;
      }


      .kb-cancel,
      .kb-action {
        border-color:
          rgba(255, 255, 255, .11);

        background:
          rgba(255, 255, 255, .045);
      }


      .kb-action.danger {
        border-color:
          rgba(255, 100, 100, .24);
      }


      .kb-status {
        min-height: 18px;

        margin-top: 9px;

        font-size: 12px;

        opacity: .72;
      }


      .kb-status.error {
        opacity: 1;
      }


      .kb-list-title {
        margin-top: 19px;

        margin-bottom: 9px;

        font-weight: 900;
      }


      .kb-items {
        display: grid;

        gap: 9px;
      }


      .kb-item {
        border:
          1px solid
          rgba(255, 255, 255, .08);

        border-radius: 13px;

        padding: 12px;

        background:
          rgba(255, 255, 255, .03);
      }


      .kb-item-top {
        display: flex;

        justify-content:
          space-between;

        align-items:
          flex-start;

        gap: 10px;
      }


      .kb-item-heading {
        min-width: 0;
      }


      .kb-item-heading strong {
        display: inline-block;

        margin-right: 7px;
      }


      .kb-pill {
        display: inline-block;

        padding:
          4px 7px;

        border-radius: 999px;

        font-size: 10px;

        font-weight: 800;

        border:
          1px solid
          rgba(26, 208, 219, .24);
      }


      .kb-item-actions {
        display: flex;

        gap: 7px;

        flex-wrap: wrap;
      }


      .kb-item-content {
        margin-top: 10px;

        white-space: pre-wrap;

        line-height: 1.55;

        font-size: 13px;

        opacity: .84;
      }


      .kb-empty {
        border:
          1px dashed
          rgba(255, 255, 255, .10);

        border-radius: 12px;

        padding: 16px;

        text-align: center;

        opacity: .62;
      }


      .hidden {
        display: none !important;
      }


      @media (
        max-width: 760px
      ) {

        .kb-header {
          flex-direction:
            column;
        }

        .kb-example-list {
          grid-template-columns:
            1fr;
        }

        .kb-item-top {
          flex-direction:
            column;
        }

        .kb-item-actions {
          justify-content:
            flex-start;
        }

      }

    `;

    document.head.appendChild(
      style
    );
  }

  /* =======================================================
     START
  ======================================================= */

  function start() {

    injectStyles();

    mount();

  }

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      start,
      {
        once: true
      }
    );

  } else {

    start();

  }

})();

            
