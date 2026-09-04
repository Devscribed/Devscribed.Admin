'use client';

import type { CSSProperties } from 'react';
import { formatDurationHuman, formatWallClockInTz, splitByBillable } from '@devscribed/validation';
import {
  dayNumber,
  isWeekend,
  weekDates,
  weekdayMon0,
  type WeekStart,
} from './date-utils';
import {
  formatDurationSpoken,
  isTimedEntry,
  projectColor,
  TimeGrid,
  type BlockColor,
  type BlockPlacement,
} from './TimeGrid';
import type { CalendarHoliday, TimeEntry } from './types';

const WEEKDAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Weekly Outlook-style time grid (spec 12 mock, state 02) — replaces the old project×day
 * table. An hour gutter plus seven day columns, ordered from the account's `weekStartsOn`;
 * timed entries render as positioned blocks within their day column, duration-only entries
 * drop to a strip below the grid (noted per day). Each day header carries its own total;
 * a footer line carries the week grand total. Clicking a block drills into the daily view
 * for that day. Every total is client-aggregated from `entries`.
 *
 * Spec organization/03 requirement 10 adds a read-only holiday marker under the day
 * header. It is not a click target and does not change how time is logged into the
 * column (requirement 11).
 */
export function WeeklyView({
  anchorDate,
  today,
  tz,
  weekStartsOn,
  entries,
  holidaysByDate,
  onHolidayAnnounce,
  onSelectDay,
}: {
  anchorDate: string;
  today: string;
  /** The viewer's effective timezone (`Account.timezone`, or `'UTC'`). */
  tz: string;
  weekStartsOn: WeekStart;
  entries: TimeEntry[];
  /** Spec organization/03 — the visible week's holidays, keyed by ISO day. */
  holidaysByDate?: Map<string, CalendarHoliday>;
  onHolidayAnnounce?: (message: string) => void;
  onSelectDay: (date: string) => void;
}) {
  const days = weekDates(anchorDate, weekStartsOn);

  // Spec 16 §Weekly view — the day header shows billable time as the primary total
  // and, when non-billable time also exists in the day, a smaller `+{n}h nb` sub-line.
  // Group entries by date, then split each bucket into billable + non-billable minutes.
  const entriesByDate = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const bucket = entriesByDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else entriesByDate.set(entry.date, [entry]);
  }
  const weekTotal = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

  const columns = days.map((date) => {
    const { billableMinutes, nonBillableMinutes } = splitByBillable(entriesByDate.get(date) ?? []);
    return {
      date,
      isToday: date === today,
      isWeekend: isWeekend(date),
      header: (
        <DayHeader
          date={date}
          isToday={date === today}
          billableMinutes={billableMinutes}
          nonBillableMinutes={nonBillableMinutes}
          isHoliday={holidaysByDate?.has(date) ?? false}
        />
      ),
    };
  });

  // Duration-only entries for the whole week, kept in day order for the strip.
  const durationOnly = entries
    .filter((e) => !isTimedEntry(e))
    .sort((a, b) => a.date.localeCompare(b.date));

  const strip =
    durationOnly.length > 0 ? (
      <div
        style={{
          borderTop: 'var(--border-width-hairline) solid var(--border-default)',
          background: 'var(--surface-sunken)',
          padding: 'var(--space-4) var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-6)',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 'var(--font-weight-medium)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          Duration-only
        </span>
        {durationOnly.map((entry) => (
          <DurationChip key={entry.id} entry={entry} onSelectDay={onSelectDay} />
        ))}
      </div>
    ) : null;

  return (
    <div>
      <TimeGrid
        columns={columns}
        entries={entries}
        today={today}
        tz={tz}
        gridTestId="tt-weekly-grid"
        durationStrip={strip}
        holidaysByDate={holidaysByDate}
        onHolidayAnnounce={onHolidayAnnounce}
        renderBlock={(entry, placement) => (
          <WeeklyBlock entry={entry} placement={placement} tz={tz} onSelectDay={onSelectDay} />
        )}
      />

      <div
        data-testid="tt-week-total"
        style={{
          marginTop: 'var(--space-6)',
          textAlign: 'right',
          fontSize: 'var(--font-size-s)',
          color: 'var(--text-tertiary)',
        }}
      >
        Total this week{' '}
        <span style={{ fontWeight: 'var(--font-weight-semibold)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
          {formatDurationHuman(weekTotal)}
        </span>
      </div>
    </div>
  );
}

/** A day column header: weekday + date, tinted for today, with the per-day total. On
 * a holiday day the header keeps the holiday tint as a running-header cue, and the
 * full-column overlay in the grid body carries the marker, the name and the
 * `time-cell-{date}-holiday-marker` test id. */
function DayHeader({
  date,
  isToday,
  billableMinutes,
  nonBillableMinutes,
  isHoliday,
}: {
  date: string;
  isToday: boolean;
  billableMinutes: number;
  nonBillableMinutes: number;
  isHoliday: boolean;
}) {
  const name = WEEKDAY_ABBR[weekdayMon0(date)];
  const totalMinutes = billableMinutes + nonBillableMinutes;
  return (
    <div
      style={{
        background: isHoliday ? 'var(--surface-holiday)' : undefined,
        // `minHeight` (not fixed height) so the split billable / non-billable
        // sub-line has room to render — spec 16 requires two lines when both
        // totals are non-zero, and 64px only fits one.
        minHeight: 64,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        padding: 'var(--space-2) var(--space-1)',
      }}
    >
      <span
        style={{
          fontWeight: 'var(--font-weight-medium)',
          fontSize: 'var(--font-size-xs)',
          color: isToday ? 'var(--color-blue)' : 'var(--text-secondary)',
        }}
      >
        {name}
        {isToday ? ' · Today' : ''}
      </span>
      <span
        style={{
          fontWeight: 'var(--font-weight-semibold)',
          fontSize: 'var(--font-size-xl)',
          fontVariantNumeric: 'tabular-nums',
          color: isToday ? 'var(--color-blue)' : 'var(--text-primary)',
        }}
      >
        {dayNumber(date)}
      </span>
      {/* Spec 16 — the day total splits into a primary billable line and, when the
          day also has non-billable time, a smaller `+{n}h nb` sub-line. Both totals
          are exposed as `data-*` attributes so an E2E can assert the split without
          parsing the display text. */}
      <span
        data-testid={`tt-weekly-day-total-${date}`}
        data-billable-minutes={billableMinutes}
        data-nonbillable-minutes={nonBillableMinutes}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          lineHeight: 1.05,
          fontSize: 'var(--font-size-xs)',
          fontVariantNumeric: 'tabular-nums',
          color: totalMinutes > 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
        }}
      >
        <span>{totalMinutes > 0 ? formatDurationHuman(billableMinutes) : '—'}</span>
        {nonBillableMinutes > 0 ? (
          <span
            style={{
              marginTop: 1,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
              lineHeight: 1.05,
            }}
          >
            +{formatDurationHuman(nonBillableMinutes)} nb
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** A positioned weekly block — a button that drills into the daily view for its date. */
function WeeklyBlock({
  entry,
  placement,
  tz,
  onSelectDay,
}: {
  entry: TimeEntry;
  placement: BlockPlacement;
  tz: string;
  onSelectDay: (date: string) => void;
}) {
  const { color } = placement;
  const nonBillable = entry.billable === false;
  const timeRange = `${formatWallClockInTz(entry.startTime as string, tz)} – ${formatWallClockInTz(
    entry.endTime as string,
    tz,
  )}`;
  const project = entry.projectId ? entry.projectName ?? '—' : '(no project)';
  // Spec 16 §Accessibility — the "NB" visual tag has an audio equivalent as a leading
  // `Non-billable` in the aria-label, so the dashed-vs-solid distinction never depends
  // on sight alone.
  const ariaLabel = [
    nonBillable ? 'Non-billable' : null,
    `${formatWallClockInTz(entry.startTime as string, tz)} to ${formatWallClockInTz(
      entry.endTime as string,
      tz,
    )}`,
    project,
    entry.task ?? '',
    formatDurationSpoken(entry.durationMinutes),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      data-testid={`tt-weekly-entry-${entry.id}`}
      data-billable={nonBillable ? 'false' : 'true'}
      aria-label={ariaLabel}
      onClick={() => onSelectDay(entry.date)}
      style={blockButtonStyle(color, nonBillable)}
    >
      {nonBillable ? <NBTag /> : null}
      <span style={{ fontSize: 'var(--font-size-xs)', opacity: 0.85 }}>{timeRange}</span>
      <span
        style={{
          fontWeight: 'var(--font-weight-semibold)',
          fontSize: 'var(--font-size-xs)',
          marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {project}
      </span>
      {entry.task ? (
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            opacity: 0.75,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entry.task}
        </span>
      ) : null}
    </button>
  );
}

/** A duration-only chip below the grid, labeled with its weekday; drills into that day. */
function DurationChip({
  entry,
  onSelectDay,
}: {
  entry: TimeEntry;
  onSelectDay: (date: string) => void;
}) {
  const color = projectColor(entry.projectId);
  const nonBillable = entry.billable === false;
  const project = entry.projectId ? entry.projectName ?? '—' : '(no project)';
  const day = WEEKDAY_ABBR[weekdayMon0(entry.date)];
  return (
    <button
      type="button"
      data-testid={`tt-weekly-entry-${entry.id}`}
      data-billable={nonBillable ? 'false' : 'true'}
      onClick={() => onSelectDay(entry.date)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-5)',
        borderRadius: 'var(--radius-s)',
        // Spec 16 §Weekly view — dashed border + sunken background + muted text for
        // non-billable chips; billable keeps the project palette treatment.
        border: nonBillable ? 'var(--border-width-control) dashed var(--border-default)' : 'none',
        borderLeft: nonBillable ? '3px dashed var(--border-default)' : `3px solid ${color.rail}`,
        background: nonBillable ? 'var(--surface-sunken)' : color.bg,
        color: nonBillable ? 'var(--text-secondary)' : color.text,
        fontSize: 'var(--font-size-xs)',
        cursor: 'pointer',
      }}
    >
      {nonBillable ? <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>NB</span> : null}
      {day} · {project}
      {entry.task ? ` · ${entry.task}` : ''} · {formatDurationHuman(entry.durationMinutes)}
    </button>
  );
}

/** Spec 16 — the small "NB" corner tag pinned to a non-billable grid block. */
function NBTag() {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 4,
        right: 6,
        fontWeight: 'var(--font-weight-medium)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-s)',
        padding: '0 var(--space-1)',
        lineHeight: 1.3,
      }}
    >
      NB
    </span>
  );
}

/** Shared style for a grid block's clickable face. Spec 16 — non-billable adds a
 * dashed border in `--border-strong`, swaps the background for `--bg-sunken`, and
 * mutes the text ink; `position: relative` lets the "NB" tag pin to a corner. */
function blockButtonStyle(color: BlockColor, nonBillable: boolean): CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    textAlign: 'left',
    padding: '6px 8px',
    // §Phase 2 settled `--border-strong` onto `--border-default` at `--border-width-control`:
    // yellow said "a form control's edge" in ink, the system says it in width.
    border: nonBillable ? 'var(--border-width-control) dashed var(--border-default)' : 'none',
    borderLeft: nonBillable ? '3px dashed var(--border-default)' : `3px solid ${color.rail}`,
    borderRadius: 'var(--radius-s)',
    background: nonBillable ? 'var(--surface-sunken)' : color.bg,
    color: nonBillable ? 'var(--text-secondary)' : color.text,
    cursor: 'pointer',
    overflow: 'hidden',
  };
}
