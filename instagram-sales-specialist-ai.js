/* GLIME — Instagram AI sales add-on: suggest reply + natural lead qualification + WhatsApp handoff.
   Needs instagram-sales-specialist.js to be loaded first (uses window.GIG). */
(() => {
'use strict';
const G = window.GIG; if (!G) return;
const { db, S, $, toast } = G;
const U = 'https://ufoulgbiqgjriwapuopc.supabase.co';
const K = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
const c = v => String(v ?? '').trim();
let busy = false, lastHash = '', tok = sessionStorage.getItem('glime_instagram_ai_session') || '';

const phone = v => { const d = c(v).replace(/\D/g, ''); return d.length === 10 && /^[6-9]/.test(d) ? '+91' + d : d.length === 12 && d.startsWith('91') ? '+' + d : d; };
const parse = t => { t = c(t); try { return JSON.parse(t); } catch {} const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) try { return JSON.parse(t.slice(a, b + 1)); } catch {} return null; };

async function catalog() {
  const { data } = await db.auth.getSession(); if (!data.session) throw new Error('Please log in again.');
  const r = await fetch(`${U}/functions/v1/catalog-context`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: K, Authorization: 'Bearer ' + data.session.access_token }, body: '{}' });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'catalog-context ' + r.status); return j;
}

async function sync(q, conv, fillOnly) {
  const keys = ['customer_name', 'interest', 'occasion', 'purpose', 'for_whom', 'product', 'product_service', 'quantity', 'preferred_date', 'city_area', 'mobile', 'whatsapp', 'address', 'budget'];
  if (!keys.some(k => c(q[k]))) return null;
  let lead = G.leadOf(conv);
  const mob = phone(q.mobile), wa = phone(q.whatsapp) || mob, bud = c(q.budget) ? Number(String(q.budget).replace(/,/g, '')) : NaN, f = {};
  if (c(q.customer_name)) f.name = c(q.customer_name);
  if (mob) f.mobile = mob; if (wa) f.whatsapp = wa; if (c(q.city_area)) f.city_area = c(q.city_area);
  const interest = c(q.interest) || c(q.occasion) || c(q.purpose); if (interest) f.interest = interest;
  const prod = c(q.product) || c(q.product_service); if (prod) f.product_service = prod;
  if (Number.isFinite(bud)) { f.budget = bud; f.budget_currency = c(q.budget_currency) || 'INR'; }
  const notes = [['Interest / purpose', interest], ['For whom', q.for_whom], ['Quantity', q.quantity], ['Preferred date', q.preferred_date], ['City / area', q.city_area],
    ['Delivery needed', q.delivery_needed ? 'yes' : ''], ['Address', q.address], ['WhatsApp requested', q.wants_whatsapp ? 'yes' : '']]
    .filter(x => c(x[1])).map(x => `${x[0]}: ${c(x[1])}`).join('\n');
  if (notes && !(lead && c(lead.notes).includes(notes))) f.notes = ((c(lead?.notes) ? c(lead.notes) + '\n\n' : '') + `[Instagram Sales ${new Date().toLocaleString()}]\n` + notes).slice(-12000);
  if (fillOnly && lead) {
    const empty = k => lead[k] == null || c(lead[k]) === '' || (k === 'name' && c(lead[k]) === c(conv.username));
    ['name', 'mobile', 'whatsapp', 'city_area', 'interest', 'product_service'].forEach(k => { if (!empty(k)) delete f[k]; });
    if (lead.budget != null) { delete f.budget; delete f.budget_currency; }
  }
  f.updated_at = new Date().toISOString();
  if (!lead) {
    const r = await db.from('leads').insert({ client_id: S.cid, name: f.name || conv.username || 'Instagram ' + conv.instagram_user_id, source: 'instagram',
      source_ref: conv.instagram_user_id, instagram_user_id: conv.instagram_user_id, status: 'new', priority: 'normal', ...f }).select('*').single();
    if (r.error) throw r.error; lead = r.data;
  } else {
    const r = await db.from('leads').update(f).eq('id', lead.id).eq('client_id', S.cid).select('*').single();
    if (r.error) throw r.error; lead = r.data;
  }
  S.leads[lead.id] = lead; S.byIg[conv.instagram_user_id] = lead;
  try { await db.from('lead_timeline').insert({ client_id: S.cid, lead_id: lead.id, event_type: 'sales_qualification', title: 'Instagram sales qualification updated',
    description: notes || 'Customer qualification updated.', source: 'instagram_sales_specialist', metadata: { channel: 'instagram', instagram_user_id: conv.instagram_user_id, qualification: q } }); } catch {}
  return lead;
}

