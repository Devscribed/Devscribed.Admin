'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, fetchMembers, type Member } from '../../lib/api';

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

  return (
    <main className="page">
      <div className="page-header">
        <h1>Active members</h1>
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
