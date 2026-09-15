const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let clientId = null;
let agentId = null;

let incomingEnabled = false;
let outboundEnabled = false;
let agentPhoneNumber = "";

function state(text, cls = "") {
  const el = $("saveState");

  if (!el) return;

  el.textContent = text;
  el.className = "save-state " + cls;
}

async function getClient() {
  const {
    data: { session }
  } = await db.auth.getSession();

  if (!session) {
    throw new Error("Please login from the GLIME Client Dashboard.");
  }

  const { data, error } = await db
    .from("client_data")
    .select("client_id")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data?.client_id) {
    throw new Error("Client profile not found.");
  }

  return data.client_id;
}

async function loadAgent() {
  clientId = await getClient();

  const { data, error } = await db
    .from("voice_agents")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(
      "No active Voice AI agent found. Create the agent first."
    );
  }

  agentId = data.id;

  incomingEnabled = data.incoming_enabled === true;
  outboundEnabled = data.outbound_enabled === true;
  agentPhoneNumber = data.phone_number || "";

  renderIncomingToggle();
  renderOutboundState();

  if ($("rules")) {
    $("rules").value = data.instructions || "";
  }

  state("Voice AI ready", "ok");
}

/* -----------------------------
   INCOMING CALL CONTROL
----------------------------- */

function renderIncomingToggle() {
  const button = $("incomingToggle");

  if (!button) return;

  button.classList.toggle("on", incomingEnabled);
  button.classList.toggle("off", !incomingEnabled);

  button.setAttribute(
    "aria-pressed",
    String(incomingEnabled)
  );

  if ($("incomingLabel")) {
    $("incomingLabel").textContent =
      incomingEnabled ? "ON" : "OFF";
  }
}

async function setIncoming() {
  if (!agentId) return;

  const next = !incomingEnabled;

  incomingEnabled = next;

  renderIncomingToggle();

  const button = $("incomingToggle");

  if (button) {
    button.disabled = true;
  }

  state("Saving incoming call setting…");

  const { error } = await db
    .from("voice_agents")
    .update({
      incoming_enabled: next
    })
    .eq("id", agentId);

  if (button) {
    button.disabled = false;
  }

  if (error) {
    incomingEnabled = !next;

    renderIncomingToggle();

    state(error.message, "error");

    return;
  }

  state(
    next
      ? "Incoming calls are ON"
      : "Incoming calls are OFF",
    "ok"
  );
}

/* -----------------------------
   OUTBOUND CALL CONTROL
----------------------------- */

function renderOutboundState() {
  /*
   * Current HTML may not yet have a dedicated outbound toggle.
   *
   * इसलिए यह function existing UI को break नहीं करता.
   */

  const button = $("outboundToggle");

  if (button) {
    button.classList.toggle("on", outboundEnabled);
    button.classList.toggle("off", !outboundEnabled);

    button.setAttribute(
      "aria-pressed",
      String(outboundEnabled)
    );
  }

  if ($("outboundLabel")) {
    $("outboundLabel").textContent =
      outboundEnabled ? "ON" : "OFF";
  }

  /*
   * Start button को भी outbound permission के अनुसार
   * enable/disable किया जाता है.
   */

  const startButton = $("startCall");

  if (startButton) {
    startButton.disabled = !outboundEnabled;
  }

  if ($("outboundStatus")) {
    $("outboundStatus").textContent =
      outboundEnabled
        ? "Outbound calling is ON."
        : "Outbound calling is OFF.";
  }
}

async function setOutbound() {
  if (!agentId) return;

  const next = !outboundEnabled;

  outboundEnabled = next;

  renderOutboundState();

  const button = $("outboundToggle");

  if (button) {
    button.disabled = true;
  }

  state("Saving outbound call setting…");

  const { error } = await db
    .from("voice_agents")
    .update({
      outbound_enabled: next
    })
    .eq("id", agentId);

  if (button) {
    button.disabled = false;
  }

  if (error) {
    outboundEnabled = !next;

    renderOutboundState();

    state(error.message, "error");

    return;
  }

  state(
    next
      ? "Outbound calls are ON"
      : "Outbound calls are OFF",
    "ok"
  );
}

/* -----------------------------
   SAVE AI RULES
----------------------------- */

