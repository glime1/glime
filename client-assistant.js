/* GLIME Client Assistant — central frontend runtime (v3).
 * ONE authoritative flow: proposal -> render -> approve/reject -> backend result -> final state.
 * Backend is authoritative. This file never sends client_id, never calls a provider directly,
 * and never claims success that the backend has not confirmed.
 * Messaging proposals (assistant_message.v1) are approved/rejected ONLY through the canonical
 * client-assistant endpoint. Data-mutation proposals keep their existing approve RPC. */
(() => {
  'use strict';
  if (window.__glimeClientAssistantStarted) return; // idempotent init
  window.__glimeClientAssistantStarted = true;

  /* ===================== CONFIG ===================== */
  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA'; // publishable key only
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/client-assistant';

  const CONFIG = Object.freeze({
    nav: Object.freeze({ billing: 'billing.html', settings: 'settings.html', connector: 'ai-connections.html', login: 'login.html' }),
    navLabels: Object.freeze({ billing: 'Go to Billing', settings: 'Open Settings', connector: 'Open Connector' }),
    historyTurns: 12,
    maxAttachments: 4,
    requestTimeoutMs: 60000,
    approvalTimeoutMs: 90000,
    image: Object.freeze({ maxDim: 1600, quality: 0.82, minBytes: 200 * 1024, maxInputBytes: 20 * 1024 * 1024, optimizable: ['image/jpeg', 'image/png', 'image/webp'] }),
    poll: Object.freeze({ intervalMs: 2000, maxAttempts: 60 }),
    storageKey: 'glime.clientAssistant.conversationId'
  });

  /* Conversation operations (backend client-assistant): list / load / open / rename / delete. */
  const OP_NAMES = Object.freeze({ list: 'list', load: 'load', open: 'open', rename: 'rename', remove: 'delete' });

  /* Attachment types the live backend accepts. */
  const AI_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const AI_PDF_MIME = 'application/pdf';
  const AI_MAX_BYTES = 4500000;

  const DEFAULT_LIMITS = Object.freeze({ max_recipients: 5, max_message_characters: 300, max_message_lines: 3 });
  const CHANNEL_LABEL = Object.freeze({ whatsapp: 'WhatsApp', instagram: 'Instagram' });
  const TARGET_MODE_LABEL = Object.freeze({ single: 'Single recipient', selected: 'Selected recipients', audience: 'Audience' });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const STATUS_ORDER = ['proposed', 'approved', 'queued', 'processing', 'completed'];
  const STATUS_LABEL = { proposed: 'Proposed', approved: 'Approved', queued: 'Queued', processing: 'Processing', completed: 'Completed', failed: 'Failed', rejected: 'Rejected', unknown: 'Outcome unknown' };
  const MSG_BADGE = { queued: 'Queued', processing: 'Processing', completed: 'Sent', partial: 'Partially sent', blocked: 'Blocked', failed: 'Failed', unknown: 'Delivery unknown', rejected: 'Rejected' };
  const RES_LABEL = { completed: 'Sent', failed: 'Failed', blocked: 'Blocked', unknown: 'Unknown', queued: 'Queued', processing: 'Sending', partial: 'Partial' };

  /* ===================== HELPERS ===================== */
  const $ = (id) => document.getElementById(id);
  const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
  const appError = (code, message) => Object.assign(new Error(message || code), { code });
  const userErr = (message) => Object.assign(new Error(message), { userMessage: message });
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  function toB64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error || new Error('read'));
      r.readAsDataURL(file);
    });
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function tpl(id) { return $(id).content.cloneNode(true); }
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name); svg.appendChild(use);
    return svg;
  }
  function formatBytes(n) {
    if (!Number.isFinite(n)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function formatWhen(ts) {
    const d = new Date(ts); if (isNaN(d)) return '';
    const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const sod = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((sod(new Date()) - sod(d)) / 864e5);
    if (diff === 0) return 'Today, ' + t;
    if (diff === 1) return 'Yesterday, ' + t;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + t;
  }
  function money(v, cur) {
    if (!cur || String(cur).toUpperCase() === 'INR') return '\u20B9' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' ' + cur;
  }
  function fieldLabel(f) { const s = String(f || '').replace(/_/g, ' ').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Field'; }
  function formatValue(field, v, cur) {
    if (v === null || v === undefined || v === '') return '\u2014';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return /price|amount|budget/i.test(field) ? money(v, cur) : v.toLocaleString('en-IN');
    if (typeof v === 'string') { const s = v.length > 400 ? v.slice(0, 400) + '\u2026' : v; return /^(available|unavailable|mixed)$/.test(s) ? fieldLabel(s) : s; }
    try { return JSON.stringify(v).slice(0, 400); } catch { return '\u2014'; }
  }
  function userMessageFor(err) {
    if (err && err.userMessage) return err.userMessage;
    switch (err && err.code) {
      case 'SESSION_EXPIRED': return 'Your session has expired. Please sign in again.';
      case 'NETWORK': return 'Unable to reach GLIME right now. Please try again.';
      case 'TIMEOUT': return 'GLIME did not respond in time. Retrying sends the same request, so your message will not be duplicated.';
      case 'NOT_ENABLED': return 'The Client Assistant is not enabled for this account.';
      default: return 'GLIME could not complete this request.';
    }
  }
  function prim(v) {
    if (v == null) return '';
    if (typeof v === 'object') {
      if (Array.isArray(v)) return '';
      return Object.entries(v).filter(([, x]) => x != null && typeof x !== 'object').map(([k, x]) => fieldLabel(k) + ': ' + x).join(', ');
    }
    return String(v);
  }

  /* ===================== STATE + DOM ===================== */
  const state = {
    conversationId: null,
    conversations: [],
    messages: [],
    attachments: [],
    rendered: new Set(), // action_request_ids already shown in this view
    thinking: false,
    sending: false,
    toastTimer: null
  };

  const dom = {
    app: $('assistantApp'), container: $('conversationContainer'), messages: $('messages'), empty: $('emptyState'),
    thinking: $('thinkingIndicator'), thinkingLabel: $('thinkingLabel'), thinkingBadge: $('thinkingBadge'), status: $('status'),
    form: $('chatForm'), input: $('messageInput'), send: $('sendBtn'), tray: $('attachmentTray'), trayList: $('attachmentList'),
    list: $('conversationList'), backdrop: $('overlayBackdrop'), toast: $('toast'),
    dlg: { title: $('dialogTitle'), body: $('dialogBody'), input: $('dialogInput'), cancel: $('dialogCancel'), confirm: $('dialogConfirm') },
    thinkingBtn: $('glimeThinkingBtn'),
    inputs: { camera: $('cameraInput'), photos: $('photosInput'), files: $('filesInput') }
  };

  /* ===================== EXTENSION API ===================== */
  const extensions = { uiActions: new Map(), onMessage: [] };
  window.GlimeAssistant = Object.freeze({
    version: '3.0.0',
    extend(spec) {
      if (!spec || typeof spec !== 'object') return false;
      if (spec.uiActions && typeof spec.uiActions === 'object') {
        Object.entries(spec.uiActions).forEach(([type, fn]) => {
          if (type !== 'navigate' && typeof fn === 'function') extensions.uiActions.set(type, fn);
        });
      }
      if (typeof spec.onMessage === 'function') extensions.onMessage.push(spec.onMessage);
      return true;
    }
  });

  /* ===================== TOAST / NAV ===================== */
  function toast(text) {
    dom.toast.textContent = text; dom.toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 3200);
  }
  function navigate(target) {
    const url = CONFIG.nav[target];
    if (!url) return;
    window.location.href = url;
  }

  /* ===================== OVERLAYS (one at a time) ===================== */
  const OVERLAYS = {
    drawer: { el: $('conversationDrawer'), trigger: $('conversationMenuBtn'), tone: 'dim' },
    more: { el: $('moreMenu'), trigger: $('moreMenuBtn'), tone: 'clear' },
    plus: { el: $('attachmentMenu'), trigger: $('attachmentBtn'), tone: 'dim' },
    dialog: { el: $('dialog'), trigger: null, tone: 'dim' }
  };
  let activeOverlay = null;
  let lastFocus = null;
  let dialogResolver = null;

  function openOverlay(name) {
    if (activeOverlay === name) return;
    if (activeOverlay) closeOverlay(true);
    const o = OVERLAYS[name];
    activeOverlay = name;
    lastFocus = document.activeElement;
    if (name === 'more') syncMenuState();
    o.el.inert = false; o.el.dataset.open = 'true';
    if (o.trigger) o.trigger.setAttribute('aria-expanded', 'true');
    dom.backdrop.dataset.tone = o.tone; dom.backdrop.dataset.open = 'true';
    const first = o.el.querySelector('input:not([hidden]),button:not(:disabled)');
    setTimeout(() => { if (first && activeOverlay === name) first.focus(); }, 40);
  }
  function closeOverlay(skipFocus) {
    if (!activeOverlay) return;
    const o = OVERLAYS[activeOverlay];
    o.el.dataset.open = 'false'; o.el.inert = true;
    if (o.trigger) o.trigger.setAttribute('aria-expanded', 'false');
    dom.backdrop.dataset.open = 'false';
    activeOverlay = null;
    if (dialogResolver) { const r = dialogResolver; dialogResolver = null; r(null); }
    if (!skipFocus && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function toggleOverlay(name) { activeOverlay === name ? closeOverlay() : openOverlay(name); }

  function askDialog({ title, body, confirmLabel, destructive, input }) {
    return new Promise((resolve) => {
      const d = dom.dlg;
      d.title.textContent = title; d.body.textContent = body || '';
      d.body.hidden = !body;
      d.input.hidden = !input; d.input.value = input ? input.value || '' : '';
      d.confirm.textContent = confirmLabel || 'Confirm';
      d.confirm.className = 'btn ' + (destructive ? 'btn-danger' : 'btn-primary');
      openOverlay('dialog');
      dialogResolver = (v) => resolve(v);
      dialogResolver.wantsInput = !!input;
    });
  }
  function finishDialog(ok) {
    const r = dialogResolver; if (!r) return;
    const val = dom.dlg.input.value.trim();
    const wants = r.wantsInput;
    dialogResolver = null;
    closeOverlay(true);
    r(ok ? (wants ? val : true) : null);
  }

  /* ===================== RICH TEXT (safe, no innerHTML) ===================== */
  function inline(parent, text) {
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith('**')) parent.append(el('strong', null, tok.slice(2, -2)));
      else parent.append(el('code', null, tok.slice(1, -1)));
      last = m.index + tok.length;
    }
    if (last < text.length) parent.append(text.slice(last));
  }
  function renderRich(text) {
    const frag = document.createDocumentFragment();
    let list = null, para = [];
    const flush = () => {
      if (!para.length) return;
      const p = el('p');
      para.forEach((l, i) => { if (i) p.appendChild(document.createElement('br')); inline(p, l); });
      frag.appendChild(p); para = [];
    };
    String(text || '').replace(/\r\n/g, '\n').split('\n').forEach((raw) => {
      const line = raw.trimEnd();
      const li = line.match(/^\s*(?:[-*\u2022]|(\d+)[.)])\s+(.*)$/);
      if (li) {
        flush();
        const ordered = !!li[1];
        if (!list || list.ordered !== ordered) { list = { ordered, node: el(ordered ? 'ol' : 'ul') }; frag.appendChild(list.node); }
        const item = el('li'); inline(item, li[2]); list.node.appendChild(item); return;
      }
      list = null;
      if (!line.trim()) { flush(); return; }
      const h = line.match(/^#{1,4}\s+(.*)$/);
      if (h) { flush(); const hp = el('p', 'md-heading'); inline(hp, h[1]); frag.appendChild(hp); return; }
      para.push(line);
    });
    flush();
    return frag;
  }

  /* ===================== MESSAGES ===================== */
  function scrollToEnd() { requestAnimationFrame(() => { dom.container.scrollTop = dom.container.scrollHeight; }); }
  function syncEmpty() { dom.empty.hidden = dom.messages.childElementCount > 0 || state.sending; }
  function findRow(id) { return Array.from(dom.messages.children).find((n) => n.dataset && n.dataset.id === String(id)) || null; }

  function buildAttachmentCard(a) {
    if (a.kind === 'image' && a.previewUrl) {
      const img = el('img', 'msg-image'); img.src = a.previewUrl; img.alt = a.name; img.loading = 'lazy'; return img;
    }
    const card = el('div', 'file-card'); card.appendChild(icon('file'));
    const info = el('div'); info.append(el('b', null, a.name), el('small', null, (a.type || '').split('/').pop().toUpperCase() + ' \u00b7 ' + formatBytes(a.size)));
    card.appendChild(info); return card;
  }
  function buildMessage(msg) {
    const row = el('article', 'message ' + msg.role); row.dataset.id = msg.id;
    if (msg.attachments && msg.attachments.length) {
      const wrap = el('div', 'msg-attachments'); msg.attachments.forEach((a) => wrap.appendChild(buildAttachmentCard(a))); row.appendChild(wrap);
    }
    if (msg.text) {
      const b = el('div', 'bubble');
      if (msg.role === 'user') b.textContent = msg.text; else b.appendChild(renderRich(msg.text));
      row.appendChild(b);
    }
    return row;
  }
  function addMessage(msg) {
    const existing = findRow(msg.id);
    if (existing) return existing; // never render the same turn twice
    state.messages.push(msg);
    const row = buildMessage(msg);
    dom.messages.appendChild(row);
    syncEmpty(); scrollToEnd(); syncMenuState();
    extensions.onMessage.forEach((fn) => { try { fn(row, msg); } catch { /* extension errors never break chat */ } });
    return row;
  }
  function addNotice(text, isError, parent) {
    const n = el('div', 'notice' + (isError ? ' is-error' : ''), text);
    if (isError) n.setAttribute('role', 'alert');
    (parent || dom.messages).appendChild(n); syncEmpty(); scrollToEnd(); return n;
  }
  function addBackendAnswer(data) {
    if (data && typeof data.answer === 'string' && data.answer.trim()) {
      addMessage({ id: data.turn_id || uuid(), role: 'assistant', text: data.answer.trim(), at: Date.now(), attachments: [] });
    }
  }
  function clearMessagesView() {
    state.messages.forEach((m) => (m.attachments || []).forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl)));
    state.messages = []; state.rendered.clear(); dom.messages.replaceChildren(); syncEmpty(); syncMenuState();
  }

  /* ===================== MENU STATE / EXPORT / COPY ===================== */
  function syncMenuState() {
    const has = state.messages.length > 0;
    ['renameConversationBtn', 'exportConversationBtn', 'copyConversationBtn', 'clearConversationBtn'].forEach((id) => { $(id).disabled = !has; });
    $('deleteConversationBtn').disabled = !state.conversationId;
  }
  function transcript() {
    return state.messages.map((m) => (m.role === 'user' ? 'You' : 'GLIME') + ': ' + m.text).join('\n\n');
  }
  function exportConversation() {
    const data = {
      exported_at: new Date().toISOString(),
      conversation_id: state.conversationId,
      messages: state.messages.map((m) => ({ role: m.role, text: m.text, at: new Date(m.at).toISOString(), attachments: (m.attachments || []).map((a) => ({ name: a.name, type: a.type, size: a.size })) }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'glime-conversation-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Conversation exported');
  }
  async function copyConversation() {
    const text = transcript();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else { const t = el('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      toast('Conversation copied');
    } catch { toast('Could not copy the conversation.'); }
  }

  /* ===================== AUTH + BACKEND ===================== */
  async function getSession() {
    if (!db) return null;
    try { const { data, error } = await db.auth.getSession(); return error ? null : (data && data.session) || null; } catch { return null; }
  }
  /* Throws SESSION_EXPIRED / NETWORK / TIMEOUT. Resolves {res,data} for any HTTP response. */
  async function postAssistant(body, timeoutMs) {
    const session = await getSession();
    if (!session) throw appError('SESSION_EXPIRED');
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs || CONFIG.requestTimeoutMs);
    let res;
    try {
      res = await fetch(FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify(body), signal: ctl.signal });
    } catch (e) {
      clearTimeout(timer);
      throw appError(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    clearTimeout(timer);
    return { res, data };
  }
  async function conversationOp(op, payload) {
    const { res, data } = await postAssistant(Object.assign({ op: OP_NAMES[op] }, payload));
    if (res.status === 401) throw appError('SESSION_EXPIRED');
    if (!res.ok || !data || data.error) throw appError('BACKEND');
    return data;
  }
  /* Canonical approval/rejection endpoint — the ONLY path for assistant messaging proposals. */
  function postDecision(actionRequestId, decision, timeoutMs) {
    const body = { approval: { action_request_id: actionRequestId, decision } };
    if (state.conversationId) body.conversation_id = state.conversationId;
    return postAssistant(body, timeoutMs || CONFIG.requestTimeoutMs);
  }
  async function fetchStatus(id) {
    if (!db) throw appError('SESSION_EXPIRED');
    const { data, error } = await db.rpc('get_client_action_execution_status', { p_action_request_id: id });
    if (error || !data || data.ok === false) throw appError('STATUS');
    const raw = (data.execution_job && data.execution_job.status) || (data.action_request && data.action_request.status) || '';
    return { raw: String(raw).toLowerCase(), data };
  }

  /* ===================== CONVERSATIONS ===================== */
  function upsertConversation(id, title, at) {
    if (!id) return;
    const found = state.conversations.find((c) => c.id === id);
    if (found) { if (title && !found.title) found.title = title; found.at = at || Date.now(); }
    else state.conversations.unshift({ id, title: title || 'New conversation', at: at || Date.now() });
    renderConversationList();
  }
  function renderConversationList() {
    dom.list.replaceChildren();
    if (!state.conversations.length) dom.list.appendChild(el('div', 'list-note', 'No conversations yet.'));
    state.conversations.forEach((c) => {
      const row = el('div', 'conv-row' + (c.id === state.conversationId ? ' is-active' : ''));
      const open = el('button', 'conv-open'); open.type = 'button'; open.dataset.id = c.id;
      open.append(el('b', null, c.title), el('small', null, formatWhen(c.at)));
      if (c.id === state.conversationId) open.setAttribute('aria-current', 'true');
      const del = el('button', 'conv-del'); del.type = 'button'; del.dataset.id = c.id; del.dataset.action = 'delete';
      del.setAttribute('aria-label', 'Delete conversation: ' + c.title); del.appendChild(icon('trash'));
      row.append(open, del); dom.list.appendChild(row);
    });
  }
  function setConversationId(id) {
    state.conversationId = id && UUID_RE.test(id) ? id : null;
    try { state.conversationId ? sessionStorage.setItem(CONFIG.storageKey, state.conversationId) : sessionStorage.removeItem(CONFIG.storageKey); } catch { /* storage unavailable */ }
    syncMenuState();
  }
  function startNewChat() {
    closeOverlay(true);
    setConversationId(null); clearMessagesView(); clearAttachments();
    dom.input.value = ''; autosize(); renderConversationList();
    if (window.matchMedia('(pointer:fine)').matches) dom.input.focus();
  }
  async function loadConversationData(id) {
    try { return await conversationOp('load', { conversation_id: id }); }
    catch (e) {
      if (e && e.code === 'BACKEND') return await conversationOp('open', { conversation_id: id });
      throw e;
    }
  }
  async function openConversation(id) {
    if (id === state.conversationId && state.messages.length) { closeOverlay(); return; }
    try {
      const data = await loadConversationData(id);
      const conv = data.conversation || data;
      const turns = conv.turns || data.turns;
      if (!Array.isArray(turns)) throw appError('BACKEND');
      closeOverlay(true); clearMessagesView(); setConversationId(conv.id || id);
      turns
        .filter((t) => !String(t.content || '').startsWith('[client '))
        .forEach((t) => {
          const role = t.role === 'user' ? 'user' : 'assistant';
          const row = addMessage({ id: t.id || t.turn_id || uuid(), role, text: String(t.content || ''), at: t.created_at ? Date.parse(t.created_at) : Date.now(), attachments: (t.meta && t.meta.attachments) || [] });
          if (role === 'assistant' && t.proposal && typeof t.proposal === 'object') appendProposal(row, t.proposal, { restored: true });
        });
      renderConversationList();
    } catch (e) {
      toast(userMessageFor(e));
    }
  }
  async function renameConversation() {
    const current = state.conversations.find((c) => c.id === state.conversationId);
    closeOverlay(true);
    const title = await askDialog({ title: 'Rename conversation', confirmLabel: 'Save', input: { value: current ? current.title : '' } });
    if (!title) return;
    if (!state.conversationId) { toast('Send a message first, then rename the conversation.'); return; }
    try { await conversationOp('rename', { conversation_id: state.conversationId, title }); if (current) current.title = title; renderConversationList(); toast('Conversation renamed'); }
    catch (e) { toast(userMessageFor(e)); }
  }
  async function deleteConversation(id) {
    const target = id || state.conversationId;
    closeOverlay(true);
    if (!target) { toast('There is no saved conversation to delete yet.'); return; }
    const ok = await askDialog({ title: 'Delete conversation?', body: 'This permanently deletes the conversation and its messages. This cannot be undone.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await conversationOp('remove', { conversation_id: target });
      state.conversations = state.conversations.filter((c) => c.id !== target);
      if (target === state.conversationId) startNewChat(); else renderConversationList();
      toast('Conversation deleted');
    } catch (e) { toast(userMessageFor(e)); }
  }
  function clearCurrentChat() {
    closeOverlay(true);
    clearMessagesView(); clearAttachments(); toast('Chat view cleared. The conversation is kept.');
  }

  /* ===================== ATTACHMENTS ===================== */
  function extOf(name) { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); }

  async function optimizeImage(file) {
    if (!CONFIG.image.optimizable.includes(file.type) || typeof createImageBitmap !== 'function') return null;
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return null; }
    const scale = Math.min(1, CONFIG.image.maxDim / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < CONFIG.image.minBytes) { bmp.close && bmp.close(); return null; }
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const encode = (type, whiteBg) => new Promise((resolve) => {
      ctx.clearRect(0, 0, w, h);
      if (whiteBg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(bmp, 0, 0, w, h);
      canvas.toBlob((b) => resolve(b), type, CONFIG.image.quality);
    });
    let blob = await encode('image/webp', false);
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', true);
    bmp.close && bmp.close();
    if (!blob || blob.size >= file.size * 0.95) return null;
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
  }

  /* Only types the live backend accepts: PNG, JPEG, WebP, GIF images and PDF, up to 4.5 MB each. */
  async function prepareAttachment(file) {
    const type = (file.type || '').toLowerCase();
    const isImage = AI_IMAGE_MIME.includes(type);
    const isPdf = type === AI_PDF_MIME || (!type && extOf(file.name) === 'pdf');
    if (!isImage && !isPdf) throw userErr('Only PNG, JPEG, WebP and GIF images and PDF files are supported.');
    if (isImage) {
      if (file.size > CONFIG.image.maxInputBytes) throw userErr('That image is too large (max ' + formatBytes(CONFIG.image.maxInputBytes) + ').');
      const optimized = await optimizeImage(file);
      const out = optimized || file;
      if (out.size > AI_MAX_BYTES) throw userErr(file.name + ' is larger than ' + formatBytes(AI_MAX_BYTES) + ' even after optimization.');
      return { id: uuid(), kind: 'image', name: out.name, type: out.type, originalSize: file.size, size: out.size, optimized: !!optimized, file: out, previewUrl: URL.createObjectURL(out) };
    }
    if (file.size > AI_MAX_BYTES) throw userErr('PDF files can be up to ' + formatBytes(AI_MAX_BYTES) + '.');
    const pdf = type === AI_PDF_MIME ? file : new File([file], file.name, { type: AI_PDF_MIME });
    return { id: uuid(), kind: 'doc', name: pdf.name, type: AI_PDF_MIME, originalSize: file.size, size: file.size, optimized: false, file: pdf, previewUrl: null };
  }

  async function addFiles(fileList) {
    for (const f of Array.from(fileList || [])) {
      if (state.attachments.length >= CONFIG.maxAttachments) { toast('You can attach up to ' + CONFIG.maxAttachments + ' files.'); break; }
      try { state.attachments.push(await prepareAttachment(f)); }
      catch (e) { toast(e.userMessage || 'This file could not be attached.'); }
    }
    renderTray();
  }
  function releaseAttachment(a) { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); }
  function clearAttachments() { state.attachments.forEach(releaseAttachment); state.attachments = []; renderTray(); }

  function renderTray() {
    dom.trayList.replaceChildren();
    dom.tray.hidden = state.attachments.length === 0;
    state.attachments.forEach((a) => {
      const item = el('div', 'attachment-item');
      if (a.kind === 'image') { const t = el('img', 'attachment-thumb'); t.src = a.previewUrl; t.alt = ''; item.appendChild(t); }
      else item.appendChild(el('div', 'attachment-icon', (extOf(a.name) || 'file').toUpperCase().slice(0, 4)));
      const info = el('div', 'attachment-info'); info.appendChild(el('b', null, a.name));
      if (a.optimized) { info.appendChild(el('span', null, 'Original: ' + formatBytes(a.originalSize))); info.appendChild(el('span', null, 'Optimized: ' + formatBytes(a.size))); }
      else info.appendChild(el('span', null, formatBytes(a.size)));
      item.appendChild(info);
      const rm = el('button', 'attachment-remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + a.name); rm.appendChild(icon('close'));
      rm.addEventListener('click', () => { releaseAttachment(a); state.attachments = state.attachments.filter((x) => x.id !== a.id); renderTray(); });
      item.appendChild(rm); dom.trayList.appendChild(item);
    });
  }

  /* ===================== THINKING ===================== */
  function setThinkingMode(on) {
    state.thinking = on;
    dom.thinkingBtn.setAttribute('aria-pressed', String(on));
    dom.thinkingBadge.hidden = !on;
  }
  function setSending(on) {
    state.sending = on;
    dom.send.disabled = on; dom.container.setAttribute('aria-busy', String(on));
    dom.thinking.hidden = !on;
    dom.thinking.classList.toggle('is-enhanced', on && state.thinking);
    dom.thinkingLabel.textContent = state.thinking ? 'GLIME Thinking\u2026' : 'Working on it\u2026';
    if (on) dom.messages.after(dom.thinking);
    syncEmpty(); if (on) scrollToEnd();
  }

  /* ===================== SEND ===================== */
  function buildHistory() {
    return state.messages.filter((m) => m.text).slice(-CONFIG.historyTurns).map((m) => ({ role: m.role, content: m.text.slice(0, 2000) }));
  }
  function isCreditsExhausted(status, data) {
    return status === 402 || !!(data && (data.code === 'AI_CREDITS_EXHAUSTED' || data.error_code === 'AI_CREDITS_EXHAUSTED' || (data.credits && data.credits.blocked === true)));
  }

  async function handleSend() {
    if (state.sending) return;
    const text = dom.input.value.trim();
    if (!text) { if (state.attachments.length) toast('Add a message to send with your attachments.'); return; }
    closeOverlay(true);
    const thinkingAtSend = state.thinking;
    const pending = state.attachments.splice(0);
    const sentAtt = pending.map((a) => ({ id: a.id, kind: a.kind, name: a.name, type: a.type, size: a.size, originalSize: a.originalSize, optimized: a.optimized, previewUrl: a.previewUrl }));
    renderTray();
    const history = buildHistory();
    addMessage({ id: uuid(), role: 'user', text, at: Date.now(), attachments: sentAtt });
    dom.input.value = ''; autosize();
    setSending(true); // lock immediately
    let aiFiles;
    try {
      aiFiles = await Promise.all(pending.slice(0, CONFIG.maxAttachments).map(async (a) => ({ name: a.name, mime_type: a.type, data_base64: await toB64(a.file) })));
    } catch {
      setSending(false);
      addNotice('An attachment could not be read. Please remove it and try again.', true);
      return;
    }
    /* One logical user action = one request_id. Retrying the SAME request reuses it. */
    const payload = { message: text, history, request_id: uuid(), thinking: thinkingAtSend, attachments: aiFiles };
    if (state.conversationId) payload.conversation_id = state.conversationId;
    await dispatchChat({ payload, thinking: thinkingAtSend });
  }

  async function dispatchChat(job) {
    setSending(true);
    try {
      const { res, data } = await postAssistant(job.payload);
      if (res.status === 401) throw appError('SESSION_EXPIRED');
      if (isCreditsExhausted(res.status, data)) { dom.messages.appendChild(tpl('creditsTemplate')); scrollToEnd(); return; }
      if (res.status === 403) throw appError('NOT_ENABLED');
      if (!res.ok || !data || data.error) throw appError('BACKEND');
      if (data.conversation_id && UUID_RE.test(data.conversation_id)) {
        setConversationId(data.conversation_id);
        upsertConversation(data.conversation_id, data.title || String(job.payload.message).slice(0, 48), Date.now());
      }
      const answer = typeof data.answer === 'string' && data.answer.trim() ? data.answer.trim() : 'GLIME did not return an answer.';
      const row = addMessage({ id: data.turn_id || uuid(), role: 'assistant', text: answer, at: Date.now(), attachments: [] });
      if (data.report) renderReport(data.report, row);
      if (Array.isArray(data.ui_actions) && data.ui_actions.length) renderUiActions(data.ui_actions, row);
      if (data.proposal && typeof data.proposal === 'object') appendProposal(row, data.proposal, { restored: false });
      if (job.thinking && !(data.thinking && data.thinking.applied)) addNotice('Enhanced reasoning was not applied for this answer.', false, row);
      scrollToEnd();
    } catch (e) {
      const notice = addNotice(userMessageFor(e), true);
      if (e && (e.code === 'NETWORK' || e.code === 'TIMEOUT')) {
        const retry = el('button', 'btn btn-secondary', 'Retry'); retry.type = 'button'; retry.style.marginLeft = '10px';
        retry.addEventListener('click', () => { if (state.sending) return; notice.remove(); dispatchChat(job); });
        notice.appendChild(retry);
      }
      if (e && e.code === 'SESSION_EXPIRED') setTimeout(() => navigate('login'), 2200);
    } finally {
      setSending(false);
      if (window.matchMedia('(pointer:fine)').matches) dom.input.focus();
    }
  }

  /* ===================== REPORT / UI ACTIONS ===================== */
  function renderReport(report, row) {
    if (!report || typeof report !== 'object') return;
    const card = el('section', 'card'); card.style.alignSelf = 'stretch';
    if (report.title) card.appendChild(el('div', 'eyebrow', String(report.title).slice(0, 80)));
    const grid = el('div', 'change-list');
    (Array.isArray(report.metrics) ? report.metrics : []).slice(0, 12).forEach((m) => {
      const box = el('div', 'change-box'); box.append(el('span', 'label', String(m.label || '')), el('strong', null, String(m.value ?? '\u2014'))); grid.appendChild(box);
    });
    if (grid.childElementCount) card.appendChild(grid);
    if (Array.isArray(report.insights) && report.insights.length) { const ul = el('ul'); report.insights.slice(0, 5).forEach((t) => ul.appendChild(el('li', null, String(t)))); card.appendChild(ul); }
    if (card.childElementCount) row.appendChild(card);
  }
  function renderUiActions(actions, row) {
    const wrap = el('div', 'ui-actions');
    actions.slice(0, 6).forEach((a) => {
      if (!a || typeof a.type !== 'string') return;
      let node = null;
      if (a.type === 'navigate' && CONFIG.nav[a.target] && a.target !== 'login') {
        node = el('button', 'btn btn-secondary', CONFIG.navLabels[a.target] || 'Open'); node.type = 'button';
        node.addEventListener('click', () => navigate(a.target));
      } else if (extensions.uiActions.has(a.type)) {
        try { node = extensions.uiActions.get(a.type)(a, { navigate, toast }); } catch { node = null; }
      }
      if (node instanceof HTMLElement) wrap.appendChild(node);
    });
    if (wrap.childElementCount) row.appendChild(wrap);
  }

  /* ===================== PROPOSALS — single controller ===================== */
  function isMessageProposal(p) {
    return !!p && (p.proposal_type === 'message' || p.contract_version === 'assistant_message.v1' || (p.contract && p.contract.version === 'assistant_message.v1'));
  }
  function proposalId(p) {
    const id = String((p && (p.action_request_id || p.id)) || '');
    return UUID_RE.test(id) ? id : '';
  }
  function appendProposal(row, p, opts) {
    const id = proposalId(p);
    if (id && state.rendered.has(id)) { addNotice('This proposal is already shown above.', false, row); return; }
    if (id) state.rendered.add(id);
    row.appendChild(renderProposal(p, opts || {}));
  }
  function renderProposal(p, opts) {
    return isMessageProposal(p) ? renderMessageProposal(p, opts) : renderMutationProposal(p, opts);
  }

  /* Shared reject path (canonical endpoint) for every proposal kind. */
  async function rejectProposal(ui) {
    if (ui.busy) return;
    ui.busy = true;
    ui.approve.disabled = true; ui.reject.disabled = true;
    ui.status.hidden = false; ui.status.textContent = 'Rejecting\u2026';
    try {
      const { res, data } = await postDecision(ui.id, 'reject', CONFIG.requestTimeoutMs);
      if (res.status === 401) throw appError('SESSION_EXPIRED');
      if (!res.ok || !data || data.error) throw appError('BACKEND');
      ui.stopped = true; ui.actions.hidden = true; ui.status.hidden = true;
      ui.note.hidden = false;
      ui.note.textContent = ui.kind === 'message' ? 'Rejected. Nothing was sent.' : 'Rejected. Nothing was changed.';
      addBackendAnswer(data);
    } catch (e) {
      ui.busy = false;
      ui.approve.disabled = !ui.canApprove; ui.reject.disabled = false;
      ui.status.textContent = userMessageFor(e);
    }
  }

  /* ---------- Outcome parsing (tolerant; backend remains authoritative) ---------- */
  function classify(raw, code) {
    const r = String(raw || '').toLowerCase(), c = String(code || '').toUpperCase();
    if (c === 'DELIVERY_STATE_UNKNOWN' || /unknown|uncertain/.test(r)) return 'unknown';
    if (['all_sent', 'sent', 'completed', 'succeeded', 'success', 'done', 'delivered'].includes(r)) return 'completed';
    if (['partial', 'partially_sent', 'partial_failure', 'partially_completed'].includes(r)) return 'partial';
    if (['blocked', 'denied', 'policy_blocked'].includes(r)) return 'blocked';
    if (['failed', 'error', 'cancelled', 'canceled', 'quarantined'].includes(r)) return 'failed';
    if (['processing', 'executing', 'running', 'claimed', 'started', 'in_progress'].includes(r)) return 'processing';
    if (['queued', 'approved', 'pending', 'accepted'].includes(r)) return 'queued';
    if (['proposed', 'awaiting_approval'].includes(r)) return 'proposed';
    if (r === 'rejected') return 'rejected';
    return '';
  }
  function pickNum(o, keys) {
    for (const k of keys) { const v = o[k]; if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) return Number(v); }
    return null;
  }
  function extractOutcome(d) {
    const srcs = [d && d.execution, d && d.execution_result, d && d.execution_job, d && d.result, d && d.outcome, d && d.approval, d && d.action_request, d]
      .filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    const out = { raw: '', code: '', results: null, sent: null, total: null, reason: '' };
    srcs.forEach((s) => {
      if (!out.raw) out.raw = String(s.status || s.state || s.outcome || s.execution_status || '');
      if (!out.code) out.code = String(s.code || s.error_code || s.reason_code || '');
      if (!out.reason) out.reason = String(s.blocked_reason || s.reason || s.message || (typeof s.error === 'string' ? s.error : '') || '');
      if (!out.results) {
        const arr = ['results', 'recipient_results', 'deliveries', 'per_recipient'].map((k) => s[k]).find((x) => Array.isArray(x));
        if (arr) out.results = arr;
      }
      if (out.sent == null) out.sent = pickNum(s, ['sent', 'sent_count', 'delivered_count']);
      if (out.total == null) out.total = pickNum(s, ['total', 'total_count', 'recipient_count', 'attempted']);
    });
    if (out.results && out.sent == null) {
      out.sent = out.results.filter((r) => r && classify(r.status || r.state || r.outcome, r.code || r.error_code) === 'completed').length;
      if (out.total == null) out.total = out.results.length;
    }
    if (out.reason.length > 240) out.reason = out.reason.slice(0, 240) + '\u2026';
    return out;
  }
  function nameOf(r, i) {
    if (typeof r === 'string' && r) return r;
    if (r && typeof r === 'object') {
      const n = r.name || r.display_name || r.full_name || r.customer_name || r.recipient_name || r.username || r.label;
      if (n) return String(n);
    }
    return 'Recipient ' + (i + 1);
  }
  function hasName(r) {
    return typeof r === 'string' ? !!r : !!(r && typeof r === 'object' && (r.name || r.display_name || r.full_name || r.customer_name || r.recipient_name || r.username || r.label));
  }

  /* ---------- Messaging proposal (assistant_message.v1) ---------- */
  function audienceRows(a) {
    const rows = [];
    const take = (label, keys) => { for (const k of keys) { const s = prim(a[k]); if (s) { rows.push([label, s]); return; } } };
    take('Audience', ['type', 'audience_type', 'mode', 'kind', 'label', 'description']);
    take('Ranking', ['criterion', 'ranking_criterion', 'ranking', 'rank_by', 'metric', 'sort_by']);
    take('Selected', ['limit', 'count', 'top_n', 'size']);
    take('Period', ['period', 'time_range', 'range']);
    return rows;
  }

  function renderMessageProposal(p, opts) {
    const id = proposalId(p);
    const limits = Object.assign({}, DEFAULT_LIMITS, p.limits && typeof p.limits === 'object' ? p.limits : {});
    const msg = String(p.message == null ? '' : p.message);
    const chars = Array.from(msg).length;
    const lines = msg ? msg.split(/\r?\n/).length : 0;
    const recips = Array.isArray(p.recipients) ? p.recipients : [];
    const count = Number.isFinite(Number(p.recipient_count)) ? Number(p.recipient_count) : recips.length;
    const chKey = String(p.channel || '').toLowerCase();
    const chLabel = CHANNEL_LABEL[chKey] || fieldLabel(chKey) || 'Unknown channel';

    const problems = [];
    if (!CHANNEL_LABEL[chKey]) problems.push('This channel is not supported for assistant messages.');
    if (count < 1) problems.push('A message needs at least one recipient.');
    if (count > limits.max_recipients) problems.push('This proposal has ' + count + ' recipients; the limit is ' + limits.max_recipients + '. It will not be split or batched.');
    if (!msg.trim()) problems.push('The message is empty.');
    if (chars > limits.max_message_characters) problems.push('The message is ' + chars + ' characters; the limit is ' + limits.max_message_characters + '. It will not be shortened.');
    if (lines > limits.max_message_lines) problems.push('The message has ' + lines + ' lines; the limit is ' + limits.max_message_lines + '. It will not be split.');

    const root = el('section', 'card proposal msg-proposal'); root.style.alignSelf = 'stretch';
    root.setAttribute('aria-label', chLabel + ' message proposal');

    const head = el('div', 'card-head');
    head.append(el('div', 'eyebrow', 'MESSAGE PROPOSAL'), el('span', 'badge', p.risk ? fieldLabel(p.risk) + ' risk' : 'Review required'));
    root.appendChild(head);

    const kv = el('div', 'mp-kv');
    const addKv = (k, v) => { kv.append(el('span', 'label', k), el('strong', null, v)); };
    addKv('Channel', chLabel);
    addKv('Mode', TARGET_MODE_LABEL[p.target_mode] || fieldLabel(p.target_mode || 'single'));
    addKv('Recipients', String(count));
    if (p.audience && typeof p.audience === 'object') audienceRows(p.audience).forEach(([k, v]) => addKv(k, v));
    root.appendChild(kv);

    if (recips.length) {
      const list = el('ul', 'mp-recipients'); list.setAttribute('aria-label', 'Recipients');
      recips.forEach((r, i) => list.appendChild(el('li', null, nameOf(r, i))));
      root.appendChild(list);
    }

    const mWrap = el('div', 'mp-row');
    mWrap.appendChild(el('span', 'label', 'Exact message'));
    mWrap.appendChild(el('div', 'mp-message', msg));
    mWrap.appendChild(el('div', 'mp-meta', chars + ' / ' + limits.max_message_characters + ' characters \u00b7 ' + lines + ' / ' + limits.max_message_lines + ' lines'));
    root.appendChild(mWrap);

    if (p.reason) { const r = el('div', 'mp-row'); r.append(el('span', 'label', 'Reason'), el('div', null, String(p.reason))); root.appendChild(r); }

    root.appendChild(el('div', 'mp-meta', 'Limits: up to ' + limits.max_recipients + ' recipients \u00b7 ' + limits.max_message_characters + ' characters \u00b7 ' + limits.max_message_lines + ' lines. No automatic batching.'));
    if (p.already_exists) root.appendChild(el('div', 'mp-meta', 'This proposal already existed; its current status is shown from the backend.'));

    const note = el('p', 'proposal-note', 'Nothing has been sent yet. The message will be sent only after you explicitly approve.');
    root.appendChild(note);

    let warn = null;
    if (problems.length) {
      warn = el('div', 'mp-warn'); warn.setAttribute('role', 'alert');
      problems.forEach((t) => warn.appendChild(el('div', null, t)));
      root.appendChild(warn);
    }

    const actions = el('div', 'card-actions');
    const reject = el('button', 'btn btn-secondary', 'Reject'); reject.type = 'button';
    const approve = el('button', 'btn btn-primary', 'Approve & Send'); approve.type = 'button';
    actions.append(reject, approve);
    root.appendChild(actions);

    const status = el('div', 'card-status'); status.hidden = true; status.setAttribute('aria-live', 'polite');
    const host = el('div'); host.hidden = true;
    root.append(status, host);

    const ui = { kind: 'message', id, root, approve, reject, actions, status, note, host, busy: false, stopped: false, polling: false, lastKind: null, channel: chLabel, recips, canApprove: !!id && problems.length === 0 };
    if (!ui.canApprove) approve.disabled = true;
    if (!id) { actions.hidden = true; note.textContent = 'This proposal cannot be approved from here.'; return root; }

    approve.addEventListener('click', () => approveMessage(ui));
    reject.addEventListener('click', () => rejectProposal(ui));

    const initial = classify(p.status, '');
    if (initial && initial !== 'proposed') {
      applyMsgOutcome(ui, initial, {});
      if (initial === 'queued' || initial === 'processing') { ui.polling = true; pollMessage(ui, 0); }
    } else if ((opts && opts.restored) || p.already_exists) {
      restoreFromBackend(ui);
    }
    return root;
  }

  function applyMsgOutcome(ui, kind, out) {
    out = out || {};
    ui.lastKind = kind;
    ui.actions.hidden = true; ui.status.hidden = true; ui.note.hidden = true;
    ui.host.hidden = false; ui.host.replaceChildren();
    const box = el('div', 'msg-outcome'); box.dataset.kind = kind;
    const head = el('div', 'card-head');
    const bad = kind === 'failed' || kind === 'blocked' || kind === 'unknown';
    head.append(el('div', 'eyebrow', 'DELIVERY STATUS'), el('span', 'badge' + (bad ? ' is-bad' : ''), MSG_BADGE[kind] || fieldLabel(kind)));
    box.appendChild(head);

    let text = '';
    const counts = out.sent != null && out.total != null ? 'Sent to ' + out.sent + ' of ' + out.total + ' recipients.' : '';
    if (kind === 'queued') text = 'Approved. Waiting to be sent.';
    else if (kind === 'processing') text = 'Sending\u2026';
    else if (kind === 'completed') text = counts;
    else if (kind === 'partial') text = counts || 'Only some recipients received the message.';
    else if (kind === 'blocked') text = out.reason || 'This message was blocked and was not sent.';
    else if (kind === 'failed') text = out.reason || 'The message could not be sent.';
    else if (kind === 'unknown') text = 'Delivery state is unknown. The message may or may not have been delivered. Do not retry automatically \u2014 check your ' + ui.channel + ' conversation first.';
    else if (kind === 'rejected') text = 'Rejected. Nothing was sent.';
    if (out.extra) text = (text ? text + ' ' : '') + out.extra;
    if (text) box.appendChild(el('p', 'mp-meta', text));

    if (Array.isArray(out.results) && out.results.length) {
      const list = el('ul', 'msg-results'); list.setAttribute('aria-label', 'Per-recipient results');
      out.results.forEach((r, i) => {
        const nm = hasName(r) ? nameOf(r, i) : nameOf(ui.recips[i], i);
        const k = (r && typeof r === 'object') ? classify(r.status || r.state || r.outcome, r.code || r.error_code) : '';
        const li = el('li'); li.append(el('span', null, nm), el('b', k === 'failed' || k === 'blocked' || k === 'unknown' || !k ? 'is-bad' : '', RES_LABEL[k] || 'Unknown'));
        list.appendChild(li);
      });
      box.appendChild(list);
    }

    if (kind === 'unknown') {
      const b = el('button', 'btn btn-secondary', 'Check status'); b.type = 'button'; b.style.marginTop = '10px';
      b.addEventListener('click', () => checkMsgStatus(ui, b));
      box.appendChild(b);
    }
    ui.host.appendChild(box);
    scrollToEnd();
  }

  async function approveMessage(ui) {
    if (ui.busy || !ui.canApprove) return; // double-click guard
    ui.busy = true;
    ui.approve.disabled = true; ui.reject.disabled = true; ui.approve.textContent = 'Approving\u2026';
    ui.status.hidden = false; ui.status.textContent = 'Approving\u2026';
    let r;
    try {
      r = await postDecision(ui.id, 'approve', CONFIG.approvalTimeoutMs);
    } catch (e) {
      if (e && e.code === 'SESSION_EXPIRED') {
        ui.busy = false; ui.approve.disabled = false; ui.reject.disabled = false; ui.approve.textContent = 'Approve & Send';
        ui.status.textContent = userMessageFor(e);
        return;
      }
      /* Network/timeout: the request may have reached the backend. Never claim success. */
      applyMsgOutcome(ui, 'unknown', { extra: 'We could not confirm the result of your approval.' });
      return;
    }
    const { res, data } = r;
    if (res.status === 401) {
      ui.busy = false; ui.approve.disabled = false; ui.reject.disabled = false; ui.approve.textContent = 'Approve & Send';
      ui.status.textContent = userMessageFor(appError('SESSION_EXPIRED'));
      return;
    }
    const out = extractOutcome(data || {});
    let kind = classify(out.raw, out.code);
    if (res.status >= 500 && !['completed', 'partial', 'blocked', 'failed'].includes(kind)) kind = 'unknown';
    if (!kind && !res.ok) {
      /* Definitive HTTP error without a recognised state: ask the backend what actually happened. */
      try { const s = await fetchStatus(ui.id); const k = classify(s.raw, ''); if (k && k !== 'proposed') { applyMsgOutcome(ui, k, extractOutcome(s.data)); addBackendAnswer(data); if (k === 'queued' || k === 'processing') { ui.polling = true; pollMessage(ui, 0); } return; } } catch { /* fall through */ }
      kind = 'failed';
      if (!out.reason && data && typeof data.error === 'string') out.reason = data.error.slice(0, 240);
    }
    if (!kind) kind = 'processing'; // accepted but not yet classified: confirm via status polling
    applyMsgOutcome(ui, kind, out);
    addBackendAnswer(data);
    if (kind === 'queued' || kind === 'processing') { ui.polling = true; pollMessage(ui, 0); }
  }

  async function pollMessage(ui, attempt) {
    if (ui.stopped) { ui.polling = false; return; }
    try {
      const s = await fetchStatus(ui.id);
      const kind = classify(s.raw, '');
      if (kind && kind !== 'proposed') {
        applyMsgOutcome(ui, kind, extractOutcome(s.data));
        if (kind !== 'queued' && kind !== 'processing') { ui.polling = false; return; }
      }
    } catch { /* keep the last confirmed state */ }
    if (attempt >= CONFIG.poll.maxAttempts) {
      ui.polling = false;
      applyMsgOutcome(ui, ui.lastKind || 'processing', { extra: 'Still in progress. Check back shortly.' });
      return;
    }
    setTimeout(() => pollMessage(ui, attempt + 1), CONFIG.poll.intervalMs);
  }

  async function checkMsgStatus(ui, btn) {
    btn.disabled = true;
    try {
      const s = await fetchStatus(ui.id);
      const kind = classify(s.raw, '');
      if (kind === 'proposed') {
        /* Backend confirms the approval never registered, so it is safe to act again. */
        ui.host.hidden = true; ui.actions.hidden = false; ui.note.hidden = false;
        ui.busy = false; ui.approve.disabled = !ui.canApprove; ui.reject.disabled = false; ui.approve.textContent = 'Approve & Send';
        toast('This proposal has not been approved yet.');
        return;
      }
      if (kind && kind !== 'unknown') {
        applyMsgOutcome(ui, kind, extractOutcome(s.data));
        if (kind === 'queued' || kind === 'processing') { ui.polling = true; pollMessage(ui, 0); }
        return;
      }
      toast('The outcome is still not confirmed.');
    } catch { toast('Status could not be checked right now.'); }
    btn.disabled = false;
  }

  async function restoreFromBackend(ui) {
    try {
      const s = await fetchStatus(ui.id);
      if (ui.kind === 'message') {
        const k = classify(s.raw, '');
        if (k && k !== 'proposed') {
          applyMsgOutcome(ui, k, extractOutcome(s.data));
          if (k === 'queued' || k === 'processing') { ui.polling = true; pollMessage(ui, 0); }
        }
      } else {
        const st = normalizeStatus(s.raw);
        if (st && st !== 'proposed') applyMutState(ui, st);
      }
    } catch {
      ui.status.hidden = false;
      ui.status.textContent = 'Current status could not be verified. The backend will confirm when you act.';
    }
  }

  /* ---------- Data-mutation proposal (existing contract preserved) ---------- */
  function normalizeStatus(s) {
    const v = String(s || '').toLowerCase();
    if (['proposed', 'awaiting_approval'].includes(v)) return 'proposed';
    if (v === 'approved') return 'approved';
    if (v === 'queued') return 'queued';
    if (['executing', 'processing', 'running', 'claimed', 'started'].includes(v)) return 'processing';
    if (['completed', 'succeeded', 'success', 'done'].includes(v)) return 'completed';
    if (v === 'rejected') return 'rejected';
    if (/unknown|uncertain/.test(v)) return 'unknown';
    if (['failed', 'blocked', 'cancelled', 'canceled', 'quarantined', 'error'].includes(v)) return 'failed';
    return null;
  }
  function setExecution(ui, status, message) {
    if (!ui.exec) {
      const root = tpl('executionTemplate').firstElementChild;
      ui.exec = { root, badge: root.querySelector('[data-role=badge]'), msg: root.querySelector('[data-role=message]'), steps: Array.from(root.querySelectorAll('.steps li')) };
      ui.host.hidden = false; ui.host.appendChild(root);
    }
    const bad = status === 'failed' || status === 'unknown';
    const idx = STATUS_ORDER.indexOf(status);
    ui.exec.badge.textContent = STATUS_LABEL[status] || 'Proposed';
    ui.exec.badge.classList.toggle('is-bad', bad);
    if (idx >= 0) ui.exec.steps.forEach((li, i) => { li.classList.toggle('is-done', i < idx || status === 'completed'); li.classList.toggle('is-active', i === idx && status !== 'completed'); });
    ui.exec.msg.textContent = message || '';
  }
  function statusMessage(status) {
    if (status === 'failed') return 'The change could not be completed. Nothing further will be applied.';
    if (status === 'processing') return 'Applying the approved change\u2026';
    if (status === 'queued') return 'Approved and queued for execution.';
    if (status === 'rejected') return 'Rejected. Nothing was changed.';
    return '';
  }
  function showMutUnknown(ui) {
    ui.actions.hidden = true; ui.status.hidden = true;
    setExecution(ui, 'unknown', 'We could not confirm the outcome. The change may or may not have been applied. Check status before trying again.');
    if (!ui.exec.checkBtn) {
      const b = el('button', 'btn btn-secondary', 'Check status'); b.type = 'button'; b.style.marginTop = '10px';
      b.addEventListener('click', () => checkMutStatus(ui, b));
      ui.exec.root.appendChild(b); ui.exec.checkBtn = b;
    }
  }
  async function checkMutStatus(ui, btn) {
    btn.disabled = true;
    try {
      const s = await fetchStatus(ui.id);
      const st = normalizeStatus(s.raw);
      if (st === 'proposed') {
        ui.host.hidden = true; ui.exec = null; ui.host.replaceChildren();
        ui.actions.hidden = false; ui.busy = false; ui.approve.disabled = false; ui.cancel.disabled = false;
        ui.approve.textContent = 'Approve change';
        toast('This proposal has not been approved yet.');
        return;
      }
      if (st && st !== 'unknown') { applyMutState(ui, st); return; }
      toast('The outcome is still not confirmed.');
    } catch { toast('Status could not be checked right now.'); }
    btn.disabled = false;
  }
  function applyMutState(ui, st) {
    ui.actions.hidden = true; ui.status.hidden = true; ui.note.hidden = true;
    if (st === 'unknown') { showMutUnknown(ui); return; }
    ui.lastStatus = st;
    setExecution(ui, st, statusMessage(st));
    if (st === 'rejected') { ui.stopped = true; return; }
    if (st !== 'completed' && st !== 'failed') pollExecution(ui, 0);
  }
  async function pollExecution(ui, attempt) {
    if (ui.stopped) return;
    try {
      const s = await fetchStatus(ui.id);
      const st = normalizeStatus(s.raw) || 'queued';
      ui.lastStatus = st;
      setExecution(ui, st, statusMessage(st));
      if (st === 'completed' || st === 'failed' || st === 'rejected' || st === 'unknown') return;
    } catch { setExecution(ui, ui.lastStatus || 'queued', 'Checking status\u2026'); }
    if (attempt >= CONFIG.poll.maxAttempts) { setExecution(ui, ui.lastStatus || 'queued', 'Still processing. Check back shortly.'); return; }
    setTimeout(() => pollExecution(ui, attempt + 1), CONFIG.poll.intervalMs);
  }
  async function approveMutation(ui) {
    if (ui.busy) return; // double-click guard
    ui.busy = true;
    ui.approve.disabled = true; ui.cancel.disabled = true; ui.approve.textContent = 'Approving\u2026';
    ui.status.hidden = false; ui.status.textContent = 'Sending approval\u2026';
    try {
      if (!db) throw appError('SESSION_EXPIRED');
      const { data, error } = await db.rpc('approve_client_business_action', { p_action_request_id: ui.id });
      if (error) {
        if (String(error.message || '').includes('AUTH_REQUIRED')) throw appError('SESSION_EXPIRED');
        throw appError('AMBIGUOUS');
      }
      if (!data || data.ok === false) {
        ui.actions.hidden = true; ui.status.hidden = true;
        setExecution(ui, 'failed', (data && data.message) ? String(data.message).slice(0, 200) : 'This change can no longer be applied.');
        return;
      }
      ui.actions.hidden = true; ui.status.hidden = true; ui.note.hidden = true;
      const st = normalizeStatus(data.status) || 'queued';
      ui.lastStatus = st; setExecution(ui, st, statusMessage(st));
      if (st !== 'completed' && st !== 'failed') pollExecution(ui, 0);
    } catch (e) {
      if (e && e.code === 'SESSION_EXPIRED') {
        ui.busy = false; ui.approve.disabled = false; ui.cancel.disabled = false; ui.approve.textContent = 'Approve change';
        ui.status.textContent = userMessageFor(e);
        return;
      }
      /* The approval may have been applied: ask the backend before allowing another attempt. */
      try {
        const s = await fetchStatus(ui.id);
        const st = normalizeStatus(s.raw);
        if (st === 'proposed') {
          ui.busy = false; ui.approve.disabled = false; ui.cancel.disabled = false; ui.approve.textContent = 'Approve change';
          ui.status.textContent = userMessageFor(e);
        } else if (st) applyMutState(ui, st);
        else showMutUnknown(ui);
      } catch { showMutUnknown(ui); }
    }
  }
  function renderMutationProposal(p, opts) {
    const root = tpl('proposalTemplate').firstElementChild;
    root.style.alignSelf = 'stretch';
    const q = (r) => root.querySelector('[data-role=' + r + ']');
    const id = proposalId(p);
    const ui = { kind: 'mutation', id, root, approve: q('approve'), cancel: q('cancel'), reject: q('cancel'), actions: q('actions'), status: q('status'), note: q('note'), host: q('execution'), exec: null, stopped: false, busy: false, lastStatus: null, canApprove: !!id };
    const target = p.target || {};
    q('target').textContent = String(target.label || target.type || 'Requested change').slice(0, 160);
    q('risk').textContent = p.risk ? fieldLabel(p.risk) + ' risk' : 'Review required';
    const list = q('changes');
    (Array.isArray(p.changes) ? p.changes : []).slice(0, 12).forEach((c) => {
      const row = el('div', 'change-row');
      row.appendChild(el('div', 'change-field', fieldLabel(c.field)));
      const b = el('div', 'change-box'); b.append(el('span', 'label', 'Before'), document.createTextNode(formatValue(c.field, c.before, c.currency)));
      const a = el('div', 'change-box is-after'); a.append(el('span', 'label', 'After'), document.createTextNode(formatValue(c.field, c.after, c.currency)));
      row.append(b, a); list.appendChild(row);
    });
    if (!id) { ui.actions.hidden = true; ui.note.textContent = 'This proposal cannot be approved from here.'; return root; }
    ui.approve.addEventListener('click', () => approveMutation(ui));
    ui.cancel.addEventListener('click', () => rejectProposal(ui));
    const initial = normalizeStatus(p.status);
    if (initial && initial !== 'proposed') applyMutState(ui, initial);
    else if (opts && opts.restored) restoreFromBackend(ui);
    return root;
  }

  /* ===================== COMPOSER ===================== */
  function autosize() { dom.input.style.height = 'auto'; dom.input.style.height = Math.min(dom.input.scrollHeight, 140) + 'px'; }
  function setupViewport() {
    const vv = window.visualViewport;
    const set = () => document.documentElement.style.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px');
    set();
    if (vv) { vv.addEventListener('resize', () => { set(); scrollToEnd(); }); vv.addEventListener('scroll', () => { if (window.scrollY) window.scrollTo(0, 0); }); }
    else window.addEventListener('resize', set);
  }

  /* ===================== EVENTS ===================== */
  function on(id, evt, fn) { const n = $(id); if (n) n.addEventListener(evt, fn); }
  function bindEvents() {
    on('conversationMenuBtn', 'click', () => toggleOverlay('drawer'));
    on('closeDrawerBtn', 'click', () => closeOverlay());
    on('moreMenuBtn', 'click', () => toggleOverlay('more'));
    on('attachmentBtn', 'click', () => toggleOverlay('plus'));
    ['newChatBtn', 'drawerNewChatBtn', 'moreNewChatBtn'].forEach((id) => on(id, 'click', startNewChat));
    on('settingsBtn', 'click', () => navigate('settings'));
    on('connectorBtn', 'click', () => navigate('connector'));
    on('renameConversationBtn', 'click', renameConversation);
    on('exportConversationBtn', 'click', () => { closeOverlay(true); exportConversation(); });
    on('copyConversationBtn', 'click', () => { closeOverlay(true); copyConversation(); });
    on('clearConversationBtn', 'click', clearCurrentChat);
    on('deleteConversationBtn', 'click', () => deleteConversation());
    on('cameraBtn', 'click', () => { closeOverlay(true); dom.inputs.camera.click(); });
    on('photosBtn', 'click', () => { closeOverlay(true); dom.inputs.photos.click(); });
    on('filesBtn', 'click', () => { closeOverlay(true); dom.inputs.files.click(); });
    Object.values(dom.inputs).forEach((input) => input.addEventListener('change', async () => { const files = Array.from(input.files || []); input.value = ''; await addFiles(files); }));
    dom.thinkingBtn.addEventListener('click', () => { setThinkingMode(!state.thinking); closeOverlay(); });
    dom.dlg.cancel.addEventListener('click', () => finishDialog(false));
    dom.dlg.confirm.addEventListener('click', () => finishDialog(true));
    dom.dlg.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finishDialog(true); } });
    dom.list.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-id]'); if (!btn) return;
      if (btn.dataset.action === 'delete') deleteConversation(btn.dataset.id); else openConversation(btn.dataset.id);
    });
    dom.messages.addEventListener('click', (e) => { const b = e.target.closest('[data-ui-navigate]'); if (b) navigate(b.dataset.uiNavigate); });
    dom.empty.addEventListener('click', (e) => { const b = e.target.closest('[data-prompt]'); if (!b) return; dom.input.value = b.dataset.prompt || ''; autosize(); dom.input.focus(); });
    dom.backdrop.addEventListener('click', () => closeOverlay());
    document.addEventListener('click', (e) => {
      if (!activeOverlay || activeOverlay === 'dialog') return;
      const o = OVERLAYS[activeOverlay];
      if (!o.el.contains(e.target) && !(o.trigger && o.trigger.contains(e.target))) closeOverlay();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && activeOverlay) { e.preventDefault(); closeOverlay(); } });
    dom.form.addEventListener('submit', (e) => { e.preventDefault(); handleSend(); });
    dom.input.addEventListener('input', autosize);
    dom.input.addEventListener('focus', () => setTimeout(scrollToEnd, 250));
    dom.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); handleSend(); }
    });
  }

  /* ===================== INIT ===================== */
  async function init() {
    setupViewport(); bindEvents(); autosize(); renderConversationList(); syncMenuState(); syncEmpty();
    document.dispatchEvent(new CustomEvent('glime-assistant-ready'));
    if (!db) { addNotice(userMessageFor({}), true); return; }
    const session = await getSession();
    if (!session) { navigate('login'); return; }
    db.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT') navigate('login'); });
    let saved = null;
    try { saved = sessionStorage.getItem(CONFIG.storageKey); } catch { /* ignore */ }
    try {
      const data = await conversationOp('list', {});
      const items = data.conversations || data.items || [];
      state.conversations = items.map((c) => ({ id: c.id, title: c.title || 'Conversation', at: Date.parse(c.updated_at) || Date.now() }));
      renderConversationList();
    } catch { /* the list is best-effort; chat still works */ }
    /* Restore the active conversation from backend truth (the stored id is only a pointer). */
    if (saved && UUID_RE.test(saved)) {
      await openConversation(saved);
      if (state.conversationId !== saved) setConversationId(null);
    }
    syncMenuState();
  }

  init();
})();
