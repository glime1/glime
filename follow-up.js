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

/* =========================================================
   STATE
   ========================================================= */

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
  bindEvents();

  try {
    await initialize();
  } catch (error) {
    console.error(
      "Follow-up Specialist initialization error:",
      error
    );

    setPageMessage(
      error?.message ||
        "Follow-up Specialist load nahi ho saka.",
      "error"
    );

    setAuthStatus("Access error");
  }
});

/* =========================================================
   AUTH / CLIENT
   ========================================================= */

async function initialize() {
  setAuthStatus("Checking access…");

  const {
    data: { session },
    error: sessionError,
  } = await db.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.user) {
    currentUser = null;
    setAuthStatus("Login required");
    showAuthRequired();
    return;
  }

  currentUser = session.user;

  await loadClient();

  setAuthStatus("Authenticated");

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
  const userId = currentUser?.id;
  const email = currentUser?.email || "";

  if (!userId) {
    throw new Error("Authenticated user ID nahi mila.");
  }

  let result = await db
    .from("client_data")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (result.error) {
    console.warn(
      "Client lookup by auth_user_id failed:",
      result.error
    );
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
    throw new Error(
      "Aapka client profile nahi mila."
    );
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

  const { data: inserted, error: insertError } =
    await db
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

async function saveSettings() {
  const clientId = getClientId();

  if (!clientId) {
    throw new Error("Client ID nahi mila.");
  }

  const enabled =
    Boolean(
      document.getElementById(
        "followupEnabled"
      )?.checked
    );

  const mode =
    document.querySelector(
      'input[name="sendingMode"]:checked'
    )?.value ||
    "manual_approval";

  const { data, error } = await db
    .from("client_followup_settings")
    .update({
      enabled,
      sending_mode: mode,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  settings = data;

  renderSettings();
  renderLeads();
  renderStats();

  showToast(
    "Follow-up settings save ho gayi.",
    "success"
  );
}

/* =========================================================
   CHANNEL CONNECTIONS
   ========================================================= */

async function loadChannelConnections() {
  const clientId = getClientId();

  if (!clientId) {
    return;
  }

  const { data, error } = await db
    .from("client_channel_connections")
    .select("*")
    .eq("client_id", clientId)
    .order("channel", {
      ascending: true,
    });

  if (error) {
    console.error(
      "Channel connection load error:",
      error
    );

    channelConnections = [];
    return;
  }

  channelConnections = data || [];
}

function getChannelConnection(channel) {
  return (
    channelConnections.find(
      (item) =>
        String(item.channel).toLowerCase() ===
        String(channel).toLowerCase()
    ) || null
  );
}

function isChannelConnected(channel) {
  const connection =
    getChannelConnection(channel);

  if (!connection) {
    return false;
  }

  return Boolean(
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

  if (!clientId) {
    return;
  }

  const { data, error } = await db
    .from("leads")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "Leads load error:",
      error
    );

    leads = [];
    return;
  }

  leads = data || [];
}

async function loadFollowUpLeads() {
  const clientId = getClientId();

  if (!clientId) {
    return;
  }

  const { data, error } = await db
    .from("client_followup_leads")
    .select("*")
    .eq("client_id", clientId);

  if (error) {
    console.error(
      "Follow-up leads load error:",
      error
    );

    followUpLeads = [];
    return;
  }

  followUpLeads = data || [];
}

function isLeadFollowUpEnabled(leadId) {
  const item = followUpLeads.find(
    (row) =>
      String(row.lead_id) ===
      String(leadId)
  );

  /*
   * Agar per-lead row exist nahi karti,
   * default ON maana ja raha hai.
   */
  return item
    ? item.enabled !== false
    : true;
}

async function toggleLeadFollowUp(
  leadId,
  enabled
) {
  const clientId = getClientId();

  if (!clientId) {
    throw new Error("Client ID nahi mila.");
  }

  const existing =
    followUpLeads.find(
      (row) =>
        String(row.lead_id) ===
        String(leadId)
    );

  if (existing) {
    const { error } = await db
      .from("client_followup_leads")
      .update({
        enabled,
        updated_at:
          new Date().toISOString(),
      })
      .eq("client_id", clientId)
      .eq("lead_id", leadId);

    if (error) {
      throw error;
    }

    existing.enabled = enabled;
  } else {
    const {
      data,
      error,
    } = await db
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

    if (data) {
      followUpLeads.push(data);
    }
  }

  renderLeads();
  renderStats();

  showToast(
    enabled
      ? "Is lead ke liye Follow-up ON hai."
      : "Is lead ke liye Follow-up OFF hai.",
    "success"
  );
}

/* =========================================================
   ACTION REQUESTS
   ========================================================= */

async function loadActionRequests() {
  const clientId = getClientId();

  if (!clientId) {
    return;
  }

  const { data, error } = await db
    .from("client_action_requests")
    .select("*")
    .eq("client_id", clientId)
    .eq("intent", "lead_follow_up")
    .order("created_at", {
      ascending: false,
    })
    .limit(50);

  if (error) {
    console.error(
      "Action request load error:",
      error
    );

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

  if (!clientId) {
    return;
  }

  const { data, error } = await db
    .from("follow_up_cases")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", {
      ascending: false,
    })
    .limit(50);

  if (error) {
    console.error(
      "Follow-up cases load error:",
      error
    );

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

  if (!clientId) {
    return;
  }

  const { data, error } = await db
    .from("follow_up_conclusions")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", {
      ascending: false,
    })
    .limit(50);

  if (error) {
    console.error(
      "Conclusions load error:",
      error
    );

    conclusions = [];
    return;
  }

  conclusions = data || [];
}

