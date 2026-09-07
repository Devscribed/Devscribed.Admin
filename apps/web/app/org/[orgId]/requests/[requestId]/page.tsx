'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, InfoBanner, TextArea } from '@devscribed/ds';
import { useSession } from '@/layout/session-context';
import { usePendingRequests } from '@/layout/requests-badge-context';
import {
  REQUEST_MESSAGES,
  can,
  isTerminalRequestStatus,
  normalizeRole,
  validateRequestMessageBody,
  type Role,
} from '@devscribed/validation';
import { ACCESS_KIND_LABEL, STATUS_TONE, formatShortDate, statusLabelOf } from '../RequestRow';
import type { RequestDetailData } from '../types';
import { DeclineRequestModal } from './DeclineRequestModal';
import { ReassignRequestModal } from './ReassignRequestModal';
import { RequestHistory } from './RequestHistory';
import { RequestThread } from './RequestThread';

/**
 * One request: the row, the conversation, the trail and the controls.
 *
 * Every control here is *omitted* rather than disabled when the caller cannot use it —
 * a terminal request draws no composer and no action at all, and an addressee never sees
 * Grant, because only the person who asked knows whether the access works. The server
 * decides all of it again on the way in; this only keeps the screen honest.
 *
 * The caller's own membership id comes from the members list (`isSelf`), which every role
 * may read. It is used to draw controls, never to authorize anything.
 */
