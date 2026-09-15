/*
 * GLIME — Client Data Assistant
 * Dashboard Addon
 *
 * Purpose:
 * - Detect currently logged-in client.
 * - Resolve client_id from authenticated user.
 * - Check client_modules activation.
 * - Show Client Data Assistant only when activated.
 *
 * SECURITY:
 * - client_id is NEVER taken from URL/localStorage/user input.
 * - It is resolved from Supabase Auth -> client_data.auth_user_id.
 * - Backend Edge Function performs its own authorization again.
 */

(() => {
  "use strict";

  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";

  // Use your existing GLIME publishable/anon key.
  // NEVER use the service-role key here.
  const SUPABASE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";

  const MODULE_SLUG = "client_data_assistant";

  const ASSISTANT_PAGE = "client-assistant.html";

  let supabaseClient = null;

  function getSupabase() {
    if (typeof window.supabase === "undefined") {
      console.error(
        "GLIME Client Assistant: Supabase JS is not loaded."
      );
      return null;
    }

    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );
    }

    return supabaseClient;
  }

  async function getSession() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error(
        "GLIME Client Assistant: session error",
        error
      );
      return null;
    }

    return data?.session || null;
  }

  async function getClient() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const session = await getSession();

    if (!session?.user?.id) {
      return null;
    }

    /*
     * IMPORTANT:
     * We resolve client_id from auth_user_id.
     *
     * We do NOT use:
     * - URL client_id
     * - localStorage client_id
     * - user-provided client_id
     */

    const { data, error } = await supabase
      .from("client_data")
      .select(
        "id,client_id,client_name,full_name,name,email,project_name,auth_user_id"
      )
      .eq("auth_user_id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error(
        "GLIME Client Assistant: client lookup failed",
        error
      );
      return null;
    }

    return data || null;
  }

  async function getModule() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("modules")
      .select("id,name,slug")
      .eq("slug", MODULE_SLUG)
      .maybeSingle();

    if (error) {
      console.error(
        "GLIME Client Assistant: module lookup failed",
        error
      );
      return null;
    }

    return data || null;
  }

  async function getModuleAccess(clientId, moduleId) {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("client_modules")
      .select(
        "id,client_id,module_id,enabled,visible_to_client,status,plan,activated_at,expires_at"
      )
      .eq("client_id", clientId)
      .eq("module_id", moduleId)
      .maybeSingle();

    if (error) {
      console.error(
        "GLIME Client Assistant: module access lookup failed",
        error
      );
      return null;
    }

    return data || null;
  }

  function isAccessActive(moduleAccess) {
    if (!moduleAccess) {
      return false;
    }

    if (moduleAccess.enabled !== true) {
      return false;
    }

    if (moduleAccess.visible_to_client !== true) {
      return false;
    }

    const status = String(
      moduleAccess.status || ""
    ).toLowerCase();

    if (
      status !== "active" &&
      status !== "trial"
    ) {
      return false;
    }

    if (moduleAccess.expires_at) {
      const expiry = new Date(moduleAccess.expires_at);

      if (
        !Number.isNaN(expiry.getTime()) &&
        expiry.getTime() <= Date.now()
      ) {
        return false;
      }
    }

    return true;
  }

  function createAssistantLink() {
    const existing = document.querySelector(
      '[data-glime-client-assistant="true"]'
    );

    if (existing) {
      return existing;
    }

    const link = document.createElement("a");

    link.href = ASSISTANT_PAGE;

    link.textContent = "Client Data Assistant";

    link.setAttribute(
      "data-glime-client-assistant",
      "true"
    );

    link.setAttribute(
      "aria-label",
      "Open GLIME Client Data Assistant"
    );

    /*
     * Generic styling so this addon does not depend
     * on a particular dashboard CSS structure.
     *
     * Existing dashboard styles can override these.
     */
    link.style.display = "inline-flex";
    link.style.alignItems = "center";
    link.style.gap = "8px";
    link.style.textDecoration = "none";
    link.style.cursor = "pointer";

    const icon = document.createElement("span");
    icon.textContent = "✦";
    icon.setAttribute("aria-hidden", "true");

    link.prepend(icon);

    return link;
  }

  function findDashboardNavigation() {
    const selectors = [
      "nav",
      ".sidebar",
      ".side-nav",
      ".sidebar-nav",
      ".dashboard-nav",
      ".nav-links",
      ".menu",
      ".navigation"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element) {
        return element;
      }
    }

    return null;
  }

  function injectAssistantLink() {
    const nav = findDashboardNavigation();

    if (!nav) {
      console.warn(
        "GLIME Client Assistant: dashboard navigation not found."
      );
      return false;
    }

    const link = createAssistantLink();

    nav.appendChild(link);

    return true;
  }

  function createFloatingAssistantButton() {
    const existing = document.querySelector(
      '[data-glime-client-assistant-float="true"]'
    );

    if (existing) {
      return existing;
    }

    const button = document.createElement("a");

    button.href = ASSISTANT_PAGE;

    button.textContent = "✦ AI Assistant";

    button.setAttribute(
      "data-glime-client-assistant-float",
      "true"
    );

    button.setAttribute(
      "aria-label",
      "Open GLIME Client Data Assistant"
    );

    button.style.position = "fixed";
    button.style.right = "20px";
    button.style.bottom = "20px";
    button.style.zIndex = "9999";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.gap = "8px";
    button.style.padding = "12px 16px";
    button.style.borderRadius = "14px";
    button.style.textDecoration = "none";
    button.style.fontWeight = "700";
    button.style.fontFamily = "inherit";
    button.style.background = "#101b29";
    button.style.color = "#52e8ff";
    button.style.border = "1px solid rgba(82,232,255,.35)";
    button.style.boxShadow =
      "0 10px 30px rgba(0,0,0,.25)";

    return button;
  }

  function injectFloatingButton() {
    const button = createFloatingAssistantButton();

    if (!button.isConnected) {
      document.body.appendChild(button);
    }

    return true;
  }

  async function initialize() {
    try {
      const session = await getSession();

      if (!session?.user) {
        /*
         * No logged-in user.
         * Do nothing.
         */
        return;
      }

      const client = await getClient();

      if (!client?.client_id) {
        console.warn(
          "GLIME Client Assistant: authenticated user has no client record."
        );
        return;
      }

      const module = await getModule();

      if (!module?.id) {
        console.warn(
          "GLIME Client Assistant: module is not registered."
        );
        return;
      }

      const access = await getModuleAccess(
        client.client_id,
        module.id
      );

      /*
       * If admin has not activated the module:
       * absolutely nothing is shown.
       */
      if (!isAccessActive(access)) {
        return;
      }

      /*
       * Module is active for this client.
       */
      injectAssistantLink();

      /*
       * Optional floating button.
       *
       * If you don't want it, comment out the next line.
       */
      injectFloatingButton();

      console.log(
        "GLIME Client Data Assistant enabled for:",
        client.client_id
      );
    } catch (error) {
      console.error(
        "GLIME Client Assistant initialization failed:",
        error
      );
    }
  }

  /*
   * Expose a small API for debugging/admin integration.
   */
  window.GLIMEClientAssistantDashboard = {
    init: initialize,
    getClient,
    getModule,
    getModuleAccess,
    isAccessActive
  };

  /*
   * Wait until dashboard DOM is ready.
   */
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
