/* =========================================================
   GLIME SHARED INBOX  (WhatsApp + Instagram)
   ---------------------------------------------------------
   One list, one thread per customer.
   - If the same customer chatted on both WhatsApp and Instagram
     (same lead / customer record), both chats are shown as ONE
     conversation. Every message carries its channel, and every
     reply shows WHO answered (WhatsApp AI, Instagram AI, Business).
   - Read-only: this page only SELECTs data (RLS limits every
     query to the logged-in client). Nothing is written.
   - Opening a chat never stops the list from updating. On a
     narrow screen the chat opens full-screen; Back (button or
     phone back) returns to the list exactly as it was.
========================================================= */
(() => {
  "use strict";

  const CFG = Object.assign(
    {
      supabaseUrl: "https://ufoulgbiqgjriwapuopc.supabase.co",
      supabaseKey: "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA",
      loginUrl: "login.html",
      refreshMs: 15000,
      convLimit: 300,
      msgLimit: 500,
      singlePaneQuery: "(max-width: 1100px)"
    },
    window.GLIME_INBOX_CONFIG || {}
  );

  if (!window.supabase) {
    console.error("[GLIME Inbox] Supabase library not loaded.");
    return;
  }

  const db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

  const CHANNELS = {
    whatsapp: { label: "WhatsApp" },
    instagram: { label: "Instagram" }
  };

  const state = {
    clientId: null,
    groups: [],
    filter: "all",
    search: "",
    selectedKey: null,
    selectedConvIds: [],
    threadToken: 0,
    contactToken: 0,
    busy: false
  };

  const $ = (id) => document.getElementById(id);
  const single = () => !!(window.matchMedia && window.matchMedia(CFG.singlePaneQuery).matches);

  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  /* ---------- formatting ---------- */

  function fmtClock(iso) {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  function isSameDay(a, b) {
    return a.toDateString() === b.toDateString();
  }

  function fmtListTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    if (isSameDay(d, now)) return fmtClock(iso);
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (isSameDay(d, y)) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function fmtDayLabel(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (isSameDay(d, now)) return "Today";
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (isSameDay(d, y)) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function initials(name) {
    const parts = String(name || "")
      .replace(/^@/, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function ts(iso) {
    const t = iso ? new Date(iso).getTime() : 0;
    return Number.isNaN(t) ? 0 : t;
  }

  function messageText(text, type) {
    const t = String(text || "").trim();
    if (t) return t;
    switch (String(type || "").toLowerCase()) {
      case "image": return "Image";
      case "video": return "Video";
      case "audio": return "Audio message";
      case "document": return "Document";
      case "sticker": return "Sticker";
      case "location": return "Location";
      case "interactive": return "Interactive message";
      case "template": return "Template message";
      case "unsupported": return "Unsupported message";
      default: return type ? "[" + type + "]" : "Message";
    }
  }

  /* Who answered: the AI specialist that sent the reply, or the business. */
  function answeredBy(slug) {
    const s = String(slug || "").toLowerCase();
    if (!s) return { label: "Business", kind: "business" };
    if (s.includes("whatsapp")) return { label: "WhatsApp Sales AI", kind: "ai" };
    if (s.includes("instagram")) return { label: "Instagram Sales AI", kind: "ai" };
    if (s.includes("follow")) return { label: "Follow-up AI", kind: "ai" };
    const pretty = s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { label: pretty, kind: "ai" };
  }

  /* ---------- auth ---------- */

  async function ensureClient() {
    if (state.clientId) return state.clientId;

    const {
      data: { user },
      error: authError
    } = await db.auth.getUser();

    if (authError || !user) {
      window.location.href = CFG.loginUrl;
      return null;
    }

    const { data, error } = await db
      .from("client_data")
      .select("client_id,business_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data?.client_id) throw new Error("No client profile is linked to this account.");

    state.clientId = data.client_id;
    return state.clientId;
  }

  /* ---------- data: conversation list ---------- */

  function rowsOf(result) {
    return result.status === "fulfilled" && !result.value.error ? result.value.data || [] : null;
  }

  function firstPerConversation(rows) {
    const map = new Map();
    (rows || []).forEach((r) => {
      if (!map.has(r.conversation_id)) map.set(r.conversation_id, r);
    });
    return map;
  }

  /* One group = one customer. Same lead (or customer) on both channels = one group. */
  function groupKeyOf(c) {
    if (c.lead_id) return "l:" + c.lead_id;
    if (c.customer_id) return "c:" + c.customer_id;
    return c.channel + ":" + c.id;
  }

  function buildGroups(convs) {
    const map = new Map();
    convs.forEach((c) => {
      const k = groupKeyOf(c);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    });

    const groups = [];
    map.forEach((list, key) => {
      list.sort((a, b) => ts(b.lastAt) - ts(a.lastAt));
      const latest = list[0];
      const wa = list.find((c) => c.channel === "whatsapp");
      const ig = list.find((c) => c.channel === "instagram");
      const channels = [];
      if (wa) channels.push("whatsapp");
      if (ig) channels.push("instagram");

      groups.push({
        key,
        convs: list,
        channels,
        name: (wa && wa.name) || (ig && ig.name) || latest.name,
        handles: list.map((c) => ({ channel: c.channel, text: c.handle })).filter((x) => x.text),
        preview: latest.preview,
        previewOut: latest.previewOut,
        previewChannel: latest.channel,
        lastAt: latest.lastAt,
        needsReply: latest.needsReply,
        status: list.some((c) => String(c.status).toLowerCase() === "open") ? "open" : latest.status,
        customer_id: (list.find((c) => c.customer_id) || {}).customer_id || null,
        lead_id: (list.find((c) => c.lead_id) || {}).lead_id || null
      });
    });

    groups.sort((a, b) => ts(b.lastAt) - ts(a.lastAt));
    return groups;
  }

  async function fetchGroups() {
    const cid = await ensureClient();
    if (!cid) return null;

    const [wa, ig] = await Promise.allSettled([
      db
        .from("whatsapp_conversations")
        .select(
          "id,customer_id,lead_id,customer_phone,customer_name,status,last_message_at,last_message_preview,last_message_direction,created_at"
        )
        .eq("client_id", cid)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(CFG.convLimit),
      db
        .from("instagram_conversations")
        .select(
          "id,customer_id,lead_id,instagram_user_id,username,status,last_message_at,last_inbound_at,last_outbound_at,created_at"
        )
        .eq("client_id", cid)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(CFG.convLimit)
    ]);

    const waRows = rowsOf(wa);
    const igRows = rowsOf(ig);
    const failed = [];
    if (!waRows) failed.push("WhatsApp");
    if (!igRows) failed.push("Instagram");

    // Instagram has no preview column, so read the latest message of each chat.
    const igIds = (igRows || []).map((r) => r.id);
    const igMsgs = igIds.length
      ? await Promise.allSettled([
          db
            .from("instagram_messages")
            .select("conversation_id,text_body,message_type,direction,created_at")
            .eq("client_id", cid)
            .in("conversation_id", igIds)
            .order("created_at", { ascending: false })
            .limit(600)
        ])
      : [{ status: "fulfilled", value: { data: [], error: null } }];
    const igLast = firstPerConversation(rowsOf(igMsgs[0]));

    const convs = [];

    (waRows || []).forEach((r) => {
      convs.push({
        channel: "whatsapp",
        id: r.id,
        name: String(r.customer_name || "").trim() || r.customer_phone || "Unknown",
        handle: r.customer_phone || "",
        preview: r.last_message_preview || "",
        previewOut: r.last_message_direction === "outbound",
        lastAt: r.last_message_at || r.created_at,
        needsReply: r.last_message_direction === "inbound",
        status: r.status || "open",
        customer_id: r.customer_id,
        lead_id: r.lead_id,
        raw: r
      });
    });

    (igRows || []).forEach((r) => {
      const last = igLast.get(r.id);
      const inAt = ts(r.last_inbound_at);
      const outAt = ts(r.last_outbound_at);
      convs.push({
        channel: "instagram",
        id: r.id,
        name: r.username ? "@" + r.username : r.instagram_user_id || "Unknown",
        handle: r.username ? "@" + r.username : "",
        preview: last ? messageText(last.text_body, last.message_type) : "",
        previewOut: last ? last.direction === "outbound" : false,
        lastAt: r.last_message_at || r.created_at,
        needsReply: inAt > 0 && inAt > outAt,
        status: r.status || "open",
        customer_id: r.customer_id,
        lead_id: r.lead_id,
        raw: r
      });
    });

    return { groups: buildGroups(convs), failed };
  }

  /* ---------- data: thread (all channels of one customer, merged) ---------- */

  async function fetchConvMessages(conv) {
    const cid = await ensureClient();
    const table = conv.channel === "whatsapp" ? "whatsapp_messages" : "instagram_messages";
    const { data, error } = await db
      .from(table)
      .select(
        "id,direction,message_type,text_body,media_id,status,created_at,provider_timestamp,specialist_module_slug"
      )
      .eq("client_id", cid)
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(CFG.msgLimit);
    if (error) throw error;

    return (data || []).map((m) => {
      const out = m.direction !== "inbound";
      const by = out ? answeredBy(m.specialist_module_slug) : null;
      return {
        id: conv.channel + ":" + m.id,
        channel: conv.channel,
        dir: out ? "out" : "in",
        byLabel: by ? by.label : "",
        byKind: by ? by.kind : "customer",
        text: messageText(m.text_body, m.message_type),
        type: m.message_type,
        isMedia: !m.text_body && !!m.media_id,
        status: out ? m.status || "" : "",
        at: m.provider_timestamp || m.created_at
      };
    });
  }

  async function fetchThread(group) {
    const parts = await Promise.all(group.convs.map(fetchConvMessages));
    return [].concat(...parts);
  }

  /* ---------- data: contact panel ---------- */

  async function fetchContact(group) {
    const cid = await ensureClient();
    const ids = group.convs.map((c) => c.id);
    const [cust, lead, ctl] = await Promise.allSettled([
      group.customer_id
        ? db
            .from("customers")
            .select("id,name,mobile,house_no,village_locality,district,state,pincode,landmark,created_at")
            .eq("id", group.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      group.lead_id
        ? db
            .from("leads")
            .select("id,name,status,priority,interest,source,next_follow_up_at,created_at")
            .eq("id", group.lead_id)
            .eq("client_id", cid)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db
        .from("client_conversation_controls")
        .select("conversation_id,ai_enabled,human_takeover_enabled,ai_mode")
        .eq("client_id", cid)
        .in("conversation_id", ids)
    ]);

    const one = (r) => (r.status === "fulfilled" && !r.value.error ? r.value.data : null);
    const ctlRows = one(ctl);
    return {
      customer: one(cust),
      lead: one(lead),
      controls: Array.isArray(ctlRows) ? ctlRows : []
    };
  }

  /* ---------- render: list ---------- */

  function visibleGroups() {
    const q = state.search.trim().toLowerCase();
    return state.groups.filter((g) => {
      if (state.filter === "needs") {
        if (!g.needsReply) return false;
      } else if (state.filter !== "all" && !g.channels.includes(state.filter)) {
        return false;
      }
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.preview.toLowerCase().includes(q) ||
        g.handles.some((x) => x.text.toLowerCase().includes(q))
      );
    });
  }

  function renderCounts() {
    const counts = { all: state.groups.length, whatsapp: 0, instagram: 0, needs: 0 };
    state.groups.forEach((g) => {
      g.channels.forEach((c) => {
        counts[c] += 1;
      });
      if (g.needsReply) counts.needs += 1;
    });
    document.querySelectorAll("[data-count]").forEach((el) => {
      el.textContent = String(counts[el.getAttribute("data-count")] ?? 0);
    });
  }

  function channelPills(channels) {
    const wrap = h("span", "ib-pills");
    channels.forEach((c) => wrap.appendChild(h("span", "ib-pill ch-" + c, CHANNELS[c].label)));
    return wrap;
  }

  function avatarFor(g, cls) {
    const kind = g.channels.length > 1 ? "both" : g.channels[0];
    return h("span", "ib-avatar " + (cls || "") + " ch-" + kind, initials(g.name));
  }

  function renderList() {
    const list = $("convList");
    const keepTop = list.scrollTop;
    list.textContent = "";
    renderCounts();

    const items = visibleGroups();
    if (!items.length) {
      const empty = h("div", "ib-empty");
      empty.appendChild(h("strong", "", state.groups.length ? "No matching conversations" : "No conversations yet"));
      empty.appendChild(
        h(
          "span",
          "",
          state.groups.length
            ? "Try a different filter or search."
            : "Messages from WhatsApp and Instagram will appear here."
        )
      );
      list.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((g) => {
      const btn = h("button", "ib-conv" + (g.key === state.selectedKey ? " active" : ""));
      btn.type = "button";
      btn.dataset.key = g.key;

      const body = h("span", "ib-conv-body");

      const top = h("span", "ib-conv-top");
      top.appendChild(h("span", "ib-conv-name", g.name));
      top.appendChild(h("span", "ib-conv-time", fmtListTime(g.lastAt)));

      const bottom = h("span", "ib-conv-bottom");
      const prev = h("span", "ib-conv-preview");
      if (g.previewOut && g.preview) prev.appendChild(h("em", "", "You: "));
      prev.appendChild(document.createTextNode(g.preview || "No messages"));
      bottom.appendChild(prev);
      if (g.needsReply) {
        const dot = h("span", "ib-dot");
        dot.title = "Waiting for a reply";
        bottom.appendChild(dot);
      }

      const meta = h("span", "ib-conv-meta");
      meta.appendChild(channelPills(g.channels));
      const wa = g.handles.find((x) => x.channel === "whatsapp");
      if (wa && g.channels.length === 1) meta.appendChild(h("span", "ib-conv-sub", wa.text));

      body.appendChild(top);
      body.appendChild(bottom);
      body.appendChild(meta);
      btn.appendChild(avatarFor(g));
      btn.appendChild(body);
      frag.appendChild(btn);
    });
    list.appendChild(frag);
    list.scrollTop = keepTop;
  }

  /* ---------- render: thread ---------- */

  function renderChatHeader(g) {
    const head = $("chatHead");
    head.textContent = "";
    if (!g) {
      head.classList.add("hidden");
      return;
    }
    head.classList.remove("hidden");

    const back = h("button", "ib-back");
    back.type = "button";
    back.id = "backBtn";
    back.setAttribute("aria-label", "Back to conversations");
    back.textContent = "‹";
    head.appendChild(back);

    head.appendChild(avatarFor(g, "big"));
    const info = h("div", "ib-chat-info");
    info.appendChild(h("strong", "", g.name));
    const sub = h("span", "");
    sub.appendChild(channelPills(g.channels));
    const phone = g.handles.find((x) => x.channel === "whatsapp");
    if (phone) sub.appendChild(h("span", "ib-conv-sub", phone.text));
    info.appendChild(sub);
    head.appendChild(info);

    const right = h("div", "ib-chat-right");
    if (g.status) right.appendChild(h("span", "ib-status st-" + String(g.status).toLowerCase(), g.status));
    const badge = h("span", "ib-ctl hidden");
    badge.id = "ctlBadge";
    right.appendChild(badge);
    head.appendChild(right);
  }

  function renderThread(msgs, keepScroll, multi) {
    const box = $("thread");
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const prevTop = box.scrollTop;
    box.textContent = "";

    const sorted = msgs.slice().sort((a, b) => ts(a.at) - ts(b.at));
    if (!sorted.length) {
      const empty = h("div", "ib-empty");
      empty.appendChild(h("strong", "", "No messages in this conversation"));
      box.appendChild(empty);
      return;
    }

    let lastDay = "";
    const frag = document.createDocumentFragment();
    sorted.forEach((m) => {
      const dayKey = new Date(m.at).toDateString();
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        frag.appendChild(h("div", "ib-day", fmtDayLabel(m.at)));
      }
      const row = h("div", "ib-row " + m.dir);
      const bubble = h("div", "ib-bubble by-" + m.byKind + " ch-" + m.channel);

      if (m.dir === "out") {
        const who = h("span", "ib-who");
        who.appendChild(h("i", "ib-chdot ch-" + m.channel));
        who.appendChild(document.createTextNode(m.byLabel));
        bubble.appendChild(who);
      }
      if (m.type && ["comment", "comment_reply"].includes(String(m.type))) {
        bubble.appendChild(h("span", "ib-tag", m.type === "comment" ? "Comment" : "Comment reply"));
      }
      bubble.appendChild(h("div", "ib-text" + (m.isMedia || !m.text ? " media" : ""), m.text));

      const foot = h("div", "ib-foot");
      if (multi || m.dir === "in") {
        const ch = h("span", "ib-footch");
        ch.appendChild(h("i", "ib-chdot ch-" + m.channel));
        ch.appendChild(document.createTextNode(CHANNELS[m.channel].label));
        foot.appendChild(ch);
      }
      foot.appendChild(h("span", "", fmtClock(m.at)));
      if (m.status) foot.appendChild(h("span", "ib-msg-status", m.status));
      bubble.appendChild(foot);

      row.appendChild(bubble);
      frag.appendChild(row);
    });
    box.appendChild(frag);

    if (keepScroll && !atBottom) box.scrollTop = prevTop;
    else box.scrollTop = box.scrollHeight;
  }

  /* ---------- render: contact ---------- */

  function kv(label, value) {
    const row = h("div", "ib-kv");
    row.appendChild(h("span", "", label));
    row.appendChild(h("strong", "", value || "—"));
    return row;
  }

  function renderContact(g, info) {
    const box = $("contactPanel");
    box.textContent = "";
    if (!g) {
      box.appendChild(h("div", "ib-empty small", "Select a conversation to see the customer details."));
      return;
    }

    const top = h("div", "ib-contact-top");
    top.appendChild(avatarFor(g, "xl"));
    top.appendChild(h("strong", "", g.name));
    top.appendChild(channelPills(g.channels));
    box.appendChild(top);

    const chat = h("section", "ib-card");
    chat.appendChild(h("h3", "", "Conversation"));
    chat.appendChild(kv("Status", g.status || "—"));
    chat.appendChild(kv("Last activity", fmtDateTime(g.lastAt)));
    g.convs.forEach((c) => {
      if (c.channel === "whatsapp") chat.appendChild(kv("WhatsApp", c.handle));
      else chat.appendChild(kv("Instagram", c.handle || c.raw.instagram_user_id));
    });
    box.appendChild(chat);

    if (!info) {
      box.appendChild(h("div", "ib-empty small", "Loading details…"));
      return;
    }

    const cust = info.customer;
    const custCard = h("section", "ib-card");
    custCard.appendChild(h("h3", "", "Customer"));
    if (cust) {
      custCard.appendChild(kv("Name", cust.name));
      custCard.appendChild(kv("Mobile", cust.mobile));
      const addr = [cust.house_no, cust.village_locality, cust.landmark, cust.district, cust.state, cust.pincode]
        .map((v) => String(v || "").trim())
        .filter(Boolean)
        .join(", ");
      custCard.appendChild(kv("Address", addr));
      custCard.appendChild(kv("Customer since", fmtDateTime(cust.created_at)));
    } else {
      custCard.appendChild(h("p", "ib-note", "No customer record linked yet."));
    }
    box.appendChild(custCard);

    const lead = info.lead;
    const leadCard = h("section", "ib-card");
    leadCard.appendChild(h("h3", "", "Lead"));
    if (lead) {
      leadCard.appendChild(kv("Status", lead.status));
      leadCard.appendChild(kv("Priority", lead.priority));
      leadCard.appendChild(kv("Interest", lead.interest));
      leadCard.appendChild(kv("Next follow-up", lead.next_follow_up_at ? fmtDateTime(lead.next_follow_up_at) : ""));
      const link = h("a", "ib-link", "Open Leads →");
      link.href = "leads.html";
      leadCard.appendChild(link);
    } else {
      leadCard.appendChild(h("p", "ib-note", "No lead linked yet."));
    }
    box.appendChild(leadCard);
  }

  function applyControlBadge(controls) {
    const badge = $("ctlBadge");
    if (!badge) return;
    badge.className = "ib-ctl";
    if (!controls || !controls.length) {
      badge.classList.add("hidden");
      return;
    }
    if (controls.some((c) => c.human_takeover_enabled)) {
      badge.textContent = "Human takeover";
      badge.classList.add("human");
    } else if (controls.every((c) => c.ai_enabled === false)) {
      badge.textContent = "AI off";
      badge.classList.add("off");
    } else {
      badge.textContent = "AI replying";
      badge.classList.add("on");
    }
  }

  /* ---------- selection / navigation ---------- */

  function currentGroup() {
    return state.groups.find((g) => g.key === state.selectedKey) || null;
  }

  function showError(msg) {
    const el = $("ibError");
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  async function loadThread(g, silent) {
    const token = ++state.threadToken;
    if (!silent) {
      const box = $("thread");
      box.textContent = "";
      box.appendChild(h("div", "ib-empty small", "Loading messages…"));
    }
    try {
      const msgs = await fetchThread(g);
      if (token !== state.threadToken) return;
      renderThread(msgs, silent, g.channels.length > 1);
    } catch (err) {
      if (token !== state.threadToken) return;
      console.error("[GLIME Inbox] thread failed:", err);
      if (!silent) {
        const box = $("thread");
        box.textContent = "";
        box.appendChild(h("div", "ib-empty small", "Messages could not be loaded. Please refresh."));
      }
    }
  }

  async function loadContact(g) {
    const token = ++state.contactToken;
    renderContact(g, null);
    try {
      const info = await fetchContact(g);
      if (token !== state.contactToken) return;
      renderContact(g, info);
      applyControlBadge(info.controls);
    } catch (err) {
      if (token !== state.contactToken) return;
      console.error("[GLIME Inbox] contact failed:", err);
      renderContact(g, { customer: null, lead: null, controls: [] });
    }
  }

  function openPane() {
    $("layout").classList.add("ib-open");
    if (single() && !(history.state && history.state.ibOpen)) {
      try {
        history.pushState({ ibOpen: true }, "");
      } catch (e) {
        /* history unavailable: the Back button still works */
      }
    }
  }

  function closePane() {
    $("layout").classList.remove("ib-open");
    state.selectedKey = null;
    state.selectedConvIds = [];
    state.threadToken++;
    state.contactToken++;
    $("chatBody").classList.add("hidden");
    $("chatEmpty").classList.remove("hidden");
    renderContact(null, null);
    renderList();
  }

  function selectGroup(key) {
    const g = state.groups.find((x) => x.key === key);
    if (!g) return;
    state.selectedKey = key;
    state.selectedConvIds = g.convs.map((c) => c.id);
    $("chatEmpty").classList.add("hidden");
    $("chatBody").classList.remove("hidden");
    renderList();
    renderChatHeader(g);
    loadThread(g, false);
    loadContact(g);
    openPane();
  }

  function goBack() {
    if (history.state && history.state.ibOpen) history.back();
    else closePane();
  }

  /* Keep the open chat selected even if its grouping changes (e.g. a lead gets linked). */
  function reselect() {
    if (!state.selectedKey) return;
    if (state.groups.some((g) => g.key === state.selectedKey)) return;
    const found = state.groups.find((g) => g.convs.some((c) => state.selectedConvIds.includes(c.id)));
    if (found) {
      state.selectedKey = found.key;
      state.selectedConvIds = found.convs.map((c) => c.id);
    } else {
      closePane();
    }
  }

  async function refresh(opts) {
    if (state.busy) return;
    state.busy = true;
    const btn = $("refreshBtn");
    if (opts && opts.manual) btn.disabled = true;
    try {
      const res = await fetchGroups();
      if (!res) return;
      state.groups = res.groups;
      showError(
        res.failed.length ? "Could not load " + res.failed.join(", ") + " conversations. Showing the rest." : ""
      );
      reselect();
      renderList();
      const g = currentGroup();
      if (g) {
        renderChatHeader(g);
        loadThread(g, true);
        loadContact(g);
      }
    } catch (err) {
      console.error("[GLIME Inbox] refresh failed:", err);
      showError(err && err.message ? err.message : "Inbox could not be loaded.");
    } finally {
      state.busy = false;
      btn.disabled = false;
      $("loadingScreen").classList.add("hidden");
    }
  }

  /* ---------- init ---------- */

  function bind() {
    $("convList").addEventListener("click", (e) => {
      const btn = e.target.closest(".ib-conv");
      if (btn) selectGroup(btn.dataset.key);
    });

    $("chatHead").addEventListener("click", (e) => {
      if (e.target.closest(".ib-back")) goBack();
    });

    document.querySelectorAll(".ib-filter").forEach((b) => {
      b.addEventListener("click", () => {
        state.filter = b.dataset.filter;
        document.querySelectorAll(".ib-filter").forEach((x) => x.classList.toggle("active", x === b));
        renderList();
      });
    });

    let timer = null;
    $("searchInput").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.search = e.target.value;
        renderList();
      }, 150);
    });

    $("refreshBtn").addEventListener("click", () => refresh({ manual: true }));

    // Phone / browser Back: close the open chat, list stays exactly as it was.
    window.addEventListener("popstate", () => {
      if (single() && $("layout").classList.contains("ib-open")) closePane();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && single() && $("layout").classList.contains("ib-open")) goBack();
    });

    setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, CFG.refreshMs);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
  }

  function start() {
    // A reload keeps the old history state; the chat is closed after a reload, so clear it.
    try {
      if (history.state && history.state.ibOpen) history.replaceState(null, "");
    } catch (e) {
      /* ignore */
    }
    bind();
    renderContact(null, null);
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
