(function () {
  "use strict";

  /*
   * GLIME Voice Provider Provision Add-on
   *
   * - admin.html को replace नहीं करता
   * - केवल Admin Control Room में दिखाई देता है
   * - OmniDimension Agent को create/sync करता है
   * - Phone number नहीं खरीदता
   * - Incoming / Outbound calling ON नहीं करता
   */

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  let currentAgentId = null;
  let lastEmail = "";

  function getControlRoom() {
    return document.getElementById("control-room");
  }

  function isLoggedIn() {
    const room = getControlRoom();

    return (
      !!room &&
      getComputedStyle(room).display !== "none"
    );
  }

  /* ---------------------------------
     STYLES
  --------------------------------- */

  function injectStyles() {
    if (
      document.getElementById(
        "glime-vp-provision-style"
      )
    ) {
      return;
    }

    const style = document.createElement("style");

    style.id =
      "glime-vp-provision-style";

    style.textContent = `
      #glime-vp-provision-addon {
        display: none;
        margin-top: 18px;
      }

      #glime-vp-provision-addon.visible {
        display: block;
      }

      .glime-provision-box {
        padding: 16px;
        border: 1px solid rgba(82,232,255,.18);
        border-radius: 14px;
        background: rgba(82,232,255,.035);
      }

      .glime-provision-title {
        color: #52e8ff;
        font-weight: 800;
        font-size: 1rem;
        margin-bottom: 6px;
      }

      .glime-provision-text {
        color: #9cabb9;
        font-size: .78rem;
        line-height: 1.5;
        margin-bottom: 12px;
      }

      .glime-provision-actions {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }

      #glimeProvisionBtn {
        border: 0;
        border-radius: 10px;
        padding: 10px 15px;
        font-weight: 800;
        cursor: pointer;
        background: #50f5a8;
        color: #050b10;
      }

      #glimeProvisionBtn:disabled {
        opacity: .55;
        cursor: not-allowed;
      }

      #glimeProvisionStatus {
        color: #9cabb9;
        font-size: .74rem;
      }

      .glime-provision-id {
        color: #50f5a8;
        font-family: monospace;
        font-size: .72rem;
        margin-top: 8px;
        word-break: break-all;
      }
    `;

    document.head.appendChild(style);
  }

  /* ---------------------------------
     UI
  --------------------------------- */

  function render() {
    if (
      document.getElementById(
        "glime-vp-provision-addon"
      )
    ) {
      return;
    }

    const room = getControlRoom();

    if (!room) {
      return;
    }

    const section =
      document.createElement("section");

    section.id =
      "glime-vp-provision-addon";

    section.innerHTML = `
      <div class="glime-provision-box">

        <div class="glime-provision-title">
          ⚡ OmniDimension Agent Provisioning
        </div>

        <div class="glime-provision-text">
          Create or sync this client's GLIME Voice AI
          agent with OmniDimension.
          This does not buy a phone number and does
          not turn on incoming or outbound calling.
        </div>

        <div class="glime-provision-actions">

          <button
            id="glimeProvisionBtn"
            type="button"
            disabled
          >
            Provision OmniDimension Agent
          </button>

          <span id="glimeProvisionStatus">
            Fetch a client first.
          </span>

        </div>

        <div
          id="glimeProvisionId"
          class="glime-provision-id"
        ></div>

      </div>
    `;

    room.appendChild(section);

    document
      .getElementById("glimeProvisionBtn")
      ?.addEventListener(
        "click",
        provisionAgent
      );
  }

  function setVisible(value) {
    const element =
      document.getElementById(
        "glime-vp-provision-addon"
      );

    if (element) {
      element.classList.toggle(
        "visible",
        !!value
      );
    }
  }

  function setStatus(message) {
    const element =
      document.getElementById(
        "glimeProvisionStatus"
      );

    if (element) {
      element.textContent = message;
    }
  }

  /* ---------------------------------
     LOAD CLIENT AGENT
  --------------------------------- */

  async function loadAgent(email) {
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

    lastEmail = cleanEmail;

    setVisible(true);

    currentAgentId = null;

    const button =
      document.getElementById(
        "glimeProvisionBtn"
      );

    const idElement =
      document.getElementById(
        "glimeProvisionId"
      );

    if (button) {
      button.disabled = true;
    }

    if (idElement) {
      idElement.textContent = "";
    }

    setStatus(
      "Loading Voice AI agent…"
    );

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
        "GLIME provisioning lookup:",
        error
      );

      setStatus(
        "Unable to load Voice AI agent."
      );

      return;
    }

    const agent =
      data?.[0] || null;

    currentAgentId =
      agent?.agent_id || null;

    if (!currentAgentId) {
      setStatus(
        "No Voice AI agent found for this client."
      );

      return;
    }

    if (button) {
      button.disabled = false;
    }

    if (agent.provider_agent_id) {
      if (idElement) {
        idElement.textContent =
          "Current OmniDimension Agent ID: " +
          agent.provider_agent_id;
      }

      setStatus(
        "OmniDimension Agent already provisioned. You can sync it again if needed."
      );
    } else {
      setStatus(
        "Ready to provision OmniDimension Agent."
      );
    }
  }

  /* ---------------------------------
     PROVISION
  --------------------------------- */

  async function provisionAgent() {
    if (!currentAgentId) {
      setStatus(
        "No Voice AI agent selected."
      );

      return;
    }

    const button =
      document.getElementById(
        "glimeProvisionBtn"
      );

    if (button) {
      button.disabled = true;
      button.textContent =
        "Provisioning…";
    }

    setStatus(
      "Creating/syncing OmniDimension Agent…"
    );

    try {
      const {
        data,
        error
      } = await db.functions.invoke(
        "omnidimension-provision-agent",
        {
          body: {
            agent_id: currentAgentId
          }
        }
      );

      if (error) {
        console.error(
          "GLIME OmniDimension provisioning:",
          error
        );

        setStatus(
          error.message ||
          "Provisioning failed."
        );

        return;
      }

      if (!data?.success) {
        setStatus(
          data?.error ||
          "Provisioning failed."
        );

        return;
      }

      const idElement =
        document.getElementById(
          "glimeProvisionId"
        );

      if (idElement) {
        idElement.textContent =
          "OmniDimension Agent ID: " +
          (
            data.provider_agent_id ||
            "created"
          );
      }

      setStatus(
        "OmniDimension Agent provisioned successfully. Phone number is still not connected."
      );

    } catch (error) {
      console.error(error);

      setStatus(
        error?.message ||
        "Unexpected provisioning error."
      );

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent =
          "Provision OmniDimension Agent";
      }
    }
  }

  /* ---------------------------------
     ADMIN HOOKS
  --------------------------------- */

  function attachHooks() {

    const fetchButton =
      document.getElementById(
        "fetchBtn"
      );

    if (
      fetchButton &&
      !fetchButton.dataset
        .glimeProvisionHooked
    ) {

      fetchButton.dataset
        .glimeProvisionHooked =
        "true";

      fetchButton.addEventListener(
        "click",
        () => {

          setTimeout(() => {

            const email =
              document.getElementById(
                "clientEmail"
              )?.value || "";

            loadAgent(email);

          }, 800);

        }
      );
    }

    const logoutButton =
      document.getElementById(
        "logoutBtn"
      );

    if (
      logoutButton &&
      !logoutButton.dataset
        .glimeProvisionHooked
    ) {

      logoutButton.dataset
        .glimeProvisionHooked =
        "true";

      logoutButton.addEventListener(
        "click",
        () => {

          currentAgentId = null;
          lastEmail = "";

          setVisible(false);

        }
      );
    }
  }

  /* ---------------------------------
     INIT
  --------------------------------- */

  function init() {

    if (!window.supabase) {
      console.error(
        "GLIME Provisioning: Supabase unavailable."
      );

      return;
    }

    injectStyles();

    render();

    attachHooks();

    setVisible(false);

    const observer =
      new MutationObserver(() => {

        attachHooks();

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
          email !== lastEmail
        ) {
          loadAgent(email);
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
