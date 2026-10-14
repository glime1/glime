/* =========================================================
   GLIME LEADS — UI
   Supabase से सीधे बात नहीं करता; सब कुछ leads-data.js से।
   Addons (lead-*-addon.js) के hooks सुरक्षित: [data-open],
   [data-close], #detailContent, #timelineBox + H3 heading.
========================================================= */
(() => {
  "use strict";

  const D = window.GlimeLeadsData;
  if (!D) {
    console.error("[GLIME Leads] leads-data.js not loaded.");
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  const cap = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  const fmtDate = (v) => {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  };
  const fmtShort = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  };
  const ago = (v) => {
    if (!v) return "—";
    const m = (Date.now() - new Date(v).getTime()) / 60000;
    if (Number.isNaN(m)) return "—";
    if (m < 1) return "just now";
    if (m < 60) return `${Math.floor(m)}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    if (m < 10080) return `${Math.floor(m / 1440)}d ago`;
    if (m < 43200) return `${Math.floor(m / 10080)}w ago`;
    return `${Math.floor(m / 43200)}mo ago`;
  };
  const daysSince = (v) => (v ? (Date.now() - new Date(v).getTime()) / 86400000 : null);
  const initials = (n) =>
    String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
  const hue = (n) => {
    let h = 0;
    for (const c of String(n || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  };
  const toLocalInput = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  /* ---------- constants ---------- */

  const STATUSES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost", "paused"];
  const STAGES = [
    { key: "new", label: "New", status: "new" },
    { key: "contacted", label: "Contacted", status: "contacted" },
    { key: "qualified", label: "Qualified", status: "qualified" },
    { key: "followup", label: "Follow-up Due", status: null },
    { key: "won", label: "Won", status: "won" },
    { key: "lost", label: "Lost", status: "lost" }
  ];
  const SRC = {
    instagram: { label: "Instagram", color: "#e1306c" },
    whatsapp: { label: "WhatsApp", color: "#25d366" },
    website: { label: "Website", color: "#38bdf8" },
    offline: { label: "Offline", color: "#fbbf24" },
    voice: { label: "Voice AI", color: "#a78bfa" },
    lookbook: { label: "Lookbook", color: "#f472b6" },
    other: { label: "Other", color: "#94a3b8" },
    unknown: { label: "Unknown", color: "#64748b" }
  };
  const QUALIFIED = ["qualified", "proposal", "negotiation"];
  const BOARD_CAP = 60;

  const S = { leads: [], fields: [], view: "pipeline", activeId: null, dragId: null, extras: null };

  const byId = (id) => S.leads.find((l) => l.id === id);
  const isOpen = (l) => !["won", "lost"].includes(l.status);
  const followDue = (l) =>
    isOpen(l) && l.status !== "paused" && l.next_follow_up_at && new Date(l.next_follow_up_at) <= new Date();
  const stageOf = (l) => {
    if (l.status === "won") return "won";
    if (l.status === "lost") return "lost";
    if (followDue(l)) return "followup";
    if (l.status === "new") return "new";
    if (l.status === "contacted" || l.status === "paused") return "contacted";
    return "qualified";
  };
  const srcOf = (l) => SRC[l.source] || SRC.other;
  const interestOf = (l) => l.interest || l.product_service || "";

  /* ---------- toast / buttons ---------- */

  let toastTimer = null;
  function toast(text, error = false) {
    const el = $("toast");
    el.textContent = text;
    el.classList.toggle("error", !!error);
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 4200);
  }
  async function withBtn(btn, label, fn) {
    if (!btn || btn.disabled) return;
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast(e.message || "Something went wrong.", true);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  /* ---------- filters ---------- */

  function filtered() {
    const q = ($("searchInput").value || "").trim().toLowerCase();
    const src = $("sourceFilter").value;
    const pri = $("priorityFilter").value;
    return S.leads.filter((l) => {
      if (src && l.source !== src) return false;
      if (pri && l.priority !== pri) return false;
      if (!q) return true;
      return [l.name, l.mobile, l.whatsapp, l.interest, l.product_service, l.city_area, l.notes]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }

  /* ---------- KPIs ---------- */

  function renderKpis() {
    const L = S.leads;
    const won = L.filter((l) => l.status === "won").length;
    $("kpiTotal").textContent = L.length;
    $("kpiNew").textContent = L.filter((l) => l.status === "new").length;
    $("kpiQualified").textContent = L.filter((l) => QUALIFIED.includes(l.status)).length;
    $("kpiWon").textContent = won;
    $("kpiWonSub").textContent = L.length ? `${Math.round((won / L.length) * 100)}% of all leads` : "Won leads";
    $("kpiOverdue").textContent = L.filter(followDue).length;
  }

  /* ---------- AI Lead Intelligence (rule based, transparent) ---------- */

  function computeInsights() {
    const open = S.leads.filter((l) => isOpen(l) && l.status !== "paused");
    const contactFirst = [];
    const notResp = [];
    const followUp = [];

    open.forEach((l) => {
      let pts = 0;
      const why = [];

      if (followDue(l)) {
        const od = daysSince(l.next_follow_up_at);
        pts += 40 + Math.min(10, Math.floor(od));
        why.push(od >= 1 ? `Follow-up overdue by ${plural(Math.floor(od), "day")}` : "Follow-up is due now");
        followUp.push({ l, why: [why[0]], sort: -od });
      } else if (l.next_follow_up_at) {
        const hrs = (new Date(l.next_follow_up_at) - Date.now()) / 3600000;
        if (hrs >= 0 && hrs <= 24) {
          pts += 10;
          why.push("Follow-up due within 24 hours");
          followUp.push({ l, why: ["Follow-up due within 24 hours"], sort: hrs });
        }
      }
      if (l.priority === "urgent") { pts += 25; why.push("Marked urgent"); }
      else if (l.priority === "high") { pts += 15; why.push("High priority"); }

      if (l.status === "new" && !l.last_contacted_at) {
        const age = daysSince(l.created_at) || 0;
        pts += age >= 1 ? 20 : 12;
        why.push(age >= 1 ? `New lead waiting ${plural(Math.floor(age), "day")} — not contacted yet` : "New lead — not contacted yet");
      }
      if (QUALIFIED.includes(l.status)) { pts += 15; why.push(`Already ${l.status} — a good time to close`); }

      const idle = daysSince(l.last_activity_at);
      if (l.status !== "new" && idle !== null && idle >= 7) {
        pts += 10;
        why.push(`No activity for ${plural(Math.floor(idle), "day")}`);
      }

      if (l.status === "contacted" && l.last_contacted_at) {
        const since = daysSince(l.last_contacted_at);
        const laterAct = new Date(l.last_activity_at) - new Date(l.last_contacted_at) > 12 * 3600000;
        if (since >= 3 && !laterAct) {
          notResp.push({ l, why: [`Contacted ${plural(Math.floor(since), "day")} ago — no later activity recorded`], sort: -since });
        }
      }

      if (pts > 0) contactFirst.push({ l, why: why.slice(0, 3), pts });
    });

    contactFirst.sort((a, b) => b.pts - a.pts);
    notResp.sort((a, b) => a.sort - b.sort);
    followUp.sort((a, b) => a.sort - b.sort);
    return { contactFirst, notResp, followUp };
  }

  function renderAI() {
    const { contactFirst, notResp, followUp } = computeInsights();
    const group = (title, items, empty, max = 4) => `
      <div class="ai-col">
        <h4>${title}<em>${items.length}</em></h4>
        ${items.length
          ? items.slice(0, max).map((it) => `
            <div class="ai-item" data-open="${esc(it.l.id)}">
              <strong>${esc(it.l.name || "Unnamed")}</strong>
              <ul>${it.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
            </div>`).join("") + (items.length > max ? `<div class="ai-more">+${items.length - max} more</div>` : "")
          : `<div class="ai-empty">${empty}</div>`}
      </div>`;

    $("aiBody").innerHTML = `
      <p class="ai-note">These are suggestions based on your recorded lead data. They are not confirmed conversions.</p>
      <div class="ai-grid">
        ${group("Contact first", contactFirst, "No lead needs urgent attention right now.", 5)}
        ${group("No reply recorded", notResp, "No contacted lead is waiting for a reply.")}
        ${group("Follow-up needed", followUp, "No follow-ups due.")}
      </div>`;
  }

  /* ---------- Pipeline board ---------- */

  function cardHTML(l) {
    const src = srcOf(l);
    const due = followDue(l);
    const interest = interestOf(l);
    return `
      <article class="lc" draggable="true" data-open="${esc(l.id)}" data-id="${esc(l.id)}">
        <div class="lc-top">
          <span class="av" style="--h:${hue(l.name)}">${esc(initials(l.name))}</span>
          <div class="lc-id"><strong>${esc(l.name || "Unnamed")}</strong><small>${esc(l.phone || "No phone")}</small></div>
          ${l.score !== null ? `<span class="lc-score" title="Lead score">${Math.round(l.score)}</span>` : ""}
        </div>
        ${interest ? `<div class="lc-interest">${esc(interest)}</div>` : ""}
        <div class="lc-tags">
          <span class="src" style="--c:${src.color}"><i></i>${esc(src.label)}</span>
          <span class="pill pri-${esc(l.priority)}">${esc(cap(l.priority))}</span>
          <span class="pill status-${esc(l.status)}">${esc(l.status)}</span>
        </div>
        <div class="lc-meta">
          <span>Last: ${esc(ago(l.last_activity_at))}</span>
          <span class="${due ? "due" : ""}">Next: ${l.next_follow_up_at ? esc(fmtShort(l.next_follow_up_at)) : "not set"}</span>
        </div>
      </article>`;
  }

  function renderBoard() {
    const groups = Object.fromEntries(STAGES.map((s) => [s.key, []]));
    filtered().forEach((l) => groups[stageOf(l)].push(l));
    groups.followup.sort((a, b) => new Date(a.next_follow_up_at) - new Date(b.next_follow_up_at));

    $("board").innerHTML = STAGES.map((s) => {
      const items = groups[s.key];
      return `
        <section class="col" data-stage="${s.key}">
          <header class="col-head"><span class="col-dot st-${s.key}"></span><h3>${s.label}</h3><b>${items.length}</b></header>
          <div class="col-body">
            ${items.length ? items.slice(0, BOARD_CAP).map(cardHTML).join("") : '<div class="col-empty">No leads</div>'}
            ${items.length > BOARD_CAP ? `<div class="col-note">Showing ${BOARD_CAP} of ${items.length} — use search or filters</div>` : ""}
          </div>
        </section>`;
    }).join("");
  }

  /* ---------- List ---------- */

  function renderList() {
    const leads = filtered();
    $("leadsBody").innerHTML = leads.length
      ? leads.map((l) => `
        <tr>
          <td><div class="lead-name">${esc(l.name || "Unnamed")}</div><div class="sub">${esc(l.phone || "No phone")}</div></td>
          <td>${esc(interestOf(l) || "—")}<div class="sub">${esc(l.city_area || "")}</div></td>
          <td><span class="src" style="--c:${srcOf(l).color}"><i></i>${esc(srcOf(l).label)}</span></td>
          <td><span class="pill status-${esc(l.status)}">${esc(l.status)}</span></td>
          <td><span class="pill pri-${esc(l.priority)}">${esc(cap(l.priority))}</span></td>
          <td>${esc(fmtDate(l.next_follow_up_at))}</td>
          <td><button class="row-action" data-open="${esc(l.id)}">View</button></td>
        </tr>`).join("")
      : '<tr><td colspan="7" class="empty">No leads found.</td></tr>';
  }

  /* ---------- Analytics (real data only) ---------- */

  function renderAnalytics() {
    const L = S.leads;
    const box = $("viewAnalytics");
    if (!L.length) {
      box.innerHTML = '<div class="card empty-card">No leads yet. Analytics will appear after your first lead.</div>';
      return;
    }

    const grp = (l) => (QUALIFIED.includes(l.status) ? "qualified" : l.status);
    const cnt = (k) => L.filter((l) => grp(l) === k).length;
    const total = L.length;
    const fn = [["New", cnt("new")], ["Contacted", cnt("contacted")], ["Qualified", cnt("qualified")], ["Won", cnt("won")]];
    const maxN = Math.max(1, ...fn.map((f) => f[1]));

    const funnel = `
      <div class="fn">
        ${fn.map(([label, n]) => `
          <div class="fn-bar" style="width:${Math.max(30, Math.round((n / maxN) * 100))}%">${label} <small>${n} · ${Math.round((n / total) * 100)}%</small></div>`).join("")}
      </div>
      <div class="fn-extra">
        <span class="pill status-lost">Lost: ${cnt("lost")}</span>
        <span class="pill status-paused">Paused: ${cnt("paused")}</span>
        <span class="pill">Conversion: ${Math.round((cnt("won") / total) * 100)}%</span>
      </div>`;

    const order = ["instagram", "whatsapp", "website", "offline", "voice", "lookbook", "other", "unknown"];
    const required = ["instagram", "whatsapp", "website", "unknown"];
    const stats = {};
    order.forEach((k) => (stats[k] = { total: 0, qualified: 0, won: 0, overdue: 0 }));
    L.forEach((l) => {
      const s = stats[l.source] || stats.other;
      s.total++;
      if (QUALIFIED.includes(l.status)) s.qualified++;
      if (l.status === "won") s.won++;
      if (followDue(l)) s.overdue++;
    });
    const rows = order.filter((k) => stats[k].total > 0 || required.includes(k));

    let acc = 0;
    const slices = order.filter((k) => stats[k].total > 0).map((k) => {
      const pct = (stats[k].total / total) * 100;
      const el = `<circle r="15.9155" cx="21" cy="21" fill="none" stroke="${SRC[k].color}" stroke-width="6" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${-acc}" transform="rotate(-90 21 21)"/>`;
      acc += pct;
      return el;
    }).join("");

    const donut = `
      <div class="donut-wrap">
        <svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Leads by source">
          <circle r="15.9155" cx="21" cy="21" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="6"/>
          ${slices}
          <text x="21" y="22.5" text-anchor="middle" font-size="7" font-weight="700">${total}</text>
          <text x="21" y="28" text-anchor="middle" font-size="2.6" opacity=".6">leads</text>
        </svg>
        <div class="legend">
          ${rows.map((k) => `<div><i style="--c:${SRC[k].color}"></i>${SRC[k].label}<span>${stats[k].total} · ${Math.round((stats[k].total / total) * 100)}%</span></div>`).join("")}
        </div>
      </div>`;

    const table = `
      <div class="table-wrap"><table style="min-width:560px">
        <thead><tr><th>Source</th><th>Leads</th><th>Qualified</th><th>Converted</th><th>Overdue</th><th>Conversion</th></tr></thead>
        <tbody>${rows.map((k) => {
          const s = stats[k];
          return `<tr><td><span class="src" style="--c:${SRC[k].color}"><i></i>${SRC[k].label}</span></td><td>${s.total}</td><td>${s.qualified}</td><td>${s.won}</td><td>${s.overdue}</td><td>${s.total ? Math.round((s.won / s.total) * 100) + "%" : "—"}</td></tr>`;
        }).join("")}</tbody>
      </table></div>`;

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ d, key: d.toDateString(), n: 0 });
    }
    L.forEach((l) => {
      const hit = days.find((x) => x.key === new Date(l.created_at).toDateString());
      if (hit) hit.n++;
    });
    const maxD = Math.max(1, ...days.map((x) => x.n));
    const newIn14 = days.reduce((a, x) => a + x.n, 0);
    const trend = `
      <div class="trend">${days.map((x) => `<div title="${esc(x.d.toLocaleDateString())}: ${x.n}"><small>${x.n || ""}</small><i style="height:${Math.round((x.n / maxD) * 100)}%"></i></div>`).join("")}</div>
      <div class="trend-axis"><span>${esc(days[0].d.toLocaleDateString([], { day: "numeric", month: "short" }))}</span><span>${newIn14} new in 14 days</span><span>Today</span></div>`;

    box.innerHTML = `
      <div class="an-grid">
        <div class="card an-card"><h3>Stage distribution</h3><p>Current status of all leads.</p>${funnel}</div>
        <div class="card an-card"><h3>Leads by source</h3><p>Real source data. Leads without a source show as Unknown.</p>${donut}</div>
        <div class="card an-card wide"><h3>Source performance</h3><p>Conversion = Won ÷ total leads of that source.</p>${table}</div>
        <div class="card an-card wide"><h3>New leads — last 14 days</h3><p>Based on lead creation date.</p>${trend}</div>
      </div>`;
  }

  /* ---------- views ---------- */

  function renderView() {
    $("viewPipeline").classList.toggle("hidden", S.view !== "pipeline");
    $("viewList").classList.toggle("hidden", S.view !== "list");
    $("viewAnalytics").classList.toggle("hidden", S.view !== "analytics");
    $("toolbar").classList.toggle("hidden", S.view === "analytics");
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === S.view));
    if (S.view === "pipeline") renderBoard();
    else if (S.view === "list") renderList();
    else renderAnalytics();
  }
  function renderAll() {
    renderKpis();
    renderAI();
    renderView();
  }

  async function reload() {
    S.leads = await D.fetchLeads();
    renderAll();
  }

  /* ---------- drag & drop ---------- */

  const board = $("board");
  board.addEventListener("dragstart", (e) => {
    const c = e.target.closest(".lc");
    if (!c) return;
    S.dragId = c.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", S.dragId);
    c.classList.add("dragging");
  });
  board.addEventListener("dragend", () => {
    S.dragId = null;
    board.querySelectorAll(".dragging,.over").forEach((el) => el.classList.remove("dragging", "over"));
  });
  board.addEventListener("dragover", (e) => {
    const col = e.target.closest(".col");
    if (!col || !S.dragId) return;
    e.preventDefault();
    board.querySelectorAll(".over").forEach((el) => el !== col && el.classList.remove("over"));
    col.classList.add("over");
  });
  board.addEventListener("drop", async (e) => {
    const col = e.target.closest(".col");
    if (!col || !S.dragId) return;
    e.preventDefault();
    const lead = byId(S.dragId);
    const stage = STAGES.find((s) => s.key === col.dataset.stage);
    S.dragId = null;
    board.querySelectorAll(".over").forEach((el) => el.classList.remove("over"));
    if (!lead || !stage) return;

    if (!stage.status) {
      toast("Follow-up Due is automatic. Set a follow-up date on the lead instead.", true);
      return;
    }
    if (stageOf(lead) === stage.key) return;
    if (lead.status === stage.status) {
      toast(`Already "${cap(lead.status)}". Update its follow-up date to move it out of Follow-up Due.`, true);
      return;
    }

    const prev = lead.status;
    lead.status = stage.status;
    renderAll();
    try {
      Object.assign(lead, await D.setStatus(lead.id, stage.status));
      renderAll();
      toast(`Moved to ${stage.label}.`);
      window.GLIMELeadTimeline?.refresh?.();
    } catch (err) {
      lead.status = prev;
      renderAll();
      toast(err.message || "Could not update status.", true);
    }
  });

  /* ---------- side panel ---------- */

  const waDigits = (p) => {
    const d = String(p || "").replace(/\D/g, "");
    return d.length === 10 ? "91" + d : d;
  };

  function panelHTML(l) {
    const src = srcOf(l);
    const tel = l.mobile || l.whatsapp;
    const wa = waDigits(l.whatsapp || l.mobile);
    const info = [
      ["Mobile", l.mobile], ["WhatsApp", l.whatsapp], ["City / Area", l.city_area],
      ["Source", src.label], ["Priority", cap(l.priority)], ["Created", fmtDate(l.created_at)],
      ["Last contacted", fmtDate(l.last_contacted_at)], ["Last activity", fmtDate(l.last_activity_at)]
    ];
    const enquiry = [
      ["Interest", l.interest], ["Product / Service", l.product_service],
      ["Budget", l.budget ? `${l.budget} ${l.budget_currency || "INR"}` : ""]
    ];
    return `
      <div class="dp-head" id="dpHead">
        <span class="av lg" style="--h:${hue(l.name)}">${esc(initials(l.name))}</span>
        <div>
          <h2>${esc(l.name || "Unnamed Lead")}</h2>
          <div class="sub"><span class="src" style="--c:${src.color}"><i></i>${esc(src.label)}</span>
            <span class="pill status-${esc(l.status)}" id="dpStatusPill">${esc(l.status)}</span></div>
        </div>
      </div>
      <div class="dp-quick" id="dpQuick">
        ${tel ? `<a class="ghost-btn" href="tel:${esc(tel)}">📞 Call</a>` : ""}
        ${wa ? `<a class="ghost-btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/${esc(wa)}">💬 WhatsApp</a>` : ""}
      </div>
      <section class="dp-sec" id="dpStatus">
        <h3>Status</h3>
        <div class="dp-row">
          <select id="detailStatus" class="input">${STATUSES.map((s) => `<option value="${s}" ${s === l.status ? "selected" : ""}>${cap(s)}</option>`).join("")}</select>
          <button id="saveStatus" class="primary-btn" type="button">Save status</button>
        </div>
      </section>
      <section class="dp-sec" id="dpInfo">
        <h3>Contact details</h3>
        <div class="detail-grid">${info.map(([k, v]) => `<div class="detail-item"><small>${esc(k)}</small><strong>${esc(v || "—")}</strong></div>`).join("")}</div>
      </section>
      <section class="dp-sec" id="dpEnquiry">
        <h3>Enquiry</h3>
        <div class="detail-grid">
          ${enquiry.map(([k, v]) => `<div class="detail-item"><small>${esc(k)}</small><strong>${esc(v || "—")}</strong></div>`).join("")}
          <div class="detail-item full"><small>Notes on lead</small><strong>${esc(l.notes || "—")}</strong></div>
        </div>
      </section>
      <section class="dp-sec" id="dpCustom"><h3>Custom fields</h3><div class="sub">Loading…</div></section>
      <section class="dp-sec" id="dpTasks">
        <h3>Follow-up &amp; tasks</h3>
        <div class="dp-row">
          <input id="followInput" class="input" type="datetime-local" value="${esc(toLocalInput(l.next_follow_up_at))}">
          <button id="saveFollow" class="primary-btn" type="button">Save</button>
          <button id="clearFollow" class="ghost-btn" type="button">Clear</button>
        </div>
        <div class="sub" id="followText">${l.next_follow_up_at ? "Next follow-up: " + esc(fmtDate(l.next_follow_up_at)) : "No follow-up scheduled."}</div>
        <div id="actionList" style="margin-top:10px"><div class="sub">Loading suggested actions…</div></div>
      </section>
      <section class="dp-sec" id="dpConv"><h3>Conversation history</h3><div class="sub">Loading…</div></section>
      <section class="dp-sec" id="dpNotes">
        <h3>Notes</h3>
        <textarea id="noteInput" class="input" rows="3" maxlength="2000" placeholder="Write a note about this lead…"></textarea>
        <div class="dp-row" style="margin-top:8px"><button id="addNote" class="primary-btn" type="button">Add note</button></div>
        <div id="noteList"></div>
      </section>
      <section class="dp-sec" id="dpRelated"><h3>Customer &amp; orders</h3><div class="sub">Loading…</div></section>
      <div class="dp-danger"><button id="deleteLead" class="danger-btn" type="button">Delete lead</button></div>
      <h3 class="dp-h3" id="tlHeading">Timeline</h3>
      <div id="timelineBox" class="timeline">Loading…</div>`;
  }

  function openDetail(id) {
    const lead = byId(id);
    if (!lead) return;
    S.activeId = id;
    S.extras = null;
    $("detailContent").innerHTML = panelHTML(lead);
    $("detailModal").classList.remove("hidden");
    document.body.classList.add("no-scroll");
    bindPanel(lead);
    loadExtras(lead).catch((e) => console.error(e));
  }

  function closeModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add("hidden");
    if (id === "detailModal") {
      S.activeId = null;
      document.body.classList.remove("no-scroll");
    }
  }

  function bindPanel(l) {
    $("saveStatus").onclick = (e) =>
      withBtn(e.currentTarget, "Saving…", async () => {
        Object.assign(l, await D.setStatus(l.id, $("detailStatus").value));
        const pill = $("dpStatusPill");
        if (pill) { pill.textContent = l.status; pill.className = `pill status-${l.status}`; }
        renderAll();
        window.GLIMELeadTimeline?.refresh?.();
        toast("Status updated.");
      });

    const afterFollow = () => {
      $("followText").textContent = l.next_follow_up_at ? "Next follow-up: " + fmtDate(l.next_follow_up_at) : "No follow-up scheduled.";
      $("followInput").value = toLocalInput(l.next_follow_up_at);
      renderAll();
      window.GLIMELeadTimeline?.refresh?.();
    };
    $("saveFollow").onclick = (e) =>
      withBtn(e.currentTarget, "Saving…", async () => {
        const v = $("followInput").value;
        if (!v) throw new Error("Pick a follow-up date and time first.");
        Object.assign(l, await D.setFollowUp(l.id, new Date(v).toISOString()));
        afterFollow();
        toast("Follow-up saved.");
      });
    $("clearFollow").onclick = (e) =>
      withBtn(e.currentTarget, "Clearing…", async () => {
        Object.assign(l, await D.setFollowUp(l.id, null));
        afterFollow();
        toast("Follow-up cleared.");
      });

    $("addNote").onclick = (e) =>
      withBtn(e.currentTarget, "Adding…", async () => {
        const text = $("noteInput").value.trim();
        if (!text) throw new Error("Write a note first.");
        const row = await D.addNote(l.id, text);
        if (S.extras && Array.isArray(S.extras.timeline)) S.extras.timeline.unshift(row);
        $("noteInput").value = "";
        renderNotes();
        window.GLIMELeadTimeline?.refresh?.();
        toast("Note added.");
      });

    $("deleteLead").onclick = (e) => {
      if (!window.confirm(`Delete lead "${l.name || "Unnamed Lead"}"? This will also remove its timeline, custom data and related lead records.`)) return;
      withBtn(e.currentTarget, "Deleting…", async () => {
        await D.deleteLead(l.id);
        S.leads = S.leads.filter((x) => x.id !== l.id);
        document.querySelector("#detailModal [data-close]")?.click();
        renderAll();
        toast("Lead deleted successfully.");
      });
    };
  }

  /* ----- panel extras ----- */

  const CONV_TYPES = ["message_received", "message_sent", "voice_call", "contact_attempt"];

  function fmtCustom(field, v) {
    if (v === null || v === undefined || v === "") return "—";
    if (field.field_type === "boolean") return v === true || v === "true" ? "Yes" : "No";
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  }

  function renderNotes() {
    const box = $("noteList");
    if (!box) return;
    const notes = (S.extras?.timeline || []).filter((e) => e.event_type === "note_added");
    box.innerHTML = notes.length
      ? notes.map((n) => `<div class="note-item">${esc(n.description || "")}<small>${esc(fmtDate(n.created_at))}</small></div>`).join("")
      : '<div class="sub" style="margin-top:8px">No notes yet.</div>';
  }

  function renderConv() {
    const sec = $("dpConv");
    if (!sec) return;
    const tl = S.extras?.timeline;
    if (tl === null) { sec.innerHTML = "<h3>Conversation history</h3><div class='sub'>Conversation is unavailable right now.</div>"; return; }
    const ev = (tl || []).filter((e) => CONV_TYPES.includes(e.event_type)).slice(0, 10);
    sec.innerHTML = `<h3>Conversation history</h3>` + (ev.length
      ? `<div class="bubble-list">${ev.map((e) => `<div class="bubble ${e.event_type === "message_sent" ? "out" : ""}">${esc(e.description || e.title || cap(e.event_type))}<small>${esc(cap(e.event_type))} · ${esc(fmtDate(e.created_at))}</small></div>`).join("")}</div>`
      : '<div class="sub">No conversation history recorded for this lead yet.</div>');
  }

  function renderActions() {
    const box = $("actionList");
    if (!box) return;
    const acts = S.extras?.actions;
    if (acts === null) { box.innerHTML = ""; return; }
    box.innerHTML = acts.length
      ? `<div class="sub" style="margin-bottom:4px">Suggested actions</div>` + acts.slice(0, 5).map((a) => `<div class="mini-row"><span>${esc(cap(a.action_type))}${a.reason ? `<div class="sub">${esc(a.reason)}</div>` : ""}</span><span class="pill">${esc(a.status)}</span></div>`).join("")
      : '<div class="sub">No suggested actions yet.</div>';
  }

  function renderCustomDetail() {
    const sec = $("dpCustom");
    if (!sec) return;
    const values = S.extras?.values;
    if (values === null) { sec.innerHTML = "<h3>Custom fields</h3><div class='sub'>Custom data unavailable.</div>"; return; }
    const map = new Map(values.map((v) => [v.field_definition_id, v.value]));
    const shown = S.fields.filter((f) => f.is_active && map.has(f.id));
    sec.innerHTML = "<h3>Custom fields</h3>" + (shown.length
      ? `<div class="detail-grid">${shown.map((f) => `<div class="detail-item"><small>${esc(f.field_label)}</small><strong>${esc(fmtCustom(f, map.get(f.id)))}</strong></div>`).join("")}</div>`
      : '<div class="sub">No custom data saved for this lead.</div>');
  }

  function renderRelated(lead) {
    const sec = $("dpRelated");
    if (!sec) return;
    const { customer, orders } = S.extras;
    let html = "<h3>Customer &amp; orders</h3>";
    if (customer) {
      html += `<div class="mini-row"><span><strong>${esc(customer.name || "Customer")}</strong><div class="sub">${esc(customer.mobile || "")}</div></span><a class="ghost-btn" href="customer.html?id=${encodeURIComponent(customer.id)}">View customer</a></div>`;
    } else if (lead.customer_id) {
      html += `<div class="mini-row"><span>Customer linked</span><a class="ghost-btn" href="customer.html?id=${encodeURIComponent(lead.customer_id)}">View customer</a></div>`;
    }
    if (orders === null) {
      html += '<div class="sub">Orders could not be loaded.</div>';
    } else if (orders.length) {
      html += orders.slice(0, 5).map((o) => {
        const num = o.order_number || o.order_no || "#" + String(o.id || "").slice(0, 8);
        const amt = o.total_amount ?? o.total ?? o.amount;
        return `<div class="mini-row"><span>${esc(num)}<div class="sub">${esc(fmtDate(o.created_at))}${amt != null ? " · ₹" + esc(amt) : ""}</div></span><span class="pill">${esc(o.status || o.order_status || "—")}</span></div>`;
      }).join("") + '<div style="margin-top:8px"><a class="ghost-btn" href="orders.html">Open Orders</a></div>';
    }
    if (!customer && !lead.customer_id && (!orders || !orders.length)) {
      html += '<div class="sub">No customer or order linked to this lead yet.</div>';
    }
    sec.innerHTML = html;
  }

  function renderBaseTimeline(lead) {
    const box = $("timelineBox");
    if (!box || box.dataset.phase5LeadId === lead.id) return;
    const tl = S.extras?.timeline;
    box.innerHTML = tl === null ? "Timeline unavailable."
      : tl.length
        ? tl.map((e) => `<div class="event"><strong>${esc(e.title || cap(e.event_type))}</strong><div class="sub">${esc(fmtDate(e.created_at))} · ${esc(e.source || "system")}</div><p>${esc(e.description || "")}</p></div>`).join("")
        : '<div class="sub">No timeline events yet.</div>';
  }

  async function loadExtras(lead) {
    const x = await D.fetchLeadExtras(lead);
    if (S.activeId !== lead.id) return;
    S.extras = x;
    renderCustomDetail();
    renderActions();
    renderConv();
    renderNotes();
    renderRelated(lead);
    renderBaseTimeline(lead);
  }

  /* ---------- custom fields ---------- */

  function parseOptions(raw) {
    return String(raw || "").split(/\r?\n|,/).map((v) => v.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  }

  function renderFieldInput(f) {
    const req = f.is_required ? "required" : "";
    const name = `custom_${f.id}`;
    let control;
    if (f.field_type === "select" || f.field_type === "multiselect") {
      const opts = Array.isArray(f.options) ? f.options : [];
      const multi = f.field_type === "multiselect";
      control = `<select class="input" name="${esc(name)}" ${multi ? "multiple" : ""} ${req}>${multi ? "" : '<option value="">Select an option</option>'}${opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>`;
    } else if (f.field_type === "number") control = `<input class="input" name="${esc(name)}" type="number" step="any" ${req}>`;
    else if (f.field_type === "date") control = `<input class="input" name="${esc(name)}" type="date" ${req}>`;
    else if (f.field_type === "boolean") control = `<select class="input" name="${esc(name)}" ${req}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select>`;
    else control = `<input class="input" name="${esc(name)}" type="text" maxlength="1000" ${req}>`;
    return `<label>${esc(f.field_label)}${f.is_required ? " *" : ""}${control}</label>`;
  }

  function renderFields() {
    const active = S.fields.filter((f) => f.is_active);
    $("customFieldsSummary").innerHTML = active.length
      ? active.map((f) => `<span class="field-chip">${esc(f.field_label)}<small>${esc(f.field_type)}</small></span>`).join("")
      : '<span class="sub">No custom fields yet. Add fields for your business from “Manage fields”.</span>';

    $("dynamicLeadFields").innerHTML = active.length
      ? `<div class="dynamic-fields-title">Custom fields</div><div class="dynamic-fields-grid">${active.map(renderFieldInput).join("")}</div>`
      : "";

    $("fieldDefinitionsList").innerHTML = S.fields.length
      ? S.fields.map((f) => `<div class="field-definition-row"><div><strong>${esc(f.field_label)}</strong><div class="sub">${esc(f.field_key)} · ${esc(f.field_type)} · ${f.is_required ? "Required" : "Optional"}</div></div><button class="row-action field-toggle" data-field-id="${esc(f.id)}" data-active="${f.is_active}">${f.is_active ? "Disable" : "Enable"}</button></div>`).join("")
      : '<div class="sub">No custom fields created yet.</div>';
  }

  function collectCustomValues(form) {
    const out = [];
    S.fields.filter((f) => f.is_active).forEach((f) => {
      const el = form.elements[`custom_${f.id}`];
      if (!el) return;
      let v;
      if (f.field_type === "multiselect") v = Array.from(el.selectedOptions).map((o) => o.value).filter(Boolean);
      else if (f.field_type === "boolean") v = el.value === "" ? null : el.value === "true";
      else v = el.value?.trim ? el.value.trim() : el.value;
      if (v !== null && v !== "" && !(Array.isArray(v) && !v.length)) out.push({ field_definition_id: f.id, value: v });
    });
    return out;
  }

  /* ---------- events ---------- */

  let saving = false;
  $("leadForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saving) return;
    saving = true;
    const form = e.target;
    const btn = e.submitter || form.querySelector('button[type="submit"]');
    const old = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try {
      const fd = new FormData(form);
      const c = (k) => String(fd.get(k) || "").trim();
      const payload = {
        name: c("name"),
        mobile: c("mobile") || null,
        whatsapp: c("whatsapp") || null,
        city_area: c("city_area") || null,
        interest: c("interest") || null,
        product_service: c("product_service") || null,
        budget: fd.get("budget") ? Number(fd.get("budget")) : null,
        priority: c("priority") || "normal",
        next_follow_up_at: fd.get("next_follow_up_at") ? new Date(fd.get("next_follow_up_at")).toISOString() : null,
        notes: c("notes") || null
      };
      if (!payload.name) throw new Error("Name is required.");
      const { lead, warnings } = await D.createLead(payload, collectCustomValues(form));
      form.reset();
      closeModal("leadModal");
      S.leads.unshift(lead);
      renderAll();
      warnings.length ? toast(warnings[0], true) : toast("Lead saved successfully.");
    } catch (err) {
      console.error(err);
      toast(err.message || "Could not save lead.", true);
    } finally {
      saving = false;
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  });

  $("fieldForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(e.target);
      const label = String(fd.get("field_label") || "").trim();
      const key = String(fd.get("field_key") || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
      const type = String(fd.get("field_type") || "text");
      if (!label) throw new Error("Field label is required.");
      if (!key) throw new Error("Field key is required.");
      const multi = type === "select" || type === "multiselect";
      const options = multi ? parseOptions(fd.get("options")) : [];
      if (multi && !options.length) throw new Error("Add at least one option for this field type.");
      await D.createCustomField({
        field_key: key, field_label: label, field_type: type, options,
        is_required: fd.get("is_required") === "on",
        sort_order: Number(fd.get("sort_order") || 0)
      });
      e.target.reset();
      $("fieldType").dispatchEvent(new Event("change"));
      S.fields = await D.fetchCustomFields();
      renderFields();
      toast("Custom field created.");
    } catch (err) {
      toast(err.message || "Could not create field.", true);
    }
  });

  $("fieldType").addEventListener("change", () => {
    $("optionsField").classList.toggle("hidden", !["select", "multiselect"].includes($("fieldType").value));
  });

  ["searchInput", "sourceFilter", "priorityFilter"].forEach((id) =>
    $(id).addEventListener(id === "searchInput" ? "input" : "change", renderView)
  );
  $("refreshBtn").addEventListener("click", (e) =>
    withBtn(e.currentTarget, "Refreshing…", async () => { await reload(); toast("Leads refreshed."); })
  );
  $("addLeadBtn").addEventListener("click", () => $("leadModal").classList.remove("hidden"));
  $("manageFieldsBtn").addEventListener("click", () => $("fieldsModal").classList.remove("hidden"));
  $("logoutBtn").addEventListener("click", async () => {
    await D.db.auth.signOut();
    window.location.href = "login.html";
  });

  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) openDetail(open.dataset.open);

    const close = e.target.closest("[data-close]");
    if (close) closeModal(close.dataset.close);

    const tab = e.target.closest(".tab");
    if (tab) { S.view = tab.dataset.view; renderView(); }

    const toggle = e.target.closest(".field-toggle");
    if (toggle) {
      D.toggleCustomField(toggle.dataset.fieldId, toggle.dataset.active !== "true")
        .then(() => D.fetchCustomFields())
        .then((f) => { S.fields = f; renderFields(); toast("Custom field updated."); })
        .catch((err) => toast(err.message, true));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const openModalEl = document.querySelector(".modal:not(.hidden), .drawer:not(.hidden)");
    openModalEl?.querySelector("[data-close]")?.click();
  });

  /* ---------- init ---------- */

  function openLead(id) {
    const b = document.createElement("button");
    b.hidden = true;
    b.dataset.open = id;
    document.body.appendChild(b);
    b.click();
    b.remove();
  }

  (async () => {
    try {
      const cid = await D.ensureClient();
      if (!cid) return;
      $("clientBadge").textContent = cid;
      const [leads, fields] = await Promise.all([D.fetchLeads(), D.fetchCustomFields()]);
      S.leads = leads;
      S.fields = fields;
      renderFields();
      renderAll();
      const deep = new URLSearchParams(location.search).get("lead");
      if (deep && byId(deep)) openLead(deep);
    } catch (err) {
      console.error(err);
      $("board").innerHTML = '<div class="col-empty">Could not load leads.</div>';
      toast(err.message || "Could not load Leads.", true);
    } finally {
      $("loadingScreen").classList.add("hidden");
      $("fieldType").dispatchEvent(new Event("change"));
    }
  })();
})();
