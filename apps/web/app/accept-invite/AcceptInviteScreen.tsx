'use client';

import Link from 'next/link';
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
  Preloader,
  TextInput,
} from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
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
  <Link href="/login" data-testid="accept-back-link">
    Back to login
  </Link>
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
        // Requests spec 03 REQ-03-015 — a client contact lands on the requests screen,
        // which is the only organization screen they may reach; the members destination
        // would answer them 404. The principal comes from the same read that already
        // resolves the organization.
        const destination = session.principal === 'client' ? 'requests' : 'members';
        router.push(`/org/${session.organization.id}/${destination}`);
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
            gap: 'var(--space-4)',
            padding: 'var(--space-8) 0 var(--space-7)',
          }}
        >
          {/* The system's loader is three pulsing dots at a fixed size, not a sizable arc —
              the page loader is `size=12 margin=7`, which is the default. Same as
              `/reset-password`, which is the screen this one's phases were modelled on. */}
          <Preloader />
          <p style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
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
            variant="error"
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
          style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}
        >
          You&apos;ve been invited to join {invite.organizationName}
        </p>
        <p
          data-testid="accept-invite-role"
          style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
        >
          as a {invite.role}
        </p>

        {formError && (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <InfoBanner
              variant="error"
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
            style={{ marginTop: 'var(--space-6)' }}
          >
            <p
              style={{
                margin: '0 0 var(--space-7)',
                fontSize: 'var(--font-size-s)',
                color: 'var(--text-tertiary)',
              }}
            >
              Welcome back! Enter your password to confirm your identity.
            </p>

            <TextInput
              label="Password"
              type="password"
              value={password}
              onChange={changeExistingPassword}
              onBlur={blurExistingPassword}
              readOnly={submitting}
              data-testid="accept-password-input"
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? 'field-error-password' : undefined}
              error={passwordError ?? undefined}
              errorId="field-error-password"
              style={submitting ? { opacity: 0.55 } : undefined}
            />

            {invite.orgSwitch && (
              <div style={{ marginTop: 'var(--space-7)' }}>
                <InfoBanner
                  variant="warning"
                  role="alert"
                  aria-live="polite"
                  data-testid="accept-org-switch-warning"
                >
                  {orgSwitchWarningText(invite.oldOrganizationName ?? '', invite.lastAdmin)}
                </InfoBanner>
                <div style={{ marginTop: 'var(--space-4)' }}>
                  {/* The system's `Checkbox` is a native input and hands back the event
                      (§79), not the boolean the previous system's did. */}
                  <Checkbox
                    checked={orgSwitchConfirmed}
                    onChange={(event) => setOrgSwitchConfirmed(event.target.checked)}
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
              preloader={submitting}
              disabled={!existingAccountValid}
              data-testid="accept-submit-button"
              style={{ width: '100%', marginTop: 'var(--space-7)' }}
            >
              {submitting ? 'Accepting' : 'Accept invitation'}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={submitNewAccount}
            noValidate
            data-testid="accept-form"
            style={{ marginTop: 'var(--space-6)' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
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
                  // §4 — the field tags its own message, so `field-error-{field}` is the
                  // `aria-describedby` target by construction rather than by a wrapper.
                  error: message,
                  errorId: `field-error-${field}`,
                  style: submitting ? { opacity: 0.55 } : undefined,
                };

                return field === 'password' ? (
                  <TextInput
                    key={field}
                    {...shared}
                    type={revealPassword ? 'text' : 'password'}
                    trailing={
                      <IconButton
                        label={revealPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={revealPassword}
                        active={revealPassword}
                        size={28}
                        data-testid="accept-password-toggle"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setRevealPassword((shown) => !shown)}
                      >
                        {revealPassword ? <EyeOff /> : <Eye />}
                      </IconButton>
                    }
                  />
                ) : (
                  <TextInput key={field} {...shared} type="text" />
                );
              })}
            </div>

            <Button
              type="submit"
              variant="primary"
              preloader={submitting}
              disabled={!newAccountValid}
              data-testid="accept-submit-button"
              style={{ width: '100%', marginTop: 'var(--space-7)' }}
            >
              {submitting ? 'Accepting' : 'Accept invitation'}
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
