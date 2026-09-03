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
 * Which screen the signed-in principal lands on. A client contact is refused the members
 * destination (REQ-03-019), so the kind decides — read from `/api/me`, the endpoint that
 * answers it, exactly as the shell and the accept screen already resolve it. The sign-in
 * response body is not amended for this.
 */
async function landingFor(organizationId: string): Promise<string> {
  try {
    const response = await fetch('/api/me', { credentials: 'same-origin' });
    if (response.ok) {
      const session = await response.json().catch(() => null);
      if (session?.organization?.id === organizationId && session?.principal === 'client') {
        return 'requests';
      }
    }
  } catch {
    // The members destination is what every principal but a contact lands on, and the
    // shell resolves the identity again on arrival.
  }
  return 'members';
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
        router.push(`/org/${organizationId}/${await landingFor(organizationId)}`);
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
