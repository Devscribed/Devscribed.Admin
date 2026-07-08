(function () {
  var changeEmailOpen = document.getElementById("change-email-open");
  var changeEmailContainer = document.getElementById("change-email-form-container");
  var changeEmailForm = document.getElementById("change-email-form");
  var changeEmailNew = document.getElementById("change-email-new");
  var changeEmailError = document.getElementById("change-email-error");
  var changeEmailConfirmation = document.getElementById("change-email-confirmation");

  var changePasswordOpen = document.getElementById("change-password-open");
  var changePasswordContainer = document.getElementById("change-password-form-container");
  var changePasswordForm = document.getElementById("change-password-form");
  var changePasswordCurrent = document.getElementById("change-password-current");
  var changePasswordNew = document.getElementById("change-password-new");
  var changePasswordConfirm = document.getElementById("change-password-confirm");
  var changePasswordError = document.getElementById("change-password-error");
  var changePasswordConfirmation = document.getElementById("change-password-confirmation");

  var editFirstName = document.getElementById("edit-first-name");
  var editLastName = document.getElementById("edit-last-name");
  var editPhoneCountry = document.getElementById("edit-phone-country");
  var editPhoneNumber = document.getElementById("edit-phone-number");
  var editTimezone = document.getElementById("edit-timezone");
  var editFirstDay = document.getElementById("edit-first-day");
  var saveButton = document.getElementById("account-save-button");
  var toast = document.getElementById("toast-account-saved");
  var infoError = document.getElementById("account-info-error");

  if (!saveButton) return;

  [editPhoneCountry, editTimezone, editFirstDay].forEach(function (sel) {
    if (sel && sel.dataset.initial) {
      sel.value = sel.dataset.initial;
    }
  });

  if (changeEmailOpen) {
    changeEmailOpen.addEventListener("click", function () {
      var visible = changeEmailContainer.style.display !== "none";
      changeEmailContainer.style.display = visible ? "none" : "block";
      if (!visible) {
        changePasswordContainer.style.display = "none";
      }
    });
  }

  if (changePasswordOpen) {
    changePasswordOpen.addEventListener("click", function () {
      var visible = changePasswordContainer.style.display !== "none";
      changePasswordContainer.style.display = visible ? "none" : "block";
      if (!visible) {
        changeEmailContainer.style.display = "none";
      }
    });
  }

  if (changeEmailForm) {
    changeEmailForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      changeEmailError.textContent = "";
      changeEmailConfirmation.textContent = "";
      var submitBtn = changeEmailForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        var response = await fetch("/api/account/change-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEmail: changeEmailNew.value }),
        });

        if (response.ok) {
          changeEmailConfirmation.textContent =
            "Confirmation link sent to " + changeEmailNew.value;
          return;
        }

        var body = await response.json();
        changeEmailError.textContent = body.error || "Something went wrong.";
      } catch {
        changeEmailError.textContent = "Something went wrong. Please try again.";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      changePasswordError.textContent = "";
      changePasswordConfirmation.textContent = "";
      var submitBtn = changePasswordForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        var response = await fetch("/api/account/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: changePasswordCurrent.value,
            newPassword: changePasswordNew.value,
            confirmPassword: changePasswordConfirm.value,
          }),
        });

        if (response.ok) {
          changePasswordConfirmation.textContent = "Password changed successfully.";
          changePasswordCurrent.value = "";
          changePasswordNew.value = "";
          changePasswordConfirm.value = "";
          return;
        }

        var body = await response.json();
        changePasswordError.textContent = body.error || "Something went wrong.";
      } catch {
        changePasswordError.textContent =
          "Something went wrong. Please try again.";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function clearFieldErrors() {
    var errors = document.querySelectorAll(".field-error");
    for (var i = 0; i < errors.length; i++) {
      errors[i].textContent = "";
    }
  }

  saveButton.addEventListener("click", async function () {
    toast.textContent = "";
    infoError.textContent = "";
    clearFieldErrors();
    saveButton.disabled = true;

    try {
      var response = await fetch("/api/account/info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editFirstName.value,
          lastName: editLastName.value,
          phoneCountryCode: editPhoneCountry.value || null,
          phoneNumber: editPhoneNumber.value || null,
          timezone: editTimezone.value || null,
          firstDayOfWeek: editFirstDay.value || null,
        }),
      });

      if (response.ok) {
        toast.textContent = "Changes saved.";
        return;
      }

      var body = await response.json();
      if (body.field) {
        var fieldError = document.querySelector(
          '[data-testid="field-error-' + body.field + '"]'
        );
        if (fieldError) {
          fieldError.textContent = body.error;
          return;
        }
      }
      infoError.textContent = body.error || "Something went wrong.";
    } catch {
      infoError.textContent = "Something went wrong. Please try again.";
    } finally {
      saveButton.disabled = false;
    }
  });
})();
