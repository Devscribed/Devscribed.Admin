'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { passwordsMatch, validatePassword } from '@devscribed/shared';
import { ApiError, resetPassword, validateResetToken } from '../../lib/api';

const INVALID_LINK = 'This reset link is invalid or has expired';

type Status = 'validating' | 'invalid' | 'ready' | 'success';

export default function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [status, setStatus] = useState<Status>('validating');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setStatus('invalid');
      return;
    }
    validateResetToken(token).then((valid) => {
      if (active) {
        setStatus(valid ? 'ready' : 'invalid');
      }
    });
    return () => {
      active = false;
    };
  }, [token]);

  const policyError = useMemo<string | null>(() => {
    const policy = validatePassword(password);
    return policy.valid ? null : policy.error;
  }, [password]);

  const mismatch = confirm.length > 0 && !passwordsMatch(password, confirm);
  const canSubmit =
    password.length > 0 && policyError === null && passwordsMatch(password, confirm) && !submitting;

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await resetPassword(token, password, confirm);
      setStatus('success');
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.body.message ?? INVALID_LINK);
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  if (status === 'validating') {
    return <p className="muted">Validating reset link…</p>;
  }

  if (status === 'invalid') {
    return (
      <>
        <h1>Reset your password</h1>
        <div className="error-banner" role="alert" data-testid="reset-error-message">
          {INVALID_LINK}
        </div>
        <div className="auth-links">
          <Link href="/login" data-testid="reset-login-link">
            Back to login
          </Link>
        </div>
      </>
    );
  }

  if (status === 'success') {
    return (
      <>
        <h1>Password updated</h1>
        <div className="confirmation" data-testid="reset-success-message">
          Your password has been reset.
        </div>
        <div className="auth-links">
          <Link href="/login" data-testid="reset-login-link">
            Back to login
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Choose a new password</h1>

      {submitError && (
        <div className="error-banner" role="alert" data-testid="reset-error-message">
          {submitError}
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
          {touched && policyError && (
            <div className="field-error" data-testid="field-error-password">
              {policyError}
            </div>
          )}
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
          {mismatch && (
            <div className="field-error" data-testid="field-error-password-confirm">
              Passwords do not match
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn-primary"
          data-testid="reset-submit-button"
          disabled={!canSubmit}
        >
          {submitting ? 'Updating…' : 'Reset password'}
        </button>
      </form>
    </>
  );
}
