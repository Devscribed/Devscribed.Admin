'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  IconButton,
  InfoBanner,
  Preloader,
  Select,
  ToggleButton,
} from '@devscribed/ds';
import { ChevronLeftIcon, ChevronRightIcon } from '@/layout/icons';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { optionFor, valueOf } from '@/select';
import { useToast } from '@/toast';
import { TIME_TRACKING_MESSAGES, can, type Role } from '@devscribed/validation';
import type { MemberListResponse } from '../members/types';
import type { ProjectsResponse } from '../projects/types';
import { DailyView } from './DailyView';
import { HolidayLiveRegion } from './HolidayMarker';
import { MonthlyView } from './MonthlyView';
import { TimeEntryModal } from './TimeEntryModal';
import { TimerBar } from './TimerBar';
import { WeeklyView } from './WeeklyView';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  formatDayLabel,
  formatMonthLabel,
  formatWeekLabel,
  startOfMonth,
  startOfWeek,
  todayISO,
  weekStartFromPreference,
} from './date-utils';
import type {
  AssignableProject,
  CalendarHoliday,
  CalendarHolidaysResponse,
  TimeEntriesResponse,
  TimeEntry,
  TimeView,
} from './types';

const MY_TIME = 'me';

/**
 * Time Tracking page (spec 12). A role-gated client surface (admin/manager/user; viewer →
 * `notFound()`). It holds the view (Monthly default), the period anchor, and the member
 * filter, and fetches exactly the active view's date window from `GET .../time-entries`
 * — the response's `entries[]` feed every client-aggregated cell/period total. The shared
 * `RunningTimerProvider` (mounted in the shell) is the single source of truth for the
 * timer, so the quick-actions `TimerBar` here and the topbar indicator stay in sync.
 */
