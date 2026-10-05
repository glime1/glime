(() => {
'use strict';

/* =========================================================
   GLIME ORDERS — frontend over the frozen Orders RPC contract
   - list      : get_orders
   - summary   : get_order_summary
   - detail    : get_order_detail
   - create    : create_order
   - edit      : update_order (only allowed fields)
   - status    : transition_order (backend is the authority)
   - shipment  : upsert_order_fulfilment
   - approvals : create_order_action_request /
                 approve_client_business_action / reject_client_business_action
   No direct UPDATE of orders / payments / fulfilment.
   ========================================================= */

const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'k-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const title = (s) => String(s || '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());

/* ---------- formatters (single place) ---------- */
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
function money(v, cur) {
  const n = Number(v || 0);
  if (cur && cur !== 'INR') { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur }).format(n); } catch (e) { /* fall through */ } }
  return INR.format(n);
}
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtShort(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

/* ---------- centralized status configuration ---------- */
const ORDER_STATUS = {
  draft:            { label: 'Draft',                icon: '📝', tone: 'neutral', desc: 'Order is saved but not yet submitted.',                  next: ['new', 'pending_confirmation', 'confirmed', 'cancelled', 'on_hold'] },
  new:              { label: 'New',                  icon: '🆕', tone: 'info',    desc: 'New order waiting to be reviewed.',                       next: ['pending_confirmation', 'confirmed', 'cancelled', 'on_hold'] },
  pending_confirmation: { label: 'Pending Confirmation', icon: '⏳', tone: 'warn', desc: 'Waiting for the customer to confirm.',                 next: ['confirmed', 'payment_pending', 'cancelled', 'on_hold'] },
  confirmed:        { label: 'Confirmed',            icon: '✅', tone: 'info',    desc: 'Order is confirmed.',                                     next: ['payment_pending', 'processing', 'ready_to_ship', 'cancel_requested', 'cancelled', 'on_hold'] },
  payment_pending:  { label: 'Payment Pending',      icon: '💳', tone: 'warn',    desc: 'Waiting for payment.',                                    next: ['confirmed', 'payment_failed', 'cancelled', 'on_hold'] },
  payment_failed:   { label: 'Payment Failed',       icon: '⚠',  tone: 'bad',     desc: 'Payment did not go through.',                             next: ['payment_pending', 'cancelled', 'on_hold'] },
  processing:       { label: 'Processing',           icon: '⚙',  tone: 'info',    desc: 'Order is being prepared.',                                next: ['ready_to_ship', 'cancel_requested', 'on_hold'] },
  ready_to_ship:    { label: 'Ready to Ship',        icon: '📦', tone: 'purple',  desc: 'Packed and ready for the courier.',                       next: ['shipped', 'cancel_requested', 'on_hold'] },
  shipped:          { label: 'Shipped',              icon: '🚚', tone: 'purple',  desc: 'On the way to the customer.',                            next: ['out_for_delivery', 'delivered', 'completed', 'on_hold'] },
  out_for_delivery: { label: 'Out for Delivery',     icon: '🛵', tone: 'purple',  desc: 'Will reach the customer today.',                          next: ['delivered', 'on_hold'] },
  delivered:        { label: 'Delivered',            icon: '✓',  tone: 'good',    desc: 'Delivered to the customer.',                              next: ['completed', 'return_requested'] },
  completed:        { label: 'Completed',            icon: '🏁', tone: 'good',    desc: 'Order is complete.',                                      next: ['return_requested'] },
  cancel_requested: { label: 'Cancel Requested',     icon: '✋', tone: 'warn',    desc: 'A cancellation is waiting for a decision.',               next: ['cancelled', 'processing', 'on_hold'] },
  cancelled:        { label: 'Cancelled',            icon: '✕',  tone: 'bad',     desc: 'This order was cancelled.',                               next: [] },
  return_requested: { label: 'Return Requested',     icon: '↩',  tone: 'warn',    desc: 'Customer asked to return this order.',                    next: ['returned', 'cancelled', 'on_hold'] },
  returned:         { label: 'Returned',             icon: '↩',  tone: 'neutral', desc: 'Items came back.',                                        next: ['refunded', 'completed'] },
  refunded:         { label: 'Refunded',             icon: '₹',  tone: 'neutral', desc: 'Payment was refunded.',                                   next: [] },
  on_hold:          { label: 'On Hold',              icon: '⏸',  tone: 'warn',    desc: 'Paused until you resume it.',                             next: ['pending_confirmation', 'confirmed', 'payment_pending', 'processing', 'ready_to_ship', 'cancel_requested', 'cancelled'] }
};
const PAY_STATUS = {
  not_required:       { label: 'No Payment Needed', icon: '–', tone: 'neutral' },
  pending:            { label: 'Payment Pending',   icon: '⏳', tone: 'warn' },
  processing:         { label: 'Payment Processing', icon: '⚙', tone: 'info' },
  paid:               { label: 'Paid',              icon: '✓', tone: 'good' },
  partially_paid:     { label: 'Part Paid',         icon: '◐', tone: 'warn' },
  failed:             { label: 'Payment Failed',    icon: '⚠', tone: 'bad' },
  refunded:           { label: 'Refunded',          icon: '↩', tone: 'neutral' },
  partially_refunded: { label: 'Part Refunded',     icon: '↩', tone: 'neutral' }
};
const FUL_STATUS = {
  unfulfilled: 'Not Fulfilled', processing: 'Processing', ready_to_ship: 'Ready to Ship', in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery', fulfilled: 'Fulfilled', exception: 'Delivery Problem', cancelled: 'Cancelled'
};
const CHANNEL = {
  whatsapp: { label: 'WhatsApp', icon: '🟢' }, instagram: { label: 'Instagram', icon: '🟣' }, website: { label: 'Website', icon: '🔵' },
  voice: { label: 'Voice', icon: '🎙' }, manual: { label: 'Manual', icon: '✍' }, api: { label: 'API', icon: '⚡' }, other: { label: 'Other', icon: '⚪' }
};
const RISK = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const RISK_TONE = { low: 'good', medium: 'warn', high: 'bad', critical: 'bad' };

/* labels for the logical next actions */
const ACT = {
  new: { label: 'Mark as New' }, pending_confirmation: { label: 'Ask for Confirmation' }, confirmed: { label: 'Confirm Order' },
  payment_pending: { label: 'Mark Payment Pending' }, payment_failed: { label: 'Mark Payment Failed' }, processing: { label: 'Start Processing' },
  ready_to_ship: { label: 'Mark Ready to Ship' }, shipped: { label: 'Mark Shipped' }, out_for_delivery: { label: 'Out for Delivery' },
  delivered: { label: 'Mark Delivered' }, completed: { label: 'Mark Completed' },
  cancel_requested: { label: 'Request Cancellation', danger: true, reason: true },
  cancelled: { label: 'Cancel Order', danger: true, reason: true },
  return_requested: { label: 'Request Return', danger: true },
  returned: { label: 'Mark Returned', danger: true },
  on_hold: { label: 'Put on Hold', reason: true, confirm: true }
};
const PRIMARY_ORDER = ['confirmed', 'processing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'completed', 'pending_confirmation', 'payment_pending', 'new', 'returned'];
const NEEDS_ACTION = ['new', 'pending_confirmation', 'payment_failed', 'cancel_requested', 'return_requested', 'on_hold'];

const TABS = {
  all: { label: 'All' },
  needs: { label: 'Needs Action', needs: true },
  payment: { label: 'Payment', statuses: ['payment_pending', 'payment_failed'] },
  processing: { label: 'Processing', statuses: ['confirmed', 'processing'] },
  shipping: { label: 'Shipping', statuses: ['ready_to_ship', 'shipped', 'out_for_delivery'] },
  delivered: { label: 'Delivered', statuses: ['delivered', 'completed'] },
  cancelled: { label: 'Cancelled', statuses: ['cancelled', 'cancel_requested'] }
};

const badge = (cfg, cls = '') => cfg ? `<span class="badge t-${cfg.tone} ${cls}"><span aria-hidden="true">${cfg.icon}</span>${esc(cfg.label)}</span>` : '';
const stBadge = (s, cls) => badge(ORDER_STATUS[s] || { label: title(s), icon: '•', tone: 'neutral' }, cls);
const payBadge = (s, cls) => badge(PAY_STATUS[s] || { label: title(s || 'unknown'), icon: '•', tone: 'neutral' }, cls);
const chBadge = (c) => { const x = CHANNEL[c] || CHANNEL.other; return `<span class="badge t-neutral"><span aria-hidden="true">${x.icon}</span>${esc(x.label)}</span>`; };

/* ---------- friendly errors (raw errors go to console only) ---------- */
function friendly(e) {
  console.error('[GLIME Orders]', e);
  const m = String(e?.message || e || '');
  if (/INVALID_STATUS_TRANSITION/.test(m)) return 'This status change is not allowed right now. The order has been refreshed.';
  if (/ORDER_NOT_FOUND/.test(m)) return 'This order could not be found.';
  if (/AUTH_REQUIRED|JWT|not authenticated/i.test(m)) return 'Your session expired. Please sign in again.';
  if (/ACTION_REQUEST_INVALID/.test(m)) return 'This approval is no longer valid.';
  if (/CLIENT_NOT_FOUND/.test(m)) return 'Your workspace could not be found.';
  if (/duplicate|idempot/i.test(m)) return 'This order was already submitted.';
  if (/network|fetch/i.test(m)) return 'Network problem. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}
async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}

/* ---------- state ---------- */
const S = {
  clientId: '', tab: 'all', search: '', filters: { status: '', payment: '', fulfilment: '', channel: '', from: '', to: '' },
  rows: [], offset: 0, size: 50, hasMore: false, listState: 'loading', listReq: 0,
  summary: null, detailId: null, detail: null, actions: [], detailState: 'idle', busy: false, co: null, offers: []
};

/* ---------- toast ---------- */
let toastT;
function toast(msg, bad) {
  const el = $('toast'); el.textContent = msg; el.classList.toggle('bad', !!bad); el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- sheets & modal ---------- */
let lastFocus = null;
function openSheet({ title: t, html, full, onMount }) {
  closeSheet(true);
  lastFocus = document.activeElement;
  const root = $('sheetRoot');
  root.innerHTML = `<div class="scrim" data-act="close-sheet"></div><section class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(t)}"><header class="sheet-head"><h2>${esc(t)}</h2><button class="icon-btn" type="button" data-act="close-sheet" aria-label="Close">✕</button></header><div class="sheet-body" id="sheetBody">${html}</div></section>`;
  root.hidden = false; document.body.classList.add('lock');
  if (onMount) onMount($('sheetBody'));
  const f = root.querySelector('input:not([type=hidden]),select,textarea,.sheet-head .icon-btn'); if (f) f.focus({ preventScroll: true });
}
function closeSheet(silent) {
  const root = $('sheetRoot'); if (root.hidden) return;
  root.hidden = true; root.innerHTML = '';
  if (!$('modalRoot').hidden === false) document.body.classList.remove('lock');
  if (!silent && lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
}
let modalResolve = null;
function confirmDialog({ title: t, body, reasonLabel, reasonRequired, confirmLabel, cancelLabel, danger }) {
  return new Promise((resolve) => {
    modalResolve = resolve;
    const root = $('modalRoot');
    root.innerHTML = `<div class="scrim" data-act="modal-cancel"></div><div class="modal" role="alertdialog" aria-modal="true" aria-label="${esc(t)}"><h2>${esc(t)}</h2><p>${esc(body || '')}</p>${reasonLabel ? `<label class="fld">${esc(reasonLabel)}${reasonRequired ? ' *' : ''}<textarea id="mReason" rows="3" maxlength="500"></textarea></label><div id="mErr" class="err" hidden>Please enter a reason.</div>` : ''}<div class="btns"><button class="btn big" type="button" data-act="modal-cancel">${esc(cancelLabel || 'Cancel')}</button><button class="btn big ${danger ? 'danger' : 'primary'}" type="button" data-act="modal-ok" data-req="${reasonRequired ? 1 : 0}">${esc(confirmLabel || 'Confirm')}</button></div></div>`;
    root.hidden = false; document.body.classList.add('lock');
    (root.querySelector('textarea') || root.querySelector('.btn')).focus();
  });
}
function finishModal(result) {
  const root = $('modalRoot'); root.hidden = true; root.innerHTML = '';
  if ($('sheetRoot').hidden) document.body.classList.remove('lock');
  const r = modalResolve; modalResolve = null; if (r) r(result);
}

/* =========================================================
   LIST
   ========================================================= */
function activeFilterCount() { return Object.values(S.filters).filter(Boolean).length; }

function renderTabs() {
  $('tabs').innerHTML = Object.entries(TABS).map(([k, t]) => `<button class="tab ${S.tab === k ? 'active' : ''}" type="button" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${esc(t.label)}</button>`).join('');
  const n = activeFilterCount(); $('filterCount').hidden = !n; $('filterCount').textContent = n;
}

function renderStats() {
  const el = $('stats');
  if (!S.summary) { el.innerHTML = Array.from({ length: 5 }, (_, i) => `<div class="stat sk sk-stat ${i === 0 ? 'rev' : ''}"></div>`).join(''); return; }
  const s = S.summary;
  el.innerHTML = [
    ['Revenue', money(s.total_revenue), 'rev'], ['Orders', Number(s.total_orders || 0).toLocaleString('en-IN')],
    ['Pending', Number(s.pending_orders || 0).toLocaleString('en-IN')], ['Processing', Number(s.processing_orders || 0).toLocaleString('en-IN')],
    ['Delivered', Number(s.delivered_orders || 0).toLocaleString('en-IN')]
  ].map(([l, v, c]) => `<div class="stat ${c || ''}"><span>${l}</span><b>${esc(v)}</b></div>`).join('');
}

function tabMatch(o) {
  if (S.filters.status) return true;
  const t = TABS[S.tab];
  if (t.needs) return NEEDS_ACTION.includes(o.status) || o.requires_human_review === true;
  if (t.statuses) return t.statuses.includes(o.status);
  return true;
}
function dateMatch(o) {
  const f = S.filters; const d = new Date(o.created_at).getTime();
  if (f.from && d < new Date(f.from + 'T00:00:00').getTime()) return false;
  if (f.to && d > new Date(f.to + 'T23:59:59').getTime()) return false;
  return true;
}

async function loadList(reset = true) {
  const req = ++S.listReq;
  if (reset) { S.offset = 0; S.rows = []; S.listState = 'loading'; renderList(); }
  const f = S.filters, t = TABS[S.tab];
  let status = f.status || null;
  if (!status && t.statuses && t.statuses.length === 1) status = t.statuses[0];
  const clientSide = !f.status && (t.needs || (t.statuses && t.statuses.length > 1));
  const size = clientSide ? 200 : 50;
  try {
    const data = await rpc('get_orders', {
      p_status: status, p_source_channel: f.channel || null, p_payment_status: f.payment || null,
      p_fulfillment_status: f.fulfilment || null, p_search: S.search.trim() || null, p_limit: size, p_offset: S.offset
    });
    if (req !== S.listReq) return;
    const raw = Array.isArray(data) ? data : [];
    S.offset += raw.length; S.size = size; S.hasMore = raw.length === size;
    S.rows.push(...raw.filter((o) => tabMatch(o) && dateMatch(o)));
    S.listState = 'ok';
  } catch (e) {
    if (req !== S.listReq) return;
    console.error('[GLIME Orders] list', e); S.listState = 'error';
  }
  renderList();
}

async function loadSummary() {
  const f = S.filters;
  try {
    S.summary = await rpc('get_order_summary', {
      p_from: f.from ? new Date(f.from + 'T00:00:00').toISOString() : null,
      p_to: f.to ? new Date(f.to + 'T23:59:59').toISOString() : null
    });
  } catch (e) { console.error('[GLIME Orders] summary', e); S.summary = S.summary || { total_revenue: 0 }; }
  renderStats();
}

function rowHtml(o) {
  const c = o.customer || {};
  const ch = String(o.source_channel || 'other').toLowerCase();
  return `<button class="o-row" type="button" data-act="open" data-id="${esc(o.id)}" aria-label="Open order ${esc(o.order_number)}">
    <span class="num"><b>${esc(o.order_number || '#' + String(o.id).slice(0, 8))}</b><small>${esc(fmtShort(o.created_at))}</small></span>
    <span class="cust"><b>${esc(c.name || 'Customer')}</b><small>${esc(c.mobile || '')}</small></span>
    <span class="prod"><b>${esc(o.product_title || 'Order')} × ${esc(o.quantity || 1)}</b></span>
    <span class="amt">${esc(money(o.total_amount, o.currency))}</span>
    <span class="badges"><span class="b-st">${stBadge(o.status)}</span><span class="b-pay">${payBadge(o.payment_status)}</span><span class="b-ch">${chBadge(ch)}</span></span>
  </button>`;
}

function renderList() {
  const el = $('orderList'), more = $('moreWrap');
  more.hidden = true;
  if (S.listState === 'loading') { el.innerHTML = Array.from({ length: 5 }, () => '<div class="sk sk-row"></div>').join(''); return; }
  if (S.listState === 'error') { el.innerHTML = `<div class="empty"><span class="em-ico" aria-hidden="true">⚠</span><h3>Couldn't load orders</h3><p>Please check your connection and try again.</p><button class="btn primary big" type="button" data-act="retry">Try Again</button></div>`; return; }
  if (!S.rows.length) {
    const filtered = S.search || S.tab !== 'all' || activeFilterCount();
    el.innerHTML = filtered
      ? `<div class="empty"><span class="em-ico" aria-hidden="true">🔍</span><h3>No orders match this view</h3><p>Try a different group, search or filter.</p>${S.hasMore ? '' : '<button class="btn big" type="button" data-act="clear">Clear filters</button>'}</div>`
      : `<div class="empty"><span class="em-ico" aria-hidden="true">🛒</span><h3>No orders yet</h3><p>Orders created from WhatsApp, Instagram, website and manual entry will appear here.</p><button class="btn primary big" type="button" data-act="create">Create First Order</button></div>`;
    more.hidden = !S.hasMore; return;
  }
  el.innerHTML = `<div class="o-head"><span>Order</span><span>Customer</span><span>Product</span><span>Amount</span><span>Status</span><span>Payment</span><span>Channel</span></div>` + S.rows.map(rowHtml).join('');
  more.hidden = !S.hasMore;
}

function refreshAll() { return Promise.all([loadList(true), loadSummary()]); }

/* ---------- filters sheet ---------- */
function openFilters() {
  const f = S.filters;
  const opt = (map, cur) => '<option value="">Any</option>' + Object.keys(map).map((k) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(typeof map[k] === 'string' ? map[k] : map[k].label)}</option>`).join('');
  openSheet({
    title: 'Filters',
    html: `<label class="fld">Order status<select id="fStatus">${opt(ORDER_STATUS, f.status)}</select></label>
    <label class="fld">Payment<select id="fPay">${opt(PAY_STATUS, f.payment)}</select></label>
    <label class="fld">Fulfilment<select id="fFul">${opt(FUL_STATUS, f.fulfilment)}</select></label>
    <label class="fld">Channel<select id="fCh">${opt(CHANNEL, f.channel)}</select></label>
    <div class="grid2"><label class="fld">From date<input id="fFrom" type="date" value="${esc(f.from)}"></label><label class="fld">To date<input id="fTo" type="date" value="${esc(f.to)}"></label></div>
    <p class="hint">The status filter replaces the group tab. Dates apply to the orders list and the summary cards.</p>
    <div class="sheet-foot"><button class="btn big" type="button" data-act="clear">Reset</button><button class="btn primary big" type="button" data-act="apply-filters">Apply Filters</button></div>`
  });
}
function applyFilters() {
  S.filters = { status: $('fStatus').value, payment: $('fPay').value, fulfilment: $('fFul').value, channel: $('fCh').value, from: $('fFrom').value, to: $('fTo').value };
  closeSheet(); renderTabs(); refreshAll();
}
function clearFilters() {
  S.filters = { status: '', payment: '', fulfilment: '', channel: '', from: '', to: '' }; S.tab = 'all'; S.search = ''; $('search').value = '';
  closeSheet(); renderTabs(); refreshAll();
}

/* =========================================================
   DETAIL
   ========================================================= */
async function openDetail(id, push = true) {
  S.detailId = id; S.detail = null; S.actions = []; S.detailState = 'loading';
  $('listView').hidden = true; $('detailView').hidden = false;
  if (push) history.pushState({ id }, '', 'orders.html?id=' + encodeURIComponent(id));
  window.scrollTo(0, 0); renderDetail();
  await loadDetail();
}
function closeDetail(push = true) {
  S.detailId = null; S.detail = null;
  $('detailView').hidden = true; $('listView').hidden = false;
  if (push) history.pushState({}, '', 'orders.html');
  document.title = 'Orders | GLIME';
}
async function loadDetail() {
  const id = S.detailId; if (!id) return;
  try {
    const [d, acts] = await Promise.all([
      rpc('get_order_detail', { p_order_id: id }),
      db.from('client_action_requests').select('id,intent,target_action,status,risk_level,approval_required,created_at')
        .eq('target_type', 'order').eq('target_id', id).order('created_at', { ascending: false }).limit(20)
        .then((r) => (r.error ? (console.error('[GLIME Orders] actions', r.error), []) : r.data || []), () => [])
    ]);
    if (S.detailId !== id) return;
    if (!d || !(d.order || d.id)) throw new Error('ORDER_NOT_FOUND');
    S.detail = d.order ? d : { order: d, items: [], payments: [], fulfilments: [], status_history: [], events: [] };
    S.actions = acts; S.detailState = 'ok';
    document.title = (S.detail.order.order_number || 'Order') + ' | GLIME';
  } catch (e) {
    if (S.detailId !== id) return;
    console.error('[GLIME Orders] detail', e); S.detailState = 'error';
    S.detailMsg = /ORDER_NOT_FOUND/.test(String(e?.message)) ? 'This order could not be found.' : "Couldn't load this order.";
  }
  renderDetail();
}
async function refreshDetailAndList() {
  await Promise.all([loadDetail(), loadList(true), loadSummary()]);
}

function pick(o, keys) { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null; }
function latestFul(list) { return [...(list || [])].sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0] || null; }

function addressOf(d) {
  const o = d.order || {}, c = d.customer || {};
  const j = (o.delivery_address_json && typeof o.delivery_address_json === 'object') ? o.delivery_address_json : {};
  const a = {
    name: pick(j, ['name', 'full_name']) || c.name, phone: pick(j, ['mobile', 'phone']) || c.mobile,
    house: pick(j, ['house_no', 'house', 'address_line1']), locality: pick(j, ['village_locality', 'locality', 'area', 'address_line2']),
    district: pick(j, ['district', 'city']), state: pick(j, ['state']), pincode: pick(j, ['pincode', 'postal_code', 'zip']), landmark: pick(j, ['landmark'])
  };
  const hasJson = a.house || a.locality || a.district || a.state || a.pincode || a.landmark;
  if (!hasJson && o.delivery_address) return { ...a, text: o.delivery_address };
  if (!hasJson) return { ...a, house: c.house_no, locality: c.village_locality, district: c.district, state: c.state, pincode: c.pincode, landmark: c.landmark, fromCustomer: true };
  return a;
}

function renderDetail() {
  const v = $('detailView');
  const back = `<div class="d-top"><button class="icon-btn" type="button" data-act="back" aria-label="Back to orders">←</button><div class="grow"><h1>Order</h1></div></div>`;
  if (S.detailState === 'loading') {
    v.innerHTML = back + '<div class="sk" style="height:150px;margin:16px 0"></div><div class="sk" style="height:120px;margin:12px 0"></div><div class="sk" style="height:200px;margin:12px 0"></div>'; return;
  }
  if (S.detailState === 'error') {
    v.innerHTML = back + `<div class="empty"><span class="em-ico" aria-hidden="true">⚠</span><h3>${esc(S.detailMsg || "Couldn't load this order")}</h3><p>Please try again.</p><button class="btn primary big" type="button" data-act="retry-detail">Try Again</button></div>`; return;
  }
  const d = S.detail, o = d.order, c = d.customer || o.customer || {};
  const st = ORDER_STATUS[o.status] || { label: title(o.status), desc: '', next: [] };
  const paid = Number(o.paid_amount || 0), total = Number(o.total_amount || 0);
  const remaining = ['refunded', 'not_required'].includes(o.payment_status) ? 0 : Math.max(0, total - paid);
  const ch = String(o.source_channel || 'other').toLowerCase();
  const ful = latestFul(d.fulfilments);
  const addr = addressOf(d);
  const phone = String(c.mobile || '').replace(/\D/g, '');

  /* amount breakdown only where the backend provides it */
  const extras = [['Subtotal', pick(o, ['subtotal_amount', 'subtotal'])], ['Discount', pick(o, ['discount_amount', 'order_discount'])], ['Shipping', pick(o, ['shipping_amount'])], ['Tax', pick(o, ['tax_amount'])]].filter(([, x]) => x !== null && Number(x) !== 0 || false);

  const itemsHtml = (d.items || []).map((i) => {
    const chips = [i.color, i.size, i.fabric].filter(Boolean).map((x) => `<span class="chip">${esc(x)}</span>`).join('');
    return `<div class="item"><div class="it-top"><b>${esc(i.product_title_snapshot || 'Item')}</b><b>${esc(money(i.line_total, o.currency))}</b></div>${chips ? `<div class="chips">${chips}</div>` : ''}<div class="it-meta">Qty ${esc(i.quantity)} × ${esc(money(i.unit_price, o.currency))}${Number(i.discount_amount) ? ` · Discount ${esc(money(i.discount_amount, o.currency))}` : ''}${i.sku_snapshot ? ` · SKU ${esc(i.sku_snapshot)}` : ''}</div></div>`;
  }).join('') || '<div class="note">No item details are stored for this order.</div>';

  const paymentsHtml = (d.payments || []).map((p) => `<div class="pay-item"><div class="kv"><span>Status</span><b>${payBadge(p.status)}</b></div><div class="kv"><span>Amount</span><b>${esc(money(p.amount, p.currency || o.currency))}</b></div>${p.payment_method ? `<div class="kv"><span>Method</span><b>${esc(String(p.payment_method).toUpperCase())}</b></div>` : ''}${p.provider_key ? `<div class="kv"><span>Provider</span><b>${esc(title(p.provider_key))}</b></div>` : ''}${p.provider_payment_id ? `<div class="kv"><span>Transaction ID</span><b>${esc(p.provider_payment_id)}</b></div>` : ''}<div class="kv"><span>Paid at</span><b>${esc(fmtDateTime(p.paid_at))}</b></div><div class="kv"><span>Verification</span><b>${p.signature_verified ? '✓ Verified' : 'Not verified'}${p.reconciled ? ' · ✓ Reconciled' : ''}</b></div></div>`).join('');
  const payNote = (d.payments || []).length ? '' : (o.payment_status === 'not_required' ? '<div class="note">No online payment is required for this order.</div>' : '<div class="note">No payment has been recorded yet. Payments are confirmed automatically by the payment provider — they cannot be marked paid from here.<br><b>Integration not connected</b></div>');

  const fulHtml = ful ? `<div class="rows"><div class="kv"><span>Status</span><b>${esc(FUL_STATUS[ful.status] || title(ful.status))}</b></div><div class="kv"><span>Courier</span><b>${esc(ful.shipping_provider || '—')}</b></div><div class="kv"><span>Service</span><b>${esc(ful.shipping_service || '—')}</b></div><div class="kv"><span>Tracking number</span><b>${esc(ful.tracking_number || '—')}</b></div><div class="kv"><span>Expected delivery</span><b>${esc(fmtDate(ful.expected_delivery_at))}</b></div>${ful.warehouse_location ? `<div class="kv"><span>Warehouse</span><b>${esc(ful.warehouse_location)}</b></div>` : ''}${ful.package_count ? `<div class="kv"><span>Packages</span><b>${esc(ful.package_count)}</b></div>` : ''}${ful.delivery_exception ? `<div class="kv"><span>Problem</span><b>${esc(ful.delivery_exception)}</b></div>` : ''}${ful.delivered_at ? `<div class="kv"><span>Delivered on</span><b>${esc(fmtDateTime(ful.delivered_at))}</b></div>` : ''}</div>${safeUrl(ful.tracking_url) ? `<div class="link-row"><a class="btn primary" href="${esc(safeUrl(ful.tracking_url))}" target="_blank" rel="noopener noreferrer">Track Shipment ↗</a></div>` : ''}` : '<div class="note">No shipment details yet. A courier integration is not connected — you can enter shipment details manually.</div>';

  const addrRows = [['Name', addr.name], ['Phone', addr.phone], ['House', addr.house], ['Locality', addr.locality], ['District', addr.district], ['State', addr.state], ['Pincode', addr.pincode], ['Landmark', addr.landmark]].filter(([, x]) => x);
  const addrHtml = addr.text ? `<div class="note">${esc(addr.text).replace(/\n/g, '<br>')}</div>` : (addrRows.length ? `<div class="rows">${addrRows.map(([k, x]) => `<div class="kv"><span>${k}</span><b>${esc(x)}</b></div>`).join('')}</div>${addr.fromCustomer ? '<p class="hint">Taken from the customer profile.</p>' : ''}` : '<div class="note">No delivery address added yet.</div>');

  /* AI / automation */
  const actsHtml = S.actions.length ? S.actions.map((a) => {
    const pending = a.status === 'proposed';
    return `<div class="act-card"><div class="it-top"><b>${esc(title(a.target_action))}</b><span class="badge t-${RISK_TONE[a.risk_level] || 'neutral'}">Risk: ${esc(RISK[a.risk_level] || '—')}</span></div><div class="it-meta">${esc(a.intent || '')}</div><div class="chips"><span class="chip">${esc(title(a.status))}</span><span class="chip">${esc(fmtDateTime(a.created_at))}</span></div>${pending ? `<div class="btns"><button class="btn" type="button" data-act="reject" data-id="${esc(a.id)}">Reject</button><button class="btn primary" type="button" data-act="approve" data-id="${esc(a.id)}" data-risk="${esc(a.risk_level)}">Approve</button></div>` : ''}</div>`;
  }).join('') + '<p class="hint">Approving queues the action for the backend. Nothing is changed directly from this screen.</p>' : '<div class="note">No AI action requests for this order.</div>';

  /* timeline */
  const hist = (d.status_history || []).map((h) => ({ t: h.created_at, ico: '⇄', title: `${ORDER_STATUS[h.from_status]?.label || title(h.from_status) || 'Start'} → ${ORDER_STATUS[h.to_status]?.label || title(h.to_status)}`, sub: [title(h.actor_type), h.reason, h.note].filter(Boolean).join(' · ') }));
  const evs = (d.events || []).filter((e) => !(hist.length && /status/i.test(e.event_type || ''))).map((e) => ({ t: e.created_at, ico: '•', title: title(String(e.event_type || 'event').replace(/^order\./, '')), sub: title(e.actor_type) }));
  const tl = [...hist, ...evs];
  if (!tl.some((x) => /creat/i.test(x.title))) tl.push({ t: o.created_at, ico: '＋', title: 'Order created', sub: CHANNEL[ch]?.label || '' });
  tl.sort((a, b) => new Date(b.t) - new Date(a.t));
  const tlHtml = `<ol class="timeline">${tl.map((x) => `<li><span class="dot" aria-hidden="true">${x.ico}</span><div><b>${esc(x.title)}</b><small>${esc(fmtDateTime(x.t))}${x.sub ? ' · ' + esc(x.sub) : ''}</small></div></li>`).join('')}</ol>`;

  /* action bar */
  const avail = (st.next || []).filter((t) => t !== 'refunded');
  let bar = '';
  if (o.status === 'cancel_requested') {
    bar = `<button class="btn danger big" type="button" data-act="tr" data-to="cancelled">Approve Cancellation</button><button class="btn big" type="button" data-act="tr" data-to="processing">Reject</button>`;
  } else {
    const primary = PRIMARY_ORDER.find((t) => avail.includes(t)) || avail.find((t) => t !== 'on_hold');
    if (primary) bar += `<button class="btn primary big" type="button" data-act="tr" data-to="${primary}">${esc(actLabel(o.status, primary))}</button>`;
    if (avail.includes('on_hold')) bar += `<button class="btn big" type="button" data-act="tr" data-to="on_hold">Hold</button>`;
  }
  bar += `<button class="btn big more" type="button" data-act="more" aria-label="More actions">⋯ More</button>`;

  v.innerHTML = `
  <div class="d-top"><button class="icon-btn" type="button" data-act="back" aria-label="Back to orders">←</button>
    <div class="grow"><h1>${esc(o.order_number || 'Order')}</h1><div class="d-sub">${stBadge(o.status, 'lg')}${payBadge(o.payment_status, 'lg')}${chBadge(ch)}<span>${esc(fmtDateTime(o.created_at))}</span></div></div>
    <button class="icon-btn" type="button" data-act="refresh-detail" aria-label="Refresh order">⟳</button></div>

  <section class="d-hero"><div class="tot"><small>Order total</small><b>${esc(money(total, o.currency))}</b></div><div class="desc">${esc(st.desc || '')}${o.hold_reason && o.status === 'on_hold' ? `<br><b>Hold reason:</b> ${esc(o.hold_reason)}` : ''}</div>
    <div class="kv3"><div><small>Paid</small><b>${esc(money(paid, o.currency))}</b></div><div><small>Remaining</small><b>${esc(money(remaining, o.currency))}</b></div><div><small>Items</small><b>${esc(o.quantity ?? (d.items || []).length)}</b></div></div></section>

  <div class="d-grid">
   <div class="col">
    <section class="card c3"><h2>Items</h2>${itemsHtml}${extras.length ? `<div class="rows" style="margin-top:12px">${extras.map(([k, x]) => `<div class="kv"><span>${k}</span><b>${esc(money(x, o.currency))}</b></div>`).join('')}</div>` : ''}</section>
    <section class="card c4"><h2>Payment ${payBadge(o.payment_status)}</h2><div class="rows"><div class="kv"><span>Amount</span><b>${esc(money(total, o.currency))}</b></div><div class="kv"><span>Paid</span><b>${esc(money(paid, o.currency))}</b></div><div class="kv"><span>Remaining</span><b>${esc(money(remaining, o.currency))}</b></div></div>${paymentsHtml}${payNote}</section>
    <section class="card c5"><h2>Fulfilment ${ful ? '' : ''}<button class="btn sm" type="button" data-act="fulfil">${ful ? 'Update' : 'Add Shipment'}</button></h2>${fulHtml}</section>
    <section class="card c6"><h2>Delivery Address <button class="btn sm" type="button" data-act="edit">Edit</button></h2>${addrHtml}</section>
   </div>
   <div class="col">
    <section class="card c2"><h2>Customer</h2><div class="rows"><div class="kv"><span>Name</span><b>${esc(c.name || '—')}</b></div><div class="kv"><span>Phone</span><b>${esc(c.mobile || '—')}</b></div>${(c.district || c.state) ? `<div class="kv"><span>Location</span><b>${esc([c.district, c.state].filter(Boolean).join(', '))}</b></div>` : ''}</div>
      <div class="link-row">${(c.id || o.customer_id) ? `<a class="btn" href="customer.html?id=${encodeURIComponent(c.id || o.customer_id)}">View Customer</a>` : ''}${o.lead_id ? `<a class="btn" href="leads.html?lead=${encodeURIComponent(o.lead_id)}">View Source Lead</a>` : ''}${phone ? `<a class="btn" href="tel:+${esc(phone)}">Call</a><a class="btn" href="https://wa.me/${esc(phone)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}</div></section>
    <section class="card c7"><h2>AI / Automation</h2><div class="rows"><div class="kv"><span>Automation mode</span><b>${esc(title(o.automation_mode || 'manual'))}</b></div><div class="kv"><span>Human review</span><b>${o.requires_human_review ? '✓ Required' : 'Not required'}</b></div></div>${o.customer_note ? `<div class="note" style="margin-top:10px"><b>Customer note</b><br>${esc(o.customer_note)}</div>` : ''}${o.internal_note ? `<div class="note" style="margin-top:10px"><b>Internal note</b><br>${esc(o.internal_note)}</div>` : ''}<h2 style="margin:16px 0 0;font-size:.85rem">AI Action Requests</h2>${actsHtml}</section>
    <section class="card c8"><h2>Timeline</h2>${tlHtml}</section>
   </div>
  </div>
  <div class="actionbar" role="toolbar" aria-label="Order actions">${bar}</div>`;
}

function actLabel(from, to) {
  if (from === 'cancel_requested') return to === 'cancelled' ? 'Approve Cancellation' : 'Reject Cancellation';
  if (from === 'on_hold') return 'Resume: ' + (ORDER_STATUS[to]?.label || title(to));
  return ACT[to]?.label || ORDER_STATUS[to]?.label || title(to);
}

/* ---------- status transitions ---------- */
async function doTransition(to) {
  if (S.busy || !S.detail) return;
  const o = S.detail.order, meta = ACT[to] || {};
  const label = actLabel(o.status, to);
  const needsConfirm = meta.danger || meta.confirm || o.status === 'cancel_requested';
  let reason = null;
  if (needsConfirm) {
    const r = await confirmDialog({
      title: to === 'cancelled' ? 'Cancel Order?' : label + '?',
      body: to === 'cancelled' ? 'This action cannot be casually undone.' : 'The order status will change to “' + (ORDER_STATUS[to]?.label || title(to)) + '”.',
      reasonLabel: meta.reason || meta.danger ? 'Reason' : null, reasonRequired: to === 'cancelled' || to === 'on_hold',
      confirmLabel: to === 'cancelled' ? 'Cancel Order' : label, cancelLabel: to === 'cancelled' ? 'Keep Order' : 'Not now', danger: !!meta.danger
    });
    if (!r) return; reason = r.reason || null;
  }
  S.busy = true; setBarBusy(true);
  try {
    await rpc('transition_order', { p_order_id: o.id, p_to_status: to, p_reason: reason, p_note: null, p_action_request_id: null });
    toast('Order updated: ' + (ORDER_STATUS[to]?.label || title(to)));
  } catch (e) { toast(friendly(e), true); }
  S.busy = false;
  await refreshDetailAndList();
}
function setBarBusy(b) { document.querySelectorAll('.actionbar .btn').forEach((x) => (x.disabled = b)); }

function openMore() {
  const o = S.detail.order, avail = (ORDER_STATUS[o.status]?.next || []).filter((t) => t !== 'refunded');
  const trs = avail.map((t) => `<button class="pick ${ACT[t]?.danger ? '' : ''}" type="button" data-act="tr" data-to="${t}" data-from-sheet="1"><span><b>${esc(actLabel(o.status, t))}</b><small>→ ${esc(ORDER_STATUS[t]?.label || title(t))}</small></span><span aria-hidden="true">${ORDER_STATUS[t]?.icon || ''}</span></button>`).join('');
  openSheet({
    title: 'Order actions',
    html: `${trs ? `<div class="step-title">Status</div>${trs}` : '<div class="note">No further status changes are available for this order.</div>'}
    ${o.status === 'returned' ? '<div class="note" style="margin-top:10px">Refunds need the payment provider. <b>Integration not connected</b></div>' : ''}
    <div class="step-title" style="margin-top:16px">Order</div>
    <button class="pick" type="button" data-act="fulfil"><span><b>Update fulfilment</b><small>Courier, tracking, expected delivery</small></span><span aria-hidden="true">🚚</span></button>
    <button class="pick" type="button" data-act="edit"><span><b>Edit details</b><small>Address, notes, automation</small></span><span aria-hidden="true">✏</span></button>
    <button class="pick" type="button" data-act="review"><span><b>Request human review</b><small>Flag this order for a person to check</small></span><span aria-hidden="true">👁</span></button>`
  });
}

async function requestReview() {
  if (S.busy) return; S.busy = true;
  try {
    await rpc('create_order_action_request', { p_order_id: S.detail.order.id, p_intent: 'Human review requested from the Orders screen', p_target_action: 'request_human_review', p_risk_level: 'low', p_approval_required: true, p_action_payload: { source: 'orders_ui' } });
    closeSheet(); toast('Human review requested');
  } catch (e) { toast(friendly(e), true); }
  S.busy = false; await loadDetail();
}

async function decideAction(id, approve, risk) {
  if (S.busy) return;
  if (approve && ['high', 'critical'].includes(risk)) {
    const r = await confirmDialog({ title: 'Approve high-risk action?', body: 'This action is marked ' + (RISK[risk] || 'high') + ' risk. Approving queues it for the backend.', confirmLabel: 'Approve', cancelLabel: 'Review again' });
    if (!r) return;
  }
  S.busy = true;
  try {
    await rpc(approve ? 'approve_client_business_action' : 'reject_client_business_action', { p_action_request_id: id });
    toast(approve ? 'Action approved and queued' : 'Action rejected');
  } catch (e) { toast(friendly(e), true); }
  S.busy = false; await loadDetail();
}

/* ---------- edit order (update_order — allowed fields only) ---------- */
function openEdit() {
  const d = S.detail, o = d.order, a = addressOf(d);
  const f = (id, label, val) => `<label class="fld">${label}<input id="${id}" value="${esc(val || '')}" maxlength="200"></label>`;
  openSheet({
    title: 'Edit order details',
    html: `<div id="eErr" class="err" hidden></div>
    <div class="step-title">Delivery address</div>
    ${f('eHouse', 'House / Flat', a.house)}${f('eLoc', 'Village / Locality', a.locality)}
    <div class="grid2">${f('eDist', 'District', a.district)}${f('eState', 'State', a.state)}</div>
    <div class="grid2">${f('ePin', 'Pincode', a.pincode)}${f('eLand', 'Landmark', a.landmark)}</div>
    <label class="fld">Customer note<textarea id="eCNote" maxlength="500">${esc(o.customer_note || '')}</textarea></label>
    <label class="fld">Internal note<textarea id="eINote" maxlength="500">${esc(o.internal_note || '')}</textarea></label>
    ${o.status === 'on_hold' ? `<label class="fld">Hold reason<input id="eHold" value="${esc(o.hold_reason || '')}" maxlength="200"></label>` : ''}
    <label class="fld">Automation mode<select id="eAuto"><option value="manual">Manual</option><option value="approval">Needs approval</option><option value="automatic">Automatic</option></select></label>
    <label class="toggle"><input id="eReview" type="checkbox" ${o.requires_human_review ? 'checked' : ''}> Requires human review</label>
    <div class="sheet-foot"><button class="btn big" type="button" data-act="close-sheet">Cancel</button><button class="btn primary big" type="button" data-act="save-edit" id="eSave">Save Changes</button></div>`,
    onMount: () => { $('eAuto').value = o.automation_mode || 'manual'; }
  });
}
async function saveEdit() {
  if (S.busy) return;
  const o = S.detail.order, ch = {};
  const addr = { house_no: $('eHouse').value.trim(), village_locality: $('eLoc').value.trim(), district: $('eDist').value.trim(), state: $('eState').value.trim(), pincode: $('ePin').value.trim(), landmark: $('eLand').value.trim() };
  if (addr.pincode && !/^\d{6}$/.test(addr.pincode)) { const e = $('eErr'); e.textContent = 'Pincode should be 6 digits.'; e.hidden = false; return; }
  const before = addressOf(S.detail);
  const changed = addr.house_no !== (before.house || '') || addr.village_locality !== (before.locality || '') || addr.district !== (before.district || '') || addr.state !== (before.state || '') || addr.pincode !== (before.pincode || '') || addr.landmark !== (before.landmark || '');
  if (changed) {
    const clean = Object.fromEntries(Object.entries(addr).filter(([, v]) => v));
    const j = (o.delivery_address_json && typeof o.delivery_address_json === 'object') ? o.delivery_address_json : {};
    ch.delivery_address_json = { ...j, ...addr };
    ch.delivery_address = Object.values(clean).join(', ');
  }
  const cn = $('eCNote').value.trim(), inn = $('eINote').value.trim();
  if (cn !== (o.customer_note || '')) ch.customer_note = cn;
  if (inn !== (o.internal_note || '')) ch.internal_note = inn;
  if ($('eHold') && $('eHold').value.trim() !== (o.hold_reason || '')) ch.hold_reason = $('eHold').value.trim();
  if ($('eAuto').value !== (o.automation_mode || 'manual')) ch.automation_mode = $('eAuto').value;
  if ($('eReview').checked !== !!o.requires_human_review) ch.requires_human_review = $('eReview').checked;
  if (!Object.keys(ch).length) { closeSheet(); toast('No changes to save'); return; }
  S.busy = true; $('eSave').disabled = true; $('eSave').textContent = 'Saving…';
  try { await rpc('update_order', { p_order_id: o.id, p_changes: ch }); closeSheet(); toast('Order details saved'); }
  catch (e) { const el = $('eErr'); if (el) { el.textContent = friendly(e); el.hidden = false; } $('eSave').disabled = false; $('eSave').textContent = 'Save Changes'; S.busy = false; return; }
  S.busy = false; await refreshDetailAndList();
}

/* ---------- fulfilment (upsert_order_fulfilment) ---------- */
function toLocalInput(v) { if (!v) return ''; const d = new Date(v); if (Number.isNaN(d.getTime())) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function openFulfil() {
  const ful = latestFul(S.detail.fulfilments) || {};
  const f = (id, label, val, extra = '') => `<label class="fld">${label}<input id="${id}" value="${esc(val || '')}" ${extra}></label>`;
  openSheet({
    title: ful.id ? 'Update fulfilment' : 'Add shipment details',
    html: `<div id="fErr" class="err" hidden></div>
    <div class="note" style="margin-bottom:12px">Courier integration is not connected yet. Details you enter here are saved as typed — no shipment is booked automatically.</div>
    <label class="fld">Fulfilment status<select id="fuStatus">${Object.entries(FUL_STATUS).map(([k, l]) => `<option value="${k}" ${(ful.status || 'processing') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <div class="grid2">${f('fuProv', 'Courier / provider', ful.shipping_provider, 'maxlength="80"')}${f('fuServ', 'Service', ful.shipping_service, 'maxlength="80"')}</div>
    ${f('fuTrack', 'Tracking number', ful.tracking_number, 'maxlength="120"')}
    ${f('fuUrl', 'Tracking link', ful.tracking_url, 'type="url" inputmode="url" placeholder="https://"')}
    <label class="fld">Expected delivery<input id="fuEta" type="datetime-local" value="${esc(toLocalInput(ful.expected_delivery_at))}"></label>
    <div class="grid2">${f('fuWh', 'Warehouse', ful.warehouse_location, 'maxlength="80"')}${f('fuPk', 'Packages', ful.package_count || 1, 'type="number" min="1" step="1" inputmode="numeric"')}</div>
    ${f('fuEx', 'Delivery problem (if any)', ful.delivery_exception, 'maxlength="200"')}
    <div class="sheet-foot"><button class="btn big" type="button" data-act="close-sheet">Cancel</button><button class="btn primary big" type="button" data-act="save-fulfil" id="fSave">Save Fulfilment</button></div>`
  });
}
async function saveFulfil() {
  if (S.busy) return;
  const v = (id) => $(id).value.trim(), err = (m) => { const e = $('fErr'); e.textContent = m; e.hidden = false; };
  const url = v('fuUrl'), pk = parseInt(v('fuPk') || '1', 10);
  if (url && !safeUrl(url)) return err('Tracking link must start with http:// or https://');
  if (!Number.isInteger(pk) || pk < 1) return err('Package count must be at least 1.');
  const eta = $('fuEta').value ? new Date($('fuEta').value).toISOString() : null;
  S.busy = true; $('fSave').disabled = true; $('fSave').textContent = 'Saving…';
  try {
    await rpc('upsert_order_fulfilment', {
      p_order_id: S.detail.order.id, p_status: $('fuStatus').value, p_shipping_provider: v('fuProv') || null, p_shipping_service: v('fuServ') || null,
      p_tracking_number: v('fuTrack') || null, p_tracking_url: url || null, p_expected_delivery_at: eta, p_delivery_exception: v('fuEx') || null,
      p_warehouse_location: v('fuWh') || null, p_package_count: pk, p_metadata: {}
    });
    closeSheet(); toast('Fulfilment saved');
  } catch (e) { err(friendly(e)); $('fSave').disabled = false; $('fSave').textContent = 'Save Fulfilment'; S.busy = false; return; }
  S.busy = false; await refreshDetailAndList();
}

/* =========================================================
   CREATE ORDER (create_order)
   ========================================================= */
const CO_STEPS = ['Customer', 'Items', 'Address', 'Payment', 'Review'];
const blankItem = () => ({ title: '', qty: '1', price: '', discount: '', color: '', size: '', fabric: '' });
function newCO() { return { step: 0, customer: null, items: [blankItem()], addr: {}, addrFor: null, status: 'draft', pay: 'not_required', discount: '', shipping: '', tax: '', cnote: '', inote: '', key: uuid(), busy: false, search: '', results: [], showNew: false, err: '' }; }

async function openCreate() {
  if (!S.co) S.co = newCO();
  renderCreate(true);
  if (!S.offers.length) {
    db.from('offers').select('name').eq('client_id', S.clientId).order('created_at', { ascending: false }).limit(100)
      .then((r) => { if (!r.error && r.data) { S.offers = [...new Set(r.data.map((x) => x.name).filter(Boolean))]; const dl = $('offerList'); if (dl) dl.innerHTML = S.offers.map((n) => `<option value="${esc(n)}">`).join(''); } }, () => {});
  }
}
const coTotals = () => {
  const c = S.co; const sub = c.items.reduce((s, i) => s + Math.max(0, num(i.qty) * num(i.price) - num(i.discount)), 0);
  const total = sub - num(c.discount) + num(c.shipping) + num(c.tax);
  return { sub, total };
};
function coValidate(step) {
  const c = S.co;
  if (step >= 0 && !c.customer) return 'Please select a customer.';
  if (step >= 1) {
    if (!c.items.length) return 'Add at least one item.';
    for (const [i, it] of c.items.entries()) {
      if (!it.title.trim()) return `Item ${i + 1}: enter the product name.`;
      if (!(num(it.qty) > 0) || !Number.isInteger(num(it.qty))) return `Item ${i + 1}: quantity must be a whole number above 0.`;
      if (it.price === '' || num(it.price) < 0) return `Item ${i + 1}: enter a price (0 or more).`;
      if (num(it.discount) < 0 || num(it.discount) > num(it.qty) * num(it.price)) return `Item ${i + 1}: discount cannot be more than the item total.`;
    }
  }
  if (step >= 3) {
    const { sub, total } = coTotals();
    if (num(c.discount) < 0 || num(c.shipping) < 0 || num(c.tax) < 0) return 'Discount, shipping and tax cannot be negative.';
    if (num(c.discount) > sub) return 'Order discount cannot be more than the subtotal.';
    if (total < 0) return 'Order total cannot be negative.';
  }
  return '';
}

function coStepHtml() {
  const c = S.co, f = (path, label, val, extra = '') => `<label class="fld">${label}<input data-f="${path}" value="${esc(val ?? '')}" ${extra}></label>`;
  if (c.step === 0) {
    const sel = c.customer ? `<button class="pick sel" type="button" data-act="co-unpick"><span><b>${esc(c.customer.name)}</b><small>${esc(c.customer.mobile || '')} · tap to change</small></span><span aria-hidden="true">✓</span></button>` : '';
    return `<div class="step-title">Step 1 · Customer</div>${sel}
    ${c.customer ? '' : `<label class="fld">Search existing customer<input id="coSearch" type="search" placeholder="Name or mobile number" value="${esc(c.search)}" autocomplete="off"></label><div id="coResults"></div>
    <button class="btn block" type="button" data-act="co-togglenew">${c.showNew ? 'Hide new customer form' : '＋ New customer'}</button>
    ${c.showNew ? `<div class="li-card" style="margin-top:12px"><p class="hint" style="margin:0 0 10px">If the mobile number already exists, that customer will be used instead of creating a duplicate.</p>${f('nc.name', 'Customer name *', c.nc?.name, 'maxlength="100"')}${f('nc.mobile', 'Mobile number *', c.nc?.mobile, 'type="tel" inputmode="tel" maxlength="15"')}<button class="btn primary block" type="button" data-act="co-savenew">Save &amp; Select Customer</button></div>` : ''}`}`;
  }
  if (c.step === 1) {
    const items = c.items.map((it, i) => `<div class="li-card"><div class="li-h"><span>Item ${i + 1}</span>${c.items.length > 1 ? `<button class="btn sm" type="button" data-act="co-rm" data-i="${i}" aria-label="Remove item ${i + 1}">Remove</button>` : ''}</div>
      <label class="fld">Product *<input data-f="items.${i}.title" list="offerList" value="${esc(it.title)}" maxlength="150" placeholder="Product name"></label>
      <div class="grid2">${f(`items.${i}.qty`, 'Quantity *', it.qty, 'type="number" min="1" step="1" inputmode="numeric"')}${f(`items.${i}.price`, 'Price (₹) *', it.price, 'type="number" min="0" step="any" inputmode="decimal"')}</div>
      <div class="grid2">${f(`items.${i}.color`, 'Color', it.color, 'maxlength="40"')}${f(`items.${i}.size`, 'Size', it.size, 'maxlength="40"')}</div>
      <div class="grid2">${f(`items.${i}.fabric`, 'Fabric', it.fabric, 'maxlength="60"')}${f(`items.${i}.discount`, 'Discount (₹)', it.discount, 'type="number" min="0" step="any" inputmode="decimal"')}</div></div>`).join('');
    return `<div class="step-title">Step 2 · Items</div><datalist id="offerList">${S.offers.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>${items}<button class="btn block" type="button" data-act="co-add">＋ Add another item</button><div class="sum" style="margin-top:14px"><div class="r"><span>Items subtotal (estimate)</span><b id="coSub">${esc(money(coTotals().sub))}</b></div></div>`;
  }
  if (c.step === 2) {
    const a = c.addr;
    return `<div class="step-title">Step 3 · Delivery address</div><p class="hint" style="margin:0 0 12px">Prefilled from the customer profile. Change it if this order goes somewhere else.</p>
    ${f('addr.house_no', 'House / Flat', a.house_no, 'maxlength="150"')}${f('addr.village_locality', 'Village / Locality', a.village_locality, 'maxlength="150"')}
    <div class="grid2">${f('addr.district', 'District', a.district)}${f('addr.state', 'State', a.state)}</div>
    <div class="grid2">${f('addr.pincode', 'Pincode', a.pincode, 'inputmode="numeric" maxlength="6"')}${f('addr.landmark', 'Landmark', a.landmark)}</div>`;
  }
  if (c.step === 3) {
    return `<div class="step-title">Step 4 · Payment &amp; charges</div>
    <label class="fld">Order status<select data-f="status"><option value="draft">Draft</option><option value="new">New</option><option value="confirmed">Confirmed</option></select></label>
    <label class="fld">Payment<select data-f="pay"><option value="not_required">No online payment needed</option><option value="pending">Payment pending</option></select><span class="hint">Orders are marked paid only by the payment provider — never from this form.</span></label>
    <div class="grid2">${f('discount', 'Order discount (₹)', c.discount, 'type="number" min="0" step="any" inputmode="decimal"')}${f('shipping', 'Shipping (₹)', c.shipping, 'type="number" min="0" step="any" inputmode="decimal"')}</div>
    ${f('tax', 'Tax (₹)', c.tax, 'type="number" min="0" step="any" inputmode="decimal"')}
    <label class="fld">Customer note<textarea data-f="cnote" maxlength="500">${esc(c.cnote)}</textarea></label>
    <label class="fld">Internal note<textarea data-f="inote" maxlength="500">${esc(c.inote)}</textarea></label>`;
  }
  const { sub, total } = coTotals(), a = c.addr;
  const addrText = [a.house_no, a.village_locality, a.district, a.state, a.pincode, a.landmark].filter(Boolean).join(', ') || 'No address added';
  return `<div class="step-title">Step 5 · Review</div>
  <div class="sum"><div class="r"><span>Customer</span><b>${esc(c.customer.name)}</b></div><div class="r"><span>Phone</span><b>${esc(c.customer.mobile || '—')}</b></div><div class="r"><span>Status</span><b>${esc(ORDER_STATUS[c.status]?.label)}</b></div><div class="r"><span>Payment</span><b>${esc(PAY_STATUS[c.pay]?.label)}</b></div></div>
  <div class="sum">${c.items.map((i) => `<div class="r"><span>${esc(i.title)} × ${esc(i.qty)}${[i.color, i.size, i.fabric].filter(Boolean).length ? ' (' + esc([i.color, i.size, i.fabric].filter(Boolean).join(', ')) + ')' : ''}</span><b>${esc(money(Math.max(0, num(i.qty) * num(i.price) - num(i.discount))))}</b></div>`).join('')}
    <div class="r"><span>Subtotal</span><b>${esc(money(sub))}</b></div>${num(c.discount) ? `<div class="r"><span>Discount</span><b>− ${esc(money(c.discount))}</b></div>` : ''}${num(c.shipping) ? `<div class="r"><span>Shipping</span><b>+ ${esc(money(c.shipping))}</b></div>` : ''}${num(c.tax) ? `<div class="r"><span>Tax</span><b>+ ${esc(money(c.tax))}</b></div>` : ''}<div class="r t"><span>Estimated total</span><b>${esc(money(total))}</b></div></div>
  <div class="note"><b>Deliver to</b><br>${esc(addrText)}</div><p class="hint">The final total is calculated and confirmed by the system when the order is created.</p>`;
}

function renderCreate(initial) {
  const c = S.co;
  if (c.step === 2 && c.addrFor !== c.customer?.id) { const u = c.customer || {}; c.addr = { house_no: u.house_no || '', village_locality: u.village_locality || '', district: u.district || '', state: u.state || '', pincode: u.pincode || '', landmark: u.landmark || '' }; c.addrFor = c.customer?.id; }
  const bar = `<div class="stepper" aria-label="Step ${c.step + 1} of ${CO_STEPS.length}">${CO_STEPS.map((_, i) => `<i class="${i <= c.step ? 'on' : ''}"></i>`).join('')}</div>`;
  const last = c.step === CO_STEPS.length - 1;
  const html = `${bar}<div id="coErr" class="err" ${c.err ? '' : 'hidden'}>${esc(c.err)}</div>${coStepHtml()}<div class="sheet-foot"><button class="btn big" type="button" data-act="${c.step ? 'co-prev' : 'close-sheet'}">${c.step ? '← Back' : 'Cancel'}</button><button class="btn primary big" type="button" data-act="${last ? 'co-submit' : 'co-next'}" id="coNext" ${c.busy ? 'disabled' : ''}>${last ? (c.busy ? 'Creating…' : 'Create Order') : 'Continue →'}</button></div>`;
  const scroll = $('sheetBody') ? $('sheetBody').scrollTop : 0;
  if (initial || !$('sheetBody') || !document.querySelector('.sheet.full')) openSheet({ title: 'Create Order', html, full: true });
  else { $('sheetBody').innerHTML = html; $('sheetBody').scrollTop = initial ? 0 : scroll; }
  c.err = '';
  if (c.step === 3) { const sb = $('sheetBody'); sb.querySelector('[data-f="status"]').value = c.status; sb.querySelector('[data-f="pay"]').value = c.pay; }
  if (c.step === 0 && !c.customer) coSearch();
}

let coT;
async function coSearch() {
  const c = S.co; const q = String(c.search || '').replace(/[,()%*\\]/g, ' ').trim();
  let qb = db.from('customers').select('id,name,mobile,house_no,village_locality,district,state,pincode,landmark').eq('client_id', S.clientId);
  if (q) qb = qb.or(`name.ilike.%${q}%,mobile.ilike.%${q}%`);
  const { data, error } = await qb.order('created_at', { ascending: false }).limit(15);
  const box = $('coResults'); if (!box || S.co !== c || c.customer) return;
  if (error) { console.error(error); box.innerHTML = '<div class="err">Could not search customers. Try again.</div>'; return; }
  c.results = data || [];
  box.innerHTML = c.results.length ? c.results.map((u, i) => `<button class="pick" type="button" data-act="co-pick" data-i="${i}"><span><b>${esc(u.name || 'Customer')}</b><small>${esc(u.mobile || '')}${u.district ? ' · ' + esc(u.district) : ''}</small></span><span aria-hidden="true">›</span></button>`).join('') : '<p class="hint">No matching customer. Add a new one below.</p>';
}
async function coSaveNew() {
  const c = S.co, n = (c.nc?.name || '').trim(), m = (c.nc?.mobile || '').replace(/[^\d+]/g, '');
  if (!n) return coErr('Enter the customer name.');
  if (m.replace(/\D/g, '').length < 10) return coErr('Enter a valid mobile number.');
  try {
    const ex = await db.from('customers').select('id,name,mobile,house_no,village_locality,district,state,pincode,landmark').eq('client_id', S.clientId).eq('mobile', m).limit(1);
    if (ex.error) throw ex.error;
    if (ex.data && ex.data[0]) { c.customer = ex.data[0]; toast('Existing customer selected'); }
    else {
      const ins = await db.from('customers').insert({ client_id: S.clientId, name: n, mobile: m }).select('id,name,mobile,house_no,village_locality,district,state,pincode,landmark').single();
      if (ins.error) throw ins.error; c.customer = ins.data;
    }
    c.showNew = false; c.addrFor = null; renderCreate();
  } catch (e) { coErr(friendly(e)); }
}
function coErr(m) { S.co.err = m; const e = $('coErr'); if (e) { e.textContent = m; e.hidden = !m; e.scrollIntoView({ block: 'nearest' }); } }
function coNext() { const m = coValidate(S.co.step); if (m) return coErr(m); S.co.step++; renderCreate(); $('sheetBody').scrollTop = 0; }

async function coSubmit() {
  const c = S.co; if (c.busy) return;
  const m = coValidate(4); if (m) return coErr(m);
  c.busy = true; $('coNext').disabled = true; $('coNext').textContent = 'Creating…';
  const a = c.addr, clean = Object.fromEntries(Object.entries(a).filter(([, v]) => String(v || '').trim()));
  const items = c.items.map((i) => ({
    product_title_snapshot: i.title.trim(), quantity: parseInt(i.qty, 10), unit_price: num(i.price), discount_amount: num(i.discount), tax_amount: 0,
    color: i.color.trim() || null, size: i.size.trim() || null, fabric: i.fabric.trim() || null, variant: {}, metadata: {}
  }));
  try {
    const res = await rpc('create_order', {
      p_customer_id: c.customer.id, p_items: items, p_source_channel: 'manual', p_source_reference: null, p_source_conversation_id: null, p_source_message_id: null,
      p_lead_id: null, p_status: c.status, p_payment_status: c.pay, p_order_discount: num(c.discount), p_shipping_amount: num(c.shipping), p_tax_amount: num(c.tax),
      p_delivery_address: Object.values(clean).join(', ') || null, p_delivery_address_json: clean, p_customer_note: c.cnote.trim() || null, p_internal_note: c.inote.trim() || null,
      p_automation_mode: 'manual', p_requires_human_review: false, p_idempotency_key: c.key
    });
    S.co = null; closeSheet(); toast('Order created');
    const id = res?.id || res?.order?.id || res?.order_id || (Array.isArray(res) && res[0]?.id);
    await Promise.all([loadList(true), loadSummary()]);
    if (id) openDetail(id);
  } catch (e) { c.busy = false; renderCreate(); coErr(friendly(e) + ' Your details are kept — you can try again safely.'); }
}

/* generic input binding inside the sheet */
function setPath(obj, path, val) { const p = path.split('.'); let o = obj; for (let i = 0; i < p.length - 1; i++) o = o[p[i]] ??= {}; o[p[p.length - 1]] = val; }
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'search') { clearTimeout(coT); coT = setTimeout(() => { S.search = t.value; loadList(true); }, 350); return; }
  if (t.id === 'coSearch' && S.co) { S.co.search = t.value; clearTimeout(coT); coT = setTimeout(coSearch, 300); return; }
  if (t.dataset && t.dataset.f && S.co) {
    const path = t.dataset.f; setPath(S.co, path.startsWith('items.') ? path.replace(/^items\.(\d+)\./, 'items.$1.') : path, t.type === 'checkbox' ? t.checked : t.value);
    if (path.startsWith('items.') || ['discount', 'shipping', 'tax'].includes(path)) { const el = $('coSub'); if (el) el.textContent = money(coTotals().sub); }
  }
});
document.addEventListener('change', (e) => { const t = e.target; if (t.dataset && t.dataset.f && S.co && t.tagName === 'SELECT') setPath(S.co, t.dataset.f, t.value); });

/* =========================================================
   EVENTS
   ========================================================= */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  switch (a) {
    case 'menu': $('sidebar').classList.toggle('open'); $('navScrim').classList.toggle('open'); break;
    case 'tab': S.tab = t.dataset.tab; renderTabs(); loadList(true); break;
    case 'open': openDetail(t.dataset.id); break;
    case 'back': closeDetail(); break;
    case 'create': openCreate(); break;
    case 'filters': openFilters(); break;
    case 'apply-filters': applyFilters(); break;
    case 'clear': clearFilters(); break;
    case 'loadmore': loadList(false); break;
    case 'retry': loadList(true); loadSummary(); break;
    case 'retry-detail': S.detailState = 'loading'; renderDetail(); loadDetail(); break;
    case 'refresh-detail': S.detailState = 'loading'; renderDetail(); loadDetail(); break;
    case 'close-sheet': closeSheet(); break;
    case 'more': openMore(); break;
    case 'tr': if (t.dataset.fromSheet) closeSheet(); doTransition(t.dataset.to); break;
    case 'fulfil': openFulfil(); break;
    case 'save-fulfil': saveFulfil(); break;
    case 'edit': openEdit(); break;
    case 'save-edit': saveEdit(); break;
    case 'review': requestReview(); break;
    case 'approve': decideAction(t.dataset.id, true, t.dataset.risk); break;
    case 'reject': decideAction(t.dataset.id, false); break;
    case 'modal-cancel': finishModal(null); break;
    case 'modal-ok': { const r = $('mReason'); const val = r ? r.value.trim() : ''; if (t.dataset.req === '1' && !val) { $('mErr').hidden = false; r.focus(); break; } finishModal({ reason: val }); break; }
    /* create flow */
    case 'co-pick': S.co.customer = S.co.results[+t.dataset.i]; S.co.addrFor = null; renderCreate(); break;
    case 'co-unpick': S.co.customer = null; S.co.addrFor = null; renderCreate(); break;
    case 'co-togglenew': S.co.showNew = !S.co.showNew; renderCreate(); break;
    case 'co-savenew': coSaveNew(); break;
    case 'co-add': S.co.items.push(blankItem()); renderCreate(); break;
    case 'co-rm': S.co.items.splice(+t.dataset.i, 1); renderCreate(); break;
    case 'co-prev': S.co.step = Math.max(0, S.co.step - 1); renderCreate(); break;
    case 'co-next': coNext(); break;
    case 'co-submit': coSubmit(); break;
    default: break;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('modalRoot').hidden) finishModal(null);
  else if (!$('sheetRoot').hidden) closeSheet();
  else if ($('sidebar').classList.contains('open')) { $('sidebar').classList.remove('open'); $('navScrim').classList.remove('open'); }
});
window.addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('id');
  if (id) openDetail(id, false); else closeDetail(false);
});
$('logout').onclick = async () => { await db.auth.signOut(); location.href = 'login.html'; };

/* =========================================================
   BOOT
   ========================================================= */
async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { location.href = 'login.html'; return; }
  const { data: c, error } = await db.from('client_data').select('client_id,business_name,name,full_name').eq('auth_user_id', session.user.id).maybeSingle();
  if (error || !c?.client_id) throw new Error(error?.message || 'Client account not found');
  S.clientId = c.client_id;
  $('businessName').textContent = c.business_name || c.name || c.full_name || 'Business';
  $('clientId').textContent = S.clientId;
  renderTabs(); renderStats();
  $('boot').remove();
  const id = new URLSearchParams(location.search).get('id');
  refreshAll();
  if (id) openDetail(id, false);
}
boot().catch((e) => {
  console.error('[GLIME Orders] boot', e);
  const b = $('boot'); if (b) b.innerHTML = '<span>Couldn\'t open Orders. Please refresh or sign in again.</span><a class="btn primary" href="login.html">Go to login</a>';
});
})();
