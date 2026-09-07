'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageTabs,
  Preloader,
  SearchInput,
  Select,
} from '@devscribed/ds';
import { optionFor, valueOf } from '@/select';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { usePendingRequests } from '@/layout/requests-badge-context';
import { useToast } from '@/toast';
import {
  REQUEST_MESSAGES,
  REQUEST_STATUS_LABELS,
  can,
  normalizeRole,
  parseRequestScope,
  parseRequestStatusQuery,
  parseRequestTypeQuery,
  type RequestScope,
  type RequestStatusQuery,
  type RequestTypeQuery,
  type Role,
  type VacationRequestStatus,
} from '@devscribed/validation';
import { RejectRequestModal } from '../members/[memberId]/RejectRequestModal';
import { formatCurrency, formatDateRange } from '../members/[memberId]/vacation-format';
import { CancelRequestDialog } from './CancelRequestDialog';
import { NewRequestModal } from './NewRequestModal';
import { RequestRow } from './RequestRow';
import type { OrgRequest, OrgRequestsResponse, RequestRowData } from './types';

/** Payload carries no currency field; USD is the app default (matches VacationPanel). */
const CURRENCY = 'USD';

/** One entry of the topic filter — the archived marker is already in the label. */
interface TopicOption {
  id: string;
  label: string;
}

/**
 * The status control (requests spec 02 §Status Labels). Four words plus an all-statuses
 * entry, each read from the one exported map the rows, the detail header and the history
 * entries also read — the words are not written here (REQ-02-028).
 *
 * `closed` is one value over two stored statuses, so `declined` and `cancelled` are not
 * offered separately. The endpoint keeps accepting both for a link somebody saved; a
 * saved link still filters on the value it carries and this control shows Closed as the
 * nearest selection.
 */
const STATUS_OPTIONS: { value: RequestStatusQuery; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: REQUEST_STATUS_LABELS.open.label },
  { value: 'answered', label: REQUEST_STATUS_LABELS.answered.label },
  { value: 'granted', label: REQUEST_STATUS_LABELS.granted.label },
  { value: 'closed', label: REQUEST_STATUS_LABELS.declined.label },
];

/**
 * Which entry of the control is shown for the status actually in force. A saved link
 * carrying `declined` or `cancelled` filters on exactly that value while the control
 * reads Closed, which is the nearest selection it offers.
 */
function statusSelection(status: RequestStatusQuery): RequestStatusQuery {
  return status === 'declined' || status === 'cancelled' ? 'closed' : status;
}

const TYPE_OPTIONS: { value: RequestTypeQuery; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'access', label: 'Access' },
  { value: 'question', label: 'Question' },
  { value: 'vacation', label: 'Vacation' },
];

/** The scope strip. `PageTabs` draws each tab, so only it can carry the test ids. */
const SCOPE_TABS = [
  { value: 'mine', label: 'Mine', testId: 'requests-scope-mine' },
  { value: 'all', label: 'All', testId: 'requests-scope-all' },
];

/** Vacation status → DS `Badge` tone + label — spec 09's map, reused unchanged. */
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
 * The Requests page (requests spec 01). Everyone's inbox: it renders for every signed-in
 * member of the organization regardless of role, and the capabilities that used to gate
 * the whole page now gate two things inside it — the `All` scope (`view-all-requests`)
 * and the organization-wide vacation section (`view-requests`, spec 10, unchanged).
 *
 * Filter state lives in the URL, so a reload and a shared link both survive. The server
 * is the gate for every one of them: the scope control is simply not drawn for a caller
 * who cannot use it, and `scope=all` from a hand-edited URL answers 403 regardless.
 *
 * On a failed reload the last good list stays on screen behind the error banner rather
 * than being replaced by nothing — an empty screen would say "you have no requests",
 * which is a different and false statement.
 *
 * The vacation section below keeps spec 10's behaviour exactly, including the in-place
 * card patch after an action: a full refetch would drop the acted-on card out of a
 * narrowed view, and the card is required to stay and show its new status.
 */
