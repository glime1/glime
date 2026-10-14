/* =========================================================
   GLIME LEADS — DATA LAYER
   ---------------------------------------------------------
   Yeh file Leads page ki EKLAUTI jagah hai jahan Supabase se
   baat hoti hai. leads.js (UI) kabhi seedha Supabase ko nahi
   chhoota. Backend badalne par sirf is file ko badalna hoga,
   UI (leads.js / leads.css / leads.html) ko nahi.

   UI ko milne wala normalized lead (contract):
     id, name, phone, status, priority, source (instagram |
     whatsapp | website | offline | voice | lookbook | other |
     unknown), interest, product_service, city_area, budget,
     notes, next_follow_up_at, last_contacted_at,
     last_activity_at, created_at, customer_id,
     score (0-100 ya null — sirf tab dikhta hai jab backend de)

   Optional config (backend ready hone par page se pehle set
   karein): window.GLIME_LEADS_CONFIG = { ... }
========================================================= */
(() => {
  "use strict";

  const CFG = Object.assign(
    {
      supabaseUrl: "https://ufoulgbiqgjriwapuopc.supabase.co",
      supabaseKey: "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA",
      pageSize: 1000,
      maxRows: 5000,
      loginUrl: "login.html"
    },
    window.GLIME_LEADS_CONFIG || {}
  );

  if (!window.supabase) {
    console.error("[GLIME Leads] Supabase library not loaded.");
    return;
  }

  const db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
  let clientId = null;

  /* ---------- helpers ---------- */

  function normSource(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s || s === "unknown") return "unknown";
    if (/insta|^ig$/.test(s)) return "instagram";
    if (/whats|^wa$/.test(s)) return "whatsapp";
    if (/web|site|form|landing/.test(s)) return "website";
    if (s === "offline") return "offline";
    if (/voice|call/.test(s)) return "voice";
    if (/lookbook/.test(s)) return "lookbook";
    return "other";
  }

  function latest(values) {
    let best = null;
    values.forEach((v) => {
      if (!v) return;
      const t = new Date(v).getTime();
      if (Number.isNaN(t)) return;
      if (best === null || t > best) best = t;
    });
    return best === null ? null : new Date(best).toISOString();
  }

  function normalizeLead(r) {
    const rawScore = r.score ?? r.lead_score ?? null;
    const score =
      rawScore !== null && rawScore !== "" && Number.isFinite(Number(rawScore))
        ? Math.max(0, Math.min(100, Number(rawScore)))
        : null;

    return Object.assign({}, r, {
      name: String(r.name || "").trim(),
      status: String(r.status || "new").toLowerCase(),
      priority: String(r.priority || "normal").toLowerCase(),
      source: normSource(r.source),
      source_raw: r.source || null,
      phone: r.mobile || r.whatsapp || "",
      score,
      last_activity_at: latest([
        r.last_activity_at,
        r.last_contacted_at,
        r.updated_at,
        r.created_at
      ])
    });
  }

  /* ---------- auth / client ---------- */

  async function ensureClient() {
    if (clientId) return clientId;

    const {
      data: { user },
      error: authError
    } = await db.auth.getUser();

    if (authError || !user) {
      window.location.href = CFG.loginUrl;
      return null;
    }

    const { data, error } = await db
      .from("client_data")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data?.client_id) {
      throw new Error("No client profile is linked to this account.");
    }

    clientId = data.client_id;
    return clientId;
  }

  async function logTimeline(leadId, type, title, description, metadata) {
    const { error } = await db.from("lead_timeline").insert({
      client_id: clientId,
      lead_id: leadId,
      event_type: type,
      title,
      description,
      source: "dashboard",
      metadata: metadata || {}
    });
    if (error) console.error("[GLIME Leads] timeline insert failed:", error);
  }

  /* ---------- leads ---------- */

  async function fetchLeads() {
    await ensureClient();
    let all = [];

    for (let from = 0; from < CFG.maxRows; from += CFG.pageSize) {
      const { data, error } = await db
        .from("leads")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .range(from, from + CFG.pageSize - 1);

      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < CFG.pageSize) break;
    }

    return all.map(normalizeLead);
  }

  async function updateLead(id, patch) {
    await ensureClient();
    const { data, error } = await db
      .from("leads")
      .update(patch)
      .eq("id", id)
      .eq("client_id", clientId)
      .select("*")
      .single();

    if (error) throw error;
    if (!data) throw new Error("Lead was not saved. Please refresh and try again.");
    return normalizeLead(data);
  }

  async function setStatus(id, status) {
    const lead = await updateLead(id, { status });
    await logTimeline(
      id,
      "status_changed",
      `Status changed to ${status}`,
      "Status updated from the Leads dashboard.",
      { status }
    );
    return lead;
  }

  async function setFollowUp(id, iso) {
    const lead = await updateLead(id, { next_follow_up_at: iso || null });
    await logTimeline(
      id,
      "follow_up",
      iso ? "Follow-up scheduled" : "Follow-up cleared",
      iso
        ? `Next follow-up set for ${new Date(iso).toLocaleString("en-IN")}.`
        : "Next follow-up date was removed.",
      { next_follow_up_at: iso || null }
    );
    return lead;
  }

  async function addNote(id, text) {
    await ensureClient();
    const { data, error } = await db
      .from("lead_timeline")
      .insert({
        client_id: clientId,
        lead_id: id,
        event_type: "note_added",
        title: "Note added",
        description: text,
        source: "dashboard",
        metadata: {}
      })
      .select("id,event_type,title,description,source,metadata,created_at")
      .single();

    if (error) throw error;
    return data;
  }

  async function createLead(payload, customValues) {
    await ensureClient();
    const warnings = [];

    const { data: row, error } = await db
      .from("leads")
      .insert(Object.assign({}, payload, { client_id: clientId, source: "offline" }))
      .select("*")
      .single();

    if (error) throw error;

    const sub = await db.from("lead_sources").insert({
      client_id: clientId,
      lead_id: row.id,
      source_type: "offline",
      source_ref: null,
      metadata: { capture: "dashboard_offline" }
    });
    if (sub.error) console.error("[GLIME Leads] lead_sources failed:", sub.error);

    await logTimeline(
      row.id,
      "lead_created",
      "Lead captured offline",
      "Lead added from the GLIME Leads dashboard.",
      { capture: "dashboard_offline" }
    );

    const prof = await db
      .from("lead_profiles")
      .insert({ lead_id: row.id, intent: "unknown", urgency: "unknown" });
    if (prof.error) console.error("[GLIME Leads] lead_profiles failed:", prof.error);

    if (customValues && customValues.length) {
      const { error: cvError } = await db.from("lead_custom_field_values").upsert(
        customValues.map((v) => ({
          lead_id: row.id,
          field_definition_id: v.field_definition_id,
          value: v.value
        })),
        { onConflict: "lead_id,field_definition_id" }
      );
      if (cvError) {
        console.error("[GLIME Leads] custom values failed:", cvError);
        warnings.push("Lead saved, but custom fields could not be saved.");
      }
    }

    return { lead: normalizeLead(row), warnings };
  }

  async function deleteLead(id) {
    await ensureClient();
    const { error } = await db
      .from("leads")
      .delete()
      .eq("id", id)
      .eq("client_id", clientId);
    if (error) throw error;
  }

  /* ---------- custom fields ---------- */

  async function fetchCustomFields() {
    await ensureClient();
    const { data, error } = await db
      .from("lead_custom_field_definitions")
      .select("*")
      .eq("client_id", clientId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function createCustomField(def) {
    await ensureClient();
    const { error } = await db
      .from("lead_custom_field_definitions")
      .insert(Object.assign({}, def, { client_id: clientId, is_active: true }));
    if (error) throw error;
  }

  async function toggleCustomField(id, active) {
    await ensureClient();
    const { error } = await db
      .from("lead_custom_field_definitions")
      .update({ is_active: !!active })
      .eq("id", id)
      .eq("client_id", clientId);
    if (error) throw error;
  }

  /* ---------- side-panel extras ---------- */

  async function fetchOrders(lead) {
    const digits = String(lead.mobile || lead.whatsapp || "").replace(/\D/g, "");
    if (!lead.customer_id && !digits) return [];

    const { data, error } = await db.rpc("get_orders", {
      p_status: null,
      p_source_channel: null,
      p_payment_status: null,
      p_fulfillment_status: null,
      p_search: digits ? digits.slice(-10) : null,
      p_limit: 50,
      p_offset: 0
    });

    if (error) throw error;

    const rows = Array.isArray(data)
      ? data
      : data?.orders || data?.items || data?.rows || data?.data || [];

    return rows.filter(
      (o) =>
        o &&
        (o.lead_id === lead.id ||
          (lead.customer_id && o.customer_id === lead.customer_id))
    );
  }

  async function fetchLeadExtras(lead) {
    const cid = await ensureClient();

    const [tl, act, cv, cust, ord] = await Promise.allSettled([
      db
        .from("lead_timeline")
        .select("id,event_type,title,description,source,metadata,created_at")
        .eq("client_id", cid)
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("lead_actions")
        .select("id,action_type,status,reason,scheduled_for,created_at")
        .eq("client_id", cid)
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(10),
      db
        .from("lead_custom_field_values")
        .select("field_definition_id,value")
        .eq("lead_id", lead.id),
      lead.customer_id
        ? db.from("customers").select("*").eq("id", lead.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      fetchOrders(lead)
    ]);

    const rows = (r) =>
      r.status === "fulfilled" && !r.value?.error ? r.value.data || [] : null;

    return {
      timeline: rows(tl),
      actions: rows(act),
      values: rows(cv),
      customer:
        cust.status === "fulfilled" && !cust.value?.error ? cust.value.data : null,
      orders: ord.status === "fulfilled" ? ord.value : null
    };
  }

  window.GlimeLeadsData = {
    config: CFG,
    db,
    ensureClient,
    clientId: () => clientId,
    normSource,
    normalizeLead,
    fetchLeads,
    setStatus,
    setFollowUp,
    addNote,
    createLead,
    deleteLead,
    fetchCustomFields,
    createCustomField,
    toggleCustomField,
    fetchLeadExtras
  };
})();