async function saveRules() {
  if (!agentId) return;

  const rules = $("rules");

  if (!rules) return;

  $("rulesStatus").textContent = "Saving…";
  $("rulesStatus").className = "inline-status";

  const { error } = await db
    .from("voice_agents")
    .update({
      instructions: rules.value.trim()
    })
    .eq("id", agentId);

  if (error) {
    $("rulesStatus").textContent = error.message;
    $("rulesStatus").className =
      "inline-status error";
  } else {
    $("rulesStatus").textContent =
      "Instructions saved.";

    $("rulesStatus").className =
      "inline-status ok";
  }
}

/* -----------------------------
   SECURE OUTBOUND REQUEST
----------------------------- */

async function startOutboundCall() {
  /*
   * HARD SAFETY CHECK
   *
   * Outbound OFF होने पर किसी भी हालत में
   * Edge Function को request नहीं भेजेंगे.
   */

  if (!outboundEnabled) {
    $("callStatus").textContent =
      "Outbound Calls OFF हैं. पहले Outbound Calls को ON करें.";

    return;
  }

  const phone = $("phone")?.value.trim() || "";
  const instructions =
    $("instructions")?.value.trim() || "";

  if (!/^\+?[0-9][0-9\s-]{7,19}$/.test(phone)) {
    $("callStatus").textContent =
      "Valid customer phone number enter karein.";

    return;
  }

  if (!instructions) {
    $("callStatus").textContent =
      "AI ke liye conversation instructions likhein.";

    return;
  }

  if (instructions.length > 8000) {
    $("callStatus").textContent =
      "Instructions 8000 characters se kam honi chahiye.";

    return;
  }

  const button = $("startCall");

  if (button) {
    button.disabled = true;
  }

  $("callStatus").textContent =
    "Secure outbound call request bheji ja rahi hai…";

  try {
    /*
     * Current logged-in session.
     *
     * Secret/API key browser mein expose nahi hogi.
     */

    const {
      data: { session },
      error: sessionError
    } = await db.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      throw new Error(
        "Session expired. Please login again."
      );
    }

    /*
     * Secure Supabase Edge Function.
     *
     * IMPORTANT:
     * यह अभी phone provider को directly call नहीं करती.
     * यह केवल voice_outbound_requests में request बनाती है.
     */

    const {
      data,
      error
    } = await db.functions.invoke(
      "voice-outbound-create",
      {
        body: {
          phone,
          instructions
        }
      }
    );

    if (error) {
      throw error;
    }

    if (!data?.success) {
      throw new Error(
        data?.error ||
        "Outbound call request create nahi ho saki."
      );
    }

    $("callStatus").textContent =
      "Outbound call request successfully create ho gayi.";

    state(
      "Outbound call request created.",
      "ok"
    );

    /*
     * Provider अभी connected नहीं है,
     * इसलिए यहाँ fake "Call started" message नहीं दिखाएँगे.
     */

    if (data.status === "requested") {
      $("callStatus").textContent =
        "Request create ho gayi. Phone provider connect hone ke baad actual call start hogi.";
    }

  } catch (error) {
    console.error(
      "Outbound call error:",
      error
    );

    $("callStatus").textContent =
      error?.message ||
      "Outbound call request failed.";

    state(
      "Outbound request failed.",
      "error"
    );

  } finally {
    /*
     * अगर outbound अभी भी ON है तो button वापस enable करें.
     * OFF हो चुका हो तो disabled रहेगा.
     */

    if (button) {
      button.disabled = !outboundEnabled;
    }
  }
}

/* -----------------------------
   EVENT LISTENERS
----------------------------- */

if ($("incomingToggle")) {
  $("incomingToggle").addEventListener(
    "click",
    setIncoming
  );
}

if ($("outboundToggle")) {
  $("outboundToggle").addEventListener(
    "click",
    setOutbound
  );
}

if ($("saveRules")) {
  $("saveRules").addEventListener(
    "click",
    saveRules
  );
}

if ($("startCall")) {
  $("startCall").addEventListener(
    "click",
    startOutboundCall
  );
}

/* -----------------------------
   INITIAL LOAD
----------------------------- */

loadAgent().catch((error) => {
  console.error(
    "Voice Control load error:",
    error
  );

  state(
    error.message,
    "error"
  );

  if ($("startCall")) {
    $("startCall").disabled = true;
  }
});
