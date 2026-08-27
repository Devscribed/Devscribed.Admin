'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Select } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { usePendingRequests } from '@/layout/requests-badge-context';
import { useToast } from '@/toast';
import {
  REQUEST_MESSAGES,
  REQUESTS_PAGE_MESSAGES,
  can,
  parseRequestStatusFilter,
  type RequestStatusFilter,
  type Role,
  type VacationRequestStatus,
} from '@devscribed/validation';
import { AvatarInitials } from '../members/[memberId]/AvatarInitials';
import { RejectRequestModal } from '../members/[memberId]/RejectRequestModal';
import { formatCurrency, formatDateRange } from '../members/[memberId]/vacation-format';
import { CancelRequestDialog } from './CancelRequestDialog';
import type { OrgRequest, OrgRequestsResponse } from './types';

/** Payload carries no currency field; USD is the app default (matches VacationPanel). */
const CURRENCY = 'USD';

const FILTER_OPTIONS: { value: RequestStatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

/** Status → DS `Badge` tone + label — spec 09's map, reused unchanged. */
const STATUS_META: Record<
  VacationRequestStatus,
  { tone: 'warning' | 'active' | 'inactive' | 'neutral'; label: string }
> = {
  pending: { tone: 'warning', label: 'Pending' },
  approved: { tone: 'active', label: 'Approved' },
  rejected: { tone: 'inactive', label: 'Rejected' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
};

/**
 * Org-wide Requests page (spec 10). A reviewer-only surface: admin/manager see every
 * vacation request across the organization as a centered card stack, filter by status,
 * and act on each in place. `user`/`viewer` are redirected — the API's 403 is the real
 * boundary, this is just so they never glimpse the frame.
 *
 * After an action, the acted-on card is patched IN PLACE (its status flips, its action
 * buttons update) rather than refetching the filtered list — a full refetch would drop
 * the card from a filtered view (e.g. an approved request no longer matches the Pending
 * filter), but the spec requires the card to update in place. The sidebar badge is the
 * one value refetched from the server (`refreshBadge()`); it is authoritative and any
 * filter change or reload refreshes the whole list from the server.
 */
export default function RequestsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const session = useSession();
  const { showToast } = useToast();
  const { refresh: refreshBadge } = usePendingRequests();

  const canView = can(session.role as Role, 'view-requests');

  const [filter, setFilter] = useState<RequestStatusFilter>('pending');
  const [requests, setRequests] = useState<OrgRequest[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [rejectTarget, setRejectTarget] = useState<OrgRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrgRequest | null>(null);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // user/viewer never see this page — redirect to Members (TC-10-E2E-03). The sidebar
  // row was already omitted for them; this covers direct navigation.
  useEffect(() => {
    if (!canView) router.replace(`/org/${orgId}/members`);
  }, [canView, orgId, router]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/requests?status=${parseRequestStatusFilter(filter)}`,
        { credentials: 'same-origin' },
      );
      if (response.ok) {
        const data = (await response.json()) as OrgRequestsResponse;
        setRequests(data.requests);
      } else {
        setRequests([]);
      }
    } catch {
      setRequests([]);
    }
    setLoading(false);
  }, [orgId, filter]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  /** Update one request's fields in place (keeps the card visible under the active filter). */
  const patchRequest = useCallback((id: string, changes: Partial<OrgRequest>): void => {
    setRequests((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...changes } : r)) : prev));
  }, []);

  async function handleApprove(request: OrgRequest): Promise<void> {
    if (approvingId) return;
    setApprovingId(request.id);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/members/${request.member.membershipId}/vacation/requests/${request.id}/review`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ decision: 'approved' }),
        },
      );
      if (response.ok) {
        showToast('toast-request-approved', REQUEST_MESSAGES.toastApproved);
        patchRequest(request.id, {
          status: 'approved',
          reviewedAt: new Date().toISOString(),
          reviewedBy: session.account.id,
        });
        await refreshBadge();
        return;
      }
      const body = await response.json().catch(() => null);
      showToast('toast-request-approved', body?.message ?? REQUEST_MESSAGES.genericError, 'error');
    } catch {
      showToast('toast-request-approved', REQUEST_MESSAGES.genericError, 'error');
    } finally {
      setApprovingId(null);
    }
  }

  async function handleCancelConfirm(): Promise<void> {
    const request = cancelTarget;
    if (!request || cancelSaving) return;
    setCancelSaving(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/members/${request.member.membershipId}/vacation/requests/${request.id}/cancel`,
        { method: 'PUT', credentials: 'same-origin' },
      );
      if (response.ok) {
        setCancelTarget(null);
        setCancelSaving(false);
        showToast('toast-request-cancelled', REQUEST_MESSAGES.toastCancelledApproved);
        patchRequest(request.id, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelledBy: session.account.id,
        });
        await refreshBadge();
        return;
      }
      const body = await response.json().catch(() => null);
      showToast('toast-request-cancelled', body?.message ?? REQUEST_MESSAGES.genericError, 'error');
    } catch {
      showToast('toast-request-cancelled', REQUEST_MESSAGES.genericError, 'error');
    }
    setCancelSaving(false);
  }

  // Nothing renders for a caller being redirected.
  if (!canView) return null;

  const emptyMessage =
    filter === 'pending'
      ? REQUESTS_PAGE_MESSAGES.emptyPending
      : filter === 'all'
        ? 'No requests.'
        : REQUESTS_PAGE_MESSAGES.emptyOther(filter);

  return (
    <div data-testid="requests-page">
      <PageHeader title="Requests" />

      <div style={{ maxWidth: 700, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 'var(--sp-8)', maxWidth: 220 }}>
          <Select
            value={filter}
            options={FILTER_OPTIONS}
            onChange={(value) => setFilter(parseRequestStatusFilter(value))}
            data-testid="requests-status-filter"
          />
        </div>

        {loading || requests === null ? (
          <RequestsSkeleton />
        ) : requests.length === 0 ? (
          <div
            data-testid="requests-empty-state"
            style={{
              padding: 'var(--sp-12) var(--sp-8)',
              textAlign: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-16)',
              color: 'var(--text-faint)',
            }}
          >
            {emptyMessage}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
            {requests.map((request) => (
              <RequestCard
                key={request.id}
                orgId={orgId}
                request={request}
                approving={approvingId === request.id}
                actionsBusy={approvingId !== null || cancelSaving}
                onApprove={handleApprove}
                onReject={setRejectTarget}
                onCancel={setCancelTarget}
              />
            ))}
          </div>
        )}
      </div>

      <RejectRequestModal
        orgId={orgId}
        memberId={rejectTarget?.member.membershipId ?? ''}
        request={rejectTarget}
        requesterName={
          rejectTarget ? `${rejectTarget.member.firstName} ${rejectTarget.member.lastName}` : null
        }
        onClose={() => setRejectTarget(null)}
        onRejected={(comment) => {
          if (rejectTarget) {
            patchRequest(rejectTarget.id, {
              status: 'rejected',
              reviewerComment: comment || null,
              reviewedAt: new Date().toISOString(),
              reviewedBy: session.account.id,
            });
          }
          void refreshBadge();
        }}
      />

      <CancelRequestDialog
        request={cancelTarget}
        saving={cancelSaving}
        onClose={() => {
          if (!cancelSaving) setCancelTarget(null);
        }}
        onConfirm={() => void handleCancelConfirm()}
      />
    </div>
  );
}

function RequestCard({
  orgId,
  request,
  approving,
  actionsBusy,
  onApprove,
  onReject,
  onCancel,
}: {
  orgId: string;
  request: OrgRequest;
  approving: boolean;
  actionsBusy: boolean;
  onApprove: (request: OrgRequest) => void;
  onReject: (request: OrgRequest) => void;
  onCancel: (request: OrgRequest) => void;
}) {
  const meta = STATUS_META[request.status];
  const fullName = `${request.member.firstName} ${request.member.lastName}`;
  const isPending = request.status === 'pending';
  const isApproved = request.status === 'approved';

  return (
    <Card data-testid={`requests-card-${request.id}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
        {/* Header: avatar + name + status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minWidth: 0 }}>
          <AvatarInitials
            fullName={fullName}
            initials={request.member.initials}
            size={40}
            data-testid={`requests-card-avatar-${request.id}`}
          />
          <Link
            href={`/org/${orgId}/members/${request.member.membershipId}`}
            data-testid={`requests-card-member-name-${request.id}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: 'var(--fs-15)',
              color: 'var(--text)',
              textDecoration: 'none',
              minWidth: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text)')}
          >
            {fullName}
          </Link>
          <div style={{ marginLeft: 'auto' }}>
            <Badge tone={meta.tone} data-testid={`requests-card-status-${request.id}`}>
              {meta.label}
            </Badge>
          </div>
        </div>

        {/* Detail lines */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-2) var(--sp-5)' }}>
          <span
            data-testid={`requests-card-dates-${request.id}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-15)',
              color: 'var(--text)',
            }}
          >
            {formatDateRange(request.startDate, request.endDate)}
          </span>
          <span
            data-testid={`requests-card-days-${request.id}`}
            style={{ fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}
          >
            {request.workingDays} working days
          </span>
          <span
            data-testid={`requests-card-balance-${request.id}`}
            style={{ fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}
          >
            {request.memberBalance.availableDays} days available
          </span>
        </div>

        {/* Deduction chip */}
        <span
          data-testid={`requests-card-deduction-${request.id}`}
          style={{
            alignSelf: 'flex-start',
            border: '1px solid var(--divider)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--sp-2) var(--sp-4)',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-15)',
            color: 'var(--text)',
          }}
        >
          {formatCurrency(request.deductionAmount, CURRENCY)}
        </span>

        {/* Rejected reviewer comment */}
        {request.status === 'rejected' && request.reviewerComment && (
          <div
            data-testid={`requests-card-reviewer-comment-${request.id}`}
            style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--fs-13)', color: 'var(--text-sub)' }}
          >
            &ldquo;{request.reviewerComment}&rdquo;
          </div>
        )}

        {/* Reviewed-by line — payload gives `reviewedBy` as an account id, so the line is
            shown only when a reviewer value is present; graceful when absent. */}
        {request.reviewedAt && request.reviewedBy && (
          <div
            data-testid={`requests-card-reviewed-by-${request.id}`}
            style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--fs-13)', color: 'var(--text-sub)' }}
          >
            Reviewed by {request.reviewedBy}
          </div>
        )}

        {/* Action row */}
        {(isPending || isApproved) && (
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            {isPending && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  loading={approving}
                  disabled={actionsBusy && !approving}
                  onClick={() => onApprove(request)}
                  data-testid={`requests-card-approve-${request.id}`}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actionsBusy}
                  onClick={() => onReject(request)}
                  data-testid={`requests-card-reject-${request.id}`}
                >
                  Reject
                </Button>
              </>
            )}
            {isApproved && (
              <Button
                variant="danger"
                size="sm"
                disabled={actionsBusy}
                onClick={() => onCancel(request)}
                data-testid={`requests-card-cancel-${request.id}`}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Static token-colored card-shaped blocks — the app ships no skeleton primitive, matching
 * spec 05/09's loading placeholders. */
function RequestsSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <div
      data-testid="requests-loading-skeleton"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}
    >
      {[0, 1].map((i) => (
        <Card key={i}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
              <div style={block(40, 40, 20)} />
              <div style={block(160, 16)} />
            </div>
            <div style={block('80%', 14)} />
            <div style={block('40%', 28)} />
          </div>
        </Card>
      ))}
    </div>
  );
}
