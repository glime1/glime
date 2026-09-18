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

let session = null;
let members = [];
let pendingMember = null;
let pendingAction = null;


/* ================================
   BOOT
================================ */

async function boot() {
  const {
    data,
    error
  } = await db.auth.getSession();

  if (error || !data.session) {
    $("badge").textContent =
      "Login required";
    return false;
  }

  session = data.session;

  $("badge").textContent =
    `Logged in · ${session.user.email || ""}`;

  db.auth.onAuthStateChange(
    async (_event, nextSession) => {
      session = nextSession;

      if (!session) {
        window.location.href =
          "login.html";
      }
    }
  );

  return true;
}


/* ================================
   LOAD FAMILY MEMBERS
================================ */

async function loadMembers() {
  $("status").textContent =
    "Members load हो रहे हैं…";

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

  const {
    data,
    error
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
      status,
      created_at
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

  if (error) {
    $("status").textContent =
      error.message ||
      "Members load नहीं हुए.";
    return;
  }

  members =
    data || [];

  if (!members.length) {
    $("status").innerHTML =
      '<div class="empty">' +
      'अभी कोई active member नहीं है.' +
      '</div>';

    $("memberList").innerHTML =
      "";

    return;
  }

  $("status").textContent =
    `${members.length} active member${
      members.length === 1
        ? ""
        : "s"
    }`;

  const cards =
    await Promise.all(
      members.map(
        async (member) => {

          const privacy =
            await getPrivacyStatus(
              member.id
            );

          return renderMemberCard(
            member,
            privacy
          );
        }
      )
    );

  $("memberList").innerHTML =
    cards.join("");
}


/* ================================
   PRIVACY STATUS
================================ */

async function getPrivacyStatus(
  memberId
) {
  const {
    data,
    error
  } = await db.rpc(
    "care_member_get_privacy_status",
    {
      p_member_id:
        memberId
    }
  );

  if (error) {
    return {
      enabled: false,
      error: true
    };
  }

  return (
    data || {
      enabled: false
    }
  );
}


/* ================================
   MEMBER CARD
================================ */

function renderMemberCard(
  member,
  privacy
) {
  const locked =
    privacy.enabled === true;

  const relationship =
    member.relationship ||
    "—";

  const role =
    member.role ||
    "member";

  const lockText =
    locked
      ? "🔒 Privacy Lock ON"
      : "🔓 Privacy Lock OFF";

  const lockClass =
    locked
      ? "privacy-badge locked"
      : "privacy-badge";

  const lockButton =
    locked
      ? `
        <button
          class="danger"
          onclick="openLockModal(
            '${member.id}',
            'change'
          )"
        >
          Change / Disable Lock
        </button>
      `
      : `
        <button
          onclick="openLockModal(
            '${member.id}',
            'enable'
          )"
        >
          🔒 Set Privacy Lock
        </button>
      `;

  return `
    <article class="member-card">

      <h2>
        ${escapeHtml(
          member.name
        )}
      </h2>

      <div class="member-meta">

        Relationship:
        ${escapeHtml(
          relationship
        )}
        <br>

        Role:
        ${escapeHtml(
          role
        )}
        <br>

        DOB:
        ${escapeHtml(
          member.date_of_birth ||
          "—"
        )}
        <br>

        Gender:
        ${escapeHtml(
          member.gender ||
          "—"
        )}

      </div>

      <span
        class="${lockClass}"
      >
        ${lockText}
      </span>

      <div class="member-actions">

        <button
          class="primary"
          onclick="openMember(
            '${member.id}'
          )"
        >
          Open Member Center
        </button>

        ${lockButton}

      </div>

    </article>
  `;
}


/* ================================
   OPEN LOCK MODAL
================================ */

function openLockModal(
  memberId,
  action
) {
  pendingMember =
    members.find(
      (member) =>
        member.id ===
        memberId
    );

  if (!pendingMember) {
    return;
  }

  pendingAction =
    action;

  $("lockModal")
    .classList.add(
      "show"
    );

  $("lockModal")
    .setAttribute(
      "aria-hidden",
      "false"
    );

  $("pinInput").value =
    "";

  $("confirmPinInput").value =
    "";

  $("modalStatus").textContent =
    "";

  $("confirmPinLabel")
    .style.display =
    "block";

  $("confirmPinInput")
    .style.display =
    "block";

  $("pinInput")
    .setAttribute(
      "autocomplete",
      "new-password"
    );

  if (
    action === "enable"
  ) {

    $("modalTitle")
      .textContent =
      "🔒 Set Privacy Lock";

    $("modalDescription")
      .textContent =
      `Set a 6-digit private PIN for ${pendingMember.name}.`;

    $("confirmModal")
      .textContent =
      "Enable Lock";

  } else {

    $("modalTitle")
      .textContent =
      "🔐 Privacy Lock";

    $("modalDescription")
      .textContent =
      `Change the PIN for ${pendingMember.name}, or leave both fields empty to disable the lock.`;

    $("confirmModal")
      .textContent =
      "Save";
  }

  $("pinInput").focus();
}


/* ================================
   CLOSE MODAL
================================ */

function closeLockModal() {

  $("lockModal")
    .classList.remove(
      "show"
    );

  $("lockModal")
    .setAttribute(
      "aria-hidden",
      "true"
    );

  pendingMember =
    null;

  pendingAction =
    null;
}


/* ================================
   SAVE / CHANGE PRIVACY LOCK
================================ */

async function savePrivacyLock() {

  if (!pendingMember) {
    return;
  }

  const pin =
    $("pinInput")
      .value
      .trim();

  const confirmPin =
    $("confirmPinInput")
      .value
      .trim();

  $("modalStatus")
    .textContent =
    "Saving…";


  /*
   * ENABLE OR CHANGE PIN
   */

  if (
    pendingAction ===
      "enable" ||
    pin ||
    confirmPin
  ) {

    if (
      !/^[0-9]{6}$/.test(
        pin
      )
    ) {
      $("modalStatus")
        .textContent =
        "PIN exactly 6 digits का होना चाहिए.";

      return;
    }

    if (
      pin !==
      confirmPin
    ) {
      $("modalStatus")
        .textContent =
        "दोनों PIN समान होने चाहिए.";

      return;
    }

    const {
      error
    } = await db.rpc(
      "care_member_set_privacy_lock",
      {
        p_member_id:
          pendingMember.id,

        p_pin:
          pin,

        p_enabled:
          true
      }
    );

    if (error) {
      $("modalStatus")
        .textContent =
        error.message ||
        "Privacy lock save नहीं हुआ.";

      return;
    }

    closeLockModal();

    await loadMembers();

    return;
  }


  /*
   * DISABLE LOCK
   */

  const {
    error
  } = await db.rpc(
    "care_member_set_privacy_lock",
    {
      p_member_id:
        pendingMember.id,

      p_pin:
        null,

      p_enabled:
        false
    }
  );

  if (error) {
    $("modalStatus")
      .textContent =
      error.message ||
      "Privacy lock disable नहीं हुआ.";

    return;
  }

  closeLockModal();

  await loadMembers();
}


/* ================================
   OPEN MEMBER CENTER
================================ */

async function openMember(
  memberId
) {
  const member =
    members.find(
      (item) =>
        item.id ===
        memberId
    );

  if (!member) {
    return;
  }

  const privacy =
    await getPrivacyStatus(
      memberId
    );

  if (privacy.error) {

    alert(
      "Privacy status verify नहीं हो सका."
    );

    return;
  }


  /*
   * NO LOCK
   */

  if (!privacy.enabled) {

    window.location.href =
      `care-member.html?member=${encodeURIComponent(
        memberId
      )}`;

    return;
  }


  /*
   * LOCK ENABLED
   */

  pendingMember =
    member;

  pendingAction =
    "unlock";

  $("lockModal")
    .classList.add(
      "show"
    );

  $("lockModal")
    .setAttribute(
      "aria-hidden",
      "false"
    );

  $("modalTitle")
    .textContent =
    "🔐 Member Verification";

  $("modalDescription")
    .textContent =
    `Private Member Center खोलने के लिए ${member.name} का 6-digit PIN डालें.`;

  $("confirmPinLabel")
    .style.display =
    "none";

  $("confirmPinInput")
    .style.display =
    "none";

  $("pinInput").value =
    "";

  $("modalStatus")
    .textContent =
    "";

  $("confirmModal")
    .textContent =
    "Unlock";

  $("pinInput")
    .setAttribute(
      "autocomplete",
      "current-password"
    );

  $("pinInput").focus();
}


/* ================================
   UNLOCK MEMBER
================================ */

async function unlockMember() {

  if (!pendingMember) {
    return;
  }

  const pin =
    $("pinInput")
      .value
      .trim();

  if (
    !/^[0-9]{6}$/.test(
      pin
    )
  ) {

    $("modalStatus")
      .textContent =
      "6-digit PIN डालें.";

    return;
  }

  $("modalStatus")
    .textContent =
    "Verifying…";

  const {
    data,
    error
  } = await db.rpc(
    "care_member_unlock",
    {
      p_member_id:
        pendingMember.id,

      p_pin:
        pin
    }
  );

  if (error) {

    $("modalStatus")
      .textContent =
      error.message ||
      "PIN verification failed.";

    return;
  }

  if (
    !data?.unlocked ||
    !data?.token
  ) {

    $("modalStatus")
      .textContent =
      "Member unlock नहीं हुआ.";

    return;
  }

  sessionStorage.setItem(
    `glime_care_member_unlock_${pendingMember.id}`,
    data.token
  );

  window.location.href =
    `care-member.html?member=${encodeURIComponent(
      pendingMember.id
    )}`;
}


/* ================================
   CURRENT PRIVATE MEMBER CENTER
================================ */

async function openCurrentMemberCenter() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const memberId =
    params.get(
      "member"
    );

  if (!memberId) {
    return false;
  }

  const token =
    sessionStorage.getItem(
      `glime_care_member_unlock_${memberId}`
    );

  const {
    data,
    error
  } = await db.rpc(
    "care_member_center_snapshot",
    {
      p_member_id:
        memberId,

      p_unlock_token:
        token
    }
  );

  if (error) {

    $("status")
      .textContent =
      "Member privacy verification required.";

    $("memberList")
      .innerHTML = `
        <div class="empty">

          🔐 यह Member Center locked है।

          <br><br>

          <button
            class="primary"
            onclick="
              window.location.href =
                'care-member.html'
            "
          >
            ← Member List
          </button>

        </div>
      `;

    return true;
  }

  renderPrivateCenter(
    data
  );

  return true;
}