export default function RequestsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const { showToast } = useToast();
  const { refresh: refreshBadge } = usePendingRequests();

  // `/api/me` returns `Membership.role` verbatim and the database still holds the legacy
  // `member`, which `can()` does not know: `CAPABILITY_MATRIX['member']` is undefined and
  // every capability comes back false. Normalizing first is what makes the matrix hold
  // against today's data, so the controls this page draws match the ones the server
  // grants the same account.
  //
  // Requests spec 03 REQ-03-017 — the principal kind is resolved before any of the
  // role-keyed reads below. A client contact holds no role, and `normalizeRole` would
  // answer them as a `viewer`; every control those helpers gate is one they do not have,
  // and the two side reads are routes that answer them 404.
  const isContact = session.principal === 'client';
  const role: Role = normalizeRole(session.role);
  const canCreate = !isContact && can(role, 'create-request');
  const canScopeAll = !isContact && can(role, 'view-all-requests');
  const canListProjects = !isContact && can(role, 'list-assigned-projects');

  // A `scope=all` arriving in the URL for a caller without the capability is read as
  // `mine`: the server would refuse it, and there is nothing to be gained by asking.
  const urlScope = parseRequestScope(searchParams.get('scope') ?? undefined) ?? 'mine';
  const [scope, setScope] = useState<RequestScope>(canScopeAll ? urlScope : 'mine');
  const [status, setStatus] = useState<RequestStatusQuery>(
    parseRequestStatusQuery(searchParams.get('status') ?? undefined) ?? 'all',
  );
  const [type, setType] = useState<RequestTypeQuery>(
    parseRequestTypeQuery(searchParams.get('type') ?? undefined) ?? 'all',
  );
  const [projectId, setProjectId] = useState<string>(searchParams.get('projectId') ?? '');
  const [topicId, setTopicId] = useState<string>(searchParams.get('topicId') ?? '');
  const [q, setQ] = useState<string>(searchParams.get('q') ?? '');
  const [debouncedQ, setDebouncedQ] = useState<string>(searchParams.get('q') ?? '');

  const [data, setData] = useState<OrgRequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // `clientId` rides along for requests spec 03: the new-request modal narrows the
  // project control to the chosen contact's client, and the list's own filter ignores it.
  const [projects, setProjects] = useState<{ id: string; name: string; clientId: string | null }[]>(
    [],
  );
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [newOpen, setNewOpen] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<OrgRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrgRequest | null>(null);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const filtersActive =
    status !== 'all' ||
    type !== 'all' ||
    projectId.length > 0 ||
    topicId.length > 0 ||
    debouncedQ.trim().length > 0;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Keep the URL in step with the active view.
  useEffect(() => {
    const next = new URLSearchParams();
    if (scope !== 'mine') next.set('scope', scope);
    if (status !== 'all') next.set('status', status);
    if (type !== 'all') next.set('type', type);
    if (projectId.length > 0) next.set('projectId', projectId);
    if (topicId.length > 0) next.set('topicId', topicId);
    if (debouncedQ.trim().length > 0) next.set('q', debouncedQ.trim());
    const qs = next.toString();
    router.replace(qs.length > 0 ? `?${qs}` : '?', { scroll: false });
    // `router` is in the list because it is referenced here. The App Router's instance is
    // stable across renders, so naming it costs no extra run and the effect still fires
    // only when one of the six filter values moves.
  }, [scope, status, type, projectId, topicId, debouncedQ, router]);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      const query = new URLSearchParams({ scope, status, type });
      if (projectId.length > 0) query.set('projectId', projectId);
      if (topicId.length > 0) query.set('topicId', topicId);
      if (debouncedQ.trim().length > 0) query.set('q', debouncedQ.trim());
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/requests?${query.toString()}`,
          { credentials: 'same-origin', signal },
        );
        if (signal?.aborted) return;
        if (response.ok) {
          const body = (await response.json()) as OrgRequestsResponse;
          if (signal?.aborted) return;
          setData(body);
          setError(false);
        } else {
          // The last good list stays on screen behind the banner.
          setError(true);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setError(true);
      }
      if (signal?.aborted) return;
      setLoading(false);
    },
    [orgId, scope, status, type, projectId, topicId, debouncedQ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // The project filter and picker need the organization's projects. A `viewer` has no
  // access to any project surface, so the control is not drawn for them and the request
  // the API would refuse is never sent.
  useEffect(() => {
    if (!canListProjects) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/projects?status=active`, {
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const body = (await response.json()) as {
          projects: { id: string; name: string; clientId: string | null }[];
        };
        if (!cancelled) {
          setProjects(
            body.projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId ?? null })),
          );
        }
      } catch {
        // No project choices; the filter simply has nothing to offer.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, canListProjects]);

  /**
   * The topic filter's own read (REQ-02-031). It carries `status=all`, unlike the
   * new-request picker's `status=active`: the control that *finds* requests raised under
   * a retired topic must still offer that topic, while the picker must not. One read
   * cannot serve both without hiding those requests from the control that finds them.
   */
  useEffect(() => {
    // The catalogue is a staff read: REQ-03-019 answers a client contact 404 there, and
    // a request that cannot succeed is not sent.
    if (isContact) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/request-topics?status=all`,
          { credentials: 'same-origin' },
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          topics: { id: string; name: string; status: string }[];
        };
        if (!cancelled) {
          setTopics(
            body.topics.map((topic) => ({
              id: topic.id,
              // Each archived entry is marked as archived, the same marker the detail
              // screen uses beside a retired topic's snapshot name.
              label: topic.status === 'archived' ? `${topic.name} (archived)` : topic.name,
            })),
          );
        }
      } catch {
        // No topic choices; the filter simply has nothing to offer.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, isContact]);

  /** Update one vacation card's fields in place (keeps it visible under the filter). */
  const patchVacation = useCallback((id: string, changes: Partial<OrgRequest>): void => {
    setData((prev) =>
      prev && prev.vacation
        ? {
            ...prev,
            vacation: {
              ...prev.vacation,
              requests: prev.vacation.requests.map((r) =>
                r.id === id ? { ...r, ...changes } : r,
              ),
            },
          }
        : prev,
    );
  }, []);

  async function handleApprove(vacationRequest: OrgRequest): Promise<void> {
    if (approvingId) return;
    setApprovingId(vacationRequest.id);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/members/${vacationRequest.member.membershipId}/vacation/requests/${vacationRequest.id}/review`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ decision: 'approved' }),
        },
      );
      if (response.ok) {
        showToast('toast-request-approved', REQUEST_MESSAGES.toastApproved);
        patchVacation(vacationRequest.id, {
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
    const vacationRequest = cancelTarget;
    if (!vacationRequest || cancelSaving) return;
    setCancelSaving(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/members/${vacationRequest.member.membershipId}/vacation/requests/${vacationRequest.id}/cancel`,
        { method: 'PUT', credentials: 'same-origin' },
      );
      if (response.ok) {
        setCancelTarget(null);
        setCancelSaving(false);
        showToast('toast-request-cancelled', REQUEST_MESSAGES.toastCancelledApproved);
        patchVacation(vacationRequest.id, {
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

  const requests: RequestRowData[] = data?.requests ?? [];
  const vacation = data?.vacation ?? null;
  const showEmpty = data !== null && requests.length === 0;
  const emptyMessage =
    data && data.counts.total > 0 ? REQUEST_MESSAGES.emptyFiltered : REQUEST_MESSAGES.emptyMine;

  // Built once here so `value` and `options` are handed the same option objects: `optionFor`
  // finds the chosen one by its value, and a list rebuilt inside the markup is a new set of
  // objects on every render. The `Any …` entry is a real option for the empty value, not a
  // placeholder — the reader who chooses it must see it chosen.
  const topicFilterOptions = [
    { value: '', label: 'Any topic' },
    ...topics.map((topic) => ({ value: topic.id, label: topic.label })),
  ];
  const projectFilterOptions = [
    { value: '', label: 'Any project' },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ];

  return (
    <div data-testid="requests-page">
      <PageHeader
        title="Requests"
        action={
          canCreate ? (
            <Button
              variant="primary"
              onClick={() => setNewOpen(true)}
              data-testid="requests-new-btn"
            >
              New request
            </Button>
          ) : undefined
        }
      />

      <div style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
        {/* A client contact's list is one list: no scope control, and none of the filters
            either — the topic catalogue behind one of them is a route they are answered
            404 on, and the others narrow a view that is already only their own requests. */}
        {!isContact && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
          }}
        >
          {/* The scope control is not drawn at all for a caller who cannot use it. */}
          {canScopeAll && (
            <div data-testid="requests-scope-toggle">
              <PageTabs
                label="Scope"
                tabs={SCOPE_TABS}
                active={scope}
                onChange={(value) => setScope(value === 'all' ? 'all' : 'mine')}
              />
            </div>
          )}

          {/* Every filter crosses the option/value boundary the same way: `optionFor` finds
              the option a stored value stands for, `valueOf` takes the value back out. Bound
              to the bare value these drew the value itself — a string is a legal option whose
              label is itself — so `open` would render where the list says `Open`. */}
          <div style={{ minWidth: 170 }}>
            <Select
              value={optionFor(TYPE_OPTIONS, type)}
              options={TYPE_OPTIONS}
              onChange={(option) => setType(parseRequestTypeQuery(valueOf(option)) ?? 'all')}
              data-testid="requests-type-filter"
            />
          </div>

          <div style={{ minWidth: 170 }}>
            <Select
              value={optionFor(topicFilterOptions, topicId)}
              placeholder="Any topic"
              options={topicFilterOptions}
              onChange={(option) => setTopicId(valueOf(option))}
              data-testid="requests-topic-filter"
            />
          </div>

          <div style={{ minWidth: 170 }}>
            <Select
              value={optionFor(STATUS_OPTIONS, statusSelection(status))}
              options={STATUS_OPTIONS}
              onChange={(option) => setStatus(parseRequestStatusQuery(valueOf(option)) ?? 'all')}
              data-testid="requests-status-filter"
            />
          </div>

          {canListProjects && (
            <div style={{ minWidth: 170 }}>
              <Select
                value={optionFor(projectFilterOptions, projectId)}
                placeholder="Any project"
                options={projectFilterOptions}
                onChange={(option) => setProjectId(valueOf(option))}
              />
            </div>
          )}

          <div style={{ minWidth: 200, flex: 1 }}>
            <SearchInput
              outlined
              value={q}
              placeholder="Search titles"
              onChange={(event) => setQ(event.target.value)}
              onClear={() => setQ('')}
            />
          </div>
        </div>
        )}

        {error && (
          <div
            data-testid="requests-error-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              padding: 'var(--space-4)',
              marginBottom: 'var(--space-5)',
              border: 'var(--border-width-hairline) solid var(--status-error)',
              borderRadius: 'var(--radius-l)',
              fontFamily: 'var(--font-family-base)',
              fontSize: 'var(--font-size-s)',
              color: 'var(--text-primary)',
            }}
          >
            <span>{REQUEST_MESSAGES.genericError}</span>
            <span style={{ marginLeft: 'auto' }}>
              <Button
                onClick={() => void load()}
                data-testid="requests-error-retry-btn"
              >
                Retry
              </Button>
            </span>
          </div>
        )}

        {/* The system's own loading and empty surfaces: the hand-drawn skeleton and the
            centred empty block this screen carried are `Preloader` and `EmptyState`. */}
        {loading && data === null ? (
          <Preloader data-testid="requests-loading" />
        ) : (
          <>
            {showEmpty ? (
              <EmptyState data-testid="requests-empty-state">
                <div>{emptyMessage}</div>
                {filtersActive && (
                  <div style={{ marginTop: 'var(--space-5)' }}>
                    <Button
                      onClick={() => {
                        setStatus('all');
                        setType('all');
                        setProjectId('');
                        setTopicId('');
                        setQ('');
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </EmptyState>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {requests.map((request) => (
                  <RequestRow key={request.id} orgId={orgId} request={request} />
                ))}
              </div>
            )}

            {vacation && (
              <div data-testid="requests-vacation-section" style={{ marginTop: 'var(--space-7)' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-family-base)',
                    fontSize: 'var(--font-size-xs)',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  Vacation
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  {vacation.requests.map((vacationRequest) => (
                    <VacationCard
                      key={vacationRequest.id}
                      orgId={orgId}
                      request={vacationRequest}
                      approving={approvingId === vacationRequest.id}
                      actionsBusy={approvingId !== null || cancelSaving}
                      onApprove={handleApprove}
                      onReject={setRejectTarget}
                      onCancel={setCancelTarget}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <NewRequestModal
        orgId={orgId}
        open={newOpen}
        projects={projects}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          void load();
          void refreshBadge();
        }}
      />

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
            patchVacation(rejectTarget.id, {
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

/** One organization-wide vacation row — spec 10's card, unchanged. */
function VacationCard({
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Header: avatar + name + status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', minWidth: 0 }}>
          <Avatar
            name={fullName}
            initials={request.member.initials}
            size={40}
            decorative
            data-testid={`requests-card-avatar-${request.id}`}
          />
          <Link
            href={`/org/${orgId}/members/${request.member.membershipId}`}
            data-testid={`requests-card-member-name-${request.id}`}
            style={{
              fontWeight: 'var(--font-weight-medium)',
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              minWidth: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--action-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          >
            {fullName}
          </Link>
          <div style={{ marginLeft: 'auto' }}>
            <Badge status={meta.tone} data-testid={`requests-card-status-${request.id}`}>
              {meta.label}
            </Badge>
          </div>
        </div>

        {/* Detail lines */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-1) var(--space-4)' }}>
          <span
            data-testid={`requests-card-dates-${request.id}`}
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-primary)',
            }}
          >
            {formatDateRange(request.startDate, request.endDate)}
          </span>
          <span
            data-testid={`requests-card-days-${request.id}`}
            style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
          >
            {request.workingDays} working days
          </span>
          <span
            data-testid={`requests-card-balance-${request.id}`}
            style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
          >
            {request.memberBalance.availableDays} days available
          </span>
        </div>

        {/* Deduction chip */}
        <span
          data-testid={`requests-card-deduction-${request.id}`}
          style={{
            alignSelf: 'flex-start',
            border: 'var(--border-width-hairline) solid var(--border-subtle)',
            borderRadius: 'var(--radius-l)',
            padding: 'var(--space-1) var(--space-3)',
            fontWeight: 'var(--font-weight-semibold)',
            fontSize: 'var(--font-size-base)',
            color: 'var(--text-primary)',
          }}
        >
          {formatCurrency(request.deductionAmount, CURRENCY)}
        </span>

        {/* Rejected reviewer comment */}
        {request.status === 'rejected' && request.reviewerComment && (
          <div
            data-testid={`requests-card-reviewer-comment-${request.id}`}
            style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}
          >
            &ldquo;{request.reviewerComment}&rdquo;
          </div>
        )}

        {/* Reviewed-by line — payload gives `reviewedBy` as an account id, so the line is
            shown only when a reviewer value is present; graceful when absent. */}
        {request.reviewedAt && request.reviewedBy && (
          <div
            data-testid={`requests-card-reviewed-by-${request.id}`}
            style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}
          >
            Reviewed by {request.reviewedBy}
          </div>
        )}

        {/* Action row */}
        {(isPending || isApproved) && (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {isPending && (
              <>
                <Button
                  variant="primary"
                  preloader={approving}
                  disabled={actionsBusy && !approving}
                  onClick={() => onApprove(request)}
                  data-testid={`requests-card-approve-${request.id}`}
                >
                  Approve
                </Button>
                <Button
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
                variant="delete"
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
