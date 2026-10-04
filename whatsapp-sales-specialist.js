/*
 * GLIME — WhatsApp Sales Specialist (single file)
 * Replaces: whatsapp-sales-context-addon.js, whatsapp-handoff-addon.js,
 *           whatsapp-mobile-ui-addon.js (all merged here).
 * One Supabase client, no polling, no MutationObserver.
 */
(() => {
'use strict';

const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const MODULE = 'whatsapp_ai_sales_agent';
const SEEN_KEY = 'glime_wa_seen_v1';
const FB_APP_ID = '1682940610216509';
const FB_VERSION = 'v26.0';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);
const isTouch = window.matchMedia && matchMedia('(pointer:coarse)').matches;
const isMobile = () => window.innerWidth < 900;

const st = {
  user: null, clientId: null, connection: null,
  convs: [], msgs: [], sel: null,
  filter: 'all', search: '',
  services: [], business: null, knowledge: [],
  mode: readMode(),
  aiSession: sessionStorage.getItem('glime_ai_session') || null,
  seen: readSeen(), pushed: false, ctxToken: 0, msgToken: 0,
  mediaCache: new Map(), booted: false
};

function readMode() {
  const m = localStorage.getItem('glime_whatsapp_mode');
  return ['auto', 'approval', 'manual'].includes(m) ? m : 'auto';
}
function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function saveSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(st.seen)); } catch (_) {}
}

/* ---------------- helpers ---------------- */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}
function linkify(escaped) {
  return escaped.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g,
    u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}
function normPhone(v) { return String(v || '').replace(/\D/g, ''); }
function samePhone(a, b) {
  a = normPhone(a); b = normPhone(b);
  return !!a && !!b && a.slice(-10) === b.slice(-10);
}
function fmtTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function fmtAmount(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return isNaN(n) ? esc(v) : '₹' + n.toLocaleString('en-IN');
}
function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
function dayLabel(v) {
  const d = new Date(v), diff = Math.round((dayStart(new Date()) - dayStart(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
function listTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  const diff = Math.round((dayStart(new Date()) - dayStart(d)) / 86400000);
  if (diff === 0) return fmtTime(v);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function initial(c) { return String(c?.customer_name || c?.customer_phone || 'W').trim().slice(0, 1).toUpperCase() || 'W'; }
function convTitle(c) { return c?.customer_name || c?.customer_phone || 'Customer'; }

let toastTimer;
function toast(msg, error = false) {
  let x = document.querySelector('.toast');
  if (!x) { x = document.createElement('div'); document.body.appendChild(x); }
  x.className = 'toast' + (error ? ' error' : '');
  x.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => x.remove(), 3400);
}

/* Edge function call — surfaces the real server error instead of a generic one */
async function fn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message || 'Function request failed';
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        msg = j.error || j.message || msg;
      }
    } catch (_) {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : (data.error.message || 'Request failed'));
  return data || {};
}

/* ---------------- session ---------------- */
async function session() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  if (!data.session) { location.href = 'login.html'; return null; }
  st.user = data.session.user;

  const { data: c, error: e } = await sb.from('client_data')
    .select('client_id,business_name,name,full_name')
    .eq('auth_user_id', st.user.id).maybeSingle();
  if (e) throw e;
  if (!c?.client_id) throw new Error('Client account not found');

  st.clientId = c.client_id;
  $('businessName').textContent = c.business_name || c.name || c.full_name || 'Business';
  $('clientId').textContent = c.client_id;
  return data.session;
}

/* ---------------- connection ---------------- */
async function loadConnection() {
  try {
    const d = await fn('whatsapp-connection', { action: 'status' });
    st.connection = d.connection || d;
    paintConnection(st.connection?.status === 'connected');
  } catch (e) {
    console.warn('[WA] connection status failed:', e.message);
    paintConnection(false, true);
  }
}
function paintConnection(on, failed) {
  const b = $('connection');
  b.className = 'connection-badge ' + (on ? 'online' : 'offline');
  b.textContent = on ? '● WhatsApp connected' : failed ? '● Status unavailable' : '● Not connected';
  $('connectBtn').textContent = on ? 'Connected' : 'Connect';
}

/* ---------------- catalog ---------------- */
async function loadServices() {
  try {
    const r = await fn('catalog-context', {});
    st.business = r.business || null;
    st.knowledge = Array.isArray(r.knowledge) ? r.knowledge : [];
    st.services = (Array.isArray(r.catalog) ? r.catalog : []).map(i => ({ ...i, short_desc: i.short_description || i.description || '' }));
  } catch (e) {
    console.warn('[WA] catalog-context failed:', e.message);
    st.business = null; st.knowledge = []; st.services = [];
  }
  renderServices();
}
function renderServices() {
  const active = st.services.filter(s => s.status === 'active' || s.status === 'published');
  const rows = (active.length ? active : st.services).slice(0, 8);
  $('serviceContext').innerHTML = rows.map(s =>
    `<div class="service-chip"><b>${esc(s.name || s.title || 'Service')}</b><span>${esc(s.short_desc || 'Catalog service')}</span></div>`
  ).join('') || '<span>No services published yet.</span>';
}