/* =========================================================
   PROPOSED CHANGES
   ========================================================= */

async function loadProposedChanges() {
  const clientId = getClientId();

  if (!clientId) {
    return;
  }

  const { data, error } =
    await db
      .from("follow_up_proposed_changes")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", {
        ascending: false,
      })
      .limit(100);

  if (error) {
    console.error(
      "Proposed changes load error:",
      error
    );

    proposedChanges = [];
    return;
  }

  proposedChanges = data || [];
}

/* =========================================================
   EVENTS
   ========================================================= */

function bindEvents() {
  const refreshBtn =
    document.getElementById(
      "refreshBtn"
    );

  if (refreshBtn) {
    refreshBtn.addEventListener(
      "click",
      async () => {
        try {
          refreshBtn.disabled = true;
          refreshBtn.textContent =
            "Refreshing…";

          await initialize();

          showToast(
            "Follow-up data refresh ho gaya.",
            "success"
          );
        } catch (error) {
          console.error(error);

          showToast(
            error?.message ||
              "Refresh failed.",
            "error"
          );
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.textContent =
            "Refresh";
        }
      }
    );
  }

  const saveSettingsBtn =
    document.getElementById(
      "saveSettingsBtn"
    );

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener(
      "click",
      async () => {
        try {
          saveSettingsBtn.disabled =
            true;
          saveSettingsBtn.textContent =
            "Saving…";

          await saveSettings();
        } catch (error) {
          console.error(error);

          showToast(
            error?.message ||
              "Settings save nahi hui.",
            "error"
          );
        } finally {
          saveSettingsBtn.disabled =
            false;
          saveSettingsBtn.textContent =
            "Save Settings";
        }
      }
    );
  }

  const followupEnabled =
    document.getElementById(
      "followupEnabled"
    );

  if (followupEnabled) {
    followupEnabled.addEventListener(
      "change",
      () => {
        renderStats();
        renderLeads();
      }
    );
  }

  const modalClose =
    document.getElementById(
      "modalClose"
    );

  if (modalClose) {
    modalClose.addEventListener(
      "click",
      closeModal
    );
  }

  const modal =
    document.getElementById("modal");

  if (modal) {
    modal.addEventListener(
      "click",
      (event) => {
        if (
          event.target === modal
        ) {
          closeModal();
        }
      }
    );
  }

  document.addEventListener(
    "click",
    async (event) => {
      const element =
        event.target.closest(
          "[data-action]"
        );

      if (!element) {
        return;
      }

      const action =
        element.dataset.action;

      try {
        switch (action) {
          case "connect-instagram":
            await connectInstagram();
            break;

          case "manage-voice":
            window.location.href =
              "voice-ai.html";
            break;

          case "request-followup":
            await requestFollowUp(
              element.dataset.leadId
            );
            break;

          case "edit-draft":
            openDraftEditor(
              element.dataset.requestId
            );
            break;

          case "save-draft":
            await saveDraftFromModal();
            break;

          case "approve-send":
            await approveAndSend(
              element.dataset.requestId
            );
            break;

          case "analyze-case":
            await analyzeCase(
              element.dataset.caseId
            );
            break;

          case "edit-change":
            openChangeEditor(
              element.dataset.changeId
            );
            break;

          case "approve-change":
            await approveProposedChange(
              element.dataset.changeId
            );
            break;

          case "apply-change":
            await applyProposedChange(
              element.dataset.changeId
            );
            break;

          case "close-modal":
            closeModal();
            break;

          default:
            break;
        }
      } catch (error) {
        console.error(
          `Follow-up action "${action}" failed:`,
          error
        );

        showToast(
          error?.message ||
            "Action complete nahi ho saka.",
          "error"
        );
      }
    }
  );

  document.addEventListener(
    "change",
    async (event) => {
      const checkbox =
        event.target.closest(
          '[data-action="toggle-lead"]'
        );

      if (!checkbox) {
        return;
      }

      try {
        await toggleLeadFollowUp(
          checkbox.dataset.leadId,
          checkbox.checked
        );
      } catch (error) {
        checkbox.checked =
          !checkbox.checked;

        showToast(
          error?.message ||
            "Lead setting update nahi hui.",
          "error"
        );
      }
    }
  );
}

