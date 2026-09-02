'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import {
  HIRING_MESSAGES,
  MESSAGES,
  VACANCY_STATUS_FILTERS,
  vacancyActionsLabel,
  vacancyCloseConfirmation,
  vacancyDeleteConfirmation,
  vacancyStatusTabLabel,
  type VacancyStatusFilter,
} from '@devscribed/validation';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Popover,
  Preloader,
  Table,
  TableToolbar,
  ToastHost,
} from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useToasts } from '@/hiring/useToasts';
import { VacancyStatusBadge } from '@/hiring/StatusBadge';
import type { Vacancy, VacancyList } from '@/hiring/types';
import { VacancyDialog } from './VacancyDialog';

type Phase = 'loading' | 'ready' | 'gone';

/** 01 §05.16 — the same 300 ms the member and candidate searches already use. */
const SEARCH_DEBOUNCE_MS = 300;

/** Which of the two row confirmations is up, and about which vacancy. */
type Pending = { action: 'close' | 'delete'; vacancy: Vacancy };

/**
 * The vacancies list: the status tabs, search, and the route into a vacancy.
 *
 * Both filters run server-side. The list has no page size, so narrowing it in the
 * browser would mean fetching every vacancy in the organization to show one.
 *
 * **The status filter became navigation** (01 §07.18). It was a `Select` beside the
 * search — three choices behind two clicks, none of which said how the library divides
 * until one was made. As a tab strip it is one click, and each tab carries its own count,
 * so the split is readable before it is pressed. The counts are computed under the
 * search and not under the tab, which is what stops `Open (9)` standing over nine rows
 * that a search has already ruled out.
 *
 * **A row acts without being opened** (01 §07.22). Four items: the booking link, the edit
 * that used to need the detail page, and the two lifecycle actions. Both blocked items —
 * copy on a closed vacancy, delete on one with candidates — are drawn **disabled with
 * their reason** rather than hidden: a missing action is indistinguishable from a bug, and
 * a reason nobody can reach is the same failure one step later (ledger §22).
 *
 * `Open board` was the fifth, and it went with the fold-in (01 §08.27): the board is the
 * vacancy now, so the row already had that item — it is the row itself.
 *
 * `user` and `viewer` are refused by the API, and the screen renders the not-found
 * state rather than a permission error — the sidebar never offered them the row, so a
 * direct navigation is the only way to arrive here.
 */
