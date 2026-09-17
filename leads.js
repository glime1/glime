const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let clientId = null;
let allLeads = [];

const $ = (id) => document.getElementById(id);

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));

const fmtDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
};


/* =========================================================
   MESSAGE
========================================================= */

function showMessage(text, error = false) {
  const element = $("message");

  if (!element) return;

  element.textContent = text;
  element.classList.remove("hidden");

  element.style.color = error
    ? "#ffb4bc"
    : "#dffcff";

  setTimeout(() => {
    element.classList.add("hidden");
  }, 4500);
}


/* =========================================================
   AUTH + CLIENT
========================================================= */

async function requireClient() {

  const {
    data: { user },
    error: authError
  } = await db.auth.getUser();

  if (authError || !user) {
    window.location.href = "login.html";
    return false;
  }

  const {
    data,
    error
  } = await db
    .from("client_data")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.client_id) {
    throw new Error(
      "No client profile is linked to this account."
    );
  }

  clientId = data.client_id;

  if ($("clientBadge")) {
    $("clientBadge").textContent = clientId;
  }

  return true;
}


/* =========================================================
   STATS
========================================================= */

function updateStats() {

  if ($("statTotal")) {
    $("statTotal").textContent = allLeads.length;
  }

  if ($("statNew")) {
    $("statNew").textContent =
      allLeads.filter(
        (lead) => lead.status === "new"
      ).length;
  }

  if ($("statFollowup")) {

    const now = new Date();

    $("statFollowup").textContent =
      allLeads.filter((lead) => {

        if (!lead.next_follow_up_at) {
          return false;
        }

        const followupDate =
          new Date(lead.next_follow_up_at);

        return followupDate <= now &&
          !["won", "lost"].includes(lead.status);

      }).length;
  }

  if ($("statWon")) {
    $("statWon").textContent =
      allLeads.filter(
        (lead) => lead.status === "won"
      ).length;
  }
}


/* =========================================================
   FILTERING
========================================================= */

function filteredLeads() {

  const search =
    $("searchInput")?.value
      ?.trim()
      .toLowerCase() || "";

  const status =
    $("statusFilter")?.value || "";

  const source =
    $("sourceFilter")?.value || "";

  return allLeads.filter((lead) => {

    const searchableText = [
      lead.name,
      lead.mobile,
      lead.whatsapp,
      lead.interest,
      lead.product_service,
      lead.city_area,
      lead.notes
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !search ||
      searchableText.includes(search);

    const matchesStatus =
      !status ||
      lead.status === status;

    const matchesSource =
      !source ||
      lead.source === source;

    return (
      matchesSearch &&
      matchesStatus &&
      matchesSource
    );
  });
}


/* =========================================================
   RENDER LEADS
========================================================= */

function render() {

  const body = $("leadsBody");

  if (!body) return;

  const leads = filteredLeads();

  if (!leads.length) {

    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          No leads found.
        </td>
      </tr>
    `;

    updateStats();

    return;
  }

  body.innerHTML = leads
    .map((lead) => {

      const displayName =
        lead.name || "Unnamed";

      const phone =
        lead.mobile ||
        lead.whatsapp ||
        "No phone";

      const interest =
        lead.interest ||
        lead.product_service ||
        "—";

      return `
        <tr>

          <td>
            <div class="lead-name">
              ${esc(displayName)}
            </div>

            <div class="sub">
              ${esc(phone)}
            </div>
          </td>

          <td>

            ${esc(interest)}

            <div class="sub">
              ${esc(lead.city_area || "")}
            </div>

          </td>

          <td>
            <span class="pill">
              ${esc(lead.source || "offline")}
            </span>
          </td>

          <td>

            <span
              class="pill status-${esc(
                lead.status || "new"
              )}"
            >
              ${esc(lead.status || "new")}
            </span>

          </td>

          <td>

            <span class="pill">
              ${esc(lead.priority || "normal")}
            </span>

          </td>

          <td>
            ${fmtDate(lead.next_follow_up_at)}
          </td>

          <td>

            <button
              class="row-action"
              data-open="${esc(lead.id)}"
            >
              View
            </button>

          </td>

        </tr>
      `;
    })
    .join("");

  updateStats();
}


/* =========================================================
   LOAD LEADS
========================================================= */

async function loadLeads() {

  const body = $("leadsBody");

  if (body) {

    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          Loading…
        </td>
      </tr>
    `;
  }

  const {
    data,
    error
  } = await db
    .from("leads")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  allLeads = data || [];

  render();
}