/* ---------------- conversations ---------------- */
async function loadConversations() {
  let q = sb.from('whatsapp_conversations').select('*')
    .eq('client_id', st.clientId)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (st.filter !== 'all') q = q.eq('status', st.filter);
  const { data, error } = await q.limit(150);
  if (error) throw error;
  st.convs = data || [];
  if (st.sel) {
    const f = st.convs.find(x => x.id === st.sel.id);
    if (f) { st.sel = { ...st.sel, ...f }; paintHeader(); }
  }
  renderList();
}

function isUnread(c) {
  if (st.sel?.id === c.id) return false;
  if (c.last_message_direction !== 'inbound' || !c.last_message_at) return false;
  return new Date(c.last_message_at) > new Date(st.seen[c.id] || 0);
}
function markSeen(c) {
  st.seen[c.id] = c.last_message_at || new Date().toISOString();
  saveSeen();
}

function renderList() {
  const s = st.search.toLowerCase().trim();
  const rows = st.convs.filter(c => !s ||
    `${c.customer_name || ''} ${c.customer_phone || ''} ${c.last_message_preview || ''}`.toLowerCase().includes(s));

  $('list').innerHTML = rows.map(c => {
    const un = isUnread(c);
    const prev = c.last_message_preview || c.customer_phone || '';
    const tick = c.last_message_direction === 'outbound' ? '<i class="tk">✓✓</i>' : '';
    return `<div class="conv ${st.sel?.id === c.id ? 'active' : ''} ${un ? 'unread' : ''}" data-id="${esc(c.id)}">
      <div class="avatar">${esc(initial(c))}</div>
      <div class="conv-copy">
        <div class="conv-top"><b>${esc(convTitle(c))}</b><span class="conv-time">${esc(listTime(c.last_message_at || c.updated_at))}</span></div>
        <div class="conv-sub"><span class="conv-preview">${tick}${esc(prev)}</span>${c.status === 'closed' ? '<span class="conv-closed">Closed</span>' : ''}${un ? '<span class="conv-dot"></span>' : ''}</div>
      </div>
    </div>`;
  }).join('') || '<div class="loading-state">No WhatsApp conversations yet.</div>';
}

/* ---------------- open / close chat pane ---------------- */
async function openConv(id) {
  const c = st.convs.find(x => x.id === id) || (st.sel && st.sel.id === id ? st.sel : null);
  if (!c) return;
  st.sel = c;
  markSeen(c);

  document.body.classList.add('chat-open');
  if (isMobile() && !st.pushed) { history.pushState({ wa: 1 }, ''); st.pushed = true; }

  $('emptyChat').classList.add('hidden');
  $('chatView').classList.remove('hidden');
  $('aiSuggestion').classList.add('hidden');
  $('approvalBox').classList.add('hidden');
  $('messages').innerHTML = '<div class="loading-state">Loading messages…</div>';
  paintHeader();
  renderList();

  await Promise.all([loadMessages(id), loadContext(c), loadPending()]);
}

function closeChatPane() {
  document.body.classList.remove('chat-open');
  setSheet(false);
  st.sel = null;
  st.msgToken++; st.ctxToken++;
  $('chatView').classList.add('hidden');
  $('emptyChat').classList.remove('hidden');
  renderList();
}
function backToInbox() {
  if (st.pushed) history.back(); else closeChatPane();
}
window.addEventListener('popstate', () => {
  if (st.pushed) { st.pushed = false; closeChatPane(); }
});

function paintHeader() {
  const c = st.sel;
  if (!c) return;
  $('name').textContent = convTitle(c);
  $('phone').textContent = c.customer_phone || '—';
  $('avatar').textContent = initial(c);
  $('ctxName').textContent = convTitle(c);
  $('ctxPhone').textContent = c.customer_phone || '—';

  const closed = c.status === 'closed';
  const tb = $('toggleStatus');
  tb.title = tb.ariaLabel = closed ? 'Reopen conversation' : 'Close conversation';
  tb.querySelector('use').setAttribute('href', closed ? '#i-refresh' : '#i-check');

  // WhatsApp 24-hour customer-service window
  const li = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : 0;
  $('winChip').classList.toggle('hidden', !!li && Date.now() - li < 86400000);
}

