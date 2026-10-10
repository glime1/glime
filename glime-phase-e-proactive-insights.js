/* GLIME Daily Business Pulse (Phase E — proactive insights + 7-day growth report)
 *
 *  1. Seven-day growth report  -> rpc get_client_business_growth_overview(p_selected_date)
 *  2. Proactive insights below -> rpc get_client_proactive_insights({ p_limit: 5 })
 *
 * No client_id is ever sent. Mounts only in #glime-growth-overview-slot and reuses
 * window.supabaseClient. Missing data is shown as unavailable, never as a fake zero.
 * Read-only: nothing here approves or executes an action.
 */
(() => {
  "use strict";

  const SLOT_ID = "glime-growth-overview-slot";
  const CARD_ID = "glime-proactive-insights-card";
  const INSIGHTS_RPC = "get_client_proactive_insights";
  const GROWTH_RPC = "get_client_business_growth_overview";
  const MAX_INSIGHTS = 5;
  const TZ = "Asia/Kolkata";

  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const state = { growth: null, selected: null, detail: null, detailLoading: false, detailError: "" };
  let cardEl = null;

  // ---------------------------------------------------------------- helpers
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  const fmtInt = (v) => isNum(v) ? new Intl.NumberFormat("en-IN").format(Number(v)) : "—";

  function money(amount, currency) {
    if (!isNum(amount)) return "—";
    const code = /^[A-Z]{3}$/.test(currency || "") ? currency : null;
    try {
      return new Intl.NumberFormat("en-IN", code
        ? { style: "currency", currency: code, maximumFractionDigits: 0 }
        : { maximumFractionDigits: 0 }).format(Number(amount));
    } catch (_) { return fmtInt(amount); }
  }

  /* {"INR": 1500} -> "₹1,500"; several currencies are listed, never summed. */
  function moneyMap(map) {
    if (map === null || map === undefined || typeof map !== "object") return null;
    const keys = Object.keys(map);
    if (!keys.length) return money(0, "INR");
    return keys.map((k) => money(map[k], k)).join(" · ");
  }
  const singleCurrency = (map) => {
    if (!map || typeof map !== "object") return null;
    const k = Object.keys(map);
    return k.length === 1 ? { code: k[0], amount: Number(map[k[0]]) } : null;
  };

  /* "YYYY-MM-DD" -> label without any timezone shifting. */
  function dayParts(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return {
      weekday: dt.toLocaleDateString("en-IN", { weekday: "short" }),
      short: dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      long: dt.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    };
  }

  function fmtTime(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—"
      : d.toLocaleString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  }

  function delta(cur, prev) {
    if (!isNum(cur) || !isNum(prev)) return { text: "—", cls: "" };
    cur = Number(cur); prev = Number(prev);
    if (prev === 0 && cur === 0) return { text: "no change", cls: "" };
    if (prev === 0) return { text: "new vs previous 7 days", cls: "up" };
    const pct = ((cur - prev) / prev) * 100;
    return { text: `${pct > 0 ? "↑" : pct < 0 ? "↓" : ""} ${Math.abs(pct).toFixed(0)}% vs previous 7 days`, cls: pct > 0 ? "up" : pct < 0 ? "down" : "" };
  }

  const humanize = (k) => String(k || "").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

  function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase && typeof window.supabase.createClient === "function") {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      return window.supabaseClient;
    }
    return null;
  }

  async function hasSession() {
    const sb = getClient();
    if (!sb) throw new Error("Supabase client unavailable.");
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return Boolean(data?.session?.user?.id);
  }

  // ------------------------------------------------------------------- data
  async function fetchGrowth(selectedDate) {
    const sb = getClient();
    if (!sb) throw new Error("Supabase client unavailable.");
    // Only the date is sent. The client is resolved on the server from auth.uid().
    const args = selectedDate ? { p_selected_date: selectedDate } : {};
    const { data, error } = await sb.rpc(GROWTH_RPC, args);
    if (error) throw error;
    const body = typeof data === "string" ? JSON.parse(data) : data;
    if (!body || !Array.isArray(body.daily)) throw new Error("Unexpected growth report shape.");
    return body;
  }

  const isMissingRpc = (e) =>
    e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message || ""));

  async function fetchInsights() {
    const sb = getClient();
    if (!sb) throw new Error("Supabase client unavailable.");
    // Existing production contract: no client_id.
    const { data, error } = await sb.rpc(INSIGHTS_RPC, { p_limit: MAX_INSIGHTS });
    if (error) throw error;
    let rows = data;
    if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch (_) { rows = []; } }
    if (!Array.isArray(rows)) rows = rows && Array.isArray(rows.insights) ? rows.insights : [];
    return rows;
  }

  // ----------------------------------------------------------------- charts
  const PALETTE = { instagram: "#ff4f8b", whatsapp: "#25d366", website: "#3bd5ff", web: "#3bd5ff", referral: "#ffb454", unknown: "#7c8aa5" };
  const FALLBACK = ["#a78bfa", "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#94a3b8"];

  function colorFor(name, i) {
    return PALETTE[String(name).toLowerCase()] || FALLBACK[i % FALLBACK.length];
  }

  function sumSources(daily, key) {
    const totals = {};
    daily.forEach((d) => Object.entries(d[key] || {}).forEach(([k, n]) => { totals[k] = (totals[k] || 0) + Number(n || 0); }));
    return Object.entries(totals).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  }

  function trendChart(daily) {
    const W = 640, H = 230, L = 34, R = 14, T = 16, B = 30;
    const series = [
      { key: "leads_created", label: "New leads", color: "#00ff88" },
      { key: "orders_created", label: "Orders", color: "#3bd5ff" },
      { key: "won_conversions", label: "Won conversions", color: "#ffb454" }
    ];
    const max = Math.max(1, ...daily.flatMap((d) => series.map((s) => Number(d[s.key] || 0))));
    const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
    const x = (i) => L + (i * (W - L - R)) / Math.max(1, daily.length - 1);
    const y = (v) => T + (1 - v / niceMax) * (H - T - B);

    const grid = [0, 1, 2, 3, 4].map((g) => {
      const v = (niceMax / 4) * g;
      return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gx-grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="gx-axis">${Math.round(v)}</text>`;
    }).join("");

    const lines = series.map((s, si) => {
      const pts = daily.map((d, i) => `${x(i).toFixed(1)},${y(Number(d[s.key] || 0)).toFixed(1)}`);
      const area = si < 2
        ? `<polygon points="${L},${y(0)} ${pts.join(" ")} ${x(daily.length - 1)},${y(0)}" fill="url(#gx-g${si})" opacity=".9"/>` : "";
      const dots = daily.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(Number(d[s.key] || 0)).toFixed(1)}" r="3.5" fill="${s.color}" stroke="#0a1118" stroke-width="1.5"/>`).join("");
      return `${area}<polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
    }).join("");

    const labels = daily.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="gx-axis">${esc(dayParts(d.date).short)}</text>`).join("");
    const sel = state.selected ? daily.findIndex((d) => d.date === state.selected) : -1;
    const hl = sel >= 0 ? `<line x1="${x(sel)}" x2="${x(sel)}" y1="${T}" y2="${H - B}" class="gx-sel"/>` : "";

    const summary = daily.map((d) => `${dayParts(d.date).short}: ${d.leads_created} leads, ${d.orders_created} orders, ${d.won_conversions} won`).join("; ");
    return `
      <svg viewBox="0 0 ${W} ${H}" class="gx-svg" role="img" aria-label="Seven-day trend. ${esc(summary)}">
        <defs>
          <linearGradient id="gx-g0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00ff88" stop-opacity=".28"/><stop offset="1" stop-color="#00ff88" stop-opacity="0"/></linearGradient>
          <linearGradient id="gx-g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3bd5ff" stop-opacity=".25"/><stop offset="1" stop-color="#3bd5ff" stop-opacity="0"/></linearGradient>
        </defs>
        ${grid}${hl}${lines}${labels}
      </svg>
      <div class="gx-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>`;
  }

  function donut(entries, centerLabel) {
    const total = entries.reduce((n, [, v]) => n + v, 0);
    if (!total) return `<div class="gx-empty-sm">No leads created in this period.</div>`;
    const R = 44, C = 2 * Math.PI * R;
    let offset = 0;
    const arcs = entries.map(([name, n], i) => {
      const len = (n / total) * C;
      const arc = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${colorFor(name, i)}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
      offset += len;
      return arc;
    }).join("");
    const legend = entries.map(([name, n], i) =>
      `<li><i style="background:${colorFor(name, i)}"></i><span>${esc(name)}</span><b>${fmtInt(n)} <small>(${Math.round((n / total) * 100)}%)</small></b></li>`).join("");
    return `
      <div class="gx-donut-wrap">
        <svg viewBox="0 0 120 120" class="gx-donut" role="img" aria-label="${esc(centerLabel)}: ${esc(entries.map(([k, n]) => k + " " + n).join(", "))}">
          <circle r="${R}" cx="60" cy="60" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="16"/>${arcs}
          <text x="60" y="58" text-anchor="middle" class="gx-donut-n">${fmtInt(total)}</text>
          <text x="60" y="73" text-anchor="middle" class="gx-donut-l">${esc(centerLabel)}</text>
        </svg>
        <ul class="gx-donut-legend">${legend}</ul>
      </div>`;
  }

  function bars(entries) {
    const max = Math.max(1, ...entries.map(([, n]) => n));
    if (!entries.length) return `<div class="gx-empty-sm">No orders created in this period.</div>`;
    return `<ul class="gx-bars">${entries.map(([name, n], i) =>
      `<li><span>${esc(name)}</span><div class="gx-bar"><div style="width:${(n / max) * 100}%;background:${colorFor(name, i + 2)}"></div></div><b>${fmtInt(n)}</b></li>`).join("")}</ul>`;
  }

  // ------------------------------------------------------------------ growth
  function kpi(label, icon, value, sub, tone) {
    return `
      <div class="gx-kpi ${tone || ""}">
        <div class="gx-kpi-ico" aria-hidden="true">${icon}</div>
        <div class="gx-kpi-body">
          <div class="gx-kpi-label">${esc(label)}</div>
          <div class="gx-kpi-value">${value}</div>
          <div class="gx-kpi-sub ${sub.cls || ""}">${esc(sub.text)}</div>
        </div>
      </div>`;
  }

  function renderKpis(g) {
    const s = g.summary || {}, p = g.previous_period || {};
    const grossCur = singleCurrency(s.gross_order_value_by_currency);
    const grossPrev = singleCurrency(p.gross_order_value_by_currency);
    const grossDelta = grossCur && grossPrev && grossCur.code === grossPrev.code ? delta(grossCur.amount, grossPrev.amount)
      : { text: "value of orders created — not money collected", cls: "" };
    const revenueOk = s.revenue_available === true;
    const revCur = singleCurrency(s.collected_revenue_by_currency);
    const revPrev = singleCurrency(p.collected_revenue_by_currency);
    const revDelta = revenueOk && p.revenue_available === true && revCur && revPrev && revCur.code === revPrev.code
      ? delta(revCur.amount, revPrev.amount) : { text: revenueOk ? "no comparable previous data" : "Payment tracking not available", cls: "" };

    return `
      <div class="gx-kpis">
        ${kpi("Orders created", "🛒", fmtInt(s.orders_created), delta(s.orders_created, p.orders_created), "c")}
        ${kpi("Gross order value", "₹", esc(moneyMap(s.gross_order_value_by_currency) || "—"), grossDelta, "g")}
        ${kpi("Collected revenue", "✓", revenueOk ? esc(moneyMap(s.collected_revenue_by_currency) || "—") : '<span class="gx-na">Not tracked</span>', revDelta, "g")}
        ${kpi("New leads", "👥", fmtInt(s.leads_created), delta(s.leads_created, p.leads_created), "p")}
        ${kpi("New customers", "☺", fmtInt(s.customers_added), delta(s.customers_added, p.customers_added), "a")}
        ${kpi("Leads won", "🏆", fmtInt(s.won_conversions), delta(s.won_conversions, p.won_conversions), "a")}
      </div>
      <div class="gx-chips">
        <span class="gx-chip">${fmtInt(s.lead_linked_orders)} of ${fmtInt(s.orders_created)} orders linked to a lead</span>
        <span class="gx-chip">${fmtInt(s.unlinked_orders)} orders without a lead</span>
        <span class="gx-chip">${fmtInt(s.cancelled_orders)} cancelled</span>
        <span class="gx-chip">${fmtInt(s.paid_orders)} paid orders</span>
      </div>`;
  }

  function dayButtons(daily) {
    return `
      <div class="gx-days" role="group" aria-label="Select a day to see its orders and conversions">
        ${daily.map((d) => {
          const p = dayParts(d.date);
          const on = state.selected === d.date;
          return `
            <button type="button" class="gx-day ${on ? "on" : ""}" data-date="${esc(d.date)}" aria-pressed="${on}"
              aria-label="${esc(p.long)}${d.is_today ? " (today, may be incomplete)" : ""}: ${d.leads_created} new leads, ${d.orders_created} orders, ${d.won_conversions} leads won">
              <span class="gx-day-w">${esc(d.is_today ? "Today" : p.weekday)}</span>
              <span class="gx-day-d">${esc(p.short)}</span>
              <span class="gx-day-n"><b>${fmtInt(d.orders_created)}</b> orders</span>
              <span class="gx-day-n"><b>${fmtInt(d.won_conversions)}</b> won</span>
              <span class="gx-day-n"><b>${fmtInt(d.leads_created)}</b> leads</span>
            </button>`;
        }).join("")}
      </div>`;
  }

  // ------------------------------------------------------------- day detail
  function table(headers, rows) {
    return `<div class="gx-tw"><table class="gx-t"><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  function section(title, block, emptyText, headers, mapRow) {
    const rows = (block?.rows || []).map(mapRow);
    const trunc = block?.truncated
      ? `<p class="gx-trunc">Showing first ${fmtInt(block.returned)} of ${fmtInt(block.total)}.</p>` : "";
    return `
      <section class="gx-sec">
        <h4>${esc(title)} <span class="gx-count">${fmtInt(block?.total ?? 0)}</span></h4>
        ${rows.length ? table(headers, rows) + trunc : `<p class="gx-empty-sm">${esc(emptyText)}</p>`}
      </section>`;
  }

  const pill = (t, cls) => `<span class="gx-pill ${cls || ""}">${esc(t ?? "—")}</span>`;
  const unk = (v) => (v === "Unknown" || v === null || v === undefined || v === "") ? `<span class="gx-unk">Unknown</span>` : esc(v);

  function renderDetail() {
    if (!state.selected) return `<div class="gx-detail-hint">Select a day above to see its orders, lead conversions, new leads and status changes.</div>`;
    const p = dayParts(state.selected);
    const head = `<div class="gx-detail-head"><h3>${esc(p.long)}</h3>${state.growth?.daily?.find((d) => d.date === state.selected)?.is_today ? pill("Today — may be incomplete", "warn") : ""}<button type="button" class="gx-close" data-close aria-label="Close day details">✕</button></div>`;
    if (state.detailLoading) return `<div class="gx-detail" aria-live="polite">${head}<p class="gx-empty-sm">Loading ${esc(p.short)}…</p></div>`;
    if (state.detailError) return `<div class="gx-detail" aria-live="polite">${head}<p class="gx-error" role="alert">${esc(state.detailError)}</p></div>`;
    const d = state.detail;
    if (!d) return "";
    const un = d.unattributed || {};
    return `
      <div class="gx-detail" aria-live="polite">
        ${head}
        <div class="gx-chips">
          <span class="gx-chip">${fmtInt(un.orders_without_lead)} orders without a lead</span>
          <span class="gx-chip">${fmtInt(un.orders_unknown_channel)} orders with unknown channel</span>
          <span class="gx-chip">${fmtInt(un.leads_unknown_source)} leads with unknown source</span>
          <span class="gx-chip">${fmtInt(un.conversions_unknown_source)} conversions with unknown source</span>
        </div>
        ${section("Orders created", d.orders_created, "No orders were created on this day.",
          ["Order", "Customer", "Time", "Status", "Payment", "Amount", "Order source", "Channel", "Linked lead"],
          (r) => `<tr><td data-l="Order"><b>${esc(r.order_number || "—")}</b></td><td data-l="Customer">${esc(r.customer_name || "—")}</td><td data-l="Time">${esc(fmtTime(r.created_at))}</td><td data-l="Status">${pill(humanize(r.status))}</td><td data-l="Payment">${pill(humanize(r.payment_status))}</td><td data-l="Amount">${esc(money(r.total_amount, r.currency))}</td><td data-l="Order source">${unk(r.source)}</td><td data-l="Channel">${unk(r.source_channel)}</td><td data-l="Linked lead">${r.lead_id ? `${esc(r.lead_name || "Lead")}<br><small>lead source: ${unk(r.lead_source)}</small>` : '<span class="gx-unk">No lead linked</span>'}</td></tr>`)}
        ${section("Lead conversions (won)", d.lead_conversions, "No leads moved to won on this day.",
          ["Lead", "Time", "Status change", "Source at event", "Linked orders"],
          (r) => `<tr><td data-l="Lead"><b>${esc(r.lead_name || "Lead")}</b></td><td data-l="Time">${esc(fmtTime(r.occurred_at))}</td><td data-l="Status change">${esc(humanize(r.previous_status || "—"))} → ${esc(humanize(r.new_status))}</td><td data-l="Source at event">${unk(r.event_source)}</td><td data-l="Linked orders">${r.has_linked_order ? fmtInt(r.linked_order_count) : '<span class="gx-unk">None linked</span>'}</td></tr>`)}
        ${section("New leads", d.new_leads, "No new leads on this day.",
          ["Lead", "Created", "Source", "Interest / product", "Current status"],
          (r) => `<tr><td data-l="Lead"><b>${esc(r.name || "Lead")}</b></td><td data-l="Created">${esc(fmtTime(r.created_at))}</td><td data-l="Source">${unk(r.source)}</td><td data-l="Interest / product">${esc([r.interest, r.product_service].filter(Boolean).join(" · ") || "—")}</td><td data-l="Current status">${pill(humanize(r.current_status))} <small>(now)</small></td></tr>`)}
        ${section("New customers", d.new_customers, "No new customers on this day.",
          ["Customer", "Created"],
          (r) => `<tr><td data-l="Customer"><b>${esc(r.name || "Customer")}</b></td><td data-l="Created">${esc(fmtTime(r.created_at))}</td></tr>`)}
        ${section("Order status changes", d.order_status_changes, "No order status changes on this day.",
          ["Order", "From → to", "Time", "Reason"],
          (r) => `<tr><td data-l="Order"><b>${esc(r.order_number || "—")}</b></td><td data-l="From → to">${esc(humanize(r.from_status || "—"))} → ${esc(humanize(r.to_status))}</td><td data-l="Time">${esc(fmtTime(r.created_at))}</td><td data-l="Reason">${esc(r.reason || "—")}</td></tr>`)}
        <p class="gx-trunc">Unattributed counts above cover the rows shown. “Unknown” means GLIME has no recorded source — it is not guessed.</p>
      </div>`;
  }

  // -------------------------------------------------------------- insights
  function priorityMeta(priority) {
    const p = String(priority || "medium").toLowerCase();
    if (p === "critical" || p === "high") return { label: p === "critical" ? "Critical" : "High", cls: "high" };
    if (p === "low") return { label: "Low", cls: "low" };
    return { label: "Medium", cls: "medium" };
  }

  function renderInsights(items) {
    if (!items.length) {
      return `<div class="gx-empty-sm">No open insight right now. GLIME keeps checking your business signals.</div>`;
    }
    return `<div class="gx-ins">${items.map((it) => {
      const m = priorityMeta(it.priority);
      const next = it.recommended_action || it.recommended_next_step || it.next_step || it.recommendation || it.suggested_action;
      const evidence = it.evidence_summary || it.evidence || it.basis;
      const seen = it.last_seen_at || it.updated_at || it.created_at;
      return `
        <article class="gx-in ${m.cls}">
          <header><h4>${esc(it.title || "Business insight")}</h4>${pill(m.label, m.cls)}</header>
          <p>${esc(it.summary || it.description || it.message || "GLIME detected a business signal.")}</p>
          ${next ? `<p class="gx-next"><b>Suggested next step:</b> ${esc(typeof next === "string" ? next : JSON.stringify(next))}</p>` : ""}
          ${evidence && typeof evidence === "string" ? `<p class="gx-ev">Evidence: ${esc(evidence)}</p>` : ""}
          <footer>${seen ? `Last detected ${esc(fmtTime(seen))}` : "Detection time not available"}</footer>
        </article>`;
    }).join("")}</div>`;
  }

  // ------------------------------------------------------------------ render
  function renderGrowth() {
    const g = state.growth;
    if (!g) return "";
    const daily = g.daily || [];
    const meta = g.meta || {};
    const q = meta.data_quality || {};
    const leadSources = sumSources(daily, "leads_by_source");
    const channels = sumSources(daily, "orders_by_source_channel");
    const range = `${dayParts(meta.range_start).short} – ${dayParts(meta.range_end).short} · ${esc(meta.timezone || TZ)}`;
    const coverage = isNum(q.orders_in_range) && q.orders_in_range > 0
      ? `${fmtInt(q.orders_linked_to_lead)} of ${fmtInt(q.orders_in_range)} orders are linked to a lead — the rest cannot be traced to a lead source.` : "";
    return `
      <div class="gx-range">Last 7 days · ${range} <span class="gx-note">Today is still in progress, so its numbers may increase.</span></div>
      ${renderKpis(g)}
      <div class="gx-grid2">
        <div class="gx-panel"><h4>Leads, orders and wins by day</h4>${trendChart(daily)}</div>
        <div class="gx-panel"><h4>New leads by source</h4>${donut(leadSources, "new leads")}</div>
      </div>
      <div class="gx-panel"><h4>Pick a day to inspect</h4>${dayButtons(daily)}<div id="gx-detail-mount">${renderDetail()}</div></div>
      <div class="gx-grid2">
        <div class="gx-panel"><h4>Orders by source channel</h4>${bars(channels)}${coverage ? `<p class="gx-trunc">${esc(coverage)}</p>` : ""}</div>
        <div class="gx-panel"><h4>Data quality</h4>
          <ul class="gx-q">
            <li>${q.payment_tracking_available ? "Payment tracking is available for this period." : "Payment tracking is not available — collected revenue is not shown as ₹0."}</li>
            ${q.multiple_currencies ? "<li>More than one currency is in use; amounts are shown per currency, never summed.</li>" : ""}
            <li>${fmtInt(q.orders_without_channel)} orders have no recorded source channel.</li>
          </ul>
        </div>
      </div>`;
  }

  function growthError(e) {
    const missing = isMissingRpc(e);
    return `<div class="gx-error" role="alert"><b>7-day growth report is not available${missing ? " yet" : " right now"}.</b>
      ${missing ? "The report needs a one-time database update. No numbers are shown until it is applied." : "Please try Refresh. No numbers are shown until the data loads."}</div>`;
  }

  function paint(parts) {
    if (!cardEl) return;
    if (parts.growth !== undefined) cardEl.querySelector("[data-growth]").innerHTML = parts.growth;
    if (parts.insights !== undefined) cardEl.querySelector("[data-insights]").innerHTML = parts.insights;
  }

  function updateHero(items) {
    const el = document.getElementById("gxHeroInsight");
    if (!el) return;
    const top = items && items[0];
    if (!top) { el.hidden = true; return; }
    el.hidden = false;
    el.querySelector("[data-hero-text]").textContent = top.title || top.summary || "";
  }

  // ------------------------------------------------------------------ actions
  async function selectDay(date) {
    if (state.selected === date) { clearDay(); return; }
    state.selected = date; state.detail = null; state.detailError = ""; state.detailLoading = true;
    paint({ growth: renderGrowth() });
    try {
      const body = await fetchGrowth(date);
      if (state.selected !== date) return;           // user picked another day meanwhile
      state.detail = body.selected_day || null;
      if (!state.detail) state.detailError = "Details for this day were not returned.";
    } catch (e) {
      console.error("GLIME growth day detail:", e);
      if (state.selected === date) state.detailError = "Could not load this day. Please try again.";
    } finally {
      if (state.selected === date) { state.detailLoading = false; paint({ growth: renderGrowth() }); focusDetail(); }
    }
  }

  function clearDay() {
    const prev = state.selected;
    state.selected = null; state.detail = null; state.detailError = ""; state.detailLoading = false;
    paint({ growth: renderGrowth() });
    cardEl.querySelector(`.gx-day[data-date="${prev}"]`)?.focus();
  }

  function focusDetail() {
    const h = cardEl.querySelector(".gx-detail-head h3");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: false }); }
  }

  async function loadAll() {
    const btn = cardEl.querySelector(".gx-refresh");
    btn.disabled = true; btn.textContent = "Refreshing…";
    paint({ growth: '<div class="gx-empty-sm">Loading your last 7 days…</div>', insights: '<div class="gx-empty-sm">Checking insights…</div>' });
    try {
      if (!(await hasSession())) {
        paint({ growth: '<div class="gx-empty-sm">Please sign in to see your business growth.</div>', insights: "" });
        return;
      }
      const keep = state.selected;
      const [g, i] = await Promise.allSettled([fetchGrowth(null), fetchInsights()]);

      if (g.status === "fulfilled") {
        state.growth = g.value;
        state.selected = null; state.detail = null; state.detailError = "";
        paint({ growth: renderGrowth() });
        if (keep && g.value.daily.some((d) => d.date === keep)) selectDay(keep);
      } else {
        console.error("GLIME growth report:", g.reason);
        state.growth = null;
        paint({ growth: growthError(g.reason) });
      }

      if (i.status === "fulfilled") { paint({ insights: renderInsights(i.value) }); updateHero(i.value); }
      else {
        console.error("GLIME proactive insights:", i.reason);
        paint({ insights: '<div class="gx-error" role="alert">Proactive insights are temporarily unavailable. Please try Refresh.</div>' });
        updateHero([]);
      }
    } catch (e) {
      console.error("GLIME Daily Business Pulse:", e);
      paint({ growth: growthError(e), insights: "" });
    } finally {
      btn.disabled = false; btn.textContent = "↻ Refresh";
    }
  }

  // ------------------------------------------------------------ styles + mount
  function injectStyles() {
    if (document.getElementById("glime-pulse-style")) return;
    const s = document.createElement("style");
    s.id = "glime-pulse-style";
    s.textContent = `
      #${CARD_ID}{color:#e8eef5}
      #${CARD_ID} .gx-head{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-bottom:14px}
      #${CARD_ID} .gx-title{font-size:1.2rem;font-weight:700}
      #${CARD_ID} .gx-sub{color:#8b97a7;font-size:.82rem;margin-top:3px}
      #${CARD_ID} .gx-refresh{min-height:40px;padding:8px 14px;border-radius:10px;border:1px solid rgba(0,255,136,.35);background:rgba(0,255,136,.08);color:#00ff88;font:inherit;font-weight:700;font-size:.8rem;cursor:pointer}
      #${CARD_ID} .gx-refresh:hover{background:rgba(0,255,136,.16)} #${CARD_ID} .gx-refresh:disabled{opacity:.6;cursor:progress}
      #${CARD_ID} button:focus-visible{outline:2px solid #00ff88;outline-offset:2px}
      #${CARD_ID} .gx-range{font-size:.8rem;color:#9cabb9;margin-bottom:12px}
      #${CARD_ID} .gx-note{display:inline-block;margin-left:8px;color:#ffb454}
      #${CARD_ID} .gx-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px;perspective:900px}
      #${CARD_ID} .gx-kpi{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(155deg,rgba(255,255,255,.05),rgba(255,255,255,.01));box-shadow:0 10px 24px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.06);transition:transform .2s ease,border-color .2s ease;min-width:0}
      #${CARD_ID} .gx-kpi:hover{transform:translateY(-3px) rotateX(2deg)}
      #${CARD_ID} .gx-kpi.g{border-color:rgba(0,255,136,.25)} #${CARD_ID} .gx-kpi.c{border-color:rgba(59,213,255,.25)} #${CARD_ID} .gx-kpi.p{border-color:rgba(167,139,250,.28)} #${CARD_ID} .gx-kpi.a{border-color:rgba(255,180,84,.28)}
      #${CARD_ID} .gx-kpi-ico{flex:0 0 38px;height:38px;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.06);font-size:1.05rem}
      #${CARD_ID} .gx-kpi-body{min-width:0}
      #${CARD_ID} .gx-kpi-label{font-size:.74rem;color:#9cabb9}
      #${CARD_ID} .gx-kpi-value{font-size:1.45rem;font-weight:800;line-height:1.2;overflow-wrap:anywhere}
      #${CARD_ID} .gx-na{font-size:1rem;color:#8b97a7;font-weight:700}
      #${CARD_ID} .gx-kpi-sub{font-size:.7rem;color:#8b97a7;margin-top:2px}
      #${CARD_ID} .gx-kpi-sub.up{color:#00ff88} #${CARD_ID} .gx-kpi-sub.down{color:#ff8291}
      #${CARD_ID} .gx-chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
      #${CARD_ID} .gx-chip{padding:5px 11px;border-radius:999px;font-size:.72rem;color:#9cabb9;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03)}
      #${CARD_ID} .gx-grid2{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px;margin-bottom:14px}
      #${CARD_ID} .gx-panel{padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.2);min-width:0;margin-bottom:14px}
      #${CARD_ID} .gx-grid2 .gx-panel{margin-bottom:0}
      #${CARD_ID} .gx-panel h4,#${CARD_ID} .gx-sec h4{margin:0 0 12px;font-size:.9rem}
      #${CARD_ID} .gx-svg{width:100%;height:auto;display:block}
      #${CARD_ID} .gx-grid{stroke:rgba(255,255,255,.07);stroke-width:1}
      #${CARD_ID} .gx-axis{fill:#7d8a9c;font-size:10px}
      #${CARD_ID} .gx-sel{stroke:#00ff88;stroke-width:1.5;stroke-dasharray:3 3}
      #${CARD_ID} .gx-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:.72rem;color:#9cabb9;margin-top:6px}
      #${CARD_ID} .gx-legend i,#${CARD_ID} .gx-donut-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
      #${CARD_ID} .gx-donut-wrap{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
      #${CARD_ID} .gx-donut{width:130px;height:130px;flex:0 0 auto}
      #${CARD_ID} .gx-donut-n{fill:#fff;font-size:19px;font-weight:800} #${CARD_ID} .gx-donut-l{fill:#8b97a7;font-size:7px}
      #${CARD_ID} .gx-donut-legend,#${CARD_ID} .gx-bars,#${CARD_ID} .gx-q{list-style:none;margin:0;padding:0;flex:1;min-width:140px}
      #${CARD_ID} .gx-donut-legend li{display:flex;align-items:center;font-size:.78rem;padding:3px 0}
      #${CARD_ID} .gx-donut-legend li span{flex:1;overflow-wrap:anywhere} #${CARD_ID} .gx-donut-legend small{color:#8b97a7;font-weight:500}
      #${CARD_ID} .gx-bars li{display:grid;grid-template-columns:minmax(70px,.8fr) 2fr auto;gap:10px;align-items:center;font-size:.78rem;padding:4px 0}
      #${CARD_ID} .gx-bar{height:8px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden} #${CARD_ID} .gx-bar div{height:100%;border-radius:99px}
      #${CARD_ID} .gx-q li{font-size:.8rem;color:#9cabb9;line-height:1.5;padding:4px 0}
      #${CARD_ID} .gx-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
      #${CARD_ID} .gx-day{display:flex;flex-direction:column;gap:2px;padding:10px 8px;text-align:left;font:inherit;color:#e8eef5;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);cursor:pointer;transition:transform .15s ease,border-color .15s ease,background .15s ease;min-width:0}
      #${CARD_ID} .gx-day:hover{transform:translateY(-2px);border-color:rgba(0,240,255,.35)}
      #${CARD_ID} .gx-day.on{border-color:#00ff88;background:rgba(0,255,136,.09);box-shadow:0 0 0 1px rgba(0,255,136,.3)}
      #${CARD_ID} .gx-day-w{font-size:.68rem;color:#8b97a7;text-transform:uppercase;letter-spacing:.06em} #${CARD_ID} .gx-day-d{font-weight:700;font-size:.82rem}
      #${CARD_ID} .gx-day-n{font-size:.7rem;color:#9cabb9} #${CARD_ID} .gx-day-n b{color:#fff;font-size:.82rem}
      #${CARD_ID} .gx-detail,#${CARD_ID} .gx-detail-hint{margin-top:14px;padding:16px;border-radius:14px;border:1px solid rgba(0,255,136,.2);background:rgba(0,255,136,.03)}
      #${CARD_ID} .gx-detail-hint{color:#8b97a7;font-size:.82rem;border-style:dashed;border-color:rgba(255,255,255,.12);background:transparent}
      #${CARD_ID} .gx-detail-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      #${CARD_ID} .gx-detail-head h3{margin:0;font-size:1rem;flex:1;min-width:0}
      #${CARD_ID} .gx-close{min-width:40px;min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#9cabb9;cursor:pointer;font:inherit}
      #${CARD_ID} .gx-sec{margin-top:16px} #${CARD_ID} .gx-count{margin-left:6px;padding:1px 8px;border-radius:99px;background:rgba(255,255,255,.08);font-size:.72rem;color:#9cabb9}
      #${CARD_ID} .gx-tw{overflow-x:auto;border-radius:10px;border:1px solid rgba(255,255,255,.06)}
      #${CARD_ID} .gx-t{width:100%;border-collapse:collapse;font-size:.78rem}
      #${CARD_ID} .gx-t th{position:sticky;top:0;text-align:left;padding:8px 10px;color:#8b97a7;font-weight:600;background:#0d141c;white-space:nowrap}
      #${CARD_ID} .gx-t td{padding:8px 10px;border-top:1px solid rgba(255,255,255,.05);vertical-align:top}
      #${CARD_ID} .gx-t small{color:#8b97a7}
      #${CARD_ID} .gx-pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:.68rem;font-weight:700;background:rgba(255,255,255,.07);color:#cbd5e1;white-space:nowrap}
      #${CARD_ID} .gx-pill.high{background:rgba(255,130,145,.14);color:#ff8291} #${CARD_ID} .gx-pill.medium,#${CARD_ID} .gx-pill.warn{background:rgba(255,180,84,.14);color:#ffb454} #${CARD_ID} .gx-pill.low{background:rgba(0,255,136,.12);color:#00ff88}
      #${CARD_ID} .gx-unk{color:#6f7d90;font-style:italic}
      #${CARD_ID} .gx-trunc{font-size:.72rem;color:#7d8a9c;margin:8px 0 0}
      #${CARD_ID} .gx-empty-sm{font-size:.82rem;color:#8b97a7;padding:6px 0}
      #${CARD_ID} .gx-error{padding:14px;border-radius:12px;font-size:.84rem;line-height:1.55;color:#ffb3bc;background:rgba(255,130,145,.06);border:1px solid rgba(255,130,145,.3)}
      #${CARD_ID} .gx-insights-title{margin:22px 0 10px;font-size:1rem;font-weight:700}
      #${CARD_ID} .gx-ins{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
      #${CARD_ID} .gx-in{padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);border-left:3px solid #ffb454}
      #${CARD_ID} .gx-in.high{border-left-color:#ff8291} #${CARD_ID} .gx-in.low{border-left-color:#00ff88}
      #${CARD_ID} .gx-in header{display:flex;justify-content:space-between;gap:8px;align-items:flex-start} #${CARD_ID} .gx-in h4{margin:0;font-size:.9rem}
      #${CARD_ID} .gx-in p{margin:8px 0 0;font-size:.82rem;line-height:1.55;color:#b6c1cf} #${CARD_ID} .gx-in .gx-next{color:#e8eef5}
      #${CARD_ID} .gx-in .gx-ev{font-size:.74rem;color:#8b97a7} #${CARD_ID} .gx-in footer{margin-top:10px;font-size:.7rem;color:#6f7d90}
      @media (max-width:900px){#${CARD_ID} .gx-grid2{grid-template-columns:1fr}#${CARD_ID} .gx-days{grid-template-columns:repeat(4,minmax(0,1fr))}}
      @media (max-width:520px){
        #${CARD_ID} .gx-days{grid-template-columns:repeat(2,minmax(0,1fr))}
        #${CARD_ID} .gx-t thead{display:none}
        #${CARD_ID} .gx-t,#${CARD_ID} .gx-t tbody,#${CARD_ID} .gx-t tr,#${CARD_ID} .gx-t td{display:block;width:100%}
        #${CARD_ID} .gx-t tr{padding:8px 10px;border-top:1px solid rgba(255,255,255,.08)}
        #${CARD_ID} .gx-t td{border:0;padding:3px 0}
        #${CARD_ID} .gx-t td::before{content:attr(data-l) ": ";color:#7d8a9c;font-size:.7rem}
        #${CARD_ID} .gx-kpi-value{font-size:1.25rem}
      }
      @media (prefers-reduced-motion:reduce){#${CARD_ID} *{transition:none!important}#${CARD_ID} .gx-kpi:hover,#${CARD_ID} .gx-day:hover{transform:none}}`;
    document.head.appendChild(s);
  }

  function createCard() {
    const slot = document.getElementById(SLOT_ID);
    if (!slot) { console.error("GLIME Daily Business Pulse: slot #" + SLOT_ID + " not found."); return null; }
    let card = document.getElementById(CARD_ID);
    if (card) return card;
    card = document.createElement("section");
    card.id = CARD_ID;
    card.setAttribute("aria-label", "Daily Business Pulse");
    card.innerHTML = `
      <div class="gx-head">
        <div>
          <div class="gx-title">📈 Daily Business Pulse</div>
          <div class="gx-sub">Your business performance over the last 7 days</div>
        </div>
        <button type="button" class="gx-refresh">↻ Refresh</button>
      </div>
      <div data-growth><div class="gx-empty-sm">Loading your last 7 days…</div></div>
      <h3 class="gx-insights-title">Proactive insights</h3>
      <div data-insights><div class="gx-empty-sm">Checking insights…</div></div>`;
    slot.appendChild(card);
    return card;
  }

  function init() {
    try {
      injectStyles();
      cardEl = createCard();
      if (!cardEl) return;
      cardEl.querySelector(".gx-refresh").addEventListener("click", loadAll);
      cardEl.addEventListener("click", (ev) => {
        const day = ev.target.closest("[data-date]");
        if (day && cardEl.contains(day)) { selectDay(day.getAttribute("data-date")); return; }
        if (ev.target.closest("[data-close]")) clearDay();
      });
      cardEl.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && state.selected && cardEl.querySelector(".gx-detail")) clearDay();
      });
      loadAll();
    } catch (e) {
      console.error("GLIME Daily Business Pulse failed:", e);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
