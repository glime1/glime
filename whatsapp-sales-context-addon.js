/* =========================================================
   GLIME — WhatsApp Sales Business Context Add-on
   ---------------------------------------------------------
   Purpose:
   - Connects the REAL selected WhatsApp conversation to the
     EXISTING GLIME business systems: customers, leads,
     lead_timeline, follow-up and orders.
   - Read-only integration layer. Creates nothing.
   - Works alongside whatsapp-sales-specialist.js and does
     NOT modify it.
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!window.supabase) {
    console.error("[GLIME WA Context] Supabase client not loaded.");
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  let clientIdCache = null;
  let activeConversationId = null;
  let requestToken = 0;

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */

  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[m])
    );
  }

  function fmtDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function fmtAmount(value) {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    if (Number.isNaN(n)) return esc(value);
    return `₹${n.toLocaleString("en-IN")}`;
  }

  function buildAddress(customer) {
    if (!customer) return "";
    const parts = [
      customer.house_no,
      customer.village_locality,
      customer.landmark,
      customer.district,
      customer.state,
      customer.pincode
    ].filter(Boolean);
    return parts.join(", ");
  }

  /* ---------------------------------------------------------
     Resolve authenticated GLIME client
     --------------------------------------------------------- */

  async function getClientId() {
    if (clientIdCache) return clientIdCache;

    const {
      data: { user },
      error: userError
    } = await db.auth.getUser();

    if (userError || !user) {
      console.error(
        "[GLIME WA Context] Unable to resolve auth user.",
        userError
      );
      return null;
    }

    const { data, error } = await db
      .from("client_data")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(
        "[GLIME WA Context] Unable to resolve client_id.",
        error
      );
      return null;
    }

    clientIdCache = data?.client_id || null;
    return clientIdCache;
  }

  /* ---------------------------------------------------------
     Resolution: conversation → customer → lead → timeline
     → follow-up → orders
     --------------------------------------------------------- */

  async function resolveConversation(conversationId, clientId) {
    const { data, error } = await db
      .from("whatsapp_conversations")
      .select(
        "id,customer_id,customer_phone,customer_name,lead_id,status"
      )
      .eq("id", conversationId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (error) {
      console.error(
        "[GLIME WA Context] conversation fetch error",
        error
      );
    }

    return data || null;
  }

  async function resolveCustomer(conversation, clientId) {
    if (!conversation) return null;

    if (conversation.customer_id) {
      const { data } = await db
        .from("customers")
        .select("*")
        .eq("id", conversation.customer_id)
        .eq("client_id", clientId)
        .maybeSingle();

      if (data) return data;
    }

    if (conversation.customer_phone) {
      const { data } = await db
        .from("customers")
        .select("*")
        .eq("mobile", conversation.customer_phone)
        .eq("client_id", clientId)
        .maybeSingle();

      if (data) return data;
    }

    return null;
  }

  async function resolveLead(conversation, customer, clientId) {
    if (!conversation) return null;

    if (conversation.lead_id) {
      const { data } = await db
        .from("leads")
        .select("*")
        .eq("id", conversation.lead_id)
        .eq("client_id", clientId)
        .maybeSingle();

      if (data) return data;
    }

    if (customer?.id) {
      const { data } = await db
        .from("leads")
        .select("*")
        .eq("customer_id", customer.id)
        .eq("client_id", clientId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) return data;
    }

    return null;
  }

  async function resolveTimeline(leadId, clientId) {
    if (!leadId) return [];

    const { data, error } = await db
      .from("lead_timeline")
      .select("event_type,title,description,created_at")
      .eq("client_id", clientId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      console.error(
        "[GLIME WA Context] timeline fetch error",
        error
      );
    }

    return data || [];
  }

  async function resolveFollowUp(leadId, clientId) {
    if (!leadId) {
      return {
        settings: null,
        case: null,
        conclusion: null
      };
    }

    const [
      settingsRes,
      caseRes,
      conclusionRes
    ] = await Promise.all([
      db
        .from("client_followup_leads")
        .select("enabled,preferred_channel,updated_at")
        .eq("client_id", clientId)
        .eq("lead_id", leadId)
        .maybeSingle(),

      db
        .from("follow_up_cases")
        .select(
          "status,channel,specialist_module_slug,started_at,completed_at"
        )
        .eq("client_id", clientId)
        .eq("lead_id", leadId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      db
        .from("follow_up_conclusions")
        .select(
          "summary,intent,interest,stage,sentiment,buying_signal,next_action,confidence"
        )
        .eq("client_id", clientId)
        .eq("lead_id", leadId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    return {
      settings: settingsRes.data || null,
      case: caseRes.data || null,
      conclusion: conclusionRes.data || null
    };
  }

  async function resolveOrders(
    conversation,
    customer,
    lead,
    clientId
  ) {
    if (conversation) {
      const { data } = await db
        .from("orders")
        .select(
          "id,product_title,total_amount,status,payment_status,created_at"
        )
        .eq("client_id", clientId)
        .eq("source_conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (data && data.length) return data;
    }

    if (customer?.id) {
      const { data } = await db
        .from("orders")
        .select(
          "id,product_title,total_amount,status,payment_status,created_at"
        )
        .eq("client_id", clientId)
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (data && data.length) return data;
    }

    if (lead?.id) {
      const { data } = await db
        .from("orders")
        .select(
          "id,product_title,total_amount,status,payment_status,created_at"
        )
        .eq("client_id", clientId)
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (data && data.length) return data;
    }

    return [];
  }

   /* ---------------------------------------------------------
     Render — Customer / Follow-up / Orders / Timeline
     --------------------------------------------------------- */

  function renderCustomerSection(customer) {
    if (!customer) {
      return `
        <div class="glime-wa-context-section">
          <div class="glime-wa-context-label">CUSTOMER</div>
          <div class="glime-wa-context-muted">
            Customer profile not linked
          </div>
        </div>`;
    }

    const address = buildAddress(customer);

    return `
      <div class="glime-wa-context-section">
        <div class="glime-wa-context-label">CUSTOMER</div>

        <div class="glime-wa-context-row">
          <span>Name</span>
          <strong>${esc(customer.name || "—")}</strong>
        </div>

        <div class="glime-wa-context-row">
          <span>Phone</span>
          <strong>${esc(customer.mobile || "—")}</strong>
        </div>

        <div class="glime-wa-context-row">
          <span>Address</span>
          <strong>${esc(address || "No address on file")}</strong>
        </div>

        <a
          class="glime-wa-context-link"
          href="customer.html?id=${encodeURIComponent(customer.id)}"
        >
          Open customer profile →
        </a>
      </div>`;
  }

  function renderFollowUpSection(followUp, lead) {
    if (!lead) {
      return `
        <div class="glime-wa-context-section">
          <div class="glime-wa-context-label">FOLLOW-UP</div>
          <div class="glime-wa-context-muted">
            No existing GLIME follow-up
          </div>
          <a
            class="glime-wa-context-link"
            href="follow-up.html"
          >
            Open Follow-up →
          </a>
        </div>`;
    }

    const {
      settings,
      case: fCase,
      conclusion
    } = followUp;

    const rows = [];

    if (settings) {
      rows.push(`
        <div class="glime-wa-context-row">
          <span>Enabled</span>
          <strong>
            ${settings.enabled ? "Yes" : "No"}
          </strong>
        </div>`);

      rows.push(`
        <div class="glime-wa-context-row">
          <span>Channel</span>
          <strong>
            ${esc(settings.preferred_channel || "—")}
          </strong>
        </div>`);
    }

    if (fCase) {
      rows.push(`
        <div class="glime-wa-context-row">
          <span>Case status</span>
          <strong>
            ${esc(fCase.status || "—")}
          </strong>
        </div>`);
    }

    if (conclusion) {
      rows.push(`
        <div class="glime-wa-context-row">
          <span>Stage</span>
          <strong>
            ${esc(conclusion.stage || "—")}
          </strong>
        </div>`);

      rows.push(`
        <div class="glime-wa-context-row">
          <span>Next action</span>
          <strong>
            ${esc(conclusion.next_action || "—")}
          </strong>
        </div>`);

      if (conclusion.summary) {
        rows.push(`
          <div class="glime-wa-context-summary">
            ${esc(conclusion.summary)}
          </div>`);
      }
    }

    return `
      <div class="glime-wa-context-section">
        <div class="glime-wa-context-label">FOLLOW-UP</div>

        ${
          rows.length
            ? rows.join("")
            : '<div class="glime-wa-context-muted">No follow-up activity yet</div>'
        }

        <a
          class="glime-wa-context-link"
          href="follow-up.html"
        >
          Open Follow-up →
        </a>
      </div>`;
  }

  function renderOrdersSection(orders) {
    if (!orders || !orders.length) {
      return `
        <div class="glime-wa-context-section">
          <div class="glime-wa-context-label">ORDERS</div>
          <div class="glime-wa-context-muted">
            No existing orders
          </div>
          <a
            class="glime-wa-context-link"
            href="orders.html"
          >
            View Orders →
          </a>
        </div>`;
    }

    const latest = orders[0];

    return `
      <div class="glime-wa-context-section">
        <div class="glime-wa-context-label">ORDERS</div>

        <div class="glime-wa-context-row">
          <span>Total found</span>
          <strong>${orders.length}</strong>
        </div>

        <div class="glime-wa-context-row">
          <span>Latest</span>
          <strong>${esc(latest.product_title || "—")}</strong>
        </div>

        <div class="glime-wa-context-row">
          <span>Amount</span>
          <strong>${fmtAmount(latest.total_amount)}</strong>
        </div>

        <div class="glime-wa-context-row">
          <span>Status</span>
          <strong>
            ${esc(latest.status || "—")}
            ·
            ${esc(latest.payment_status || "—")}
          </strong>
        </div>

        <div class="glime-wa-context-row">
          <span>Date</span>
          <strong>${fmtDate(latest.created_at)}</strong>
        </div>

        <a
          class="glime-wa-context-link"
          href="orders.html"
        >
          View Orders →
        </a>
      </div>`;
  }

  function renderTimelineSection(timeline) {
    if (!timeline || !timeline.length) {
      return `
        <div class="glime-wa-context-section">
          <div class="glime-wa-context-label">TIMELINE</div>
          <div class="glime-wa-context-muted">
            No events yet
          </div>
        </div>`;
    }

    return `
      <div class="glime-wa-context-section">
        <div class="glime-wa-context-label">TIMELINE</div>

        ${timeline
          .map(
            (t) =>
              `<div class="glime-wa-context-row">
                <span>${esc(
                  t.title || t.event_type || "Event"
                )}</span>
                <strong>${fmtDate(t.created_at)}</strong>
              </div>`
          )
          .join("")}
      </div>`;
  }

  function renderContextSections(payload, includeTimeline) {
    const {
      customer,
      lead,
      followUp,
      orders,
      timeline
    } = payload;

    const sections = [
      renderCustomerSection(customer),
      renderFollowUpSection(followUp, lead),
      renderOrdersSection(orders)
    ];

    if (includeTimeline) {
      sections.push(renderTimelineSection(timeline));
    }

    return sections.join("");
  }

  /* ---------------------------------------------------------
     DOM containers
     --------------------------------------------------------- */

  function ensureDesktopContainer() {
    let el = document.getElementById("glimeWaContext");

    if (el) return el;

    const panel = document.querySelector(".context-panel");

    if (!panel) return null;

    el = document.createElement("div");
    el.id = "glimeWaContext";
    el.className = "glime-wa-context";

    panel.appendChild(el);

    return el;
  }

  function ensureModal() {
    let modal = document.getElementById(
      "glimeWaContextModal"
    );

    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "glimeWaContextModal";
    modal.className = "modal hidden";

    modal.innerHTML = `
      <div class="modal-card">
        <button
          class="modal-close"
          id="glimeWaContextModalClose"
          type="button"
        >
          ×
        </button>

        <div class="section-kicker">
          CUSTOMER CONTEXT
        </div>

        <h2>Business Context</h2>

        <div
          id="glimeWaContextModalBody"
          class="glime-wa-context-modal-body"
        ></div>
      </div>`;

    document.body.appendChild(modal);

    modal
      .querySelector("#glimeWaContextModalClose")
      .addEventListener("click", () =>
        modal.classList.add("hidden")
      );

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
      }
    });

    return modal;
  }

  function ensureMobileTrigger() {
    let btn = document.getElementById(
      "glimeWaContextTrigger"
    );

    if (btn) return btn;

    const header = document.querySelector(".chat-header");

    if (!header) return null;

    btn = document.createElement("button");
    btn.id = "glimeWaContextTrigger";
    btn.type = "button";
    btn.className =
      "ghost-btn glime-wa-context-trigger";
    btn.textContent = "Customer Context";

    header.appendChild(btn);

    btn.addEventListener("click", () => {
      const modal = ensureModal();
      modal.classList.remove("hidden");
    });

    return btn;
  }

  /* ---------------------------------------------------------
     Desktop:
     Customer / Follow-up / Orders only.

     Existing Lead and Timeline elements are reused.

     Mobile:
     Customer / Follow-up / Orders / Timeline
     --------------------------------------------------------- */

  function renderInto(payload) {
    const desktop = ensureDesktopContainer();

    if (desktop) {
      desktop.innerHTML =
        renderContextSections(payload, false);
    }

    ensureMobileTrigger();

    /*
      IMPORTANT:
      Always ensure the mobile modal exists before rendering.
      This prevents the modal body from being unavailable
      when the first conversation is selected.
    */
    const modal = ensureModal();

    const body = modal.querySelector(
      "#glimeWaContextModalBody"
    );

    if (body) {
      body.innerHTML =
        renderContextSections(payload, true);
    }
  }

  function updateExistingCustomerFields(
    customer,
    conversation
  ) {
    const nameEl =
      document.getElementById("contextName");

    const phoneEl =
      document.getElementById("contextPhone");

    const customerEl =
      document.getElementById("contextCustomer");

    if (nameEl) {
      nameEl.textContent =
        customer?.name ||
        conversation?.customer_name ||
        "Customer";
    }

    if (phoneEl) {
      phoneEl.textContent =
        customer?.mobile ||
        conversation?.customer_phone ||
        "—";
    }

    if (customerEl) {
      customerEl.textContent = customer
        ? buildAddress(customer) ||
          "No address on file"
        : "Customer profile not linked";
    }
  }

  /*
   * Existing Lead fields are reused.
   * No duplicate Lead section is created.
   */
  function updateExistingLeadFields(lead) {
    const statusEl =
      document.getElementById("leadStatus");

    const interestEl =
      document.getElementById("leadInterest");

    const budgetEl =
      document.getElementById("leadBudget");

    const productEl =
      document.getElementById("leadProduct");

    const sourceEl =
      document.getElementById("leadSource");

    /*
     * IMPORTANT:
     * Clear previous Lead data when the newly selected
     * conversation has no Lead.
     */
    if (!lead) {
      if (statusEl) statusEl.textContent = "New";
      if (interestEl) interestEl.textContent = "—";
      if (budgetEl) budgetEl.textContent = "—";
      if (productEl) productEl.textContent = "—";
      if (sourceEl) sourceEl.textContent = "whatsapp";
      return;
    }

    if (statusEl) {
      statusEl.textContent = "Lead";
    }

    if (interestEl) {
      interestEl.textContent =
        lead.interest || "—";
    }

    if (budgetEl) {
      budgetEl.textContent = lead.budget
        ? `${lead.budget} ${
            lead.budget_currency || "INR"
          }`
        : "—";
    }

    if (productEl) {
      productEl.textContent =
        lead.product_service || "—";
    }

    if (sourceEl) {
      sourceEl.textContent =
        lead.source || "whatsapp";
    }
  }

  /*
   * Existing #timeline is reused on desktop.
   * No duplicate Timeline section is created there.
   */
  function renderTimelineIfPresent(timeline) {
    const el = document.getElementById("timeline");

    if (!el) return;

    /*
     * IMPORTANT:
     * Clear previous conversation's timeline.
     */
    if (!timeline || !timeline.length) {
      el.innerHTML =
        "<span>No events yet.</span>";
      return;
    }

    el.innerHTML = timeline
      .map(
        (t) =>
          `<div class="timeline-item">
            <strong>${esc(
              t.title ||
              t.event_type ||
              "Event"
            )}</strong>
            <small>${esc(
              t.description || ""
            )} · ${fmtDate(t.created_at)}</small>
          </div>`
      )
      .join("");
  }

  /* ---------------------------------------------------------
     Main refresh
     --------------------------------------------------------- */

  async function refreshContext(conversationId) {
    if (!conversationId) return;

    /*
     * Every refresh gets a new token.
     * Old async requests become invalid immediately.
     */
    const token = ++requestToken;

    const clientId = await getClientId();

    if (!clientId) return;

    if (token !== requestToken) return;

    const conversation =
      await resolveConversation(
        conversationId,
        clientId
      );

    if (token !== requestToken) return;

    /*
     * If the selected conversation disappeared during
     * a rerender/realtime update, don't leave old context
     * visible.
     */
    if (!conversation) {
      if (token === requestToken) {
        clearRenderedContext();
      }
      return;
    }

    const customer =
      await resolveCustomer(
        conversation,
        clientId
      );

    if (token !== requestToken) return;

    const lead =
      await resolveLead(
        conversation,
        customer,
        clientId
      );

    if (token !== requestToken) return;

    const [
      timeline,
      followUp,
      orders
    ] = await Promise.all([
      resolveTimeline(
        lead?.id,
        clientId
      ),

      resolveFollowUp(
        lead?.id,
        clientId
      ),

      resolveOrders(
        conversation,
        customer,
        lead,
        clientId
      )
    ]);

    if (token !== requestToken) return;

    updateExistingCustomerFields(
      customer,
      conversation
    );

    updateExistingLeadFields(lead);

    renderTimelineIfPresent(
      timeline
    );

    renderInto({
      customer,
      lead,
      followUp,
      orders,
      timeline
    });
  }

   /* ---------------------------------------------------------
     Clear old context
     --------------------------------------------------------- */

  function clearRenderedContext() {
    /*
     * Invalidate every request that is still running.
     */
    requestToken++;

    activeConversationId = null;

    const desktop =
      document.getElementById(
        "glimeWaContext"
      );

    if (desktop) {
      desktop.innerHTML = "";
    }

    updateExistingCustomerFields(
      null,
      null
    );

    updateExistingLeadFields(null);

    renderTimelineIfPresent([]);

    const modal =
      document.getElementById(
        "glimeWaContextModal"
      );

    const body =
      modal?.querySelector(
        "#glimeWaContextModalBody"
      );

    if (body) {
      body.innerHTML =
        renderContextSections(
          {
            customer: null,
            lead: null,
            followUp: {
              settings: null,
              case: null,
              conclusion: null
            },
            orders: [],
            timeline: []
          },
          true
        );
    }
  }

  /* ---------------------------------------------------------
     Schedule refresh
     --------------------------------------------------------- */

  function scheduleRefresh(conversationId) {
    if (!conversationId) return;

    /*
     * Do NOT block refresh just because the conversation ID
     * is the same. The existing specialist can rerender/update
     * the same conversation through realtime.
     *
     * requestToken makes the latest request authoritative.
     */
    activeConversationId =
      conversationId;

    refreshContext(
      conversationId
    ).catch((error) => {
      console.error(
        "[GLIME WA Context] refresh failed",
        error
      );
    });
  }

  /* ---------------------------------------------------------
     Reliable sync with existing specialist
     ---------------------------------------------------------

     IMPORTANT:
     whatsapp-sales-specialist.js keeps its internal
     state.selected inside its own closure.

     We intentionally DO NOT modify that file.

     Therefore this addon observes the rendered active
     conversation item as the integration surface.

     There is NO click listener here.

     There is NO MutationObserver here.

     Lightweight polling detects:
       - normal conversation selection
       - programmatic selection
       - realtime rerender
       - conversation list rerender
       - active conversation replacement

     requestToken prevents an older async request from
     overwriting the currently selected conversation.
     --------------------------------------------------------- */

  let activeSelectionSignature = null;
  let selectionSyncTimer = null;

  function detectSelectedConversation() {
    const active =
      document.querySelector(
        ".conversation-item.active"
      );

    if (
      !active ||
      !active.dataset ||
      !active.dataset.id
    ) {
      return null;
    }

    return {
      id: active.dataset.id,
      element: active
    };
  }

  function syncSelectedConversation() {
    const selected =
      detectSelectedConversation();

    /*
     * No active conversation:
     * clear old Business Context.
     */
    if (!selected) {
      if (
        activeSelectionSignature !==
        null
      ) {
        activeSelectionSignature =
          null;

        clearRenderedContext();
      }

      return;
    }

    /*
     * Include the actual active DOM node in the signature.
     *
     * If realtime/rerender creates a new DOM node for the
     * same conversation, the signature changes and the
     * context is refreshed again.
     */
    const signature =
      selected.id +
      "::" +
      String(selected.element);

    if (
      signature ===
      activeSelectionSignature
    ) {
      return;
    }

    activeSelectionSignature =
      signature;

    scheduleRefresh(
      selected.id
    );
  }

  function startSelectionSync() {
    if (selectionSyncTimer) return;

    /*
     * Check immediately.
     */
    syncSelectedConversation();

    /*
     * Lightweight polling.
     * This is the primary synchronization mechanism.
     */
    selectionSyncTimer =
      window.setInterval(
        syncSelectedConversation,
        250
      );
  }

  startSelectionSync();

  console.log(
    "[GLIME WA Context] addon loaded."
  );
})();
