/*
 * GLIME — WhatsApp Sales Specialist (single file)
 * One Supabase client, no polling loops, no MutationObserver.
 *
 * Verified backend contracts used (read from the deployed Edge Functions):
 *  - whatsapp-media-upload   POST multipart: file, conversation_id, media_type, is_voice_note → { ok, media_asset:{id,…} }
 *  - whatsapp-manual-send    { conversation_id, message, media_asset_id? } → { ok, status:'sent', message_id }
 *  - whatsapp-action-request { conversation_id, message, mode:'auto'|'approval', media_asset_id? } → { status:'proposed'|'queued', request_id, job_id? }
 *  - whatsapp-chat-management { action:'delete_message'|'clear_chat'|'delete_chat'|'set_retention', conversation_id, message_id?, confirmed:true, retention_period? }
 *  - RPC approve_client_business_action / reject_client_business_action (p_action_request_id)
 */
(() => {
'use strict';

const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const MODULE = 'whatsapp_ai_sales_agent';
const SEEN_KEY = 'glime_wa_seen_v1';
const FB_APP_ID = '1682940610216509';
const FB_VERSION = 'v26.0';

/* ---- media rules (frontend validation only; the server is authoritative) ---- */
const MB = 1048576;
const LIMITS = { image: 5 * MB, video: 16 * MB, audio: 16 * MB, sticker: 500 * 1024, document: 25 * MB };
const TYPE_LABEL = { image: 'Image', video: 'Video', audio: 'Audio', sticker: 'Sticker', document: 'Document' };
const DOC_EXT = {
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};
const EXT_MIME = Object.assign({}, DOC_EXT, {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', webp: 'image/webp'
});
const MIME_ALIAS = { 'image/jpg': 'image/jpeg', 'audio/mp3': 'audio/mpeg', 'audio/x-mpeg': 'audio/mpeg', 'application/ogg': 'audio/ogg' };
const DOC_MIMES = new Set(Object.values(DOC_EXT));
const PICK = {
  media: { accept: 'image/jpeg,image/png,video/mp4,.jpg,.jpeg,.png,.mp4', hint: 'Photo or video' },
  document: { accept: Object.keys(DOC_EXT).map(e => '.' + e).join(','), hint: 'Document' },
  audio: { accept: 'audio/mpeg,audio/ogg,.mp3,.ogg,.oga', hint: 'Audio' },
  sticker: { accept: 'image/webp,.webp', hint: 'Sticker' }
};
const UNSUPPORTED = 'Unsupported file. Use JPEG/PNG images, MP4 video, MP3/OGG audio, WebP stickers, or PDF, TXT, CSV, JSON, DOC/DOCX, XLS/XLSX, PPT/PPTX documents.';
const CAPTION_MAX = 1024;
const RETENTION_LABEL = { off: 'Off (keep messages)', '24h': '24 hours', '7d': '7 days', '90d': '90 days' };

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);
const isTouch = window.matchMedia && matchMedia('(pointer:coarse)').matches;
const isMobile = () => window.innerWidth < 900;

const st = {
  user: null, clientId: null, connection: null, connState: 'unknown',
  convs: [], msgs: [], sel: null,
  filter: 'all', search: '', listState: 'loading', listError: '',
  services: [], business: null, knowledge: [],
  mode: readMode(),
  aiSession: sessionStorage.getItem('glime_ai_session') || null,
  seen: readSeen(), pushed: false, ctxToken: 0, msgToken: 0, convToken: 0,
  mediaCache: new Map(), booted: false,
  attach: null, sending: false, notice: '',
  deleted: new Set(), approving: false, retSaving: false, channel: null
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
function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < MB) return Math.round(n / 1024) + ' KB';
  return (n / MB).toFixed(1) + ' MB';
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
function friendly(e) {
  return String((e && e.message) || e || 'Something went wrong').replace(/^[A-Z][A-Z_]{3,}:\s*/, '');
}
function icon(id, cls = 'ni') { return `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`; }

let toastTimer;
function toast(msg, error = false) {
  let x = document.querySelector('.toast');
  if (!x) { x = document.createElement('div'); x.setAttribute('role', 'status'); x.setAttribute('aria-live', 'polite'); document.body.appendChild(x); }
  x.className = 'toast' + (error ? ' error' : '');
  x.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => x.remove(), error ? 5200 : 3400);
}

/* Edge function call — surfaces the real server error and flags uncertain outcomes */
async function fn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message || 'Function request failed', code = '';
    const status = (error.context && error.context.status) || 0;
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        msg = j.error || j.message || msg;
        code = j.code || '';
      }
    } catch (_) {}
    const err = new Error(msg);
    err.code = code; err.status = status;
    err.uncertain = code === 'DELIVERY_STATE_UNKNOWN' || status === 504 ||
      error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError';
    throw err;
  }
  if (data?.error) {
    const err = new Error(typeof data.error === 'string' ? data.error : (data.error.message || 'Request failed'));
    err.code = data.code || '';
    throw err;
  }
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
  st.connState = on ? 'connected' : failed ? 'unknown' : 'disconnected';
  const b = $('connection');
  b.className = 'connection-badge ' + (on ? 'online' : 'offline');
  b.textContent = on ? '● WhatsApp connected' : failed ? '● Status unavailable' : '● Not connected';
  $('connectBtn').textContent = on ? 'Connected' : 'Connect';
  updateComposerState();
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
  const token = ++st.convToken;
  if (!st.convs.length && st.listState !== 'error') { st.listState = 'loading'; renderList(); }
  let q = sb.from('whatsapp_conversations').select('*')
    .eq('client_id', st.clientId)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (st.filter !== 'all') q = q.eq('status', st.filter);
  const { data, error } = await q.limit(150);
  if (token !== st.convToken) return; // a newer request owns the list
  if (error) {
    st.listError = friendly(error);
    if (!st.convs.length) { st.listState = 'error'; renderList(); }
    throw error;
  }
  st.listState = 'ok';
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

const SKELETON = Array.from({ length: 7 }, () =>
  '<div class="conv skel" aria-hidden="true"><div class="avatar"></div><div class="conv-copy"><i></i><i></i></div></div>').join('');