/* =========================================================
   INSTAGRAM
   ========================================================= */

async function connectInstagram() {
  if (!currentUser) {
    showAuthRequired();
    return;
  }

  const {
    data: { session },
  } = await db.auth.getSession();

  if (!session?.access_token) {
    throw new Error(
      "Session expired. Dobara login karein."
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/instagram-oauth-start`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Authorization:
          `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        client_id: getClientId(),
      }),
    }
  );

  const result =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result?.error ||
        result?.message ||
        "Instagram connection start nahi ho saka."
    );
  }

  const url =
    result?.url ||
    result?.authorization_url ||
    null;

  if (!url) {
    throw new Error(
      "Instagram authorization URL nahi mila."
    );
  }

  window.location.href = url;
}

/* =========================================================
   REQUEST FOLLOW-UP
   ========================================================= */

async function requestFollowUp(
  leadId
) {
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

  const lead = leads.find(
    (item) =>
      String(item.id) ===
      String(leadId)
  );

  if (!lead) {
    throw new Error(
      "Lead nahi mila."
    );
  }

  /*
   * Current production-supported channel:
   * Instagram.
   *
   * WhatsApp/Email ko fake connected
   * assume nahi kiya ja raha.
   */
  const channel = "instagram";

  if (!isChannelConnected(channel)) {
    throw new Error(
      "Instagram connected, authenticated aur send-enabled nahi hai."
    );
  }

  const response =
    await callFollowUpFunction({
      action: "create_draft",
      lead_id: leadId,
      channel,
    });

  if (response?.error) {
    throw new Error(
      response.error
    );
  }

  await reloadOperationalData();

  renderEverything();

  showToast(
    "Follow-up draft create ho gaya.",
    "success"
  );
}

/* =========================================================
   EXISTING FOLLOW-UP EDGE FUNCTION
   ========================================================= */

