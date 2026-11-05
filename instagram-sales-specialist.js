(() => {
'use strict';
const U = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const K = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const MOD = 'instagram_ai_sales_agent';
const db = window.supabase.createClient(U, K);
const $ = id => document.getElementById(id);
const MODES = { manual: ['Manual', 'You write and send every reply'], approval: ['Approval', 'AI drafts replies and you approve them'], automatic: ['Automatic', 'AI replies on its own'] };
const S = { meta: {}, cloudMeta: false, tpl: [], cloudTpl: false, tg: '', cid: null, convs: [], prev: {}, unread: {}, leads: {}, byIg: {}, ctl: {}, ai: { mode: 'manual', on: true }, stop: false, sel: null, msgs: [], f: 'all', q: '' };

/* ---------- helpers ---------- */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const ago = v => { if (!v) return ''; const s = (Date.now() - new Date(v)) / 1e3;
  return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : s < 604800 ? Math.floor(s / 86400) + 'd' : new Date(v).toLocaleDateString([], { day: '2-digit', month: 'short' }); };
const clock = v => new Date(v).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const link = t => esc(t).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
const media = t => { const k = String(t || '').toLowerCase();
  return /image|photo/.test(k) ? '📷 Photo' : /video/.test(k) ? '🎥 Video' : /audio|voice/.test(k) ? '🎤 Voice message' : /story/.test(k) ? '📖 Story reply' : /share|post/.test(k) ? '🔗 Shared post' : /like|heart/.test(k) ? '❤️' : k ? `[${k}]` : '[message]'; };
const seen = () => { try { return JSON.parse(localStorage.getItem('gig_seen') || '{}'); } catch { return {}; } };
const markSeen = id => { const s = seen(); s[id] = Date.now(); localStorage.setItem('gig_seen', JSON.stringify(s)); };
const set = (id, v) => { const e = $(id); if (e) e.textContent = (v === null || v === undefined || v === '') ? '—' : v; };
const digits = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };
function toast(m, err) { document.querySelector('.toast')?.remove(); const e = document.createElement('div');
  e.className = 'toast' + (err ? ' err' : ''); e.textContent = m; document.body.appendChild(e); setTimeout(() => e.remove(), 3800); }
async function fn(name, body = {}) {
  const { data, error } = await db.functions.invoke(name, { body });
  if (error) { let d = ''; try { const r = error.context; if (r && r.json) { const j = await r.json(); d = j?.message || j?.error || ''; } } catch {}
    throw new Error(d || error.message || 'Request failed'); }
  if (data?.error) throw new Error(data.message || data.error);
  return data || {};
}
const leadOf = c => S.leads[c.lead_id] || S.byIg[c.instagram_user_id] || null;
const modeOf = c => { if (S.stop || !S.ai.on) return 'manual'; const x = c && S.ctl[c.id]; if (x && (x.human_takeover_enabled || x.ai_enabled === false)) return 'manual'; return x?.ai_mode || S.ai.mode; };
const hint = () => { $('modeHint').textContent = 'AI: ' + MODES[modeOf(S.sel)][0] + ' ▾'; };

/* ---------- in-app dialog (replaces browser prompt / confirm) ---------- */
let dlgOpen = false;
function ask(o) {
  return new Promise(res => {
    $('dlgTitle').textContent = o.title || ''; $('dlgText').textContent = o.text || '';
    const i = $('dlgIn'); i.classList.toggle('hide', !o.input); i.value = o.value || ''; i.placeholder = o.placeholder || '';
    $('dlgOk').textContent = o.ok || 'OK'; $('dlgOk').className = 'btn' + (o.danger ? ' dng' : '');
    $('dlg').classList.add('on'); dlgOpen = true; if (o.input) setTimeout(() => i.focus(), 60);
    const done = v => { $('dlg').classList.remove('on'); dlgOpen = false; res(v); };
    $('dlgOk').onclick = () => done(o.input ? (i.value.trim() || null) : true);
    $('dlgNo').onclick = () => done(o.input ? null : false);
  });
}

/* ---------- navigation: phone back button closes sheets, then the chat ---------- */
const sheets = ['det', 'tpl', 'mode', 'ins', 'tgs', 'cmode']; let sheetOn = false;
function openSheet(id) { if (!sheetOn) { history.pushState({ g: 's' }, ''); sheetOn = true; }
  sheets.forEach(s => $(s).classList.toggle('on', s === id)); $('ov').classList.add('on'); $('pop').classList.remove('on'); }
function hideSheets() { sheets.forEach(s => $(s).classList.remove('on')); $('ov').classList.remove('on'); $('pop').classList.remove('on'); sheetOn = false; }
function hideChat() { S.sel = null; $('chat').classList.remove('open'); document.body.classList.remove('lock'); render(); }
const closeSheet = () => { if (sheetOn) history.back(); };
const closeChat = () => { if (S.sel) history.back(); };
window.addEventListener('popstate', () => { if (dlgOpen) { history.pushState({ g: 'd' }, ''); return; } if (sheetOn) hideSheets(); else if (S.sel) hideChat(); });
function pop(items) { const p = $('pop'); p.innerHTML = '';
  const ev = window.event, bt = ev && ev.target && ev.target.closest && ev.target.closest('button');
  if (bt) { const r = bt.getBoundingClientRect(); p.style.top = (r.bottom + 6) + 'px'; p.style.right = Math.max(10, innerWidth - r.right) + 'px'; } items.forEach(([label, f, d]) => { const b = document.createElement('button');
  b.textContent = label; if (d) b.className = 'd'; b.onclick = () => { p.classList.remove('on'); f(); }; p.appendChild(b); }); p.classList.add('on'); }

/* ---------- data ---------- */
async function loadConn() {
  try {
    const d = await fn('instagram-connection-status'); const ok = d?.connected === true;
    $('conn').className = 'conn ' + (ok ? 'on' : 'off');
    $('conn').textContent = ok ? '● Connected' + (d.username ? ' · @' + d.username : '') : d?.expired ? '● Token expired' : '● Not connected';
    $('connect').classList.toggle('hide', ok);
  } catch { $('conn').className = 'conn off'; $('conn').textContent = '● Check failed'; $('connect').classList.remove('hide'); }
}

/* The real AI settings: channel mode, per-chat overrides and the emergency stop. */
async function loadSettings() {
  try { const r = await db.from('client_channel_settings').select('ai_mode,ai_enabled,enabled,automation_enabled').eq('client_id', S.cid).eq('channel', 'instagram').maybeSingle();
    if (r.data) S.ai = { mode: r.data.ai_mode || 'manual', on: r.data.enabled !== false && r.data.ai_enabled !== false && r.data.automation_enabled !== false }; } catch {}
  try { const r = await db.from('client_conversation_controls').select('conversation_id,ai_mode,ai_enabled,human_takeover_enabled').eq('client_id', S.cid).eq('channel', 'instagram');
    S.ctl = {}; (r.data || []).forEach(x => { S.ctl[x.conversation_id] = x; }); } catch {}
  try { const r = await db.from('client_control_settings').select('emergency_stop_enabled').eq('client_id', S.cid).maybeSingle(); S.stop = !!r.data?.emergency_stop_enabled; } catch {}
  $('emg').classList.toggle('hide', !S.stop);
  $('modeLbl').textContent = S.stop ? 'Paused' : !S.ai.on ? 'Off' : MODES[S.ai.mode]?.[0] || 'Manual';
}

async function loadAll() {
  await loadSettings();
  const { data: cs, error } = await db.from('instagram_conversations').select('*').eq('client_id', S.cid)
    .order('last_message_at', { ascending: false, nullsFirst: false }).limit(200);
  if (error) throw error;
  S.convs = cs || []; S.prev = {}; S.unread = {}; S.leads = {}; S.byIg = {};
  const ids = S.convs.map(c => c.id), sn = seen();
  if (ids.length) {
    const { data: ms } = await db.from('instagram_messages').select('conversation_id,direction,text_body,message_type,created_at')
      .eq('client_id', S.cid).in('conversation_id', ids).order('created_at', { ascending: false }).limit(800);
    for (const m of ms || []) {
      if (!S.prev[m.conversation_id]) S.prev[m.conversation_id] = m;
      if (m.direction === 'inbound' && sn[m.conversation_id] && new Date(m.created_at) > sn[m.conversation_id]) S.unread[m.conversation_id] = (S.unread[m.conversation_id] || 0) + 1;
    }
    for (const c of S.convs) if (!sn[c.id] && S.prev[c.id]?.direction === 'inbound') S.unread[c.id] = 1;
  }
  const { data: ls } = await db.from('leads').select('id,name,status,priority,mobile,whatsapp,city_area,interest,budget,budget_currency,product_service,notes,instagram_user_id,next_follow_up_at')
    .eq('client_id', S.cid).not('instagram_user_id', 'is', null).order('updated_at', { ascending: false }).limit(1000);
  for (const l of ls || []) { S.leads[l.id] = l; if (!S.byIg[l.instagram_user_id]) S.byIg[l.instagram_user_id] = l; }
  render(); loadOrders(); if (S.sel) { hint(); fillDetails(); }
}
async function loadOrders() {
  try { const r = await db.from('orders').select('id', { count: 'exact', head: true }).eq('client_id', S.cid).ilike('source_channel', '%instagram%');
    $('sOrders').textContent = r.error ? '—' : r.count ?? 0; } catch { $('sOrders').textContent = '—'; }
}

/* ---------- inbox ---------- */
function flags(c) {
  const l = leadOf(c), p = S.prev[c.id], open = c.status !== 'closed', st = String(l?.status || '').toLowerCase();
  return { hot: /high|urgent/.test(l?.priority || ''), qual: st === 'qualified', isNew: !l || st === 'new', ai: open && modeOf(c) !== 'manual',
    need: open && p?.direction === 'inbound', un: S.unread[c.id] || 0, open };
}
const pass = (c, f) => { const x = flags(c); return f === 'all' || (f === 'unread' && x.un > 0) || (f === 'ai' && x.ai) || (f === 'hot' && x.hot) || (f === 'attn' && x.need) || (f === 'closed' && !x.open) || (f === 'pin' && !!S.meta[c.id]?.pinned); };

function render() {
  const cs = S.convs, ai = cs.filter(c => flags(c).ai).length;
  $('sDm').textContent = cs.length; $('sLeads').textContent = cs.filter(c => leadOf(c)).length;
  $('sAi').textContent = cs.length ? Math.round(ai * 100 / cs.length) + '%' : '0%';
  const names = { pin: 'Pinned', all: 'All', unread: 'Unread', ai: 'AI Handling', hot: 'Hot Leads', attn: 'Needs Attention', closed: 'Closed' };
  document.querySelectorAll('#chips button').forEach(b => { b.textContent = `${names[b.dataset.f]} (${cs.filter(c => pass(c, b.dataset.f)).length})`; b.classList.toggle('on', b.dataset.f === S.f); });
  const q = S.q.toLowerCase(), rows = cs.filter(c => pass(c, S.f) && (!S.tg || (S.meta[c.id]?.tags || []).includes(S.tg)) && (!q || `${c.username || ''} ${c.instagram_user_id || ''}`.toLowerCase().includes(q)));
  rows.sort((a, b) => (S.meta[b.id]?.pinned ? 1 : 0) - (S.meta[a.id]?.pinned ? 1 : 0)); tagBar();
  $('list').innerHTML = rows.map(c => {
    const x = flags(c), p = S.prev[c.id], name = c.username || c.instagram_user_id || 'Instagram customer';
    const pv = p ? (p.direction === 'inbound' ? '' : 'You: ') + (p.text_body || media(p.message_type)) : '@' + (c.username || 'instagram');
    const wait = x.need && p && Date.now() - new Date(p.created_at) > 3600000 ? `<span class="b wait">Waiting ${ago(p.created_at)}</span>` : '';
    const mt = S.meta[c.id] || {}, b = [...(mt.tags || []).map(t => `<span class="b tg t${tagCol(t)}">${esc(t)}</span>`), ...(leadOf(c)?.whatsapp ? ['<span class="b wa">🔗 WhatsApp linked</span>'] : []), x.hot ? '<span class="b hot">🔥 Hot Lead</span>' : '', x.qual && !x.hot ? '<span class="b ok">✓ Qualified</span>' : '',
      x.isNew && !x.hot && !x.qual ? '<span class="b new">New Lead</span>' : '', x.ai ? '<span class="b ai">🤖 AI Handling</span>' : '', wait,
      !x.open ? '<span class="b cl">Closed</span>' : '', x.un ? `<span class="cnt">${x.un}</span>` : ''].join('');
    return `<div class="row-i${x.un ? ' un' : ''}" data-id="${esc(c.id)}"><div class="av">${esc(name[0].toUpperCase())}</div><div class="rc"><div class="rn"><b>${mt.pinned ? '📌 ' : ''}${esc(name)}</b><small>${esc(ago(c.last_message_at || c.updated_at))}</small></div><div class="rp">${esc(pv)}</div><div class="bd">${b}</div></div></div>`;
  }).join('') || '<div class="emp">No conversations here yet.</div>';
}

/* ---------- chat ---------- */
async function openChat(c) {
  history.pushState({ g: 'c' }, '');
  S.sel = c; markSeen(c.id); S.unread[c.id] = 0;
  $('chat').classList.add('open'); document.body.classList.add('lock');
  $('cName').textContent = c.username || 'Instagram customer'; $('cAv').textContent = (c.username || 'I')[0].toUpperCase();
  $('cHandle').textContent = `@${c.username || 'instagram'} · ${c.status === 'closed' ? 'Closed' : 'Open'}`;
  $('sug').classList.add('hide'); $('dWa').innerHTML = ''; $('msgs').innerHTML = '<div class="emp">Loading…</div>'; hint();
  await loadMsgs(); fillDetails(); loadApproval();
  if (window.GIG && GIG.autoFill) GIG.autoFill();
}
async function loadMsgs() {
  if (!S.sel) return;
  const { data, error } = await db.from('instagram_messages').select('*').eq('client_id', S.cid).eq('conversation_id', S.sel.id).order('created_at', { ascending: true }).limit(300);
  if (error) { toast(error.message, true); return; }
  S.msgs = data || []; drawMsgs();
}
function drawMsgs() {
  const l = S.msgs; if (!l.length) { $('msgs').innerHTML = '<div class="emp">No messages yet.</div>'; return; }
  let h = '', lastOut = -1; l.forEach((m, i) => { if (m.direction !== 'inbound') lastOut = i; });
  l.forEach((m, i) => {
    const t = new Date(m.created_at || m.provider_timestamp).getTime(), pt = i ? new Date(l[i - 1].created_at).getTime() : 0;
    if (!i || t - pt > 3600000) h += `<div class="sep">${esc(clock(t))}</div>`;
    const inn = m.direction === 'inbound', txt = String(m.text_body || '').trim();
    h += `<div class="m ${inn ? 'in' : 'out'}">${txt ? link(txt) : esc(media(m.message_type))}</div>`;
    if (i === lastOut && !inn) { const s = String(m.status || '').toLowerCase(), f = s === 'failed' || s === 'error';
      h += `<div class="stt${f ? ' f' : ''}">${f ? 'Failed to send' : /read|seen/.test(s) ? 'Seen' : s === 'delivered' ? 'Delivered' : 'Sent'}</div>`; }
  });
  $('msgs').innerHTML = h; $('msgs').scrollTop = $('msgs').scrollHeight; winBar();
}
function winBar() {
  const el = $('win'); if (!el) return; const inb = S.msgs.filter(m => m.direction === 'inbound');
  if (!inb.length) { el.className = 'win hide'; return; }
  const left = new Date(inb[inb.length - 1].created_at).getTime() + 864e5 - Date.now();
  if (left <= 0) { el.className = 'win off'; el.textContent = '24-hour reply window is closed. Instagram may not deliver new replies until the customer messages again.'; return; }
  const h = Math.floor(left / 36e5), m = Math.floor(left % 36e5 / 6e4);
  el.className = 'win' + (left < 108e5 ? ' warn' : ''); el.textContent = 'You can reply for ' + (h ? h + 'h ' : '') + m + 'm more (Instagram 24-hour rule).';
}
function qrShow() {
  const q = $('qr'), v = $('input').value; if (!q) return;
  if (v[0] !== '/') { q.classList.remove('on'); return; }
  const f = v.slice(1).toLowerCase(), t = tpls().filter(x => x.toLowerCase().includes(f)).slice(0, 6);
  q.innerHTML = t.map(x => `<button type="button" data-q="${esc(x)}">${esc(x)}</button>`).join(''); q.classList.toggle('on', t.length > 0);
}
$('qr').onclick = e => { const b = e.target.closest('button'); if (!b) return; const nm = (S.sel && (leadOf(S.sel)?.name || S.sel.username)) || 'there';
  $('input').value = b.dataset.q.replace(/\{name\}/gi, nm); size(); $('input').focus(); };

/* ---------- customer details + lead tools ---------- */
function fillDetails() {
  const c = S.sel; if (!c) return; const l = leadOf(c), o = l || {};
  set('dTitle', c.username || 'Customer'); set('dName', o.name || c.username); set('dMobile', o.mobile || o.whatsapp); set('dCity', o.city_area);
  set('dInterest', o.interest); set('dProduct', o.product_service); set('dBudget', o.budget != null ? `${o.budget} ${o.budget_currency || 'INR'}` : '');
  $('dLeadTools').classList.toggle('hide', !l); $('dAdd').classList.toggle('hide', !!l);
  if (l) { $('dStage').value = l.status || 'new'; $('dHot').checked = /high|urgent/.test(l.priority || ''); $('dFuTxt').textContent = l.next_follow_up_at ? '· ' + clock(l.next_follow_up_at) : ''; }
  $('dNotes').textContent = String(o.notes || '').slice(-1500); $('dNotesWrap').classList.toggle('hide', !o.notes);
  $('dLead').href = l ? 'leads.html?lead=' + encodeURIComponent(l.id) : 'leads.html';
  const num = digits(o.whatsapp || o.mobile);
  $('dCall').classList.toggle('hide', !num); $('dCall').href = 'tel:+' + num; $('dWaLink').classList.toggle('hide', !num); $('dWaLink').href = 'https://wa.me/' + num;
  const paused = !!S.ctl[c.id]?.human_takeover_enabled;
  document.querySelectorAll('#dAi button').forEach(b => b.classList.toggle('on', (b.dataset.ai === '1') === paused));
  linkStatus();
}
async function upLead(patch, msg) {
  const l = S.sel && leadOf(S.sel); if (!l) return false;
  const r = await db.from('leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', l.id).eq('client_id', S.cid).select('*').single();
  if (r.error) { toast(r.error.message, true); fillDetails(); return false; }
  Object.assign(l, r.data); fillDetails(); render(); toast(msg || 'Saved'); return true;
}
async function setTakeover(on) {
  const c = S.sel; if (!c) return;
  const r = await db.from('client_conversation_controls').upsert({ client_id: S.cid, channel: 'instagram', conversation_id: c.id, human_takeover_enabled: on, ai_mode: on ? 'manual' : null, updated_at: new Date().toISOString() },
    { onConflict: 'client_id,channel,conversation_id' }).select('*').single();
  if (r.error) { toast(r.error.message, true); return; }
  S.ctl[c.id] = r.data; fillDetails(); hint(); render(); toast(on ? 'AI is paused for this chat.' : 'This chat follows the default AI mode.');
}
async function addLead() {
  const c = S.sel; if (!c) return;
  const { data, error } = await db.from('leads').insert({ client_id: S.cid, name: c.username || `Instagram ${c.instagram_user_id}`, source: 'instagram', source_ref: c.instagram_user_id,
    instagram_user_id: c.instagram_user_id, instagram_thread_id: c.instagram_thread_id, status: 'new', priority: 'normal' }).select('*').single();
  if (error) { toast(error.message, true); return; }
  S.leads[data.id] = data; S.byIg[c.instagram_user_id] = data; toast('Added to Leads.'); fillDetails(); render();
}

/* ---------- send / approval ---------- */
async function send() {
  const c = S.sel, msg = $('input').value.trim(); if (!c || !msg) return;
  if (msg.length > 2000) { toast('Message is too long (2000 characters maximum).', true); return; }
  const mode = modeOf(c); $('send').disabled = true;
  try {
    const r = await fn('instagram-action-request', { conversation_id: c.id, message: msg, mode: mode === 'automatic' ? 'auto' : mode });
    if (!r.ok) throw new Error(r.message || r.error || 'Instagram action failed.');
    $('input').value = ''; $('sug').classList.add('hide'); size();
    if (mode === 'approval') toast('Reply is waiting for approval.');
    else { if (r.job_id) { const e = await fn('business-action-executor', { job_id: r.job_id }); if (e?.ok === false) throw new Error(e.message || e.error || 'Message failed.'); } toast('Sent'); }
    await loadMsgs(); await loadAll(); loadApproval();
  } catch (e) { toast(e.message || 'Message failed.', true); } finally { size(); }
}
async function findApproval(id) {
  const { data } = await db.from('client_action_requests').select('id,action_payload').eq('client_id', S.cid).eq('target_module_slug', MOD)
    .eq('target_action', 'message').eq('target_id', id).eq('status', 'proposed').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}
async function loadApproval() {
  $('appr').classList.add('hide'); if (!S.sel) return;
  const l = leadOf(S.sel); let a = l ? await findApproval(l.id) : null; if (!a) a = await findApproval(S.sel.id); if (!a) return;
  $('apprText').textContent = a.action_payload?.message || 'Reply pending approval.'; $('appr').classList.remove('hide');
  $('apprOk').onclick = async () => { try { $('apprOk').disabled = true;
    const { data, error } = await db.rpc('approve_client_business_action', { p_action_request_id: a.id }); if (error) throw error;
    if (data?.job_id) { const r = await fn('business-action-executor', { job_id: data.job_id }); if (r?.ok === false) throw new Error(r.message || r.error || 'Failed'); }
    toast('Approved and sent.'); await loadMsgs(); await loadAll(); loadApproval();
  } catch (e) { toast(e.message, true); } finally { $('apprOk').disabled = false; } };
  $('apprNo').onclick = async () => { const { error } = await db.rpc('reject_client_business_action', { p_action_request_id: a.id });
    if (error) toast(error.message, true); else { toast('Reply rejected.'); loadApproval(); } };
}
function size() { qrShow(); const i = $('input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 120) + 'px'; $('send').disabled = !i.value.trim(); }

/* ---------- close / delete ---------- */
const needRpc = (e, name) => /function|schema cache|not exist|404/i.test(e.message || '') ? `The backend function ${name} has not been created yet.` : e.message;
async function setStatus(status) {
  const c = S.sel; if (!c) return;
  const { error } = await db.rpc('set_instagram_conversation_status', { p_conversation_id: c.id, p_status: status });
  if (error) { const r = await db.from('instagram_conversations').update({ status, updated_at: new Date().toISOString() }).eq('id', c.id).eq('client_id', S.cid).select('id');
    if (r.error || !r.data?.length) { toast(needRpc(error, 'set_instagram_conversation_status'), true); return; } }
  c.status = status; $('cHandle').textContent = `@${c.username || 'instagram'} · ${status === 'closed' ? 'Closed' : 'Open'}`;
  toast(status === 'closed' ? 'Chat closed.' : 'Chat reopened.'); await loadAll();
}
async function del() {
  const c = S.sel; if (!c) return;
  if (!(await ask({ title: 'Delete this chat?', text: 'The chat and all of its messages will be permanently removed.', ok: 'Delete', danger: true }))) return;
  const { error } = await db.rpc('delete_instagram_conversation', { p_conversation_id: c.id });
  if (error) { toast(needRpc(error, 'delete_instagram_conversation'), true); return; }
  closeChat(); toast('Chat deleted.'); await loadAll();
}

/* ---------- auto reply mode (same setting as Settings) ---------- */
function modeSheet() {
  $('modeList').innerHTML = Object.entries(MODES).map(([k, v]) => `<button data-m="${k}" class="${S.ai.mode === k ? 'on' : ''}">${v[0]}<span>${v[1]}</span></button>`).join(''); openSheet('mode');
}
async function saveMode(m) {
  const now = new Date().toISOString();
  let r = await db.from('client_channel_settings').update({ ai_mode: m, updated_at: now }).eq('client_id', S.cid).eq('channel', 'instagram').select('id');
  if (r.error || !r.data?.length) r = await db.from('client_channel_settings').insert({ client_id: S.cid, channel: 'instagram', ai_mode: m }).select('id');
  if (r.error) { toast(r.error.message, true); return; }
  await loadSettings(); render(); hint(); modeSheet(); toast('Instagram auto reply: ' + MODES[m][0]);
}

/* ---------- insights ---------- */
async function insights() {
  openSheet('ins'); const b = $('insBody'); b.innerHTML = '<div class="emp">Loading…</div>';
  const { data } = await db.from('instagram_messages').select('direction,created_at').eq('client_id', S.cid).gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()).limit(3000);
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6 + i); return d; });
  const inn = days.map(() => 0); let tin = 0, out = 0;
  (data || []).forEach(m => { const t = new Date(m.created_at); const i = days.findIndex((d, k) => t >= d && (k === 6 || t < days[k + 1])); if (m.direction === 'inbound') { tin++; if (i >= 0) inn[i]++; } else out++; });
  const mx = Math.max(1, ...inn), L = S.convs.map(leadOf).filter(Boolean), n = s => L.filter(l => l.status === s).length;
  const card = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
  b.innerHTML = `<div class="grid">${card('Chats', S.convs.length)}${card('Waiting for reply', S.convs.filter(c => flags(c).need).length)}${card('Messages received (7 days)', tin)}${card('Replies sent (7 days)', out)}</div>
  <p class="lbl">Messages received per day</p><div class="bars">${days.map((d, i) => `<div>${inn[i]}<i style="height:${Math.round(inn[i] / mx * 100)}%"></i>${d.toLocaleDateString([], { weekday: 'short' })[0]}</div>`).join('')}</div>
  <p class="lbl">Lead stages (Instagram leads)</p><div class="grid">${card('New', n('new'))}${card('Contacted', n('contacted'))}${card('Qualified', n('qualified'))}${card('Won', n('won'))}${card('Lost', n('lost'))}${card('Hot leads', L.filter(l => /high|urgent/.test(l.priority || '')).length)}</div>`;
}

