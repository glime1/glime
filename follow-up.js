/* =========================================================
   GLIME — Follow-up Specialist
   Phase 2B Frontend
   ========================================================= */

const SUPABASE_URL =
  "https://ufoulgbiqgjriwapuopc.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";


const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentClient = null;
let settings = null;
let leads = [];
let followUpLeads = [];
let channelConnections = [];
let actionRequests = [];
let cases = [];
let conclusions = [];
let proposedChanges = [];

const CHANNELS = [
  {
    id: "instagram",
    name: "Instagram",
    icon: "📸",
    description: "Instagram DM follow-up",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "💬",
    description: "WhatsApp customer follow-up",
  },
  {
    id: "email",
    name: "Email",
    icon: "📧",
    description: "Email follow-up",
  },
  {
    id: "voice",
    name: "Voice",
    icon: "📞",
    description: "Voice follow-up",
  },
];

/* =========================================================
   INIT
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    bindEvents();
    await initialize();
  } catch (error) {
    console.error("Follow-up Specialist initialization error:", error);
    showToast(
      error?.message || "Follow-up Specialist load nahi ho saka.",
      "error"
    );
  }
});

/* =========================================================
   AUTH / CLIENT
   ========================================================= */

async function initialize() {
  const {
    data: { session },
    error: sessionError,
  } = await db.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.user) {
    showAuthRequired();
    return;
  }

  currentUser = session.user;

  await loadClient();
  await loadSettings();
  await loadChannelConnections();
  await loadLeads();
  await loadFollowUpLeads();
  await loadActionRequests();
  await loadCases();
  await loadConclusions();
  await loadProposedChanges();

  renderEverything();
}

async function loadClient() {
  const userId = currentUser.id;
  const email = currentUser.email || "";

  let result = await db
    .from("client_data")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (result.error) {
    console.warn("Client lookup by auth_user_id failed:", result.error);
  }

  if (!result.data && email) {
    result = await db
      .from("client_data")
      .select("*")
      .eq("email", email)
      .maybeSingle();
  }

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    throw new Error("Aapka client profile nahi mila.");
  }

  currentClient = result.data;
}

function getClientId() {
  return (
    currentClient?.client_id ||
    currentClient?.id ||
    currentClient?.clientId ||
    null
  );
}

/* =========================================================
   SETTINGS
   ========================================================= */

