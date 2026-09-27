/* GLIME Admin Control Gap Addon
   Adds:
   - Audit Logs navigation/view
   - Client Audit tab
   - Audit logging for existing profile/account actions
   - Permanent Delete action using the secure admin RPC
   - Read-only Billing from secure admin-billing-read Edge Function
*/
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  const $ = id => document.getElementById(id);

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  const dt = v => v ? new Date(v).toLocaleString() : '—';

  function clientIdFromDetail() {
    const text = $('detailSub')?.textContent?.trim() || '';
    return text.split('•')[0].trim() || null;
  }

  async function auditWrite(action, entity, clientId, before, after) {
    const { error } = await sb.rpc('admin_audit_write', {
      p_action: action,
      p_entity: entity,
      p_client_id: clientId || null,
      p_before: before ?? null,
      p_after: after ?? null
    });

    if (error) {
      console.error('[GLIME audit]', action, error);
    }
  }

  async function getClient(clientId) {
    if (!clientId) return null;

    const { data, error } = await sb
      .from('client_data')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) throw error;

    return data;
  }

  function snapshot(c) {
    if (!c) return null;

    return {
      id: c.id,
      client_id: c.client_id,
      email: c.email,
      full_name: c.full_name,
      client_name: c.client_name,
      business_name: c.business_name,
      phone: c.phone,
      mobile: c.mobile,
      account_status: c.account_status,
      suspension_reason: c.suspension_reason,
      payment_status: c.payment_status,
      free_trial_status: c.free_trial_status,
      free_trial_started_at: c.free_trial_started_at,
      free_trial_ends_at: c.free_trial_ends_at
    };
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function addAuditNav() {
    const nav = document.querySelector('aside.sidebar nav');

    if (!nav || nav.querySelector('[data-view="audit"]')) {
      return;
    }

    const settings = nav.querySelector('[data-view="settings"]');

    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.view = 'audit';
    b.textContent = 'Audit Logs';

    if (settings) {
      nav.insertBefore(b, settings);
    } else {
      nav.appendChild(b);
    }

    b.addEventListener('click', openAuditView);
  }

  function addAuditView() {
    const main = document.querySelector('main');

    if (!main || $('view-audit')) {
      return;
    }

    const section = document.createElement('section');

    section.className = 'view';
    section.id = 'view-audit';

    section.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <input
            class="search"
            id="auditSearch"
            placeholder="Filter action, entity or client ID"
          >
          <button class="btn" id="auditRefreshBtn">↻ Refresh</button>
        </div>

        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Client</th>
                <th>Admin</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody id="auditRows"></tbody>
          </table>
        </div>
      </div>
    `;

    main.appendChild(section);

    $('auditRefreshBtn').onclick = loadAuditLogs;
    $('auditSearch').oninput = renderAuditRows;
  }

  let auditRows = [];

  async function loadAuditLogs() {
    const body = $('auditRows');

    if (body) {
      body.innerHTML =
        '<tr><td colspan="6">Loading audit logs…</td></tr>';
    }

    const { data, error } = await sb.rpc('admin_audit_list', {
      p_client_id: null,
      p_limit: 500
    });

    if (error) {
      if (body) {
        body.innerHTML =
          `<tr><td colspan="6">${esc(error.message)}</td></tr>`;
      }
      return;
    }

    auditRows = data || [];
    renderAuditRows();
  }

  function renderAuditRows() {
    const body = $('auditRows');

    if (!body) {
      return;
    }

    const term = ($('auditSearch')?.value || '')
      .trim()
      .toLowerCase();

    const rows = auditRows.filter(x =>
      !term ||
      [
        x.action,
        x.entity,
        x.client_id,
        x.actor,
        JSON.stringify(x.before || {}),
        JSON.stringify(x.after || {})
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );

    body.innerHTML =
      rows.map(x => `
        <tr>
          <td>${esc(dt(x.at))}</td>
          <td><b>${esc(x.action)}</b></td>
          <td>${esc(x.entity)}</td>
          <td>${esc(x.client_id || '—')}</td>
          <td>${esc(x.actor || '—')}</td>
          <td>${esc(
            x.after?.status ||
            x.after?.result ||
            'Recorded'
          )}</td>
        </tr>
      `).join('') ||
      '<tr><td colspan="6">No audit records found.</td></tr>';
  }

  function openAuditView() {
    document
      .querySelectorAll('.view')
      .forEach(x => x.classList.remove('active'));

    $('view-audit')?.classList.add('active');

    document
      .querySelectorAll('nav button[data-view]')
      .forEach(x =>
        x.classList.toggle(
          'active',
          x.dataset.view === 'audit'
        )
      );

    if ($('title')) {
      $('title').textContent = 'Audit Logs';
    }

    loadAuditLogs();
  }

  function addClientAuditTab() {
    const tabs = document.querySelector('.tabs');
    const modal = $('clientModal');

    if (
      !tabs ||
      !modal ||
      tabs.querySelector('[data-tab="audit"]')
    ) {
      return;
    }

    const btn = document.createElement('button');

    btn.className = 'btn';
    btn.dataset.tab = 'audit';
    btn.textContent = 'Audit';

    tabs.appendChild(btn);

    const panel = document.createElement('div');

    panel.className = 'tab';
    panel.id = 'tab-audit';

    panel.innerHTML =
      '<div class="sub">Open the Audit tab to load this client’s admin history.</div>';

    modal.querySelector('.modalbox')?.appendChild(panel);

    btn.addEventListener('click', async () => {
      tabs
        .querySelectorAll('button')
        .forEach(x => x.classList.remove('active'));

      modal
        .querySelectorAll('.tab')
        .forEach(x => x.classList.remove('active'));

      btn.classList.add('active');
      panel.classList.add('active');

      await loadClientAudit();
    });
  }

  async function loadClientAudit() {
    const panel = $('tab-audit');

    if (!panel) {
      return;
    }

    const clientId = clientIdFromDetail();

    if (!clientId) {
      panel.innerHTML =
        '<div class="sub">Client ID not available.</div>';
      return;
    }

    panel.innerHTML =
      '<div class="sub">Loading audit history…</div>';

    const { data, error } = await sb.rpc('admin_audit_list', {
      p_client_id: clientId,
      p_limit: 200
    });

    if (error) {
      panel.innerHTML =
        `<div class="notice">${esc(error.message)}</div>`;
      return;
    }

    const rows = data || [];

    panel.innerHTML = `
      <div style="overflow:auto">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Admin</th>
              <th>Result</th>
            </tr>
          </thead>

          <tbody>
            ${
              rows.map(x => `
                <tr>
                  <td>${esc(dt(x.at))}</td>
                  <td><b>${esc(x.action)}</b></td>
                  <td>${esc(x.entity)}</td>
                  <td>${esc(x.actor || '—')}</td>
                  <td>${esc(
                    x.after?.status ||
                    x.after?.result ||
                    'Recorded'
                  )}</td>
                </tr>
              `).join('')
              ||
              '<tr><td colspan="5">No audit history for this client.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    `;
  }

  function addPermanentDeleteButton() {
    const account = $('tab-account');

    if (
      !account ||
      account.querySelector('#glimePermanentDeleteBtn')
    ) {
      return;
    }

    const wrap = document.createElement('div');

    wrap.style.cssText =
      'margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,83,102,.25)';

    wrap.innerHTML = `
      <div
        class="notice"
        style="
          border-color:rgba(255,83,102,.35);
          background:rgba(255,83,102,.06);
          color:#ffb0ba
        "
      >
        <b>Permanent Delete</b><br>
        This is irreversible. The client must already be
        <b>Suspended</b>.
        It removes client-owned database data and the client’s
        Supabase Auth account.
      </div>

      <button
        class="btn red"
        id="glimePermanentDeleteBtn"
      >
        Permanently Delete Client
      </button>

      <div
        class="message"
        id="glimePermanentDeleteMsg"
      ></div>
    `;

    account.appendChild(wrap);

    $('glimePermanentDeleteBtn').onclick = permanentDelete;
  }

  async function permanentDelete() {
    const clientId = clientIdFromDetail();

    if (!clientId) {
      return;
    }

    const btn = $('glimePermanentDeleteBtn');
    const message = $('glimePermanentDeleteMsg');

    if (
      !confirm(
        `PERMANENT DELETE

Client: ${clientId}

This cannot be undone.
The client must already be suspended.

Continue?`
      )
    ) {
      return;
    }

    const typed = prompt(
      `Type the exact Client ID to confirm:

${clientId}`
    );

    if (typed === null) {
      return;
    }

    if (
      typed.trim().toLowerCase() !==
      clientId.trim().toLowerCase()
    ) {
      message.textContent =
        'Client ID confirmation did not match. Nothing was deleted.';
      return;
    }

    if (
      !confirm(
        `FINAL CONFIRMATION

Permanently delete ${clientId} and all client-owned data?

This action is irreversible.`
      )
    ) {
      return;
    }

    btn.disabled = true;
    message.textContent =
      'Deleting client data securely…';

    try {
      const { data, error } =
        await sb.functions.invoke(
          'admin-permanent-delete',
          {
            body: {
              client_id: clientId,
              confirmation_client_id: typed.trim()
            }
          }
        );

      if (error) {
        throw error;
      }

      if (!data?.ok) {
        throw new Error(
          data?.error ||
          'Permanent deletion was not confirmed by the backend.'
        );
      }

      message.textContent =
        'Client permanently deleted.';

      alert(
        `Client ${clientId} was permanently deleted.`
      );

      $('clientModal')?.classList.remove('open');

      if (
        typeof window.loadAll === 'function'
      ) {
        await window.loadAll();
      } else {
        location.reload();
      }
    } catch (e) {
      console.error(
        '[GLIME permanent delete]',
        e
      );

      message.textContent =
        e.message ||
        'Permanent deletion failed.';

      btn.disabled = false;
    }
  }

  function wrapAction(name, action, entity) {
    const original = window[name];

    if (
      typeof original !== 'function' ||
      original.__glimeAuditWrapped
    ) {
      return;
    }

    const wrapped = async function (...args) {
      const clientId = clientIdFromDetail();

      let before = null;

      try {
        before = snapshot(
          await getClient(clientId)
        );
      } catch (e) {
        console.warn(
          '[GLIME audit before]',
          e
        );
      }

      const result =
        await original.apply(this, args);

      try {
        const after = snapshot(
          await getClient(clientId)
        );

        if (!same(before, after)) {
          await auditWrite(
            action,
            entity,
            clientId,
            before,
            after
          );
        }
      } catch (e) {
        console.warn(
          '[GLIME audit after]',
          e
        );
      }

      return result;
    };

    wrapped.__glimeAuditWrapped = true;
    window[name] = wrapped;
  }

  async function adminBillingRead(clientId = null) {
    const target = clientId
      ? $('tab-billing-admin')
      : $('view-billing');

    if (target) {
      target.innerHTML =
        '<div class="card"><div class="sub">Loading live billing…</div></div>';
    }

    try {
      const { data, error } =
        await sb.functions.invoke(
          'admin-billing-read',
          {
            body: {
              client_id: clientId,
              limit: 100
            }
          }
        );

      if (error) {
        throw error;
      }

      if (!data?.ok) {
        throw new Error(
          data?.error ||
          'Billing read failed.'
        );
      }

      clientId
        ? renderClientBilling(data)
        : renderGlobalBilling(data);

    } catch (e) {
      console.error(
        '[GLIME admin billing]',
        e
      );

      if (target) {
        target.innerHTML =
          '<div class="notice">' +
          esc(
            e.message ||
            'Billing read failed.'
          ) +
          '</div>';
      }
    }
  }

  function billingMoney(v, c) {
    if (
      v === null ||
      v === undefined ||
      v === ''
    ) {
      return '—';
    }

    return (
      esc(String(c || 'INR')) +
      ' ' +
      Number(v).toLocaleString(
        undefined,
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      )
    );
  }

  function renderGlobalBilling(d) {
    const v = $('view-billing');

    if (!v) {
      return;
    }

    const s = d.subscriptions || [];
    const p = d.payments || [];
    const i = d.invoices || [];

    v.innerHTML = `
      <div class="card">

        <h3>Billing — Read Only</h3>

        <p class="sub">
          Live data from the existing GLIME billing backend.
        </p>

        <div
          class="grid"
          style="margin:14px 0"
        >
          <div class="card metric">
            <small>Subscriptions</small>
            <strong>${s.length}</strong>
          </div>

          <div class="card metric">
            <small>Payments</small>
            <strong>${p.length}</strong>
          </div>

          <div class="card metric">
            <small>Invoices</small>
            <strong>${i.length}</strong>
          </div>

          <div class="card metric">
            <small>Orders</small>
            <strong>${(d.orders || []).length}</strong>
          </div>
        </div>

        <h3>Subscriptions</h3>

        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Period End</th>
              </tr>
            </thead>

            <tbody>
              ${
                s.map(x => `
                  <tr>
                    <td>${esc(x.client_id)}</td>
                    <td>${esc(
                      x.status ||
                      x.provider_status ||
                      '—'
                    )}</td>
                    <td>${esc(
                      x.provider_key ||
                      '—'
                    )}</td>
                    <td>${esc(
                      x.provider_plan_id ||
                      '—'
                    )}</td>
                    <td>${billingMoney(
                      x.amount,
                      x.currency
                    )}</td>
                    <td>${esc(
                      dt(x.current_period_end)
                    )}</td>
                  </tr>
                `).join('')
                ||
                '<tr><td colspan="6">No subscriptions.</td></tr>'
              }
            </tbody>
          </table>
        </div>

        <h3 style="margin-top:18px">
          Payments
        </h3>

        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Paid</th>
              </tr>
            </thead>

            <tbody>
              ${
                p.map(x => `
                  <tr>
                    <td>${esc(
                      x.order_id || '—'
                    )}</td>

                    <td>${esc(
                      x.provider_key || '—'
                    )}</td>

                    <td>${esc(
                      x.status || '—'
                    )}</td>

                    <td>${billingMoney(
                      x.amount,
                      x.currency
                    )}</td>

                    <td>${esc(
                      dt(x.paid_at)
                    )}</td>
                  </tr>
                `).join('')
                ||
                '<tr><td colspan="5">No payments.</td></tr>'
              }
            </tbody>
          </table>
        </div>

        <h3 style="margin-top:18px">
          Invoices
        </h3>

        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Invoice</th>
                <th>Status</th>
                <th>Total</th>
                <th>Due</th>
                <th>Paid</th>
              </tr>
            </thead>

            <tbody>
              ${
                i.map(x => `
                  <tr>
                    <td>${esc(
                      x.client_id
                    )}</td>

                    <td>${esc(
                      x.invoice_number ||
                      '—'
                    )}</td>

                    <td>${esc(
                      x.status || '—'
                    )}</td>

                    <td>${billingMoney(
                      x.total_amount,
                      x.currency
                    )}</td>

                    <td>${esc(
                      dt(x.due_at)
                    )}</td>

                    <td>${esc(
                      dt(x.paid_at)
                    )}</td>
                  </tr>
                `).join('')
                ||
                '<tr><td colspan="6">No invoices.</td></tr>'
              }
            </tbody>
          </table>
        </div>

        <div
          class="notice"
          style="margin-top:14px"
        >
          Read-only. Payment, subscription,
          Cashfree status and activation are
          not editable here.
        </div>

      </div>
    `;
  }

  function renderClientBilling(d) {
    const p = $('tab-billing-admin');

    if (!p) {
      return;
    }

    const s = d.subscriptions || [];
    const o = d.orders || [];
    const pay = d.payments || [];
    const i = d.invoices || [];
    const a = d.addons || [];
    const b = d.ai_credit_balances || [];
    const at = d.ai_credit_transactions || [];
    const w = d.wallets || [];
    const u = d.usage_events || [];

    p.innerHTML = `
      <div class="card">

        <h3>Live Billing Detail</h3>

        <div
          class="grid"
          style="margin:12px 0"
        >
          <div class="card metric">
            <small>Subscriptions</small>
            <strong>${s.length}</strong>
          </div>

          <div class="card metric">
            <small>Orders</small>
            <strong>${o.length}</strong>
          </div>

          <div class="card metric">
            <small>Payments</small>
            <strong>${pay.length}</strong>
          </div>

          <div class="card metric">
            <small>Invoices</small>
            <strong>${i.length}</strong>
          </div>
        </div>

        <h4>Subscriptions</h4>

        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Provider</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>End</th>
              </tr>
            </thead>

            <tbody>
              ${
                s.map(x => `
                  <tr>
                    <td>${esc(
                      x.status || '—'
                    )}</td>

                    <td>${esc(
                      x.provider_key || '—'
                    )}</td>

                    <td>${esc(
                      x.provider_plan_id || '—'
                    )}</td>

                    <td>${billingMoney(
                      x.amount,
                      x.currency
                    )}</td>

                    <td>${esc(
                      dt(x.current_period_end)
                    )}</td>
                  </tr>
                `).join('')
                ||
                '<tr><td colspan="5">No subscriptions.</td></tr>'
              }
            </tbody>
          </table>
        </div>

        <h4>Orders & Payments</h4>

        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Order Status</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Paid</th>
              </tr>
            </thead>

            <tbody>
              ${
                o.map(x => {
                  const pp = pay.find(
                    y => y.order_id === x.id
                  );

                  return `
                    <tr>
                      <td>${esc(
                        x.order_number ||
                        x.id
                      )}</td>

                      <td>${esc(
                        x.status || '—'
                      )}</td>

                      <td>${billingMoney(
                        x.total_amount,
                        x.currency
                      )}</td>

                      <td>${esc(
                        pp?.status || '—'
                      )}</td>

                      <td>${esc(
                        dt(
                          pp?.paid_at ||
                          x.paid_at
                        )
                      )}</td>
                    </tr>
                  `;
                }).join('')
                ||
                '<tr><td colspan="5">No orders.</td></tr>'
              }
            </tbody>
          </table>
        </div>

        <h4>Invoices & Add-ons</h4>

        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Invoice/Add-on</th>
                <th>Status</th>
                <th>Amount/Qty</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>

            <tbody>

              ${
                i.map(x => `
                  <tr>
                    <td>${esc(
                      x.invoice_number ||
                      'Invoice'
                    )}</td>

                    <td>${esc(
                      x.status || '—'
                    )}</td>

                    <td>${billingMoney(
                      x.total_amount,
                      x.currency
                    )}</td>

                    <td>${esc(
                      dt(x.period_start)
                    )}</td>

                    <td>${esc(
                      dt(x.paid_at)
                    )}</td>
                  </tr>
                `).join('')
              }

              ${
                a.map(x => `
                  <tr>
                    <td>${esc(
                      x.addon_code ||
                      'Add-on'
                    )}</td>

                    <td>${esc(
                      x.status || '—'
                    )}</td>

                    <td>${esc(
                      x.quantity
                    )}</td>

                    <td>${esc(
                      dt(x.effective_from)
                    )}</td>

                    <td>${esc(
                      dt(x.effective_until)
                    )}</td>
                  </tr>
                `).join('')
              }

              ${
                (!i.length && !a.length)
                  ? '<tr><td colspan="5">No invoices or add-ons.</td></tr>'
                  : ''
              }

            </tbody>
          </table>
        </div>

        <div
          class="split"
          style="margin-top:12px"
        >

          <div class="card">

            <h4>AI Credits</h4>

            ${
              b.map(x => `
                <p>
                  Balance:
                  <b>${esc(
                    x.balance_credits
                  )}</b>
                </p>
              `).join('')
              ||
              '<p class="sub">No balance.</p>'
            }

            <div style="overflow:auto">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Credits</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    at.slice(0, 20).map(x => `
                      <tr>
                        <td>${esc(
                          x.transaction_type
                        )}</td>

                        <td>${esc(
                          x.credits_delta
                        )}</td>

                        <td>${esc(
                          dt(x.created_at)
                        )}</td>
                      </tr>
                    `).join('')
                    ||
                    '<tr><td colspan="3">No transactions.</td></tr>'
                  }
                </tbody>
              </table>
            </div>

          </div>

          <div class="card">

            <h4>Wallet</h4>

            ${
              w.map(x => `
                <p>
                  Balance:
                  <b>${billingMoney(
                    x.balance,
                    x.currency
                  )}</b>
                </p>

                <p>
                  Status:
                  ${esc(
                    x.status || '—'
                  )}
                </p>
              `).join('')
              ||
              '<p class="sub">No wallet.</p>'
            }

          </div>

        </div>

        <h4>Usage</h4>

        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Qty</th>
                <th>Charge</th>
                <th>Occurred</th>
              </tr>
            </thead>

            <tbody>
              ${
                u.slice(0, 50).map(x => `
                  <tr>
                    <td>${esc(
                      x.usage_code
                    )}</td>

                    <td>${esc(
                      x.quantity
                    )}</td>

                    <td>${billingMoney(
                      x.charge_amount,
                      x.currency
                    )}</td>

                    <td>${esc(
                      dt(x.occurred_at)
                    )}</td>
                  </tr>
                `).join('')
                ||
                '<tr><td colspan="4">No usage events.</td></tr>'
              }
            </tbody>
          </table>
        </div>

        <div
          class="notice"
          style="margin-top:12px"
        >
          Read-only billing detail.
          Existing billing/Cashfree backend remains authoritative.
        </div>

      </div>
    `;
  }

  function addBillingEnhancement() {
    const v = $('view-billing');

    if (!v) {
      return;
    }

    const btn =
      document.querySelector(
        'nav button[data-view="billing"]'
      );

    if (
      btn &&
      !btn.__glimeBillingHooked
    ) {
      btn.__glimeBillingHooked = true;

      btn.addEventListener(
        'click',
        () =>
          setTimeout(
            () => adminBillingRead(null),
            50
          )
      );
    }
  }

  function addClientBillingTab() {
    const tabs =
      document.querySelector(
        '#clientModal .tabs'
      );

    if (
      !tabs ||
      tabs.querySelector(
        '[data-tab="billing-admin"]'
      )
    ) {
      return;
    }

    const btn =
      document.createElement('button');

    btn.type = 'button';
    btn.dataset.tab = 'billing-admin';
    btn.textContent = 'Billing Detail';

    tabs.appendChild(btn);

    const panel =
      document.createElement('div');

    panel.className = 'tab';
    panel.id = 'tab-billing-admin';

    panel.innerHTML =
      '<div class="sub">Open this tab to load live billing data.</div>';

    document
      .querySelector(
        '#clientModal .modalbox'
      )
      ?.appendChild(panel);

    btn.addEventListener(
      'click',
      async () => {
        tabs
          .querySelectorAll('button')
          .forEach(x =>
            x.classList.remove('active')
          );

        document
          .querySelectorAll(
            '#clientModal .tab'
          )
          .forEach(x =>
            x.classList.remove('active')
          );

        btn.classList.add('active');
        panel.classList.add('active');

        const id =
          clientIdFromDetail();

        if (id) {
          await adminBillingRead(id);
        }
      }
    );
  }

  function wireActions() {
    wrapAction(
      'editProfile',
      'ADMIN_PROFILE_EDIT',
      'client_data'
    );

    wrapAction(
      'suspendClient',
      'ADMIN_CLIENT_SUSPEND',
      'client_data'
    );

    wrapAction(
      'reactivateClient',
      'ADMIN_CLIENT_REACTIVATE',
      'client_data'
    );

    wrapAction(
      'archiveClient',
      'ADMIN_CLIENT_ARCHIVE',
      'client_data'
    );

    addPermanentDeleteButton();
  }

  function observeModal() {
    const modal = $('clientModal');

    if (!modal) {
      return;
    }

    new MutationObserver(() => {
      if (
        modal.classList.contains('open')
      ) {
        addClientAuditTab();
        addClientBillingTab();
        addPermanentDeleteButton();
      }
    }).observe(
      modal,
      {
        attributes: true,
        childList: true,
        subtree: true
      }
    );
  }

  async function auditAdminSession() {
    try {
      const { data } =
        await sb.auth.getSession();

      const user =
        data?.session?.user;

      if (
        !user?.id ||
        (user.email || '').toLowerCase() !==
          'admin@glime.online'
      ) {
        return;
      }

      const aal =
        await sb.auth.mfa
          .getAuthenticatorAssuranceLevel();

      if (
        aal.data?.currentLevel !==
        'aal2'
      ) {
        return;
      }

      const key =
        'glime_admin_audit_session_' +
        user.id;

      if (
        sessionStorage.getItem(key)
      ) {
        return;
      }

      await auditWrite(
        'ADMIN_LOGIN',
        'admin',
        null,
        null,
        {
          status:
            'authenticated_aal2',
          two_factor_verified:
            true
        }
      );

      sessionStorage.setItem(
        key,
        '1'
      );

    } catch (e) {
      console.warn(
        '[GLIME audit auth]',
        e
      );
    }
  }

  function boot() {
    addAuditNav();
    addAuditView();
    addClientAuditTab();
    addClientBillingTab();
    addBillingEnhancement();
    observeModal();
    auditAdminSession();

    sb.auth.onAuthStateChange(
      (event) => {
        if (
          event === 'SIGNED_OUT'
        ) {
          try {
            Object.keys(
              sessionStorage
            )
              .filter(k =>
                k.startsWith(
                  'glime_admin_audit_session_'
                )
              )
              .forEach(k =>
                sessionStorage.removeItem(k)
              );
          } catch (_) {}
        }

        if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED'
        ) {
          setTimeout(
            auditAdminSession,
            250
          );
        }
      }
    );

    let attempts = 0;

    const timer =
      setInterval(() => {
        attempts++;

        wireActions();
        addAuditNav();
        addAuditView();
        addClientAuditTab();
        addClientBillingTab();
        addBillingEnhancement();

        if (attempts >= 30) {
          clearInterval(timer);
        }
      }, 300);
  }

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      { once: true }
    );
  } else {
    boot();
  }
})();
