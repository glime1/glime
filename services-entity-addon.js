(function () {
  "use strict";

  const state = window.GLIME_SERVICES_STATE;
  const getClient = window.GLIME_GET_SUPABASE_CLIENT;

  if (!state || typeof getClient !== "function") {
    console.error("[GLIME Entity Addon] services.js core is not ready.");
    return;
  }

  const $ = (id) => document.getElementById(id);
  let mounted = false;
  let saving = false;

  function text(value) {
    return value == null ? "" : String(value);
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function slugify(value) {
    return text(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);
  }

  function errorMessage(error, fallback = "Something went wrong.") {
    if (!error) return fallback;

    return [
      error.message,
      error.details,
      error.hint,
      error.code ? `code ${error.code}` : ""
    ]
      .map((v) => text(v).trim())
      .filter(Boolean)
      .join(" — ") || fallback;
  }

  function clientConfigId() {
    const id = state.client?.id;

    if (
      id === undefined ||
      id === null ||
      id === ""
    ) {
      throw new Error(
        "Client configuration is not loaded."
      );
    }

    return id;
  }

  function offerClientId() {
    const id = state.client?.client_id;

    if (!id) {
      throw new Error(
        "Client ID is not loaded."
      );
    }

    return String(id);
  }

  function notify(message, type = "info") {
    const el = $("message");

    if (!el) return;

    el.hidden = false;
    el.textContent = text(message);
    el.dataset.type = type;

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
      el.hidden = true;
    }, 7000);
  }

  function setStatus(message, type = "info") {
    const el = $("entityAddonStatus");

    if (!el) return;

    el.textContent = text(message);
    el.className = `status ${type}`;
  }

  function mount() {
    if (mounted) return;

    const anchor =
      document.getElementById(
        "servicesFoundationAddon"
      ) ||
      document.querySelector(
        ".setup.panel"
      );

    if (!anchor) return;

    const old =
      $("servicesEntityAddon");

    if (old) {
      old.remove();
    }

    const panel =
      document.createElement(
        "section"
      );

    panel.id =
      "servicesEntityAddon";

    panel.className =
      "services-entity-addon panel";

    panel.innerHTML = `
      <div class="panel-head">

        <div>

          <div class="eyebrow">
            LAYER 05 → 06
          </div>

          <h2>
            Entity Manager
          </h2>

          <span class="muted">
            Template-driven business entities. No hard-coded entity schema.
          </span>

        </div>

        <span
          id="entityAddonStatus"
          class="status draft"
        >
          Loading
        </span>

      </div>


      <div class="entity-addon-body">

        <div
          id="entityTypeTabs"
          class="entity-type-tabs"
        ></div>


        <div
          id="entityManagerEmpty"
          class="entity-empty"
          hidden
        >

          <h3>
            Foundation required
          </h3>

          <p class="muted">
            Save the business foundation before creating entities.
          </p>

        </div>


        <div
          id="entityManagerWorkspace"
          hidden
        >

          <div class="entity-manager-toolbar">

            <div>

              <div
                class="eyebrow"
                id="activeEntityEyebrow"
              >
                ENTITY
              </div>

              <h3 id="activeEntityTitle">
                Service
              </h3>

            </div>

            <button
              id="createEntityBtn"
              class="primary"
              type="button"
            >
              + Create entity
            </button>

          </div>


          <div
            id="entityFormWrap"
            class="entity-form-wrap"
            hidden
          >

            <form
              id="entityForm"
              novalidate
            >

              <div
                id="entityFields"
                class="entity-fields"
              ></div>


              <div class="entity-form-actions">

                <button
                  id="cancelEntityBtn"
                  class="ghost"
                  type="button"
                >
                  Cancel
                </button>

                <button
                  id="saveEntityBtn"
                  class="primary"
                  type="submit"
                >
                  Save entity
                </button>

              </div>

            </form>

          </div>


          <div class="entity-list-head">

            <div>

              <h3>
                Existing entities
              </h3>

              <span
                id="entityListMeta"
                class="muted"
              ></span>

            </div>

            <button
              id="refreshEntitiesBtn"
              class="ghost small"
              type="button"
            >
              Refresh
            </button>

          </div>


          <div
            id="entityList"
            class="entity-list"
          ></div>

        </div>

      </div>
    `;

    anchor.insertAdjacentElement(
      "afterend",
      panel
    );

    injectStyles();
    bindEvents();

    mounted = true;
  }


  function injectStyles() {

    if (
      $("servicesEntityAddonStyles")
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "servicesEntityAddonStyles";

    style.textContent = `
      .services-entity-addon {
        margin-bottom: 16px;
      }

      .entity-addon-body {
        display: grid;
        gap: 16px;
        padding: 18px;
      }

      .entity-type-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .entity-type-tab {
        border: 1px solid var(--border);
        background: transparent;
        color: var(--muted);
        border-radius: 10px;
        padding: 9px 12px;
        cursor: pointer;
      }

      .entity-type-tab.active {
        color: var(--green);
        border-color: rgba(80,245,168,.35);
      }

      .entity-manager-toolbar,
      .entity-list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }

      .entity-manager-toolbar h3,
      .entity-list-head h3 {
        margin: 3px 0 0;
      }

      .entity-form-wrap {
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 16px;
        background: rgba(5,11,16,.25);
      }

      .entity-fields {
        display: grid;
        grid-template-columns:
          repeat(2,minmax(0,1fr));
        gap: 14px;
      }

      .entity-field.wide {
        grid-column: 1 / -1;
      }

      .entity-field label {
        display: grid;
        gap: 7px;
      }

      .entity-field input,
      .entity-field textarea,
      .entity-field select {
        width: 100%;
        box-sizing: border-box;
      }

      .entity-required {
        color: var(--cyan);
      }

      .entity-form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 16px;
      }

      .entity-list {
        display: grid;
        gap: 8px;
      }

      .entity-row {
        display: grid;
        grid-template-columns:
          minmax(0,1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 13px 14px;
        border: 1px solid var(--border);
        border-radius: 12px;
      }

      .entity-row-title {
        font-weight: 700;
      }

      .entity-row-meta {
        margin-top: 4px;
        font-size: 12px;
        color: var(--muted);
      }

      .entity-empty {
        border: 1px dashed var(--border);
        border-radius: 14px;
        padding: 22px;
        text-align: center;
      }

      .entity-empty h3 {
        margin-top: 0;
      }

      .entity-list-empty {
        padding: 18px;
        border: 1px dashed var(--border);
        border-radius: 12px;
        color: var(--muted);
      }

      @media (max-width:700px) {

        .entity-fields {
          grid-template-columns: 1fr;
        }

        .entity-field.wide {
          grid-column: auto;
        }

        .entity-manager-toolbar,
        .entity-list-head {
          align-items: stretch;
          flex-direction: column;
        }

        .entity-manager-toolbar .primary {
          width: 100%;
        }

      }
    `;

    document.head.appendChild(
      style
    );
  }


  function bindEvents() {

    $("createEntityBtn")?.addEventListener(
      "click",
      () => {
        openEntityForm();
      }
    );

    $("cancelEntityBtn")?.addEventListener(
      "click",
      closeEntityForm
    );

    $("refreshEntitiesBtn")?.addEventListener(
      "click",
      () =>
        loadEntities().catch(
          handleError
        )
    );

    $("entityForm")?.addEventListener(
      "submit",
      handleEntitySubmit
    );
  }


  function handleError(error) {

    console.error(
      "[GLIME Entity Addon]",
      error
    );

    setStatus(
      "Error",
      "error"
    );

    notify(
      errorMessage(error),
      "error"
    );
  }


  async function loadFoundation() {

    const client =
      await getClient();

    const clientId =
      clientConfigId();

    const {
      data,
      error
    } =
      await client
        .from(
          "client_template_configurations"
        )
        .select(`
          id,
          client_id,
          industry_configuration_id,
          business_model_id,
          custom_business_model_id,
          template_id,
          template_name,
          status,
          config,
          metadata,
          updated_at
        `)
        .eq(
          "client_id",
          clientId
        )
        .eq(
          "status",
          "active"
        )
        .order(
          "updated_at",
          {
            ascending: false
          }
        )
        .limit(1)
        .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }


  async function loadEntityTypes(
    templateId
  ) {

    const client =
      await getClient();

    const {
      data: mappings,
      error: mappingError
    } =
      await client
        .from(
          "template_entity_types"
        )
        .select(`
          id,
          template_id,
          entity_type_id,
          display_name,
          is_primary,
          sort_order,
          config
        `)
        .eq(
          "template_id",
          templateId
        )
        .order(
          "sort_order",
          {
            ascending: true
          }
        );

    if (mappingError) {
      throw mappingError;
    }

    const ids =
      [
        ...new Set(
          (mappings || [])
            .map(
              (row) =>
                row.entity_type_id
            )
            .filter(Boolean)
        )
      ];

    if (!ids.length) {
      return [];
    }

    const {
      data: types,
      error: typeError
    } =
      await client
        .from(
          "entity_types"
        )
        .select(
          "id, slug, name"
        )
        .in(
          "id",
          ids
        );

    if (typeError) {
      throw typeError;
    }

    const byId =
      new Map(
        (types || [])
          .map(
            (row) => [
              row.id,
              row
            ]
          )
      );

    return (
      mappings || []
    )
      .map(
        (mapping) => ({
          ...mapping,
          entityType:
            byId.get(
              mapping.entity_type_id
            ) || null
        })
      )
      .filter(
        (row) =>
          row.entityType
      )
      .sort(
        (a, b) =>
          Number(
            a.sort_order || 0
          ) -
          Number(
            b.sort_order || 0
          )
      );
  }


  async function loadFields(
    templateId,
    entityTypeId
  ) {

    const client =
      await getClient();

    const {
      data,
      error
    } =
      await client
        .from(
          "template_fields"
        )
        .select(`
          id,
          template_id,
          entity_type_id,
          field_definition_id,
          slug,
          label,
          data_type,
          is_required,
          is_visible,
          sort_order,
          config
        `)
        .eq(
          "template_id",
          templateId
        )
        .eq(
          "entity_type_id",
          entityTypeId
        )
        .eq(
          "is_visible",
          true
        )
        .order(
          "sort_order",
          {
            ascending: true
          }
        )
        .order(
          "slug",
          {
            ascending: true
          }
        );

    if (error) {
      throw error;
    }

    return data || [];
  }

    function renderEntityTypes(
    types
  ) {

    const tabs =
      $("entityTypeTabs");

    if (!tabs) {
      return;
    }

    tabs.innerHTML = "";

    types.forEach(
      (item, index) => {

        const button =
          document.createElement(
            "button"
          );

        button.type =
          "button";

        button.className =
          "entity-type-tab";

        button.dataset.entityTypeId =
          item.entity_type_id;

        button.textContent =
          item.display_name ||
          item.entityType.name;

        button.addEventListener(
          "click",
          () =>
            selectEntityType(
              item.entity_type_id
            )
        );

        tabs.appendChild(
          button
        );

        if (index === 0) {
          state.entityActiveTypeId =
            item.entity_type_id;
        }

      }
    );
  }


  async function selectEntityType(
    entityTypeId
  ) {

    state.entityActiveTypeId =
      entityTypeId;

    const item =
      (
        state.entityTypes ||
        []
      ).find(
        (row) =>
          row.entity_type_id ===
          entityTypeId
      );

    if (!item) {
      return;
    }

    document
      .querySelectorAll(
        ".entity-type-tab"
      )
      .forEach(
        (button) => {

          button.classList.toggle(
            "active",
            button.dataset.entityTypeId ===
              entityTypeId
          );

        }
      );

    $("activeEntityEyebrow").textContent =
      item.entityType.slug ||
      "ENTITY";

    $("activeEntityTitle").textContent =
      item.display_name ||
      item.entityType.name;

    state.entityFields =
      await loadFields(
        state.templateConfiguration.template_id,
        entityTypeId
      );

    closeEntityForm();

    await loadEntities();

    setStatus(
      "Ready",
      "active"
    );
  }


  function inputType(
    field
  ) {

    switch (
      field.data_type
    ) {

      case "long_text":
        return "textarea";

      case "url":
        return "url";

      case "number":
        return "number";

      case "integer":
        return "number";

      case "date":
        return "date";

      case "datetime":
      case "timestamp":
        return "datetime-local";

      case "boolean":
        return "checkbox";

      default:
        return "text";
    }
  }


  function renderFields() {

    const wrap =
      $("entityFields");

    if (!wrap) {
      return;
    }

    wrap.innerHTML = "";

    for (
      const field of
      state.entityFields || []
    ) {

      const wrapper =
        document.createElement(
          "div"
        );

      wrapper.className =
        "entity-field";

      if (
        field.data_type ===
        "long_text"
      ) {
        wrapper.classList.add(
          "wide"
        );
      }

      const label =
        document.createElement(
          "label"
        );

      const title =
        document.createElement(
          "span"
        );

      title.innerHTML =
        `${escapeHtml(
          field.label ||
          field.slug
        )}${
          field.is_required
            ? ' <span class="entity-required">*</span>'
            : ""
        }`;

      label.appendChild(
        title
      );

      let control;

      const type =
        inputType(field);

      if (
        type === "textarea"
      ) {

        control =
          document.createElement(
            "textarea"
          );

        control.rows = 4;

      } else if (
        type === "checkbox"
      ) {

        control =
          document.createElement(
            "input"
          );

        control.type =
          "checkbox";

      } else {

        control =
          document.createElement(
            "input"
          );

        control.type =
          type;

      }

      control.name =
        field.slug;

      control.dataset.fieldId =
        field.id;

      control.dataset.dataType =
        field.data_type;

      control.dataset.required =
        field.is_required
          ? "true"
          : "false";

      control.placeholder =
        field.config?.placeholder ||
        "";

      label.appendChild(
        control
      );

      wrapper.appendChild(
        label
      );

      wrap.appendChild(
        wrapper
      );
    }
  }


  function openEntityForm() {

    if (
      !state.entityActiveTypeId
    ) {
      return;
    }

    renderFields();

    $("entityFormWrap").hidden =
      false;

    $("createEntityBtn").disabled =
      true;

    $("entityFormWrap")
      .scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
  }


  function closeEntityForm() {

    const form =
      $("entityForm");

    if (form) {
      form.reset();
    }

    if (
      $("entityFormWrap")
    ) {
      $("entityFormWrap").hidden =
        true;
    }

    if (
      $("createEntityBtn")
    ) {
      $("createEntityBtn").disabled =
        false;
    }
  }


  function readFormValues() {

    const values = {};
    const form =
      $("entityForm");

    if (!form) {
      return values;
    }

    for (
      const field of
      state.entityFields || []
    ) {

      const control =
        form.elements.namedItem(
          field.slug
        );

      if (!control) {
        continue;
      }

      values[field.slug] =
        field.data_type ===
        "boolean"
          ? Boolean(
              control.checked
            )
          : control.value;
    }

    return values;
  }


  function validate(
    values
  ) {

    for (
      const field of
      state.entityFields || []
    ) {

      if (
        !field.is_required
      ) {
        continue;
      }

      const value =
        values[field.slug];

      if (
        field.data_type ===
        "boolean"
      ) {
        continue;
      }

      if (
        value == null ||
        String(value).trim() === ""
      ) {

        throw new Error(
          `${field.label || field.slug} is required.`
        );
      }
    }
  }


  function entityOfferType(
    slug
  ) {

    const map = {

      service:
        "service",

      product:
        "product",

      package:
        "package",

      plan:
        "offer",

      property:
        "offer",

      "menu-item":
        "offer",

      custom:
        "offer"

    };

    return (
      map[slug] ||
      "offer"
    );
  }


  async function uniqueOfferSlug(
    client,
    baseSlug,
    clientId
  ) {

    let slug =
      baseSlug ||
      `entity-${Date.now().toString(36)}`;

    let counter = 1;

    while (true) {

      const {
        data,
        error
      } =
        await client
          .from(
            "offers"
          )
          .select(
            "id"
          )
          .eq(
            "client_id",
            clientId
          )
          .eq(
            "slug",
            slug
          )
          .limit(1);

      if (error) {
        throw error;
      }

      if (
        !data?.length
      ) {
        return slug;
      }

      counter += 1;

      slug =
        `${
          baseSlug ||
          "entity"
        }-${counter}`
          .slice(
            0,
            100
          );
    }
  }


  async function createEntity(
    values
  ) {

    const client =
      await getClient();

    const clientId =
      offerClientId();

    const configId =
      clientConfigId();

    const entityType =
      (
        state.entityTypes ||
        []
      ).find(
        (row) =>
          row.entity_type_id ===
          state.entityActiveTypeId
      );

    if (
      !entityType?.entityType
    ) {

      throw new Error(
        "Active entity type is not available."
      );
    }

    if (
      !state.templateConfiguration?.id
    ) {

      throw new Error(
        "Active template configuration is missing."
      );
    }

    const title =
      text(
        values.title ||
        values.name ||
        ""
      ).trim();

    if (!title) {
      throw new Error(
        "Title is required."
      );
    }

    const description =
      text(
        values.description
      ).trim() ||
      null;

    const shortDescription =
      text(
        values.short_description
      ).trim() ||
      null;

    const baseSlug =
      slugify(
        values.slug ||
        title
      );

    const slug =
      await uniqueOfferSlug(
        client,
        baseSlug,
        clientId
      );

    const offerPayload = {

      client_id:
        clientId,

      offer_type:
        entityOfferType(
          entityType.entityType.slug
        ),

      name:
        title,

      slug:
        slug,

      short_description:
        shortDescription,

      description:
        description,

      status:
        "draft"

    };

    const {
      data: offer,
      error: offerError
    } =
      await client
        .from(
          "offers"
        )
        .insert(
          offerPayload
        )
        .select()
        .single();

    if (offerError) {
      throw offerError;
    }

    let version =
      null;

    let binding =
      null;

    try {

      const {
        data: versionData,
        error: versionError
      } =
        await client
          .from(
            "offer_versions"
          )
          .insert({

            offer_id:
              offer.id,

            version_number:
              1,

            status:
              "draft",

            title:
              title,

            description:
              description,

            sales_talking_points:
              [],

            allowed_claims:
              [],

            restrictions:
              [],

            customer_eligibility:
              {},

            metadata: {

              source:
                "services-entity-addon",

              entity_type_id:
                entityType.entity_type_id,

              template_configuration_id:
                state.templateConfiguration.id,

              client_config_id:
                configId

            }

          })
          .select()
          .single();

      if (versionError) {
        throw versionError;
      }

      version =
        versionData;


      const {
        data: updatedOffer,
        error: updateOfferError
      } =
        await client
          .from(
            "offers"
          )
          .update({
            current_version_id:
              version.id
          })
          .eq(
            "id",
            offer.id
          )
          .eq(
            "client_id",
            clientId
          )
          .select()
          .single();

      if (updateOfferError) {
        throw updateOfferError;
      }

      const customData =
        {
          ...values
        };

      delete customData.title;
      delete customData.description;
      delete customData.short_description;
      delete customData.slug;


      const {
        data: bindingData,
        error: bindingError
      } =
        await client
          .from(
            "offer_catalog_bindings"
          )
          .insert({

            offer_id:
              offer.id,

            client_id:
              configId,

            entity_type_id:
              entityType.entity_type_id,

            template_configuration_id:
              state.templateConfiguration.id,

            status:
              "draft",

            custom_data:
              customData,

            metadata: {

              source:
                "services-entity-addon",

              template_id:
                state.templateConfiguration.template_id,

              entity_type_slug:
                entityType.entityType.slug

            }

          })
          .select()
          .single();

      if (bindingError) {
        throw bindingError;
      }

      binding =
        bindingData;


      return {
        offer:
          updatedOffer ||
          offer,

        version,

        binding
      };

    } catch (error) {

      try {

        await client
          .from(
            "offer_catalog_bindings"
          )
          .delete()
          .eq(
            "offer_id",
            offer.id
          );

      } catch (_) {}

      try {

        await client
          .from(
            "offer_versions"
          )
          .delete()
          .eq(
            "offer_id",
            offer.id
          );

      } catch (_) {}

      try {

        await client
          .from(
            "offers"
          )
          .delete()
          .eq(
            "id",
            offer.id
          )
          .eq(
            "client_id",
            clientId
          );

      } catch (_) {}

      throw error;
    }
}

    async function loadEntities() {

    const list =
      $("entityList");

    const meta =
      $("entityListMeta");

    if (!list) {
      return;
    }

    const entityTypeId =
      state.entityActiveTypeId;

    if (!entityTypeId) {

      list.innerHTML =
        `
          <div class="entity-list-empty">
            No entity type is selected.
          </div>
        `;

      return;
    }

    const client =
      await getClient();

    const configId =
      clientConfigId();

    const {
      data: bindings,
      error: bindingError
    } =
      await client
        .from(
          "offer_catalog_bindings"
        )
        .select(`
          id,
          offer_id,
          entity_type_id,
          template_configuration_id,
          status,
          custom_data,
          updated_at
        `)
        .eq(
          "client_id",
          configId
        )
        .eq(
          "entity_type_id",
          entityTypeId
        )
        .order(
          "updated_at",
          {
            ascending: false
          }
        );

    if (bindingError) {
      throw bindingError;
    }

    const ids =
      (
        bindings || []
      )
        .map(
          (row) =>
            row.offer_id
        )
        .filter(Boolean);

    if (!ids.length) {

      list.innerHTML =
        `
          <div class="entity-list-empty">
            No entities created yet.
          </div>
        `;

      if (meta) {
        meta.textContent =
          "0 entities";
      }

      return;
    }

    const {
      data: offers,
      error: offerError
    } =
      await client
        .from(
          "offers"
        )
        .select(`
          id,
          name,
          slug,
          offer_type,
          status,
          current_version_id,
          updated_at
        `)
        .in(
          "id",
          ids
        )
        .order(
          "updated_at",
          {
            ascending: false
          }
        );

    if (offerError) {
      throw offerError;
    }

    const byId =
      new Map(
        (offers || [])
          .map(
            (row) => [
              row.id,
              row
            ]
          )
      );

    list.innerHTML =
      (
        bindings || []
      )
        .map(
          (binding) => {

            const offer =
              byId.get(
                binding.offer_id
              );

            if (!offer) {
              return "";
            }

            const status =
              offer.status ||
              binding.status ||
              "draft";

            return `
              <div class="entity-row">

                <div>

                  <div class="entity-row-title">
                    ${escapeHtml(
                      offer.name
                    )}
                  </div>

                  <div class="entity-row-meta">
                    ${escapeHtml(
                      offer.slug
                    )}
                    ·
                    ${escapeHtml(
                      status
                    )}
                  </div>

                </div>

                <span
                  class="status ${
                    status === "active"
                      ? "active"
                      : "draft"
                  }"
                >
                  ${escapeHtml(
                    status
                  )}
                </span>

              </div>
            `;
          }
        )
        .join(
          ""
        ) ||
      `
        <div class="entity-list-empty">
          No entities created yet.
        </div>
      `;

    if (meta) {

      meta.textContent =
        `${ids.length} ${
          ids.length === 1
            ? "entity"
            : "entities"
        }`;
    }
  }


  async function handleEntitySubmit(
    event
  ) {

    event.preventDefault();

    if (saving) {
      return;
    }

    saving = true;

    const saveButton =
      $("saveEntityBtn");

    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving…";
    }

    try {

      const values =
        readFormValues();

      validate(
        values
      );

      await createEntity(
        values
      );

      closeEntityForm();

      await loadEntities();

      setStatus(
        "Ready",
        "active"
      );

      notify(
        "Entity created successfully.",
        "success"
      );

    } catch (error) {

      handleError(
        error
      );

    } finally {

      saving =
        false;

      if (saveButton) {

        saveButton.disabled =
          false;

        saveButton.textContent =
          "Save entity";
      }
    }
  }


  async function boot() {

    const start =
      Date.now();

    while (
      Date.now() -
      start <
      15000
    ) {

      if (state.client) {
        break;
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            100
          )
      );
    }

    if (!state.client) {

      setStatus(
        "Client unavailable",
        "error"
      );

      return;
    }

    mount();

    if (!mounted) {
      return;
    }

    try {

      const templateConfiguration =
        await loadFoundation();

      state.templateConfiguration =
        templateConfiguration;


      if (
        !templateConfiguration?.template_id
      ) {

        $("entityManagerEmpty")
          .hidden = false;

        $("entityManagerWorkspace")
          .hidden = true;

        setStatus(
          "Foundation required",
          "draft"
        );

        return;
      }


      const entityTypes =
        await loadEntityTypes(
          templateConfiguration.template_id
        );

      state.entityTypes =
        entityTypes;


      if (!entityTypes.length) {

        $("entityManagerEmpty")
          .hidden = false;

        $("entityManagerEmpty")
          .innerHTML = `
            <h3>
              No entity types configured
            </h3>

            <p class="muted">
              The active template has no entity type mapping yet.
            </p>
          `;

        $("entityManagerWorkspace")
          .hidden = true;

        setStatus(
          "Entity mapping required",
          "draft"
        );

        return;
      }


      $("entityManagerEmpty")
        .hidden = true;

      $("entityManagerWorkspace")
        .hidden = false;


      renderEntityTypes(
        entityTypes
      );


      await selectEntityType(
        entityTypes[0]
          .entity_type_id
      );


      setStatus(
        "Ready",
        "active"
      );

    } catch (error) {

      handleError(
        error
      );
    }
  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      boot,
      {
        once: true
      }
    );

  } else {

    boot();

  }

})();
  
