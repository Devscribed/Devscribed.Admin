'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import {
  HIRING_MESSAGES,
  INTERVIEW_MESSAGES,
  MESSAGES,
  formatShortWhen,
  interviewMovedToast,
  isLiveBooking,
} from '@devscribed/validation';
import { Button, Card, InfoBanner, SectionLabel, Skeleton, Table, Toast } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { CancelInterviewDialog } from '@/hiring/CancelInterviewDialog';
import { RescheduleDialog } from '@/hiring/RescheduleDialog';
import { StatusBadge } from '@/hiring/StatusBadge';
import type { CardApplication, MyInterviewRow, MyInterviews } from '@/hiring/types';

type State =
  | { status: 'loading' }
  | { status: 'ready'; interviews: MyInterviews }
  | { status: 'error' }
  | { status: 'gone' };

/** Which dialog is open, and over which row. Only ever one at a time. */
type Acting = { row: MyInterviewRow; action: 'reschedule' | 'cancel' } | null;

/**
 * My interviews (spec 03 §06) — a deliberately plain screen, and for a `user`
 * interviewer the whole of hiring.
 *
 * No search, no filters, no pagination: it is a short list by construction, bounded by
 * one person's own calendar. It exists because without it the candidate card would be
 * reachable from nowhere but the calendar invite, and losing that email would lose the
 * access with it (03 §06.27).
 *
 * A member nobody has assigned an interview gets the not-found state rather than an
 * empty list — the screen's existence is not advertised to people it will never serve.
 * That is the API's 404, rendered here as the same nothing a wrong URL gives.
 *
 * It also carries **Reschedule and Cancel as row affordances** (07 §08.40), because for
 * a `user` who interviews this screen is the whole of hiring and it is the one they
 * actually live on. Both act in place: the server answers with the updated application,
 * the row is replaced, and a toast reports it — no reload, and no navigation away from a
 * list somebody is working down.
 */
