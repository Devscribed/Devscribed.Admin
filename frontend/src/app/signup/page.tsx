"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  type SignupFieldName,
  validateSignupField,
} from "@/lib/signupValidation";

type FormValues = {
  orgName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

const FIELD_ORDER: SignupFieldName[] = [
  "orgName",
  "firstName",
  "lastName",
  "email",
  "password",
];

const FIELD_LABELS: Record<SignupFieldName, string> = {
  orgName: "Organization name",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  password: "Password",
};

const INITIAL_VALUES: FormValues = {
  orgName: "",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
};

export default function SignupPage() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<Partial<Record<SignupFieldName, string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isFormValid = useMemo(
    () => FIELD_ORDER.every((field) => validateSignupField(field, values[field]).isValid),
    [values],
  );

  function handleChange(field: SignupFieldName, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (serverError) setServerError(null);
  }

  function handleBlur(field: SignupFieldName) {
    const result = validateSignupField(field, values[field]);
    setErrors((prev) => ({ ...prev, [field]: result.isValid ? undefined : result.errorMessage }));
  }

  function validateAll(): boolean {
    const nextErrors: Partial<Record<SignupFieldName, string>> = {};
    let allValid = true;

    for (const field of FIELD_ORDER) {
      const result = validateSignupField(field, values[field]);
      if (!result.isValid) {
        nextErrors[field] = result.errorMessage;
        allValid = false;
      }
    }

    setErrors(nextErrors);
    return allValid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateAll()) return;

    setLoading(true);
    setServerError(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, timezone }),
      });

      if (response.ok) {
        router.push("/members");
        return;
      }

      if (response.status >= 400 && response.status < 500) {
        const body = await response.json().catch(() => null);
        setServerError(body?.message ?? "Something went wrong. Please try again.");
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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-[480px] rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Create your account
        </h1>

        {serverError && (
          <div
            data-testid="signup-error-banner"
            role="alert"
            className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {serverError}
          </div>
        )}

        <form data-testid="signup-form" onSubmit={handleSubmit} noValidate>
          <FormField
            field="orgName"
            label={FIELD_LABELS.orgName}
            type="text"
            value={values.orgName}
            error={errors.orgName}
            disabled={loading}
            testId="signup-org-name-input"
            onChange={handleChange}
            onBlur={handleBlur}
          />
          <FormField
            field="firstName"
            label={FIELD_LABELS.firstName}
            type="text"
            value={values.firstName}
            error={errors.firstName}
            disabled={loading}
            testId="signup-first-name-input"
            onChange={handleChange}
            onBlur={handleBlur}
          />
          <FormField
            field="lastName"
            label={FIELD_LABELS.lastName}
            type="text"
            value={values.lastName}
            error={errors.lastName}
            disabled={loading}
            testId="signup-last-name-input"
            onChange={handleChange}
            onBlur={handleBlur}
          />
          <FormField
            field="email"
            label={FIELD_LABELS.email}
            type="email"
            value={values.email}
            error={errors.email}
            disabled={loading}
            testId="signup-email-input"
            onChange={handleChange}
            onBlur={handleBlur}
          />

          <div className="mb-4">
            <label
              htmlFor="signup-password"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {FIELD_LABELS.password}
            </label>
            <div className="relative">
              <input
                id="signup-password"
                data-testid="signup-password-input"
                type={showPassword ? "text" : "password"}
                value={values.password}
                disabled={loading}
                onChange={(e) => handleChange("password", e.target.value)}
                onBlur={() => handleBlur("password")}
                aria-invalid={Boolean(errors.password)}
                className={`w-full rounded-md border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
                  errors.password
                    ? "border-red-400 dark:border-red-700"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              />
              <button
                type="button"
                data-testid="signup-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.password && (
              <p
                data-testid="field-error-password"
                role="alert"
                className="mt-1 text-sm text-red-600 dark:text-red-400"
              >
                {errors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            data-testid="signup-submit-button"
            disabled={!isFormValid || loading}
            className="mt-2 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href="/login"
            data-testid="signup-login-link"
            className="font-medium text-zinc-900 underline dark:text-zinc-50"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function FormField({
  field,
  label,
  type,
  value,
  error,
  disabled,
  testId,
  onChange,
  onBlur,
}: {
  field: SignupFieldName;
  label: string;
  type: string;
  value: string;
  error?: string;
  disabled: boolean;
  testId: string;
  onChange: (field: SignupFieldName, value: string) => void;
  onBlur: (field: SignupFieldName) => void;
}) {
  return (
    <div className="mb-4">
      <label
        htmlFor={testId}
        className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <input
        id={testId}
        data-testid={testId}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(field, e.target.value)}
        onBlur={() => onBlur(field)}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
          error ? "border-red-400 dark:border-red-700" : "border-zinc-300 dark:border-zinc-700"
        }`}
      />
      {error && (
        <p
          data-testid={`field-error-${field}`}
          role="alert"
          className="mt-1 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
