/*
 * GLIME — Client Data Assistant
 * Admin Activation Addon
 *
 * Purpose:
 * - Admin can activate/deactivate Client Data Assistant for a client.
 * - Uses existing `client_modules` + `modules` architecture.
 * - Does NOT modify the core admin system.
 *
 * IMPORTANT:
 * - Supabase RLS remains the real security boundary.
 * - Never put the Supabase service-role key in this file.
 */

(() => {
  "use strict";

  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";

  // Use your existing GLIME publishable/anon key here.
  // Do NOT use the service-role key.
  const SUPABASE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";

  const MODULE_SLUG = "client_data_assistant";

  let supabaseClient = null;

  function loadSupabase() {
    if (typeof window.supabase === "undefined") {
      console.error("GLIME: Supabase JS is not loaded.");
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

  async function getCurrentSession() {
    const supabase = loadSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("GLIME Admin Assistant: session error", error);
      return null;
    }

    return data?.session || null;
  }

  async function verifyAdmin() {
    const supabase = loadSupabase();
    if (!supabase) return false;

    const session = await getCurrentSession();

    if (!session?.user) {
      console.warn("GLIME Admin Assistant: no authenticated user.");
      return false;
    }

    /*
     * Frontend check only.
     * Actual write authorization is enforced by Supabase RLS.
     */
    const email = (session.user.email || "").toLowerCase();

    if (email !== "admin@glime.online") {
      console.warn("GLIME Admin Assistant: admin access required.");
      return false;
    }

    return true;
  }

  async function getModule() {
    const supabase = loadSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("modules")
      .select("id,name,slug")
      .eq("slug", MODULE_SLUG)
      .maybeSingle();

    if (error) {
      console.error("GLIME Admin Assistant: module lookup failed", error);
      return null;
    }

    return data || null;
  }

  async function getClientById(clientId) {
    const supabase = loadSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("client_data")
      .select(
        "id,client_id,client_name,full_name,name,email,project_name,auth_user_id"
      )
      .eq("client_id", clientId)
      .maybeSingle();

    if (error) {
      console.error("GLIME Admin Assistant: client lookup failed", error);
      return null;
    }

    return data || null;
  }

  async function getActivation(clientId, moduleId) {
    const supabase = loadSupabase();
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
        "GLIME Admin Assistant: activation lookup failed",
        error
      );
      return null;
    }

    return data || null;
  }

  async function setClientAssistant(
    clientId,
    enabled = true,
    options = {}
  ) {
    const allowed = await verifyAdmin();

    if (!allowed) {
      throw new Error("Admin authorization required.");
    }

    const supabase = loadSupabase();

    const module = await getModule();

    if (!module) {
      throw new Error(
        "Client Data Assistant module is not registered in modules table."
      );
    }

    const client = await getClientById(clientId);

    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    const now = new Date().toISOString();

    const payload = {
      client_id: client.client_id,
      module_id: module.id,
      enabled: Boolean(enabled),
      visible_to_client:
        options.visible_to_client !== undefined
          ? Boolean(options.visible_to_client)
          : Boolean(enabled),
      status: enabled ? "active" : "inactive",
      plan: options.plan || "standard",
      activated_at: enabled
        ? options.activated_at || now
        : null,
      expires_at:
        options.expires_at !== undefined
          ? options.expires_at
          : null
    };

    const { data, error } = await supabase
      .from("client_modules")
      .upsert(payload, {
        onConflict: "client_id,module_id"
      })
      .select()
      .single();

    if (error) {
      console.error(
        "GLIME Admin Assistant: activation update failed",
        error
      );
      throw new Error(error.message);
    }

    return data;
  }

  async function activateClientAssistant(clientId, options = {}) {
    return setClientAssistant(clientId, true, options);
  }

  async function deactivateClientAssistant(clientId) {
    return setClientAssistant(clientId, false);
  }

  async function getClientAssistantStatus(clientId) {
    const allowed = await verifyAdmin();

    if (!allowed) {
      throw new Error("Admin authorization required.");
    }

    const module = await getModule();

    if (!module) {
      throw new Error("Client Data Assistant module not found.");
    }

    return getActivation(clientId, module.id);
  }

  /*
   * Public addon API
   *
   * Example:
   *
   * GLIMEClientAssistantAdmin.activate("CLIENT_ID");
   * GLIMEClientAssistantAdmin.deactivate("CLIENT_ID");
   * GLIMEClientAssistantAdmin.status("CLIENT_ID");
   */
  window.GLIMEClientAssistantAdmin = {
    activate: activateClientAssistant,
    deactivate: deactivateClientAssistant,
    status: getClientAssistantStatus,
    getModule
  };

  console.log(
    "GLIME Client Data Assistant — Admin addon loaded."
  );
})();
