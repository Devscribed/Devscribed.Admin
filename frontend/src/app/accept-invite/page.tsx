"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  validatePassword,
  validatePersonName,
} from "@/lib/signupValidation";

type ValidationData = {
  organizationName: string;
  email: string;
  role: string;
  accountExists: boolean;
  orgSwitch: boolean;
  oldOrganizationName: string | null;
  lastAdmin: boolean;
};

type AcceptFieldName = "firstName" | "lastName" | "password";

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [data, setData] = useState<ValidationData | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [orgSwitchConfirmed, setOrgSwitchConfirmed] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<AcceptFieldName, string>>
  >({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError("This invitation is no longer valid");
      setValidating(false);
      return;
    }

    let cancelled = false;

    async function validate() {
      try {
        const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/validate`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (!cancelled) {
            setTokenError(
              body?.message ?? "This invitation is no longer valid"
            );
          }
          return;
        }

        const result: ValidationData = await res.json();
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) {
          setTokenError("Something went wrong. Please try again.");
        }
      } finally {
        if (!cancelled) setValidating(false);
      }
    }

    validate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isNewAccount = data !== null && !data.accountExists;

  const isFormValid = useMemo(() => {
    if (!data) return false;

    if (isNewAccount) {
      const fnValid = validatePersonName(firstName, "First name").isValid;
      const lnValid = validatePersonName(lastName, "Last name").isValid;
      const pwValid = validatePassword(password).isValid;
      if (!fnValid || !lnValid || !pwValid) return false;
    } else {
      if (password.length === 0) return false;
    }

    if (data.orgSwitch && !orgSwitchConfirmed) return false;

    return true;
  }, [data, isNewAccount, firstName, lastName, password, orgSwitchConfirmed]);

  function handleBlur(field: AcceptFieldName) {
    let result;
    if (field === "firstName") {
      result = validatePersonName(firstName, "First name");
    } else if (field === "lastName") {
      result = validatePersonName(lastName, "Last name");
    } else {
      result = validatePassword(password);
    }

    setFieldErrors((prev) => ({
      ...prev,
      [field]: result.isValid ? undefined : result.errorMessage,
    }));
  }

  function handleFieldChange(field: AcceptFieldName, value: string) {
    if (field === "firstName") setFirstName(value);
    else if (field === "lastName") setLastName(value);
    else setPassword(value);

    if (serverError) setServerError(null);
  }

  function validateAll(): boolean {
    if (!isNewAccount) return true;

    const errors: Partial<Record<AcceptFieldName, string>> = {};
    let allValid = true;

    const fnResult = validatePersonName(firstName, "First name");
    if (!fnResult.isValid) {
      errors.firstName = fnResult.errorMessage;
      allValid = false;
    }

    const lnResult = validatePersonName(lastName, "Last name");
    if (!lnResult.isValid) {
      errors.lastName = lnResult.errorMessage;
      allValid = false;
    }

    const pwResult = validatePassword(password);
    if (!pwResult.isValid) {
      errors.password = pwResult.errorMessage;
      allValid = false;
    }

    setFieldErrors(errors);
    return allValid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateAll()) return;

    setLoading(true);
    setServerError(null);

    try {
      const body: Record<string, unknown> = { token, password };

      if (isNewAccount) {
        body.firstName = firstName;
        body.lastName = lastName;
        body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } else {
        body.orgSwitchConfirmed = orgSwitchConfirmed;
      }

      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push("/members");
        return;
      }

      const responseBody = await res.json().catch(() => null);

      if (res.status === 409 && responseBody?.message === "org_switch_confirmation_required") {
        // Update org-switch data if needed
        if (data) {
          setData({
            ...data,
            orgSwitch: true,
            oldOrganizationName: responseBody.oldOrganizationName ?? data.oldOrganizationName,
            lastAdmin: responseBody.lastAdmin ?? data.lastAdmin,
          });
        }
        setLoading(false);
        return;
      }

      if (responseBody?.errors) {
        const newFieldErrors: Partial<Record<AcceptFieldName, string>> = {};
        if (responseBody.errors.firstName)
          newFieldErrors.firstName = responseBody.errors.firstName;
        if (responseBody.errors.lastName)
          newFieldErrors.lastName = responseBody.errors.lastName;
        if (responseBody.errors.password)
          newFieldErrors.password = responseBody.errors.password;
        setFieldErrors(newFieldErrors);
      } else if (responseBody?.message) {
        if (responseBody.message === "Incorrect password") {
          setFieldErrors({ password: responseBody.message });
        } else {
          setServerError(responseBody.message);
        }
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      data-testid="accept-invite-screen"
      className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black"
    >
      <div className="w-full max-w-[480px] rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {validating && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            Validating invitation...
          </p>
        )}

        {tokenError && (
          <p
            data-testid="accept-invite-error"
            className="text-center text-sm text-red-600 dark:text-red-400"
          >
            {tokenError}
          </p>
        )}

        {data && !tokenError && (
          <>
            <h1
              data-testid="accept-invite-org-name"
              className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50"
            >
              You've been invited to join {data.organizationName}
            </h1>
            <p
              data-testid="accept-invite-role"
              className="mb-6 text-sm text-zinc-500 dark:text-zinc-400"
            >
              as a {data.role}
            </p>

            {serverError && (
              <div
                data-testid="accept-invite-error"
                role="alert"
                className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {serverError}
              </div>
            )}

            {!isNewAccount && (
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Welcome back! Enter your password to confirm your identity.
              </p>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {isNewAccount && (
                <>
                  <div className="mb-4">
                    <label
                      htmlFor="accept-first-name"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      First name
                    </label>
                    <input
                      id="accept-first-name"
                      data-testid="accept-first-name-input"
                      type="text"
                      value={firstName}
                      disabled={loading}
                      onChange={(e) =>
                        handleFieldChange("firstName", e.target.value)
                      }
                      onBlur={() => handleBlur("firstName")}
                      aria-invalid={Boolean(fieldErrors.firstName)}
                      className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                        fieldErrors.firstName
                          ? "border-red-400 dark:border-red-700"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    />
                    {fieldErrors.firstName && (
                      <p
                        data-testid="field-error-firstName"
                        role="alert"
                        className="mt-1 text-sm text-red-600 dark:text-red-400"
                      >
                        {fieldErrors.firstName}
                      </p>
                    )}
                  </div>

                  <div className="mb-4">
                    <label
                      htmlFor="accept-last-name"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Last name
                    </label>
                    <input
                      id="accept-last-name"
                      data-testid="accept-last-name-input"
                      type="text"
                      value={lastName}
                      disabled={loading}
                      onChange={(e) =>
                        handleFieldChange("lastName", e.target.value)
                      }
                      onBlur={() => handleBlur("lastName")}
                      aria-invalid={Boolean(fieldErrors.lastName)}
                      className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                        fieldErrors.lastName
                          ? "border-red-400 dark:border-red-700"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    />
                    {fieldErrors.lastName && (
                      <p
                        data-testid="field-error-lastName"
                        role="alert"
                        className="mt-1 text-sm text-red-600 dark:text-red-400"
                      >
                        {fieldErrors.lastName}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="mb-4">
                <label
                  htmlFor="accept-password"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="accept-password"
                    data-testid="accept-password-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    disabled={loading}
                    onChange={(e) =>
                      handleFieldChange("password", e.target.value)
                    }
                    onBlur={() => {
                      if (isNewAccount) handleBlur("password");
                    }}
                    aria-invalid={Boolean(fieldErrors.password)}
                    className={`w-full rounded-md border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                      fieldErrors.password
                        ? "border-red-400 dark:border-red-700"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  />
                  <button
                    type="button"
                    data-testid="accept-password-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p
                    data-testid="field-error-password"
                    role="alert"
                    className="mt-1 text-sm text-red-600 dark:text-red-400"
                  >
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {data.orgSwitch && (
                <>
                  <div
                    data-testid="accept-org-switch-warning"
                    className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    <p>
                      Accepting this invitation will remove you from{" "}
                      {data.oldOrganizationName}. All your data in that
                      organization will be permanently deleted.
                    </p>
                    {data.lastAdmin && (
                      <p className="mt-2">
                        You are the last administrator of{" "}
                        {data.oldOrganizationName}. Leaving will mean that
                        organization has no administrator.
                      </p>
                    )}
                  </div>

                  <label className="mb-4 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      data-testid="accept-org-switch-confirm"
                      checked={orgSwitchConfirmed}
                      onChange={(e) => setOrgSwitchConfirmed(e.target.checked)}
                      disabled={loading}
                      className="rounded border-zinc-300 dark:border-zinc-700"
                    />
                    I understand
                  </label>
                </>
              )}

              <button
                type="submit"
                data-testid="accept-submit-button"
                disabled={!isFormValid || loading}
                className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loading ? "Accepting..." : "Accept invitation"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 4.24A11 11 0 0 1 12 4c7 0 11 7 11 7a13.2 13.2 0 0 1-3.4 3.9M6.1 6.1C3.4 7.9 1 12 1 12s4 7 11 7c1.4 0 2.7-.24 3.9-.66"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
