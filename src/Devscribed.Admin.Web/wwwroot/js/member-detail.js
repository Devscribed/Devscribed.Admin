(function () {
  var input = document.getElementById("job-title-input");
  var saveButton = document.getElementById("job-title-save-button");
  var toast = document.getElementById("toast-member-saved");
  var errorBanner = document.getElementById("job-title-error");

  if (!input || !saveButton || !toast || !errorBanner) return;

  var membershipId = input.dataset.membershipId;

  saveButton.addEventListener("click", async function () {
    toast.textContent = "";
    errorBanner.textContent = "";
    saveButton.disabled = true;

    try {
      var response = await fetch("/api/members/" + membershipId + "/job-title", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle: input.value || null }),
      });

      if (response.ok) {
        toast.textContent = "Changes saved.";
        return;
      }

      var body = await response.json();
      errorBanner.textContent = body.error || "Something went wrong.";
    } catch {
      errorBanner.textContent = "Something went wrong. Please try again.";
    } finally {
      saveButton.disabled = false;
    }
  });
})();
