'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthLayout, InfoBanner, Spinner } from '@/ds';
import { ACCOUNT_MESSAGES } from '@devscribed/validation';

type Phase =
  | { kind: 'checking' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

/** The confirm endpoint's success line (business spec — `POST /api/account/confirm-email`). */
const SUCCESS_MESSAGE = 'Your email has been updated';

/**
 * Public email-confirmation screen (spec 06 · Main Flow B, step 8). Matches the
 * `/reset-password` token-screen pattern: an `AuthLayout` card, the token read from the
 * query string, and a one-shot auto-POST on mount. There is no form and no re-submit —
 * the login link appears only in the success body (the business spec is explicit that no
 * login link shows in an error state).
 */
export function ConfirmEmailScreen() {
  const token = useSearchParams().get('token') ?? '';
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;

    // An empty/missing token can never confirm anything — render the invalid-link error
    // directly, exactly as `/reset-password` does, without spending a request.
    if (token.length === 0) {
      setPhase({ kind: 'error', message: ACCOUNT_MESSAGES.confirmationInvalid });
      return;
    }

    (async () => {
      try {
        const response = await fetch('/api/account/confirm-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ token }),
        });
        const body = await response.json().catch(() => null);
        if (cancelled) return;

        if (response.ok) {
          setPhase({ kind: 'success', message: body?.message ?? SUCCESS_MESSAGE });
          return;
        }

        // Match the message against the known set; anything unrecognised falls back to
        // the generic invalid-link message (design — Interactions).
        const message: string = body?.message ?? '';
        const known =
          message === ACCOUNT_MESSAGES.confirmationExpired ||
          message === ACCOUNT_MESSAGES.emailInUse ||
          message === ACCOUNT_MESSAGES.confirmationInvalid;
        setPhase({
          kind: 'error',
          message: known ? message : ACCOUNT_MESSAGES.confirmationInvalid,
        });
      } catch {
        if (!cancelled) {
          setPhase({ kind: 'error', message: ACCOUNT_MESSAGES.confirmationInvalid });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthLayout title="Confirm your email">
      <div data-testid="confirm-email-screen">
        {phase.kind === 'checking' && (
          <div
            role="status"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--sp-5)',
              padding: 'var(--sp-12) 0 var(--sp-10)',
            }}
          >
            <Spinner size={28} style={{ color: 'var(--accent)' }} />
            <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}>
              Confirming your email change…
            </p>
          </div>
        )}

        {phase.kind === 'success' && (
          <>
            <InfoBanner
              tone="success"
              role="alert"
              aria-live="polite"
              data-testid="confirm-email-success-message"
            >
              {phase.message}
            </InfoBanner>
            <div style={{ marginTop: 'var(--sp-7)' }}>
              <Link
                href="/login"
                data-testid="confirm-email-login-link"
                style={{ textDecoration: 'none' }}
              >
                Go to login
              </Link>
            </div>
          </>
        )}

        {phase.kind === 'error' && (
          <InfoBanner
            tone="error"
            role="alert"
            aria-live="polite"
            data-testid="confirm-email-error"
          >
            {phase.message}
          </InfoBanner>
        )}
      </div>
    </AuthLayout>
  );
}