/* ---------------- messages ---------------- */
async function loadMessages(id) {
  const token = ++st.msgToken;
  // newest 300 (ascending order alone would return the OLDEST 300)
  const { data, error } = await sb.from('whatsapp_messages').select('*')
    .eq('client_id', st.clientId).eq('conversation_id', id)
    .order('created_at', { ascending: false }).limit(300);
  if (error) { if (token === st.msgToken) toast(error.message, true); return; }
  if (token !== st.msgToken || !st.sel || st.sel.id !== id) return;
  st.msgs = (data || []).reverse();
  renderMessages(true);
}

function mtype(m) {
  const t = String(m?.message_type || '').toLowerCase();
  if (t === 'image' || t === 'photo') return 'image';
  if (t === 'video') return 'video';
  if (t === 'audio' || t === 'voice') return 'audio';
  if (t === 'document' || t === 'file') return 'document';
  return '';
}
function mstorage(m) {
  const s = m?.metadata?.media_storage;
  if (!s) return null;
  if (typeof s === 'string') return { path: s };
  return typeof s === 'object' ? s : null;
}
function safeUrl(u) {
  if (!u) return '';
  try { const p = new URL(u, location.href); return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : ''; } catch (_) { return ''; }
}
async function resolveMedia(m) {
  const s = mstorage(m);
  if (!s) return '';
  const direct = safeUrl(s.url || s.public_url || s.signed_url || s.download_url || s.src);
  if (direct) return direct;
  const path = s.path || s.storage_path || s.object_path || s.file_path;
  if (!path) return '';
  const key = m.id, hit = st.mediaCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  try {
    const { data, error } = await sb.storage.from(s.bucket || s.storage_bucket || 'client-assets').createSignedUrl(path, 3600);
    if (error) throw error;
    const url = safeUrl(data?.signedUrl);
    if (url) st.mediaCache.set(key, { url, exp: Date.now() + 3000 * 1000 });
    return url;
  } catch (e) { console.warn('[WA] media url failed:', e); return ''; }
}
function mdoc(m) {
  const s = mstorage(m) || {};
  return { name: s.file_name || s.filename || s.name || m.file_name || 'Document', mime: (s.mime_type || s.mimeType || m.mime_type || '').toLowerCase() };
}

function bodyHtml(m) {
  const type = mtype(m), cap = m.text_body || '';
  const capHtml = cap ? `<div class="cap">${linkify(esc(cap))}</div>` : '';
  if (!type) return linkify(esc(cap || m.message_type || ''));
  if (!mstorage(m)) {
    const lbl = { image: '📷 Photo', video: '🎥 Video', audio: '🎵 Audio', document: '📄 Document' }[type];
    return `<div class="wa-unavail">${lbl}<small>Media preview unavailable</small></div>${capHtml}`;
  }
  const id = esc(m.id || '');
  const load = `<span class="wa-loading" data-load="${id}">Loading…</span>`;
  if (type === 'document') {
    const d = mdoc(m);
    return `<a class="wa-doc" data-link="${id}" href="#" target="_blank" rel="noopener noreferrer"><span>📄</span><span><b>${esc(d.name)}</b><small>${esc(d.mime || 'Document')}</small></span></a>${capHtml}`;
  }
  if (type === 'image') return `<a data-link="${id}" href="#" target="_blank" rel="noopener noreferrer"><img class="wa-media-image" data-img="${id}" alt="Photo" loading="lazy"></a>${capHtml}${load}`;
  if (type === 'video') return `<video class="wa-media-video" data-vid="${id}" controls playsinline preload="metadata"></video>${capHtml}${load}`;
  return `<audio class="wa-media-audio" data-aud="${id}" controls preload="metadata"></audio>${capHtml}${load}`;
}

function ticks(m) {
  if (m.direction !== 'outbound') return '';
  const s = String(m.status || '').toLowerCase();
  if (s === 'failed' || s === 'error') return '<i class="tk fail">!</i>';
  if (s === 'read') return '<i class="tk read">✓✓</i>';
  if (s === 'delivered') return '<i class="tk">✓✓</i>';
  return '<i class="tk">✓</i>';
}

