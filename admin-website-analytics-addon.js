/* =========================================================
   GLIME ADMIN — Website Analytics (Overview tab)
   Frontend only. Reads two existing admin RPCs:
   - website_analytics_admin_summary()      -> last 24 hours numbers + top pages
   - website_analytics_admin_sources(hours) -> where visitors came from

   - Uses the shared admin client (window.supabaseClient).
   - Waits for admin login + 2FA, loads by itself, refreshes every minute.
   - "Where Visitors Come From": Google, Instagram, Facebook, WhatsApp,
     YouTube, Direct, other websites... with people + sessions each.
   - Also: campaigns (UTM), referrer sites, landing pages, devices,
     browsers, OS, countries, cities, conversions.
   - Range: 24 hours / 7 days / 30 days (sources section).
========================================================= */
(() => {
  'use strict';

  const ID = 'glimeWebAnalytics';
  const STYLE_ID = 'glimeAnalyticsStyles';
  const REFRESH_MS = 60000;
  const PAGES_SHOWN = 10;
  const BLOCK_ROWS = 8;
  const RANGES = [
    [24, '24 hours'],
    [168, '7 days'],
    [720, '30 days']
  ];
  const ICONS = {
    Google: '🔎',
    Instagram: '📷',
    Facebook: '👥',
    WhatsApp: '💬',
    YouTube: '▶️',
    LinkedIn: '💼',
    'X (Twitter)': '✖️',
    Telegram: '✈️',
    'Other search engines': '🔎',
    'Other websites': '🔗',
    Direct: '⌨️',
    Unknown: '❔',
    Other: '•'
  };

  let busy = false;
  let busySrc = false;
  let lastAttempt = 0;
  let loadedOnce = false;
  let srcLoadedOnce = false;
  let showAll = false;
  let lastPages = [];
  let srcHours = 24;

  const $ = (id) => document.getElementById(id);

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const num = (value) => Number(value || 0).toLocaleString('en-IN');

  const getSb = () =>
    window.supabaseClient && typeof window.supabaseClient.rpc === 'function'
      ? window.supabaseClient
      : null;

  const appVisible = () => {
    const app = $('app');
    return !!app && !app.classList.contains('hidden');
  };

  const overviewActive = () => {
    const view = $('view-overview');
    return !!view && view.classList.contains('active');
  };

  function duration(seconds) {
    const s = Math.round(Number(seconds) || 0);
    if (s <= 0) return '0s';
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (!m) return r + 's';
    return r ? m + 'm ' + r + 's' : m + 'm';
  }

  function cap(text) {
    const s = String(text || '');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function countryName(code) {
    const c = String(code || '').trim();
    if (!c || c === 'Unknown') return 'Unknown';
    try {
      if (c.length === 2 && typeof Intl !== 'undefined' && Intl.DisplayNames) {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(c.toUpperCase()) || c;
      }
    } catch (_) {}
    return c;
  }

  function rangeLabel(hours) {
    const found = RANGES.find((r) => r[0] === hours);
    return found ? found[1] : hours + ' hours';
  }

  /* ---------- styles ---------- */
  function addStyles() {
    if ($(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ID}{margin-top:14px;padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02)}
      #${ID} .wa-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px}
      #${ID} .wa-head h3{margin:0;font-size:1rem;color:#fff}
      #${ID} .wa-status{margin-top:3px;color:#687587;font-size:.72rem}
      #${ID} .wa-status.err{color:#ff5263}
      #${ID} .wa-btn{border:0;border-radius:9px;padding:8px 13px;font:700 .74rem system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.09);color:#fff;white-space:nowrap}
      #${ID} .wa-btn:disabled{opacity:.55;cursor:default}
      #${ID} .wa-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
      #${ID} .wa-kpi{padding:13px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.02);min-width:0}
      #${ID} .wa-kpi small{display:block;color:#9ba7b7;font-size:.72rem}
      #${ID} .wa-kpi b{display:block;color:#fff;font-size:1.5rem;margin:4px 0 2px;line-height:1.15}
      #${ID} .wa-kpi span{display:block;color:#687587;font-size:.68rem}
      #${ID} .wa-live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#00ff88;margin-right:6px;box-shadow:0 0 0 0 rgba(0,255,136,.6);animation:waPulse 1.8s infinite}
      #${ID} .wa-live.off{background:#687587;animation:none;box-shadow:none}
      @keyframes waPulse{0%{box-shadow:0 0 0 0 rgba(0,255,136,.55)}70%{box-shadow:0 0 0 8px rgba(0,255,136,0)}100%{box-shadow:0 0 0 0 rgba(0,255,136,0)}}
      #${ID} .wa-pages,#${ID} .wa-src{margin-top:18px}
      #${ID} h4{margin:0 0 8px;font-size:.88rem;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
      #${ID} h4 small{color:#687587;font-weight:400;font-size:.7rem}
      #${ID} .wa-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:9px;overflow:hidden;font-size:.8rem;color:#dfe7ef}
      #${ID} .wa-row + .wa-row{margin-top:4px}
      #${ID} .wa-bar{position:absolute;left:0;top:0;bottom:0;background:rgba(34,211,238,.12);border-radius:9px;pointer-events:none}
      #${ID} .wa-name{position:relative;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ID} .wa-name small{display:block;color:#687587;font-size:.66rem;overflow:hidden;text-overflow:ellipsis}
      #${ID} .wa-val{position:relative;flex:none;color:#fff;font-weight:700}
      #${ID} .wa-val small{color:#687587;font-weight:400;margin-left:6px}
      #${ID} .wa-empty{padding:14px;border-radius:10px;border:1px dashed rgba(255,255,255,.14);color:#687587;font-size:.78rem;text-align:center}
      #${ID} .wa-more{margin-top:8px}
      #${ID} .wa-pills{display:flex;gap:6px;flex-wrap:wrap}
      #${ID} .wa-pill{border:1px solid rgba(255,255,255,.12);background:transparent;color:#9ba7b7;border-radius:999px;padding:5px 12px;font:700 .72rem system-ui,sans-serif;cursor:pointer}
      #${ID} .wa-pill.on{background:rgba(34,211,238,.15);border-color:rgba(34,211,238,.5);color:#22d3ee}
      #${ID} .wa-note{margin:2px 0 10px;color:#9ba7b7;font-size:.74rem}
      #${ID} .wa-warn{margin:0 0 10px;padding:9px 11px;border-radius:9px;background:rgba(255,200,87,.08);border:1px solid rgba(255,200,87,.25);color:#ffc857;font-size:.72rem;line-height:1.45}
      #${ID} .wa-ch{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border-radius:11px;overflow:hidden;border:1px solid rgba(255,255,255,.07)}
      #${ID} .wa-ch + .wa-ch{margin-top:6px}
      #${ID} .wa-ch .wa-name{white-space:normal;color:#fff;font-size:.86rem;font-weight:700}
      #${ID} .wa-ch .wa-name small{white-space:normal;font-weight:400;margin-top:2px}
      #${ID} .wa-ch .wa-val{text-align:right;font-size:1.35rem;line-height:1.1}
      #${ID} .wa-ch .wa-val small{display:block;margin:2px 0 0;font-size:.66rem}
      #${ID} .wa-blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-top:16px}
      #${ID} .wa-block{padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.015);min-width:0}
      #${ID} .wa-block h5{margin:0 0 8px;font-size:.78rem;color:#fff}
      #${ID} .wa-block .wa-empty{padding:10px;font-size:.72rem}
      @media(max-width:1000px){#${ID} .wa-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:640px){#${ID} .wa-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#${ID}{padding:13px}#${ID} .wa-blocks{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  /* ---------- panel ---------- */
  function addPanel() {
    if ($(ID)) return true;

    const overview = $('view-overview');
    if (!overview) return false;

    addStyles();

    const panel = document.createElement('div');
    panel.id = ID;
    panel.innerHTML = `
      <div class="wa-head">
        <div>
          <h3>Website Analytics</h3>
          <div class="wa-status" id="waStatus">Waiting for admin login…</div>
        </div>
        <button class="wa-btn" id="waRefresh" type="button">↻ Refresh</button>
      </div>

      <div class="wa-grid">
        <div class="wa-kpi"><small>Visitors</small><b id="waVisitors">—</b><span>unique, last 24 hours</span></div>
        <div class="wa-kpi"><small>Sessions</small><b id="waSessions">—</b><span>visits in 24 hours</span></div>
        <div class="wa-kpi"><small>Online Now</small><b><i class="wa-live off" id="waLive"></i><em style="font-style:normal" id="waOnline">—</em></b><span>active in last 5 minutes</span></div>
        <div class="wa-kpi"><small>Page Views</small><b id="waPageViews">—</b><span id="waPerSession">&nbsp;</span></div>
        <div class="wa-kpi"><small>Avg. Time on Site</small><b id="waDuration">—</b><span>per session</span></div>
      </div>

      <div class="wa-src">
        <h4>
          <span>Where Visitors Come From</span>
          <span class="wa-pills" id="waRange">${RANGES.map(
            (r) => `<button type="button" class="wa-pill${r[0] === srcHours ? ' on' : ''}" data-h="${r[0]}">${r[1]}</button>`
          ).join('')}</span>
        </h4>
        <div class="wa-note" id="waSrcSummary"></div>
        <div id="waChannels"><div class="wa-empty">Loading…</div></div>
        <div class="wa-blocks" id="waBlocks"></div>
      </div>

      <div class="wa-pages">
        <h4><span>Top Pages <small>(last 24 hours)</small></span> <small id="waPagesNote"></small></h4>
        <div id="waPages"><div class="wa-empty">Loading…</div></div>
      </div>
    `;

    overview.appendChild(panel);

    $('waRefresh').addEventListener('click', () => refreshAll(true));

    $('waPages').addEventListener('click', (e) => {
      if (e.target.closest('[data-wa-more]')) {
        showAll = !showAll;
        renderPages(lastPages);
      }
    });

    $('waRange').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-h]');
      if (!btn) return;
      const hours = Number(btn.dataset.h);
      if (!hours || hours === srcHours) return;
      srcHours = hours;
      document.querySelectorAll('#waRange .wa-pill').forEach((p) => {
        p.classList.toggle('on', Number(p.dataset.h) === srcHours);
      });
      loadSources(true);
    });

    const topRefresh = $('refreshBtn');
    if (topRefresh) topRefresh.addEventListener('click', () => refreshAll(true));

    return true;
  }

  function setStatus(text, isError) {
    const el = $('waStatus');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('err', !!isError);
  }

  function friendlyError(error) {
    const message = String((error && error.message) || error || '');
    if (/AAL2|2FA/i.test(message)) {
      return 'Admin 2FA verification is required. Sign in with 2FA, then press Refresh.';
    }
    if (/JWT|expired|not authenticated|session/i.test(message)) {
      return 'Admin session expired. Sign in again, then press Refresh.';
    }
    return 'Analytics could not be loaded: ' + (message || 'unknown error');
  }

  /* ---------- render: summary + top pages ---------- */
  function renderPages(pages) {
    const box = $('waPages');
    const note = $('waPagesNote');
    if (!box) return;

    if (!pages.length) {
      box.innerHTML = '<div class="wa-empty">No page views in the last 24 hours yet.</div>';
      if (note) note.textContent = '';
      return;
    }

    const total = pages.reduce((t, p) => t + p.views, 0);
    const max = Math.max(1, pages[0].views);
    const visible = showAll ? pages : pages.slice(0, PAGES_SHOWN);

    box.innerHTML =
      visible
        .map((p) => {
          const width = Math.max(2, Math.round((p.views / max) * 100));
          const share = total ? Math.round((p.views / total) * 100) : 0;
          return `<div class="wa-row">
            <i class="wa-bar" style="width:${width}%"></i>
            <span class="wa-name" title="${esc(p.page)}">${esc(p.page)}</span>
            <span class="wa-val">${num(p.views)}<small>${share}%</small></span>
          </div>`;
        })
        .join('') +
      (pages.length > PAGES_SHOWN
        ? `<button class="wa-btn wa-more" type="button" data-wa-more>${
            showAll ? 'Show top ' + PAGES_SHOWN : 'Show all ' + pages.length + ' pages'
          }</button>`
        : '');

    if (note) note.textContent = pages.length + ' page' + (pages.length === 1 ? '' : 's');
  }

  function render(data) {
    const visitors = Number(data.visitors_24h) || 0;
    const sessions = Number(data.sessions_24h) || 0;
    const online = Number(data.online_now) || 0;
    const views = Number(data.page_views_24h) || 0;

    $('waVisitors').textContent = num(visitors);
    $('waSessions').textContent = num(sessions);
    $('waOnline').textContent = num(online);
    $('waLive').classList.toggle('off', online === 0);
    $('waPageViews').textContent = num(views);
    $('waPerSession').innerHTML = sessions
      ? (views / sessions).toFixed(1) + ' pages per session'
      : '&nbsp;';
    $('waDuration').textContent = sessions ? duration(data.avg_duration_seconds) : '—';

    lastPages = (Array.isArray(data.pages) ? data.pages : [])
      .map((p) => ({ page: String((p && p.page) || '/'), views: Number(p && p.views) || 0 }))
      .filter((p) => p.views > 0)
      .sort((a, b) => b.views - a.views);

    renderPages(lastPages);
  }

  /* ---------- render: traffic sources ---------- */
  function listBlock(title, rows, emptyText) {
    const items = (rows || []).slice(0, BLOCK_ROWS);
    const max = Math.max(1, ...items.map((r) => r.value));
    const body = items.length
      ? items
          .map((r) => {
            const width = Math.max(2, Math.round((r.value / max) * 100));
            return `<div class="wa-row">
              <i class="wa-bar" style="width:${width}%"></i>
              <span class="wa-name" title="${esc(r.label)}">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
              <span class="wa-val">${num(r.value)}</span>
            </div>`;
          })
          .join('')
      : `<div class="wa-empty">${esc(emptyText || 'No data yet')}</div>`;
    return `<div class="wa-block"><h5>${esc(title)}</h5>${body}</div>`;
  }

  function renderSources(data) {
    const channelsBox = $('waChannels');
    const blocksBox = $('waBlocks');
    const summary = $('waSrcSummary');
    if (!channelsBox || !blocksBox) return;

    const total = Number(data.total_sessions) || 0;
    const people = Number(data.total_visitors) || 0;
    const tracked = Number(data.tracked_sessions) || 0;
    const paid = Number(data.paid_sessions) || 0;
    const label = rangeLabel(Number(data.hours) || srcHours);

    if (summary) {
      summary.textContent =
        num(people) + ' people · ' + num(total) + ' sessions in the last ' + label +
        (paid ? ' · ' + num(paid) + ' from ad clicks' : '');
    }

    const channels = (Array.isArray(data.channels) ? data.channels : []).map((c) => ({
      channel: String(c.channel || 'Other'),
      sessions: Number(c.sessions) || 0,
      visitors: Number(c.visitors) || 0,
      avg: Number(c.avg_seconds) || 0
    }));

    if (!channels.length) {
      channelsBox.innerHTML = '<div class="wa-empty">No visits in the last ' + esc(label) + ' yet.</div>';
    } else {
      const max = Math.max(1, ...channels.map((c) => c.sessions));
      const unknown = channels.find((c) => c.channel === 'Unknown');

      channelsBox.innerHTML =
        (unknown && unknown.sessions && tracked < total
          ? `<div class="wa-warn">${num(unknown.sessions)} of ${num(total)} sessions have no source saved (recorded by the older tracker before source tracking was added). Source, device and location are recorded for new visits only.</div>`
          : '') +
        channels
          .map((c) => {
            const width = Math.max(2, Math.round((c.sessions / max) * 100));
            const share = total ? Math.round((c.sessions / total) * 100) : 0;
            const name = c.channel === 'Unknown' ? 'Source not recorded' : c.channel;
            return `<div class="wa-ch">
              <i class="wa-bar" style="width:${width}%"></i>
              <span class="wa-name">${ICONS[c.channel] || '•'} ${esc(name)}<small>${num(c.sessions)} session${c.sessions === 1 ? '' : 's'} · ${share}% · avg ${esc(duration(c.avg))}</small></span>
              <span class="wa-val">${num(c.visitors)}<small>people</small></span>
            </div>`;
          })
          .join('');
    }

    const arr = (v) => (Array.isArray(v) ? v : []);

    blocksBox.innerHTML = [
      listBlock(
        'Campaigns (UTM)',
        arr(data.campaigns).map((r) => ({
          label: r.campaign,
          sub: (r.source || '') + ' / ' + (r.medium || ''),
          value: Number(r.sessions) || 0
        })),
        'No UTM campaign links used yet'
      ),
      listBlock(
        'Referrer sites',
        arr(data.referrers).map((r) => ({ label: r.host, value: Number(r.sessions) || 0 })),
        'No referring websites yet'
      ),
      listBlock(
        'Landing pages',
        arr(data.landing_pages).map((r) => ({ label: r.page, value: Number(r.sessions) || 0 }))
      ),
      listBlock(
        'Countries',
        arr(data.countries).map((r) => ({ label: countryName(r.name), value: Number(r.sessions) || 0 }))
      ),
      listBlock(
        'Cities',
        arr(data.cities).map((r) => ({
          label: [r.city, r.region].filter(Boolean).join(', '),
          sub: countryName(r.country),
          value: Number(r.sessions) || 0
        }))
      ),
      listBlock(
        'Devices',
        arr(data.devices).map((r) => ({ label: cap(r.name), value: Number(r.sessions) || 0 }))
      ),
      listBlock(
        'Browsers',
        arr(data.browsers).map((r) => ({ label: cap(r.name), value: Number(r.sessions) || 0 }))
      ),
      listBlock(
        'Operating systems',
        arr(data.os).map((r) => ({ label: cap(r.name), value: Number(r.sessions) || 0 }))
      ),
      listBlock(
        'Conversions',
        arr(data.conversions).map((r) => ({ label: r.name, value: Number(r.count) || 0 })),
        'No conversion events yet'
      )
    ].join('');
  }

  /* ---------- load ---------- */
  async function load(manual) {
    if (busy) return;

    const sb = getSb();
    if (!sb || !appVisible() || !$(ID)) return;

    busy = true;
    lastAttempt = Date.now();

    const btn = $('waRefresh');
    if (btn) btn.disabled = true;
    if (manual || !loadedOnce) setStatus('Loading…', false);

    try {
      const result = await sb.rpc('website_analytics_admin_summary');
      if (result.error) throw result.error;

      render(result.data || {});
      loadedOnce = true;
      setStatus('Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · refreshes every minute', false);
    } catch (error) {
      console.error('GLIME website analytics:', error);
      setStatus(friendlyError(error), true);
      if (!loadedOnce) {
        const box = $('waPages');
        if (box) box.innerHTML = '<div class="wa-empty">Could not load analytics. Press Refresh to try again.</div>';
      }
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  async function loadSources(manual) {
    if (busySrc) return;

    const sb = getSb();
    if (!sb || !appVisible() || !$(ID)) return;

    busySrc = true;
    const requested = srcHours;

    if (manual || !srcLoadedOnce) {
      const box = $('waChannels');
      if (box && !srcLoadedOnce) box.innerHTML = '<div class="wa-empty">Loading…</div>';
    }

    try {
      const result = await sb.rpc('website_analytics_admin_sources', { p_hours: requested });
      if (result.error) throw result.error;

      // The range may have been changed while this request was running.
      if (requested === srcHours) {
        renderSources(result.data || {});
        srcLoadedOnce = true;
      }
    } catch (error) {
      console.error('GLIME website analytics sources:', error);
      if (!srcLoadedOnce) {
        const box = $('waChannels');
        if (box) box.innerHTML = '<div class="wa-empty">' + esc(friendlyError(error)) + '</div>';
      }
    } finally {
      busySrc = false;
      // Range was switched during the request: load the newly chosen range.
      if (requested !== srcHours) loadSources(true);
    }
  }

  function refreshAll(manual) {
    load(manual);
    loadSources(manual);
  }

  /* ---------- boot ---------- */
  function tick() {
    if (!$(ID) && !addPanel()) return;
    if (document.hidden || !appVisible() || !overviewActive() || !getSb()) return;
    if (Date.now() - lastAttempt >= (loadedOnce ? REFRESH_MS : 5000)) refreshAll(false);
  }

  function init() {
    if (!addPanel()) {
      // Overview section not in the page yet: try again shortly.
      let tries = 0;
      const wait = setInterval(() => {
        tries += 1;
        if (addPanel() || tries > 30) clearInterval(wait);
      }, 500);
    }
    setInterval(tick, 2000);
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
