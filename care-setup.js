const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
const SUPABASE_KEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = (id) => document.getElementById(id);

let session = null;

function value(id) {
  return $(id).value.trim();
}

function updateReview() {
  $("review").innerHTML = `
    <b>Family:</b> ${value("familyName") || "—"}<br>
    <b>Member:</b> ${value("name") || "—"} ·
    ${value("relationship") || "—"} ·
    ${$("role").value}<br>
    <b>DOB:</b> ${$("dob").value || "—"} ·
    <b>Gender:</b> ${value("gender") || "—"}<br>
    <b>Emergency:</b>
    ${$("emergency").checked ? "Yes" : "No"} ·
    <b>Caregiver:</b>
    ${$("caregiver").checked ? "Yes" : "No"}
  `;
}

document
  .querySelectorAll("input, select")
  .forEach((element) => {
    element.addEventListener("input", updateReview);
    element.addEventListener("change", updateReview);
  });

async function boot() {
  const { data, error } = await db.auth.getSession();

  if (error || !data.session) {
    $("badge").textContent = "Login required";
    $("save").disabled = true;
    return;
  }

  session = data.session;

  $("badge").textContent =
    `Logged in · ${session.user.email || ""}`;

  $("email").value =
    session.user.email || "";

  $("name").value =
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    "";

  updateReview();
}

async function saveSetup(event) {
  event.preventDefault();

  if (!session) {
    $("status").textContent =
      "Login required.";
    return;
  }

  const saveButton = $("save");

  saveButton.disabled = true;
  $("status").textContent = "Saving…";

  try {

    /*
     * 1. Create / get existing CARE family
     */
    const {
      data: familyData,
      error: familyError
    } = await db.rpc(
      "care_get_or_create_family",
      {
        p_name: value("familyName")
      }
    );

    if (familyError) {
      throw familyError;
    }

    const family =
      familyData?.[0] || familyData;

    if (!family?.id) {
      throw new Error(
        "Family could not be created."
      );
    }

    /*
     * 2. Update family timezone
     */
    const {
      error: familyUpdateError
    } = await db
      .from("care_families")
      .update({
        name: value("familyName"),
        timezone: $("timezone").value
      })
      .eq("id", family.id);

    if (familyUpdateError) {
      throw familyUpdateError;
    }

    /*
     * 3. Get active CARE profile
     */
    const {
      data: careProfile,
      error: profileError
    } = await db
      .from("care_profiles")
      .select("id")
      .eq(
        "auth_user_id",
        session.user.id
      )
      .eq("status", "active")
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!careProfile) {
      throw new Error(
        "Active CARE profile not found."
      );
    }

    /*
     * 4. Structured preferences
     */
    const preferences = {};

    if ($("language").value) {
      preferences.language =
        $("language").value;
    }

    if ($("communication").value) {
      preferences.communication =
        $("communication").value;
    }

    if ($("preferredTime").value) {
      preferences.preferred_time =
        $("preferredTime").value;
    }

    /*
     * 5. Create member profile
     *
     * DOB + Gender included here.
     */
    const {
      data: member,
      error: memberError
    } = await db
      .from("care_member_profiles")
      .insert({
        family_id: family.id,

        care_profile_id:
          careProfile.id,

        name: value("name"),

        relationship:
          value("relationship") || "Self",

        role:
          $("role").value,

        phone:
          value("phone") || null,

        email:
          value("email") ||
          session.user.email ||
          null,

        date_of_birth:
          $("dob").value || null,

        gender:
          value("gender") || null,

        availability: {},

        preferences:
          preferences
      })
      .select()
      .single();

    if (memberError) {
      throw memberError;
    }

    /*
     * 6. Create family membership
     */
    const {
      error: membershipError
    } = await db
      .from("care_family_members")
      .insert({

        family_id:
          family.id,

        member_profile_id:
          member.id,

        relationship_to_owner:
          value("relationship") ||
          "Self",

        is_primary_caregiver:
          $("caregiver").checked,

        is_emergency_contact:
          $("emergency").checked,

        emergency_priority:
          $("emergency").checked
            ? (
                Number(
                  $("priority").value
                ) || 1
              )
            : null
      });

    if (membershipError) {
      throw membershipError;
    }

    /*
     * 7. Success
     */
    $("status").textContent =
      "Setup complete. CARE Dashboard खोल रहे हैं…";

    setTimeout(() => {
      location.href = "care.html";
    }, 500);

  } catch (error) {

    console.error(
      "CARE setup error:",
      error
    );

    $("status").textContent =
      error.message ||
      "Setup failed.";

  } finally {

    saveButton.disabled = false;
  }
}

$("setupForm")
  .addEventListener(
    "submit",
    saveSetup
  );

boot();
