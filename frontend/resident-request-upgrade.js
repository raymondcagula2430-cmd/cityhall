(() => {
  "use strict";

  function init() {
    const dialog = document.getElementById("recordDialog");
    const form = document.getElementById("recordForm");
    const type = document.getElementById("fType");

    const title = document.getElementById("fTitle");
    const name = document.getElementById("fName");
    const category = document.getElementById("fCategory");
    const barangay = document.getElementById("fBarangay");
    const notes = document.getElementById("fNotes");
    const priority = document.getElementById("fPriority");
    const priorityField = document.getElementById("priorityField");
    const status = document.getElementById("fStatus");
    const statusField = status?.closest(".field");

    if (!dialog || !form || !type) return;

    function isResidentRequest() {
      return type.value === "request" && Boolean(name?.readOnly);
    }

    function applyRequestRolePolicy() {
      const request = type.value === "request";
      const residentRequest = isResidentRequest();

      // Residents report the issue; service-desk staff assess its priority.
      if (priorityField) {
        priorityField.hidden = !request || residentRequest;
      }

      // Request status is assigned by the workflow and managed by staff,
      // not selected in the submission form.
      if (statusField) {
        statusField.hidden = request;
      }

      // New resident requests use the system's normal default. Preserve
      // the existing priority when a resident edits a previously submitted
      // request, since the control is hidden from them.
      if (
        residentRequest &&
        priority &&
        document.getElementById("formEyebrow")?.textContent.trim() === "New record"
      ) {
        priority.value = "Normal";
      }
    }

    function scheduleRequestRolePolicy() {
      // app.js also updates field visibility on type changes. Run after it.
      window.setTimeout(applyRequestRolePolicy, 0);
    }

    function getField(input) {
      return input?.closest(".field");
    }

    function setResult(input, message = "") {
      if (!input) return;

      const wrapper = getField(input);
      const error = wrapper?.querySelector("[data-error], .field-error");

      wrapper?.classList.toggle("invalid", Boolean(message));
      wrapper?.classList.toggle(
        "valid",
        !message && Boolean(input.value)
      );
      input.setAttribute("aria-invalid", String(Boolean(message)));

      if (error) error.textContent = message;
    }

    function validateTitle() {
      const value = title?.value.trim() || "";

      setResult(
        title,
        value.length >= 5 && value.length <= 100
          ? ""
          : "Enter a clear request title between 5 and 100 characters."
      );
    }

    function validateName() {
      const value = name?.value.trim() || "";

      setResult(
        name,
        value.length >= 2 ? "" : "Enter the resident's name."
      );
    }

    function validateCategory() {
      setResult(
        category,
        category?.value ? "" : "Select a request category."
      );
    }

    function validateBarangay() {
      setResult(
        barangay,
        barangay?.value
          ? ""
          : "Select a barangay or choose Other / Not listed."
      );
    }

    function validateNotes() {
      const value = notes?.value || "";

      setResult(
        notes,
        value.length <= 600 ? "" : "Keep notes within 600 characters."
      );
    }

    function validateAll() {
      validateTitle();
      validateName();
      validateCategory();
      validateBarangay();
      validateNotes();

      const firstInvalid = form.querySelector(
        ".field.invalid input, " +
        ".field.invalid select, " +
        ".field.invalid textarea"
      );

      if (firstInvalid) {
        firstInvalid.focus();
        return false;
      }

      return true;
    }

    function configureRequestMode() {
      const enabled = type.value === "request";

      dialog.classList.toggle("resident-request-form", enabled);
      form.classList.toggle("resident-request-form", enabled);
      applyRequestRolePolicy();

      if (!enabled) return;

      if (title && !document.getElementById("residentRequestTitleHint")) {
        const hint = document.createElement("small");
        hint.id = "residentRequestTitleHint";
        hint.className = "field-hint";
        hint.textContent =
          "Describe the concern clearly in 5–100 characters.";

        title.setAttribute("aria-describedby", "residentRequestTitleHint");
        title.closest(".field")?.appendChild(hint);
      }

      if (notes && !document.getElementById("residentRequestNotesCount")) {
        const count = document.createElement("small");
        count.id = "residentRequestNotesCount";
        count.className = "character-count";
        count.textContent = `${notes.value.length} / 600 characters`;

        notes.setAttribute("aria-describedby", "residentRequestNotesCount");
        notes.closest(".field")?.appendChild(count);

        notes.addEventListener("input", () => {
          count.textContent = `${notes.value.length} / 600 characters`;
          validateNotes();
        });
      }
    }

    type.addEventListener("change", () => {
      configureRequestMode();
      scheduleRequestRolePolicy();
    });

    // Run before app.js's submit handler so a resident cannot submit a
    // user-selected priority. The service desk can assess it afterwards.
    form.addEventListener("submit", event => {
      if (isResidentRequest()) {
        const isNewRequest =
          document.getElementById("formEyebrow")?.textContent.trim() ===
          "New record";

        if (isNewRequest && priority) {
          priority.value = "Normal";
        }

        if (!validateAll()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }
    }, true);

    title?.addEventListener("blur", validateTitle);
    name?.addEventListener("blur", validateName);
    category?.addEventListener("change", validateCategory);
    barangay?.addEventListener("change", validateBarangay);

    title?.addEventListener("input", () => {
      if (title.value.length > 0) validateTitle();
    });

    name?.addEventListener("input", () => {
      if (name.value.length > 0) validateName();
    });

    // app.js sets the resident name read-only and opens the dialog while
    // preparing the form. Reapply the policy after those updates.
    const observer = new MutationObserver(scheduleRequestRolePolicy);

    observer.observe(dialog, {
      attributes: true,
      attributeFilter: ["open"]
    });

    if (name) {
      observer.observe(name, {
        attributes: true,
        attributeFilter: ["readonly"]
      });
    }

    if (priorityField) {
      observer.observe(priorityField, {
        attributes: true,
        attributeFilter: ["hidden"]
      });
    }

    form.addEventListener("submit", event => {
      if (isResidentRequest() && !validateAll()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    });

    configureRequestMode();
    scheduleRequestRolePolicy();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