/* ================================
   PRIVATE MEMBER CENTER UI
================================ */

function renderPrivateCenter(
  data
) {
  const member =
    data.member;

  const membership =
    data.membership ||
    {};

  const summary =
    data.summary ||
    {};

  $("status")
    .textContent =
    "Private member session active";

  $("memberList")
    .innerHTML = `

      <article
        class="member-card"
        style="grid-column:1/-1"
      >

        <span
          class="privacy-badge locked"
        >
          🔐 Private Member Session
        </span>

        <h2
          style="margin-top:14px"
        >
          ${escapeHtml(
            member.name
          )}
        </h2>

        <div class="member-meta">

          Relationship:
          ${escapeHtml(
            member.relationship ||
            "—"
          )}
          <br>

          Role:
          ${escapeHtml(
            member.role ||
            "member"
          )}
          <br>

          DOB:
          ${escapeHtml(
            member.date_of_birth ||
            "—"
          )}
          <br>

          Gender:
          ${escapeHtml(
            member.gender ||
            "—"
          )}
          <br>

          Primary Caregiver:
          ${
            membership.is_primary_caregiver
              ? "Yes"
              : "No"
          }
          <br>

          Emergency Contact:
          ${
            membership.is_emergency_contact
              ? "Yes"
              : "No"
          }

        </div>

        <div class="member-actions">

          <button
            class="primary"
            onclick="
              alert(
                'Profile module next integration में खुलेगा.'
              )
            "
          >
            👤 Profile
          </button>

          <button
            onclick="
              alert(
                'Permissions module existing care_access_policies से जोड़ा जाएगा.'
              )
            "
          >
            🔐 Permissions
          </button>

          <button
            onclick="
              alert(
                'Memory module existing care_memories से जोड़ा जाएगा.'
              )
            "
          >
            🧠 Memory
          </button>

          <button
            onclick="
              alert(
                'Care / Health module next integration में खुलेगा.'
              )
            "
          >
            ❤️ Care / Health
          </button>

          <button
            onclick="
              alert(
                'Tasks: ${summary.tasks || 0}'
              )
          "
          >
            ✅ Tasks
            (${summary.tasks || 0})
          </button>

          <button
            onclick="
              alert(
                'Reminders module next integration में खुलेगा.'
              )
            "
          >
            ⏰ Reminders
          </button>

          <button
            onclick="
              alert(
                'Emergency controls existing family emergency policy से जुड़ेंगे.'
              )
            "
          >
            🚨 Emergency
          </button>

          <button
            onclick="
              alert(
                'AI Context existing scoped context system से जुड़ा है.'
              )
            "
          >
            🤖 AI Context
          </button>

        </div>

        <p class="privacy-note">

          Active permissions:
          ${summary.permissions || 0}

          · Private memories:
          ${summary.memories || 0}

          · Assigned tasks:
          ${summary.tasks || 0}

        </p>

        <div class="member-actions">

          <button
            class="danger"
            onclick="
              lockCurrentMember()
            "
          >
            🔒 Lock & Exit
          </button>

          <button
            onclick="
              window.location.href =
                'care-member.html'
            "
          >
            ← All Members
          </button>

        </div>

      </article>
    `;
}


