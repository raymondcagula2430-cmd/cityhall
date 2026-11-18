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

    if (!dialog || !form || !type) return;

    function isResidentRequest() {
      return type.value === "request";
    }

    function getField(input) {
      return input?.closest(".field");
    }

    function setResult(input, message = "") {
      if (!input) return;

      const wrapper = getField(input);
      const error =
        wrapper?.querySelector("[data-error], .field-error");

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
        value.length >= 2
          ? ""
          : "Enter the resident's name."
      );
    }

    function validateCategory() {
      setResult(
        category,
        category?.value
          ? ""
          : "Select a request category."
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
        value.length <= 600
          ? ""
          : "Keep notes within 600 characters."
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
      const enabled = isResidentRequest();

      dialog.classList.toggle(
        "resident-request-form",
        enabled
      );
      form.classList.toggle(
        "resident-request-form",
        enabled
      );

      if (!enabled) return;

      if (title && !document.getElementById(
        "residentRequestTitleHint"
      )) {
        const hint = document.createElement("small");
        hint.id = "residentRequestTitleHint";
        hint.className = "field-hint";
        hint.textContent =
          "Describe the concern clearly in 5–100 characters.";

        title.setAttribute(
          "aria-describedby",
          "residentRequestTitleHint"
        );
        title.closest(".field")?.appendChild(hint);
      }

      if (notes && !document.getElementById(
        "residentRequestNotesCount"
      )) {
        const count = document.createElement("small");
        count.id = "residentRequestNotesCount";
        count.className = "character-count";
        count.textContent =
          `${notes.value.length} / 600 characters`;

        notes.setAttribute(
          "aria-describedby",
          "residentRequestNotesCount"
        );
        notes.closest(".field")?.appendChild(count);

        notes.addEventListener("input", () => {
          count.textContent =
            `${notes.value.length} / 600 characters`;
          validateNotes();
        });
      }
    }

    type.addEventListener("change", configureRequestMode);

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

    form.addEventListener("submit", (event) => {
      if (isResidentRequest() && !validateAll()) {
        event.preventEventDefault;
        event.stopImmediatePropagation();
      }
    });

    configureRequestMode();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }
})();
