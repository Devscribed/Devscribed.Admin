"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type MemberDetail = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  joinedAt: string;
  jobTitle: string;
  timezone: string;
  avatarInitials: string;
  isLastAdmin: boolean;
  canEditRole: boolean;
  canEditJobTitle: boolean;
  availableRoles: string[];
  callerRole: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  user: "User",
  viewer: "Viewer",
};

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-violet-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-fuchsia-600",
  "bg-lime-600",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const TABS = [
  { key: "about", label: "About", disabled: false },
  { key: "vacation", label: "Vacation", disabled: true },
  { key: "projects", label: "Projects", disabled: true },
  { key: "roles", label: "Roles", disabled: true },
  { key: "payments", label: "Payments", disabled: true },
];

export default function MemberDetailPage() {
  const params = useParams();
  const orgId = params.orgId as string;
  const memberId = params.memberId as string;

  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedRole, setSelectedRole] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobTitleError, setJobTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchMember = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/members/${memberId}`
      );
      if (!res.ok) {
        setError("Unable to load member details.");
        setLoading(false);
        return;
      }
      const data: MemberDetail = await res.json();
      setMember(data);
      setSelectedRole(data.role);
      setJobTitle(data.jobTitle);
      setError(null);
    } catch {
      setError("Unable to load member details.");
    } finally {
      setLoading(false);
    }
  }, [orgId, memberId]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

  function handleJobTitleChange(value: string) {
    setJobTitle(value);
    if (value.length > 100) {
      setJobTitleError("Job title must be at most 100 characters");
    } else {
      setJobTitleError(null);
    }
  }

  async function handleSave() {
    if (!member) return;
    if (jobTitle.length > 100) {
      setJobTitleError("Job title must be at most 100 characters");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/members/${memberId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: selectedRole, jobTitle }),
        }
      );

      if (res.ok) {
        setToast("Changes saved");
        setTimeout(() => setToast(null), 5000);
        await fetchMember();
      } else {
        const body = await res.json().catch(() => null);
        if (body?.errors?.jobTitle) {
          setJobTitleError(body.errors.jobTitle);
        } else if (body?.message) {
          setError(body.message);
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const isRolePickerDisabled = member?.isLastAdmin ?? false;
  const canEdit = member?.canEditRole || member?.canEditJobTitle;
  const isRemoved = member?.status === "removed";

  if (loading) {
    return (
      <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-black">
        <div className="mx-auto w-full max-w-3xl">
          <div
            data-testid="member-detail-loading-skeleton"
            className="space-y-6"
          >
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="space-y-2">
                <div className="h-6 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </div>
            </div>
            <div className="h-10 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="space-y-3">
              <div className="h-4 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-4 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !member) {
    return (
      <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-black">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!member) return null;

  const avatarColor = getAvatarColor(member.fullName);

  return (
    <div
      data-testid="member-detail"
      className="flex flex-1 flex-col bg-zinc-50 px-4 py-12 dark:bg-black"
    >
      <div className="mx-auto w-full max-w-3xl">
        {/* Back link */}
        <a
          data-testid="member-detail-back-link"
          href="/members"
          className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to members
        </a>

        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div
            data-testid="member-detail-avatar"
            className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white ${avatarColor}`}
          >
            {member.avatarInitials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1
                data-testid="member-detail-name"
                className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50"
              >
                {member.fullName}
              </h1>
              <span
                data-testid="member-detail-role-badge"
                className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {member.role}
              </span>
              {isRemoved && (
                <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  Removed
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
              <span data-testid="member-detail-email">{member.email}</span>
              <span data-testid="member-detail-joined">
                Joined{" "}
                {new Date(member.joinedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {member.timezone && (
                <span data-testid="member-detail-timezone">
                  {member.timezone}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
          <nav className="-mb-px flex gap-6" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                data-testid={`member-detail-tab-${tab.key}`}
                disabled={tab.disabled}
                className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  tab.key === "about"
                    ? "border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                    : tab.disabled
                      ? "cursor-not-allowed border-transparent text-zinc-400 dark:text-zinc-600"
                      : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* About tab content */}
        <div className="space-y-6">
          {/* Role */}
          {canEdit && !isRemoved ? (
            <div>
              <label
                htmlFor="role-select"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Role
              </label>
              {member.canEditRole ? (
                <div className="relative">
                  <select
                    id="role-select"
                    data-testid={`member-role-select-${member.id}`}
                    value={selectedRole}
                    disabled={isRolePickerDisabled}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  >
                    {member.availableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] ?? r}
                      </option>
                    ))}
                  </select>
                  {isRolePickerDisabled && (
                    <p
                      data-testid="role-change-guard-message"
                      className="mt-1 text-xs text-amber-600 dark:text-amber-400"
                    >
                      Organization must retain at least one admin
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {ROLE_LABELS[member.role] ?? member.role}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Role
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {ROLE_LABELS[member.role] ?? member.role}
              </p>
            </div>
          )}

          {/* Job title */}
          {canEdit && !isRemoved ? (
            <div>
              <label
                htmlFor="job-title-input"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Job title
              </label>
              <input
                id="job-title-input"
                data-testid="job-title-input"
                type="text"
                value={jobTitle}
                onChange={(e) => handleJobTitleChange(e.target.value)}
                className={`w-full max-w-xs rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:bg-zinc-900 dark:text-zinc-50 ${
                  jobTitleError
                    ? "border-red-400 dark:border-red-700"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              />
              {jobTitleError && (
                <p
                  data-testid="field-error-jobTitle"
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {jobTitleError}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Job title
              </p>
              <p
                data-testid="job-title-readonly"
                className="text-sm text-zinc-600 dark:text-zinc-400"
              >
                {member.jobTitle || "Not set"}
              </p>
            </div>
          )}

          {/* Save button */}
          {canEdit && !isRemoved && (
            <button
              data-testid="job-title-save-button"
              onClick={handleSave}
              disabled={saving || !!jobTitleError}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div
            data-testid="toast-member-saved"
            className="fixed bottom-6 right-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg dark:border-green-900 dark:bg-green-950 dark:text-green-300"
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