function renderList() {
  const box = $('list');
  if (st.listState === 'loading') { box.setAttribute('aria-busy', 'true'); box.innerHTML = SKELETON; return; }
  box.removeAttribute('aria-busy');
  if (st.listState === 'error') {
    box.innerHTML = `<div class="state-card"><b>Couldn’t load chats</b><p>${esc(st.listError || 'Check your connection and try again.')}</p><button class="secondary-btn" type="button" data-retry="1">Try again</button></div>`;
    return;
  }
  const s = st.search.toLowerCase().trim();
  const rows = st.convs.filter(c => !s ||
    `${c.customer_name || ''} ${c.customer_phone || ''} ${c.last_message_preview || ''}`.toLowerCase().includes(s));

  if (!rows.length) {
    let t = 'No WhatsApp conversations yet.', sub = 'New customer messages will appear here.';
    if (s) { t = 'No chats match your search.'; sub = 'Try a different name or number.'; }
    else if (st.filter === 'closed') { t = 'No closed chats.'; sub = 'Closed conversations will be listed here.'; }
    else if (st.filter === 'open') { t = 'No open chats.'; sub = 'Open conversations will be listed here.'; }
    box.innerHTML = `<div class="state-card"><b>${esc(t)}</b><p>${esc(sub)}</p></div>`;
    return;
  }

  box.innerHTML = rows.map(c => {
    const un = isUnread(c);
    const prev = c.last_message_preview || c.customer_phone || '';
    const you = c.last_message_direction === 'outbound' ? '<span class="you">You: </span>' : '';
    return `<div class="conv ${st.sel?.id === c.id ? 'active' : ''} ${un ? 'unread' : ''}" data-id="${esc(c.id)}" role="button" tabindex="0" aria-label="${esc(convTitle(c))}${un ? ', unread' : ''}${c.status === 'closed' ? ', closed' : ''}">
      <div class="avatar">${esc(initial(c))}</div>
      <div class="conv-copy">
        <div class="conv-top"><b>${esc(convTitle(c))}</b><span class="conv-time">${esc(listTime(c.last_message_at || c.updated_at))}</span></div>
        <div class="conv-sub"><span class="conv-preview">${you}${esc(prev)}</span>${c.status === 'closed' ? '<span class="conv-closed">Closed</span>' : ''}${un ? '<span class="conv-dot" role="img" aria-label="Unread"></span>' : ''}</div>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- open / close chat pane ---------------- */
async function openConv(id) {
  const c = st.convs.find(x => x.id === id) || (st.sel && st.sel.id === id ? st.sel : null);
  if (!c) return;
  if (st.sel && st.sel.id !== id) { clearAttachment(); st.notice = ''; }
  st.sel = c;
  st.msgs = [];
  markSeen(c);
  closeMenus();

  document.body.classList.add('chat-open');
  if (isMobile() && !st.pushed) { history.pushState({ wa: 1 }, ''); st.pushed = true; }

  $('emptyChat').classList.add('hidden');
  $('chatView').classList.remove('hidden');
  $('aiSuggestion').classList.add('hidden');
  $('approvalBox').classList.add('hidden');
  $('messages').innerHTML = '<div class="loading-state"><i class="spin"></i>Loading messages…</div>';
  paintHeader();
  renderList();

  await Promise.all([loadMessages(id), loadContext(c), loadPending()]);
}

function closeChatPane() {
  document.body.classList.remove('chat-open');
  setSheet(false);
  closeMenus();
  clearAttachment();
  st.notice = '';
  st.sel = null; st.msgs = [];
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
  const label = closed ? 'Reopen conversation' : 'Close conversation';
  tb.title = label; tb.setAttribute('aria-label', label);
  tb.querySelector('use').setAttribute('href', closed ? '#i-refresh' : '#i-check');

  // WhatsApp 24-hour customer-service window
  const li = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : 0;
  $('winChip').classList.toggle('hidden', !!li && Date.now() - li < 86400000);

  paintRetention();
  updateComposerState();
}

/* ---------------- composer state / notices ---------------- */
function captionBlocked() {
  return !!st.attach && (st.attach.mediaType === 'audio' || st.attach.mediaType === 'sticker');
}
function noticeText() {
  if (st.notice) return { text: st.notice, kind: 'warn' };
  if (st.sel?.status === 'closed') return { text: 'This conversation is closed. Reopen it (✓ button above) to send messages.', kind: 'info' };
  if (st.connState === 'disconnected') return { text: 'WhatsApp is not connected. You can read history, but sending is unavailable until you connect.', kind: 'warn' };
  if (st.connState === 'unknown') return { text: 'Connection status is unavailable right now — sending may fail.', kind: 'info' };
  return null;
}
function updateComposerState() {
  if (!st.booted && !$('input')) return;
  const closed = st.sel?.status === 'closed';
  const blocked = closed || st.connState === 'disconnected';
  const cap = captionBlocked();

  const input = $('input');
  input.disabled = blocked || st.sending || cap;
  input.placeholder = cap ? 'Captions aren’t supported for audio or stickers'
    : st.attach ? 'Add a caption (optional)'
    : blocked ? (closed ? 'Conversation closed' : 'WhatsApp not connected') : 'Message';
  if (st.attach) input.maxLength = CAPTION_MAX; else input.removeAttribute('maxlength');

  $('send').disabled = blocked || st.sending;
  $('send').classList.toggle('loading', st.sending);
  $('send').setAttribute('aria-busy', st.sending ? 'true' : 'false');
  $('attachBtn').disabled = blocked || st.sending;
  $('apRemove').disabled = st.sending;
  $('voiceToggle').disabled = st.sending;

  const n = noticeText(), box = $('composerNotice');
  if (n) { box.textContent = n.text; box.className = 'composer-notice ' + n.kind; }
  else { box.className = 'composer-notice hidden'; box.textContent = ''; }
}
function setNotice(text) { st.notice = text || ''; updateComposerState(); }

/* ---------------- messages ---------------- */
async function loadMessages(id) {
  const token = ++st.msgToken;
  // newest 300 (ascending order alone would return the OLDEST 300)
  const { data, error } = await sb.from('whatsapp_messages').select('*')
    .eq('client_id', st.clientId).eq('conversation_id', id)
    .order('created_at', { ascending: false }).limit(300);
  if (token !== st.msgToken || !st.sel || st.sel.id !== id) return;
  if (error) {
    $('messages').innerHTML = `<div class="state-card chat-state"><b>Couldn’t load messages</b><p>${esc(friendly(error))}</p><button class="secondary-btn" type="button" data-retry-msgs="1">Try again</button></div>`;
    return;
  }
  // never resurrect a message the user has already deleted
  st.msgs = (data || []).reverse().filter(m => !st.deleted.has(m.id));
  renderMessages(true);
}

function mtype(m) {
  const t = String(m?.message_type || '').toLowerCase();
  if (t === 'image' || t === 'photo') return 'image';
  if (t === 'video') return 'video';
  if (t === 'audio' || t === 'voice') return 'audio';
  if (t === 'document' || t === 'file') return 'document';
  if (t === 'sticker') return 'sticker';
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
/* Private media is only reachable through short-lived signed URLs created with the signed-in user's session. */
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
  } catch (e) { console.warn('[WA] media url failed'); return ''; }
}
function mdoc(m) {
  const s = mstorage(m) || {};
  return { name: s.file_name || s.filename || s.name || m.file_name || 'Document', mime: (s.mime_type || s.mimeType || m.mime_type || '').toLowerCase(), size: Number(s.size_bytes) || 0 };
}

function bodyHtml(m) {
  const type = mtype(m), cap = m.text_body || '';
  const capHtml = cap ? `<div class="cap">${linkify(esc(cap))}</div>` : '';
  if (!type) return linkify(esc(cap || m.message_type || ''));
  if (!mstorage(m)) {
    const lbl = { image: '📷 Photo', video: '🎥 Video', audio: '🎵 Audio', document: '📄 Document', sticker: '🙂 Sticker' }[type];
    return `<div class="wa-unavail">${lbl}<small>Media preview unavailable</small></div>${capHtml}`;
  }
  const id = esc(m.id || '');
  const load = `<span class="wa-loading" data-load="${id}">Loading…</span>`;
  if (type === 'document') {
    const d = mdoc(m);
    return `<a class="wa-doc" data-link="${id}" href="#" target="_blank" rel="noopener noreferrer">${icon('i-file', 'ni doc-ic')}<span><b>${esc(d.name)}</b><small>${esc((d.mime || 'Document') + (d.size ? ' · ' + fmtBytes(d.size) : ''))}</small></span></a>${capHtml}`;
  }
  if (type === 'sticker') return `<img class="wa-media-sticker" data-img="${id}" alt="Sticker" loading="lazy">${load}`;
  if (type === 'image') return `<a data-link="${id}" href="#" target="_blank" rel="noopener noreferrer"><img class="wa-media-image" data-img="${id}" alt="Photo" loading="lazy"></a>${capHtml}${load}`;
  if (type === 'video') return `<video class="wa-media-video" data-vid="${id}" controls playsinline preload="metadata"></video>${capHtml}${load}`;
  const voice = m.metadata && m.metadata.is_voice_note === true;
  return `<div class="wa-audio-wrap">${voice ? '<span class="vn">Voice note</span>' : ''}<audio class="wa-media-audio" data-aud="${id}" controls preload="metadata"></audio></div>${capHtml}${load}`;
}

/* Status is shown only from what the backend/provider recorded — never assumed. */
function ticks(m) {
  if (m.direction !== 'outbound') return '';
  const s = String(m.status || '').toLowerCase();
  const mk = (cls, label, ic) => `<span class="tk ${cls}" role="img" aria-label="${label}" title="${label}">${icon(ic, 'tki')}</span>`;
  if (s === 'failed' || s === 'error') return mk('fail', 'Failed to send', 'i-info');
  if (s === 'read') return mk('read', 'Read', 'i-tick2');
  if (s === 'delivered') return mk('', 'Delivered', 'i-tick2');
  if (s === 'sent') return mk('', 'Sent — accepted by WhatsApp', 'i-tick');
  if (['queued', 'sending', 'pending', 'awaiting_approval', 'proposed'].includes(s)) {
    return mk('pend', s === 'awaiting_approval' || s === 'proposed' ? 'Awaiting approval' : s === 'sending' ? 'Sending' : 'Queued', 'i-clock');
  }
  return '';
}

function dayHtml(m) { return `<div class="day">${esc(dayLabel(m.created_at))}</div>`; }
function sameGroup(a, b) {
  return !!a && !!b && a.direction === b.direction &&
    dayStart(new Date(a.created_at)) === dayStart(new Date(b.created_at)) &&
    Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 5 * 60 * 1000;
}
function rowHtml(m, prev) {
  const first = !sameGroup(prev, m);
  const dir = m.direction === 'outbound' ? 'out' : 'in';
  const type = mtype(m);
  const stk = type === 'sticker' && mstorage(m);
  const id = esc(m.id || '');
  const menu = m.id ? `<button class="msg-menu" type="button" data-mid="${id}" aria-label="Message options" aria-haspopup="menu" aria-expanded="false">${icon('i-down')}</button>` : '';
  return `<div class="row ${dir} ${first ? 'first' : ''}" data-mid="${id}"><div class="bubble ${type ? 'has-media' : ''} ${stk ? 'is-sticker' : ''}">${menu}${bodyHtml(m)}<span class="meta">${esc(fmtTime(m.created_at))}${ticks(m)}</span></div></div>`;
}

function renderMessages(forceBottom) {
  const box = $('messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const list = st.msgs;
  let html = '';
  list.forEach((m, i) => {
    const prev = list[i - 1];
    if (!prev || dayStart(new Date(prev.created_at)) !== dayStart(new Date(m.created_at))) html += dayHtml(m);
    html += rowHtml(m, prev);
  });
  box.innerHTML = html || '<div class="state-card chat-state"><b>No messages yet</b><p>Messages in this conversation will appear here.</p></div>';

  if (forceBottom || nearBottom) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; updateToBottom(); });
  hydrateMedia(box, list);
  updateToBottom();
}

/* Append-only render for a new realtime message: does not restart media that is playing */
function appendRow(m) {
  const box = $('messages');
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  const placeholder = box.querySelector('.chat-state'); if (placeholder) placeholder.remove();
  const prev = st.msgs[st.msgs.length - 2];
  let html = '';
  if (!prev || dayStart(new Date(prev.created_at)) !== dayStart(new Date(m.created_at))) html += dayHtml(m);
  html += rowHtml(m, prev);
  box.insertAdjacentHTML('beforeend', html);
  hydrateMedia(box, [m]);
  if (near) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; updateToBottom(); });
  else updateToBottom();
}
function patchRow(m) {
  const row = $('messages').querySelector(`.row[data-mid="${CSS.escape(String(m.id))}"]`);
  const meta = row && row.querySelector('.meta');
  if (meta) meta.innerHTML = `${esc(fmtTime(m.created_at))}${ticks(m)}`;
}
function updateToBottom() {
  const box = $('messages');
  const far = box.scrollHeight - box.scrollTop - box.clientHeight > 320;
  $('toBottom').classList.toggle('hidden', !far);
}

async function hydrateMedia(box, list) {
  const items = (list || st.msgs).filter(m => mtype(m) && mstorage(m));
  await Promise.all(items.map(async m => {
    const id = String(m.id), q = s => box.querySelector(`[${s}="${CSS.escape(id)}"]`);
    const url = await resolveMedia(m);
    const loading = q('data-load');
    if (!url) { if (loading) { loading.textContent = 'Media unavailable or expired'; loading.classList.add('error'); } return; }
    box.querySelectorAll(`[data-link="${CSS.escape(id)}"]`).forEach(a => { a.href = url; });
    const img = q('data-img'), vid = q('data-vid'), aud = q('data-aud');
    const done = () => loading && loading.remove();
    const fail = () => { if (loading) { loading.textContent = 'Media unavailable or expired'; loading.classList.add('error'); } };
    if (img) { img.addEventListener('load', done, { once: true }); img.addEventListener('error', fail, { once: true }); img.src = url; }
    if (vid) { vid.addEventListener('loadedmetadata', done, { once: true }); vid.addEventListener('error', fail, { once: true }); vid.src = url; }
    if (aud) { aud.addEventListener('loadedmetadata', done, { once: true }); aud.addEventListener('error', fail, { once: true }); aud.src = url; }
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
    if (token !== st.ctxToken || !st.sel || st.sel.id !== conv.id) return;

    st.sel.lead = lead; st.sel.customerRow = customer;
    paintContext(conv, customer, lead, tl.data || [], fu ? { settings: fu[0].data, kase: fu[1].data, concl: fu[2].data } : null, orders);
  } catch (e) {
    console.warn('[WA] context failed');
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

/* ---------------- retention (whatsapp-chat-management: set_retention) ---------------- */
function savedRetention() {
  const v = st.sel?.retention_period;
  return RETENTION_LABEL[v] ? v : 'off';
}
function paintRetention() {
  if (!st.sel) return;
  const saved = savedRetention();
  $('retSaved').textContent = RETENTION_LABEL[saved];
  // keep a deliberate, unsaved choice while the user is editing the same conversation
  const sel = $('retSelect');
  if (sel.dataset.conv !== st.sel.id) { sel.value = saved; sel.dataset.conv = st.sel.id; }
  $('retSave').disabled = st.retSaving || sel.value === saved;
  $('retSave').textContent = st.retSaving ? 'Saving…' : 'Save retention';
}
async function saveRetention() {
  const c = st.sel;
  if (!c || st.retSaving) return;
  const period = $('retSelect').value;
  if (!RETENTION_LABEL[period] || period === savedRetention()) return;
  st.retSaving = true; paintRetention();
  try {
    const d = await fn('whatsapp-chat-management', { action: 'set_retention', conversation_id: c.id, retention_period: period });
    if (!d.ok) throw new Error(d.error || 'Retention could not be saved');
    const confirmed = d.retention_period || period;
    c.retention_period = confirmed;
    const inList = st.convs.find(x => x.id === c.id);
    if (inList) inList.retention_period = confirmed;
    toast('Retention saved — applies to future messages');
  } catch (e) {
    toast('Retention not saved: ' + friendly(e), true);
  } finally {
    st.retSaving = false; paintRetention();
  }
}

/* ---------------- attachments ---------------- */
function classifyFile(file, kind) {
  if (!file || !file.size) return { error: 'This file is empty.' };
  const ext = (String(file.name || '').split('.').pop() || '').toLowerCase();
  let mime = String(file.type || '').split(';')[0].trim().toLowerCase();
  mime = MIME_ALIAS[mime] || mime;
  const expected = EXT_MIME[ext];
  if (!mime || mime === 'application/octet-stream' || (ext === 'csv' && mime === 'application/vnd.ms-excel')) mime = expected || '';
  if (!mime) return { error: UNSUPPORTED };
  if (expected && expected !== mime) return { error: 'The file extension doesn’t match its actual type. Rename or re-export the file and try again.' };

  let mediaType = '';
  if (mime === 'image/jpeg' || mime === 'image/png') mediaType = kind === 'document' ? 'document' : 'image';
  else if (mime === 'video/mp4') mediaType = 'video';
  else if (mime === 'audio/mpeg' || mime === 'audio/ogg') mediaType = 'audio';
  else if (mime === 'image/webp') mediaType = 'sticker';
  else if (DOC_MIMES.has(mime)) mediaType = 'document';
  if (!mediaType) return { error: UNSUPPORTED };
  if (kind === 'sticker' && mediaType !== 'sticker') return { error: 'Stickers must be WebP images.' };
  if (kind === 'audio' && mediaType !== 'audio') return { error: 'Please choose an MP3 or OGG audio file.' };
  if (kind === 'media' && !['image', 'video'].includes(mediaType) && mediaType !== 'document') return { error: UNSUPPORTED };
  if (mediaType === 'sticker' && kind !== 'sticker') return { error: 'WebP images can only be sent as stickers. Use Attach → Sticker.' };

  const limit = LIMITS[mediaType];
  if (file.size > limit) return { error: `${TYPE_LABEL[mediaType]} files must be ${fmtBytes(limit)} or smaller (this file is ${fmtBytes(file.size)}).` };
  const f = file.type === mime ? file : new File([file], file.name || 'attachment', { type: mime });
  return { file: f, mime, mediaType };
}

function clearAttachment() {
  if (st.attach && st.attach.previewUrl) { try { URL.revokeObjectURL(st.attach.previewUrl); } catch (_) {} }
  st.attach = null;
  if ($('attachPreview')) renderAttachment();
}
function setAttachment(info) {
  clearAttachment();
  st.attach = { file: info.file, mime: info.mime, mediaType: info.mediaType, voice: false, previewUrl: '' };
  if (info.mediaType === 'image' || info.mediaType === 'sticker' || (info.mediaType === 'document' && info.mime.startsWith('image/'))) {
    try { st.attach.previewUrl = URL.createObjectURL(info.file); } catch (_) {}
  }
  if (captionBlocked()) { $('input').value = ''; autosize(); }
  renderAttachment();
}
function renderAttachment() {
  const a = st.attach, box = $('attachPreview');
  box.classList.toggle('hidden', !a);
  setProgress(null);
  if (a) {
    const thumb = $('apThumb');
    thumb.innerHTML = '';
    if (a.previewUrl) { const img = document.createElement('img'); img.alt = ''; img.src = a.previewUrl; thumb.appendChild(img); }
    else thumb.innerHTML = icon(a.mediaType === 'video' ? 'i-video' : a.mediaType === 'audio' ? 'i-audio' : 'i-file');
    $('apName').textContent = a.file.name || 'attachment';
    $('apInfo').textContent = `${TYPE_LABEL[a.mediaType]} · ${fmtBytes(a.file.size)}`;
    const canVoice = a.mediaType === 'audio' && a.mime === 'audio/ogg';
    $('voiceRow').classList.toggle('hidden', !canVoice);
    $('voiceToggle').checked = canVoice && a.voice;
  }
  updateComposerState();
}
function setProgress(p, label) {
  const box = $('apProgress');
  if (p === null || p === undefined) { box.classList.add('hidden'); $('apProgressLabel').textContent = ''; return; }
  box.classList.remove('hidden');
  box.querySelector('i').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
  $('apProgressLabel').textContent = label || (p >= 1 ? 'Finalizing…' : `Uploading ${Math.round(p * 100)}%`);
}

function openPicker(kind) {
  const input = $('fileInput');
  input.accept = PICK[kind].accept;
  input.dataset.kind = kind;
  input.value = '';
  input.click();
}
function onFilePicked() {
  const input = $('fileInput'), file = input.files && input.files[0], kind = input.dataset.kind || 'media';
  input.value = '';
  if (!file) return;
  const r = classifyFile(file, kind);
  if (r.error) return toast(r.error, true);
  setAttachment(r);
  $('input').focus();
}

/* multipart upload through the backend (quota reservation + scoped storage happen server-side) */
async function uploadAttachment(att, convId) {
  const { data } = await sb.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) throw new Error('Your session expired. Please sign in again.');
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', att.file, att.file.name || 'attachment');
    fd.append('conversation_id', convId);
    fd.append('media_type', att.mediaType);
    if (att.voice) fd.append('is_voice_note', 'true');
    const x = new XMLHttpRequest();
    x.open('POST', `${SUPABASE_URL}/functions/v1/whatsapp-media-upload`);
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.setRequestHeader('apikey', SUPABASE_KEY);
    x.timeout = 180000;
    x.upload.onprogress = e => { if (e.lengthComputable && e.total) setProgress(e.loaded / e.total); };
    x.onload = () => {
      let j = {};
      try { j = JSON.parse(x.responseText || '{}'); } catch (_) {}
      if (x.status >= 200 && x.status < 300 && j.ok && j.media_asset && j.media_asset.id) resolve(String(j.media_asset.id));
      else reject(new Error(j.error || `Upload failed (${x.status || 'network'})`));
    };
    x.onerror = () => reject(new Error('Network error while uploading. Check your connection and try again.'));
    x.ontimeout = () => reject(new Error('The upload timed out. Try a smaller file or a faster connection.'));
    x.onabort = () => reject(new Error('Upload cancelled.'));
    setProgress(0);
    x.send(fd);
  });
}

/* ---------------- sending ---------------- */
function autosize() {
  const t = $('input');
  t.style.height = '42px';
  t.style.height = Math.min(t.scrollHeight, 130) + 'px';
}

async function sendMessage() {
  if (st.sending) return; // no duplicate submissions
  if (!st.sel) return toast('Select a conversation first');
  if (st.sel.status === 'closed') return toast('This conversation is closed. Reopen it to send.', true);
  if (st.connState === 'disconnected') return toast('WhatsApp is not connected.', true);

  const text = $('input').value.trim();
  const att = st.attach;
  if (!text && !att) return;
  if (att && captionBlocked() && text) return toast('Audio and stickers can’t have captions. Remove the text or send it separately.', true);
  if (att && text.length > CAPTION_MAX) return toast(`Captions are limited to ${CAPTION_MAX} characters (yours is ${text.length}).`, true);

  const conv = st.sel, convId = conv.id, mode = st.mode;
  st.sending = true; setNotice('');
  let stage = att ? 'upload' : 'send', queued = false;

  try {
    let assetId = null;
    if (att) assetId = await uploadAttachment(att, convId);
    stage = 'send';
    if (att) setProgress(1, 'Sending to WhatsApp…');

    if (mode === 'manual') {
      const body = { conversation_id: convId, message: text };
      if (assetId) body.media_asset_id = assetId;
      const d = await fn('whatsapp-manual-send', body);
      if (!d.ok) throw new Error(d.error || 'Manual send failed');
      toast(att ? 'Media sent' : 'Message sent');
    } else {
      const body = { conversation_id: convId, message: text, mode };
      if (assetId) body.media_asset_id = assetId;
      const d = await fn('whatsapp-action-request', body);
      queued = true; // the request now exists server-side: never re-submit it from here
      if (mode === 'auto' && d.job_id) {
        stage = 'execute';
        await fn('business-action-executor', { job_id: d.job_id });
        toast('Request sent — delivery status will update in the chat');
      } else {
        toast(d.message || 'Reply is waiting for your approval');
      }
    }
    $('input').value = ''; autosize(); clearAttachment();
  } catch (e) {
    if (queued) {
      // action request created, executor call failed: it may still send — do not retry
      $('input').value = ''; autosize(); clearAttachment();
      setNotice('Your message was queued but the sender could not be confirmed. It may still be delivered — check the chat before sending again.');
    } else if (e.uncertain) {
      // timeout/relay failure after the provider may have received it
      $('input').value = ''; autosize(); clearAttachment();
      setNotice('WhatsApp did not confirm this send. It may still have been delivered — check the chat and the customer’s reply before sending again. Do not retry blindly.');
    } else {
      toast((stage === 'upload' ? 'Upload failed: ' : 'Not sent: ') + friendly(e), true);
    }
  } finally {
    st.sending = false;
    if (st.attach) setProgress(null);
    updateComposerState();
  }
  Promise.all([loadMessages(convId), loadConversations(), loadPending()]).catch(() => {});
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
  if (!data) { box.classList.add('hidden'); box.dataset.id = ''; $('approvalMedia').classList.add('hidden'); return; }
  box.dataset.id = data.id;
  const p = data.action_payload || {};
  $('approvalText').textContent = p.message || (p.media_type ? `[${TYPE_LABEL[p.media_type] || 'Media'}]` : '');
  box.classList.remove('hidden');
  paintApprovalMedia(p, data.id);
}
async function paintApprovalMedia(p, reqId) {
  const el = $('approvalMedia');
  if (!p.media_asset_id) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.textContent = `${TYPE_LABEL[p.media_type] || 'Media'} attached`;
  try {
    const { data } = await sb.from('whatsapp_media_assets').select('file_name,media_type,size_bytes,storage_bucket,storage_path')
      .eq('id', p.media_asset_id).eq('client_id', st.clientId).maybeSingle();
    if ($('approvalBox').dataset.id !== reqId || !data) return;
    el.textContent = '';
    const chip = document.createElement('span');
    chip.className = 'ap-chip';
    chip.textContent = `${TYPE_LABEL[data.media_type] || 'Media'} · ${data.file_name || 'file'} · ${fmtBytes(data.size_bytes)}`;
    el.appendChild(chip);
    if (['image', 'sticker'].includes(data.media_type) && data.storage_path) {
      const { data: s } = await sb.storage.from(data.storage_bucket || 'client-assets').createSignedUrl(data.storage_path, 600);
      const url = safeUrl(s && s.signedUrl);
      if (url && $('approvalBox').dataset.id === reqId) {
        const img = document.createElement('img'); img.alt = 'Attachment preview'; img.src = url; img.className = 'ap-img'; el.appendChild(img);
      }
    }
  } catch (_) { /* label above is enough */ }
}

async function approvePending() {
  const id = $('approvalBox').dataset.id;
  if (!id || st.approving) return;
  st.approving = true; $('approveBtn').disabled = true; $('rejectBtn').disabled = true; $('approveBtn').textContent = 'Approving…';
  try {
    const { data, error } = await sb.rpc('approve_client_business_action', { p_action_request_id: id });
    if (error) throw error;
    if (data?.job_id) await fn('business-action-executor', { job_id: data.job_id });
    toast('Approved — sending. Delivery status will update in the chat.');
  } catch (e) {
    toast(e.uncertain ? 'The send could not be confirmed. Check the chat before trying again.' : friendly(e), true);
  } finally {
    st.approving = false; $('approveBtn').disabled = false; $('rejectBtn').disabled = false; $('approveBtn').textContent = 'Approve';
    if (st.sel) Promise.all([loadPending(), loadMessages(st.sel.id), loadConversations()]).catch(() => {});
  }
}
async function rejectPending() {
  const id = $('approvalBox').dataset.id;
  if (!id || st.approving) return;
  st.approving = true; $('approveBtn').disabled = true; $('rejectBtn').disabled = true;
  try {
    const { error } = await sb.rpc('reject_client_business_action', { p_action_request_id: id });
    if (error) throw error;
    toast('Reply rejected');
  } catch (e) { toast(friendly(e), true); }
  finally {
    st.approving = false; $('approveBtn').disabled = false; $('rejectBtn').disabled = false;
    loadPending().catch(() => {});
  }
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
    console.error('[WA] AI suggestion error');
    toast(friendly(e), true);
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
    toast(friendly(e), true);
    $('addLead').disabled = false;
  }
}

async function toggleStatus() {
  const c = st.sel;
  if (!c) return;
  const next = c.status === 'closed' ? 'open' : 'closed';
  const { data, error } = await sb.from('whatsapp_conversations')
    .update({ status: next }).eq('id', c.id).eq('client_id', st.clientId).select('id,status');
  if (error) return toast(friendly(error), true);
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
  document.querySelectorAll('.mode').forEach(b => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('modeChip').textContent = mode === 'auto' ? 'AUTO · AI can send' : mode === 'approval' ? 'AI + APPROVAL' : 'MANUAL';
}

/* ---------------- menus ---------------- */
let menuAnchor = null;
function closeMenus() {
  document.querySelectorAll('.menu').forEach(m => m.classList.add('hidden'));
  if (menuAnchor) { menuAnchor.setAttribute('aria-expanded', 'false'); menuAnchor = null; }
}
function openMenu(el, anchor, align = 'right', up = false) {
  const same = menuAnchor === anchor && !el.classList.contains('hidden');
  closeMenus();
  if (same) return;
  el.classList.remove('hidden');
  menuAnchor = anchor; anchor.setAttribute('aria-expanded', 'true');
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  let left = align === 'left' ? r.left : r.right - w;
  left = Math.min(Math.max(8, left), Math.max(8, vw - w - 8));
  let top = up ? r.top - h - 8 : r.bottom + 6;
  if (top + h > vh - 8) top = r.top - h - 6;
  if (top < 8) top = Math.max(8, Math.min(vh - h - 8, 8));
  el.style.left = left + 'px'; el.style.top = top + 'px';
  const first = el.querySelector('button:not([disabled])');
  if (first) first.focus();
}
function menuKeys(e) {
  const menu = e.currentTarget, items = Array.from(menu.querySelectorAll('button:not([disabled])'));
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); const a = menuAnchor; closeMenus(); if (a) a.focus(); }
  else if (e.key === 'Tab') closeMenus();
}

/* ---------------- confirmation dialog ---------------- */
let cf = null;
function askConfirm(o) {
  cf = { run: o.run, busy: false, prevFocus: document.activeElement, needType: o.type || '' };
  $('cfTitle').textContent = o.title;
  $('cfBody').textContent = o.body;
  const tr = $('cfTypeRow');
  tr.classList.toggle('hidden', !o.type);
  $('cfTypeWord').textContent = o.type || '';
  $('cfType').value = '';
  $('cfError').classList.add('hidden'); $('cfError').textContent = '';
  const ok = $('cfOk');
  ok.textContent = o.ok; ok.disabled = !!o.type; ok.dataset.label = o.ok;
  $('confirmModal').classList.remove('hidden');
  (o.type ? $('cfType') : $('cfCancel')).focus();
}
function closeConfirm() {
  if (!cf) return;
  const prev = cf.prevFocus;
  cf = null;
  $('confirmModal').classList.add('hidden');
  if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
}
function setCfBusy(b) {
  $('cfOk').disabled = b || (!!cf && !!cf.needType && $('cfType').value.trim() !== cf.needType);
  $('cfOk').textContent = b ? 'Working…' : ($('cfOk').dataset.label || 'Confirm');
  $('cfCancel').disabled = b; $('cfType').disabled = b;
  $('cfOk').setAttribute('aria-busy', b ? 'true' : 'false');
}
async function runConfirm() {
  if (!cf || cf.busy) return;
  const cur = cf;
  cur.busy = true; setCfBusy(true);
  try {
    await cur.run();
    cur.busy = false;
    if (cf === cur) closeConfirm();
  } catch (e) {
    cur.busy = false;
    if (cf === cur) {
      setCfBusy(false);
      const er = $('cfError'); er.textContent = friendly(e); er.classList.remove('hidden');
    }
  }
}
function trapFocus(e) {
  if (e.key !== 'Tab' || !cf) return;
  const f = Array.from($('confirmModal').querySelectorAll('button,input')).filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const a = document.activeElement, first = f[0], last = f[f.length - 1];
  if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
}

/* ---------------- delete message / clear chat / delete chat ---------------- */
function mgmt(payload) {
  return fn('whatsapp-chat-management', Object.assign({ confirmed: true }, payload));
}
function confirmDeleteMessage(mid) {
  const conv = st.sel, m = st.msgs.find(x => String(x.id) === String(mid));
  if (!conv || !m) return;
  askConfirm({
    title: 'Delete this message from GLIME?',
    body: 'This removes the message' + (mtype(m) ? ' and its stored media file' : '') + ' from GLIME. It can’t be undone. It is not deleted from the customer’s WhatsApp app.',
    ok: 'Delete from GLIME',
    run: async () => {
      const d = await mgmt({ action: 'delete_message', conversation_id: conv.id, message_id: m.id });
      if (!d.ok) throw new Error(d.error || 'The message could not be deleted');
      st.deleted.add(m.id);
      if (st.sel && st.sel.id === conv.id) { st.msgs = st.msgs.filter(x => x.id !== m.id); renderMessages(false); }
      toast('Message deleted from GLIME');
      loadConversations().catch(() => {});
    }
  });
}
function confirmClearChat() {
  const conv = st.sel; if (!conv) return;
  askConfirm({
    title: 'Clear this chat in GLIME?',
    body: 'All messages and their stored media files in this chat will be deleted from GLIME. The conversation itself and its customer, lead and order links stay. Nothing is deleted from the customer’s WhatsApp app. This can’t be undone.',
    ok: 'Clear chat',
    run: async () => {
      const d = await mgmt({ action: 'clear_chat', conversation_id: conv.id });
      if (!d.ok) throw new Error(d.error || 'The chat could not be cleared');
      if (st.sel && st.sel.id === conv.id) {
        st.msgs.forEach(m => st.deleted.add(m.id));
        st.msgs = []; renderMessages(false);
        st.mediaCache.clear();
        loadPending().catch(() => {});
      }
      toast(`Chat cleared in GLIME${typeof d.messages_deleted === 'number' ? ` · ${d.messages_deleted} messages removed` : ''}`);
      loadConversations().catch(() => {});
    }
  });
}
function confirmDeleteChat() {
  const conv = st.sel; if (!conv) return;
  askConfirm({
    title: 'Delete this chat from GLIME?',
    body: 'The conversation record, its entire message history and stored media files will be deleted from GLIME. The customer, lead and order records are not deleted. Nothing is removed from the customer’s WhatsApp app. This can’t be undone.',
    ok: 'Delete chat',
    type: 'DELETE',
    run: async () => {
      const d = await mgmt({ action: 'delete_chat', conversation_id: conv.id });
      if (!d.ok) throw new Error(d.error || 'The chat could not be deleted');
      st.convs = st.convs.filter(x => x.id !== conv.id);
      delete st.seen[conv.id]; saveSeen();
      if (st.sel && st.sel.id === conv.id) backToInbox();
      renderList();
      toast('Chat deleted from GLIME');
      loadConversations().catch(() => {});
    }
  });
}

function openRetention() {
  setSheet(true);
  setTimeout(() => { const c = $('retentionCard'); if (c) { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); $('retSelect').focus(); } }, 280);
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
    status.textContent = friendly(e);
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
    status.textContent = friendly(e);
    $('startConnect').disabled = false;
  }
}

/* ---------------- realtime ---------------- */
let convTimer = null, fullTimer = null;
function scheduleConvRefresh() {
  clearTimeout(convTimer);
  convTimer = setTimeout(() => { loadConversations().catch(e => console.warn('[WA] list refresh failed')); }, 700);
}
/* fallback when an event doesn't carry enough information */
function scheduleFullRefresh() {
  clearTimeout(fullTimer);
  fullTimer = setTimeout(async () => {
    try {
      await loadConversations();
      if (st.sel) { await loadMessages(st.sel.id); markSeen(st.sel); }
    } catch (e) { console.warn('[WA] realtime refresh failed'); }
  }, 600);
}
function onMsgInsert(p) {
  const m = p && p.new;
  if (!m || !m.id) return scheduleFullRefresh();
  if (m.client_id !== st.clientId) return;
  scheduleConvRefresh();
  if (!st.sel || m.conversation_id !== st.sel.id) return;
  if (st.deleted.has(m.id) || st.msgs.some(x => x.id === m.id)) return;
  st.msgs.push(m);
  st.msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (st.msgs[st.msgs.length - 1] === m) appendRow(m); else renderMessages(false);
  markSeen(st.sel);
}
function onMsgUpdate(p) {
  const m = p && p.new;
  if (!m || !m.id) return scheduleFullRefresh();
  if (m.client_id !== st.clientId) return;
  scheduleConvRefresh();
  if (!st.sel || m.conversation_id !== st.sel.id || st.deleted.has(m.id)) return;
  const i = st.msgs.findIndex(x => x.id === m.id);
  if (i < 0) return;
  st.msgs[i] = { ...st.msgs[i], ...m };
  patchRow(st.msgs[i]);
}
function onMsgDelete(p) {
  const old = p && p.old;
  if (!old || !old.id) return scheduleFullRefresh();
  // ignore other clients' events (a DELETE payload may carry only the primary key)
  if (old.client_id && old.client_id !== st.clientId) return;
  if (old.conversation_id && st.sel && old.conversation_id !== st.sel.id) { scheduleConvRefresh(); return; }
  st.deleted.add(old.id);
  scheduleConvRefresh();
  if (st.msgs.some(x => x.id === old.id)) {
    st.msgs = st.msgs.filter(x => x.id !== old.id);
    renderMessages(false);
  }
}
function onConvChange(p) {
  if (p && p.eventType === 'DELETE' && p.old && st.sel && p.old.id === st.sel.id) {
    toast('This chat was deleted');
    backToInbox();
  }
  scheduleConvRefresh();
}
function setupRealtime() {
  if (st.channel) { try { sb.removeChannel(st.channel); } catch (_) {} st.channel = null; }
  st.channel = sb.channel(`wa-sales-${st.clientId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `client_id=eq.${st.clientId}` }, onMsgInsert)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_messages', filter: `client_id=eq.${st.clientId}` }, onMsgUpdate)
    // DELETE payloads only reliably include the primary key, so they are matched by id against the loaded timeline
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'whatsapp_messages' }, onMsgDelete)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `client_id=eq.${st.clientId}` }, onConvChange)
    .subscribe();
}

