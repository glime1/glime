(() => {
  'use strict';

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/client-assistant`;

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const $ = id => document.getElementById(id);

  const messages = $('messages');
  const form = $('chatForm');
  const input = $('messageInput');
  const send = $('sendBtn');
  const status = $('status');

  let history = [];

  function addMessage(role, text) {
    const row = document.createElement('div');
    row.className = `message ${role}`;

    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = role === 'user' ? 'YOU' : 'GLIME AI';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    row.append(label, bubble);

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;

    history.push({
      role,
      content: text
    });

    if (history.length > 12) {
      history = history.slice(-12);
    }
  }

  function money(value) {
    return `₹${Number(value || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2
    })}`;
  }

  function addReport(report) {
    if (!report?.overview) return;

    const row = document.createElement('div');
    row.className = 'message assistant';

    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = 'GLIME AI';

    const card = document.createElement('div');
    card.className = 'report-card';

    const title = document.createElement('div');
    title.className = 'report-title';

    title.innerHTML = `
      <span class="report-spark">✦</span>
      <strong>Business Quick Report</strong>
    `;

    card.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'report-grid';

    const metrics = [
      [
        '◉',
        report.overview.customers ?? 0,
        'Customers',
        'Total'
      ],
      [
        '□',
        report.overview.orders ?? 0,
        'Orders',
        'Total'
      ],
      [
        '₹',
        money(report.overview.revenue),
        'Revenue',
        'Paid sales'
      ],
      [
        '↗',
        report.overview.leads ?? 0,
        'Leads',
        'Total'
      ]
    ];

    metrics.forEach(item => {
      const metric = document.createElement('div');
      metric.className = 'report-metric';

      metric.innerHTML = `
        <div class="report-icon">${item[0]}</div>
        <div class="report-value">${String(item[1])}</div>
        <div class="report-name">${item[2]}</div>
        <div class="report-sub">${item[3]}</div>
      `;

      grid.appendChild(metric);
    });

    card.appendChild(grid);

    if (
      Array.isArray(report.insights) &&
      report.insights.length
    ) {
      const section = document.createElement('div');
      section.className = 'report-section';

      section.innerHTML = `
        <div class="report-section-title">
          Insights
        </div>
      `;

      const list = document.createElement('ul');

      report.insights
        .slice(0, 5)
        .forEach(text => {
          const li = document.createElement('li');
          li.textContent = text;
          list.appendChild(li);
        });

      section.appendChild(list);
      card.appendChild(section);
    }

    const note = document.createElement('div');
    note.className = 'report-note';

    note.textContent =
      report.data_note ||
      'This report was prepared from your authenticated business data.';

    card.appendChild(note);

    const actions = document.createElement('div');
    actions.className = 'report-actions';

    const actionItems = [
      [
        'Customer list',
        'Show my customer list'
      ],
      [
        'Recent orders',
        'Show my recent orders'
      ],
      [
        'Top customers',
        'Who are my top customers?'
      ],
      [
        'Next step',
        'What should my business focus on next?'
      ]
    ];

    actionItems.forEach(item => {
      const button = document.createElement('button');

      button.type = 'button';
      button.textContent = item[0];

      button.onclick = () => {
        input.value = item[1];
        updateCharacterCount();
        input.focus();
      };

      actions.appendChild(button);
    });

    card.appendChild(actions);

    row.append(label, card);

    messages.appendChild(row);

    messages.scrollTop = messages.scrollHeight;
  }

  async function initialize() {
    try {
      const {
        data,
        error
      } = await db.auth.getSession();

      if (error) {
        throw error;
      }

      if (!data?.session?.user) {
        location.href = 'login.html';
        return;
      }

      const clientName = $('clientName');

      if (clientName) {
        clientName.textContent =
          `Business Intelligence • ${
            data.session.user.email || ''
          }`;
      }

    } catch (error) {
      console.error(error);

      status.textContent =
        'Unable to verify your login session.';
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const text = input.value.trim();

    if (!text) return;

    addMessage('user', text);

    input.value = '';

    updateCharacterCount();

    send.disabled = true;

    status.textContent =
      'Securely checking your authorized business data…';

    try {
      const {
        data,
        error
      } = await db.auth.getSession();

      if (error) {
        throw error;
      }

      if (!data?.session) {
        throw new Error('Login required');
      }

      const response = await fetch(
        FUNCTION_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',

            'Authorization':
              `Bearer ${data.session.access_token}`
          },

          body: JSON.stringify({
            message: text,
            history
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
          'Assistant unavailable'
        );
      }

      addMessage(
        'assistant',
        result?.answer ||
        'No answer was returned.'
      );

      if (result?.report) {
        addReport(result.report);
      }

      status.textContent = '';

    } catch (error) {

      console.error(error);

      addMessage(
        'assistant',
        error?.message ||
        'The assistant is currently unavailable.'
      );

      status.textContent = '';

    } finally {

      send.disabled = false;

      input.focus();
    }
  });

  $('clearBtn')?.addEventListener(
    'click',
    () => {

      history = [];

      messages.innerHTML = '';

      addMessage(
        'assistant',
        'Chat cleared. Ask GLIME a business question.'
      );

      status.textContent = '';
    }
  );

  document
    .querySelectorAll('[data-prompt]')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          input.value =
            button.dataset.prompt || '';

          updateCharacterCount();

          input.focus();
        }
      );

    });

  function updateCharacterCount() {

    const counter = $('charCount');

    if (counter) {

      counter.textContent =
        `${input.value.length} / 2000`;
    }
  }

  input.addEventListener(
    'input',
    updateCharacterCount
  );

  input.addEventListener(
    'keydown',
    event => {

      if (
        event.key === 'Enter' &&
        !event.shiftKey
      ) {

        event.preventDefault();

        form.requestSubmit();
      }

    }
  );

  updateCharacterCount();

  initialize();

})();
