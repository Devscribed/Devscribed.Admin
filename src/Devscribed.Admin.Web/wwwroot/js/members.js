(function () {
  var openButton = document.getElementById("invite-open-button");
  var form = document.getElementById("invite-form");
  if (!openButton || !form) return;

  var submitButton = document.getElementById("invite-submit-button");
  var errorMessage = document.getElementById("invite-error-message");
  var sentToast = document.getElementById("toast-invite-sent");

  openButton.addEventListener("click", function () {
    form.hidden = !form.hidden;
    errorMessage.textContent = "";
    sentToast.textContent = "";
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorMessage.textContent = "";
    sentToast.textContent = "";
    submitButton.disabled = true;

    try {
      var values = Object.fromEntries(new FormData(form).entries());
      var response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        sentToast.textContent = "Invitation sent.";
        form.reset();
        form.hidden = true;
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
