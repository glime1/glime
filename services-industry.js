(function () {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const STORAGE_KEY =
    "glime_services_wizard";

  const $ = (id) => document.getElementById(id);

  const searchInput = $("industrySearch");
  const clearSearchBtn = $("clearSearchBtn");
  const industryList = $("industryList");
  const industryStatus = $("industryStatus");
  const emptyState = $("emptyState");
  const message = $("message");
  const nextBtn = $("nextBtn");

  let supabaseClient = null;
  let industries = [];
  let selectedIndustry = null;

  function getSupabaseClient() {
    if (supabaseClient) {
      return supabaseClient;
    }

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      throw new Error("Supabase client library did not load.");
    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    return supabaseClient;
  }

  function readWizardState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);

      return parsed && typeof parsed === "object"
        ? parsed
        : {};
    } catch (error) {
      console.warn(
        "[GLIME] Could not read wizard state.",
        error
      );

      return {};
    }
  }

  function writeWizardState(patch) {
    const current = readWizardState();

    const next = {
      ...current,
      ...patch
    };

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(next)
    );

    return next;
  }

  function setStatus(text, type = "") {
    if (!industryStatus) {
      return;
    }

    industryStatus.textContent = text;
    industryStatus.className =
      `status-line ${type}`;
  }

  function showMessage(text) {
    if (!message) {
      return;
    }

    message.hidden = false;
    message.textContent = text;
  }

  function renderIndustries(list) {
    if (!industryList) {
      return;
    }

    industryList.innerHTML = "";

    list.forEach((industry) => {
      const button =
        document.createElement("button");

      button.type = "button";
      button.className = "industry-option";
      button.dataset.industryId =
        industry.id;

      button.innerHTML = `
        <span class="industry-name">
          ${escapeHtml(industry.name)}
        </span>

        <span class="industry-slug">
          ${escapeHtml(industry.slug || "")}
        </span>
      `;

      if (
        selectedIndustry?.id ===
        industry.id
      ) {
        button.classList.add("selected");
      }

      button.addEventListener(
        "click",
        () => selectIndustry(industry)
      );

      industryList.appendChild(button);
    });

    const hasResults =
      list.length > 0;

    emptyState.hidden =
      hasResults;

    industryList.hidden =
      !hasResults;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function selectIndustry(industry) {
    selectedIndustry =
      industry;

    renderIndustries(
      filterIndustries(
        searchInput?.value || ""
      )
    );

    nextBtn.disabled = false;

    message.hidden = true;
    message.textContent = "";

    setStatus(
      `${industry.name} selected.`,
      "success"
    );

    writeWizardState({
      industry: {
        id: industry.id,
        name: industry.name,
        slug: industry.slug
      },

      businessModel: null,
      template: null,
      entityType: null,
      entity: null
    });
  }

  function filterIndustries(query) {
    const value =
      String(query || "")
        .trim()
        .toLowerCase();

    if (!value) {
      return industries;
    }

    return industries.filter((industry) => {
      const haystack = [
        industry.name,
        industry.slug
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(value);
    });
  }

  function handleSearch() {
    const query =
      searchInput?.value || "";

    if (clearSearchBtn) {
      clearSearchBtn.hidden =
        !query;
    }

    const filtered =
      filterIndustries(query);

    renderIndustries(filtered);

    if (!filtered.length) {
      setStatus(
        "No matching industry.",
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

  function clearSearch() {
    if (searchInput) {
      searchInput.value = "";
      searchInput.focus();
    }

    if (clearSearchBtn) {
      clearSearchBtn.hidden = true;
    }

    renderIndustries(
      industries
    );

    setStatus(
      `${industries.length} industries available.`
    );
  }

  async function loadIndustries() {
    setStatus(
      "Loading industries…"
    );

    try {
      const client =
        getSupabaseClient();

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
              ascending: true
            }
          );

      if (error) {
        throw error;
      }

      industries =
        data || [];

      if (!industries.length) {
        setStatus(
          "No industries are available.",
          "error"
        );

        renderIndustries([]);

        return;
      }

      const wizard =
        readWizardState();

      if (
        wizard.industry?.id
      ) {
        selectedIndustry =
          industries.find(
            (item) =>
              item.id ===
              wizard.industry.id
          ) || null;
      }

      renderIndustries(
        filterIndustries(
          searchInput?.value || ""
        )
      );

      if (selectedIndustry) {
        nextBtn.disabled =
          false;

        setStatus(
          `${selectedIndustry.name} selected.`,
          "success"
        );
      } else {
        nextBtn.disabled =
          true;

        setStatus(
          `${industries.length} industries available.`
        );
      }

    } catch (error) {
      console.error(
        "[GLIME Industry] Load failed:",
        error
      );

      setStatus(
        "Could not load industries.",
        "error"
      );

      showMessage(
        error.message ||
        "Please refresh and try again."
      );
    }
  }

  function goNext() {
    if (!selectedIndustry) {
      showMessage(
        "Please choose an industry first."
      );

      return;
    }

    nextBtn.disabled = true;
    nextBtn.textContent =
      "Opening…";

    writeWizardState({
      industry: {
        id: selectedIndustry.id,
        name: selectedIndustry.name,
        slug: selectedIndustry.slug
      }
    });

    window.location.href =
      "services-business-model.html";
  }

  searchInput?.addEventListener(
    "input",
    handleSearch
  );

  clearSearchBtn?.addEventListener(
    "click",
    clearSearch
  );

  nextBtn?.addEventListener(
    "click",
    goNext
  );

  loadIndustries();

})();
