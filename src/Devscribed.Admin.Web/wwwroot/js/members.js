(function () {
  var openButton = document.getElementById("invite-open-button");
  var form = document.getElementById("invite-form");
  var submitButton = document.getElementById("invite-submit-button");
  var inviteErrorMessage = document.getElementById("invite-error-message");
  var inviteSentToast = document.getElementById("toast-invite-sent");

  if (openButton && form && submitButton && inviteErrorMessage && inviteSentToast) {
    openButton.addEventListener("click", function () {
      form.hidden = !form.hidden;
      inviteErrorMessage.textContent = "";
      inviteSentToast.textContent = "";
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      inviteErrorMessage.textContent = "";
      inviteSentToast.textContent = "";
      submitButton.disabled = true;

      try {
        var values = Object.fromEntries(new FormData(form).entries());
        var response = await fetch("/api/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });

        if (response.ok) {
          inviteSentToast.textContent = "Invitation sent.";
          form.reset();
          form.hidden = true;
          return;
        }

        var body = await response.json();
        inviteErrorMessage.textContent = body.error || "Something went wrong.";
      } catch {
        inviteErrorMessage.textContent = "Something went wrong. Please try again.";
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  var rows = Array.prototype.slice.call(document.querySelectorAll("[data-member-id]"));
  var searchInput = document.getElementById("members-search-input");
  var showRemovedCheckbox = document.getElementById("show-removed-checkbox");
  var emptyState = document.getElementById("members-empty-state");
  var removeToast = document.getElementById("toast-member-removed");
  var restoreToast = document.getElementById("toast-member-restored");
  var actionError = document.getElementById("member-action-error");
  var confirmDeleteDialog = document.getElementById("confirm-delete-dialog");
  var confirmDeleteButton = document.getElementById("confirm-delete-button");
  var cancelDeleteButton = document.getElementById("cancel-delete-button");
  var pendingDeleteMemberId = null;

  function clearMemberMessages() {
    if (removeToast) removeToast.textContent = "";
    if (restoreToast) restoreToast.textContent = "";
    if (actionError) actionError.textContent = "";
  }

  function applyFilters() {
    if (!searchInput || !showRemovedCheckbox || !emptyState) return;

    var searchTerm = searchInput.value.trim().toLowerCase();
    var showRemoved = showRemovedCheckbox.checked;
    var visibleCount = 0;

    rows.forEach(function (row) {
      var status = row.dataset.status || "active";
      var haystack = ((row.dataset.name || "") + " " + (row.dataset.email || "")).toLowerCase();
      var statusMatches = showRemoved || status === "active";
      var searchMatches = searchTerm === "" || haystack.indexOf(searchTerm) !== -1;
      var visible = statusMatches && searchMatches;

      row.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    emptyState.hidden = visibleCount !== 0;
  }

  function updateRowState(memberId, nextStatus) {
    var row = document.querySelector('[data-member-id="' + memberId + '"]');
    if (!row) return;

    row.dataset.status = nextStatus;

    var badge = row.querySelector("[data-testid^='member-status-badge-']");
    if (badge) {
      badge.classList.toggle("status-badge-hidden", nextStatus !== "removed");
    }

    var deleteButton = row.querySelector("[data-action='delete']");
    if (deleteButton) {
      deleteButton.classList.toggle("member-action-hidden", nextStatus !== "active");
    }

    var restoreButton = row.querySelector("[data-action='restore']");
    if (restoreButton) {
      restoreButton.classList.toggle("member-action-hidden", nextStatus !== "removed");
    }
  }

  function refreshAdminGuards() {
    var activeAdminRows = rows.filter(function (row) {
      return row.dataset.role === "admin" && row.dataset.status === "active";
    });
    var shouldGuardLastAdmin = activeAdminRows.length <= 1;

    rows.forEach(function (row) {
      if (row.dataset.role !== "admin") return;

      var deleteButton = row.querySelector("[data-action='delete']");
      var guardMessage = row.querySelector("[data-testid='delete-guard-message']");
      var isGuarded = shouldGuardLastAdmin && row.dataset.status === "active";

      if (deleteButton) {
        deleteButton.disabled = isGuarded;
      }

      if (guardMessage) {
        guardMessage.classList.toggle("member-guard-hidden", !isGuarded);
      }
    });
  }

  async function updateMemberStatus(memberId, actionName) {
    clearMemberMessages();

    try {
      var response = await fetch("/api/members/" + memberId + "/" + actionName, {
        method: "POST",
      });

      if (!response.ok) {
        var body = await response.json();
        if (actionError) actionError.textContent = body.error || "Something went wrong.";
        return;
      }

      var nextStatus = actionName === "remove" ? "removed" : "active";
      updateRowState(memberId, nextStatus);
      refreshAdminGuards();
      applyFilters();

      if (actionName === "remove" && removeToast) {
        removeToast.textContent = "Member removed.";
      }

      if (actionName === "restore" && restoreToast) {
        restoreToast.textContent = "Member restored.";
      }
    } catch {
      if (actionError) actionError.textContent = "Something went wrong. Please try again.";
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }

  if (showRemovedCheckbox) {
    showRemovedCheckbox.addEventListener("change", applyFilters);
  }

  if (cancelDeleteButton && confirmDeleteDialog) {
    cancelDeleteButton.addEventListener("click", function () {
      pendingDeleteMemberId = null;
      confirmDeleteDialog.close();
    });
  }

  if (confirmDeleteButton && confirmDeleteDialog) {
    confirmDeleteButton.addEventListener("click", async function () {
      if (!pendingDeleteMemberId) return;

      confirmDeleteButton.disabled = true;
      await updateMemberStatus(pendingDeleteMemberId, "remove");
      confirmDeleteButton.disabled = false;
      pendingDeleteMemberId = null;
      confirmDeleteDialog.close();
    });
  }

  rows.forEach(function (row) {
    var actionsTrigger = row.querySelector("[data-testid^='member-row-actions-']");
    if (actionsTrigger) {
      actionsTrigger.addEventListener("click", function () {
        row.classList.toggle("member-actions-open");
      });
    }

    var deleteButton = row.querySelector("[data-action='delete']");
    if (deleteButton) {
      deleteButton.addEventListener("click", function () {
        if (deleteButton.disabled || !confirmDeleteDialog) return;
        pendingDeleteMemberId = row.dataset.memberId;
        row.classList.remove("member-actions-open");
        confirmDeleteDialog.showModal();
      });
    }

    var restoreButton = row.querySelector("[data-action='restore']");
    if (restoreButton) {
      restoreButton.addEventListener("click", function () {
        row.classList.remove("member-actions-open");
        updateMemberStatus(row.dataset.memberId, "restore");
      });
    }
  });

  refreshAdminGuards();
  applyFilters();
})();