/* ---------- templates (saved on this device) ---------- */
const DEF = ['Hi {name}! Thanks for messaging us 😊 How can I help you?', 'Could you please share your name and mobile number so we can help you better?', 'Sure {name}, let me check and get back to you in a minute 🙏'];
const localTpl = () => { try { const t = JSON.parse(localStorage.getItem('gig_tpl') || 'null'); return Array.isArray(t) ? t : DEF.slice(); } catch { return DEF.slice(); } };
const tpls = () => (S.tpl || []).map(x => x.body);
const saveLocalTpl = () => { try { localStorage.setItem('gig_tpl', JSON.stringify(tpls())); } catch {} };
async function loadTpls() {
  const loc = localTpl(); S.tpl = loc.map(b => ({ id: null, body: b })); S.cloudTpl = false;
  try {
    const r = await db.from('instagram_templates').select('id,body').eq('client_id', S.cid).order('created_at', { ascending: true });
    if (r.error) return; S.cloudTpl = true;
    if (r.data.length) { S.tpl = r.data; saveLocalTpl(); return; }
    const flag = 'gig_tpl_seeded_' + S.cid; if (localStorage.getItem(flag)) { S.tpl = []; return; }
    const ins = await db.from('instagram_templates').insert(loc.map(b => ({ client_id: S.cid, body: b }))).select('id,body');
    if (!ins.error) { S.tpl = ins.data; localStorage.setItem(flag, '1'); }
  } catch {}
}
async function addTpl(v) {
  if (S.cloudTpl) { const r = await db.from('instagram_templates').insert({ client_id: S.cid, body: v.slice(0, 1000) }).select('id,body').single();
    if (r.error) { toast(r.error.message, true); return; } S.tpl.push(r.data); }
  else S.tpl.push({ id: null, body: v });
  saveLocalTpl(); showTpls();
}
async function delTpl(i) {
  const t = S.tpl[i]; if (!t) return;
  if (S.cloudTpl && t.id) { const r = await db.from('instagram_templates').delete().eq('id', t.id).eq('client_id', S.cid); if (r.error) { toast(r.error.message, true); return; } }
  S.tpl.splice(i, 1); saveLocalTpl(); showTpls();
}
function showTpls() {
  $('tplList').innerHTML = (S.tpl || []).map((x, i) => `<div class="tp"><span data-use="${i}">${esc(x.body)}</span><button class="x" data-del="${i}" aria-label="Delete template">✕</button></div>`).join('') || '<div class="emp">No templates yet.</div>'; openSheet('tpl'); }

