'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  AuthLayout,
  Button,
  Checkbox,
  Eye,
  EyeOff,
  IconButton,
  InfoBanner,
  Input,
  Spinner,
} from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
import {
  INVITE_ACCEPT_FIELD_ORDER,
  INVITE_MESSAGES,
  MESSAGES,
  validateFirstName,
  validateInviteAcceptNewAccount,
  validateLastName,
  validatePassword,
  type InviteAcceptField,
} from '@devscribed/validation';

type Phase = 'checking' | 'invalid' | 'form';

interface ValidateData {
  organizationName: string;
  email: string;
  role: string;
  accountExists: boolean;
  orgSwitch: boolean;
  oldOrganizationName: string | null;
  lastAdmin: boolean;
}

type NewAccountValues = Record<InviteAcceptField, string>;
type NewAccountErrors = Partial<Record<InviteAcceptField, string>>;

const EMPTY_NEW_ACCOUNT: NewAccountValues = { firstName: '', lastName: '', password: '' };

const NEW_ACCOUNT_TEST_IDS: Record<InviteAcceptField, string> = {
  firstName: 'accept-first-name-input',
  lastName: 'accept-last-name-input',
  password: 'accept-password-input',
};

const NEW_ACCOUNT_LABELS: Record<InviteAcceptField, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  password: 'Password',
};

const NEW_ACCOUNT_VALIDATORS: Record<
  InviteAcceptField,
  (value: string) => { valid: boolean; error?: string }
> = {
  firstName: validateFirstName,
  lastName: validateLastName,
  password: validatePassword,
};

function detectTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** True for the two "the token itself is dead" messages — everything else is per-field. */
function isTokenLevelMessage(message: string): boolean {
  return message === INVITE_MESSAGES.tokenExpired || message === INVITE_MESSAGES.tokenInvalid;
}

function orgSwitchWarningText(oldOrganizationName: string, lastAdmin: boolean): string {
  const base = `Accepting this invitation will remove you from ${oldOrganizationName}. All your data in that organization will be permanently deleted.`;
  if (!lastAdmin) return base;
  return `${base} You are the last administrator of ${oldOrganizationName}. Leaving will mean that organization has no administrator.`;
}

const backToLogin = (
  <a href="/login" data-testid="accept-back-link" style={{ textDecoration: 'none' }}>
    Back to login
  </a>
);

/**
 * Owns the whole `/accept-invite?token=` screen — token validation, and both the
 * new-account and existing-account accept forms, including the org-switch warning.
 * Belongs to the signed-out set (README): one `AuthLayout`, one 480px card, the card
 * title never changes across the checking/invalid/form phases.
 */
