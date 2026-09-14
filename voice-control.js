const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let clientId = null;
let agentId = null;
let incomingEnabled = false;

function state(text, cls = "") {
  $("saveState").textContent = text;
  $("saveState").className = "save-state " + cls;
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

  renderToggle();

  $("rules").value = data.instructions || "";

  state("Voice AI ready", "ok");
}

function renderToggle() {
  const button = $("incomingToggle");

  button.classList.toggle("on", incomingEnabled);
  button.classList.toggle("off", !incomingEnabled);

  button.setAttribute(
    "aria-pressed",
    String(incomingEnabled)
  );

  $("incomingLabel").textContent =
    incomingEnabled ? "ON" : "OFF";
}

async function setIncoming() {
  if (!agentId) return;

  const next = !incomingEnabled;

  incomingEnabled = next;

  renderToggle();

  $("incomingToggle").disabled = true;

  state("Saving incoming call setting…");

  const { error } = await db
    .from("voice_agents")
    .update({
      incoming_enabled: next
    })
    .eq("id", agentId);

  $("incomingToggle").disabled = false;

  if (error) {
    incomingEnabled = !next;

    renderToggle();

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

async function saveRules() {
  if (!agentId) return;

  $("rulesStatus").textContent = "Saving…";

  const { error } = await db
    .from("voice_agents")
    .update({
      instructions: $("rules").value.trim()
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

async function startOutboundCall() {
  const phone = $("phone").value.trim();
  const instructions = $("instructions").value.trim();

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

  $("startCall").disabled = true;

  $("callStatus").textContent =
    "Call request prepare ho rahi hai…";

  /*
   * IMPORTANT:
   * Provider ko direct browser se call nahi kiya jayega.
   *
   * Secure outbound-call Edge Function next step mein connect hogi.
   *
   * Automatic calling intentionally disabled hai.
   */

  $("callStatus").textContent =
    "Number aur instructions ready hain. Secure outbound calling backend connect hone ke baad yahin se call start hogi.";

  $("startCall").disabled = false;
}

$("incomingToggle").addEventListener(
  "click",
  setIncoming
);

$("saveRules").addEventListener(
  "click",
  saveRules
);

$("startCall").addEventListener(
  "click",
  startOutboundCall
);

loadAgent().catch((error) => {
  state(error.message, "error");
});
