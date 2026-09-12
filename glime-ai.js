
(() => {
  "use strict";

  /*
   * ==========================================================
   * GLIME AI — PRODUCTION FRONTEND
   * ==========================================================
   *
   * Browser
   *    ↓
   * Supabase Edge Function
   *    ↓
   * Session / usage validation
   *    ↓
   * GLIME AI logic
   *    ↓
   * Gemini
   *
   * IMPORTANT:
   * Gemini API key is NEVER stored here.
   */

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  /*
   * यहाँ अपना existing Supabase PUBLISHABLE / ANON KEY डालें.
   *
   * SERVICE ROLE KEY यहाँ कभी नहीं डालनी है.
   */
  const SUPABASE_PUBLISHABLE_KEY =
    "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE";

  const EDGE_FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/glime-ai`;

  const GUEST_LIMIT = 5;
  const VERIFIED_LIMIT = 15;

  const SESSION_STORAGE_KEY = "glime_ai_session_id";

  const state = {
    sessionId: null,
    verified: false,
    questionsUsed: 0,
    lockedUntil: null,
    messages: [],
    diagnosis: null,
    busy: false,
    email: ""
  };

  const $ = (id) => document.getElementById(id);

  const chatWindow = $("chat-window");
  const input = $("chat-input");
  const form = $("chat-form");
  const counter = $("question-counter");
  const usageText = $("usage-text");
  const accessCard = $("access-card");
  const lockCard = $("lock-card");
  const diagnosisCard = $("diagnosis-card");
  const composerArea = $("composer-area");
  const sendButton = $("send-button");

  /*
   * ==========================================================
   * SUPABASE CLIENT
   * ==========================================================
   */

  let supabaseClient = null;

  async function loadSupabase() {

    if (
      typeof window.supabase !== "undefined" &&
      window.supabase.createClient
    ) {
      return;
    }

    await new Promise((resolve, reject) => {

      const script = document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

      script.onload = resolve;

      script.onerror = () => {
        reject(
          new Error("Supabase library could not be loaded.")
        );
      };

      document.head.appendChild(script);
    });
  }

  async function initSupabase() {

    await loadSupabase();

    if (
      SUPABASE_PUBLISHABLE_KEY ===
      "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE"
    ) {
      throw new Error(
        "Supabase publishable key is not configured."
      );
    }

    supabaseClient =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
  }

  /*
   * ==========================================================
   * SESSION
   * ==========================================================
   */

  function getOrCreateSessionId() {

    let id =
      localStorage.getItem(
        SESSION_STORAGE_KEY
      );

    if (!id) {

      if (crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id =
          `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;
      }

      localStorage.setItem(
        SESSION_STORAGE_KEY,
        id
      );
    }

    return id;
  }

  /*
   * ==========================================================
   * UI
   * ==========================================================
   */

  function addMessage(role, text) {

    const row =
      document.createElement("div");

    row.className =
      `message ${role}`;

    const bubble =
      document.createElement("div");

    bubble.className =
      "message-bubble";

    bubble.textContent = text;

    row.appendChild(bubble);

    chatWindow.appendChild(row);

    chatWindow.scrollTop =
      chatWindow.scrollHeight;

    state.messages.push({
      role,
      text
    });
  }

  function showTyping() {

    hideTyping();

    const row =
      document.createElement("div");

    row.className = "message ai";

    row.id = "typing-indicator";

    row.innerHTML = `
      <div class="message-bubble typing">
        <i></i>
        <i></i>
        <i></i>
      </div>
    `;

    chatWindow.appendChild(row);

    chatWindow.scrollTop =
      chatWindow.scrollHeight;
  }

  function hideTyping() {

    const typing =
      $("typing-indicator");

    if (typing) {
      typing.remove();
    }
  }

  function updateCounter() {

    const limit =
      state.verified
        ? VERIFIED_LIMIT
        : GUEST_LIMIT;

    const remaining =
      Math.max(
        0,
        limit - state.questionsUsed
      );

    counter.textContent =
      `${state.questionsUsed} / ${limit}`;

    usageText.textContent =
      state.verified
        ? `${remaining} QUESTIONS REMAINING`
        : `${remaining} FREE QUESTIONS`;
  }

  function showGuestGate() {

    accessCard.hidden = false;

    composerArea.hidden = true;

    accessCard.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function showLock(lockedUntil) {

    state.lockedUntil =
      lockedUntil || null;

    lockCard.hidden = false;

    composerArea.hidden = true;

    const lockTime =
      $("lock-time");

    if (lockedUntil) {

      const date =
        new Date(lockedUntil);

      lockTime.textContent =
        `Available again: ${date.toLocaleString()}`;

    } else {

      lockTime.textContent =
        "Please try again later.";
    }

    lockCard.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function showDiagnosis(data) {

    diagnosisCard.hidden = false;

    const summary =
      data?.summary ||
      "GLIME AI has understood your business context and prepared a practical system direction.";

    $("diagnosis-summary").textContent =
      summary;

    diagnosisCard.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function setComposerEnabled(enabled) {

    input.disabled =
      !enabled;

    sendButton.disabled =
      !enabled;
  }

  /*
   * ==========================================================
   * EDGE FUNCTION REQUEST
   * ==========================================================
   */

  async function callGLIMEAI(message) {

    const session =
      await supabaseClient.auth.getSession();

    const accessToken =
      session?.data?.session?.access_token ||
      null;

    const response =
      await fetch(
        EDGE_FUNCTION_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            ...(accessToken
              ? {
                  "Authorization":
                    `Bearer ${accessToken}`
                }
              : {})
          },

          body: JSON.stringify({

            session_id:
              state.sessionId,

            message,

            messages:
              state.messages,

            client_context: {
              page: "glime-ai",
              source: "glime-ai.html"
            }
          })
        }
      );

    let data = null;

    try {
      data =
        await response.json();
    } catch {
      throw new Error(
        "Invalid response from GLIME AI server."
      );
    }

    if (!response.ok) {

      const error =
        new Error(
          data?.error ||
          "GLIME AI request failed."
        );

      error.code =
        data?.code;

      error.locked_until =
        data?.locked_until;

      error.questions_used =
        data?.questions_used;

      throw error;
    }

    return data;
  }

  /*
   * ==========================================================
   * SEND MESSAGE
   * ==========================================================
   */

  async function sendMessage(text) {

    const trimmed =
      text.trim();

    if (!trimmed) {
      return;
    }

    if (state.busy) {
      return;
    }

    state.busy = true;

    setComposerEnabled(false);

    addMessage(
      "user",
      trimmed
    );

    input.value = "";

    showTyping();

    try {

      const data =
        await callGLIMEAI(
          trimmed
        );

      hideTyping();

      /*
       * Server is authoritative.
       * Never trust frontend question count.
       */

      if (
        Number.isInteger(
          data.questions_used
        )
      ) {
        state.questionsUsed =
          data.questions_used;
      }

      if (
        typeof data.verified ===
        "boolean"
      ) {
        state.verified =
          data.verified;
      }

      updateCounter();

      /*
       * Server may return access state.
       */

      if (data.locked) {

        showLock(
          data.locked_until
        );

        return;
      }

      /*
       * AI response
       */

      if (data.reply) {

        addMessage(
          "ai",
          data.reply
        );
      }

      /*
       * Diagnosis
       */

      if (
        data.diagnosis
      ) {

        state.diagnosis =
          data.diagnosis;

        showDiagnosis(
          data.diagnosis
        );
      }

      /*
       * Guest limit reached
       */

      if (
        data.requires_email
      ) {

        showGuestGate();

        return;
      }

      /*
       * Verified user limit reached
       */

      if (
        data.limit_reached &&
        state.verified
      ) {

        showDiagnosis(
          data.diagnosis
        );

        return;
      }

      setComposerEnabled(true);

      input.focus();

    } catch (error) {

      hideTyping();

      /*
       * Guest access exhausted.
       */

      if (
        error.code ===
        "GUEST_LIMIT_REACHED"
      ) {

        addMessage(
          "ai",
          "मैं आपकी requirement समझ रहा हूँ। आगे बढ़ने के लिए अपना email verify कर दें। इससे मैं आपकी business requirement को save करके personalized recommendation दे सकूँगा।"
        );

        showGuestGate();

        return;
      }

      /*
       * 2-hour lock.
       */

      if (
        error.code ===
        "ACCESS_LOCKED"
      ) {

        showLock(
          error.locked_until
        );

        return;
      }

      /*
       * Generic server error.
       */

      addMessage(
        "ai",
        "अभी GLIME AI से connection में समस्या आ रही है। कृपया थोड़ी देर बाद फिर कोशिश करें।"
      );

      console.error(
        "GLIME AI error:",
        error
      );

      setComposerEnabled(true);
      input.focus();
    } finally {

      state.busy = false;
    }
  }

  /*
   * ==========================================================
   * EMAIL OTP
   * ==========================================================
   */

  async function sendOTP(email) {

    if (!supabaseClient) {
      throw new Error(
        "Supabase is not initialized."
      );
    }

    const {
      error
    } =
      await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true
        }
      });

    if (error) {
      throw error;
    }
  }

  /*
   * ==========================================================
   * EMAIL FORM
   * ==========================================================
   */

  $("email-form").addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      const email =
        $("email-input")
          .value
          .trim()
          .toLowerCase();

      const errorBox =
        $("email-error");

      errorBox.textContent = "";

      if (
        !email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
          .test(email)
      ) {

        errorBox.textContent =
          "Please enter a valid email address.";

        return;
      }

      const button =
        $("email-form")
          .querySelector("button");

      button.disabled = true;

      try {

        await sendOTP(email);

        state.email =
          email;

        $("email-form").hidden =
          true;

        $("otp-form").hidden =
          false;

        $("otp-input").focus();

      } catch (error) {

        errorBox.textContent =
          error?.message ||
          "Unable to send OTP. Please try again.";

      } finally {

        button.disabled = false;
      }
    }
  );

  /*
   * ==========================================================
   * VERIFY OTP
   * ==========================================================
   */

  $("otp-form").addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      const otp =
        $("otp-input")
          .value
          .trim();

      const errorBox =
        $("otp-error");

      errorBox.textContent = "";

      if (!/^\d{6}$/.test(otp)) {

        errorBox.textContent =
          "Please enter the 6-digit OTP.";

        return;
      }

      const button =
        $("otp-form")
          .querySelector("button");

      button.disabled = true;

      try {

        const {
          data,
          error
        } =
          await supabaseClient.auth.verifyOtp({
            email: state.email,
            token: otp,
            type: "email"
          });

        if (error) {
          throw error;
        }

        if (!data?.session) {

          throw new Error(
            "Email verification did not create a session."
          );
        }

        state.verified =
          true;

        /*
         * IMPORTANT:
         * Do NOT reset questions locally.
         *
         * The Edge Function/database is authoritative.
         */

        accessCard.hidden =
          true;

        lockCard.hidden =
          true;

        composerArea.hidden =
          false;

        setComposerEnabled(true);

        updateCounter();

        addMessage(
          "ai",
          "Email verified. अब हम आपकी business requirement को आगे समझ सकते हैं।"
        );

        input.focus();

      } catch (error) {

        errorBox.textContent =
          error?.message ||
          "Invalid or expired OTP.";

      } finally {

        button.disabled = false;
      }
    }
  );

  /*
   * ==========================================================
   * CHAT FORM
   * ==========================================================
   */

  form.addEventListener(
    "submit",
    (event) => {

      event.preventDefault();

      sendMessage(
        input.value
      );
    }
  );

  input.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        form.requestSubmit();
      }
    }
  );

  /*
   * ==========================================================
   * START OVER
   * ==========================================================
   */

  $("restart-chat").addEventListener(
    "click",
    () => {

      /*
       * Start over only clears the
       * local conversation UI.
       *
       * It does NOT erase the server-side
       * usage counter.
       */

      state.messages = [];

      state.diagnosis = null;

      chatWindow.innerHTML = "";

      accessCard.hidden = true;
      lockCard.hidden = true;
      diagnosisCard.hidden = true;

      composerArea.hidden = false;

      setComposerEnabled(true);

      updateCounter();

      addMessage(
        "ai",
        "नमस्ते! मैं GLIME AI हूँ — आपका AI Business Consultant। पहले मुझे अपने business और उस problem के बारे में बताइए जिसे आप solve करना चाहते हैं।"
      );

      input.focus();
    }
  );

  /*
   * ==========================================================
   * INITIALIZE
   * ==========================================================
   */

  async function initialize() {

    state.sessionId =
      getOrCreateSessionId();

    updateCounter();

    addMessage(
      "ai",
      "नमस्ते! मैं GLIME AI हूँ — आपका AI Business Consultant। पहले मुझे अपने business और उस problem के बारे में बताइए जिसे आप solve करना चाहते हैं।"
    );

    try {

      await initSupabase();

    } catch (error) {

      console.error(
        "GLIME AI initialization error:",
        error
      );

      setComposerEnabled(false);

      addMessage(
        "ai",
        "GLIME AI अभी configure हो रहा है। कृपया थोड़ी देर बाद फिर कोशिश करें।"
      );
    }
  }

  initialize();

})();