/* ---------- pin + tags (cloud when the table exists, else this phone) ---------- */
const DEFTAGS = ['Price asked', 'Delivery', 'Complaint', 'Order', 'Follow-up', 'VIP'];
const tagCol = t => { let h = 0; for (const ch of String(t)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 5; };
const metaLocal = () => { try { return JSON.parse(localStorage.getItem('gig_meta') || '{}'); } catch { return {}; } };
async function loadMeta() {
  const loc = metaLocal(); S.meta = loc; S.cloudMeta = false;
  try {
    const r = await db.from('instagram_chat_meta').select('conversation_id,pinned,tags').eq('client_id', S.cid);
    if (r.error) return; S.cloudMeta = true;
    const m = {}; (r.data || []).forEach(x => { m[x.conversation_id] = { pinned: !!x.pinned, tags: x.tags || [] }; });
    const up = Object.keys(loc).filter(id => !m[id] && (loc[id].pinned || (loc[id].tags || []).length));
    if (up.length) { await db.from('instagram_chat_meta').upsert(up.map(id => ({ client_id: S.cid, conversation_id: id, pinned: !!loc[id].pinned, tags: loc[id].tags || [] })), { onConflict: 'client_id,conversation_id' }); up.forEach(id => { m[id] = loc[id]; }); }
    S.meta = m;
  } catch {}
}
async function saveMeta(id) {
  const m = S.meta[id] || { pinned: false, tags: [] };
  try { const l = metaLocal(); l[id] = m; localStorage.setItem('gig_meta', JSON.stringify(l)); } catch {}
  if (!S.cloudMeta) return;
  const r = await db.from('instagram_chat_meta').upsert({ client_id: S.cid, conversation_id: id, pinned: !!m.pinned, tags: m.tags || [], updated_at: new Date().toISOString() }, { onConflict: 'client_id,conversation_id' });
  if (r.error) toast('Saved on this phone only: ' + r.error.message, true);
}
function metaOf(id) { return S.meta[id] || (S.meta[id] = { pinned: false, tags: [] }); }
function togglePin() { const c = S.sel; if (!c) return; const m = metaOf(c.id); m.pinned = !m.pinned; saveMeta(c.id); render(); toast(m.pinned ? 'Chat pinned to the top.' : 'Chat unpinned.'); }
const allTags = () => { const s = new Set(DEFTAGS); Object.values(S.meta).forEach(m => (m.tags || []).forEach(t => s.add(t))); return [...s]; };
function drawTags() { const c = S.sel; if (!c) return; const have = metaOf(c.id).tags;
  $('tgList').innerHTML = allTags().map(t => `<button type="button" data-t="${esc(t)}" class="${have.includes(t) ? 'on' : ''}">${esc(t)}</button>`).join(''); }
function tagSheet() { if (!S.sel) return; drawTags(); openSheet('tgs'); }
function toggleTag(t) { const c = S.sel; if (!c) return; const m = metaOf(c.id), i = m.tags.indexOf(t); if (i >= 0) m.tags.splice(i, 1); else m.tags.push(t); saveMeta(c.id); drawTags(); render(); }
function tagBar() {
  const used = [...new Set(Object.values(S.meta).flatMap(m => m.tags || []))], el = $('tagChips');
  if (S.tg && !used.includes(S.tg)) S.tg = '';
  el.classList.toggle('hide', !used.length);
  el.innerHTML = used.map(t => `<button type="button" data-t="${esc(t)}" class="${S.tg === t ? 'on' : ''}">${esc(t)}</button>`).join('');
}
$('tagChips').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.tg = S.tg === b.dataset.t ? '' : b.dataset.t; render(); };
$('tgList').onclick = e => { const b = e.target.closest('button'); if (b) toggleTag(b.dataset.t); };
$('tgAdd').onclick = async () => { const v = await ask({ title: 'New tag', text: 'Short name, for example "Wholesale".', input: true, ok: 'Add', placeholder: 'Tag name' }); if (v) toggleTagNew(v.slice(0, 24)); };
function toggleTagNew(t) { const c = S.sel; if (!c) return; const m = metaOf(c.id); if (!m.tags.includes(t)) m.tags.push(t); saveMeta(c.id); drawTags(); render(); }

