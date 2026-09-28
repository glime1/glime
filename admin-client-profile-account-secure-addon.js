/* GLIME Admin — Secure Profile + Account Addon
   Requires:
   - admin.html
   - admin-control-gap-addon.js
   - admin-client-detail-view-addon.js

   Backend RPCs:
   - admin_client_profile_update
   - admin_client_account_action

   Permanent delete:
   - existing admin-permanent-delete Edge Function
*/
(() => {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const sb =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      }
    );

  const $ = id =>
    document.getElementById(id);

  const esc = value =>
    String(value ?? '').replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c])
    );

  const dt = value =>
    value
      ? new Date(value).toLocaleString()
      : '—';

  function getClientId() {
    const text =
      $('detailSub')?.textContent || '';

    return (
      text.split('•')[0]?.trim() ||
      null
    );
  }

  async function getClient(clientId) {
    const { data, error } =
      await sb
        .from('client_data')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  function statusBadge(value) {
    const s =
      String(value || 'unknown');

    const l =
      s.toLowerCase();

    const cls =
      l === 'active'
        ? 'green'
        : l === 'suspended' ||
          l === 'archived' ||
          l === 'expired'
          ? 'red'
          : l === 'trial'
            ? 'orange'
            : 'blue';

    return `
      <span class="badge ${cls}">
        ${esc(s)}
      </span>
    `;
  }

  function accountActionMessage(text) {
    let el =
      $('glimeAccountActionMsg');

    if (!el) {
      el =
        document.createElement('div');

      el.id =
        'glimeAccountActionMsg';

      el.className =
        'message';

      $('tab-account')
        ?.appendChild(el);
    }

    el.textContent =
      text || '';
  }

  function renderProfile(c) {
    const panel =
      $('tab-profile');

    if (!panel) {
      return;
    }

    panel.innerHTML = `
      <div class="card">

        <h3>PROFILE</h3>

        <p class="sub">
          Admin can edit name, mobile and
          business name.
          Email remains read-only because it
          is tied to the Supabase Auth identity.
        </p>

        <div class="kv">

          <div>
            <small>Client ID</small>
            <b>
              ${esc(c.client_id)}
            </b>
          </div>

          <div>
            <small>Email</small>
            <b>
              ${esc(c.email || '—')}
            </b>
          </div>

        </div>

        <div
          style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:10px;
            margin-top:12px
          "
        >

          <div>
            <label>Name</label>

            <input
              id="glimeProfileName"
              value="${esc(
                c.full_name ||
                c.client_name ||
                c.name ||
                ''
              )}"
              autocomplete="off"
            >
          </div>

          <div>
            <label>Mobile</label>

            <input
              id="glimeProfileMobile"
              value="${esc(
                c.phone ||
                c.mobile ||
                ''
              )}"
              autocomplete="off"
            >
          </div>

        </div>

        <div style="margin-top:10px">

          <label>Business Name</label>

          <input
            id="glimeProfileBusiness"
            value="${esc(
              c.business_name ||
              ''
            )}"
            autocomplete="organization"
          >

        </div>

        <div
          style="
            display:flex;
            gap:8px;
            flex-wrap:wrap;
            margin-top:12px
          "
        >

          <button
            class="btn primary"
            id="glimeSaveProfile"
            type="button"
          >
            Save Profile
          </button>

          <button
            class="btn"
            id="glimeReloadProfile"
            type="button"
          >
            Reset
          </button>

        </div>

        <div
          class="message"
          id="glimeProfileMsg"
        ></div>

      </div>
    `;

    $('glimeSaveProfile').onclick =
      saveProfile;

    $('glimeReloadProfile').onclick =
      () => renderProfile(c);
  }

  async function saveProfile() {
    const clientId =
      getClientId();

    if (!clientId) {
      return;
    }

    const name =
      $('glimeProfileName')
        ?.value
        .trim() || '';

    const mobile =
      $('glimeProfileMobile')
        ?.value
        .trim() || '';

    const business =
      $('glimeProfileBusiness')
        ?.value
        .trim() || '';

    const msg =
      $('glimeProfileMsg');

    const btn =
      $('glimeSaveProfile');

    if (!name) {
      msg.textContent =
        'Name is required.';
      return;
    }

    btn.disabled = true;

    msg.textContent =
      'Saving securely…';

    try {

      const { data, error } =
        await sb.rpc(
          'admin_client_profile_update',
          {
            p_client_id:
              clientId,

            p_full_name:
              name,

            p_mobile:
              mobile,

            p_business_name:
              business
          }
        );

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          'Profile update returned no client.'
        );
      }

      msg.textContent =
        'Profile updated successfully.';

      await refreshClientUI(
        data
      );

    } catch (e) {

      console.error(
        '[GLIME secure profile update]',
        e
      );

      msg.textContent =
        e.message ||
        'Profile update failed.';

    } finally {

      btn.disabled = false;

    }
  }

  async function performAccountAction(
    action,
    reason = null
  ) {
    const clientId =
      getClientId();

    if (!clientId) {
      throw new Error(
        'Client ID is unavailable.'
      );
    }

    const { data, error } =
      await sb.rpc(
        'admin_client_account_action',
        {
          p_client_id:
            clientId,

          p_action:
            action,

          p_reason:
            reason
        }
      );

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        'Account action returned no client.'
      );
    }

    return data;
  }

  async function suspendClientSecure() {
    const clientId =
      getClientId();

    if (!clientId) {
      return;
    }

    const reason =
      prompt(
        `Suspension Reason for ${clientId}:

This reason is stored in the database
and shown to the client.`
      );

    if (reason === null) {
      return;
    }

    const clean =
      reason.trim();

    if (!clean) {
      alert(
        'Suspension reason is required.'
      );
      return;
    }

    if (
      !confirm(
        `Confirm suspension of ${clientId}?

Reason:
${clean}`
      )
    ) {
      return;
    }

    try {

      accountActionMessage(
        'Suspending client securely…'
      );

      const data =
        await performAccountAction(
          'suspend',
          clean
        );

      await refreshClientUI(
        data
      );

      accountActionMessage(
        'Client suspended successfully.'
      );

    } catch (e) {

      console.error(
        '[GLIME secure suspend]',
        e
      );

      accountActionMessage(
        e.message ||
        'Suspension failed.'
      );
    }
  }

  async function reactivateClientSecure() {
    const clientId =
      getClientId();

    if (!clientId) {
      return;
    }

    if (
      !confirm(
        `Reactivate ${clientId}?

The suspension reason will be cleared.`
      )
    ) {
      return;
    }

    try {

      accountActionMessage(
        'Reactivating client securely…'
      );

      const data =
        await performAccountAction(
          'reactivate',
          null
        );

      await refreshClientUI(
        data
      );

      accountActionMessage(
        'Client reactivated successfully.'
      );

    } catch (e) {

      console.error(
        '[GLIME secure reactivate]',
        e
      );

      accountActionMessage(
        e.message ||
        'Reactivation failed.'
      );
    }
  }

  async function archiveClientSecure() {
    const clientId =
      getClientId();

    if (!clientId) {
      return;
    }

    if (
      !confirm(
        `Archive ${clientId}?

This changes the account status to archived.
It does NOT permanently delete client data.`
      )
    ) {
      return;
    }

    try {

      accountActionMessage(
        'Archiving client securely…'
      );

      const data =
        await performAccountAction(
          'archive',
          null
        );

      await refreshClientUI(
        data
      );

      accountActionMessage(
        'Client archived successfully.'
      );

    } catch (e) {

      console.error(
        '[GLIME secure archive]',
        e
      );

      accountActionMessage(
        e.message ||
        'Archive failed.'
      );
    }
  }

  function renderAccount(c) {
    const panel =
      $('tab-account');

    if (!panel) {
      return;
    }

    const status =
      String(
        c.account_status ||
        'unknown'
      ).toLowerCase();

    const suspended =
      status === 'suspended';

    const archived =
      status === 'archived';

    panel.innerHTML = `
      <div class="card">

        <h3>ACCOUNT CONTROL</h3>

        <div
          class="kv"
          style="margin-bottom:12px"
        >

          <div>
            <small>Account Status</small>
            <b>
              ${statusBadge(
                c.account_status
              )}
            </b>
          </div>

          <div>
            <small>Client ID</small>
            <b>
              ${esc(c.client_id)}
            </b>
          </div>

          <div>
            <small>Suspended At</small>
            <b>
              ${esc(
                dt(c.suspended_at)
              )}
            </b>
          </div>

          <div>
            <small>Payment Status</small>
            <b>
              ${statusBadge(
                c.payment_status
              )}
            </b>
          </div>

        </div>

        ${
          suspended
            ? `
              <div
                class="notice"
                style="
                  border-color:
                    rgba(255,83,102,.35);
                  background:
                    rgba(255,83,102,.06);
                  color:#ffb0ba
                "
              >

                <b>
                  ACCOUNT SUSPENDED
                </b>

                <br>

                Reason:
                ${esc(
                  c.suspension_reason ||
                  'No reason recorded.'
                )}

              </div>
            `
            : ''
        }

        ${
          archived
            ? `
              <div class="notice">

                This client is archived.
                Reactivation requires an
                explicit Admin action.

              </div>
            `
            : ''
        }

        <div
          style="
            display:flex;
            gap:8px;
            flex-wrap:wrap
          "
        >

          ${
            suspended || archived
              ? `
                <button
                  class="btn green"
                  id="glimeReactivateClient"
                  type="button"
                >
                  Reactivate
                </button>
              `
              : `
                <button
                  class="btn red"
                  id="glimeSuspendClient"
                  type="button"
                >
                  Suspend
                </button>
              `
          }

          ${
            !archived
              ? `
                <button
                  class="btn orange"
                  id="glimeArchiveClient"
                  type="button"
                >
                  Archive
                </button>
              `
              : ''
          }

          <button
            class="btn red"
            id="glimePermanentDeleteClient"
            type="button"
          >
            Permanent Delete
          </button>

        </div>

        <div
          class="message"
          id="glimeAccountActionMsg"
        ></div>

      </div>

      <div
        class="card"
        style="margin-top:12px"
      >

        <h3>
          Permanent Delete Protection
        </h3>

        <p class="sub">
          Permanent deletion is
          backend-enforced.
          The client must be suspended first
          and the exact Client ID must be typed.
          The operation is irreversible.
        </p>

        ${
          !suspended
            ? `
              <div class="notice">
                Suspend the client first.
                Permanent Delete remains
                backend-blocked until the account
                is suspended.
              </div>
            `
            : `
              <div class="notice">
                Client is suspended.
                Permanent Delete is available.
              </div>
            `
        }

      </div>
    `;

    if (
      $('glimeSuspendClient')
    ) {
      $('glimeSuspendClient').onclick =
        suspendClientSecure;
    }

    if (
      $('glimeReactivateClient')
    ) {
      $('glimeReactivateClient').onclick =
        reactivateClientSecure;
    }

    if (
      $('glimeArchiveClient')
    ) {
      $('glimeArchiveClient').onclick =
        archiveClientSecure;
    }

    $('glimePermanentDeleteClient')
      .onclick =
        permanentDeleteSecure;
  }

  async function permanentDeleteSecure() {
    const clientId =
      getClientId();

    if (!clientId) {
      return;
    }

    let client;

    try {

      client =
        await getClient(
          clientId
        );

    } catch (e) {

      alert(
        e.message ||
        'Could not verify client.'
      );

      return;
    }

    if (
      String(
        client?.account_status ||
        ''
      ).toLowerCase() !==
      'suspended'
    ) {

      alert(
        'Permanent Delete requires the client to be suspended first.'
      );

      return;
    }

    if (
      !confirm(
        `PERMANENT DELETE

Client: ${clientId}

This is irreversible.
All client-owned database data and
the client Auth account will be removed.

Continue?`
      )
    ) {
      return;
    }

    const typed =
      prompt(
        `Type the exact Client ID:

${clientId}`
      );

    if (
      typed === null ||
      typed.trim().toLowerCase() !==
        clientId.trim().toLowerCase()
    ) {

      alert(
        'Client ID confirmation did not match.'
      );

      return;
    }

    if (
      !confirm(
        `FINAL CONFIRMATION

Permanently delete ${clientId}?`
      )
    ) {
      return;
    }

    const btn =
      $('glimePermanentDeleteClient');

    btn.disabled = true;

    accountActionMessage(
      'Permanently deleting client securely…'
    );

    try {

      const { data, error } =
        await sb.functions.invoke(
          'admin-permanent-delete',
          {
            body: {
              client_id:
                clientId,

              confirmation_client_id:
                typed.trim()
            }
          }
        );

      if (error) {
        throw error;
      }

      if (!data?.ok) {
        throw new Error(
          data?.error ||
          'Permanent deletion was not confirmed.'
        );
      }

      alert(
        `Client ${clientId} was permanently deleted.`
      );

      $('clientModal')
        ?.classList
        .remove('open');

      location.reload();

    } catch (e) {

      console.error(
        '[GLIME permanent delete]',
        e
      );

      accountActionMessage(
        e.message ||
        'Permanent deletion failed.'
      );

      btn.disabled = false;
    }
  }

  async function refreshClientUI(updated) {
    if (!updated) {
      return;
    }

    renderProfile(updated);
    renderAccount(updated);

    $('detailName').textContent =
      updated.full_name ||
      updated.client_name ||
      updated.email ||
      'Client';

    $('detailSub').textContent =
      `${updated.client_id || 'No Client ID'} • ${updated.email || ''}`;

    if (
      typeof window.loadAll ===
      'function'
    ) {
      try {

        await window.loadAll();

      } catch (e) {

        console.warn(
          '[GLIME admin refresh]',
          e
        );
      }
    }
  }

  function wrapOpenClient() {
    const original =
      window.openClient;

    if (
      typeof original !==
        'function' ||
      original.__glimeSecureProfileAccount
    ) {
      return;
    }

    const wrapped =
      async function(id) {

        await original(id);

        const clientId =
          getClientId();

        if (!clientId) {
          return;
        }

        try {

          const client =
            await getClient(
              clientId
            );

          if (!client) {
            return;
          }

          renderProfile(client);
          renderAccount(client);

        } catch (e) {

          console.error(
            '[GLIME secure client detail]',
            e
          );
        }
      };

    wrapped.__glimeSecureProfileAccount =
      true;

    wrapped.__glimeOriginal =
      original;

    window.openClient =
      wrapped;
  }

  function boot() {

    wrapOpenClient();

    let attempts = 0;

    const timer =
      setInterval(() => {

        attempts++;

        wrapOpenClient();

        if (
          $('clientModal') &&
          $('clientModal')
            .classList
            .contains('open')
        ) {

          const clientId =
            getClientId();

          if (clientId) {

            getClient(clientId)
              .then(client => {

                if (!client) {
                  return;
                }

                renderProfile(client);
                renderAccount(client);

              })
              .catch(
                console.error
              );
          }
        }

        if (attempts >= 40) {
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
          wrapOpenClient();
        }

      }).observe(
        modal,
        {
          attributes: true
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
