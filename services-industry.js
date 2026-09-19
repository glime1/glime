(function () {
  "use strict";

  /*
   * ============================================================
   * GLIME SERVICES WIZARD — STEP 2
   * INDUSTRY SELECTION
   * ============================================================
   *
   * This step supports:
   *
   * 1. Existing system industry
   * 2. Custom industry
   *
   * System industry:
   *     Supabase industries table
   *
   * Custom industry:
   *     Stored temporarily in wizard state
   *     and saved permanently later by the
   *     final Foundation configuration step.
   *
   * IMPORTANT:
   * This page does NOT permanently write the
   * Foundation configuration.
   *
   * It only prepares the wizard state for
   * the next step.
   * ============================================================
   */


  /* ============================================================
     CONFIGURATION
     ============================================================ */

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const STORAGE_KEY =
    "glime_services_wizard";


  /* ============================================================
     DOM HELPERS
     ============================================================ */

  const $ = (id) =>
    document.getElementById(id);


  const searchInput =
    $("industrySearch");

  const clearSearchBtn =
    $("clearSearchBtn");

  const industryList =
    $("industryList");

  const industryStatus =
    $("industryStatus");

  const emptyState =
    $("emptyState");

  const customIndustryBtn =
    $("customIndustryBtn");

  const customIndustryForm =
    $("customIndustryForm");

  const customIndustryName =
    $("customIndustryName");

  const customIndustryDescription =
    $("customIndustryDescription");

  const closeCustomBtn =
    $("closeCustomBtn");

  const cancelCustomBtn =
    $("cancelCustomBtn");

  const useCustomBtn =
    $("useCustomBtn");

  const message =
    $("message");

  const nextBtn =
    $("nextBtn");

  const customOptionTitle =
    $("customOptionTitle");


  /* ============================================================
     INTERNAL STATE
     ============================================================ */

  let supabaseClient = null;

  let industries = [];

  let selectedIndustry = null;

  let selectedSource = null;


  /* ============================================================
     SUPABASE CLIENT
     ============================================================ */

  function getSupabaseClient() {

    if (supabaseClient) {
      return supabaseClient;
    }

    if (
      !window.supabase ||
      typeof window.supabase.createClient !==
        "function"
    ) {
      throw new Error(
        "Supabase client library did not load."
      );
    }

    supabaseClient =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
      );

    return supabaseClient;
  }


  /* ============================================================
     WIZARD STATE
     ============================================================ */

  function readWizardState() {

    try {

      const raw =
        sessionStorage.getItem(
          STORAGE_KEY
        );

      if (!raw) {
        return {};
      }

      const parsed =
        JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== "object"
      ) {
        return {};
      }

      return parsed;

    } catch (error) {

      console.warn(
        "[GLIME] Unable to read wizard state.",
        error
      );

      return {};
    }
  }


  function writeWizardState(
    patch
  ) {

    const current =
      readWizardState();

    const nextState = {
      ...current,
      ...patch
    };

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(nextState)
    );

    return nextState;
  }


  /* ============================================================
     UI STATUS
     ============================================================ */

  function setStatus(
    text,
    type = ""
  ) {

    if (!industryStatus) {
      return;
    }

    industryStatus.textContent =
      text;

    industryStatus.className =
      `status-line ${type}`;
  }


  function showMessage(
    text
  ) {

    if (!message) {
      return;
    }

    message.hidden = false;

    message.textContent =
      text;
  }


  function hideMessage() {

    if (!message) {
      return;
    }

    message.hidden = true;

    message.textContent =
      "";
  }


  /* ============================================================
     HTML ESCAPING
     ============================================================ */

  function escapeHtml(
    value
  ) {

    return String(
      value ?? ""
    )
      .replaceAll(
        "&",
        "&amp;"
      )
      .replaceAll(
        "<",
        "&lt;"
      )
      .replaceAll(
        ">",
        "&gt;"
      )
      .replaceAll(
        '"',
        "&quot;"
      )
      .replaceAll(
        "'",
        "&#039;"
      );
  }


  /* ============================================================
     SLUG CREATION
     ============================================================ */

  function slugify(
    value
  ) {

    return String(
      value || ""
    )
      .toLowerCase()
      .trim()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(
        0,
        100
      );
  }


  /* ============================================================
     FILTER INDUSTRIES
     ============================================================ */

  function filterIndustries(
    query
  ) {

    const search =
      String(
        query || ""
      )
        .trim()
        .toLowerCase();

    if (!search) {
      return industries;
    }

    return industries.filter(
      (industry) => {

        const name =
          String(
            industry.name || ""
          ).toLowerCase();

        const slug =
          String(
            industry.slug || ""
          ).toLowerCase();

        return (
          name.includes(search) ||
          slug.includes(search)
        );
      }
    );
  }


  /* ============================================================
     RENDER SYSTEM INDUSTRIES
     ============================================================ */

  function renderIndustries(
    list
  ) {

    if (!industryList) {
      return;
    }

    industryList.innerHTML =
      "";

    list.forEach(
      (industry) => {

        const button =
          document.createElement(
            "button"
          );

        button.type =
          "button";

        button.className =
          "industry-option";

        button.dataset.industryId =
          industry.id;

        button.innerHTML = `
          <span class="industry-name">
            ${escapeHtml(
              industry.name
            )}
          </span>

          <span class="industry-slug">
            ${escapeHtml(
              industry.slug || ""
            )}
          </span>
        `;

        if (
          selectedSource ===
            "system" &&
          selectedIndustry &&
          selectedIndustry.id ===
            industry.id
        ) {

          button.classList.add(
            "selected"
          );
        }

        button.addEventListener(
          "click",
          function () {
            selectSystemIndustry(
              industry
            );
          }
        );

        industryList.appendChild(
          button
        );
      }
    );

    const hasResults =
      list.length > 0;

    industryList.hidden =
      !hasResults;

    if (emptyState) {
      emptyState.hidden =
        hasResults;
    }
  }


  /* ============================================================
     SELECT SYSTEM INDUSTRY
     ============================================================ */

  function selectSystemIndustry(
    industry
  ) {

    selectedIndustry =
      industry;

    selectedSource =
      "system";

    hideMessage();

    /*
     * Clear any previously entered
     * custom industry.
     */
    if (customIndustryName) {
      customIndustryName.value =
        "";
    }

    if (customIndustryDescription) {
      customIndustryDescription.value =
        "";
    }

    /*
     * Close custom form if it is open.
     */
    if (customIndustryForm) {
      customIndustryForm.hidden =
        true;
    }

    /*
     * Restore normal custom option text.
     */
    if (customOptionTitle) {
      customOptionTitle.textContent =
        "Create a custom industry";
    }

    nextBtn.disabled =
      false;

    renderIndustries(
      filterIndustries(
        searchInput
          ? searchInput.value
          : ""
      )
    );

    /*
     * Store only temporary wizard
     * state at this point.
     */
    writeWizardState({

      industrySource:
        "system",

      industry: {

        id:
          industry.id,

        name:
          industry.name,

        slug:
          industry.slug || null

      },

      customIndustry:
        null,

      businessModel:
        null,

      template:
        null,

      entityType:
        null,

      entity:
        null

    });

    setStatus(
      `${industry.name} selected.`,
      "success"
    );
  }


  /* ============================================================
     OPEN CUSTOM INDUSTRY
     ============================================================ */

  function openCustomIndustry() {

    hideMessage();

    if (!customIndustryForm) {
      return;
    }

    customIndustryForm.hidden =
      false;

    /*
     * If the user searched for something,
     * automatically use that search text
     * as the initial custom name.
     *
     * Example:
     *
     * Search:
     * Plumber
     *
     * becomes:
     *
     * Industry name:
     * Plumber
     */
    const searchValue =
      searchInput
        ? searchInput.value.trim()
        : "";

    if (
      searchValue &&
      customIndustryName &&
      !customIndustryName.value
    ) {

      customIndustryName.value =
        searchValue;
    }

    if (customIndustryName) {
      customIndustryName.focus();
    }

    setStatus(
      "Define your own industry.",
      ""
    );

    customIndustryForm.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }


  /* ============================================================
     CLOSE CUSTOM INDUSTRY
     ============================================================ */

  function closeCustomIndustry() {

    if (!customIndustryForm) {
      return;
    }

    customIndustryForm.hidden =
      true;
  }


  /* ============================================================
     CLEAR CUSTOM SELECTION
     ============================================================ */

  function clearCustomSelection() {

    if (
      selectedSource !==
      "custom"
    ) {
      return;
    }

    selectedIndustry =
      null;

    selectedSource =
      null;

    nextBtn.disabled =
      true;

    if (customOptionTitle) {
      customOptionTitle.textContent =
        "Create a custom industry";
    }

    renderIndustries(
      filterIndustries(
        searchInput
          ? searchInput.value
          : ""
      )
    );

    setStatus(
      `${industries.length} industries available.`
    );
  }


  /* ============================================================
     USE CUSTOM INDUSTRY
     ============================================================ */

  function useCustomIndustry() {

    hideMessage();

    const name =
      customIndustryName
        ? customIndustryName.value.trim()
        : "";

    const description =
      customIndustryDescription
        ? customIndustryDescription.value.trim()
        : "";

    if (!name) {

      showMessage(
        "Please enter an industry name."
      );

      if (customIndustryName) {
        customIndustryName.focus();
      }

      return;
    }

    if (name.length < 2) {

      showMessage(
        "Industry name must contain at least 2 characters."
      );

      if (customIndustryName) {
        customIndustryName.focus();
      }

      return;
    }

    /*
     * IMPORTANT:
     *
     * We do NOT create a fake UUID.
     *
     * We do NOT insert this into the
     * global industries table.
     *
     * It remains client-specific wizard
     * data until the final configuration
     * is saved.
     */
    selectedIndustry = {

      id:
        null,

      name:
        name,

      slug:
        slugify(name),

      description:
        description || null

    };

    selectedSource =
      "custom";

    writeWizardState({

      industrySource:
        "custom",

      industry: {

        id:
          null,

        name:
          name,

        slug:
          slugify(name),

        description:
          description || null

      },

      customIndustry: {

        name:
          name,

        description:
          description || null

      },

      businessModel:
        null,

      template:
        null,

      entityType:
        null,

      entity:
        null

    });

    nextBtn.disabled =
      false;

    if (customOptionTitle) {
      customOptionTitle.textContent =
        `Custom: ${name}`;
    }

    if (customIndustryForm) {
      customIndustryForm.hidden =
        true;
    }

    setStatus(
      `"${name}" custom industry selected.`,
      "success"
    );

    nextBtn.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
      }

   /* ============================================================
     SEARCH
     ============================================================ */

  function handleSearch() {

    const query =
      searchInput
        ? searchInput.value
        : "";

    if (clearSearchBtn) {
      clearSearchBtn.hidden =
        !query;
    }

    /*
     * If the user starts searching again
     * after selecting a custom industry,
     * don't destroy the custom selection.
     */
    const filtered =
      filterIndustries(
        query
      );

    renderIndustries(
      filtered
    );

    if (!filtered.length) {

      setStatus(
        "No system industry found. You can create a custom one.",
        "error"
      );

      return;
    }

    setStatus(
      `${filtered.length} ${
        filtered.length === 1
          ? "industry"
          : "industries"
      } available.`
    );
  }


  /* ============================================================
     CLEAR SEARCH
     ============================================================ */

  function clearSearch() {

    if (searchInput) {

      searchInput.value =
        "";

      searchInput.focus();
    }

    if (clearSearchBtn) {
      clearSearchBtn.hidden =
        true;
    }

    renderIndustries(
      industries
    );

    if (
      selectedIndustry
    ) {

      setStatus(
        `${
          selectedSource ===
          "custom"
            ? "Custom: "
            : ""
        }${
          selectedIndustry.name
        } selected.`,
        "success"
      );

    } else {

      setStatus(
        `${industries.length} industries available.`
      );
    }
  }


  /* ============================================================
     LOAD SYSTEM INDUSTRIES
     ============================================================ */

  async function loadIndustries() {

    setStatus(
      "Loading industries…"
    );

    try {

      const client =
        getSupabaseClient();

      /*
       * Only use columns that belong to
       * the known system industry catalog.
       *
       * No custom industry is required here.
       */
      const {
        data,
        error
      } =
        await client
          .from("industries")
          .select(
            "id,name,slug,status,is_system"
          )
          .eq(
            "status",
            "active"
          )
          .order(
            "name",
            {
              ascending:
                true
            }
          );

      if (error) {
        throw error;
      }

      industries =
        Array.isArray(data)
          ? data
          : [];

      /*
       * Restore previous wizard state
       * if the user returns to this page.
       */
      const wizard =
        readWizardState();

      if (
        wizard.industrySource ===
          "custom" &&
        wizard.customIndustry &&
        wizard.customIndustry.name
      ) {

        selectedSource =
          "custom";

        selectedIndustry = {

          id:
            null,

          name:
            wizard.customIndustry.name,

          slug:
            wizard.industry &&
            wizard.industry.slug
              ? wizard.industry.slug
              : slugify(
                  wizard.customIndustry.name
                ),

          description:
            wizard.customIndustry.description ||
            null

        };

        if (customOptionTitle) {
          customOptionTitle.textContent =
            `Custom: ${
              selectedIndustry.name
            }`;
        }

        nextBtn.disabled =
          false;

      } else if (
        wizard.industrySource ===
          "system" &&
        wizard.industry &&
        wizard.industry.id
      ) {

        const existing =
          industries.find(
            function (industry) {
              return (
                industry.id ===
                wizard.industry.id
              );
            }
          );

        if (existing) {

          selectedSource =
            "system";

          selectedIndustry =
            existing;

          nextBtn.disabled =
            false;
        }
      }

      renderIndustries(
        filterIndustries(
          searchInput
            ? searchInput.value
            : ""
        )
      );

      if (
        selectedIndustry
      ) {

        setStatus(
          `${
            selectedSource ===
            "custom"
              ? "Custom: "
              : ""
          }${
            selectedIndustry.name
          } selected.`,
          "success"
        );

      } else if (
        industries.length
      ) {

        setStatus(
          `${industries.length} industries available.`
        );

      } else {

        setStatus(
          "No system industries are available. You can create a custom one.",
          "error"
        );
      }

    } catch (error) {

      console.error(
        "[GLIME Industry] Load failed:",
        error
      );

      /*
       * Even if the system industry catalog
       * temporarily fails, CUSTOM INDUSTRY
       * must remain usable.
       */
      industries = [];

      renderIndustries([]);

      setStatus(
        "System industries could not be loaded. Custom industry is still available.",
        "error"
      );

      showMessage(
        error &&
        error.message
          ? error.message
          : "You can still create a custom industry."
      );
    }
  }


  /* ============================================================
     NEXT
     ============================================================ */

  function goNext() {

    if (!selectedIndustry) {

      showMessage(
        "Please choose an industry or create a custom one."
      );

      return;
    }

    hideMessage();

    nextBtn.disabled =
      true;

    nextBtn.textContent =
      "Opening…";

    /*
     * Keep the selected industry in the
     * wizard state.
     *
     * Step 3 will consume it.
     */
    writeWizardState({

      industrySource:
        selectedSource,

      industry:
        selectedSource ===
        "system"

          ? {

              id:
                selectedIndustry.id,

              name:
                selectedIndustry.name,

              slug:
                selectedIndustry.slug ||
                null

            }

          : {

              id:
                null,

              name:
                selectedIndustry.name,

              slug:
                selectedIndustry.slug ||
                slugify(
                  selectedIndustry.name
                ),

              description:
                selectedIndustry.description ||
                null

            }

    });

    /*
     * STEP 3
     */
    window.location.href =
      "services-business-model.html";
  }


  /* ============================================================
     EVENTS
     ============================================================ */

  if (searchInput) {

    searchInput.addEventListener(
      "input",
      handleSearch
    );
  }


  if (clearSearchBtn) {

    clearSearchBtn.addEventListener(
      "click",
      clearSearch
    );
  }


  if (customIndustryBtn) {

    customIndustryBtn.addEventListener(
      "click",
      openCustomIndustry
    );
  }


  if (closeCustomBtn) {

    closeCustomBtn.addEventListener(
      "click",
      function () {

        closeCustomIndustry();

        /*
         * Don't delete a previously selected
         * system industry just because the
         * custom form was closed.
         */
      }
    );
  }


  if (cancelCustomBtn) {

    cancelCustomBtn.addEventListener(
      "click",
      function () {

        closeCustomIndustry();

        /*
         * If custom was already selected,
         * cancel means return to the previous
         * selection state.
         */
        if (
          selectedSource ===
          "custom"
        ) {

          clearCustomSelection();
        }

      }
    );
  }


  if (useCustomBtn) {

    useCustomBtn.addEventListener(
      "click",
      useCustomIndustry
    );
  }


  if (nextBtn) {

    nextBtn.addEventListener(
      "click",
      goNext
    );
  }


  /* ============================================================
     BOOT
     ============================================================ */

  loadIndustries();

})();
