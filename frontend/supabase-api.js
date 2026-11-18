/*
 * Supabase adapter for the Quezon City Hall portal.
 *
 * It replaces the old PHP endpoints (auth.php, records.php, status.php,
 * views.php, dashboard.php). app.js still calls api("records.php", ...)
 * exactly as before, and this file answers with the same JSON shapes.
 */
(() => {
  "use strict";

  const cfg = window.PORTAL_CONFIG || {};

  if (
    !window.supabase ||
    !cfg.SUPABASE_URL ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_URL.includes("YOUR-PROJECT-ID")
  ) {
    console.error(
      "Supabase is not configured. Edit frontend/config.js."
    );
  }

  const sb = window.supabase.createClient(
    cfg.SUPABASE_URL || "http://invalid.local",
    cfg.SUPABASE_ANON_KEY || "invalid",
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    }
  );

  window.portalSupabase = sb;

  /* -------------------------------------------------------------
     Helpers
     ------------------------------------------------------------- */

  class ApiError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }

  function fail(message, status = 400) {
    throw new ApiError(message, status);
  }

  function check(error, fallback = "The request could not be completed.") {
    if (!error) return;

    const status =
      error.code === "PGRST301" || error.status === 401 ? 401
      : error.code === "42501" ? 403
      : error.code === "23505" ? 409
      : 400;

    fail(error.message || fallback, status);
  }

  async function requireUser() {
    const { data } = await sb.auth.getSession();

    if (!data.session) {
      fail("Please sign in to continue.", 401);
    }

    return data.session.user;
  }

  function positiveId(value) {
    const id = Number(value);

    if (!Number.isInteger(id) || id <= 0) {
      fail("Invalid record.");
    }

    return id;
  }

  function nullableId(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    return positiveId(value);
  }

  /* -------------------------------------------------------------
     Shapes (same field names the PHP backend returned)
     ------------------------------------------------------------- */

  const RECORD_SELECT =
    "id, reference_no, record_type, category_id, title, person_name, " +
    "person_email, record_date, barangay_id, status_code, priority, " +
    "amount, payment_method, received_through, location, notes, " +
    "owner_user_id, sort_order, created_at, updated_at, deleted_at, " +
    "categories(name), barangays(name)";

  function formatRecord(row, statuses, history = []) {
    const statusRow = statuses.find(
      s => s.type === row.record_type && s.code === row.status_code
    );

    return {
      id: row.id,
      ref: row.reference_no,
      type: row.record_type,
      title: row.title,
      name: row.person_name,
      email: row.person_email || "",
      date: row.record_date,
      categoryId: row.category_id,
      category: row.categories?.name || "",
      barangayId: row.barangay_id,
      barangay: row.barangays?.name || "Other / Not listed",
      statusCode: row.status_code,
      status: statusRow?.label || row.status_code,
      priority: row.priority,
      amount: Number(row.amount || 0).toFixed(2),
      method: row.payment_method || "",
      source: row.received_through || "",
      location: row.location || "",
      notes: row.notes || "",
      ownerId: row.owner_user_id,
      order: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      history: history.map(h => ({
        label: h.label,
        at: h.created_at,
        actor: h.actor_name
      }))
    };
  }

  let statusCache = null;

  async function getStatuses() {
    if (statusCache) return statusCache;

    const { data, error } = await sb
      .from("record_statuses")
      .select("record_type, code, label, sort_order, is_terminal")
      .order("record_type")
      .order("sort_order");

    check(error);

    statusCache = data.map(s => ({
      type: s.record_type,
      code: s.code,
      label: s.label,
      sort_order: s.sort_order,
      is_terminal: s.is_terminal
    }));

    return statusCache;
  }

  async function getProfile(user) {
    const { data, error } = await sb
      .from("profiles")
      .select("id, full_name, role, barangay_id, is_active")
      .eq("id", user.id)
      .maybeSingle();

    check(error);

    if (!data || !data.is_active) {
      await sb.auth.signOut();
      fail("Your account is not active.", 401);
    }

    return {
      id: user.id,
      name: data.full_name,
      email: user.email,
      role: data.role,
      barangay_id: data.barangay_id
    };
  }

  async function currentUser() {
    const { data } = await sb.auth.getSession();

    if (!data.session) return null;

    try {
      return await getProfile(data.session.user);
    } catch (error) {
      if (error.status === 401) return null;
      throw error;
    }
  }

  /* -------------------------------------------------------------
     auth.php
     ------------------------------------------------------------- */

  async function auth(method, body) {
    if (method === "GET") {
      const [barangays, categories, statuses, user] = await Promise.all([
        sb.from("barangays")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),
        sb.from("categories")
          .select("id, record_type, name")
          .eq("is_active", true)
          .order("name"),
        getStatuses(),
        currentUser()
      ]);

      check(barangays.error);
      check(categories.error);

      return {
        ok: true,
        user,
        csrf: "",
        lookups: {
          barangays: barangays.data,
          categories: categories.data.map(c => ({
            id: c.id,
            type: c.record_type,
            name: c.name
          })),
          statuses
        }
      };
    }

    const action = body.action;

    if (action === "register") {
      const V = window.PortalValidate;

      const nameCheck = V.name(body.name);
      if (!nameCheck.ok) fail(nameCheck.message);

      const emailCheck = V.email(body.email);
      if (!emailCheck.ok) fail(emailCheck.message);

      const name = nameCheck.value;
      const email = emailCheck.value;
      const password = String(body.password || "");

      const passwordCheck = V.password(password, { email, name });
      if (!passwordCheck.ok) fail(passwordCheck.message);

      const barangayCheck = V.barangay(body.barangayId);
      if (!barangayCheck.ok) fail(barangayCheck.message);

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            barangay_id: barangayCheck.value
          }
        }
      });

      if (error) {
        const taken = /already|registered/i.test(error.message);
        fail(
          taken
            ? "This email address is already registered."
            : error.message,
          taken ? 409 : 400
        );
      }

      // Supabase returns a user with no identities when the email exists.
      if (data.user && data.user.identities?.length === 0) {
        fail("This email address is already registered.", 409);
      }

      // If "Confirm email" is OFF, signUp also signs the user in.
      // The portal wants the user to sign in manually afterwards.
      if (data.session) {
        await sb.auth.signOut();
      }

      return {
        ok: true,
        message: data.session
          ? "Account created. You can now sign in."
          : "Account created. Check your email to confirm it, then sign in."
      };
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!email || !password) {
        fail("Invalid email or password.", 401);
      }

      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        if (/confirm/i.test(error.message)) {
          fail("Please confirm your email address first.", 401);
        }

        fail("Invalid email or password.", 401);
      }

      const user = await getProfile(data.user);

      sb.rpc("touch_login").then(() => {}, () => {});

      return {
        ok: true,
        message: "Signed in successfully.",
        user,
        csrf: ""
      };
    }

    if (action === "logout") {
      await sb.auth.signOut();

      return {
        ok: true,
        message: "Signed out.",
        user: null,
        csrf: ""
      };
    }

    fail("Invalid authentication action.");
  }

  /* -------------------------------------------------------------
     records.php
     ------------------------------------------------------------- */

  async function getRecord(id) {
    const [{ data, error }, statuses] = await Promise.all([
      sb.from("service_records")
        .select(RECORD_SELECT + ", record_history(id, label, actor_name, created_at)")
        .eq("id", id)
        .maybeSingle(),
      getStatuses()
    ]);

    check(error);

    if (!data || data.deleted_at) {
      fail("Record not found.", 404);
    }

    const history = [...(data.record_history || [])].sort(
      (a, b) => a.id - b.id
    );

    return formatRecord(data, statuses, history);
  }

  async function records(method, query, body) {
    await requireUser();

    if (method === "GET") {
      if (query.get("id")) {
        const id = positiveId(query.get("id"));

        return { ok: true, record: await getRecord(id) };
      }

      let request = sb
        .from("service_records")
        .select(RECORD_SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);

      const type = query.get("type");

      if (type) {
        request = request.eq("record_type", type);
      }

      const [{ data, error }, statuses] = await Promise.all([
        request,
        getStatuses()
      ]);

      check(error);

      return {
        ok: true,
        records: data.map(row => formatRecord(row, statuses)),
        limit: 500
      };
    }

    const action = body.action;

    if (action === "create") {
      const { data, error } = await sb.rpc("create_record", { p: body });

      check(error);

      return {
        ok: true,
        message: "Record created.",
        record: await getRecord(data)
      };
    }

    if (action === "update") {
      const { data, error } = await sb.rpc("update_record", { p: body });

      check(error);

      return {
        ok: true,
        message: "Record updated.",
        record: await getRecord(data)
      };
    }

    if (action === "delete") {
      const { error } = await sb.rpc("delete_record", {
        p_id: positiveId(body.id)
      });

      check(error);

      return { ok: true, message: "Record deleted.", record: null };
    }
        if (action === "withdraw") {
      const { error } = await sb.rpc("withdraw_request", {
        p_id: positiveId(body.id)
      });

      check(error);

      return {
        ok: true,
        message: "Request withdrawn.",
        record: null
      };
    }

    if (action === "restore") {
      const id = positiveId(body.id);

      const { error } = await sb.rpc("restore_record", { p_id: id });

      check(error);

      return {
        ok: true,
        message: "Record restored.",
        record: await getRecord(id)
      };
    }

    if (action === "reorder") {
      const ids = Array.isArray(body.ids) ? body.ids.map(positiveId) : [];

      const { error } = await sb.rpc("reorder_records", { p_ids: ids });

      check(error);

      return { ok: true, message: "Order saved." };
    }

    fail("Invalid record action.");
  }

  /* -------------------------------------------------------------
     status.php
     ------------------------------------------------------------- */

  async function status(body) {
    await requireUser();

    const id = positiveId(body.id);

    const { error } = await sb.rpc("set_status", {
      p_id: id,
      p_status: body.statusCode || null
    });

    check(error);

    return {
      ok: true,
      message: "Status updated.",
      record: await getRecord(id)
    };
  }

  /* -------------------------------------------------------------
     dashboard.php
     ------------------------------------------------------------- */

  async function dashboard() {
    await requireUser();

    const { data, error } = await sb.rpc("dashboard_data");

    check(error);

    const [{ data: recent, error: recentError }, statuses] =
      await Promise.all([
        sb.from("service_records")
          .select(RECORD_SELECT)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(6),
        getStatuses()
      ]);

    check(recentError);

    return {
      ok: true,
      stats: {
        transactions: Number(data.stats.transactions),
        openRequests: Number(data.stats.openRequests),
        documents: Number(data.stats.documents),
        collections: Number(data.stats.collections).toFixed(2)
      },
      collectionsChart: data.collectionsChart,
      barangayChart: data.barangayChart,
      recent: recent.map(row => formatRecord(row, statuses))
    };
  }

  /* -------------------------------------------------------------
     views.php
     ------------------------------------------------------------- */

  async function views(method, body) {
    const user = await requireUser();

    if (method === "GET") {
      const { data, error } = await sb
        .from("saved_views")
        .select(
          "id, record_type, name, search_text, status_code, " +
          "category_id, barangay_id, sort_mode"
        )
        .eq("user_id", user.id)
        .order("name");

      check(error);

      return {
        ok: true,
        views: data.map(v => ({
          id: v.id,
          type: v.record_type,
          name: v.name,
          search: v.search_text,
          statusCode: v.status_code,
          categoryId: v.category_id,
          barangayId: v.barangay_id,
          sort: v.sort_mode
        }))
      };
    }

    if (body.action === "delete") {
      const { error } = await sb
        .from("saved_views")
        .delete()
        .eq("id", positiveId(body.id))
        .eq("user_id", user.id);

      check(error);

      return { ok: true, message: "Saved view removed." };
    }

    if (body.action !== "create") {
      fail("Invalid saved-view action.");
    }

    const type = body.type;

    if (!["transaction", "request", "received"].includes(type)) {
      fail("Invalid record type.");
    }

    const name = String(body.name || "").trim();

    if (!name || name.length > 40) {
      fail("Enter a view name of up to 40 characters.");
    }

    const sort = body.sort || "newest";

    if (!["newest", "oldest", "name", "amount", "custom"].includes(sort)) {
      fail("Invalid sorting option.");
    }

    const { data, error } = await sb
      .from("saved_views")
      .insert({
        user_id: user.id,
        record_type: type,
        name,
        search_text: String(body.search || "").slice(0, 200),
        status_code: body.statusCode || null,
        category_id: nullableId(body.categoryId),
        barangay_id: nullableId(body.barangayId),
        sort_mode: sort
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        fail(
          "A saved view with this name already exists for this page.",
          409
        );
      }

      check(error);
    }

    return { ok: true, message: "View saved.", id: data.id };
  }

  /* -------------------------------------------------------------
     admin.php (administrators only; enforced again in the database)
     ------------------------------------------------------------- */

  async function admin(method, query, body) {
    await requireUser();

    if (method === "GET") {
      if (query.get("view") === "users") {
        const { data, error } = await sb.rpc("admin_list_users");

        check(error);

        return {
          ok: true,
          users: data.map(u => ({
            id: u.id,
            name: u.full_name,
            email: u.email,
            role: u.role,
            active: u.is_active,
            barangay: u.barangay,
            createdAt: u.created_at,
            lastLoginAt: u.last_login_at
          }))
        };
      }

      const { data, error } = await sb.rpc("admin_overview");

      check(error);

      return { ok: true, overview: data };
    }

    if (body.action === "setRole") {
      const { error } = await sb.rpc("admin_set_role", {
        p_id: String(body.id),
        p_role: String(body.role)
      });

      check(error);

      return { ok: true, message: "Role updated." };
    }

    if (body.action === "setActive") {
      const { error } = await sb.rpc("admin_set_active", {
        p_id: String(body.id),
        p_active: Boolean(body.active)
      });

      check(error);

      return { ok: true, message: "Account updated." };
    }

    fail("Invalid administration action.");
  }

  /* -------------------------------------------------------------
     Router used by api() in app.js
     ------------------------------------------------------------- */

  window.portalApi = async function portalApi(file, options = {}) {
    const method = options.method || "GET";
    const body = options.body || {};

    const [name, queryString = ""] = file.split("?");
    const query = new URLSearchParams(queryString);

    try {
      switch (name) {
        case "auth.php":      return await auth(method, body);
        case "records.php":   return await records(method, query, body);
        case "status.php":    return await status(body);
        case "dashboard.php": return await dashboard();
        case "views.php":     return await views(method, body);
        case "admin.php":     return await admin(method, query, body);
        default:              fail("Unknown endpoint.", 404);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;

      console.error("Supabase request failed:", error);

      const wrapped = new ApiError(
        "Cannot reach the server. Check your internet connection.",
        0
      );

      throw wrapped;
    }
  };
})();