function renderMessages(forceBottom) {
  const box = $('messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const GAP = 5 * 60 * 1000;
  const list = st.msgs;
  const same = (a, b) => a && b && a.direction === b.direction &&
    dayStart(new Date(a.created_at)) === dayStart(new Date(b.created_at)) &&
    Math.abs(new Date(b.created_at) - new Date(a.created_at)) < GAP;

  let html = '';
  list.forEach((m, i) => {
    const prev = list[i - 1], next = list[i + 1];
    if (!prev || dayStart(new Date(prev.created_at)) !== dayStart(new Date(m.created_at))) {
      html += `<div class="day">${esc(dayLabel(m.created_at))}</div>`;
    }
    const first = !same(prev, m), last = !same(m, next);
    const dir = m.direction === 'outbound' ? 'out' : 'in';
    html += `<div class="row ${dir} ${first ? 'first' : ''} ${last ? 'last' : ''}"><div class="bubble ${mtype(m) ? 'has-media' : ''}">${bodyHtml(m)}<span class="meta">${esc(fmtTime(m.created_at))}${ticks(m)}</span></div></div>`;
  });
  box.innerHTML = html || '<div class="loading-state">No messages in this conversation.</div>';

  if (forceBottom || nearBottom) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  hydrateMedia(box);
}

async function hydrateMedia(box) {
  const items = st.msgs.filter(m => mtype(m) && mstorage(m));
  await Promise.all(items.map(async m => {
    const id = String(m.id), q = s => box.querySelector(`[${s}="${CSS.escape(id)}"]`);
    const url = await resolveMedia(m);
    const loading = q('data-load');
    if (!url) { if (loading) { loading.textContent = 'Media unavailable'; loading.classList.add('error'); } return; }
    box.querySelectorAll(`[data-link="${CSS.escape(id)}"]`).forEach(a => { a.href = url; });
    const img = q('data-img'), vid = q('data-vid'), aud = q('data-aud');
    if (img) { img.addEventListener('load', () => loading && loading.remove(), { once: true }); img.src = url; }
    if (vid) { vid.addEventListener('loadedmetadata', () => loading && loading.remove(), { once: true }); vid.src = url; }
    if (aud) { aud.addEventListener('loadedmetadata', () => loading && loading.remove(), { once: true }); aud.src = url; }
    if (!img && !vid && !aud && loading) loading.remove();
  }));
}

/* ---------------- customer context ---------------- */
function addressOf(c) {
  return c ? [c.house_no, c.village_locality, c.landmark, c.district, c.state, c.pincode].filter(Boolean).join(', ') : '';
}

async function loadContext(conv) {
  const token = ++st.ctxToken;
  const cid = st.clientId;
  try {
    let customer = null, lead = null;

    if (conv.customer_id) {
      ({ data: customer } = await sb.from('customers').select('*').eq('id', conv.customer_id).eq('client_id', cid).maybeSingle());
    }
    if (!customer && conv.customer_phone) {
      ({ data: customer } = await sb.from('customers').select('*').eq('mobile', conv.customer_phone).eq('client_id', cid).maybeSingle());
    }
    if (conv.lead_id) {
      ({ data: lead } = await sb.from('leads').select('*').eq('id', conv.lead_id).eq('client_id', cid).maybeSingle());
    }
    if (!lead && customer?.id) {
      ({ data: lead } = await sb.from('leads').select('*').eq('customer_id', customer.id).eq('client_id', cid).order('updated_at', { ascending: false }).limit(1).maybeSingle());
    }
    if (token !== st.ctxToken) return;

    const [tl, fu, orders] = await Promise.all([
      lead?.id ? sb.from('lead_timeline').select('event_type,title,description,created_at').eq('client_id', cid).eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(8) : { data: [] },
      lead?.id ? Promise.all([
        sb.from('client_followup_leads').select('enabled,preferred_channel').eq('client_id', cid).eq('lead_id', lead.id).maybeSingle(),
        sb.from('follow_up_cases').select('status,channel').eq('client_id', cid).eq('lead_id', lead.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('follow_up_conclusions').select('summary,stage,next_action').eq('client_id', cid).eq('lead_id', lead.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      ]) : null,
      findOrders(conv, customer, lead)
    ]);
    if (token !== st.ctxToken) return;

    st.sel.lead = lead; st.sel.customerRow = customer;
    paintContext(conv, customer, lead, tl.data || [], fu ? { settings: fu[0].data, kase: fu[1].data, concl: fu[2].data } : null, orders);
  } catch (e) {
    console.warn('[WA] context failed:', e);
  }
}

async function findOrders(conv, customer, lead) {
  const cid = st.clientId, cols = 'id,product_title,total_amount,status,payment_status,created_at';
  const tries = [
    () => sb.from('orders').select(cols).eq('client_id', cid).eq('source_conversation_id', conv.id),
    () => customer?.id ? sb.from('orders').select(cols).eq('client_id', cid).eq('customer_id', customer.id) : null,
    () => lead?.id ? sb.from('orders').select(cols).eq('client_id', cid).eq('lead_id', lead.id) : null
  ];
  for (const t of tries) {
    const q = t();
    if (!q) continue;
    const { data } = await q.order('created_at', { ascending: false }).limit(5);
    if (data && data.length) return data;
  }
  return [];
}

function paintContext(conv, customer, lead, timeline, fu, orders) {
  $('ctxName').textContent = customer?.name || conv.customer_name || conv.customer_phone || 'Customer';
  $('ctxPhone').textContent = customer?.mobile || conv.customer_phone || '—';
  $('ctxCustomer').textContent = customer ? (addressOf(customer) || 'No address on file') : 'Customer profile not linked';

  $('leadStatus').textContent = lead ? 'Lead' : 'New';
  $('leadInterest').textContent = lead?.interest || '—';
  $('leadBudget').textContent = lead?.budget ? `${lead.budget} ${lead.budget_currency || 'INR'}` : '—';
  $('leadProduct').textContent = lead?.product_service || '—';
  $('leadSource').textContent = lead?.source || 'whatsapp';
  $('openLead').href = lead?.id ? `leads.html?lead=${encodeURIComponent(lead.id)}` : 'leads.html';
  $('addLead').textContent = lead ? '✓ Already a Lead' : '＋ Add to Leads';
  $('addLead').disabled = !!lead;

  const row = (k, v) => `<div class="ctx-row"><span>${k}</span><strong>${v}</strong></div>`;
  let h = '';

  h += `<div class="context-card"><div class="card-label">CUSTOMER</div>` + (customer
    ? row('Name', esc(customer.name || '—')) + row('Phone', esc(customer.mobile || '—')) + row('Address', esc(addressOf(customer) || 'No address on file')) +
      `<a class="ctx-link" href="customer.html?id=${encodeURIComponent(customer.id)}">Open customer profile →</a>`
    : '<div class="context-muted">Customer profile not linked</div>') + '</div>';

  let fuHtml = '<div class="context-muted">No follow-up activity yet</div>';
  if (fu) {
    const r = [];
    if (fu.settings) { r.push(row('Enabled', fu.settings.enabled ? 'Yes' : 'No'), row('Channel', esc(fu.settings.preferred_channel || '—'))); }
    if (fu.kase) r.push(row('Case', esc(fu.kase.status || '—')));
    if (fu.concl) {
      r.push(row('Stage', esc(fu.concl.stage || '—')), row('Next action', esc(fu.concl.next_action || '—')));
      if (fu.concl.summary) r.push(`<div class="ctx-note">${esc(fu.concl.summary)}</div>`);
    }
    if (r.length) fuHtml = r.join('');
  } else if (!lead) fuHtml = '<div class="context-muted">No existing GLIME follow-up</div>';
  h += `<div class="context-card"><div class="card-label">FOLLOW-UP</div>${fuHtml}<a class="ctx-link" href="follow-up.html">Open Follow-up →</a></div>`;

  if (orders && orders.length) {
    const o = orders[0];
    h += `<div class="context-card"><div class="card-label">ORDERS</div>${row('Total found', orders.length)}${row('Latest', esc(o.product_title || '—'))}${row('Amount', fmtAmount(o.total_amount))}${row('Status', esc(o.status || '—') + ' · ' + esc(o.payment_status || '—'))}${row('Date', esc(fmtDate(o.created_at)))}<a class="ctx-link" href="orders.html">View Orders →</a></div>`;
  } else {
    h += `<div class="context-card"><div class="card-label">ORDERS</div><div class="context-muted">No existing orders</div><a class="ctx-link" href="orders.html">View Orders →</a></div>`;
  }

  h += `<div class="context-card"><div class="card-label">TIMELINE</div><div class="timeline">` +
    (timeline.length ? timeline.map(t => `<div class="timeline-item"><strong>${esc(t.title || t.event_type || 'Event')}</strong><small>${esc(t.description || '')}${t.description ? ' · ' : ''}${esc(fmtDate(t.created_at))}</small></div>`).join('') : '<span>No events yet.</span>') +
    '</div></div>';

  $('ctxDynamic').innerHTML = h;
}

function setSheet(open) {
  $('context').classList.toggle('open', !!open);
}

/* ---------------- sending ---------------- */
function autosize() {
  const t = $('input');
  t.style.height = '42px';
  t.style.height = Math.min(t.scrollHeight, 130) + 'px';
}

async function sendMessage() {
  if (!st.sel) return toast('Select a conversation first');
  const text = $('input').value.trim();
  if (!text) return;

  $('send').disabled = true;
  try {
    if (st.mode === 'manual') {
      const d = await fn('whatsapp-manual-send', { conversation_id: st.sel.id, message: text });
      if (!d.ok) throw new Error(d.error || 'Manual send failed');
      toast('Message sent');
    } else {
      const d = await fn('whatsapp-action-request', { conversation_id: st.sel.id, message: text, mode: st.mode });
      if (st.mode === 'auto' && d.job_id) {
        await fn('business-action-executor', { job_id: d.job_id });
        toast('AI message sent');
      } else {
        toast(d.message || 'Reply is waiting for approval');
      }
    }
    $('input').value = ''; autosize();
    await Promise.all([loadMessages(st.sel.id), loadConversations(), loadPending()]);
  } catch (e) {
    toast(e.message, true);
  } finally {
    $('send').disabled = false;
  }
}

/* ---------------- approval ---------------- */
async function loadPending() {
  if (!st.sel) return;
  const id = st.sel.id;
  const { data } = await sb.from('client_action_requests')
    .select('id,status,action_payload,created_at')
    .eq('client_id', st.clientId).eq('target_module_slug', MODULE)
    .eq('target_action', 'message').eq('target_id', id).eq('status', 'proposed')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!st.sel || st.sel.id !== id) return;
  const box = $('approvalBox');
  if (!data) { box.classList.add('hidden'); box.dataset.id = ''; return; }
  box.dataset.id = data.id;
  $('approvalText').textContent = data.action_payload?.message || '';
  box.classList.remove('hidden');
}

async function approvePending() {
  const id = $('approvalBox').dataset.id;
  if (!id) return;
  $('approveBtn').disabled = true;
  try {
    const { data, error } = await sb.rpc('approve_client_business_action', { p_action_request_id: id });
    if (error) throw error;
    if (data?.job_id) await fn('business-action-executor', { job_id: data.job_id });
    toast('Approved and sent');
    await Promise.all([loadPending(), loadMessages(st.sel.id), loadConversations()]);
  } catch (e) { toast(e.message, true); }
  finally { $('approveBtn').disabled = false; }
}
async function rejectPending() {
  const id = $('approvalBox').dataset.id;
  if (!id) return;
  try {
    const { error } = await sb.rpc('reject_client_business_action', { p_action_request_id: id });
    if (error) throw error;
    toast('Reply rejected');
    await loadPending();
  } catch (e) { toast(e.message, true); }
}

/* ---------------- AI suggestion ---------------- */
async function suggestReply() {
  if (!st.sel) return toast('Select a conversation first');
  $('suggest').disabled = true;
  try {
    const recent = st.msgs.slice(-12).map(m => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.text_body || ''}`).join('\n');
    const catalog = st.services.slice(0, 20).map(s => {
      const p = [`${s.name || s.title || ''}: ${s.short_desc || s.description || ''}`];
      if (s.price != null && s.price !== '') p.push(`Price: ${s.price} ${s.currency || ''}`.trim());
      if (s.offer_type) p.push(`Type: ${s.offer_type}`);
      if (s.sales_talking_points) p.push(`Talking points: ${s.sales_talking_points}`);
      if (s.allowed_claims) p.push(`Allowed claims: ${s.allowed_claims}`);
      if (s.restrictions) p.push(`Restrictions: ${s.restrictions}`);
      if (s.customer_eligibility) p.push(`Eligibility: ${s.customer_eligibility}`);
      if (s.ai_knowledge_summary) p.push(`AI knowledge: ${s.ai_knowledge_summary}`);
      return p.join(' | ');
    }).join('\n');
    const knowledge = st.knowledge.slice(0, 20).map(k => `${k.title || 'Knowledge'}: ${k.content || ''}`).join('\n');

    const message = `You are drafting a WhatsApp sales reply for GLIME's client.

Use ONLY the supplied business context, business knowledge, offer catalog and conversation context.

Do not invent information.

Business context:
${st.business ? JSON.stringify(st.business) : '{}'}

Business knowledge:
${knowledge || 'None provided'}

Conversation:
${recent || 'No conversation history provided'}

Business offer catalog:
${catalog || 'No catalog information provided'}

Rules:
- Write ONLY the suggested customer-facing reply.
- Be concise and natural.
- Match the customer's language.
- Do not invent prices, discounts, policies, eligibility requirements, features or claims.
- Do not promise anything that is not present in the supplied context.
- Use the actual catalog information when answering product/service questions.
- Respect restrictions and allowed claims.
- If the supplied context does not contain the answer, ask a concise clarifying question instead of guessing.
- Do not mention internal context, AI, prompts, catalog processing, or these rules.`;

    const r = await fetch(`${SUPABASE_URL}/functions/v1/glime-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat', sessionToken: st.aiSession, message })
    });
    const d = await r.json().catch(() => ({}));
    if (d.sessionToken) { st.aiSession = d.sessionToken; sessionStorage.setItem('glime_ai_session', d.sessionToken); }
    if (!r.ok) throw new Error(d.error || 'AI unavailable');

    $('suggestionText').textContent = d.reply || 'No suggestion returned.';
    $('aiSuggestion').classList.remove('hidden');
  } catch (e) {
    console.error('[WA] AI suggestion error:', e);
    toast(e.message, true);
  } finally {
    $('suggest').disabled = false;
  }
}

