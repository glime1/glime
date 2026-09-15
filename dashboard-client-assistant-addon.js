/*
 * GLIME — Client Data Assistant
 * Dashboard Addon
 *
 * Shows the assistant only when:
 *
 * 1. Client is logged in
 * 2. Client has a valid client_data record
 * 3. Client Data Assistant module exists
 * 4. Admin has activated the module
 * 5. Module is visible to the client
 * 6. Module is not expired
 */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const MODULE_SLUG =
    "client_data_assistant";

  const ASSISTANT_PAGE =
    "client-assistant.html";

  let db = null;

  function getDB() {
    if (!window.supabase) {
      console.error(
        "GLIME: Supabase JS is not loaded."
      );
      return null;
    }

    if (!db) {
      db = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );
    }

    return db;
  }

  async function getSession() {
    const supabase = getDB();

    if (!supabase) return null;

    const { data, error } =
      await supabase.auth.getSession();

    if (error) {
      console.error(
        "GLIME Assistant session error:",
        error
      );
      return null;
    }

    return data?.session || null;
  }

  async function getLoggedInClient() {
    const supabase = getDB();

    const session =
      await getSession();

    if (!session?.user?.id) {
      return null;
    }

    /*
     * IMPORTANT:
     *
     * client_id is resolved from
     * authenticated user's ID.
     *
     * We do NOT accept client_id
     * from URL, localStorage,
     * query parameters or user input.
     */

    const { data, error } =
      await supabase
        .from("client_data")
        .select(
          "id,client_id,client_name,full_name,name,email,project_name,auth_user_id"
        )
        .eq(
          "auth_user_id",
          session.user.id
        )
        .maybeSingle();

    if (error) {
      console.error(
        "GLIME Assistant client lookup error:",
        error
      );
      return null;
    }

    return data || null;
  }

  async function getModule() {
    const supabase = getDB();

    const { data, error } =
      await supabase
        .from("modules")
        .select(
          "id,name,slug"
        )
        .eq(
          "slug",
          MODULE_SLUG
        )
        .maybeSingle();

    if (error) {
      console.error(
        "GLIME Assistant module error:",
        error
      );
      return null;
    }

    return data || null;
  }

  async function getAccess(
    clientId,
    moduleId
  ) {
    const supabase = getDB();

    const { data, error } =
      await supabase
        .from("client_modules")
        .select(
          "id,client_id,module_id,enabled,visible_to_client,status,plan,activated_at,expires_at"
        )
        .eq(
          "client_id",
          clientId
        )
        .eq(
          "module_id",
          moduleId
        )
        .maybeSingle();

    if (error) {
      console.error(
        "GLIME Assistant access error:",
        error
      );
      return null;
    }

    return data || null;
  }

  function hasAccess(
    access
  ) {
    if (!access) {
      return false;
    }

    if (
      access.enabled !== true
    ) {
      return false;
    }

    if (
      access.visible_to_client !==
      true
    ) {
      return false;
    }

    const status =
      String(
        access.status || ""
      ).toLowerCase();

    if (
      status !== "active" &&
      status !== "trial"
    ) {
      return false;
    }

    if (
      access.expires_at
    ) {
      const expiry =
        new Date(
          access.expires_at
        );

      if (
        !Number.isNaN(
          expiry.getTime()
        ) &&
        expiry.getTime() <=
          Date.now()
      ) {
        return false;
      }
    }

    return true;
  }

  function findNavigation() {
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

    for (
      const selector of selectors
    ) {
      const element =
        document.querySelector(
          selector
        );

      if (element) {
        return element;
      }
    }

    return null;
  }

  function addNavigationLink() {
    if (
      document.querySelector(
        '[data-glime-client-assistant="true"]'
      )
    ) {
      return;
    }

    const nav =
      findNavigation();

    if (!nav) {
      console.warn(
        "GLIME Assistant: dashboard navigation not found."
      );
      return;
    }

    const link =
      document.createElement(
        "a"
      );

    link.href =
      ASSISTANT_PAGE;

    link.textContent =
      "✦ Client Data Assistant";

    link.setAttribute(
      "data-glime-client-assistant",
      "true"
    );

    link.style.textDecoration =
      "none";

    link.style.cursor =
      "pointer";

    nav.appendChild(
      link
    );
  }

  async function initialize() {
    try {
      const session =
        await getSession();

      if (!session?.user) {
        return;
      }

      const client =
        await getLoggedInClient();

      if (
        !client?.client_id
      ) {
        return;
      }

      const module =
        await getModule();

      if (!module?.id) {
        return;
      }

      const access =
        await getAccess(
          client.client_id,
          module.id
        );

      /*
       * Admin ने activate नहीं किया
       * तो client को module नहीं दिखेगा।
       */

      if (
        !hasAccess(access)
      ) {
        return;
      }

      addNavigationLink();

      console.log(
        "GLIME Client Data Assistant available for client:",
        client.client_id
      );

    } catch (error) {
      console.error(
        "GLIME Client Assistant initialization failed:",
        error
      );
    }
  }

  window.GLIMEClientAssistantDashboard = {
    init: initialize,
    getClient:
      getLoggedInClient,
    getModule,
    getAccess,
    hasAccess
  };

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

})();
