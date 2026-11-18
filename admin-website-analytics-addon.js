/* =========================================================
   GLIME ADMIN — Website Analytics (Overview tab, last 24 hours)
   Frontend only. Reads the existing RPC website_analytics_admin_summary.

   Fixes in this version:
   - Uses the shared admin client (window.supabaseClient) instead of
     creating a second Supabase client.
   - Waits for admin login + 2FA, then loads by itself (the old version
     ran once at page load and stayed on "Admin 2FA required").
   - Auto-refreshes every minute while the Overview tab is open.
   - Shows average time on site and pages per session (already returned
     by the RPC / derivable) and a Top Pages list with share bars.
   - Clear loading, empty and error states; works on mobile.
========================================================= */
(() => {
  'use strict';

  const ID = 'glimeWebAnalytics';
  const STYLE_ID = 'glimeAnalyticsStyles';
  const REFRESH_MS = 60000;
  const PAGES_SHOWN = 10;

  let busy = false;
  let lastAttempt = 0;
  let loadedOnce = false;
  let showAll = false;
  let lastPages = [];

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
      #${ID} .wa-pages{margin-top:16px}
      #${ID} .wa-pages h4{margin:0 0 8px;font-size:.88rem;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:8px}
      #${ID} .wa-pages h4 small{color:#687587;font-weight:400;font-size:.7rem}
      #${ID} .wa-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:9px;overflow:hidden;font-size:.8rem;color:#dfe7ef}
      #${ID} .wa-row + .wa-row{margin-top:4px}
      #${ID} .wa-bar{position:absolute;left:0;top:0;bottom:0;background:rgba(34,211,238,.12);border-radius:9px;pointer-events:none}
      #${ID} .wa-name{position:relative;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${ID} .wa-val{position:relative;flex:none;color:#fff;font-weight:700}
      #${ID} .wa-val small{color:#687587;font-weight:400;margin-left:6px}
      #${ID} .wa-empty{padding:14px;border-radius:10px;border:1px dashed rgba(255,255,255,.14);color:#687587;font-size:.78rem;text-align:center}
      #${ID} .wa-more{margin-top:8px}
      @media(max-width:1000px){#${ID} .wa-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:640px){#${ID} .wa-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#${ID}{padding:13px}}
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
          <h3>Website Analytics — Last 24 Hours</h3>
          <div class="wa-status" id="waStatus">Waiting for admin login…</div>
        </div>
        <button class="wa-btn" id="waRefresh" type="button">↻ Refresh</button>
      </div>

      <div class="wa-grid">
        <div class="wa-kpi"><small>Visitors</small><b id="waVisitors">—</b><span>unique visitors</span></div>
        <div class="wa-kpi"><small>Sessions</small><b id="waSessions">—</b><span>visits in 24 hours</span></div>
        <div class="wa-kpi"><small>Online Now</small><b><i class="wa-live off" id="waLive"></i><em style="font-style:normal" id="waOnline">—</em></b><span>active in last 5 minutes</span></div>
        <div class="wa-kpi"><small>Page Views</small><b id="waPageViews">—</b><span id="waPerSession">&nbsp;</span></div>
        <div class="wa-kpi"><small>Avg. Time on Site</small><b id="waDuration">—</b><span>per session</span></div>
      </div>

      <div class="wa-pages">
        <h4>Top Pages <small id="waPagesNote"></small></h4>
        <div id="waPages"><div class="wa-empty">Loading…</div></div>
      </div>
    `;

    overview.appendChild(panel);

    $('waRefresh').addEventListener('click', () => load(true));
    $('waPages').addEventListener('click', (e) => {
      if (e.target.closest('[data-wa-more]')) {
        showAll = !showAll;
        renderPages(lastPages);
      }
    });

    const topRefresh = $('refreshBtn');
    if (topRefresh) topRefresh.addEventListener('click', () => load(true));

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

  /* ---------- render ---------- */
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

  /* ---------- boot ---------- */
  function tick() {
    if (!$(ID) && !addPanel()) return;
    if (document.hidden || !appVisible() || !overviewActive() || !getSb()) return;
    if (Date.now() - lastAttempt >= (loadedOnce ? REFRESH_MS : 5000)) load(false);
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
