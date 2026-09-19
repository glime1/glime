(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const db =
    window.supabase.createClient(
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


  const $ = (id) =>
    document.getElementById(id);


  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(
        /[&<>"']/g,
        (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[char])
      );


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
    Array.isArray(value)
      ? value.join("\n")
      : "";


  const clientId = () =>
    client?.client_id;


  function showMessage(
    text,
    type = "info"
  ) {

    const element =
      $("message");

    if (!element) {
      return;
    }

    element.textContent =
      text || "";

    element.className =
      "message " + type;

    element.hidden =
      !text;
  }


  async function getClient() {

    const {
      data,
      error
    } =
      await db.auth.getSession();

    if (error) {
      throw error;
    }

    const user =
      data?.session?.user;

    if (!user) {

      window.location.replace(
        "login.html"
      );

      return null;
    }


    const {
      data: clientData,
      error: clientError
    } =
      await db
        .from("client_data")
        .select(
          "id,client_id,client_name,full_name,name,email"
        )
        .eq(
          "auth_user_id",
          user.id
        )
        .maybeSingle();


    if (clientError) {
      throw clientError;
    }


    if (!clientData?.client_id) {

      throw new Error(
        "Authenticated client profile was not found."
      );

    }


    return clientData;
  }


  async function loadCatalog() {

    const [
      categoryResult,
      offerResult
    ] =
      await Promise.all([

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
            "*, offer_categories:category_id(id,name), offer_versions(*)"
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


    renderCategories();

    renderOffers();


    if (selectedOffer) {

      const freshOffer =
        offers.find(
          (item) =>
            item.id ===
            selectedOffer.id
        );


      if (freshOffer) {

        await selectOffer(
          freshOffer,
          false
        );

      }

    }

  }


  function renderCategories() {

    const categoryList =
      $("categoryList");


    if (!categoryList) {
      return;
    }


    if (!categories.length) {

      categoryList.innerHTML =
        '<span class="muted">No categories yet</span>';

    } else {

      categoryList.innerHTML =
        categories
          .map(
            (category) => `
              <span class="category-pill">
                ${escapeHtml(category.name)}
              </span>
            `
          )
          .join("");

    }


    const categorySelect =
      $("offerCategory");


    if (!categorySelect) {
      return;
    }


    categorySelect.innerHTML =
      `
        <option value="">
          No category
        </option>
      ` +
      categories
        .map(
          (category) => `
            <option value="${escapeHtml(category.id)}">
              ${escapeHtml(category.name)}
            </option>
          `
        )
        .join("");


    if (selectedOffer) {

      categorySelect.value =
        selectedOffer.category_id ||
        "";

    }

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

      list.innerHTML =
        `
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

            const versions =
              offer.offer_versions ||
              [];


            const currentVersion =
              versions.find(
                (version) =>
                  version.id ===
                  offer.current_version_id
              ) ||
              versions
                .slice()
                .sort(
                  (a, b) =>
                    (
                      b.version_number ||
                      0
                    ) -
                    (
                      a.version_number ||
                      0
                    )
                )[0];


            const displayStatus =
              offer.status === "active" &&
              currentVersion?.status ===
                "published"
                ? "Published"
                : (
                    offer.status ||
                    "draft"
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
                        offer
                          .offer_categories
                          ?.name ||
                        "Uncategorized"
                      )}
                    </span>

                    <span
                      class="status ${displayStatus.toLowerCase()}"
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


              if (offer) {

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

            }
          );

        }
      );

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


    const clearFields = [
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
    ];


    clearFields.forEach(
      (id) => {

        if ($(id)) {
          $(id).value = "";
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

    updatePriceRange();

  }


  async function selectOffer(
    offer,
    scroll = true
  ) {

    if (!offer) {
      return;
    }


    selectedOffer =
      offer;


    const versions =
      (
        offer.offer_versions ||
        []
      )
        .slice()
        .sort(
          (a, b) =>
            (
              b.version_number ||
              0
            ) -
            (
              a.version_number ||
              0
            )
        );


    selectedVersion =
      versions.find(
        (version) =>
          version.id ===
          offer.current_version_id
      ) ||
      versions[0] ||
      null;


    $("editorEmpty").hidden =
      true;

    $("offerForm").hidden =
      false;


    $("editorTitle").textContent =
      offer.name;


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
      offer.name || "";

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


    await loadVersionData();


    renderOffers();

    renderCategories();


    if (
      scroll &&
      window.innerWidth < 951
    ) {

      $("offerForm").scrollIntoView({
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


      variants = [];

      availability = [];


      renderVariants();

      renderAvailability();

      return;
    }


    $("versionLabel").textContent =
      `Version ${version.version_number}`;


    $("versionStatus").textContent =
      version.status ||
      "draft";


    $("versionStatus").className =
      "status " +
      (
        version.status ||
        "draft"
      );


    $("versionTitle").value =
      version.title ||
      "";


    $("eligibility").value =
      version.customer_eligibility
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
      selectedOffer.status ===
        "active";


    updatePriceRange();

    renderVariants();

    renderAvailability();

  }


  function renderVariants() {

    const list =
      $("variantList");


    if (!variants.length) {

      list.innerHTML =
        `
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
              >

              <input
                data-variant-sku="${index}"
                value="${escapeHtml(
                  variant.sku || ""
                )}"
                placeholder="SKU (optional)"
              >

              <button
                type="button"
                class="remove-btn"
                data-remove-variant="${index}"
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

              variants.splice(
                Number(
                  button.dataset.removeVariant
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


    if (!availability.length) {

      list.innerHTML =
        `
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
                )}"
              >


              <input
                type="time"
                data-availability-end="${index}"
                value="${escapeHtml(
                  item.end_time ||
                    ""
                )}"
              >


              <input
                data-availability-notes="${index}"
                value="${escapeHtml(
                  item.notes ||
                    ""
                )}"
                placeholder="Notes"
              >


              <button
                type="button"
                class="remove-btn"
                data-remove-availability="${index}"
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

              availability.splice(
                Number(
                  button.dataset.removeAvailability
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
            document.querySelector(
              `[data-variant-name="${index}"]`
            )?.value.trim() ||
            "",

          sku:
            document.querySelector(
              `[data-variant-sku="${index}"]`
            )?.value.trim() ||
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
              document.querySelector(
                `[data-availability-start="${index}"]`
              )?.value ||
              null,

            end_time:
              document.querySelector(
                `[data-availability-end="${index}"]`
              )?.value ||
              null,

            notes:
              document.querySelector(
                `[data-availability-notes="${index}"]`
              )?.value.trim() ||
              null

          };

        }
      );

  }


  function updatePriceRange() {

    $("rangeRow").hidden =
      $("priceType").value !==
      "range";

  }


  async function saveOffer(
    publish
  ) {

    syncEditorArrays();


    const name =
      $("offerName")
        .value
        .trim();


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


    const offerPayload = {

      client_id:
        clientId(),

      offer_type:
        $("offerType").value,

      name:
        name,

      slug:
        selectedOffer?.slug ||
        (
          slugify(name) +
          "-" +
          Date.now().toString(36)
        ),

      short_description:
        $("shortDescription")
          .value
          .trim() ||
        null,

      description:
        $("offerDescription")
          .value
          .trim() ||
        null,

      category_id:
        $("offerCategory").value ||
        null,

      status:
        publish
          ? "active"
          : "draft"

    };


    let offerId =
      selectedOffer?.id;


    if (offerId) {

      const {
        error
      } =
        await db
          .from("offers")
          .update(
            offerPayload
          )
          .eq(
            "id",
            offerId
          )
          .eq(
            "client_id",
            clientId()
          );


      if (error) {
        throw error;
      }

    } else {

      const {
        data,
        error
      } =
        await db
          .from("offers")
          .insert(
            offerPayload
          )
          .select()
          .single();


      if (error) {
        throw error;
      }


      offerId =
        data.id;

    }


    let version =
      selectedVersion;


    if (!version) {

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
              ascending: false
            }
          )
          .limit(1);


      if (error) {
        throw error;
      }


      const nextVersion =
        (
          data?.[0]
            ?.version_number ||
          0
        ) + 1;


      const {
        data: createdVersion,
        error: versionError
      } =
        await db
          .from("offer_versions")
          .insert({

            offer_id:
              offerId,

            version_number:
              nextVersion,

            status:
              publish
                ? "published"
                : "draft",

            title:
              $("versionTitle")
                .value
                .trim() ||
              name,

            description:
              $("offerDescription")
                .value
                .trim() ||
              null,

            sales_talking_points:
              lines(
                $("talkingPoints")
                  .value
              ),

            allowed_claims:
              lines(
                $("allowedClaims")
                  .value
              ),

            restrictions:
              lines(
                $("restrictions")
                  .value
              ),

            customer_eligibility: {
              text:
                $("eligibility")
                  .value
                  .trim()
            }

          })
          .select()
          .single();


      if (versionError) {
        throw versionError;
      }


      version =
        createdVersion;

      selectedVersion =
        version;

    } else {

      const {
        error
      } =
        await db
          .from("offer_versions")
          .update({

            status:
              publish
                ? "published"
                : "draft",

            title:
              $("versionTitle")
                .value
                .trim() ||
              name,

            description:
              $("offerDescription")
                .value
                .trim() ||
              null,

            sales_talking_points:
              lines(
                $("talkingPoints")
                  .value
              ),

            allowed_claims:
              lines(
                $("allowedClaims")
                  .value
              ),

            restrictions:
              lines(
                $("restrictions")
                  .value
              ),

            customer_eligibility: {
              text:
                $("eligibility")
                  .value
                  .trim()
            },

            published_at:
              publish
                ? new Date().toISOString()
                : null

          })
          .eq(
            "id",
            version.id
          );


      if (error) {
        throw error;
      }

    }


    /*
     * PRICE
     */

    const {
      data: existingPrices,
      error: priceLookupError
    } =
      await db
        .from("offer_prices")
        .select("id")
        .eq(
          "offer_version_id",
          version.id
        );


    if (priceLookupError) {
      throw priceLookupError;
    }


    if (existingPrices?.length) {

      const {
        error
      } =
        await db
          .from("offer_prices")
          .delete()
          .eq(
            "offer_version_id",
            version.id
          );


      if (error) {
        throw error;
      }

    }


    if (
      $("priceAmount").value !==
      ""
    ) {

      const {
        error
      } =
        await db
          .from("offer_prices")
          .insert({

            offer_version_id:
              version.id,

            amount:
              Number(
                $("priceAmount").value
              ),

            currency:
              (
                $("priceCurrency")
                  .value
                  .trim()
                  .toUpperCase() ||
                "INR"
              ),

            price_type:
              $("priceType").value,

            billing_period:
              $("billingPeriod")
                .value
                .trim() ||
              null,

            min_amount:
              $("minAmount").value ===
              ""
                ? null
                : Number(
                    $("minAmount").value
                  ),

            max_amount:
              $("maxAmount").value ===
              ""
                ? null
                : Number(
                    $("maxAmount").value
                  ),

            is_active:
              true

          });


      if (error) {
        throw error;
      }

    }


    /*
     * VARIANTS
     */

    {

      const {
        error
      } =
        await db
          .from("offer_variants")
          .delete()
          .eq(
            "offer_version_id",
            version.id
          );


      if (error) {
        throw error;
      }

    }


    if (variants.length) {

      const {
        error
      } =
        await db
          .from("offer_variants")
          .insert(
            variants.map(
              (variant, index) => ({

                offer_version_id:
                  version.id,

                name:
                  variant.name,

                sku:
                  variant.sku ||
                  null,

                is_active:
                  true,

                sort_order:
                  index

              })
            )
          );


      if (error) {
        throw error;
      }

    }


    /*
     * AVAILABILITY
     */

    {

      const {
        error
      } =
        await db
          .from("offer_availability")
          .delete()
          .eq(
            "offer_version_id",
            version.id
          );


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
                  version.id,

                day_of_week:
                  item.day_of_week,

                start_time:
                  item.start_time,

                end_time:
                  item.end_time,

                timezone:
                  "Asia/Kolkata",

                is_available:
                  true,

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


    /*
     * CURRENT VERSION
     */

    const {
      error: offerUpdateError
    } =
      await db
        .from("offers")
        .update({

          status:
            publish
              ? "active"
              : "draft",

          current_version_id:
            version.id

        })
        .eq(
          "id",
          offerId
        )
        .eq(
          "client_id",
          clientId()
        );


    if (offerUpdateError) {
      throw offerUpdateError;
    }


    if (publish) {

      const {
        error
      } =
        await db
          .from("offer_versions")
          .update({

            status:
              "published",

            published_at:
              new Date().toISOString()

          })
          .eq(
            "id",
            version.id
          );


      if (error) {
        throw error;
      }

    }


    showMessage(
      publish
        ? "Offer published successfully."
        : "Draft saved successfully.",
      "success"
    );


    await loadCatalog();

  }


  async function createNewVersion() {

    if (!selectedOffer) {
      return;
    }


    syncEditorArrays();


    const maxVersion =
      (
        selectedOffer
          .offer_versions ||
        []
      )
        .reduce(
          (
            max,
            version
          ) =>
            Math.max(
              max,
              version.version_number ||
                0
            ),
          0
        );


    const {
      data,
      error
    } =
      await db
        .from("offer_versions")
        .insert({

          offer_id:
            selectedOffer.id,

          version_number:
            maxVersion + 1,

          status:
            "draft",

          title:
            $("versionTitle")
              .value
              .trim() ||
            selectedOffer.name,

          description:
            $("offerDescription")
              .value
              .trim() ||
            null,

          sales_talking_points:
            lines(
              $("talkingPoints")
                .value
            ),

          allowed_claims:
            lines(
              $("allowedClaims")
                .value
            ),

          restrictions:
            lines(
              $("restrictions")
                .value
            ),

          customer_eligibility: {
            text:
              $("eligibility")
                .value
                .trim()
          }

        })
        .select()
        .single();


    if (error) {
      throw error;
    }


    selectedVersion =
      data;


    showMessage(
      "New draft version created.",
      "success"
    );


    await loadCatalog();

  }


  async function addCategory() {

    const name =
      $("categoryName")
        .value
        .trim();


    if (!name) {
      return;
    }


    const {
      error
    } =
      await db
        .from("offer_categories")
        .insert({

          client_id:
            clientId(),

          name:
            name,

          slug:
            slugify(name) +
            "-" +
            Date.now().toString(36)

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


    await loadCatalog();

  }


  async function archiveOffer() {

    if (!selectedOffer) {
      return;
    }


    if (
      !window.confirm(
        "Archive this offer?"
      )
    ) {

      return;

    }


    const {
      error
    } =
      await db
        .from("offers")
        .update({
          status: "archived"
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


    selectedOffer = null;

    $("offerForm").hidden =
      true;

    $("editorEmpty").hidden =
      false;


    showMessage(
      "Offer archived.",
      "success"
    );


    await loadCatalog();

  }


  /*
   * EVENTS
   */

  $("newOfferBtn")
    .addEventListener(
      "click",
      resetEditor
    );


  $("emptyNewBtn")
    .addEventListener(
      "click",
      resetEditor
    );


  $("closeEditorBtn")
    .addEventListener(
      "click",
      () => {

        selectedOffer =
          null;

        $("offerForm").hidden =
          true;

        $("editorEmpty").hidden =
          false;

        renderOffers();

      }
    );


  $("refreshBtn")
    .addEventListener(
      "click",
      () => {

        loadCatalog()
          .catch(
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


  $("addCategoryBtn")
    .addEventListener(
      "click",
      () => {

        addCategory()
          .catch(
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


  $("priceType")
    .addEventListener(
      "change",
      updatePriceRange
    );


  $("addVariantBtn")
    .addEventListener(
      "click",
      () => {

        syncEditorArrays();

        variants.push({
          name: "",
          sku: null
        });

        renderVariants();

      }
    );


  $("addAvailabilityBtn")
    .addEventListener(
      "click",
      () => {

        syncEditorArrays();

        availability.push({

          day_of_week:
            null,

          start_time:
            null,

          end_time:
            null,

          notes:
            null

        });

        renderAvailability();

      }
    );


  $("newVersionBtn")
    .addEventListener(
      "click",
      () => {

        createNewVersion()
          .catch(
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


  $("deleteOfferBtn")
    .addEventListener(
      "click",
      () => {

        archiveOffer()
          .catch(
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


  $("saveDraftBtn")
    .addEventListener(
      "click",
      () => {

        saveOffer(false)
          .catch(
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


  $("offerForm")
    .addEventListener(
      "submit",
      (event) => {

        event.preventDefault();

        saveOffer(true)
          .catch(
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


  /*
   * INITIALIZE
   */

  (async () => {

    try {

      client =
        await getClient();


      if (!client) {
        return;
      }


      $("clientBadge").textContent =
        `${client.client_name ||
          client.full_name ||
          client.name ||
          "Client"} · ${
          client.client_id
        }`;


      await loadCatalog();


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
