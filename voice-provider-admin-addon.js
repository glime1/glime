(function () {
  "use strict";

  /*
   * GLIME Voice Provider Admin Add-on
   *
   * IMPORTANT:
   * - admin.html को replace नहीं करता
   * - admin-modules-addon.js को touch नहीं करता
   * - Login screen पर दिखाई नहीं देगा
   * - केवल Admin Control Room के अंदर दिखाई देगा
   * - Provider data admin-only RPC से load होता है
   */

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

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

  let currentAgent = null;
  let lastClientEmail = "";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ---------------------------------
     STYLES
  --------------------------------- */

  function injectStyles() {
    if (
      document.getElementById(
        "glime-voice-provider-addon-style"
      )
    ) {
      return;
    }

    const style = document.createElement("style");

    style.id =
      "glime-voice-provider-addon-style";

    style.textContent = `
      #glime-voice-provider-addon {
        display: none;
      }

      #glime-voice-provider-addon.glime-vp-visible {
        display: block;
      }

      .glime-vp-section {
        margin-top: 22px;
        padding-top: 20px;
        border-top: 1px solid rgba(255,255,255,.09);
      }

      .glime-vp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 6px;
      }

      .glime-vp-header h3 {
        margin: 0;
        color: #ff9f43;
        font-size: 1rem;
      }

      .glime-vp-current {
        color: #00eaff;
        font-weight: 700;
        font-size: .8rem;
      }

      .glime-vp-subtitle {
        color: #9ba7b7;
        margin: 0 0 14px;
        font-size: .78rem;
      }

      .glime-vp-grid {
        display: grid;
        grid-template-columns:
          repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .glime-vp-option {
        position: relative;
        cursor: pointer;
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 12px;
        padding: 14px;
        background: rgba(255,255,255,.025);
        transition: .2s ease;
      }

      .glime-vp-option:hover {
        border-color: rgba(0,234,255,.45);
      }

      .glime-vp-option.active {
        border-color: #00ff88;
        box-shadow:
          0 0 0 1px rgba(0,255,136,.15);
      }

      .glime-vp-option input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .glime-vp-name {
        font-weight: 700;
        margin-bottom: 4px;
      }

      .glime-vp-description {
        color: #9ba7b7;
        font-size: .72rem;
        line-height: 1.45;
      }

      .glime-vp-badge {
        display: inline-block;
        margin-top: 9px;
        padding: 3px 7px;
        border-radius: 999px;
        font-size: 10px;
        color: #061016;
        background: #00ff88;
        font-weight: 700;
      }

      .glime-vp-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 14px;
        flex-wrap: wrap;
      }

      .glime-vp-save {
        width: auto !important;
        margin: 0 !important;
        background: #00ff88 !important;
        color: #061016 !important;
      }

      .glime-vp-status {
        color: #9ba7b7;
        font-size: .72rem;
      }

      @media (max-width: 650px) {

        .glime-vp-grid {
          grid-template-columns: 1fr;
        }

        .glime-vp-header {
          align-items: flex-start;
          flex-direction: column;
        }

      }
    `;

    document.head.appendChild(style);
  }

  /* ---------------------------------
     CONTROL ROOM
  --------------------------------- */

  function getControlRoom() {
    return document.getElementById(
      "control-room"
    );
  }

  function isLoggedIn() {
    const controlRoom =
      getControlRoom();

    if (!controlRoom) {
      return false;
    }

    return (
      getComputedStyle(controlRoom).display !==
      "none"
    );
  }

  /* ---------------------------------
     UI SHELL
  --------------------------------- */

  function renderShell() {

    if (
      document.getElementById(
        "glime-voice-provider-addon"
      )
    ) {
      return;
    }

    const controlRoom =
      getControlRoom();

    if (!controlRoom) {
      return;
    }

    const root =
      document.createElement("section");

    root.id =
      "glime-voice-provider-addon";

    root.className =
      "glime-vp-section";

    root.innerHTML = `
      <div class="glime-vp-header">

        <h3>
          🎙️ Voice AI Provider
        </h3>

        <span
          class="glime-vp-current"
          id="glimeVpCurrent"
        >
          Not loaded
        </span>

      </div>

      <p class="glime-vp-subtitle">
        Select which telephony provider this
        client's Voice AI will use.
      </p>

      <div
        class="glime-vp-grid"
        id="glimeVpGrid"
      ></div>

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
          Fetch a client first.
        </span>

      </div>
    `;

    /*
     * IMPORTANT:
     * Add inside existing Admin Control Room.
     * NOT document.body.
     */
    controlRoom.appendChild(root);

    const saveButton =
      document.getElementById(
        "glimeVpSave"
      );

    if (saveButton) {
      saveButton.addEventListener(
        "click",
        saveProvider
      );
    }
  }

  function setVisible(visible) {

    const root =
      document.getElementById(
        "glime-voice-provider-addon"
      );

    if (!root) {
      return;
    }

    root.classList.toggle(
      "glime-vp-visible",
      !!visible
    );
  }

  function setStatus(message) {

    const el =
      document.getElementById(
        "glimeVpStatus"
      );

    if (el) {
      el.textContent = message;
    }
  }

  /* ---------------------------------
     LOAD PROVIDERS
  --------------------------------- */

  async function loadProviders() {

    const grid =
      document.getElementById(
        "glimeVpGrid"
      );

    if (!grid) {
      return;
    }

    grid.innerHTML = `
      <div style="color:#9ba7b7">
        Loading providers…
      </div>
    `;

    /*
     * Admin-only RPC.
     *
     * We intentionally do NOT read
     * voice_providers directly from
     * the browser.
     */
    const {
      data,
      error
    } = await db.rpc(
      "admin_list_voice_providers"
    );

    if (error) {

      console.error(
        "GLIME Voice Provider list:",
        error
      );

      grid.innerHTML = `
        <div style="color:#ff5263">
          Unable to load providers.
        </div>
      `;

      return;
    }

    if (!data || !data.length) {

      grid.innerHTML = `
        <div style="color:#ffcc80">
          No voice providers are enabled.
        </div>
      `;

      return;
    }

    grid.innerHTML = data
      .map((provider) => {

        const key =
          provider.provider_key;

        const meta =
          PROVIDER_META[key] || {};

        return `
          <label
            class="glime-vp-option"
            data-provider="${escapeHtml(key)}"
          >

            <input
              type="radio"
              name="glimeVoiceProvider"
              value="${escapeHtml(key)}"
            >

            <div class="glime-vp-name">
              ${escapeHtml(
                provider.display_name ||
                meta.name ||
                key
              )}
            </div>

            <div class="glime-vp-description">
              ${escapeHtml(
                meta.description ||
                "Voice provider"
              )}
            </div>

            ${
              meta.badge
                ? `
                  <span class="glime-vp-badge">
                    ${escapeHtml(meta.badge)}
                  </span>
                `
                : ""
            }

          </label>
        `;
      })
      .join("");

    grid
      .querySelectorAll("input")
      .forEach((input) => {

        input.addEventListener(
          "change",
          () => {

            grid
              .querySelectorAll(
                ".glime-vp-option"
              )
              .forEach((el) => {

                el.classList.remove(
                  "active"
                );

              });

            input
              .closest(
                ".glime-vp-option"
              )
              ?.classList.add(
                "active"
              );

            const save =
              document.getElementById(
                "glimeVpSave"
              );

            if (save) {
              save.disabled = false;
            }

          }
        );

      });
  }

  /* ---------------------------------
     LOAD CLIENT VOICE AI
  --------------------------------- */

  async function loadClientByEmail(
    email
  ) {

    if (!isLoggedIn()) {
      return;
    }

    const cleanEmail =
      String(email || "")
        .trim()
        .toLowerCase();

    if (!cleanEmail) {
      return;
    }

    lastClientEmail =
      cleanEmail;

    setVisible(true);

    setStatus(
      "Loading Voice AI configuration…"
    );

    /*
     * Admin-only RPC.
     *
     * Email -> client -> Voice Agent
     */
    const {
      data,
      error
    } = await db.rpc(
      "admin_get_voice_agent_provider_by_email",
      {
        p_email: cleanEmail
      }
    );

    if (error) {

      console.error(
        "GLIME Voice Provider load:",
        error
      );

      currentAgent = null;

      setStatus(
        "Unable to load Voice AI configuration."
      );

      return;
    }

    currentAgent =
      data?.[0] || null;

    const current =
      document.getElementById(
        "glimeVpCurrent"
      );

    const save =
      document.getElementById(
        "glimeVpSave"
      );

    if (!currentAgent) {

      if (current) {
        current.textContent =
          "No Voice AI agent";
      }

      if (save) {
        save.disabled = true;
      }

      setStatus(
        "This client does not have a Voice AI agent."
      );

      return;
    }

    const provider =
      PROVIDER_META[
        currentAgent.provider_key
      ]?.name ||
      currentAgent.provider_key ||
      "Not configured";

    if (current) {
      current.textContent =
        provider;
    }

    /*
     * Select current provider.
     */
    const radio =
      document.querySelector(
        `input[name="glimeVoiceProvider"][value="${CSS.escape(
          currentAgent.provider_key || ""
        )}"]`
      );

    if (radio) {

      radio.checked = true;

      radio
        .closest(
          ".glime-vp-option"
        )
        ?.classList.add(
          "active"
        );
    }

    if (save) {

      save.disabled = true;

      save.textContent =
        "Save Provider";
    }

    setStatus(
      `Current provider: ${provider}`
    );
  }

  /* ---------------------------------
     SAVE PROVIDER
  --------------------------------- */

  async function saveProvider() {

    if (!currentAgent?.agent_id) {

      setStatus(
        "No Voice AI agent found."
      );

      return;
    }

    const selected =
      document.querySelector(
        'input[name="glimeVoiceProvider"]:checked'
      );

    if (!selected) {

      setStatus(
        "Please select a provider."
      );

      return;
    }

    const save =
      document.getElementById(
        "glimeVpSave"
      );

    if (save) {

      save.disabled = true;

      save.textContent =
        "Saving…";
    }

    setStatus(
      "Updating Voice AI provider…"
    );

    const {
      data,
      error
    } = await db.rpc(
      "admin_set_voice_agent_provider",
      {
        p_agent_id:
          currentAgent.agent_id,

        p_provider_key:
          selected.value
      }
    );

    if (error) {

      console.error(
        "GLIME Voice Provider save:",
        error
      );

      setStatus(
        error.message ||
        "Unable to update provider."
      );

      if (save) {

        save.disabled = false;

        save.textContent =
          "Save Provider";
      }

      return;
    }

    currentAgent =
      Array.isArray(data)
        ? data[0]
        : data;

    const current =
      document.getElementById(
        "glimeVpCurrent"
      );

    if (current) {

      current.textContent =
        PROVIDER_META[
          selected.value
        ]?.name ||
        selected.value;
    }

    setStatus(
      "Provider updated successfully."
    );

    if (save) {

      save.textContent =
        "Saved ✓";

      save.disabled = true;
    }
  }

  /* ---------------------------------
     ADMIN HOOKS
  --------------------------------- */

  function attachAdminHooks() {

    const fetchBtn =
      document.getElementById(
        "fetchBtn"
      );

    if (
      fetchBtn &&
      !fetchBtn.dataset
        .glimeVoiceProviderHooked
    ) {

      fetchBtn.dataset
        .glimeVoiceProviderHooked =
        "true";

      fetchBtn.addEventListener(
        "click",
        () => {

          /*
           * Existing admin.html
           * fetchClient() remains untouched.
           *
           * We wait for it to finish,
           * then load Voice AI config.
           */
          setTimeout(() => {

            const email =
              document.getElementById(
                "clientEmail"
              )?.value || "";

            loadClientByEmail(
              email
            );

          }, 700);

        }
      );
    }

    const logoutBtn =
      document.getElementById(
        "logoutBtn"
      );

    if (
      logoutBtn &&
      !logoutBtn.dataset
        .glimeVoiceProviderHooked
    ) {

      logoutBtn.dataset
        .glimeVoiceProviderHooked =
        "true";

      logoutBtn.addEventListener(
        "click",
        () => {

          currentAgent =
            null;

          lastClientEmail =
            "";

          setVisible(false);

        }
      );
    }
  }

  /* ---------------------------------
     INIT
  --------------------------------- */

  async function init() {

    if (!window.supabase) {

      console.error(
        "GLIME Voice Provider: Supabase client unavailable."
      );

      return;
    }

    injectStyles();

    renderShell();

    attachAdminHooks();

    /*
     * NEVER show provider card
     * on login screen.
     */
    setVisible(false);

    /*
     * If already logged in,
     * load existing client if available.
     */
    if (isLoggedIn()) {

      const email =
        document.getElementById(
          "clientEmail"
        )?.value || "";

      if (email) {

        await loadProviders();

        await loadClientByEmail(
          email
        );
      }
    }

    /*
     * Watch the existing admin UI.
     *
     * No admin.html replacement.
     */
    const observer =
      new MutationObserver(() => {

        attachAdminHooks();

        if (!isLoggedIn()) {

          setVisible(false);

          return;
        }

        const email =
          document.getElementById(
            "clientEmail"
          )?.value || "";

        if (
          email &&
          email !== lastClientEmail
        ) {

          lastClientEmail =
            email;

          loadProviders();

          loadClientByEmail(
            email
          );
        }

      });

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "style",
          "class"
        ]
      }
    );

    /*
     * Public helper.
     */
    window.GLIMEVoiceProviderAdmin = {

      setClientEmail: (
        email
      ) => {
        loadClientByEmail(
          email
        );
      },

      reload: () => {

        const email =
          document.getElementById(
            "clientEmail"
          )?.value || "";

        loadProviders();

        loadClientByEmail(
          email
        );
      }

    };
  }

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