/* ---------------- mobile keyboard / viewport ---------------- */
function bindViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    document.documentElement.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    const kb = window.innerHeight - vv.height > 120;
    const was = document.body.classList.contains('kb-open');
    document.body.classList.toggle('kb-open', kb);
    if (kb && !was && st.sel) { const m = $('messages'); requestAnimationFrame(() => { m.scrollTop = m.scrollHeight; }); }
    if (kb) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', () => { if (document.body.classList.contains('kb-open')) window.scrollTo(0, 0); });
  update();
}

/* ---------------- events ---------------- */
function closeMenu() { document.body.classList.remove('menu-open'); }

function bind() {
  $('menuBtn').onclick = () => document.body.classList.add('menu-open');
  $('scrim').onclick = closeMenu;
  document.querySelectorAll('#sidebar a').forEach(a => a.addEventListener('click', closeMenu));
  $('logout').onclick = async () => { await sb.auth.signOut(); location.href = 'login.html'; };

  $('list').addEventListener('click', e => {
    if (e.target.closest('[data-retry]')) { loadConversations().catch(() => {}); return; }
    const it = e.target.closest('.conv');
    if (it && it.dataset.id) openConv(it.dataset.id);
  });
  $('list').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('conv') && e.target.dataset.id) { e.preventDefault(); openConv(e.target.dataset.id); }
  });
  $('search').addEventListener('input', e => { st.search = e.target.value; renderList(); });
  document.querySelectorAll('.filters button').forEach(b => b.onclick = async () => {
    document.querySelectorAll('.filters button').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
    b.classList.add('active'); b.setAttribute('aria-pressed', 'true');
    st.filter = b.dataset.filter;
    try { await loadConversations(); } catch (e) { toast(friendly(e), true); }
  });
  $('refresh').onclick = () => Promise.all([loadConnection(), loadConversations(), loadServices()]).catch(e => toast(friendly(e), true));

  $('backBtn').onclick = backToInbox;
  $('toggleStatus').onclick = toggleStatus;
  $('infoBtn').onclick = () => setSheet(true);
  $('ctxClose').onclick = () => setSheet(false);
  $('callBtn').onclick = () => toast('Voice calls aren’t available: GLIME’s WhatsApp integration doesn’t support placing calls yet.');

  /* chat menu */
  $('moreBtn').onclick = e => { e.stopPropagation(); openMenu($('chatMenu'), $('moreBtn'), 'right'); };
  $('chatMenu').addEventListener('keydown', menuKeys);
  $('chatMenu').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    closeMenus();
    const a = b.dataset.act;
    if (a === 'details') setSheet(true);
    else if (a === 'retention') openRetention();
    else if (a === 'clear') confirmClearChat();
    else if (a === 'delete') confirmDeleteChat();
  });

  /* message menu */
  $('messages').addEventListener('click', e => {
    if (e.target.closest('[data-retry-msgs]')) { if (st.sel) loadMessages(st.sel.id); return; }
    const b = e.target.closest('.msg-menu');
    if (!b) return;
    e.stopPropagation();
    $('msgMenu').dataset.mid = b.dataset.mid;
    openMenu($('msgMenu'), b, 'right');
  });
  $('messages').addEventListener('scroll', updateToBottom, { passive: true });
  $('toBottom').onclick = () => { const m = $('messages'); m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' }); };
  $('msgMenu').addEventListener('keydown', menuKeys);
  $('msgMenu').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const mid = $('msgMenu').dataset.mid;
    closeMenus();
    if (b.dataset.act === 'delete-msg') confirmDeleteMessage(mid);
  });

  /* attachments */
  $('attachBtn').onclick = e => { e.stopPropagation(); openMenu($('attachMenu'), $('attachBtn'), 'left', true); };
  $('attachMenu').addEventListener('keydown', menuKeys);
  $('attachMenu').addEventListener('click', e => {
    const b = e.target.closest('button[data-pick]'); if (!b) return;
    closeMenus(); openPicker(b.dataset.pick);
  });
  $('fileInput').addEventListener('change', onFilePicked);
  $('apRemove').onclick = () => { clearAttachment(); $('input').focus(); };
  $('voiceToggle').onchange = () => { if (st.attach) st.attach.voice = $('voiceToggle').checked; };

  /* confirm dialog */
  $('cfCancel').onclick = closeConfirm;
  $('cfOk').onclick = runConfirm;
  $('cfType').addEventListener('input', () => { if (cf && !cf.busy) $('cfOk').disabled = $('cfType').value.trim() !== cf.needType; });
  $('cfType').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('cfOk').disabled) { e.preventDefault(); runConfirm(); } });
  $('confirmModal').addEventListener('keydown', trapFocus);
  $('confirmModal').addEventListener('click', e => { if (e.target === $('confirmModal') && cf && !cf.busy) closeConfirm(); });

  /* retention */
  $('retSelect').addEventListener('change', paintRetention);
  $('retSave').onclick = saveRetention;

  $('send').onclick = sendMessage;
  $('suggest').onclick = suggestReply;
  $('refreshSuggestion').onclick = suggestReply;
  $('useSuggestion').onclick = () => {
    if (captionBlocked()) return toast('Remove the audio/sticker attachment to use a text reply.', true);
    $('input').value = $('suggestionText').textContent;
    $('aiSuggestion').classList.add('hidden');
    autosize(); $('input').focus();
  };
  $('approveBtn').onclick = approvePending;
  $('rejectBtn').onclick = rejectPending;
  $('addLead').onclick = addToLeads;

  $('input').addEventListener('input', autosize);
  $('input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.isComposing) { e.preventDefault(); sendMessage(); }
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

  document.addEventListener('click', e => {
    if (menuAnchor && !e.target.closest('.menu') && !menuAnchor.contains(e.target)) closeMenus();
  });
  window.addEventListener('scroll', closeMenus, true);
  window.addEventListener('blur', closeMenus);

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (cf) { if (!cf.busy) closeConfirm(); return; }
    if (menuAnchor) return; // handled by the menu itself
    closeMenu();
    $('connectModal').classList.add('hidden');
    if ($('context').classList.contains('open')) setSheet(false);
  });

  window.addEventListener('resize', () => {
    closeMenus();
    if (!isMobile()) { closeMenu(); }
  }, { passive: true });

  /* catch up on anything missed while the tab was hidden (single refresh, no polling) */
  document.addEventListener('visibilitychange', () => { if (!document.hidden && st.booted) scheduleFullRefresh(); });
  window.addEventListener('pagehide', () => { if (st.attach && st.attach.previewUrl) { try { URL.revokeObjectURL(st.attach.previewUrl); } catch (_) {} } });

  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.href = 'login.html'; });
}

/* ---------------- boot ---------------- */
async function boot() {
  try {
    bind();
    bindViewport();
    setMode(st.mode);
    await session();
    await Promise.all([
      loadConversations().catch(e => console.warn('[WA] conversations failed:', e.message)),
      loadServices(), loadConnection()
    ]);
    setupRealtime();
    $('boot').remove();
    st.booted = true;
    updateComposerState();
    await handoff();
  } catch (e) {
    console.error(e);
    $('boot').innerHTML = `<div style="color:#ff6472;max-width:320px">${esc(friendly(e))}</div><button class="primary-btn" onclick="location.reload()">Retry</button>`;
  }
}

boot();
})();
