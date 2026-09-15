(() => {
  'use strict';

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const $ = id => document.getElementById(id);

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
  }

  function empty(el, text) {
    el.innerHTML = `<div class="empty">${esc(text)}</div>`;
  }

  function pill(status) {
    const s = String(status || 'unknown');
    return `<span class="pill ${esc(s)}">${esc(s.replaceAll('_',' '))}</span>`;
  }

  function renderPermissions(rows) {
    const el = $('permissions');
    if (!rows.length) return empty(el, 'No permissions configured yet.');

    el.innerHTML = rows.map(r => `
      <div class="row">
        <div class="rowMain">
          <div class="rowTitle">${esc(r.service)} / ${esc(r.action)}</div>
          <div class="rowSub">
            ${r.requires_confirmation ? 'Confirmation required' : 'Direct permission'}
          </div>
        </div>
        ${pill(r.status)}
      </div>
    `).join('');
  }

  function renderPending(rows) {
    const el = $('pending');

    if (!rows.length)
      return empty(el, 'No pending actions.');

    el.innerHTML = rows.map(r => `
      <div class="row">
        <div class="rowMain">
          <div class="rowTitle">${esc(r.service)} / ${esc(r.action)}</div>
          <div class="rowSub">
            ${esc(new Date(r.created_at).toLocaleString())}
          </div>
        </div>
        ${pill(r.status)}
      </div>
    `).join('');
  }

  function renderTasks(rows) {
    const el = $('tasks');

    if (!rows.length)
      return empty(el, 'No tasks yet.');

    el.innerHTML = rows.map(r => `
      <div class="row">
        <div class="rowMain">
          <div class="rowTitle">${esc(r.title)}</div>

          ${
            r.description
              ? `<div class="rowSub">${esc(r.description)}</div>`
              : ''
          }

          ${
            r.due_at
              ? `<div class="rowSub">
                   Due: ${esc(new Date(r.due_at).toLocaleString())}
                 </div>`
              : ''
          }
        </div>

        ${pill(r.status)}
      </div>
    `).join('');
  }

  function renderNotes(rows) {
    const el = $('notes');

    if (!rows.length)
      return empty(el, 'No notes yet.');

    el.innerHTML = rows.map(r => `
      <div class="row">
        <div class="rowMain">
          <div class="rowTitle">${esc(r.title)}</div>
          <div class="noteContent">${esc(r.content)}</div>
        </div>

        ${pill(r.status)}
      </div>
    `).join('');
  }

  function renderRecent(rows) {
    const el = $('recent');

    if (!rows.length)
      return empty(el, 'No activity yet.');

    el.innerHTML = rows.map(r => `
      <div class="row">
        <div class="rowMain">
          <div class="rowTitle">
            ${esc(r.service)} / ${esc(r.action)}
          </div>

          <div class="rowSub">
            ${esc(r.result_summary || 'No result summary')}
            ·
            ${esc(new Date(r.created_at).toLocaleString())}
          </div>
        </div>

        ${pill(r.status)}
      </div>
    `).join('');
  }

  function renderIntegrations(rows) {
    const el = $('integrations');

    if (!rows.length)
      return empty(el, 'No services connected.');

    el.innerHTML = rows.map(r => `
      <div class="row">
        <div class="rowMain">
          <div class="rowTitle">${esc(r.provider)}</div>

          <div class="rowSub">
            ${
              r.expires_at
                ? `Expires: ${esc(
                    new Date(r.expires_at).toLocaleString()
                  )}`
                : 'No expiry reported'
            }
          </div>
        </div>

        ${pill(r.status)}
      </div>
    `).join('');
  }

  async function load() {

    $('profileBadge').textContent =
      'Checking access…';

    const {
      data: sessionData,
      error: sessionError
    } = await db.auth.getSession();

    if (sessionError)
      throw sessionError;

    const session =
      sessionData?.session;

    if (!session?.user) {

      $('profileBadge').textContent =
        'Login required';

      throw new Error(
        'Please login from the GLIME Client Dashboard first.'
      );
    }

    const {
      data,
      error
    } = await db.rpc(
      'care_dashboard_snapshot'
    );

    if (error)
      throw error;

    if (!data?.profile) {

      $('profileBadge').textContent =
        'CARE not enabled';

      renderPermissions([]);
      renderPending([]);
      renderTasks([]);
      renderNotes([]);
      renderRecent([]);
      renderIntegrations([]);

      return;
    }

    $('profileBadge').textContent =
      `${data.profile.display_name || 'CARE'} · Active`;

    const permissions =
      data.permissions || [];

    const pending =
      data.pending_actions || [];

    const tasks =
      data.tasks || [];

    const notes =
      data.notes || [];

    const recent =
      data.recent_actions || [];

    const integrations =
      data.integrations || [];

    $('pendingCount').textContent =
      pending.length;

    $('permissionCount').textContent =
      permissions.length;

    $('integrationCount').textContent =
      integrations.length;

    $('taskCount').textContent =
      tasks.length;

    renderPermissions(permissions);
    renderPending(pending);
    renderTasks(tasks);
    renderNotes(notes);
    renderRecent(recent);
    renderIntegrations(integrations);
  }

  function showError(error) {

    console.error(
      'GLIME CARE:',
      error
    );

    const el = $('error');

    el.textContent =
      error?.message ||
      'Unable to load GLIME CARE.';

    el.classList.remove('hidden');
  }

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      load().catch(showError);
    }
  );

})();