async function waConversation(lead, number) {
  const byLead = await db.from('whatsapp_conversations').select('id').eq('client_id', S.cid).eq('lead_id', lead.id).limit(1).maybeSingle();
  if (byLead.data) return true;
  const n = phone(number), d = n.replace(/\D/g, ''), v = new Set([n, d]); if (d.length === 12 && d.startsWith('91')) v.add(d.slice(2)); else if (d.length === 10) v.add('91' + d);
  const r = await db.from('whatsapp_conversations').select('id').eq('client_id', S.cid).in('customer_phone', [...v]).limit(1).maybeSingle();
  return !!r.data;
}

function handoff(lead, q) {
  const host = $('dWa'); host.innerHTML = ''; if (!host) return;
  const number = phone(q.whatsapp || q.mobile || lead?.whatsapp || lead?.mobile); if (!number && !q.wants_whatsapp) return;
  const box = document.createElement('div'); box.className = 'notes';
  box.innerHTML = '<small>WhatsApp continuation</small><div style="font-size:13px;margin-top:4px">' + (number ? 'Customer number saved in the lead. Continue on WhatsApp once the customer chooses that channel.' : 'Ask for the WhatsApp number naturally when the customer wants to continue there.') + '</div>';
  if (number && lead?.id) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn full'; b.textContent = 'Open WhatsApp Sales';
    b.onclick = async () => { b.disabled = true; try {
      if (await waConversation(lead, number)) location.href = `whatsapp-sales-specialist.html?lead=${encodeURIComponent(lead.id)}&phone=${encodeURIComponent(number)}`;
      else toast('There is no WhatsApp conversation with this customer yet. Start the chat on WhatsApp first.', true);
    } catch (e) { toast(e.message || 'WhatsApp check failed.', true); } finally { b.disabled = false; } };
    box.appendChild(b);
  }
  host.appendChild(box);
}