export function AcceptInviteScreen() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [phase, setPhase] = useState<Phase>('checking');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [data, setData] = useState<ValidateData | null>(null);

  // New-account form state.
  const [newValues, setNewValues] = useState<NewAccountValues>(EMPTY_NEW_ACCOUNT);
  const [newErrors, setNewErrors] = useState<NewAccountErrors>({});
  const [revealPassword, setRevealPassword] = useState(false);

  // Existing-account form state.
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [orgSwitchConfirmed, setOrgSwitchConfirmed] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (token.length === 0) {
      setTokenError(INVITE_MESSAGES.tokenInvalid);
      setPhase('invalid');
      return;
    }

    (async () => {
      try {
        const response = await fetch(`/api/invitations/${encodeURIComponent(token)}/validate`, {
          credentials: 'same-origin',
        });
        const body = await response.json().catch(() => null);
        if (cancelled) return;

        if (response.ok && body) {
          setData(body as ValidateData);
          setPhase('form');
        } else {
          setTokenError(body?.message ?? INVITE_MESSAGES.tokenInvalid);
          setPhase('invalid');
        }
      } catch {
        if (!cancelled) {
          setTokenError(MESSAGES.generic);
          setPhase('invalid');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // ----- New-account handlers -----

  const changeNew = (field: InviteAcceptField) => (event: { target: { value: string } }) => {
    setNewValues((prev) => ({ ...prev, [field]: event.target.value }));
    setFormError(null);
  };

  const blurNew = (field: InviteAcceptField) => () => {
    const result = NEW_ACCOUNT_VALIDATORS[field](newValues[field]);
    setNewErrors((prev) => {
      const next = { ...prev };
      if (result.valid) delete next[field];
      else next[field] = result.error!;
      return next;
    });
  };

  const newAccountValid = validateInviteAcceptNewAccount(newValues).valid;

  async function submitNewAccount(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const validation = validateInviteAcceptNewAccount(newValues);
    if (!validation.valid) {
      setNewErrors(validation.errors);
      focusByTestId(NEW_ACCOUNT_TEST_IDS[validation.firstInvalidField!]);
      return;
    }

    setNewErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          token,
          firstName: validation.value.firstName,
          lastName: validation.value.lastName,
          password: validation.value.password,
          timezone: detectTimezone(),
        }),
      });

      if (response.ok) {
        await redirectAfterAccept();
        return;
      }

      const body = await response.json().catch(() => null);
      if (response.status >= 400 && response.status < 500 && body?.errors) {
        setNewErrors(body.errors);
        const first = INVITE_ACCEPT_FIELD_ORDER.find((field) => body.errors[field]);
        if (first) focusByTestId(NEW_ACCOUNT_TEST_IDS[first]);
      } else {
        const message: string = body?.message ?? MESSAGES.generic;
        if (isTokenLevelMessage(message)) {
          setTokenError(message);
          setPhase('invalid');
        } else {
          setFormError(message);
        }
      }
    } catch {
      setFormError(MESSAGES.generic);
    }
    setSubmitting(false);
  }

  // ----- Existing-account handlers -----

  function changeExistingPassword(event: { target: { value: string } }) {
    setPassword(event.target.value);
    setFormError(null);
    setPasswordError(null);
  }

  function blurExistingPassword() {
    if (password.length === 0) setPasswordError(MESSAGES.password.required);
  }

  const existingAccountValid = password.length > 0 && (!data?.orgSwitch || orgSwitchConfirmed);

  async function submitExistingAccount(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (password.length === 0) {
      setPasswordError(MESSAGES.password.required);
      focusByTestId('accept-password-input');
      return;
    }
    if (data?.orgSwitch && !orgSwitchConfirmed) return;

    setPasswordError(null);
    setFormError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          token,
          password,
          orgSwitchConfirmed: data?.orgSwitch ? orgSwitchConfirmed : false,
        }),
      });

      if (response.ok) {
        await redirectAfterAccept();
        return;
      }

      if (response.status === 409) {
        // The account's org membership changed between validate() and this submit (a
        // race, not a client bug) — surface the warning validate() would have returned
        // had it run now, and let the visitor confirm and resubmit.
        const body = await response.json().catch(() => null);
        setData((prev) =>
          prev
            ? {
                ...prev,
                orgSwitch: true,
                oldOrganizationName: body?.oldOrganizationName ?? prev.oldOrganizationName,
                lastAdmin: body?.lastAdmin ?? prev.lastAdmin,
              }
            : prev,
        );
        setOrgSwitchConfirmed(false);
        setSubmitting(false);
        return;
      }

      const body = await response.json().catch(() => null);
      const message: string = body?.message ?? MESSAGES.generic;
      if (isTokenLevelMessage(message)) {
        setTokenError(message);
        setPhase('invalid');
      } else if (message === INVITE_MESSAGES.incorrectPassword) {
        setPasswordError(message);
      } else {
        setFormError(message);
      }
    } catch {
      setFormError(MESSAGES.generic);
    }
    setSubmitting(false);
  }

  /**
   * The API's `POST /api/invitations/accept` returns a bare `redirectTo: "/members"` —
   * there is no route at that path; every signed-in screen lives under
   * `/org/{orgId}/members`, and the response never includes the org id. Resolve it the
   * same way the shell does, via `/api/me`, then land on the real route — the same
   * pattern `LoginForm`/`SignupForm` use for their own post-auth redirect.
   */
  async function redirectAfterAccept(): Promise<void> {
    try {
      const response = await fetch('/api/me', { credentials: 'same-origin' });
      const session = await response.json().catch(() => null);
      if (session?.organization?.id) {
        router.push(`/org/${session.organization.id}/members`);
        router.refresh();
        return;
      }
    } catch {
      // fall through
    }
    router.push('/login');
  }

  if (phase === 'checking') {
    return (
      <AuthLayout title="You're invited" footer={backToLogin}>
        <div
          role="status"
          data-testid="accept-invite-checking"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--sp-5)',
            padding: 'var(--sp-12) 0 var(--sp-10)',
          }}
        >
          <Spinner size={28} style={{ color: 'var(--accent)' }} />
          <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}>
            Checking your invitation…
          </p>
        </div>
      </AuthLayout>
    );
  }

  if (phase === 'invalid') {
    return (
      <AuthLayout title="You're invited" footer={backToLogin}>
        <div data-testid="accept-invite-screen">
          <InfoBanner
            tone="error"
            role="alert"
            aria-live="polite"
            data-testid="accept-invite-error"
          >
            {tokenError}
          </InfoBanner>
        </div>
      </AuthLayout>
    );
  }

  const invite = data!;

  return (
    <AuthLayout title="You're invited" footer={backToLogin}>
      <div data-testid="accept-invite-screen">
        <p
          data-testid="accept-invite-org-name"
          style={{ margin: 0, fontSize: 'var(--fs-15)', color: 'var(--text)' }}
        >
          You&apos;ve been invited to join {invite.organizationName}
        </p>
        <p
          data-testid="accept-invite-role"
          style={{ margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}
        >
          as a {invite.role}
        </p>

        {formError && (
          <div style={{ marginTop: 'var(--sp-8)' }}>
            <InfoBanner
              tone="error"
              role="alert"
              aria-live="polite"
              data-testid="accept-invite-error"
            >
              {formError}
            </InfoBanner>
          </div>
        )}

        {invite.accountExists ? (
          <form
            onSubmit={submitExistingAccount}
            noValidate
            data-testid="accept-form"
            style={{ marginTop: 'var(--sp-8)' }}
          >
            <p
              style={{
                margin: '0 0 var(--sp-7)',
                fontSize: 'var(--fs-14)',
                color: 'var(--text-sub)',
              }}
            >
              Welcome back! Enter your password to confirm your identity.
            </p>

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={changeExistingPassword}
              onBlur={blurExistingPassword}
              readOnly={submitting}
              data-testid="accept-password-input"
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? 'field-error-password' : undefined}
              error={passwordError ? errorNode('password', passwordError) : undefined}
              style={submitting ? { opacity: 0.55 } : undefined}
              wrapperStyle={{ gap: 0 }}
            />

            {invite.orgSwitch && (
              <div style={{ marginTop: 'var(--sp-7)' }}>
                <InfoBanner
                  tone="warning"
                  role="alert"
                  aria-live="polite"
                  data-testid="accept-org-switch-warning"
                >
                  {orgSwitchWarningText(invite.oldOrganizationName ?? '', invite.lastAdmin)}
                </InfoBanner>
                <div style={{ marginTop: 'var(--sp-5)' }}>
                  <Checkbox
                    checked={orgSwitchConfirmed}
                    onChange={setOrgSwitchConfirmed}
                    disabled={submitting}
                    label="I understand"
                    data-testid="accept-org-switch-confirm"
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              disabled={!existingAccountValid}
              data-testid="accept-submit-button"
              style={{ width: '100%', marginTop: 'var(--sp-10)' }}
            >
              {submitting ? 'Accepting' : 'Accept invitation'}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={submitNewAccount}
            noValidate
            data-testid="accept-form"
            style={{ marginTop: 'var(--sp-8)' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}>
              {INVITE_ACCEPT_FIELD_ORDER.map((field) => {
                const message = newErrors[field];
                const shared = {
                  label: NEW_ACCOUNT_LABELS[field],
                  value: newValues[field],
                  onChange: changeNew(field),
                  onBlur: blurNew(field),
                  readOnly: submitting,
                  'data-testid': NEW_ACCOUNT_TEST_IDS[field],
                  'aria-invalid': message ? true : undefined,
                  'aria-describedby': message ? `field-error-${field}` : undefined,
                  error: message ? errorNode(field, message) : undefined,
                  style: submitting ? { opacity: 0.55 } : undefined,
                  wrapperStyle: { gap: 0 },
                };

                return field === 'password' ? (
                  <Input
                    key={field}
                    {...shared}
                    type={revealPassword ? 'text' : 'password'}
                    trailing={
                      <IconButton
                        label={revealPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={revealPassword}
                        active={revealPassword}
                        data-testid="accept-password-toggle"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setRevealPassword((shown) => !shown)}
                      >
                        {revealPassword ? <EyeOff /> : <Eye />}
                      </IconButton>
                    }
                  />
                ) : (
                  <Input key={field} {...shared} type="text" />
                );
              })}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              disabled={!newAccountValid}
              data-testid="accept-submit-button"
              style={{ width: '100%', marginTop: 'var(--sp-10)' }}
            >
              {submitting ? 'Accepting' : 'Accept invitation'}
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