/* ---------- AI mode for the open chat ---------- */
function chatModeSheet() {
  const c = S.sel; if (!c) return; const x = S.ctl[c.id];
  const cur = x && (x.human_takeover_enabled || x.ai_enabled === false) ? 'manual' : (x?.ai_mode || 'default');
  const items = [['default', 'Follow default', 'Same as the setting for all chats (' + MODES[S.ai.mode][0] + ')'], ...Object.entries(MODES).map(([k, v]) => [k, v[0], v[1]])];
  $('cmList').innerHTML = items.map(([k, t, d]) => `<button data-m="${k}" class="${cur === k ? 'on' : ''}">${t}<span>${d}</span></button>`).join('');
  $('cmHint').textContent = S.stop || !S.ai.on ? 'AI is switched off for all chats right now (emergency stop or Settings), so every chat stays Manual.' : 'This changes only this chat.';
  openSheet('cmode');
}
async function setChatMode(m) {
  const c = S.sel; if (!c) return;
  const r = await db.from('client_conversation_controls').upsert({ client_id: S.cid, channel: 'instagram', conversation_id: c.id, human_takeover_enabled: false, ai_enabled: true, ai_mode: m === 'default' ? null : m, updated_at: new Date().toISOString() },
    { onConflict: 'client_id,channel,conversation_id' }).select('*').single();
  if (r.error) { toast(r.error.message, true); return; }
  S.ctl[c.id] = r.data; fillDetails(); hint(); render(); chatModeSheet(); toast(m === 'default' ? 'This chat follows the default AI mode.' : 'AI mode for this chat: ' + MODES[m][0]);
}
$('cmList').onclick = async e => { const b = e.target.closest('button'); if (!b) return; const m = b.dataset.m;
  if (m === 'automatic' && !(await ask({ title: 'Turn on automatic replies for this chat?', text: 'AI will reply to this customer without waiting for your approval.', ok: 'Turn on' }))) return; setChatMode(m); };
