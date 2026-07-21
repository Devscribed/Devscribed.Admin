"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateEmail } from "@/lib/signupValidation";

type Member = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  joinedAt: string;
  isLastAdmin: boolean;
  isSelf: boolean;
};

type MembersResponse = {
  members: Member[];
  callerRole: string;
};

const ROLES_FOR_ADMIN = ["admin", "manager", "user", "viewer"];
const ROLES_FOR_MANAGER = ["manager", "user", "viewer"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  user: "User",
  viewer: "Viewer",
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [callerRole, setCallerRole] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"invite" | "removed" | "restored">("invite");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Fetch orgId from /api/me on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchMe() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setOrgId(data.organizationId);
          }
        }
      } catch {
        // ignore
      }
    }
    fetchMe();
    return () => { cancelled = true; };
  }, []);

  // Debounce search input
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm]);

  // Fetch members when orgId, debouncedSearch, or showRemoved changes
  const fetchMembers = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (showRemoved) params.set("showRemoved", "true");
      const qs = params.toString();
      const url = `/api/organizations/${orgId}/members${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError("Unable to load members.");
        setLoading(false);
        return;
      }
      const data: MembersResponse = await res.json();
      setMembers(data.members);
      setCallerRole(data.callerRole);
      setError(null);
    } catch {
      setError("Unable to load members.");
    } finally {
      setLoading(false);
    }
  }, [orgId, debouncedSearch, showRemoved]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const canManage = callerRole === "admin" || callerRole === "manager";
  const canInvite = callerRole === "admin" || callerRole === "manager";

  function showToast(message: string, type: "invite" | "removed" | "restored") {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 5000);
  }

  function handleInviteSuccess(email: string) {
    setShowInviteModal(false);
    showToast(`Invitation sent to ${email}`, "invite");
    fetchMembers();
  }

  async function handleDelete(member: Member) {
    if (!orgId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members/${member.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteTarget(null);
        showToast("Member removed", "removed");
        fetchMembers();
      } else {
        const body = await res.json().catch(() => null);
        setDeleteTarget(null);
        showToast(body?.message ?? "Something went wrong. Please try again.", "removed");
      }
    } catch {
      setDeleteTarget(null);
      showToast("Something went wrong. Please try again.", "removed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRestore(member: Member) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/organizations/${orgId}/members/${member.id}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        showToast("Member restored", "restored");
        fetchMembers();
      } else {
        const body = await res.json().catch(() => null);
        showToast(body?.message ?? "Something went wrong. Please try again.", "restored");
      }
    } catch {
      showToast("Something went wrong. Please try again.", "restored");
    }
  }

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    function handleClickOutside() {
      setOpenMenuId(null);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [openMenuId]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Active members
          </h1>
          {canInvite && (
            <button
              data-testid="invite-open-button"
              onClick={() => setShowInviteModal(true)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Invite member
            </button>
          )}
        </div>

        {/* Search and filter controls */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-sm">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              data-testid="members-search-input"
              type="text"
              placeholder="Search members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input
              data-testid="show-removed-checkbox"
              type="checkbox"
              checked={showRemoved}
              onChange={(e) => setShowRemoved(e.target.checked)}
              className="rounded border-zinc-300 dark:border-zinc-700"
            />
            Show removed members
          </label>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {/* Loading skeleton */}
        {loading && !members && (
          <div data-testid="members-loading-skeleton" className="space-y-0">
            <div className="rounded-t-lg border border-b-0 border-zinc-200 bg-zinc-100 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex gap-4">
                <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-4 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </div>
            </div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`border border-b-0 border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 ${i === 3 ? "rounded-b-lg border-b" : ""}`}
              >
                <div className="flex gap-4">
                  <div className="h-4 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div className="h-4 w-14 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div className="h-4 w-36 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Members table */}
        {members !== null && !error && (
          <>
            {members.length === 0 ? (
              <div
                data-testid="members-empty-state"
                className="rounded-lg border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
              >
                No members found
              </div>
            ) : (
              <div
                data-testid="members-list"
                className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900">
                      <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                        Name
                      </th>
                      <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                        Role
                      </th>
                      <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                        Email
                      </th>
                      {canManage && (
                        <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {members.map((member) => (
                      <tr
                        key={member.id}
                        data-testid={`member-row-${member.id}`}
                        className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      >
                        <td className="px-4 py-3">
                          <a
                            href={`/org/${orgId}/members/${member.id}`}
                            className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                            data-testid={`member-name-${member.id}`}
                          >
                            {member.fullName}
                            {member.isSelf && (
                              <span className="ml-1 text-zinc-400 dark:text-zinc-500">
                                (you)
                              </span>
                            )}
                          </a>
                          {member.status === "removed" && (
                            <span
                              data-testid={`member-status-badge-${member.id}`}
                              className="ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            >
                              Removed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            data-testid={`member-role-badge-${member.id}`}
                            className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {member.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            data-testid={`member-email-${member.id}`}
                            className="text-zinc-500 dark:text-zinc-400"
                          >
                            {member.email}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            {!member.isSelf && (
                              <div className="relative">
                                <button
                                  data-testid={`member-row-actions-${member.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(
                                      openMenuId === member.id ? null : member.id
                                    );
                                  }}
                                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                                  aria-label="Actions"
                                >
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 16 16"
                                    fill="currentColor"
                                    aria-hidden="true"
                                  >
                                    <circle cx="8" cy="3" r="1.5" />
                                    <circle cx="8" cy="8" r="1.5" />
                                    <circle cx="8" cy="13" r="1.5" />
                                  </svg>
                                </button>
                                {openMenuId === member.id && (
                                  <div
                                    className="absolute right-0 z-10 mt-1 w-36 rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {member.status === "active" && (
                                      <>
                                        {member.isLastAdmin ? (
                                          <div
                                            data-testid="delete-guard-message"
                                            className="cursor-not-allowed px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500"
                                            title="Cannot remove the last admin"
                                          >
                                            Delete
                                            <p className="mt-0.5 text-xs">
                                              Cannot remove the last admin
                                            </p>
                                          </div>
                                        ) : (
                                          <button
                                            data-testid="member-action-delete"
                                            onClick={() => {
                                              setOpenMenuId(null);
                                              setDeleteTarget(member);
                                            }}
                                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                          >
                                            Delete
                                          </button>
                                        )}
                                      </>
                                    )}
                                    {member.status === "removed" && (
                                      <button
                                        data-testid="member-action-restore"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          handleRestore(member);
                                        }}
                                        className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                      >
                                        Restore
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Delete confirmation dialog */}
        {deleteTarget && (
          <div
            data-testid="confirm-delete-dialog"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          >
            <div className="mx-4 w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Remove member
              </h2>
              <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
                Are you sure you want to remove {deleteTarget.fullName}? They
                will lose access immediately.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  data-testid="cancel-delete-button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  data-testid="confirm-delete-button"
                  onClick={() => handleDelete(deleteTarget)}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
                >
                  {deleting ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast notifications */}
        {toastMessage && (
          <div
            data-testid={
              toastType === "removed"
                ? "toast-member-removed"
                : toastType === "restored"
                  ? "toast-member-restored"
                  : "toast-invite-sent"
            }
            className={`fixed bottom-6 right-6 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toastType === "removed"
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                : "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
            }`}
          >
            {toastMessage}
          </div>
        )}

        {/* Invite modal */}
        {showInviteModal && callerRole && (
          <InviteModal
            currentUserRole={callerRole}
            onClose={() => setShowInviteModal(false)}
            onSuccess={handleInviteSuccess}
          />
        )}
      </div>
    </div>
  );
}

