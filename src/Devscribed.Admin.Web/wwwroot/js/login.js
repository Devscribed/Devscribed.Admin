(function () {
  var form = document.getElementById("login-form");
  var submitButton = document.getElementById("login-submit-button");
  var errorMessage = document.getElementById("login-error-message");

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorMessage.textContent = "";

    var values = Object.fromEntries(new FormData(form).entries());
    submitButton.disabled = true;

    try {
      var response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        var body = await response.json();
        window.location.href = body.redirectUrl || "/Members";
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