$('modeHint').onclick = chatModeSheet;

/* ---------- edit customer details by hand ---------- */
$('dEditBtn').onclick = () => { const c = S.sel; if (!c) return; const l = leadOf(c) || {};
  $('eName').value = l.name || c.username || ''; $('eMobile').value = l.mobile || ''; $('eCity').value = l.city_area || '';
  $('eBudget').value = l.budget != null ? l.budget : ''; $('eInterest').value = l.interest || ''; $('eProduct').value = l.product_service || '';
  $('dEdit').classList.toggle('hide'); };
$('dEditCancel').onclick = () => $('dEdit').classList.add('hide');
$('dEditSave').onclick = async () => {
  const c = S.sel; if (!c) return; const bud = $('eBudget').value.replace(/[^0-9.]/g, ''); let mob = $('eMobile').value.trim();
  const dg = mob.replace(/\D/g, ''); if (dg.length === 10) mob = '+91' + dg;
  const patch = { name: $('eName').value.trim() || c.username || 'Instagram customer', mobile: mob || null, city_area: $('eCity').value.trim() || null,
    interest: $('eInterest').value.trim() || null, product_service: $('eProduct').value.trim() || null, budget: bud !== '' ? Number(bud) : null };
  if (bud !== '') patch.budget_currency = 'INR';
  let ok;
  if (leadOf(c)) ok = await upLead(patch, 'Details saved');
  else { const { data, error } = await db.from('leads').insert({ client_id: S.cid, source: 'instagram', source_ref: c.instagram_user_id, instagram_user_id: c.instagram_user_id,
      instagram_thread_id: c.instagram_thread_id, status: 'new', priority: 'normal', ...patch }).select('*').single();
    if (error) { toast(error.message, true); return; } S.leads[data.id] = data; S.byIg[c.instagram_user_id] = data; fillDetails(); render(); toast('Details saved'); ok = true; }
  if (ok) $('dEdit').classList.add('hide');
};

