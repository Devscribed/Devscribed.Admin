"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { validatePassword } from "@/lib/signupValidation";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    passwordConfirm?: string;
  }>({});

  // Validate that a token is present (non-empty)
  useEffect(() => {
    if (!token.trim()) {
      setTokenValid(false);
    } else {
      setTokenValid(true);
    }
  }, [token]);

  const validateFields = useCallback((): boolean => {
    const errors: { password?: string; passwordConfirm?: string } = {};
    let valid = true;

    const passwordResult = validatePassword(password);
    if (!passwordResult.isValid) {
      errors.password = passwordResult.errorMessage;
      valid = false;
    }

    if (password !== passwordConfirm) {
      errors.passwordConfirm = "Passwords do not match";
      valid = false;
    }

    setFieldErrors(errors);
    return valid;
  }, [password, passwordConfirm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateFields()) return;

    setLoading(true);
    setServerError(null);

    try {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          passwordConfirmation: passwordConfirm,
        }),
      });

      if (response.ok) {
        setSuccess(true);
        return;
      }

      const body = await response.json().catch(() => null);
      const message =
        body?.message ?? "Something went wrong. Please try again.";

      // If the server says the token is invalid/expired, switch to invalid token state
      if (message === "This reset link is invalid or has expired") {
        setTokenValid(false);
        return;
      }

      // Check if it's a password policy error
      if (
        message.startsWith("Password must") ||
        message === "Password is required"
      ) {
        setFieldErrors((prev) => ({ ...prev, password: message }));
      } else if (message === "Passwords do not match") {
        setFieldErrors((prev) => ({ ...prev, passwordConfirm: message }));
      } else {
        setServerError(message);
      }
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    setFieldErrors((prev) => ({ ...prev, password: undefined }));
    setServerError(null);
  }

  function handlePasswordConfirmChange(value: string) {
    setPasswordConfirm(value);
    setFieldErrors((prev) => ({ ...prev, passwordConfirm: undefined }));
    setServerError(null);
  }

  // Still checking token
  if (tokenValid === null) {
    return null;
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-[480px] rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Reset password
        </h1>

        {!tokenValid && (
          <div>
            <p
              data-testid="reset-error-message"
              role="alert"
              className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              This reset link is invalid or has expired
            </p>
            <Link
              href="/login"
              data-testid="reset-login-link"
              className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
            >
              Back to login
            </Link>
          </div>
        )}

        {tokenValid && success && (
          <div>
            <p
              data-testid="reset-success-message"
              className="mb-6 text-sm text-zinc-700 dark:text-zinc-300"
            >
              Your password has been reset.
            </p>
            <Link
              href="/login"
              data-testid="reset-login-link"
              className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
            >
              Back to login
            </Link>
          </div>
        )}

        {tokenValid && !success && (
          <>
            {serverError && (
              <div
                data-testid="reset-error-message"
                role="alert"
                className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {serverError}
              </div>
            )}

            <form data-testid="reset-form" onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label
                  htmlFor="reset-password"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  New password
                </label>
                <input
                  id="reset-password"
                  data-testid="reset-password-input"
                  type="password"
                  value={password}
                  disabled={loading}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                    fieldErrors.password
                      ? "border-red-400 dark:border-red-700"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                />
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

              <div className="mb-4">
                <label
                  htmlFor="reset-password-confirm"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Confirm password
                </label>
                <input
                  id="reset-password-confirm"
                  data-testid="reset-password-confirm-input"
                  type="password"
                  value={passwordConfirm}
                  disabled={loading}
                  onChange={(e) => handlePasswordConfirmChange(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.passwordConfirm)}
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                    fieldErrors.passwordConfirm
                      ? "border-red-400 dark:border-red-700"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                />
                {fieldErrors.passwordConfirm && (
                  <p
                    data-testid="field-error-password-confirm"
                    role="alert"
                    className="mt-1 text-sm text-red-600 dark:text-red-400"
                  >
                    {fieldErrors.passwordConfirm}
                  </p>
                )}
              </div>

              <button
                type="submit"
                data-testid="reset-submit-button"
                disabled={loading}
                className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loading ? "Resetting..." : "Reset password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
