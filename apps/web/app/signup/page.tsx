'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isValidEmail, validateOrgName, validatePassword } from '@devscribed/shared';
import { ApiError, signup } from '../../lib/api';

type Field = 'orgName' | 'firstName' | 'lastName' | 'email' | 'password';

const EMPTY = {
  orgName: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
};

/** Client-side mirror of the server rules (shared validators, single source of truth). */
function computeErrors(values: Record<Field, string>): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};

  const org = validateOrgName(values.orgName);
  if (!org.valid) {
    errors.orgName = org.error;
  }
  if (values.firstName.trim().length === 0) {
    errors.firstName = 'First name is required';
  }
  if (values.lastName.trim().length === 0) {
    errors.lastName = 'Last name is required';
  }
  if (!isValidEmail(values.email)) {
    errors.email = 'Enter a valid email address';
  }
  const password = validatePassword(values.password);
  if (!password.valid) {
    errors.password = password.error;
  }

  return errors;
}

export default function SignupPage() {
  const router = useRouter();
  const [values, setValues] = useState<Record<Field, string>>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clientErrors = useMemo(() => computeErrors(values), [values]);
  const isValid = Object.keys(clientErrors).length === 0;

  function errorFor(field: Field): string | undefined {
    return serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);
  }

  function update(field: Field, value: string): void {
    setValues((prev) => ({ ...prev, [field]: value }));
    setServerErrors((prev) => {
      if (!(field in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function markTouched(field: Field): void {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setTouched({
      orgName: true,
      firstName: true,
      lastName: true,
      email: true,
      password: true,
    });
    if (!isValid) {
      return;
    }

    setSubmitting(true);
    setBanner(null);
    setServerErrors({});
    try {
      await signup(values);
      router.push('/members');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerErrors((err.body.errors ?? {}) as Partial<Record<Field, string>>);
        setBanner(err.body.message ?? 'Signup failed. Please try again.');
      } else {
        setBanner('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="card">
        <h1>Create your organization</h1>
        <p className="subtitle">Sign up and start managing your team.</p>

        {banner && (
          <div className="error-banner" role="alert" data-testid="signup-error-banner">
            {banner}
          </div>
        )}

        <form data-testid="signup-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="orgName">Organization name</label>
            <input
              id="orgName"
              type="text"
              data-testid="signup-org-name-input"
              value={values.orgName}
              onChange={(e) => update('orgName', e.target.value)}
              onBlur={() => markTouched('orgName')}
              autoComplete="organization"
            />
            {errorFor('orgName') && (
              <div className="field-error" data-testid="field-error-orgName">
                {errorFor('orgName')}
              </div>
            )}
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                type="text"
                data-testid="signup-first-name-input"
                value={values.firstName}
                onChange={(e) => update('firstName', e.target.value)}
                onBlur={() => markTouched('firstName')}
                autoComplete="given-name"
              />
              {errorFor('firstName') && (
                <div className="field-error" data-testid="field-error-firstName">
                  {errorFor('firstName')}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                type="text"
                data-testid="signup-last-name-input"
                value={values.lastName}
                onChange={(e) => update('lastName', e.target.value)}
                onBlur={() => markTouched('lastName')}
                autoComplete="family-name"
              />
              {errorFor('lastName') && (
                <div className="field-error" data-testid="field-error-lastName">
                  {errorFor('lastName')}
                </div>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              data-testid="signup-email-input"
              value={values.email}
              onChange={(e) => update('email', e.target.value)}
              onBlur={() => markTouched('email')}
              autoComplete="email"
            />
            {errorFor('email') && (
              <div className="field-error" data-testid="field-error-email">
                {errorFor('email')}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              data-testid="signup-password-input"
              value={values.password}
              onChange={(e) => update('password', e.target.value)}
              onBlur={() => markTouched('password')}
              autoComplete="new-password"
            />
            {errorFor('password') && (
              <div className="field-error" data-testid="field-error-password">
                {errorFor('password')}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            data-testid="signup-submit-button"
            disabled={!isValid || submitting}
          >
            {submitting ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </div>
    </main>
  );
}
