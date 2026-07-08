(function () {
  const form = document.getElementById("signup-form");
  const submitButton = document.getElementById("signup-submit-button");
  const errorBanner = document.getElementById("signup-error-banner");

  const fields = ["orgName", "firstName", "lastName", "email", "password"];

  function fieldErrorEl(name) {
    return document.querySelector('[data-testid="field-error-' + name + '"]');
  }

  function clearErrors() {
    errorBanner.textContent = "";
    fields.forEach((name) => {
      fieldErrorEl(name).textContent = "";
    });
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function isValidPassword(value) {
    return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
  }

  function clientErrors() {
    const values = Object.fromEntries(new FormData(form).entries());
    const errors = {};

    const orgName = (values.orgName || "").trim();
    if (orgName.length === 0) {
      errors.orgName = "organization name is required";
    } else if (orgName.length > 100) {
      errors.orgName = "must be at most 100 characters";
    }

    if (!(values.firstName || "").trim()) {
      errors.firstName = "first name is required";
    }

    if (!(values.lastName || "").trim()) {
      errors.lastName = "last name is required";
    }

    if (!isValidEmail((values.email || "").trim())) {
      errors.email = "must be a valid email address";
    }

    if (!isValidPassword(values.password || "")) {
      errors.password = "must be at least 8 characters with a letter and a digit";
    }

    return errors;
  }

  function updateSubmitState() {
    const values = Object.fromEntries(new FormData(form).entries());
    const allFilled = fields.every((name) => (values[name] || "").trim().length > 0);
    const noErrors = Object.keys(clientErrors()).length === 0;
    submitButton.disabled = !(allFilled && noErrors);
  }

  form.addEventListener("input", updateSubmitState);
  updateSubmitState();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

    const errors = clientErrors();
    if (Object.keys(errors).length > 0) {
      Object.entries(errors).forEach(([name, message]) => {
        fieldErrorEl(name).textContent = message;
      });
      return;
    }

    const values = Object.fromEntries(new FormData(form).entries());
    submitButton.disabled = true;

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        const body = await response.json();
        window.location.href = body.redirectUrl || "/Members";
        return;
      }

      const body = await response.json();
      const serverErrors = body.errors || {};
      Object.entries(serverErrors).forEach(([name, message]) => {
        const el = fieldErrorEl(name);
        if (el) {
          el.textContent = message;
        }
      });
      errorBanner.textContent = Object.values(serverErrors).join(" ");
    } catch {
      errorBanner.textContent = "Something went wrong. Please try again.";
    } finally {
      updateSubmitState();
    }
  });
})();
