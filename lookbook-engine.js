/* GLIME Lookbook Engine - Direct Render Version + Enquiry/Order */
(function () {
  "use strict";

  const script = document.currentScript;
  if (!script) return;

  const targetId =
    script.dataset.target || "glime-lookbook";

  const target =
    document.getElementById(targetId);

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const SUBMIT_URL =
    SUPABASE_URL +
    "/functions/v1/lookbook-submit";

  if (!target) {
    console.error(
      "GLIME Lookbook: target element not found:",
      targetId
    );
    return;
  }

  const esc = v =>
    String(v ?? "").replace(
      /[&<>"']/g,
      c =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[c])
    );

  const domain = () =>
    window.location.hostname
      .toLowerCase()
      .replace(/^www\./, "");

  const storageUrl = path =>
    path
      ? SUPABASE_URL +
        "/storage/v1/object/public/lookbook-media/" +
        path
          .split("/")
          .map(encodeURIComponent)
          .join("/")
      : "";

  async function apiFetch(
    path,
    options = {}
  ) {
    const response = await fetch(
      SUPABASE_URL + path,
      {
        ...options,
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization":
            "Bearer " + SUPABASE_KEY,
          "Content-Type":
            "application/json",
          ...(options.headers || {})
        }
      }
    );

    if (!response.ok) {
      let message =
        "Request failed: " +
        response.status;

      try {
        const error =
          await response.json();

        if (error.message) {
          message = error.message;
        }
      } catch (_) {}

      throw new Error(message);
    }

    return response.json();
  }

  /*
   * Secure Enquiry / Order submission.
   * The actual client/boutique is resolved
   * server-side from the current domain.
   */
  async function submitLead(payload) {
    const response = await fetch(
      SUBMIT_URL,
      {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          ...payload,
          domain: domain()
        })
      }
    );

    const data =
      await response
        .json()
        .catch(() => ({}));

    if (
      !response.ok ||
      !data.ok
    ) {
      throw new Error(
        data.error ||
        "Unable to submit request"
      );
    }

    return data;
  }

  function addStyles() {
    if (
      document.getElementById(
        "glime-lookbook-engine-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "glime-lookbook-engine-styles";

    style.textContent = `
      .glime-lb{
        width:100%;
        max-width:1200px;
        margin:0 auto;
        padding:30px 18px;
        box-sizing:border-box;
        font-family:Arial,Helvetica,sans-serif;
        color:#222
      }

      .glime-lb *{
        box-sizing:border-box
      }

      .glime-lb-head{
        text-align:center;
        margin-bottom:28px
      }

      .glime-lb-head h2{
        margin:0;
        font-size:32px;
        line-height:1.2;
        font-weight:700
      }

      .glime-lb-head p{
        margin:10px auto 0;
        max-width:700px;
        color:#666;
        font-size:15px;
        line-height:1.6
      }

      .glime-lb-search{
        margin:22px auto 0;
        max-width:650px
      }

      .glime-lb-search input{
        width:100%;
        padding:14px 16px;
        border:1px solid #ddd;
        border-radius:10px;
        background:#fff;
        color:#222;
        font-size:14px;
        outline:0
      }

      .glime-lb-collections{
        display:flex;
        gap:9px;
        flex-wrap:wrap;
        margin-bottom:28px;
        justify-content:center
      }

      .glime-lb-collection{
        border:1px solid #ddd;
        background:#fff;
        color:#444;
        border-radius:22px;
        padding:9px 15px;
        cursor:pointer;
        font-size:13px
      }

      .glime-lb-collection.active,
      .glime-lb-collection:hover{
        background:#222;
        color:#fff;
        border-color:#222
      }

      .glime-lb-title{
        margin:0 0 16px;
        font-size:21px;
        font-weight:700
      }

      .glime-lb-grid{
        display:grid;
        grid-template-columns:
          repeat(3,minmax(0,1fr));
        gap:20px
      }

      .glime-lb-card{
        overflow:hidden;
        background:#fff;
        border:1px solid #e5e5e5;
        border-radius:12px
      }

      .glime-lb-image{
        width:100%;
        aspect-ratio:1;
        object-fit:cover;
        display:block;
        background:#f3f3f3
      }

      .glime-lb-body{
        padding:15px
      }

      .glime-lb-name{
        margin:0;
        font-size:17px;
        font-weight:700
      }

      .glime-lb-desc{
        margin:7px 0 0;
        color:#666;
        font-size:13px;
        line-height:1.5
      }

      .glime-lb-meta{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        margin-top:11px
      }

      .glime-lb-tag{
        display:inline-block;
        padding:5px 8px;
        border:1px solid #ddd;
        border-radius:14px;
        font-size:11px;
        color:#555
      }

      .glime-lb-actions{
        margin-top:14px;
        display:grid;
        gap:7px
      }

      .glime-lb-button{
        width:100%;
        border:1px solid #222;
        background:#222;
        color:#fff;
        border-radius:8px;
        padding:10px 12px;
        cursor:pointer;
        font-size:12px;
        font-weight:600
      }

      .glime-lb-button.secondary{
        background:#fff;
        color:#222
      }

      .glime-lb-button:disabled{
        opacity:.6;
        cursor:not-allowed
      }

      .glime-lb-status{
        text-align:center;
        padding:20px 10px;
        color:#777;
        font-size:13px
      }

      .glime-lb-empty{
        padding:30px 15px;
        border:1px dashed #ccc;
        border-radius:10px;
        text-align:center;
        color:#777;
        font-size:14px;
        grid-column:1/-1
      }

      .glime-lb-modal{
        position:fixed;
        inset:0;
        z-index:999999;
        display:none;
        align-items:center;
        justify-content:center;
        padding:18px;
        background:rgba(0,0,0,.72)
      }

      .glime-lb-modal.show{
        display:flex
      }

      .glime-lb-modal-box{
        width:min(900px,100%);
        max-height:92vh;
        overflow:auto;
        background:#fff;
        border-radius:14px;
        padding:20px;
        position:relative
      }

      .glime-lb-close{
        position:absolute;
        right:14px;
        top:14px;
        border:0;
        background:#222;
        color:#fff;
        width:34px;
        height:34px;
        border-radius:50%;
        cursor:pointer;
        font-size:18px
      }

      .glime-lb-modal-title{
        margin:5px 45px 10px 0;
        font-size:24px
      }

      .glime-lb-modal-desc{
        color:#666;
        line-height:1.6;
        font-size:14px
      }

      .glime-lb-gallery{
        display:grid;
        grid-template-columns:
          repeat(3,minmax(0,1fr));
        gap:9px;
        margin:18px 0
      }

      .glime-lb-gallery img{
        width:100%;
        aspect-ratio:1;
        object-fit:cover;
        border-radius:8px;
        display:block
      }

      /* Enquiry / Order */
      .glime-lb-lead{
        margin-top:18px;
        padding-top:16px;
        border-top:1px solid #eee
      }

      .glime-lb-lead h3{
        margin:0 0 10px;
        font-size:18px
      }

      .glime-lb-form{
        display:grid;
        gap:9px;
        margin-top:12px
      }

      .glime-lb-form input,
      .glime-lb-form textarea{
        width:100%;
        padding:11px 12px;
        border:1px solid #ddd;
        border-radius:8px;
        background:#fff;
        color:#222;
        font:inherit;
        font-size:13px;
        outline:0
      }

      .glime-lb-form textarea{
        min-height:85px;
        resize:vertical
      }

      .glime-lb-form-grid{
        display:grid;
        grid-template-columns:
          1fr 1fr;
        gap:9px
      }

      .glime-lb-form-note{
        font-size:11px;
        color:#777;
        line-height:1.45
      }

      .glime-lb-form-error{
        color:#b42318;
        font-size:12px;
        display:none;
        line-height:1.5
      }

      .glime-lb-form-success{
        color:#067647;
        font-size:12px;
        display:none;
        line-height:1.5
      }

      @media(max-width:850px){
        .glime-lb-grid{
          grid-template-columns:
            repeat(2,minmax(0,1fr))
        }
      }

      @media(max-width:600px){
        .glime-lb{
          padding:24px 12px
        }

        .glime-lb-head h2{
          font-size:25px
        }

        .glime-lb-grid{
          grid-template-columns:1fr
        }

        .glime-lb-gallery{
          grid-template-columns:
            repeat(2,minmax(0,1fr))
        }

        .glime-lb-form-grid{
          grid-template-columns:1fr
        }
      }
    `;

    document.head.appendChild(style);
  }

  let lookbook = null;
  let collections = [];
  let items = [];
  let media = [];

  let selectedCollection = null;
  let searchTerm = "";

  async function resolveLookbook() {
    const result =
      await apiFetch(
        "/rest/v1/rpc/" +
        "get_public_lookbook_by_domain",
        {
          method:"POST",
          body:JSON.stringify({
            p_domain:domain()
          })
        }
      );

    return Array.isArray(result) &&
      result.length
      ? result[0]
      : null;
  }

  async function loadLookbook(id) {
    const rows =
      await apiFetch(
        "/rest/v1/lookbooks?select=*" +
        "&id=eq." +
        encodeURIComponent(id) +
        "&enabled=eq.true&limit=1"
      );

    return rows[0] || null;
  }

  async function loadData() {

    collections =
      await apiFetch(
        "/rest/v1/lookbook_collections" +
        "?select=*" +
        "&lookbook_id=eq." +
        encodeURIComponent(
          lookbook.id
        ) +
        "&published=eq.true" +
        "&order=sort_order.asc,created_at.asc"
      );

    items =
      await apiFetch(
        "/rest/v1/lookbook_items" +
        "?select=*" +
        "&lookbook_id=eq." +
        encodeURIComponent(
          lookbook.id
        ) +
        "&published=eq.true" +
        "&order=sort_order.asc,created_at.asc"
      );

    if (!items.length) {
      media = [];
      return;
    }

    const ids =
      items.map(x => x.id).join(",");

    media =
      await apiFetch(
        "/rest/v1/lookbook_media" +
        "?select=*" +
        "&item_id=in.(" +
        ids +
        ")" +
        "&order=sort_order.asc"
      );
  }

  function renderRoot() {

    target.innerHTML = `
      <div class="glime-lb">

        <div class="glime-lb-head">

          <h2>
            ${esc(
              lookbook.name ||
              "Lookbook"
            )}
          </h2>

          <p>
            ${esc(
              lookbook.description ||
              "Explore our latest collections and designs."
            )}
          </p>

          <div class="glime-lb-search">

            <input
              class="glime-lb-search-input"
              type="search"
              placeholder="Search designs, color, fabric, collection...">

          </div>

        </div>

        <div
          class="glime-lb-collections"
          data-role="collections">
        </div>

        <h3
          class="glime-lb-title"
          data-role="title">
          Latest Designs
        </h3>

        <div
          class="glime-lb-grid"
          data-role="grid">
        </div>

        <div
          class="glime-lb-status"
          data-role="status">
        </div>

        <div
          class="glime-lb-modal"
          data-role="modal">

          <div class="glime-lb-modal-box">

            <button
              class="glime-lb-close"
              data-role="close">
              ×
            </button>

            <div
              data-role="detail">
            </div>

          </div>

        </div>

      </div>
    `;

    const root =
      target.firstElementChild;

    root
      .querySelector(
        ".glime-lb-search-input"
      )
      .addEventListener(
        "input",
        e => {
          searchTerm =
            e.target.value
              .trim()
              .toLowerCase();

          renderItems(root);
        }
      );

    root
      .querySelector(
        "[data-role=close]"
      )
      .addEventListener(
        "click",
        () => {
          root
            .querySelector(
              "[data-role=modal]"
            )
            .classList.remove(
              "show"
            );
        }
      );

    root
      .querySelector(
        "[data-role=modal]"
      )
      .addEventListener(
        "click",
        e => {
          if (
            e.target ===
            e.currentTarget
          ) {
            e.currentTarget
              .classList.remove(
                "show"
              );
          }
        }
      );

    renderCollections(root);
    renderItems(root);
  }

  function renderCollections(root) {

    const box =
      root.querySelector(
        "[data-role=collections]"
      );

    box.innerHTML = "";

    const all =
      document.createElement(
        "button"
      );

    all.className =
      "glime-lb-collection" +
      (
        selectedCollection === null
          ? " active"
          : ""
      );

    all.textContent = "All";

    all.onclick = () => {

      selectedCollection = null;

      renderCollections(root);
      renderItems(root);

    };

    box.appendChild(all);

    collections.forEach(c => {

      const button =
        document.createElement(
          "button"
        );

      button.className =
        "glime-lb-collection" +
        (
          selectedCollection === c.id
            ? " active"
            : ""
        );

      button.textContent =
        c.name;

      button.onclick = () => {

        selectedCollection =
          c.id;

        renderCollections(root);
        renderItems(root);

      };

      box.appendChild(button);

    });
  }

  function filteredItems() {

    return items.filter(
      item => {

        const collection =
          collections.find(
            c =>
              c.id ===
              item.collection_id
          );

        const text = [
          item.title,
          item.description,
          item.price,
          item.size,
          item.color,
          item.fabric,
          item.category,
          collection &&
            collection.name
        ]
          .join(" ")
          .toLowerCase();

        return (
          (
            !selectedCollection ||
            item.collection_id ===
              selectedCollection
          ) &&
          (
            !searchTerm ||
            text.includes(
              searchTerm
            )
          )
        );
      }
    );
  }

  function renderItems(root) {

    const grid =
      root.querySelector(
        "[data-role=grid]"
      );

    const status =
      root.querySelector(
        "[data-role=status]"
      );

    const title =
      root.querySelector(
        "[data-role=title]"
      );

    const selected =
      collections.find(
        c =>
          c.id ===
          selectedCollection
      );

    title.textContent =
      selected
        ? selected.name
        : "Latest Designs";

    const list =
      filteredItems();

    grid.innerHTML = "";

    if (!list.length) {

      grid.innerHTML = `
        <div class="glime-lb-empty">
          No published designs found.
        </div>
      `;

      status.textContent = "";
      return;
    }

    status.textContent =
      list.length +
      " design" +
      (
        list.length === 1
          ? ""
          : "s"
      );

    list.forEach(item => {

      const card =
        document.createElement(
          "article"
        );

      card.className =
        "glime-lb-card";

      const itemMedia =
        media.filter(
          m =>
            m.item_id ===
            item.id
        );

      const cover =
        item.cover_image ||
        (
          itemMedia[0] &&
          itemMedia[0].storage_path
        ) ||
        "";

      const tags = [];

      if (item.price) {
        tags.push(`
          <span class="glime-lb-tag">
            ${esc(item.price)}
          </span>
        `);
      }

      if (item.color) {
        tags.push(`
          <span class="glime-lb-tag">
            ${esc(item.color)}
          </span>
        `);
      }

      if (item.fabric) {
        tags.push(`
          <span class="glime-lb-tag">
            ${esc(item.fabric)}
          </span>
        `);
      }

      if (item.size) {
        tags.push(`
          <span class="glime-lb-tag">
            Size: ${esc(item.size)}
          </span>
        `);
      }

      if (itemMedia.length) {
        tags.push(`
          <span class="glime-lb-tag">
            ${itemMedia.length} photos
          </span>
        `);
      }

      card.innerHTML = `
        ${
          cover
            ? `
              <img
                class="glime-lb-image"
                src="${esc(
                  storageUrl(cover)
                )}"
                alt="${esc(
                  item.title
                )}"
                loading="lazy">
            `
            : ""
        }

        <div class="glime-lb-body">

          <h4 class="glime-lb-name">
            ${esc(item.title)}
          </h4>

          <p class="glime-lb-desc">
            ${esc(
              item.description ||
              ""
            )}
          </p>

          <div class="glime-lb-meta">
            ${tags.join("")}
          </div>

          <div class="glime-lb-actions">

            <button
              class="glime-lb-button">
              View Design
            </button>

          </div>

        </div>
      `;

      card
        .querySelector("button")
        .onclick = () =>
          openDetail(
            root,
            item.id
          );

      grid.appendChild(card);

    });
  }

  

  function openDetail(
    root,
    itemId
  ) {

    const item =
      items.find(
        x =>
          x.id === itemId
      );

    if (!item) return;

    const modal =
      root.querySelector(
        "[data-role=modal]"
      );

    const detail =
      root.querySelector(
        "[data-role=detail]"
      );

    const itemMedia =
      media.filter(
        m =>
          m.item_id ===
          item.id
      );

    detail.innerHTML = `

      <h2
        class="glime-lb-modal-title">
        ${esc(item.title)}
      </h2>

      <div
        class="glime-lb-gallery">

        ${
          itemMedia
            .map(
              m => `
                <img
                  src="${esc(
                    storageUrl(
                      m.storage_path
                    )
                  )}"
                  alt="${esc(
                    item.title
                  )}"
                  loading="lazy">
              `
            )
            .join("")
        }

      </div>

      <p
        class="glime-lb-modal-desc">
        ${esc(
          item.description ||
          ""
        )}
      </p>

      <div class="glime-lb-meta">

        ${
          item.price
            ? `
              <span
                class="glime-lb-tag">
                ${esc(item.price)}
              </span>
            `
            : ""
        }

        ${
          item.color
            ? `
              <span
                class="glime-lb-tag">
                ${esc(item.color)}
              </span>
            `
            : ""
        }

        ${
          item.fabric
            ? `
              <span
                class="glime-lb-tag">
                ${esc(item.fabric)}
              </span>
            `
            : ""
        }

        ${
          item.size
            ? `
              <span
                class="glime-lb-tag">
                Size:
                ${esc(item.size)}
              </span>
            `
            : ""
        }

      </div>

      <div class="glime-lb-lead">

        <h3>
          Interested in this design?
        </h3>

        <div class="glime-lb-actions">

          <button
            class="glime-lb-button"
            data-action="enquiry">
            Send Enquiry
          </button>

          <button
            class="glime-lb-button secondary"
            data-action="order">
            Order This Design
          </button>

        </div>

        <div
          data-role="lead-area">
        </div>

      </div>
    `;

    detail
      .querySelector(
        '[data-action="enquiry"]'
      )
      .onclick = () =>
        renderLeadForm(
          root,
          item,
          "enquiry"
        );

    detail
      .querySelector(
        '[data-action="order"]'
      )
      .onclick = () =>
        renderLeadForm(
          root,
          item,
          "order"
        );

    modal.classList.add("show");
  }

  // ===== PART 1 ENDS HERE =====
  function renderLeadForm(
    root,
    item,
    type
  ) {

    const area =
      root.querySelector(
        "[data-role=lead-area]"
      );

    if (!area) return;

    const isOrder =
      type === "order";

    area.innerHTML = `

      <form
        class="glime-lb-form"
        data-lead-form>

        <div class="glime-lb-form-grid">

          <input
            name="name"
            type="text"
            placeholder="Your Name *"
            autocomplete="name"
            required>

          <input
            name="mobile"
            type="tel"
            placeholder="Mobile Number *"
            autocomplete="tel"
            inputmode="tel"
            required>

        </div>

        ${
          isOrder
            ? `
              <div class="glime-lb-form-grid">

                <input
                  name="house_no"
                  type="text"
                  placeholder="House No.">

                <input
                  name="village_locality"
                  type="text"
                  placeholder="Village / Locality">

              </div>

              <div class="glime-lb-form-grid">

                <input
                  name="district"
                  type="text"
                  placeholder="District">

                <input
                  name="state"
                  type="text"
                  placeholder="State">

              </div>

              <div class="glime-lb-form-grid">

                <input
                  name="pincode"
                  type="text"
                  placeholder="PIN Code"
                  inputmode="numeric"
                  maxlength="6">

                <input
                  name="landmark"
                  type="text"
                  placeholder="Landmark">

              </div>

              <input
                name="quantity"
                type="number"
                min="1"
                max="20"
                value="1"
                placeholder="Quantity">

              <div class="glime-lb-form-note">
                Please enter your delivery details.
              </div>
            `
            : `
              <textarea
                name="message"
                placeholder="Message (optional)">
              </textarea>
            `
        }

        <div
          class="glime-lb-form-error"
          data-role="form-error">
        </div>

        <div
          class="glime-lb-form-success"
          data-role="form-success">
        </div>

        <button
          type="submit"
          class="glime-lb-button"
          data-role="submit-button">

          ${
            isOrder
              ? "Submit Order"
              : "Send Enquiry"
          }

        </button>

        <div class="glime-lb-form-note">
          Your details will be sent securely to the boutique.
        </div>

      </form>
    `;

    const form =
      area.querySelector(
        "[data-lead-form]"
      );

    const errorBox =
      area.querySelector(
        "[data-role=form-error]"
      );

    const successBox =
      area.querySelector(
        "[data-role=form-success]"
      );

    const submitButton =
      area.querySelector(
        "[data-role=submit-button]"
      );

    form.addEventListener(
      "submit",
      async e => {

        e.preventDefault();

        errorBox.style.display =
          "none";

        successBox.style.display =
          "none";

        const formData =
          new FormData(form);

        const name =
          String(
            formData.get("name") || ""
          ).trim();

        const mobile =
          String(
            formData.get("mobile") || ""
          ).trim();

        if (!name) {

          errorBox.textContent =
            "Please enter your name.";

          errorBox.style.display =
            "block";

          return;
        }

        if (!mobile) {

          errorBox.textContent =
            "Please enter your mobile number.";

          errorBox.style.display =
            "block";

          return;
        }

        const mobileDigits =
          mobile.replace(
            /\D/g,
            ""
          );

        if (
          mobileDigits.length < 10
        ) {

          errorBox.textContent =
            "Please enter a valid mobile number.";

          errorBox.style.display =
            "block";

          return;
        }

        const payload = {
          type,
          item_id: item.id,
          name,
          mobile
        };

        if (isOrder) {

          payload.house_no =
            String(
              formData.get(
                "house_no"
              ) || ""
            ).trim();

          payload.village_locality =
            String(
              formData.get(
                "village_locality"
              ) || ""
            ).trim();

          payload.district =
            String(
              formData.get(
                "district"
              ) || ""
            ).trim();

          payload.state =
            String(
              formData.get(
                "state"
              ) || ""
            ).trim();

          payload.pincode =
            String(
              formData.get(
                "pincode"
              ) || ""
            ).trim();

          payload.landmark =
            String(
              formData.get(
                "landmark"
              ) || ""
            ).trim();

          payload.quantity =
            Math.max(
              1,
              Math.min(
                20,
                Number(
                  formData.get(
                    "quantity"
                  ) || 1
                )
              )
            );

        } else {

          payload.message =
            String(
              formData.get(
                "message"
              ) || ""
            ).trim();

        }

        submitButton.disabled =
          true;

        submitButton.textContent =
          "Submitting...";

        try {

          const result =
            await submitLead(
              payload
            );

          successBox.textContent =
            isOrder
              ? "Order request submitted successfully."
              : "Enquiry submitted successfully.";

          successBox.style.display =
            "block";

          submitButton.style.display =
            "none";

          /*
           * Open WhatsApp after the
           * request has been stored.
           */
          if (
            result &&
            result.whatsapp_number
          ) {

            const whatsappNumber =
              String(
                result.whatsapp_number
              ).replace(
                /\D/g,
                ""
              );

            if (whatsappNumber) {

              let message = "";

              if (isOrder) {

                const addressParts = [
                  payload.house_no,
                  payload.village_locality,
                  payload.district,
                  payload.state,
                  payload.pincode,
                  payload.landmark
                ].filter(Boolean);

                message =
                  "Hello, I want to order this design." +
                  "\n\n" +
                  "Design: " +
                  (item.title || "") +
                  "\n" +
                  "Price: " +
                  (item.price || "N/A") +
                  "\n" +
                  "Quantity: " +
                  payload.quantity +
                  "\n\n" +
                  "Name: " +
                  payload.name +
                  "\n" +
                  "Mobile: " +
                  payload.mobile;

                if (
                  addressParts.length
                ) {

                  message +=
                    "\n\nDelivery Address:\n" +
                    addressParts.join(
                      ", "
                    );

                }

              } else {

                message =
                  "Hello, I am interested in this design." +
                  "\n\n" +
                  "Design: " +
                  (item.title || "") +
                  "\n" +
                  "Name: " +
                  payload.name +
                  "\n" +
                  "Mobile: " +
                  payload.mobile;

                if (
                  payload.message
                ) {

                  message +=
                    "\nMessage: " +
                    payload.message;

                }

              }

              const whatsappUrl =
                "https://wa.me/" +
                whatsappNumber +
                "?text=" +
                encodeURIComponent(
                  message
                );

              setTimeout(
                () => {
                  window.open(
                    whatsappUrl,
                    "_blank",
                    "noopener"
                  );
                },
                250
              );
            }
          }

        } catch (error) {

          console.error(
            "GLIME submission error:",
            error
          );

          errorBox.textContent =
            error &&
            error.message
              ? error.message
              : "Something went wrong. Please try again.";

          errorBox.style.display =
            "block";

          submitButton.disabled =
            false;

          submitButton.textContent =
            isOrder
              ? "Submit Order"
              : "Send Enquiry";
        }
      }
    );
  }

  function showError(error) {

    console.error(
      "GLIME Lookbook:",
      error
    );

    target.innerHTML = `
      <div
        class="glime-lb"
        style="text-align:center;padding:40px 18px">

        <div
          style="font-size:18px;font-weight:700;margin-bottom:8px">
          Lookbook unavailable
        </div>

        <div
          style="color:#777;font-size:13px">
          ${esc(
            error &&
            error.message
              ? error.message
              : "Something went wrong."
          )}
        </div>

      </div>
    `;
  }

  async function init() {

    addStyles();

    target.innerHTML = `
      <div
        class="glime-lb-status">
        Loading Lookbook...
      </div>
    `;

    try {

      /*
       * Domain is the primary mapping.
       * This keeps the client website
       * independent from internal IDs.
       */
      const mapping =
        await resolveLookbook();

      if (!mapping) {
        throw new Error(
          "Lookbook is not configured for this website."
        );
      }

      lookbook =
        await loadLookbook(
          mapping.lookbook_id
        );

      if (!lookbook) {
        throw new Error(
          "Published Lookbook not found."
        );
      }

      await loadData();

      renderRoot();

    } catch (error) {

      showError(error);

    }
  }

  init();

})();
           