async function callFollowUpFunction(
  payload
) {
  const {
    data: { session },
  } = await db.auth.getSession();

  if (!session?.access_token) {
    throw new Error(
      "Session expired. Dobara login karein."
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/lead-followup-handoff-v2`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Authorization:
          `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(
        payload
      ),
    }
  );

  const data =
    await response
      .json()
      .catch(() => ({}));

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

function getRequestPayload(
  request
) {
  return (
    request?.action_payload ||
    request?.payload ||
    {}
  );
}

function getRequestMessage(
  request
) {
  const payload =
    getRequestPayload(request);

  return (
    payload.message ||
    payload.body ||
    payload.text ||
    ""
  );
}

function openDraftEditor(
  requestId
) {
  const request =
    actionRequests.find(
      (item) =>
        String(item.id) ===
        String(requestId)
    );

  if (!request) {
    showToast(
      "Draft request nahi mila.",
      "error"
    );
    return;
  }

  const message =
    getRequestMessage(request);

  openModal(
    "Edit Follow-up Draft",
    `
      <div class="modal-form">
        <input
          type="hidden"
          id="draftRequestId"
          value="${escapeHtml(
            String(requestId)
          )}"
        >

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
        >${escapeHtml(
          message
        )}</textarea>

        <div class="modal-actions">
          <button
            type="button"
            class="btn ghost"
            data-action="close-modal"
          >
            Cancel
          </button>

          <button
            type="button"
            class="btn primary"
            data-action="save-draft"
          >
            Save Draft
          </button>
        </div>
      </div>
    `
  );
}

function closeModal() {
  const modal =
    document.getElementById(
      "modal"
    );

  if (!modal) {
    return;
  }

  modal.hidden = true;
}

async function saveDraftFromModal() {
  const requestId =
    document.getElementById(
      "draftRequestId"
    )?.value;

  const textarea =
    document.getElementById(
      "draftMessage"
    );

  if (!requestId) {
    throw new Error(
      "Draft request ID nahi mila."
    );
  }

  if (!textarea) {
    throw new Error(
      "Draft editor nahi mila."
    );
  }

  const message =
    textarea.value.trim();

  if (!message) {
    throw new Error(
      "Message empty nahi ho sakta."
    );
  }

  if (message.length > 2000) {
    throw new Error(
      "Message maximum 2000 characters ka ho sakta hai."
    );
  }

  /*
   * IMPORTANT:
   * Existing v2 function currently uses
   * request_id for save/send.
   *
   * Isliye yahan action_request_id
   * nahi bhejna hai.
   */
  const response =
    await callFollowUpFunction({
      action: "save_draft",
      request_id: requestId,
      message,
    });

  if (response?.error) {
    throw new Error(
      response.error
    );
  }

  closeModal();

  await reloadOperationalData();

  renderEverything();

  showToast(
    "Follow-up draft update ho gaya.",
    "success"
  );
}

/* =========================================================
   APPROVE + SEND
   ========================================================= */

async function approveAndSend(
  requestId
) {
  if (!settings?.enabled) {
    throw new Error(
      "Follow-up Specialist OFF hai."
    );
  }

  const request =
    actionRequests.find(
      (item) =>
        String(item.id) ===
        String(requestId)
    );

  if (!request) {
    throw new Error(
      "Action request nahi mila."
    );
  }

  if (
    request.status &&
    request.status !== "proposed"
  ) {
    throw new Error(
      `Request approve karne ke liye available nahi hai. Current status: ${request.status}`
    );
  }

  const payload =
    getRequestPayload(request);

  const channel =
    request.channel ||
    request.target_channel ||
    payload.channel ||
    "instagram";

  if (!isChannelConnected(channel)) {
    throw new Error(
      `${capitalize(
        channel
      )} connected aur send-enabled nahi hai.`
    );
  }

  const confirmed =
    window.confirm(
      "Kya aap is Follow-up ko send karna chahte hain?"
    );

  if (!confirmed) {
    return;
  }

  const response =
    await callFollowUpFunction({
      action: "approve_and_send",
      request_id: requestId,
    });

  if (response?.error) {
    throw new Error(
      response.error
    );
  }

  await reloadOperationalData();

  renderEverything();

  showToast(
    "Follow-up approve karke send kar diya gaya.",
    "success"
  );
}

/* =========================================================
   CASE ANALYSIS
   ========================================================= */

async function analyzeCase(
  caseId
) {
  /*
   * Backend analysis endpoint abhi
   * separate implementation phase mein hai.
   *
   * Client-side fake conclusion create
   * nahi kiya ja raha.
   */
  const caseItem =
    cases.find(
      (item) =>
        String(item.id) ===
        String(caseId)
    );

  if (!caseItem) {
    throw new Error(
      "Follow-up case nahi mila."
    );
  }

  showToast(
    "Conversation Analysis backend specialist workflow mein process hoga.",
    "info"
  );
}

/* =========================================================
   PROPOSED CHANGE EDITOR
   ========================================================= */

function openChangeEditor(
  changeId
) {
  const change =
    proposedChanges.find(
      (item) =>
        String(item.id) ===
        String(changeId)
    );

  if (!change) {
    throw new Error(
      "Proposed change nahi mila."
    );
  }

  const field =
    change.field_name ||
    change.field ||
    "";

  const currentValue =
    formatJsonValue(
      change.old_value
    );

  const proposedValue =
    formatJsonValue(
      change.proposed_value
    );

  openModal(
    "Edit Proposed Lead Change",
    `
      <div class="modal-form">

        <p class="muted">
          Field:
          <strong>
            ${escapeHtml(field)}
          </strong>
        </p>

        <label
          for="changeValue"
          class="form-label"
        >
          Proposed Value
        </label>

        <textarea
          id="changeValue"
          rows="5"
        >${escapeHtml(
          proposedValue
        )}</textarea>

        <p class="muted">
          Current value:
          ${escapeHtml(
            currentValue
          )}
        </p>

        <div class="modal-actions">
          <button
            type="button"
            class="btn ghost"
            data-action="close-modal"
          >
            Cancel
          </button>

          <button
            type="button"
            class="btn primary"
            disabled
            title="Backend edit endpoint next implementation phase mein enable hoga."
          >
            Save Edit
          </button>
        </div>

        <div class="page-message info">
          Edit UI prepared hai. Actual database mutation
          approval-safe backend endpoint ke through hogi.
        </div>

      </div>
    `
  );
}

async function approveProposedChange(
  changeId
) {
  const change =
    proposedChanges.find(
      (item) =>
        String(item.id) ===
        String(changeId)
    );

  if (!change) {
    throw new Error(
      "Proposed change nahi mila."
    );
  }

  showToast(
    "Proposed Lead Change approval backend workflow next implementation phase mein enable hoga.",
    "info"
  );
}

async function applyProposedChange(
  changeId
) {
  const change =
    proposedChanges.find(
      (item) =>
        String(item.id) ===
        String(changeId)
    );

  if (!change) {
    throw new Error(
      "Proposed change nahi mila."
    );
  }

  showToast(
    "Lead update sirf approved backend workflow ke through apply hoga.",
    "info"
  );
}

/* =========================================================
   RELOAD
   ========================================================= */

async function reloadOperationalData() {
  await loadSettings();
  await loadChannelConnections();
  await loadLeads();
  await loadFollowUpLeads();
  await loadActionRequests();
  await loadCases();
  await loadConclusions();
  await loadProposedChanges();
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
  const enabledInput =
    document.getElementById(
      "followupEnabled"
    );

  if (enabledInput) {
    enabledInput.checked =
      Boolean(settings?.enabled);
  }

  const mode =
    settings?.sending_mode ||
    "manual_approval";

  const modeInput =
    document.querySelector(
      `input[name="sendingMode"][value="${CSS.escape(
        mode
      )}"]`
    );

  if (modeInput) {
    modeInput.checked = true;
  }
}

/* =========================================================
   CHANNEL UI
   ========================================================= */

function renderChannels() {
  const container =
    document.getElementById(
      "channels"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    CHANNELS.map(
      (channel) => {
        const connection =
          getChannelConnection(
            channel.id
          );

        const connected =
          connection?.status ===
          "connected";

        const canSend =
          connected &&
          connection?.can_send === true;

        const reachable =
          connection?.customer_reachable !==
          false;

        let statusText =
          "Not connected";

        if (
          connected &&
          canSend &&
          reachable
        ) {
          statusText =
            "Connected & Send Ready";
        } else if (connected) {
          statusText =
            "Connected — Not Send Ready";
        } else if (
          connection?.status
        ) {
          statusText =
            capitalize(
              connection.status
            );
        }

        let actionHtml = "";

        if (
          channel.id ===
          "instagram"
        ) {
          actionHtml = `
            <button
              class="btn primary"
              type="button"
              data-action="connect-instagram"
            >
              ${
                connected
                  ? "Reconnect"
                  : "Connect"
              }
            </button>
          `;
        } else if (
          channel.id === "voice"
        ) {
          actionHtml = `
            <button
              class="btn ghost"
              type="button"
              data-action="manage-voice"
            >
              Manage Voice
            </button>
          `;
        } else {
          actionHtml = `
            <button
              class="btn ghost"
              type="button"
              disabled
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

              <h3>
                ${escapeHtml(
                  channel.name
                )}
              </h3>

              <p>
                ${escapeHtml(
                  channel.description
                )}
              </p>

              <span
                class="channel-status ${
                  connected &&
                  canSend &&
                  reachable
                    ? "connected"
                    : ""
                }"
              >
                ${escapeHtml(
                  statusText
                )}
              </span>

            </div>

            <div class="channel-actions">
              ${actionHtml}
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
  const tbody =
    document.getElementById(
      "leadsBody"
    );

  if (!tbody) {
    return;
  }

  if (!leads.length) {
    tbody.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="empty"
        >
          No leads found.
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML =
    leads.map(
      (lead) => {
        const enabled =
          isLeadFollowUpEnabled(
            lead.id
          );

        const name =
          lead.name ||
          lead.full_name ||
          lead.customer_name ||
          "Unnamed Lead";

        const phone =
          lead.mobile ||
          lead.phone ||
          lead.whatsapp ||
          "";

        const status =
          lead.status ||
          lead.stage ||
          "new";

        const channel =
          lead.instagram_thread_id
            ? "Instagram"
            : "Not detected";

        const lastActivity =
          lead.last_contacted_at ||
          lead.updated_at ||
          lead.created_at ||
          "";

        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  name
                )}
              </strong>

              ${
                phone
                  ? `
                    <div class="muted">
                      ${escapeHtml(
                        phone
                      )}
                    </div>
                  `
                  : ""
              }
            </td>

            <td>
              <label class="switch">
                <input
                  type="checkbox"
                  data-action="toggle-lead"
                  data-lead-id="${escapeHtml(
                    String(
                      lead.id
                    )
                  )}"
                  ${
                    enabled
                      ? "checked"
                      : ""
                  }
                >
                <span class="slider"></span>
              </label>
            </td>

            <td>
              ${escapeHtml(
                channel
              )}
            </td>

            <td>
              <span class="status-pill">
                ${escapeHtml(
                  capitalize(
                    status
                  )
                )}
              </span>
            </td>

            <td>
              ${escapeHtml(
                formatDate(
                  lastActivity
                )
              )}
            </td>

            <td>
              <button
                class="btn primary"
                type="button"
                data-action="request-followup"
                data-lead-id="${escapeHtml(
                  String(
                    lead.id
                  )
                )}"
                ${
                  !settings?.enabled ||
                  !enabled
                    ? "disabled"
                    : ""
                }
              >
                Request Follow-up
              </button>
            </td>

          </tr>
        `;
      }
    ).join("");
}

/* =========================================================
   APPROVALS UI
   ========================================================= */

function renderApprovals() {
  const container =
    document.getElementById(
      "approvalsList"
    );

  if (!container) {
    return;
  }

  const pending =
    actionRequests.filter(
      (request) =>
        request.status ===
          "proposed" ||
        request.status ===
          "drafted"
    );

  if (!pending.length) {
    container.innerHTML = `
      <div class="empty">
        No pending approvals.
      </div>
    `;

    return;
  }

  container.innerHTML =
    pending.map(
      (request) => {
        const payload =
          getRequestPayload(
            request
          );

        const message =
          getRequestMessage(
            request
          ) ||
          "Message unavailable";

        const leadId =
          request.lead_id ||
          request.target_id ||
          payload.lead_id ||
          "";

        const lead =
          leads.find(
            (item) =>
              String(item.id) ===
              String(leadId)
          );

        const leadName =
          lead?.name ||
          lead?.full_name ||
          lead?.customer_name ||
          "Lead";

        const channel =
          request.channel ||
          request.target_channel ||
          payload.channel ||
          "instagram";

        return `
          <div class="approval-card">

            <div class="approval-header">
              <div>
                <span class="label">
                  FOLLOW-UP DRAFT
                </span>

                <h3>
                  ${escapeHtml(
                    leadName
                  )}
                </h3>
              </div>

              <span class="status-pill">
                ${escapeHtml(
                  request.status ||
                    "proposed"
                )}
              </span>
            </div>

            <div class="muted">
              Channel:
              ${escapeHtml(
                capitalize(
                  channel
                )
              )}
            </div>

            <div class="draft-message">
              ${escapeHtml(
                message
              )}
            </div>

            <div class="approval-actions">

              <button
                class="btn ghost"
                type="button"
                data-action="edit-draft"
                data-request-id="${escapeHtml(
                  String(
                    request.id
                  )
                )}"
              >
                Edit
              </button>

              <button
                class="btn primary"
                type="button"
                data-action="approve-send"
                data-request-id="${escapeHtml(
                  String(
                    request.id
                  )
                )}"
              >
                Approve & Send
              </button>

            </div>

          </div>
        `;
      }
    ).join("");
}

/* =========================================================
   PROPOSED CHANGES UI
   ========================================================= */

function renderProposedChanges() {
  const container =
    document.getElementById(
      "changesList"
    );

  if (!container) {
    return;
  }

  const pending =
    proposedChanges.filter(
      (change) =>
        change.status ===
          "proposed" ||
        change.status ===
          "edited" ||
        change.status ===
          "pending"
    );

  if (!pending.length) {
    container.innerHTML = `
      <div class="empty">
        No proposed lead changes.
      </div>
    `;

    return;
  }

  container.innerHTML =
    pending.map(
      (change) => {
        const field =
          change.field_name ||
          change.field ||
          "Lead field";

        return `
          <div class="change-card">

            <div class="change-header">

              <strong>
                ${escapeHtml(
                  field
                )}
              </strong>

              <span class="status-pill">
                ${escapeHtml(
                  change.status ||
                    "proposed"
                )}
              </span>

            </div>

            <div class="change-values">

              <div>
                <small>
                  Current
                </small>

                <div>
                  ${escapeHtml(
                    formatJsonValue(
                      change.old_value
                    )
                  )}
                </div>
              </div>

              <div>
                →
              </div>

              <div>
                <small>
                  Proposed
                </small>

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
              <strong>
                Reason:
              </strong>

              ${escapeHtml(
                change.reason ||
                  "No reason provided."
              )}
            </div>

            <div class="change-actions">

              <button
                class="btn ghost"
                type="button"
                data-action="edit-change"
                data-change-id="${escapeHtml(
                  String(
                    change.id
                  )
                )}"
              >
                Edit
              </button>

              ${
                change.status ===
                  "approved"
                  ? `
                    <button
                      class="btn primary"
                      type="button"
                      data-action="apply-change"
                      data-change-id="${escapeHtml(
                        String(
                          change.id
                        )
                      )}"
                    >
                      Apply
                    </button>
                  `
                  : `
                    <button
                      class="btn primary"
                      type="button"
                      data-action="approve-change"
                      data-change-id="${escapeHtml(
                        String(
                          change.id
                        )
                      )}"
                    >
                      Review & Approve
                    </button>
                  `
              }

            </div>

          </div>
        `;
      }
    ).join("");
}

