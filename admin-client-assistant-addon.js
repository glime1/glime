/*
 * GLIME — Client Data Assistant
 * Admin Activation Addon
 */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const MODULE_SLUG =
    "client_data_assistant";

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
        "GLIME Admin Assistant session error:",
        error
      );
      return null;
    }

    return data?.session || null;
  }

  async function verifyAdmin() {
    const session =
      await getSession();

    if (!session?.user) {
      throw new Error(
        "Admin login required."
      );
    }

    const email =
      String(
        session.user.email || ""
      ).toLowerCase();

    if (
      email !==
      "admin@glime.online"
    ) {
      throw new Error(
        "Admin authorization required."
      );
    }

    return true;
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
      throw error;
    }

    return data;
  }

  async function getClient(clientId) {
    const supabase = getDB();

    const { data, error } =
      await supabase
        .from("client_data")
        .select(
          "id,client_id,client_name,full_name,name,email,project_name,auth_user_id"
        )
        .eq(
          "client_id",
          clientId
        )
        .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async function getStatus(clientId) {
    await verifyAdmin();

    const supabase = getDB();

    const module =
      await getModule();

    if (!module) {
      throw new Error(
        "Client Data Assistant module not found."
      );
    }

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
          module.id
        )
        .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  async function activate(
    clientId,
    options = {}
  ) {
    await verifyAdmin();

    const supabase = getDB();

    const module =
      await getModule();

    if (!module) {
      throw new Error(
        "Client Data Assistant module not found."
      );
    }

    const client =
      await getClient(clientId);

    if (!client) {
      throw new Error(
        "Client not found."
      );
    }

    const now =
      new Date().toISOString();

    const payload = {
      client_id:
        client.client_id,

      module_id:
        module.id,

      enabled:
        true,

      visible_to_client:
        options.visible_to_client !==
        undefined
          ? Boolean(
              options.visible_to_client
            )
          : true,

      status:
        "active",

      plan:
        options.plan ||
        "standard",

      activated_at:
        options.activated_at ||
        now,

      expires_at:
        options.expires_at ??
        null
    };

    const { data, error } =
      await supabase
        .from("client_modules")
        .upsert(
          payload,
          {
            onConflict:
              "client_id,module_id"
          }
        )
        .select()
        .single();

    if (error) {
      throw error;
    }

    console.log(
      "GLIME Client Data Assistant activated:",
      client.client_id
    );

    return data;
  }

  async function deactivate(
    clientId
  ) {
    await verifyAdmin();

    const supabase = getDB();

    const module =
      await getModule();

    if (!module) {
      throw new Error(
        "Client Data Assistant module not found."
      );
    }

    const { data, error } =
      await supabase
        .from("client_modules")
        .update({
          enabled: false,
          visible_to_client: false,
          status: "inactive"
        })
        .eq(
          "client_id",
          clientId
        )
        .eq(
          "module_id",
          module.id
        )
        .select()
        .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  /*
   * Public API
   *
   * Examples:
   *
   * GLIMEClientAssistantAdmin.activate("CLIENT_ID");
   *
   * GLIMEClientAssistantAdmin.deactivate("CLIENT_ID");
   *
   * GLIMEClientAssistantAdmin.status("CLIENT_ID");
   */

  window.GLIMEClientAssistantAdmin = {
    activate,
    deactivate,
    status: getStatus,
    getModule
  };

  console.log(
    "GLIME Client Data Assistant — Admin addon loaded."
  );

})();
