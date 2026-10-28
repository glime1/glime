(() => {
"use strict";

const SB_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
const SB_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
const db = window.supabase.createClient(SB_URL, SB_KEY);
window.supabaseClient = db;

const S = {
  clientId: null, businessName: "", customers: [], orders: [], leads: [], wa: [], ig: [], fu: [],
  meta: new Map(), sel: null, tab: "overview", range: 7,
  f: { q: "", seg: "all", tag: "all", status: "all", minOrders: 0, minSpent: 0, sort: "recent" }
};
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const money = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const num = (v) => Number(v || 0).toLocaleString("en-IN");
const DAY = 864e5;

/* ---------- icons ---------- */
const P = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  insta: '<rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>',
  msg: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0z"/><line x1="12" y1="18" x2="12" y2="22"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  chev: '<polyline points="6 9 12 15 18 9"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  dots: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
  rupee: '<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4 4 0 0 0 0-8"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>'
};
const ic = (n, extra = "") => `<svg class="i ${extra}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;

/* ---------- helpers ---------- */
const amt = (o) => Number(o.total_amount ?? o.price_at_order ?? 0) || 0;
const BAD = new Set(["cancelled", "draft", "refunded", "returned", "cancel_requested"]);
const valid = (o) => !BAD.has(String(o.status || "").toLowerCase());
const ts = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };
const fmtDate = (v) => { const t = ts(v); return t ? new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"; };
const rel = (v) => {
  const t = ts(v); if (!t) return "—";
  const d = Date.now() - t, m = Math.floor(d / 6e4);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const dd = Math.floor(h / 24);
  if (dd < 30) return dd + (dd === 1 ? " day ago" : " days ago");
  return fmtDate(v);
};
const initials = (n) => String(n || "C").trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "C";
const COLORS = ["#1f9d6e", "#3b6fd8", "#a35ad6", "#d9772b", "#c2467a", "#2b8fb3", "#7d8f1f", "#cc4b4b"];
const avColor = (n) => { let h = 0; for (const c of String(n || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const avatar = (n, cls = "") => `<span class="av ${cls}" style="background:linear-gradient(135deg,${avColor(n)},#0b141d)">${esc(initials(n))}</span>`;
const waNum = (m) => { const d = String(m || "").replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };
const normSrc = (v) => {
  const s = String(v || "").toLowerCase();
  if (!s || s === "other") return "";
  if (s.includes("insta")) return "Instagram";
  if (s.includes("whats")) return "WhatsApp";
  if (s.includes("web") || s.includes("look") || s.includes("site")) return "Website";
  if (s.includes("offline") || s.includes("manual") || s.includes("walk")) return "Offline";
  return s.charAt(0).toUpperCase() + s.slice(1);
};
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }
const pillFor = (v) => {
  const s = String(v || "").toLowerCase();
  if (["delivered", "completed", "paid", "confirmed", "fulfilled"].includes(s)) return "p-green";
  if (["shipped", "out_for_delivery", "in_transit", "ready_to_ship"].includes(s)) return "p-blue";
  if (["processing", "pending", "new", "pending_confirmation", "payment_pending", "partially_paid", "on_hold"].includes(s)) return "p-amber";
  if (["failed", "payment_failed", "cancelled", "refunded", "returned", "partially_refunded"].includes(s)) return "p-red";
  return "p-grey";
};
const label = (v) => { const s = String(v || "—").replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };
const pill = (v) => `<span class="pill ${pillFor(v)}">${esc(label(v))}</span>`;
const orderNo = (o) => "#" + (o.order_number || String(o.id).slice(-4).toUpperCase());

/* ---------- data ---------- */
async function fetchAll(table, select, clientId, optional) {
  const rows = []; let from = 0; const size = 1000;
  try {
    for (;;) {
      const { data, error } = await db.from(table).select(select).eq("client_id", clientId).range(from, from + size - 1);
      if (error) throw error;
      if (data?.length) rows.push(...data);
      if (!data || data.length < size) break;
      from += size;
    }
  } catch (e) {
    console.warn("[Customers] " + table, e);
    if (!optional) throw e;
    return [];
  }
  return rows;
}

async function resolveClient() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { location.href = "login.html"; throw new Error("Please sign in again."); }
  const { data, error } = await db.from("client_data").select("client_id,business_name,client_name,name,full_name").eq("auth_user_id", user.id).maybeSingle();
  if (error || !data?.client_id) throw new Error("Client workspace could not be resolved.");
  S.clientId = data.client_id;
  S.businessName = data.business_name || data.client_name || data.full_name || data.name || "Business";
  if ($("businessName")) $("businessName").textContent = S.businessName;
  if ($("clientCode")) $("clientCode").textContent = data.client_id;
  if ($("meAv")) $("meAv").textContent = initials(S.businessName);
  if ($("topAv")) $("topAv").textContent = initials(S.businessName);
}

async function loadAll() {
  const c = S.clientId;
  const [customers, orders, leads, wa, ig, fu] = await Promise.all([
    fetchAll("customers", "id,client_id,name,mobile,house_no,village_locality,district,state,pincode,landmark,created_at,updated_at", c),
    fetchAll("orders", "id,customer_id,lead_id,order_number,product_title,quantity,price_at_order,total_amount,paid_amount,status,payment_status,fulfillment_status,source_channel,customer_note,internal_note,created_at,updated_at", c),
    fetchAll("leads", "id,customer_id,name,mobile,email,source,status,notes,created_at", c, true),
    fetchAll("whatsapp_conversations", "id,customer_id,lead_id,customer_phone,last_message_at,last_message_preview,status,created_at", c, true),
    fetchAll("instagram_conversations", "id,customer_id,lead_id,username,last_message_at,status,created_at", c, true),
    fetchAll("follow_up_cases", "id,lead_id,status,channel,trigger_source,created_at", c, true)
  ]);
  Object.assign(S, { customers, orders, leads, wa, ig, fu });
}

/* ---------- metrics ---------- */
function buildMeta() {
  const m = new Map();
  for (const c of S.customers) m.set(c.id, { c, orders: [], all: [], spent: 0, first: 0, last: 0, leads: [], wa: [], ig: [], fu: [], tags: [], status: "Active", source: "", email: "", repeatAt: 0 });
  const leadOwner = new Map();
  for (const l of S.leads) { const x = m.get(l.customer_id); if (x) { x.leads.push(l); leadOwner.set(l.id, l.customer_id); } }
  for (const o of S.orders) {
    const x = m.get(o.customer_id); if (!x) continue;
    x.all.push(o);
    if (valid(o)) { x.orders.push(o); x.spent += amt(o); }
  }
  for (const w of S.wa) { const x = m.get(w.customer_id) || m.get(leadOwner.get(w.lead_id)); if (x) x.wa.push(w); }
  for (const g of S.ig) { const x = m.get(g.customer_id) || m.get(leadOwner.get(g.lead_id)); if (x) x.ig.push(g); }
  for (const f of S.fu) { const x = m.get(leadOwner.get(f.lead_id)); if (x) x.fu.push(f); }
  const now = Date.now();
  for (const x of m.values()) {
    x.orders.sort((a, b) => ts(a.created_at) - ts(b.created_at));
    x.all.sort((a, b) => ts(b.created_at) - ts(a.created_at));
    x.first = ts(x.orders[0]?.created_at); x.last = ts(x.orders[x.orders.length - 1]?.created_at);
    x.repeatAt = ts(x.orders[1]?.created_at);
    x.email = x.leads.find((l) => l.email)?.email || "";
    const ls = x.leads.map((l) => normSrc(l.source)).find(Boolean);
    const os = x.orders.map((o) => normSrc(o.source_channel)).find(Boolean);
    x.source = ls || os || (x.ig.length ? "Instagram" : x.wa.length ? "WhatsApp" : "Offline");
    const lastAct = Math.max(x.last, ts(x.c.created_at), ...x.wa.map((w) => ts(w.last_message_at)), ...x.ig.map((g) => ts(g.last_message_at)));
    x.activity = lastAct;
    const dormant = (x.last ? now - x.last : now - ts(x.c.created_at)) > 60 * DAY;
    x.status = dormant ? "Inactive" : "Active";
  }
  const buyers = [...m.values()].filter((x) => x.spent > 0).sort((a, b) => b.spent - a.spent);
  const vipN = Math.max(1, Math.ceil(buyers.length * 0.1)), hvN = Math.max(1, Math.ceil(buyers.length * 0.25));
  buyers.forEach((x, i) => { x.rank = i + 1; x.vip = i < vipN; x.hv = i < hvN; });
  S.hvCut = buyers[hvN - 1]?.spent || 0;
  for (const x of m.values()) {
    const t = [];
    if (x.vip) t.push(["VIP", "t-vip"]);
    if (x.orders.length >= 2) t.push(["Repeat", "t-repeat"]);
    if (x.hv) t.push(["High Value", "t-hv"]);
    if (now - ts(x.c.created_at) <= 30 * DAY) t.push(["New", "t-new"]);
    if (x.status === "Inactive") t.push(["Inactive", "t-inactive"]);
    if (x.source) t.push([x.source, "t-src"]);
    x.tags = t;
  }
  S.meta = m;
}
const M = (id) => S.meta.get(id);
const hasTag = (x, t) => x.tags.some((a) => a[0] === t);

/* ---------- stats ---------- */
function series(items, days) {
  const now = Date.now(), cur0 = now - days * DAY, prev0 = cur0 - days * DAY;
  let cur = 0, prev = 0; const b = [0, 0, 0, 0, 0];
  for (const it of items) {
    if (it.t >= cur0 && it.t <= now) { cur += it.v; const i = Math.min(4, Math.floor(((it.t - cur0) / (days * DAY)) * 5)); b[i] += it.v; }
    else if (it.t >= prev0 && it.t < cur0) prev += it.v;
  }
  return { cur, prev, b };
}
function renderStats() {
  const d = S.range, cs = S.customers, vo = S.orders.filter(valid), rep = [...S.meta.values()].filter((x) => x.orders.length >= 2);
  const defs = [
    { lb: "Total Customers", vl: num(cs.length), ico: "users", cl: "c-green", s: series(cs.map((c) => ({ t: ts(c.created_at), v: 1 })), d), sub: `vs last ${d} days`, unit: "added" },
    { lb: "Total Orders", vl: num(vo.length), ico: "cart", cl: "c-blue", s: series(vo.map((o) => ({ t: ts(o.created_at), v: 1 })), d), sub: `vs last ${d} days`, unit: "orders" },
    { lb: "Purchase Value", vl: money(vo.reduce((a, o) => a + amt(o), 0)), ico: "rupee", cl: "c-amber", s: series(vo.map((o) => ({ t: ts(o.created_at), v: amt(o) })), d), sub: `vs last ${d} days`, unit: "₹" },
    { lb: "Repeat Customers", vl: num(rep.length), ico: "repeat", cl: "c-purple", s: series(rep.map((x) => ({ t: x.repeatAt, v: 1 })), d), sub: cs.length ? Math.round((rep.length / cs.length) * 100) + "% of total" : "—", unit: "new repeat", nopct: true },
    { lb: "New Customers", vl: num(series(cs.map((c) => ({ t: ts(c.created_at), v: 1 })), d).cur), ico: "userplus", cl: "c-green", s: series(cs.map((c) => ({ t: ts(c.created_at), v: 1 })), d), sub: `last ${d} days`, unit: "", nopct: true }
  ];
  $("stats").innerHTML = defs.map((x) => {
    const { cur, prev, b } = x.s; const mx = Math.max(...b, 1);
    let tr;
    if (x.nopct) tr = `<span>${esc(x.sub)}</span>`;
    else if (prev > 0) { const p = Math.round(((cur - prev) / prev) * 100); tr = `<b class="${p >= 0 ? "up" : "down"}">${p >= 0 ? "↑" : "↓"} ${Math.abs(p)}%</b> ${esc(x.sub)}`; }
    else tr = cur > 0 ? `<b class="up">↑ ${x.unit === "₹" ? money(cur) : num(cur) + " " + x.unit}</b> in last ${d} days` : `No change in last ${d} days`;
    return `<div class="stat"><span class="ico ${x.cl}">${ic(x.ico)}</span><div class="tx"><div class="lb">${x.lb}</div><div class="vl">${x.vl}</div><div class="tr">${tr}</div></div><div class="bars ${x.cl}" style="background:none">${b.map((v) => `<i style="height:${Math.max(5, Math.round((v / mx) * 32))}px"></i>`).join("")}</div></div>`;
  }).join("");
}
function renderInsightCard() {
  const all = [...S.meta.values()];
  const rep = all.filter((x) => x.orders.length >= 2), one = all.filter((x) => x.orders.length === 1);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x.spent, 0) / a.length : 0);
  const likely = rep.filter((x) => x.status === "Active").length;
  let t;
  if (rep.length && one.length && avg(one) > 0) t = `Your repeat customers are ${(avg(rep) / avg(one)).toFixed(1)}x more valuable. ${likely} customer${likely === 1 ? " is" : "s are"} likely to purchase again.`;
  else if (rep.length) t = `You have ${rep.length} repeat customer${rep.length === 1 ? "" : "s"}. ${likely} ${likely === 1 ? "is" : "are"} likely to purchase again.`;
  else t = "No repeat customers yet. Follow up with recent buyers to bring them back.";
  $("insightCard").innerHTML = `<span class="sp">${ic("star")}</span><div><b>GLIME AI Insight</b><span class="t">${esc(t)}</span></div><span style="margin-left:auto;color:var(--green)">${ic("right")}</span>`;
}

/* ---------- list ---------- */
function filtered() {
  const f = S.f, q = f.q.trim().toLowerCase(), now = Date.now();
  let list = [...S.meta.values()];
  if (q) list = list.filter((x) => [x.c.name, x.c.mobile, x.email, x.c.district, x.c.state, x.c.village_locality, x.c.pincode, x.source].some((v) => String(v || "").toLowerCase().includes(q)));
  if (f.tag !== "all") list = list.filter((x) => hasTag(x, f.tag));
  if (f.status !== "all") list = list.filter((x) => x.status.toLowerCase() === f.status);
  if (f.minOrders) list = list.filter((x) => x.orders.length >= f.minOrders);
  if (f.minSpent) list = list.filter((x) => x.spent >= f.minSpent);
  if (f.seg === "month") { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); list = list.filter((x) => ts(x.c.created_at) >= d.getTime()); }
  if (f.seg === "recent") list = list.filter((x) => x.last && now - x.last <= 30 * DAY);
  const so = { recent: (a, b) => b.activity - a.activity, spent: (a, b) => b.spent - a.spent, orders: (a, b) => b.orders.length - a.orders.length, newest: (a, b) => ts(b.c.created_at) - ts(a.c.created_at), name: (a, b) => String(a.c.name || "").localeCompare(String(b.c.name || "")) };
  if (f.seg === "top10") list = list.sort(so.spent).slice(0, 10);
  return list.sort(so[f.sort] || so.recent);
}
function renderList() {
  const list = filtered();
  $("listCount").textContent = "(" + num(list.length) + ")";
  if (!list.length) { $("custList").innerHTML = `<div class="empty">${S.customers.length ? "No customers match these filters." : "No customers yet. Add your first customer."}</div>`; return; }
  $("custList").innerHTML = list.map((x) => {
    const tg = x.tags.slice(0, 2).map((t) => `<span class="tag ${t[1]}">${esc(t[0])}</span>`).join("");
    return `<button type="button" class="crow ${x.c.id === S.sel ? "sel" : ""}" data-id="${esc(x.c.id)}">${avatar(x.c.name)}<div class="cinfo"><b>${esc(x.c.name || "Customer")}</b><small>${esc(x.c.mobile || "—")}</small><div class="ctags">${tg}</div></div><div class="cmeta"><b>${x.orders.length} order${x.orders.length === 1 ? "" : "s"}</b><strong>${money(x.spent)}</strong><small>${x.last ? esc(rel(x.last)) : "No orders"}</small></div><span class="dots" data-copy="${esc(x.c.mobile || "")}" title="Copy number">${ic("dots")}</span></button>`;
  }).join("");
}

/* ---------- detail ---------- */
const tagHtml = (x) => x.tags.filter((t) => t[1] !== "t-src").map((t) => `<span class="tag ${t[1]}">${esc(t[0])}</span>`).join("");
function topProducts(x) {
  const g = new Map();
  for (const o of x.orders) { const k = o.product_title || "Order"; g.set(k, (g.get(k) || 0) + amt(o)); }
  const arr = [...g.entries()].sort((a, b) => b[1] - a[1]); const tot = arr.reduce((s, a) => s + a[1], 0);
  const top = arr.slice(0, 4), rest = arr.slice(4).reduce((s, a) => s + a[1], 0);
  if (rest > 0) top.push(["Others", rest]);
  return { tot, rows: top };
}
const DC = ["#9b6bff", "#ff4d8d", "#27d3ff", "#3b8bff", "#ffb020"];
function donut(x) {
  const { tot, rows } = topProducts(x);
  if (!tot) return `<div class="empty" style="padding:20px">No purchases yet</div>`;
  let acc = 0; const stops = rows.map((r, i) => { const a = acc, b = acc + (r[1] / tot) * 100; acc = b; return `${DC[i % 5]} ${a}% ${b}%`; }).join(",");
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"><div><b>${money(tot)}</b><small>Total Spend</small></div></div><div class="legend">${rows.map((r, i) => `<div><i style="background:${DC[i % 5]}"></i><span>${esc(r[0])}</span><em>${Math.round((r[1] / tot) * 100)}%</em></div>`).join("")}</div></div>`;
}
function journey(x) {
  const lead = x.leads.slice().sort((a, b) => ts(a.created_at) - ts(b.created_at))[0];
  const steps = [
    { t: lead ? "Lead Created" : "Customer Added", d: lead ? lead.created_at : x.c.created_at, ic: "target", col: "var(--green)", on: true },
    { t: "First Order", d: x.first, ic: "cart", col: "var(--blue)", on: !!x.first },
    { t: "Repeat Order", d: x.repeatAt, ic: "repeat", col: "var(--purple)", on: !!x.repeatAt },
    { t: "High Value", d: x.hv ? x.last : 0, ic: "star", col: "var(--amber)", on: !!x.hv }
  ];
  return `<div class="journey">${steps.map((s, i) => `${i ? '<span class="jl"></span>' : ""}<div class="jn ${s.on ? "" : "off"}"><span class="c" style="color:${s.col};border-color:${s.col};background:${s.col}1f">${ic(s.ic)}</span><b>${s.t}</b><small>${s.on && s.d ? esc(fmtDate(s.d)) : "—"}</small></div>`).join("")}</div>`;
}
function ordersTable(list, full) {
  if (!list.length) return `<div class="empty">No orders for this customer yet.</div>`;
  const head = full ? "<th>Order</th><th>Date</th><th>Product</th><th>Amount</th><th>Status</th><th>Payment</th><th>Channel</th>" : "<th>Order</th><th>Date</th><th>Amount</th><th>Status</th><th>Payment</th>";
  return `<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${list.map((o) => `<tr><td><b>${esc(orderNo(o))}</b></td><td>${esc(rel(o.created_at))}</td>${full ? `<td>${esc(o.product_title || "—")}</td>` : ""}<td>${money(amt(o))}</td><td>${pill(o.status)}</td><td>${pill(o.payment_status)}</td>${full ? `<td>${esc(normSrc(o.source_channel) || "—")}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}
function tabBody(x) {
  const t = S.tab, rate = x.orders.length ? Math.round(((x.orders.length - 1) / x.orders.length) * 100) : 0;
  if (t === "orders") return `<div class="card"><h4>All Orders (${x.all.length})</h4>${ordersTable(x.all, true)}</div>`;
  if (t === "conv") {
    const rows = [...x.wa.map((w) => ({ ch: "WhatsApp", ic: "msg", t: w.last_message_at || w.created_at, tx: w.last_message_preview || "WhatsApp conversation", href: "whatsapp-sales-specialist.html" })), ...x.ig.map((g) => ({ ch: "Instagram", ic: "insta", t: g.last_message_at || g.created_at, tx: g.username ? "@" + g.username : "Instagram conversation", href: "instagram-sales-specialist.html" }))].sort((a, b) => ts(b.t) - ts(a.t));
    return `<div class="card"><h4>Conversations (${rows.length})</h4>${rows.length ? rows.map((r) => `<a class="row-item" href="${r.href}"><span class="ico">${ic(r.ic)}</span><div><b>${r.ch}</b><small>${esc(r.tx)} · ${esc(rel(r.t))}</small></div></a>`).join("") : '<div class="empty">No conversations yet.</div>'}</div>`;
  }
  if (t === "follow") return `<div class="card"><h4>Follow-ups (${x.fu.length}) <a href="follow-up.html">Open Follow-up →</a></h4>${x.fu.length ? x.fu.slice().sort((a, b) => ts(b.created_at) - ts(a.created_at)).map((f) => `<div class="row-item"><span class="ico">${ic("repeat")}</span><div><b>${esc(label(f.channel || "Follow-up"))} follow-up</b><small>${esc(label(f.trigger_source || "manual"))} · ${esc(rel(f.created_at))}</small></div><span style="margin-left:auto">${pill(f.status)}</span></div>`).join("") : '<div class="empty">No follow-ups for this customer.</div>'}</div>`;
  if (t === "notes") {
    const ln = x.leads.filter((l) => l.notes), on = x.all.filter((o) => o.customer_note || o.internal_note);
    return `<div class="card"><h4>Notes</h4>${ln.map((l) => `<div class="row-item"><span class="ico">${ic("note")}</span><div><b>Lead note</b><small>${esc(l.notes)}</small></div></div>`).join("")}${on.map((o) => `<div class="row-item"><span class="ico">${ic("note")}</span><div><b>Order ${esc(orderNo(o))}</b><small>${esc([o.customer_note, o.internal_note].filter(Boolean).join(" · "))}</small></div></div>`).join("")}${!ln.length && !on.length ? '<div class="empty">No notes yet.</div>' : ""}<div style="margin-top:12px">${x.leads.length ? `<textarea class="note-box" id="noteText" placeholder="Add a note…"></textarea><div style="margin-top:8px"><button class="btn-primary" id="saveNote" type="button">Save Note</button></div>` : '<small style="color:var(--muted)">Notes are saved on the linked lead. This customer has no lead yet.</small>'}</div></div>`;
  }
  if (t === "details") {
    const c = x.c;
    return `<div class="card"><h4>Customer Details</h4><div class="kv">${[["Name", c.name], ["Mobile", c.mobile], ["Email", x.email], ["Address", c.house_no], ["Locality", c.village_locality], ["District", c.district], ["State", c.state], ["Pincode", c.pincode], ["Landmark", c.landmark], ["Customer Since", fmtDate(c.created_at)]].map((k) => `<div><small>${k[0]}</small><b>${esc(k[1] || "—")}</b></div>`).join("")}</div></div>`;
  }
  return `<div class="mini">
    <div class="mbox"><span class="ico c-blue">${ic("cart")}</span><div><small>Total Orders</small><b>${x.orders.length}</b></div></div>
    <div class="mbox"><span class="ico c-green">${ic("rupee")}</span><div><small>Total Spent</small><b>${money(x.spent)}</b></div></div>
    <div class="mbox"><span class="ico c-purple">${ic("chart")}</span><div><small>Avg. Order Value</small><b>${money(x.orders.length ? x.spent / x.orders.length : 0)}</b></div></div>
    <div class="mbox"><span class="ico c-green">${ic("repeat")}</span><div><small>Repeat Rate</small><b>${rate}%</b></div></div></div>
  <div class="two"><div class="card"><h4>Purchase History <a href="#" data-tab="orders">View All Orders</a></h4>${ordersTable(x.all.slice(0, 5), false)}</div><div class="card"><h4>Top Products</h4>${donut(x)}</div></div>
  <div class="two"><div class="card"><h4>Customer Tags</h4><div class="tagrow">${x.tags.map((t) => `<span class="tag ${t[1]}">${esc(t[0])}</span>`).join("") || '<small style="color:var(--muted)">No tags yet</small>'}</div></div><div class="card"><h4>Customer Journey</h4>${journey(x)}</div></div>`;
}
function renderDetail() {
  const x = M(S.sel);
  if (!x) { $("detail").innerHTML = `<div class="empty">${S.customers.length ? "Select a customer to view the profile." : "No customers yet."}</div>`; return; }
  const c = x.c, loc = [c.district, c.state].filter(Boolean).join(", "), conv = x.wa.length + x.ig.length;
  const tabs = [["overview", "Overview", "user"], ["orders", "Orders", "cart"], ["conv", "Conversations", "msg", conv], ["follow", "Follow-ups", "repeat", x.fu.length], ["notes", "Notes", "note"], ["details", "Details", "grid"]];
  const badge = x.vip ? '<span class="tag t-vip">VIP Customer</span>' : tagHtml(x).split("</span>")[0] ? tagHtml(x).split("</span>")[0] + "</span>" : "";
  $("detail").innerHTML = `<button class="btn-ghost back-btn" id="backBtn" type="button">← All customers</button>
  <div class="d-top"><div class="d-id">${avatar(c.name, "lg")}<div><h3>${esc(c.name || "Customer")} ${badge}</h3>
    <div class="d-line">${ic("phone")}${esc(c.mobile || "—")} ${c.mobile ? `<span class="wa-dot">${ic("msg")}</span>` : ""}</div>
    ${x.email ? `<div class="d-line">${ic("mail")}${esc(x.email)}</div>` : ""}
    ${loc ? `<div class="d-line">${ic("pin")}${esc(loc)}</div>` : ""}
    <div class="d-btns"><a class="btn-wa" target="_blank" rel="noopener" href="${c.mobile ? "https://wa.me/" + waNum(c.mobile) : "#"}">${ic("msg")} WhatsApp ${ic("arrow")}</a><a class="btn-ln cy" href="${c.mobile ? "tel:" + esc(c.mobile) : "#"}">${ic("phone")} Call</a><button class="btn-ln" id="copyBtn" type="button">More ${ic("chev")}</button></div></div></div>
  <div class="d-boxes"><div class="dbox">${ic("user")}<div><small>Customer Since</small><b>${esc(fmtDate(c.created_at))}</b></div></div><div class="dbox">${ic("cart")}<div><small>Last Order</small><b>${x.last ? esc(rel(x.last)) : "—"}</b></div></div><div class="dbox">${ic("check")}<div><small>Customer Status</small><b class="${x.status === "Active" ? "up" : ""}">${x.status}</b></div></div><div class="dbox">${ic(x.source === "Instagram" ? "insta" : "msg")}<div><small>Lead Source</small><b style="color:var(--pink)">${esc(x.source || "—")}</b></div></div></div></div>
  <div class="tabs">${tabs.map((t) => `<button type="button" data-tab="${t[0]}" class="${S.tab === t[0] ? "on" : ""}">${ic(t[2])}${t[1]}${t[3] ? `<span class="badge">${t[3]}</span>` : ""}</button>`).join("")}</div>
  <div>${tabBody(x)}</div>`;
}

/* ---------- right panel ---------- */
function renderSide() {
  const x = M(S.sel);
  if (!x) { $("sidePanel").innerHTML = ""; return; }
  const dsl = x.last ? Math.floor((Date.now() - x.last) / DAY) : null;
  const ins = [];
  if (x.orders.length >= 2) ins.push(["Likely to buy again", dsl !== null && dsl <= 45 ? "High likelihood" : dsl !== null && dsl <= 90 ? "Medium likelihood" : "Low likelihood", `Based on ${x.orders.length} orders, last ${dsl} day${dsl === 1 ? "" : "s"} ago`, "star", "c-green"]);
  else if (x.orders.length === 1) ins.push(["First purchase done", "Follow up to get a repeat order", `Last order ${rel(x.last)}`, "star", "c-green"]);
  else ins.push(["No purchase yet", "Send an offer to convert", "Customer has not ordered", "star", "c-green"]);
  const tp = topProducts(x).rows[0];
  if (tp && tp[0] !== "Others") ins.push(["Prefers " + tp[0], `Based on ${x.orders.length} order${x.orders.length === 1 ? "" : "s"}`, "", "box", "c-blue"]);
  const igC = x.ig.length, waC = x.wa.length;
  if (igC + waC) ins.push(["Most active on " + (igC > waC ? "Instagram" : "WhatsApp"), `${Math.max(igC, waC)} conversation${Math.max(igC, waC) === 1 ? "" : "s"}`, "", igC > waC ? "insta" : "msg", "c-purple"]);
  if (x.vip || x.hv || x.orders.length >= 3) ins.push(["Good candidate for loyalty offer", x.vip ? "VIP customer" : "High engagement", "", "gift", "c-amber"]);
  const ev = [];
  for (const o of x.all.slice(0, 6)) {
    ev.push({ t: o.created_at, ic: "cart", a: `Order ${orderNo(o)} placed`, c: "c-blue" });
    if (String(o.payment_status).toLowerCase() === "paid") ev.push({ t: o.updated_at, ic: "rupee", a: "Payment received", c: "c-green" });
    if (String(o.status).toLowerCase() === "delivered") ev.push({ t: o.updated_at, ic: "box", a: `Order ${orderNo(o)} delivered`, c: "c-amber" });
  }
  for (const w of x.wa.slice(0, 2)) ev.push({ t: w.last_message_at || w.created_at, ic: "msg", a: "WhatsApp conversation", c: "c-green" });
  for (const g of x.ig.slice(0, 2)) ev.push({ t: g.last_message_at || g.created_at, ic: "insta", a: "Instagram conversation", c: "c-purple" });
  for (const f of x.fu.slice(0, 2)) ev.push({ t: f.created_at, ic: "check", a: "Follow-up " + String(f.status || "started").replace(/_/g, " "), c: "c-blue" });
  ev.sort((a, b) => ts(b.t) - ts(a.t));
  const qa = [["Create Order", "cart", "orders.html"], ["Add Follow-up", "repeat", "follow-up.html"], ["Send Message", "mail", x.c.mobile ? "https://wa.me/" + waNum(x.c.mobile) : "whatsapp-sales-specialist.html"], ["Add Note", "note", "#note"]];
  $("sidePanel").innerHTML = `<div class="sc"><h3><span>${ic("star")} AI Insights</span></h3>${ins.map((i) => `<div class="ins"><span class="ico ${i[4]}">${ic(i[3])}</span><div><b>${esc(i[0])}</b><small>${esc(i[1])}${i[2] ? " · " + esc(i[2]) : ""}</small></div></div>`).join("")}</div>
  <div class="sc"><h3><span>Recent Activity</span></h3>${ev.length ? ev.slice(0, 5).map((e) => `<div class="ins"><span class="ico ${e.c}">${ic(e.ic)}</span><div><b>${esc(e.a)}</b><small>${esc(rel(e.t))}</small></div></div>`).join("") : '<div class="empty" style="padding:14px">No activity yet</div>'}</div>
  <div class="sc"><h3><span>Quick Actions</span></h3>${qa.map((q) => `<a class="qa" href="${q[2]}" ${q[2].startsWith("http") ? 'target="_blank" rel="noopener"' : ""} ${q[2] === "#note" ? 'data-tab="notes"' : ""}>${ic(q[1])}<span>${q[0]}</span><span class="ch">${ic("right")}</span></a>`).join("")}</div>`;
}

/* ---------- actions ---------- */
function select(id, scroll) {
  S.sel = id; S.tab = "overview";
  try { history.replaceState(null, "", "customer.html?id=" + encodeURIComponent(id)); } catch (e) {}
  renderList(); renderDetail(); renderSide();
  $("split").classList.add("show-detail");
  if (scroll) $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
}
function refreshAll() {
  buildMeta(); renderStats(); renderInsightCard(); renderTags();
  const list = filtered();
  if (!S.sel || !M(S.sel)) S.sel = list[0]?.c.id || S.customers[0]?.id || null;
  renderList(); renderDetail(); renderSide();
}
function renderTags() {
  const names = new Set(["VIP", "Repeat", "High Value", "New", "Inactive"]);
  for (const x of S.meta.values()) if (x.source) names.add(x.source);
  const cur = S.f.tag;
  $("tagSel").innerHTML = '<option value="all">All Tags</option>' + [...names].map((n) => `<option value="${esc(n)}" ${n === cur ? "selected" : ""}>${esc(n)}</option>`).join("");
}
const setQ = (v) => { S.f.q = v; $("listSearch").value = v; $("globalSearch").value = v; renderList(); };

function bind() {
  $("custList").addEventListener("click", (e) => {
    const d = e.target.closest("[data-copy]");
    if (d) { e.stopPropagation(); if (d.dataset.copy) navigator.clipboard?.writeText(d.dataset.copy).then(() => toast("Number copied"), () => {}); return; }
    const r = e.target.closest("[data-id]"); if (r) select(r.dataset.id, innerWidth <= 960);
  });
  $("detail").addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { e.preventDefault(); S.tab = t.dataset.tab; renderDetail(); return; }
    if (e.target.closest("#backBtn")) { $("split").classList.remove("show-detail"); return; }
    if (e.target.closest("#copyBtn")) { const m = M(S.sel)?.c.mobile; if (m) navigator.clipboard?.writeText(m).then(() => toast("Number copied"), () => {}); return; }
    if (e.target.closest("#saveNote")) saveNote();
  });
  $("sidePanel").addEventListener("click", (e) => { const t = e.target.closest("[data-tab]"); if (t) { e.preventDefault(); S.tab = t.dataset.tab; renderDetail(); $("detail").scrollIntoView({ behavior: "smooth" }); } });
  $("listSearch").addEventListener("input", (e) => setQ(e.target.value));
  $("globalSearch").addEventListener("input", (e) => setQ(e.target.value));
  $("segSel").addEventListener("change", (e) => { S.f.seg = e.target.value; renderList(); });
  $("tagSel").addEventListener("change", (e) => { S.f.tag = e.target.value; renderList(); });
  $("statusSel").addEventListener("change", (e) => { S.f.status = e.target.value; renderList(); });
  $("sortSel").addEventListener("change", (e) => { S.f.sort = e.target.value; renderList(); });
  $("rangeSel").addEventListener("change", (e) => { S.range = Number(e.target.value); renderStats(); });
  $("filterBtn").addEventListener("click", (e) => { e.stopPropagation(); $("filterPop").hidden = !$("filterPop").hidden; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".pop-wrap")) $("filterPop").hidden = true; });
  $("minOrders").addEventListener("input", (e) => { S.f.minOrders = Number(e.target.value) || 0; renderList(); });
  $("minSpent").addEventListener("input", (e) => { S.f.minSpent = Number(e.target.value) || 0; renderList(); });
  $("resetFilters").addEventListener("click", () => {
    S.f = { q: "", seg: "all", tag: "all", status: "all", minOrders: 0, minSpent: 0, sort: "recent" };
    $("listSearch").value = $("globalSearch").value = ""; $("segSel").value = "all"; $("tagSel").value = "all"; $("statusSel").value = "all"; $("sortSel").value = "recent"; $("minOrders").value = $("minSpent").value = "";
    renderList();
  });
  $("insightCard").addEventListener("click", () => { S.f.tag = "Repeat"; $("tagSel").value = "Repeat"; renderList(); $("workMain").scrollIntoView({ behavior: "smooth" }); });
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("globalSearch").focus(); } if (e.key === "Escape") { $("modal").hidden = true; closeNav(); } });
  $("addBtn").addEventListener("click", () => { $("modal").hidden = false; $("addForm").querySelector("input").focus(); });
  for (const id of ["modalClose", "modalCancel"]) $(id).addEventListener("click", () => { $("modal").hidden = true; });
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal")) $("modal").hidden = true; });
  $("addForm").addEventListener("submit", addCustomer);
  $("menuBtn")?.addEventListener("click", () => { $("sidebar")?.classList.add("open"); $("scrim")?.classList.add("show"); });
  $("scrim")?.addEventListener("click", closeNav);
  $("logoutBtn")?.addEventListener("click", async () => { try { await db.auth.signOut(); } catch (e) {} location.href = "login.html"; });
}
function closeNav() { $("sidebar")?.classList.remove("open"); $("scrim")?.classList.remove("show"); }

async function addCustomer(e) {
  e.preventDefault();
  const fd = new FormData($("addForm")), row = { client_id: S.clientId };
  for (const [k, v] of fd.entries()) { const s = String(v).trim(); if (s) row[k] = s; }
  if (!row.name || !row.mobile) { toast("Name and mobile are required."); return; }
  const btn = $("saveCust"); btn.disabled = true;
  const { data, error } = await db.from("customers").insert(row).select().maybeSingle();
  btn.disabled = false;
  if (error) { console.error(error); toast("Could not add customer: " + error.message); return; }
  if (data) S.customers.push(data); else await loadAll();
  $("addForm").reset(); $("modal").hidden = true;
  buildMeta(); S.sel = data?.id || S.sel; refreshAll(); if (data) select(data.id);
  toast("Customer added");
}
async function saveNote() {
  const x = M(S.sel), txt = $("noteText")?.value.trim();
  if (!x || !x.leads.length || !txt) { toast("Write a note first."); return; }
  const lead = x.leads[0], stamp = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const notes = (lead.notes ? lead.notes + "\n" : "") + "[" + stamp + "] " + txt;
  const { error } = await db.from("leads").update({ notes }).eq("id", lead.id).eq("client_id", S.clientId);
  if (error) { toast("Could not save note."); return; }
  lead.notes = notes; renderDetail(); toast("Note saved");
}

/* ---------- shell ---------- */
function buildShell() {
  const nav = [["Overview", "home", "dashboard.html"], ["Leads", "target", "leads.html"], ["Customers", "users", "customer.html", 1], ["Orders", "cart", "orders.html"], ["Services", "grid", "services.html"], ["sec", "AI & Automation"], ["Follow-up Specialist", "repeat", "follow-up.html"], ["Business Intelligence", "chart", "glime-intelligence-center.html"], ["AI Assistant", "star", "client-assistant.html"], ["Instagram Sales", "insta", "instagram-sales-specialist.html"], ["WhatsApp Sales", "msg", "whatsapp-sales-specialist.html"], ["Voice AI", "mic", "voice-ai.html"], ["sec", "Manage"], ["Connectors", "plug", "ai-connections.html"], ["Billing", "card", "billing.html"], ["Settings", "gear", "settings.html"]];
  if ($("nav")) $("nav").innerHTML = nav.map((n) => n[0] === "sec" ? `<div class="sec">${n[1]}</div>` : `<a href="${n[2]}" class="${n[3] ? "on" : ""}">${ic(n[1])}<span>${n[0]}</span></a>`).join("");
  if ($("logoutBtn")) $("logoutBtn").innerHTML = ic("logout") + "<span>Logout</span>";
  if ($("menuBtn")) $("menuBtn").innerHTML = ic("menu");
  $("gsIcon").innerHTML = ic("search"); $("fsIcon").innerHTML = ic("search");
  $("rangeIcon").innerHTML = ic("cal"); $("bell").insertAdjacentHTML("afterbegin", ic("bell"));
  $("headIc").innerHTML = ic("users"); $("addBtn").innerHTML = ic("plus") + " Add Customer";
  $("filterBtn").innerHTML = ic("filter") + " Filters"; $("modalClose").innerHTML = ic("x");
}

async function boot() {
  buildShell(); bind();
  try {
    await resolveClient(); await loadAll();
    buildMeta();
    const want = new URLSearchParams(location.search).get("id");
    if (want && M(want)) S.sel = want;
    refreshAll();
    if (want && M(want)) $("split").classList.add("show-detail");
    $("bellDot").hidden = !S.fu.some((f) => ["open", "active", "pending", "started", "in_progress"].includes(String(f.status).toLowerCase()));
  } catch (err) {
    console.error("[GLIME Customers]", err);
    $("custList").innerHTML = `<div class="empty">Unable to load customers. Please refresh or sign in again.</div>`;
    $("detail").innerHTML = "";
    toast(err?.message || "Customer loading failed.");
  }
}
boot();
})();
