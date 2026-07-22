'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { AuthLayout, Button, InfoBanner, Input } from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
import { AUTH_MESSAGES, MESSAGES, validateEmail } from '@devscribed/validation';

const EMAIL_TEST_ID = 'forgot-email-input';

const backToLogin = (
  <Link href="/login" data-testid="forgot-back-link" style={{ textDecoration: 'none' }}>
    Back to login
  </Link>
);

/**
 * Owns the whole screen rather than just the form, because the confirmation replaces
 * the subtitle as well as the fields — and the card title has to stay put across both
 * states so the card never jumps.
 */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const shouldFocusEmail = useRef(false);

  const validate = () => {
    const result = validateEmail(email);
    setError(result.valid ? null : result.error);
    return result;
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const result = validate();
    if (!result.valid) {
      focusByTestId(EMAIL_TEST_ID);
      return;
    }

    setBanner(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: result.value }),
      });

      if (response.ok) {
        setConfirmed(true);
        setSubmitting(false);
        return;
      }

      const body = await response.json().catch(() => null);
      setBanner(body?.message ?? MESSAGES.generic);
    } catch {
      setBanner(MESSAGES.generic);
    }
    setSubmitting(false);
  }

  /**
   * The confirmation replaces the form, so a mistyped address would otherwise be a
   * dead end. Purely client-side — no request, and no new token is issued.
   */
  function startOver() {
    setConfirmed(false);
    setEmail('');
    setError(null);
    shouldFocusEmail.current = true;
  }

  if (confirmed) {
    return (
      <AuthLayout title="Forgot your password?" footer={backToLogin}>
        <InfoBanner
          tone="info"
          role="alert"
          aria-live="polite"
          data-testid="forgot-confirmation-message"
        >
          {AUTH_MESSAGES.resetLinkSent}.
        </InfoBanner>
        <p
          style={{
            margin: 'var(--sp-4) 0 0',
            fontSize: 'var(--fs-13)',
            lineHeight: 'var(--lh-normal)',
            color: 'var(--text-muted)',
          }}
        >
          Check your inbox — the link expires in 60 minutes.
        </p>
        <button
          type="button"
          onClick={startOver}
          data-testid="forgot-retry-link"
          style={{
            display: 'inline-block',
            marginTop: 'var(--sp-8)',
            padding: 0,
            border: 'none',
            background: 'none',
            font: 'inherit',
            fontSize: 'var(--fs-13)',
            color: 'var(--accent)',
            cursor: 'pointer',
          }}
        >
          Use a different email
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter the email you sign in with and we'll send you a link."
      footer={backToLogin}
    >
      <form onSubmit={submit} noValidate data-testid="forgot-form">
        {banner && (
          <div style={{ marginBottom: 'var(--sp-8)' }}>
            <InfoBanner tone="error" role="alert" aria-live="polite">
              {banner}
            </InfoBanner>
          </div>
        )}

        <Input
          label="Email"
          type="email"
          placeholder="you@company.com"
          value={email}
          autoFocus={shouldFocusEmail.current}
          onChange={(event: { target: { value: string } }) => setEmail(event.target.value)}
          onBlur={validate}
          readOnly={submitting}
          data-testid={EMAIL_TEST_ID}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'field-error-email' : undefined}
          error={error ? errorNode('email', error) : undefined}
          style={submitting ? { opacity: 0.55 } : undefined}
          wrapperStyle={{ gap: 0 }}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
          data-testid="forgot-submit-button"
          style={{ width: '100%', marginTop: 'var(--sp-10)' }}
        >
          {submitting ? 'Sending' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  );
}
