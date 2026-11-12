(() => {
  "use strict";

  /* =========================================================
     Configuration and state
     ========================================================= */

  const API_BASE = "./api/";
  const PAGE_SIZE = 8;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const config = {
    transaction: {
      page: "transactions",
      title: "Transactions",
      singular: "Transaction",
      subtitle: "Track service fees, permits, and payment records.",
      icon: "i-exchange",
      sequence: ["pending", "processing", "completed"]
    },

    request: {
      page: "requests",
      title: "Requests",
      singular: "Service request",
      subtitle: "Monitor resident concerns and service requests.",
      icon: "i-clipboard",
      sequence: ["pending", "in_progress", "resolved"]
    },

    received: {
      page: "received",
      title: "Received Documents",
      singular: "Received document",
      subtitle: "Register incoming documents and track their handling.",
      icon: "i-inbox",
      sequence: ["received", "under_review", "filed"]
    }
  };

  const paymentMethods = [
    "Cash",
    "Bank Transfer",
    "GCash",
    "Credit / Debit Card"
  ];

  const documentSources = [
    "Walk-in",
    "Email",
    "Courier",
    "Online Submission"
  ];

  let currentUser = null;
  let csrf = "";

  let lookups = {
    barangays: [],
    categories: [],
    statuses: []
  };

  let records = [];
  let savedViews = [];
  let dashboard = null;

  let activePage = "overview";
  let currentPage = 1;
  let editingId = null;
  let detailId = null;
  let authMode = "login";

  let selectedIds = new Set();

  let pendingConfirmation = null;
  let toastAction = null;
  let toastTimer = null;

  let draggedId = null;
  let loading = false;
  let savingRecord = false;
  let authSubmitting = false;
  let advancing = false;
  let recordLimit = 500;

  let language = "en";

  const originalText = new Map();
  const originalPlaceholders = new Map();

  try {
    language = localStorage.getItem("portal_language") || "en";
  } catch {
    language = "en";
  }

  if (!["en", "fil"].includes(language)) {
    language = "en";
  }

  /* =========================================================
     General helpers
     ========================================================= */

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function icon(name) {
    return (
      `<svg aria-hidden="true">` +
      `<use href="#${escapeHTML(name)}"></use>` +
      `</svg>`
    );
  }

  function money(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP"
    }).format(Number(value) || 0);
  }

  function number(value) {
    return new Intl.NumberFormat("en-PH").format(Number(value) || 0);
  }

  function today() {
    const date = new Date();

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function dateLabel(value) {
    if (!value) return "";

    /*
     * MySQL DATETIME values have no timezone suffix.
     * Treat them as the server's displayed local time.
     */
    const date = new Date(String(value).replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString(
      language === "fil" ? "fil-PH" : "en-PH",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }
    );
  }

  function sameId(first, second) {
    return String(first) === String(second);
  }

  function findRecord(id) {
    return records.find(record => sameId(record.id, id));
  }

  function isStaff() {
    return Boolean(
      currentUser &&
      ["staff", "admin"].includes(currentUser.role)
    );
  }

  function canEdit(record) {
    return Boolean(
      currentUser &&
      (
        isStaff() ||
        (
          record.type === "request" &&
          sameId(record.ownerId, currentUser.id)
        )
      )
    );
  }

  function currentType() {
    return Object.keys(config).find(
      type => config[type].page === activePage
    ) || "transaction";
  }

  function statusClass(code) {
    if (["completed", "resolved", "filed"].includes(code)) {
      return "success";
    }

    if (["cancelled", "returned"].includes(code)) {
      return "danger";
    }

    if (["processing", "in_progress", "under_review"].includes(code)) {
      return "info";
    }

    return "warning";
  }

  function badge(record) {
    return (
      `<span class="badge ${statusClass(record.statusCode)}">` +
      `${escapeHTML(record.status)}</span>`
    );
  }

  function statusLabel(type, code) {
    return lookups.statuses.find(
      status => status.type === type && status.code === code
    )?.label || code;
  }

  function nextStatus(record) {
    const sequence = config[record.type].sequence;
    const index = sequence.indexOf(record.statusCode);

    return index >= 0 && index < sequence.length - 1
      ? sequence[index + 1]
      : null;
  }

  function selectOptions(
    element,
    rows,
    selected = "",
    placeholder = null
  ) {
    const first = placeholder === null
      ? ""
      : `<option value="">${escapeHTML(placeholder)}</option>`;

    element.innerHTML = first + rows.map(row => {
      const value = typeof row === "string"
        ? row
        : row.value ?? row.id;

      const label = typeof row === "string"
        ? row
        : row.label ?? row.name;

      return (
        `<option value="${escapeHTML(value)}"` +
        `${sameId(value, selected) ? " selected" : ""}>` +
        `${escapeHTML(label)}</option>`
      );
    }).join("");
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);

    if (dialog?.open) {
      dialog.close();
    }
  }

  function toast(message, label = "", callback = null) {
    $("#toastMessage").textContent = message;
    $("#toastActionBtn").textContent = label;
    $("#toastActionBtn").hidden = !label;

    toastAction = callback;

    $("#toast").hidden = false;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      $("#toast").hidden = true;
      toastAction = null;
    }, label ? 10000 : 6000);
  }

  function confirmAction(
    title,
    message,
    callback,
    buttonLabel = "Delete"
  ) {
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    $("#confirmActionBtn").textContent = buttonLabel;

    pendingConfirmation = callback;

    openDialog("confirmDialog");
  }

  /* =========================================================
     API requests
     ========================================================= */

  async function api(file, options = {}) {
    const method = options.method || "GET";

    const settings = {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    };

    if (method !== "GET") {
      settings.headers["Content-Type"] = "application/json";
      settings.headers["X-CSRF-Token"] = csrf;
      settings.body = JSON.stringify(options.body || {});
    }

    let response;

    try {
      response = await fetch(API_BASE + file, settings);
    } catch {
      throw new Error(
        "Cannot reach the server. Make sure Apache and MySQL are running."
      );
    }

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      console.error("Non-JSON API response:", raw);

      throw new Error(
        `The server returned an invalid response for ${file}. ` +
        "Check the PHP error log."
      );
    }

    if (data.csrf) {
      csrf = data.csrf;
    }

    if (!response.ok || !data.ok) {
      if (response.status === 401) {
        currentUser = null;
        clearAccountData();
        updateAuthUI();
        renderAll();
      }

      const error = new Error(
        data.message || "The request could not be completed."
      );

      error.status = response.status;

      throw error;
    }

    return data;
  }

  async function loadSession() {
    const response = await api("auth.php");

    currentUser = response.user;
    csrf = response.csrf;
    lookups = response.lookups;

    updateAuthUI();
    populateAuthBarangays();
  }

  function clearAccountData() {
    records = [];
    savedViews = [];
    dashboard = null;
    selectedIds.clear();
  }

  async function refreshData() {
    if (!currentUser) {
      clearAccountData();
      renderAll();
      return;
    }

    loading = true;

    try {
      const [recordResponse, dashboardResponse, viewResponse] =
        await Promise.all([
          api("records.php"),
          api("dashboard.php"),
          api("views.php")
        ]);

      records = recordResponse.records;
      recordLimit = recordResponse.limit || 500;
      dashboard = dashboardResponse;
      savedViews = viewResponse.views;

      const existingIds = new Set(records.map(record => String(record.id)));

      selectedIds = new Set(
        [...selectedIds].filter(id => existingIds.has(String(id)))
      );

      renderAll();
      renderSavedViews();

    } finally {
      loading = false;
    }
  }

  /* =========================================================
     Language
     Static labels have Filipino translations.
     Database content remains as entered.
     ========================================================= */

  const filipino = {
    brand_sub: "Portal ng serbisyo publiko · Lungsod Quezon",
    nav_overview: "Pangkalahatan",
    nav_transactions: "Transaksiyon",
    nav_requests: "Mga Kahilingan",
    nav_received: "Natanggap",
    new_record: "Bagong tala",
    sign_in: "Mag-sign in",
    sign_out: "Mag-sign out",
    hero_eyebrow: "Lungsod Quezon · Metro Manila, Pilipinas",
    hero_title: "Mga serbisyo ng lungsod, nasa iisang lugar.",
    hero_body:
      "Magtala ng bayarin, subaybayan ang mga kahilingan, " +
      "at irehistro ang mga natanggap na dokumento.",
    hero_cta1: "Bagong transaksiyon",
    hero_cta2: "Magsumite ng kahilingan",
    recent_title: "Kamakailang aktibidad",
    recent_sub: "Pinakabagong mga tala sa service desk.",
    view_all: "Tingnan ang mga transaksiyon",
    quick_title: "Magsimula ng serbisyo",
    quick_txn: "Bagong transaksiyon",
    quick_txn_sub: "Magtala ng bayarin, permit, o pagbabayad",
    quick_req: "Bagong kahilingan",
    quick_req_sub: "Mag-ulat o humingi ng tulong",
    quick_rec: "Tumanggap ng dokumento",
    quick_rec_sub: "Irehistro ang papasok na dokumento",
    desk_title: "Oras ng service desk",
    chart_title: "Koleksiyon ayon sa serbisyo",
    chart_sub: "Mga nakumpletong transaksiyon, piso",
    brgy_title: "Mga bukas na kahilingan ayon sa barangay",
    brgy_sub: "Mga barangay na may bukas na kahilingan",
    export_csv: "I-export ang CSV",
    sort_newest: "Pinakabago",
    sort_oldest: "Pinakaluma",
    sort_name: "Pangalan A–Z",
    sort_amount: "Halaga: mataas–mababa",
    sort_custom: "Sariling pagkakasunod",
    drag_hint: "I-drag ang hawakan upang baguhin ang pagkakasunod.",
    bulk_advance: "Isulong ang status",
    delete: "Burahin",
    clear: "Alisin ang pagpili",
    empty_title: "Walang nakitang tala",
    empty_body: "Subukan ang ibang paghahanap o alisin ang mga filter.",
    clear_filters: "Alisin ang mga filter",
    form_type: "Uri ng tala",
    type_transaction: "Transaksiyon",
    type_request: "Kahilingan sa serbisyo",
    type_received: "Natanggap na dokumento",
    form_category: "Kategorya",
    form_name: "Pangalan ng residente / nagpadala",
    form_email: "Email",
    optional: "(opsiyonal)",
    form_date: "Petsa",
    form_barangay: "Barangay",
    form_amount: "Halaga (PHP)",
    form_priority: "Prayoridad",
    priority_low: "Mababa",
    priority_normal: "Karaniwan",
    priority_high: "Mataas",
    form_method: "Paraan ng pagbabayad",
    form_source: "Paraan ng pagtanggap",
    form_location: "Lokasyon",
    form_status: "Status",
    form_notes: "Mga tala",
    cancel: "Kanselahin",
    view_title: "I-save ang kasalukuyang view",
    view_name: "Pangalan ng view",
    view_hint: "I-save ang paghahanap, mga filter, at pagkakasunod.",
    view_save: "I-save ang view",
    auth_fullname: "Buong pangalan",
    auth_password: "Password",
    auth_role: "Uri ng account"
  };

  const filipinoPlaceholders = {
    search_ph: "Maghanap ng mga tala…",
    ph_name: "Buong pangalan o organisasyon",
    ph_location: "Kalye, avenue, o pasilidad",
    ph_notes: "Magdagdag ng mahalagang impormasyon tungkol sa tala."
  };

  function applyLanguage() {
    document.documentElement.lang = language === "fil" ? "fil" : "en";

    $$("[data-i18n]").forEach(element => {
      if (!originalText.has(element)) {
        originalText.set(element, element.textContent);
      }

      const key = element.dataset.i18n;

      element.textContent =
        language === "fil" && filipino[key]
          ? filipino[key]
          : originalText.get(element);
    });

    $$("[data-i18n-ph]").forEach(element => {
      if (!originalPlaceholders.has(element)) {
        originalPlaceholders.set(
          element,
          element.getAttribute("placeholder") || ""
        );
      }

      element.placeholder =
        language === "fil" &&
        filipinoPlaceholders[element.dataset.i18nPh]
          ? filipinoPlaceholders[element.dataset.i18nPh]
          : originalPlaceholders.get(element);
    });

    $("#langEn").setAttribute(
      "aria-pressed",
      String(language === "en")
    );

    $("#langFil").setAttribute(
      "aria-pressed",
      String(language === "fil")
    );

    $("#todayLabel").textContent = new Date().toLocaleDateString(
      language === "fil" ? "fil-PH" : "en-PH",
      {
        weekday: "short",
        month: "short",
        day: "numeric"
      }
    );

    try {
      localStorage.setItem("portal_language", language);
    } catch {
      // Only the language preference uses local storage.
    }
  }

  /* =========================================================
     Authentication interface
     ========================================================= */

  function updateAuthUI() {
    $("#openAuthBtn").hidden = Boolean(currentUser);
    $("#userMenu").hidden = !currentUser;

    $("#userDropdown").hidden = true;
    $("#userChipBtn").setAttribute("aria-expanded", "false");

    $("#demoAccountsBox").hidden = true;
    $("#authRoleField").hidden = true;

    if (!currentUser) return;

    const initials = currentUser.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join("")
      .toUpperCase();

    $("#userAvatar").textContent = initials;
    $("#userDisplayName").textContent = currentUser.name;

    $("#userDisplayRole").textContent =
      currentUser.role === "admin"
        ? "Administrator"
        : isStaff()
          ? "Service Desk"
          : "Resident";

    $("#dropUserName").textContent = currentUser.name;
    $("#dropUserEmail").textContent = currentUser.email;

    $("#dropUserBadge").textContent =
      currentUser.role === "admin"
        ? "Administrator"
        : isStaff()
          ? "Staff"
          : "Resident";
  }

  function populateAuthBarangays() {
    selectOptions(
      $("#aBarangay"),
      lookups.barangays,
      "",
      "Other / Not listed"
    );
  }

  function setAuthMode(mode) {
    authMode = mode;

    const registering = mode === "register";

    $("#authTitle").textContent =
      registering ? "Create your account" : "Sign in";

    $("#authSubmitBtn").textContent =
      registering ? "Create account" : "Sign In";

    $("#authNameField").hidden = !registering;
    $("#authBrgyField").hidden = !registering;

    $("#authRoleField").hidden = true;
    $("#demoAccountsBox").hidden = true;

    $("#aName").required = registering;
    $("#aPassword").minLength = registering ? 12 : 1;
    $("#aPassword").placeholder = registering
      ? "At least 12 characters"
      : "Enter your password";

    $("#aPassword").autocomplete = registering
      ? "new-password"
      : "current-password";

    $("#authGeneralError").textContent = "";

    $$("[data-auth-error]").forEach(element => {
      element.textContent = "";
    });

    $$("[data-auth-mode]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.authMode === mode
      );
    });
  }

  function requireLogin() {
    if (currentUser) return true;

    setAuthMode("login");
    openDialog("authDialog");

    return false;
  }

  async function handleAuthentication(event) {
    event.preventDefault();

    if (authSubmitting) return;

    const email = $("#aEmail").value.trim().toLowerCase();
    const password = $("#aPassword").value;
    const name = $("#aName").value.trim();

    $("#authGeneralError").textContent = "";

    if (!email || !$("#aEmail").validity.valid) {
      $("#authGeneralError").textContent =
        "Enter a valid email address.";
      return;
    }

    if (!password) {
      $("#authGeneralError").textContent =
        "Enter your password.";
      return;
    }

    if (authMode === "register" && !name) {
      $("#authGeneralError").textContent =
        "Enter your full name.";
      return;
    }

    if (authMode === "register" && password.length < 12) {
      $("#authGeneralError").textContent =
        "Use a password with at least 12 characters.";
      return;
    }

    authSubmitting = true;

    const button = $("#authSubmitBtn");
    button.disabled = true;
    button.textContent = "Please wait…";

    let authenticated = false;

    try {
      const response = await api("auth.php", {
        method: "POST",
        body: {
          action: authMode,
          email,
          password,
          name,
          barangayId: $("#aBarangay").value || null
        }
      });

      if (authMode === "register") {
        setAuthMode("login");
        $("#aPassword").value = "";

        toast("Account created. Sign in with your new password.");
        return;
      }

      currentUser = response.user;
      authenticated = true;

      $("#aPassword").value = "";
      selectedIds.clear();

      closeDialog("authDialog");
      updateAuthUI();

      await refreshData();

      toast(`Welcome, ${currentUser.name}.`);

    } catch (error) {
      if (authenticated) {
        toast(
          "Signed in, but some portal data could not load. " +
          error.message
        );
      } else {
        $("#authGeneralError").textContent = error.message;
      }

    } finally {
      authSubmitting = false;
      button.disabled = false;

      button.textContent =
        authMode === "register" ? "Create account" : "Sign In";
    }
  }

  async function logout() {
    try {
      await api("auth.php", {
        method: "POST",
        body: { action: "logout" }
      });

      currentUser = null;
      clearAccountData();

      closeDialog("detailDialog");
      closeDialog("recordDialog");

      updateAuthUI();
      navigate("overview");

      toast("Signed out.");

    } catch (error) {
      toast(error.message);
    }
  }

  /* =========================================================
     Dashboard
     ========================================================= */

  function renderOverview() {
    const stats = dashboard?.stats || {
      transactions: 0,
      openRequests: 0,
      documents: 0,
      collections: 0
    };

    const cards = [
      {
        title: "Transactions",
        value: number(stats.transactions),
        foot: "Recorded transactions",
        icon: "i-exchange",
        color: "blue"
      },
      {
        title: "Open requests",
        value: number(stats.openRequests),
        foot: "Awaiting resolution",
        icon: "i-clipboard",
        color: "gold"
      },
      {
        title: "Documents",
        value: number(stats.documents),
        foot: "Incoming document records",
        icon: "i-inbox",
        color: "purple"
      },
      {
        title: "Collections",
        value: money(stats.collections),
        foot: "Completed transaction records",
        icon: "i-card",
        color: "green"
      }
    ];

    $("#statsGrid").innerHTML = cards.map(card => `
      <article class="stat-card">
        <div class="stat-top">
          <span>${escapeHTML(card.title)}</span>

          <span class="stat-icon ${card.color}">
            ${icon(card.icon)}
          </span>
        </div>

        <strong class="stat-value">
          ${escapeHTML(card.value)}
        </strong>

        <span class="stat-foot">
          ${escapeHTML(card.foot)}
        </span>
      </article>
    `).join("");

    const recent = dashboard?.recent || [];

    $("#recentList").innerHTML = recent.length
      ? recent.map(record => `
        <button
          class="recent-row"
          type="button"
          data-detail="${escapeHTML(record.id)}"
        >
          <span class="recent-icon ${escapeHTML(record.type)}">
            ${icon(config[record.type].icon)}
          </span>

          <span class="recent-copy">
            <strong>${escapeHTML(record.title)}</strong>

            <small>
              ${escapeHTML(record.name)} ·
              ${escapeHTML(record.barangay)}
            </small>
          </span>

          <span class="recent-meta">
            ${badge(record)}

            ${
              record.type === "transaction"
                ? `<span class="amount">
                    ${escapeHTML(money(record.amount))}
                   </span>`
                : ""
            }
          </span>
        </button>
      `).join("")
      : `
        <p class="chart-empty" style="padding:20px">
          ${
            currentUser
              ? "No recent records yet."
              : "Sign in to view your records."
          }
        </p>
      `;

    renderChart(
      $("#collectionsChart"),
      dashboard?.collectionsChart || [],
      true,
      "var(--blue)"
    );

    renderChart(
      $("#barangayChart"),
      dashboard?.barangayChart || [],
      false,
      "var(--purple)"
    );

    $("#brgyUnit").textContent = "Top barangays";
  }

  function renderChart(container, entries, currency, color) {
    const maximum = Math.max(
      1,
      ...entries.map(entry => Number(entry.value))
    );

    container.innerHTML = entries.length
      ? entries.map(entry => `
        <div class="chart-row">
          <span
            class="chart-label"
            title="${escapeHTML(entry.label)}"
          >
            ${escapeHTML(entry.label)}
          </span>

          <div class="chart-track">
            <div
              class="chart-fill"
              style="
                width:${Math.max(
                  2,
                  Number(entry.value) / maximum * 100
                )}%;
                background-color:${color}
              "
            ></div>
          </div>

          <span class="chart-value">
            ${escapeHTML(
              currency ? money(entry.value) : number(entry.value)
            )}
          </span>
        </div>
      `).join("")
      : `<p class="chart-empty">${
          currentUser
            ? "No matching records yet."
            : "Sign in to load this chart."
        }</p>`;
  }

  /* =========================================================
     Navigation, filters, and records table
     ========================================================= */

  function populateFilters() {
    const type = currentType();

    selectOptions(
      $("#statusFilter"),
      lookups.statuses
        .filter(status => status.type === type)
        .map(status => ({
          value: status.code,
          label: status.label
        })),
      "",
      "All statuses"
    );

    selectOptions(
      $("#categoryFilter"),
      lookups.categories.filter(category => category.type === type),
      "",
      "All categories"
    );

    selectOptions(
      $("#barangayFilter"),
      [
        ...lookups.barangays,
        { id: "other", name: "Other / Not listed" }
      ],
      "",
      "All barangays"
    );
  }

  function filteredRecords() {
    const type = currentType();

    const query = $("#searchInput").value.trim().toLowerCase();
    const status = $("#statusFilter").value;
    const category = $("#categoryFilter").value;
    const barangay = $("#barangayFilter").value;
    const sort = $("#sortSelect").value;

    const result = records.filter(record => {
      const haystack = [
        record.ref,
        record.title,
        record.name,
        record.email,
        record.category,
        record.barangay
      ].join(" ").toLowerCase();

      const barangayMatches = !barangay
        || (
          barangay === "other"
            ? record.barangayId === null
            : sameId(record.barangayId, barangay)
        );

      return record.type === type
        && (!query || haystack.includes(query))
        && (!status || record.statusCode === status)
        && (!category || sameId(record.categoryId, category))
        && barangayMatches;
    });

    result.sort((first, second) => {
      switch (sort) {
        case "oldest":
          return first.createdAt.localeCompare(second.createdAt)
            || Number(first.id) - Number(second.id);

        case "name":
          return first.name.localeCompare(second.name);

        case "amount":
          return Number(second.amount) - Number(first.amount);

        case "custom":
          return Number(first.order) - Number(second.order)
            || Number(first.id) - Number(second.id);

        default:
          return second.createdAt.localeCompare(first.createdAt)
            || Number(second.id) - Number(first.id);
      }
    });

    return result;
  }

  function hasActiveFilters() {
    return Boolean(
      $("#searchInput").value.trim()
      || $("#statusFilter").value
      || $("#categoryFilter").value
      || $("#barangayFilter").value
    );
  }

  function canReorder() {
    return isStaff()
      && $("#sortSelect").value === "custom"
      && !hasActiveFilters()
      && records.length < recordLimit;
  }

  function renderRecords() {
    const type = currentType();
    const settings = config[type];

    $("#recordsTitle").textContent = settings.title;

    $("#recordsEyebrow").textContent =
      `Quezon City Hall / ${settings.title}`;

    $("#recordsSubtitle").textContent = settings.subtitle;

    $("#pageNewLabel").textContent =
      `New ${settings.singular.toLowerCase()}`;

    $("#pageNewBtn").hidden =
      Boolean(currentUser && !isStaff() && type !== "request");

    const result = filteredRecords();
    const totalPages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));

    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRecords = result.slice(start, start + PAGE_SIZE);

    const typeRecords = records.filter(record => record.type === type);

    const completed = typeRecords.filter(record =>
      ["completed", "resolved", "filed"].includes(record.statusCode)
    ).length;

    $("#miniStats").innerHTML = [
      ["Loaded records", typeRecords.length],
      ["Completed / resolved", completed],
      ["Matching filters", result.length]
    ].map(([label, value]) => `
      <div class="mini-stat">
        <span>${escapeHTML(label)}</span>
        <strong>${number(value)}</strong>
      </div>
    `).join("");

    $("#tableHead").innerHTML = `
      <tr>
        <th class="col-check">
          <input
            type="checkbox"
            id="selectAllRows"
            aria-label="Select editable records on this page"
          >
        </th>

        <th class="col-drag"></th>
        <th>Reference / Service</th>
        <th>Resident / Sender</th>
        <th>Barangay</th>
        <th>Date</th>
        <th>Status</th>

        <th class="col-amount">
          ${type === "transaction" ? "Amount" : "Priority"}
        </th>

        <th>Actions</th>
      </tr>
    `;

    const reorderAllowed = canReorder();

    $("#dragHint").hidden = !(
      isStaff() && $("#sortSelect").value === "custom"
    );

    $("#dragHint").textContent = reorderAllowed
      ? "Drag a handle to rearrange rows."
      : "Clear filters to reorder. Reordering is unavailable when the record loading limit is reached.";

    $("#tableBody").innerHTML = pageRecords.map(record => {
      const editable = canEdit(record);
      const id = String(record.id);

      return `
        <tr
          data-record-id="${escapeHTML(id)}"
          class="${selectedIds.has(id) ? "selected" : ""}"
        >
          <td class="col-check">
            <input
              type="checkbox"
              data-select="${escapeHTML(id)}"
              aria-label="Select ${escapeHTML(record.ref)}"
              ${selectedIds.has(id) ? "checked" : ""}
              ${editable ? "" : "disabled"}
            >
          </td>

          <td class="col-drag">
            <span
              class="drag-handle ${reorderAllowed ? "" : "disabled"}"
              draggable="${reorderAllowed}"
              title="Drag to reorder"
            >
              ${icon("i-drag")}
            </span>
          </td>

          <td>
            <button
              type="button"
              class="row-open"
              data-detail="${escapeHTML(id)}"
            >
              <span class="cell-main">
                <strong>${escapeHTML(record.title)}</strong>
                <small>${escapeHTML(record.ref)}</small>
              </span>
            </button>
          </td>

          <td>
            ${escapeHTML(record.name)}

            <small class="cell-sub">
              ${escapeHTML(record.category)}
            </small>
          </td>

          <td>${escapeHTML(record.barangay)}</td>
          <td>${escapeHTML(record.date)}</td>
          <td>${badge(record)}</td>

          <td class="col-amount">
            ${
              type === "transaction"
                ? escapeHTML(money(record.amount))
                : `<span class="priority ${escapeHTML(record.priority)}">
                    ${escapeHTML(record.priority)}
                   </span>`
            }
          </td>

          <td class="col-actions">
            <button
              type="button"
              class="icon-btn"
              data-detail="${escapeHTML(id)}"
              aria-label="View record"
            >
              ${icon("i-eye")}
            </button>

            ${
              editable
                ? `
                  <button
                    type="button"
                    class="icon-btn"
                    data-edit="${escapeHTML(id)}"
                    aria-label="Edit record"
                  >
                    ${icon("i-edit")}
                  </button>

                  <button
                    type="button"
                    class="icon-btn danger"
                    data-delete="${escapeHTML(id)}"
                    aria-label="Delete record"
                  >
                    ${icon("i-trash")}
                  </button>
                `
                : ""
            }
          </td>
        </tr>
      `;
    }).join("");

    $("#emptyState").hidden = result.length > 0;

    $("#emptyState p").textContent = currentUser
      ? "Try another search, clear the filters, or create a record."
      : "Sign in to view your records.";

    const limitNote = records.length >= recordLimit
      ? ` · Latest ${recordLimit} records loaded`
      : "";

    $("#rangeLabel").textContent = result.length
      ? `Showing ${start + 1}–${Math.min(
          start + PAGE_SIZE,
          result.length
        )} of ${result.length}${limitNote}`
      : "No records to display";

    $("#pageLabel").textContent = `${currentPage} / ${totalPages}`;

    $("#prevPageBtn").disabled = currentPage <= 1;
    $("#nextPageBtn").disabled = currentPage >= totalPages;

    const editableRows = pageRecords.filter(canEdit);
    const selectAll = $("#selectAllRows");

    selectAll.disabled = editableRows.length === 0;

    selectAll.checked = editableRows.length > 0
      && editableRows.every(record =>
        selectedIds.has(String(record.id))
      );

    selectAll.indeterminate = !selectAll.checked
      && editableRows.some(record =>
        selectedIds.has(String(record.id))
      );

    $("#bulkBar").hidden = selectedIds.size === 0;
    $("#bulkCount").textContent = `${selectedIds.size} selected`;

    $("#bulkAdvanceBtn").hidden = !isStaff();
  }

  function renderAll() {
    renderOverview();

    if (activePage !== "overview") {
      renderRecords();
    }
  }

  function navigate(destination) {
    activePage = destination;
    currentPage = 1;
    selectedIds.clear();

    $("#overviewPage").hidden = destination !== "overview";
    $("#recordsPage").hidden = destination === "overview";

    $$("[data-nav]").forEach(button => {
      const active = button.dataset.nav === destination;

      button.classList.toggle("active", active);

      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    if (destination !== "overview") {
      $("#searchInput").value = "";
      $("#sortSelect").value = "newest";

      populateFilters();
      renderSavedViews();
    }

    renderAll();
  }

  function resetFilters() {
    $("#searchInput").value = "";
    $("#statusFilter").value = "";
    $("#categoryFilter").value = "";
    $("#barangayFilter").value = "";
    $("#sortSelect").value = "newest";
    $("#savedViewsSelect").value = "";
    $("#deleteViewBtn").hidden = true;

    currentPage = 1;
    selectedIds.clear();

    renderRecords();
  }

  /* =========================================================
     Record forms
     ========================================================= */

  function configureRecordForm(type, record = null) {
    const categories = lookups.categories.filter(
      category => category.type === type
    );

    const statuses = lookups.statuses
      .filter(status => status.type === type)
      .map(status => ({
        value: status.code,
        label: status.label
      }));

    selectOptions(
      $("#fCategory"),
      categories,
      record?.categoryId || "",
      "Select category"
    );

    selectOptions(
      $("#fStatus"),
      statuses,
      record?.statusCode || statuses[0]?.value || ""
    );

    $("#amountField").hidden = type !== "transaction";
    $("#methodField").hidden = type !== "transaction";

    $("#priorityField").hidden = type !== "request";
    $("#locationField").hidden = type !== "request";

    $("#sourceField").hidden = type !== "received";

    $("#fAmount").required = type === "transaction";

    /*
     * Status changes use the separate staff-only status endpoint.
     */
    $("#fStatus").disabled = true;

    $("#fType").disabled = Boolean(editingId) || !isStaff();

    $("#formTitle").textContent =
      `${editingId ? "Edit" : "New"} ${config[type].singular.toLowerCase()}`;

    $("#formEyebrow").textContent =
      editingId ? "Update record" : "New record";

    $("#fTitleLabel").textContent =
      type === "received"
        ? "Document title"
        : "Service / description";

    $("#saveRecordBtn").textContent =
      editingId
        ? "Save changes"
        : `Save ${config[type].singular.toLowerCase()}`;
  }

  function clearRecordErrors() {
    $$("[data-error]", $("#recordForm")).forEach(element => {
      element.textContent = "";
    });

    $$(".field.invalid", $("#recordForm")).forEach(element => {
      element.classList.remove("invalid");
    });
  }

  function recordError(key, message) {
    const errorElement = $(`[data-error="${key}"]`);

    if (!errorElement) return;

    errorElement.textContent = message;
    errorElement.closest(".field")?.classList.add("invalid");
  }

  async function openRecordForm(type, id = null) {
    if (!requireLogin()) return;

    try {
      let record = null;

      if (id !== null) {
        const response = await api(
          `records.php?id=${encodeURIComponent(id)}`
        );

        record = response.record;

        if (!canEdit(record)) {
          toast("You cannot edit this record.");
          return;
        }

        type = record.type;
      }

      if (!config[type]) {
        type = "request";
      }

      if (!isStaff() && type !== "request") {
        toast("Resident accounts can create service requests only.");
        return;
      }

      editingId = record?.id || null;

      $("#recordForm").reset();
      clearRecordErrors();

      selectOptions(
        $("#fBarangay"),
        lookups.barangays,
        record?.barangayId || currentUser.barangay_id || "",
        "Other / Not listed"
      );

      selectOptions(
        $("#fMethod"),
        paymentMethods,
        record?.method || "Cash"
      );

      selectOptions(
        $("#fSource"),
        documentSources,
        record?.source || "Walk-in"
      );

      $("#fType").value = type;

      configureRecordForm(type, record);

      $("#fTitle").value = record?.title || "";
      $("#fDate").value = record?.date || today();

      $("#fName").value = record?.name || currentUser.name;
      $("#fEmail").value = record?.email || currentUser.email;

      $("#fName").readOnly = !isStaff();
      $("#fEmail").readOnly = !isStaff();

      $("#fAmount").value = record?.amount || "";
      $("#fPriority").value = record?.priority || "Normal";
      $("#fLocation").value = record?.location || "";
      $("#fNotes").value = record?.notes || "";

      closeDialog("detailDialog");
      openDialog("recordDialog");

    } catch (error) {
      toast(error.message);
    }
  }

  async function saveRecord(event) {
    event.preventDefault();

    if (savingRecord || !requireLogin()) return;

    clearRecordErrors();

    const type = $("#fType").value;
    const title = $("#fTitle").value.trim();
    const name = $("#fName").value.trim();
    const email = $("#fEmail").value.trim();
    const date = $("#fDate").value;
    const amount = $("#fAmount").value.trim();

    let valid = true;

    if (!title) {
      recordError("title", "Enter a service or document title.");
      valid = false;
    }

    if (!name) {
      recordError("name", "Enter a resident or sender name.");
      valid = false;
    }

    if (email && !$("#fEmail").validity.valid) {
      recordError("email", "Enter a valid email address.");
      valid = false;
    }

    if (!date || !$("#fDate").validity.valid) {
      recordError("date", "Select a valid date.");
      valid = false;
    }

    if (!$("#fCategory").value) {
      recordError("category", "Select a category.");
      valid = false;
    }

    if (
      type === "transaction" &&
      !/^\d{1,8}(?:\.\d{1,2})?$/.test(amount)
    ) {
      recordError(
        "amount",
        "Enter an amount from 0 to 99,999,999.99."
      );
      valid = false;
    }

    if (!valid) {
      $(".field.invalid input, .field.invalid select")?.focus();
      return;
    }

    savingRecord = true;

    const button = $("#saveRecordBtn");
    const originalLabel = button.textContent;

    button.disabled = true;
    button.textContent = "Saving…";

    let saved = false;

    try {
      await api("records.php", {
        method: "POST",
        body: {
          action: editingId ? "update" : "create",
          id: editingId,
          type,
          title,
          name,
          email,
          date,
          categoryId: $("#fCategory").value,
          barangayId: $("#fBarangay").value || null,
          priority: $("#fPriority").value,
          amount: type === "transaction" ? amount : "0.00",
          method: $("#fMethod").value,
          source: $("#fSource").value,
          location: $("#fLocation").value.trim(),
          notes: $("#fNotes").value.trim()
        }
      });

      saved = true;

      closeDialog("recordDialog");

      await refreshData();

      toast(editingId ? "Record updated." : "Record created.");

    } catch (error) {
      toast(
        saved
          ? "The record was saved, but the display could not refresh. " +
            error.message
          : error.message
      );

    } finally {
      savingRecord = false;
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  /* =========================================================
     Record details and status updates
     ========================================================= */

  async function showDetails(id) {
    if (!requireLogin()) return;

    try {
      const response = await api(
        `records.php?id=${encodeURIComponent(id)}`
      );

      const record = response.record;
      detailId = record.id;

      $("#detailEyebrow").textContent = config[record.type].singular;
      $("#detailTitle").textContent = record.title;

      const details = [
        ["Category", record.category],
        ["Barangay", record.barangay],
        ["Date", record.date],
        ["Email", record.email || "Not provided"],
        [
          record.type === "transaction" ? "Amount" : "Priority",
          record.type === "transaction"
            ? money(record.amount)
            : record.priority
        ],
        [
          record.type === "received"
            ? "Received through"
            : "Payment method",
          record.type === "received"
            ? record.source
            : record.type === "transaction"
              ? record.method
              : "Not applicable"
        ]
      ];

      $("#detailBody").innerHTML = `
        <div class="detail-status">
          <span class="detail-ref">${escapeHTML(record.ref)}</span>
          ${badge(record)}
        </div>

        <p class="detail-person">
          ${escapeHTML(record.name)}
        </p>

        <div class="detail-grid">
          ${details.map(([label, value]) => `
            <div class="detail-item">
              <span>${escapeHTML(label)}</span>
              <strong>${escapeHTML(value)}</strong>
            </div>
          `).join("")}
        </div>

        ${
          record.location
            ? `<div class="detail-notes">
                Location: ${escapeHTML(record.location)}
               </div>`
            : ""
        }

        ${
          record.notes
            ? `<div class="detail-notes">
                ${escapeHTML(record.notes)}
               </div>`
            : ""
        }

        <h3 style="margin-bottom:16px">Activity history</h3>

        <div class="timeline">
          ${[...record.history].reverse().map(entry => `
            <div class="timeline-item">
              <strong>${escapeHTML(entry.label)}</strong>

              <small>
                ${escapeHTML(dateLabel(entry.at))}
                · ${escapeHTML(entry.actor)}
              </small>
            </div>
          `).join("")}
        </div>
      `;

      const next = nextStatus(record);

      $("#detailActions").innerHTML = `
        ${
          canEdit(record)
            ? `<button
                class="btn"
                type="button"
                data-edit="${escapeHTML(record.id)}"
              >
                ${icon("i-edit")} Edit
              </button>`
            : ""
        }

        ${
          isStaff() && next
            ? `<button
                class="btn primary"
                type="button"
                data-advance="${escapeHTML(record.id)}"
                data-next-status="${escapeHTML(next)}"
              >
                ${icon("i-check")}
                ${escapeHTML(statusLabel(record.type, next))}
              </button>`
            : ""
        }

        ${
          isStaff() && next
            ? `<button
                class="btn danger-quiet"
                type="button"
                data-close-record="${escapeHTML(record.id)}"
                data-close-status="${
                  record.type === "received" ? "returned" : "cancelled"
                }"
              >
                ${record.type === "received" ? "Return" : "Cancel"}
              </button>`
            : ""
        }

        ${
          canEdit(record)
            ? `<button
                class="icon-btn danger"
                type="button"
                data-delete="${escapeHTML(record.id)}"
                aria-label="Delete record"
              >
                ${icon("i-trash")}
              </button>`
            : ""
        }
      `;

      openDialog("detailDialog");

    } catch (error) {
      toast(error.message);
    }
  }

  async function changeStatus(id, statusCode = "") {
    if (!isStaff() || advancing) return;

    advancing = true;
    let saved = false;

    try {
      await api("status.php", {
        method: "POST",
        body: {
          id,
          statusCode
        }
      });

      saved = true;

      await refreshData();

      if ($("#detailDialog").open && sameId(detailId, id)) {
        await showDetails(id);
      }

      toast("Status updated.");

    } catch (error) {
      toast(
        saved
          ? "Status saved, but the display could not refresh. " +
            error.message
          : error.message
      );

    } finally {
      advancing = false;
    }
  }

  function confirmCloseRecord(id, statusCode) {
    confirmAction(
      statusCode === "returned" ? "Return document?" : "Cancel record?",
      "This closes the record's current workflow.",
      () => changeStatus(id, statusCode),
      statusCode === "returned" ? "Return" : "Cancel record"
    );
  }

  async function bulkAdvance() {
    if (!isStaff() || advancing) return;

    const eligible = [...selectedIds]
      .map(findRecord)
      .filter(record => record && nextStatus(record));

    if (!eligible.length) {
      toast("Select records that can still advance.");
      return;
    }

    advancing = true;

    let completed = 0;
    let failure = "";

    try {
      for (const record of eligible) {
        try {
          await api("status.php", {
            method: "POST",
            body: {
              id: record.id,
              statusCode: nextStatus(record)
            }
          });

          completed++;

        } catch (error) {
          failure = error.message;
          break;
        }
      }

      selectedIds.clear();

      await refreshData();

      toast(
        `${completed} record(s) updated.` +
        (failure ? ` ${failure}` : "")
      );

    } catch (error) {
      toast(
        `${completed} update(s) saved. Refresh failed: ${error.message}`
      );

    } finally {
      advancing = false;
    }
  }

  /* =========================================================
     Deletion and restoration
     ========================================================= */

  function requestDelete(ids) {
    const editable = ids
      .map(findRecord)
      .filter(record => record && canEdit(record));

    /*
     * A detail record may not be present in the bounded list.
     * Single-record permissions are checked again by the API.
     */
    const targets = editable.length
      ? editable.map(record => record.id)
      : ids.length === 1
        ? ids
        : [];

    if (!targets.length) {
      toast("Select editable records first.");
      return;
    }

    confirmAction(
      "Delete records?",
      `Delete ${targets.length} record(s)? Staff can restore soft-deleted records.`,
      () => deleteRecords(targets)
    );
  }

  async function deleteRecords(ids) {
    const deleted = [];
    let failure = "";

    for (const id of ids) {
      try {
        await api("records.php", {
          method: "POST",
          body: {
            action: "delete",
            id
          }
        });

        deleted.push(id);

      } catch (error) {
        failure = error.message;
        break;
      }
    }

    selectedIds.clear();
    closeDialog("detailDialog");

    try {
      await refreshData();
    } catch (error) {
      failure = failure || error.message;
    }

    const message = `${deleted.length} record(s) deleted.` +
      (failure ? ` ${failure}` : "");

    if (isStaff() && deleted.length) {
      toast(message, "Undo", () => restoreRecords(deleted));
    } else {
      toast(message);
    }
  }

  async function restoreRecords(ids) {
    let restored = 0;

    try {
      for (const id of ids) {
        await api("records.php", {
          method: "POST",
          body: {
            action: "restore",
            id
          }
        });

        restored++;
      }

      await refreshData();
      toast(`${restored} record(s) restored.`);

    } catch (error) {
      toast(`${restored} restored. ${error.message}`);

      try {
        await refreshData();
      } catch {
        // The original failure remains visible.
      }
    }
  }

  /* =========================================================
     Saved views
     ========================================================= */

  function renderSavedViews() {
    if (activePage === "overview") return;

    const previous = $("#savedViewsSelect").value;
    const type = currentType();

    const available = savedViews.filter(view => view.type === type);

    selectOptions(
      $("#savedViewsSelect"),
      available,
      previous,
      "Saved views"
    );

    $("#deleteViewBtn").hidden = !$("#savedViewsSelect").value;
  }

  async function saveView(event) {
    event.preventDefault();

    if (!requireLogin()) return;

    const name = $("#viewName").value.trim();

    if (!name) {
      $("#viewError").textContent = "Enter a view name.";
      return;
    }

    if ($("#barangayFilter").value === "other") {
      $("#viewError").textContent =
        "This saved-view API does not support the Other / Not listed filter.";
      return;
    }

    const submit = $('#viewForm button[type="submit"]');
    submit.disabled = true;

    try {
      const response = await api("views.php", {
        method: "POST",
        body: {
          action: "create",
          type: currentType(),
          name,
          search: $("#searchInput").value,
          statusCode: $("#statusFilter").value,
          categoryId: $("#categoryFilter").value || null,
          barangayId: $("#barangayFilter").value || null,
          sort: $("#sortSelect").value
        }
      });

      const viewResponse = await api("views.php");
      savedViews = viewResponse.views;

      renderSavedViews();

      $("#savedViewsSelect").value = String(response.id);
      $("#deleteViewBtn").hidden = false;

      closeDialog("viewDialog");
      toast("View saved.");

    } catch (error) {
      $("#viewError").textContent = error.message;

    } finally {
      submit.disabled = false;
    }
  }

  function applySavedView() {
    const view = savedViews.find(entry =>
      sameId(entry.id, $("#savedViewsSelect").value)
    );

    $("#deleteViewBtn").hidden = !view;

    if (!view) return;

    $("#searchInput").value = view.search || "";
    $("#statusFilter").value = view.statusCode || "";
    $("#categoryFilter").value = view.categoryId || "";
    $("#barangayFilter").value = view.barangayId || "";
    $("#sortSelect").value = view.sort || "newest";

    currentPage = 1;
    selectedIds.clear();

    renderRecords();
  }

  function requestDeleteView() {
    const id = $("#savedViewsSelect").value;

    if (!id) return;

    confirmAction(
      "Delete saved view?",
      "This removes the saved filters, not your records.",
      async () => {
        try {
          await api("views.php", {
            method: "POST",
            body: {
              action: "delete",
              id
            }
          });

          const response = await api("views.php");
          savedViews = response.views;

          renderSavedViews();
          toast("Saved view deleted.");

        } catch (error) {
          toast(error.message);
        }
      }
    );
  }

  /* =========================================================
     CSV export
     Exports matching records currently loaded into the page.
     ========================================================= */

  function csvCell(value) {
    let text = String(value ?? "");

    if (/^\s*[=+\-@]/.test(text)) {
      text = "'" + text;
    }

    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCSV() {
    if (!requireLogin()) return;

    const result = filteredRecords();

    const data = [
      [
        "Reference",
        "Type",
        "Title",
        "Name",
        "Email",
        "Category",
        "Barangay",
        "Date",
        "Status",
        "Amount PHP",
        "Priority"
      ],
      ...result.map(record => [
        record.ref,
        record.type,
        record.title,
        record.name,
        record.email,
        record.category,
        record.barangay,
        record.date,
        record.status,
        record.amount,
        record.priority
      ])
    ];

    const csv = "\uFEFF" + data
      .map(row => row.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${activePage}-${today()}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast(`${result.length} loaded record(s) exported.`);
  }

  /* =========================================================
     Custom record ordering
     ========================================================= */

  function bindDragAndDrop() {
    const body = $("#tableBody");

    body.addEventListener("dragstart", event => {
      const handle = event.target.closest(
        '.drag-handle[draggable="true"]'
      );

      if (!handle || !canReorder() || loading) {
        event.preventDefault();
        return;
      }

      const row = handle.closest("[data-record-id]");

      draggedId = row.dataset.recordId;
      row.classList.add("dragging");

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedId);
    });

    body.addEventListener("dragover", event => {
      if (!draggedId) return;

      const row = event.target.closest("[data-record-id]");

      if (!row) return;

      event.preventDefault();

      $$("tr", body).forEach(element => {
        element.classList.remove("drag-over");
      });

      row.classList.add("drag-over");
    });

    body.addEventListener("drop", async event => {
      if (!draggedId || !canReorder()) return;

      event.preventDefault();

      const sourceId = draggedId;
      draggedId = null;

      const target = event.target.closest("[data-record-id]");

      if (!target) return;

      const ordered = filteredRecords();
      const targetId = target.dataset.recordId;

      const from = ordered.findIndex(record =>
        sameId(record.id, sourceId)
      );

      const to = ordered.findIndex(record =>
        sameId(record.id, targetId)
      );

      if (from < 0 || to < 0 || from === to) {
        renderRecords();
        return;
      }

      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);

      try {
        await api("records.php", {
          method: "POST",
          body: {
            action: "reorder",
            ids: ordered.map(record => record.id)
          }
        });

        await refreshData();
        toast("Custom order saved.");

      } catch (error) {
        renderRecords();
        toast(error.message);
      }
    });

    body.addEventListener("dragend", () => {
      draggedId = null;

      $$("tr", body).forEach(row => {
        row.classList.remove("dragging", "drag-over");
      });
    });
  }

  /* =========================================================
     Event bindings
     ========================================================= */

  function bindEvents() {
    $("#brandHome").addEventListener(
      "click",
      () => navigate("overview")
    );

    $$("[data-nav]").forEach(button => {
      button.addEventListener(
        "click",
        () => navigate(button.dataset.nav)
      );
    });

    $$("[data-quick]").forEach(button => {
      button.addEventListener(
        "click",
        () => openRecordForm(button.dataset.quick)
      );
    });

    $("#viewAllBtn").addEventListener(
      "click",
      () => navigate("transactions")
    );

    $("#newRecordBtn").addEventListener("click", () => {
      openRecordForm(
        currentUser && !isStaff()
          ? "request"
          : activePage === "overview"
            ? "transaction"
            : currentType()
      );
    });

    $("#pageNewBtn").addEventListener(
      "click",
      () => openRecordForm(currentType())
    );

    $("#recordForm").addEventListener("submit", saveRecord);

    $("#fType").addEventListener("change", () => {
      configureRecordForm($("#fType").value);
    });

    document.addEventListener("click", event => {
      const close = event.target.closest("[data-close]");

      if (close) {
        closeDialog(close.dataset.close);
      }

      const detail = event.target.closest("[data-detail]");
      const edit = event.target.closest("[data-edit]");
      const remove = event.target.closest("[data-delete]");
      const advance = event.target.closest("[data-advance]");
      const closeRecord = event.target.closest("[data-close-record]");

      if (detail) {
        showDetails(detail.dataset.detail);
      }

      if (edit) {
        openRecordForm("", edit.dataset.edit);
      }

      if (remove) {
        requestDelete([remove.dataset.delete]);
      }

      if (advance) {
        changeStatus(
          advance.dataset.advance,
          advance.dataset.nextStatus
        );
      }

      if (closeRecord) {
        confirmCloseRecord(
          closeRecord.dataset.closeRecord,
          closeRecord.dataset.closeStatus
        );
      }

      if (!event.target.closest("#userMenu")) {
        $("#userDropdown").hidden = true;
        $("#userChipBtn").setAttribute("aria-expanded", "false");
      }
    });

    $("#searchInput").addEventListener("input", () => {
      currentPage = 1;
      selectedIds.clear();
      renderRecords();
    });

    [
      "statusFilter",
      "categoryFilter",
      "barangayFilter",
      "sortSelect"
    ].forEach(id => {
      document.getElementById(id).addEventListener("change", () => {
        currentPage = 1;
        selectedIds.clear();
        renderRecords();
      });
    });

    $("#clearFiltersBtn").addEventListener("click", resetFilters);

    $("#prevPageBtn").addEventListener("click", () => {
      currentPage--;
      renderRecords();
    });

    $("#nextPageBtn").addEventListener("click", () => {
      currentPage++;
      renderRecords();
    });

    $("#recordsTable").addEventListener("change", event => {
      if (event.target.matches("[data-select]")) {
        const id = event.target.dataset.select;

        if (event.target.checked) {
          selectedIds.add(id);
        } else {
          selectedIds.delete(id);
        }

        renderRecords();
      }

      if (event.target.id === "selectAllRows") {
        const checked = event.target.checked;

        const pageRecords = filteredRecords().slice(
          (currentPage - 1) * PAGE_SIZE,
          currentPage * PAGE_SIZE
        );

        pageRecords.filter(canEdit).forEach(record => {
          const id = String(record.id);

          if (checked) {
            selectedIds.add(id);
          } else {
            selectedIds.delete(id);
          }
        });

        renderRecords();
      }
    });

    $("#clearSelectionBtn").addEventListener("click", () => {
      selectedIds.clear();
      renderRecords();
    });

    $("#bulkDeleteBtn").addEventListener("click", () => {
      requestDelete([...selectedIds]);
    });

    $("#bulkAdvanceBtn").addEventListener("click", bulkAdvance);

    $("#confirmActionBtn").addEventListener("click", async () => {
      const callback = pendingConfirmation;
      pendingConfirmation = null;

      closeDialog("confirmDialog");

      if (callback) {
        try {
          await callback();
        } catch (error) {
          toast(error.message);
        }
      }
    });

    $("#confirmDialog").addEventListener("close", () => {
      pendingConfirmation = null;
    });

    $("#exportBtn").addEventListener("click", exportCSV);

    $("#saveViewBtn").addEventListener("click", () => {
      if (!requireLogin()) return;

      $("#viewForm").reset();
      $("#viewError").textContent = "";

      openDialog("viewDialog");
    });

    $("#viewForm").addEventListener("submit", saveView);

    $("#savedViewsSelect").addEventListener(
      "change",
      applySavedView
    );

    $("#deleteViewBtn").addEventListener(
      "click",
      requestDeleteView
    );

    $("#langEn").addEventListener("click", () => {
      language = "en";
      applyLanguage();
      renderAll();
    });

    $("#langFil").addEventListener("click", () => {
      language = "fil";
      applyLanguage();
      renderAll();
    });

    $("#openAuthBtn").addEventListener("click", () => {
      setAuthMode("login");
      openDialog("authDialog");
    });

    $$("[data-auth-mode]").forEach(button => {
      button.addEventListener(
        "click",
        () => setAuthMode(button.dataset.authMode)
      );
    });

    $("#authForm").addEventListener(
      "submit",
      handleAuthentication
    );

    $("#userChipBtn").addEventListener("click", () => {
      const expanded = $("#userDropdown").hidden;

      $("#userDropdown").hidden = !expanded;

      $("#userChipBtn").setAttribute(
        "aria-expanded",
        String(expanded)
      );
    });

    $("#logoutBtn").addEventListener("click", logout);

    $("#toastCloseBtn").addEventListener("click", () => {
      $("#toast").hidden = true;
      toastAction = null;
      clearTimeout(toastTimer);
    });

    $("#toastActionBtn").addEventListener("click", async () => {
      const callback = toastAction;

      toastAction = null;
      $("#toast").hidden = true;

      clearTimeout(toastTimer);

      if (callback) {
        await callback();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        $("#userDropdown").hidden = true;
        $("#userChipBtn").setAttribute("aria-expanded", "false");
      }
    });

    bindDragAndDrop();
  }

  /* =========================================================
     Initialization
     ========================================================= */

  async function initialize() {
    bindEvents();

    $("#demoAccountsBox").hidden = true;
    $("#authRoleField").hidden = true;

    setAuthMode("login");
    applyLanguage();
    updateAuthUI();
    navigate("overview");

    try {
      await loadSession();

      if (currentUser) {
        await refreshData();
      } else {
        renderAll();
      }

    } catch (error) {
      toast(error.message);

      console.error("Portal initialization failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();