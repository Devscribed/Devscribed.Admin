'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, InfoBanner, Input, Modal } from '@/ds';
import { errorNode, focusByTestId, hintNode } from '@/field-error';
import {
  ACCOUNT_MESSAGES,
  AUTH_MESSAGES,
  MESSAGES,
  validateChangePassword,
  validateCurrentPassword,
  validatePassword,
  validatePasswordConfirmation,
} from '@devscribed/validation';

const CURRENT_TEST_ID = 'change-password-current-input';
const NEW_TEST_ID = 'change-password-new-input';
const CONFIRM_TEST_ID = 'change-password-confirm-input';

const passwordHint = hintNode(
  'change-password-hint',
  'At least 8 characters, with one letter and one digit.',
);

/** Server messages that name a specific field route to that field's inline error; every
 * other 400 (notably "Current password is incorrect") lands in the form-level banner. */
const NEW_PASSWORD_MESSAGES: readonly string[] = [
  MESSAGES.password.required,
  MESSAGES.password.tooShort,
  MESSAGES.password.tooLong,
  MESSAGES.password.noLetter,
  MESSAGES.password.noDigit,
];

/**
 * Change Password modal (spec 06 · Main Flow C). Three masked fields, no reveal toggle
 * (design doc — the confirm pairing catches the typo the eye cannot, and revealing a
 * live credential on a signed-in screen buys no validation). On success the form is
 * replaced by "Your password has been changed."
 */
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setCurrentError(null);
    setNewError(null);
    setConfirmError(null);
    setBanner(null);
    setSubmitting(false);
    setDone(false);
  }, [open]);

  // Submit enabled only when all three fields pass client-side validation (policy + match).
  const allValid = validateChangePassword({
    currentPassword,
    newPassword,
    passwordConfirmation: confirmation,
  }).valid;

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  const blurCurrent = () => {
    const result = validateCurrentPassword(currentPassword);
    setCurrentError(result.valid ? null : result.error);
  };

  const blurNew = () => {
    const result = validatePassword(newPassword);
    setNewError(result.valid ? null : result.error);
  };

  /** Only nags once the new-password field has something to compare against. */
  const checkConfirmation = (next = confirmation, base = newPassword) => {
    if (base.length === 0 && next.length === 0) {
      setConfirmError(null);
      return;
    }
    const result = validatePasswordConfirmation(base, next);
    setConfirmError(result.valid ? null : result.error);
  };

  /** A server error stops applying the moment any field is edited (requirement 10). */
  const clearBanner = () => setBanner(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const result = validateChangePassword({
      currentPassword,
      newPassword,
      passwordConfirmation: confirmation,
    });

    if (!result.valid) {
      setCurrentError(result.errors.currentPassword ?? null);
      setNewError(result.errors.newPassword ?? null);
      setConfirmError(result.errors.passwordConfirmation ?? null);
      if (result.firstInvalidField === 'currentPassword') focusByTestId(CURRENT_TEST_ID);
      else if (result.firstInvalidField === 'newPassword') focusByTestId(NEW_TEST_ID);
      else if (result.firstInvalidField === 'passwordConfirmation') focusByTestId(CONFIRM_TEST_ID);
      return;
    }

    setCurrentError(null);
    setNewError(null);
    setConfirmError(null);
    setBanner(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          passwordConfirmation: confirmation,
        }),
      });

      if (response.ok) {
        setSubmitting(false);
        setDone(true);
        return;
      }

      if (response.status >= 400 && response.status < 500) {
        const body = await response.json().catch(() => null);
        const message: string = body?.message ?? MESSAGES.generic;
        routeServerMessage(message);
      } else {
        setBanner(MESSAGES.generic);
      }
    } catch {
      setBanner(MESSAGES.generic);
    }
    setSubmitting(false);
  }

  function routeServerMessage(message: string) {
    if (message === ACCOUNT_MESSAGES.currentPasswordRequired) setCurrentError(message);
    else if (NEW_PASSWORD_MESSAGES.includes(message)) setNewError(message);
    else if (message === AUTH_MESSAGES.passwordMismatch || message === ACCOUNT_MESSAGES.confirmPasswordRequired)
      setConfirmError(message);
    else setBanner(message); // "Current password is incorrect" and anything unrecognised.
  }

  if (done) {
    return (
      <Modal
        open={open}
        title="Change password"
        onClose={handleClose}
        width={480}
        actions={
          <Button type="button" variant="primary" size="lg" onClick={handleClose} style={{ flex: 1 }}>
            Close
          </Button>
        }
      >
        <div
          role="alert"
          aria-live="polite"
          style={{ fontSize: 'var(--fs-15)', lineHeight: 'var(--lh-normal)', color: 'var(--text-sub)' }}
        >
          Your password has been changed.
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="Change password"
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
            form="change-password-form"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!allValid}
            data-testid="change-password-submit-button"
            style={{ flex: 1 }}
          >
            {submitting ? 'Saving' : 'Change password'}
          </Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={submit} noValidate data-testid="change-password-form">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}>
          <Input
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(event: { target: { value: string } }) => {
              setCurrentPassword(event.target.value);
              clearBanner();
              if (currentError) setCurrentError(null);
            }}
            onBlur={blurCurrent}
            readOnly={submitting}
            data-testid={CURRENT_TEST_ID}
            aria-invalid={currentError ? true : undefined}
            aria-describedby={currentError ? 'field-error-currentPassword' : undefined}
            error={currentError ? errorNode('currentPassword', currentError) : undefined}
            style={submitting ? { opacity: 0.55 } : undefined}
            wrapperStyle={{ gap: 0 }}
          />

          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(event: { target: { value: string } }) => {
              setNewPassword(event.target.value);
              clearBanner();
              if (newError) setNewError(null);
              // Re-check live, so a mismatch clears the moment the two agree.
              if (confirmError) checkConfirmation(confirmation, event.target.value);
            }}
            onBlur={blurNew}
            readOnly={submitting}
            data-testid={NEW_TEST_ID}
            hint={passwordHint}
            aria-invalid={newError ? true : undefined}
            aria-describedby={newError ? 'field-error-newPassword' : 'change-password-hint'}
            error={newError ? errorNode('newPassword', newError) : undefined}
            style={submitting ? { opacity: 0.55 } : undefined}
            wrapperStyle={{ gap: 0 }}
          />

          <Input
            label="Confirm new password"
            type="password"
            value={confirmation}
            onChange={(event: { target: { value: string } }) => {
              setConfirmation(event.target.value);
              clearBanner();
              if (confirmError) checkConfirmation(event.target.value);
            }}
            onBlur={() => checkConfirmation()}
            readOnly={submitting}
            data-testid={CONFIRM_TEST_ID}
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? 'field-error-passwordConfirmation' : undefined}
            error={confirmError ? errorNode('passwordConfirmation', confirmError) : undefined}
            style={submitting ? { opacity: 0.55 } : undefined}
            wrapperStyle={{ gap: 0 }}
          />
        </div>

        {banner && (
          <div style={{ marginTop: 'var(--sp-8)' }}>
            <InfoBanner tone="error" role="alert" aria-live="polite" data-testid="change-password-error">
              {banner}
            </InfoBanner>
          </div>
        )}
      </form>
    </Modal>
  );
}
