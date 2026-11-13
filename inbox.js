/* =========================================================
   GLIME SHARED INBOX
   ---------------------------------------------------------
   WhatsApp + Instagram + Voice conversations in one place.
   Read-only: this page only SELECTs data (RLS limits every
   query to the logged-in client). Nothing is written.
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
      voiceLimit: 100,
      msgLimit: 500
    },
    window.GLIME_INBOX_CONFIG || {}
  );

  if (!window.supabase) {
    console.error("[GLIME Inbox] Supabase library not loaded.");
    return;
  }

  const db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

  const CHANNELS = {
    whatsapp: { label: "WhatsApp", short: "WA" },
    instagram: { label: "Instagram", short: "IG" },
    voice: { label: "Voice", short: "VO" }
  };

  const state = {
    clientId: null,
    convs: [],
    failed: [],
    filter: "all",
    search: "",
    selectedKey: null,
    threadToken: 0,
    contactToken: 0,
    busy: false
  };

  const $ = (id) => document.getElementById(id);

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

  async function fetchConversations() {
    const cid = await ensureClient();
    if (!cid) return null;

    const [wa, ig, vo] = await Promise.allSettled([
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
        .limit(CFG.convLimit),
      db
        .from("voice_conversations")
        .select("id,status,started_at,ended_at,created_at")
        .eq("client_id", cid)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(CFG.voiceLimit)
    ]);

    const waRows = rowsOf(wa);
    const igRows = rowsOf(ig);
    const voRows = rowsOf(vo);
    const failed = [];
    if (!waRows) failed.push("WhatsApp");
    if (!igRows) failed.push("Instagram");
    if (!voRows) failed.push("Voice");

    // Instagram and Voice have no preview column, so read the latest messages.
    const igIds = (igRows || []).map((r) => r.id);
    const voIds = (voRows || []).map((r) => r.id);

    const [igMsgs, voMsgs] = await Promise.allSettled([
      igIds.length
        ? db
            .from("instagram_messages")
            .select("conversation_id,text_body,message_type,direction,created_at")
            .eq("client_id", cid)
            .in("conversation_id", igIds)
            .order("created_at", { ascending: false })
            .limit(600)
        : Promise.resolve({ data: [], error: null }),
      voIds.length
        ? db
            .from("voice_messages")
            .select("conversation_id,role,message_text,created_at")
            .in("conversation_id", voIds)
            .order("created_at", { ascending: false })
            .limit(600)
        : Promise.resolve({ data: [], error: null })
    ]);

    const igLast = firstPerConversation(rowsOf(igMsgs));
    const voLast = firstPerConversation(rowsOf(voMsgs));

    const out = [];

    (waRows || []).forEach((r) => {
      const name = String(r.customer_name || "").trim() || r.customer_phone || "Unknown";
      out.push({
        key: "whatsapp:" + r.id,
        channel: "whatsapp",
        id: r.id,
        name,
        sub: r.customer_phone || "",
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
      const name = r.username ? "@" + r.username : r.instagram_user_id || "Unknown";
      const inAt = ts(r.last_inbound_at);
      const outAt = ts(r.last_outbound_at);
      out.push({
        key: "instagram:" + r.id,
        channel: "instagram",
        id: r.id,
        name,
        sub: r.username ? "Instagram DM" : "",
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

    (voRows || []).forEach((r) => {
      const last = voLast.get(r.id);
      out.push({
        key: "voice:" + r.id,
        channel: "voice",
        id: r.id,
        name: "Voice call",
        sub: r.status ? "Call " + r.status : "",
        preview: last ? messageText(last.message_text, "text") : "",
        previewOut: last ? last.role === "assistant" : false,
        lastAt: last ? last.created_at : r.ended_at || r.started_at || r.created_at,
        needsReply: false,
        status: r.status || "",
        customer_id: null,
        lead_id: null,
        raw: r
      });
    });

    out.sort((a, b) => ts(b.lastAt) - ts(a.lastAt));
    return { convs: out, failed };
  }

  /* ---------- data: thread ---------- */

  async function fetchThread(conv) {
    const cid = await ensureClient();

    if (conv.channel === "whatsapp") {
      const { data, error } = await db
        .from("whatsapp_messages")
        .select(
          "id,direction,message_type,text_body,media_id,status,created_at,provider_timestamp,specialist_module_slug"
        )
        .eq("client_id", cid)
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(CFG.msgLimit);
      if (error) throw error;
      return (data || []).map((m) => ({
        id: m.id,
        dir: m.direction === "inbound" ? "in" : "out",
        who: m.direction === "inbound" ? "customer" : m.specialist_module_slug ? "ai" : "business",
        text: messageText(m.text_body, m.message_type),
        type: m.message_type,
        isMedia: !m.text_body && !!m.media_id,
        status: m.direction === "inbound" ? "" : m.status || "",
        at: m.provider_timestamp || m.created_at
      }));
    }

    if (conv.channel === "instagram") {
      const { data, error } = await db
        .from("instagram_messages")
        .select(
          "id,direction,message_type,text_body,media_id,status,created_at,provider_timestamp,specialist_module_slug"
        )
        .eq("client_id", cid)
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(CFG.msgLimit);
      if (error) throw error;
      return (data || []).map((m) => ({
        id: m.id,
        dir: m.direction === "inbound" ? "in" : "out",
        who: m.direction === "inbound" ? "customer" : m.specialist_module_slug ? "ai" : "business",
        text: messageText(m.text_body, m.message_type),
        type: m.message_type,
        isMedia: !m.text_body && !!m.media_id,
        status: m.direction === "inbound" ? "" : m.status || "",
        at: m.provider_timestamp || m.created_at
      }));
    }

    const { data, error } = await db
      .from("voice_messages")
      .select("id,role,message_text,created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(CFG.msgLimit);
    if (error) throw error;
    return (data || []).map((m) => ({
      id: m.id,
      dir: m.role === "user" ? "in" : "out",
      who: m.role === "user" ? "customer" : "ai",
      text: messageText(m.message_text, "text"),
      type: "text",
      isMedia: false,
      status: "",
      at: m.created_at
    }));
  }

  /* ---------- data: contact panel ---------- */

  async function fetchContact(conv) {
    const cid = await ensureClient();
    const [cust, lead, ctl] = await Promise.allSettled([
      conv.customer_id
        ? db
            .from("customers")
            .select("id,name,mobile,house_no,village_locality,district,state,pincode,landmark,created_at")
            .eq("id", conv.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      conv.lead_id
        ? db
            .from("leads")
            .select("id,name,status,priority,interest,source,next_follow_up_at,created_at")
            .eq("id", conv.lead_id)
            .eq("client_id", cid)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db
        .from("client_conversation_controls")
        .select("ai_enabled,human_takeover_enabled,ai_mode")
        .eq("client_id", cid)
        .eq("conversation_id", conv.id)
        .limit(1)
    ]);

    const one = (r) => (r.status === "fulfilled" && !r.value.error ? r.value.data : null);
    const ctlRows = one(ctl);
    return {
      customer: one(cust),
      lead: one(lead),
      control: Array.isArray(ctlRows) && ctlRows.length ? ctlRows[0] : null
    };
  }

  /* ---------- render: list ---------- */

  function visibleConvs() {
    const q = state.search.trim().toLowerCase();
    return state.convs.filter((c) => {
      if (state.filter === "needs") {
        if (!c.needsReply) return false;
      } else if (state.filter !== "all" && c.channel !== state.filter) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.sub.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q)
      );
    });
  }

  function renderCounts() {
    const counts = { all: state.convs.length, whatsapp: 0, instagram: 0, voice: 0, needs: 0 };
    state.convs.forEach((c) => {
      counts[c.channel] += 1;
      if (c.needsReply) counts.needs += 1;
    });
    document.querySelectorAll("[data-count]").forEach((el) => {
      el.textContent = String(counts[el.getAttribute("data-count")] ?? 0);
    });
  }

  function renderList() {
    const list = $("convList");
    list.textContent = "";
    renderCounts();

    const items = visibleConvs();
    if (!items.length) {
      const empty = h("div", "ib-empty");
      empty.appendChild(h("strong", "", state.convs.length ? "No matching conversations" : "No conversations yet"));
      empty.appendChild(
        h(
          "span",
          "",
          state.convs.length
            ? "Try a different filter or search."
            : "Messages from WhatsApp, Instagram and Voice will appear here."
        )
      );
      list.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((c) => {
      const btn = h("button", "ib-conv" + (c.key === state.selectedKey ? " active" : ""));
      btn.type = "button";
      btn.dataset.key = c.key;

      const av = h("span", "ib-avatar ch-" + c.channel, initials(c.name));
      const body = h("span", "ib-conv-body");

      const top = h("span", "ib-conv-top");
      top.appendChild(h("span", "ib-conv-name", c.name));
      top.appendChild(h("span", "ib-conv-time", fmtListTime(c.lastAt)));

      const bottom = h("span", "ib-conv-bottom");
      const prev = h("span", "ib-conv-preview");
      if (c.previewOut && c.preview) prev.appendChild(h("em", "", "You: "));
      prev.appendChild(document.createTextNode(c.preview || "No messages"));
      bottom.appendChild(prev);
      if (c.needsReply) {
        const dot = h("span", "ib-dot");
        dot.title = "Waiting for a reply";
        bottom.appendChild(dot);
      }

      const meta = h("span", "ib-conv-meta");
      meta.appendChild(h("span", "ib-pill ch-" + c.channel, CHANNELS[c.channel].label));
      if (c.sub && c.channel === "whatsapp") meta.appendChild(h("span", "ib-conv-sub", c.sub));

      body.appendChild(top);
      body.appendChild(bottom);
      body.appendChild(meta);
      btn.appendChild(av);
      btn.appendChild(body);
      frag.appendChild(btn);
    });
    list.appendChild(frag);
  }

  /* ---------- render: thread ---------- */

  function renderChatHeader(conv) {
    const head = $("chatHead");
    head.textContent = "";
    if (!conv) {
      head.classList.add("hidden");
      return;
    }
    head.classList.remove("hidden");

    head.appendChild(h("span", "ib-avatar big ch-" + conv.channel, initials(conv.name)));
    const info = h("div", "ib-chat-info");
    info.appendChild(h("strong", "", conv.name));
    const sub = h("span", "");
    sub.appendChild(h("span", "ib-pill ch-" + conv.channel, CHANNELS[conv.channel].label));
    if (conv.sub) sub.appendChild(h("span", "ib-conv-sub", conv.sub));
    info.appendChild(sub);
    head.appendChild(info);

    const right = h("div", "ib-chat-right");
    if (conv.status) right.appendChild(h("span", "ib-status st-" + String(conv.status).toLowerCase(), conv.status));
    const badge = h("span", "ib-ctl hidden");
    badge.id = "ctlBadge";
    right.appendChild(badge);
    head.appendChild(right);
  }

  function renderThread(msgs, keepScroll) {
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
      const bubble = h("div", "ib-bubble who-" + m.who);

      if (m.dir === "out") {
        bubble.appendChild(h("span", "ib-who", m.who === "ai" ? "GLIME AI" : "Business"));
      }
      if (m.type && ["comment", "comment_reply"].includes(String(m.type))) {
        bubble.appendChild(h("span", "ib-tag", m.type === "comment" ? "Comment" : "Comment reply"));
      }
      const body = h("div", "ib-text" + (m.isMedia || !m.text ? " media" : ""), m.text);
      bubble.appendChild(body);

      const foot = h("div", "ib-foot");
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

  function renderContact(conv, info) {
    const box = $("contactPanel");
    box.textContent = "";
    if (!conv) {
      box.appendChild(h("div", "ib-empty small", "Select a conversation to see the customer details."));
      return;
    }

    const top = h("div", "ib-contact-top");
    top.appendChild(h("span", "ib-avatar xl ch-" + conv.channel, initials(conv.name)));
    top.appendChild(h("strong", "", conv.name));
    top.appendChild(h("span", "ib-pill ch-" + conv.channel, CHANNELS[conv.channel].label));
    box.appendChild(top);

    const chat = h("section", "ib-card");
    chat.appendChild(h("h3", "", "Conversation"));
    chat.appendChild(kv("Status", conv.status || "—"));
    chat.appendChild(kv("Last activity", fmtDateTime(conv.lastAt)));
    if (conv.channel === "whatsapp") chat.appendChild(kv("Phone", conv.sub));
    if (conv.channel === "instagram") chat.appendChild(kv("Instagram ID", conv.raw.instagram_user_id));
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

  function applyControlBadge(control) {
    const badge = $("ctlBadge");
    if (!badge) return;
    badge.className = "ib-ctl";
    if (!control) {
      badge.classList.add("hidden");
      return;
    }
    if (control.human_takeover_enabled) {
      badge.textContent = "Human takeover";
      badge.classList.add("human");
    } else if (control.ai_enabled === false) {
      badge.textContent = "AI off";
      badge.classList.add("off");
    } else {
      badge.textContent = "AI replying";
      badge.classList.add("on");
    }
  }

  /* ---------- actions ---------- */

  function currentConv() {
    return state.convs.find((c) => c.key === state.selectedKey) || null;
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

  async function loadThread(conv, silent) {
    const token = ++state.threadToken;
    if (!silent) {
      const box = $("thread");
      box.textContent = "";
      box.appendChild(h("div", "ib-empty small", "Loading messages…"));
    }
    try {
      const msgs = await fetchThread(conv);
      if (token !== state.threadToken) return;
      renderThread(msgs, silent);
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

  async function loadContact(conv) {
    const token = ++state.contactToken;
    renderContact(conv, null);
    try {
      const info = await fetchContact(conv);
      if (token !== state.contactToken) return;
      renderContact(conv, info);
      applyControlBadge(info.control);
    } catch (err) {
      if (token !== state.contactToken) return;
      console.error("[GLIME Inbox] contact failed:", err);
      renderContact(conv, { customer: null, lead: null, control: null });
    }
  }

  function selectConversation(key) {
    const conv = state.convs.find((c) => c.key === key);
    if (!conv) return;
    state.selectedKey = key;
    $("chatEmpty").classList.add("hidden");
    $("chatBody").classList.remove("hidden");
    renderList();
    renderChatHeader(conv);
    loadThread(conv, false);
    loadContact(conv);
  }

  async function refresh(opts) {
    if (state.busy) return;
    state.busy = true;
    const btn = $("refreshBtn");
    if (opts && opts.manual) btn.disabled = true;
    try {
      const res = await fetchConversations();
      if (!res) return;
      state.convs = res.convs;
      state.failed = res.failed;
      showError(
        res.failed.length
          ? "Could not load " + res.failed.join(", ") + " conversations. Showing the rest."
          : ""
      );
      renderList();
      const conv = currentConv();
      if (conv) {
        renderChatHeader(conv);
        loadThread(conv, true);
        loadContact(conv);
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
      if (btn) selectConversation(btn.dataset.key);
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

    setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, CFG.refreshMs);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
  }

  function start() {
    bind();
    renderContact(null, null);
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
