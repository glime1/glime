/* GLIME Admin — Full Client Detail View Addon (v2 · 2026-11-27)
   Depends on:
   1) admin.html  (exposes window.supabaseClient + window.openClient)
   2) existing admin-control-gap-addon.js

   What this file does:
   - Wraps window.openClient ONCE (no more wrapper stacking / repeated reloads / page jumping)
   - Adds WhatsApp, Instagram and Activity tabs (+ keeps Audit and Billing Detail tabs)
   - Uses the shared admin Supabase client (no extra login sessions)
   - Reads connection info from the secure RPC admin_client_connections_list
     (never selects access tokens into the browser)
   - Shows real totals, a connection card, customer names on messages,
     a Refresh button on every tab, and visible errors instead of fake zeros
*/
(() => {
  'use strict';

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  // Reuse the single admin client created in admin.html (same session / MFA level).
  const sb = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: false }
  });

  const LIMIT = 100;
  const $ = id => document.getElementById(id);

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const nf = n => Number(n || 0).toLocaleString('en-IN');

  const dt = v => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const clip = (v, n = 600) => {
    const s = String(v ?? '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  };

  const isInbound = d => String(d || '').toLowerCase().startsWith('in');

  const badge = value => {
    const s = String(value ?? '—');
    const l = s.toLowerCase();
    const has = list => list.some(k => l.includes(k));
    const cls =
      has(['fail', 'error', 'disconnect', 'revoked', 'reject', 'denied', 'cancel', 'expired', 'suspend', 'blocked'])
        ? 'red'
        : has(['pending', 'queue', 'await', 'trial', 'uncertain', 'review', 'retry', 'skipped'])
          ? 'orange'
          : has(['active', 'open', 'sent', 'deliver', 'read', 'connected', 'complete', 'approved', 'success', 'done'])
            ? 'green'
            : 'blue';
    return `<span class="badge ${cls}">${esc(s)}</span>`;
  };

  const dirBadge = d =>
    `<span class="badge ${isInbound(d) ? 'blue' : 'green'}">${esc(d || '—')}</span>`;

  const metric = (label, valueHtml, small = false) =>
    `<div class="card metric"><small>${esc(label)}</small><strong${small ? ' style="font-size:13px"' : ''}>${valueHtml}</strong></div>`;

  const card = (title, inner) =>
    `<div class="card" style="margin-bottom:12px"><h3>${esc(title)}</h3>${inner}</div>`;

  const notice = html => `<div class="notice" style="margin-bottom:12px">${html}</div>`;

  const toolbar = note =>
    `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px">
       <span class="sub">${esc(note || '')}</span>
       <button class="btn" type="button" data-glime-refresh>↻ Refresh</button>
     </div>`;

  const tableHtml = (heads, rows, emptyText) => {
    const th = heads.map(h => `<th>${esc(h)}</th>`).join('');
    const body = rows.length
      ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${heads.length}">${esc(emptyText)}</td></tr>`;
    return `<div style="overflow:auto"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
  };

  const textCell = text =>
    `<div style="min-width:200px;max-width:420px;white-space:pre-wrap;word-break:break-word">${esc(text)}</div>`;

  const showing = (shown, total) =>
    total > shown ? `Showing latest ${nf(shown)} of ${nf(total)}` : `${nf(total)} total`;

  /* ---------- current client ---------- */

  function currentClientId() {
    const sub = $('detailSub')?.textContent || '';
    return sub.split('•')[0].trim() || null;
  }

  /* ---------- request sequencing (ignore stale results) ---------- */

  let viewSeq = 0;

  /* ---------- connections (secure RPC, no tokens) ---------- */

  let connCache = { at: 0, rows: null };
  let connInflight = null;

  function getConnections(force = false) {
    if (!force && connCache.rows && Date.now() - connCache.at < 30000) {
      return Promise.resolve({ rows: connCache.rows, error: null });
    }
    if (connInflight) return connInflight;

    connInflight = (async () => {
      try {
        const r = await sb.rpc('admin_client_connections_list');
        if (r.error) throw r.error;
        const rows = Array.isArray(r.data) ? r.data : [];
        connCache = { at: Date.now(), rows };
        return { rows, error: null };
      } catch (e) {
        return { rows: [], error: e };
      } finally {
        connInflight = null;
      }
    })();

    return connInflight;
  }

  /* ---------- tabs ---------- */

  function ensureTab(tabName, label, afterName = null) {
    const tabs = document.querySelector('#clientModal .tabs');
    const modalBox = document.querySelector('#clientModal .modalbox');
    if (!tabs || !modalBox) return null;

    let button = tabs.querySelector(`[data-tab="${tabName}"]`);
    let panel = $(`tab-${tabName}`);

    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'tab';
      panel.id = `tab-${tabName}`;
      panel.innerHTML = '<div class="sub">Loading…</div>';
      modalBox.appendChild(panel);
    }

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset.tab = tabName;
      button.textContent = label;

      const after = afterName ? tabs.querySelector(`[data-tab="${afterName}"]`) : null;
      if (after) after.insertAdjacentElement('afterend', button);
      else tabs.appendChild(button);

      button.addEventListener('click', () => {
        tabs.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        modalBox.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        button.classList.add('active');
        $(`tab-${tabName}`)?.classList.add('active');
      });
    }

    return panel;
  }

  function addFullTabs() {
    ensureTab('whatsapp-admin', 'WhatsApp', 'storage');
    ensureTab('instagram-admin', 'Instagram', 'whatsapp-admin');
    ensureTab('activity-admin', 'Activity', 'voice');
    ensureTab('audit', 'Audit', 'activity-admin');
    ensureTab('billing-admin', 'Billing Detail', 'billing');
  }

  function setLoadingAll() {
    [['tab-whatsapp-admin', 'WhatsApp'], ['tab-instagram-admin', 'Instagram'], ['tab-activity-admin', 'client activity']]
      .forEach(([id, label]) => {
        const p = $(id);
        if (p) p.innerHTML = `<div class="sub">Loading ${esc(label)}…</div>`;
      });
  }

  /* ---------- WhatsApp / Instagram (shared loader) ---------- */

  const CHANNELS = {
    whatsapp: {
      label: 'WhatsApp',
      panelId: 'tab-whatsapp-admin',
      convTable: 'whatsapp_conversations',
      convCols:
        'id,client_id,customer_id,lead_id,phone_number_id,customer_phone,customer_name,status,' +
        'active_specialist_module_slug,last_message_at,last_inbound_at,last_outbound_at,' +
        'last_message_preview,last_message_direction,created_at,updated_at',
      msgTable: 'whatsapp_messages',
      msgCols:
        'id,conversation_id,provider_message_id,direction,message_type,text_body,status,' +
        'sender_phone,recipient_phone,provider_timestamp,specialist_module_slug,created_at,updated_at',
      connKey: 'whatsapp',
      hasPreview: true,
      whoHead: 'Phone',
      convName: c => c.customer_name || c.customer_phone || '—',
      convWho: c => c.customer_phone || '—',
      msgWho: m => (isInbound(m.direction) ? m.sender_phone : m.recipient_phone),
      connFields: c => [
        ['Number', esc(c.display_phone_number || '—')],
        ['Verified name', esc(c.verified_name || '—')],
        ['Business', esc(c.business_name || '—')],
        ['Status', badge(c.status || '—')],
        ['Connected', esc(dt(c.connected_at))]
      ]
    },
    instagram: {
      label: 'Instagram',
      panelId: 'tab-instagram-admin',
      convTable: 'instagram_conversations',
      convCols:
        'id,client_id,instagram_user_id,instagram_thread_id,username,customer_id,lead_id,status,' +
        'active_specialist_module_slug,last_message_at,last_inbound_at,last_outbound_at,created_at,updated_at',
      msgTable: 'instagram_messages',
      msgCols:
        'id,conversation_id,provider_message_id,direction,message_type,text_body,status,' +
        'sender_instagram_user_id,recipient_instagram_user_id,provider_timestamp,specialist_module_slug,created_at,updated_at',
      connKey: 'instagram',
      hasPreview: false,
      whoHead: 'Instagram user ID',
      convName: c => (c.username ? '@' + c.username : c.instagram_user_id || '—'),
      convWho: c => c.instagram_user_id || '—',
      msgWho: m => (isInbound(m.direction) ? m.sender_instagram_user_id : m.recipient_instagram_user_id),
      connFields: c => [
        ['Account', esc(c.username ? '@' + c.username : '—')],
        ['Type', esc(c.account_type || '—')],
        ['Status', badge(c.status || '—')],
        ['Connected', esc(dt(c.connected_at))]
      ]
    }
  };

  function connectionCard(cfg, clientId, conns) {
    if (conns.error) {
      return notice(
        `${esc(cfg.label)} connection details could not be loaded.<br><small>${esc(conns.error.message || 'Access/read error')}</small>`
      );
    }
    const row = (conns.rows || []).find(r => r.client_id === clientId);
    const c = row ? row[cfg.connKey] : null;
    if (!c) {
      return card(`${cfg.label} Connection`, `<div class="sub">No ${esc(cfg.label)} connection found for this client.</div>`);
    }
    const kv = cfg.connFields(c)
      .map(([k, v]) => `<div><small>${esc(k)}</small><b>${v}</b></div>`)
      .join('');
    return card(`${cfg.label} Connection`, `<div class="kv">${kv}</div>`);
  }

  async function loadChannel(key, clientId, seq, force = false) {
    const cfg = CHANNELS[key];
    const panel = $(cfg.panelId);
    if (!panel) return;

    panel.innerHTML = `<div class="sub">Loading ${esc(cfg.label)} data…</div>`;

    const bindRefresh = () => {
      panel.querySelector('[data-glime-refresh]')
        ?.addEventListener('click', () => loadChannel(key, clientId, viewSeq, true));
    };

    try {
      const [conv, msg, open, conns] = await Promise.all([
        sb.from(cfg.convTable)
          .select(cfg.convCols, { count: 'exact' })
          .eq('client_id', clientId)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(LIMIT),
        sb.from(cfg.msgTable)
          .select(cfg.msgCols, { count: 'exact' })
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(LIMIT),
        sb.from(cfg.convTable)
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('status', 'open'),
        getConnections(force)
      ]);

      if (seq !== viewSeq) return;
      if (conv.error) throw conv.error;
      if (msg.error) throw msg.error;

      const conversations = conv.data || [];
      const messages = msg.data || [];
      const convTotal = conv.count ?? conversations.length;
      const msgTotal = msg.count ?? messages.length;
      const openCount = open.error ? '—' : nf(open.count);

      const nameById = new Map(conversations.map(c => [c.id, cfg.convName(c)]));

      const convRows = conversations.map(c => {
        const row = [
          esc(cfg.convName(c)),
          esc(cfg.convWho(c)),
          badge(c.status),
          esc(c.active_specialist_module_slug || '—'),
          esc(dt(c.last_message_at))
        ];
        if (cfg.hasPreview) {
          row.push(
            c.last_message_preview
              ? `${dirBadge(c.last_message_direction)} ${esc(clip(c.last_message_preview, 120))}`
              : '—'
          );
        }
        return row;
      });

      const convHeads = ['Customer', cfg.whoHead, 'Status', 'Specialist', 'Last message'];
      if (cfg.hasPreview) convHeads.push('Preview');

      const msgRows = messages.map(m => [
        esc(nameById.get(m.conversation_id) || msgWhoSafe(cfg, m)),
        dirBadge(m.direction),
        esc(m.message_type || '—'),
        textCell(m.text_body ? clip(m.text_body) : `[${m.message_type || 'message'}]`),
        badge(m.status),
        esc(dt(m.created_at || m.provider_timestamp))
      ]);

      panel.innerHTML = `
        ${toolbar(`${cfg.label}: conversations ${showing(conversations.length, convTotal)} · messages ${showing(messages.length, msgTotal)}`)}
        <div class="grid" style="margin-bottom:12px">
          ${metric('Conversations', nf(convTotal))}
          ${metric('Open conversations', openCount)}
          ${metric('Messages', nf(msgTotal))}
          ${metric('Latest message', esc(dt(messages[0]?.created_at || conversations[0]?.last_message_at)), true)}
        </div>
        ${connectionCard(cfg, clientId, conns)}
        ${card(`${cfg.label} Conversations`, tableHtml(convHeads, convRows, `No ${cfg.label} conversations found.`))}
        ${card(`${cfg.label} Messages`,
          tableHtml(['Customer', 'Direction', 'Type', 'Message', 'Status', 'Time'], msgRows, `No ${cfg.label} messages found.`))}
      `;
      bindRefresh();
    } catch (e) {
      if (seq !== viewSeq) return;
      console.error(`[GLIME ${cfg.label} client view]`, e);
      panel.innerHTML = `
        ${toolbar('')}
        <div class="notice">
          ${esc(cfg.label)} data could not be loaded.<br>
          <small>${esc(e.message || 'Access/read error')}</small>
        </div>`;
      bindRefresh();
    }
  }

  function msgWhoSafe(cfg, m) {
    return cfg.msgWho(m) || '—';
  }

  /* ---------- Activity ---------- */

  function summarize(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'string') return v;
    if (typeof v !== 'object') return String(v);
    try {
      return Object.entries(v)
        .slice(0, 6)
        .map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : val}`)
        .join(' · ');
    } catch (_) {
      return '';
    }
  }

  async function loadActivity(clientId, seq) {
    const panel = $('tab-activity-admin');
    if (!panel) return;

    panel.innerHTML = '<div class="sub">Loading client activity…</div>';

    const bindRefresh = () => {
      panel.querySelector('[data-glime-refresh]')
        ?.addEventListener('click', () => loadActivity(clientId, viewSeq));
    };

    try {
      const [events, requests, timeline] = await Promise.all([
        sb.from('client_action_events')
          .select('id,event_type,details,created_at', { count: 'exact' })
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(LIMIT),
        sb.from('client_action_requests')
          .select('id,intent,target_module_slug,target_action,target_label,status,risk_level,error_message,created_at,updated_at', { count: 'exact' })
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(LIMIT),
        sb.from('lead_timeline')
          .select('id,event_type,title,description,source,created_at', { count: 'exact' })
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(LIMIT)
      ]);

      if (seq !== viewSeq) return;

      const failed = [];
      const take = (res, label) => {
        if (res.error) {
          failed.push(`${label}: ${res.error.message || 'read error'}`);
          return [];
        }
        return res.data || [];
      };

      const eventRows = take(events, 'Client events');
      const requestRows = take(requests, 'Action requests');
      const timelineRows = take(timeline, 'Lead timeline');

      const merged = [
        ...eventRows.map(x => ({
          source: 'Client Event',
          action: x.event_type || 'event',
          status: '—',
          detail: summarize(x.details),
          at: x.created_at
        })),
        ...requestRows.map(x => ({
          source: 'Action Request',
          action: [x.intent, x.target_action].filter(Boolean).join(' → ') || 'request',
          status: x.status || '—',
          detail:
            x.error_message ||
            [x.target_label, x.target_module_slug, x.risk_level ? 'risk: ' + x.risk_level : '']
              .filter(Boolean).join(' · '),
          at: x.created_at || x.updated_at
        })),
        ...timelineRows.map(x => ({
          source: 'Lead Timeline',
          action: x.event_type || 'timeline',
          status: '—',
          detail: [x.title, x.description].filter(Boolean).join(' — ') || x.source || '',
          at: x.created_at
        }))
      ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

      const total = (events.error ? 0 : events.count ?? eventRows.length) +
        (requests.error ? 0 : requests.count ?? requestRows.length) +
        (timeline.error ? 0 : timeline.count ?? timelineRows.length);

      const rows = merged.map(x => [
        esc(dt(x.at)),
        esc(x.source),
        `<b>${esc(x.action)}</b>`,
        x.status === '—' ? '—' : badge(x.status),
        textCell(clip(x.detail || '—', 400))
      ]);

      panel.innerHTML = `
        ${toolbar(`Activity: latest ${nf(LIMIT)} per source`)}
        ${failed.length
          ? notice(`Some activity could not be read, so the numbers below may be incomplete.<br><small>${esc(failed.join(' | '))}</small>`)
          : ''}
        <div class="grid" style="margin-bottom:12px">
          ${metric('Client events', events.error ? '—' : nf(events.count ?? eventRows.length))}
          ${metric('Action requests', requests.error ? '—' : nf(requests.count ?? requestRows.length))}
          ${metric('Lead timeline', timeline.error ? '—' : nf(timeline.count ?? timelineRows.length))}
          ${metric('Total activity', nf(total))}
        </div>
        ${card('Activity Timeline',
          tableHtml(['Time', 'Source', 'Action', 'Status', 'Detail'], rows, 'No activity records found for this client.'))}
      `;
      bindRefresh();
    } catch (e) {
      if (seq !== viewSeq) return;
      console.error('[GLIME Activity client view]', e);
      panel.innerHTML = `
        ${toolbar('')}
        <div class="notice">
          Activity data could not be loaded.<br>
          <small>${esc(e.message || 'Access/read error')}</small>
        </div>`;
      bindRefresh();
    }
  }

  /* ---------- openClient wrapper (installed exactly once) ---------- */

  function wrapOpenClient() {
    if (window.__glimeFullViewWrapped) return true;

    const original = window.openClient;
    if (typeof original !== 'function') return false;

    const wrapped = async function (id) {
      /*
       * admin.html puts x.id inside a quoted onclick, so numeric ids arrive as
       * strings. Normalize them before calling the original function.
       */
      let normalized = id;
      if (typeof id === 'string' && /^\d+$/.test(id.trim())) {
        normalized = Number(id.trim());
      }

      const seq = ++viewSeq;
      addFullTabs();
      setLoadingAll();

      try {
        await original(normalized);
      } catch (e) {
        console.error('[GLIME client view]', e);
        return;
      }

      if (seq !== viewSeq) return; // another client was opened meanwhile

      addFullTabs();
      const clientId = currentClientId();
      if (!clientId) return;

      // Do not block the original open flow (or other addons) on these loads.
      loadChannel('whatsapp', clientId, seq);
      loadChannel('instagram', clientId, seq);
      loadActivity(clientId, seq);
    };

    wrapped.__glimeFullViewWrapper = true;
    wrapped.__glimeOriginal = original;
    window.openClient = wrapped;
    window.__glimeFullViewWrapped = true;
    return true;
  }

  function boot() {
    if (!wrapOpenClient()) {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        if (wrapOpenClient() || attempts >= 50) clearInterval(timer);
      }, 300);
    }

    addFullTabs();

    const modal = $('clientModal');
    if (modal) {
      // Class changes only (no subtree) so our own DOM edits never re-trigger this.
      new MutationObserver(() => {
        if (modal.classList.contains('open')) addFullTabs();
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
