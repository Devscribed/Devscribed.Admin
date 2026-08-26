'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { Button, Card, Checkbox, SearchField } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import { MESSAGES, can, type Role } from '@devscribed/validation';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { InviteModal } from './InviteModal';
import { MembersLoadingSkeleton } from './MembersLoadingSkeleton';
import { MembersTable } from './MembersTable';
import type { Member, MemberListResponse } from './types';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The real spec-04 Members screen — search, the removed filter, the management
 * table, delete/restore. Keeps spec 03's invite modal integration intact (the
 * `invite-open-button` and `InviteModal` composition is unchanged).
 *
 * `callerRole` drives whether the Actions column renders (requirement 11: hiding a
 * control here is a convenience, the server enforces the real boundary). It comes
 * off the freshest `GET /members` response rather than `useSession()` — both agree
 * for the same account, but the API response is the field the business spec names
 * for this purpose.
 */
export default function MembersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const session = useSession();
  const { showToast } = useToast();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);

  const [members, setMembers] = useState<Member[] | null>(null);
  const [callerRole, setCallerRole] = useState<Role>(session.role as Role);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canInvite = can(session.role as Role, 'invite');
  const canManage = can(callerRole, 'delete-restore');

  // Debounced at 300ms (requirement 3 / TC-04-UNIT-06): no request fires until the
  // visitor stops typing. Clearing the box lands here too, restoring the full list.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const query = new URLSearchParams();
    if (debouncedSearch) query.set('search', debouncedSearch);
    if (showRemoved) query.set('showRemoved', 'true');
    const qs = query.toString();

    const response = await fetch(
      `/api/organizations/${orgId}/members${qs ? `?${qs}` : ''}`,
      { credentials: 'same-origin' },
    );
    if (response.ok) {
      const data: MemberListResponse = await response.json();
      setMembers(data.members);
      setCallerRole(data.callerRole);
    }
    setLoading(false);
  }, [orgId, debouncedSearch, showRemoved]);

  // Fires on mount and whenever the debounced search term or the removed filter
  // changes — search and "show removed" compose server-side (requirement 5).
  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/members/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      setDeleteTarget(null);
      if (response.ok) {
        showToast('toast-member-removed', 'Member removed');
      } else {
        const body = await response.json().catch(() => null);
        showToast('toast-member-remove-error', body?.message ?? MESSAGES.generic);
      }
    } catch {
      setDeleteTarget(null);
      showToast('toast-member-remove-error', MESSAGES.generic);
    }
    setDeleting(false);
    // No optimistic update — the list always reflects the server's own answer.
    void load();
  }

  async function restore(member: Member): Promise<void> {
    try {
      const response = await fetch(`/api/organizations/${orgId}/members/${member.id}/restore`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (response.ok) {
        showToast('toast-member-restored', 'Member restored');
      } else {
        const body = await response.json().catch(() => null);
        showToast('toast-member-restore-error', body?.message ?? MESSAGES.generic);
      }
    } catch {
      showToast('toast-member-restore-error', MESSAGES.generic);
    }
    void load();
  }

  const showEmpty = !loading && members !== null && members.length === 0;

  return (
    <>
      <PageHeader
        title="Active members"
        action={
          canInvite ? (
            <Button
              variant="primary"
              onClick={() => setInviteOpen(true)}
              data-testid="invite-open-button"
            >
              Invite member
            </Button>
          ) : undefined
        }
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <SearchField
          value={searchInput}
          onChange={(event: { target: { value: string } }) => setSearchInput(event.target.value)}
          placeholder="Search members..."
          data-testid="members-search-input"
          style={{ width: '100%', maxWidth: 320 }}
        />
        <Checkbox
          checked={showRemoved}
          onChange={setShowRemoved}
          label="Show removed members"
          data-testid="show-removed-checkbox"
        />
      </div>

      {loading || members === null ? (
        <MembersLoadingSkeleton />
      ) : showEmpty ? (
        <Card padded={false}>
          <div
            data-testid="members-empty-state"
            style={{
              padding: '48px 20px',
              textAlign: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-16)',
              color: 'var(--text-faint)',
            }}
          >
            No members found
          </div>
        </Card>
      ) : (
        <MembersTable
          orgId={orgId}
          members={members}
          canManage={canManage}
          onDeleteRequest={setDeleteTarget}
          onRestore={restore}
        />
      )}

      <DeleteConfirmDialog
        member={deleteTarget}
        submitting={deleting}
        onCancel={() => {
          if (deleting) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />

      {canInvite && (
        <InviteModal
          open={inviteOpen}
          callerRole={session.role}
          onClose={() => setInviteOpen(false)}
          onInvited={() => void load()}
        />
      )}
    </>
  );
}