async function suggest() {
  if (busy) return; const conv = S.sel; if (!conv) { toast('Open a chat first.', true); return; }
  const last = [...S.msgs].reverse().find(m => m.direction === 'inbound' && c(m.text_body));
  if (!last) { toast('There is no customer message to reply to yet.', true); return; }
  busy = true; $('suggest').disabled = true;
  try {
    /* Same AI brain, knowledge and offers that answer your customers automatically. */
    const { data } = await db.auth.getSession(); if (!data.session) throw new Error('Please log in again.');
    const r = await fetch(`${U}/functions/v1/client-ai-runtime`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: K, Authorization: 'Bearer ' + data.session.access_token },
      body: JSON.stringify({ channel: 'instagram', conversation_id: conv.id, message: c(last.text_body) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || d.code || 'AI is unavailable right now.');
    const reply = c(d.reply); if (!reply) throw new Error('AI did not return a reply.');
    $('sugText').textContent = reply; $('sug').classList.remove('hide');
    await extract(conv, true);
    G.fill(); handoff(G.leadOf(conv), {});
  } catch (e) { console.error('[GLIME IG AI]', e); toast(/failed to fetch|networkerror|load failed/i.test(e.message || '') ? 'Ask AI is blocked by the server (CORS). One backend change is still needed.' : (e.message || 'Suggestion failed.'), true); }
  finally { busy = false; $('suggest').disabled = false; }
}

/* Read the chat and fill empty customer details (never overwrites what you typed).
   Rule based: no AI call, no cost, works every time. */
let catCache = null;
async function catNames() {
  if (catCache) return catCache;
  try { const ctx = await catalog(); catCache = (ctx.catalog || []).map(x => c(x.name || x.title || x.product_name || x.service_name || x.offer_name)).filter(x => x.length > 1); }
  catch { catCache = []; }
  return catCache;
}
const CITY_ALIAS = { ahemdabad: 'Ahmedabad', ahmadabad: 'Ahmedabad', ahmedabad: 'Ahmedabad', amdavad: 'Ahmedabad', bombay: 'Mumbai', baroda: 'Vadodara', bangalore: 'Bengaluru', bengaluru: 'Bengaluru', calcutta: 'Kolkata' };
const titleCase = s => s.replace(/\b([a-z])/gi, (m, ch) => ch.toUpperCase()).replace(/\B([A-Z]+)/g, x => x.toLowerCase());
function cityFrom(msgs) {
  const NOT = /^(the|my|a|an|here|home|india|office|shop|work|college|school|town|city|area)$/i;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = String(msgs[i] || '').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
    let m = t.match(/(?:^|\s)(?:me|main|mai|mein|hum|i am|i'm)?\s*([a-z]{3,}(?: [a-z]{3,})?) se (?:hu|hun|hoon|hai|hain)\b\s*(.{0,40})/i)
      || t.match(/(?:i am from|i'm from|i live in|living in|from)\s+([a-z]{3,}(?: [a-z]{3,})?)()/i)
      || t.match(/([a-z]{3,}) (?:mein|me) (?:rehta|rehti|rahta|rahti|rehte)\b()/i)
      || t.match(/(?:city|location|area|address)\s*(?:is|:|-)\s*([a-z]{3,}(?: [a-z]{3,})?)()/i);
    if (!m) continue;
    const words = m[1].trim().split(' ').filter(w => !NOT.test(w)); if (!words.length) continue;
    const first = words[0].toLowerCase(), city = CITY_ALIAS[first] || titleCase(words.join(' '));
    const rest = String(m[2] || '').trim().split(' ').slice(0, 4).join(' ').replace(/[^A-Za-z0-9 ]/g, '').trim();
    return rest && !/^(hai|hu|hun|hoon|aur|and|ok)$/i.test(rest) ? city + ', ' + titleCase(rest) : city;
  }
  return '';
}
function rulesExtract(msgs, names) {
  const txt = m => c(m.text_body), inn = msgs.filter(m => m.direction === 'inbound').map(txt).filter(Boolean), all = msgs.map(txt).filter(Boolean);
  // product: catalog names or *bold* names the business used, most mentioned (latest wins a tie)
  const score = {}; const add = (n, i) => { const k = n.toLowerCase(); (score[k] = score[k] || { n, s: 0, at: 0 }); score[k].s++; score[k].at = i; };
  all.forEach((t, i) => { const low = t.toLowerCase(); (names || []).forEach(n => { if (low.includes(n.toLowerCase())) add(n, i); });
    if (msgs[i] && msgs[i].direction !== 'inbound') for (const m of t.matchAll(/\*([^*\n]{2,40})\*/g)) add(c(m[1]), i); });
  const best = Object.values(score).sort((x, y) => y.s - x.s || y.at - x.at)[0], product = best ? best.n : '';
  // interest from what the customer said
  const t = inn.join(' \n ').toLowerCase(); let act = '';
  if (/kharid|khareed|buy|purchase|order|lena hai|lene hai|book|खरीद|ऑर्डर/.test(t)) act = 'Wants to buy';
  else if (/price|cost|rate|kitna|kitne|charge|fees|कीमत|प्राइस|कितना/.test(t)) act = 'Asked the price';
  else if (/demo|trial/.test(t)) act = 'Wants a demo';
  else if (/detail|info|jaankari|जानकारी/.test(t)) act = 'Asked for details';
  else if (/deliver/.test(t)) act = 'Asked about delivery';
  const interest = act ? act + (product ? (act === 'Asked the price' ? ' of ' : ' ') + product : '') : '';
  const q = { interest, product };
  const raw = inn.join(' \n '), mob = raw.replace(/[\s-]/g, '').match(/(?<!\d)(?:\+?91)?([6-9]\d{9})(?!\d)/); if (mob) q.mobile = '+91' + mob[1];
  const nm = raw.match(/(?:my name is|mera naam|mera name|name is)\s+([A-Za-z][A-Za-z.]{1,20}(?:\s[A-Za-z][A-Za-z.]{1,20})?)/i);
  if (nm) q.customer_name = nm[1].replace(/\s+(hai|he|hu|hoon|h|and|aur)$/i, '').replace(/\b\w/g, x => x.toUpperCase());
  const city = cityFrom(inn); if (city) q.city_area = city;
  const bd = t.match(/budget[^0-9]{0,15}(\d[\d,]*)/); if (bd) q.budget = bd[1].replace(/,/g, '');
  return q;
}
async function extract(conv, silent) {
  if (!conv) return; if (!silent) toast('Reading this chat…');
  try {
    if (!S.msgs.length) { if (!silent) toast('No messages to read yet.', true); return; }
    const q = rulesExtract(S.msgs, await catNames());
    const saved = Object.values(q).some(v => c(v)) ? await sync(q, conv, true) : null;
    G.fill(); G.reload();
    if (!silent) toast(saved ? 'Details filled from the chat.' : 'Nothing new found in this chat.');
  } catch (e) { console.error('[GLIME IG fill]', e); if (!silent) toast(e.message || 'Could not read the chat.', true); }
}
G.autoFill = () => {
  const conv = S.sel; if (!conv || busy || !S.msgs.some(m => m.direction === 'inbound')) return;
  const key = 'gig_ex_' + conv.id, sig = String(S.msgs.length);
  try { if (sessionStorage.getItem(key) === sig) return; sessionStorage.setItem(key, sig); } catch {}
  const l = G.leadOf(conv); if (l && c(l.interest) && c(l.product_service)) return; extract(conv, true);
};
$('dFill').onclick = () => extract(S.sel, false);

$('suggest').onclick = suggest; $('sugRef').onclick = suggest;
document.addEventListener('click', e => { if (e.target.closest('.row-i')) { lastHash = ''; $('dWa').innerHTML = ''; } });
})();
