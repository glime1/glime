(function () {
  "use strict";

  // GLIME Voice Provider Admin Add-on
  // Does NOT replace admin.html or admin-modules-addon.js.

  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  const PROVIDER_META = {
    omnidimension: {
      name: "OmniDimension",
      description: "Primary GLIME voice provider",
      badge: "Recommended"
    },
    exotel: {
      name: "Exotel",
      description: "India-focused telephony / voice infrastructure",
      badge: "India"
    },
    plivo: {
      name: "Plivo",
      description: "Voice API and real-time AI streaming",
      badge: "Alternative"
    }
  };

  let root = null;
  let currentClientId = null;
  let currentAgent = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getClientId() {
    // First try common IDs used by the existing admin page.
    const selectors = [
      "#clientId",
      "#currentClientId",
      "[data-client-id]"
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);

      if (el) {
        const value =
          el.value ||
          el.textContent ||
          el.dataset?.clientId ||
          "";

        if (String(value).trim()) {
          return String(value).trim();
        }
      }
    }

    // Fallback: inspect client email field and ask the existing
    // admin page's client state to populate this when available.
    return null;
  }

  function injectStyles() {
    if (document.getElementById("glime-voice-provider-addon-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "glime-voice-provider-addon-style";

    style.textContent = `
      .glime-vp-card {
        margin-top: 18px;
        padding: 20px;
        border: 1px solid rgba(82,232,255,.18);
        border-radius: 16px;
        background: linear-gradient(
          145deg,
          rgba(5,11,16,.98),
          rgba(10,20,27,.96)
        );
        color: #f4fbfd;
      }

      .glime-vp-title {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        margin-bottom:6px;
      }

      .glime-vp-title h3 {
        margin:0;
        font-size:18px;
      }

      .glime-vp-subtitle {
        margin:0 0 16px;
        color:#9cabb9;
        font-size:13px;
      }

      .glime-vp-grid {
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:12px;
      }

      .glime-vp-option {
        position:relative;
        cursor:pointer;
        border:1px solid rgba(156,171,185,.18);
        border-radius:13px;
        padding:15px;
        background:rgba(255,255,255,.025);
        transition:.2s ease;
      }

      .glime-vp-option:hover {
        border-color:rgba(82,232,255,.45);
        transform:translateY(-1px);
      }

      .glime-vp-option.active {
        border-color:#50f5a8;
        box-shadow:0 0 0 1px rgba(80,245,168,.2);
      }

      .glime-vp-option input {
        position:absolute;
        opacity:0;
        pointer-events:none;
      }

      .glime-vp-name {
        font-weight:700;
        margin-bottom:5px;
      }

      .glime-vp-description {
        color:#9cabb9;
        font-size:12px;
        line-height:1.45;
      }

      .glime-vp-badge {
        display:inline-block;
        margin-top:10px;
        padding:3px 7px;
        border-radius:999px;
        font-size:10px;
        color:#050b10;
        background:#50f5a8;
        font-weight:700;
      }

      .glime-vp-actions {
        display:flex;
        align-items:center;
        gap:12px;
        margin-top:16px;
        flex-wrap:wrap;
      }

      .glime-vp-save {
        border:0;
        border-radius:10px;
        padding:10px 16px;
        cursor:pointer;
        background:#50f5a8;
        color:#050b10;
        font-weight:800;
      }

      .glime-vp-save:disabled {
        opacity:.5;
        cursor:not-allowed;
      }

      .glime-vp-status {
        color:#9cabb9;
        font-size:12px;
      }

      .glime-vp-current {
        color:#52e8ff;
        font-weight:700;
      }

      @media (max-width: 800px) {
        .glime-vp-grid {
          grid-template-columns:1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function findMountPoint() {
    const candidates = [
      "#clientDetails",
      "#clientPanel",
      "#clientInfo",
      "#moduleManager",
      "#modulesContainer",
      ".client-details",
      ".client-panel",
      "main"
    ];

    for (const selector of candidates) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    return document.body;
  }

  function renderShell() {
    if (document.getElementById("glime-voice-provider-addon")) {
      root = document.getElementById("glime-voice-provider-addon");
      return;
    }

    const mount = findMountPoint();

    root = document.createElement("section");
    root.id = "glime-voice-provider-addon";
    root.className = "glime-vp-card";

    root.innerHTML = `
      <div class="glime-vp-title">
        <h3>🎙️ Voice AI Provider</h3>
        <span class="glime-vp-current" id="glimeVpCurrent">
          Not loaded
        </span>
      </div>

      <p class="glime-vp-subtitle">
        Select which telephony provider this client's Voice AI will use.
      </p>

      <div class="glime-vp-grid" id="glimeVpGrid">
        Loading providers…
      </div>

      <div class="glime-vp-actions">
        <button
          type="button"
          class="glime-vp-save"
          id="glimeVpSave"
          disabled
        >
          Save Provider
        </button>

        <span
          class="glime-vp-status"
          id="glimeVpStatus"
        >
          Select a client first.
        </span>
      </div>
    `;

    mount.appendChild(root);

    document
      .getElementById("glimeVpSave")
      .addEventListener("click", saveProvider);
  }

  async function loadProviders() {
    const grid = document.getElementById("glimeVpGrid");

    if (!grid) return;

    const { data, error } = await db
      .from("voice_providers")
      .select("provider_key,display_name,enabled")
      .eq("enabled", true)
      .order("id", { ascending: true });

    if (error) {
      grid.innerHTML =
        `<div style="color:#ff8d8d">Unable to load providers.</div>`;
      console.error("GLIME Voice Provider:", error);
      return;
    }

    if (!data?.length) {
      grid.innerHTML =
        `<div style="color:#ffcc80">No voice providers are enabled.</div>`;
      return;
    }

    grid.innerHTML = data
      .map((provider) => {
        const key = provider.provider_key;
        const meta = PROVIDER_META[key] || {};

        return `
          <label class="glime-vp-option" data-provider="${escapeHtml(key)}">
            <input
              type="radio"
              name="glimeVoiceProvider"
              value="${escapeHtml(key)}"
            >

            <div class="glime-vp-name">
              ${escapeHtml(provider.display_name || meta.name || key)}
            </div>

            <div class="glime-vp-description">
              ${escapeHtml(meta.description || "Voice provider")}
            </div>

            ${
              meta.badge
                ? `<span class="glime-vp-badge">
                    ${escapeHtml(meta.badge)}
                   </span>`
                : ""
            }
          </label>
        `;
      })
      .join("");

    grid.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        grid.querySelectorAll(".glime-vp-option")
          .forEach((el) => el.classList.remove("active"));

        input.closest(".glime-vp-option")?.classList.add("active");

        const save = document.getElementById("glimeVpSave");
        if (save) save.disabled = false;
      });
    });
  }

  async function loadClientVoiceAgent(clientId) {
    if (!clientId) {
      setStatus("Client ID not available yet.");
      return;
    }

    currentClientId = clientId;
    setStatus("Loading Voice AI configuration…");

    const { data, error } = await db.rpc(
      "admin_get_voice_agent_provider",
      {
        p_client_id: clientId
      }
    );

    if (error) {
      console.error("GLIME Voice Provider load:", error);
      setStatus("Unable to load Voice AI configuration.");
      return;
    }

    currentAgent = data?.[0] || null;

    const current = document.getElementById("glimeVpCurrent");

    if (!currentAgent) {
      if (current) current.textContent = "No Voice AI agent";
      setStatus("This client does not have an active Voice AI agent.");
      return;
    }

    const provider =
      PROVIDER_META[currentAgent.provider_key]?.name ||
      currentAgent.provider_key ||
      "Not configured";

    if (current) {
      current.textContent = provider;
    }

    const radio = document.querySelector(
      `input[name="glimeVoiceProvider"][value="${CSS.escape(
        currentAgent.provider_key || ""
      )}"]`
    );

    if (radio) {
      radio.checked = true;
      radio.closest(".glime-vp-option")?.classList.add("active");
    }

    setStatus(
      `Current provider: ${provider}`
    );
  }

  async function saveProvider() {
    if (!currentAgent?.agent_id) {
      setStatus("No Voice AI agent found.");
      return;
    }

    const selected = document.querySelector(
      'input[name="glimeVoiceProvider"]:checked'
    );

    if (!selected) {
      setStatus("Please select a provider.");
      return;
    }

    const providerKey = selected.value;
    const save = document.getElementById("glimeVpSave");

    if (save) {
      save.disabled = true;
      save.textContent = "Saving…";
    }

    setStatus("Updating Voice AI provider…");

    const { data, error } = await db.rpc(
      "admin_set_voice_agent_provider",
      {
        p_agent_id: currentAgent.agent_id,
        p_provider_key: providerKey
      }
    );

    if (error) {
      console.error("GLIME Voice Provider save:", error);
      setStatus(
        error.message || "Unable to update provider."
      );

      if (save) {
        save.disabled = false;
        save.textContent = "Save Provider";
      }

      return;
    }

    currentAgent = data;

    const current = document.getElementById("glimeVpCurrent");

    if (current) {
      current.textContent =
        PROVIDER_META[providerKey]?.name || providerKey;
    }

    setStatus("Provider updated successfully.");

    if (save) {
      save.disabled = true;
      save.textContent = "Saved ✓";
    }
  }

  function setStatus(message) {
    const el = document.getElementById("glimeVpStatus");
    if (el) el.textContent = message;
  }

  /*
   * Try to detect client changes without modifying admin.html.
   *
   * Existing admin.html can expose client information in several ways.
   * The add-on observes DOM changes and retries automatically.
   */
  function detectClient() {
    const clientId = getClientId();

    if (clientId && clientId !== currentClientId) {
      loadClientVoiceAgent(clientId);
    }
  }

  function observeAdminPage() {
    const observer = new MutationObserver(() => {
      detectClient();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    setInterval(detectClient, 1200);
  }

  async function init() {
    if (!window.supabase) {
      console.error(
        "GLIME Voice Provider Add-on: Supabase client library not loaded."
      );
      return;
    }

    injectStyles();
    renderShell();
    await loadProviders();

    detectClient();
    observeAdminPage();

    /*
     * Public helper so the existing admin page can explicitly notify
     * this addon when a client has been fetched.
     *
     * Example:
     * window.GLIMEVoiceProviderAdmin.setClient("GLM-0001");
     */
    window.GLIMEVoiceProviderAdmin = {
      setClient: function (clientId) {
        if (clientId) {
          loadClientVoiceAgent(String(clientId).trim());
        }
      },

      reload: function () {
        detectClient();
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
