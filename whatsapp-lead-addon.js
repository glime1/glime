/* GLIME — WhatsApp Sales add-on: Instagram-style lead tools, Instagram ID, AI fill, 24h window timer, pin, tags, templates.
   Needs whatsapp-sales-specialist.js first (uses window.GWA). Pin, tags and templates are saved in Supabase when the tables
   whatsapp_chat_meta / whatsapp_templates exist, otherwise on this device. */
(() => {
'use strict';
const G = window.GWA; if (!G) return;
const { sb, st, $, esc, toast, fn, friendly } = G;
const c = v => String(v ?? '').trim();
const q = (s, r = document) => r.querySelector(s);
const digits = v => { const d = c(v).replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };
const variants = v => { const d = c(v).replace(/\D/g, ''); if (d.length === 10) return ['+91' + d, '91' + d, d]; if (d.length === 12 && d.startsWith('91')) return ['+' + d, d, d.slice(2)]; return d.length >= 8 ? [d, '+' + d] : []; };
const clock = v => new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
const cur = () => st.sel;
const M = { meta: {}, cloud: false, tpl: [], tplCloud: false, tag: '', pinOnly: false, ig: new Map(), sheet: '' };
const STAGES = ['new', 'contacted', 'qualified', 'won', 'lost'];
const DEFTAGS = ['Price asked', 'Delivery', 'Complaint', 'Order', 'Follow-up', 'VIP'];
const DEFTPL = ['Hi {name}! Thanks for messaging us 😊 How can I help you?', 'Could you please share your name and city so we can help you better?', 'Sure {name}, let me check and get back to you in a minute 🙏'];
const tagCol = t => { let h = 0; for (const ch of String(t)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 5; };
const isHot = l => /high|urgent/.test((l && l.priority) || '');
const nameOf = () => { const x = cur(); return c((x && x.lead && x.lead.name) || (x && x.customer_name)) || 'there'; };
const fillName = t => c(t).replace(/\{name\}/gi, nameOf());
function setBusy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.o = btn.textContent; btn.textContent = label || 'Please wait…'; btn.disabled = true; }
  else { if (btn.dataset.o) btn.textContent = btn.dataset.o; btn.disabled = false; }
}

/* ---------- Instagram ID of the same customer (never the other way round) ---------- */
async function igOf(conv) {
  const lead = conv.lead || null, lid = (lead && lead.id) || conv.lead_id || '', key = conv.id + ':' + lid;
  if (M.ig.has(key)) return M.ig.get(key);
  let res = null;
  try {
    const ors = [];
    if (lid) ors.push('lead_id.eq.' + lid);
    if (lead && lead.instagram_user_id) ors.push('instagram_user_id.eq.' + lead.instagram_user_id);
    if (ors.length) {
      const r = await sb.from('instagram_conversations').select('username,instagram_user_id').eq('client_id', st.clientId).or(ors.join(',')).order('last_message_at', { ascending: false, nullsFirst: false }).limit(1);
      if (r.data && r.data[0]) res = r.data[0];
    }
    if (!res) {
      const v = variants(conv.customer_phone);
      if (v.length) {
        let l2 = await sb.from('leads').select('instagram_user_id').eq('client_id', st.clientId).not('instagram_user_id', 'is', null).in('whatsapp', v).limit(1);
        if (!(l2.data && l2.data[0])) l2 = await sb.from('leads').select('instagram_user_id').eq('client_id', st.clientId).not('instagram_user_id', 'is', null).in('mobile', v).limit(1);
        const uid = l2.data && l2.data[0] && l2.data[0].instagram_user_id;
        if (uid) {
          const r = await sb.from('instagram_conversations').select('username,instagram_user_id').eq('client_id', st.clientId).eq('instagram_user_id', uid).limit(1);
          res = (r.data && r.data[0]) || { username: '', instagram_user_id: uid };
        }
      }
    }
  } catch (_) {}
  M.ig.set(key, res);
  return res;
}
async function paintIg(conv) {
  const r = await igOf(conv);
  if (!r || !cur() || cur().id !== conv.id) return;
  const lbl = r.username ? '@' + r.username : 'Instagram ' + r.instagram_user_id;
  $('phone').textContent = lbl; $('ctxPhone').textContent = lbl;
  document.querySelectorAll('#ctxDynamic .ctx-row').forEach(row => {
    const s = row.firstElementChild;
    if (s && s.textContent === 'Phone') { s.textContent = 'Instagram'; row.lastElementChild.textContent = lbl; }
  });
}

/* ---------- 24-hour reply window ---------- */
function winBar() {
  const el = $('gwaWin'), conv = cur(); if (!el) return;
  if (!conv) { el.className = 'gwa-win hidden'; return; }
  let li = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
  const inb = st.msgs.filter(m => m.direction === 'inbound');
  if (inb.length) li = Math.max(li, new Date(inb[inb.length - 1].created_at).getTime());
  if (!li) { el.className = 'gwa-win hidden'; return; }
  const left = li + 864e5 - Date.now();
  if (left <= 0) { el.className = 'gwa-win off'; el.textContent = '24-hour reply window is closed. WhatsApp may not deliver new replies until the customer messages again.'; return; }
  const h = Math.floor(left / 36e5), m = Math.floor(left % 36e5 / 6e4);
  el.className = 'gwa-win' + (left < 108e5 ? ' warn' : '');
  el.textContent = 'You can reply for ' + (h ? h + 'h ' : '') + m + 'm more (WhatsApp 24-hour rule).';
}

/* ---------- lead helpers ---------- */
function paintLeadGrid(l) {
  $('leadInterest').textContent = l.interest || '—';
  $('leadBudget').textContent = l.budget ? `${l.budget} ${l.budget_currency || 'INR'}` : '—';
  $('leadProduct').textContent = l.product_service || '—';
  $('leadSource').textContent = l.source || 'whatsapp';
  $('leadStatus').textContent = 'Lead';
  $('openLead').href = 'leads.html?lead=' + encodeURIComponent(l.id);
  $('addLead').textContent = '✓ Already a Lead'; $('addLead').disabled = true;
}
function refreshBits(l) {
  const s = $('gwaStage'), h = $('gwaHot'), f = $('gwaFuTxt'), n = $('gwaNotes');
  if (s) s.value = l.status || 'new';
  if (h) h.checked = isHot(l);
  if (f) f.textContent = l.next_follow_up_at ? 'Next follow-up: ' + clock(l.next_follow_up_at) : '';
  if (n) { n.textContent = c(l.notes).slice(-1500); n.classList.toggle('hidden', !l.notes); }
}
async function ensureLead() {
  const conv = cur(); if (!conv) throw new Error('Open a chat first.');
  if (conv.lead) return conv.lead;
  let lead = null;
  const p = c(conv.customer_phone).replace(/[^\d+]/g, '');
  if (p) {
    const r = await sb.from('leads').select('*').eq('client_id', st.clientId).or(`mobile.eq.${p},whatsapp.eq.${p}`).limit(1).maybeSingle();
    lead = r.data || null;
  }
  if (!lead) {
    const ins = await sb.from('leads').insert({ client_id: st.clientId, customer_id: conv.customer_id || null, name: conv.customer_name || 'WhatsApp Lead', mobile: conv.customer_phone, whatsapp: conv.customer_phone,
      source: 'whatsapp', source_ref: conv.id, status: 'new', priority: 'normal' }).select('*').single();
    if (ins.error) throw ins.error; lead = ins.data;
  }
  const u = await sb.from('whatsapp_conversations').update({ lead_id: lead.id }).eq('id', conv.id).eq('client_id', st.clientId).select('id');
  if (u.error) throw u.error;
  conv.lead = lead; conv.lead_id = lead.id;
  const row = st.convs.find(x => x.id === conv.id); if (row) row.lead_id = lead.id;
  paintLeadGrid(lead);
  return lead;
}
async function upLead(patch, msg) {
  const x = cur(), lead = x && x.lead; if (!lead) return false;
  const r = await sb.from('leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', lead.id).eq('client_id', st.clientId).select('*').single();
  if (r.error) { toast(friendly(r.error), true); refreshBits(lead); return false; }
  if (cur() && cur().id === x.id) cur().lead = r.data;
  paintLeadGrid(r.data); refreshBits(r.data);
  if (msg) toast(msg);
  return true;
}

/* ---------- fill details from the chat: rules (free) or AI ---------- */
const titleCase = s => s.replace(/\b([a-z])/gi, (m, ch) => ch.toUpperCase());
function rules(msgs) {
  const inn = msgs.filter(m => m.direction === 'inbound').map(m => c(m.text_body)).filter(Boolean), raw = inn.join(' \n '), t = raw.toLowerCase(), f = {};
  const nm = raw.match(/(?:my name is|mera naam|mera name|name is)\s+([A-Za-z][A-Za-z.]{1,20}(?:\s[A-Za-z][A-Za-z.]{1,20})?)/i);
  if (nm) f.name = titleCase(nm[1].replace(/\s+(hai|he|hu|hoon|h|and|aur)$/i, ''));
  const bd = t.match(/budget[^0-9]{0,15}(\d[\d,]*)/); if (bd) f.budget = bd[1].replace(/,/g, '');
  const cm = raw.match(/(?:i am from|i'm from|i live in|living in|city is|city:)\s+([A-Za-z]{3,}(?: [A-Za-z]{3,})?)/i); if (cm) f.city_area = titleCase(cm[1]);
  let act = '';
  if (/kharid|khareed|buy|purchase|order|lena hai|lene hai|book|खरीद|ऑर्डर/.test(t)) act = 'Wants to buy';
  else if (/price|cost|rate|kitna|kitne|charge|fees|कीमत|प्राइस|कितना/.test(t)) act = 'Asked the price';
  else if (/demo|trial/.test(t)) act = 'Wants a demo';
  else if (/detail|info|jaankari|जानकारी/.test(t)) act = 'Asked for details';
  else if (/deliver/.test(t)) act = 'Asked about delivery';
  const all = msgs.map(m => c(m.text_body).toLowerCase()); let best = '', bs = 0;
  (st.services || []).forEach(s => { const n = c(s.name || s.title); if (n.length < 2) return; const k = n.toLowerCase(), sc = all.filter(x => x.includes(k)).length; if (sc > bs) { bs = sc; best = n; } });
  if (best) f.product = best;
  if (act) f.interest = act + (best ? (act === 'Asked the price' ? ' of ' : ' ') + best : '');
  return f;
}
const parseJson = t => { t = c(t); try { return JSON.parse(t); } catch (_) {} const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) {} } return null; };
let aiBusy = false;
async function aiExtract() {
  if (!st.msgs.length) throw new Error('No messages to read yet.');
  const chat = st.msgs.slice(-40).map(m => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${m.text_body || ''}`).join('\n');
  const names = (st.services || []).slice(0, 25).map(s => c(s.name || s.title)).filter(Boolean).join(', ');
  const message = `Read this WhatsApp sales chat and extract details about the CUSTOMER.
Reply with ONLY one JSON object and no other text, with exactly these keys: customer_name, city_area, budget, interest, product.
Rules: use "" when the customer has not clearly said it. budget is digits only. interest is a short phrase (maximum 8 words). product must be one of the business offers when it matches: ${names || 'none listed'}. Never guess or invent anything.

Chat:
${chat}`;
  const d = await fn('glime-ai', { action: 'chat', sessionToken: null, message });
  const j = parseJson(d.reply);
  if (!j) throw new Error('AI could not read this chat. Try again.');
  return { name: c(j.customer_name), city_area: c(j.city_area), budget: c(j.budget), interest: c(j.interest), product: c(j.product) };
}
async function applyFill(f) {
  const conv = cur(), l = conv.lead || {}, patch = {};
  const empty = k => l[k] == null || c(l[k]) === '';
  if (f.name && (empty('name') || l.name === conv.customer_name || l.name === 'WhatsApp Lead')) patch.name = f.name;
  if (f.city_area && empty('city_area')) patch.city_area = f.city_area;
  if (f.interest && empty('interest')) patch.interest = f.interest;
  if (f.product && empty('product_service')) patch.product_service = f.product;
  const b = Number(String(f.budget || '').replace(/[^0-9.]/g, ''));
  if (b > 0 && l.budget == null) { patch.budget = b; patch.budget_currency = 'INR'; }
  if (!Object.keys(patch).length) return toast('Nothing new found in this chat.');
  await ensureLead();
  if (await upLead(patch, 'Details filled from the chat.')) renderTools();
}
async function fillChat(useAi) {
  const conv = cur(); if (!conv || aiBusy) return;
  if (!st.msgs.some(m => m.direction === 'inbound')) return toast('No customer messages to read yet.', true);
  const btn = q(useAi ? '[data-g="fillai"]' : '[data-g="fill"]'); aiBusy = true; setBusy(btn, true, 'Reading…');
  try { await applyFill(useAi ? await aiExtract() : rules(st.msgs)); }
  catch (e) { toast(friendly(e), true); }
  finally { aiBusy = false; setBusy(btn, false); }
}
async function editAi() {
  const conv = cur(); if (!conv || aiBusy) return;
  const btn = q('[data-g="editai"]'); aiBusy = true; setBusy(btn, true, 'Reading…');
  try {
    const f = await aiExtract(), put = (id, v) => { const el = $(id); if (el && v && !c(el.value)) el.value = v; };
    const n = $('gName'); if (n && f.name && (!c(n.value) || n.value === conv.customer_name || n.value === 'WhatsApp Lead')) n.value = f.name;
    put('gCity', f.city_area); put('gInterest', f.interest); put('gProduct', f.product); put('gBudget', String(f.budget || '').replace(/[^0-9.]/g, ''));
    toast('Filled by AI. Review and press Save.');
  } catch (e) { toast(friendly(e), true); }
  finally { aiBusy = false; setBusy(btn, false); }
}

/* ---------- lead tools card ---------- */
function renderTools() {
  const conv = cur(); if (!conv) return;
  let card = $('gwaTools');
  if (!card) {
    const anchor = $('leadInterest') && $('leadInterest').closest('.context-card'); if (!anchor) return;
    card = document.createElement('div'); card.id = 'gwaTools'; card.className = 'context-card';
    card.addEventListener('click', toolsClick); card.addEventListener('change', toolsChange);
    anchor.after(card);
  }
  const lead = conv.lead || null, num = digits(conv.customer_phone);
  const stages = lead && lead.status && !STAGES.includes(lead.status) ? [lead.status, ...STAGES] : STAGES;
  const opts = stages.map(s => `<option value="${esc(s)}"${s === ((lead && lead.status) || 'new') ? ' selected' : ''}>${esc(s.charAt(0).toUpperCase() + s.slice(1))}</option>`).join('');
  card.innerHTML = `<div class="card-label">LEAD TOOLS</div>
  <div class="gwa-actions">
    ${num ? `<a class="secondary-btn" href="tel:+${esc(num)}">📞 Call</a>` : ''}
    <button type="button" class="secondary-btn" data-g="pin">📌 Pin chat</button>
    <button type="button" class="secondary-btn" data-g="edit">✎ Edit details</button>
    <button type="button" class="secondary-btn" data-g="fill">⚡ Fill from chat</button>
    <button type="button" class="secondary-btn gwa-ai" data-g="fillai">✦ Fill with AI</button>
    <button type="button" class="secondary-btn" data-g="tags">🏷 Tags</button>
  </div>
  <div id="gwaEdit" class="gwa-edit hidden">
    <label>Name<input id="gName" class="gwa-in" maxlength="80"></label>
    <label>Mobile<input id="gMobile" class="gwa-in" inputmode="tel" maxlength="20"></label>
    <label>City / area<input id="gCity" class="gwa-in" maxlength="80"></label>
    <label>Budget (₹)<input id="gBudget" class="gwa-in" inputmode="numeric" maxlength="12"></label>
    <label>Interest<input id="gInterest" class="gwa-in" maxlength="120"></label>
    <label>Product<input id="gProduct" class="gwa-in" maxlength="120"></label>
    <div class="gwa-edit-actions">
      <button type="button" class="secondary-btn gwa-ai" data-g="editai">✦ AI fill</button>
      <button type="button" class="primary-btn" data-g="save">Save</button>
      <button type="button" class="secondary-btn" data-g="cancel">Cancel</button>
    </div>
  </div>
  ${lead ? `<div class="gwa-lead">
    <label>Stage<select id="gwaStage" class="gwa-in">${opts}</select></label>
    <label class="gwa-hot"><span>Hot lead</span><input type="checkbox" id="gwaHot"${isHot(lead) ? ' checked' : ''}></label>
    <div><label>Next follow-up</label><div class="gwa-fu"><button type="button" data-fu="1">Tomorrow</button><button type="button" data-fu="3">3 days</button><button type="button" data-fu="7">1 week</button><button type="button" data-fu="0">Clear</button></div><small id="gwaFuTxt" class="gwa-fu-txt">${lead.next_follow_up_at ? 'Next follow-up: ' + esc(clock(lead.next_follow_up_at)) : ''}</small></div>
    <div id="gwaNotes" class="gwa-notes${lead.notes ? '' : ' hidden'}">${esc(c(lead.notes).slice(-1500))}</div>
    <label>Add a note<textarea id="gwaNote" class="gwa-in" maxlength="1000" placeholder="Write a note about this customer"></textarea></label>
    <button type="button" class="secondary-btn full" data-g="note">Save note</button>
  </div>` : '<p class="ctx-note">Add this customer to Leads to track stage, hot lead, follow-up and notes.</p>'}`;
  updatePinLabel();
}
function openEdit() {
  const conv = cur(), l = (conv && conv.lead) || {}, f = $('gwaEdit'); if (!f) return;
  if (!f.classList.contains('hidden')) { f.classList.add('hidden'); return; }
  $('gName').value = l.name || conv.customer_name || ''; $('gMobile').value = l.mobile || conv.customer_phone || ''; $('gCity').value = l.city_area || '';
  $('gBudget').value = l.budget != null ? l.budget : ''; $('gInterest').value = l.interest || ''; $('gProduct').value = l.product_service || '';
  f.classList.remove('hidden'); $('gName').focus();
}
async function saveEdit() {
  const conv = cur(); if (!conv) return;
  const val = id => c($(id).value), bud = val('gBudget').replace(/[^0-9.]/g, ''); let mob = val('gMobile');
  const dg = mob.replace(/\D/g, ''); if (dg.length === 10) mob = '+91' + dg;
  const patch = { name: val('gName') || conv.customer_name || 'WhatsApp customer', mobile: mob || null, city_area: val('gCity') || null, interest: val('gInterest') || null, product_service: val('gProduct') || null, budget: bud !== '' ? Number(bud) : null };
  if (bud !== '') patch.budget_currency = 'INR';
  const btn = q('[data-g="save"]'); setBusy(btn, true, 'Saving…');
  try { await ensureLead(); if (await upLead(patch, 'Details saved')) renderTools(); }
  catch (e) { toast(friendly(e), true); }
  finally { setBusy(btn, false); }
}
async function saveNote() {
  const el = $('gwaNote'), t = c(el && el.value), l = cur() && cur().lead; if (!t || !l) return;
  const stamp = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  if (await upLead({ notes: ((l.notes ? l.notes + '\n\n' : '') + `[Note ${stamp}] ${t}`).slice(-12000) }, 'Note saved')) el.value = '';
}
function setFollow(n) {
  if (!n) return upLead({ next_follow_up_at: null }, 'Follow-up cleared');
  const d = new Date(); d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0);
  return upLead({ next_follow_up_at: d.toISOString() }, 'Follow-up set for ' + clock(d));
}
function toolsClick(e) {
  const fu = e.target.closest('[data-fu]'); if (fu) { setFollow(+fu.dataset.fu); return; }
  const b = e.target.closest('[data-g]'); if (!b) return;
  const act = { pin: togglePin, tags: tagSheet, edit: openEdit, fill: () => fillChat(false), fillai: () => fillChat(true), editai: editAi, save: saveEdit, note: saveNote, cancel: () => $('gwaEdit').classList.add('hidden') }[b.dataset.g];
  if (act) act();
}
function toolsChange(e) {
  if (e.target.id === 'gwaStage') upLead({ status: e.target.value }, 'Stage updated');
  else if (e.target.id === 'gwaHot') upLead({ priority: e.target.checked ? 'high' : 'normal' }, e.target.checked ? 'Marked as hot lead' : 'Hot lead removed');
}

/* ---------- pin + tags ---------- */
const metaLocal = () => { try { return JSON.parse(localStorage.getItem('gwa_meta') || '{}') || {}; } catch (_) { return {}; } };
async function loadMeta() {
  const loc = metaLocal(); M.meta = loc; M.cloud = false;
  try {
    const r = await sb.from('whatsapp_chat_meta').select('conversation_id,pinned,tags').eq('client_id', st.clientId);
    if (r.error) return; M.cloud = true;
    const m = {}; (r.data || []).forEach(x => { m[x.conversation_id] = { pinned: !!x.pinned, tags: x.tags || [] }; });
    const up = Object.keys(loc).filter(id => !m[id] && (loc[id].pinned || (loc[id].tags || []).length));
    if (up.length) { await sb.from('whatsapp_chat_meta').upsert(up.map(id => ({ client_id: st.clientId, conversation_id: id, pinned: !!loc[id].pinned, tags: loc[id].tags || [] })), { onConflict: 'client_id,conversation_id' }); up.forEach(id => { m[id] = loc[id]; }); }
    M.meta = m;
  } catch (_) {}
}
async function saveMeta(id) {
  const m = M.meta[id] || { pinned: false, tags: [] };
  try { const l = metaLocal(); l[id] = m; localStorage.setItem('gwa_meta', JSON.stringify(l)); } catch (_) {}
  if (!M.cloud) return;
  const r = await sb.from('whatsapp_chat_meta').upsert({ client_id: st.clientId, conversation_id: id, pinned: !!m.pinned, tags: m.tags || [], updated_at: new Date().toISOString() }, { onConflict: 'client_id,conversation_id' });
  if (r.error) toast('Saved on this phone only: ' + friendly(r.error), true);
}
const metaOf = id => M.meta[id] || (M.meta[id] = { pinned: false, tags: [] });
function updatePinLabel() {
  const x = cur(), p = !!(x && M.meta[x.id] && M.meta[x.id].pinned), t = p ? 'Unpin chat' : 'Pin chat';
  document.querySelectorAll('[data-g="pin"]').forEach(b => { b.textContent = '📌 ' + t; });
  const l = q('.gwa-pl'); if (l) l.textContent = t;
}
function togglePin() {
  const x = cur(); if (!x) return;
  const m = metaOf(x.id); m.pinned = !m.pinned; saveMeta(x.id); decorate(); updatePinLabel();
  toast(m.pinned ? 'Chat pinned to the top.' : 'Chat unpinned.');
}
const allTags = () => { const s = new Set(DEFTAGS); Object.values(M.meta).forEach(m => (m.tags || []).forEach(t => s.add(t))); return [...s]; };
function tagSheet() {
  const x = cur(); if (!x) return;
  const have = metaOf(x.id).tags;
  openSheet('Tags', `<div class="gwa-chips">${allTags().map(t => `<button type="button" data-tg="${esc(t)}" class="${have.includes(t) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div><div class="gwa-addrow"><input id="gwaTagIn" class="gwa-in" maxlength="24" placeholder="New tag"><button class="primary-btn" type="button" data-tgadd>Add</button></div>`);
  M.sheet = 'tags';
}
function toggleTag(t) {
  const x = cur(); if (!x) return;
  const m = metaOf(x.id), i = m.tags.indexOf(t); if (i >= 0) m.tags.splice(i, 1); else m.tags.push(t);
  saveMeta(x.id); tagSheet(); decorate();
}
function addTag(t) {
  const x = cur(); if (!x) return;
  const m = metaOf(x.id); if (!m.tags.includes(t)) m.tags.push(t);
  saveMeta(x.id); tagSheet(); decorate();
}

/* ---------- inbox decoration: pinned first, tag badges, tag filter ---------- */
function decorate() {
  const box = $('list'); if (!box) return;
  const bar = $('gwaBar'), used = [...new Set(Object.values(M.meta).flatMap(m => m.tags || []))];
  if (M.tag && !used.includes(M.tag)) M.tag = '';
  const hasPins = Object.values(M.meta).some(m => m.pinned);
  if (M.pinOnly && !hasPins) M.pinOnly = false;
  if (bar) {
    bar.classList.toggle('hidden', !used.length && !hasPins);
    bar.innerHTML = (hasPins ? `<button type="button" data-pin="1" class="${M.pinOnly ? 'on' : ''}">📌 Pinned</button>` : '') + used.map(t => `<button type="button" data-t="${esc(t)}" class="${M.tag === t ? 'on' : ''}">${esc(t)}</button>`).join('');
  }
  const rows = [...box.querySelectorAll('.conv[data-id]')]; if (!rows.length) return;
  rows.forEach(r => {
    const m = M.meta[r.dataset.id] || {}, tags = m.tags || [];
    r.querySelectorAll('.gwa-bd,.gwa-pin').forEach(x => x.remove());
    const nm = r.querySelector('.conv-top b');
    if (nm && m.pinned) nm.insertAdjacentHTML('afterbegin', '<span class="gwa-pin">📌 </span>');
    const cp = r.querySelector('.conv-copy');
    if (cp && tags.length) cp.insertAdjacentHTML('beforeend', `<div class="gwa-bd">${tags.map(t => `<span class="gwa-tag t${tagCol(t)}">${esc(t)}</span>`).join('')}</div>`);
    r.classList.toggle('hidden', (M.tag && !tags.includes(M.tag)) || (M.pinOnly && !m.pinned));
  });
  rows.filter(r => (M.meta[r.dataset.id] || {}).pinned).reverse().forEach(r => box.prepend(r));
}

/* ---------- templates (/ quick replies + sheet) ---------- */
const tplLocal = () => { try { const t = JSON.parse(localStorage.getItem('gwa_tpl') || 'null'); return Array.isArray(t) ? t : DEFTPL.slice(); } catch (_) { return DEFTPL.slice(); } };
const saveLocalTpl = () => { try { localStorage.setItem('gwa_tpl', JSON.stringify(M.tpl.map(x => x.body))); } catch (_) {} };
async function loadTpls() {
  const loc = tplLocal(); M.tpl = loc.map(b => ({ id: null, body: b })); M.tplCloud = false;
  try {
    const r = await sb.from('whatsapp_templates').select('id,body').eq('client_id', st.clientId).order('created_at', { ascending: true });
    if (r.error) return; M.tplCloud = true;
    if (r.data.length) { M.tpl = r.data; saveLocalTpl(); return; }
    const flag = 'gwa_tpl_seeded_' + st.clientId; if (localStorage.getItem(flag)) { M.tpl = []; return; }
    const ins = await sb.from('whatsapp_templates').insert(loc.map(b => ({ client_id: st.clientId, body: b }))).select('id,body');
    if (!ins.error) { M.tpl = ins.data; localStorage.setItem(flag, '1'); }
  } catch (_) {}
}
async function addTpl(v) {
  if (M.tplCloud) {
    const r = await sb.from('whatsapp_templates').insert({ client_id: st.clientId, body: v.slice(0, 1000) }).select('id,body').single();
    if (r.error) return toast(friendly(r.error), true); M.tpl.push(r.data);
  } else M.tpl.push({ id: null, body: v.slice(0, 1000) });
  saveLocalTpl(); tplSheet();
}
async function delTpl(i) {
  const t = M.tpl[i]; if (!t) return;
  if (M.tplCloud && t.id) { const r = await sb.from('whatsapp_templates').delete().eq('id', t.id).eq('client_id', st.clientId); if (r.error) return toast(friendly(r.error), true); }
  M.tpl.splice(i, 1); saveLocalTpl(); tplSheet();
}
function useTpl(i) {
  const t = M.tpl[i]; if (!t) return;
  closeSheet();
  const inp = $('input');
  if (!cur() || inp.disabled) return toast('Open an open chat to use a template.', true);
  inp.value = fillName(t.body); inp.dispatchEvent(new Event('input')); inp.focus();
}
function tplSheet() {
  openSheet('Templates', `${M.tpl.map((x, i) => `<div class="gwa-tpl"><span data-use="${i}">${esc(x.body)}</span><button type="button" data-del="${i}" aria-label="Delete template">✕</button></div>`).join('') || '<p class="ctx-note">No templates yet.</p>'}<div class="gwa-addrow"><input id="gwaTplIn" class="gwa-in" maxlength="1000" placeholder="New template (use {name})"><button class="primary-btn" type="button" data-tpladd>Save</button></div>`);
  M.sheet = 'tpl';
}
function qrShow() {
  const box = $('gwaQr'), v = $('input').value; if (!box) return;
  if (v.charAt(0) !== '/') { box.classList.remove('on'); return; }
  const f = v.slice(1).toLowerCase(), t = M.tpl.map((x, i) => [x.body, i]).filter(x => x[0].toLowerCase().includes(f)).slice(0, 6);
  box.innerHTML = t.map(x => `<button type="button" data-q="${x[1]}">${esc(x[0])}</button>`).join(''); box.classList.toggle('on', t.length > 0);
}

/* ---------- sheet (tags / templates) ---------- */
function openSheet(title, html) {
  let m = $('gwaSheet');
  if (!m) {
    m = document.createElement('div'); m.id = 'gwaSheet'; m.className = 'modal hidden'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="modal-card"><button class="modal-close" data-x type="button" aria-label="Close">×</button><h2 id="gwaSheetT"></h2><div id="gwaSheetB"></div></div>';
    document.body.appendChild(m); m.addEventListener('click', sheetClick);
    m.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.isComposing) return;
      if (e.target.id === 'gwaTagIn') { e.preventDefault(); const v = c(e.target.value).slice(0, 24); if (v) addTag(v); }
      else if (e.target.id === 'gwaTplIn') { e.preventDefault(); const v = c(e.target.value); if (v) addTpl(v); }
    });
  }
  $('gwaSheetT').textContent = title; $('gwaSheetB').innerHTML = html; m.classList.remove('hidden');
}
function closeSheet() { const m = $('gwaSheet'); if (m) m.classList.add('hidden'); }
function sheetClick(e) {
  if (e.target.id === 'gwaSheet' || e.target.closest('[data-x]')) return closeSheet();
  const t = e.target.closest('[data-tg]'); if (t) return toggleTag(t.dataset.tg);
  if (e.target.closest('[data-tgadd]')) { const v = c($('gwaTagIn').value).slice(0, 24); if (v) addTag(v); return; }
  const u = e.target.closest('[data-use]'); if (u) return useTpl(+u.dataset.use);
  const d = e.target.closest('[data-del]'); if (d) return delTpl(+d.dataset.del);
  if (e.target.closest('[data-tpladd]')) { const v = c($('gwaTplIn').value); if (v) addTpl(v); }
}