async function loadSettings() {
  const clientId = getClientId();

  if (!clientId) {
    throw new Error("Client ID nahi mila.");
  }

  const { data, error } = await db
    .from("client_followup_settings")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    settings = data;
    return;
  }

  const { data: inserted, error: insertError } = await db
    .from("client_followup_settings")
    .insert({
      client_id: clientId,
      enabled: false,
      sending_mode: "manual_approval",
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  settings = inserted;
}

async function saveSettings(changes) {
  const clientId = getClientId();

  const { data, error } = await db
    .from("client_followup_settings")
    .update({
      ...changes,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .select()
    .single();

  if (error) {
    console.error("Settings update error:", error);
    throw error;
  }

  settings = data;
  renderSettings();
}

/* =========================================================
   CHANNEL CONNECTIONS
   ========================================================= */

async function loadChannelConnections() {
  const clientId = getClientId();

  const { data, error } = await db
    .from("client_channel_connections")
    .select("*")
    .eq("client_id", clientId)
    .order("channel", { ascending: true });

  if (error) {
    console.error("Channel connection load error:", error);
    channelConnections = [];
    return;
  }

  channelConnections = data || [];
}

function getChannelConnection(channel) {
  return (
    channelConnections.find((item) => item.channel === channel) || null
  );
}

function isChannelConnected(channel) {
  const connection = getChannelConnection(channel);

  return Boolean(
    connection &&
      connection.status === "connected" &&
      connection.customer_reachable !== false &&
      connection.can_send === true
  );
}

/* =========================================================
   LEADS
   ========================================================= */

async function loadLeads() {
  const clientId = getClientId();

  const { data, error } = await db
    .from("leads")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Leads load error:", error);
    leads = [];
    return;
  }

  leads = data || [];
}

async function loadFollowUpLeads() {
  const clientId = getClientId();

  const { data, error } = await db
    .from("client_followup_leads")
    .select("*")
    .eq("client_id", clientId);

  if (error) {
    console.error("Follow-up leads load error:", error);
    followUpLeads = [];
    return;
  }

  followUpLeads = data || [];
}

function isLeadFollowUpEnabled(leadId) {
  const item = followUpLeads.find(
    (row) => String(row.lead_id) === String(leadId)
  );

  return item ? item.enabled !== false : true;
}

async function toggleLeadFollowUp(leadId, enabled) {
  const clientId = getClientId();

  const existing = followUpLeads.find(
    (row) => String(row.lead_id) === String(leadId)
  );

  if (existing) {
    const { error } = await db
      .from("client_followup_leads")
      .update({
        enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("client_id", clientId)
      .eq("lead_id", leadId);

    if (error) {
      throw error;
    }

    existing.enabled = enabled;
  } else {
    const { data, error } = await db
      .from("client_followup_leads")
      .insert({
        client_id: clientId,
        lead_id: leadId,
        enabled,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    followUpLeads.push(data);
  }

  renderLeads();
  showToast(
    enabled
      ? "Follow-up is lead ke liye ON kar diya gaya."
      : "Follow-up is lead ke liye OFF kar diya gaya.",
    "success"
  );
}

/* =========================================================
   ACTION REQUESTS
   ========================================================= */

async function loadActionRequests() {
  const clientId = getClientId();

  const { data, error } = await db
    .from("client_action_requests")
    .select("*")
    .eq("client_id", clientId)
    .eq("intent", "lead_follow_up")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Action request load error:", error);
    actionRequests = [];
    return;
  }

  actionRequests = data || [];
}

/* =========================================================
   FOLLOW-UP CASES
   ========================================================= */

async function loadCases() {
  const clientId = getClientId();

  const { data, error } = await db
    .from("follow_up_cases")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Follow-up cases load error:", error);
    cases = [];
    return;
  }

  cases = data || [];
}

/* =========================================================
   CONCLUSIONS
   ========================================================= */

async function loadConclusions() {
  const clientId = getClientId();

  const { data, error } = await db
    .from("follow_up_conclusions")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Conclusions load error:", error);
    conclusions = [];
    return;
  }

  conclusions = data || [];
}

/* =========================================================
   PROPOSED LEAD CHANGES
   ========================================================= */

async function loadProposedChanges() {
  const clientId = getClientId();

  const { data, error } = await db
    .from("follow_up_proposed_changes")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Proposed changes load error:", error);
    proposedChanges = [];
    return;
  }

  proposedChanges = data || [];
}

/* =========================================================
   EVENTS
   ========================================================= */

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const actionElement = event.target.closest("[data-action]");

    if (!actionElement) {
      return;
    }

    const action = actionElement.dataset.action;

    try {
      if (action === "toggle-specialist") {
        await toggleSpecialist();
      }

      if (action === "set-manual") {
        await saveSettings({
          sending_mode: "manual_approval",
        });
        showToast("Manual Approval mode active.", "success");
      }

      if (action === "set-automatic") {
        await saveSettings({
          sending_mode: "automatic_sending",
        });
        showToast("Automatic Sending mode active.", "success");
      }

      if (action === "connect-instagram") {
        await connectInstagram();
      }

      if (action === "manage-voice") {
        window.location.href = "voice-ai.html";
      }

      if (action === "request-followup") {
        const leadId = actionElement.dataset.leadId;
        await requestFollowUp(leadId);
      }

      if (action === "edit-draft") {
        const requestId = actionElement.dataset.requestId;
        openDraftEditor(requestId);
      }

      if (action === "save-draft") {
        const requestId = actionElement.dataset.requestId;
        await saveDraftFromModal(requestId);
      }

      if (action === "approve-send") {
        const requestId = actionElement.dataset.requestId;
        await approveAndSend(requestId);
      }

      if (action === "close-modal") {
        closeDraftModal();
      }
    } catch (error) {
      console.error(error);
      showToast(
        error?.message || "Action complete nahi ho saka.",
        "error"
      );
    }
  });

  document.addEventListener("change", async (event) => {
    const checkbox = event.target.closest(
      '[data-action="toggle-lead"]'
    );

    if (!checkbox) {
      return;
    }

    try {
      const leadId = checkbox.dataset.leadId;
      await toggleLeadFollowUp(leadId, checkbox.checked);
    } catch (error) {
      checkbox.checked = !checkbox.checked;

      showToast(
        error?.message || "Lead setting update nahi hui.",
        "error"
      );
    }
  });
}

