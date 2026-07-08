(function () {
  var form = document.getElementById("forgot-form");
  var submitButton = document.getElementById("forgot-submit-button");
  var confirmationMessage = document.getElementById("forgot-confirmation-message");

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    confirmationMessage.textContent = "";

    var values = Object.fromEntries(new FormData(form).entries());
    submitButton.disabled = true;

    try {
      var response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      var body = await response.json();
      confirmationMessage.textContent = body.message;
      form.style.display = "none";
    } catch {
      confirmationMessage.textContent = "Something went wrong. Please try again.";
    }
  });
})();
