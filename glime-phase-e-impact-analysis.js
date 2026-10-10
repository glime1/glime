/* GLIME Action Impact (Phase E — impact analysis)
 * READ-ONLY. Shows measured results of approved GLIME actions.
 * Never approves, executes or edits anything. Mounts only in
 * #glime-action-impact-slot and reuses window.supabaseClient.
 */
(() => {
  'use strict';

  const SLOT_ID = 'glime-action-impact-slot';
  const CARD_ID = 'glime-phase-e-impact-analysis';
  const LIMIT = 6;
  const BASE_COLUMNS =
    'id, execution_job_id, impact_status, baseline_metrics, after_metrics, metric_deltas, summary, measured_at, created_at';
  const EXTRA_COLUMNS = ', observation_until, selected_metrics';
  const TZ = 'Asia/Kolkata';

  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  // ---------- helpers ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const fmtNum = (v) => isNum(v) ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(v)) : '—';
  const fmtSigned = (v) => isNum(v) ? (Number(v) > 0 ? '+' : '') + fmtNum(v) : '—';
  const fmtPct = (v) => isNum(v) ? (Number(v) > 0 ? '+' : '') + Number(v).toFixed(1) + '%' : '—';

  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function humanize(key) {
    return String(key || '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase());
  }

  function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      return window.supabaseClient;
    }
    return null;
  }

  // ---------- data ----------
  function sortRows(rows) {
    const t = (v) => { const n = v ? new Date(v).getTime() : NaN; return Number.isNaN(n) ? null : n; };
    return rows.slice().sort((a, b) => {
      const am = t(a.measured_at), bm = t(b.measured_at);
      if (am !== null && bm === null) return -1;
      if (am === null && bm !== null) return 1;
      if (am !== null && bm !== null && am !== bm) return bm - am;
      return (t(b.created_at) || 0) - (t(a.created_at) || 0);
    });
  }

  async function loadImpact() {
    const sb = getClient();
    if (!sb) throw new Error('Supabase client unavailable.');

    const { data: auth, error: authError } = await sb.auth.getUser();
    if (authError || !auth?.user) return { rows: [], signedOut: true };

    const { data: client, error: clientError } = await sb
      .from('client_data').select('client_id').eq('auth_user_id', auth.user.id).maybeSingle();
    if (clientError) throw clientError;
    if (!client?.client_id) return { rows: [] };

    const run = (cols) => sb.from('client_action_impact_analysis').select(cols)
      .eq('client_id', client.client_id)
      .order('measured_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(LIMIT);

    let res = await run(BASE_COLUMNS + EXTRA_COLUMNS);
    // Optional columns may not exist in every environment: retry with the base set.
    if (res.error && (res.error.code === '42703' || /column/i.test(res.error.message || ''))) {
      res = await run(BASE_COLUMNS);
    }
    if (res.error) throw res.error;
    return { rows: sortRows(res.data || []) };
  }

  // ---------- render ----------
  function statusMeta(raw) {
    const s = String(raw || 'pending').toLowerCase();
    if (s === 'measured') return { cls: 'ok', label: 'Measured' };
    if (s === 'pending') return { cls: 'wait', label: 'Pending' };
    if (s === 'insufficient_data') return { cls: 'warn', label: 'Insufficient data' };
    return { cls: 'other', label: humanize(s) };
  }

  function metricKeys(row) {
    const keys = [];
    const add = (k) => { if (k && !keys.includes(k)) keys.push(k); };
    if (Array.isArray(row.selected_metrics)) row.selected_metrics.forEach(add);
    Object.keys(row.metric_deltas || {}).forEach(add);
    Object.keys(row.after_metrics || {}).forEach(add);
    Object.keys(row.baseline_metrics || {}).forEach(add);
    return keys.filter((k) => {
      const b = row.baseline_metrics?.[k], a = row.after_metrics?.[k];
      return (typeof b !== 'object' || b === null) && (typeof a !== 'object' || a === null);
    }).slice(0, 8);
  }

  function metricRow(row, key) {
    const before = row.baseline_metrics?.[key];
    const after = row.after_metrics?.[key];
    const d = row.metric_deltas?.[key];
    // Missing delta stays missing: never coerce to 0.
    const delta = d && isNum(d.delta) ? d.delta : (isNum(before) && isNum(after) ? Number(after) - Number(before) : null);
    const pct = d && isNum(d.percent_change) ? d.percent_change : null;
    const cls = delta === null ? '' : delta > 0 ? 'up' : delta < 0 ? 'down' : '';
    return `
      <div class="gei-m">
        <div class="gei-m-name">${esc(humanize(key))}</div>
        <div class="gei-m-flow"><span>${esc(fmtNum(before))}</span><i aria-hidden="true">→</i><b>${esc(fmtNum(after))}</b></div>
        <div class="gei-m-delta ${cls}">${esc(fmtSigned(delta))} <small>${esc(fmtPct(pct))}</small></div>
      </div>`;
  }

  function renderRow(row) {
    const meta = statusMeta(row.impact_status);
    const measured = String(row.impact_status || '').toLowerCase() === 'measured';
    const keys = metricKeys(row);
    let body = '';

    if (measured) {
      body = keys.length
        ? `<div class="gei-metrics">${keys.map((k) => metricRow(row, k)).join('')}</div>`
        : '<div class="gei-note">Measured, but no comparable metrics were stored.</div>';
      body += `<div class="gei-foot"><span>Measured ${esc(fmtDate(row.measured_at))}</span>
        <span class="gei-caveat">Observed change after the action — not proof that the action caused it.</span></div>`;
    } else if (meta.cls === 'warn') {
      body = `<div class="gei-note">There was not enough data to measure this action fairly.${
        row.observation_until ? ` Observation window ended ${esc(fmtDate(row.observation_until))}.` : ''}</div>`;
    } else if (meta.cls === 'wait') {
      body = `<div class="gei-note">Result not measured yet. ${
        row.observation_until ? `Expected after ${esc(fmtDate(row.observation_until))}.` : 'GLIME will measure it after the observation period.'}</div>`;
    } else {
      body = `<div class="gei-note">Status: ${esc(humanize(row.impact_status))}.</div>`;
    }

    return `
      <article class="gei-item ${meta.cls}">
        <header>
          <div class="gei-name">${esc(row.summary || 'Approved business action')}</div>
          <span class="gei-badge ${meta.cls}">${esc(meta.label)}</span>
        </header>
        ${body}
      </article>`;
  }

  function render(card, rows) {
    const list = card.querySelector('.gei-list');
    if (!rows.length) {
      list.innerHTML = '<div class="gei-empty">No action results yet. After an approved action runs, GLIME shows the observed change here.</div>';
      return;
    }
    list.innerHTML = rows.map(renderRow).join('');
  }

  // ---------- styles + mount ----------
  function injectStyles() {
    if (document.getElementById('glime-impact-style')) return;
    const s = document.createElement('style');
    s.id = 'glime-impact-style';
    s.textContent = `
      #${CARD_ID}{color:#e8eef5}
      #${CARD_ID} .gei-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:16px}
      #${CARD_ID} .gei-title{font-size:1.15rem;font-weight:700}
      #${CARD_ID} .gei-sub{color:#8b97a7;font-size:.82rem;margin-top:3px}
      #${CARD_ID} .gei-refresh{min-height:40px;padding:8px 14px;border-radius:10px;border:1px solid rgba(0,255,136,.35);background:rgba(0,255,136,.08);color:#00ff88;font:inherit;font-weight:700;font-size:.8rem;cursor:pointer}
      #${CARD_ID} .gei-refresh:hover{background:rgba(0,255,136,.16)}
      #${CARD_ID} .gei-refresh:focus-visible{outline:2px solid #00ff88;outline-offset:2px}
      #${CARD_ID} .gei-refresh:disabled{opacity:.6;cursor:progress}
      #${CARD_ID} .gei-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:14px}
      #${CARD_ID} .gei-item{padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:linear-gradient(160deg,rgba(255,255,255,.04),rgba(255,255,255,.01));transition:transform .18s ease,border-color .18s ease}
      #${CARD_ID} .gei-item:hover{transform:translateY(-3px);border-color:rgba(0,240,255,.28)}
      #${CARD_ID} .gei-item.ok{box-shadow:inset 0 1px 0 rgba(0,255,136,.25)}
      #${CARD_ID} .gei-item header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px}
      #${CARD_ID} .gei-name{font-weight:700;font-size:.92rem;line-height:1.4;overflow-wrap:anywhere}
      #${CARD_ID} .gei-badge{flex:0 0 auto;padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:800;border:1px solid transparent;white-space:nowrap}
      #${CARD_ID} .gei-badge.ok{color:#00ff88;background:rgba(0,255,136,.1);border-color:rgba(0,255,136,.3)}
      #${CARD_ID} .gei-badge.wait{color:#ffb454;background:rgba(255,180,84,.1);border-color:rgba(255,180,84,.3)}
      #${CARD_ID} .gei-badge.warn{color:#ff8291;background:rgba(255,130,145,.1);border-color:rgba(255,130,145,.3)}
      #${CARD_ID} .gei-badge.other{color:#9cabb9;background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12)}
      #${CARD_ID} .gei-metrics{display:grid;gap:8px}
      #${CARD_ID} .gei-m{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:9px 11px;border-radius:10px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.05)}
      #${CARD_ID} .gei-m-name{grid-column:1 / -1;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:#8b97a7}
      #${CARD_ID} .gei-m-flow{font-size:.88rem;color:#9cabb9}
      #${CARD_ID} .gei-m-flow b{color:#fff}
      #${CARD_ID} .gei-m-flow i{margin:0 6px;font-style:normal;color:#586577}
      #${CARD_ID} .gei-m-delta{font-weight:800;font-size:.9rem;text-align:right}
      #${CARD_ID} .gei-m-delta small{font-weight:600;color:#8b97a7;margin-left:3px}
      #${CARD_ID} .gei-m-delta.up{color:#00ff88}
      #${CARD_ID} .gei-m-delta.down{color:#ff8291}
      #${CARD_ID} .gei-foot{display:flex;flex-direction:column;gap:3px;margin-top:11px;font-size:.72rem;color:#8b97a7}
      #${CARD_ID} .gei-caveat{color:#6f7d90}
      #${CARD_ID} .gei-note,#${CARD_ID} .gei-empty,#${CARD_ID} .gei-error{padding:14px;border-radius:12px;font-size:.84rem;line-height:1.55;color:#9cabb9;background:rgba(0,0,0,.2);border:1px dashed rgba(255,255,255,.12)}
      #${CARD_ID} .gei-error{color:#ff8291;border-color:rgba(255,130,145,.35)}
      #${CARD_ID} .gei-empty{grid-column:1 / -1}
      @media (prefers-reduced-motion:reduce){#${CARD_ID} .gei-item{transition:none}#${CARD_ID} .gei-item:hover{transform:none}}`;
    document.head.appendChild(s);
  }

  function createCard() {
    const slot = document.getElementById(SLOT_ID);
    if (!slot) { console.error('GLIME Action Impact: slot #' + SLOT_ID + ' not found.'); return null; }
    let card = document.getElementById(CARD_ID);
    if (card) return card;
    card = document.createElement('section');
    card.id = CARD_ID;
    card.setAttribute('aria-label', 'GLIME Action Impact');
    card.innerHTML = `
      <div class="gei-head">
        <div>
          <div class="gei-title">🎯 GLIME Action Impact</div>
          <div class="gei-sub">Real results from approved GLIME actions</div>
        </div>
        <button type="button" class="gei-refresh">↻ Refresh</button>
      </div>
      <div class="gei-list" aria-live="polite"><div class="gei-empty">Loading impact data…</div></div>`;
    slot.appendChild(card);
    return card;
  }

  async function load(card) {
    const btn = card.querySelector('.gei-refresh');
    const list = card.querySelector('.gei-list');
    btn.disabled = true;
    try {
      const { rows, signedOut } = await loadImpact();
      if (signedOut) { list.innerHTML = '<div class="gei-empty">Please sign in to see action impact.</div>'; return; }
      render(card, rows);
    } catch (e) {
      console.error('GLIME Action Impact:', e);
      list.innerHTML = '<div class="gei-error" role="alert">Action impact could not be loaded right now. Please try Refresh.</div>';
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    injectStyles();
    const card = createCard();
    if (!card) return;
    card.querySelector('.gei-refresh').addEventListener('click', () => load(card));
    load(card);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
