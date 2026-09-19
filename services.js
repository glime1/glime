(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!window.supabase?.createClient) {
    console.error("Supabase client library is not loaded.");
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  let client = null;
  let categories = [];
  let offers = [];
  let selectedOffer = null;
  let selectedVersion = null;
  let variants = [];
  let availability = [];

  // Version metadata is intentionally kept separate from offers.
  // This is the key boundary for future version/review/publish workflows.
  let offerVersionsByOfferId = new Map();

  let loading = false;
  let saveInProgress = false;

  const VERSION_STATUSES = new Set([
    "draft",
    "review",
    "approved",
    "published",
    "archived"
  ]);

  const EDITABLE_VERSION_STATUS = "draft";

  const $ = (id) => document.getElementById(id);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char]));

  const slugify = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70);

  const lines = (value) =>
    String(value || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

  const textLines = (value) =>
    Array.isArray(value) ? value.join("\n") : "";

  const clientId = () => client?.client_id;

  const normalizeVersionStatus = (value) => {
    const status = String(value || "draft").toLowerCase();
    return VERSION_STATUSES.has(status) ? status : "draft";
  };

  const versionSort = (a, b) =>
    Number(b?.version_number || 0) -
    Number(a?.version_number || 0);

  function showMessage(text, type = "info") {
    const element = $("message");

    if (!element) return;

    element.textContent = text || "";
    element.className = "message " + type;
    element.hidden = !text;
  }

  function setBusy(isBusy) {
    saveInProgress = isBusy;

    [
      "newVersionBtn",
      "saveDraftBtn",
      "savePublishBtn",
      "deleteOfferBtn",
      "addVariantBtn",
      "addAvailabilityBtn",
      "addCategoryBtn"
    ].forEach((id) => {
      const element = $(id);
      if (element) element.disabled = isBusy;
    });
  }

  async function getClient() {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    const user = data?.session?.user;

    if (!user) {
      window.location.replace("login.html");
      return null;
    }

    const { data: clientData, error: clientError } = await db
      .from("client_data")
      .select(
        "id,client_id,client_name,full_name,name,email"
      )
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (clientError) throw clientError;

    if (!clientData?.client_id) {
      throw new Error(
        "Authenticated client profile was not found."
      );
    }

    return clientData;
  }

  async function fetchVersionSummaries(offerIds) {
    const map = new Map();

    if (!offerIds.length) return map;

    const { data, error } = await db
      .from("offer_versions")
      .select(
        "id,offer_id,version_number,status,title,published_at,created_at,updated_at"
      )
      .in("offer_id", offerIds)
      .order(
        "version_number",
        {
          ascending: false
        }
      );

    if (error) throw error;

    (data || []).forEach((version) => {
      const list =
        map.get(version.offer_id) || [];

      list.push(version);
      map.set(version.offer_id, list);
    });

    for (const [offerId, list] of map.entries()) {
      list.sort(versionSort);
      map.set(offerId, list);
    }

    return map;
  }

  async function loadCatalog(
    {
      preserveSelection = true
    } = {}
  ) {
    if (!clientId() || loading) return;

    loading = true;

    const previousOfferId =
      preserveSelection
        ? selectedOffer?.id || null
        : null;

    const previousVersionId =
      preserveSelection
        ? selectedVersion?.id || null
        : null;

    try {
      const [
        categoryResult,
        offerResult
      ] = await Promise.all([

        db
          .from("offer_categories")
          .select("*")
          .eq(
            "client_id",
            clientId()
          )
          .order(
            "sort_order"
          )
          .order(
            "name"
          ),

        db
          .from("offers")
          .select(
            "id,client_id,offer_type,name,slug,short_description,description,category_id,status,current_version_id,created_at,updated_at"
          )
          .eq(
            "client_id",
            clientId()
          )
          .order(
            "updated_at",
            {
              ascending: false
            }
          )

      ]);

      if (categoryResult.error) {
        throw categoryResult.error;
      }

      if (offerResult.error) {
        throw offerResult.error;
      }

      categories =
        categoryResult.data || [];

      offers =
        offerResult.data || [];

      const versionMap =
        await fetchVersionSummaries(
          offers.map(
            (offer) => offer.id
          )
        );

      offerVersionsByOfferId =
        versionMap;

      renderCategories();
      renderOffers();

      if (previousOfferId) {
        const freshOffer =
          offers.find(
            (offer) =>
              offer.id ===
              previousOfferId
          );

        if (freshOffer) {
          await selectOffer(
            freshOffer,
            false,
            previousVersionId
          );
        } else {
          clearEditorSelection();
        }
      }

    } finally {
      loading = false;
    }
  }

  async function loadOfferVersions(
    offerId
  ) {
    if (!offerId) return [];

    const {
      data,
      error
    } = await db
      .from("offer_versions")
      .select(
        "id,offer_id,version_number,status,title,description,sales_talking_points,allowed_claims,restrictions,customer_eligibility,metadata,published_at,created_at,updated_at"
      )
      .eq(
        "offer_id",
        offerId
      )
      .order(
        "version_number",
        {
          ascending: false
        }
      );

    if (error) throw error;

    const versions =
      (data || []).sort(
        versionSort
      );

    offerVersionsByOfferId.set(
      offerId,
      versions
    );

    return versions;
  }

  function getVersionsForOffer(
    offerId
  ) {
    return (
      offerVersionsByOfferId.get(
        offerId
      ) || []
    )
      .slice()
      .sort(
        versionSort
      );
  }

  function getPreferredVersion(
    offer,
    versions,
    preferredVersionId = null
  ) {
    if (!versions.length) {
      return null;
    }

    if (preferredVersionId) {
      const preferred =
        versions.find(
          (version) =>
            version.id ===
            preferredVersionId
        );

      if (preferred) {
        return preferred;
      }
    }

    if (offer?.current_version_id) {
      const current =
        versions.find(
          (version) =>
            version.id ===
            offer.current_version_id
        );

      if (current) {
        return current;
      }
    }

    return versions[0] || null;
  }

  function renderCategories() {
    const categoryList =
      $("categoryList");

    if (categoryList) {
      categoryList.innerHTML =
        categories.length
          ? categories
              .map(
                (category) => `
                  <span class="category-pill">
                    ${escapeHtml(
                      category.name
                    )}
                  </span>
                `
              )
              .join("")
          : '<span class="muted">No categories yet</span>';
    }

    const categorySelect =
      $("offerCategory");

    if (!categorySelect) {
      return;
    }

    const currentValue =
      categorySelect.value;

    categorySelect.innerHTML =
      '<option value="">No category</option>' +
      categories
        .map(
          (category) => `
            <option value="${escapeHtml(
              category.id
            )}">
              ${escapeHtml(
                category.name
              )}
            </option>
          `
        )
        .join("");

    if (selectedOffer) {
      categorySelect.value =
        selectedOffer.category_id ||
        "";
    } else if (currentValue) {
      categorySelect.value =
        currentValue;
    }
  }

  function getOfferCategoryName(
    offer
  ) {
    return (
      categories.find(
        (category) =>
          category.id ===
          offer.category_id
      )?.name ||
      "Uncategorized"
    );
  }

  function getOfferDisplayStatus(
    offer
  ) {
    const versions =
      getVersionsForOffer(
        offer.id
      );

    const currentVersion =
      versions.find(
        (version) =>
          version.id ===
          offer.current_version_id
      );

    if (
      offer.status === "active" &&
      currentVersion?.status ===
        "published"
    ) {
      return "Published";
    }

    return (
      offer.status ||
      "draft"
    );
  }

  function renderOffers() {
    const count =
      $("offerCount");

    if (count) {
      count.textContent =
        `${offers.length} item${
          offers.length === 1
            ? ""
            : "s"
        }`;
    }

    const list =
      $("offerList");

    if (!list) {
      return;
    }

    if (!offers.length) {
      list.innerHTML = `
        <div class="empty">
          No services or offers yet.
        </div>
      `;

      return;
    }

    list.innerHTML =
      offers
        .map(
          (offer) => {

            const displayStatus =
              getOfferDisplayStatus(
                offer
              );

            return `
              <div
                class="offer-card ${
                  selectedOffer?.id ===
                  offer.id
                    ? "selected"
                    : ""
                }"
              >

                <button
                  type="button"
                  data-offer-id="${escapeHtml(
                    offer.id
                  )}"
                >

                  <div class="offer-name">
                    ${escapeHtml(
                      offer.name
                    )}
                  </div>

                  <div class="offer-meta">

                    <span>
                      ${escapeHtml(
                        offer.offer_type
                      )}
                      ·
                      ${escapeHtml(
                        getOfferCategoryName(
                          offer
                        )
                      )}
                    </span>

                    <span
                      class="status ${String(
                        displayStatus
                      ).toLowerCase()}"
                    >
                      ${escapeHtml(
                        displayStatus
                      )}
                    </span>

                  </div>

                </button>

              </div>
            `;

          }
        )
        .join("");

    list
      .querySelectorAll(
        "[data-offer-id]"
      )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            () => {

              const offer =
                offers.find(
                  (item) =>
                    item.id ===
                    button.dataset.offerId
                );

              if (!offer) {
                return;
              }

              selectOffer(
                offer
              ).catch(
                (error) => {

                  console.error(
                    error
                  );

                  showMessage(
                    error.message ||
                      String(error),
                    "error"
                  );

                }
              );

            }
          );

        }
      );

  }

  function ensureVersionHistoryUI() {
    const label =
      $("versionLabel");

    const strip =
      label?.closest(
        ".version-strip"
      );

    if (!strip) {
      return null;
    }

    let host =
      $("versionHistoryHost");

    if (!host) {

      host =
        document.createElement(
          "div"
        );

      host.id =
        "versionHistoryHost";

      host.className =
        "version-history-host";

      const style =
        document.createElement(
          "style"
        );

      style.textContent = `
        .version-history-host {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .version-history-host label {
          color: var(--dim, #6f818c);
          font: 500 10px "DM Mono", monospace;
          letter-spacing: .04em;
          text-transform: uppercase;
        }

        .version-history-host select {
          min-width: 220px;
        }

        .version-history-note {
          color: var(--dim, #6f818c);
          font-size: 11px;
        }
      `;

      document.head.appendChild(
        style
      );

      strip.insertAdjacentElement(
        "afterend",
        host
      );
    }

    return host;
  }

  function renderVersionHistory() {
    const host =
      ensureVersionHistoryUI();

    if (!host) {
      return;
    }

    if (!selectedOffer) {
      host.innerHTML = "";
      return;
    }

    const versions =
      getVersionsForOffer(
        selectedOffer.id
      );

    if (!versions.length) {

      host.innerHTML = `
        <span class="version-history-note">
          No version history yet.
        </span>
      `;

      return;
    }

    host.innerHTML = `
      <label for="versionHistorySelect">
        Version history
      </label>

      <select id="versionHistorySelect">

        ${versions
          .map(
            (version) => {

              const status =
                normalizeVersionStatus(
                  version.status
                );

              const isSelected =
                version.id ===
                selectedVersion?.id;

              return `
                <option
                  value="${escapeHtml(
                    version.id
                  )}"
                  ${
                    isSelected
                      ? "selected"
                      : ""
                  }
                >
                  v${escapeHtml(
                    version.version_number
                  )}
                  ·
                  ${escapeHtml(
                    status
                  )}
                  ${
                    version.title
                      ? " · " +
                        escapeHtml(
                          version.title
                        )
                      : ""
                  }
                </option>
              `;

            }
          )
          .join("")}

      </select>

      <span class="version-history-note">
        Published versions are read-only.
      </span>
    `;

    $(
      "versionHistorySelect"
    )?.addEventListener(
      "change",
      async (event) => {

        const versionId =
          event.target.value;

        const version =
          versions.find(
            (item) =>
              item.id ===
              versionId
          );

        if (!version) {
          return;
        }

        selectedVersion =
          version;

        await loadVersionData();

        applyEditorLockState();

      }
    );
  }

  function clearEditorSelection() {
    selectedOffer = null;
    selectedVersion = null;
    variants = [];
    availability = [];

    const form =
      $("offerForm");

    const empty =
      $("editorEmpty");

    if (form) {
      form.hidden = true;
    }

    if (empty) {
      empty.hidden = false;
    }

    renderOffers();
    renderVersionHistory();
  }

  function resetEditor() {
    selectedOffer = null;
    selectedVersion = null;

    variants = [];
    availability = [];

    $("editorEmpty").hidden =
      true;

    $("offerForm").hidden =
      false;

    $("editorTitle").textContent =
      "New Service";

    $("editorStatus").textContent =
      "Draft";

    $("editorStatus").className =
      "status draft";

    [
      "offerName",
      "shortDescription",
      "offerDescription",
      "versionTitle",
      "eligibility",
      "talkingPoints",
      "allowedClaims",
      "restrictions",
      "priceAmount",
      "billingPeriod",
      "minAmount",
      "maxAmount"
    ].forEach(
      (id) => {

        const field =
          $(id);

        if (field) {
          field.value =
            "";
        }

      }
    );

    $("offerType").value =
      "service";

    $("priceCurrency").value =
      "INR";

    $("priceType").value =
      "fixed";

    $("offerCategory").value =
      "";

    $("versionLabel").textContent =
      "Version 1";

    $("versionStatus").textContent =
      "Draft";

    $("versionStatus").className =
      "status draft";

    $("publishToggle").checked =
      false;

    $("deleteOfferBtn").hidden =
      true;

    renderVariants();
    renderAvailability();
    renderVersionHistory();
    updatePriceRange();
    applyEditorLockState();

    if (window.innerWidth < 951) {
      $("offerForm")?.scrollIntoView({
        behavior: "smooth"
      });
    }
  }

  async function selectOffer(
    offer,
    scroll = true,
    preferredVersionId = null
  ) {

    if (!offer) {
      return;
    }

    selectedOffer =
      offer;

    const versions =
      await loadOfferVersions(
        offer.id
      );

    selectedVersion =
      getPreferredVersion(
        offer,
        versions,
        preferredVersionId
      );

    $("editorEmpty").hidden =
      true;

    $("offerForm").hidden =
      false;

    $("editorTitle").textContent =
      offer.name ||
      "Service";

    $("editorStatus").textContent =
      offer.status ||
      "draft";

    $("editorStatus").className =
      "status " +
      (
        offer.status ||
        "draft"
      );

    $("offerName").value =
      offer.name ||
      "";

    $("offerType").value =
      offer.offer_type ||
      "service";

    $("shortDescription").value =
      offer.short_description ||
      "";

    $("offerDescription").value =
      offer.description ||
      "";

    $("offerCategory").value =
      offer.category_id ||
      "";

    $("deleteOfferBtn").hidden =
      false;

    renderVersionHistory();

    await loadVersionData();

    applyEditorLockState();

    renderOffers();
    renderCategories();

    if (
      scroll &&
      window.innerWidth < 951
    ) {

      $("offerForm")?.scrollIntoView({
        behavior: "smooth"
      });

    }
  }

  async function loadVersionData() {

    const version =
      selectedVersion;

    if (!version) {

      $("versionLabel").textContent =
        "Version 1";

      $("versionStatus").textContent =
        "Draft";

      $("versionStatus").className =
        "status draft";

      $("versionTitle").value =
        "";

      $("eligibility").value =
        "";

      $("talkingPoints").value =
        "";

      $("allowedClaims").value =
        "";

      $("restrictions").value =
        "";

      $("priceAmount").value =
        "";

      $("priceCurrency").value =
        "INR";

      $("priceType").value =
        "fixed";

      $("billingPeriod").value =
        "";

      $("minAmount").value =
        "";

       $("maxAmount").value =
        "";

      $("publishToggle").checked =
        false;

      variants = [];
      availability = [];

      renderVariants();
      renderAvailability();
      renderVersionHistory();
      updatePriceRange();

      return;
    }

    $("versionLabel").textContent =
      `Version ${
        version.version_number
      }`;

    $("versionStatus").textContent =
      normalizeVersionStatus(
        version.status
      );

    $("versionStatus").className =
      "status " +
      normalizeVersionStatus(
        version.status
      );

    $("versionTitle").value =
      version.title ||
      "";

    $("eligibility").value =
      version
        .customer_eligibility
        ?.text ||
      "";

    $("talkingPoints").value =
      textLines(
        version.sales_talking_points
      );

    $("allowedClaims").value =
      textLines(
        version.allowed_claims
      );

    $("restrictions").value =
      textLines(
        version.restrictions
      );

    const [
      variantResult,
      priceResult,
      availabilityResult
    ] =
      await Promise.all([

        db
          .from("offer_variants")
          .select("*")
          .eq(
            "offer_version_id",
            version.id
          )
          .order(
            "sort_order"
          ),

        db
          .from("offer_prices")
          .select("*")
          .eq(
            "offer_version_id",
            version.id
          )
          .order(
            "created_at"
          ),

        db
          .from("offer_availability")
          .select("*")
          .eq(
            "offer_version_id",
            version.id
          )
          .order(
            "day_of_week"
          )

      ]);

    if (variantResult.error) {
      throw variantResult.error;
    }

    if (priceResult.error) {
      throw priceResult.error;
    }

    if (availabilityResult.error) {
      throw availabilityResult.error;
    }

    variants =
      variantResult.data ||
      [];

    availability =
      availabilityResult.data ||
      [];

    const price =
      priceResult.data?.[0];

    $("priceAmount").value =
      price?.amount ??
      "";

    $("priceCurrency").value =
      price?.currency ||
      "INR";

    $("priceType").value =
      price?.price_type ||
      "fixed";

    $("billingPeriod").value =
      price?.billing_period ||
      "";

    $("minAmount").value =
      price?.min_amount ??
      "";

    $("maxAmount").value =
      price?.max_amount ??
      "";

    $("publishToggle").checked =
      version.status ===
        "published" &&
      selectedOffer?.current_version_id ===
        version.id;

    updatePriceRange();

    renderVariants();
    renderAvailability();
    renderVersionHistory();
  }

  function isEditorLocked() {

    if (!selectedOffer) {
      return false;
    }

    const versionStatus =
      normalizeVersionStatus(
        selectedVersion?.status
      );

    if (
      selectedOffer.status ===
      "archived"
    ) {
      return true;
    }

    return (
      versionStatus !==
      EDITABLE_VERSION_STATUS
    );
  }

  function applyEditorLockState() {

    const locked =
      isEditorLocked();

    const form =
      $("offerForm");

    if (!form) {
      return;
    }

    form.dataset.locked =
      locked
        ? "true"
        : "false";

    const controls =
      form.querySelectorAll(
        "input, textarea, select"
      );

    controls.forEach(
      (control) => {

        if (
          control.id ===
          "publishToggle"
        ) {
          return;
        }

        control.disabled =
          locked;
      }
    );

    const actionIds = [
      "saveDraftBtn",
      "savePublishBtn",
      "addVariantBtn",
      "addAvailabilityBtn"
    ];

    actionIds.forEach(
      (id) => {

        const element =
          $(id);

        if (element) {
          element.disabled =
            locked ||
            saveInProgress;
        }

      }
    );

    const createVersionButton =
      $("newVersionBtn");

    if (createVersionButton) {

      createVersionButton.disabled =
        Boolean(
          selectedOffer?.status ===
            "archived"
        ) ||
        saveInProgress;
    }

    const note =
      ensureVersionHistoryUI()
        ?.querySelector(
          ".version-history-note"
        );

    if (note) {

      note.textContent =
        locked
          ? "This version is read-only. Create a new draft version to edit."
          : "Draft version is editable. Published versions stay immutable.";
    }

    const publishBox =
      document.querySelector(
        ".publish-box"
      );

    if (publishBox) {

      publishBox.dataset.locked =
        locked
          ? "true"
          : "false";
    }
  }

  function renderVariants() {

    const list =
      $("variantList");

    if (!list) {
      return;
    }

    if (!variants.length) {

      list.innerHTML = `
        <div class="empty">
          No variants. Add one if the offer has options.
        </div>
      `;

      return;
    }

    list.innerHTML =
      variants
        .map(
          (variant, index) => `
            <div class="item-row">

              <input
                data-variant-name="${index}"
                value="${escapeHtml(
                  variant.name
                )}"
                placeholder="Variant name"
                ${
                  isEditorLocked()
                    ? "disabled"
                    : ""
                }
              >

              <input
                data-variant-sku="${index}"
                value="${escapeHtml(
                  variant.sku ||
                  ""
                ) }"
                placeholder="SKU (optional)"
                ${
                  isEditorLocked()
                    ? "disabled"
                    : ""
                }
              >

              <button
                type="button"
                class="remove-btn"
                data-remove-variant="${index}"
                ${
                  isEditorLocked()
                    ? "disabled"
                    : ""
                }
              >
                ×
              </button>

            </div>
          `
        )
        .join("");

    list
      .querySelectorAll(
        "[data-remove-variant]"
      )
      .forEach(
        (button) => {

          button.onclick =
            () => {

              if (
                isEditorLocked()
              ) {
                return;
              }

              variants.splice(
                Number(
                  button.dataset
                    .removeVariant
                ),
                1
              );

              renderVariants();
            };

        }
      );
  }

  function renderAvailability() {

    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday"
    ];

    const list =
      $("availabilityList");

    if (!list) {
      return;
    }

    if (!availability.length) {

      list.innerHTML = `
        <div class="empty">
          No availability rule added.
        </div>
      `;

      return;
    }

    list.innerHTML =
      availability
        .map(
          (item, index) => `
            <div class="availability-row">

              <select
                data-availability-day="${index}"
                ${
                  isEditorLocked()
                    ? "disabled"
                    : ""
                }
              >

                <option value="">
                  Any day
                </option>

                ${days
                  .map(
                    (day, dayIndex) => `
                      <option
                        value="${dayIndex}"
                        ${
                          String(
                            item.day_of_week
                          ) ===
                          String(
                            dayIndex
                          )
                            ? "selected"
                            : ""
                        }
                      >
                        ${day}
                      </option>
                    `
                  )
                  .join("")}

              </select>

              <input
                type="time"
                data-availability-start="${index}"
                value="${escapeHtml(
                  item.start_time ||
                  ""
                ) }"
                ${
                  isEditorLocked()
                    ? "disabled"
                    : ""
                }
              >

              <input
                type="time"
                data-availability-end="${index}"
                value="${escapeHtml(
                  item.end_time ||
                  ""
                ) }"
                ${
                  isEditorLocked()
                    ? "disabled"
                    : ""
                }
              >

              <input
                data-availability-notes="${index}"
                value="${escapeHtml(
                  item.notes ||
                  ""
                ) }"
                placeholder="Notes"
                ${
                  isEditorLocked()
                    ? "disabled"
                    : ""
                }
              >

              <button
                type="button"
                class="remove-btn"
                data-remove-availability="${index}"
                ${
                  isEditorLocked()
                    ? "disabled"
                    : ""
                }
              >
                ×
              </button>

            </div>
          `
        )
        .join("");

    list
      .querySelectorAll(
        "[data-remove-availability]"
      )
      .forEach(
        (button) => {

          button.onclick =
            () => {

              if (
                isEditorLocked()
              ) {
                return;
              }

              availability.splice(
                Number(
                  button.dataset
                    .removeAvailability
                ),
                1
              );

              renderAvailability();
            };

        }
      );
  }

  function syncEditorArrays() {

    variants =
      variants.map(
        (variant, index) => ({

          ...variant,

          name:
            document
              .querySelector(
                `[data-variant-name="${index}"]`
              )
              ?.value.trim() ||
            "",

          sku:
            document
              .querySelector(
                `[data-variant-sku="${index}"]`
              )
              ?.value.trim() ||
            null

        })
      );

    availability =
      availability.map(
        (item, index) => {

          const day =
            document.querySelector(
              `[data-availability-day="${index}"]`
            )?.value;

          return {

            ...item,

            day_of_week:
              day === ""
                ? null
                : Number(day),

            start_time:
              document
                .querySelector(
                  `[data-availability-start="${index}"]`
                )
                ?.value ||
              null,

            end_time:
              document
                .querySelector(
                  `[data-availability-end="${index}"]`
                )
                ?.value ||
              null,

            notes:
              document
                .querySelector(
                  `[data-availability-notes="${index}"]`
                )
                ?.value.trim() ||
              null

          };

        }
      );
  }

  function updatePriceRange() {

    const priceType =
      $("priceType")?.value;

    const row =
      $("rangeRow");

    if (!row) {
      return;
    }

    row.hidden =
      priceType !==
      "range";
  }

  function validateEditor() {

    const name =
      $("offerName")
        ?.value.trim();

    if (!name) {

      throw new Error(
        "Service name is required."
      );
    }

    if (
      variants.some(
        (variant) =>
          !variant.name
      )
    ) {

      throw new Error(
        "Every variant needs a name."
      );
    }

    if (
      availability.some(
        (item) =>
          (
            item.start_time &&
            !item.end_time
          ) ||
          (
            !item.start_time &&
            item.end_time
          )
      )
    ) {

      throw new Error(
        "Availability needs both start and end time."
      );
    }

    const priceType =
      $("priceType")?.value ||
      "fixed";

    const priceAmountValue =
      $("priceAmount")?.value ||
      "";

    const minAmountValue =
      $("minAmount")?.value ||
      "";

    const maxAmountValue =
      $("maxAmount")?.value ||
      "";

    if (
      priceType ===
      "range"
    ) {

      if (
        minAmountValue ===
          "" ||
        maxAmountValue ===
          ""
      ) {

        throw new Error(
          "Range pricing needs both minimum and maximum amounts."
        );
      }

      if (
        Number(
          minAmountValue
        ) >
        Number(
          maxAmountValue
        )
      ) {

        throw new Error(
          "Minimum price cannot be greater than maximum price."
        );
      }

    } else if (
      priceType !==
        "custom" &&
      priceAmountValue ===
        ""
    ) {

      throw new Error(
        "Price amount is required for this price type."
      );
    }

    if (
      !selectedOffer &&
      !selectedVersion
    ) {
      return;
    }

    if (
      selectedOffer &&
      isEditorLocked()
    ) {

      throw new Error(
        "This version is read-only. Create a new version before editing it."
      );
    }
  }

  function buildVersionPayload(
    name
  ) {

    return {

      title:
        $("versionTitle")
          ?.value.trim() ||
        name,

      description:
        $("offerDescription")
          ?.value.trim() ||
        null,

      sales_talking_points:
        lines(
          $("talkingPoints")
            ?.value
        ),

      allowed_claims:
        lines(
          $("allowedClaims")
            ?.value
        ),

      restrictions:
        lines(
          $("restrictions")
            ?.value
        ),

      customer_eligibility: {

        text:
          $("eligibility")
            ?.value.trim() ||
          ""

      },

      metadata: {}

    };
  }

  function buildOfferPayload(
    name,
    offerId = null
  ) {

    return {

      client_id:
        clientId(),

      offer_type:
        $("offerType")
          ?.value ||
        "service",

      name,

      slug:
        selectedOffer?.slug ||
        (
          slugify(name) ||
          "offer"
        ) +
          "-" +
          Date.now().toString(
            36
          ),

      short_description:
        $("shortDescription")
          ?.value.trim() ||
        null,

      description:
        $("offerDescription")
          ?.value.trim() ||
        null,

      category_id:
        $("offerCategory")
          ?.value ||
        null

    };
  }

  async function createOfferRecord(
    name
  ) {

    const payload =
      buildOfferPayload(
        name
      );

    const {
      data,
      error
    } =
      await db
        .from("offers")
        .insert({

          ...payload,

          status:
            "draft",

          current_version_id:
            null

        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function getNextVersionNumber(
    offerId
  ) {

    const {
      data,
      error
    } =
      await db
        .from("offer_versions")
        .select(
          "version_number"
        )
        .eq(
          "offer_id",
          offerId
        )
        .order(
          "version_number",
          {
            ascending:
              false
          }
        )
        .limit(1);

    if (error) {
      throw error;
    }

    return (
      Number(
        data?.[0]
          ?.version_number ||
        0
      ) + 1
    );
  }

  async function createVersionRecord({

    offerId,
    sourceVersion =
      null,
    status =
      "draft",
    versionNumber =
      null

  }) {

    const number =
      versionNumber ||
      (
        await getNextVersionNumber(
          offerId
        )
      );

    const sourcePayload =
      sourceVersion
        ? {

            title:
              sourceVersion.title ||
              null,

            description:
              sourceVersion.description ||
              null,

            sales_talking_points:
              Array.isArray(
                sourceVersion.sales_talking_points
              )
                ? sourceVersion.sales_talking_points
                : [],

            allowed_claims:
              Array.isArray(
                sourceVersion.allowed_claims
              )
                ? sourceVersion.allowed_claims
                : [],

            restrictions:
              Array.isArray(
                sourceVersion.restrictions
              )
                ? sourceVersion.restrictions
                : [],

            customer_eligibility:
              sourceVersion.customer_eligibility ||
              {},

            metadata:
              sourceVersion.metadata ||
              {}

          }
        : buildVersionPayload(
            $("offerName")
              ?.value.trim() ||
            "Service"
          );

    const {
      data,
      error
    } =
      await db
        .from("offer_versions")
        .insert({

          offer_id:
            offerId,

          version_number:
            number,

          status,

          title:
            sourcePayload.title ||
            $("offerName")
              ?.value.trim() ||
            "Service",

          description:
            sourcePayload.description ||
            null,

          sales_talking_points:
            sourcePayload.sales_talking_points ||
            [],

          allowed_claims:
            sourcePayload.allowed_claims ||
            [],

          restrictions:
            sourcePayload.restrictions ||
            [],

          customer_eligibility:
            sourcePayload.customer_eligibility ||
            {},

          metadata:
            sourcePayload.metadata ||
            {},

          published_at:
            status ===
            "published"
              ? new Date()
                  .toISOString()
              : null

        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function replaceVersionChildren(
    versionId
  ) {

    const priceType =
      $("priceType")
        ?.value ||
      "fixed";

    const priceAmountValue =
      $("priceAmount")
        ?.value ||
      "";

    const minAmountValue =
      $("minAmount")
        ?.value ||
      "";

    const maxAmountValue =
      $("maxAmount")
        ?.value ||
      "";

    /*
     * Prices can reference variants.
     * Delete prices first, then variants.
     */

    const {
      error: priceDeleteError
    } =
      await db
        .from("offer_prices")
        .delete()
        .eq(
          "offer_version_id",
          versionId
        );

    if (priceDeleteError) {
      throw priceDeleteError;
    }

    const {
      error: variantDeleteError
    } =
      await db
        .from("offer_variants")
        .delete()
        .eq(
          "offer_version_id",
          versionId
        );

    if (variantDeleteError) {
      throw variantDeleteError;
    }

    const {
      error:
        availabilityDeleteError
    } =
      await db
        .from("offer_availability")
        .delete()
        .eq(
          "offer_version_id",
          versionId
        );

    if (availabilityDeleteError) {
      throw availabilityDeleteError;
    }

    let createdVariants =
      [];

    if (variants.length) {

      const {
        data,
        error
      } =
        await db
          .from("offer_variants")
          .insert(

            variants.map(
              (variant, index) => ({

                offer_version_id:
                  versionId,

                name:
                  variant.name,

                sku:
                  variant.sku ||
                  null,

                description:
                  variant.description ||
                  null,

                attributes:
                  variant.attributes ||
                  {},

                is_active:
                  true,

                sort_order:
                  index

              })
            )

          )
          .select();

      if (error) {
        throw error;
      }

      createdVariants =
        data || [];
    }

    /*
     * Price belongs to the version in the current UI.
     * Variant-specific pricing can be added later without
     * changing the version architecture.
     */

    if (
      priceType ===
      "custom"
    ) {

      const {
        error
      } =
        await db
          .from("offer_prices")
          .insert({

            offer_version_id:
              versionId,

            variant_id:
              null,

            amount:
              0,

            currency:
              (
                $("priceCurrency")
                  ?.value.trim()
                  .toUpperCase() ||
                "INR"
              ),

            price_type:
              "custom",

            min_amount:
              null,

            max_amount:
              null,

            billing_period:
              $("billingPeriod")
                ?.value.trim() ||
              null,

            is_active:
              true

          });

      if (error) {
        throw error;
      }

    } else if (
      priceType ===
      "range"
    ) {

      const {
        error
      } =
        await db
          .from("offer_prices")
          .insert({

            offer_version_id:
              versionId,

            variant_id:
              null,

            amount:
              Number(
                minAmountValue
              ),

            currency:
              (
                $("priceCurrency")
                  ?.value.trim()
                  .toUpperCase() ||
                "INR"
              ),

            price_type:
              "range",

            min_amount:
              Number(
                minAmountValue
              ),

            max_amount:
              Number(
                maxAmountValue
              ),

            billing_period:
              $("billingPeriod")
                ?.value.trim() ||
              null,

            is_active:
              true

          });

      if (error) {
        throw error;
      }

    } else if (
      priceAmountValue !==
      ""
    ) {

      const amount =
        Number(
          priceAmountValue
        );

      const {
        error
      } =
        await db
          .from("offer_prices")
          .insert({

            offer_version_id:
              versionId,

            variant_id:
              null,

            amount,

            currency:
              (
                $("priceCurrency")
                  ?.value.trim()
                  .toUpperCase() ||
                "INR"
              ),

            price_type:
              priceType,

            min_amount:
              null,

            max_amount:
              null,

            billing_period:
              $("billingPeriod")
                ?.value.trim() ||
              null,

            is_active:
              true

          });

      if (error) {
        throw error;
      }
    }

    if (availability.length) {

      const {
        error
      } =
        await db
          .from("offer_availability")
          .insert(

            availability.map(
              (item) => ({

                offer_version_id:
                  versionId,

                day_of_week:
                  item.day_of_week,

                start_time:
                  item.start_time,

                end_time:
                  item.end_time,

                timezone:
                  item.timezone ||
                  "Asia/Kolkata",

                capacity:
                  item.capacity ??
                  null,

                is_available:
                  item.is_available !==
                  false,

                notes:
                  item.notes ||
                  null

              })
            )

          );

      if (error) {
        throw error;
      }
    }
  }

  async function updateVersionRecord(
    versionId,
    payload
  ) {

    const {
      data,
      error
    } =
      await db
        .from("offer_versions")
        .update({

          ...payload,

          status:
            "draft",

          published_at:
            null

        })
        .eq(
          "id",
          versionId
        )
        .select()
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function archiveOtherPublishedVersions(
    offerId,
    keepVersionId
  ) {

    const {
      error
    } =
      await db
        .from("offer_versions")
        .update({

          status:
            "archived"

        })
        .eq(
          "offer_id",
          offerId
        )
        .eq(
          "status",
          "published"
        )
        .neq(
          "id",
          keepVersionId
        );

    if (error) {
      throw error;
    }
  }

  async function publishVersion(
  offerId,
  versionId
) {

  const {
    data,
    error
  } = await db.rpc(
    "client_publish_offer_version",
    {
      p_version_id: versionId
    }
  );

  if (error) {
    throw error;
  }

  if (!data?.ok) {
    throw new Error(
      "The offer could not be published."
    );
  }

  const {
    data: publishedVersion,
    error: versionError
  } = await db
    .from("offer_versions")
    .select("*")
    .eq("id", versionId)
    .eq("offer_id", offerId)
    .single();

  if (versionError) {
    throw versionError;
  }

  return publishedVersion;
  }
  
    const {
      data:
        publishedVersion,
      error:
        publishError
    } =
      await db
        .from("offer_versions")
        .update({

          status:
            "published",

          published_at:
            now

        })
        .eq(
          "id",
          versionId
        )
        .select()
        .single();

    if (publishError) {
      throw publishError;
    }

    const {
      error:
        offerError
    } =
      await db
        .from("offers")
        .update({

          status:
            "active",

          current_version_id:
            versionId,

          updated_at:
            now

        })
        .eq(
          "id",
          offerId
        )
        .eq(
          "client_id",
          clientId()
        );

    if (offerError) {
      throw offerError;
    }

    return publishedVersion;
  }

  async function saveOffer(
    publish
  ) {

    if (saveInProgress) {
      return;
    }

    syncEditorArrays();
    validateEditor();

    setBusy(true);

    try {

      const name =
        $("offerName")
          .value.trim();

      let offer =
        selectedOffer;

      if (!offer) {

        offer =
          await createOfferRecord(
            name
          );

        selectedOffer =
          offer;

        selectedVersion =
          null;
      }

      const offerPayload =
        buildOfferPayload(
          name,
          offer.id
        );

      const {
        data:
          updatedOffer,
        error:
          offerUpdateError
      } =
        await db
          .from("offers")
          .update(
            offerPayload
          )
          .eq(
            "id",
            offer.id
          )
          .eq(
            "client_id",
            clientId()
          )
          .select()
          .single();

      if (offerUpdateError) {
        throw offerUpdateError;
      }

      offer =
        updatedOffer;

      selectedOffer =
        updatedOffer;

      /*
       * Published/review/approved versions are immutable here.
       * The UI normally locks them, but this guard also protects
       * against a stale client state.
       */

      if (
        !selectedVersion ||
        normalizeVersionStatus(
          selectedVersion.status
        ) !==
          EDITABLE_VERSION_STATUS
      ) {

        const sourceVersion =
          selectedVersion
            ? await loadVersionRecord(
                selectedVersion.id
              )
            : null;

        selectedVersion =
          await createVersionRecord({

            offerId:
              offer.id,

            sourceVersion,

            status:
              "draft"

          });
      }

      const versionPayload =
        buildVersionPayload(
          name
        );

      selectedVersion =
        await updateVersionRecord(

          selectedVersion.id,

          versionPayload

        );

      await replaceVersionChildren(
        selectedVersion.id
      );

      if (publish) {

        selectedVersion =
          await publishVersion(

            offer.id,

            selectedVersion.id

          );

        showMessage(

          `Version ${selectedVersion.version_number} published successfully.`,

          "success"

        );

      } else {

        const shouldRemainActive =
          Boolean(
            offer.current_version_id &&
            offer.status ===
              "active"
          );

        const {
          error
        } =
          await db
            .from("offers")
            .update({

              status:
                shouldRemainActive
                  ? "active"
                  : "draft",

              updated_at:
                new Date()
                  .toISOString()

            })
            .eq(
              "id",
              offer.id
            )
            .eq(
              "client_id",
              clientId()
            );

        if (error) {
          throw error;
        }

        showMessage(

          `Version ${selectedVersion.version_number} saved as draft.`,

          "success"

        );
      }

      await loadCatalog({
        preserveSelection:
          true
      });

      const freshOffer =
        offers.find(
          (item) =>
            item.id ===
            offer.id
        );

      if (freshOffer) {

        await selectOffer(

          freshOffer,

          false,

          selectedVersion?.id ||
            null

        );
      }

    } finally {

      setBusy(false);

      applyEditorLockState();

    }
  }

  async function loadVersionRecord(
    versionId
  ) {

    if (!versionId) {
      return null;
    }

    const {
      data,
      error
    } =
      await db
        .from("offer_versions")
        .select(
          "id,offer_id,version_number,status,title,description,sales_talking_points,allowed_claims,restrictions,customer_eligibility,metadata,published_at,created_at,updated_at"
        )
        .eq(
          "id",
          versionId
        )
        .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  async function createNewVersion() {

    if (!selectedOffer) {
      return;
    }

    if (
      selectedOffer.status ===
      "archived"
    ) {
      return;
    }

    if (saveInProgress) {
      return;
    }

    syncEditorArrays();

    setBusy(true);

    try {

      const name =
        $("offerName")
          .value.trim();

      const sourceVersion =
        selectedVersion
          ? await loadVersionRecord(
              selectedVersion.id
            )
          : null;

      let newVersion =
        await createVersionRecord({

          offerId:
            selectedOffer.id,

          sourceVersion,

          status:
            "draft"

        });

      /*
       * Re-apply current editor fields so
       * unsaved form changes are included.
       */

      newVersion =
        await updateVersionRecord(

          newVersion.id,

          buildVersionPayload(
            name
          )

        );

      selectedVersion =
        newVersion;

      await replaceVersionChildren(
        newVersion.id
      );

      offerVersionsByOfferId.set(

        selectedOffer.id,

        [
          ...(
            offerVersionsByOfferId.get(
              selectedOffer.id
            ) || []
          ),

          newVersion

        ].sort(
          versionSort
        )

      );

      showMessage(

        `Draft version ${newVersion.version_number} created.`,

        "success"

      );

      await loadCatalog({

        preserveSelection:
          true

      });

      const freshOffer =
        offers.find(
          (offer) =>
            offer.id ===
            selectedOffer.id
        );

      if (freshOffer) {

        await selectOffer(

          freshOffer,

          false,

          newVersion.id

        );
      }

    } finally {

      setBusy(false);

      applyEditorLockState();

    }
  }

  async function addCategory() {

    if (saveInProgress) {
      return;
    }

    const name =
      $("categoryName")
        ?.value.trim();

    if (!name) {
      return;
    }

    setBusy(true);

    try {

      const slug =
        slugify(name) ||
        "category";

      const {
        error
      } =
        await db
          .from("offer_categories")
          .insert({

            client_id:
              clientId(),

            name,

            slug:
              `${slug}-${Date.now().toString(36)}`

          });

      if (error) {
        throw error;
      }

      $("categoryName").value =
        "";

      showMessage(
        "Category created.",
        "success"
      );

      await loadCatalog({

        preserveSelection:
          true

      });

    } finally {

      setBusy(false);

      applyEditorLockState();

    }
  }

  async function archiveOffer() {

    if (
      !selectedOffer ||
      saveInProgress
    ) {
      return;
    }

    if (
      !window.confirm(
        "Archive this offer?"
      )
    ) {
      return;
    }

    setBusy(true);

    try {

      const {
        error
      } =
        await db
          .from("offers")
          .update({

            status:
              "archived",

            updated_at:
              new Date()
                .toISOString()

          })
          .eq(
            "id",
            selectedOffer.id
          )
          .eq(
            "client_id",
            clientId()
          );

      if (error) {
        throw error;
      }

      showMessage(
        "Offer archived.",
        "success"
      );

      clearEditorSelection();

      await loadCatalog({
        preserveSelection:
          false
      });

    } finally {

      setBusy(false);

    }
  }

  function handleError(
    error
  ) {

    console.error(
      error
    );

    showMessage(
      error?.message ||
        String(error),
      "error"
    );
  }

  function bindEvents() {

    $("newOfferBtn")
      ?.addEventListener(
        "click",
        resetEditor
      );

    $("emptyNewBtn")
      ?.addEventListener(
        "click",
        resetEditor
      );

    $("closeEditorBtn")
      ?.addEventListener(
        "click",
        () => {

          clearEditorSelection();

          $("offerForm").hidden =
            true;

          $("editorEmpty").hidden =
            false;

        }
      );

    $("refreshBtn")
      ?.addEventListener(
        "click",
        () => {

          loadCatalog({
            preserveSelection:
              true
          }).catch(
            handleError
          );

        }
      );

    $("addCategoryBtn")
      ?.addEventListener(
        "click",
        () => {

          addCategory()
            .catch(
              handleError
            );

        }
      );

    $("priceType")
      ?.addEventListener(
        "change",
        updatePriceRange
      );

    $("addVariantBtn")
      ?.addEventListener(
        "click",
        () => {

          if (
            isEditorLocked() ||
            saveInProgress
          ) {
            return;
          }

          syncEditorArrays();

          variants.push({

            name:
              "",

            sku:
              null,

            description:
              null,

            attributes:
              {}

          });

          renderVariants();

        }
      );

    $("addAvailabilityBtn")
      ?.addEventListener(
        "click",
        () => {

          if (
            isEditorLocked() ||
            saveInProgress
          ) {
            return;
          }

          syncEditorArrays();

          availability.push({

            day_of_week:
              null,

            start_time:
              null,

            end_time:
              null,

            timezone:
              "Asia/Kolkata",

            capacity:
              null,

            is_available:
              true,

            notes:
              null

          });

          renderAvailability();

        }
      );

    $("newVersionBtn")
      ?.addEventListener(
        "click",
        () => {

          createNewVersion()
            .catch(
              handleError
            );

        }
      );

    $("deleteOfferBtn")
      ?.addEventListener(
        "click",
        () => {

          archiveOffer()
            .catch(
              handleError
            );

        }
      );

    $("saveDraftBtn")
      ?.addEventListener(
        "click",
        () => {

          saveOffer(false)
            .catch(
              handleError
            );

        }
      );

    $("offerForm")
      ?.addEventListener(
        "submit",
        (event) => {

          event.preventDefault();

          saveOffer(true)
            .catch(
              handleError
            );

        }
      );

    $("publishToggle")
      ?.addEventListener(
        "change",
        () => {

          showMessage(

            "Use Save Draft or Save & Publish to apply publication changes.",

            "info"

          );

        }
      );
  }

  window.GLIMEServices = {

    refresh:
      () =>
        loadCatalog({
          preserveSelection:
            true
        }),

    createNewVersion,

    selectOffer

  };

  (async () => {

    try {

      client =
        await getClient();

      if (!client) {
        return;
      }

      $("clientBadge").textContent =
        `${
          client.client_name ||
          client.full_name ||
          client.name ||
          "Client"
        } · ${
          client.client_id
        }`;

      bindEvents();

      resetEditor();

      await loadCatalog({

        preserveSelection:
          false

      });

    } catch (error) {

      console.error(

        "Services module initialization failed:",

        error

      );

      showMessage(

        error.message ||
          String(error),

        "error"

      );

    }

  })();

})();
