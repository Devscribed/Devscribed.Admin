'use client';

import { useState, type FormEvent } from 'react';
import { Button, InfoBanner, Input, Modal, Select } from '@/ds';
import { errorNode } from '@/field-error';
import { useToast } from '@/toast';
import { MESSAGES, ROLE_VALUES, validateEmail, type Role } from '@devscribed/validation';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  user: 'User',
  viewer: 'Viewer',
};

/** Admin sees all four roles; manager sees everything but admin (requirement 4). */
function rolesFor(callerRole: string): Role[] {
  if (callerRole === 'admin') return [...ROLE_VALUES];
  if (callerRole === 'manager') return ROLE_VALUES.filter((role) => role !== 'admin');
  return [];
}

export function InviteModal({
  open,
  callerRole,
  onClose,
  onInvited,
}: {
  open: boolean;
  callerRole: string;
  onClose: () => void;
  onInvited: (email: string) => void;
}) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const roleOptions = rolesFor(callerRole).map((value) => ({ value, label: ROLE_LABELS[value] }));
  // Live, not just on blur — the submit button is disabled-until-valid for this spec
  // (README: spec 03 has not yet adopted the shared "never disabled" CTA rule).
  const emailValid = validateEmail(email).valid;

  function reset() {
    setEmail('');
    setRole('user');
    setEmailError(null);
    setBanner(null);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  function blurEmail() {
    const result = validateEmail(email);
    setEmailError(result.valid ? null : result.error);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const result = validateEmail(email);
    if (!result.valid) {
      setEmailError(result.error);
      return;
    }

    setEmailError(null);
    setBanner(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: result.value, role }),
      });

      if (response.ok) {
        const invitedEmail = result.value;
        setSubmitting(false);
        reset();
        onClose();
        onInvited(invitedEmail);
        showToast('toast-invite-sent', `Invitation sent to ${invitedEmail}`);
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

  return (
    <Modal
      open={open}
      title="Invite member"
      onClose={handleClose}
      width={480}
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleClose}
            disabled={submitting}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="invite-form"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!emailValid}
            data-testid="invite-submit-button"
            style={{ flex: 1 }}
          >
            {submitting ? 'Sending' : 'Send invitation'}
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} noValidate data-testid="invite-form">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}>
          <Input
            label="Email address"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event: { target: { value: string } }) => {
              setEmail(event.target.value);
              // A server error stops applying the moment the visitor edits the email.
              setBanner(null);
            }}
            onBlur={blurEmail}
            readOnly={submitting}
            data-testid="invite-email-input"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? 'field-error-email' : undefined}
            error={emailError ? errorNode('email', emailError) : undefined}
            style={submitting ? { opacity: 0.55 } : undefined}
            wrapperStyle={{ gap: 0 }}
          />

          <Select
            label="Role"
            value={role}
            onChange={(value: string) => setRole(value as Role)}
            options={roleOptions}
            disabled={submitting}
            data-testid="invite-role-select"
          />
        </div>

        {banner && (
          <div style={{ marginTop: 'var(--sp-8)' }}>
            <InfoBanner
              tone="error"
              role="alert"
              aria-live="polite"
              data-testid="invite-error-message"
            >
              {banner}
            </InfoBanner>
          </div>
        )}
      </form>
    </Modal>
  );
}