/* =========================================================
   SPECIALIST TOGGLE
   ========================================================= */

async function toggleSpecialist() {
  const nextState = !Boolean(settings?.enabled);

  await saveSettings({
    enabled: nextState,
  });

  showToast(
    nextState
      ? "Follow-up Specialist ON ho gaya."
      : "Follow-up Specialist OFF ho gaya.",
    "success"
  );
}

/* =========================================================
   INSTAGRAM CONNECTION
   ========================================================= */

async function connectInstagram() {
  if (!currentUser) {
    showAuthRequired();
    return;
  }

  const functionUrl =
    `${SUPABASE_URL}/functions/v1/instagram-oauth-start`;

  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentUser.access_token || ""}`,
    },
    body: JSON.stringify({
      client_id: getClientId(),
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        result?.message ||
        "Instagram connection start nahi ho saka."
    );
  }

  if (result?.url) {
    window.location.href = result.url;
    return;
  }

  if (result?.authorization_url) {
    window.location.href = result.authorization_url;
    return;
  }

  showToast(
    "Instagram connection response mila, lekin authorization URL nahi mila.",
    "error"
  );
}

/* =========================================================
   REQUEST FOLLOW-UP
   ========================================================= */

async function requestFollowUp(leadId) {
  if (!settings?.enabled) {
    throw new Error(
      "Pehle Follow-up Specialist ko ON karein."
    );
  }

  if (!isLeadFollowUpEnabled(leadId)) {
    throw new Error(
      "Is lead ke liye Follow-up OFF hai."
    );
  }

  const channel = "instagram";

  if (!isChannelConnected(channel)) {
    throw new Error(
      "Instagram connected aur send-enabled nahi hai."
    );
  }

  const lead = leads.find(
    (item) => String(item.id) === String(leadId)
  );

  if (!lead) {
    throw new Error("Lead nahi mila.");
  }

  const response = await callFollowUpFunction({
    action: "create_draft",
    lead_id: leadId,
    channel,
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  await loadActionRequests();
  await loadCases();
  await loadConclusions();
  await loadProposedChanges();

  renderEverything();

  showToast(
    "Follow-up draft create ho gaya.",
    "success"
  );
}

/* =========================================================
   EDGE FUNCTION CALL
   ========================================================= */

async function callFollowUpFunction(payload) {
  const {
    data: { session },
  } = await db.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Session expired. Dobara login karein.");
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/lead-followup-handoff-v2`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        "Follow-up service request failed."
    );
  }

  return data;
}

/* =========================================================
   DRAFT EDITOR
   ========================================================= */

function openDraftEditor(requestId) {
  const request = actionRequests.find(
    (item) => String(item.id) === String(requestId)
  );

  if (!request) {
    showToast("Draft request nahi mila.", "error");
    return;
  }

  const payload =
    request.action_payload ||
    request.payload ||
    {};

  const message =
    payload.message ||
    payload.body ||
    payload.text ||
    "";

  const modal = document.getElementById("draftModal");

  if (!modal) {
    createDraftModal();
  }

  const textarea =
    document.getElementById("draftMessage");

  const requestInput =
    document.getElementById("draftRequestId");

  if (textarea) {
    textarea.value = message;
  }

  if (requestInput) {
    requestInput.value = requestId;
  }

  const actualModal =
    document.getElementById("draftModal");

  if (actualModal) {
    actualModal.classList.add("active");
    actualModal.style.display = "flex";
  }
}

function closeDraftModal() {
  const modal = document.getElementById("draftModal");

  if (!modal) {
    return;
  }

  modal.classList.remove("active");
  modal.style.display = "none";
}

