'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, login } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.push('/members');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body.message ?? 'Invalid email or password');
      } else {
        setError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="card">
        <h1>Sign in</h1>
        <p className="subtitle">Welcome back to Devscribed.Admin.</p>

        {error && (
          <div className="error-banner" role="alert" data-testid="login-error-message">
            {error}
          </div>
        )}

        <form data-testid="login-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              data-testid="login-email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              data-testid="login-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            data-testid="login-submit-button"
            disabled={!canSubmit}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-links">
          <Link href="/forgot-password" data-testid="login-forgot-link">
            Forgot password?
          </Link>
          <Link href="/signup" data-testid="login-signup-link">
            Create an account
          </Link>
        </div>
      </div>
    </main>
  );
}
