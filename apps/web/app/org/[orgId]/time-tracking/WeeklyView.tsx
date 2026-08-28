'use client';

import type { CSSProperties } from 'react';
import { formatDurationHuman, formatWallClockInTz } from '@devscribed/validation';
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
import type { TimeEntry } from './types';

const WEEKDAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Weekly Outlook-style time grid (spec 12 mock, state 02) — replaces the old project×day
 * table. An hour gutter plus seven day columns, ordered from the account's `weekStartsOn`;
 * timed entries render as positioned blocks within their day column, duration-only entries
 * drop to a strip below the grid (noted per day). Each day header carries its own total;
 * a footer line carries the week grand total. Clicking a block drills into the daily view
 * for that day. Every total is client-aggregated from `entries`.
 */
export function WeeklyView({
  anchorDate,
  today,
  tz,
  weekStartsOn,
  entries,
  onSelectDay,
}: {
  anchorDate: string;
  today: string;
  /** The viewer's effective timezone (`Account.timezone`, or `'UTC'`). */
  tz: string;
  weekStartsOn: WeekStart;
  entries: TimeEntry[];
  onSelectDay: (date: string) => void;
}) {
  const days = weekDates(anchorDate, weekStartsOn);

  const dayTotals = new Map<string, number>();
  let weekTotal = 0;
  for (const entry of entries) {
    dayTotals.set(entry.date, (dayTotals.get(entry.date) ?? 0) + entry.durationMinutes);
    weekTotal += entry.durationMinutes;
  }

  const columns = days.map((date) => ({
    date,
    isToday: date === today,
    isWeekend: isWeekend(date),
    header: (
      <DayHeader
        date={date}
        isToday={date === today}
        minutes={dayTotals.get(date) ?? 0}
      />
    ),
  }));

  // Duration-only entries for the whole week, kept in day order for the strip.
  const durationOnly = entries
    .filter((e) => !isTimedEntry(e))
    .sort((a, b) => a.date.localeCompare(b.date));

  const strip =
    durationOnly.length > 0 ? (
      <div
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-panel-2)',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-11)',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
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
        renderBlock={(entry, placement) => (
          <WeeklyBlock entry={entry} placement={placement} tz={tz} onSelectDay={onSelectDay} />
        )}
      />

      <div
        data-testid="tt-week-total"
        style={{
          marginTop: 14,
          textAlign: 'right',
          fontFamily: 'var(--font-text)',
          fontSize: 'var(--fs-14)',
          color: 'var(--text-sub)',
        }}
      >
        Total this week{' '}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text)' }}>
          {formatDurationHuman(weekTotal)}
        </span>
      </div>
    </div>
  );
}

/** A day column header: weekday + date, tinted for today, with the per-day total. */
function DayHeader({
  date,
  isToday,
  minutes,
}: {
  date: string;
  isToday: boolean;
  minutes: number;
}) {
  const name = WEEKDAY_ABBR[weekdayMon0(date)];
  return (
    <div
      style={{
        height: 64,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '8px 4px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-11)',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: isToday ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        {name}
        {isToday ? ' · Today' : ''}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-22)',
          letterSpacing: -0.5,
          color: isToday ? 'var(--accent)' : 'var(--text)',
        }}
      >
        {dayNumber(date)}
      </span>
      <span
        data-testid={`tt-weekly-day-total-${date}`}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'var(--fs-12)',
          color: minutes > 0 ? 'var(--text-sub)' : 'var(--text-faint)',
        }}
      >
        {minutes > 0 ? formatDurationHuman(minutes) : '—'}
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
  const timeRange = `${formatWallClockInTz(entry.startTime as string, tz)} – ${formatWallClockInTz(
    entry.endTime as string,
    tz,
  )}`;
  const project = entry.projectId ? entry.projectName ?? '—' : '(no project)';
  const ariaLabel = [
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
      aria-label={ariaLabel}
      onClick={() => onSelectDay(entry.date)}
      style={blockButtonStyle(color)}
    >
      <span style={{ fontWeight: 500, fontSize: 'var(--fs-11)', opacity: 0.85 }}>{timeRange}</span>
      <span
        style={{
          fontWeight: 600,
          fontSize: 'var(--fs-13)',
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
            fontSize: 'var(--fs-11)',
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
  const project = entry.projectId ? entry.projectName ?? '—' : '(no project)';
  const day = WEEKDAY_ABBR[weekdayMon0(entry.date)];
  return (
    <button
      type="button"
      data-testid={`tt-weekly-entry-${entry.id}`}
      onClick={() => onSelectDay(entry.date)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 'var(--radius-sm)',
        border: 'none',
        borderLeft: `3px solid ${color.rail}`,
        background: color.bg,
        color: color.text,
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: 'var(--fs-13)',
        cursor: 'pointer',
      }}
    >
      {day} · {project}
      {entry.task ? ` · ${entry.task}` : ''} · {formatDurationHuman(entry.durationMinutes)}
    </button>
  );
}

/** Shared style for a grid block's clickable face. */
function blockButtonStyle(color: BlockColor): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    textAlign: 'left',
    padding: '6px 8px',
    border: 'none',
    borderLeft: `3px solid ${color.rail}`,
    borderRadius: 'var(--radius-sm)',
    background: color.bg,
    color: color.text,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
    overflow: 'hidden',
  };
}