/* =========================================================
   MODALS
========================================================= */

function openModal(id) {

  const element = $(id);

  if (!element) return;

  element.classList.remove("hidden");
}


function closeModal(id) {

  const element = $(id);

  if (!element) return;

  element.classList.add("hidden");
}


/* =========================================================
   CREATE OFFLINE LEAD
========================================================= */

async function createLead(event) {

  event.preventDefault();

  const form = event.target;

  const formData =
    new FormData(form);

  const clean = (value) =>
    String(value || "").trim();


  const payload = {

    client_id: clientId,

    name:
      clean(formData.get("name")),

    mobile:
      clean(formData.get("mobile")) ||
      null,

    whatsapp:
      clean(formData.get("whatsapp")) ||
      null,

    city_area:
      clean(formData.get("city_area")) ||
      null,

    interest:
      clean(formData.get("interest")) ||
      null,

    product_service:
      clean(formData.get("product_service")) ||
      null,

    budget:
      formData.get("budget")
        ? Number(formData.get("budget"))
        : null,

    priority:
      clean(formData.get("priority")) ||
      "normal",

    next_follow_up_at:
      formData.get("next_follow_up_at")
        ? new Date(
            formData.get("next_follow_up_at")
          ).toISOString()
        : null,

    notes:
      clean(formData.get("notes")) ||
      null,

    source: "offline"
  };


  /* ---------------------------------------------
     VALIDATION
  --------------------------------------------- */

  if (!payload.name) {

    showMessage(
      "Name is required.",
      true
    );

    return;
  }


  /* ---------------------------------------------
     CREATE LEAD
  --------------------------------------------- */

  const {
    data: lead,
    error
  } = await db
    .from("leads")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }


  /* ---------------------------------------------
     SOURCE RECORD
  --------------------------------------------- */

  const {
    error: sourceError
  } = await db
    .from("lead_sources")
    .insert({

      client_id: clientId,

      lead_id: lead.id,

      source_type: "offline",

      source_ref: null,

      metadata: {
        capture: "dashboard_offline"
      }

    });


  if (sourceError) {

    console.error(
      "Lead source creation failed:",
      sourceError
    );
  }


  /* ---------------------------------------------
     TIMELINE RECORD
  --------------------------------------------- */

  const {
    error: timelineError
  } = await db
    .from("lead_timeline")
    .insert({

      client_id: clientId,

      lead_id: lead.id,

      event_type: "lead_created",

      title: "Lead captured offline",

      description:
        "Lead added from the GLIME Leads dashboard.",

      source: "offline",

      metadata: {
        capture: "dashboard_offline"
      }

    });


  if (timelineError) {

    console.error(
      "Timeline creation failed:",
      timelineError
    );
  }


  /* ---------------------------------------------
     BASIC PROFILE
  --------------------------------------------- */

  const {
    error: profileError
  } = await db
    .from("lead_profiles")
    .insert({

      lead_id: lead.id,

      intent: "unknown",

      urgency: "unknown"

    });


  if (profileError) {

    console.error(
      "Lead profile creation failed:",
      profileError
    );
  }


  /* ---------------------------------------------
     RESET + REFRESH
  --------------------------------------------- */

  form.reset();

  closeModal("leadModal");

  await loadLeads();

  showMessage(
    "Lead saved successfully."
  );
}


/* =========================================================
   LEAD DETAIL
========================================================= */

