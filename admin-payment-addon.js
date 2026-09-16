/*
 * GLIME — Admin Payment Provider Control
 * File: admin-payment-addon.js
 *
 * PURPOSE:
 * Admin Dashboard में Payment Provider को control करना.
 *
 * IMPORTANT:
 * - यह addon admin.html को replace नहीं करता।
 * - admin-modules-addon.js को modify नहीं करता।
 * - admin-care-addon.js को modify नहीं करता।
 * - Provider selection backend RPC से होती है।
 * - कोई silent provider fallback नहीं है।
 * - Payment credentials इस frontend file में नहीं रखे जाते।
 */

(() => {
  "use strict";

  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";

  // Existing GLIME Supabase client को reuse करने की कोशिश।
  const getSupabase = () => {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase) return window.supabase;

    console.error("GLIME Payment Addon: Supabase client not found.");
    return null;
  };

  const PROVIDERS = [
    {
      value: "",
      label: "Disabled"
    },
    {
      value: "razorpay",
      label: "Razorpay"
    },
    {
      value: "cashfree",
      label: "Cashfree"
    },
    {
      value: "zoho",
      label: "Zoho"
    }
  ];

  const METHODS = [
    {
      value: "upi_intent",
      label: "UPI Intent"
    },
    {
      value: "card",
      label: "Card"
    },
    {
      value: "upi_autopay",
      label: "UPI AutoPay"
    }
  ];

  const ENVIRONMENTS = [
    {
      value: "sandbox",
      label: "Sandbox"
    },
    {
      value: "production",
      label: "Production"
    }
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function injectStyles() {
    if (document.getElementById("glime-payment-addon-style")) return;

    const style = document.createElement("style");
    style.id = "glime-payment-addon-style";

    style.textContent = `
      .glime-payment-card {
        margin-top: 20px;
        padding: 20px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.035);
      }

      .glime-payment-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }

      .glime-payment-title h3 {
        margin: 0;
        font-size: 18px;
      }

      .glime-payment-subtitle {
        margin: 0 0 18px;
        opacity: .70;
        font-size: 13px;
        line-height: 1.5;
      }

      .glime-payment-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .glime-payment-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .glime-payment-field label {
        font-size: 12px;
        opacity: .72;
      }

      .glime-payment-field select {
        width: 100%;
        box-sizing: border-box;
        padding: 11px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.20);
        color: inherit;
        outline: none;
      }

      .glime-payment-toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 16px;
        font-size: 13px;
      }

      .glime-payment-toggle input {
        width: 17px;
        height: 17px;
      }

      .glime-payment-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 18px;
        flex-wrap: wrap;
      }

      .glime-payment-btn {
        border: 0;
        border-radius: 10px;
        padding: 11px 16px;
        cursor: pointer;
        font-weight: 600;
      }

      .glime-payment-btn.primary {
        background: #ffffff;
        color: #111111;
      }

      .glime-payment-btn.secondary {
        background: rgba(255,255,255,.08);
        color: inherit;
        border: 1px solid rgba(255,255,255,.10);
      }

      .glime-payment-status {
        margin-top: 14px;
        padding: 11px 13px;
        border-radius: 10px;
        background: rgba(255,255,255,.045);
        font-size: 13px;
        line-height: 1.5;
      }

      .glime-payment-status.success {
        border: 1px solid rgba(80,200,120,.35);
      }

      .glime-payment-status.error {
        border: 1px solid rgba(255,80,80,.35);
      }

      .glime-payment-provider-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 11px;
        background: rgba(255,255,255,.07);
        white-space: nowrap;
      }

      .glime-payment-warning {
        margin-top: 15px;
        padding: 12px;
        border-radius: 10px;
        background: rgba(255,180,0,.07);
        border: 1px solid rgba(255,180,0,.20);
        font-size: 12px;
        line-height: 1.5;
      }

      @media (max-width: 800px) {
        .glime-payment-grid {
          grid-template-columns: 1fr;
        }

        .glime-payment-title {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function createAddon() {
    if (document.getElementById("glime-payment-provider-control")) {
      return;
    }

    const controlRoom = document.getElementById("control-room");

    if (!controlRoom) {
      console.warn(
        "GLIME Payment Addon: #control-room not found. Retrying..."
      );

      setTimeout(createAddon, 1200);
      return;
    }

    injectStyles();

    const section = document.createElement("div");
    section.id = "glime-payment-provider-control";
    section.className = "glime-payment-card";

    section.innerHTML = `
      <div class="glime-payment-title">
        <div>
          <h3>💳 GLIME Payment Provider</h3>
          <p class="glime-payment-subtitle">
            Family OS के payment requests के लिए Admin-selected provider control.
          </p>
        </div>

        <span
          id="glime-payment-provider-badge"
          class="glime-payment-provider-badge"
        >
          Loading...
        </span>
      </div>

      <div class="glime-payment-grid">

        <div class="glime-payment-field">
          <label for="glime-payment-provider">
            Active Provider
          </label>

          <select id="glime-payment-provider">
            ${PROVIDERS.map(
              provider =>
                `<option value="${escapeHtml(provider.value)}">
                  ${escapeHtml(provider.label)}
                </option>`
            ).join("")}
          </select>
        </div>

        <div class="glime-payment-field">
          <label for="glime-payment-environment">
            Environment
          </label>

          <select id="glime-payment-environment">
            ${ENVIRONMENTS.map(
              env =>
                `<option value="${escapeHtml(env.value)}">
                  ${escapeHtml(env.label)}
                </option>`
            ).join("")}
          </select>
        </div>

        <div class="glime-payment-field">
          <label for="glime-payment-method">
            Payment Method
          </label>

          <select id="glime-payment-method">
            ${METHODS.map(
              method =>
                `<option value="${escapeHtml(method.value)}">
                  ${escapeHtml(method.label)}
                </option>`
            ).join("")}
          </select>
        </div>

      </div>

      <label class="glime-payment-toggle">
        <input
          type="checkbox"
          id="glime-payment-enabled"
        />
        <span>Payment Engine Enabled</span>
      </label>

      <div class="glime-payment-actions">

        <button
          type="button"
          id="glime-payment-refresh"
          class="glime-payment-btn secondary"
        >
          ↻ Refresh
        </button>

        <button
          type="button"
          id="glime-payment-save"
          class="glime-payment-btn primary"
        >
          Save Provider
        </button>

      </div>

      <div
        id="glime-payment-status"
        class="glime-payment-status"
      >
        Loading payment configuration...
      </div>

      <div class="glime-payment-warning">
        ⚠️ Provider बदलने पर GLIME payment routing केवल selected provider
        को use करेगी। Automatic fallback provider नहीं होगा।
        Production credentials इस dashboard में store नहीं किए जाते।
      </div>
    `;

    controlRoom.appendChild(section);

    bindEvents();
    loadProvider();
  }

  function setStatus(message, type = "") {
    const element = document.getElementById("glime-payment-status");

    if (!element) return;

    element.className =
      "glime-payment-status" + (type ? ` ${type}` : "");

    element.textContent = message;
  }

  function setBadge(text) {
    const badge = document.getElementById(
      "glime-payment-provider-badge"
    );

    if (badge) {
      badge.textContent = text;
    }
  }

  async function getClient() {
    const client = getSupabase();

    if (!client) {
      throw new Error(
        "Supabase client उपलब्ध नहीं है।"
      );
    }

    return client;
  }

  async function loadProvider() {
    try {
      setStatus("Payment configuration load हो रही है...");

      const client = await getClient();

      const { data, error } = await client.rpc(
        "care_payment_get_active_provider"
      );

      if (error) {
        throw error;
      }

      const config = Array.isArray(data)
        ? data[0]
        : data;

      if (!config) {
        throw new Error(
          "Payment provider configuration नहीं मिली।"
        );
      }

      const providerSelect =
        document.getElementById(
          "glime-payment-provider"
        );

      const environmentSelect =
        document.getElementById(
          "glime-payment-environment"
        );

      const methodSelect =
        document.getElementById(
          "glime-payment-method"
        );

      const enabledInput =
        document.getElementById(
          "glime-payment-enabled"
        );

      /*
       * Backend की current state UI में दिखाओ।
       * Unknown provider आने पर उसे silently replace नहीं करेंगे।
       */
      if (
        providerSelect &&
        [...providerSelect.options].some(
          option => option.value === (config.active_provider || "")
        )
      ) {
        providerSelect.value =
          config.active_provider || "";
      }

      if (environmentSelect && config.environment) {
        environmentSelect.value =
          config.environment;
      }

      if (methodSelect && config.active_method) {
        methodSelect.value =
          config.active_method;
      }

      if (enabledInput) {
        enabledInput.checked =
          Boolean(config.is_enabled);
      }

      const providerText =
        config.active_provider ||
        "Disabled";

      const statusText =
        config.adapter_status ||
        (config.is_enabled
          ? "enabled"
          : "disabled");

      setBadge(providerText);

      setStatus(
        `Current Provider: ${providerText} | ` +
        `Environment: ${config.environment || "sandbox"} | ` +
        `Method: ${config.active_method || "-"} | ` +
        `Adapter: ${statusText}`,
        "success"
      );

    } catch (error) {
      console.error(
        "GLIME Payment Addon load error:",
        error
      );

      setBadge("Error");

      setStatus(
        `Configuration load नहीं हुई: ${
          error?.message || "Unknown error"
        }`,
        "error"
      );
    }
  }

  async function saveProvider() {
    const provider =
      document.getElementById(
        "glime-payment-provider"
      )?.value || "";

    const environment =
      document.getElementById(
        "glime-payment-environment"
      )?.value || "sandbox";

    const method =
      document.getElementById(
        "glime-payment-method"
      )?.value || "upi_intent";

    const enabled =
      Boolean(
        document.getElementById(
          "glime-payment-enabled"
        )?.checked
      );

    /*
     * Disabled provider => backend को empty provider भेजेंगे।
     * Backend खुद final authorization करेगा।
     */
    try {
      setStatus(
        "Payment provider configuration save हो रही है..."
      );

      const client = await getClient();

      const { data, error } = await client.rpc(
        "care_admin_set_payment_provider",
        {
          p_provider: provider || "",
          p_environment: environment,
          p_method: method,
          p_enabled: enabled
        }
      );

      if (error) {
        throw error;
      }

      const result = Array.isArray(data)
        ? data[0]
        : data;

      const selected =
        result?.active_provider ||
        provider ||
        "Disabled";

      setBadge(selected);

      setStatus(
        `✅ Payment provider successfully updated: ${selected} | ` +
        `${environment} | ${method} | ` +
        `${enabled ? "Enabled" : "Disabled"}`,
        "success"
      );

      /*
       * Backend state दोबारा पढ़कर UI को authoritative state से sync करें।
       */
      await loadProvider();

    } catch (error) {
      console.error(
        "GLIME Payment Addon save error:",
        error
      );

      setStatus(
        `❌ Provider update failed: ${
          error?.message || "Unknown error"
        }`,
        "error"
      );
    }
  }

  function bindEvents() {
    const saveButton =
      document.getElementById(
        "glime-payment-save"
      );

    const refreshButton =
      document.getElementById(
        "glime-payment-refresh"
      );

    if (saveButton) {
      saveButton.addEventListener(
        "click",
        saveProvider
      );
    }

    if (refreshButton) {
      refreshButton.addEventListener(
        "click",
        loadProvider
      );
    }
  }

  /*
   * Admin page पूरी तरह load होने के बाद addon initialize करें।
   */
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      createAddon
    );
  } else {
    createAddon();
  }

})();
