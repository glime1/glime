/* =========================================================
   GLIME — Lead Timeline & Source History Add-on
   Phase 5
   ---------------------------------------------------------
   Purpose:
   - Enhanced lead activity timeline
   - Source history
   - Event type + source badges
   - Metadata/details
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

  function eventLabel(eventType) {
    const map = {
      lead_created: "Lead Created",
      lead_updated: "Lead Updated",
      status_changed: "Status Changed",
      voice_call: "Voice AI Call",
      source_added: "Source Added",
      note_added: "Note Added",
      follow_up: "Follow-up",
      contact_attempt: "Contact Attempt",
      message_received: "Message Received",
      message_sent: "Message Sent"
    };

    return (
      map[String(eventType || "").toLowerCase()] ||
      String(eventType || "Activity")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    );
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
          .order("created_at", { ascending: false })
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
     Timeline UI
     --------------------------------------------------------- */

  function renderTimeline(timeline) {
    if (!timeline.length) {
      return `
        <div class="lead-phase5-empty lead-phase5-timeline-empty">
          <strong>No activity recorded yet.</strong>
          <span>Lead activity will automatically appear here.</span>
        </div>
      `;
    }

    return `
      <div class="lead-phase5-timeline">
        ${timeline
          .map((event) => {
            const eventType = eventLabel(event.event_type);
            const source = sourceLabel(event.source);
            const sourceCls = sourceClass(event.source);

            const metadata =
              !isEmptyObject(event.metadata) && event.metadata
                ? `
                  <details class="lead-phase5-details timeline-details">
                    <summary>Event details</summary>
                    <pre>${escapeHtml(
                      prettyJson(event.metadata)
                    )}</pre>
                  </details>
                `
                : "";

            return `
              <article class="lead-timeline-event">
                <div class="lead-timeline-marker"></div>

                <div class="lead-timeline-event-body">
                  <div class="lead-timeline-event-header">

                    <div class="lead-timeline-title-wrap">
                      <strong>
                        ${escapeHtml(event.title || eventType)}
                      </strong>

                      <span class="lead-phase5-event-type">
                        ${escapeHtml(eventType)}
                      </span>
                    </div>

                    <time>
                      ${escapeHtml(formatDate(event.created_at))}
                    </time>
                  </div>

                  <div class="lead-timeline-event-meta">
                    <span class="lead-phase5-source-badge source-${sourceCls}">
                      ${escapeHtml(source)}
                    </span>
                  </div>

                  ${
                    event.description
                      ? `
                        <p class="lead-timeline-description">
                          ${escapeHtml(event.description)}
                        </p>
                      `
                      : ""
                  }

                  ${metadata}
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  /* ---------------------------------------------------------
     Replace existing timeline with Phase 5 timeline
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
      timelineHeading.textContent = "Activity Timeline";
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

  console.log(
    "[GLIME Lead Timeline] Phase 5 addon loaded."
  );
})();
