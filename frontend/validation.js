/*
 * Shared form validation for the Quezon City Hall portal.
 * Loaded before supabase-api.js and app.js so the UI and the data layer
 * apply exactly the same rules.
 */
(() => {
  "use strict";

  const COMMON_PASSWORDS = [
    "password", "password1", "password123", "passw0rd", "qwerty",
    "qwertyuiop", "123456", "12345678", "123456789", "1234567890",
    "111111", "abc123", "iloveyou", "admin", "administrator",
    "welcome", "letmein", "monkey", "dragon", "football",
    "quezoncity", "quezon", "manila", "pilipinas", "philippines",
    "cityhall", "mabuhay"
  ];

  function normalizeName(value) {
    return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  }

  function name(value) {
    const clean = normalizeName(value);

    if (!clean) {
      return { ok: false, value: clean, message: "Enter your full name." };
    }

    if (clean.length < 2) {
      return {
        ok: false,
        value: clean,
        message: "Your name must be at least 2 characters."
      };
    }

    if (clean.length > 100) {
      return {
        ok: false,
        value: clean,
        message: "Your name must be 100 characters or fewer."
      };
    }

    if (!/^\p{L}[\p{L}\p{M}.'’\- ]*$/u.test(clean)) {
      return {
        ok: false,
        value: clean,
        message:
          "Use letters, spaces, hyphens, apostrophes and periods only."
      };
    }

    if ((clean.match(/\p{L}/gu) || []).length < 2) {
      return {
        ok: false,
        value: clean,
        message: "Enter your real full name."
      };
    }

    return { ok: true, value: clean, message: "" };
  }

  function email(value) {
    const clean = String(value ?? "").trim().toLowerCase();

    if (!clean) {
      return {
        ok: false,
        value: clean,
        message: "Enter your email address."
      };
    }

    if (clean.length > 150) {
      return {
        ok: false,
        value: clean,
        message: "Email address must be 150 characters or fewer."
      };
    }

    const [local = "", domain = ""] = clean.split("@");

    const valid =
      clean.split("@").length === 2 &&
      local.length > 0 &&
      local.length <= 64 &&
      !local.startsWith(".") &&
      !local.endsWith(".") &&
      !clean.includes("..") &&
      /^[a-z0-9._%+\-]+$/.test(local) &&
      /^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$/
        .test(domain);

    if (!valid) {
      return {
        ok: false,
        value: clean,
        message: "Enter a valid email address, like name@example.com."
      };
    }

    return { ok: true, value: clean, message: "" };
  }

  /*
   * Password rules. `context` may hold { email, name } so the password
   * cannot simply repeat the person's own details.
   */
  function password(value, context = {}) {
