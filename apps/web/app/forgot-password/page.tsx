'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '../../lib/api';

const NEUTRAL_MESSAGE = 'If an account exists, a reset link has been sent.';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && !submitting;

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      const message = await forgotPassword(email);
      setConfirmation(message || NEUTRAL_MESSAGE);
    } catch {
      // Stay neutral even on failure — never reveal whether the email exists.
      setConfirmation(NEUTRAL_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="card">
        <h1>Reset your password</h1>
        <p className="subtitle">Enter your email and we&apos;ll send you a reset link.</p>

        {confirmation ? (
          <div className="confirmation" data-testid="forgot-confirmation-message">
            {confirmation}
          </div>
        ) : (
          <form data-testid="forgot-form" onSubmit={onSubmit} noValidate>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                data-testid="forgot-email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              data-testid="forgot-submit-button"
              disabled={!canSubmit}
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
