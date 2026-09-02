'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Modal, Select } from '@/ds';
import { REQUEST_MESSAGES } from '@devscribed/validation';

interface MemberOption {
  id: string;
  fullName: string;
  status: 'active' | 'removed';
}

/**
 * Reassignment (requirement 35): an admin or manager moves an open or answered request
 * to a different member. The event the API writes carries both display names, so the
 * trail stays readable after either member is removed.
 *
 * The addressee is validated exactly as at creation — the same rules, re-run server-side.
 */
export function ReassignRequestModal({
  orgId,
  requestId,
  open,
  currentAssigneeId,
  onClose,
  onReassigned,
}: {
  orgId: string;
  requestId: string;
  open: boolean;
  currentAssigneeId: string | null;
  onClose: () => void;
  onReassigned: () => void;
}) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [assigneeMembershipId, setAssigneeMembershipId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssigneeMembershipId('');
    setError(null);
    setSaving(false);

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/members`, {
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const data = (await response.json()) as { members: MemberOption[] };
        if (!cancelled) {
          setMembers(
            data.members.filter((m) => m.status === 'active' && m.id !== currentAssigneeId),
          );
        }
      } catch {
        // No choices to offer; the server refuses an empty addressee anyway.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, currentAssigneeId]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;
    if (assigneeMembershipId.length === 0) {
      setError(REQUEST_MESSAGES.assigneeInvalid);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/requests/${requestId}/reassign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ assigneeKind: 'member', assigneeMembershipId }),
        },
      );
      if (response.ok) {
        setSaving(false);
        onReassigned();
        onClose();
        return;
      }
      const body = await response.json().catch(() => null);
      setError(
        body?.fields?.assigneeMembershipId ?? body?.message ?? REQUEST_MESSAGES.genericError,
      );
    } catch {
      setError(REQUEST_MESSAGES.genericError);
    }
    setSaving(false);
  }

  return (
    <Modal
      open={open}
      title="Reassign this request"
      onClose={() => {
        if (!saving) onClose();
      }}
      width={440}
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={saving}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="request-reassign-form"
            variant="primary"
            size="lg"
            loading={saving}
            style={{ flex: 1 }}
          >
            {saving ? 'Reassigning' : 'Reassign'}
          </Button>
        </>
      }
    >
      <form id="request-reassign-form" onSubmit={submit} noValidate>
        <Select
          label="For"
          value={assigneeMembershipId}
          placeholder="Choose a person"
          options={members.map((member) => ({ value: member.id, label: member.fullName }))}
          onChange={(value) => {
            setAssigneeMembershipId(value);
            setError(null);
          }}
          error={error ?? undefined}
        />
        {error && (
          <div
            style={{
              fontFamily: 'var(--font-text)',
              fontSize: 'var(--fs-12)',
              color: 'var(--error-500)',
              marginTop: 'var(--sp-2)',
            }}
          >
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
