(() => {
  "use strict";

  /*
   * ==========================================================
   * GLIME AI — PRODUCTION FRONTEND
   * ==========================================================
   *
   * Browser
   *    ↓
   * Supabase Auth
   *    ↓
   * GLIME AI Edge Function
   *    ↓
   * Session / Usage validation
   *    ↓
   * GLIME AI logic
   *    ↓
   * Gemini
   *
   * IMPORTANT:
   * Gemini API key is NEVER stored in this file.
   */

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  /*
   * Supabase Publishable Key
   *
   * This is safe for frontend use.
   * NEVER put Service Role Key here.
   */
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const EDGE_FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/glime-ai`;

  const GUEST_LIMIT = 5;
  const VERIFIED_LIMIT = 15;

  /*
   * IMPORTANT:
   * This stores the SERVER-GENERATED session token.
   */
  const SESSION_STORAGE_KEY =
    "glime_ai_session_token";

  const state = {
    sessionToken: null,
    verified: false,
    questionsUsed: 0,
    lockedUntil: null,
    messages: [],
    diagnosis: null,
    busy: false,
    email: ""
  };

  const $ = (id) =>
    document.getElementById(id);

  const chatWindow =
    $("chat-window");

  const input =
    $("chat-input");

  const form =
    $("chat-form");

  const counter =
    $("question-counter");

  const usageText =
    $("usage-text");

  const accessCard =
    $("access-card");

  const lockCard =
    $("lock-card");

  const diagnosisCard =
    $("diagnosis-card");

  const composerArea =
    $("composer-area");

  const sendButton =
    $("send-button");


  /*
   * ==========================================================
   * SUPABASE
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

      const script =
        document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

      script.onload =
        resolve;

      script.onerror = () => {
        reject(
          new Error(
            "Supabase library could not be loaded."
          )
        );
      };

      document.head.appendChild(script);
    });
  }


  async function initSupabase() {

    await loadSupabase();

    if (
      !SUPABASE_PUBLISHABLE_KEY ||
      SUPABASE_PUBLISHABLE_KEY.includes(
        "PASTE_YOUR"
      )
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
   * SESSION TOKEN
   * ==========================================================
   */

  function getStoredSessionToken() {

    try {

      return localStorage.getItem(
        SESSION_STORAGE_KEY
      );

    } catch {

      return null;
    }
  }


  function saveSessionToken(token) {

    if (!token) {
      return;
    }

    state.sessionToken =
      token;

    try {

      localStorage.setItem(
        SESSION_STORAGE_KEY,
        token
      );

    } catch {
      /*
       * If localStorage is unavailable,
       * session still works for current page.
       */
    }
  }


  function createTemporarySessionToken() {

    /*
     * Server will replace/accept this token
     * according to its session handling.
     *
     * UUID is preferred.
     */
    try {

      if (
        window.crypto &&
        typeof window.crypto.randomUUID ===
          "function"
      ) {
        return window.crypto.randomUUID();
      }

    } catch {
      // fallback below
    }

    return (
      `${Date.now()}-` +
      `${Math.random()
        .toString(36)
        .slice(2)}` +
      `${Math.random()
        .toString(36)
        .slice(2)}`
    );
  }


  function getOrCreateSessionToken() {

    const existing =
      getStoredSessionToken();

    if (existing) {

      state.sessionToken =
        existing;

      return existing;
    }

    const token =
      createTemporarySessionToken();

    saveSessionToken(token);

    return token;
  }


  /*
   * ==========================================================
   * UI HELPERS
   * ==========================================================
   */

  function addMessage(
    role,
    text,
    saveToState = true
  ) {

    if (!text) {
      return;
    }

    const row =
      document.createElement("div");

    row.className =
      `message ${role}`;

    const bubble =
      document.createElement("div");

    bubble.className =
      "message-bubble";

    bubble.textContent =
      text;

    row.appendChild(bubble);

    chatWindow.appendChild(row);

    chatWindow.scrollTop =
      chatWindow.scrollHeight;

    if (saveToState) {

      state.messages.push({
        role,
        text
      });
    }
  }


  function showTyping() {

    hideTyping();

    const row =
      document.createElement("div");

    row.className =
      "message ai";

    row.id =
      "typing-indicator";

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

    if (counter) {

      counter.textContent =
        `${state.questionsUsed} / ${limit}`;
    }

    if (usageText) {

      usageText.textContent =
        state.verified
          ? `${remaining} QUESTIONS REMAINING`
          : `${remaining} FREE QUESTIONS`;
    }
  }


  function hideAccessCard() {

    if (accessCard) {
      accessCard.hidden = true;
    }
  }


  function showGuestGate() {

    if (accessCard) {
      accessCard.hidden = false;
    }

    if (composerArea) {
      composerArea.hidden = true;
    }

    if (accessCard) {

      accessCard.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }


  function hideLockCard() {

    if (lockCard) {
      lockCard.hidden = true;
    }
  }


  function showLock(lockedUntil) {

    state.lockedUntil =
      lockedUntil || null;

    if (lockCard) {
      lockCard.hidden = false;
    }

    if (composerArea) {
      composerArea.hidden = true;
    }

    const lockTime =
      $("lock-time");

    if (lockTime) {

      if (lockedUntil) {

        const date =
          new Date(lockedUntil);

        lockTime.textContent =
          `Available again: ${date.toLocaleString()}`;

      } else {

        lockTime.textContent =
          "Please try again later.";
      }
    }

    if (lockCard) {

      lockCard.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }


  function showDiagnosis(data) {

    if (!diagnosisCard) {
      return;
    }

    diagnosisCard.hidden =
      false;

    const summary =
      data?.summary ||
      "GLIME AI has understood your business context and prepared a practical system direction.";

    const summaryElement =
      $("diagnosis-summary");

    if (summaryElement) {

      summaryElement.textContent =
        summary;
    }

    const titleElement =
      $("diagnosis-title");

    if (
      titleElement &&
      data?.title
    ) {

      titleElement.textContent =
        data.title;
    }

    diagnosisCard.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }


  function setComposerEnabled(enabled) {

    if (input) {
      input.disabled =
        !enabled;
    }

    if (sendButton) {
      sendButton.disabled =
        !enabled;
    }
  }


  /*
   * ==========================================================
   * SERVER STATE
   * ==========================================================
   */

  function applyServerState(data) {

    if (!data) {
      return;
    }

    /*
     * Support both snake_case and camelCase.
     */

    const questionsUsed =
      data.questions_used ??
      data.questionsUsed;

    if (
      Number.isInteger(
        questionsUsed
      )
    ) {

      state.questionsUsed =
        questionsUsed;
    }


    const verified =
      data.verified;

    if (
      typeof verified ===
      "boolean"
    ) {

      state.verified =
        verified;
    }


    const lockedUntil =
      data.locked_until ??
      data.lockedUntil ??
      null;

    state.lockedUntil =
      lockedUntil;


    if (data.sessionToken) {

      saveSessionToken(
        data.sessionToken
      );
    }


    if (data.session_token) {

      saveSessionToken(
        data.session_token
      );
    }


    if (data.diagnosis) {

      state.diagnosis =
        data.diagnosis;
    }


    updateCounter();
  }


  /*
   * ==========================================================
   * EDGE FUNCTION
   * ==========================================================
   */

  async function callEdge(
    action,
    payload = {}
  ) {

    if (!supabaseClient) {

      throw new Error(
        "Supabase is not initialized."
      );
    }


    /*
     * Always get the latest Supabase
     * authentication session.
     */
    const authResult =
      await supabaseClient.auth.getSession();

    const accessToken =
      authResult?.data?.session
        ?.access_token || null;


    /*
     * Server session token.
     */
    const sessionToken =
      state.sessionToken ||
      getOrCreateSessionToken();


    const body = {

      action,

      sessionToken,

      ...payload
    };


    const headers = {

      "Content-Type":
        "application/json"
      ,
"apikey":
  SUPABASE_PUBLISHABLE_KEY
    };


    /*
     * Only send Authorization when
     * the visitor has a verified Supabase session.
     */
    if (accessToken) {

      headers.Authorization =
        `Bearer ${accessToken}`;
    }


    const response =
      await fetch(
        EDGE_FUNCTION_URL,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body)
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
        data?.locked_until ??
        data?.lockedUntil;

      error.questions_used =
        data?.questions_used ??
        data?.questionsUsed;

      error.requires_email =
        data?.requires_email ??
        data?.requiresEmail;

      throw error;
    }


    /*
     * Server may issue a new token.
     */
    if (data?.sessionToken) {

      saveSessionToken(
        data.sessionToken
      );
    }

    if (data?.session_token) {

      saveSessionToken(
        data.session_token
      );
    }


    applyServerState(data);

    return data;
  }


  /*
   * ==========================================================
   * INITIAL SERVER STATUS
   * ==========================================================
   */

  async function loadInitialStatus() {

    try {

      const data =
        await callEdge(
          "status"
        );

      applyServerState(data);


      /*
       * If server says currently locked,
       * show lock immediately.
       */
      if (data?.locked) {

        showLock(
          data.locked_until ??
          data.lockedUntil
        );

        return;
      }


      /*
       * If already verified,
       * make sure guest gate is hidden.
       */
      if (state.verified) {

        hideAccessCard();

        if (composerArea) {
          composerArea.hidden = false;
        }

        setComposerEnabled(true);

      } else {

        if (composerArea) {
          composerArea.hidden = false;
        }

        setComposerEnabled(true);
      }

    } catch (error) {

      console.error(
        "GLIME AI status error:",
        error
      );

      /*
       * Don't block the page if status
       * temporarily fails.
       */
      if (composerArea) {
        composerArea.hidden = false;
      }

      setComposerEnabled(true);
    }
  }


  /*
   * ==========================================================
   * SEND MESSAGE
   * ==========================================================
   */

  async function sendMessage(text) {

    const trimmed =
      String(text || "")
        .trim();


    if (!trimmed) {
      return;
    }


    if (state.busy) {
      return;
    }


    /*
     * If currently locked,
     * don't send anything.
     */
    if (
      state.lockedUntil &&
      new Date(state.lockedUntil)
        .getTime() > Date.now()
    ) {

      showLock(
        state.lockedUntil
      );

      return;
    }


    /*
     * If guest limit is already reached,
     * don't call Gemini again.
     */
    if (
      !state.verified &&
      state.questionsUsed >=
        GUEST_LIMIT
    ) {

      showGuestGate();

      return;
    }


    /*
     * If verified limit is reached,
     * don't call Gemini again.
     */
    if (
      state.verified &&
      state.questionsUsed >=
        VERIFIED_LIMIT
    ) {

      showLock(
        state.lockedUntil
      );

      return;
    }


    state.busy =
      true;

    setComposerEnabled(
      false
    );


    /*
     * Add user's message locally.
     */
    addMessage(
      "user",
      trimmed
    );


    if (input) {
      input.value = "";
    }


    showTyping();


    try {

      const data =
        await callEdge(
          "chat",
          {
            message:
              trimmed,

            messages:
              state.messages,

            client_context: {
              page:
                "glime-ai",

              source:
                "glime-ai.html"
            }
          }
        );


      hideTyping();


      /*
       * ======================================================
       * LOCK
       * ======================================================
       */

      if (data?.locked) {

        showLock(
          data.locked_until ??
          data.lockedUntil
        );

        return;
      }


      /*
       * ======================================================
       * AI REPLY
       * ======================================================
       */

      if (data?.reply) {

        addMessage(
          "ai",
          data.reply
        );
      }


      /*
       * ======================================================
       * DIAGNOSIS
       * ======================================================
       */

      if (data?.diagnosis) {

        state.diagnosis =
          data.diagnosis;

        showDiagnosis(
          data.diagnosis
        );
      }


      /*
       * ======================================================
       * GUEST EMAIL GATE
       * ======================================================
       */

      if (
        data?.requires_email ||
        data?.requiresEmail
      ) {

        showGuestGate();

        return;
      }


      /*
       * ======================================================
       * VERIFIED LIMIT
       * ======================================================
       */

      if (
        data?.limit_reached ||
        data?.limitReached
      ) {

        if (
          data?.diagnosis
        ) {

          showDiagnosis(
            data.diagnosis
          );
        }

        if (
          data?.locked
        ) {

          showLock(
            data.locked_until ??
            data.lockedUntil
          );

          return;
        }
      }


      /*
       * ======================================================
       * NORMAL CONTINUATION
       * ======================================================
       */

      setComposerEnabled(
        true
      );

      if (input) {
        input.focus();
      }

    } catch (error) {

      hideTyping();


      /*
       * Guest limit reached
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
       * Access locked
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
       * Verified limit
       */
      if (
        error.code ===
        "VERIFIED_LIMIT_REACHED"
      ) {

        showLock(
          error.locked_until
        );

        return;
      }


      /*
       * Generic error
       */
      console.error(
        "GLIME AI error:",
        error
      );


      addMessage(
        "ai",
        "अभी GLIME AI से connection में समस्या आ रही है। कृपया थोड़ी देर बाद फिर कोशिश करें।"
      );


      setComposerEnabled(
        true
      );

      if (input) {
        input.focus();
      }

    } finally {

      state.busy =
        false;
    }
  }


  /*
   * ==========================================================
   * CHAT FORM
   * ==========================================================
   */

  if (form) {

    form.addEventListener(
      "submit",
      async (event) => {

        event.preventDefault();

        await sendMessage(
          input?.value || ""
        );
      }
    );
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


    const result =
      await supabaseClient.auth
        .signInWithOtp({

          email,

          options: {
            shouldCreateUser: true
          }
        });


    if (result.error) {
      throw result.error;
    }
  }


  /*
   * ==========================================================
   * EMAIL FORM
   * ==========================================================
   */

  const emailForm =
    $("email-form");


  if (emailForm) {

    emailForm.addEventListener(
      "submit",
      async (event) => {

        event.preventDefault();


        const email =
          $("email-input")
            ?.value
            ?.trim()
            ?.toLowerCase() || "";


        const errorBox =
          $("email-error");


        if (errorBox) {
          errorBox.textContent =
            "";
        }


        if (
          !email ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
            .test(email)
        ) {

          if (errorBox) {

            errorBox.textContent =
              "Please enter a valid email address.";
          }

          return;
        }


        const button =
          emailForm.querySelector(
            "button"
          );


        if (button) {
          button.disabled =
            true;
        }


        try {

          await sendOTP(
            email
          );


          state.email =
            email;


          emailForm.hidden =
            true;


          const otpForm =
            $("otp-form");


          if (otpForm) {

            otpForm.hidden =
              false;
          }


          $("otp-input")
            ?.focus();


        } catch (error) {

          console.error(
            "OTP send error:",
            error
          );


          if (errorBox) {

            errorBox.textContent =
              error?.message ||
              "Unable to send OTP. Please try again.";
          }

        } finally {

          if (button) {
            button.disabled =
              false;
          }
        }
      }
    );
  }


  /*
   * ==========================================================
   * VERIFY OTP
   * ==========================================================
   */

  const otpForm =
    $("otp-form");


  if (otpForm) {

    otpForm.addEventListener(
      "submit",
      async (event) => {

        event.preventDefault();


        const otp =
          $("otp-input")
            ?.value
            ?.trim() || "";


        const errorBox =
          $("otp-error");


        if (errorBox) {
          errorBox.textContent =
            "";
        }


        if (!/^\d{6}$/.test(otp)) {

          if (errorBox) {

            errorBox.textContent =
              "Please enter the 6-digit OTP.";
          }

          return;
        }


        const button =
          otpForm.querySelector(
            "button"
          );


        if (button) {
          button.disabled =
            true;
        }


        try {

          /*
           * Verify email OTP with Supabase.
           */
          const result =
            await supabaseClient.auth
              .verifyOtp({

                email:
                  state.email,

                token:
                  otp,

                type:
                  "email"
              });


          if (result.error) {
            throw result.error;
          }


          /*
           * Supabase should now have
           * an authenticated user session.
           */
          if (!result.data?.session) {

            throw new Error(
              "Email verification succeeded but no authenticated session was created."
            );
          }


          /*
           * Tell GLIME AI server that this
           * existing anonymous session is now
           * verified.
           */
          const bindData =
            await callEdge(
              "bind"
            );


          applyServerState(
            bindData
          );


          /*
           * Hide access gate.
           */
          emailForm.hidden =
            true;


          otpForm.hidden =
            true;


          hideAccessCard();


          /*
           * Remove lock UI if any.
           */
          hideLockCard();


          /*
           * Restore composer.
           */
          if (composerArea) {
            composerArea.hidden =
              false;
          }


          /*
           * IMPORTANT:
           * Existing question count is NOT reset.
           *
           * Example:
           * 5 guest questions used
           * → verify email
           * → server continues from existing
           * session and applies verified access.
           */
          updateCounter();


          setComposerEnabled(
            true
          );


          if (input) {
            input.focus();
          }


          /*
           * Optional confirmation inside chat.
           */
          addMessage(
            "ai",
            "Email verify हो गया है। अब हम आपकी business requirement को और detail में समझ सकते हैं।"
          );


        } catch (error) {

          console.error(
            "OTP verification error:",
            error
          );


          if (errorBox) {

            errorBox.textContent =
              error?.message ||
              "Invalid or expired OTP. Please try again.";
          }

        } finally {

          if (button) {
            button.disabled =
              false;
          }
        }
      }
    );
  }


  /*
   * ==========================================================
   * RESTART CHAT
   * ==========================================================
   *
   * IMPORTANT:
   * This does NOT reset the server usage count.
   *
   * It only clears the visual chat.
   */
  const restartButton =
    $("restart-chat");


  if (restartButton) {

    restartButton.addEventListener(
      "click",
      () => {

        if (state.busy) {
          return;
        }


        state.messages =
          [];

        state.diagnosis =
          null;


        if (chatWindow) {

          chatWindow.innerHTML =
            "";
        }


        /*
         * Keep server session and usage.
         * This prevents bypassing the limit
         * by clicking Start Over.
         */

        updateCounter();


        if (
          !state.lockedUntil &&
          (
            state.verified ||
            state.questionsUsed <
              GUEST_LIMIT
          )
        ) {

          if (composerArea) {
            composerArea.hidden =
              false;
          }

          setComposerEnabled(
            true
          );

          input?.focus();
        }
      }
    );
  }


  /*
   * ==========================================================
   * INIT
   * ==========================================================
   */

  async function init() {

    try {

      /*
       * Prepare local reference.
       */
      getOrCreateSessionToken();


      /*
       * Load Supabase.
       */
      await initSupabase();


      /*
       * Ask server for current state.
       */
      await loadInitialStatus();


    } catch (error) {

      console.error(
        "GLIME AI initialization error:",
        error
      );


      if (composerArea) {
        composerArea.hidden =
          false;
      }


      setComposerEnabled(
        true
      );


      /*
       * Don't expose technical
       * details to visitor.
       */
      addMessage(
        "ai",
        "GLIME AI अभी initialize नहीं हो पाया। कृपया page को refresh करके फिर कोशिश करें।"
      );
    }
  }


  /*
   * Start only after DOM exists.
   */
  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();
  }

})();
