(() => {
'use strict';
const U = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const K = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const MOD = 'instagram_ai_sales_agent';
const db = window.supabase.createClient(U, K);
const $ = id => document.getElementById(id);
const S = { cid: null, convs: [], prev: {}, unread: {}, leads: {}, byIg: {}, sel: null, msgs: [], f: 'all', q: '',
  mode: localStorage.getItem('glime_instagram_mode') || 'manual' };

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

/* ---------- overlays ---------- */
const sheets = ['det', 'tpl', 'dr'];
function openSheet(id) { sheets.forEach(s => $(s).classList.toggle('on', s === id)); $('ov').classList.add('on'); }
function closeAll() { sheets.forEach(s => $(s).classList.remove('on')); $('ov').classList.remove('on'); $('pop').classList.remove('on'); }
function pop(items) { const p = $('pop'); p.innerHTML = ''; items.forEach(([label, f, d]) => { const b = document.createElement('button');
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

async function loadAll() {
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
      if (m.direction === 'inbound' && sn[m.conversation_id] && new Date(m.created_at) > sn[m.conversation_id])
        S.unread[m.conversation_id] = (S.unread[m.conversation_id] || 0) + 1;
    }
    for (const c of S.convs) if (!sn[c.id] && S.prev[c.id]?.direction === 'inbound') S.unread[c.id] = 1;
  }
  const { data: ls } = await db.from('leads').select('id,name,status,priority,mobile,whatsapp,city_area,interest,budget,budget_currency,product_service,notes,instagram_user_id')
    .eq('client_id', S.cid).not('instagram_user_id', 'is', null).order('updated_at', { ascending: false }).limit(1000);
  for (const l of ls || []) { S.leads[l.id] = l; if (!S.byIg[l.instagram_user_id]) S.byIg[l.instagram_user_id] = l; }
  render(); loadOrders();
}

async function loadOrders() {
  try {
    const r = await db.from('orders').select('id', { count: 'exact', head: true }).eq('client_id', S.cid).ilike('source', '%instagram%');
    $('sOrders').textContent = r.error ? '—' : r.count ?? 0;
  } catch { $('sOrders').textContent = '—'; }
}

/* ---------- inbox ---------- */
function flags(c) {
  const l = leadOf(c), p = S.prev[c.id], open = c.status !== 'closed', st = String(l?.status || '').toLowerCase();
  return { hot: !!l && /hot|high|urgent/i.test(`${l.priority} ${l.status}`), qual: /qualified/.test(st), isNew: !l || st === 'new',
    ai: open && S.mode !== 'manual' && !!c.active_specialist_module_slug, need: open && p?.direction === 'inbound', un: S.unread[c.id] || 0, open };
}
const pass = (c, f) => { const x = flags(c); return f === 'all' || (f === 'unread' && x.un > 0) || (f === 'ai' && x.ai) || (f === 'hot' && x.hot) || (f === 'attn' && x.need); };

function render() {
  const cs = S.convs, ai = cs.filter(c => flags(c).ai).length;
  $('sDm').textContent = cs.length; $('sLeads').textContent = cs.filter(c => leadOf(c)).length;
  $('sAi').textContent = cs.length ? Math.round(ai * 100 / cs.length) + '%' : '0%';
  const n = f => cs.filter(c => pass(c, f)).length, names = { all: 'All', unread: 'Unread', ai: 'AI Handling', hot: 'Hot Leads', attn: 'Needs Attention' };
  document.querySelectorAll('#chips button').forEach(b => { b.textContent = `${names[b.dataset.f]} (${n(b.dataset.f)})`; b.classList.toggle('on', b.dataset.f === S.f); });
  const q = S.q.toLowerCase(), rows = cs.filter(c => pass(c, S.f) && (!q || `${c.username || ''} ${c.instagram_user_id || ''}`.toLowerCase().includes(q)));
  $('list').innerHTML = rows.map(c => {
    const x = flags(c), p = S.prev[c.id], name = c.username || c.instagram_user_id || 'Instagram customer';
    const pv = p ? (p.direction === 'inbound' ? '' : 'You: ') + (p.text_body || media(p.message_type)) : '@' + (c.username || 'instagram');
    const b = [x.hot ? '<span class="b hot">🔥 Hot Lead</span>' : '', x.qual && !x.hot ? '<span class="b ok">✓ Qualified</span>' : '',
      x.isNew && !x.hot && !x.qual ? '<span class="b new">New Lead</span>' : '', x.ai ? '<span class="b ai">🤖 AI Handling</span>' : '',
      !x.open ? '<span class="b cl">Closed</span>' : '', x.un ? `<span class="cnt">${x.un}</span>` : ''].join('');
    return `<div class="row-i${x.un ? ' un' : ''}" data-id="${esc(c.id)}"><div class="av">${esc(name[0].toUpperCase())}</div><div class="rc"><div class="rn"><b>${esc(name)}</b><small>${esc(ago(c.last_message_at || c.updated_at))}</small></div><div class="rp">${esc(pv)}</div><div class="bd">${b}</div></div></div>`;
  }).join('') || '<div class="emp">No conversations here yet.</div>';
}

/* ---------- chat ---------- */
async function openChat(c) {
  S.sel = c; markSeen(c.id); S.unread[c.id] = 0;
  $('chat').classList.add('open'); document.body.classList.add('lock');
  $('cName').textContent = c.username || 'Instagram customer'; $('cAv').textContent = (c.username || 'I')[0].toUpperCase();
  $('cHandle').textContent = `@${c.username || 'instagram'} · ${c.status === 'closed' ? 'Closed' : 'Open'}`;
  $('sug').classList.add('hide'); $('msgs').innerHTML = '<div class="emp">Loading…</div>';
  await loadMsgs(); fillDetails(); loadApproval(); render();
}
function closeChat() { S.sel = null; $('chat').classList.remove('open'); document.body.classList.remove('lock'); closeAll(); render(); }

async function loadMsgs() {
  if (!S.sel) return;
  const { data, error } = await db.from('instagram_messages').select('*').eq('client_id', S.cid).eq('conversation_id', S.sel.id)
    .order('created_at', { ascending: true }).limit(300);
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
  $('msgs').innerHTML = h; $('msgs').scrollTop = $('msgs').scrollHeight;
}

function fillDetails() {
  const c = S.sel; if (!c) return; const l = leadOf(c) || {};
  set('dTitle', c.username || 'Customer'); set('dName', l.name || c.username); set('dStage', l.status ? l.status[0].toUpperCase() + l.status.slice(1).replace(/_/g, ' ') : '');
  set('dMobile', l.mobile || l.whatsapp); set('dCity', l.city_area); set('dInterest', l.interest);
  set('dBudget', l.budget != null ? `${l.budget} ${l.budget_currency || 'INR'}` : ''); set('dProduct', l.product_service);
  $('dNotes').textContent = String(l.notes || '').slice(-1200); $('dNotesWrap').classList.toggle('hide', !l.notes);
  $('dLead').href = l.id ? 'leads.html?lead=' + encodeURIComponent(l.id) : 'leads.html'; $('dAdd').classList.toggle('hide', !!l.id);
  setMode(S.mode);
}
function setMode(m) {
  S.mode = m; localStorage.setItem('glime_instagram_mode', m);
  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('modeHint').textContent = m === 'auto' ? 'AI can send' : m === 'approval' ? 'Approval required' : 'Manual send';
}

/* ---------- send / approval ---------- */
async function send() {
  const c = S.sel, msg = $('input').value.trim(); if (!c || !msg) return;
  if (msg.length > 2000) { toast('Message is too long (max 2000).', true); return; }
  $('send').disabled = true;
  try {
    const r = await fn('instagram-action-request', { conversation_id: c.id, message: msg, mode: S.mode });
    if (!r.ok) throw new Error(r.message || r.error || 'Instagram action failed.');
    $('input').value = ''; size();
    if (S.mode === 'approval') toast('Reply is waiting for approval.');
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
function size() { const i = $('input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 120) + 'px'; $('send').disabled = !i.value.trim(); }

/* ---------- close / delete / add lead ---------- */
const needRpc = (e, name) => /function|schema cache|not exist|404/i.test(e.message || '') ? `Backend function ${name} abhi nahi bana hai.` : e.message;
async function setStatus(status) {
  const c = S.sel; if (!c) return;
  let { error } = await db.rpc('set_instagram_conversation_status', { p_conversation_id: c.id, p_status: status });
  if (error) { const r = await db.from('instagram_conversations').update({ status, updated_at: new Date().toISOString() }).eq('id', c.id).eq('client_id', S.cid).select('id');
    if (r.error || !r.data?.length) { toast(needRpc(error, 'set_instagram_conversation_status'), true); return; } }
  c.status = status; $('cHandle').textContent = `@${c.username || 'instagram'} · ${status === 'closed' ? 'Closed' : 'Open'}`;
  toast(status === 'closed' ? 'Conversation closed.' : 'Conversation reopened.'); await loadAll();
}
async function del() {
  const c = S.sel; if (!c || !confirm('Delete this chat permanently? All its messages will be removed.')) return;
  const { error } = await db.rpc('delete_instagram_conversation', { p_conversation_id: c.id });
  if (error) { toast(needRpc(error, 'delete_instagram_conversation'), true); return; }
  closeChat(); toast('Chat deleted.'); await loadAll();
}
async function addLead() {
  const c = S.sel; if (!c) return;
  const { data, error } = await db.from('leads').insert({ client_id: S.cid, name: c.username || `Instagram ${c.instagram_user_id}`, source: 'instagram',
    source_ref: c.instagram_user_id, instagram_user_id: c.instagram_user_id, instagram_thread_id: c.instagram_thread_id, status: 'new', priority: 'normal' }).select('*').single();
  if (error) { toast(error.message, true); return; }
  S.leads[data.id] = data; S.byIg[c.instagram_user_id] = data; toast('Added to Leads.'); fillDetails(); render();
}

/* ---------- templates (saved on this device) ---------- */
const DEF = ['Hi! Thanks for messaging us 😊 How can I help you?', 'Please share your name and mobile number so we can help you better.', 'Sure, let me check and get back to you in a minute 🙏'];
const tpls = () => { try { const t = JSON.parse(localStorage.getItem('gig_tpl') || 'null'); return Array.isArray(t) ? t : DEF.slice(); } catch { return DEF.slice(); } };
const saveTpls = t => localStorage.setItem('gig_tpl', JSON.stringify(t));
function showTpls() {
  const t = tpls(); $('tplList').innerHTML = t.map((x, i) => `<div class="tp"><span data-use="${i}">${esc(x)}</span><button class="x" data-del="${i}" aria-label="Delete template">✕</button></div>`).join('') || '<div class="emp">No templates yet.</div>';
  openSheet('tpl');
}

/* ---------- wiring ---------- */
$('list').onclick = e => { const r = e.target.closest('.row-i'); const c = r && S.convs.find(x => x.id === r.dataset.id); if (c) openChat(c); };
$('chips').onclick = e => { const b = e.target.closest('button'); if (b) { S.f = b.dataset.f; render(); } };
$('searchBtn').onclick = () => { $('search').classList.toggle('hide'); if (!$('search').classList.contains('hide')) $('search').focus(); };
$('search').oninput = e => { S.q = e.target.value.trim(); render(); };
$('back').onclick = closeChat;
$('menuBtn').onclick = $('bnMore').onclick = () => openSheet('dr');
$('ov').onclick = closeAll;
document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeAll);
$('moreBtn').onclick = e => { e.stopPropagation(); pop([['Refresh', refresh], ['Settings', () => location.href = 'settings.html'], ['Secure logout', logout, true]]); };
$('cMore').onclick = e => { e.stopPropagation(); const closed = S.sel?.status === 'closed';
  pop([['Customer details', () => openSheet('det')], [closed ? 'Reopen chat' : 'Close chat', () => setStatus(closed ? 'open' : 'closed')], ['Delete chat', del, true]]); };
document.addEventListener('click', e => { if (!e.target.closest('#pop')) $('pop').classList.remove('on'); });
document.querySelectorAll('.modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('dAdd').onclick = addLead;
$('tplBtn').onclick = $('cTpl').onclick = showTpls;
$('tplList').onclick = e => {
  const u = e.target.closest('[data-use]'), d = e.target.closest('[data-del]'), t = tpls();
  if (d) { t.splice(+d.dataset.del, 1); saveTpls(t); showTpls(); return; }
  if (u) { const text = t[+u.dataset.use]; closeAll();
    if (S.sel) { $('input').value = text; size(); $('input').focus(); } else { navigator.clipboard?.writeText(text); toast('Template copied.'); } }
};
$('tplAdd').onclick = () => { const v = (prompt('New template text') || '').trim(); if (v) { const t = tpls(); t.push(v); saveTpls(t); showTpls(); } };
$('send').onclick = send; $('input').addEventListener('input', size);
$('input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); send(); } });
$('sugUse').onclick = () => { $('input').value = $('sugText').textContent.trim(); size(); $('input').focus(); };
$('connect').onclick = async () => {
  try { const { data } = await db.auth.getSession();
    const r = await fetch(`${U}/functions/v1/instagram-oauth-start`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: K, Authorization: `Bearer ${data.session.access_token}` }, body: '{}' });
    const j = await r.json(); if (!r.ok || !j.url) throw new Error(j.error || 'Unable to start Instagram connection.'); location.href = j.url;
  } catch (e) { toast(e.message, true); }
};
async function refresh() { try { await loadConn(); await loadAll(); if (S.sel) await loadMsgs(); toast('Refreshed'); } catch (e) { toast(e.message, true); } }
async function logout() { await db.auth.signOut(); location.href = 'login.html'; }
$('logout').onclick = logout;
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('ov').classList.contains('on')) closeAll(); else if (S.sel) closeChat(); } });

/* ---------- realtime ---------- */
let rt = null, rtTimer = null;
function live() {
  const go = () => { clearTimeout(rtTimer); rtTimer = setTimeout(async () => { try { await loadAll(); if (S.sel) { await loadMsgs(); markSeen(S.sel.id); } } catch {} }, 1500); };
  rt = db.channel('glime-ig-' + S.cid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_conversations', filter: 'client_id=eq.' + S.cid }, go)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'instagram_messages', filter: 'client_id=eq.' + S.cid }, go).subscribe();
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const { data, error } = await db.auth.getSession(); if (error) throw error;
    if (!data.session) { location.href = 'login.html'; return; }
    const { data: c, error: e } = await db.from('client_data').select('client_id,business_name,name,full_name').eq('auth_user_id', data.session.user.id).maybeSingle();
    if (e) throw e; if (!c?.client_id) throw new Error('Client account not found.');
    S.cid = c.client_id; set('bizName', c.business_name || c.name || c.full_name || 'Business'); set('clientId', c.client_id);
    setMode(S.mode); await loadConn(); await loadAll(); live(); $('boot').remove();
  } catch (e) {
    $('boot').innerHTML = `<span>${esc(e.message || 'Unable to load.')}</span><button class="btn" style="flex:0;max-width:160px" onclick="location.reload()">Retry</button>`;
  }
}
window.GIG = { db, S, $, esc, toast, leadOf, reload: loadAll, fill: fillDetails, openChat };
boot();
})();
