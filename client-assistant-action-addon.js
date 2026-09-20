(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const $ = id =>
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
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

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
      String(
        status || 'UNKNOWN'
      ).toUpperCase()
    );
  }

  function statusClass(status) {

    return `action-status-${
      String(status || '').toLowerCase()
    }`;
  }

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

  function removeExistingActionCards() {

    document
      .querySelectorAll(
        '.glime-action-proposal'
      )
      .forEach(card => card.remove());
  }

  function setAssistantStatus(text) {

    const status = $('status');

    if (status) {
      status.textContent =
        text || '';
    }
  }

  function addAssistantMessage(text) {

    const messages =
      getMessagesContainer();

    if (!messages) return;

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

    const header =
      createElement(
        'div',
        'glime-action-header'
      );

    const icon =
      createElement(
        'div',
        'glime-action-icon',
        '→'
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
        `glime-action-status ${
          statusClass(action.status)
        }`,
        statusLabel(action.status)
      );

    header.append(
      icon,
      titleBox,
      status
    );

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

    const approval =
      createElement(
        'div',
        'glime-action-approval'
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
      approvalText
    );

    let reasonBox = null;

    if (action.reason) {

      reasonBox =
        createElement(
          'div',
          'glime-action-reason',
          action.reason
        );
    }

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

    const safety =
      createElement(
        'div',
        'glime-action-safety',
        'Approval only queues this action. No Instagram message is sent directly from this screen.'
      );

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

  function renderAction(action) {

    if (!action) return;

    const messages =
      getMessagesContainer();

    if (!messages) return;

    removeExistingActionCards();

    messages.appendChild(
      createActionCard(action)
    );

    scrollMessages();
  }

  async function approveAction(
    action,
    approveButton,
    cancelButton,
    statusElement
  ) {

    if (!action?.id) {

      addAssistantMessage(
        'The action proposal ID is missing. No action was executed.'
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
      'Processing action approval securely…'
    );

    try {

      await getSession();

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

      action.status =
        newStatus;

      action.approved =
        true;

      action.queued =
        newStatus === 'queued';

      statusElement.textContent =
        statusLabel(
          newStatus
        );

      statusElement.className =
        `glime-action-status ${
          statusClass(newStatus)
        }`;

      approveButton.textContent =
        newStatus === 'queued'
          ? '✓ Queued'
          : '✓ Approved';

      approveButton.disabled =
        true;

      cancelButton.disabled =
        true;

      setAssistantStatus('');

      addAssistantMessage(
        newStatus === 'queued'
          ? 'Action approved and added to the execution queue. No Instagram message or follow-up has been sent yet.'
          : 'Action approved.'
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
        'Action approval could not be completed. No external action was executed.'
      );
    }
  }

  function cancelProposal(
    action,
    card
  ) {

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
      'Action proposal cancelled. No external action was executed.'
    );

    setAssistantStatus('');
  }

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

          if (
            url.includes(
              '/functions/v1/client-assistant'
            )
          ) {

            response
              .clone()
              .json()
              .then(result => {

                if (result?.action) {

                  renderAction(
                    result.action
                  );
                }

              })
              .catch(() => {});
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

  function installStyles() {

    if (
      $('glime-action-addon-styles')
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

      .glime-action-message {
        width: 100%;
      }

      .glime-action-proposal {

        width: min(100%, 820px);

        padding: 18px;

        border:
          1px solid
          rgba(11,143,140,.16);

        border-radius: 18px;

        background:
          linear-gradient(
            145deg,
            #ffffff,
            #f7fbfc
          );

        box-shadow:
          0 20px 65px
          rgba(16,24,39,.08);

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

        border:
          1px solid
          rgba(11,143,140,.22);

        border-radius: 13px;

        background:
          rgba(11,143,140,.06);

        color: #0b8f8c;

        font-size: 19px;
      }

      .glime-action-title-box {

        min-width: 0;

        flex: 1;
      }

      .glime-action-title {

        color: #101827;

        font-size: 14px;

        font-weight: 800;
      }

      .glime-action-subtitle {

        margin-top: 3px;

        color: #7b8795;

        font-family:
          "DM Mono",
          monospace;

        font-size: 8px;

        letter-spacing: .08em;

        text-transform:
          uppercase;
      }

      .glime-action-status {

        flex: 0 0 auto;

        padding: 6px 9px;

        border:
          1px solid
          rgba(16,24,39,.10);

        border-radius: 999px;

        background:
          rgba(16,24,39,.025);

        color: #647181;

        font-family:
          "DM Mono",
          monospace;

        font-size: 8px;

        letter-spacing: .07em;
      }

      .action-status-proposed {

        border-color:
          rgba(117,103,216,.28);

        color: #6558c9;

        background:
          rgba(117,103,216,.07);
      }

      .action-status-approving,
      .action-status-running {

        border-color:
          rgba(11,143,140,.28);

        color: #087774;

        background:
          rgba(11,143,140,.07);
      }

      .action-status-approved,
      .action-status-queued,
      .action-status-completed {

        border-color:
          rgba(22,184,138,.28);

        color: #087b62;

        background:
          rgba(22,184,138,.07);
      }

      .action-status-failed,
      .action-status-error {

        border-color:
          rgba(181,75,75,.25);

        color: #a34444;

        background:
          rgba(181,75,75,.06);
      }

      .glime-action-description {

        margin-bottom: 15px;

        color: #526171;

        font-size: 12px;

        line-height: 1.65;
      }

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

        border:
          1px solid
          rgba(16,24,39,.065);

        border-radius: 11px;

        background:
          rgba(16,24,39,.018);
      }

      .glime-action-detail-key {

        margin-bottom: 5px;

        color: #7b8795;

        font-family:
          "DM Mono",
          monospace;

        font-size: 7px;

        letter-spacing: .08em;

        text-transform:
          uppercase;
      }

      .glime-action-detail-value {

        overflow: hidden;

        color: #263342;

        font-size: 10px;

        font-weight: 700;

        text-overflow: ellipsis;

        white-space: nowrap;
      }

      .glime-action-approval {

        display: flex;

        align-items: center;

        gap: 8px;

        margin-bottom: 12px;

        padding: 10px 12px;

        border:
          1px solid
          rgba(11,143,140,.13);

        border-radius: 11px;

        background:
          rgba(11,143,140,.035);

        color: #43756d;

        font-size: 10px;

        line-height: 1.5;
      }

      .glime-action-reason {

        margin-bottom: 12px;

        padding: 10px 12px;

        border:
          1px solid
          rgba(16,24,39,.08);

        border-radius: 10px;

        background:
          rgba(16,24,39,.025);

        color: #647181;

        font-size: 10px;

        line-height: 1.55;
      }

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

        background: #0b8f8c;

        color: #ffffff;
      }

      .glime-action-approve:hover {

        filter:
          brightness(1.04);
      }

      .glime-action-cancel {

        min-width: 90px;

        border:
          1px solid
          rgba(16,24,39,.11);

        background: #ffffff;

        color: #647181;
      }

      .glime-action-cancel:hover {

        color: #101827;
      }

      .glime-action-safety {

        margin-top: 11px;

        padding-top: 10px;

        border-top:
          1px solid
          rgba(16,24,39,.06);

        color: #7b8795;

        font-family:
          "DM Mono",
          monospace;

        font-size: 8px;

        line-height: 1.55;
      }

      @media (max-width: 680px) {

        .glime-action-proposal {

          padding: 14px;

          border-radius: 16px;
        }

        .glime-action-header {

          align-items:
            flex-start;
        }

        .glime-action-status {

          font-size: 7px;
        }

        .glime-action-details {

          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
        }

        .glime-action-buttons {

          flex-direction:
            column;
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

    document.head.appendChild(style);
  }

  function initialize() {

    installStyles();

    installFetchInterceptor();
  }

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