export default function TimeTrackingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const session = useSession();
  const { showToast } = useToast();
  const role = session.role as Role;

  if (!can(role, 'view-time-tracking')) notFound();

  const isReviewer = can(role, 'manage-all-time-entries'); // admin/manager
  const canManage = can(role, 'manage-own-time-entries'); // admin/manager/user
  const today = useMemo(() => todayISO(), []);
  // The account's week-start preference drives every calendar view (spec 06 / change 1).
  const weekStartsOn = weekStartFromPreference(session.account.firstDayOfWeek);
  // The account's timezone renders every entry's wall-clock (spec 12 change A); an
  // unset/blank timezone falls back to UTC, giving the previous UTC-wall-clock behavior.
  const tz =
    session.account.timezone && session.account.timezone.trim().length > 0
      ? session.account.timezone
      : 'UTC';

  const [view, setView] = useState<TimeView>('monthly');
  const [anchor, setAnchor] = useState<string>(today);
  const [memberFilter, setMemberFilter] = useState<string>(MY_TIME);

  // Spec 16 §Filter chips — the billable / non-billable chips are URL-persisted so a
  // shared link opens the same filtered view. The URL uses the same values the calendar
  // API accepts: `billable` | `non-billable` | absent (both chips on / everything). A
  // fourth state (both OFF) is UI-only and encoded as `billable=none`; it shows an
  // empty grid without asking the server for zero rows.
  const searchParams = useSearchParams();
  const router = useRouter();
  const billableUrl = searchParams?.get('billable') ?? '';
  const showBillable = billableUrl !== 'non-billable' && billableUrl !== 'none';
  const showNonBillable = billableUrl !== 'billable' && billableUrl !== 'none';
  const serverBillableParam =
    showBillable && showNonBillable
      ? 'all'
      : showBillable
      ? 'billable'
      : showNonBillable
      ? 'non-billable'
      : 'none';

  const updateBillable = useCallback(
    (nextShowBillable: boolean, nextShowNonBillable: boolean): void => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      const next =
        nextShowBillable && nextShowNonBillable
          ? null
          : nextShowBillable
          ? 'billable'
          : nextShowNonBillable
          ? 'non-billable'
          : 'none';
      if (next === null) params.delete('billable');
      else params.set('billable', next);
      const qs = params.toString();
      router.replace(qs.length > 0 ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Spec organization/03 — read-only holiday markers on the Weekly and Monthly views.
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([]);
  const [holidayAnnouncement, setHolidayAnnouncement] = useState('');

  const [projects, setProjects] = useState<AssignableProject[]>([]);
  const [members, setMembers] = useState<{ id: string; fullName: string }[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalEntry, setModalEntry] = useState<TimeEntry | null>(null);
  const [modalDate, setModalDate] = useState<string>(today);

  const [deleteTarget, setDeleteTarget] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The active view's inclusive date window (spec resolved data notes 3–4).
  const range = useMemo(() => {
    if (view === 'monthly') return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    if (view === 'weekly') {
      return { from: startOfWeek(anchor, weekStartsOn), to: endOfWeek(anchor, weekStartsOn) };
    }
    return { from: anchor, to: anchor };
  }, [view, anchor, weekStartsOn]);

  // Assignable projects for the timer + entry modal (spec resolved data note 6).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/projects?status=active`,
          { credentials: 'same-origin' },
        );
        if (!response.ok) return;
        const data = (await response.json()) as ProjectsResponse;
        if (!cancelled)
          setProjects(
            data.projects.map((p) => ({ id: p.id, name: p.name, key: p.key ?? null })),
          );
      } catch {
        // A failed project fetch leaves the selectors with just "— No project —".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Active members for the admin/manager member filter (spec resolved data note 5).
  useEffect(() => {
    if (!isReviewer) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/members`, {
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const data = (await response.json()) as MemberListResponse;
        if (!cancelled) {
          setMembers(
            data.members
              .filter((m) => m.status === 'active')
              .map((m) => ({ id: m.id, fullName: m.fullName })),
          );
        }
      } catch {
        // Non-fatal — the filter simply shows "My time" only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, isReviewer]);

  const load = useCallback(async (): Promise<void> => {
    // Spec 16 — the "both chips OFF" state is encoded client-side as `none`; do not
    // ask the server for zero rows, just render an empty grid.
    if (serverBillableParam === 'none') {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      if (memberFilter !== MY_TIME) query.set('membershipId', memberFilter);
      if (serverBillableParam !== 'all') query.set('billable', serverBillableParam);
      const response = await fetch(
        `/api/organizations/${orgId}/time-entries?${query.toString()}`,
        { credentials: 'same-origin' },
      );
      if (response.ok) {
        const data = (await response.json()) as TimeEntriesResponse;
        setEntries(data.entries);
      } else {
        setEntries([]);
      }
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [orgId, range.from, range.to, memberFilter, serverBillableParam]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Holidays for the visible range (spec organization/03 requirement 10). One fetch
   * here rather than one per view, and `scope=mine` — which needs no capability, so a
   * `user` and a `viewer` get their own markers and the server resolves their country.
   * The `year` is sent explicitly for every year the range touches: the endpoint
   * defaults to the caller's *current* year, so a member paging into next December
   * would otherwise see an empty calendar.
   */
  useEffect(() => {
    const years = Array.from(
      new Set([range.from.slice(0, 4), range.to.slice(0, 4)]),
    );
    const controller = new AbortController();
    void (async () => {
      try {
        const responses = await Promise.all(
          years.map((year) =>
            fetch(
              `/api/organizations/${orgId}/holidays?scope=mine&year=${year}`,
              { credentials: 'same-origin', signal: controller.signal },
            ),
          ),
        );
        const rows: CalendarHoliday[] = [];
        for (const response of responses) {
          if (!response.ok) continue;
          const data = (await response.json()) as CalendarHolidaysResponse;
          rows.push(...data.holidays);
        }
        if (!controller.signal.aborted) setHolidays(rows);
      } catch {
        // A failed holiday read leaves the calendar unmarked; time tracking is
        // unaffected, so it never surfaces an error to the member.
      }
    })();
    return () => controller.abort();
  }, [orgId, range.from, range.to]);

  /** The visible range's holidays, keyed by ISO day — at most one marker per cell. */
  const holidaysByDate = useMemo(() => {
    const map = new Map<string, CalendarHoliday>();
    for (const holiday of holidays) {
      if (holiday.date >= range.from && holiday.date <= range.to && !map.has(holiday.date)) {
        map.set(holiday.date, holiday);
      }
    }
    return map;
  }, [holidays, range.from, range.to]);

  function stepPeriod(direction: -1 | 1): void {
    setAnchor((current) => {
      if (view === 'monthly') return addMonths(current, direction);
      if (view === 'weekly') return addDays(current, direction * 7);
      return addDays(current, direction);
    });
  }

  function openCreate(): void {
    setModalEntry(null);
    setModalDate(view === 'daily' ? anchor : today);
    setModalOpen(true);
  }

  function openEdit(entry: TimeEntry): void {
    setModalEntry(entry);
    setModalDate(entry.date);
    setModalOpen(true);
  }

  /** Monthly/weekly cell click → drill into the daily view for that date. */
  function drillToDay(date: string): void {
    setAnchor(date);
    setView('daily');
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/time-entries/${deleteTarget.id}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (response.ok) {
        setDeleteTarget(null);
        setDeleting(false);
        showToast('toast-entry-deleted', TIME_TRACKING_MESSAGES.toastEntryDeleted);
        await load();
        return;
      }
      const body = await response.json().catch(() => null);
      showToast('toast-entry-deleted', body?.message ?? TIME_TRACKING_MESSAGES.genericError, 'error');
    } catch {
      showToast('toast-entry-deleted', TIME_TRACKING_MESSAGES.genericError, 'error');
    }
    setDeleting(false);
  }

  const periodLabel =
    view === 'monthly'
      ? formatMonthLabel(anchor)
      : view === 'weekly'
        ? formatWeekLabel(anchor, weekStartsOn)
        : formatDayLabel(anchor, today);

  const memberOptions = [
    { value: MY_TIME, label: 'My time' },
    ...members.map((m) => ({ value: m.id, label: m.fullName })),
  ];
  const memberName = members.find((m) => m.id === memberFilter)?.fullName ?? '';
  const isEmpty = entries !== null && entries.length === 0;
  const emptyMessage =
    view === 'daily' && anchor === today
      ? TIME_TRACKING_MESSAGES.emptyToday
      : TIME_TRACKING_MESSAGES.emptyPeriod;

  return (
    <div data-testid="tt-page">
      <PageHeader title="Time Tracking" />

      <TimerBar orgId={orgId} projects={projects} onAddEntry={openCreate} onChanged={() => void load()} />

      {/* Toolbar: member filter + view toggle (left), period nav (right). */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {isReviewer && (
          <div style={{ minWidth: 190 }}>
            <Select
              value={optionFor(memberOptions, memberFilter)}
              options={memberOptions}
              onChange={(option) => setMemberFilter(valueOf(option))}
              data-testid="tt-member-filter"
            />
          </div>
        )}

        {/* §87 — the three-segment consumer. Reports' scope switch collapsed onto
            `ToggleButton` with two, and this is the one that made the widening a widening
            rather than a guess: one control, three answers, one tab stop. */}
        <ToggleButton
          aria-label="View"
          selectedValue={view}
          onChange={(next) => setView(next as TimeView)}
          options={[
            { value: 'daily', label: 'Daily', testId: 'tt-view-daily' },
            { value: 'weekly', label: 'Weekly', testId: 'tt-view-weekly' },
            { value: 'monthly', label: 'Monthly', testId: 'tt-view-monthly' },
          ]}
          /* The row owns the spacing between its controls; the control does not add its own.
             Nothing else: §49's `width: 100%` is what stops the three segments collapsing on
             top of each other in a flex row, and the per-segment cap is what keeps it from
             eating the row. Overriding either brings the collapse straight back. */
          style={{ marginBottom: 0 }}
        />

        {/* Spec 16 §Filter chips — Billable / Non-Billable, both on by default;
            state persists in the URL. §71's `pressed`, which is the system's one reading of
            *chosen*: these are two independent switches rather than one choice with two
            answers, so they are not a `ToggleButton`. */}
        <div role="group" aria-label="Billable filter" style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
          <Button
            data-testid="time-grid-filter-billable"
            data-active={showBillable ? 'true' : 'false'}
            pressed={showBillable}
            onClick={() => updateBillable(!showBillable, showNonBillable)}
          >
            Billable
          </Button>
          <Button
            data-testid="time-grid-filter-nonbillable"
            data-active={showNonBillable ? 'true' : 'false'}
            pressed={showNonBillable}
            onClick={() => updateBillable(showBillable, !showNonBillable)}
          >
            Non-billable
          </Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginLeft: 'auto' }}>
          <Button data-testid="tt-period-today" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <IconButton
            data-testid="tt-period-prev"
            label="Previous period"
            onClick={() => stepPeriod(-1)}
          >
            <ChevronLeftIcon />
          </IconButton>
          <div
            data-testid="tt-period-label"
            style={{
              minWidth: 150,
              textAlign: 'center',
              fontWeight: 'var(--font-weight-semibold)',
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-primary)',
            }}
          >
            {periodLabel}
          </div>
          <IconButton
            data-testid="tt-period-next"
            label="Next period"
            onClick={() => stepPeriod(1)}
          >
            <ChevronRightIcon />
          </IconButton>
        </div>
      </div>

      {/* Admin context banner when viewing another member's entries. It reports a *state* —
          true for exactly as long as the filter is set — so it carries no dismiss (§24). */}
      {isReviewer && memberFilter !== MY_TIME && (
        <InfoBanner variant="info" style={{ marginBottom: 'var(--space-6)' }}>
          Viewing {memberName}&rsquo;s entries. You can edit or delete any block by clicking it.
        </InfoBanner>
      )}

      {/* Spec organization/03 §Accessibility — one polite live region for the whole
          page; a holiday marker announces its name and paid hours into it on focus. */}
      <HolidayLiveRegion message={holidayAnnouncement} />

      {/* Active view / states. The calendar/grid ALWAYS renders once loaded — navigating to
          a period with no entries still shows the empty grid (all days present), with a
          modest "no entries" note beneath it rather than replacing the whole view. */}
      {loading || entries === null ? (
        /* The view-shaped placeholder is gone. The app ships no `Skeleton` and the system's
           position on waiting is `Preloader` (§23, §69) — an outline is worth drawing only
           where the shape it stands in for is already known, which is why the members list
           keeps its own and three calendar views that each have a different shape do not. */
        <div
          data-testid="tt-loading-skeleton"
          role="status"
          aria-label="Loading time entries"
          style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12) 0' }}
        >
          <Preloader />
        </div>
      ) : (
        <>
          {view === 'monthly' ? (
            <MonthlyView
              anchorDate={anchor}
              today={today}
              weekStartsOn={weekStartsOn}
              entries={entries}
              holidaysByDate={holidaysByDate}
              onHolidayAnnounce={setHolidayAnnouncement}
              onSelectDay={drillToDay}
            />
          ) : view === 'weekly' ? (
            <WeeklyView
              anchorDate={anchor}
              today={today}
              tz={tz}
              weekStartsOn={weekStartsOn}
              entries={entries}
              holidaysByDate={holidaysByDate}
              onHolidayAnnounce={setHolidayAnnouncement}
              onSelectDay={drillToDay}
            />
          ) : (
            <DailyView
              date={anchor}
              today={today}
              tz={tz}
              entries={entries}
              canManage={canManage}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              holidaysByDate={holidaysByDate}
              onHolidayAnnounce={setHolidayAnnouncement}
            />
          )}

          {isEmpty && (
            /* **Not `EmptyState`**, and spec 12 §Empty is the reason: the active view still
               renders — every day of the period is there with a zero total — and this is a
               note *beneath* it. `EmptyState` is "a single centred grey message where a list
               would be", and it drops 150px to sit in the space that list would have filled.
               There is no such space here, because the grid is still in it. */
            <div
              data-testid="tt-empty-state"
              style={{
                marginTop: 'var(--space-6)',
                padding: 'var(--space-5) var(--space-6)',
                textAlign: 'center',
                fontSize: 'var(--font-size-s)',
                color: 'var(--text-secondary)',
              }}
            >
              {emptyMessage}
            </div>
          )}
        </>
      )}

      <TimeEntryModal
        open={modalOpen}
        orgId={orgId}
        projects={projects}
        entry={modalEntry}
        defaultDate={modalDate}
        today={today}
        tz={tz}
        createMembershipId={memberFilter === MY_TIME ? null : memberFilter}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
      />

      {/* §41 — `closeOnAccept={false}`, because this confirmation awaits a result: the row is
          gone only once the server says so, and `busy` blocks both controls until then. */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete time entry"
        description={TIME_TRACKING_MESSAGES.deleteConfirm}
        acceptBtnText="Delete"
        declineBtnText="Cancel"
        acceptTestId="tt-entry-delete-confirm"
        declineTestId="tt-entry-delete-cancel"
        busy={deleting}
        closeOnAccept={false}
        onAccept={() => void handleDeleteConfirm()}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
