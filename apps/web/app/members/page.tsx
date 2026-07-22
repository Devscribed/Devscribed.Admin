'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Card } from '@/ds';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

/**
 * Minimal landing screen for spec 01 — it exists so a new admin has somewhere to
 * land and can see they are the organization's sole active admin. The full Members
 * screen belongs to a later spec.
 */
export default function MembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [orgName, setOrgName] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [meResponse, membersResponse] = await Promise.all([
        fetch('/api/me', { credentials: 'same-origin' }),
        fetch('/api/members', { credentials: 'same-origin' }),
      ]);

      if (membersResponse.status === 401) {
        router.replace('/login');
        return;
      }
      if (cancelled) return;

      setMembers(await membersResponse.json());
      if (meResponse.ok) {
        const me = await meResponse.json();
        setOrgName(me?.organization?.name ?? '');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: 'var(--sp-16) var(--sp-8)' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-22)',
          letterSpacing: '-.2px',
          margin: '0 0 var(--sp-10)',
        }}
        data-testid="members-org-name"
      >
        {orgName || 'Members'}
      </h1>

      <Card title="Members" padded={false}>
        <div data-testid="members-list">
          {members?.map((member) => (
            <div
              key={member.id}
              data-testid={`member-row-${member.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-8)',
                padding: '14px 20px',
                borderTop: '1px solid var(--divider)',
              }}
            >
              <span style={{ flex: 2, fontSize: 'var(--fs-15)' }} data-testid="member-name">
                {member.name}
              </span>
              <span style={{ flex: 2, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
                {member.email}
              </span>
              <span
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-13)',
                  textTransform: 'capitalize',
                }}
                data-testid="member-role"
              >
                {member.role}
              </span>
              <Badge tone={member.status === 'active' ? 'active' : 'inactive'}>{member.status}</Badge>
            </div>
          ))}
          {members?.length === 0 && (
            <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: 'var(--fs-14)' }}>
              No members found
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
