'use client';

import { use, useEffect, useState } from 'react';
import { Badge, Card, EmptyState, Table } from '@devscribed/ds';
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

      {/*
        The table is edge to edge and draws no frame of its own, so the card is what gives it a
        border and what rounds its first and last rows — which is `clip`, left at its default.
        Rows go nowhere yet: the member detail screen is spec 04, so the table is told of no
        destination and its rows keep the default cursor rather than promising one.
      */}
      <Card padded={false}>
        <Table<Member>
          data-testid="members-list"
          rowKey="id"
          rowTestId={(member) => `member-row-${member.id}`}
          columns={[
            {
              label: 'Name',
              flex: 2,
              render: (member) => <span data-testid="member-name">{member.name}</span>,
            },
            { label: 'Email', flex: 2, align: 'flex-start', key: 'email' },
            {
              label: 'Role',
              align: 'flex-start',
              render: (member) => (
                <span data-testid="member-role" style={{ textTransform: 'capitalize' }}>
                  {member.role}
                </span>
              ),
            },
            {
              label: 'Status',
              align: 'flex-end',
              maxWidth: 120,
              render: (member) => (
                <Badge status={member.status === 'active' ? 'active' : 'inactive'}>
                  {member.status}
                </Badge>
              ),
            },
          ]}
          rows={members ?? []}
        />
        {members?.length === 0 && <EmptyState>No members found</EmptyState>}
      </Card>
    </>
  );
}
