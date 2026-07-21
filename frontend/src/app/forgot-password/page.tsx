"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setSubmitted(true);
        return;
      }

      const body = await response.json().catch(() => null);
      setError(body?.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-[480px] rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Forgot password
        </h1>

        {submitted ? (
          <div>
            <p
              data-testid="forgot-confirmation-message"
              className="mb-6 text-sm text-zinc-700 dark:text-zinc-300"
            >
              If an account exists, a reset link has been sent.
            </p>
            <Link
              href="/login"
              data-testid="forgot-back-link"
              className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <form data-testid="forgot-form" onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label
                  htmlFor="forgot-email"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Email
                </label>
                <input
                  id="forgot-email"
                  data-testid="forgot-email-input"
                  type="email"
                  value={email}
                  disabled={loading}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>

              <button
                type="submit"
                data-testid="forgot-submit-button"
                disabled={loading}
                className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm">
              <Link
                href="/login"
                data-testid="forgot-back-link"
                className="text-zinc-600 underline dark:text-zinc-400"
              >
                Back to login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
