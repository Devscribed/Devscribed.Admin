(function () {
  var form = document.getElementById("reset-form");
  var submitButton = document.getElementById("reset-submit-button");
  var errorMessage = document.getElementById("reset-error-message");
  var successMessage = document.getElementById("reset-success-message");

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorMessage.textContent = "";

    var values = Object.fromEntries(new FormData(form).entries());

    if (values.password !== values.confirmPassword) {
      errorMessage.textContent = "passwords do not match";
      return;
    }

    submitButton.disabled = true;

    try {
      var response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: values.token, password: values.password }),
      });

      if (response.ok) {
        form.style.display = "none";
        successMessage.textContent = "Your password has been reset. You can now log in with your new password.";
        return;
      }

      var body = await response.json();
      errorMessage.textContent = body.error || "Something went wrong.";
    } catch {
      errorMessage.textContent = "Something went wrong. Please try again.";
    } finally {
      submitButton.disabled = false;
    }
  });
})();