/* ---------- link this Instagram customer to their WhatsApp number ---------- */
const waVariants = v => { const d = String(v || '').replace(/\D/g, ''); if (d.length === 10) return ['+91' + d, '91' + d, d]; if (d.length === 12 && d.startsWith('91')) return ['+' + d, d, d.slice(2)]; return d.length >= 8 ? [d, '+' + d] : []; };
async function linkStatus() {
  const c = S.sel, st = $('dLinkSt'); if (!c || !st) return; const l = leadOf(c), num = l && (l.whatsapp || l.mobile);
  st.textContent = num ? 'Number saved: ' + num : 'No WhatsApp number linked yet.';
  const v = num ? waVariants(num) : []; if (!l || !v.length) return;
  try {
    const [a, b] = await Promise.all([
      db.from('whatsapp_conversations').select('id').eq('client_id', S.cid).eq('lead_id', l.id).limit(1),
      db.from('whatsapp_conversations').select('id').eq('client_id', S.cid).in('customer_phone', v).limit(1)]);
    if (S.sel !== c) return;
    st.textContent = 'Number saved: ' + num + ((a.data?.length || b.data?.length) ? ' · ✓ WhatsApp chat found for this customer' : ' · No WhatsApp chat yet');
  } catch {}
}
async function linkWa() {
  const c = S.sel; if (!c) return; const d = $('dLinkIn').value.replace(/\D/g, '');
  if (!(d.length === 10 || (d.length === 12 && d.startsWith('91')))) { toast('Enter a valid 10-digit mobile number.', true); return; }
  const num = d.length === 10 ? '+91' + d : '+' + d, v = waVariants(num), btn = $('dLinkBtn'); btn.disabled = true;
  try {
    let l = leadOf(c);
    if (!l) { const ins = await db.from('leads').insert({ client_id: S.cid, name: c.username || `Instagram ${c.instagram_user_id}`, source: 'instagram', source_ref: c.instagram_user_id,
        instagram_user_id: c.instagram_user_id, instagram_thread_id: c.instagram_thread_id, status: 'new', priority: 'normal' }).select('*').single();
      if (ins.error) throw ins.error; l = ins.data; S.leads[l.id] = l; S.byIg[c.instagram_user_id] = l; }
    const cr = await db.from('whatsapp_conversations').select('id,lead_id').eq('client_id', S.cid).in('customer_phone', v); if (cr.error) throw cr.error;
    if ((cr.data || []).some(x => x.lead_id && x.lead_id !== l.id) && !(await ask({ title: 'Link to this customer?', text: 'A WhatsApp chat with this number already belongs to another lead. It will be linked to this Instagram customer instead.', ok: 'Link' }))) return;
    const patch = { whatsapp: num, updated_at: new Date().toISOString() }; if (!l.mobile) patch.mobile = num;
    const up = await db.from('leads').update(patch).eq('id', l.id).eq('client_id', S.cid).select('*').single(); if (up.error) throw up.error; Object.assign(l, up.data);
    if ((cr.data || []).length) { const w = await db.from('whatsapp_conversations').update({ lead_id: l.id }).eq('client_id', S.cid).in('id', cr.data.map(x => x.id)); if (w.error) throw w.error; }
    try { await db.from('instagram_conversations').update({ lead_id: l.id }).eq('id', c.id).eq('client_id', S.cid); c.lead_id = l.id; } catch {}
    try { await db.from('lead_timeline').insert({ client_id: S.cid, lead_id: l.id, event_type: 'channel_linked', title: 'Instagram linked to WhatsApp number', description: num, source: 'instagram_sales_specialist', metadata: { instagram_user_id: c.instagram_user_id, whatsapp: num } }); } catch {}
    $('dLinkIn').value = ''; toast((cr.data || []).length ? 'Linked. The WhatsApp chat now belongs to this customer.' : 'Number linked. When this customer messages on WhatsApp, both chats will show as one customer.'); fillDetails(); render();
  } catch (e) { toast(e.message || 'Linking failed.', true); } finally { btn.disabled = false; }
}
$('dLinkBtn').onclick = linkWa; $('dLinkIn').addEventListener('keydown', e => { if (e.key === 'Enter') linkWa(); });