export default function RequestDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; requestId: string }>;
}) {
  const { orgId, requestId } = use(params);
  const session = useSession();
  const { refresh: refreshBadge } = usePendingRequests();

  // The session carries `Membership.role` verbatim and the database still holds the legacy
  // `member`, which `can()` does not know: `CAPABILITY_MATRIX['member']` is undefined and
  // every capability comes back false. Normalizing first is what makes this screen ask the
  // same question the server answers about the same account, as the list page does.
  //
  // Requests spec 03 REQ-03-017 — the kind first. A client contact holds no role, and a
  // role-keyed helper would answer them as a `viewer`; they are the addressee of every
  // request they can read (REQ-03-034), which is what the controls below are drawn from.
  const isContact = session.principal === 'client';
  const role: Role = normalizeRole(session.role);
  const canViewAll = !isContact && can(role, 'view-all-requests');
  const isAdmin = !isContact && role === 'admin';

  const [detail, setDetail] = useState<RequestDetailData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [myMembershipId, setMyMembershipId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/organizations/${orgId}/requests/${requestId}`, {
        credentials: 'same-origin',
      });
      if (response.ok) {
        setDetail((await response.json()) as RequestDetailData);
        setNotFound(false);
        return;
      }
      if (response.status === 404) setNotFound(true);
    } catch {
      // Leave whatever is on screen; the caller can reload.
    }
  }, [orgId, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // The members list is a staff read, and a client contact is answered 404 there
    // (REQ-03-019), so the request that cannot succeed is not sent. They learn who they
    // are from the principal instead: every request a contact can read is one addressed
    // to them.
    if (isContact) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/members`, {
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const data = (await response.json()) as { members: { id: string; isSelf: boolean }[] };
        const self = data.members.find((m) => m.isSelf);
        if (!cancelled && self) setMyMembershipId(self.id);
      } catch {
        // Without it, only the capability-based controls are drawn — never more.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, isContact]);

  async function act(action: 'answer' | 'grant' | 'cancel'): Promise<void> {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/requests/${requestId}/${action}`,
        { method: 'POST', credentials: 'same-origin' },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setActionError(body?.message ?? REQUEST_MESSAGES.genericError);
      }
    } catch {
      setActionError(REQUEST_MESSAGES.genericError);
    }
    setBusy(false);
    await load();
    await refreshBadge();
  }

  async function sendMessage(): Promise<void> {
    if (busy) return;
    const parsed = validateRequestMessageBody(message);
    if (!parsed.valid) {
      setMessageError(parsed.error);
      return;
    }
    setMessageError(null);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/requests/${requestId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ body: message }),
        },
      );
      if (response.status === 201) {
        setMessage('');
      } else {
        const body = await response.json().catch(() => null);
        setMessageError(body?.fields?.body ?? body?.message ?? REQUEST_MESSAGES.genericError);
      }
    } catch {
      setMessageError(REQUEST_MESSAGES.genericError);
    }
    setBusy(false);
    await load();
  }

  if (notFound) {
    return (
      <div data-testid="request-detail-page">
        <Link href={`/org/${orgId}/requests`} style={backLink}>
          &larr; Requests
        </Link>
        <div style={{ marginTop: 'var(--space-6)', color: 'var(--text-tertiary)' }}>
          This request does not exist.
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div data-testid="request-detail-page">
        <Link href={`/org/${orgId}/requests`} style={backLink}>
          &larr; Requests
        </Link>
      </div>
    );
  }

  const request = detail.request;
  // The tone is a badge decision; the word comes from the one exported map every request
  // surface reads (REQ-02-028), with the closure reason beside it (REQ-02-029).
  const tone = STATUS_TONE[request.status] ?? 'neutral';
  const status = statusLabelOf(request.status);
  const terminal = isTerminalRequestStatus(request.status);
  const isRequester = !isContact && myMembershipId !== null && request.requester.membershipId === myMembershipId;
  // A client contact is the addressee of every request they can read (REQ-03-034), which
  // is how this screen knows it without a members read it would be refused.
  const isAssignee = isContact
    ? true
    : myMembershipId !== null && request.assignee.id === myMembershipId;
  const isParty = isRequester || isAssignee || canViewAll;

  // A control the caller cannot use is not drawn (UI Description, read-only row).
  const showAnswer = !terminal && request.status === 'open' && (isAdmin || isAssignee);
  // REQ-03-032 — the grant control is never drawn for a contact, and the route answers
  // them 403 if it is asked anyway.
  const showGrant = !terminal && !isContact && (isAdmin || isRequester);
  const showDecline = !terminal && (isAdmin || isAssignee);
  const showCancel = !terminal && !isContact && (isAdmin || isRequester);
  // Reassignment moves a request between colleagues. A request addressed to a client
  // contact has no reassign path in this release (requests spec 03, Known Gaps), and the
  // route refuses one, so the control is not drawn on that row either.
  const showReassign = !terminal && canViewAll && request.assignee.kind !== 'client';
  const showComposer = !terminal && isParty;

  return (
    <div data-testid="request-detail-page">
      <Link href={`/org/${orgId}/requests`} style={backLink}>
        &larr; Requests
      </Link>

      <div style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span
                style={{
                  fontFamily: 'var(--font-family-base)',
                  fontSize: 'var(--font-size-s)',
                  color: 'var(--text-secondary)',
                }}
              >
                #{request.number}
              </span>
              <span
                data-testid="request-detail-title"
                style={{
                  fontFamily: 'var(--font-family-base)',
                  fontWeight: 600,
                  fontSize: 'var(--headline-5-size)',
                  color: 'var(--text-primary)',
                }}
              >
                {request.title}
              </span>
              <span style={{ marginLeft: 'auto' }}>
                <Badge status={tone} data-testid="request-detail-status">
                  {status.closure ? `${status.label} · ${status.closure}` : status.label}
                </Badge>
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-1) var(--space-4)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
              }}
            >
              {/* The About line: the snapshot name with a muted archived marker where
                  the catalogue entry has been retired, or the stored type for a request
                  raised before requests spec 02. */}
              {request.topic ? (
                <span data-testid="request-detail-topic">
                  {request.topic.name}
                  {request.topic.status === 'archived' && (
                    <span style={{ color: 'var(--text-tertiary)' }}> (archived)</span>
                  )}
                </span>
              ) : (
                <span>{request.type}</span>
              )}
              {request.accessKind && (
                <span>{ACCESS_KIND_LABEL[request.accessKind] ?? request.accessKind}</span>
              )}
              <span>{request.priority}</span>
              {request.blocking && <span>blocked</span>}
              {request.neededBy && (
                <span>
                  needed by {formatShortDate(request.neededBy)}
                  {request.overdue ? ' (overdue)' : ''}
                </span>
              )}
              {request.project && <span>Project: {request.project.name}</span>}
              <span data-testid="request-detail-assignee">
                To: {request.assignee.displayName ?? 'Unassigned'}
                {/* A client addressee is named with the client they work for, so a
                    requester can tell two contacts of two clients apart. */}
                {request.assignee.clientName && ` · ${request.assignee.clientName}`}
              </span>
              <span>From: {request.requester.displayName}</span>
            </div>

            {request.description && (
              <div
                style={{
                  fontFamily: 'var(--font-family-base)',
                  fontSize: 'var(--font-size-base)',
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {request.description}
              </div>
            )}

            {request.assignee.inactive && (
              <div data-testid="request-detail-assignee-inactive-banner">
                <InfoBanner variant="warning">
                  {request.assignee.kind === 'client'
                    ? // A removed contact's requests are flagged and not reassigned: this
                      // release has no reassign path that accepts a client addressee, so
                      // the banner names who it was for rather than offering an action
                      // that does not exist.
                      `${request.assignee.displayName ?? 'This contact'}${
                        request.assignee.clientName ? ` at ${request.assignee.clientName}` : ''
                      } is no longer an active contact.`
                    : 'The person this request is addressed to is no longer active. Reassign it to someone else.'}
                </InfoBanner>
              </div>
            )}

            {(showAnswer || showGrant || showDecline || showCancel || showReassign) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {showAnswer && (
                  <Button
                    disabled={busy}
                    onClick={() => void act('answer')}
                    data-testid="request-detail-answer-btn"
                  >
                    Answer
                  </Button>
                )}
                {showGrant && (
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => void act('grant')}
                    data-testid="request-detail-grant-btn"
                  >
                    Grant
                  </Button>
                )}
                {showDecline && (
                  <Button
                    disabled={busy}
                    onClick={() => setDeclineOpen(true)}
                    data-testid="request-detail-decline-btn"
                  >
                    Decline
                  </Button>
                )}
                {showCancel && (
                  <Button
                    variant="delete"
                    disabled={busy}
                    onClick={() => void act('cancel')}
                    data-testid="request-detail-cancel-btn"
                  >
                    Cancel
                  </Button>
                )}
                {showReassign && (
                  <Button
                    disabled={busy}
                    onClick={() => setReassignOpen(true)}
                    data-testid="request-detail-reassign-btn"
                  >
                    Reassign
                  </Button>
                )}
              </div>
            )}

            {actionError && (
              <div
                style={{
                  fontFamily: 'var(--font-family-base)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--status-error)',
                }}
              >
                {actionError}
              </div>
            )}
          </div>
        </Card>

        <div style={{ marginTop: 'var(--space-6)' }}>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div style={sectionLabel}>Conversation</div>
              <RequestThread messages={detail.messages} />

              {showComposer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  {/* The system's own multi-line field: its border, focus ring, error
                      treatment and message slot replace the hand-drawn box, and the DS-gaps
                      row this stood on is closed. */}
                  <TextArea
                    value={message}
                    placeholder="Write a message…"
                    onChange={(event) => {
                      setMessage(event.target.value);
                      setMessageError(null);
                    }}
                    data-testid="request-detail-composer"
                    error={messageError ?? undefined}
                    errorId="request-detail-composer-error"
                  />
                  <div>
                    <Button
                      variant="primary"
                      preloader={busy}
                      disabled={busy}
                      onClick={() => void sendMessage()}
                      data-testid="request-detail-composer-submit"
                    >
                      Send
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 'var(--space-6)' }}>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={sectionLabel}>History</div>
              <RequestHistory events={detail.events} />
            </div>
          </Card>
        </div>
      </div>

      <DeclineRequestModal
        orgId={orgId}
        requestId={requestId}
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        onDeclined={() => {
          void load();
          void refreshBadge();
        }}
      />

      <ReassignRequestModal
        orgId={orgId}
        requestId={requestId}
        open={reassignOpen}
        currentAssigneeId={request.assignee.id}
        onClose={() => setReassignOpen(false)}
        onReassigned={() => {
          void load();
          void refreshBadge();
        }}
      />
    </div>
  );
}

const backLink = {
  display: 'inline-block',
  marginBottom: 'var(--space-5)',
  fontFamily: 'var(--font-family-base)',
  fontSize: 'var(--font-size-s)',
  color: 'var(--text-secondary)',
  textDecoration: 'none',
} as const;

const sectionLabel = {
  fontFamily: 'var(--font-family-base)',
  fontSize: 'var(--font-size-xs)',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
} as const;
