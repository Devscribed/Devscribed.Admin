'use client';

import { useState, type CSSProperties } from 'react';
import { IconButton } from '@/ds';
import { PencilIcon, TrashIcon } from '@/layout/icons';
import { formatDurationHuman, formatWallClockInTz } from '@devscribed/validation';
import { formatDayLabel } from './date-utils';
import {
  formatDurationSpoken,
  isTimedEntry,
  projectColor,
  TimeGrid,
  type BlockColor,
  type BlockPlacement,
} from './TimeGrid';
import type { CalendarHoliday, TimeEntry } from './types';

/**
 * Daily Outlook-style grid (spec 12 mock, states 03–04). An hour gutter plus one wide day
 * column for the selected date; timed entries render as positioned blocks, duration-only
 * entries drop to a strip below the grid. Clicking a block opens its editor; hovering
 * reveals inline edit/delete controls (own entries for everyone, any entry for
 * admin/manager — `canManage` gates both). The day total is client-aggregated.
 */
export function DailyView({
  date,
  today,
  tz,
  entries,
  canManage,
  onEdit,
  onDelete,
  holidaysByDate,
  onHolidayAnnounce,
}: {
  date: string;
  today: string;
  /** The viewer's effective timezone (`Account.timezone`, or `'UTC'`). */
  tz: string;
  entries: TimeEntry[];
  canManage: boolean;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
  /** Spec organization/03 §10 — passed through to `TimeGrid`, which renders the
   * full-column amber overlay for the day when a holiday is present. */
  holidaysByDate?: Map<string, CalendarHoliday>;
  onHolidayAnnounce?: (message: string) => void;
}) {
  const holiday = holidaysByDate?.get(date);
  const durationOnly = entries.filter((e) => !isTimedEntry(e));
  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

  const header = (
    <div
      style={{
        height: 64,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        padding: '0 16px',
        // The header keeps the amber tint as a running cue when the day is a
        // holiday; the overlay in the grid body carries the marker + testid.
        background: holiday ? 'var(--holiday-bg)' : undefined,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-13)',
          color: date === today ? 'var(--accent)' : 'var(--text)',
        }}
      >
        {formatDayLabel(date, today)}
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-12)',
            color: 'var(--text-muted)',
          }}
        >
          Total logged
        </span>
        <span
          data-testid="tt-day-total"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-15)',
            color: 'var(--accent)',
          }}
        >
          {formatDurationHuman(totalMinutes)}
        </span>
      </span>
    </div>
  );

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
          Duration-only (no time set)
        </span>
        {durationOnly.map((entry) => (
          <DurationChip
            key={entry.id}
            entry={entry}
            canManage={canManage}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    ) : null;

  return (
    <TimeGrid
      columns={[{ date, isToday: date === today, isWeekend: false, header }]}
      entries={entries}
      today={today}
      tz={tz}
      gridTestId="tt-daily-list"
      durationStrip={strip}
      holidaysByDate={holidaysByDate}
      onHolidayAnnounce={onHolidayAnnounce}
      renderBlock={(entry, placement) => (
        <DailyBlock
          entry={entry}
          placement={placement}
          tz={tz}
          canManage={canManage}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    />
  );
}

/** A positioned block: a full-size button (opens the editor, carries the aria-label) with
 * hover-revealed edit/delete controls layered above it. */
function DailyBlock({
  entry,
  placement,
  tz,
  canManage,
  onEdit,
  onDelete,
}: {
  entry: TimeEntry;
  placement: BlockPlacement;
  tz: string;
  canManage: boolean;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { color } = placement;
  const timeRange = `${formatWallClockInTz(entry.startTime as string, tz)} – ${formatWallClockInTz(
    entry.endTime as string,
    tz,
  )}`;
  const project = entry.projectId ? entry.projectName ?? '—' : '(no project)';
  const duration = formatDurationHuman(entry.durationMinutes);
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
    <div
      data-testid={`tt-entry-row-${entry.id}`}
      style={{ position: 'relative', height: '100%' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => onEdit(entry)}
        style={blockButtonStyle(color)}
      >
        <span style={{ fontWeight: 500, fontSize: 'var(--fs-11)', opacity: 0.85 }}>
          {timeRange} · {duration}
        </span>
        <span
          style={{
            fontWeight: 600,
            fontSize: 'var(--fs-14)',
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {project}
          {entry.task ? <span style={{ fontWeight: 500 }}> · {entry.task}</span> : null}
        </span>
        {entry.description ? (
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
            {entry.description}
          </span>
        ) : null}
      </button>

      {canManage && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            display: 'flex',
            gap: 2,
            opacity: hovered ? 1 : 0,
            transition: 'opacity var(--duration-fast) var(--easing-standard)',
            background: 'var(--bg-panel)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <IconButton
            label="Edit entry"
            onClick={() => onEdit(entry)}
            data-testid={`tt-entry-edit-${entry.id}`}
          >
            <PencilIcon />
          </IconButton>
          <IconButton
            label="Delete entry"
            onClick={() => onDelete(entry)}
            data-testid={`tt-entry-delete-${entry.id}`}
          >
            <TrashIcon />
          </IconButton>
        </div>
      )}
    </div>
  );
}

/** A duration-only chip in the strip below the grid, with the same edit/delete controls. */
function DurationChip({
  entry,
  canManage,
  onEdit,
  onDelete,
}: {
  entry: TimeEntry;
  canManage: boolean;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
}) {
  const color = projectColor(entry.projectId);
  const project = entry.projectId ? entry.projectName ?? '—' : '(no project)';
  return (
    <span
      data-testid={`tt-entry-row-${entry.id}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px 6px 12px',
        borderRadius: 'var(--radius-sm)',
        borderLeft: `3px solid ${color.rail}`,
        background: color.bg,
        color: color.text,
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: 'var(--fs-13)',
      }}
    >
      <span>
        {project}
        {entry.task ? <span> · {entry.task}</span> : null} ·{' '}
        {formatDurationHuman(entry.durationMinutes)}
      </span>
      {canManage && (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <IconButton
            label="Edit entry"
            onClick={() => onEdit(entry)}
            data-testid={`tt-entry-edit-${entry.id}`}
          >
            <PencilIcon />
          </IconButton>
          <IconButton
            label="Delete entry"
            onClick={() => onDelete(entry)}
            data-testid={`tt-entry-delete-${entry.id}`}
          >
            <TrashIcon />
          </IconButton>
        </span>
      )}
    </span>
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
    padding: '8px 12px',
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