/* ---------------- lead / status ---------------- */
async function addToLeads() {
  const c = st.sel;
  if (!c) return;
  $('addLead').disabled = true;
  try {
    let lead = c.lead;
    if (!lead) {
      const p = String(c.customer_phone || '').replace(/[^\d+]/g, '');
      if (p) {
        const { data } = await sb.from('leads').select('*').eq('client_id', st.clientId)
          .or(`mobile.eq.${p},whatsapp.eq.${p}`).limit(1).maybeSingle();
        lead = data;
      }
    }
    if (lead) {
      toast('Customer is already a lead');
    } else {
      let customer = st.sel.customerRow || null;
      const { data: nl, error } = await sb.from('leads').insert({
        client_id: st.clientId,
        customer_id: c.customer_id || customer?.id || null,
        name: c.customer_name || customer?.name || 'WhatsApp Lead',
        mobile: c.customer_phone, whatsapp: c.customer_phone,
        source: 'whatsapp', source_ref: c.id,
        interest: null, product_service: null, status: 'new', priority: 'normal'
      }).select('*').single();
      if (error) throw error;
      lead = nl;

      const { data: upd, error: ue } = await sb.from('whatsapp_conversations')
        .update({ lead_id: lead.id }).eq('id', c.id).eq('client_id', st.clientId).select('id');
      if (ue) throw ue;
      if (!upd || !upd.length) console.warn('[WA] conversation was not linked to lead');
      toast('Lead created');
    }
    st.sel.lead_id = lead.id;
    await Promise.all([loadContext(st.sel), loadConversations()]);
  } catch (e) {
    toast(e.message, true);
    $('addLead').disabled = false;
  }
}

