'use client';

import { notFound } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { Select } from '@/ds';
import { ChevronLeftIcon, ChevronRightIcon } from '@/layout/icons';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import { TIME_TRACKING_MESSAGES, can, type Role } from '@devscribed/validation';
import type { MemberListResponse } from '../members/types';
import type { ProjectsResponse } from '../projects/types';
import { ConfirmDialog } from './ConfirmDialog';
import { DailyView } from './DailyView';
import { HolidayLiveRegion } from './HolidayMarker';
import { MonthlyView } from './MonthlyView';
import { SegmentedControl } from './SegmentedControl';
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
    setLoading(true);
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to });
      if (memberFilter !== MY_TIME) query.set('membershipId', memberFilter);
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
  }, [orgId, range.from, range.to, memberFilter]);

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
          gap: 12,
          marginBottom: 18,
        }}
      >
        {isReviewer && (
          <div style={{ minWidth: 190 }}>
            <Select
              value={memberFilter}
              options={[
                { value: MY_TIME, label: 'My time' },
                ...members.map((m) => ({ value: m.id, label: m.fullName })),
              ]}
              onChange={(value: string) => setMemberFilter(value)}
              data-testid="tt-member-filter"
            />
          </div>
        )}

        <SegmentedControl<TimeView>
          ariaLabel="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'daily', label: 'Daily', testId: 'tt-view-daily' },
            { value: 'weekly', label: 'Weekly', testId: 'tt-view-weekly' },
            { value: 'monthly', label: 'Monthly', testId: 'tt-view-monthly' },
          ]}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button
            type="button"
            data-testid="tt-period-today"
            onClick={() => setAnchor(today)}
            style={{
              height: 34,
              padding: '0 12px',
              border: '1.5px solid var(--border-strong)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-panel)',
              color: 'var(--text-sub)',
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: 'var(--fs-13)',
              cursor: 'pointer',
            }}
          >
            Today
          </button>
          <PeriodArrow testId="tt-period-prev" label="Previous period" onClick={() => stepPeriod(-1)}>
            <ChevronLeftIcon />
          </PeriodArrow>
          <div
            data-testid="tt-period-label"
            style={{
              minWidth: 150,
              textAlign: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-16)',
              color: 'var(--text)',
            }}
          >
            {periodLabel}
          </div>
          <PeriodArrow testId="tt-period-next" label="Next period" onClick={() => stepPeriod(1)}>
            <ChevronRightIcon />
          </PeriodArrow>
        </div>
      </div>

      {/* Admin context banner when viewing another member's entries. */}
      {isReviewer && memberFilter !== MY_TIME && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent-border)',
            borderRadius: 'var(--radius-lg)',
            fontFamily: 'var(--font-text)',
            fontSize: 'var(--fs-13)',
            color: 'var(--text-sub)',
          }}
        >
          Viewing {memberName}&rsquo;s entries. You can edit or delete any block by clicking it.
        </div>
      )}

      {/* Spec organization/03 §Accessibility — one polite live region for the whole
          page; a holiday marker announces its name and paid hours into it on focus. */}
      <HolidayLiveRegion message={holidayAnnouncement} />

      {/* Active view / states. The calendar/grid ALWAYS renders once loaded — navigating to
          a period with no entries still shows the empty grid (all days present), with a
          modest "no entries" note beneath it rather than replacing the whole view. */}
      {loading || entries === null ? (
        <ViewSkeleton />
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
            <div
              data-testid="tt-empty-state"
              style={{
                marginTop: 14,
                padding: '12px 16px',
                textAlign: 'center',
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-14)',
                color: 'var(--text-faint)',
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete time entry"
        message={TIME_TRACKING_MESSAGES.deleteConfirm}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

/** A period-step chevron control (DS `IconButton`-style). */
function PeriodArrow({
  testId,
  label,
  onClick,
  children,
}: {
  testId: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        border: '1.5px solid var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-panel)',
        color: 'var(--text-sub)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/** Static view-shaped placeholder — the app ships no skeleton primitive (carried gap). */
function ViewSkeleton() {
  return (
    <div
      data-testid="tt-loading-skeleton"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 44, background: 'var(--bg-header)' }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 12,
            padding: '0 18px',
            minHeight: 56,
            alignItems: 'center',
            borderTop: '1px solid var(--divider)',
          }}
        >
          <div style={{ flex: 1, height: 16, borderRadius: 8, background: 'var(--bg-sunken)' }} />
          <div style={{ width: 80, height: 16, borderRadius: 8, background: 'var(--bg-sunken)' }} />
        </div>
      ))}
    </div>
  );
}
