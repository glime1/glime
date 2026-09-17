const SUPABASE_URL =
  "https://ufoulgbiqgjriwapuopc.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = (id) =>
  document.getElementById(id);

async function boot() {

  const {
    data,
    error
  } = await db.auth.getSession();

  if (error || !data.session) {
    $("badge").textContent =
      "Login required";
    return;
  }

  const session =
    data.session;

  $("badge").textContent =
    `Logged in · ${
      session.user.email || ""
    }`;

  /*
   * Get active family owned
   * by current authenticated user.
   */
  const {
    data: families,
    error: familyError
  } = await db
    .from("care_families")
    .select(
      "id,name,timezone"
    )
    .eq(
      "owner_auth_user_id",
      session.user.id
    )
    .eq(
      "status",
      "active"
    )
    .limit(1);

  if (
    familyError ||
    !families?.length
  ) {
    $("status").textContent =
      "Active CARE family नहीं मिली.";
    return;
  }

  const family =
    families[0];

  /*
   * Get active members
   * within this family only.
   */
  const {
    data: members,
    error: memberError
  } = await db
    .from("care_member_profiles")
    .select(`
      id,
      name,
      relationship,
      role,
      phone,
      email,
      date_of_birth,
      gender,
      status
    `)
    .eq(
      "family_id",
      family.id
    )
    .eq(
      "status",
      "active"
    )
    .order(
      "created_at"
    );

  if (memberError) {
    $("status").textContent =
      memberError.message ||
      "Members load नहीं हुए.";
    return;
  }

  if (!members?.length) {
    $("status").textContent =
      "अभी कोई member नहीं है.";
    return;
  }

  $("memberList").innerHTML =
    members.map((member) => {

      return `
        <div
          class="review"
          style="margin:12px 0"
        >

          <b>
            ${escapeHtml(
              member.name
            )}
          </b>

          · ${escapeHtml(
            member.relationship || "—"
          )}

          · ${escapeHtml(
            member.role || "member"
          )}

          <br>

          DOB:
          ${member.date_of_birth || "—"}

          · Gender:
          ${escapeHtml(
            member.gender || "—"
          )}

          <br>

          Phone:
          ${escapeHtml(
            member.phone || "—"
          )}

          · Email:
          ${escapeHtml(
            member.email || "—"
          )}

        </div>
      `;

    }).join("");
}

function escapeHtml(value) {

  return String(value).replace(
    /[&<>"']/g,
    (character) => {

      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return entities[
        character
      ];
    }
  );
}

boot();
