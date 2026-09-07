'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Eye, EyeOff, IconButton, InfoBanner, TextInput } from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
import {
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
 *
 * A usable `?next` is answered without asking `/api/me` which screen the principal
 * lands on: the deep link is the answer, and the request would be spent on a value
 * nothing then reads.
 */
async function destination(organizationId: string): Promise<string> {
  if (typeof window !== 'undefined') {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next?.startsWith(`/org/${organizationId}/`)) return next;
  }

  return `/org/${organizationId}/${await landingFor(organizationId)}`;
}

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
        router.push(await destination(organizationId));
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
      id: TEST_IDS[field],
      name: field,
      value: values[field],
      onChange: change(field),
      onBlur: blur(field),
      readOnly: submitting,
      'data-testid': TEST_IDS[field],
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `field-error-${field}` : undefined,
      error: message,
      errorId: `field-error-${field}`,
      style: submitting ? { opacity: 0.55 } : undefined,
    };
  };

  return (
    <form onSubmit={submit} noValidate data-testid="login-form">
      {banner && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          {/*
            A deactivated account used to get its own amber tone, on the reasoning that amber
            says "retrying will not help" where red invites another guess. The system paints one
            banner for anything that went wrong, and the tone was only ever reinforcement —
            the wording carries the meaning on its own, as the note that introduced it said.
          */}
          <InfoBanner
            variant="error"
            role="alert"
            aria-live="polite"
            data-testid="login-error-message"
          >
            {banner}
          </InfoBanner>
        </div>
      )}

      {/*
        20px is the system's own form rhythm, and it is what the error slot needs: TextInput pins the
        message 16px under the field rather than pushing the field below it, so anything under a
        field has to leave that much room. 14px, which is what this gap used to be, does not.
      */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
        {LOGIN_FIELD_ORDER.map((field) =>
          field === 'password' ? (
            <div key={field}>
              <TextInput
                {...fieldProps(field)}
                type={revealPassword ? 'text' : 'password'}
                trailing={
                  <IconButton
                    label={revealPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={revealPassword}
                    active={revealPassword}
                    size={28}
                    data-testid="login-password-toggle"
                    // Keeps focus in the field: the toggle never steals the caret.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setRevealPassword((shown) => !shown)}
                  >
                    {revealPassword ? <EyeOff /> : <Eye />}
                  </IconButton>
                }
              />
              {/* clears the error slot exactly — see the gap note above. */}
              <div style={{ marginTop: 'var(--space-6)', fontSize: 'var(--font-size-s)' }}>
                <Link href="/forgot-password" data-testid="login-forgot-link">
                  Forgot password?
                </Link>
              </div>
            </div>
          ) : (
            <TextInput key={field} {...fieldProps(field)} type="email" placeholder="you@company.com" />
          ),
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        preloader={submitting}
        data-testid="login-submit-button"
        style={{ width: '100%', marginTop: 'var(--space-7)' }}
      >
        {submitting ? 'Signing in' : 'Sign in'}
      </Button>
    </form>
  );
}
