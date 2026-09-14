const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const statusEl = document.getElementById("status");
const nameEl = document.getElementById("agentName");
const goalEl = document.getElementById("agentGoal");
const conversationEl = document.getElementById("conversation");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const orb = document.getElementById("orb");

let accessToken = null;
let conversationId = null;
let agent = null;
let recognition = null;
let listening = false;
let speaking = false;
let stopping = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function addMessage(role, text) {
  const div = document.createElement("div");

  div.className = `msg ${role}`;
  div.textContent = text;

  conversationEl.appendChild(div);
  conversationEl.scrollTop = conversationEl.scrollHeight;
}

function speechLanguage() {
  const lang = (agent?.language || "hinglish").toLowerCase();

  if (lang.includes("english")) {
    return "en-IN";
  }

  if (lang.includes("hindi") || lang.includes("hinglish")) {
    return "hi-IN";
  }

  return "en-IN";
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    setStatus("Browser TTS supported nahi hai.");
    return;
  }

  speaking = true;

  orb.classList.add("speaking");
  setStatus("AI बोल रहा है…");

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = speechLanguage();
  utterance.rate = 0.95;
  utterance.pitch = 1;

  utterance.onend = () => {
    speaking = false;
    orb.classList.remove("speaking");

    if (!stopping) {
      startListening();
    }
  };

  utterance.onerror = () => {
    speaking = false;
    orb.classList.remove("speaking");

    if (!stopping) {
      startListening();
    }
  };

  window.speechSynthesis.speak(utterance);
}

function setupRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return false;
  }

  recognition = new SpeechRecognition();

  recognition.lang = speechLanguage();
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    listening = true;

    orb.classList.add("listening");

    setStatus("सुन रहा हूँ…");
  };

  recognition.onend = () => {
    listening = false;

    orb.classList.remove("listening");
  };

  recognition.onerror = (event) => {
    listening = false;

    orb.classList.remove("listening");

    if (event.error !== "no-speech" && !stopping) {
      setStatus("Microphone error: " + event.error);
    }
  };

  recognition.onresult = async (event) => {
    const lastResult =
      event.results[event.results.length - 1];

    const text = lastResult[0].transcript.trim();

    if (!text || stopping) {
      return;
    }

    addMessage("user", text);

    await sendMessage(text);
  };

  return true;
}

function startListening() {
  if (stopping || speaking || !recognition) {
    return;
  }

  try {
    recognition.lang = speechLanguage();

    recognition.start();
  } catch (error) {
    // Recognition may already be running.
  }
}

async function sendMessage(message) {
  setStatus("AI सोच रहा है…");

  try {
    const { data, error } =
      await supabaseClient.functions.invoke(
        "voice-message",
        {
          body: {
            conversation_id: conversationId,
            message: message
          }
        }
      );

    if (error) {
      throw error;
    }

    if (!data?.reply) {
      throw new Error("AI reply missing");
    }

    addMessage("ai", data.reply);

    speak(data.reply);
  } catch (error) {
    console.error("Voice AI message error:", error);

    setStatus("AI response failed");

    addMessage(
      "ai",
      "अभी AI response नहीं मिल पाया। कृपया फिर से कोशिश करें।"
    );
  }
}

async function startConversation() {
  stopping = false;

  startBtn.disabled = true;
  stopBtn.disabled = false;

  setStatus("Starting voice session…");

  try {
    const { data, error } =
      await supabaseClient.functions.invoke(
        "voice-session",
        {
          body: {}
        }
      );

    if (error) {
      throw error;
    }

    const sessionResult =
      await supabaseClient.auth.getSession();

    accessToken =
      sessionResult.data.session?.access_token || null;

    conversationId = data?.conversation_id;

    agent = data?.agent || {};

    nameEl.textContent =
      agent.name || "GLIME Voice AI";

    goalEl.textContent =
      agent.goal || "आपका AI business assistant";

    if (!conversationId) {
      throw new Error(
        "Conversation session missing"
      );
    }

    const recognitionReady =
      setupRecognition();

    if (!recognitionReady) {
      setStatus(
        "इस browser में Speech Recognition उपलब्ध नहीं है। Chrome/Android इस्तेमाल करें।"
      );

      startBtn.disabled = false;
      stopBtn.disabled = true;

      return;
    }

    const greeting =
      agent.greeting ||
      "नमस्ते! मैं GLIME Voice AI हूँ। मैं आपकी कैसे मदद करूँ?";

    addMessage("ai", greeting);

    speak(greeting);
  } catch (error) {
    console.error(
      "Voice session error:",
      error
    );

    setStatus(
      "Voice AI access/session failed"
    );

    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function stopConversation() {
  stopping = true;

  if (recognition) {
    try {
      recognition.stop();
    } catch (error) {
      // Ignore recognition stop errors.
    }
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  speaking = false;
  listening = false;

  orb.classList.remove(
    "listening",
    "speaking"
  );

  startBtn.disabled = false;
  stopBtn.disabled = true;

  setStatus("Conversation stopped");
}

async function init() {
  setStatus("Checking login…");

  const { data } =
    await supabaseClient.auth.getSession();

  if (!data.session) {
    setStatus("Login required");

    goalEl.textContent =
      "पहले GLIME client dashboard में login करें।";

    return;
  }

  startBtn.disabled = false;

  setStatus("Ready");

  goalEl.textContent =
    "Start Conversation दबाकर बोलना शुरू करें।";
}

startBtn.addEventListener(
  "click",
  startConversation
);

stopBtn.addEventListener(
  "click",
  stopConversation
);

init();
