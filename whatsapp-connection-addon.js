/* ============================================================
   GLIME - WhatsApp Connection Addon
   File: whatsapp-connection-addon.js

   Purpose:
   - WhatsApp Embedded Signup
   - Meta Facebook Login for Business
   - Secure backend completion through GLIME Edge Function
   - No changes to follow-up.js
   ============================================================ */

(function () {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_FUNCTION =
    SUPABASE_URL + "/functions/v1/whatsapp-connection";

  const FACEBOOK_SDK_URL =
    "https://connect.facebook.net/en_US/sdk.js";

  const CHANNEL_CONTAINER_ID = "channels";

  let signupConfig = null;
  let fbSdkPromise = null;
  let embeddedSignupData = {
    waba_id: null,
    phone_number_id: null
  };

  let isLaunching = false;

  /* ============================================================
     Utilities
     ============================================================ */

  function log(...args) {
    console.log("[GLIME WhatsApp]", ...args);
  }

  function warn(...args) {
    console.warn("[GLIME WhatsApp]", ...args);
  }

  function getSupabaseClient() {
    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    if (window.supabase) {
      if (typeof window.supabase.auth !== "undefined") {
        return window.supabase;
      }
    }

    return null;
  }

  async function getAccessToken() {
    const client = getSupabaseClient();

    if (!client || !client.auth) {
      throw new Error("Supabase authentication is not available.");
    }

    const result = await client.auth.getSession();

    if (result.error) {
      throw result.error;
    }

    const session = result.data && result.data.session;

    if (!session || !session.access_token) {
      throw new Error("Please sign in again.");
    }

    return session.access_token;
  }

  async function callBackend(payload) {
    const token = await getAccessToken();

    const response = await fetch(SUPABASE_FUNCTION, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(payload)
    });

    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const message =
        data && data.error
          ? data.error
          : "WhatsApp connection request failed.";

      throw new Error(message);
    }

    return data;
  }

  function showMessage(message, type) {
    if (typeof window.showToast === "function") {
      window.showToast(message, type || "info");
      return;
    }

    if (type === "error") {
      console.error("[GLIME WhatsApp]", message);
    } else {
      console.log("[GLIME WhatsApp]", message);
    }
  }

  /* ============================================================
     WhatsApp Button
     ============================================================ */

  function findWhatsAppButton() {
    const container = document.getElementById(CHANNEL_CONTAINER_ID);

    if (!container) {
      return null;
    }

    const buttons = Array.from(
      container.querySelectorAll("button")
    );

    return (
      buttons.find(function (button) {
        return (
          button.textContent &&
          button.textContent.toLowerCase().includes("whatsapp")
        );
      }) || null
    );
  }

  function updateWhatsAppButton(button, state) {
    if (!button) {
      return;
    }

    button.disabled = false;

    button.removeAttribute("data-addon-loading");

    if (state === "connected") {
      button.textContent = "WhatsApp Connected";
      button.classList.add("connected");
      button.classList.remove("ghost");

      button.dataset.addonAction = "whatsapp-status";

      return;
    }

    if (state === "connecting") {
      button.textContent = "Connecting...";
      button.disabled = true;

      return;
    }

    button.textContent = "Connect WhatsApp";
    button.classList.remove("connected");

    button.dataset.addonAction = "whatsapp-connect";
  }

  /* ============================================================
     Facebook SDK
     ============================================================ */

  function loadFacebookSDK() {
    if (window.FB) {
      return Promise.resolve(window.FB);
    }

    if (fbSdkPromise) {
      return fbSdkPromise;
    }

    fbSdkPromise = new Promise(function (resolve, reject) {
      const existingScript = document.querySelector(
        'script[src="' + FACEBOOK_SDK_URL + '"]'
      );

      window.fbAsyncInit = function () {
        if (!window.FB) {
          reject(
            new Error("Facebook SDK failed to initialize.")
          );
          return;
        }

        resolve(window.FB);
      };

      if (existingScript) {
        return;
      }

      const script = document.createElement("script");

      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = FACEBOOK_SDK_URL;

      script.onerror = function () {
        reject(
          new Error("Unable to load Facebook SDK.")
        );
      };

      document.head.appendChild(script);
    });

    return fbSdkPromise;
  }

  async function initializeFacebookSDK(config) {
    const FB = await loadFacebookSDK();

    if (!config || !config.app_id) {
      throw new Error("WhatsApp App ID is missing.");
    }

    FB.init({
      appId: config.app_id,
      cookie: true,
      xfbml: false,
      version: config.graph_version || "v26.0"
    });

    log("Facebook SDK initialized.");

    return FB;
  }

  /* ============================================================
     Embedded Signup Message Listener
     ============================================================ */

  function handleEmbeddedSignupMessage(event) {
    if (!event || !event.origin) {
      return;
    }

    const allowedOrigins = [
      "https://www.facebook.com",
      "https://facebook.com",
      "https://business.facebook.com"
    ];

    if (
      allowedOrigins.indexOf(event.origin) === -1
    ) {
      return;
    }

    let data = event.data;

    if (!data) {
      return;
    }

    /*
     * Meta may send either an object or a JSON string.
     */
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (error) {
        return;
      }
    }

    if (!data) {
      return;
    }

    /*
     * Embedded Signup events are generally delivered
     * through the WA_EMBEDDED_SIGNUP event.
     */
    if (
      data.type === "WA_EMBEDDED_SIGNUP"
    ) {
      const eventData =
        data.data || data;

      log(
        "Embedded Signup event received.",
        eventData
      );

      if (eventData.waba_id) {
        embeddedSignupData.waba_id =
          eventData.waba_id;
      }

      if (eventData.phone_number_id) {
        embeddedSignupData.phone_number_id =
          eventData.phone_number_id;
      }

      return;
    }

    /*
     * Some Meta flows provide event details
     * inside a nested event object.
     */
    if (
      data.event === "WA_EMBEDDED_SIGNUP"
    ) {
      const eventData =
        data.data || data;

      if (eventData.waba_id) {
        embeddedSignupData.waba_id =
          eventData.waba_id;
      }

      if (eventData.phone_number_id) {
        embeddedSignupData.phone_number_id =
          eventData.phone_number_id;
      }
    }
  }

  /* ============================================================
     Start Signup
     ============================================================ */

  async function startSignup() {
    if (isLaunching) {
      return;
    }

    isLaunching = true;

    const button = findWhatsAppButton();

    updateWhatsAppButton(
      button,
      "connecting"
    );

    try {
      embeddedSignupData = {
        waba_id: null,
        phone_number_id: null
      };

      showMessage(
        "Preparing WhatsApp connection...",
        "info"
      );

      /*
       * Step 1:
       * Ask GLIME backend for a secure signup state.
       */
      const startResult = await callBackend({
        action: "start"
      });

      if (
        !startResult ||
        !startResult.app_id ||
        !startResult.config_id ||
        !startResult.state
      ) {
        throw new Error(
          "WhatsApp signup configuration is incomplete."
        );
      }

      signupConfig = startResult;

      log(
        "WhatsApp signup initialized.",
        signupConfig
      );

      /*
       * Step 2:
       * Initialize Meta SDK.
       */
      const FB =
        await initializeFacebookSDK(
          signupConfig
        );

      /*
       * Step 3:
       * Launch Meta Embedded Signup.
       */
      await new Promise(
        function (resolve, reject) {
          let settled = false;

          function finishSuccess() {
            if (settled) {
              return;
            }

            settled = true;
            resolve();
          }

          function finishError(error) {
            if (settled) {
              return;
            }

            settled = true;
            reject(error);
          }

          try {
            FB.login(
              function (response) {
                log(
                  "Facebook login response:",
                  response
                );

                if (!response) {
                  finishError(
                    new Error(
                      "No response received from Meta."
                    )
                  );
                  return;
                }

                if (
                  response.authResponse &&
                  response.authResponse.code
                ) {
                  signupConfig.auth_code =
                    response.authResponse.code;

                  finishSuccess();
                  return;
                }

                if (
                  response.status === "unknown"
                ) {
                  finishError(
                    new Error(
                      "WhatsApp signup was cancelled or not completed."
                    )
                  );
                  return;
                }

                finishError(
                  new Error(
                    "Meta did not return an authorization code."
                  )
                );
              },
              {
                config_id:
                  signupConfig.config_id,

                response_type: "code",

                override_default_response_type:
                  true,

                state:
                  signupConfig.state,

                extras: {
                  setup: {}
                }
              }
            );
          } catch (error) {
            finishError(error);
          }
        }
      );

      /*
       * Give the Meta postMessage event a short time
       * to populate WABA and phone information.
       */
      await wait(1200);

      /*
       * Step 4:
       * Complete signup securely on backend.
       */
      showMessage(
        "Finalizing WhatsApp connection...",
        "info"
      );

      const completeResult =
        await callBackend({
          action: "complete",

          state:
            signupConfig.state,

          code:
            signupConfig.auth_code,

          waba_id:
            embeddedSignupData.waba_id,

          phone_number_id:
            embeddedSignupData.phone_number_id
        });

      log(
        "WhatsApp connection completed.",
        completeResult
      );

      updateWhatsAppButton(
        button,
        "connected"
      );

      showMessage(
        "WhatsApp connected successfully.",
        "success"
      );

      /*
       * Refresh Follow-up Specialist UI.
       */
      await refreshFollowUp();

    } catch (error) {
      console.error(
        "[GLIME WhatsApp] Connection failed:",
        error
      );

      updateWhatsAppButton(
        button,
        "disconnected"
      );

      showMessage(
        error && error.message
          ? error.message
          : "WhatsApp connection failed.",
        "error"
      );
    } finally {
      isLaunching = false;
    }
  }

  /* ============================================================
     Status
     ============================================================ */

  async function getStatus() {
    try {
      const result =
        await callBackend({
          action: "status"
        });

      return result;
    } catch (error) {
      warn(
        "Unable to load WhatsApp status:",
        error
      );

      return null;
    }
  }

  async function refreshStatus() {
    const button =
      findWhatsAppButton();

    if (!button) {
      return;
    }

    try {
      const result =
        await getStatus();

      if (
        result &&
        result.connected
      ) {
        updateWhatsAppButton(
          button,
          "connected"
        );
      } else {
        updateWhatsAppButton(
          button,
          "disconnected"
        );
      }
    } catch (error) {
      updateWhatsAppButton(
        button,
        "disconnected"
      );
    }
  }

  /* ============================================================
     Disconnect
     ============================================================ */

  async function disconnect() {
    const confirmed =
      window.confirm(
        "Disconnect WhatsApp from GLIME?"
      );

    if (!confirmed) {
      return;
    }

    const button =
      findWhatsAppButton();

    updateWhatsAppButton(
      button,
      "connecting"
    );

    try {
      await callBackend({
        action: "disconnect"
      });

      updateWhatsAppButton(
        button,
        "disconnected"
      );

      showMessage(
        "WhatsApp disconnected.",
        "success"
      );

    } catch (error) {
      updateWhatsAppButton(
        button,
        "connected"
      );

      showMessage(
        error && error.message
          ? error.message
          : "Unable to disconnect WhatsApp.",
        "error"
      );
    }
  }

  /* ============================================================
     Follow-up Page Refresh
     ============================================================ */

  async function refreshFollowUp() {
    try {
      if (
        typeof window.loadFollowUpSpecialist ===
        "function"
      ) {
        await window.loadFollowUpSpecialist();
        return;
      }

      if (
        window.GLIMEFollowUpAnalysis &&
        typeof window.GLIMEFollowUpAnalysis.refresh ===
          "function"
      ) {
        await window.GLIMEFollowUpAnalysis.refresh();
      }
    } catch (error) {
      warn(
        "Follow-up refresh failed:",
        error
      );
    }
  }

  /* ============================================================
     Event Handling
     ============================================================ */

  function handleAddonClick(event) {
    const target =
      event.target.closest(
        "[data-addon-action]"
      );

    if (!target) {
      return;
    }

    const action =
      target.dataset.addonAction;

    if (!action) {
      return;
    }

    /*
     * Only intercept addon actions.
     * Existing follow-up.js actions remain untouched.
     */
    event.preventDefault();
    event.stopPropagation();

    if (
      action === "whatsapp-connect"
    ) {
      startSignup();
      return;
    }

    if (
      action === "whatsapp-status"
    ) {
      handleConnectedClick();
      return;
    }
  }

  async function handleConnectedClick() {
    const result =
      await getStatus();

    if (
      result &&
      result.connected
    ) {
      const phone =
        result.connection &&
        result.connection.display_phone_number
          ? result.connection.display_phone_number
          : "Connected";

      const business =
        result.connection &&
        result.connection.business_name
          ? result.connection.business_name
          : "";

      const message =
        business
          ? "WhatsApp connected: " +
            business +
            " (" +
            phone +
            ")"
          : "WhatsApp connected: " +
            phone;

      showMessage(
        message,
        "success"
      );

      return;
    }

    showMessage(
      "WhatsApp connection is not active.",
      "info"
    );
  }

  /* ============================================================
     Prepare UI
     ============================================================ */

  function prepareButton() {
    const button =
      findWhatsAppButton();

    if (!button) {
      return false;
    }

    /*
     * Convert the core disabled WhatsApp button
     * into an addon-controlled button.
     */
    button.disabled = false;

    button.dataset.addonAction =
      "whatsapp-connect";

    button.removeAttribute("title");

    /*
     * Preserve the existing GLIME channel layout.
     */
    if (
      !button.textContent ||
      button.textContent
        .toLowerCase()
        .includes("provider")
    ) {
      button.textContent =
        "Connect WhatsApp";
    }

    return true;
  }

  async function prepare() {
    prepareButton();

    await refreshStatus();

    /*
     * The core page can render channels asynchronously.
     * Retry a few times without touching core JS.
     */
    let attempts = 0;

    const timer =
      setInterval(
        async function () {
          attempts += 1;

          prepareButton();

          if (attempts >= 10) {
            clearInterval(timer);
          }
        },
        1000
      );
  }

  /* ============================================================
     Helpers
     ============================================================ */

  function wait(ms) {
    return new Promise(
      function (resolve) {
        setTimeout(
          resolve,
          ms
        );
      }
    );
  }

  /* ============================================================
     Initialization
     ============================================================ */

  function initialize() {
    log(
      "WhatsApp Connection Addon initialized."
    );

    window.addEventListener(
      "message",
      handleEmbeddedSignupMessage
    );

    /*
     * Capture phase lets this addon handle only
     * data-addon-action buttons before generic handlers.
     */
    document.addEventListener(
      "click",
      handleAddonClick,
      true
    );

    prepare();

    /*
     * Give follow-up.js time to finish rendering.
     */
    setTimeout(
      prepare,
      1500
    );

    setTimeout(
      prepare,
      3000
    );

    /*
     * Periodically verify connection state.
     */
    setInterval(
      refreshStatus,
      8 * 60 * 1000
    );
  }

  /* ============================================================
     Public API
     ============================================================ */

  window.GLIMEWhatsAppConnection = {
    startSignup: startSignup,
    refresh: prepare,
    status: getStatus,
    disconnect: disconnect
  };

  /*
   * Start after DOM is ready.
   */
  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialize
    );
  } else {
    initialize();
  }

})();
