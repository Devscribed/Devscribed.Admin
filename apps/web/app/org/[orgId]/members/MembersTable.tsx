'use client';

import { useRouter } from 'next/navigation';
import { Badge, Table } from '@devscribed/ds';
import type { TableColumn } from '@devscribed/ds';
import { MemberRowActions } from './MemberRowActions';
import type { Member } from './types';

/**
 * The spec-04 member list, on the system's `Table`. Columns follow the business spec's
 * wireframe literally: Name, Role, Email, and — admin/manager only — Actions.
 * `About`/`Projects`/`Payment` from the earlier fuller mockup belong to specs 05/07/11 and
 * are deliberately not built here.
 *
 * Every row is a real anchor (`rowHref`), so a member's card can be middle-clicked and
 * copied; an unmodified click is handed to the router, and a click that landed on the
 * kebab is not a click on the row (§55 — the menu is portaled, so `closest` is what
 * answers that, not a `stopPropagation` the menu could not perform from outside the row).
 *
 * A removed member's row is **not** passed to `disabledRowIds`, though the system offers
 * it: their card is still reachable and still the place a restore is decided from, so
 * greying the row out of reach would take the destination away from the state that needs
 * it most. The `Removed` badge beside the name is what says so.
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
      align: 'flex-start',
      render: (m) => (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            minWidth: 0,
          }}
        >
          <span
            data-testid={`member-name-${m.id}`}
            style={{
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {m.fullName}
            {m.isSelf ? ' (you)' : ''}
          </span>
          {m.status === 'removed' && (
            <Badge status="inactive" size="s" data-testid={`member-status-badge-${m.id}`}>
              Removed
            </Badge>
          )}
        </span>
      ),
    },
    {
      label: 'Role',
      flex: 1,
      render: (m) => (
        // §59 — a role is a label on a person, not a status about them, so it takes the
        // neutral tone rather than a hue that would claim `admin` is going well.
        <Badge
          status="neutral"
          size="s"
          outlined
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
            color: 'var(--text-secondary)',
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

  const detail = (member: Member): string => `/org/${orgId}/members/${member.id}`;

  return (
    <Table<Member>
      data-testid="members-list"
      columns={columns}
      rows={members}
      rowKey="id"
      rowTestId={(m) => `member-row-${m.id}`}
      rowHref={detail}
      onRowClick={(member, event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        if ((event.target as HTMLElement).closest('[data-row-actions]')) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        router.push(detail(member));
      }}
    />
  );
}