function InviteModal({
  currentUserRole,
  onClose,
  onSuccess,
}: {
  currentUserRole: string;
  onClose: () => void;
  onSuccess: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const availableRoles =
    currentUserRole === "admin" ? ROLES_FOR_ADMIN : ROLES_FOR_MANAGER;

  const emailValidation = useMemo(() => validateEmail(email), [email]);
  const isFormValid = email.trim().length > 0 && emailValidation.isValid;

  function handleEmailBlur() {
    if (email.trim().length === 0) return;
    const result = validateEmail(email);
    setEmailError(result.isValid ? undefined : result.errorMessage);
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    if (serverError) setServerError(null);
    if (emailError) {
      const result = validateEmail(value);
      if (result.isValid) setEmailError(undefined);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = validateEmail(email);
    if (!result.isValid) {
      setEmailError(result.errorMessage);
      return;
    }

    setLoading(true);
    setServerError(null);

    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      if (response.ok) {
        onSuccess(email.trim().toLowerCase());
        return;
      }

      const body = await response.json().catch(() => null);
      setServerError(
        body?.message ?? "Something went wrong. Please try again."
      );
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-[480px] rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Invite member
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form data-testid="invite-form" onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label
              htmlFor="invite-email"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Email address
            </label>
            <input
              id="invite-email"
              data-testid="invite-email-input"
              type="email"
              value={email}
              disabled={loading}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={handleEmailBlur}
              aria-invalid={Boolean(emailError)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                emailError
                  ? "border-red-400 dark:border-red-700"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            />
            {emailError && (
              <p
                data-testid="field-error-email"
                role="alert"
                className="mt-1 text-sm text-red-600 dark:text-red-400"
              >
                {emailError}
              </p>
            )}
          </div>

          <div className="mb-4">
            <label
              htmlFor="invite-role"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Role
            </label>
            <select
              id="invite-role"
              data-testid="invite-role-select"
              value={role}
              disabled={loading}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {serverError && (
            <div
              data-testid="invite-error-message"
              role="alert"
              className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {serverError}
            </div>
          )}

          <button
            type="submit"
            data-testid="invite-submit-button"
            disabled={!isFormValid || loading}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Sending..." : "Send invitation"}
          </button>
        </form>
      </div>
    </div>
  );
}
