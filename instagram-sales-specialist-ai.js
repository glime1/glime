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

async function sync(q, conv) {
  const keys = ['customer_name', 'occasion', 'purpose', 'for_whom', 'product', 'product_service', 'quantity', 'preferred_date', 'city_area', 'mobile', 'whatsapp', 'address', 'budget'];
  if (!keys.some(k => c(q[k]))) return null;
  let lead = G.leadOf(conv);
  const mob = phone(q.mobile), wa = phone(q.whatsapp) || mob, bud = c(q.budget) ? Number(String(q.budget).replace(/,/g, '')) : NaN, f = {};
  if (c(q.customer_name)) f.name = c(q.customer_name);
  if (mob) f.mobile = mob; if (wa) f.whatsapp = wa; if (c(q.city_area)) f.city_area = c(q.city_area);
  const interest = c(q.occasion) || c(q.purpose); if (interest) f.interest = interest;
  const prod = c(q.product) || c(q.product_service); if (prod) f.product_service = prod;
  if (Number.isFinite(bud)) { f.budget = bud; f.budget_currency = c(q.budget_currency) || 'INR'; }
  const notes = [['Occasion / purpose', interest], ['For whom', q.for_whom], ['Quantity', q.quantity], ['Preferred date', q.preferred_date], ['City / area', q.city_area],
    ['Delivery needed', q.delivery_needed ? 'yes' : ''], ['Address', q.address], ['WhatsApp requested', q.wants_whatsapp ? 'yes' : '']]
    .filter(x => c(x[1])).map(x => `${x[0]}: ${c(x[1])}`).join('\n');
  if (notes) f.notes = ((c(lead?.notes) ? c(lead.notes) + '\n\n' : '') + `[Instagram Sales ${new Date().toLocaleString()}]\n` + notes).slice(-12000);
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
  busy = true; $('suggest').disabled = true;
  try {
    const ctx = await catalog(), lead = G.leadOf(conv);
    const recent = S.msgs.slice(-16).map(m => `${m.direction === 'inbound' ? 'Customer' : 'Business'}: ${c(m.text_body)}`).filter(x => x.length > 12).join('\n');
    const prompt = ['You are GLIME Instagram Sales Specialist. Your role is natural sales qualification, not just answering prices.', '',
      'Business:', JSON.stringify(ctx.business || {}), '', 'Verified business knowledge:', JSON.stringify((ctx.knowledge || []).slice(0, 20)), '',
      'Verified offer catalog:', JSON.stringify((ctx.catalog || []).slice(0, 20)), '', 'Existing lead:', JSON.stringify(lead || {}), '',
      'Recent conversation:', recent || 'No messages available.', '', 'Return JSON only in this shape:',
      '{"reply":"...","qualification":{"customer_name":"","occasion":"","purpose":"","for_whom":"","product":"","product_service":"","quantity":"","preferred_date":"","city_area":"","mobile":"","whatsapp":"","address":"","budget":"","budget_currency":"","delivery_needed":false,"wants_whatsapp":false}}', '', 'Rules:',
      'Only capture customer-stated facts or already verified lead facts. Never infer.',
      'Do not ask again for details already known. Be warm and human; ask only the next one or two useful questions.',
      'Discover what the customer needs, who it is for, occasion/purpose, product/service, quantity and timing.',
      'Do not ask for a full address at the start. Ask city/area first when delivery matters; ask the detailed address only at genuine order/delivery stage.',
      'When the customer shows real purchase interest, offer continuing on WhatsApp and ask for the WhatsApp number naturally.',
      'Never say a WhatsApp handoff already happened unless the system completed it.',
      'Never promise home delivery unless delivery coverage is verified; otherwise say you will confirm availability for their area.',
      'Never invent price, discount, feature, availability, guarantee, policy, delivery promise or timeline.',
      'Match the customer language and tone. If the customer writes Hindi in English letters, reply in English letters too and never use Devanagari script. reply must contain only the customer-facing message; do not mention AI, JSON or rules.'].join('\n');
    const r = await fetch(`${U}/functions/v1/glime-ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'chat', sessionToken: tok || null, message: prompt }) });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'GLIME AI unavailable.');
    if (d.sessionToken) { tok = d.sessionToken; sessionStorage.setItem('glime_instagram_ai_session', tok); }
    const raw = d.reply || d.message || d.output || d.content || '', p = parse(raw) || {};
    const reply = c(p.reply || raw), q = p.qualification && typeof p.qualification === 'object' ? p.qualification : {};
    if (!reply) throw new Error('No sales reply returned.');
    let saved = lead; const h = JSON.stringify(q);
    if (h !== lastHash) { saved = (await sync(q, conv)) || lead; lastHash = h; }
    $('sugText').textContent = reply; $('sug').classList.remove('hide');
    G.fill(); if (q.wants_whatsapp || q.whatsapp || q.mobile) handoff(saved, q); G.reload();
  } catch (e) { console.error('[GLIME IG AI]', e); toast(e.message || 'Suggestion failed.', true); }
  finally { busy = false; $('suggest').disabled = false; }
}

$('suggest').onclick = suggest; $('sugRef').onclick = suggest;
document.addEventListener('click', e => { if (e.target.closest('.row-i')) { lastHash = ''; $('dWa').innerHTML = ''; } });
})();
