'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, fetchMembers, logout, type Member } from '../../lib/api';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; members: Member[] };

export default function MembersPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchMembers()
      .then((data) => {
        if (active) {
          setState({ status: 'ready', members: data.members });
        }
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/signup');
          return;
        }
        setState({ status: 'error', message: 'Failed to load members.' });
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function onLogout(): Promise<void> {
    await logout();
    router.replace('/login');
  }

  return (
    <main className="page">
      <div className="page-header">
        <h1>Active members</h1>
        <button
          type="button"
          className="btn-secondary"
          data-testid="logout-button"
          onClick={onLogout}
        >
          Log out
        </button>
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
    </main>
  );
}
