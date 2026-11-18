(() => {
  "use strict";

  function applyResidentRequestEnhancements() {
    const dialog = document.getElementById("recordDialog");
    const form = document.getElementById("recordForm");
    if (!dialog || !form) return;

    const type = document.getElementById("fType")?.value;
    const residentMode = type === "request";
    dialog.classList.toggle("request-form", residentMode);

    const title = document.getElementById("fTitle");
    const name = document.getElementById("fName");
    const category = document.getElementById("fCategory");
    const barangay = document.getElementById("fBarangay");
    const location = document.getElementById("fLocation");
    const notes = document.getElementById("fNotes");

    if (!residentMode) return;

    title?.setAttribute("aria-describedby", "requestTitleHint requestTitleError");
    name?.setAttribute("aria-describedby", "requestNameError");
    category?.setAttribute("aria-describedby", "requestCategoryError");
    barangay?.setAttribute("aria-describedby", "requestBarangayError");
    location?.setAttribute("aria-describedby", "requestLocationHint");
    notes?.setAttribute("aria-describedby", "requestNotesCount requestNotesError");

    const titleHint = document.createElement("small");
    titleHint.id = "requestTitleHint";
    titleHint.className = "field-hint";
    titleHint.textContent = "Summarize the concern in 5–100 characters.";

    if (title && !document.getElementById("requestTitleHint")) {
      title.closest(".field")?.appendChild(titleHint);
    }

    if (notes && !document.getElementById("requestNotesCount")) {
      const count = document.createElement("small");
      count.id = "requestNotesCount";
      count.className = "character-count";
      count.textContent = `${notes.value.length} / 600 characters`;
      notes.closest(".field")?.appendChild(count);

      notes.addEventListener("input", () => {
        count.textContent = `${notes.value.length} / 600 characters`;
      });
    }

    [title, name, category, barangay, notes].forEach((input) => {
      if (!input) return;

      input.setAttribute("aria-invalid", "false");
      input.addEventListener("input", () => {
        validateResidentRequestField(input);
      });
      input.addEventListener("change", () => {
        validateResidentRequestField(input);
      });
      input.addEventListener("blur", () => {
        validateResidentRequestField(input, true);
      });
    });
  }

  function setFieldResult(input, valid, message) {
    if (!input) return;

    const field = input.closest(".field");
    let error = field?.querySelector(".field-error");

    if (!error) {
      error = document.createElement("small");
      error.className = "field-error";
      field?.appendChild(error);
    }

    field?.classList.toggle("invalid", !valid);
    field?.classList.toggle("valid", valid && Boolean(input.value));
    input.setAttribute("aria-invalid", String(!valid));
    error.textContent = valid ? "" : message;
  }

  function validateResidentRequestField(input, force = false) {
    if (!input) return true;

    if (!force && !input.value) return true;

    switch (input.id) {
      case "fTitle": {
        const value = input.value.trim();
        const valid = value.length >= 5 && value.length <= 100;
        setFieldResult(input, valid, "Enter a clear request title between 5 and 100 characters.");
        return valid;
      }
      case "fName": {
        const value = input.value.trim();
        const valid = value.length >= 2;
        setFieldResult(input, valid, "Enter the resident's name.");
        return valid;
      }
      case "fCategory": {
        const valid = Boolean(input.value);
        setFieldResult(input, valid, "Select a request category.");
        return valid;
      }
      case "fBarangay": {
        const valid = Boolean(input.value);
        setFieldResult(input, valid, "Select a barangay or choose Other / Not listed.");
        return valid;
      }
      case "fNotes": {
        const valid = input.value.length <= 600;
        setFieldResult(input, valid, "Keep notes within 600 characters.");
        return valid;
      }
      default:
        return true;
    }
  }

  function validateResidentRequestForm() {
    return ["fTitle", "fName", "fCategory", "fBarangay", "fNotes"]
      .map((id) => {
        const input = document.getElementById(id);
        return input ? validateResidentRequestField(input, true) : true;
      })
      .every(Boolean);
  }

  window.upgradeResidentRequestForm = {
    apply: applyResidentRequestEnhancements,
    validate: validateResidentRequestForm
  };

  document.addEventListener("DOMContentLoaded", applyResidentRequestEnhancements);
})();
