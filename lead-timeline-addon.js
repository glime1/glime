/* =========================================================
   GLIME — Lead Timeline & Source History Add-on
   ---------------------------------------------------------
   - Compact lead timeline: only Interest and Order events
   - Source history
   - Works alongside leads.js and lead-ai-addon.js
   - Does NOT modify leads.js
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!window.supabase) {
    console.error("[GLIME Lead Timeline] Supabase client not loaded.");
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  /* Small style additions: timeline chips + light mode text colour */
  try {
    const style = document.createElement("style");
    style.textContent = `
      .lead-timeline-chip{display:inline-block;font-size:.65rem;font-weight:600;padding:2px 9px;border-radius:999px}
      .lead-timeline-chip.interest{background:rgba(0,240,255,.14);color:#0891b2}
      .lead-timeline-chip.order{background:rgba(0,255,136,.16);color:#059669}
      .lead-timeline-ago{margin-left:6px;opacity:.7;font-size:.68rem}
      html[data-theme="light"] .ai-item ul{color:#374151 !important}
    `;
    document.head.appendChild(style);
  } catch (e) {}

  let activeLeadId = null;
  let clientIdCache = null;
  let renderTimer = null;
  let rendering = false;

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return escapeHtml(value);
    }

    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function timeAgo(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + "h ago";
    const days = Math.floor(hours / 24);
    return days < 30 ? days + "d ago" : "";
  }

  function isEmptyObject(value) {
    return (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length === 0
    );
  }

  function prettyJson(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function sourceLabel(source) {
    const map = {
      offline: "Offline",
      website: "Website",
      lookbook: "Lookbook",
      voice: "Voice AI",
      instagram: "Instagram",
      dashboard: "Dashboard",
      system: "System",
      manual: "Manual"
    };

    return map[String(source || "").toLowerCase()] || source || "Unknown";
  }

  function sourceClass(source) {
    return String(source || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
  }

  /* ---------------------------------------------------------
     Resolve authenticated user's GLIME client
     --------------------------------------------------------- */

  async function getClientId() {
    if (clientIdCache) {
      return clientIdCache;
    }

    const {
      data: { user },
      error: userError
    } = await db.auth.getUser();

    if (userError || !user) {
      console.error(
        "[GLIME Lead Timeline] Unable to resolve authenticated user.",
        userError
      );
      return null;
    }

    const { data, error } = await db
      .from("client_data")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        "[GLIME Lead Timeline] Unable to resolve client_id.",
        error
      );
      return null;
    }

    clientIdCache = data?.client_id || null;

    return clientIdCache;
  }

  /* ---------------------------------------------------------
     Fetch lead + sources + timeline
     --------------------------------------------------------- */

  async function fetchLeadActivity(leadId) {
    const clientId = await getClientId();

    if (!clientId || !leadId) {
      return {
        lead: null,
        sources: [],
        timeline: [],
        error: "Unable to resolve lead access."
      };
    }

    const [leadResult, sourcesResult, timelineResult] =
      await Promise.all([
        db
          .from("leads")
          .select("id, client_id, source, source_ref")
          .eq("id", leadId)
          .eq("client_id", clientId)
          .maybeSingle(),

        db
          .from("lead_sources")
          .select(
            "id, client_id, lead_id, source_type, source_ref, metadata, created_at"
          )
          .eq("lead_id", leadId)
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),

        db
          .from("lead_timeline")
          .select(
            "id, client_id, lead_id, event_type, title, description, source, metadata, created_at"
          )
          .eq("lead_id", leadId)
          .eq("client_id", clientId)
          .or(
            "event_type.in.(enquiry,sales_qualification),event_type.ilike.%order%,event_type.ilike.%interest%"
          )
          .order("created_at", { ascending: false })
          .limit(30)
      ]);

    if (leadResult.error) {
      console.error(
        "[GLIME Lead Timeline] Lead fetch error:",
        leadResult.error
      );
    }

    if (sourcesResult.error) {
      console.error(
        "[GLIME Lead Timeline] Source fetch error:",
        sourcesResult.error
      );
    }

    if (timelineResult.error) {
      console.error(
        "[GLIME Lead Timeline] Timeline fetch error:",
        timelineResult.error
      );
    }

    return {
      lead: leadResult.data || null,
      sources: sourcesResult.data || [],
      timeline: timelineResult.data || [],
      error:
        leadResult.error ||
        sourcesResult.error ||
        timelineResult.error ||
        null
    };
  }

  /* ---------------------------------------------------------
     Source History UI
     --------------------------------------------------------- */

  function renderSources(lead, sources) {
    const wrapper = document.createElement("section");

    wrapper.id = "leadSourcesPhase5";
    wrapper.className = "lead-phase5-section";

    const fallbackSource =
      lead?.source && sources.length === 0
        ? [
            {
              id: "lead-source-fallback",
              source_type: lead.source,
              source_ref: lead.source_ref,
              metadata: {},
              created_at: null,
              fallback: true
            }
          ]
        : [];

    const rows = [...sources, ...fallbackSource];

    wrapper.innerHTML = `
      <div class="lead-phase5-section-header">
        <div>
          <h3>Lead Sources</h3>
          <p>Where this lead came from and how it entered GLIME.</p>
        </div>

        <span class="lead-phase5-count">
          ${rows.length}
        </span>
      </div>

      <div class="lead-source-list">
        ${
          rows.length
            ? rows
                .map((item, index) => {
                  const type = sourceLabel(item.source_type);
                  const cls = sourceClass(item.source_type);

                  const metadata =
                    !isEmptyObject(item.metadata) && item.metadata
                      ? `
                        <details class="lead-phase5-details">
                          <summary>Metadata</summary>
                          <pre>${escapeHtml(
                            prettyJson(item.metadata)
                          )}</pre>
                        </details>
                      `
                      : "";

                  return `
                    <article class="lead-source-card ${item.fallback ? "is-fallback" : ""}">
                      <div class="lead-source-card-top">
                        <span class="lead-phase5-source-badge source-${cls}">
                          ${escapeHtml(type)}
                        </span>

                        ${
                          index === 0
                            ? `<span class="lead-phase5-primary-badge">Latest</span>`
                            : ""
                        }
                      </div>

                      ${
                        item.source_ref
                          ? `
                            <div class="lead-source-ref">
                              <span>Reference</span>
                              <strong>${escapeHtml(
                                item.source_ref
                              )}</strong>
                            </div>
                          `
                          : ""
                      }

                      ${
                        item.created_at
                          ? `
                            <div class="lead-source-date">
                              ${escapeHtml(formatDate(item.created_at))}
                            </div>
                          `
                          : `
                            <div class="lead-source-date">
                              Current lead source
                            </div>
                          `
                      }

                      ${metadata}
                    </article>
                  `;
                })
                .join("")
            : `
              <div class="lead-phase5-empty">
                <strong>No source history yet.</strong>
                <span>The lead source will appear here when available.</span>
              </div>
            `
        }
      </div>
    `;

    return wrapper;
  }

  /* ---------------------------------------------------------
     Timeline UI — only Interest and Order events
     --------------------------------------------------------- */

  function isOrderEvent(event) {
    return /order/i.test(String(event?.event_type || ""));
  }

  function isInterestEvent(event) {
    const type = String(event?.event_type || "").toLowerCase();
    return (
      type === "enquiry" ||
      type === "sales_qualification" ||
      /interest/.test(type)
    );
  }

  function renderTimeline(timeline) {
    const items = (timeline || []).filter(
      (event) => isOrderEvent(event) || isInterestEvent(event)
    );

    if (!items.length) {
      return `
        <div class="lead-phase5-empty lead-phase5-timeline-empty">
          <strong>No interest or order yet.</strong>
        </div>
      `;
    }

    return `
      <div class="lead-phase5-timeline">
        ${items
          .map((event) => {
            const order = isOrderEvent(event);
            const label = order ? "Order" : "Interest";
            const text = order
              ? event.description || event.title || ""
              : String(event.description || event.title || "").replace(
                  /^interest\s*\/\s*purpose:\s*/i,
                  ""
                );
            const ago = timeAgo(event.created_at);

            return `
              <article class="lead-timeline-event">
                <div class="lead-timeline-marker"></div>
                <div class="lead-timeline-event-body">
                  <div class="lead-timeline-event-header">
                    <div class="lead-timeline-title-wrap">
                      <span class="lead-timeline-chip ${order ? "order" : "interest"}">${label}</span>
                    </div>
                    <time>${escapeHtml(formatDate(event.created_at))}${
                      ago
                        ? `<span class="lead-timeline-ago">· ${escapeHtml(ago)}</span>`
                        : ""
                    }</time>
                  </div>
                  ${
                    text
                      ? `<p class="lead-timeline-description">${escapeHtml(text)}</p>`
                      : ""
                  }
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  /* ---------------------------------------------------------
     Replace existing timeline with compact timeline
     --------------------------------------------------------- */

  function injectTimeline(timeline) {
    const timelineBox = document.getElementById("timelineBox");

    if (!timelineBox) {
      return false;
    }

    const timelineHeading = timelineBox.previousElementSibling;

    if (
      timelineHeading &&
      timelineHeading.tagName === "H3"
    ) {
      timelineHeading.textContent = "Timeline";
    }

    timelineBox.innerHTML = renderTimeline(timeline);

    timelineBox.classList.add("lead-phase5-timeline-box");

    return true;
  }

  /* ---------------------------------------------------------
     Insert Source section
     --------------------------------------------------------- */

  function injectSources(lead, sources) {
    const timelineBox = document.getElementById("timelineBox");

    if (!timelineBox || !timelineBox.parentNode) {
      return false;
    }

    const existing = document.getElementById(
      "leadSourcesPhase5"
    );

    if (existing) {
      existing.remove();
    }

    const sourceSection = renderSources(lead, sources);

    const timelineHeading = timelineBox.previousElementSibling;

    if (
      timelineHeading &&
      timelineHeading.parentNode
    ) {
      timelineHeading.parentNode.insertBefore(
        sourceSection,
        timelineHeading
      );
    } else {
      timelineBox.parentNode.insertBefore(
        sourceSection,
        timelineBox
      );
    }

    return true;
  }

  /* ---------------------------------------------------------
     Main renderer
     --------------------------------------------------------- */

  async function renderPhase5(leadId) {
    if (!leadId || rendering) {
      return;
    }

    const timelineBox = document.getElementById("timelineBox");

    if (!timelineBox) {
      return;
    }

    rendering = true;

    try {
      const result = await fetchLeadActivity(leadId);

      if (activeLeadId !== leadId) {
        return;
      }

      injectSources(
        result.lead,
        result.sources
      );

      injectTimeline(
        result.timeline
      );

      timelineBox.dataset.phase5Loaded = "true";
      timelineBox.dataset.phase5LeadId = leadId;
    } catch (error) {
      console.error(
        "[GLIME Lead Timeline] Render error:",
        error
      );
    } finally {
      rendering = false;
    }
  }

  /* ---------------------------------------------------------
     Schedule renderer
     --------------------------------------------------------- */

  function scheduleRender() {
    clearTimeout(renderTimer);

    renderTimer = setTimeout(() => {
      if (activeLeadId) {
        renderPhase5(activeLeadId);
      }
    }, 80);
  }

  /* ---------------------------------------------------------
     Detect Lead View button
     --------------------------------------------------------- */

  document.addEventListener(
    "click",
    (event) => {
      const openButton =
        event.target.closest("[data-open]");

      if (!openButton) {
        return;
      }

      const leadId =
        openButton.getAttribute("data-open");

      if (!leadId) {
        return;
      }

      activeLeadId = leadId;

      scheduleRender();
    },
    true
  );

  /* ---------------------------------------------------------
     Watch existing leads.js detail rendering
     --------------------------------------------------------- */

  const observer = new MutationObserver(() => {
    if (!activeLeadId) {
      return;
    }

    const timelineBox =
      document.getElementById("timelineBox");

    if (!timelineBox) {
      return;
    }

    const loadedLeadId =
      timelineBox.dataset.phase5LeadId;

    if (
      loadedLeadId !== activeLeadId
    ) {
      scheduleRender();
    }
  });

  function startObserver() {
    const detailContent =
      document.getElementById("detailContent");

    if (!detailContent) {
      setTimeout(startObserver, 250);
      return;
    }

    observer.observe(detailContent, {
      childList: true,
      subtree: true
    });
  }

  /* ---------------------------------------------------------
     Close modal reset
     --------------------------------------------------------- */

  document.addEventListener(
    "click",
    (event) => {
      const closeButton =
        event.target.closest("[data-close]");

      if (!closeButton) {
        return;
      }

      activeLeadId = null;
    },
    true
  );

  /* ---------------------------------------------------------
     Public refresh helper
     --------------------------------------------------------- */

  window.GLIMELeadTimeline = {
    refresh() {
      if (activeLeadId) {
        renderPhase5(activeLeadId);
      }
    },

    getActiveLeadId() {
      return activeLeadId;
    }
  };

  startObserver();
})();