/* ---------- wiring ---------- */
$('list').onclick = e => { const r = e.target.closest('.row-i'); const c = r && S.convs.find(x => x.id === r.dataset.id); if (c) openChat(c); };
$('chips').onclick = e => { const b = e.target.closest('button'); if (b) { S.f = b.dataset.f; render(); } };
$('searchBtn').onclick = () => { $('search').classList.toggle('hide'); if (!$('search').classList.contains('hide')) $('search').focus(); };
$('search').oninput = e => { S.q = e.target.value.trim(); render(); };
$('back').onclick = closeChat; $('cInfo').onclick = () => openSheet('det');
$('ov').onclick = closeSheet; document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
$('moreBtn').onclick = e => { e.stopPropagation(); pop([['Refresh', refresh], ['Mark all as read', () => { const s = seen(); S.convs.forEach(c => { s[c.id] = Date.now(); }); localStorage.setItem('gig_seen', JSON.stringify(s)); S.unread = {}; render(); toast('All chats marked as read.'); }],
  ['Settings', () => { location.href = 'settings.html'; }], ['Secure logout', logout, true]]); };
$('cMore').onclick = e => { e.stopPropagation(); const closed = S.sel?.status === 'closed';
  pop([[S.meta[S.sel?.id]?.pinned ? 'Unpin chat' : 'Pin chat', togglePin], ['Tags', tagSheet], ['AI mode', chatModeSheet], ['Customer details', () => openSheet('det')], [closed ? 'Reopen chat' : 'Close chat', () => setStatus(closed ? 'open' : 'closed')], ['Delete chat', del, true]]); };
