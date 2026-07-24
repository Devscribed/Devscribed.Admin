'use client';

import { use, useEffect, useState } from 'react';
import { Badge, Card } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

/**
 * Minimal landing screen for spec 01 — it exists so a new admin has somewhere to land
 * and can see they are the organization's sole active admin. Search, the removed
 * filter and the row actions belong to spec 04; the title becomes "Active members"
 * when that lands.
 *
 * The shell has already established the session, so this only fetches the list.
 */
export default function MembersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const response = await fetch(`/api/organizations/${orgId}/members`, {
        credentials: 'same-origin',
      });
      if (cancelled || !response.ok) return;
      setMembers(await response.json());
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return (
    <>
      <PageHeader title="Members" />

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
              <Badge tone={member.status === 'active' ? 'active' : 'inactive'}>
                {member.status}
              </Badge>
            </div>
          ))}
          {members?.length === 0 && (
            <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: 'var(--fs-14)' }}>
              No members found
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
