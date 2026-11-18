/*
 * Resident request form enhancements.
 * Loaded before app.js so these capture-phase validators run first.
 * Resident-reported urgency is stored as a clearly labeled note; staff
 * remain responsible for assigning operational priority.
 */
(() => {
  "use strict";

  function init() {
    const dialog = document.getElementById("recordDialog");
    const form = document.getElementById("recordForm");
    const type = document.getElementById("fType");
    const title = document.getElementById("fTitle");
    const name = document.getElementById("fName");
    const email = document.getElementById("fEmail");
    const category = document.getElementById("fCategory");
    const date = document.getElementById("fDate");
    const barangay = document.getElementById("fBarangay");
    const location = document.getElementById("fLocation");
    const notes = document.getElementById("fNotes");
    const priorityField = document.getElementById("priorityField");
    const prioritySelect = document.getElementById("fPriority");

    if (!dialog || !form || !type || !title || !category || !barangay) return;

    const touched = new Set();
    let urgencyField;
    let requestError;

    const isResidentRequest = () =>
      type.value === "request" && Boolean(name?.readOnly);

    function getError(input, key) {
      const wrapper = input?.closest(".field");
      if (!wrapper) return null;

      let error = wrapper.querySelector(`[data-request-error="${key}"]`)
        || wrapper.querySelector(`[data-error="${key}"]`)
        || wrapper.querySelector(".field-error");

      if (!error) {
        error = document.createElement("small");
        error.className = "field-error";
        error.dataset.requestError = key;
        error.setAttribute("role", "alert");
        wrapper.appendChild(error);
      }

      return error;
    }

    function setResult(input, key, message, hasValue = Boolean(input?.value)) {
      if (!input) return !message;

      const wrapper = input.closest(".field");
      wrapper?.classList.toggle("invalid", Boolean(message));
      wrapper?.classList.toggle("valid", !message && hasValue);
      input.setAttribute("aria-invalid", String(Boolean(message)));

      const error = getError(input, key);
      if (error) error.textContent = message;

      return !message;
    }

    function addDescription(input, text) {
      if (!input) return;
      const wrapper = input.closest(".field");
      if (!wrapper || wrapper.querySelector(`[data-request-hint="${input.id}"]`)) return;

      const hint = document.createElement("small");
      hint.className = "field-hint";
      hint.dataset.requestHint = input.id;
      hint.textContent = text;
      wrapper.appendChild(hint);

      const current = input.getAttribute("aria-describedby");
      input.setAttribute("aria-describedby", [current, hint.id].filter(Boolean).join(" "));
    }

    function addCounter(input, id, max, extraLength = () => 0) {
      if (!input) return null;
      const wrapper = input.closest(".field");
      if (!wrapper) return null;

      let counter = document.getElementById(id);
      if (!counter) {
        counter = document.createElement("small");
        counter.id = id;
        counter.className = "character-count";
        counter.setAttribute("aria-live", "polite");
        wrapper.appendChild(counter);
      }

      const update = () => {
        const count = input.value.length + extraLength();
        counter.textContent = `${count} / ${max} characters`;
        counter.classList.toggle("near-limit", count >= max - 40);
        counter.classList.toggle("over-limit", count > max);
      };

      input.addEventListener("input", update);
      update();
      return update;
    }

    function ensureUrgencyOptions() {
      if (!priorityField || !prioritySelect) return;
      if (document.getElementById("residentUrgencyField")) {
        urgencyField = document.getElementById("residentUrgencyField");
        return;
      }

      urgencyField = document.createElement("fieldset");
      urgencyField.id = "residentUrgencyField";
      urgencyField.className = "request-urgency";
      urgencyField.setAttribute("aria-describedby", "requestUrgencyHint requestEmergencyNotice");
      urgencyField.innerHTML = `
        <legend>How urgent does this feel? <span class="request-required">Required</span></legend>
        <p class="field-hint" id="requestUrgencyHint">
          This is your report of urgency, not the City’s assigned priority. Staff will review it.
        </p>
        <div class="urgency-options">
          <label class="urgency-option">
            <input type="radio" name="residentUrgency" value="Low">
            <span><strong>Low</strong><small>General question or non-urgent concern</small></span>
          </label>
          <label class="urgency-option">
            <input type="radio" name="residentUrgency" value="Normal" checked>
            <span><strong>Normal</strong><small>Needs attention during regular service</small></span>
          </label>
          <label class="urgency-option">
            <input type="radio" name="residentUrgency" value="High">
            <span><strong>High</strong><small>Significant impact; please explain in the details</small></span>
          </label>
        </div>
        <small class="field-error" id="requestUrgencyError" role="alert"></small>
        <p class="request-emergency" id="requestEmergencyNotice">
          For immediate danger or a medical emergency, call 911. This form is not monitored for emergencies.
        </p>
      `;

      priorityField.insertAdjacentElement("afterend", urgencyField);

      urgencyField.addEventListener("change", event => {
        if (event.target.matches('input[name="residentUrgency"]')) {
          touched.add("urgency");
          validateUrgency();
          updateNotesCounter?.();
        }
      });
    }

    function selectedUrgency() {
      return form.querySelector('input[name="residentUrgency"]:checked')?.value || "";
    }

    function validateUrgency() {
      const value = selectedUrgency();
      const error = document.getElementById("requestUrgencyError");
      if (error) error.textContent = value ? "" : "Choose an urgency level.";
      urgencyField?.classList.toggle("invalid", !value);
      return Boolean(value);
    }

    function applyRolePolicy() {
      const request = type.value === "request";
      const resident = isResidentRequest();

      if (priorityField) priorityField.hidden = !request || resident;
      if (urgencyField) urgencyField.hidden = !request || !resident;

      const status = document.getElementById("fStatus");
      const statusField = status?.closest(".field");
      if (statusField) statusField.hidden = request;

      if (resident && prioritySelect) prioritySelect.value = "Normal";
    }

    function validateTitle() {
      const value = title.value.trim();
      const message = value.length < 5 || value.length > 100
        ? "Enter a clear title between 5 and 100 characters."
        : "";
      return setResult(title, "title", message);
    }

    function validateCategory() {
      return setResult(
        category,
        "category",
        category.value ? "" : "Choose a service category."
      );
    }

    function validateName() {
      if (!name) return true;
      const value = name.value.trim();
      return setResult(
        name,
        "name",
        value.length >= 2 && value.length <= 80
          ? ""
          : "A resident name is required (2–80 characters)."
      );
    }

    function validateEmail() {
      if (!email || !email.value.trim()) {
        return setResult(email, "email", "", false);
      }
      return setResult(
        email,
        "email",
        email.validity.valid ? "" : "Enter a valid email address."
      );
    }

    function validateDate() {
      if (!date) return true;
      const today = new Date();
      const max = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
      date.max = max;
      const valid = Boolean(date.value) && date.validity.valid && date.value <= max;
      return setResult(date, "date", valid ? "" : "Choose today or an earlier valid date.");
    }

    function validateBarangay() {
      return setResult(
        barangay,
        "barangay",
        barangay.value ? "" : "Select your barangay from the list."
      );
    }

    function validateLocation() {
      if (!location || !location.value.trim()) {
        return setResult(location, "location", "", false);
      }
      const value = location.value.trim();
      return setResult(
        location,
        "location",
        value.length <= 100 ? "" : "Location must be 100 characters or fewer."
      );
    }

    function validateNotes() {
      if (!notes) return true;
      const value = notes.value.trim();
      return setResult(
        notes,
        "notes",
        value.length <= 600 ? "" : "Details must be 600 characters or fewer.",
        Boolean(value)
      );
    }

    function validateAll() {
      const checks = [
        validateCategory(),
        validateTitle(),
        validateName(),
        validateEmail(),
        validateDate(),
        validateBarangay(),
        validateLocation(),
        validateNotes(),
        validateUrgency()
      ];

      if (checks.every(Boolean)) return true;

      const firstInvalid = form.querySelector(
        '.field.invalid input, .field.invalid select, .field.invalid textarea, ' +
        '#residentUrgencyField.invalid input'
      );
      firstInvalid?.focus();
      return false;
    }

    let updateNotesCounter;

    function configureRequestMode() {
      ensureUrgencyOptions();
      const request = type.value === "request";
      dialog.classList.toggle("resident-request-form", request);
      form.classList.toggle("resident-request-form", request);
      applyRolePolicy();
    }

    addDescription(title, "Use a short summary. Add the full details below.");
    addDescription(location, "Add a street, landmark, facility, or nearby reference if relevant.");
    addDescription(notes, "Tell us what happened, where and when, and what help you need. Do not include passwords or sensitive identity numbers.");

    const updateTitleCounter = addCounter(title, "requestTitleCount", 100);
    const updateLocationCounter = addCounter(location, "requestLocationCount", 100);
    updateNotesCounter = addCounter(notes, "requestDetailsCount", 600, () => {
      const urgency = selectedUrgency();
      return urgency ? `\n\nResident-reported urgency (unverified): ${urgency}.`.length : 0;
    });

    // Keep the displayed count current if the resident changes urgency.
    const titleLabel = document.getElementById("fTitleLabel");
    if (titleLabel) titleLabel.textContent = "Request title";

    for (const [input, key, validator] of [
      [title, "title", validateTitle],
      [name, "name", validateName],
      [email, "email", validateEmail],
      [date, "date", validateDate],
      [category, "category", validateCategory],
      [barangay, "barangay", validateBarangay],
      [location, "location", validateLocation],
      [notes, "notes", validateNotes]
    ]) {
      if (!input) continue;
      input.addEventListener("blur", () => {
        touched.add(key);
        validator();
      });
      input.addEventListener("input", () => {
        if (touched.has(key)) validator();
      });
      input.addEventListener("change", () => {
        if (touched.has(key)) validator();
      });
    }

    form.addEventListener("submit", event => {
      if (!isResidentRequest()) return;

      touched.add("all");
      if (!validateAll()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      // Keep operational priority staff-assigned. Preserve resident urgency
      // as an explicitly unverified note using the existing schema.
      const urgency = selectedUrgency();
      const annotation = `Resident-reported urgency (unverified): ${urgency}.`;
      const currentNotes = notes?.value.trim() || "";
      const combined = [currentNotes, annotation].filter(Boolean).join("\n\n");

      if (notes && combined.length > 600) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setResult(notes, "notes", "Shorten the details so the urgency note also fits within 600 characters.");
        notes.focus();
        return;
      }

      if (notes) notes.value = combined;
      if (prioritySelect) prioritySelect.value = "Normal";
    }, true);

    type.addEventListener("change", () => {
      configureRequestMode();
      window.setTimeout(applyRolePolicy, 0);
    });

    // app.js sets the resident name and field visibility while preparing a
    // form. Reapply the policy when that state changes.
    const observer = new MutationObserver(() => window.setTimeout(applyRolePolicy, 0));
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    if (name) observer.observe(name, { attributes: true, attributeFilter: ["readonly"] });
    if (priorityField) observer.observe(priorityField, { attributes: true, attributeFilter: ["hidden"] });

    configureRequestMode();

    // Show an accessible confirmation only after the backend confirms save.
    const originalApi = window.portalApi;
    if (typeof originalApi === "function" && !originalApi.__requestConfirmationWrapped) {
      const wrappedApi = async function (file, options = {}) {
        const response = await originalApi(file, options);
        const endpoint = String(file).split("?")[0];
        if (
          endpoint === "records.php" &&
          options.method === "POST" &&
          options.body?.action === "create" &&
          options.body?.type === "request" &&
          response?.record
        ) {
          window.setTimeout(() => showSubmissionConfirmation(response.record), 120);
        }
        return response;
      };
      wrappedApi.__requestConfirmationWrapped = true;
      window.portalApi = wrappedApi;
    }

    function showSubmissionConfirmation(record) {
      let confirmation = document.getElementById("requestSuccessDialog");
      if (!confirmation) {
        confirmation = document.createElement("dialog");
        confirmation.id = "requestSuccessDialog";
        confirmation.className = "modal request-success-dialog";
        confirmation.setAttribute("aria-labelledby", "requestSuccessTitle");
        confirmation.innerHTML = `
          <div class="request-success-content">
            <span class="request-success-mark" aria-hidden="true">✓</span>
            <p class="eyebrow">Request submitted</p>
            <h2 id="requestSuccessTitle">We received your request</h2>
            <p id="requestSuccessCopy"></p>
            <p class="request-success-next">You can follow updates from the Requests page. Staff will review the details and set the service priority.</p>
            <button type="button" class="btn primary" id="requestSuccessClose">Continue</button>
          </div>
        `;
        document.body.appendChild(confirmation);
        confirmation.querySelector("#requestSuccessClose").addEventListener("click", () => confirmation.close());
      }
      confirmation.querySelector("#requestSuccessCopy").textContent =
        `Your reference number is ${record.ref || record.id}. Keep it for your records.`;
      if (!confirmation.open) confirmation.showModal();
      confirmation.querySelector("#requestSuccessClose")?.focus();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