async function openDetail(id) {

  const lead =
    allLeads.find(
      (item) => item.id === id
    );

  if (!lead) {
    return;
  }


  const detail =
    $("detailContent");

  if (!detail) {
    return;
  }


  detail.innerHTML = `

    <h2>
      ${esc(
        lead.name ||
        "Unnamed Lead"
      )}
    </h2>

    <p class="modal-subtitle">
      Lead details and activity timeline
    </p>


    <div class="detail-grid">

      ${[
        ["Mobile", lead.mobile],

        ["WhatsApp", lead.whatsapp],

        ["City / Area", lead.city_area],

        ["Interest", lead.interest],

        [
          "Product / Service",
          lead.product_service
        ],

        [
          "Budget",
          lead.budget
            ? `${lead.budget} ${
                lead.budget_currency ||
                "INR"
              }`
            : "—"
        ],

        ["Status", lead.status],

        ["Priority", lead.priority],

        ["Source", lead.source],

        [
          "Next follow-up",
          fmtDate(
            lead.next_follow_up_at
          )
        ],

        [
          "Last contacted",
          fmtDate(
            lead.last_contacted_at
          )
        ]

      ]
        .map(
          ([label, value]) => `

            <div class="detail-item">

              <small>
                ${esc(label)}
              </small>

              <strong>
                ${esc(value || "—")}
              </strong>

            </div>

          `
        )
        .join("")}


      <div class="detail-item full">

        <small>
          Notes
        </small>

        <strong>
          ${esc(
            lead.notes || "—"
          )}
        </strong>

      </div>

    </div>


    <div>

      <label>

        Status

        <select
          id="detailStatus"
          class="input"
        >

          <option value="new">
            New
          </option>

          <option value="contacted">
            Contacted
          </option>

          <option value="qualified">
            Qualified
          </option>

          <option value="proposal">
            Proposal
          </option>

          <option value="negotiation">
            Negotiation
          </option>

          <option value="won">
            Won
          </option>

          <option value="lost">
            Lost
          </option>

          <option value="paused">
            Paused
          </option>

        </select>

      </label>

    </div>


    <div class="form-actions">

      <button
        id="saveDetail"
        class="primary-btn"
      >
        Save status
      </button>

    </div>


    <h3>
      Timeline
    </h3>

    <div
      id="timelineBox"
      class="timeline"
    >
      Loading…
    </div>

  `;


  const statusSelect =
    $("detailStatus");

  if (statusSelect) {

    statusSelect.value =
      lead.status || "new";
  }


  openModal("detailModal");


  /* =====================================================
     LOAD TIMELINE
  ===================================================== */

  const {
    data: events,
    error
  } = await db
    .from("lead_timeline")
    .select("*")
    .eq("client_id", clientId)
    .eq("lead_id", id)
    .order("created_at", {
      ascending: false
    });


  const timeline =
    $("timelineBox");


  if (!timeline) {
    return;
  }


  if (error) {

    console.error(
      "Timeline error:",
      error
    );

    timeline.innerHTML = `
      <div class="sub">
        Timeline unavailable.
      </div>
    `;

  } else if (!events?.length) {

    timeline.innerHTML = `
      <div class="sub">
        No timeline events yet.
      </div>
    `;

  } else {

    timeline.innerHTML =
      events
        .map(
          (event) => `

            <div class="event">

              <strong>
                ${esc(event.title)}
              </strong>

              <div class="sub">

                ${fmtDate(
                  event.created_at
                )}

                ·

                ${esc(
                  event.source ||
                  "system"
                )}

              </div>

              <p>
                ${esc(
                  event.description ||
                  ""
                )}
              </p>

            </div>

          `
        )
        .join("");
  }


  /* =====================================================
     STATUS UPDATE
  ===================================================== */

  const saveButton =
    $("saveDetail");


  if (saveButton) {

    saveButton.onclick =
      async () => {

        const newStatus =
          $("detailStatus")?.value;


        if (!newStatus) {

          showMessage(
            "Please select a status.",
            true
          );

          return;
        }


        saveButton.disabled = true;

        saveButton.textContent =
          "Saving…";


        try {

          const {
            error: updateError
          } = await db
            .from("leads")
            .update({
              status: newStatus
            })
            .eq("id", id)
            .eq(
              "client_id",
              clientId
            );


          if (updateError) {
            throw updateError;
          }


          /* -----------------------------------------
             TIMELINE EVENT
          ----------------------------------------- */

          const {
            error: timelineError
          } = await db
            .from("lead_timeline")
            .insert({

              client_id: clientId,

              lead_id: id,

              event_type:
                "status_changed",

              title:
                `Status changed to ${newStatus}`,

              description:
                "Status updated from the GLIME Leads dashboard.",

              source: "dashboard",

              metadata: {
                status: newStatus
              }

            });


          if (timelineError) {

            console.error(
              "Status timeline error:",
              timelineError
            );
          }


          closeModal(
            "detailModal"
          );

          await loadLeads();

          showMessage(
            "Lead updated."
          );

        } catch (error) {

          console.error(
            error
          );

          showMessage(
            error.message ||
            "Could not update lead.",
            true
          );

        } finally {

          saveButton.disabled =
            false;

          saveButton.textContent =
            "Save status";
        }
      };
  }
}


