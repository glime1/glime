/* GLIME Admin Control Gap Addon
   Adds:
   - Audit Logs navigation/view
   - Client Audit tab
   - Audit logging for existing profile/account actions
   - Permanent Delete action using the secure admin RPC
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
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
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
    if (error) console.error('[GLIME audit]', action, error);
  }

  async function getClient(clientId) {
    if (!clientId) return null;
    const { data, error } = await sb.from('client_data')
      .select('*').eq('client_id', clientId).maybeSingle();
    if (error) throw error;
    return data;
  }

  function snapshot(c) {
    if (!c) return null;
    return {
      id:c.id, client_id:c.client_id, email:c.email,
      full_name:c.full_name, client_name:c.client_name,
      business_name:c.business_name, phone:c.phone, mobile:c.mobile,
      account_status:c.account_status, suspension_reason:c.suspension_reason,
      payment_status:c.payment_status,
      free_trial_status:c.free_trial_status,
      free_trial_started_at:c.free_trial_started_at,
      free_trial_ends_at:c.free_trial_ends_at
    };
  }

  function same(a,b){ return JSON.stringify(a) === JSON.stringify(b); }

  function addAuditNav() {
    const nav = document.querySelector('aside.sidebar nav');
    if (!nav || nav.querySelector('[data-view="audit"]')) return;
    const settings = nav.querySelector('[data-view="settings"]');
    const b = document.createElement('button');
    b.type='button';
    b.dataset.view='audit';
    b.textContent='Audit Logs';
    if(settings) nav.insertBefore(b,settings);
    else nav.appendChild(b);
    b.addEventListener('click', openAuditView);
  }

  function addAuditView() {
    const main = document.querySelector('main');
    if (!main || $('view-audit')) return;

    const section=document.createElement('section');
    section.className='view';
    section.id='view-audit';

    section.innerHTML=`
      <div class="card">
        <div class="toolbar">
          <input class="search" id="auditSearch"
                 placeholder="Filter action, entity or client ID">
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
      </div>`;

    main.appendChild(section);

    $('auditRefreshBtn').onclick=loadAuditLogs;
    $('auditSearch').oninput=renderAuditRows;
  }

  let auditRows=[];

  async function loadAuditLogs() {
    const body=$('auditRows');

    if(body)
      body.innerHTML='<tr><td colspan="6">Loading audit logs…</td></tr>';

    const {data,error}=await sb.rpc('admin_audit_list',{
      p_client_id:null,
      p_limit:500
    });

    if(error){
      if(body)
        body.innerHTML=`<tr><td colspan="6">${esc(error.message)}</td></tr>`;
      return;
    }

    auditRows=data||[];
    renderAuditRows();
  }

  function renderAuditRows() {
    const body=$('auditRows');
    if(!body)return;

    const term=($('auditSearch')?.value||'')
      .trim()
      .toLowerCase();

    const rows=auditRows.filter(x=>!term||[
      x.action,
      x.entity,
      x.client_id,
      x.actor,
      JSON.stringify(x.before||{}),
      JSON.stringify(x.after||{})
    ].join(' ').toLowerCase().includes(term));

    body.innerHTML=rows.map(x=>`<tr>
      <td>${esc(dt(x.at))}</td>
      <td><b>${esc(x.action)}</b></td>
      <td>${esc(x.entity)}</td>
      <td>${esc(x.client_id||'—')}</td>
      <td>${esc(x.actor||'—')}</td>
      <td>${esc(x.after?.status||x.after?.result||'Recorded')}</td>
    </tr>`).join('') ||
    '<tr><td colspan="6">No audit records found.</td></tr>';
}

   function openAuditView() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = $('view-audit');
    if (view) view.classList.add('active');

    document.querySelectorAll('aside.sidebar nav button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === 'audit');
    });

    loadAuditLogs();
  }

  function addClientAuditTab() {
    const tabs = document.querySelector('#clientModal .tabs');
    if (!tabs || tabs.querySelector('[data-tab="audit"]')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tab = 'audit';
    btn.textContent = 'Audit';
    tabs.appendChild(btn);

    btn.addEventListener('click', () => {
      document.querySelectorAll('#clientModal .tabs button')
        .forEach(x => x.classList.remove('active'));

      btn.classList.add('active');

      document.querySelectorAll('#clientModal .tab')
        .forEach(x => x.classList.remove('active'));

      let pane = document.getElementById('tab-audit');

      if (!pane) {
        pane = document.createElement('div');
        pane.className = 'tab';
        pane.id = 'tab-audit';

        const modalbox = document.querySelector('#clientModal .modalbox');
        if (modalbox) modalbox.appendChild(pane);
      }

      pane.classList.add('active');
      loadClientAudit();
    });
  }

  async function loadClientAudit() {
    const clientId = clientIdFromDetail();
    const pane = $('tab-audit');

    if (!pane) return;

    if (!clientId) {
      pane.innerHTML = `
        <div class="card">
          <p>Client ID नहीं मिला।</p>
        </div>`;
      return;
    }

    pane.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <strong>Client Audit History</strong>
          <button class="btn" id="clientAuditRefresh">↻ Refresh</button>
        </div>
        <div id="clientAuditRows">Loading…</div>
      </div>`;

    $('clientAuditRefresh')?.addEventListener('click', loadClientAudit);

    const { data, error } = await sb.rpc('admin_audit_list', {
      p_client_id: clientId,
      p_limit: 200
    });

    if (error) {
      pane.querySelector('#clientAuditRows').innerHTML =
        `<p>${esc(error.message)}</p>`;
      return;
    }

    const rows = data || [];

    if (!rows.length) {
      pane.querySelector('#clientAuditRows').innerHTML =
        '<p>No audit records found for this client.</p>';
      return;
    }

    pane.querySelector('#clientAuditRows').innerHTML = `
      <div style="overflow:auto">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Admin</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(x => `
              <tr>
                <td>${esc(dt(x.at))}</td>
                <td><b>${esc(x.action)}</b></td>
                <td>${esc(x.entity)}</td>
                <td>${esc(x.actor || '—')}</td>
                <td>
                  <pre style="white-space:pre-wrap;max-width:280px">${esc(
                    JSON.stringify(x.before || {}, null, 2)
                  )}</pre>
                </td>
                <td>
                  <pre style="white-space:pre-wrap;max-width:280px">${esc(
                    JSON.stringify(x.after || {}, null, 2)
                  )}</pre>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function addPermanentDeleteUI() {
    const accountTab = $('tab-account');
    if (!accountTab || accountTab.querySelector('#permanentDeleteBtn')) return;

    const wrap = document.createElement('div');

    wrap.className = 'card';
    wrap.style.marginTop = '20px';
    wrap.style.border = '1px solid rgba(255,70,70,.35)';

    wrap.innerHTML = `
      <div>
        <h3 style="margin:0 0 8px;color:#ff5b5b">
          Permanent Delete
        </h3>

        <p style="margin:0 0 14px">
          यह कार्रवाई client का पूरा data permanently delete करेगी।
          इसे वापस नहीं किया जा सकता।
        </p>

        <button
          type="button"
          class="btn"
          id="permanentDeleteBtn"
          style="background:#b42318;color:#fff">
          Permanently Delete Client
        </button>
      </div>`;

    accountTab.appendChild(wrap);

    $('permanentDeleteBtn').addEventListener(
      'click',
      permanentDeleteClient
    );
  }

  async function permanentDeleteClient() {
    const clientId = clientIdFromDetail();

    if (!clientId) {
      alert('Client ID नहीं मिला।');
      return;
    }

    const client = await getClient(clientId);

    if (!client) {
      alert('Client नहीं मिला।');
      return;
    }

    if (String(client.account_status || '').toLowerCase() !== 'suspended') {
      alert(
        'Permanent Delete से पहले client को Suspend करना जरूरी है।'
      );
      return;
    }

    const first = confirm(
      `क्या आप client ${clientId} को permanently delete करना चाहते हैं?\n\n` +
      `यह कार्रवाई वापस नहीं की जा सकती।`
    );

    if (!first) return;

    const typed = prompt(
      `सुरक्षा पुष्टि के लिए Client ID exactly लिखें:\n\n${clientId}`
    );

    if (typed === null) return;

    if (typed.trim().toLowerCase() !== clientId.trim().toLowerCase()) {
      alert('Client ID match नहीं हुआ। Delete रोक दिया गया।');
      return;
    }

    const finalConfirm = confirm(
      `FINAL CONFIRMATION\n\n` +
      `Client: ${clientId}\n\n` +
      `सारा client data permanently delete होगा।\n\n` +
      `क्या आप जारी रखना चाहते हैं?`
    );

    if (!finalConfirm) return;

    const btn = $('permanentDeleteBtn');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Deleting…';
    }

    try {
      const { data, error } = await sb.functions.invoke(
        'admin-permanent-delete',
        {
          body: {
            client_id: clientId,
            confirmation_client_id: typed.trim()
          }
        }
      );

      if (error) throw error;

      if (!data?.ok) {
        throw new Error(
          data?.error || 'Permanent delete failed.'
        );
      }

      alert(
        `Client ${clientId} permanently deleted successfully.`
      );

      const modal = $('clientModal');

      if (modal) {
        modal.classList.remove('open');
        modal.style.display = 'none';
      }

      if (typeof window.loadAll === 'function') {
        await window.loadAll();
      } else {
        window.location.reload();
      }

    } catch (err) {
      console.error('[GLIME permanent delete]', err);

      alert(
        'Permanent Delete failed:\n\n' +
        (err?.message || String(err))
      );

      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Permanently Delete Client';
      }
    }
}

   async function auditProfileEdit(clientId, before) {
    try {
      const afterClient = await getClient(clientId);

      if (!same(snapshot(before), snapshot(afterClient))) {
        await auditWrite(
          'PROFILE_EDIT',
          'client_data',
          clientId,
          snapshot(before),
          snapshot(afterClient)
        );
      }
    } catch (e) {
      console.error('[GLIME audit profile]', e);
    }
  }

  async function auditAccountAction(
    action,
    clientId,
    before,
    extraAfter = {}
  ) {
    try {
      const afterClient = await getClient(clientId);

      await auditWrite(
        action,
        'client_data',
        clientId,
        snapshot(before),
        {
          ...snapshot(afterClient),
          ...extraAfter
        }
      );
    } catch (e) {
      console.error(
        `[GLIME audit ${action}]`,
        e
      );
    }
  }

  function wrapAdminAction(name, auditAction) {
    const original = window[name];

    if (typeof original !== 'function') {
      return;
    }

    if (original.__glimeAuditWrapped) {
      return;
    }

    const wrapped = async function (...args) {
      let clientId = null;
      let before = null;

      try {
        clientId =
          args.find(
            x =>
              typeof x === 'string' &&
              /^GLM-/i.test(x.trim())
          ) || clientIdFromDetail();

        if (clientId) {
          before = await getClient(clientId);
        }
      } catch (e) {
        console.warn(
          '[GLIME audit] before snapshot failed',
          e
        );
      }

      const result = await original.apply(this, args);

      try {
        if (clientId && before) {
          await auditAccountAction(
            auditAction,
            clientId,
            before
          );
        }
      } catch (e) {
        console.error(
          '[GLIME audit] write failed',
          e
        );
      }

      return result;
    };

    wrapped.__glimeAuditWrapped = true;
    wrapped.__glimeOriginal = original;

    window[name] = wrapped;
  }

  function installActionAudits() {
    wrapAdminAction(
      'editProfile',
      'PROFILE_EDIT'
    );

    wrapAdminAction(
      'suspendClient',
      'CLIENT_SUSPEND'
    );

    wrapAdminAction(
      'reactivateClient',
      'CLIENT_REACTIVATE'
    );

    wrapAdminAction(
      'archiveClient',
      'CLIENT_ARCHIVE'
    );
  }

  async function auditAdminSession() {
    try {
      const { data, error } =
        await sb.auth.getSession();

      if (error || !data?.session) {
        return;
      }

      const session = data.session;
      const email =
        String(
          session.user?.email || ''
        ).toLowerCase();

      if (email !== 'admin@glime.online') {
        return;
      }

      let aal = null;

      try {
        const result =
          await sb.auth.mfa
            .getAuthenticatorAssuranceLevel();

        aal = result?.data?.currentLevel || null;
      } catch (e) {
        console.warn(
          '[GLIME audit] AAL check failed',
          e
        );
      }

      if (aal !== 'aal2') {
        return;
      }

      const key =
        'glime_admin_audit_session_' +
        session.user.id;

      if (sessionStorage.getItem(key)) {
        return;
      }

      await auditWrite(
        'ADMIN_LOGIN',
        'admin',
        null,
        null,
        {
          status: 'authenticated_aal2',
          two_factor_verified: true,
          email: email
        }
      );

      sessionStorage.setItem(
        key,
        '1'
      );

    } catch (e) {
      console.error(
        '[GLIME admin session audit]',
        e
      );
    }
  }

  function installAuthAudit() {
    sb.auth.onAuthStateChange(
      async (event, session) => {
        if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED'
        ) {
          setTimeout(
            auditAdminSession,
            300
          );
        }

        if (event === 'SIGNED_OUT') {
          Object.keys(sessionStorage)
            .filter(key =>
              key.startsWith(
                'glime_admin_audit_session_'
              )
            )
            .forEach(key =>
              sessionStorage.removeItem(key)
            );
        }
      }
    );
  }

  function ensureClientAuditTabVisible() {
    const modal = $('clientModal');

    if (!modal) return;

    addClientAuditTab();
    addPermanentDeleteUI();
  }

   function watchClientModal() {
    const modal = $('clientModal');

    if (!modal) return;

    const observer = new MutationObserver(() => {
      ensureClientAuditTabVisible();
    });

    observer.observe(modal, {
      childList: true,
      subtree: true
    });

    ensureClientAuditTabVisible();
  }

  function hookClientModalOpen() {
    const modal = $('clientModal');

    if (!modal) return;

    const observer = new MutationObserver(() => {
      if (
        modal.classList.contains('open') ||
        modal.style.display === 'flex' ||
        modal.style.display === 'block'
      ) {
        setTimeout(() => {
          ensureClientAuditTabVisible();
        }, 50);
      }
    });

    observer.observe(modal, {
      attributes: true,
      attributeFilter: [
        'class',
        'style'
      ]
    });
  }

  function startAddon() {
    try {
      addAuditNav();
      addAuditView();
      addClientAuditTab();
      addPermanentDeleteUI();

      installActionAudits();
      installAuthAudit();

      watchClientModal();
      hookClientModalOpen();

      auditAdminSession();

      console.log(
        '[GLIME] Admin control gap addon loaded.'
      );
    } catch (e) {
      console.error(
        '[GLIME] Admin addon initialization failed',
        e
      );
    }
  }

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      startAddon,
      { once: true }
    );
  } else {
    startAddon();
  }

})();
