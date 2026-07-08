(function () {
  var form = document.getElementById("accept-invite-form");
  if (!form) return;

  var submitButton = document.getElementById("accept-submit-button");
  var errorMessage = document.getElementById("accept-invite-error");

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorMessage.textContent = "";
    submitButton.disabled = true;

    try {
      var values = Object.fromEntries(new FormData(form).entries());
      var response = await fetch("/api/invitations/accept", {
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
