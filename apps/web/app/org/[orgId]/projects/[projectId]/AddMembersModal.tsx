'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  FormActions,
  Modal,
  Preloader,
  SearchInput,
} from '@devscribed/ds';
import { useToast } from '@/toast';
import { PROJECT_MESSAGES, type Role } from '@devscribed/validation';
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
      data-testid="projects-add-members-modal"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder="Search by name..."
          aria-label="Search members"
          data-testid="projects-member-search"
        />

        <div
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            border: 'var(--border-width-hairline) solid var(--border-subtle)',
            borderRadius: 'var(--radius-l)',
          }}
        >
          {members === null ? (
            <Preloader aria-label="Loading members" />
          ) : filtered.length === 0 ? (
            <EmptyState style={{ padding: 'var(--space-8)' }}>No members found</EmptyState>
          ) : (
            filtered.map((m, i) => {
              const alreadyAdded = assignedIds.has(m.id);
              const checked = alreadyAdded || selected.has(m.id);
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-5)',
                    padding: 'var(--space-4) var(--space-6)',
                    borderTop:
                      i === 0 ? 'none' : 'var(--border-width-hairline) solid var(--border-subtle)',
                    opacity: alreadyAdded ? 0.5 : 1,
                  }}
                >
                  {/* The name is the checkbox's own label now, so the mark repeats it and
                      §93 hides it. It also *has* a label for the first time: the box was
                      previously unlabelled, with an outer `<label>` wrapping the whole row —
                      which made its accessible name the row's entire text. */}
                  <Avatar
                    name={m.fullName}
                    initials={initialsOf(m.fullName)}
                    size={28}
                    decorative
                    data-testid={`projects-member-avatar-${m.id}`}
                  />
                  <Checkbox
                    label={m.fullName}
                    checked={checked}
                    disabled={alreadyAdded}
                    onChange={() => toggle(m.id)}
                    data-testid={`projects-member-checkbox-${m.id}`}
                    wrapperStyle={{ flex: 1, minWidth: 0 }}
                  />
                  {alreadyAdded && (
                    <span
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Already added
                    </span>
                  )}
                  {/* §59 — a role is a label on a person, which is the tone every other
                      screen in this merge settled on for it. */}
                  <Badge status="neutral" size="s" outlined style={{ textTransform: 'capitalize' }}>
                    {m.role as Role}
                  </Badge>
                </div>
              );
            })
          )}
        </div>

        <FormActions>
          <Button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="projects-add-members-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            preloader={submitting}
            disabled={selected.size === 0}
            onClick={() => void submit()}
            data-testid="projects-add-members-btn"
          >
            Add selected ({selected.size})
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}