async function toggleStatus() {
  const c = st.sel;
  if (!c) return;
  const next = c.status === 'closed' ? 'open' : 'closed';
  const { data, error } = await sb.from('whatsapp_conversations')
    .update({ status: next }).eq('id', c.id).eq('client_id', st.clientId).select('id,status');
  if (error) return toast(error.message, true);
  if (!data || !data.length) return toast('Could not update the conversation', true);
  c.status = next;
  paintHeader();
  await loadConversations();
  toast(next === 'closed' ? 'Conversation closed' : 'Conversation reopened');
}

/* ---------------- AI mode ---------------- */
function setMode(mode) {
  st.mode = mode;
  localStorage.setItem('glime_whatsapp_mode', mode);
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('modeChip').textContent = mode === 'auto' ? 'AUTO · AI can send' : mode === 'approval' ? 'AI + APPROVAL' : 'MANUAL';
}

/* ---------------- Instagram / Lead → WhatsApp handoff ---------------- */
async function handoff() {
  let leadId = '', phone = '';
  try {
    const p = new URLSearchParams(location.search);
    leadId = String(p.get('lead') || '').trim();
    phone = normPhone(p.get('phone') || '');
  } catch (_) {}
  if (!leadId && !phone) return;

  let target = st.convs.find(c => leadId && c.lead_id === leadId) ||
             st.convs.find(c => phone && samePhone(c.customer_phone, phone));

  if (!target) {
    let q = sb.from('whatsapp_conversations').select('*').eq('client_id', st.clientId);
    const ors = [];
    if (leadId && /^[0-9a-f-]{36}$/i.test(leadId)) ors.push(`lead_id.eq.${leadId}`);
    if (phone) ors.push(`customer_phone.ilike.%${phone.slice(-10)}`);
    if (ors.length) {
      const { data } = await q.or(ors.join(',')).order('last_message_at', { ascending: false, nullsFirst: false }).limit(1);
      if (data && data[0]) { target = data[0]; st.convs = [target, ...st.convs.filter(c => c.id !== target.id)]; renderList(); }
    }
  }

  try {
    const url = new URL(location.href);
    url.searchParams.delete('lead'); url.searchParams.delete('phone');
    history.replaceState({}, document.title, url.pathname + (url.search || '') + url.hash);
  } catch (_) {}

  if (target) { await openConv(target.id); toast('WhatsApp conversation opened'); }
  else toast('WhatsApp conversation not found — select it manually', true);
}