export default function VacanciesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  /** A request is in flight over rows that are already on screen (ledger §34). */
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<VacancyList | null>(null);
  /** Absent is closed; `{ vacancy: undefined }` creates, a vacancy edits. */
  const [dialog, setDialog] = useState<{ vacancy?: Vacancy } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<VacancyStatusFilter>('all');

  // Typing debounces; the tabs do not, because a click is already a deliberate act and
  // waiting on it would read as lag.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (): Promise<void> => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    if (status !== 'all') params.set('status', status);
    const suffix = params.toString() ? `?${params}` : '';

    setRefreshing(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies${suffix}`, {
        credentials: 'same-origin',
      });
      if (response.status === 403 || response.status === 404) {
        setPhase('gone');
        return;
      }
      if (!response.ok) return;
      setData(await response.json());
      setPhase('ready');
    } finally {
      setRefreshing(false);
    }
  }, [orgId, query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'gone') notFound();

  const vacancies = data?.vacancies ?? [];
  const counts = data?.statusCounts;

  /** Close and reopen are the same write with a different value (01 §03.8). */
  async function setVacancyStatus(vacancy: Vacancy, next: 'open' | 'closed'): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies/${vacancy.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-vacancy-error' });
        return;
      }
      setPending(null);
      // Refetched rather than patched in place — no optimistic updates on this screen,
      // and the tab counts move with the row.
      await load();
      push({
        message:
          next === 'closed'
            ? HIRING_MESSAGES.toast.vacancyClosed
            : HIRING_MESSAGES.toast.vacancyReopened,
        testId: next === 'closed' ? 'toast-vacancy-closed' : 'toast-vacancy-reopened',
      });
    } catch {
      push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-vacancy-error' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(vacancy: Vacancy): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/hiring/vacancies/${vacancy.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      setPending(null);
      if (!response.ok) {
        // Reachable only by a race — the item is disabled once there are applications —
        // so the server's reason is what gets shown, not a guess at it.
        const body = await response.json().catch(() => ({}));
        push({
          message: body.message ?? MESSAGES.generic,
          tone: 'error',
          testId: 'toast-vacancy-error',
        });
      } else {
        push({
          message: HIRING_MESSAGES.toast.vacancyDeleted,
          testId: 'toast-vacancy-deleted',
        });
      }
      await load();
    } catch {
      push({ message: MESSAGES.generic, tone: 'error', testId: 'toast-vacancy-error' });
    } finally {
      setBusy(false);
    }
  }

  /**
   * The link is built here rather than read off the page, because the row does not draw
   * it. A clipboard that refuses says so (01 §07.25), and where it sends somebody is the
   * only difference between this message and the detail page's: a row can point at the
   * vacancy, and the vacancy has nowhere further to point, so it says the link out loud.
   */
  /** The candidate's own view of this vacancy — the address `copyLink` copies. */
  const bookingUrl = (vacancy: Vacancy): string =>
    `${window.location.origin}/book/${vacancy.publicSlug}`;

  async function copyLink(vacancy: Vacancy): Promise<void> {
    const url = bookingUrl(vacancy);
    try {
      await navigator.clipboard.writeText(url);
      push({
        message: HIRING_MESSAGES.toast.linkCopied,
        testId: 'toast-link-copied',
      });
    } catch {
      push({
        message: HIRING_MESSAGES.vacancy.clipboardUnavailable,
        tone: 'error',
        testId: 'toast-link-copy-failed',
      });
    }
  }

  function rowActions(vacancy: Vacancy) {
    const open = vacancy.status === 'open';
    const { actions } = HIRING_MESSAGES.vacancy;
    return [
      {
        // The row is a link to the same page, and the menu says so anyway: a kebab is
        // where a row states what it can do, and a reader who opened one is asking to be
        // told rather than to infer that the whole row is clickable.
        key: 'board',
        label: actions.openBoard,
        testId: `vacancy-action-board-${vacancy.id}`,
        onSelect: () => router.push(`/org/${orgId}/hiring/vacancies/${vacancy.id}`),
      },
      {
        key: 'copy',
        label: actions.copyLink,
        testId: `vacancy-action-copy-link-${vacancy.id}`,
        // Shown and disabled, never hidden: a closed vacancy still has a link, and the
        // reason it cannot be handed out is the thing worth saying.
        disabled: !open,
        tooltip: open ? undefined : HIRING_MESSAGES.vacancy.closedLinkNote,
        tooltipTestId: `vacancy-copy-guard-message-${vacancy.id}`,
        onSelect: () => void copyLink(vacancy),
      },
      {
        /*
          The one row that leaves the product. It is not disabled on a closed vacancy the
          way `Copy booking link` is: the page still exists and explains itself (02 §02.6),
          and what a closed vacancy cannot do is take a booking, not be looked at.

          A new tab, because this is the candidate's view and not a place inside the app to
          navigate to — coming back should not cost the list its scroll position or its
          filters.
        */
        key: 'booking-page',
        label: actions.openBookingPage,
        testId: `vacancy-action-open-booking-${vacancy.id}`,
        onSelect: () => window.open(bookingUrl(vacancy), '_blank', 'noopener,noreferrer'),
      },
      {
        key: 'edit',
        label: actions.edit,
        testId: `vacancy-action-edit-${vacancy.id}`,
        onSelect: () => setDialog({ vacancy }),
      },
      open
        ? {
            key: 'close',
            label: actions.close,
            testId: `vacancy-action-close-${vacancy.id}`,
            onSelect: () => setPending({ action: 'close', vacancy }),
          }
        : {
            key: 'reopen',
            label: actions.reopen,
            testId: `vacancy-action-reopen-${vacancy.id}`,
            // Reopening confirms nothing: it takes nothing away, and the action that
            // undoes it is one row up in the same menu.
            onSelect: () => void setVacancyStatus(vacancy, 'open'),
          },
      {
        key: 'delete',
        label: actions.delete,
        testId: `vacancy-action-delete-${vacancy.id}`,
        danger: vacancy.deletable,
        disabled: !vacancy.deletable,
        // In a bubble beside the menu, not a third line inside a 160px panel — and never
        // a native `title`, which no browser opens from a keyboard (ledger §62).
        tooltip: vacancy.deletable ? undefined : HIRING_MESSAGES.vacancy.deleteBlocked,
        tooltipTestId: `vacancy-delete-guard-message-${vacancy.id}`,
        onSelect: () => setPending({ action: 'delete', vacancy }),
      },
    ];
  }

  return (
    <>
      <PageHeader title="Vacancies" />

      {/*
        Blue's own list-screen row (ledger §52), the same one the candidate database took
        in Phase 4: the strip on the left, a 250px search and the actions on the right.
        `New vacancy` moved off the page header and into it, because the toolbar is now
        where everything that acts on the whole list lives.

        The tabs are drawn only once a response has arrived. A strip whose labels read
        `All (0)` and then jumped would be the flash the shell's `/api/me` gate exists to
        prevent, one screen further in.
      */}
      <TableToolbar
        tabs={
          counts
            ? VACANCY_STATUS_FILTERS.map((filter) => ({
                value: filter,
                label: vacancyStatusTabLabel(filter, counts[filter]),
                testId: `vacancies-status-${filter}`,
              }))
            : undefined
        }
        activeTab={status}
        onTab={(next) => setStatus(next as VacancyStatusFilter)}
        tabsLabel={HIRING_MESSAGES.vacancy.statusTablist}
        tabsTestId="vacancies-status-tabs"
        search={search}
        onSearch={(event) => setSearch(event.target.value)}
        onClearSearch={() => setSearch('')}
        searchPlaceholder="Search vacancies…"
        searchLabel="Search vacancies"
        searchTestId="vacancies-search-input"
      >
        <Button
          variant="primary"
          onClick={() => setDialog({})}
          data-testid="vacancy-new-button"
        >
          New vacancy
        </Button>
      </TableToolbar>

      {/*
        One surface at every state, which is what blue's table screens do and what the
        members and candidates lists already do: the card gives the edge-to-edge table its
        border and rounds its first and last rows, and the loader and the empty message
        sit inside it rather than replacing it.

        `clip` stays at its default. The row kebab opens *inside* this card, but the DS
        `Popover` portals its menu (ledger §55), so nothing it raises is clipped by the
        surface it was opened from.
      */}
      <Card padded={false} data-testid="vacancies-list">
        <Table<Vacancy>
          rows={vacancies}
          /* A refilter dims the rows in place rather than replacing them with a loader:
             a table that collapsed and re-expanded on every keystroke would reflow the
             page under the reader for no information at all (ledger §34). */
          busy={refreshing && vacancies.length > 0}
          rowKey="id"
          rowHref={(row) => `/org/${orgId}/hiring/vacancies/${row.id}`}
          rowTestId={(row) => `vacancy-row-${row.id}`}
          onRowClick={(row, event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            // The kebab lives inside the row, and pressing it is not opening the row.
            // `closest` rather than a stopPropagation in the menu, because the menu is a
            // portal (ledger §55) and its rows are not inside this anchor at all.
            if ((event.target as HTMLElement).closest('[data-row-actions]')) {
              event.preventDefault();
              return;
            }
            event.preventDefault();
            router.push(`/org/${orgId}/hiring/vacancies/${row.id}`);
          }}
          columns={[
            {
              label: 'Title',
              // 2, not 3. The title carries a second line of category labels and needs the
              // most room of any column — but at 3 it took it from `Interviewer`, whose
              // names then ellipsised while the title cell ran half empty.
              flex: 2,
              render: (row) => (
                <div style={{ minWidth: 0 }}>
                  <span
                    data-testid={`vacancy-title-${row.id}`}
                    style={{
                      display: 'block',
                      minWidth: 0,
                      overflowWrap: 'anywhere',
                      fontWeight: 'var(--font-weight-medium)',
                      lineHeight: '20px',
                    }}
                  >
                    {row.title}
                  </span>
                  {/* Labels on a second line inside the title cell — read-only here,
                      editable only in the dialog (01 §UI Notes). */}
                  {row.categories.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 'var(--space-2)',
                        marginTop: 'var(--space-3)',
                      }}
                    >
                      {row.categories.map((category) => (
                        <Badge
                          key={category.id}
                          status="neutral"
                          size="s"
                          data-testid={`vacancy-category-chip-${category.id}`}
                        >
                          {category.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
            {
              label: 'Interviewer',
              flex: 1.3,
              render: (row) => (
                <span data-testid={`vacancy-interviewer-${row.id}`}>{row.interviewer.fullName}</span>
              ),
            },
            {
              // Length and Candidates take blue's positional rule rather than saying anything:
              // a middle column reads centred. They were right-aligned Grotesk numerals under
              // Meridian, and blue has one family and no mono treatment to align.
              label: 'Length',
              flex: 1,
              render: (row) => (
                <span data-testid={`vacancy-duration-${row.id}`}>{row.durationMinutes} min</span>
              ),
            },
            {
              label: 'Candidates',
              flex: 1,
              render: (row) => (
                <span data-testid={`vacancy-count-${row.id}`}>{row.applicationCount}</span>
              ),
            },
            {
              label: 'Status',
              flex: 1,
              render: (row) => (
                <VacancyStatusBadge status={row.status} testId={`vacancy-status-${row.id}`} />
              ),
            },
            {
              label: 'Actions',
              render: (row) => (
                <Popover
                  label={vacancyActionsLabel(row.title)}
                  /* The trigger is inside the row's anchor by construction, so the row has
                     to be told which press was not for it. `Popover` forwards rest props
                     onto the trigger, so this marks the button itself and the handler
                     above finds it with `closest`. */
                  data-row-actions=""
                  data-testid={`vacancy-actions-menu-${row.id}`}
                  items={rowActions(row)}
                />
              ),
            },
          ]}
        />

        {refreshing && vacancies.length === 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7)' }}>
            {/* The dots carry no text, so the announcement is made beside them. */}
            <Preloader data-testid="vacancies-loading" aria-hidden />
            <span
              aria-live="polite"
              style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
            >
              Loading vacancies
            </span>
          </div>
        )}

        {/*
          Driven by `total` — the whole library, narrowed by nothing — and never by a tab's
          own count. Somebody who has twelve vacancies and searched for the thirteenth must
          not be told they have none (01 §07.21).
        */}
        {phase === 'ready' && vacancies.length === 0 && (
          <EmptyState data-testid="vacancies-empty-state">
            {data?.total === 0
              ? HIRING_MESSAGES.vacancy.empty
              : HIRING_MESSAGES.vacancy.emptyFiltered}
          </EmptyState>
        )}
      </Card>

      <VacancyDialog
        orgId={orgId}
        open={dialog !== null}
        vacancy={dialog?.vacancy}
        onClose={() => setDialog(null)}
        onSaved={(vacancy) => {
          const editing = dialog?.vacancy !== undefined;
          setDialog(null);
          if (editing) {
            void load();
            push({
              message: HIRING_MESSAGES.toast.vacancyUpdated,
              testId: 'toast-vacancy-updated',
            });
            return;
          }
          // A new vacancy's banner belongs to the destination, so it survives the
          // navigation the spec asks for rather than being raised on a screen about to
          // be replaced.
          router.push(`/org/${orgId}/hiring/vacancies/${vacancy.id}?created=1`);
        }}
      />

      {/*
        Blue's own `ConfirmDialog`, which 01 design left open for Phase 6 and §41 answered:
        `closeOnAccept={false}` keeps the dialog up until the server has replied, so the
        last point at which somebody can change their mind is not also the point the
        outcome stops being visible.
      */}
      <ConfirmDialog
        open={pending?.action === 'close'}
        title={HIRING_MESSAGES.vacancy.closeTitle}
        description={vacancyCloseConfirmation(pending?.vacancy.scheduledCount ?? 0)}
        acceptBtnText={HIRING_MESSAGES.vacancy.actions.close}
        declineBtnText="Cancel"
        busy={busy}
        closeOnAccept={false}
        onClose={() => setPending(null)}
        onAccept={() => pending && void setVacancyStatus(pending.vacancy, 'closed')}
        data-testid="vacancy-close-confirm"
        acceptTestId="vacancy-close-confirm-button"
      />

      <ConfirmDialog
        open={pending?.action === 'delete'}
        title={HIRING_MESSAGES.vacancy.deleteTitle}
        description={vacancyDeleteConfirmation(pending?.vacancy.title ?? '')}
        acceptBtnText={HIRING_MESSAGES.vacancy.actions.delete}
        declineBtnText="Cancel"
        busy={busy}
        closeOnAccept={false}
        onClose={() => setPending(null)}
        onAccept={() => pending && void remove(pending.vacancy)}
        data-testid="vacancy-delete-confirm"
        acceptTestId="vacancy-delete-confirm-button"
      />

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
