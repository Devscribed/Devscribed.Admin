"use client";

import { useCallback, useEffect, useState } from "react";
import {
  validatePersonName,
  validateEmail,
  validatePassword,
} from "@/lib/signupValidation";

type Settings = {
  email: string;
  firstName: string;
  lastName: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  timezone: string;
  firstDayOfWeek: string;
};

const TIMEZONES = [
  "Pacific/Midway",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Caracas",
  "America/Halifax",
  "America/St_Johns",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "Atlantic/Azores",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Helsinki",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const COUNTRY_CODES = [
  { code: "US", label: "+1", flag: "US" },
  { code: "GB", label: "+44", flag: "GB" },
  { code: "CA", label: "+1", flag: "CA" },
  { code: "AU", label: "+61", flag: "AU" },
  { code: "DE", label: "+49", flag: "DE" },
  { code: "FR", label: "+33", flag: "FR" },
  { code: "JP", label: "+81", flag: "JP" },
  { code: "IN", label: "+91", flag: "IN" },
  { code: "BR", label: "+55", flag: "BR" },
  { code: "RU", label: "+7", flag: "RU" },
];

const inputClass = (hasError: boolean) =>
  `w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50 ${
    hasError
      ? "border-red-400 dark:border-red-700"
      : "border-zinc-300 dark:border-zinc-700"
  }`;

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function AccountSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [toast, setToast] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [timezone, setTimezone] = useState("");
  const [firstDayOfWeek, setFirstDayOfWeek] = useState("Monday");

  // Errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Modals
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const resp = await fetch("/api/account/settings");
        if (!resp.ok) return;
        const data: Settings = await resp.json();
        setSettings(data);
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setPhoneCountryCode(data.phoneCountryCode ?? "");
        setPhoneNumber(data.phoneNumber ?? "");
        setTimezone(data.timezone ?? "");
        setFirstDayOfWeek(data.firstDayOfWeek ?? "Monday");
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const validateField = useCallback(
    (field: string, value: string) => {
      let error = "";
      switch (field) {
        case "firstName": {
          const r = validatePersonName(value, "First name");
          if (!r.isValid) error = r.errorMessage!;
          break;
        }
        case "lastName": {
          const r = validatePersonName(value, "Last name");
          if (!r.isValid) error = r.errorMessage!;
          break;
        }
        case "phoneNumber":
          if (value.trim() && !phoneCountryCode.trim()) {
            setFieldErrors((prev) => ({
              ...prev,
              phoneCountryCode: "Select a country code",
            }));
          }
          break;
        case "timezone":
          if (!value.trim()) error = "Timezone is required";
          break;
        case "firstDayOfWeek":
          if (value !== "Monday" && value !== "Sunday")
            error = "Invalid first day of week";
          break;
      }
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (error) next[field] = error;
        else delete next[field];
        return next;
      });
    },
    [phoneCountryCode]
  );

  function handleFieldChange(field: string, value: string) {
    setServerError(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

    switch (field) {
      case "firstName":
        setFirstName(value);
        break;
      case "lastName":
        setLastName(value);
        break;
      case "phoneCountryCode":
        setPhoneCountryCode(value);
        break;
      case "phoneNumber":
        setPhoneNumber(value);
        break;
      case "timezone":
        setTimezone(value);
        break;
      case "firstDayOfWeek":
        setFirstDayOfWeek(value);
        break;
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation
    const errors: Record<string, string> = {};
    const fnResult = validatePersonName(firstName, "First name");
    if (!fnResult.isValid) errors.firstName = fnResult.errorMessage!;
    const lnResult = validatePersonName(lastName, "Last name");
    if (!lnResult.isValid) errors.lastName = lnResult.errorMessage!;
    if (!timezone.trim()) errors.timezone = "Timezone is required";
    if (firstDayOfWeek !== "Monday" && firstDayOfWeek !== "Sunday")
      errors.firstDayOfWeek = "Invalid first day of week";
    if (phoneNumber.trim() && !phoneCountryCode.trim())
      errors.phoneCountryCode = "Select a country code";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setServerError(null);

    try {
      const resp = await fetch("/api/account/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneCountryCode: phoneCountryCode || null,
          phoneNumber: phoneNumber || null,
          timezone,
          firstDayOfWeek,
        }),
      });

      if (resp.ok) {
        setToast(true);
        setTimeout(() => setToast(false), 3000);
        return;
      }

      const body = await resp.json().catch(() => null);
      if (body?.errors) {
        setFieldErrors(body.errors);
      } else {
        setServerError(
          body?.message ?? "Something went wrong. Please try again."
        );
      }
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        data-testid="account-settings"
        className="flex flex-1 items-center justify-center"
      >
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div
      data-testid="account-settings"
      className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black"
    >
      <div className="w-full max-w-[600px]">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Account Settings
        </h1>

        {/* Change email / password buttons */}
        <div className="mb-6 flex gap-3">
          <button
            data-testid="change-email-open-button"
            type="button"
            onClick={() => setShowEmailModal(true)}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Change email
          </button>
          <button
            data-testid="change-password-open-button"
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Change password
          </button>
        </div>

        {/* Server error */}
        {serverError && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {serverError}
          </div>
        )}

        {/* Edit Information form */}
        <form onSubmit={handleSave} noValidate>
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Edit Information
            </h2>

            {/* First name */}
            <div className="mb-4">
              <label htmlFor="edit-first-name" className={labelClass}>
                First name
              </label>
              <input
                id="edit-first-name"
                data-testid="edit-first-name-input"
                type="text"
                value={firstName}
                disabled={saving}
                onChange={(e) =>
                  handleFieldChange("firstName", e.target.value)
                }
                onBlur={() => validateField("firstName", firstName)}
                className={inputClass(!!fieldErrors.firstName)}
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

            {/* Last name */}
            <div className="mb-4">
              <label htmlFor="edit-last-name" className={labelClass}>
                Last name
              </label>
              <input
                id="edit-last-name"
                data-testid="edit-last-name-input"
                type="text"
                value={lastName}
                disabled={saving}
                onChange={(e) =>
                  handleFieldChange("lastName", e.target.value)
                }
                onBlur={() => validateField("lastName", lastName)}
                className={inputClass(!!fieldErrors.lastName)}
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

            {/* Phone country selector */}
            <div className="mb-4">
              <label htmlFor="edit-phone-country" className={labelClass}>
                Country
              </label>
              <select
                id="edit-phone-country"
                data-testid="edit-phone-country-select"
                value={phoneCountryCode}
                disabled={saving}
                onChange={(e) =>
                  handleFieldChange("phoneCountryCode", e.target.value)
                }
                className={inputClass(!!fieldErrors.phoneCountryCode)}
              >
                <option value="">Select country</option>
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.label} ({c.code})
                  </option>
                ))}
              </select>
              {fieldErrors.phoneCountryCode && (
                <p
                  data-testid="field-error-phoneCountryCode"
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {fieldErrors.phoneCountryCode}
                </p>
              )}
            </div>

            {/* Phone number */}
            <div className="mb-4">
              <label htmlFor="edit-phone-number" className={labelClass}>
                Phone number
              </label>
              <input
                id="edit-phone-number"
                data-testid="edit-phone-number-input"
                type="tel"
                value={phoneNumber}
                disabled={saving}
                onChange={(e) =>
                  handleFieldChange("phoneNumber", e.target.value)
                }
                onBlur={() => validateField("phoneNumber", phoneNumber)}
                className={inputClass(!!fieldErrors.phoneNumber)}
              />
              {fieldErrors.phoneNumber && (
                <p
                  data-testid="field-error-phoneNumber"
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {fieldErrors.phoneNumber}
                </p>
              )}
            </div>

            {/* Timezone */}
            <div className="mb-4">
              <label htmlFor="edit-timezone" className={labelClass}>
                Timezone
              </label>
              <select
                id="edit-timezone"
                data-testid="edit-timezone-select"
                value={timezone}
                disabled={saving}
                onChange={(e) =>
                  handleFieldChange("timezone", e.target.value)
                }
                onBlur={() => validateField("timezone", timezone)}
                className={inputClass(!!fieldErrors.timezone)}
              >
                <option value="">Select timezone</option>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              {fieldErrors.timezone && (
                <p
                  data-testid="field-error-timezone"
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {fieldErrors.timezone}
                </p>
              )}
            </div>

            {/* First day of week */}
            <div className="mb-6">
              <label htmlFor="edit-first-day" className={labelClass}>
                First day of week
              </label>
              <select
                id="edit-first-day"
                data-testid="edit-first-day-select"
                value={firstDayOfWeek}
                disabled={saving}
                onChange={(e) =>
                  handleFieldChange("firstDayOfWeek", e.target.value)
                }
                className={inputClass(!!fieldErrors.firstDayOfWeek)}
              >
                <option value="Monday">Monday</option>
                <option value="Sunday">Sunday</option>
              </select>
              {fieldErrors.firstDayOfWeek && (
                <p
                  data-testid="field-error-firstDayOfWeek"
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {fieldErrors.firstDayOfWeek}
                </p>
              )}
            </div>

            <button
              type="submit"
              data-testid="account-save-button"
              disabled={saving}
              className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>

        {/* Toast */}
        {toast && (
          <div
            data-testid="toast-account-saved"
            className="fixed bottom-6 right-6 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-md dark:border-green-800 dark:bg-green-950 dark:text-green-300"
          >
            Settings saved
          </div>
        )}
      </div>

      {/* Change Email Modal */}
      {showEmailModal && (
        <ChangeEmailModal
          currentEmail={settings?.email ?? ""}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}

function ChangeEmailModal({
  currentEmail,
  onClose,
}: {
  currentEmail: string;
  onClose: () => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function handleEmailChange(value: string) {
    setNewEmail(value);
    setFieldError(null);
    setServerError(null);
  }

  function handleBlur() {
    const result = validateEmail(newEmail);
    if (!result.isValid) {
      setFieldError(result.errorMessage!);
    }
  }

  const isEmailValid = (() => {
    const result = validateEmail(newEmail);
    return result.isValid;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateEmail(newEmail);
    if (!result.isValid) {
      setFieldError(result.errorMessage!);
      return;
    }

    setLoading(true);
    setServerError(null);

    try {
      const resp = await fetch("/api/account/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      });

      if (resp.ok) {
        setSuccess(true);
        return;
      }

      const body = await resp.json().catch(() => null);
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
      <div className="w-full max-w-[480px] rounded-lg border border-zinc-200 bg-white p-8 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Change email
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            X
          </button>
        </div>

        {success ? (
          <p
            data-testid="change-email-confirmation-message"
            className="text-sm text-zinc-700 dark:text-zinc-300"
          >
            A confirmation link has been sent to {newEmail}. Please check your
            inbox.
          </p>
        ) : (
          <form
            data-testid="change-email-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Current email: {currentEmail}
            </p>

            {serverError && (
              <div
                data-testid="change-email-error"
                role="alert"
                className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {serverError}
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="change-email-new" className={labelClass}>
                New email address
              </label>
              <input
                id="change-email-new"
                data-testid="change-email-new-input"
                type="email"
                value={newEmail}
                disabled={loading}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={handleBlur}
                className={inputClass(!!fieldError)}
              />
              {fieldError && (
                <p
                  data-testid="field-error-newEmail"
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {fieldError}
                </p>
              )}
            </div>

            <button
              type="submit"
              data-testid="change-email-submit-button"
              disabled={loading || !isEmailValid}
              className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {loading ? "Sending..." : "Send confirmation"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleFieldChange(field: string, value: string) {
    setServerError(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

    switch (field) {
      case "currentPassword":
        setCurrentPassword(value);
        break;
      case "newPassword":
        setNewPassword(value);
        break;
      case "passwordConfirmation":
        setConfirmPassword(value);
        break;
    }
  }

  function handleBlur(field: string) {
    const errors: Record<string, string> = {};
    switch (field) {
      case "currentPassword":
        if (!currentPassword) errors.currentPassword = "Current password is required";
        break;
      case "newPassword": {
        const r = validatePassword(newPassword);
        if (!r.isValid) errors.newPassword = r.errorMessage!;
        break;
      }
      case "passwordConfirmation":
        if (!confirmPassword) {
          errors.passwordConfirmation = "Please confirm your new password";
        } else if (confirmPassword !== newPassword) {
          errors.passwordConfirmation = "Passwords do not match";
        }
        break;
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
    }
  }

  const isValid = (() => {
    if (!currentPassword) return false;
    const pwResult = validatePassword(newPassword);
    if (!pwResult.isValid) return false;
    if (!confirmPassword || confirmPassword !== newPassword) return false;
    return true;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setServerError(null);

    try {
      const resp = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          passwordConfirmation: confirmPassword,
        }),
      });

      if (resp.ok) {
        setSuccess(true);
        return;
      }

      const body = await resp.json().catch(() => null);
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
      <div className="w-full max-w-[480px] rounded-lg border border-zinc-200 bg-white p-8 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Change password
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            X
          </button>
        </div>

        {success ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Your password has been changed.
          </p>
        ) : (
          <form
            data-testid="change-password-form"
            onSubmit={handleSubmit}
            noValidate
          >
            {serverError && (
              <div
                data-testid="change-password-error"
                role="alert"
                className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {serverError}
              </div>
            )}

            {/* Current password */}
            <div className="mb-4">
              <label htmlFor="change-pw-current" className={labelClass}>
                Current password
              </label>
              <input
                id="change-pw-current"
                data-testid="change-password-current-input"
                type="password"
                value={currentPassword}
                disabled={loading}
                onChange={(e) =>
                  handleFieldChange("currentPassword", e.target.value)
                }
                onBlur={() => handleBlur("currentPassword")}
                className={inputClass(!!fieldErrors.currentPassword)}
              />
              {fieldErrors.currentPassword && (
                <p
                  data-testid="field-error-currentPassword"
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {fieldErrors.currentPassword}
                </p>
              )}
            </div>

            {/* New password */}
            <div className="mb-4">
              <label htmlFor="change-pw-new" className={labelClass}>
                New password
              </label>
              <input
                id="change-pw-new"
                data-testid="change-password-new-input"
                type="password"
                value={newPassword}
                disabled={loading}
                onChange={(e) =>
                  handleFieldChange("newPassword", e.target.value)
                }
                onBlur={() => handleBlur("newPassword")}
                className={inputClass(!!fieldErrors.newPassword)}
              />
              {fieldErrors.newPassword && (
                <p
                  data-testid="field-error-newPassword"
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {fieldErrors.newPassword}
                </p>
              )}
            </div>

            {/* Confirm password */}
            <div className="mb-4">
              <label htmlFor="change-pw-confirm" className={labelClass}>
                Confirm new password
              </label>
              <input
                id="change-pw-confirm"
                data-testid="change-password-confirm-input"
                type="password"
                value={confirmPassword}
                disabled={loading}
                onChange={(e) =>
                  handleFieldChange("passwordConfirmation", e.target.value)
                }
                onBlur={() => handleBlur("passwordConfirmation")}
                className={inputClass(!!fieldErrors.passwordConfirmation)}
              />
              {fieldErrors.passwordConfirmation && (
                <p
                  data-testid="field-error-passwordConfirmation"
                  role="alert"
                  className="mt-1 text-sm text-red-600 dark:text-red-400"
                >
                  {fieldErrors.passwordConfirmation}
                </p>
              )}
            </div>

            <button
              type="submit"
              data-testid="change-password-submit-button"
              disabled={loading || !isValid}
              className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {loading ? "Changing..." : "Change password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