/* ---------------- connect WhatsApp ---------------- */
function loadFB() {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = function () {
      window.FB.init({ appId: FB_APP_ID, cookie: true, xfbml: false, version: FB_VERSION });
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
    s.onerror = () => reject(new Error('Could not load the Meta SDK. Check your connection and try again.'));
    document.head.appendChild(s);
  });
}

async function connectStart() {
  const status = $('connectStatus');
  $('startConnect').disabled = true;
  try {
    const d = await fn('whatsapp-connection', { action: 'start' });
    sessionStorage.setItem('whatsapp_connect_state', d.state || '');
    sessionStorage.setItem('whatsapp_config_id', d.config_id || '');
    if (!d.config_id) throw new Error('Meta configuration is missing on the server.');
    status.textContent = 'Opening secure Meta signup…';
    await loadFB();

    window.FB.login(function (resp) {
      if (resp && resp.authResponse && resp.authResponse.code) {
        completeConnect(resp.authResponse.code, d.state);
      } else {
        status.textContent = 'Meta signup was cancelled.';
        $('startConnect').disabled = false;
      }
    }, {
      config_id: d.config_id,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding' }
    });
  } catch (e) {
    status.textContent = e.message;
    $('startConnect').disabled = false;
  }
}

async function completeConnect(code, stateToken) {
  const status = $('connectStatus');
  try {
    status.textContent = 'Verifying Meta connection…';
    const d = await fn('whatsapp-connection', { action: 'complete', code, state: stateToken });
    status.textContent = d?.connection ? 'WhatsApp connected successfully.' : 'Connection completed.';
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    status.textContent = e.message;
    $('startConnect').disabled = false;
  }
}

