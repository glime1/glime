/* =========================================================
   GLIME SHARED INBOX  (WhatsApp | Instagram, side by side)
   ---------------------------------------------------------
   Two panels on one screen, like a multi-assistant view:
   - WhatsApp panel and Instagram panel stay separate, but both
     are always visible together.
   - Each panel has its own list and its own open chat. Opening a
     chat in one panel never closes or changes the other panel.
   - Every reply shows WHO answered (WhatsApp AI, Instagram AI,
     or the Business).
   - Read-only: this page only SELECTs data (RLS limits every
     query to the logged-in client). Nothing is written.
   - Both lists keep refreshing while a chat is open.
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
      stackedQuery: "(max-width: 1000px)"
    },
    window.GLIME_INBOX_CONFIG || {}
  );

  if (!window.supabase) {
    console.error("[GLIME Inbox] Supabase library not loaded.");
    return;
  }

  const db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

  const CHANNELS = {
    whatsapp: { label: "WhatsApp", table: "whatsapp_messages" },
    instagram: { label: "Instagram", table: "instagram_messages" }
  };

  const state = {
    clientId: null,
    search: "",
    busy: false,
    openStack: [],
    panes: {
      whatsapp: { convs: [], loaded: false, failed: false, selectedId: null, token: 0 },
      instagram: { convs: [], loaded: false, failed: false, selectedId: null, token: 0 }
    }
  };

  const $ = (id) => document.getElementById(id);
  const stacked = () => !!(window.matchMedia && window.matchMedia(CFG.stackedQuery).matches);

  function paneEl(ch) {
    return document.querySelector('.ib-pane[data-ch="' + ch + '"]');
  }
  function role(ch, name) {
    return paneEl(ch).querySelector('[data-role="' + name + '"]');
  }

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

  /* ---------- data ---------- */

  async function fetchWhatsapp(cid) {
    const { data, error } = await db
      .from("whatsapp_conversations")
      .select(
        "id,customer_phone,customer_name,status,last_message_at,last_message_preview,last_message_direction,created_at"
      )
      .eq("client_id", cid)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(CFG.convLimit);
    if (error) throw error;

    return (data || []).map((r) => ({
      id: r.id,
      name: String(r.customer_name || "").trim() || r.customer_phone || "Unknown",
      sub: r.customer_phone || "",
      preview: r.last_message_preview || "",
      previewOut: r.last_message_direction === "outbound",
      lastAt: r.last_message_at || r.created_at,
      needsReply: r.last_message_direction === "inbound",
      status: r.status || "open"
    }));
  }

  async function fetchInstagram(cid) {
    const { data, error } = await db
      .from("instagram_conversations")
      .select("id,instagram_user_id,username,status,last_message_at,last_inbound_at,last_outbound_at,created_at")
      .eq("client_id", cid)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(CFG.convLimit);
    if (error) throw error;

    const rows = data || [];
    // Instagram has no preview column, so read the latest message of each chat.
    const last = new Map();
    if (rows.length) {
      const { data: msgs, error: mErr } = await db
        .from("instagram_messages")
        .select("conversation_id,text_body,message_type,direction,created_at")
        .eq("client_id", cid)
        .in("conversation_id", rows.map((r) => r.id))
        .order("created_at", { ascending: false })
        .limit(600);
      if (!mErr) (msgs || []).forEach((m) => { if (!last.has(m.conversation_id)) last.set(m.conversation_id, m); });
    }

    return rows.map((r) => {
      const m = last.get(r.id);
      const inAt = ts(r.last_inbound_at);
      const outAt = ts(r.last_outbound_at);
      return {
        id: r.id,
        name: r.username ? "@" + r.username : r.instagram_user_id || "Unknown",
        sub: "",
        preview: m ? messageText(m.text_body, m.message_type) : "",
        previewOut: m ? m.direction === "outbound" : false,
        lastAt: r.last_message_at || r.created_at,
        needsReply: inAt > 0 && inAt > outAt,
        status: r.status || "open"
      };
    });
  }

  async function fetchMessages(ch, convId) {
    const cid = await ensureClient();
    const { data, error } = await db
      .from(CHANNELS[ch].table)
      .select("id,direction,message_type,text_body,media_id,status,created_at,provider_timestamp,specialist_module_slug")
      .eq("client_id", cid)
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(CFG.msgLimit);
    if (error) throw error;

    return (data || []).map((m) => {
      const out = m.direction !== "inbound";
      const by = out ? answeredBy(m.specialist_module_slug) : null;
      return {
        id: m.id,
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

  async function fetchControl(convId) {
    const cid = await ensureClient();
    const { data, error } = await db
      .from("client_conversation_controls")
      .select("conversation_id,ai_enabled,human_takeover_enabled")
      .eq("client_id", cid)
      .eq("conversation_id", convId)
      .limit(1);
    if (error || !Array.isArray(data) || !data.length) return null;
    return data[0];
  }

  /* ---------- render: list ---------- */

  function visibleConvs(ch) {
    const q = state.search.trim().toLowerCase();
    const list = state.panes[ch].convs;
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.sub.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q)
    );
  }

  function renderPaneHead(ch) {
    const p = state.panes[ch];
    role(ch, "count").textContent = String(p.convs.length);
    const need = p.convs.filter((c) => c.needsReply).length;
    role(ch, "need").textContent = need ? need + " need reply" : "";
  }

  function renderList(ch) {
    const box = role(ch, "list");
    const p = state.panes[ch];
    const keepTop = box.scrollTop;
    box.textContent = "";
    renderPaneHead(ch);

    if (p.failed && !p.convs.length) {
      const e = h("div", "ib-empty");
      e.appendChild(h("strong", "", "Could not load " + CHANNELS[ch].label));
      e.appendChild(h("span", "", "Please press Refresh to try again."));
      box.appendChild(e);
      return;
    }

    const items = visibleConvs(ch);
    if (!items.length) {
      const e = h("div", "ib-empty");
      e.appendChild(
        h("strong", "", p.convs.length ? "No matching conversations" : "No " + CHANNELS[ch].label + " conversations yet")
      );
      e.appendChild(
        h("span", "", p.convs.length ? "Try a different search." : "New messages will appear here.")
      );
      box.appendChild(e);
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((c) => {
      const btn = h("button", "ib-conv" + (c.id === p.selectedId ? " active" : ""));
      btn.type = "button";
      btn.dataset.id = c.id;

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

      body.appendChild(top);
      body.appendChild(bottom);
      if (c.sub) body.appendChild(h("span", "ib-conv-sub", c.sub));

      btn.appendChild(h("span", "ib-avatar ch-" + ch, initials(c.name)));
      btn.appendChild(body);
      frag.appendChild(btn);
    });
    box.appendChild(frag);
    box.scrollTop = keepTop;
  }

  /* ---------- render: chat ---------- */

  function renderChatHead(ch, c) {
    const head = role(ch, "head");
    head.textContent = "";

    const back = h("button", "ib-back");
    back.type = "button";
    back.setAttribute("aria-label", "Back to " + CHANNELS[ch].label + " conversations");
    back.textContent = "‹";
    head.appendChild(back);

    head.appendChild(h("span", "ib-avatar ch-" + ch, initials(c.name)));
    const info = h("div", "ib-chat-info");
    info.appendChild(h("strong", "", c.name));
    if (c.sub) info.appendChild(h("span", "ib-conv-sub", c.sub));
    head.appendChild(info);

    const right = h("div", "ib-chat-right");
    if (c.status) right.appendChild(h("span", "ib-status st-" + String(c.status).toLowerCase(), c.status));
    const badge = h("span", "ib-ctl hidden");
    badge.setAttribute("data-role", "ctl");
    right.appendChild(badge);
    head.appendChild(right);
  }

  function applyControl(ch, control) {
    const badge = role(ch, "ctl");
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

  function renderThread(ch, msgs, keepScroll) {
    const box = role(ch, "thread");
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const prevTop = box.scrollTop;
    box.textContent = "";

    const sorted = msgs.slice().sort((a, b) => ts(a.at) - ts(b.at));
    if (!sorted.length) {
      const e = h("div", "ib-empty");
      e.appendChild(h("strong", "", "No messages in this conversation"));
      box.appendChild(e);
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
      const bubble = h("div", "ib-bubble by-" + m.byKind);

      if (m.dir === "out") bubble.appendChild(h("span", "ib-who", m.byLabel));
      if (m.type && ["comment", "comment_reply"].includes(String(m.type))) {
        bubble.appendChild(h("span", "ib-tag", m.type === "comment" ? "Comment" : "Comment reply"));
      }
      bubble.appendChild(h("div", "ib-text" + (m.isMedia || !m.text ? " media" : ""), m.text));

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

  /* ---------- open / close one panel (the other panel is never touched) ---------- */

  async function loadThread(ch, convId, silent) {
    const p = state.panes[ch];
    const token = ++p.token;
    if (!silent) {
      const box = role(ch, "thread");
      box.textContent = "";
      box.appendChild(h("div", "ib-empty small", "Loading messages…"));
    }
    try {
      const [msgs, control] = await Promise.all([fetchMessages(ch, convId), fetchControl(convId)]);
      if (token !== p.token || p.selectedId !== convId) return;
      renderThread(ch, msgs, silent);
      applyControl(ch, control);
    } catch (err) {
      if (token !== p.token) return;
      console.error("[GLIME Inbox] thread failed:", err);
      if (!silent) {
        const box = role(ch, "thread");
        box.textContent = "";
        box.appendChild(h("div", "ib-empty small", "Messages could not be loaded. Please refresh."));
      }
    }
  }

  function openChat(ch, convId) {
    const p = state.panes[ch];
    const c = p.convs.find((x) => x.id === convId);
    if (!c) return;
    p.selectedId = convId;
    paneEl(ch).classList.add("chat-open");
    renderChatHead(ch, c);
    renderList(ch);
    loadThread(ch, convId, false);

    if (stacked()) {
      try {
        history.pushState({ ibOpen: ch }, "");
        state.openStack.push(ch);
      } catch (e) {
        /* history unavailable: the Back button still works */
      }
    }
  }

  function closeChat(ch) {
    const p = state.panes[ch];
    p.selectedId = null;
    p.token++;
    paneEl(ch).classList.remove("chat-open");
    renderList(ch);
  }

  function goBack(ch) {
    const top = state.openStack[state.openStack.length - 1];
    if (stacked() && top === ch && history.state && history.state.ibOpen === ch) {
      history.back(); // popstate closes it
      return;
    }
    const i = state.openStack.lastIndexOf(ch);
    if (i >= 0) state.openStack.splice(i, 1);
    closeChat(ch);
  }

  /* ---------- refresh ---------- */

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

  async function refresh(opts) {
    if (state.busy) return;
    state.busy = true;
    const btn = $("refreshBtn");
    if (opts && opts.manual) btn.disabled = true;
    try {
      const cid = await ensureClient();
      if (!cid) return;

      const [wa, ig] = await Promise.allSettled([fetchWhatsapp(cid), fetchInstagram(cid)]);
      const results = { whatsapp: wa, instagram: ig };
      const failed = [];

      ["whatsapp", "instagram"].forEach((ch) => {
        const r = results[ch];
        const p = state.panes[ch];
        if (r.status === "fulfilled") {
          p.convs = r.value;
          p.failed = false;
        } else {
          console.error("[GLIME Inbox] " + ch + " failed:", r.reason);
          p.failed = true;
          failed.push(CHANNELS[ch].label);
        }
        p.loaded = true;

        if (p.selectedId && !p.convs.some((c) => c.id === p.selectedId) && !p.failed) {
          closeChat(ch);
        }
        renderList(ch);
        if (p.selectedId) {
          const c = p.convs.find((x) => x.id === p.selectedId);
          if (c) {
            renderChatHead(ch, c);
            loadThread(ch, p.selectedId, true);
          }
        }
      });

      showError(failed.length ? "Could not load " + failed.join(" and ") + ". Showing the rest." : "");
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
    ["whatsapp", "instagram"].forEach((ch) => {
      role(ch, "list").addEventListener("click", (e) => {
        const b = e.target.closest(".ib-conv");
        if (b) openChat(ch, b.dataset.id);
      });
      role(ch, "head").addEventListener("click", (e) => {
        if (e.target.closest(".ib-back")) goBack(ch);
      });
    });

    let timer = null;
    $("searchInput").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.search = e.target.value;
        renderList("whatsapp");
        renderList("instagram");
      }, 150);
    });

    $("refreshBtn").addEventListener("click", () => refresh({ manual: true }));

    // Phone / browser Back: close the most recently opened chat only.
    window.addEventListener("popstate", () => {
      const ch = state.openStack.pop();
      if (ch) closeChat(ch);
    });

    setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, CFG.refreshMs);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
  }

  function start() {
    // A reload keeps the old history state; every chat is closed after a reload, so clear it.
    try {
      if (history.state && history.state.ibOpen) history.replaceState(null, "");
    } catch (e) {
      /* ignore */
    }
    bind();
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