document.addEventListener('click', e => { if (!e.target.closest('#pop')) $('pop').classList.remove('on'); });
$('dAdd').onclick = addLead;
$('dStage').onchange = e => upLead({ status: e.target.value }, 'Stage updated');
$('dHot').onchange = e => { const l = S.sel && leadOf(S.sel); upLead({ priority: e.target.checked ? 'high' : 'normal' }, e.target.checked ? 'Marked as hot lead' : 'Hot lead removed'); };
$('dFu').onclick = e => { const b = e.target.closest('button'); if (!b) return; const n = +b.dataset.fu;
  if (!n) { upLead({ next_follow_up_at: null }, 'Follow-up cleared'); return; }
  const d = new Date(); d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0); upLead({ next_follow_up_at: d.toISOString() }, 'Follow-up set for ' + clock(d)); };
$('dNoteSave').onclick = async () => { const t = $('dNote').value.trim(), l = S.sel && leadOf(S.sel); if (!t || !l) return;
  const stamp = new Date().toLocaleDateString([], { day: '2-digit', month: 'short' });
  if (await upLead({ notes: ((l.notes ? l.notes + '\n\n' : '') + `[Note ${stamp}] ${t}`).slice(-12000) }, 'Note saved')) $('dNote').value = ''; };
$('dAi').onclick = e => { const b = e.target.closest('button'); if (b) setTakeover(b.dataset.ai === '1'); };
$('tplBtn').onclick = $('cTpl').onclick = showTpls; $('insBtn').onclick = insights; $('modeBtn').onclick = modeSheet;
$('modeList').onclick = async e => { const b = e.target.closest('button'); if (!b) return; const m = b.dataset.m; if (m === S.ai.mode) return;
  if (m === 'automatic' && !(await ask({ title: 'Turn on automatic replies?', text: 'AI will reply to Instagram customers without waiting for your approval.', ok: 'Turn on' }))) return; saveMode(m); };
$('tplList').onclick = e => {
  const u = e.target.closest('[data-use]'), d = e.target.closest('[data-del]');
  if (d) { delTpl(+d.dataset.del); return; }
  if (u) { const text = S.tpl[+u.dataset.use].body.replace(/\{name\}/gi, (S.sel && (leadOf(S.sel)?.name || S.sel.username)) || 'there'); closeSheet();
    if (S.sel) { $('input').value = text; size(); $('input').focus(); } else { navigator.clipboard?.writeText(text); toast('Template copied.'); } }
};
$('tplAdd').onclick = async () => { const v = await ask({ title: 'New template', text: 'Use {name} to insert the customer\'s name.', input: true, ok: 'Save', placeholder: 'Type your reply' }); if (v) addTpl(v); };
$('send').onclick = send; $('input').addEventListener('input', size);
$('input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(); } });
$('sugUse').onclick = () => { $('input').value = $('sugText').textContent.trim(); $('sug').classList.add('hide'); size(); $('input').focus(); };
$('connect').onclick = async () => {
  try { const { data } = await db.auth.getSession();
    const r = await fetch(`${U}/functions/v1/instagram-oauth-start`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: K, Authorization: `Bearer ${data.session.access_token}` }, body: '{}' });
    const j = await r.json(); if (!r.ok || !j.url) throw new Error(j.error || 'Unable to start the Instagram connection.'); location.href = j.url;
  } catch (e) { toast(e.message, true); }
};
async function refresh() { try { await loadConn(); await loadAll(); if (S.sel) await loadMsgs(); toast('Refreshed'); } catch (e) { toast(e.message, true); } }
async function logout() { await db.auth.signOut(); location.href = 'login.html'; }
window.addEventListener('offline', () => $('off').classList.remove('hide')); window.addEventListener('online', () => { $('off').classList.add('hide'); refresh(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (dlgOpen) $('dlgNo').click(); else if (sheetOn) closeSheet(); else if (S.sel) closeChat(); } });

/* ---------- realtime ---------- */
let rtTimer = null;
function live() {
  const go = () => { clearTimeout(rtTimer); rtTimer = setTimeout(async () => { try { await loadAll(); if (S.sel) { await loadMsgs(); markSeen(S.sel.id); } } catch {} }, 1500); };
  db.channel('glime-ig-' + S.cid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_conversations', filter: 'client_id=eq.' + S.cid }, go)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'instagram_messages', filter: 'client_id=eq.' + S.cid }, go)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'client_channel_settings', filter: 'client_id=eq.' + S.cid }, go).subscribe();
}

/* ---------- shell account card ---------- */
function pushId(n, i) { let k = 0; const t = setInterval(() => { if (window.GlimeAppShell && GlimeAppShell.setIdentity) { GlimeAppShell.setIdentity({ name: n || '', clientId: i }); clearInterval(t); } else if (++k > 50) clearInterval(t); }, 200); }

/* ---------- boot ---------- */
async function boot() {
  try {
    const { data, error } = await db.auth.getSession(); if (error) throw error;
    if (!data.session) { location.href = 'login.html'; return; }
    const { data: c, error: e } = await db.from('client_data').select('client_id,business_name,name,full_name').eq('auth_user_id', data.session.user.id).maybeSingle();
    if (e) throw e; if (!c?.client_id) throw new Error('Client account not found.');
    S.cid = c.client_id; pushId(c.business_name || c.name || c.full_name, c.client_id);
    if (!navigator.onLine) $('off').classList.remove('hide');
    await loadConn(); await Promise.all([loadMeta(), loadTpls()]); await loadAll(); live(); $('boot').remove();
  } catch (e) {
    $('boot').innerHTML = `<span>${esc(e.message || 'Unable to load.')}</span><button class="btn" style="flex:0;min-width:140px" onclick="location.reload()">Retry</button>`;
  }
}
window.GIG = { db, S, $, esc, toast, leadOf, reload: loadAll, fill: fillDetails, openChat };
boot();
})();
