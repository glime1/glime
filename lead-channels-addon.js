/* =========================================================
   GLIME — Linked Channels add-on
   एक ग्राहक की Instagram + WhatsApp पहचान एक ही जगह दिखाता है।

   - सिर्फ़ पढ़ता है (leads, lead_sources, lead_duplicates, instagram_conversations)
   - सिर्फ़ एक काम लिखता है: flagged जोड़ी पर "Yes, same person" /
     "Not same" का review (lead_duplicates.status)
   - कोई lead merge या delete नहीं करता
   - leads.js को modify नहीं करता
   ========================================================= */
(() => {
  "use strict";

  const db = window.supabaseClient;
  if (!db) {
    console.error("[GLIME Lead Channels] Supabase client not found (leads.js must load first).");
    return;
  }

  const LEAD_COLS = "id, client_id, name, mobile, whatsapp, source, status, instagram_user_id";
  const LINK_FIELD = "instagram_whatsapp_link";
  const SECTION_ID = "leadChannelsLink";
  const IG_USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

  let activeId = null;
  let rendering = false;

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);

  /* ---------- data ---------- */

  async function loadGroup(leadId) {
    const { data: lead, error } = await db.from("leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
    if (error || !lead) return null;

    const { data: dupRows } = await db
      .from("lead_duplicates")
      .select("id, lead_id, possible_lead_id, status, match_reasons, reviewed_at")
      .or(`lead_id.eq.${leadId},possible_lead_id.eq.${leadId}`)
      .order("created_at", { ascending: false });

    // सिर्फ़ वही जोड़ियाँ जो "Chat on WhatsApp" बटन से बनी हैं और reject नहीं हुईं
    const links = (dupRows || []).filter(
      (r) =>
        r.status !== "rejected" &&
        Array.isArray(r.match_reasons) &&
        r.match_reasons.some((m) => m && m.field === LINK_FIELD)
    );
    const otherIds = [...new Set(links.map((r) => (r.lead_id === leadId ? r.possible_lead_id : r.lead_id)))];

    let others = [];
    if (otherIds.length) {
      const { data } = await db.from("leads").select(LEAD_COLS).in("id", otherIds);
      others = data || [];
    }

    const { data: sources } = await db
      .from("lead_sources")
      .select("lead_id, source_type, source_ref")
      .in("lead_id", [leadId, ...otherIds]);

    // Instagram username: इसी client की Instagram chats से
    const leadIds = [leadId, ...otherIds];
    const igIds = [lead, ...others].map((l) => String(l.instagram_user_id || "")).filter((v) => /^\d+$/.test(v));
    const filters = [`lead_id.in.(${leadIds.join(",")})`];
    if (igIds.length) filters.push(`instagram_user_id.in.(${igIds.join(",")})`);
    const { data: chats, error: chatError } = await db
      .from("instagram_conversations")
      .select("lead_id, instagram_user_id, username")
      .eq("client_id", lead.client_id)
      .or(filters.join(","));
    if (chatError) console.warn("[GLIME Lead Channels] Instagram username not loaded:", chatError);

    return { lead, links, others, sources: sources || [], chats: chats || [] };
  }

  /* एक ही ग्राहक के सभी Instagram / WhatsApp पते निकालो */
  function collectChannels(leads, sources, chats) {
    const instagram = [];
    const whatsapp = [];
    const seenIg = new Set();
    const seenWa = new Set();

    const usernames = new Map();
    chats.forEach((c) => {
      const u = String(c.username || "").trim();
      if (c.instagram_user_id && IG_USERNAME_RE.test(u)) usernames.set(String(c.instagram_user_id), u);
    });

    const addIg = (name, id) => {
      const key = id || name;
      if (!key || seenIg.has(String(key))) return;
      seenIg.add(String(key));
      instagram.push({ name, username: usernames.get(String(id || "")) || "" });
    };
    const addWa = (num) => {
      const key = digits(num);
      if (!key || seenWa.has(key)) return;
      seenWa.add(key);
      whatsapp.push(String(num));
    };

    leads.forEach((l) => {
      if (l.instagram_user_id || l.source === "instagram") addIg(l.name, l.instagram_user_id);
      addWa(l.whatsapp);
      if (l.source === "whatsapp") addWa(l.mobile);
    });
    chats.forEach((c) => addIg(c.username, c.instagram_user_id));
    sources.forEach((s) => {
      if (s.source_type === "whatsapp") addWa(s.source_ref);
      if (s.source_type === "instagram" && s.source_ref) addIg(null, s.source_ref);
    });
    return { instagram, whatsapp };
  }

  async function reviewLink(dupId, status, lead) {
    const { error } = await db
      .from("lead_duplicates")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", dupId);
    if (error) throw error;

    try {
      await db.from("lead_timeline").insert({
        client_id: lead.client_id,
        lead_id: lead.id,
        event_type: "duplicate_reviewed",
        title: status === "confirmed" ? "Instagram and WhatsApp confirmed as same person" : "Instagram and WhatsApp link rejected",
        description:
          status === "confirmed"
            ? "The user confirmed that the Instagram chat and the WhatsApp number belong to the same customer."
            : "The user said the Instagram chat and the WhatsApp number are not the same customer.",
        source: "duplicate_detection",
        metadata: { duplicate_id: dupId, reviewed_status: status }
      });
    } catch (e) {
      console.warn("[GLIME Lead Channels] timeline note skipped:", e);
    }
  }

  /* ---------- render ---------- */

  // items पहले से सुरक्षित (escaped) HTML होते हैं
  function chip(label, items, emptyText) {
    const ok = items.length > 0;
    return `
      <div class="lead-ch-chip ${ok ? "is-on" : "is-off"}">
        <span class="lead-ch-dot"></span>
        <div>
          <b>${esc(label)}</b>
          ${ok ? items.join("") : `<span class="lead-ch-muted">${esc(emptyText)}</span>`}
        </div>
      </div>`;
  }

  function instagramItem(i) {
    if (i.username) {
      const url = "https://www.instagram.com/" + encodeURIComponent(i.username) + "/";
      return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="display:block;padding:4px 0;font-weight:600;color:#047857;text-decoration:underline;overflow-wrap:anywhere">@${esc(i.username)} ↗</a>`;
    }
    return `<span>${esc([i.name, "username not available yet"].filter(Boolean).join(" · "))}</span>`;
  }

  function pairCard(row, leadId, others) {
    const otherId = row.lead_id === leadId ? row.possible_lead_id : row.lead_id;
    const o = others.find((x) => x.id === otherId);
    const pending = row.status === "pending";
    return `
      <article class="lead-ch-pair">
        <div class="lead-ch-pair-head">
          <div>
            <strong>${esc(o?.name || "Unnamed lead")}</strong>
            <small>${esc(o?.source || "—")} · ${esc(o?.status || "—")}</small>
          </div>
          <span class="lead-ch-tag lead-ch-tag-${esc(row.status)}">${pending ? "needs review" : esc(row.status)}</span>
        </div>
        <div class="lead-ch-pair-info">
          <span><b>Mobile:</b> ${esc(o?.mobile || "—")}</span>
          <span><b>WhatsApp:</b> ${esc(o?.whatsapp || "—")}</span>
        </div>
        <div class="lead-ch-actions">
          ${o ? `<button type="button" class="ghost-btn" data-open="${esc(o.id)}">Open this lead</button>` : ""}
          ${pending
            ? `<button type="button" class="ghost-btn" data-ch-review="rejected" data-ch-id="${esc(row.id)}">Not same</button>
               <button type="button" class="primary-btn" data-ch-review="confirmed" data-ch-id="${esc(row.id)}">Yes, same person</button>`
            : ""}
        </div>
      </article>`;
  }

  function buildSection(group) {
    const { lead, links, others, sources, chats } = group;
    const ch = collectChannels([lead, ...others], sources, chats);
    const both = ch.instagram.length > 0 && ch.whatsapp.length > 0;

    let note;
    if (links.length) {
      note = "The customer opened WhatsApp from the Instagram chat. Their Instagram and WhatsApp are saved as separate lead cards right now — both are shown together here.";
    } else if (both) {
      note = "Instagram and WhatsApp belong to this one lead.";
    } else if (ch.instagram.length) {
      note = "Only Instagram so far. When this customer taps “Chat on WhatsApp”, their number will appear here.";
    } else if (ch.whatsapp.length) {
      note = "Only WhatsApp so far.";
    } else {
      note = "No Instagram or WhatsApp recorded for this lead.";
    }

    const section = document.createElement("section");
    section.id = SECTION_ID;
    section.className = "dp-sec lead-ch-section";
    section.innerHTML = `
      <h3>Linked channels</h3>
      <div class="lead-ch-chips">
        ${chip("Instagram", ch.instagram.map(instagramItem), "Not linked")}
        ${chip("WhatsApp", ch.whatsapp.map((n) => `<span>${esc(n)}</span>`), "Not linked")}
      </div>
      <p class="lead-ch-note">${esc(note)}</p>
      ${links.map((r) => pairCard(r, lead.id, others)).join("")}`;

    section.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-ch-review]");
      if (!btn) return;
      btn.disabled = true;
      try {
        await reviewLink(btn.dataset.chId, btn.dataset.chReview, lead);
        await render(lead.id, true);
        window.GLIMELeadTimeline?.refresh?.();
      } catch (err) {
        console.error("[GLIME Lead Channels]", err);
        btn.disabled = false;
        alert(err.message || "Could not save review.");
      }
    });
    return section;
  }

  async function render(leadId, force = false) {
    if (!leadId || rendering) return;
    const anchor = document.getElementById("dpInfo");
    if (!anchor) return;
    if (!force && document.getElementById(SECTION_ID)) return;

    rendering = true;
    try {
      const group = await loadGroup(leadId);
      if (!group || activeId !== leadId) return;
      const anchorNow = document.getElementById("dpInfo");
      if (!anchorNow) return;
      document.getElementById(SECTION_ID)?.remove();
      anchorNow.after(buildSection(group));
    } catch (err) {
      console.warn("[GLIME Lead Channels]", err);
    } finally {
      rendering = false;
    }
  }

  /* ---------- hooks ---------- */

  document.addEventListener(
    "click",
    (e) => {
      const open = e.target.closest("[data-open]");
      if (open) {
        activeId = open.getAttribute("data-open");
        setTimeout(() => render(activeId), 150);
      }
      if (e.target.closest("[data-close]")) activeId = null;
    },
    true
  );

  function startObserver() {
    const box = document.getElementById("detailContent");
    if (!box) return setTimeout(startObserver, 250);
    // सिर्फ़ सीधे children देखो (panel दोबारा बनने पर section वापस लगाओ)
    new MutationObserver(() => {
      if (activeId && !document.getElementById(SECTION_ID)) setTimeout(() => render(activeId), 80);
    }).observe(box, { childList: true });
  }

  window.GLIMELeadChannels = { refresh: () => activeId && render(activeId, true) };
  startObserver();
})();
