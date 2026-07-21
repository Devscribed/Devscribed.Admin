"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function ConfirmEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function confirmEmail() {
      if (!token.trim()) {
        setError("This confirmation link is no longer valid");
        setLoading(false);
        return;
      }

      try {
        const resp = await fetch("/api/account/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const body = await resp.json().catch(() => null);

        if (resp.ok) {
          setSuccess(true);
        } else {
          setError(
            body?.message ?? "This confirmation link is no longer valid"
          );
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    confirmEmail();
  }, [token]);

  return (
    <div
      data-testid="confirm-email-screen"
      className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black"
    >
      <div className="w-full max-w-[480px] rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Email Confirmation
        </h1>

        {loading && (
          <div className="animate-pulse text-zinc-400">Confirming...</div>
        )}

        {!loading && success && (
          <div>
            <p
              data-testid="confirm-email-success-message"
              className="mb-6 text-sm text-zinc-700 dark:text-zinc-300"
            >
              Your email has been updated.
            </p>
            <Link
              href="/login"
              data-testid="confirm-email-login-link"
              className="text-sm font-medium text-zinc-900 underline dark:text-zinc-50"
            >
              Go to login
            </Link>
          </div>
        )}

        {!loading && error && (
          <p
            data-testid="confirm-email-error"
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense>
      <ConfirmEmailContent />
    </Suspense>
  );
}
