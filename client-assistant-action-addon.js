(() => {
  'use strict';

  /*
   * =========================================================
   * GLIME — CLIENT ASSISTANT ACTION ADDON
   * =========================================================
   *
   * Purpose:
   * - Detect action proposal returned by client-assistant
   * - Show a secure proposal card
   * - Allow authenticated client to approve the proposal
   * - Move:
   *
   *   PROPOSED → APPROVED → QUEUED
   *
   * IMPORTANT:
   * - This file does NOT execute Instagram actions.
   * - This file does NOT send messages.
   * - This file does NOT call external providers.
   * - Execution will happen later through the dispatcher.
   *
   * =========================================================
   */

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const FUNCTION_NAME = 'client-assistant';

  const db =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );


  /* =========================================================
     HELPERS
  ========================================================= */

  const $ = (id) =>
    document.getElementById(id);


  function getMessagesContainer() {

    return (
      $('messages') ||
      document.querySelector('.messages')
    );

  }


  function scrollMessages() {

    const container =
      getMessagesContainer();

    if (container) {

      container.scrollTop =
        container.scrollHeight;

    }

  }


  function createElement(
    tag,
    className,
    text
  ) {

    const element =
      document.createElement(tag);

    if (className) {

      element.className =
        className;

    }

    if (text !== undefined) {

      element.textContent =
        text;

    }

    return element;

  }


  /* =========================================================
     AUTH
  ========================================================= */

  async function getSession() {

    const {
      data,
      error
    } = await db.auth.getSession();

    if (error) {

      throw error;

    }

    if (!data?.session) {

      throw new Error(
        'Login session required'
      );

    }

    return data.session;

  }


  /* =========================================================
     STATUS LABEL
  ========================================================= */

  function statusLabel(status) {

    const value =
      String(status || '')
        .toLowerCase();

    const map = {

      proposed: 'PROPOSED',

      approved: 'APPROVED',

      queued: 'QUEUED',

      running: 'RUNNING',

      completed: 'COMPLETED',

      failed: 'FAILED',

      cancelled: 'CANCELLED',

      blocked: 'BLOCKED',

      error: 'ERROR'

    };

    return (
      map[value] ||
      String(status || 'UNKNOWN')
        .toUpperCase()
    );

  }


  /* =========================================================
     STATUS CLASS
  ========================================================= */

  function statusClass(status) {

    const value =
      String(status || '')
        .toLowerCase();

    return `action-status-${value}`;

  }


  /* =========================================================
     ACTION NAME
  ========================================================= */

  function getActionName(action) {

    if (
      action?.target_action ===
      'follow_up'
    ) {

      return 'Instagram Follow-up';

    }

    if (
      action?.target_action ===
      'message'
    ) {

      return 'Instagram Message';

    }

    return (
      action?.target_action ||
      action?.intent ||
      'Business Action'
    );

  }


  /* =========================================================
     CHANNEL NAME
  ========================================================= */

  function getChannelName(action) {

    const channel =
      String(
        action?.channel || ''
      ).toLowerCase();

    if (channel === 'instagram') {

      return 'Instagram';

    }

    return (
      action?.channel ||
      'Business System'
    );

  }


  /* =========================================================
     RISK LABEL
  ========================================================= */

  function getRiskLabel(action) {

    const risk =
      String(
        action?.risk_level || ''
      ).toLowerCase();

    if (risk === 'high') {

      return 'High';

    }

    if (risk === 'medium') {

      return 'Medium';

    }

    if (risk === 'low') {

      return 'Low';

    }

    return 'Not specified';

  }


  /* =========================================================
     REMOVE OLD PROPOSAL CARDS
  ========================================================= */

  function removeExistingActionCards() {

    document
      .querySelectorAll(
        '.glime-action-proposal'
      )
      .forEach(card => {

        card.remove();

      });

  }


  /* =========================================================
     SHOW STATUS MESSAGE
  ========================================================= */

  function setAssistantStatus(text) {

    const status =
      $('status');

    if (status) {

      status.textContent =
        text || '';

    }

  }


  /* =========================================================
     ADD NORMAL ASSISTANT MESSAGE
  ========================================================= */

  function addAssistantMessage(text) {

    const messages =
      getMessagesContainer();

    if (!messages) {

      return;

    }

    const row =
      createElement(
        'div',
        'message assistant'
      );

    const label =
      createElement(
        'div',
        'message-label',
        'GLIME AI'
      );

    const bubble =
      createElement(
        'div',
        'bubble',
        text
      );

    row.append(
      label,
      bubble
    );

    messages.appendChild(row);

    scrollMessages();

  }


  /* =========================================================
     CREATE ACTION PROPOSAL CARD
  ========================================================= */

  function createActionCard(action) {

    const row =
      createElement(
        'div',
        'message assistant glime-action-message'
      );


    const label =
      createElement(
        'div',
        'message-label',
        'GLIME ACTION'
      );


    const card =
      createElement(
        'div',
        'glime-action-proposal'
      );


    /* -------------------------------------------------------
       HEADER
    ------------------------------------------------------- */

    const header =
      createElement(
        'div',
        'glime-action-header'
      );


    const icon =
      createElement(
        'div',
        'glime-action-icon',
        '⚡'
      );


    const titleBox =
      createElement(
        'div',
        'glime-action-title-box'
      );


    const title =
      createElement(
        'div',
        'glime-action-title',
        'Action Proposal'
      );


    const subtitle =
      createElement(
        'div',
        'glime-action-subtitle',
        'GLIME Business Execution'
      );


    titleBox.append(
      title,
      subtitle
    );


    const status =
      createElement(
        'div',
        `glime-action-status ${statusClass(action.status)}`,
        statusLabel(action.status)
      );


    header.append(
      icon,
      titleBox,
      status
    );


    /* -------------------------------------------------------
       DESCRIPTION
    ------------------------------------------------------- */

    const description =
      createElement(
        'div',
        'glime-action-description'
      );


    let descriptionText =
      'GLIME has prepared an action proposal based on your request.';


    if (
      action.target_action ===
      'follow_up'
    ) {

      descriptionText =
        'GLIME is ready to prepare an Instagram follow-up action for your approval.';

    }


    if (
      action.target_action ===
      'message'
    ) {

      descriptionText =
        'GLIME is ready to prepare an Instagram message action for your approval.';

    }


    description.textContent =
      descriptionText;


    /* -------------------------------------------------------
       DETAILS GRID
    ------------------------------------------------------- */

    const details =
      createElement(
        'div',
        'glime-action-details'
      );


    const detailsData = [

      [
        'Agent',
        'Instagram AI Sales Agent'
      ],

      [
        'Channel',
        getChannelName(action)
      ],

      [
        'Action',
        getActionName(action)
      ],

      [
        'Risk',
        getRiskLabel(action)
      ]

    ];


    detailsData.forEach(item => {

      const box =
        createElement(
          'div',
          'glime-action-detail'
        );


      const key =
        createElement(
          'div',
          'glime-action-detail-key',
          item[0]
        );


      const value =
        createElement(
          'div',
          'glime-action-detail-value',
          item[1]
        );


      box.append(
        key,
        value
      );


      details.appendChild(box);

    });


    /* -------------------------------------------------------
       APPROVAL NOTE
    ------------------------------------------------------- */

    const approval =
      createElement(
        'div',
        'glime-action-approval'
      );


    const approvalIcon =
      createElement(
        'span',
        'glime-action-approval-icon',
        action.approval_required
          ? '🔐'
          : 'ℹ️'
      );


    const approvalText =
      createElement(
        'span',
        '',
        action.approval_required
          ? 'Client approval is required before execution.'
          : 'This action does not require client approval.'
      );


    approval.append(
      approvalIcon,
      approvalText
    );


    /* -------------------------------------------------------
       REASON / BLOCK MESSAGE
    ------------------------------------------------------- */

    let reasonBox = null;


    if (action.reason) {

      reasonBox =
        createElement(
          'div',
          'glime-action-reason',
          action.reason
        );

    }


    /* -------------------------------------------------------
       ACTION BUTTONS
    ------------------------------------------------------- */

    const buttons =
      createElement(
        'div',
        'glime-action-buttons'
      );


    const approveButton =
      createElement(
        'button',
        'glime-action-approve',
        '✓ Approve & Queue'
      );


    const cancelButton =
      createElement(
        'button',
        'glime-action-cancel',
        'Cancel'
      );


    /* -------------------------------------------------------
       BUTTON STATE
    ------------------------------------------------------- */

    const blocked =
      String(
        action.status || ''
      ).toLowerCase() ===
      'blocked';


    const alreadyQueued =
      [
        'approved',
        'queued',
        'running',
        'completed'
      ].includes(
        String(
          action.status || ''
        ).toLowerCase()
      );


    if (
      blocked ||
      alreadyQueued ||
      !action.id
    ) {

      approveButton.disabled =
        true;

    }


    /* -------------------------------------------------------
       APPROVE
    ------------------------------------------------------- */

    approveButton.addEventListener(
      'click',
      async () => {

        await approveAction(
          action,
          approveButton,
          cancelButton,
          status
        );

      }
    );


    /* -------------------------------------------------------
       CANCEL
    ------------------------------------------------------- */

    cancelButton.addEventListener(
      'click',
      () => {

        cancelProposal(
          action,
          card
        );

      }
    );


    buttons.append(
      approveButton,
      cancelButton
    );


    /* -------------------------------------------------------
       SAFETY NOTE
    ------------------------------------------------------- */

    const safety =
      createElement(
        'div',
        'glime-action-safety',
        '⚠️ Approval only queues this action. No Instagram message is sent directly from this screen.'
      );


    /* -------------------------------------------------------
       BUILD CARD
    ------------------------------------------------------- */

    card.append(
      header,
      description,
      details,
      approval
    );


    if (reasonBox) {

      card.appendChild(
        reasonBox
      );

    }


    card.append(
      buttons,
      safety
    );


    row.append(
      label,
      card
    );


    return row;

  }


  /* =========================================================
     RENDER ACTION
  ========================================================= */

  function renderAction(action) {

    if (!action) {

      return;

    }


    const messages =
      getMessagesContainer();

    if (!messages) {

      console.warn(
        'GLIME Action Addon: messages container not found.'
      );

      return;

    }


    removeExistingActionCards();


    const card =
      createActionCard(action);


    messages.appendChild(card);

    scrollMessages();

  }


  /* =========================================================
     APPROVE ACTION
  ========================================================= */

  async function approveAction(
    action,
    approveButton,
    cancelButton,
    statusElement
  ) {

    if (!action?.id) {

      addAssistantMessage(
        'यह action proposal ID missing है। कोई action execute नहीं किया गया।'
      );

      return;

    }


    approveButton.disabled =
      true;

    cancelButton.disabled =
      true;


    approveButton.textContent =
      'Approving…';


    statusElement.textContent =
      'APPROVING';


    statusElement.className =
      'glime-action-status action-status-approving';


    setAssistantStatus(
      'Action approval securely process किया जा रहा है…'
    );


    try {

      const session =
        await getSession();


      /*
       * IMPORTANT:
       * This RPC performs authorization server-side.
       * The frontend never directly updates
       * client_action_requests or execution jobs.
       */

      const {
        data,
        error
      } = await db.rpc(
        'approve_client_business_action',
        {
          p_action_request_id:
            action.id
        }
      );


      if (error) {

        throw error;

      }


      const result =
        Array.isArray(data)
          ? data[0]
          : data;


      const newStatus =
        String(
          result?.status ||
          'queued'
        ).toLowerCase();


      /* -----------------------------------------------------
         UPDATE LOCAL ACTION STATE
      ----------------------------------------------------- */

      action.status =
        newStatus;

      action.approved =
        true;

      action.queued =
        newStatus ===
        'queued';


      statusElement.textContent =
        statusLabel(newStatus);


      statusElement.className =
        `glime-action-status ${statusClass(newStatus)}`;


      approveButton.textContent =
        newStatus === 'queued'
          ? '✓ Queued'
          : '✓ Approved';


      approveButton.disabled =
        true;


      cancelButton.disabled =
        true;


      setAssistantStatus('');


      /*
       * IMPORTANT:
       * No external provider execution happens here.
       */

      addAssistantMessage(
        newStatus === 'queued'
          ? '✅ Action approved और execution queue में डाल दिया गया है। अभी कोई Instagram message/follow-up भेजा नहीं गया है।'
          : '✅ Action approved हो गया है।'
      );


    } catch (error) {

      console.error(
        'GLIME approve action error:',
        error
      );


      approveButton.disabled =
        false;

      cancelButton.disabled =
        false;


      approveButton.textContent =
        '✓ Approve & Queue';


      statusElement.textContent =
        'ERROR';


      statusElement.className =
        'glime-action-status action-status-error';


      setAssistantStatus('');


      addAssistantMessage(
        error?.message ||
        'Action approval अभी complete नहीं हो पाया। कोई external action execute नहीं किया गया।'
      );

    }

  }


  /* =========================================================
     CANCEL PROPOSAL
  ========================================================= */

  async function cancelProposal(
    action,
    card
  ) {

    /*
     * We intentionally do not directly mutate the request here.
     *
     * The current secure backend flow only exposes
     * approve_client_business_action().
     *
     * Therefore Cancel is a UI-level dismissal for now.
     *
     * The execution dispatcher will never see this dismissed
     * proposal because it only consumes QUEUED jobs.
     */

    if (card) {

      card.classList.add(
        'glime-action-dismissed'
      );


      setTimeout(
        () => {

          const row =
            card.closest(
              '.glime-action-message'
            );

          if (row) {

            row.remove();

          }

        },
        250
      );

    }


    addAssistantMessage(
      'Action proposal cancel कर दिया गया। कोई external action execute नहीं किया गया।'
    );


    setAssistantStatus('');

  }


  /* =========================================================
     INTERCEPT CLIENT ASSISTANT RESPONSE
  =========================================================
   *
   * The existing client-assistant.js currently handles:
   *
   *   result.answer
   *   result.report
   *
   * This addon listens for the response through a lightweight
   * fetch wrapper so we can render:
   *
   *   result.action
   *
   * without replacing the existing assistant logic.
   *
   * =========================================================
  */

  function installFetchInterceptor() {

    if (
      window.__GLIME_ACTION_FETCH_INSTALLED__
    ) {

      return;

    }


    const originalFetch =
      window.fetch;


    window.fetch =
      async function(...args) {

        const response =
          await originalFetch.apply(
            this,
            args
          );


        try {

          const input =
            args[0];


          const url =
            typeof input === 'string'
              ? input
              : input?.url || '';


          /*
           * Only inspect the GLIME client-assistant
           * response.
           */

          if (
            url.includes(
              '/functions/v1/client-assistant'
            )
          ) {

            const cloned =
              response.clone();


            cloned
              .json()
              .then(result => {

                if (
                  result?.action
                ) {

                  renderAction(
                    result.action
                  );

                }

              })
              .catch(
                error => {

                  console.debug(
                    'GLIME Action Addon response parse skipped:',
                    error
                  );

                }
              );

          }

        } catch (error) {

          console.debug(
            'GLIME Action Addon interceptor error:',
            error
          );

        }


        return response;

      };


    window.__GLIME_ACTION_FETCH_INSTALLED__ =
      true;

  }


  /* =========================================================
     STYLES
  ========================================================= */

  function installStyles() {

    if (
      document.getElementById(
        'glime-action-addon-styles'
      )
    ) {

      return;

    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'glime-action-addon-styles';


    style.textContent = `

      /* =====================================================
         GLIME ACTION PROPOSAL
      ===================================================== */

      .glime-action-message {
        width: 100%;
      }


      .glime-action-proposal {

        width: min(
          100%,
          820px
        );

        padding: 18px;

        border: 1px solid
          rgba(82, 232, 255, .18);

        border-radius: 18px;

        background:
          linear-gradient(
            145deg,
            rgba(17, 31, 46, .98),
            rgba(9, 18, 28, .98)
          );

        box-shadow:
          0 20px 65px
          rgba(0, 0, 0, .25);

        transition:
          opacity .22s ease,
          transform .22s ease;

      }


      .glime-action-dismissed {

        opacity: 0;

        transform:
          translateY(-8px)
          scale(.98);

      }


      /* =====================================================
         HEADER
      ===================================================== */

      .glime-action-header {

        display: flex;

        align-items: center;

        gap: 12px;

        margin-bottom: 16px;

      }


      .glime-action-icon {

        width: 42px;

        height: 42px;

        display: grid;

        place-items: center;

        flex: 0 0 auto;

        border: 1px solid
          rgba(82, 232, 255, .22);

        border-radius: 13px;

        background:
          rgba(82, 232, 255, .065);

        color:
          var(--cyan, #52e8ff);

        font-size: 19px;

      }


      .glime-action-title-box {

        min-width: 0;

        flex: 1;

      }


      .glime-action-title {

        color:
          var(--text, #f4fbfd);

        font-size: 14px;

        font-weight: 800;

      }


      .glime-action-subtitle {

        margin-top: 3px;

        color:
          var(--muted, #9cabb9);

        font-family:
          "DM Mono",
          monospace;

        font-size: 8px;

        letter-spacing: .08em;

        text-transform: uppercase;

      }


      /* =====================================================
         STATUS
      ===================================================== */

      .glime-action-status {

        flex: 0 0 auto;

        padding: 6px 9px;

        border-radius: 999px;

        border: 1px solid
          rgba(255, 255, 255, .1);

        background:
          rgba(255, 255, 255, .025);

        color:
          #9aa9b7;

        font-family:
          "DM Mono",
          monospace;

        font-size: 8px;

        letter-spacing: .07em;

      }


      .action-status-proposed {

        border-color:
          rgba(166, 140, 255, .28);

        color:
          #c5b8ff;

        background:
          rgba(166, 140, 255, .07);

      }


      .action-status-approving {

        border-color:
          rgba(82, 232, 255, .28);

        color:
          #9befff;

        background:
          rgba(82, 232, 255, .07);

      }


      .action-status-approved,
      .action-status-queued {

        border-color:
          rgba(80, 245, 168, .28);

        color:
          #9af4c6;

        background:
          rgba(80, 245, 168, .065);

      }


      .action-status-running {

        border-color:
          rgba(82, 232, 255, .28);

        color:
          #9befff;

        background:
          rgba(82, 232, 255, .07);

      }


      .action-status-completed {

        border-color:
          rgba(80, 245, 168, .32);

        color:
          #a7f8cc;

        background:
          rgba(80, 245, 168, .08);

      }


      .action-status-failed,
      .action-status-error {

        border-color:
          rgba(255, 130, 130, .25);

        color:
          #ffb0b0;

        background:
          rgba(255, 80, 80, .06);

      }


      .action-status-cancelled,
      .action-status-blocked {

        border-color:
          rgba(255, 255, 255, .12);

        color:
          #a8b2bc;

      }


      /* =====================================================
         DESCRIPTION
      ===================================================== */

      .glime-action-description {

        margin-bottom: 15px;

        color:
          #b9c7d2;

        font-size: 12px;

        line-height: 1.65;

      }


      /* =====================================================
         DETAILS
      ===================================================== */

      .glime-action-details {

        display: grid;

        grid-template-columns:
          repeat(4, minmax(0, 1fr));

        gap: 8px;

        margin-bottom: 14px;

      }


      .glime-action-detail {

        min-width: 0;

        padding: 11px;

        border: 1px solid
          rgba(255, 255, 255, .065);

        border-radius: 11px;

        background:
          rgba(255, 255, 255, .018);

      }


      .glime-action-detail-key {

        margin-bottom: 5px;

        color:
          #627180;

        font-family:
          "DM Mono",
          monospace;

        font-size: 7px;

        letter-spacing: .08em;

        text-transform: uppercase;

      }


      .glime-action-detail-value {

        overflow: hidden;

        color:
          #dce7ed;

        font-size: 10px;

        font-weight: 700;

        text-overflow: ellipsis;

        white-space: nowrap;

      }


      /* =====================================================
         APPROVAL
      ===================================================== */

      .glime-action-approval {

        display: flex;

        align-items: center;

        gap: 8px;

        margin-bottom: 12px;

        padding: 10px 12px;

        border: 1px solid
          rgba(80, 245, 168, .13);

        border-radius: 11px;

        background:
          rgba(80, 245, 168, .035);

        color:
          #9ccab3;

        font-size: 10px;

        line-height: 1.5;

      }


      .glime-action-approval-icon {

        flex: 0 0 auto;

      }


      /* =====================================================
         REASON
      ===================================================== */

      .glime-action-reason {

        margin-bottom: 12px;

        padding: 10px 12px;

        border: 1px solid
          rgba(255, 255, 255, .08);

        border-radius: 10px;

        background:
          rgba(255, 255, 255, .025);

        color:
          #9aa9b7;

        font-size: 10px;

        line-height: 1.55;

      }


      /* =====================================================
         BUTTONS
      ===================================================== */

      .glime-action-buttons {

        display: flex;

        gap: 9px;

        margin-top: 3px;

      }


      .glime-action-buttons button {

        min-height: 42px;

        padding: 10px 14px;

        border-radius: 11px;

        cursor: pointer;

        font-size: 11px;

        font-weight: 800;

        transition:
          transform .15s ease,
          filter .15s ease,
          opacity .15s ease;

      }


      .glime-action-buttons button:hover {

        transform:
          translateY(-1px);

      }


      .glime-action-buttons button:disabled {

        cursor: not-allowed;

        opacity: .5;

        transform: none;

      }


      .glime-action-approve {

        flex: 1;

        border: 0;

        background:
          var(--green, #50f5a8);

        color:
          #06100b;

      }


      .glime-action-approve:hover {

        filter:
          brightness(1.04);

      }


      .glime-action-cancel {

        min-width: 90px;

        border: 1px solid
          rgba(255, 255, 255, .11);

        background:
          rgba(255, 255, 255, .025);

        color:
          #a2afba;

      }


      .glime-action-cancel:hover {

        color:
          #fff;

      }


      /* =====================================================
         SAFETY NOTE
      ===================================================== */

      .glime-action-safety {

        margin-top: 11px;

        padding-top: 10px;

        border-top: 1px solid
          rgba(255, 255, 255, .06);

        color:
          #63717e;

        font-family:
          "DM Mono",
          monospace;

        font-size: 8px;

        line-height: 1.55;

      }


      /* =====================================================
         MOBILE
      ===================================================== */

      @media (max-width: 680px) {

        .glime-action-proposal {

          padding: 14px;

          border-radius: 16px;

        }


        .glime-action-header {

          align-items: flex-start;

        }


        .glime-action-status {

          font-size: 7px;

        }


        .glime-action-details {

          grid-template-columns:
            repeat(2, minmax(0, 1fr));

        }


        .glime-action-buttons {

          flex-direction: column;

        }


        .glime-action-approve,
        .glime-action-cancel {

          width: 100%;

          min-width: 0;

        }

      }


      @media (max-width: 420px) {

        .glime-action-details {

          grid-template-columns:
            1fr;

        }


        .glime-action-detail-value {

          white-space:
            normal;

        }

      }

    `;


    document.head.appendChild(
      style
    );

  }


  /* =========================================================
     INIT
  ========================================================= */

  function initialize() {

    installStyles();

    installFetchInterceptor();

    console.log(
      'GLIME Client Assistant Action Addon initialized.'
    );

  }


  /* =========================================================
     START AFTER DOM
  ========================================================= */

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      initialize
    );

  } else {

    initialize();

  }

})();
