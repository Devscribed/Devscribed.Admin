'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { validateName, validatePassword } from '@devscribed/shared';
import { acceptInvitation, ApiError, type InvitationInfo, validateInvitation } from '../../lib/api';

type Status = 'validating' | 'invalid' | 'ready';

const INVALID_INVITE = 'This invitation is no longer valid';

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [status, setStatus] = useState<Status>('validating');
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [tokenError, setTokenError] = useState<string>(INVALID_INVITE);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setStatus('invalid');
      return;
    }
    validateInvitation(token)
      .then((data) => {
        if (active) {
          setInfo(data);
          setStatus('ready');
        }
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }
        if (err instanceof ApiError) {
          setTokenError(err.body.message ?? INVALID_INVITE);
        }
        setStatus('invalid');
      });
    return () => {
      active = false;
    };
  }, [token]);

  const newAccount = !!info && !info.accountExists;

  const clientErrors = useMemo<Record<string, string>>(() => {
    if (!newAccount) {
      return {};
    }
    const errors: Record<string, string> = {};
    const first = validateName(firstName, 'First name');
    if (!first.valid) {
      errors.firstName = first.error;
    }
    const last = validateName(lastName, 'Last name');
    if (!last.valid) {
      errors.lastName = last.error;
    }
    const pw = validatePassword(password);
    if (!pw.valid) {
      errors.password = pw.error;
    }
    return errors;
  }, [newAccount, firstName, lastName, password]);

  function fieldError(field: string): string | undefined {
    return serverErrors[field] ?? (touched ? clientErrors[field] : undefined);
  }

  function clearErrors(): void {
    setServerErrors({});
    setFormError(null);
  }

  const canSubmit = (() => {
    if (submitting || !info) {
      return false;
    }
    if (info.orgSwitch && !confirmSwitch) {
      return false;
    }
    if (newAccount) {
      return Object.keys(clientErrors).length === 0;
    }
    return password.length > 0;
  })();

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit || !info) {
      return;
    }
    setSubmitting(true);
    clearErrors();
    try {
      const redirectTo = await acceptInvitation(
        newAccount
          ? { token, firstName, lastName, password, timezone: detectTimezone() }
          : { token, password, orgSwitchConfirmed: confirmSwitch },
      );
      router.push(redirectTo);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body;
        if (body.errors) {
          setServerErrors(body.errors);
        } else if (body.message === 'Incorrect password') {
          setServerErrors({ password: 'Incorrect password' });
        } else if (
          body.message === 'This invitation has expired' ||
          body.message === INVALID_INVITE
        ) {
          setTokenError(body.message);
          setStatus('invalid');
        } else {
          setFormError(body.message ?? 'Something went wrong. Please try again.');
        }
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  if (status === 'validating') {
    return <p className="muted">Validating invitation…</p>;
  }

  if (status === 'invalid' || !info) {
    return (
      <div className="error-banner" role="alert" data-testid="accept-invite-error">
        {tokenError}
      </div>
    );
  }

  return (
    <>
      <h1 data-testid="accept-invite-org-name">
        You&apos;ve been invited to join {info.organizationName}
      </h1>
      <p className="subtitle" data-testid="accept-invite-role">
        as a {info.role}
      </p>

      {formError && (
        <div className="error-banner" role="alert" data-testid="accept-invite-error">
          {formError}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        {newAccount ? (
          <>
            <div className="field">
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                type="text"
                data-testid="accept-first-name-input"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  clearErrors();
                }}
                onBlur={() => setTouched(true)}
                autoComplete="given-name"
              />
              {fieldError('firstName') && (
                <div className="field-error" data-testid="field-error-firstName">
                  {fieldError('firstName')}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                type="text"
                data-testid="accept-last-name-input"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  clearErrors();
                }}
                onBlur={() => setTouched(true)}
                autoComplete="family-name"
              />
              {fieldError('lastName') && (
                <div className="field-error" data-testid="field-error-lastName">
                  {fieldError('lastName')}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="subtitle">Welcome back! Enter your password to confirm your identity.</p>
        )}

        <div className="field">
          <label htmlFor="password">Password</label>
          {newAccount ? (
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                data-testid="accept-password-input"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearErrors();
                }}
                onBlur={() => setTouched(true)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                data-testid="accept-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          ) : (
            <input
              id="password"
              type="password"
              data-testid="accept-password-input"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearErrors();
              }}
              autoComplete="current-password"
            />
          )}
          {fieldError('password') && (
            <div className="field-error" data-testid="field-error-password">
              {fieldError('password')}
            </div>
          )}
        </div>

        {info.orgSwitch && (
          <>
            <div className="warning-banner" data-testid="accept-org-switch-warning">
              Accepting this invitation will remove you from {info.oldOrganizationName}. All your
              data in that organization will be permanently deleted.
              {info.lastAdmin && (
                <>
                  {' '}
                  You are the last administrator of {info.oldOrganizationName}. Leaving will mean
                  that organization has no administrator.
                </>
              )}
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                data-testid="accept-org-switch-confirm"
                checked={confirmSwitch}
                onChange={(e) => setConfirmSwitch(e.target.checked)}
              />
              I understand
            </label>
          </>
        )}

        <button
          type="submit"
          className="btn-primary"
          data-testid="accept-submit-button"
          disabled={!canSubmit}
        >
          {submitting ? 'Accepting…' : 'Accept invitation'}
        </button>
      </form>
    </>
  );
}
