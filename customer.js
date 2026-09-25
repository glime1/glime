(() => {
  "use strict";

  const SUPABASE_URL = "https://ufoulgbiqgjriwapuopc.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  const state = {
    clientId: null,
    customers: [],
    orders: [],
    metrics: new Map(),
    filter: "all",
    search: "",
    sort: "newest"
  };

  const $ = (id) => document.getElementById(id);

  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[m]
    );

  const money = (value) =>
    "₹" +
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2
    });

  const formatDate = (value) => {
    if (!value) return "—";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
      return "—";
    }

    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  const monthStart = () => {
    const d = new Date();

    d.setDate(1);
    d.setHours(0, 0, 0, 0);

    return d;
  };

  const initials = (name) => {
    const value = String(name || "C").trim();

    const parts = value
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0]);

    return parts.join("").toUpperCase() || "C";
  };

  function toast(message) {
    const el = $("toast");

    if (!el) return;

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      el.classList.remove("show");
    }, 2500);
  }

  /* =========================================================
     AUTH + CLIENT
     ========================================================= */

  async function getClientId() {
    const {
      data: { user },
      error
    } = await db.auth.getUser();

    if (error || !user) {
      throw new Error("Please sign in again.");
    }

    const {
      data,
      error: clientError
    } = await db
      .from("client_data")
      .select("client_id,business_name,client_name,name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (clientError || !data?.client_id) {
      console.error("Client resolution error:", clientError);

      throw new Error(
        "Client workspace could not be resolved."
      );
    }

    if ($("businessName")) {
      $("businessName").textContent =
        data.business_name ||
        data.client_name ||
        data.name ||
        "Business Client";
    }

    return data.client_id;
  }

  /* =========================================================
     PAGINATED DATA LOADER
     ========================================================= */

  async function fetchAll(table, select, clientId) {
    const rows = [];

    let from = 0;

    const pageSize = 1000;

    while (true) {
      const {
        data,
        error
      } = await db
        .from(table)
        .select(select)
        .eq("client_id", clientId)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error(`${table} loading error:`, error);
        throw error;
      }

      if (Array.isArray(data)) {
        rows.push(...data);
      }

      if (!data || data.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    return rows;
  }

  /* =========================================================
     CUSTOMER METRICS
     ========================================================= */

  function buildMetrics() {
    const map = new Map();

    for (const customer of state.customers) {
      map.set(customer.id, {
        orders: 0,
        spent: 0,
        last: null
      });
    }

    for (const order of state.orders) {
      const metric = map.get(order.customer_id);

      if (!metric) {
        continue;
      }

      metric.orders += 1;

      metric.spent +=
        Number(
          order.total_amount ??
          order.price_at_order ??
          0
        ) || 0;

      if (
        !metric.last ||
        new Date(order.created_at) >
          new Date(metric.last)
      ) {
        metric.last = order.created_at;
      }
    }

    state.metrics = map;
  }

  /* =========================================================
     TOP STATS
     ========================================================= */

  function renderStats() {
    const totalCustomers =
      state.customers.length;

    const start = monthStart();

    const monthCustomers =
      state.customers.filter(
        (customer) =>
          new Date(customer.created_at) >= start
      ).length;

    const totalOrders =
      state.orders.length;

    const totalPurchased =
      state.orders.reduce(
        (sum, order) =>
          sum +
          (Number(
            order.total_amount ??
            order.price_at_order ??
            0
          ) || 0),
        0
      );

    if ($("totalCustomers")) {
      $("totalCustomers").textContent =
        totalCustomers.toLocaleString("en-IN");
    }

    if ($("monthCustomers")) {
      $("monthCustomers").textContent =
        monthCustomers.toLocaleString("en-IN");
    }

    if ($("totalOrders")) {
      $("totalOrders").textContent =
        totalOrders.toLocaleString("en-IN");
    }

    if ($("totalPurchased")) {
      $("totalPurchased").textContent =
        money(totalPurchased);
    }
  }

  /* =========================================================
     FILTERS
     ========================================================= */

  function applyFilter(list) {
    const start = monthStart();

    if (state.filter === "month") {
      return list.filter(
        (customer) =>
          new Date(customer.created_at) >= start
      );
    }

    /*
      TOP 10 CUSTOMERS

      Metric:
      Total Purchased amount from existing orders.
      No new database/table is created.
    */

    if (state.filter === "top10") {
      return [...list]
        .sort(
          (a, b) =>
            (state.metrics.get(b.id)?.spent || 0) -
            (state.metrics.get(a.id)?.spent || 0)
        )
        .slice(0, 10);
    }

    /*
      RECENT BUYERS

      Shows customers ordered by their most
      recent existing order.
    */

    if (state.filter === "recent") {
      return [...list]
        .sort(
          (a, b) =>
            new Date(
              state.metrics.get(b.id)?.last ||
                b.created_at
            ) -
            new Date(
              state.metrics.get(a.id)?.last ||
                a.created_at
            )
        )
        .slice(0, 25);
    }

    return list;
  }

  /* =========================================================
     SORTING
     ========================================================= */

  function sortList(list) {
    const copy = [...list];

    if (state.sort === "oldest") {
      return copy.sort(
        (a, b) =>
          new Date(a.created_at) -
          new Date(b.created_at)
      );
    }

    if (state.sort === "spent") {
      return copy.sort(
        (a, b) =>
          (state.metrics.get(b.id)?.spent || 0) -
          (state.metrics.get(a.id)?.spent || 0)
      );
    }

    if (state.sort === "orders") {
      return copy.sort(
        (a, b) =>
          (state.metrics.get(b.id)?.orders || 0) -
          (state.metrics.get(a.id)?.orders || 0)
      );
    }

    if (state.sort === "name") {
      return copy.sort((a, b) =>
        String(a.name || "").localeCompare(
          String(b.name || "")
        )
      );
    }

    /*
      DEFAULT:
      Newest customer first.
    */

    return copy.sort(
      (a, b) =>
        new Date(b.created_at) -
        new Date(a.created_at)
    );
  }

  /* =========================================================
     CUSTOMER SEARCH + DIRECTORY
     ========================================================= */

  function renderDirectory() {
    let list = state.customers;

    const query =
      state.search.trim().toLowerCase();

    if (query) {
      list = list.filter((customer) => {
        const searchable = [
          customer.name,
          customer.mobile,
          customer.village_locality,
          customer.district,
          customer.state,
          customer.pincode
        ];

        return searchable.some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query)
        );
      });
    }

    list = applyFilter(list);

    list = sortList(list);

    if ($("resultCount")) {
      $("resultCount").textContent =
        list.length +
        (list.length === 1
          ? " customer"
          : " customers");
    }

    if (!list.length) {
      $("customerRows").innerHTML = `
        <tr>
          <td colspan="8" class="loading-cell">
            No customers match this search/filter.
          </td>
        </tr>
      `;

      return;
    }

    $("customerRows").innerHTML = list
      .map((customer, index) => {
        const metric =
          state.metrics.get(customer.id) || {
            orders: 0,
            spent: 0,
            last: null
          };

        const location = [
          customer.district,
          customer.state
        ]
          .filter(Boolean)
          .join(", ") || "—";

        return `
          <tr data-customer-id="${esc(customer.id)}">

            <td>
              ${index + 1}
            </td>

            <td>
              <div class="customer-cell">

                <span class="mini-avatar">
                  ${esc(initials(customer.name))}
                </span>

                <strong>
                  ${esc(customer.name || "Customer")}
                </strong>

              </div>
            </td>

            <td>
              ${esc(customer.mobile || "—")}
            </td>

            <td>
              ${esc(location)}
            </td>

            <td>
              ${metric.orders}
            </td>

            <td class="money">
              ${money(metric.spent)}
            </td>

            <td>
              ${formatDate(metric.last)}
            </td>

            <td>
              <button
                class="view-btn"
                type="button"
                data-view-id="${esc(customer.id)}"
              >
                View →
              </button>
            </td>

          </tr>
        `;
      })
      .join("");
  }

  /* =========================================================
     LOAD CUSTOMER DIRECTORY
     ========================================================= */

  async function loadDirectory() {
    state.clientId = await getClientId();

    /*
      EXISTING CUSTOMERS TABLE ONLY.
      No new customer table.
    */

    state.customers = await fetchAll(
      "customers",
      [
        "id",
        "client_id",
        "name",
        "mobile",
        "house_no",
        "village_locality",
        "district",
        "state",
        "pincode",
        "landmark",
        "created_at",
        "updated_at"
      ].join(","),
      state.clientId
    );

    /*
      EXISTING ORDERS TABLE ONLY.
      No whatsapp_orders.
      No customer_orders.
    */

    state.orders = await fetchAll(
      "orders",
      [
        "id",
        "client_id",
        "customer_id",
        "quantity",
        "price_at_order",
        "total_amount",
        "product_title",
        "status",
        "payment_status",
        "created_at",
        "updated_at"
      ].join(","),
      state.clientId
    );

    buildMetrics();

    renderStats();

    renderDirectory();
  }

  /* =========================================================
     DIRECTORY VIEW
     ========================================================= */

  function showDirectory(filter = "all") {
    state.filter = filter;

    $("profileView")?.classList.add("hidden");

    $("directoryView")?.classList.remove("hidden");

    if ($("pageTitle")) {
      $("pageTitle").textContent = "Customers";
    }

    if ($("pageSubtitle")) {
      $("pageSubtitle").textContent =
        "Search, view and manage your customers";
    }

    document
      .querySelectorAll(".filter-btn")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.filter === filter
        );
      });

    renderDirectory();
  }

  /* =========================================================
     CUSTOMER PROFILE
     ========================================================= */

  function renderProfile(customer) {
    const customerOrders =
      state.orders
        .filter(
          (order) =>
            order.customer_id === customer.id
        )
        .sort(
          (a, b) =>
            new Date(b.created_at) -
            new Date(a.created_at)
        );

    const totalPurchased =
      customerOrders.reduce(
        (sum, order) =>
          sum +
          (Number(
            order.total_amount ??
            order.price_at_order ??
            0
          ) || 0),
        0
      );

    const lastPurchase =
      customerOrders[0]?.created_at || null;

    /* Profile heading */

    $("profileName").textContent =
      customer.name || "Customer";

    /* Customer information */

    $("infoName").textContent =
      customer.name || "—";

    $("infoMobile").textContent =
      customer.mobile || "—";

    $("profileAvatar").textContent =
      initials(customer.name);

    $("infoAddress").textContent =
      customer.house_no || "—";

    $("infoLocality").textContent =
      customer.village_locality || "—";

    $("infoDistrict").textContent =
      customer.district || "—";

    $("infoState").textContent =
      customer.state || "—";

    $("infoPincode").textContent =
      customer.pincode || "—";

    $("infoLandmark").textContent =
      customer.landmark || "—";

    $("infoSince").textContent =
      formatDate(customer.created_at);

    /* Overview */

    $("profileOrders").textContent =
      customerOrders.length;

    $("profilePurchased").textContent =
      money(totalPurchased);

    $("profileLastPurchase").textContent =
      formatDate(lastPurchase);

    $("profileSince").textContent =
      formatDate(customer.created_at);

    $("purchaseCount").textContent =
      customerOrders.length +
      (customerOrders.length === 1
        ? " order"
        : " orders");

    /* WhatsApp */

    const phone = String(
      customer.mobile || ""
    ).replace(/\D/g, "");

    if ($("whatsappLink")) {
      $("whatsappLink").href = phone
        ? "https://wa.me/" + phone
        : "#";
    }

    /* Purchase history */

    if (!customerOrders.length) {
      $("purchaseRows").innerHTML = `
        <tr>
          <td colspan="6" class="loading-cell">
            No orders found for this customer.
          </td>
        </tr>
      `;

      return;
    }

    $("purchaseRows").innerHTML =
      customerOrders
        .map(
          (order, index) => `
            <tr>

              <td>
                ${index + 1}
              </td>

              <td>
                ${esc(
                  order.product_title ||
                    "Service / Order"
                )}
              </td>

              <td class="money">
                ${money(
                  order.total_amount ??
                    order.price_at_order
                )}
              </td>

              <td>
                ${esc(
                  order.status || "—"
                )}
              </td>

              <td>
                ${esc(
                  order.payment_status ||
                    "—"
                )}
              </td>

              <td>
                ${formatDate(
                  order.created_at
                )}
              </td>

            </tr>
          `
        )
        .join("");
  }

  /* =========================================================
     OPEN CUSTOMER PROFILE
     ========================================================= */

  function openProfile(customerId) {
    const customer =
      state.customers.find(
        (item) =>
          item.id === customerId
      );

    if (!customer) {
      toast("Customer not found.");

      return;
    }

    /*
      Required URL contract:
      customer.html?id=<customer_id>
    */

    history.pushState(
      { customerId },
      "",
      "customer.html?id=" +
        encodeURIComponent(customerId)
    );

    renderProfile(customer);

    $("directoryView").classList.add(
      "hidden"
    );

    $("profileView").classList.remove(
      "hidden"
    );

    $("pageTitle").textContent =
      "Customer Profile";

    $("pageSubtitle").textContent =
      "Customer details, activity and purchase history";

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  /* =========================================================
     EVENTS
     ========================================================= */

  function bindEvents() {
    /* Search */

    $("customerSearch").addEventListener(
      "input",
      (event) => {
        state.search =
          event.target.value;

        renderDirectory();
      }
    );

    /* Sorting */

    $("sortCustomers").addEventListener(
      "change",
      (event) => {
        state.sort =
          event.target.value;

        renderDirectory();
      }
    );

    /*
      TOTAL CUSTOMERS CARD

      Opens the complete customer directory.
    */

    $("totalCustomersCard").addEventListener(
      "click",
      () => {
        showDirectory("all");
      }
    );

    /*
      THIS MONTH CARD
    */

    $("thisMonthCard").addEventListener(
      "click",
      () => {
        showDirectory("month");
      }
    );

    /*
      QUICK FILTERS
    */

    $("quickFilters").addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            "[data-filter]"
          );

        if (!button) {
          return;
        }

        showDirectory(
          button.dataset.filter
        );
      }
    );

    /*
      CUSTOMER ROW CLICK

      Both row and View button open
      the same customer profile.
    */

    $("customerRows").addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            "[data-view-id]"
          );

        const row =
          event.target.closest(
            "tr[data-customer-id]"
          );

        const customerId =
          button?.dataset.viewId ||
          row?.dataset.customerId;

        if (customerId) {
          openProfile(customerId);
        }
      }
    );

    /*
      BACK TO DIRECTORY
    */

    $("backToCustomers").addEventListener(
      "click",
      () => {
        history.pushState(
          {},
          "",
          "customer.html"
        );

        showDirectory("all");
      }
    );

    /*
      Browser back/forward
    */

    window.addEventListener(
      "popstate",
      () => {
        route();
      }
    );
  }

  /* =========================================================
     URL ROUTING
     ========================================================= */

  function route() {
    const customerId =
      new URLSearchParams(
        window.location.search
      ).get("id");

    if (
      customerId &&
      state.customers.length
    ) {
      const customer =
        state.customers.find(
          (item) =>
            item.id === customerId
        );

      if (customer) {
        renderProfile(customer);

        $("directoryView").classList.add(
          "hidden"
        );

        $("profileView").classList.remove(
          "hidden"
        );

        $("pageTitle").textContent =
          "Customer Profile";

        $("pageSubtitle").textContent =
          "Customer details, activity and purchase history";

        return;
      }
    }

    showDirectory("all");
  }

  /* =========================================================
     BOOT
     ========================================================= */

  async function boot() {
    try {
      bindEvents();

      await loadDirectory();

      route();
    } catch (error) {
      console.error(
        "[GLIME Customers]",
        error
      );

      const rows =
        $("customerRows");

      if (rows) {
        rows.innerHTML = `
          <tr>
            <td colspan="8" class="loading-cell">
              Unable to load customers.
              Please refresh or sign in again.
            </td>
          </tr>
        `;
      }

      toast(
        error?.message ||
          "Customer loading failed."
      );
    }
  }

  boot();

})();
