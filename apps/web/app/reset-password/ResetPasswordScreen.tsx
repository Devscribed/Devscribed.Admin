'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthLayout, Button, Eye, EyeOff, IconButton, InfoBanner, Input, Spinner } from '@/ds';
import { errorNode, focusByTestId, hintNode } from '@/field-error';
import { AUTH_MESSAGES, MESSAGES, validatePassword } from '@devscribed/validation';

type Phase = 'checking' | 'valid' | 'invalid' | 'done';

const PASSWORD_TEST_ID = 'reset-password-input';
const CONFIRM_TEST_ID = 'reset-password-confirm-input';

const backToLogin = (
  <Link href="/login" data-testid="reset-login-link" style={{ textDecoration: 'none' }}>
    Back to login
  </Link>
);

const passwordHint = hintNode(
  'reset-password-hint',
  'At least 8 characters, with one letter and one digit.',
);

export function ResetPasswordScreen() {
  const token = useSearchParams().get('token') ?? '';

  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reveal, setReveal] = useState(false);

  /**
   * Ask before the visitor types: an expired link should say so up front rather than
   * after they have composed a password they will never get to use. The check is
   * read-only, so asking costs the token nothing.
   */
  useEffect(() => {
    let cancelled = false;

    if (token.length === 0) {
      setPhase('invalid');
      return;
    }

    (async () => {
      try {
        const response = await fetch(
          `/api/reset-password/validate?token=${encodeURIComponent(token)}`,
          { credentials: 'same-origin' },
        );
        const body = await response.json().catch(() => null);
        if (!cancelled) setPhase(response.ok && body?.valid ? 'valid' : 'invalid');
      } catch {
        if (!cancelled) setPhase('invalid');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const checkPassword = () => {
    const result = validatePassword(password);
    setPasswordError(result.valid ? null : result.error);
    return result.valid;
  };

  /** Only nags once there is something to compare against. */
  const checkConfirmation = (next = confirmation, base = password) => {
    if (base.length === 0 && next.length === 0) {
      setConfirmError(null);
      return true;
    }
    const matches = next === base;
    setConfirmError(matches ? null : AUTH_MESSAGES.passwordMismatch);
    return matches;
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const passwordOk = checkPassword();
    const confirmationOk = confirmation === password;
    setConfirmError(confirmationOk ? null : AUTH_MESSAGES.passwordMismatch);

    if (!passwordOk || !confirmationOk) {
      focusByTestId(!passwordOk ? PASSWORD_TEST_ID : CONFIRM_TEST_ID);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, password, passwordConfirmation: confirmation }),
      });

      if (response.ok) {
        setPhase('done');
        setSubmitting(false);
        return;
      }

      const body = await response.json().catch(() => null);
      const message: string = body?.message ?? MESSAGES.generic;

      // A token can die between page load and submit; when it does, the form is no
      // longer any use, so the screen drops to the dead-link state.
      if (message === AUTH_MESSAGES.resetTokenInvalid) setPhase('invalid');
      else if (message === AUTH_MESSAGES.passwordMismatch) setConfirmError(message);
      else setPasswordError(message);
    } catch {
      setPasswordError(MESSAGES.generic);
    }
    setSubmitting(false);
  }

  if (phase === 'checking') {
    return (
      <AuthLayout title="Set a new password" footer={backToLogin}>
        <div
          role="status"
          data-testid="reset-checking"
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
            Checking your reset link…
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (phase === 'invalid') {
    return (
      <AuthLayout title="Set a new password" footer={backToLogin}>
        <InfoBanner tone="error" role="alert" aria-live="polite" data-testid="reset-error-message">
          {AUTH_MESSAGES.resetTokenInvalid}
        </InfoBanner>
        <p
          style={{
            margin: 'var(--sp-4) 0 0',
            fontSize: 'var(--fs-13)',
            color: 'var(--text-muted)',
          }}
        >
          Request a new one from the login screen.
        </p>
      </AuthLayout>
    );
  }

  if (phase === 'done') {
    return (
      <AuthLayout title="Set a new password" footer={backToLogin}>
        <InfoBanner
          tone="success"
          role="alert"
          aria-live="polite"
          data-testid="reset-success-message"
        >
          {AUTH_MESSAGES.resetSuccess}.
        </InfoBanner>
        <p
          style={{
            margin: 'var(--sp-4) 0 0',
            fontSize: 'var(--fs-13)',
            lineHeight: 'var(--lh-normal)',
            color: 'var(--text-muted)',
          }}
        >
          You&apos;ve been signed out everywhere else. Sign in with your new password.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" footer={backToLogin}>
      <form onSubmit={submit} noValidate data-testid="reset-form">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}>
          <Input
            label="New password"
            type={reveal ? 'text' : 'password'}
            value={password}
            onChange={(event: { target: { value: string } }) => {
              setPassword(event.target.value);
              // Re-check live, so a mismatch clears the moment the two agree.
              if (confirmError) checkConfirmation(confirmation, event.target.value);
            }}
            onBlur={checkPassword}
            readOnly={submitting}
            data-testid={PASSWORD_TEST_ID}
            hint={passwordHint}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? 'field-error-password' : 'reset-password-hint'}
            error={passwordError ? errorNode('password', passwordError) : undefined}
            style={submitting ? { opacity: 0.55 } : undefined}
            wrapperStyle={{ gap: 0 }}
            trailing={
              <IconButton
                label={reveal ? 'Hide password' : 'Show password'}
                aria-pressed={reveal}
                active={reveal}
                data-testid="reset-password-toggle"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setReveal((shown) => !shown)}
              >
                {reveal ? <EyeOff /> : <Eye />}
              </IconButton>
            }
          />

          {/*
            No reveal toggle here on purpose: if both fields can be read at once, the
            confirmation stops catching the typo it exists to catch.
          */}
          <Input
            label="Confirm password"
            type="password"
            value={confirmation}
            onChange={(event: { target: { value: string } }) => {
              setConfirmation(event.target.value);
              if (confirmError) checkConfirmation(event.target.value);
            }}
            onBlur={() => checkConfirmation()}
            readOnly={submitting}
            data-testid={CONFIRM_TEST_ID}
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? 'field-error-password-confirm' : undefined}
            error={confirmError ? errorNode('password-confirm', confirmError) : undefined}
            style={submitting ? { opacity: 0.55 } : undefined}
            wrapperStyle={{ gap: 0 }}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
          data-testid="reset-submit-button"
          style={{ width: '100%', marginTop: 'var(--sp-10)' }}
        >
          {submitting ? 'Resetting' : 'Reset password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
