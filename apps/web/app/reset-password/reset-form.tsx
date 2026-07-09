'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { validatePassword } from '@devscribed/shared';
import { ApiError, resetPassword } from '../../lib/api';

export default function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const validationError = useMemo<string | null>(() => {
    const policy = validatePassword(password);
    if (!policy.valid) {
      return policy.error;
    }
    if (confirm !== password) {
      return 'Passwords do not match';
    }
    return null;
  }, [password, confirm]);

  const canSubmit = token.length > 0 && validationError === null && !submitting;

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body.message ?? 'This reset link is invalid.');
      } else {
        setError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1>Reset your password</h1>
        <div className="error-banner" role="alert" data-testid="reset-error-message">
          This reset link is invalid.
        </div>
        <div className="auth-links">
          <Link href="/forgot-password">Request a new link</Link>
        </div>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1>Password updated</h1>
        <div className="confirmation">Your password has been updated. Please sign in.</div>
        <div className="auth-links">
          <Link href="/login">Go to sign in</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Choose a new password</h1>

      {error && (
        <div className="error-banner" role="alert" data-testid="reset-error-message">
          {error}
        </div>
      )}

      <form data-testid="reset-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            data-testid="reset-password-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched(true)}
            autoComplete="new-password"
          />
        </div>

        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type="password"
            data-testid="reset-password-confirm-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setTouched(true)}
            autoComplete="new-password"
          />
          {touched && validationError && (
            <div className="field-error" data-testid="field-error-password">
              {validationError}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn-primary"
          data-testid="reset-submit-button"
          disabled={!canSubmit}
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}
