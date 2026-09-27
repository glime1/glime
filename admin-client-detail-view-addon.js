/* GLIME Admin — Full Client Detail View Addon
   Depends on:
   1) admin.html
   2) existing admin-control-gap-addon.js
   Purpose:
   - Fix Clients -> View type mismatch
   - Keep the existing single Admin application/modal
   - Preserve the existing Profile/Account/Trial/Modules/Billing/Usage/Storage/Safety/CARE/Voice AI views
   - Add WhatsApp, Instagram and Activity tabs
   - Keep Audit + Billing Detail tabs from the existing gap addon
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

  const badge = (value) => {
    const s = String(value ?? '—');
    const l = s.toLowerCase();
    const cls =
      l.includes('active') ||
      l.includes('open') ||
      l.includes('sent') ||
      l.includes('delivered') ||
      l.includes('read')
        ? 'green'
        : l.includes('suspend') ||
          l.includes('failed') ||
          l.includes('expired')
          ? 'red'
          : l.includes('trial') ||
            l.includes('queued')
            ? 'orange'
            : 'blue';

    return `<span class="badge ${cls}">${esc(s)}</span>`;
  };

  function currentClientId() {
    const sub = $('detailSub')?.textContent || '';
    return sub.split('•')[0].trim() || null;
  }

  function currentClientEmail() {
    const sub = $('detailSub')?.textContent || '';
    return sub.split('•')[1]?.trim() || null;
  }

  async function readClient(clientId) {
    const r = await sb
      .from('client_data')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (r.error) throw r.error;
    return r.data;
  }

  function ensureTab(tabName, label, afterName = null) {
    const tabs = document.querySelector('#clientModal .tabs');
    const modalBox = document.querySelector('#clientModal .modalbox');

    if (!tabs || !modalBox) return null;

    let button = tabs.querySelector(`[data-tab="${tabName}"]`);
    let panel = $(`tab-${tabName}`);

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset.tab = tabName;
      button.textContent = label;

      if (afterName) {
        const after =
          tabs.querySelector(`[data-tab="${afterName}"]`);

        if (after) {
          after.insertAdjacentElement(
            'afterend',
            button
          );
        } else {
          tabs.appendChild(button);
        }
      } else {
        tabs.appendChild(button);
      }

      button.addEventListener('click', () => {
        tabs
          .querySelectorAll('button')
          .forEach(x =>
            x.classList.remove('active')
          );

        modalBox
          .querySelectorAll('.tab')
          .forEach(x =>
            x.classList.remove('active')
          );

        button.classList.add('active');
        panel?.classList.add('active');
      });
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'tab';
      panel.id = `tab-${tabName}`;
      panel.innerHTML =
        '<div class="sub">Loading…</div>';
      modalBox.appendChild(panel);
    }

    return panel;
  }

  function addFullTabs() {
    ensureTab(
      'whatsapp-admin',
      'WhatsApp',
      'storage'
    );

    ensureTab(
      'instagram-admin',
      'Instagram',
      'whatsapp-admin'
    );

    ensureTab(
      'activity-admin',
      'Activity',
      'voice'
    );

    ensureTab(
      'audit',
      'Audit',
      'activity-admin'
    );

    ensureTab(
      'billing-admin',
      'Billing Detail',
      'billing'
    );
  }

  function fixViewHandler() {
    const original = window.openClient;

    if (
      typeof original !== 'function' ||
      original.__glimeFullViewWrapper
    ) {
      return;
    }

    const wrapped = async function(id) {

      /*
       * admin.html generates the button with x.id
       * inside a quoted onclick.
       *
       * Normalize numeric bigint/int IDs before
       * passing them to the original function.
       */
      let normalized = id;

      if (
        typeof id === 'string' &&
        /^\d+$/.test(id.trim())
      ) {
        normalized = Number(id.trim());
      }

      try {
        await original(normalized);
      } catch (e) {
        console.error(
          '[GLIME client view]',
          e
        );
        return;
      }

      addFullTabs();

      const clientId =
        currentClientId();

      if (!clientId) return;

      await Promise.allSettled([
        loadWhatsApp(clientId),
        loadInstagram(clientId),
        loadActivity(clientId)
      ]);
    };

    wrapped.__glimeFullViewWrapper = true;
    wrapped.__glimeOriginal = original;

    window.openClient = wrapped;
  }

  async function loadWhatsApp(clientId) {
    const panel =
      $('tab-whatsapp-admin');

    if (!panel) return;

    panel.innerHTML =
      '<div class="sub">Loading WhatsApp data…</div>';

    try {
      const [conv, msg] =
        await Promise.all([

          sb
            .from('whatsapp_conversations')
            .select(
              'id,client_id,customer_id,lead_id,phone_number_id,customer_phone,customer_name,status,active_specialist_module_slug,last_message_at,last_inbound_at,last_outbound_at,created_at,updated_at'
            )
            .eq('client_id', clientId)
            .order(
              'last_message_at',
              { ascending: false }
            )
            .limit(100),

          sb
            .from('whatsapp_messages')
            .select(
              'id,conversation_id,provider_message_id,direction,message_type,text_body,status,sender_phone,recipient_phone,provider_timestamp,specialist_module_slug,created_at,updated_at'
            )
            .eq('client_id', clientId)
            .order(
              'created_at',
              { ascending: false }
            )
            .limit(100)

        ]);

      if (conv.error) throw conv.error;
      if (msg.error) throw msg.error;

      const conversations =
        conv.data || [];

      const messages =
        msg.data || [];

      panel.innerHTML = `
        <div
          class="grid"
          style="margin-bottom:12px"
        >

          <div class="card metric">
            <small>Conversations</small>
            <strong>${conversations.length}</strong>
          </div>

          <div class="card metric">
            <small>Messages</small>
            <strong>${messages.length}</strong>
          </div>

          <div class="card metric">
            <small>Open Conversations</small>
            <strong>
              ${
                conversations.filter(
                  x => x.status === 'open'
                ).length
              }
            </strong>
          </div>

          <div class="card metric">
            <small>Latest Message</small>
            <strong
              style="font-size:13px"
            >
              ${
                esc(
                  dt(
                    messages[0]?.created_at ||
                    conversations[0]?.last_message_at
                  )
                )
              }
            </strong>
          </div>

        </div>

        <div
          class="card"
          style="margin-bottom:12px"
        >

          <h3>WhatsApp Conversations</h3>

          <div style="overflow:auto">

            <table>

              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Specialist</th>
                  <th>Last Message</th>
                </tr>
              </thead>

              <tbody>

                ${
                  conversations.map(x => `
                    <tr>

                      <td>
                        ${esc(
                          x.customer_name ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${esc(
                          x.customer_phone ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${badge(x.status)}
                      </td>

                      <td>
                        ${esc(
                          x.active_specialist_module_slug ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${esc(
                          dt(
                            x.last_message_at
                          )
                        )}
                      </td>

                    </tr>
                  `).join('')

                  ||

                  `
                    <tr>
                      <td colspan="5">
                        No WhatsApp conversations found.
                      </td>
                    </tr>
                  `
                }

              </tbody>

            </table>

          </div>

        </div>

        <div class="card">

          <h3>WhatsApp Messages</h3>

          <div style="overflow:auto">

            <table>

              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>

              <tbody>

                ${
                  messages.map(x => `
                    <tr>

                      <td>
                        ${esc(
                          x.direction ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${esc(
                          x.message_type ||
                          '—'
                        )}
                      </td>

                      <td
                        style="
                          max-width:420px;
                          white-space:pre-wrap
                        "
                      >
                        ${
                          esc(
                            x.text_body ||
                            `[${x.message_type || 'message'}]`
                          )
                        }
                      </td>

                      <td>
                        ${badge(x.status)}
                      </td>

                      <td>
                        ${esc(
                          dt(
                            x.created_at ||
                            x.provider_timestamp
                          )
                        )}
                      </td>

                    </tr>
                  `).join('')

                  ||

                  `
                    <tr>
                      <td colspan="5">
                        No WhatsApp messages found.
                      </td>
                    </tr>
                  `
                }

              </tbody>

            </table>

          </div>

        </div>
      `;

    } catch (e) {

      console.error(
        '[GLIME WhatsApp client view]',
        e
      );

      panel.innerHTML = `
        <div class="notice">
          WhatsApp data could not be loaded.
          <br>
          <small>
            ${esc(
              e.message ||
              'Access/read error'
            )}
          </small>
        </div>
      `;
    }
  }

  async function loadInstagram(clientId) {

    const panel =
      $('tab-instagram-admin');

    if (!panel) return;

    panel.innerHTML =
      '<div class="sub">Loading Instagram data…</div>';

    try {

      const [conv, msg, connection] =
        await Promise.all([

          sb
            .from('instagram_conversations')
            .select(
              'id,client_id,instagram_user_id,instagram_thread_id,username,customer_id,lead_id,status,active_specialist_module_slug,last_message_at,last_inbound_at,last_outbound_at,created_at,updated_at'
            )
            .eq('client_id', clientId)
            .order(
              'last_message_at',
              { ascending: false }
            )
            .limit(100),

          sb
            .from('instagram_messages')
            .select(
              'id,conversation_id,provider_message_id,direction,message_type,text_body,status,sender_instagram_user_id,recipient_instagram_user_id,provider_timestamp,specialist_module_slug,created_at,updated_at'
            )
            .eq('client_id', clientId)
            .order(
              'created_at',
              { ascending: false }
            )
            .limit(100),

          sb
            .from('instagram_connections')
            .select('*')
            .eq('client_id', clientId)
            .limit(10)

        ]);

      if (conv.error) throw conv.error;
      if (msg.error) throw msg.error;

      const conversations =
        conv.data || [];

      const messages =
        msg.data || [];

      const connections =
        connection.error
          ? []
          : (connection.data || []);

      panel.innerHTML = `

        <div
          class="grid"
          style="margin-bottom:12px"
        >

          <div class="card metric">
            <small>Conversations</small>
            <strong>
              ${conversations.length}
            </strong>
          </div>

          <div class="card metric">
            <small>Messages</small>
            <strong>
              ${messages.length}
            </strong>
          </div>

          <div class="card metric">
            <small>Connections</small>
            <strong>
              ${connections.length}
            </strong>
          </div>

          <div class="card metric">
            <small>Open Conversations</small>
            <strong>
              ${
                conversations.filter(
                  x => x.status === 'open'
                ).length
              }
            </strong>
          </div>

        </div>

        <div
          class="card"
          style="margin-bottom:12px"
        >

          <h3>Instagram Connections</h3>

          <div style="overflow:auto">

            <table>

              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Instagram ID</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>

              <tbody>

                ${
                  connections.map(x => `
                    <tr>

                      <td>
                        ${esc(
                          x.id ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${esc(
                          x.instagram_user_id ||
                          x.page_id ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${badge(
                          x.status ||
                          x.connection_status ||
                          'connected'
                        )}
                      </td>

                      <td>
                        ${esc(
                          dt(
                            x.updated_at ||
                            x.created_at
                          )
                        )}
                      </td>

                    </tr>
                  `).join('')

                  ||

                  `
                    <tr>
                      <td colspan="4">
                        No Instagram connection records found.
                      </td>
                    </tr>
                  `
                }

              </tbody>

            </table>

          </div>

        </div>

        <div
          class="card"
          style="margin-bottom:12px"
        >

          <h3>Instagram Conversations</h3>

          <div style="overflow:auto">

            <table>

              <thead>
                <tr>
                  <th>Username</th>
                  <th>Instagram User</th>
                  <th>Status</th>
                  <th>Specialist</th>
                  <th>Last Message</th>
                </tr>
              </thead>

              <tbody>

                ${
                  conversations.map(x => `
                    <tr>

                      <td>
                        ${esc(
                          x.username ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${esc(
                          x.instagram_user_id ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${badge(x.status)}
                      </td>

                      <td>
                        ${esc(
                          x.active_specialist_module_slug ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${esc(
                          dt(
                            x.last_message_at
                          )
                        )}
                      </td>

                    </tr>
                  `).join('')

                  ||

                  `
                    <tr>
                      <td colspan="5">
                        No Instagram conversations found.
                      </td>
                    </tr>
                  `
                }

              </tbody>

            </table>

          </div>

        </div>

        <div class="card">

          <h3>Instagram Messages</h3>

          <div style="overflow:auto">

            <table>

              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>

              <tbody>

                ${
                  messages.map(x => `
                    <tr>

                      <td>
                        ${esc(
                          x.direction ||
                          '—'
                        )}
                      </td>

                      <td>
                        ${esc(
                          x.message_type ||
                          '—'
                        )}
                      </td>

                      <td
                        style="
                          max-width:420px;
                          white-space:pre-wrap
                        "
                      >
                        ${
                          esc(
                            x.text_body ||
                            `[${x.message_type || 'message'}]`
                          )
                        }
                      </td>

                      <td>
                        ${badge(x.status)}
                      </td>

                      <td>
                        ${esc(
                          dt(
                            x.created_at ||
                            x.provider_timestamp
                          )
                        )}
                      </td>

                    </tr>
                  `).join('')

                  ||

                  `
                    <tr>
                      <td colspan="5">
                        No Instagram messages found.
                      </td>
                    </tr>
                  `
                }

              </tbody>

            </table>

          </div>

        </div>
      `;

    } catch (e) {

      console.error(
        '[GLIME Instagram client view]',
        e
      );

      panel.innerHTML = `
        <div class="notice">
          Instagram data could not be loaded.
          <br>
          <small>
            ${esc(
              e.message ||
              'Access/read error'
            )}
          </small>
        </div>
      `;
    }
  }

  async function loadActivity(clientId) {

    const panel =
      $('tab-activity-admin');

    if (!panel) return;

    panel.innerHTML =
      '<div class="sub">Loading client activity…</div>';

    try {

      const [events, requests, timeline] =
        await Promise.all([

          sb
            .from('client_action_events')
            .select('*')
            .eq('client_id', clientId)
            .order(
              'created_at',
              { ascending: false }
            )
            .limit(100),

          sb
            .from('client_action_requests')
            .select('*')
            .eq('client_id', clientId)
            .order(
              'created_at',
              { ascending: false }
            )
            .limit(100),

          sb
            .from('lead_timeline')
            .select('*')
            .eq('client_id', clientId)
            .order(
              'created_at',
              { ascending: false }
            )
            .limit(100)

        ]);

      const eventRows =
        events.error
          ? []
          : (events.data || []);

      const requestRows =
        requests.error
          ? []
          : (requests.data || []);

      const timelineRows =
        timeline.error
          ? []
          : (timeline.data || []);

      const merged = [

        ...eventRows.map(x => ({
          source: 'Client Event',
          action:
            x.event_type ||
            x.action ||
            x.type ||
            'event',
          status:
            x.status ||
            '—',
          detail:
            x.description ||
            x.message ||
            x.event_name ||
            '',
          at:
            x.created_at ||
            x.occurred_at ||
            x.updated_at
        })),

        ...requestRows.map(x => ({
          source: 'Action Request',
          action:
            x.action ||
            x.action_type ||
            x.request_type ||
            'request',
          status:
            x.status ||
            '—',
          detail:
            x.reason ||
            x.description ||
            x.message ||
            '',
          at:
            x.created_at ||
            x.updated_at
        })),

        ...timelineRows.map(x => ({
          source: 'Lead Timeline',
          action:
            x.event_type ||
            x.action ||
            x.type ||
            'timeline',
          status:
            x.status ||
            '—',
          detail:
            x.description ||
            x.message ||
            x.note ||
            '',
          at:
            x.created_at ||
            x.occurred_at ||
            x.updated_at
        }))

      ].sort(
        (a, b) =>
          new Date(b.at || 0) -
          new Date(a.at || 0)
      );

      panel.innerHTML = `

        <div
          class="grid"
          style="margin-bottom:12px"
        >

          <div class="card metric">
            <small>Client Events</small>
            <strong>
              ${eventRows.length}
            </strong>
          </div>

          <div class="card metric">
            <small>Action Requests</small>
            <strong>
              ${requestRows.length}
            </strong>
          </div>

          <div class="card metric">
            <small>Lead Timeline</small>
            <strong>
              ${timelineRows.length}
            </strong>
          </div>

          <div class="card metric">
            <small>Total Activity</small>
            <strong>
              ${merged.length}
            </strong>
          </div>

        </div>

        <div class="card">

          <h3>Activity Timeline</h3>

          <div style="overflow:auto">

            <table>

              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>

              <tbody>

                ${
                  merged.map(x => `
                    <tr>

                      <td>
                        ${esc(
                          dt(x.at)
                        )}
                      </td>

                      <td>
                        ${esc(
                          x.source
                        )}
                      </td>

                      <td>
                        <b>
                          ${esc(
                            x.action
                          )}
                        </b>
                      </td>

                      <td>
                        ${badge(
                          x.status
                        )}
                      </td>

                      <td
                        style="
                          max-width:420px;
                          white-space:pre-wrap
                        "
                      >
                        ${esc(
                          x.detail ||
                          '—'
                        )}
                      </td>

                    </tr>
                  `).join('')

                  ||

                  `
                    <tr>
                      <td colspan="5">
                        No activity records found for this client.
                      </td>
                    </tr>
                  `
                }

              </tbody>

            </table>

          </div>

        </div>
      `;

    } catch (e) {

      console.error(
        '[GLIME Activity client view]',
        e
      );

      panel.innerHTML = `
        <div class="notice">
          Activity data could not be loaded.
          <br>
          <small>
            ${esc(
              e.message ||
              'Access/read error'
            )}
          </small>
        </div>
      `;
    }
  }

  function boot() {

    fixViewHandler();

    let attempts = 0;

    const timer =
      setInterval(() => {

        attempts++;

        fixViewHandler();

        if ($('clientModal')) {
          addFullTabs();
        }

        if (attempts >= 30) {
          clearInterval(timer);
        }

      }, 300);

    const modal =
      $('clientModal');

    if (modal) {

      new MutationObserver(() => {

        if (
          modal.classList.contains(
            'open'
          )
        ) {
          addFullTabs();
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
  }

  if (
    document.readyState ===
    'loading'
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