/* ================================
   LOCK & EXIT
================================ */

function lockCurrentMember() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const memberId =
    params.get(
      "member"
    );

  if (memberId) {

    sessionStorage.removeItem(
      `glime_care_member_unlock_${memberId}`
    );
  }

  window.location.href =
    "care-member.html";
}


/* ================================
   HTML ESCAPE
================================ */

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  ).replace(
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


/* ================================
   MODAL EVENTS
================================ */

$("cancelModal")
  .addEventListener(
    "click",
    closeLockModal
  );


$("confirmModal")
  .addEventListener(
    "click",
    async () => {

      if (
        pendingAction ===
        "unlock"
      ) {

        await unlockMember();

      } else {

        await savePrivacyLock();

      }

    }
  );


$("lockModal")
  .addEventListener(
    "click",
    (event) => {

      if (
        event.target.id ===
        "lockModal"
      ) {

        closeLockModal();

      }

    }
  );


/* ================================
   INIT
================================ */

(async function init() {

  const loggedIn =
    await boot();

  if (!loggedIn) {
    return;
  }

  const privateCenter =
    await openCurrentMemberCenter();

  if (privateCenter) {

    $("badge")
      .textContent =
      `Private Member Center · ${
        session.user.email || ""
      }`;

    return;
  }

  await loadMembers();

})();