/* =========================================================
   EVENT LISTENERS
========================================================= */


/* Search */

if ($("searchInput")) {

  $("searchInput")
    .addEventListener(
      "input",
      render
    );
}


/* Status filter */

if ($("statusFilter")) {

  $("statusFilter")
    .addEventListener(
      "change",
      render
    );
}


/* Source filter */

if ($("sourceFilter")) {

  $("sourceFilter")
    .addEventListener(
      "change",
      render
    );
}


/* Refresh */

if ($("refreshBtn")) {

  $("refreshBtn").onclick =
    async () => {

      try {

        await loadLeads();

        showMessage(
          "Leads refreshed."
        );

      } catch (error) {

        console.error(error);

        showMessage(
          error.message ||
          "Could not refresh leads.",
          true
        );
      }
    };
}


/* Add Lead */

if ($("addLeadBtn")) {

  $("addLeadBtn").onclick =
    () => {

      openModal(
        "leadModal"
      );
    };
}


/* Lead Form */

if ($("leadForm")) {

  $("leadForm")
    .addEventListener(
      "submit",
      async (event) => {

        try {

          await createLead(
            event
          );

        } catch (error) {

          console.error(error);

          showMessage(
            error.message ||
            "Could not save lead.",
            true
          );
        }
      }
    );
}


/* =========================================================
   GLOBAL CLICK HANDLER
========================================================= */

document.addEventListener(
  "click",
  (event) => {

    /* View Lead */

    const openButton =
      event.target.closest(
        "[data-open]"
      );

    if (openButton) {

      const id =
        openButton.dataset.open;

      openDetail(id)
        .catch((error) => {

          console.error(error);

          showMessage(
            error.message ||
            "Could not open lead.",
            true
          );
        });

      return;
    }


    /* Close Modal */

    const closeButton =
      event.target.closest(
        "[data-close]"
      );

    if (closeButton) {

      closeModal(
        closeButton.dataset.close
      );
    }
  }
);


/* =========================================================
   LOGOUT
========================================================= */

if ($("logoutBtn")) {

  $("logoutBtn").onclick =
    async () => {

      try {

        await db.auth.signOut();

      } finally {

        window.location.href =
          "login.html";
      }
    };
}


/* =========================================================
   INITIALIZATION
========================================================= */

(async function initLeadsPage() {

  try {

    const authenticated =
      await requireClient();

    if (authenticated) {

      await loadLeads();
    }

  } catch (error) {

    console.error(
      "Leads initialization error:",
      error
    );

    showMessage(
      error.message ||
      "Could not load Leads.",
      true
    );

  } finally {

    const loading =
      $("loadingScreen");

    if (loading) {

      loading.classList.add(
        "hidden"
      );
    }
  }

})();
