'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Modal, SearchField } from '@/ds';
import { useToast } from '@/toast';
import { PROJECT_MESSAGES, type Role } from '@devscribed/validation';
import { AvatarInitials } from '../../members/[memberId]/AvatarInitials';
import type { Member, MemberListResponse } from '../../members/types';

/** First + last initial of a full name, for the picker avatars. */
function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * The Add Members modal (spec 11 §Add Members modal). Loads every active org member,
 * filters client-side by name, and lets the caller pick the unassigned ones. Already-
 * assigned members render checked + disabled with an "Already added" label. Submitting
 * POSTs `{ membershipIds }`; the server silently skips any already-assigned id.
 */
export function AddMembersModal({
  open,
  orgId,
  projectId,
  assignedIds,
  onClose,
  onAdded,
}: {
  open: boolean;
  orgId: string;
  projectId: string;
  assignedIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { showToast } = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelected(new Set());
    setSubmitting(false);
    setMembers(null);
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/members`, {
          credentials: 'same-origin',
        });
        if (!response.ok) {
          if (!cancelled) setMembers([]);
          return;
        }
        const data = (await response.json()) as MemberListResponse;
        if (!cancelled) setMembers(data.members.filter((m) => m.status === 'active'));
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  const filtered = useMemo(() => {
    if (!members) return [];
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) => m.fullName.toLowerCase().includes(term));
  }, [members, search]);

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(): Promise<void> {
    if (submitting || selected.size === 0) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ membershipIds: [...selected] }),
      });
      if (response.ok) {
        setSubmitting(false);
        onClose();
        showToast('toast-members-added', PROJECT_MESSAGES.toastMembersAdded);
        onAdded();
        return;
      }
      const body = await response.json().catch(() => null);
      showToast('toast-members-added', body?.message ?? PROJECT_MESSAGES.genericError, 'error');
    } catch {
      showToast('toast-members-added', PROJECT_MESSAGES.genericError, 'error');
    }
    setSubmitting(false);
  }

  return (
    <Modal
      open={open}
      title="Add Members"
      onClose={() => {
        if (!submitting) onClose();
      }}
      width={520}
      data-testid="projects-add-members-modal"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={submitting}
            data-testid="projects-add-members-cancel-btn"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={selected.size === 0}
            onClick={() => void submit()}
            data-testid="projects-add-members-btn"
            style={{ flex: 1 }}
          >
            Add selected ({selected.size})
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
        <SearchField
          value={search}
          onChange={(event: { target: { value: string } }) => setSearch(event.target.value)}
          placeholder="Search by name..."
          data-testid="projects-member-search"
        />

        <div
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            border: '1px solid var(--divider)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          {members === null ? (
            <div style={{ padding: 'var(--sp-8)', color: 'var(--text-muted)', fontSize: 'var(--fs-14)' }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 'var(--sp-8)', color: 'var(--text-faint)', fontSize: 'var(--fs-14)' }}>
              No members found
            </div>
          ) : (
            filtered.map((m) => {
              const alreadyAdded = assignedIds.has(m.id);
              const checked = alreadyAdded || selected.has(m.id);
              return (
                <label
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-4)',
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--divider)',
                    cursor: alreadyAdded ? 'not-allowed' : 'pointer',
                    opacity: alreadyAdded ? 0.5 : 1,
                  }}
                >
                  <Checkbox
                    checked={checked}
                    disabled={alreadyAdded}
                    onChange={() => toggle(m.id)}
                    data-testid={`projects-member-checkbox-${m.id}`}
                  />
                  <AvatarInitials
                    fullName={m.fullName}
                    initials={initialsOf(m.fullName)}
                    size={28}
                    data-testid={`projects-member-avatar-${m.id}`}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 500,
                        fontSize: 'var(--fs-14)',
                        color: 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {m.fullName}
                    </span>
                    {alreadyAdded && (
                      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}>
                        Already added
                      </span>
                    )}
                  </div>
                  <Badge tone="info" dot={false} outline style={{ textTransform: 'capitalize' }}>
                    {m.role as Role}
                  </Badge>
                </label>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
