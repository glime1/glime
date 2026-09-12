(() => {
  "use strict";

  const state = {
    questionsUsed: 0,
    verified: false,
    messages: [],
    guestLimit: 5,
    verifiedLimit: 15
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

  function addMessage(role, text) {
    const row = document.createElement("div");
    row.className = `message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = text;

    row.appendChild(bubble);
    chatWindow.appendChild(row);

    chatWindow.scrollTop = chatWindow.scrollHeight;

    state.messages.push({
      role,
      text
    });
  }

  function showTyping() {
    const row = document.createElement("div");

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
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function hideTyping() {
    const typing = $("typing-indicator");

    if (typing) {
      typing.remove();
    }
  }

  function updateCounter() {
    const limit = state.verified
      ? state.verifiedLimit
      : state.guestLimit;

    const remaining = Math.max(
      0,
      limit - state.questionsUsed
    );

    counter.textContent =
      `${state.questionsUsed} / ${limit}`;

    usageText.textContent = state.verified
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

  function showDiagnosis(summary) {
    diagnosisCard.hidden = false;

    $("diagnosis-summary").textContent =
      summary ||
      "GLIME AI has understood your business context. Your requirement can now be turned into a practical system plan.";

    diagnosisCard.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function resetChat() {
    state.questionsUsed = 0;
    state.verified = false;
    state.messages = [];

    chatWindow.innerHTML = "";

    accessCard.hidden = true;
    lockCard.hidden = true;
    diagnosisCard.hidden = true;

    composerArea.hidden = false;

    input.disabled = false;
    $("send-button").disabled = false;

    input.value = "";

    $("email-form").hidden = false;
    $("otp-form").hidden = true;

    $("email-error").textContent = "";
    $("otp-error").textContent = "";

    updateCounter();

    addMessage(
      "ai",
      "नमस्ते! मैं GLIME AI हूँ — आपका AI Business Consultant। पहले मुझे अपने business और उस problem के बारे में बताइए जिसे आप solve करना चाहते हैं।"
    );
  }

  async function sendMessage(text) {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    const limit = state.verified
      ? state.verifiedLimit
      : state.guestLimit;

    /*
     * Frontend limit is only for UI.
     * Production security must also enforce this
     * on the Supabase Edge Function.
     */

    if (state.questionsUsed >= limit) {
      if (!state.verified) {
        showGuestGate();
      }

      return;
    }

    addMessage("user", trimmed);

    input.value = "";

    /*
     * Only visitor messages count as questions.
     * AI replies do not count.
     */
    state.questionsUsed += 1;

    updateCounter();

    input.disabled = true;
    $("send-button").disabled = true;

    showTyping();

    /*
     * ==========================================================
     * PRODUCTION BACKEND CONNECTION
     * ==========================================================
     *
     * यहाँ बाद में Supabase Edge Function connect होगी.
     *
     * Frontend से Gemini API को direct call नहीं करना है.
     *
     * Expected flow:
     *
     * Browser
     *    ↓
     * Supabase Edge Function
     *    ↓
     * Guest/session validation
     *    ↓
     * Knowledge Base retrieval
     *    ↓
     * GLIME diagnosis logic
     *    ↓
     * Gemini API
     *    ↓
     * Response
     *    ↓
     * Browser
     *
     * Gemini API key कभी भी इस file में नहीं आएगी.
     */

    await new Promise((resolve) => {
      setTimeout(resolve, 550);
    });

    hideTyping();

    /*
     * ==========================================================
     * GUEST PASS
     * ==========================================================
     */

    if (
      !state.verified &&
      state.questionsUsed >= state.guestLimit
    ) {
      addMessage(
        "ai",
        "मैं आपकी requirement समझ रहा हूँ। आगे बढ़ने के लिए अपना email verify कर दें। इससे मैं आपकी business requirement को save करके personalized recommendation दे सकूँगा।"
      );

      input.disabled = true;
      $("send-button").disabled = true;

      showGuestGate();

      return;
    }

    /*
     * ==========================================================
     * VERIFIED USER LIMIT
     * ==========================================================
     */

    if (
      state.verified &&
      state.questionsUsed >= state.verifiedLimit
    ) {
      addMessage(
        "ai",
        "आपकी 15 सवालों की access limit पूरी हो गई है। अब आपकी collected business context को diagnosis और system recommendation में बदला जा सकता है।"
      );

      showDiagnosis();

      input.disabled = true;
      $("send-button").disabled = true;

      return;
    }

    /*
     * Temporary response until the real AI backend
     * is connected.
     */

    addMessage(
      "ai",
      "समझ गया। अब मैं आपकी बात को business context के साथ देख रहा हूँ। अगला सवाल आपकी requirement के उस हिस्से को समझने के लिए होगा जो अभी missing है।"
    );

    input.disabled = false;
    $("send-button").disabled = false;

    input.focus();
  }

  /*
   * ==========================================================
   * CHAT FORM
   * ==========================================================
   */

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    sendMessage(input.value);
  });

  /*
   * Enter = Send
   * Shift + Enter = New Line
   */

  input.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      form.requestSubmit();
    }
  });

  /*
   * ==========================================================
   * START OVER
   * ==========================================================
   */

  $("restart-chat").addEventListener(
    "click",
    resetChat
  );

  /*
   * ==========================================================
   * EMAIL
   * ==========================================================
   */

  $("email-form").addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const email =
        $("email-input").value.trim();

      const error =
        $("email-error");

      if (
        !email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        error.textContent =
          "Please enter a valid email address.";

        return;
      }

      error.textContent = "";

      /*
       * Production:
       *
       * Supabase Auth OTP / Edge Function
       * email OTP request यहाँ आएगा.
       */

      $("email-form").hidden = true;
      $("otp-form").hidden = false;

      $("otp-input").focus();
    }
  );

  /*
   * ==========================================================
   * OTP VERIFICATION
   * ==========================================================
   */

  $("otp-form").addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const otp =
        $("otp-input").value.trim();

      const error =
        $("otp-error");

      if (!/^\d{6}$/.test(otp)) {
        error.textContent =
          "Please enter the 6-digit OTP.";

        return;
      }

      error.textContent = "";

      /*
       * IMPORTANT:
       *
       * यह temporary frontend verification है.
       *
       * Production में यहाँ वास्तविक Supabase
       * OTP verification होगी.
       *
       * Successful verification के बाद backend
       * verified session बनाएगा.
       */

      state.verified = true;
      state.questionsUsed = 0;

      accessCard.hidden = true;
      composerArea.hidden = false;

      input.disabled = false;
      $("send-button").disabled = false;

      updateCounter();

      addMessage(
        "ai",
        "Email verified. अब आपके पास 15 questions हैं। अब हम आपकी business requirement को और गहराई से समझ सकते हैं।"
      );

      input.focus();
    }
  );

  /*
   * ==========================================================
   * INITIALIZE
   * ==========================================================
   */

  resetChat();

})();
