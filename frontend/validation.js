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
    const text = String(value ?? "");
    const lower = text.toLowerCase();

    const emailLocal = String(context.email || "")
      .split("@")[0]
      .toLowerCase();

    const nameParts = String(context.name || "")
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter(part => part.length >= 4);

    const personal =
      (emailLocal.length >= 4 && lower.includes(emailLocal)) ||
      nameParts.some(part => lower.includes(part));

    const common = COMMON_PASSWORDS.some(
      word => lower === word || lower.replace(/[^a-z]/g, "") === word
    );

    const checks = [
      {
        id: "length",
        label: "At least 12 characters",
        pass: text.length >= 12
      },
      {
        id: "lower",
        label: "One lowercase letter",
        pass: /\p{Ll}/u.test(text)
      },
      {
        id: "upper",
        label: "One uppercase letter",
        pass: /\p{Lu}/u.test(text)
      },
      {
        id: "number",
        label: "One number",
        pass: /\d/.test(text)
      },
      {
        id: "symbol",
        label: "One symbol (for example ! @ # $ %)",
        pass: /[^\p{L}\d\s]/u.test(text)
      },
      {
        id: "personal",
        label: "Does not contain your name or email",
        pass: text.length === 0 ? false : !personal
      },
      {
        id: "common",
        label: "Not a common password",
        pass: text.length === 0 ? false : !common && !/^(.)\1+$/.test(text)
      }
    ];

    const tooLong = text.length > 72;
    const passed = checks.filter(check => check.pass).length;

    let score = 0;

    if (text.length > 0) {
      score = 1;
      if (passed >= 4) score = 2;
      if (passed >= 6 && text.length >= 12) score = 3;
      if (passed === checks.length && text.length >= 16) score = 4;
      if (!checks[0].pass) score = Math.min(score, 1);
      if (!checks[6].pass || !checks[5].pass) score = Math.min(score, 1);
    }

    const labels = ["", "Weak", "Fair", "Good", "Strong"];

    const ok = !tooLong && checks.every(check => check.pass);

    let message = "";

    if (!text) {
      message = "Create a password.";
    } else if (tooLong) {
      message = "Password must be 72 characters or fewer.";
    } else if (!ok) {
      const firstMissing = checks.find(check => !check.pass);
      message = `Password requirement missing: ${firstMissing.label.toLowerCase()}.`;
    }

    return {
      ok,
      value: text,
      message,
      checks,
      score,
      label: labels[score]
    };
  }

  function confirm(value, original) {
    if (!value) {
      return {
        ok: false,
        value,
        message: "Re-enter your password to confirm it."
      };
    }

    if (value !== original) {
      return { ok: false, value, message: "Passwords do not match." };
    }

    return { ok: true, value, message: "" };
  }

  function barangay(value) {
    const id = String(value ?? "").trim();

    if (!id) {
      return {
        ok: false,
        value: "",
        message: "Select your barangay from the list."
      };
    }

    if (!/^[1-9]\d{0,17}$/.test(id)) {
      return {
        ok: false,
        value: "",
        message: "Select a valid barangay from the list."
      };
    }

    return { ok: true, value: id, message: "" };
  }

  function loginPassword(value) {
    const text = String(value ?? "");

    if (!text) {
      return { ok: false, value: text, message: "Enter your password." };
    }

    if (text.length > 1024) {
      return { ok: false, value: text, message: "Password is too long." };
    }

    return { ok: true, value: text, message: "" };
  }

  window.PortalValidate = {
    name,
    email,
    password,
    confirm,
    barangay,
    loginPassword,
    normalizeName
  };
})();
