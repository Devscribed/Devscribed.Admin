'use client';

import { useRouter } from 'next/navigation';
import { Badge, Table } from '@/ds';
import type { TableColumn } from '@ds/components/data/Table';
import { MemberRowActions } from './MemberRowActions';
import type { Member } from './types';

/**
 * The real spec-04 member list, built on the DS `Table` (extended with `onRowClick`
 * and per-row `testId` — see this spec's design doc, DS gaps). Columns follow the
 * business spec's wireframe literally: Name, Role, Email, and — admin/manager only —
 * Actions. `About`/`Projects`/`Payment` from the Meridian template's fuller Members
 * mockup belong to specs 05/07/11 and are deliberately not built here.
 */
export function MembersTable({
  orgId,
  members,
  canManage,
  onDeleteRequest,
  onRestore,
}: {
  orgId: string;
  members: Member[];
  canManage: boolean;
  onDeleteRequest: (member: Member) => void;
  onRestore: (member: Member) => void;
}) {
  const router = useRouter();

  const columns: TableColumn<Member>[] = [
    {
      label: 'Name',
      flex: 2.2,
      render: (m) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              borderRadius: '50%',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-12)',
            }}
          >
            {initials(m.fullName)}
          </span>
          <span
            data-testid={`member-name-${m.id}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: 'var(--fs-15)',
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {m.fullName}
            {m.isSelf ? ' (you)' : ''}
          </span>
          {m.status === 'removed' && (
            <Badge tone="inactive" data-testid={`member-status-badge-${m.id}`}>
              Removed
            </Badge>
          )}
        </div>
      ),
    },
    {
      label: 'Role',
      flex: 1,
      render: (m) => (
        <Badge
          tone="info"
          dot={false}
          outline
          data-testid={`member-role-badge-${m.id}`}
          style={{ textTransform: 'capitalize' }}
        >
          {m.role}
        </Badge>
      ),
    },
    {
      label: 'Email',
      flex: 1.8,
      render: (m) => (
        <span
          data-testid={`member-email-${m.id}`}
          style={{
            fontFamily: 'var(--font-text)',
            fontSize: 'var(--fs-14)',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {m.email}
        </span>
      ),
    },
  ];

  if (canManage) {
    columns.push({
      label: 'Actions',
      flex: 0.6,
      align: 'flex-end',
      render: (m) =>
        m.isSelf ? null : (
          <MemberRowActions member={m} onDeleteRequest={onDeleteRequest} onRestore={onRestore} />
        ),
    });
  }

  return (
    <Table
      data-testid="members-list"
      columns={columns}
      rows={members.map((m) => ({ ...m, testId: `member-row-${m.id}` }))}
      onRowClick={(row) => router.push(`/org/${orgId}/members/${row.id}`)}
    />
  );
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
