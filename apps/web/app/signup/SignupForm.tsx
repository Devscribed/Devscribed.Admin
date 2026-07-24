'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Eye, EyeOff, IconButton, InfoBanner, Input } from '@/ds';
import {
  FIELD_VALIDATORS,
  MESSAGES,
  SIGNUP_FIELD_ORDER,
  validateSignup,
  type SignupField,
} from '@devscribed/validation';

type Values = Record<SignupField, string>;
type Errors = Partial<Record<SignupField, string>>;

const EMPTY: Values = { orgName: '', firstName: '', lastName: '', email: '', password: '' };

const TEST_IDS: Record<SignupField, string> = {
  orgName: 'signup-org-name-input',
  firstName: 'signup-first-name-input',
  lastName: 'signup-last-name-input',
  email: 'signup-email-input',
  password: 'signup-password-input',
};

const LABELS: Record<SignupField, string> = {
  orgName: 'Organization name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  password: 'Password',
};

const PLACEHOLDERS: Partial<Record<SignupField, string>> = {
  orgName: 'Acme Inc',
  firstName: 'Pat',
  lastName: 'Owner',
  email: 'you@company.com',
};

const passwordHint = (
  <span id="signup-password-hint">At least 8 characters, with one letter and one digit.</span>
) as unknown as string;

/**
 * The DS `Input` renders its `error` prop as the message node but exposes no way to
 * tag that node. It renders whatever node it is handed, so we hand it a span carrying
 * the spec's `field-error-{fieldName}` test id and the `aria-describedby` target.
 * See the design doc's "DS gaps" — a first-class `errorId` prop belongs in the DS.
 */
function errorNode(field: SignupField, message: string) {
  return (
    <span id={`field-error-${field}`} data-testid={`field-error-${field}`}>
      {message}
    </span>
  ) as unknown as string;
}

function detectTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function focusField(field: SignupField): void {
  const input = document.querySelector<HTMLInputElement>(`[data-testid="${TEST_IDS[field]}"]`);
  input?.focus();
}

export function SignupForm() {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);

  const change = (field: SignupField) => (event: { target: { value: string } }) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    // A server error stops applying the moment the visitor edits anything (FR-16).
    setBanner(null);
  };

  const blur = (field: SignupField) => () => {
    const result = FIELD_VALIDATORS[field](values[field]);
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

    const validation = validateSignup(values);
    if (!validation.valid) {
      // Every applicable error at once, focus on the first one, no request (FR-15).
      setErrors(validation.errors);
      focusField(validation.firstInvalidField!);
      return;
    }

    setErrors({});
    setBanner(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...validation.value, timezone: detectTimezone() }),
      });

      if (response.ok) {
        const { organization } = await response.json();
        router.push(`/org/${organization.id}/members`);
        router.refresh();
        return;
      }

      if (response.status >= 400 && response.status < 500) {
        const body = await response.json().catch(() => null);
        setBanner(body?.message ?? MESSAGES.generic);
      } else {
        setBanner(MESSAGES.generic);
      }
    } catch {
      setBanner(MESSAGES.generic);
    }
    setSubmitting(false);
  }

  const fieldProps = (field: SignupField) => {
    const message = errors[field];
    return {
      label: LABELS[field],
      value: values[field],
      placeholder: PLACEHOLDERS[field],
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
    <form onSubmit={submit} noValidate data-testid="signup-form">
      {banner && (
        <div style={{ marginBottom: 'var(--sp-8)' }}>
          <InfoBanner tone="error" role="alert" aria-live="polite" data-testid="signup-error-banner">
            {banner}
          </InfoBanner>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}>
        {SIGNUP_FIELD_ORDER.map((field) =>
          field === 'password' ? (
            <Input
              key={field}
              {...fieldProps(field)}
              type={revealPassword ? 'text' : 'password'}
              // `Input` shows the error *instead of* the hint, so only one of the two
              // ever exists to be described by.
              hint={passwordHint}
              aria-describedby={errors.password ? 'field-error-password' : 'signup-password-hint'}
              trailing={
                <IconButton
                  label={revealPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={revealPassword}
                  active={revealPassword}
                  data-testid="signup-password-toggle"
                  // Keeps focus in the field: the toggle never steals the caret.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setRevealPassword((shown) => !shown)}
                >
                  {revealPassword ? <EyeOff /> : <Eye />}
                </IconButton>
              }
            />
          ) : (
            <Input
              key={field}
              {...fieldProps(field)}
              type={field === 'email' ? 'email' : 'text'}
            />
          ),
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={submitting}
        data-testid="signup-submit-button"
        style={{ width: '100%', marginTop: 'var(--sp-10)' }}
      >
        {submitting ? 'Creating account' : 'Create account'}
      </Button>
    </form>
  );
}