export default function MyInterviewsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [acting, setActing] = useState<Acting>(null);
  /** The outcome, and the id 07's design names for it. */
  const [toast, setToast] = useState<{ message: string; testId: string } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/my-interviews`, {
        credentials: 'same-origin',
      });
      // 404 for a member with no assignment, which is the only refusal this endpoint
      // has: it is gated on assignment rather than on role, so there is no 403 here.
      if (response.status === 404 || response.status === 403) {
        setState({ status: 'gone' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'error' });
        return;
      }
      setState({ status: 'ready', interviews: await response.json() });
    } catch {
      setState({ status: 'error' });
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * One row, replaced from what the server just answered with.
   *
   * The whole list is not refetched: the row that changed is the only row that changed,
   * and a member working down a list must not have it reordered under them mid-glance.
   * A move that pushes an interview past `now` would re-group it on the next load, which
   * is the honest place for that to happen.
   */
  const replaceRow = useCallback((updated: CardApplication): void => {
    const apply = (rows: MyInterviewRow[]): MyInterviewRow[] =>
      rows.map((row) =>
        row.applicationId === updated.id
          ? {
              ...row,
              startUtc: updated.startUtc,
              endUtc: updated.endUtc,
              status: updated.status,
              isCancelled: updated.isCancelled,
            }
          : row,
      );

    setState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            interviews: {
              ...current.interviews,
              upcoming: apply(current.interviews.upcoming),
              past: apply(current.interviews.past),
            },
          }
        : current,
    );
  }, []);

  if (state.status === 'gone') notFound();

  if (state.status === 'error') {
    return (
      <>
        <PageHeader title={INTERVIEW_MESSAGES.title} />
        <InfoBanner tone="error" data-testid="my-interviews-error">
          {MESSAGES.generic}{' '}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            data-testid="my-interviews-retry"
          >
            Try again
          </Button>
        </InfoBanner>
      </>
    );
  }

  if (state.status === 'loading') {
    return (
      <>
        <PageHeader title={INTERVIEW_MESSAGES.title} />
        <Card>
          <Skeleton rows={4} height={22} data-testid="my-interviews-loading-skeleton" />
        </Card>
      </>
    );
  }

  const { upcoming, past, viewerTimeZone } = state.interviews;

  const open = (row: MyInterviewRow): string =>
    `/org/${orgId}/hiring/candidates/${row.candidateId}?application=${row.applicationId}`;

  /**
   * One group. Both render the same three facts; only the tone and the emptiness rule
   * differ, so they are one component rather than two nearly identical blocks.
   *
   * The rows carry `?application=` for the same reason the calendar invite does: a
   * candidate the interviewer has seen twice opens on the interview they clicked.
   */
  const group = (
    label: string,
    rows: MyInterviewRow[],
    { dim, testId, empty }: { dim: boolean; testId: string; empty?: string },
  ) => (
    <section style={{ marginBottom: 'var(--sp-8)' }} aria-label={label}>
      <SectionLabel style={{ marginBottom: 'var(--sp-4)' }}>{label}</SectionLabel>
      {rows.length === 0 ? (
        <Card>
          <p
            data-testid="my-interviews-empty"
            style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}
          >
            {empty}
          </p>
        </Card>
      ) : (
        <div data-testid={testId}>
          <Table<MyInterviewRow>
            rows={rows}
            /*
              The grouping label above already names the list, and three rows under an
              uppercase rule read as a report rather than as what this is — a glance at
              today (03 design §My interviews).
            */
            hideHeader
            rowHref={open}
            rowTestId={(row) => `my-interview-row-${row.applicationId}`}
            onRowClick={(row, event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              router.push(open(row));
            }}
            columns={[
              {
                label: 'Candidate',
                flex: 2,
                render: (row) => <span>{row.candidateName}</span>,
              },
              {
                label: 'Vacancy',
                flex: 2,
                render: (row) => (
                  <span style={{ color: 'var(--text-sub)' }}>{row.vacancyTitle}</span>
                ),
              },
              {
                label: 'When',
                flex: 2,
                render: (row) => (
                  // Past dates recede: the group heading says which they are, and the
                  // colour lets the eye skip them on the way to what is next.
                  <span style={{ color: dim ? 'var(--text-faint)' : 'var(--text)' }}>
                    {formatShortWhen(new Date(row.startUtc), viewerTimeZone)}
                  </span>
                ),
              },
              {
                label: 'Status',
                flex: 1,
                align: 'flex-end',
                render: (row) => <StatusBadge status={row.status} />,
              },
              {
                label: 'Actions',
                flex: 2,
                align: 'flex-end',
                render: (row) => (
                  <RowActions row={row} onAct={(action) => setActing({ row, action })} />
                ),
              },
            ]}
          />
        </div>
      )}
    </section>
  );

  return (
    <div data-testid="my-interviews-list">
      <PageHeader
        title={INTERVIEW_MESSAGES.title}
        subtitle={
          <span data-testid="my-interviews-timezone">Times in {viewerTimeZone}</span>
        }
      />

      {/*
        The upcoming group renders even when it is empty, so a quiet day does not look
        like a broken screen. The past group does not: a heading over nothing, on a
        screen that has never had an interview, is a second empty state saying the same
        thing as the first.
      */}
      {group(INTERVIEW_MESSAGES.upcoming, upcoming, {
        dim: false,
        testId: 'my-interviews-upcoming',
        empty:
          past.length === 0 ? INTERVIEW_MESSAGES.noneAtAll : INTERVIEW_MESSAGES.noUpcoming,
      })}

      {past.length > 0 &&
        group(INTERVIEW_MESSAGES.past, past, { dim: true, testId: 'my-interviews-past' })}

      {/*
        The same two dialogs the candidate card mounts, over the same endpoints — one
        picker, one confirmation, two hosts (07 design). They are keyed by the row so a
        second interview opens a fresh picker rather than one carrying the first's month.
      */}
      {acting?.action === 'reschedule' && (
        <RescheduleDialog
          key={`reschedule-${acting.row.applicationId}`}
          open
          orgId={orgId}
          applicationId={acting.row.applicationId}
          candidateName={acting.row.candidateName}
          currentStartUtc={acting.row.startUtc}
          viewerTimeZone={viewerTimeZone}
          onClose={() => setActing(null)}
          onMoved={(updated) => {
            setActing(null);
            replaceRow(updated);
            setToast({
              message: interviewMovedToast(new Date(updated.startUtc), viewerTimeZone),
              testId: 'toast-interview-rescheduled',
            });
          }}
        />
      )}

      {acting?.action === 'cancel' && (
        <CancelInterviewDialog
          key={`cancel-${acting.row.applicationId}`}
          open
          orgId={orgId}
          applicationId={acting.row.applicationId}
          candidateName={acting.row.candidateName}
          startUtc={acting.row.startUtc}
          timeZone={viewerTimeZone}
          onClose={() => setActing(null)}
          onCancelled={(updated) => {
            setActing(null);
            replaceRow(updated);
            setToast({
              message: HIRING_MESSAGES.toast.interviewCancelled,
              testId: 'toast-interview-cancelled',
            });
          }}
        />
      )}

      {toast && (
        <Toast tone="success" onDismiss={() => setToast(null)} data-testid={toast.testId}>
          {toast.message}
        </Toast>
      )}
    </div>
  );
}

/**
 * The row's trailing cell: Reschedule and Cancel, revealed on hover and on keyboard
 * focus, and always present for the row's own focus order.
 *
 * Both are `ghost` on both counts — a `danger` fill repeated down a table of interviews
 * turns a calm list into an alarm (07 design). They are **absent** once `start` has
 * passed or the interview has been called off, not disabled: a disabled control with no
 * explanation is worse than one that is simply not there, and the API refuses a past
 * interview anyway.
 *
 * The cell swallows its own clicks. The `Table` renders a linked row as a real anchor so
 * middle-click and copy-address keep working, and without this a press on Cancel would
 * also open the candidate card underneath the dialog.
 */
function RowActions({
  row,
  onAct,
}: {
  row: MyInterviewRow;
  onAct: (action: 'reschedule' | 'cancel') => void;
}) {
  if (!isLiveBooking({ start: new Date(row.startUtc), isCancelled: row.isCancelled }, new Date())) {
    return null;
  }

  const act = (action: 'reschedule' | 'cancel') => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onAct(action);
  };

  return (
    <div className="my-interview-actions">
      <Button
        variant="ghost"
        size="sm"
        onClick={act('reschedule')}
        aria-label={`Reschedule ${row.candidateName}'s interview`}
        data-testid={`my-interview-reschedule-${row.applicationId}`}
      >
        {HIRING_MESSAGES.manage.rescheduleAction}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={act('cancel')}
        aria-label={`Cancel ${row.candidateName}'s interview`}
        data-testid={`my-interview-cancel-${row.applicationId}`}
      >
        {HIRING_MESSAGES.manage.cancelActionTeam}
      </Button>
    </div>
  );
}
