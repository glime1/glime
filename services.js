(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const FUNCTION_URL =
    `${SUPABASE_URL}/functions/v1/services-foundation`;

  const { createClient } = window.supabase;
  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  // --------------------------------------------------
  // SYSTEM OFFER TYPES
  // --------------------------------------------------

  const SYSTEM_TYPES = [
    {
      key: "service",
      label: "Services",
      icon: "◈",
      desc: "Things your business does for customers."
    },
    {
      key: "product",
      label: "Products",
      icon: "▣",
      desc: "Physical or digital products you sell."
    },
    {
      key: "package",
      label: "Packages",
      icon: "▤",
      desc: "Bundled services, products or offers."
    },
    {
      key: "course",
      label: "Courses",
      icon: "◇",
      desc: "Courses, programs or learning offers."
    },
    {
      key: "appointment",
      label: "Appointments",
      icon: "◷",
      desc: "Bookable appointments or sessions."
    },
    {
      key: "rental",
      label: "Rentals",
      icon: "⌂",
      desc: "Things customers can rent for a period."
    },
    {
      key: "membership",
      label: "Memberships",
      icon: "◎",
      desc: "Recurring memberships or access plans."
    },
    {
      key: "other",
      label: "Other",
      icon: "＋",
      desc: "Anything that does not fit the standard types."
    }
  ];

  // --------------------------------------------------
  // CAPABILITIES
  // --------------------------------------------------

  const CAPABILITIES = {
    service: [
      "duration",
      "pricing",
      "variants",
      "availability",
      "booking"
    ],

    product: [
      "pricing",
      "variants",
      "inventory",
      "media"
    ],

    package: [
      "pricing",
      "variants",
      "media"
    ],

    course: [
      "duration",
      "pricing",
      "variants",
      "availability"
    ],

    appointment: [
      "duration",
      "pricing",
      "availability",
      "booking"
    ],

    rental: [
      "duration",
      "pricing",
      "availability",
      "inventory"
    ],

    membership: [
      "pricing",
      "variants",
      "availability",
      "billing"
    ],

    other: []
  };

  // --------------------------------------------------
  // STATE
  // --------------------------------------------------

  const state = {
    catalogName: "",
    description: "",
    selected: new Map(),
    customCounter: 0,
    saving: false
  };

  // --------------------------------------------------
  // DOM HELPERS
  // --------------------------------------------------

  const $ = (id) =>
    document.getElementById(id);

  const typeGrid =
    $("typeGrid");

  const search =
    $("typeSearch");

  const selectedCount =
    $("selectedCount");

  const continueBtn =
    $("continueBtn");

  const status =
    $("status");

  const guideText =
    $("guideText");

  // --------------------------------------------------
  // STATUS
  // --------------------------------------------------

  function setStatus(message, kind = "") {
    status.textContent = message;

    status.className =
      `status ${kind}`.trim();
  }

  // --------------------------------------------------
  // AI GUIDE
  // --------------------------------------------------

  function updateGuide() {
    const count =
      state.selected.size;

    if (count === 0) {

      guideText.textContent =
        "Choose the things your business actually sells or manages. You can mix standard types with your own custom type.";

      return;
    }

    if (count === 1) {

      guideText.textContent =
        "Good start. GLIME will use this foundation to shape your categories and offering fields in the next steps.";

      return;
    }

    guideText.textContent =
      `${count} offer types selected. Keep only the types you genuinely need — the next steps will stay focused on these.`;
  }

  // --------------------------------------------------
  // COUNTER / BUTTON STATE
  // --------------------------------------------------

  function updateCount() {

    selectedCount.textContent =
      state.selected.size;

    continueBtn.disabled =
      state.selected.size === 0 ||
      !$("catalogName").value.trim() ||
      state.saving;

    updateGuide();
  }

  // --------------------------------------------------
  // ALL TYPES
  // --------------------------------------------------

  function allTypes() {

    return [
      ...SYSTEM_TYPES,
      ...state.selected.values()
    ].filter(
      (value, index, array) =>
        array.findIndex(
          item => item.key === value.key
        ) === index
    );
  }

  // --------------------------------------------------
  // RENDER TYPES
  // --------------------------------------------------

  function renderTypes() {

    const query =
      search.value
        .trim()
        .toLowerCase();

    const list =
      allTypes().filter(type =>
        `${type.label} ${type.desc || ""}`
          .toLowerCase()
          .includes(query)
      );

    typeGrid.innerHTML = "";

    $("emptyTypes")
      .classList
      .toggle(
        "hidden",
        list.length > 0
      );

    list.forEach(type => {

      const selected =
        state.selected.has(type.key);

      const button =
        document.createElement("button");

      button.type = "button";

      button.className =
        `type-card ${selected ? "selected" : ""}`;

      button.dataset.key =
        type.key;

      button.innerHTML = `
        <span class="check">✓</span>

        <span class="type-icon">
          ${escapeHtml(type.icon || "✦")}
        </span>

        <span class="type-name">
          ${escapeHtml(type.label)}
        </span>

        <span class="type-desc">
          ${escapeHtml(
            type.desc ||
            type.description ||
            "Custom business type."
          )}
        </span>

        ${
          type.source === "custom"
            ? '<span class="custom-tag">Custom</span>'
            : ""
        }
      `;

      button.addEventListener(
        "click",
        () => toggleType(type)
      );

      typeGrid.appendChild(button);
    });
  }

  // --------------------------------------------------
  // SELECT / UNSELECT
  // --------------------------------------------------

  function toggleType(type) {

    if (state.selected.has(type.key)) {

      state.selected.delete(
        type.key
      );

    } else {

      state.selected.set(
        type.key,
        {
          type_key: type.key,

          label: type.label,

          description:
            type.desc ||
            type.description ||
            "",

          source:
            type.source ||
            "system",

          capabilities:
            type.capabilities ||
            CAPABILITIES[type.key] ||
            {},

          sort_order:
            state.selected.size
        }
      );
    }

    renderTypes();
    updateCount();
  }

  // --------------------------------------------------
  // CUSTOM TYPE
  // --------------------------------------------------

  function addCustomType() {

    const name =
      $("customName")
        .value
        .trim();

    const description =
      $("customDescription")
        .value
        .trim();

    if (!name) {

      setModalError(
        "Give the custom type a name first."
      );

      return;
    }

    const key =
      `custom_${slugify(name)}_${++state.customCounter}`;

    state.selected.set(
      key,
      {
        type_key: key,

        label: name,

        description: description,

        source: "custom",

        capabilities: {},

        sort_order:
          state.selected.size
      }
    );

    closeModal();

    renderTypes();
    updateCount();

    $("customName").value = "";
    $("customDescription").value = "";

    setStatus(
      `“${name}” added to your foundation.`,
      "success"
    );
  }

  // --------------------------------------------------
  // MODAL ERROR
  // --------------------------------------------------

  function setModalError(message) {

    let error =
      $("modalError");

    if (!error) {

      error =
        document.createElement("div");

      error.id =
        "modalError";

      error.style.cssText =
        "font-size:11px;color:#ff7c7c;margin-top:9px";

      $("customName")
        .insertAdjacentElement(
          "afterend",
          error
        );
    }

    error.textContent =
      message;
  }

  function clearModalError() {

    const error =
      $("modalError");

    if (error) {
      error.remove();
    }
  }

  // --------------------------------------------------
  // SLUG
  // --------------------------------------------------

  function slugify(value) {

    return value
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "_"
      )
      .replace(
        /^_|_$/g,
        ""
      )
      .slice(0, 34) || "type";
  }

  // --------------------------------------------------
  // HTML ESCAPE
  // --------------------------------------------------

  function escapeHtml(value) {

    return String(value)
      .replace(
        /[&<>"']/g,
        character => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[character])
      );
  }

  // --------------------------------------------------
  // SUPABASE EDGE FUNCTION
  // --------------------------------------------------

  async function callFoundation(
    action,
    body = {}
  ) {

    const {
      data: { session }
    } =
      await supabase.auth.getSession();

    if (
      !session ||
      !session.access_token
    ) {

      throw new Error(
        "Your GLIME session has expired. Please sign in again."
      );
    }

    const response =
      await fetch(
        FUNCTION_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${session.access_token}`,

            "apikey":
              SUPABASE_KEY
          },

          body:
            JSON.stringify({
              action,
              ...body
            })
        }
      );

    let payload = {};

    try {

      payload =
        await response.json();

    } catch (_) {
      // Empty/non-JSON response.
    }

    if (
      !response.ok ||
      payload.error
    ) {

      throw new Error(
        payload.error ||
        `Request failed (${response.status})`
      );
    }

    return payload;
  }

  // --------------------------------------------------
  // LOAD EXISTING FOUNDATION
  // --------------------------------------------------

  async function loadExisting() {

    try {

      const result =
        await callFoundation(
          "get"
        );

      if (result.catalog) {

        $("catalogName").value =
          result.catalog.name || "";

        $("catalogDescription").value =
          result.catalog.description || "";
      }

      if (
        Array.isArray(
          result.types
        )
      ) {

        result.types
          .filter(
            type =>
              type.active !== false
          )
          .forEach(type => {

            const systemType =
              SYSTEM_TYPES.find(
                item =>
                  item.key ===
                  type.type_key
              );

            state.selected.set(
              type.type_key,
              {
                type_key:
                  type.type_key,

                label:
                  type.label,

                description:
                  type.description || "",

                desc:
                  type.description || "",

                source:
                  type.source ||
                  "system",

                capabilities:
                  type.capabilities ||
                  {},

                sort_order:
                  type.sort_order || 0,

                icon:
                  systemType?.icon ||
                  "✦"
              }
            );
          });
      }

      renderTypes();
      updateCount();

    } catch (error) {

      console.error(
        "Foundation load error:",
        error
      );

      /*
       * First-time users may not have
       * a catalog yet. We don't show
       * an unnecessary error for that.
       */

      if (
        !/not found|catalog/i
          .test(error.message)
      ) {

        setStatus(
          error.message,
          "error"
        );
      }
    }
  }

  // --------------------------------------------------
  // SAVE FOUNDATION
  // --------------------------------------------------

  async function saveAndContinue() {

    if (state.saving) {
      return;
    }

    const name =
      $("catalogName")
        .value
        .trim();

    if (!name) {

      setStatus(
        "Please enter a catalog name.",
        "error"
      );

      return;
    }

    if (
      state.selected.size === 0
    ) {

      setStatus(
        "Select at least one offer type.",
        "error"
      );

      return;
    }

    state.saving = true;

    updateCount();

    continueBtn.innerHTML =
      '<span class="spinner">◌</span> Saving…';

    setStatus(
      "Saving your foundation…"
    );

    try {

      const types =
        [...state.selected.values()]
          .map(
            (type, index) => ({
              type_key:
                type.type_key,

              label:
                type.label,

              description:
                type.description ||
                type.desc ||
                "",

              source:
                type.source ||
                "system",

              capabilities:
                type.capabilities ||
                {},

              sort_order:
                index
            })
          );

      const result =
        await callFoundation(
          "save",
          {
            catalog_name:
              name,

            description:
              $("catalogDescription")
                .value
                .trim(),

            types
          }
        );

      // ------------------------------------------------
      // LOCAL PHASE STATE
      // ------------------------------------------------

      sessionStorage.setItem(
        "glime_services_phase1",
        JSON.stringify({
          catalog_id:
            result.catalog?.id ||
            null,

          catalog_name:
            name,

          types,

          saved_at:
            new Date()
              .toISOString()
        })
      );

      setStatus(
        "Foundation saved. Moving to Categories…",
        "success"
      );

      setTimeout(
        () => {

          /*
           * Phase 2 page will be created
           * only after its database/API
           * contract is finalized.
           */

          window.location.href =
            "services-categories.html";

        },
        500
      );

    } catch (error) {

      console.error(
        "Foundation save error:",
        error
      );

      setStatus(
        error.message ||
        "Could not save the foundation.",
        "error"
      );

      state.saving = false;

      continueBtn.innerHTML =
        'Continue to Categories <span>→</span>';

      updateCount();
    }
  }

  // --------------------------------------------------
  // CUSTOM TYPE MODAL
  // --------------------------------------------------

  function openModal() {

    clearModalError();

    $("customModal")
      .classList
      .remove("hidden");

    $("customModal")
      .setAttribute(
        "aria-hidden",
        "false"
      );

    setTimeout(
      () =>
        $("customName").focus(),
      40
    );
  }

  function closeModal() {

    $("customModal")
      .classList
      .add("hidden");

    $("customModal")
      .setAttribute(
        "aria-hidden",
        "true"
      );

    clearModalError();
  }

  // --------------------------------------------------
  // EVENT LISTENERS
  // --------------------------------------------------

  $("catalogName")
    .addEventListener(
      "input",
      updateCount
    );

  search
    .addEventListener(
      "input",
      renderTypes
    );

  $("customTypeBtn")
    .addEventListener(
      "click",
      openModal
    );

  $("closeModal")
    .addEventListener(
      "click",
      closeModal
    );

  $("cancelModal")
    .addEventListener(
      "click",
      closeModal
    );

  $("addCustomType")
    .addEventListener(
      "click",
      addCustomType
    );

  $("customName")
    .addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter"
        ) {

          addCustomType();
        }
      }
    );

  $("customModal")
    .addEventListener(
      "click",
      event => {

        if (
          event.target
            .classList
            .contains(
              "modal-backdrop"
            )
        ) {

          closeModal();
        }
      }
    );

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Escape"
      ) {

        closeModal();
      }
    }
  );

  continueBtn
    .addEventListener(
      "click",
      saveAndContinue
    );

  // --------------------------------------------------
  // INITIAL LOAD
  // --------------------------------------------------

  renderTypes();

  updateCount();

  loadExisting();

})();
