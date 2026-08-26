'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Eye, EyeOff, IconButton, InfoBanner, Input } from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
import {
  AUTH_MESSAGES,
  LOGIN_FIELD_ORDER,
  MESSAGES,
  validateEmail,
  validateLogin,
  validatePasswordPresent,
  type LoginField,
} from '@devscribed/validation';

type Values = Record<LoginField, string>;
type Errors = Partial<Record<LoginField, string>>;

const EMPTY: Values = { email: '', password: '' };

const TEST_IDS: Record<LoginField, string> = {
  email: 'login-email-input',
  password: 'login-password-input',
};

const LABELS: Record<LoginField, string> = { email: 'Email', password: 'Password' };

const VALIDATORS = { email: validateEmail, password: validatePasswordPresent };

/**
 * Deactivation is a state, not a typo — amber says "retrying will not help", where red
 * would invite the visitor to keep guessing. The wording carries the meaning on its
 * own; the tone only reinforces it.
 */
const toneFor = (message: string) =>
  message === AUTH_MESSAGES.deactivated ? ('warning' as const) : ('error' as const);

/**
 * Where to land after signing in.
 *
 * `?next` is set by the app shell when a signed-out visitor opened a deep link — the
 * calendar invite's link to a candidate card is the one that matters (hiring 04 §01.5).
 * It is honoured only when it addresses this account's own organization, which makes it
 * same-origin by construction and refuses `//evil.example` and another organization's
 * route in the same test. Anything else lands on the default screen rather than
 * erroring: a stale link is not worth a failed sign-in.
 *
 * Read from `window` at submit time rather than through `useSearchParams`, which would
 * opt this route out of the static shell for a value only ever needed on the client.
 */
function destination(organizationId: string): string {
  const home = `/org/${organizationId}/members`;
  if (typeof window === 'undefined') return home;

  const next = new URLSearchParams(window.location.search).get('next');
  return next?.startsWith(`/org/${organizationId}/`) ? next : home;
}

export function LoginForm() {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);

  const change = (field: LoginField) => (event: { target: { value: string } }) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    // The server error stops applying the moment the visitor edits anything.
    setBanner(null);
  };

  const blur = (field: LoginField) => () => {
    const result = VALIDATORS[field](values[field]);
    setErrors((prev) => {
      const next = { ...prev };
      if (result.valid) delete next[field];
      else next[field] = result.error;
      return next;
    });
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const validation = validateLogin(values);
    if (!validation.valid) {
      // Every applicable error at once, focus on the first, no request.
      setErrors(validation.errors);
      focusByTestId(TEST_IDS[validation.firstInvalidField!]);
      return;
    }

    setErrors({});
    setBanner(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(validation.value),
      });

      if (response.ok) {
        // The session cookie is httpOnly, so the organization has to come back in the
        // body for the client to know which /org/{id}/… route to land on.
        const { organizationId } = await response.json();
        router.push(destination(organizationId));
        router.refresh();
        return;
      }

      const body = await response.json().catch(() => null);
      setBanner(
        response.status >= 400 && response.status < 500
          ? (body?.message ?? MESSAGES.generic)
          : MESSAGES.generic,
      );
    } catch {
      setBanner(MESSAGES.generic);
    }
    setSubmitting(false);
  }

  const fieldProps = (field: LoginField) => {
    const message = errors[field];
    return {
      label: LABELS[field],
      value: values[field],
      onChange: change(field),
      onBlur: blur(field),
      readOnly: submitting,
      'data-testid': TEST_IDS[field],
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `field-error-${field}` : undefined,
      error: message ? errorNode(field, message) : undefined,
      style: submitting ? { opacity: 0.55 } : undefined,
      wrapperStyle: { gap: 0 },
    };
  };

  return (
    <form onSubmit={submit} noValidate data-testid="login-form">
      {banner && (
        <div style={{ marginBottom: 'var(--sp-8)' }}>
          <InfoBanner
            tone={toneFor(banner)}
            role="alert"
            aria-live="polite"
            data-testid="login-error-message"
          >
            {banner}
          </InfoBanner>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}>
        {LOGIN_FIELD_ORDER.map((field) =>
          field === 'password' ? (
            <div key={field}>
              <Input
                {...fieldProps(field)}
                type={revealPassword ? 'text' : 'password'}
                trailing={
                  <IconButton
                    label={revealPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={revealPassword}
                    active={revealPassword}
                    data-testid="login-password-toggle"
                    // Keeps focus in the field: the toggle never steals the caret.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setRevealPassword((shown) => !shown)}
                  >
                    {revealPassword ? <EyeOff /> : <Eye />}
                  </IconButton>
                }
              />
              <div style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--fs-13)' }}>
                <Link
                  href="/forgot-password"
                  data-testid="login-forgot-link"
                  style={{ textDecoration: 'none' }}
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          ) : (
            <Input key={field} {...fieldProps(field)} type="email" placeholder="you@company.com" />
          ),
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={submitting}
        data-testid="login-submit-button"
        style={{ width: '100%', marginTop: 'var(--sp-10)' }}
      >
        {submitting ? 'Signing in' : 'Sign in'}
      </Button>
    </form>
  );
}