/* ---------------- realtime (debounced) ---------------- */
let rtTimer = null;
function scheduleRefresh() {
  clearTimeout(rtTimer);
  rtTimer = setTimeout(async () => {
    try {
      await loadConversations();
      if (st.sel) { await loadMessages(st.sel.id); markSeen(st.sel); }
    } catch (e) { console.warn('[WA] realtime refresh failed:', e.message); }
  }, 600);
}
function setupRealtime() {
  sb.channel(`wa-sales-${st.clientId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `client_id=eq.${st.clientId}` }, scheduleRefresh)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_messages', filter: `client_id=eq.${st.clientId}` }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `client_id=eq.${st.clientId}` }, scheduleRefresh)
    .subscribe();
}

/* ---------------- events ---------------- */
function closeMenu() { document.body.classList.remove('menu-open'); }

function bind() {
  $('menuBtn').onclick = () => document.body.classList.add('menu-open');
  $('scrim').onclick = closeMenu;
  document.querySelectorAll('#sidebar a').forEach(a => a.addEventListener('click', closeMenu));
  $('logout').onclick = async () => { await sb.auth.signOut(); location.href = 'login.html'; };

  $('list').addEventListener('click', e => {
    const it = e.target.closest('.conv');
    if (it) openConv(it.dataset.id);
  });
  $('search').addEventListener('input', e => { st.search = e.target.value; renderList(); });
  document.querySelectorAll('.filters button').forEach(b => b.onclick = async () => {
    document.querySelectorAll('.filters button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    st.filter = b.dataset.filter;
    try { await loadConversations(); } catch (e) { toast(e.message, true); }
  });
  $('refresh').onclick = () => Promise.all([loadConnection(), loadConversations(), loadServices()]).catch(e => toast(e.message, true));

  $('backBtn').onclick = backToInbox;
  $('toggleStatus').onclick = toggleStatus;
  $('infoBtn').onclick = () => setSheet(true);
  $('ctxClose').onclick = () => setSheet(false);

  $('send').onclick = sendMessage;
  $('suggest').onclick = suggestReply;
  $('refreshSuggestion').onclick = suggestReply;
  $('useSuggestion').onclick = () => {
    $('input').value = $('suggestionText').textContent;
    $('aiSuggestion').classList.add('hidden');
    autosize(); $('input').focus();
  };
  $('approveBtn').onclick = approvePending;
  $('rejectBtn').onclick = rejectPending;
  $('addLead').onclick = addToLeads;

  $('input').addEventListener('input', autosize);
  $('input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouch) { e.preventDefault(); sendMessage(); }
  });
  $('input').addEventListener('focus', () => setTimeout(() => { const m = $('messages'); m.scrollTop = m.scrollHeight; }, 250));

  document.querySelectorAll('.mode').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $('modeChip').onclick = () => {
    const order = ['auto', 'approval', 'manual'];
    setMode(order[(order.indexOf(st.mode) + 1) % order.length]);
  };

  $('connectBtn').onclick = () => $('connectModal').classList.remove('hidden');
  $('closeConnect').onclick = () => $('connectModal').classList.add('hidden');
  $('connectModal').addEventListener('click', e => { if (e.target === $('connectModal')) $('connectModal').classList.add('hidden'); });
  $('startConnect').onclick = connectStart;

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeMenu();
    $('connectModal').classList.add('hidden');
    if ($('context').classList.contains('open')) setSheet(false);
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) { closeMenu(); }
  }, { passive: true });

  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.href = 'login.html'; });
}

/* ---------------- boot ---------------- */
async function boot() {
  try {
    bind();
    setMode(st.mode);
    await session();
    await Promise.all([loadConversations(), loadServices(), loadConnection()]);
    setupRealtime();
    $('boot').remove();
    st.booted = true;
    await handoff();
  } catch (e) {
    console.error(e);
    $('boot').innerHTML = `<div style="color:#ff6472;max-width:320px">${esc(e.message)}</div><button class="primary-btn" onclick="location.reload()">Retry</button>`;
  }
}

boot();
})();
