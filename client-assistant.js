/* GLIME Client Assistant — central frontend runtime.
 * Backend is authoritative. This file never touches business tables, never selects client_id,
 * and routes every approval through the existing approve RPC. */
(() => {
  'use strict';

  /* ===================== CONFIG ===================== */
  const SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA'; // publishable key only
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/client-assistant';

  const CONFIG = Object.freeze({
    nav: Object.freeze({ billing: 'billing.html', settings: 'settings.html', connector: 'ai-connections.html', login: 'login.html' }),
    navLabels: Object.freeze({ billing: 'Go to Billing', settings: 'Open Settings', connector: 'Open Connectors' }),
    maxMessage: 2000,
    historyTurns: 12,
    maxAttachments: 5,
    requestTimeoutMs: 60000,
    image: Object.freeze({ maxDim: 1600, quality: 0.82, minBytes: 200 * 1024, maxInputBytes: 20 * 1024 * 1024, optimizable: ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'] }),
    doc: Object.freeze({ maxBytes: 10 * 1024 * 1024, ext: ['pdf', 'doc', 'docx', 'txt'] }),
    poll: Object.freeze({ intervalMs: 2000, maxAttempts: 60 }),
    storageKey: 'glime.clientAssistant.conversationId'
  });

  /* Conversation operations the current backend does NOT expose yet.
   * Flip a flag to true only when the backend implements it. Contract (POST FUNCTION_URL):
   *  list   {op:'list_conversations'}                      -> {conversations:[{id,title,updated_at}]}
   *  load   {op:'load_conversation',conversation_id}       -> {conversation:{id,title,turns:[{role,content,meta,created_at}]}}
   *  rename {op:'rename_conversation',conversation_id,title}-> {ok:true}
   *  remove {op:'delete_conversation',conversation_id}     -> {ok:true}   (must validate ownership + cascade) */
  const BACKEND_OPS = Object.freeze({ list: false, load: false, rename: false, remove: false });
  const OP_NAMES = Object.freeze({ list: 'list_conversations', load: 'load_conversation', rename: 'rename_conversation', remove: 'delete_conversation' });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const STATUS_ORDER = ['proposed', 'approved', 'queued', 'processing', 'completed'];
  const STATUS_LABEL = { proposed: 'Proposed', approved: 'Approved', queued: 'Queued', processing: 'Processing', completed: 'Completed', failed: 'Failed' };

  /* ===================== HELPERS ===================== */
  const $ = (id) => document.getElementById(id);
  const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
  const appError = (code, message) => Object.assign(new Error(message || code), { code });
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

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
    switch (err && err.code) {
      case 'SESSION_EXPIRED': return 'Your session has expired. Please sign in again.';
      case 'NETWORK': return 'Unable to reach GLIME right now. Please try again.';
      case 'NOT_ENABLED': return 'The Client Assistant is not enabled for this account.';
      case 'BACKEND_CONTRACT_MISSING': return 'This feature needs backend support that is not available yet.';
      default: return 'GLIME could not complete this request.';
    }
  }

  /* ===================== STATE + DOM ===================== */
  const state = {
    conversationId: null,
    conversations: [],
    messages: [],
    attachments: [],
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
    version: '2.0.0',
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
    if (!url || target === 'login' && false) return;
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
  function clearMessagesView() {
    state.messages.forEach((m) => (m.attachments || []).forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl)));
    state.messages = []; dom.messages.replaceChildren(); syncEmpty(); syncMenuState();
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
  async function postAssistant(body) {
    const session = await getSession();
    if (!session) throw appError('SESSION_EXPIRED');
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), CONFIG.requestTimeoutMs);
    let res;
    try {
      res = await fetch(FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify(body), signal: ctl.signal });
    } catch { throw appError('NETWORK'); } finally { clearTimeout(timer); }
    const data = await res.json().catch(() => null);
    return { res, data };
  }
  async function conversationOp(op, payload) {
    if (!BACKEND_OPS[op]) throw appError('BACKEND_CONTRACT_MISSING');
    const { res, data } = await postAssistant(Object.assign({ op: OP_NAMES[op] }, payload));
    if (res.status === 401) throw appError('SESSION_EXPIRED');
    if (!res.ok || !data) throw appError('BACKEND');
    return data;
  }

  /* ===================== CONVERSATIONS ===================== */
  function upsertConversation(id, title, at) {
    if (!id) return;
    const found = state.conversations.find((c) => c.id === id);
    if (found) { if (title) found.title = title; found.at = at || Date.now(); }
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
    if (!BACKEND_OPS.list) dom.list.appendChild(el('div', 'list-note', 'Earlier conversations will appear here once conversation history is enabled.'));
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
  async function openConversation(id) {
    if (id === state.conversationId) { closeOverlay(); return; }
    if (!BACKEND_OPS.load) { toast('Opening past conversations needs backend support.'); return; }
    try {
      const data = await conversationOp('load', { conversation_id: id });
      const conv = data.conversation; if (!conv) throw appError('BACKEND');
      closeOverlay(true); clearMessagesView(); setConversationId(conv.id || id);
      (conv.turns || []).forEach((t) => addMessage({ id: uuid(), role: t.role === 'user' ? 'user' : 'assistant', text: String(t.content || ''), at: t.created_at ? Date.parse(t.created_at) : Date.now(), attachments: (t.meta && t.meta.attachments) || [] }));
      renderConversationList();
    } catch (e) { toast(userMessageFor(e)); }
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
    clearMessagesView(); clearAttachments(); toast('Chat view cleared');
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

  async function prepareAttachment(file, kind) {
    const ext = extOf(file.name), type = file.type || '';
    if (type.startsWith('video/') || type.startsWith('audio/')) throw Object.assign(new Error('unsupported'), { userMessage: 'Videos and audio files are not supported.' });
    const isImage = type.startsWith('image/') && type !== 'image/svg+xml';
    if (isImage) {
      if (file.size > CONFIG.image.maxInputBytes) throw Object.assign(new Error('large'), { userMessage: 'That image is too large (max ' + formatBytes(CONFIG.image.maxInputBytes) + ').' });
      const optimized = await optimizeImage(file);
      const out = optimized || file;
      return { id: uuid(), kind: 'image', name: out.name, type: out.type, originalSize: file.size, size: out.size, optimized: !!optimized, file: out, previewUrl: URL.createObjectURL(out) };
    }
    if (kind !== 'photos' && kind !== 'camera' && CONFIG.doc.ext.includes(ext)) {
      if (file.size > CONFIG.doc.maxBytes) throw Object.assign(new Error('large'), { userMessage: file.name + ' is too large (max ' + formatBytes(CONFIG.doc.maxBytes) + ').' });
      /* Documents are kept byte-for-byte; no fake compression. */
      return { id: uuid(), kind: 'doc', name: file.name, type: type || ext, originalSize: file.size, size: file.size, optimized: false, file, previewUrl: null };
    }
    throw Object.assign(new Error('unsupported'), { userMessage: 'This file type is not supported.' });
  }
  async function addFiles(fileList, kind) {
    for (const f of Array.from(fileList || [])) {
      if (state.attachments.length >= CONFIG.maxAttachments) { toast('You can attach up to ' + CONFIG.maxAttachments + ' files.'); break; }
      try { state.attachments.push(await prepareAttachment(f, kind)); }
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
    const sentAtt = state.attachments.splice(0).map((a) => ({ id: a.id, kind: a.kind, name: a.name, type: a.type, size: a.size, originalSize: a.originalSize, optimized: a.optimized, previewUrl: a.previewUrl }));
    renderTray();
    const history = buildHistory();
    const userMsg = { id: uuid(), role: 'user', text, at: Date.now(), attachments: sentAtt };
    dom.input.value = ''; autosize();
    addMessage(userMsg);
    setSending(true);
    let row = null;
    try {
      const { res, data } = await postAssistant({
        message: text, history, conversation_id: state.conversationId || undefined, request_id: uuid(),
        mode: thinkingAtSend ? 'glime_thinking' : 'standard',
        attachments: sentAtt.map((a) => ({ name: a.name, type: a.type, size: a.size, original_size: a.originalSize }))
      });
      if (res.status === 401) throw appError('SESSION_EXPIRED');
      if (isCreditsExhausted(res.status, data)) { dom.messages.appendChild(tpl('creditsTemplate')); scrollToEnd(); return; }
      if (res.status === 403) throw appError('NOT_ENABLED');
      if (!res.ok || !data || data.error) throw appError('BACKEND');

      if (data.conversation_id && UUID_RE.test(data.conversation_id)) {
        setConversationId(data.conversation_id);
        upsertConversation(data.conversation_id, data.title || text.slice(0, 48), Date.now());
      }
      const answer = typeof data.answer === 'string' && data.answer.trim() ? data.answer.trim() : 'GLIME did not return an answer.';
      row = addMessage({ id: data.turn_id || uuid(), role: 'assistant', text: answer, at: Date.now(), attachments: [] });
      if (data.report) renderReport(data.report, row);
      if (Array.isArray(data.ui_actions) && data.ui_actions.length) renderUiActions(data.ui_actions, row);
      if (data.proposal && typeof data.proposal === 'object') row.appendChild(renderProposal(data.proposal));
      if (thinkingAtSend && data.reasoning_mode !== 'enhanced') addNotice('Enhanced reasoning is not available from the server yet, so this answer used standard mode.', false, row);
      if (sentAtt.length && !Array.isArray(data.attachments)) addNotice('Attachment contents were not processed yet; only file names were shared with the assistant.', false, row);
      scrollToEnd();
    } catch (e) {
      addNotice(userMessageFor(e), true);
      if (e.code === 'SESSION_EXPIRED') setTimeout(() => navigate('login'), 2200);
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

  /* ===================== PROPOSAL / APPROVAL / EXECUTION ===================== */
  function normalizeStatus(s) {
    const v = String(s || '').toLowerCase();
    if (['proposed', 'awaiting_approval'].includes(v)) return 'proposed';
    if (v === 'approved') return 'approved';
    if (v === 'queued') return 'queued';
    if (['executing', 'processing', 'running', 'claimed', 'started'].includes(v)) return 'processing';
    if (['completed', 'succeeded', 'success', 'done'].includes(v)) return 'completed';
    if (['failed', 'blocked', 'cancelled', 'canceled', 'quarantined', 'rejected', 'error'].includes(v)) return 'failed';
    return null;
  }
  function setExecution(ui, status, message) {
    if (!ui.exec) {
      const root = tpl('executionTemplate').firstElementChild;
      ui.exec = { root, badge: root.querySelector('[data-role=badge]'), msg: root.querySelector('[data-role=message]'), steps: Array.from(root.querySelectorAll('.steps li')) };
      ui.host.hidden = false; ui.host.appendChild(root);
    }
    const failed = status === 'failed';
    const idx = STATUS_ORDER.indexOf(status);
    ui.exec.badge.textContent = STATUS_LABEL[status] || 'Proposed';
    ui.exec.badge.classList.toggle('is-bad', failed);
    if (!failed) ui.exec.steps.forEach((li, i) => { li.classList.toggle('is-done', i < idx || status === 'completed'); li.classList.toggle('is-active', i === idx && status !== 'completed'); });
    ui.exec.msg.textContent = message || '';
  }
  function statusMessage(status) {
    if (status === 'completed') return 'The change was applied successfully.';
    if (status === 'failed') return 'The change could not be completed. Nothing further will be applied.';
    if (status === 'processing') return 'Applying the approved change\u2026';
    if (status === 'queued') return 'Approved and queued for execution.';
    return '';
  }
  async function pollExecution(ui, requestId, attempt) {
    if (ui.stopped) return;
    try {
      const { data, error } = await db.rpc('get_client_action_execution_status', { p_action_request_id: requestId });
      if (error || !data || data.ok === false) throw new Error('status');
      const st = normalizeStatus((data.execution_job && data.execution_job.status) || (data.action_request && data.action_request.status)) || 'queued';
      setExecution(ui, st, statusMessage(st));
      if (st === 'completed' || st === 'failed') return;
    } catch { setExecution(ui, ui.lastStatus || 'queued', 'Checking status\u2026'); }
    if (attempt >= CONFIG.poll.maxAttempts) { setExecution(ui, ui.lastStatus || 'queued', 'Still processing. Check back shortly.'); return; }
    setTimeout(() => pollExecution(ui, requestId, attempt + 1), CONFIG.poll.intervalMs);
  }
  async function approveProposal(ui, requestId) {
    ui.approve.disabled = true; ui.cancel.disabled = true;
    ui.status.hidden = false; ui.status.textContent = 'Sending approval\u2026';
    try {
      if (!db) throw appError('SESSION_EXPIRED');
      const { data, error } = await db.rpc('approve_client_business_action', { p_action_request_id: requestId });
      if (error) throw (String(error.message || '').includes('AUTH_REQUIRED') ? appError('SESSION_EXPIRED') : appError('BACKEND'));
      if (!data || data.ok === false) {
        ui.actions.hidden = true; ui.status.hidden = true;
        setExecution(ui, 'failed', (data && data.message) ? String(data.message).slice(0, 200) : 'This change can no longer be applied.');
        return;
      }
      ui.actions.hidden = true; ui.status.hidden = true; ui.note.hidden = true;
      const st = normalizeStatus(data.status) || 'queued';
      ui.lastStatus = st; setExecution(ui, st, statusMessage(st));
      pollExecution(ui, requestId, 0);
    } catch (e) {
      ui.approve.disabled = false; ui.cancel.disabled = false;
      ui.status.textContent = userMessageFor(e);
    }
  }
  function renderProposal(p) {
    const root = tpl('proposalTemplate').firstElementChild;
    root.style.alignSelf = 'stretch';
    const q = (r) => root.querySelector('[data-role=' + r + ']');
    const ui = { root, approve: q('approve'), cancel: q('cancel'), actions: q('actions'), status: q('status'), note: q('note'), host: q('execution'), exec: null, stopped: false, lastStatus: null };
    const id = String(p.action_request_id || p.id || '');
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
    if (!UUID_RE.test(id)) { ui.actions.hidden = true; q('note').textContent = 'This proposal cannot be approved from here.'; return root; }
    ui.approve.addEventListener('click', () => approveProposal(ui, id));
    ui.cancel.addEventListener('click', () => { ui.stopped = true; ui.actions.hidden = true; ui.note.textContent = 'Dismissed. Nothing was changed.'; });
    const initial = normalizeStatus(p.status);
    if (initial && initial !== 'proposed') {
      ui.actions.hidden = true; ui.note.hidden = true; ui.lastStatus = initial;
      setExecution(ui, initial, statusMessage(initial)); pollExecution(ui, id, 0);
    }
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
    Object.entries(dom.inputs).forEach(([kind, input]) => input.addEventListener('change', async () => { const files = Array.from(input.files || []); input.value = ''; await addFiles(files, kind); }));
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
    if (saved && UUID_RE.test(saved)) state.conversationId = saved;
    try {
      if (BACKEND_OPS.list) {
        const data = await conversationOp('list', {});
        state.conversations = (data.conversations || []).map((c) => ({ id: c.id, title: c.title || 'Conversation', at: Date.parse(c.updated_at) || Date.now() }));
        renderConversationList();
      }
      if (BACKEND_OPS.load && state.conversationId) { const id = state.conversationId; state.conversationId = null; await openConversation(id); }
    } catch { /* recovery is best-effort */ }
    syncMenuState();
  }
  init();
})();
