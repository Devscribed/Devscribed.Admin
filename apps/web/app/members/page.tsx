'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { assignableRoles, Role, validateEmail } from '@devscribed/shared';
import { ApiError, createInvitation, fetchMembers, logout, type Member } from '../../lib/api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; members: Member[]; canManage: boolean; currentUserRole: string };

function InviteModal({
  currentRole,
  onClose,
  onSent,
}: {
  currentRole: Role;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const roles = assignableRoles(currentRole);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(Role.User);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailCheck = validateEmail(email);
  const canSubmit = emailCheck.valid && !submitting;

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createInvitation(email, role);
      onSent(email);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.body.message ?? 'Failed to send invitation')
          : 'Failed to send invitation',
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Invite member</h2>

        {error && (
          <div className="error-banner" role="alert" data-testid="invite-error-message">
            {error}
          </div>
        )}

        <form data-testid="invite-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="invite-email">Email address</label>
            <input
              id="invite-email"
              type="email"
              data-testid="invite-email-input"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onBlur={() => setTouched(true)}
              autoComplete="off"
            />
            {touched && !emailCheck.valid && (
              <div className="field-error" data-testid="field-error-email">
                {emailCheck.error}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              data-testid="invite-role-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              data-testid="invite-submit-button"
              disabled={!canSubmit}
              style={{ width: 'auto' }}
            >
              {submitting ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MembersPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function load(): void {
    fetchMembers()
      .then((data) =>
        setState({
          status: 'ready',
          members: data.members,
          canManage: data.canManage,
          currentUserRole: data.currentUserRole,
        }),
      )
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
          return;
        }
        setState({ status: 'error', message: 'Failed to load members.' });
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function onLogout(): Promise<void> {
    await logout();
    router.replace('/login');
  }

  function onSent(email: string): void {
    setInviteOpen(false);
    setToast(`Invitation sent to ${email}`);
    load();
  }

  const canManage = state.status === 'ready' && state.canManage;

  return (
    <main className="page">
      <div className="page-header">
        <h1>Active members</h1>
        <div className="header-actions">
          {canManage && (
            <button
              type="button"
              className="btn-primary"
              data-testid="invite-open-button"
              onClick={() => setInviteOpen(true)}
              style={{ width: 'auto' }}
            >
              Invite member
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            data-testid="logout-button"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </div>

      {state.status === 'loading' && <p className="muted">Loading members…</p>}
      {state.status === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <table className="members-table" data-testid="members-list">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {state.members.map((member) => (
              <tr key={member.id} data-testid={`member-row-${member.id}`}>
                <td data-testid={`member-name-${member.id}`}>{member.fullName}</td>
                <td className="muted">{member.email}</td>
                <td>
                  <span className="role-badge" data-testid={`member-role-badge-${member.id}`}>
                    {member.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {inviteOpen && state.status === 'ready' && (
        <InviteModal
          currentRole={state.currentUserRole as Role}
          onClose={() => setInviteOpen(false)}
          onSent={onSent}
        />
      )}

      {toast && (
        <div className="toast" data-testid="toast-invite-sent">
          {toast}
        </div>
      )}
    </main>
  );
}
