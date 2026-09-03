'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, InfoBanner } from '@/ds';
import { useToast } from '@/toast';
import { CLIENT_MESSAGES } from '@devscribed/validation';
import type { ClientContactRow, ClientContactStatus, ClientContactsResponse } from '../types';
import { InviteContactModal } from './InviteContactModal';

const STATUS_META: Record<
  ClientContactStatus,
  { tone: 'active' | 'inactive' | 'warning'; label: string }
> = {
  active: { tone: 'active', label: 'Active' },
  invited: { tone: 'warning', label: 'Invited' },
  removed: { tone: 'inactive', label: 'Removed' },
};

const DATE_FMT = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short' });

type SectionState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; contacts: ClientContactRow[] };

/**
 * Requests spec 03 — the people at this client who can be addressed a request.
 *
 * Its own read, so the client's own details render immediately with a skeleton here
 * behind them. The invite control sits beside the empty state as well as in the header,
 * because an empty section is exactly where somebody is about to add the first one.
 */
export function ClientContactsSection({
  orgId,
  clientId,
  clientArchived,
}: {
  orgId: string;
  clientId: string;
  clientArchived: boolean;
}) {
  const { showToast } = useToast();
  const [state, setState] = useState<SectionState>({ kind: 'loading' });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/clients/${clientId}/contacts`,
        { credentials: 'same-origin' },
      );
      if (!response.ok) {
        setState({ kind: 'error' });
        return;
      }
      const body = (await response.json()) as ClientContactsResponse;
      setState({ kind: 'ready', contacts: body.contacts });
    } catch {
      setState({ kind: 'error' });
    }
  }, [orgId, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(contact: ClientContactRow): Promise<void> {
    if (removingId) return;
    setRemovingId(contact.id);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/clients/${clientId}/contacts/${contact.id}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        showToast(
          'toast-server-error',
          body?.message ?? CLIENT_MESSAGES.toastServerError,
          'error',
        );
      }
    } catch {
      showToast('toast-server-error', CLIENT_MESSAGES.toastServerError, 'error');
    }
    setRemovingId(null);
    await load();
  }

  const contacts = state.kind === 'ready' ? state.contacts : [];
  const isEmpty = state.kind === 'ready' && contacts.length === 0;

  return (
    <div
      data-testid="client-contacts-section"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--sp-4)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-16)',
            color: 'var(--text)',
            margin: 0,
          }}
        >
          Contacts
        </h2>
        {/* An archived client takes no contacts (REQ-03-010), so the control that would
            only be refused is not drawn. While the section is empty the same control sits
            beside the empty state instead — one control, in the place somebody about to
            add the first contact is looking. */}
        {!clientArchived && !isEmpty && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setInviteOpen(true)}
            data-testid="client-contact-invite-btn"
          >
            + Invite contact
          </Button>
        )}
      </div>

      {state.kind === 'loading' && <ContactsSkeleton />}

      {state.kind === 'error' && (
        <InfoBanner tone="error" role="alert">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--sp-4)',
            }}
          >
            <span>{CLIENT_MESSAGES.errorLoad}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </InfoBanner>
      )}

      {state.kind === 'ready' && contacts.length === 0 && (
        <div
          data-testid="client-contacts-empty-state"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-5)',
            border: 'var(--border-hair) solid var(--divider)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--sp-8)',
            color: 'var(--text-faint)',
            fontSize: 'var(--fs-14)',
          }}
        >
          <span>
            No contacts yet. Invite someone at this client so requests can be addressed to
            them and answered here.
          </span>
          {!clientArchived && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setInviteOpen(true)}
              data-testid="client-contact-invite-btn"
            >
              + Invite contact
            </Button>
          )}
        </div>
      )}

      {state.kind === 'ready' && contacts.length > 0 && (
        <div
          style={{
            border: 'var(--border-hair) solid var(--divider)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {contacts.map((contact, index) => (
            <div
              key={contact.id}
              data-testid={`client-contact-row-${contact.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-5)',
                padding: 'var(--sp-5) var(--sp-6)',
                borderTop: index === 0 ? 'none' : 'var(--border-hair) solid var(--divider)',
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 500,
                  fontSize: 'var(--fs-14)',
                  color: 'var(--text)',
                }}
              >
                {contact.displayName ?? contact.email}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 'var(--fs-13)',
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {contact.email}
              </span>
              <Badge tone={STATUS_META[contact.status].tone}>
                {STATUS_META[contact.status].label}
              </Badge>
              <span style={{ fontSize: 'var(--fs-13)', color: 'var(--text-faint)' }}>
                {contact.joinedAt
                  ? `joined ${DATE_FMT.format(new Date(contact.joinedAt))}`
                  : contact.invitedAt
                    ? `sent ${DATE_FMT.format(new Date(contact.invitedAt))}`
                    : ''}
              </span>
              {/* Drawn while the contact is active: a removed row has nothing to remove,
                  and an invited one has no principal yet. */}
              {contact.status === 'active' && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={removingId === contact.id}
                  disabled={removingId !== null && removingId !== contact.id}
                  onClick={() => void remove(contact)}
                  data-testid={`client-contact-row-${contact.id}-remove-btn`}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <InviteContactModal
        open={inviteOpen}
        orgId={orgId}
        clientId={clientId}
        onClose={() => setInviteOpen(false)}
        onInvited={() => void load()}
      />
    </div>
  );
}

/** Token-coloured blocks, the loading placeholder every other screen here uses. */
function ContactsSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={block('100%', 46)} />
      <div style={block('100%', 46)} />
    </div>
  );
}