async function saveDraftFromModal(requestId) {
  const textarea =
    document.getElementById("draftMessage");

  if (!textarea) {
    throw new Error("Draft editor nahi mila.");
  }

  const message = textarea.value.trim();

  if (!message) {
    throw new Error("Message empty nahi ho sakta.");
  }

  if (message.length > 2000) {
    throw new Error(
      "Message maximum 2000 characters ka ho sakta hai."
    );
  }

  /*
   * Existing lead-followup-handoff-v2 ka save_draft
   * workflow reuse kiya ja raha hai.
   *
   * IMPORTANT:
   * Direct client_action_requests UPDATE avoid kiya gaya hai.
   */

  const response = await callFollowUpFunction({
    action: "save_draft",
    action_request_id: requestId,
    message,
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  await loadActionRequests();
  renderApprovals();

  closeDraftModal();

  showToast(
    "Follow-up draft update ho gaya.",
    "success"
  );
}

/* =========================================================
   APPROVE AND SEND
   ========================================================= */

async function approveAndSend(requestId) {
  if (!settings?.enabled) {
    throw new Error(
      "Follow-up Specialist OFF hai."
    );
  }

  const request = actionRequests.find(
    (item) => String(item.id) === String(requestId)
  );

  if (!request) {
    throw new Error("Action request nahi mila.");
  }

  if (
    request.status &&
    request.status !== "proposed"
  ) {
    throw new Error(
      `Ye request approve karne ke liye available nahi hai. Current status: ${request.status}`
    );
  }

  const channel =
    request.channel ||
    request.target_channel ||
    "instagram";

  if (!isChannelConnected(channel)) {
    throw new Error(
      `${channel} connected aur send-enabled nahi hai.`
    );
  }

  const confirmed = window.confirm(
    "Kya aap is Follow-up ko send karna chahte hain?"
  );

  if (!confirmed) {
    return;
  }

  const response = await callFollowUpFunction({
    action: "approve_and_send",
    action_request_id: requestId,
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  await loadActionRequests();
  await loadCases();
  await loadConclusions();
  await loadProposedChanges();

  renderEverything();

  showToast(
    "Follow-up approved aur send workflow mein chala gaya.",
    "success"
  );
}

/* =========================================================
   RENDER EVERYTHING
   ========================================================= */

function renderEverything() {
  renderSettings();
  renderChannels();
  renderLeads();
  renderApprovals();
  renderProposedChanges();
  renderConclusions();
  renderStats();
}

/* =========================================================
   SETTINGS UI
   ========================================================= */

function renderSettings() {
  const enabled = Boolean(settings?.enabled);
  const mode =
    settings?.sending_mode || "manual_approval";

  const statusElements = document.querySelectorAll(
    "[data-followup-status]"
  );

  statusElements.forEach((element) => {
    element.textContent = enabled ? "ON" : "OFF";
    element.classList.toggle("active", enabled);
  });

  const toggle = document.querySelector(
    '[data-action="toggle-specialist"]'
  );

  if (toggle) {
    toggle.setAttribute(
      "aria-pressed",
      String(enabled)
    );

    toggle.classList.toggle("active", enabled);
  }

  const manualButton = document.querySelector(
    '[data-action="set-manual"]'
  );

  const automaticButton = document.querySelector(
    '[data-action="set-automatic"]'
  );

  if (manualButton) {
    manualButton.classList.toggle(
      "active",
      mode === "manual_approval"
    );
  }

  if (automaticButton) {
    automaticButton.classList.toggle(
      "active",
      mode === "automatic_sending"
    );
  }
}

/* =========================================================
   CHANNEL UI
   ========================================================= */

function renderChannels() {
  const container =
    document.getElementById("channelConnections");

  if (!container) {
    return;
  }

  container.innerHTML = CHANNELS.map(
    (channel) => {
      const connection =
        getChannelConnection(channel.id);

      const connected =
        connection?.status === "connected";

      const canSend =
        connected &&
        connection?.can_send === true;

      const reachable =
        connection?.customer_reachable !== false;

      let statusText = "Not connected";

      if (connected && canSend && reachable) {
        statusText = "Connected & Send Ready";
      } else if (connected) {
        statusText = "Connected — Not Send Ready";
      } else if (connection?.status) {
        statusText =
          capitalize(connection.status);
      }

      let button = "";

      if (channel.id === "instagram") {
        button = `
          <button
            class="btn btn-primary"
            data-action="connect-instagram"
          >
            ${connected ? "Reconnect" : "Connect"}
          </button>
        `;
      }

      if (channel.id === "voice") {
        button = `
          <button
            class="btn btn-secondary"
            data-action="manage-voice"
          >
            Manage Voice
          </button>
        `;
      }

      if (
        channel.id === "whatsapp" ||
        channel.id === "email"
      ) {
        button = `
          <button
            class="btn btn-secondary"
            type="button"
            onclick="showToast('Provider integration abhi enabled nahi hai.', 'info')"
          >
            Provider Not Enabled
          </button>
        `;
      }

      return `
        <div class="channel-card">
          <div class="channel-icon">
            ${channel.icon}
          </div>

          <div class="channel-content">
            <h3>${escapeHtml(channel.name)}</h3>
            <p>${escapeHtml(channel.description)}</p>

            <span class="channel-status ${
              connected && canSend
                ? "connected"
                : ""
            }">
              ${escapeHtml(statusText)}
            </span>
          </div>

          <div class="channel-actions">
            ${button}
          </div>
        </div>
      `;
    }
  ).join("");
}

/* =========================================================
   LEADS UI
   ========================================================= */

function renderLeads() {
  const container =
    document.getElementById("followUpLeads");

  if (!container) {
    return;
  }

  if (!leads.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3>No leads found</h3>
        <p>
          Follow-up Specialist ko leads milne ke baad
          yahan dikhaya jayega.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = leads
    .map((lead) => {
      const enabled =
        isLeadFollowUpEnabled(lead.id);

      const name =
        lead.name ||
        lead.full_name ||
        lead.customer_name ||
        "Unnamed Lead";

      const phone =
        lead.phone ||
        lead.mobile ||
        lead.whatsapp ||
        "";

      const status =
        lead.status ||
        lead.stage ||
        "New";

      return `
        <div class="lead-row">
          <div class="lead-main">
            <strong>
              ${escapeHtml(name)}
            </strong>

            <span>
              ${escapeHtml(phone)}
            </span>
          </div>

          <div class="lead-status">
            ${escapeHtml(status)}
          </div>

          <div class="lead-followup-toggle">
            <label class="switch">
              <input
                type="checkbox"
                data-action="toggle-lead"
                data-lead-id="${escapeHtml(
                  String(lead.id)
                )}"
                ${enabled ? "checked" : ""}
              />
              <span class="slider"></span>
            </label>

            <span>
              ${enabled ? "ON" : "OFF"}
            </span>
          </div>

          <div class="lead-actions">
            <button
              class="btn btn-primary btn-sm"
              data-action="request-followup"
              data-lead-id="${escapeHtml(
                String(lead.id)
              )}"
              ${
                !settings?.enabled || !enabled
                  ? "disabled"
                  : ""
              }
            >
              Request Follow-up
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   APPROVALS UI
   ========================================================= */

function renderApprovals() {
  const container =
    document.getElementById("followUpApprovals");

  if (!container) {
    return;
  }

  const requests = actionRequests.filter(
    (request) =>
      request.status === "proposed" ||
      request.status === "drafted"
  );

  if (!requests.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <h3>No pending approvals</h3>
        <p>
          New Follow-up drafts approval ke liye yahan aayenge.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = requests
    .map((request) => {
      const payload =
        request.action_payload ||
        request.payload ||
        {};

      const message =
        payload.message ||
        payload.body ||
        payload.text ||
        "Message unavailable";

      const leadId =
        request.lead_id ||
        request.target_id ||
        "";

      const lead = leads.find(
        (item) =>
          String(item.id) === String(leadId)
      );

      const leadName =
        lead?.name ||
        lead?.full_name ||
        lead?.customer_name ||
        "Lead";

      return `
        <div class="approval-card">
          <div class="approval-header">
            <div>
              <span class="eyebrow">
                FOLLOW-UP DRAFT
              </span>

              <h3>
                ${escapeHtml(leadName)}
              </h3>
            </div>

            <span class="status-badge">
              ${escapeHtml(
                request.status || "proposed"
              )}
            </span>
          </div>

          <div class="draft-message">
            ${escapeHtml(message)}
          </div>

          <div class="approval-actions">
            <button
              class="btn btn-secondary"
              data-action="edit-draft"
              data-request-id="${escapeHtml(
                String(request.id)
              )}"
            >
              Edit
            </button>

            <button
              class="btn btn-primary"
              data-action="approve-send"
              data-request-id="${escapeHtml(
                String(request.id)
              )}"
            >
              Approve & Send
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   PROPOSED CHANGES UI
   ========================================================= */

function renderProposedChanges() {
  const container =
    document.getElementById("proposedChanges");

  if (!container) {
    return;
  }

  const pending = proposedChanges.filter(
    (change) =>
      change.status === "proposed" ||
      change.status === "edited"
  );

  if (!pending.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🧠</div>
        <h3>No proposed lead changes</h3>
        <p>
          Follow-up analysis ke baad suggested changes yahan aayenge.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = pending
    .map((change) => {
      return `
        <div class="change-card">
          <div class="change-header">
            <strong>
              ${escapeHtml(
                change.field_name || "Lead field"
              )}
            </strong>

            <span class="status-badge">
              ${escapeHtml(
                change.status || "proposed"
              )}
            </span>
          </div>

          <div class="change-values">
            <div>
              <small>Current</small>
              <div>
                ${escapeHtml(
                  formatJsonValue(
                    change.old_value
                  )
                )}
              </div>
            </div>

            <div class="change-arrow">
              →
            </div>

            <div>
              <small>Proposed</small>
              <div>
                ${escapeHtml(
                  formatJsonValue(
                    change.proposed_value
                  )
                )}
              </div>
            </div>
          </div>

          <div class="change-reason">
            <strong>Reason:</strong>
            ${escapeHtml(
              change.reason || "No reason provided"
            )}
          </div>

          <div class="change-actions">
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              onclick="showToast('Edit workflow backend approval layer mein connect kiya jayega.', 'info')"
            >
              Edit
            </button>

            <button
              class="btn btn-primary btn-sm"
              type="button"
              onclick="showToast('Proposed change approval workflow next backend phase mein enable hoga.', 'info')"
            >
              Review & Approve
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   CONCLUSIONS UI
   ========================================================= */

function renderConclusions() {
  const container =
    document.getElementById("recentConclusions");

  if (!container) {
    return;
  }

  if (!conclusions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>No conclusions yet</h3>
        <p>
          Follow-up conversation analysis ke baad
          conclusions yahan appear hongi.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = conclusions
    .map((conclusion) => {
      return `
        <div class="conclusion-card">
          <div class="conclusion-header">
            <strong>
              ${escapeHtml(
                conclusion.intent ||
                  "Follow-up conclusion"
              )}
            </strong>

            <span>
              ${
                conclusion.confidence != null
                  ? Math.round(
                      Number(
                        conclusion.confidence
                      ) * 100
                    ) + "%"
                  : "—"
              }
            </span>
          </div>

          <p>
            ${escapeHtml(
              conclusion.summary ||
                "No summary available."
            )}
          </p>

          <div class="conclusion-grid">
            <div>
              <small>Interest</small>
              <strong>
                ${escapeHtml(
                  conclusion.interest || "—"
                )}
              </strong>
            </div>

            <div>
              <small>Stage</small>
              <strong>
                ${escapeHtml(
                  conclusion.stage || "—"
                )}
              </strong>
            </div>

            <div>
              <small>Sentiment</small>
              <strong>
                ${escapeHtml(
                  conclusion.sentiment || "—"
                )}
              </strong>
            </div>

            <div>
              <small>Buying Signal</small>
              <strong>
                ${escapeHtml(
                  conclusion.buying_signal ||
                    "—"
                )}
              </strong>
            </div>
          </div>

          <div class="next-action">
            <strong>Next Action:</strong>
            ${escapeHtml(
              conclusion.next_action || "—"
            )}
          </div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   STATS
   ========================================================= */

function renderStats() {
  const pendingApprovals =
    actionRequests.filter(
      (item) =>
        item.status === "proposed" ||
        item.status === "drafted"
    ).length;

  const pendingChanges =
    proposedChanges.filter(
      (item) =>
        item.status === "proposed" ||
        item.status === "edited"
    ).length;

  const connectedChannels =
    channelConnections.filter(
      (item) =>
        item.status === "connected"
    ).length;

  const stats = {
    totalLeads: leads.length,
    enabledLeads: leads.filter((lead) =>
      isLeadFollowUpEnabled(lead.id)
    ).length,
    pendingApprovals,
    pendingChanges,
    connectedChannels,
    conclusions: conclusions.length,
  };

  Object.entries(stats).forEach(
    ([key, value]) => {
      const element = document.querySelector(
        `[data-stat="${key}"]`
      );

      if (element) {
        element.textContent = String(value);
      }
    }
  );
}

/* =========================================================
   MODAL
   ========================================================= */

function createDraftModal() {
  if (document.getElementById("draftModal")) {
    return;
  }

  const modal = document.createElement("div");

  modal.id = "draftModal";
  modal.className = "modal";
  modal.style.display = "none";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>

    <div class="modal-dialog">
      <div class="modal-header">
        <div>
          <span class="eyebrow">
            FOLLOW-UP SPECIALIST
          </span>

          <h2>Edit Follow-up Draft</h2>
        </div>

        <button
          type="button"
          class="modal-close"
          data-action="close-modal"
        >
          ×
        </button>
      </div>

      <div class="modal-body">
        <input
          type="hidden"
          id="draftRequestId"
        />

        <label
          for="draftMessage"
          class="form-label"
        >
          Message
        </label>

        <textarea
          id="draftMessage"
          rows="8"
          maxlength="2000"
          placeholder="Follow-up message..."
        ></textarea>
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="btn btn-secondary"
          data-action="close-modal"
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary"
          data-action="save-draft"
          data-request-id=""
          id="saveDraftButton"
        >
          Save Draft
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const saveButton =
    document.getElementById(
      "saveDraftButton"
    );

  if (saveButton) {
    saveButton.addEventListener(
      "click",
      async () => {
        const requestId =
          document.getElementById(
            "draftRequestId"
          )?.value;

        if (!requestId) {
          return;
        }

        try {
          await saveDraftFromModal(requestId);
        } catch (error) {
          showToast(
            error?.message ||
              "Draft save nahi hua.",
            "error"
          );
        }
      }
    );
  }

  const backdrop =
    modal.querySelector(".modal-backdrop");

  if (backdrop) {
    backdrop.addEventListener(
      "click",
      closeDraftModal
    );
  }
}

/* =========================================================
   AUTH REQUIRED
   ========================================================= */

function showAuthRequired() {
  const container =
    document.querySelector("main") ||
    document.body;

  const box = document.createElement("div");

  box.className = "auth-required";

  box.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🔐</div>
      <h2>Login Required</h2>
      <p>
        Follow-up Specialist use karne ke liye
        pehle client dashboard mein login karein.
      </p>

      <a
        href="login.html"
        class="btn btn-primary"
      >
        Login
      </a>
    </div>
  `;

  container.prepend(box);
}

/* =========================================================
   TOAST
   ========================================================= */

function showToast(message, type = "info") {
  let container =
    document.getElementById("toastContainer");

  if (!container) {
    container = document.createElement("div");

    container.id = "toastContainer";

    container.style.position = "fixed";
    container.style.right = "20px";
    container.style.bottom = "20px";
    container.style.zIndex = "99999";

    document.body.appendChild(container);
  }

  const toast =
    document.createElement("div");

  toast.className =
    `toast toast-${type}`;

  toast.textContent = message;

  toast.style.marginTop = "10px";
  toast.style.padding = "12px 16px";
  toast.style.borderRadius = "10px";
  toast.style.background = "#111827";
  toast.style.color = "#fff";
  toast.style.boxShadow =
    "0 10px 30px rgba(0,0,0,.2)";
  toast.style.maxWidth = "360px";

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function capitalize(value) {
  if (!value) {
    return "";
  }

  return (
    String(value).charAt(0).toUpperCase() +
    String(value).slice(1)
  );
}

function formatJsonValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* =========================================================
   GLOBAL HELPERS
   ========================================================= */

window.showToast = showToast;
window.loadFollowUpSpecialist = initialize;
