(() => {
'use strict';
const U = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const K = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const FN = 'instagram-comment-actions';
const db = window.supabase.createClient(U, K);
const $ = id => document.getElementById(id);
const S = { cid: null, rows: [], posts: {}, f: 'all', sel: null, on: true, mode: 'manual' };
const MODE = { manual: 'Manual', approval: 'Approval', automatic: 'Automatic' };

/* ---------- helpers ---------- */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const ago = v => { if (!v) return ''; const s = (Date.now() - new Date(v)) / 1e3;
  return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : s < 604800 ? Math.floor(s / 86400) + 'd' : new Date(v).toLocaleDateString([], { day: '2-digit', month: 'short' }); };
const clock = v => new Date(v).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
function toast(m, err) { document.querySelector('.toast')?.remove(); const e = document.createElement('div');
  e.className = 'toast' + (err ? ' err' : ''); e.textContent = m; document.body.appendChild(e); setTimeout(() => e.remove(), 3800); }
async function fn(name, body = {}) {
  const { data, error } = await db.functions.invoke(name, { body });
  if (error) { let d = ''; try { const r = error.context; if (r && r.json) { const j = await r.json(); d = j?.message || j?.error || ''; } } catch {}
    throw new Error(d || error.message || 'Request failed'); }
  if (data?.error) throw new Error(data.message || data.error);
  return data || {};
}

/* ---------- in-app dialog ---------- */
let dlgOpen = false;
function ask(o) {
  return new Promise(res => {
    $('dlgTitle').textContent = o.title || ''; $('dlgText').textContent = o.text || '';
    $('dlgOk').textContent = o.ok || 'OK'; $('dlgOk').className = 'btn' + (o.danger ? ' dng' : '');
    $('dlg').classList.add('on'); dlgOpen = true;
    const done = v => { $('dlg').classList.remove('on'); dlgOpen = false; res(v); };
    $('dlgOk').onclick = () => done(true); $('dlgNo').onclick = () => done(false);
  });
}

/* ---------- details sheet (phone back button closes it) ---------- */
let sheetOn = false;
function openSheet() { if (!sheetOn) { history.pushState({ g: 's' }, ''); sheetOn = true; } $('cd').classList.add('on'); $('ov').classList.add('on'); }
function hideSheet() { $('cd').classList.remove('on'); $('ov').classList.remove('on'); sheetOn = false; S.sel = null; }
const closeSheet = () => { if (sheetOn) history.back(); };
window.addEventListener('popstate', () => { if (dlgOpen) { history.pushState({ g: 'd' }, ''); return; } if (sheetOn) hideSheet(); });

/* ---------- comment helpers ---------- */
const G = r => (r.raw_payload && r.raw_payload.glime) || {};
const SPAM = /(fuck|bitch|asshole|bastard|slut|madarchod|behenchod|bhosd[a-z]*|chutiy[ae]|randi|harami|gandu|https?:[/][/]|www[.]|t[.]me[/]|wa[.]me[/]|bit[.]ly|follow for follow|f4f|l4l|check my profile|earn [0-9]|dm for collab|click (the )?link)/i;
const isSpam = r => SPAM.test(r.comment_text || '');
const kind = r => (r.status === 'skipped' && r.skip_reason === 'approval_required' && !G(r).rejected) ? 'pending' : r.status;
const live = () => S.rows.filter(r => !G(r).deleted);
const pass = (r, f) => f === 'all' || (f === 'pending' && kind(r) === 'pending') || (f === 'replied' && r.status === 'replied' && !G(r).hidden)
  || (f === 'spam' && isSpam(r) && !G(r).hidden) || (f === 'hidden' && !!G(r).hidden)
  || (f === 'issue' && (r.status === 'failed' || (r.status === 'skipped' && kind(r) !== 'pending')));
const badges = r => { const g = G(r), k = kind(r), o = [];
  if (k === 'pending') o.push(`<span class='b wait'>Needs approval</span>`);
  else if (r.status === 'replied') o.push(`<span class='b ok'>Replied</span>`);
  else if (r.status === 'failed') o.push(`<span class='b wait'>Failed</span>`);
  else if (r.status === 'skipped') o.push(`<span class='b cl'>${r.skip_reason === 'approval_rejected' ? 'Rejected' : 'Skipped'}</span>`);
  if (isSpam(r)) o.push(`<span class='b hot'>Spam?</span>`);
  if (g.hidden) o.push(`<span class='b cl'>Hidden</span>`);
  return o.join(''); };

/* ---------- settings (comment auto-reply switch) ---------- */
function hint() {
  $('swOn').checked = S.on; const m = MODE[S.mode] || 'Manual';
  $('swHint').textContent = !S.on ? 'Auto-reply for comments is off. You can still reply, hide or delete by hand.'
    : S.mode === 'approval' ? 'Approval mode: AI writes the reply and you approve it here. (Instagram Auto Reply: ' + m + ')'
    : S.mode === 'automatic' ? 'Automatic mode: AI sends a DM to the commenter and posts a short public note. (Instagram Auto Reply: ' + m + ')'
    : 'Instagram Auto Reply is Manual. Change it from Auto Reply on the Instagram page.';
}
async function loadSettings() {
  try { const r = await db.from('client_channel_settings').select('ai_mode,comment_replies_enabled').eq('client_id', S.cid).eq('channel', 'instagram').maybeSingle();
    if (r.data) { S.on = r.data.comment_replies_enabled !== false; S.mode = r.data.ai_mode || 'manual'; } } catch {}
  hint();
}
$('swOn').onchange = async e => {
  const on = e.target.checked, now = new Date().toISOString();
  let r = await db.from('client_channel_settings').update({ comment_replies_enabled: on, updated_at: now }).eq('client_id', S.cid).eq('channel', 'instagram').select('id');
  if (r.error || !r.data?.length) r = await db.from('client_channel_settings').insert({ client_id: S.cid, channel: 'instagram', comment_replies_enabled: on }).select('id');
  if (r.error) { e.target.checked = !on; toast(r.error.message, true); return; }
  S.on = on; hint(); toast(on ? 'Comment auto-reply is on.' : 'Comment auto-reply is off.');
};

/* ---------- data + list ---------- */
async function load() {
  await loadSettings();
  const { data, error } = await db.from('instagram_comments').select('id,ig_comment_id,ig_parent_comment_id,ig_media_id,media_product_type,commenter_username,comment_text,post_caption,post_permalink,status,skip_reason,ai_reply,reply_comment_id,error,raw_payload,replied_at,created_at')
    .eq('client_id', S.cid).order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  S.rows = data || []; if (S.sel) S.sel = S.rows.find(r => r.id === S.sel.id) || null;
  const ids = [...new Set(S.rows.map(r => r.ig_media_id).filter(Boolean))];
  if (ids.length) { try { const r = await db.from('instagram_posts').select('ig_media_id,media_url,permalink').eq('client_id', S.cid).in('ig_media_id', ids);
    S.posts = {}; (r.data || []).forEach(p => { S.posts[p.ig_media_id] = p; }); } catch {} }
  render();
}
function render() {
  const rows = live();
  $('sTot').textContent = rows.length; $('sPend').textContent = rows.filter(r => kind(r) === 'pending').length;
  $('sRep').textContent = rows.filter(r => r.status === 'replied').length; $('sHid').textContent = rows.filter(r => G(r).hidden).length;
  const names = { all: 'All', pending: 'Needs approval', replied: 'Replied', spam: 'Spam', hidden: 'Hidden', issue: 'Issues' };
  document.querySelectorAll('#chips button').forEach(b => { b.textContent = `${names[b.dataset.f]} (${rows.filter(r => pass(r, b.dataset.f)).length})`; b.classList.toggle('on', b.dataset.f === S.f); });
  $('list').innerHTML = rows.filter(r => pass(r, S.f)).map(r => {
    const p = S.posts[r.ig_media_id] || {}, nm = r.commenter_username || 'instagram user', reel = /reel/i.test(r.media_product_type || ''), cap = String(r.post_caption || '').slice(0, 60);
    return `<div class='cm${G(r).hidden ? ' hd' : ''}' data-id='${esc(r.id)}'><div class='av'>${esc(nm[0].toUpperCase())}</div><div class='rc'><div class='rn'><b>@${esc(nm)}</b><small>${esc(ago(r.created_at))}</small></div><div class='tx'>${esc(r.comment_text)}</div><div class='pp'>${p.media_url ? `<img src='${esc(p.media_url)}' alt='' loading='lazy'>` : ''}<span>${reel ? 'Reel' : 'Post'}${cap ? ' · ' + esc(cap) : ''}</span></div><div class='bd'>${badges(r)}</div></div></div>`;
  }).join('') || `<div class='emp'>No comments here yet.</div>`;
}

/* ---------- one comment ---------- */
function draw() {
  const r = S.sel; if (!r) return;
  const g = G(r), k = kind(r), nm = r.commenter_username || 'instagram user', p = S.posts[r.ig_media_id] || {}, link = r.post_permalink || p.permalink;
  const man = g.replies || [], mine = man.filter(x => x.id).map(x => ({ id: x.id, text: x.text }));
  if (r.reply_comment_id && !man.some(x => x.id === r.reply_comment_id)) mine.unshift({ id: r.reply_comment_id, text: 'Public reply sent automatically' });
  $('cdBody').innerHTML = `<div class='cd-h'><div class='av'>${esc(nm[0].toUpperCase())}</div><div><b>@${esc(nm)}</b><small>${esc(clock(r.created_at))} · ${/reel/i.test(r.media_product_type || '') ? 'Reel' : 'Post'}</small></div></div>
  <div class='cd-t'>${esc(r.comment_text)}</div>${link ? `<a class='cd-lk' href='${esc(link)}' target='_blank' rel='noopener noreferrer'>Open post ↗</a>` : ''}
  <div class='bd'>${badges(r)}</div>
  ${k === 'pending' ? `<div class='box'><p class='lbl'>AI draft (will be sent as a DM)</p><textarea id='cdDraft' rows='4' maxlength='1000'>${esc(r.ai_reply)}</textarea><div class='row'><button class='btn' data-a='approve'>Approve &amp; send</button><button class='btn ghost' data-a='reject'>Reject</button></div></div>` : r.ai_reply ? `<p class='lbl'>AI reply (sent by DM)</p><div class='cd-r'>${esc(r.ai_reply)}</div>` : ''}
  ${r.error ? `<div class='cd-e'>${esc(r.error)}</div>` : ''}
  ${mine.length ? `<p class='lbl'>Your replies</p>${mine.map(x => `<div class='cd-p'><span>${esc(x.text)}</span><button data-a='delr' data-id='${esc(x.id)}'>Delete</button></div>`).join('')}` : ''}
  <p class='lbl'>Reply to this comment</p><textarea id='cdReply' rows='3' maxlength='1000' placeholder='Write a public reply'></textarea>
  <button class='btn full' data-a='reply'>Send reply</button>
  <div class='row'><button class='btn ghost' data-a='hide'>${g.hidden ? 'Unhide comment' : 'Hide comment'}</button><button class='btn dng' data-a='del'>Delete comment</button></div>`;
}
async function act(action, extra = {}) {
  const r = S.sel; const d = await fn(FN, { action, comment_id: r.id, ...extra });
  if (d.glime) r.raw_payload = { ...(r.raw_payload || {}), glime: d.glime };
  if (d.status) r.status = d.status; if ('skip_reason' in d) r.skip_reason = d.skip_reason;
  if ('reply_comment_id' in d) r.reply_comment_id = d.reply_comment_id; if (d.ai_reply) r.ai_reply = d.ai_reply; if (d.replied_at) r.replied_at = d.replied_at;
  r.error = null; render(); draw(); return d;
}
$('cdBody').onclick = async e => {
  const b = e.target.closest('[data-a]'); if (!b || b.disabled || !S.sel) return; const a = b.dataset.a, r = S.sel; b.disabled = true;
  try {
    if (a === 'reply') { const m = $('cdReply').value.trim(); if (!m) { toast('Write a reply first.', true); return; } await act('reply', { message: m }); toast('Reply posted.'); }
    else if (a === 'hide') { const h = !G(r).hidden; await act('hide', { hidden: h }); toast(h ? 'Comment hidden.' : 'Comment is visible again.'); }
    else if (a === 'del') { if (!(await ask({ title: 'Delete this comment?', text: 'It will be removed from your Instagram post. This cannot be undone.', ok: 'Delete', danger: true }))) return; await act('delete', { target: 'comment' }); toast('Comment deleted.'); closeSheet(); }
    else if (a === 'delr') { if (!(await ask({ title: 'Delete this reply?', text: 'Your reply will be removed from Instagram.', ok: 'Delete', danger: true }))) return; await act('delete', { target: 'reply', reply_id: b.dataset.id }); toast('Reply deleted.'); }
    else if (a === 'approve') { await act('approve', { message: ($('cdDraft')?.value || '').trim() }); toast('Approved: DM sent and a public note posted.'); }
    else if (a === 'reject') { await act('reject'); toast('Draft rejected.'); }
  } catch (err) { toast(err.message || 'Action failed.', true); } finally { b.disabled = false; }
};

/* ---------- wiring ---------- */
$('list').onclick = e => { const x = e.target.closest('.cm'); const r = x && S.rows.find(y => y.id === x.dataset.id); if (r) { S.sel = r; draw(); openSheet(); } };
$('chips').onclick = e => { const b = e.target.closest('button'); if (b) { S.f = b.dataset.f; render(); } };
$('ov').onclick = closeSheet; document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
$('refresh').onclick = async () => { try { await load(); toast('Refreshed'); } catch (e) { toast(e.message, true); } };
window.addEventListener('offline', () => $('off').classList.remove('hide')); window.addEventListener('online', () => { $('off').classList.add('hide'); load().catch(() => {}); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (dlgOpen) $('dlgNo').click(); else if (sheetOn) closeSheet(); } });

/* ---------- realtime ---------- */
function live2() {
  let t = null; const go = () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 1500); };
  db.channel('glime-ig-comments-' + S.cid).on('postgres_changes', { event: '*', schema: 'public', table: 'instagram_comments', filter: 'client_id=eq.' + S.cid }, go).subscribe();
}
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
    await load(); live2(); $('boot').remove();
  } catch (e) {
    $('boot').innerHTML = `<span>${esc(e.message || 'Unable to load.')}</span><button class='btn' style='flex:0;min-width:140px' onclick='location.reload()'>Retry</button>`;
  }
}
boot();
})();