/* =========================================================
   CONCLUSIONS UI
   ========================================================= */

function renderConclusions() {
  const container =
    document.getElementById(
      "conclusionsList"
    );

  if (!container) {
    return;
  }

  if (!conclusions.length) {
    container.innerHTML = `
      <div class="empty">
        No conclusions yet.
      </div>
    `;

    return;
  }

  container.innerHTML =
    conclusions.map(
      (conclusion) => {
        const confidence =
          Number(
            conclusion.confidence
          );

        const confidenceText =
          Number.isFinite(
            confidence
          )
            ? `${Math.round(
                confidence * 100
              )}%`
            : "—";

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
                Confidence:
                ${confidenceText}
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
                <small>
                  Interest
                </small>

                <strong>
                  ${escapeHtml(
                    conclusion.interest ||
                      "—"
                  )}
                </strong>
              </div>

              <div>
                <small>
                  Stage
                </small>

                <strong>
                  ${escapeHtml(
                    conclusion.stage ||
                      "—"
                  )}
                </strong>
              </div>

              <div>
                <small>
                  Sentiment
                </small>

                <strong>
                  ${escapeHtml(
                    conclusion.sentiment ||
                      "—"
                  )}
                </strong>
              </div>

              <div>
                <small>
                  Buying Signal
                </small>

                <strong>
                  ${escapeHtml(
                    conclusion.buying_signal ||
                      "—"
                  )}
                </strong>
              </div>

            </div>

            <div class="next-action">

              <strong>
                Next Action:
              </strong>

              ${escapeHtml(
                conclusion.next_action ||
                  "—"
              )}

            </div>

          </div>
        `;
      }
    ).join("");
}

/* =========================================================
   STATS
   ========================================================= */

function renderStats() {
  const activeCount =
    document.getElementById(
      "activeCount"
    );

  const approvalCount =
    document.getElementById(
      "approvalCount"
    );

  const analysisCount =
    document.getElementById(
      "analysisCount"
    );

  const changesCount =
    document.getElementById(
      "changesCount"
    );

  const active =
    leads.filter(
      (lead) =>
        isLeadFollowUpEnabled(
          lead.id
        )
    ).length;

  const approvals =
    actionRequests.filter(
      (item) =>
        item.status ===
          "proposed" ||
        item.status ===
          "drafted"
    ).length;

  const analysis =
    cases.filter(
      (item) =>
        item.status ===
          "sent" ||
        item.status ===
          "handed_off" ||
        item.status ===
          "analyzing"
    ).length;

  const changes =
    proposedChanges.filter(
      (item) =>
        item.status ===
          "proposed" ||
        item.status ===
          "edited" ||
        item.status ===
          "pending"
    ).length;

  if (activeCount) {
    activeCount.textContent =
      String(active);
  }

  if (approvalCount) {
    approvalCount.textContent =
      String(approvals);
  }

  if (analysisCount) {
    analysisCount.textContent =
      String(analysis);
  }

  if (changesCount) {
    changesCount.textContent =
      String(changes);
  }
}

/* =========================================================
   MODAL
   ========================================================= */

function openModal(
  title,
  body
) {
  const modal =
    document.getElementById(
      "modal"
    );

  const modalTitle =
    document.getElementById(
      "modalTitle"
    );

  const modalBody =
    document.getElementById(
      "modalBody"
    );

  if (
    !modal ||
    !modalTitle ||
    !modalBody
  ) {
    throw new Error(
      "Modal structure nahi mila."
    );
  }

  modalTitle.textContent =
    title;

  modalBody.innerHTML =
    body;

  modal.hidden = false;
}

/* =========================================================
   AUTH REQUIRED
   ========================================================= */

function showAuthRequired() {
  const pageMessage =
    document.getElementById(
      "pageMessage"
    );

  if (!pageMessage) {
    return;
  }

  pageMessage.hidden = false;

  pageMessage.innerHTML = `
    <strong>
      Login Required
    </strong>

    <p>
      Follow-up Specialist use karne ke liye
      pehle client dashboard mein login karein.
    </p>

    <a
      href="login.html"
      class="btn primary"
    >
      Login
    </a>
  `;
}

/* =========================================================
   PAGE MESSAGE
   ========================================================= */

function setPageMessage(
  message,
  type = "info"
) {
  const element =
    document.getElementById(
      "pageMessage"
    );

  if (!element) {
    return;
  }

  element.hidden = false;

  element.className =
    `page-message ${type}`;

  element.textContent =
    message;
}

/* =========================================================
   AUTH STATUS
   ========================================================= */

function setAuthStatus(
  text
) {
  const element =
    document.getElementById(
      "authStatus"
    );

  if (element) {
    element.textContent =
      text;
  }
}

/* =========================================================
   TOAST
   ========================================================= */

function showToast(
  message,
  type = "info"
) {
  let container =
    document.getElementById(
      "toastContainer"
    );

  if (!container) {
    container =
      document.createElement(
        "div"
      );

    container.id =
      "toastContainer";

    container.style.position =
      "fixed";

    container.style.right =
      "20px";

    container.style.bottom =
      "20px";

    container.style.zIndex =
      "99999";

    document.body.appendChild(
      container
    );
  }

  const toast =
    document.createElement(
      "div"
    );

  toast.className =
    `toast toast-${type}`;

  toast.textContent =
    message;

  toast.style.marginTop =
    "10px";

  toast.style.padding =
    "12px 16px";

  toast.style.borderRadius =
    "10px";

  toast.style.background =
    "#111827";

  toast.style.color =
    "#fff";

  toast.style.boxShadow =
    "0 10px 30px rgba(0,0,0,.2)";

  toast.style.maxWidth =
    "360px";

  container.appendChild(
    toast
  );

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function capitalize(
  value
) {
  if (!value) {
    return "";
  }

  const text =
    String(value);

  return (
    text
      .charAt(0)
      .toUpperCase() +
    text.slice(1)
  );
}

function formatJsonValue(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  try {
    return JSON.stringify(
      value
    );
  } catch {
    return String(value);
  }
}

function formatDate(
  value
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  );
}

/* =========================================================
   GLOBAL HELPERS
   ========================================================= */

window.showToast =
  showToast;

window.loadFollowUpSpecialist =
  initialize;