/* ---------- wiring ---------- */
let inited = false;
async function init() {
  if (inited) return; inited = true;
  const comp = $('composer'), row = comp && q('.input-row', comp);
  if (comp) { const w = document.createElement('div'); w.id = 'gwaWin'; w.className = 'gwa-win hidden'; w.setAttribute('role', 'status'); comp.prepend(w); }
  if (row) { const r = document.createElement('div'); r.id = 'gwaQr'; r.className = 'gwa-qr'; row.before(r); r.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { r.classList.remove('on'); useTpl(+b.dataset.q); } }); }
  const sug = $('suggest');
  if (sug) { const b = document.createElement('button'); b.id = 'gwaTplBtn'; b.type = 'button'; b.className = 'chip'; b.textContent = 'Templates'; b.onclick = tplSheet; sug.after(b); }
  const f = q('.filters');
  if (f) { const bar = document.createElement('div'); bar.id = 'gwaBar'; bar.className = 'gwa-bar hidden'; f.after(bar);
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.pin) M.pinOnly = !M.pinOnly; else M.tag = M.tag === b.dataset.t ? '' : b.dataset.t; decorate(); }); }
  const cm = $('chatMenu');
  if (cm) {
    cm.insertAdjacentHTML('afterbegin', '<button type="button" role="menuitem" data-act="gwa-pin"><span>📌</span><span class="gwa-pl">Pin chat</span></button><button type="button" role="menuitem" data-act="gwa-tags"><span>🏷</span>Tags</button><button type="button" role="menuitem" data-act="gwa-tpl"><span>💬</span>Templates</button>');
    cm.addEventListener('click', e => { const b = e.target.closest('button[data-act^="gwa-"]'); if (!b) return; const a = b.dataset.act; if (a === 'gwa-pin') togglePin(); else if (a === 'gwa-tags') tagSheet(); else tplSheet(); });
    const mb = $('moreBtn'); if (mb) mb.addEventListener('click', updatePinLabel);
  }
  $('input').addEventListener('input', qrShow);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  setInterval(() => { if (cur()) winBar(); }, 30000);
  await Promise.all([loadMeta(), loadTpls()]);
  decorate(); updatePinLabel();
}
document.addEventListener('gwa:ready', init);
document.addEventListener('gwa:list', decorate);
document.addEventListener('gwa:messages', winBar);
document.addEventListener('gwa:header', () => { winBar(); updatePinLabel(); const x = cur(); if (x) paintIg(x); });
document.addEventListener('gwa:context', () => { renderTools(); const x = cur(); if (x) paintIg(x); });
if (st.booted) init();
})();
