'use client';

import type { ReactNode } from 'react';
import { formatWallClockInTz, gmtLabel, minutesOfDayInTz, HOLIDAY_MESSAGES } from '@devscribed/validation';
import { StarIcon } from '@/layout/icons';
import type { TimeEntry } from './types';
import type { CalendarHoliday } from './types';

/**
 * Shared Outlook-style time grid for the Weekly and Daily views (spec 12 mock, states
 * 02–04). A left hour gutter plus one-or-more day columns; timed entries render as
 * absolutely-positioned blocks whose top/height derive from their start/end minutes in the
 * viewer's effective timezone (spec 12 change). The two views differ only in their column
 * set, their block content, and their duration-only strip, so this component owns the
 * chrome + geometry (hour window, positioning, lane-packing, now-line) and defers the
 * block/strip rendering to callbacks. All time math reads the effective tz (the caller's
 * `Account.timezone`, or `'UTC'` when unset), via the shared `@devscribed/validation`
 * helpers, so a Berlin 11:07 entry sits on the 11:00 row and the gutter shows "GMT+2".
 */

const GUTTER = 64; // px — hour-gutter width
const HOUR_HEIGHT = 48; // px — one hour row
const PX_PER_MINUTE = HOUR_HEIGHT / 60;
const MIN_BLOCK_HEIGHT = 22; // px — keep a very short entry legible/clickable

/** A block colour trio (background / left rail / text). */
export interface BlockColor {
  bg: string;
  rail: string;
  text: string;
}

/**
 * **A categorical palette, and deliberately not the status palette.** These five hues answer
 * *which project*, and the system's green / yellow / red / cyan answer *how something is
 * going* — painting a project in the red that means `inactive` says something false about it,
 * which is the call §32 and §59 already made for `Badge`. So they are hues chosen to be told
 * apart, and they carry no meaning at all beyond "not the one next to it".
 *
 * They are not tokens for the same reason `MembersLoadingSkeleton` is not a component: one
 * screen reads them, and a name in the shared vocabulary that one call site will ever look up
 * is noise. They stay `oklch` literals with the ramp stated once, here.
 *
 * The set is re-anchored on the system's own blue rather than on the violet it used to lead
 * with — that violet was the previous design's accent, and leading a palette with a hue this
 * product no longer has is how a leftover survives a repaint.
 *
 * **There is no amber in it, and that is deliberate.** §91 gives a holiday its own warm ground,
 * and a holiday tints the *whole day column* behind the blocks logged on it — so an amber block
 * on an amber column is a block nobody can see. A categorical hue is free to be any hue that is
 * not already saying something; this one is.
 *
 * **Colour is never the sole signal**: every block also carries the project's name as text.
 */
const NO_PROJECT_COLOR: BlockColor = {
  bg: 'var(--surface-sunken)',
  rail: 'var(--text-secondary)',
  text: 'var(--text-tertiary)',
};
const PROJECT_PALETTE: BlockColor[] = [
  { bg: 'oklch(0.95 0.04 250)', rail: 'oklch(0.55 0.19 250)', text: 'oklch(0.38 0.16 250)' }, // blue
  { bg: 'oklch(0.96 0.03 180)', rail: 'oklch(0.55 0.11 180)', text: 'oklch(0.35 0.11 180)' }, // teal
  { bg: 'oklch(0.95 0.04 160)', rail: 'oklch(0.58 0.11 160)', text: 'oklch(0.35 0.1 160)' }, // green
  { bg: 'oklch(0.95 0.04 300)', rail: 'oklch(0.52 0.17 300)', text: 'oklch(0.38 0.15 300)' }, // violet
  { bg: 'oklch(0.96 0.03 340)', rail: 'oklch(0.55 0.14 340)', text: 'oklch(0.4 0.14 340)' }, // pink
];

/** Deterministic `projectId → palette` mapping (same char-sum discipline as the avatar
 * hue hash); `null` (no project) is always the neutral grey. */
export function projectColor(projectId: string | null): BlockColor {
  if (!projectId) return NO_PROJECT_COLOR;
  let sum = 0;
  for (const ch of projectId) sum += ch.charCodeAt(0);
  return PROJECT_PALETTE[(sum * 7) % PROJECT_PALETTE.length];
}

/** An entry that can be placed on the grid — both endpoints present. */
export function isTimedEntry(entry: TimeEntry): boolean {
  return Boolean(entry.startTime && entry.endTime);
}

/** A spoken duration ("2 hours 30 minutes") for block `aria-label`s (spec §Accessibility),
 * distinct from the terse "2h 30m" shown on screen. */
export function formatDurationSpoken(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (mins > 0) parts.push(`${mins} minute${mins === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(' ') : '0 minutes';
}

/** The visible hour window [startHour, endHour): entries' earliest start −1 to latest end
 * +1, always covering at least the 07:00–20:00 default so a sparse day still reads as a
 * work day. Clamped to [0, 24]. */
function hourWindow(timed: TimeEntry[], tz: string): { startHour: number; endHour: number } {
  if (timed.length === 0) return { startHour: 7, endHour: 20 };
  let earliest = Infinity;
  let latest = -Infinity;
  for (const entry of timed) {
    earliest = Math.min(earliest, Math.floor(minutesOfDayInTz(entry.startTime as string, tz) / 60));
    latest = Math.max(latest, Math.ceil(minutesOfDayInTz(entry.endTime as string, tz) / 60));
  }
  return {
    startHour: Math.max(0, Math.min(earliest - 1, 7)),
    endHour: Math.min(24, Math.max(latest + 1, 20)),
  };
}

/** Lane assignment within one day column: greedy left-to-right packing so overlapping
 * blocks sit side-by-side. Each entry gets a lane index and its cluster's lane count. */
interface Placed {
  entry: TimeEntry;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}
function packLanes(entries: TimeEntry[], tz: string): Placed[] {
  const sorted = entries
    .map((entry) => ({
      entry,
      startMin: minutesOfDayInTz(entry.startTime as string, tz),
      endMin: minutesOfDayInTz(entry.endTime as string, tz),
    }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;
  const laneEnds: number[] = []; // last end-minute per active lane

  const flush = (): void => {
    const lanes = laneEnds.length;
    for (const item of cluster) item.lanes = lanes;
    cluster = [];
    laneEnds.length = 0;
  };

  for (const item of sorted) {
    if (item.startMin >= clusterEnd && cluster.length > 0) flush();
    // First lane whose previous block has ended by this block's start.
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    const record: Placed = { ...item, lane, lanes: 1 };
    cluster.push(record);
    placed.push(record);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length > 0) flush();
  return placed;
}

/** One day column of the grid. */
export interface TimeGridColumn {
  date: string;
  isToday: boolean;
  isWeekend: boolean;
  /** The column's header content (weekday + date, totals, …). */
  header: ReactNode;
}

/** Geometry handed to `renderBlock` for one positioned entry. */
export interface BlockPlacement {
  top: number;
  height: number;
  /** CSS `left`/`width` expressions (percentage-based, gutter-aware, lane-split). */
  left: string;
  width: string;
  color: BlockColor;
}

export function TimeGrid({
  columns,
  entries,
  today,
  tz,
  gridTestId,
  renderBlock,
  durationStrip,
  cardHeight = 640,
  holidaysByDate,
  onHolidayAnnounce,
}: {
  columns: TimeGridColumn[];
  entries: TimeEntry[];
  today: string;
  /** The viewer's effective timezone (`Account.timezone`, or `'UTC'`) — drives every
   * wall-clock position, the now-line, and the gutter label. */
  tz: string;
  /** `data-testid` for the scrollable grid container (`tt-weekly-grid` / `tt-daily-list`). */
  gridTestId: string;
  renderBlock: (entry: TimeEntry, placement: BlockPlacement) => ReactNode;
  durationStrip?: ReactNode;
  cardHeight?: number;
  /** Spec organization/03 §10 — a full-column holiday overlay per holiday day. Logged
   * entries on the same day still render on top (they carry a higher z-index by
   * default). Keyed by ISO day, matching the column's `date`. */
  holidaysByDate?: Map<string, CalendarHoliday>;
  onHolidayAnnounce?: (message: string) => void;
}) {
  const n = columns.length;
  const timed = entries.filter(isTimedEntry);
  const { startHour, endHour } = hourWindow(timed, tz);
  const windowStartMin = startHour * 60;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const bodyHeight = hours.length * HOUR_HEIGHT;

  // The gutter-aware width of one day column, as a CSS expression.
  const colWidth = `((100% - ${GUTTER}px) / ${n})`;
  const columnLeft = (colIndex: number): string => `calc(${GUTTER}px + ${colIndex} * ${colWidth})`;

  const headerTemplate = `${GUTTER}px repeat(${n}, 1fr)`;

  // Now-line: only when today is a visible column and the current tz-local time is in window.
  const nowIso = new Date().toISOString();
  const nowMin = minutesOfDayInTz(nowIso, tz);
  const todayCol = columns.findIndex((c) => c.date === today);
  const showNow = todayCol !== -1 && nowMin >= windowStartMin && nowMin <= endHour * 60;
  const nowHHMM = formatWallClockInTz(nowIso, tz);
  const gutterLabel = gmtLabel(tz, new Date(nowIso));

  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: 'var(--border-width-hairline) solid var(--border-default)',
        borderRadius: 'var(--radius-l)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: cardHeight,
      }}
    >
      {/* Header + body share one scroll container so the vertical scrollbar's width
          is subtracted from both — otherwise the body's columns sit ~15px to the
          left of their headers. The header is `position: sticky` so it stays put
          while the body scrolls, and its own `background` covers the rows sliding
          behind it. */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
          scrollbarGutter: 'stable',
        }}
      >
        {/* Header row: gutter + per-day headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: headerTemplate,
            background: 'var(--surface-sunken)',
            borderBottom: 'var(--border-width-hairline) solid var(--border-default)',
            position: 'sticky',
            top: 0,
            zIndex: 5,
          }}
        >
          <div
            style={{
              borderRight: 'var(--border-width-hairline) solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'var(--font-weight-medium)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
            }}
          >
            {gutterLabel}
          </div>
          {columns.map((col) => (
            <div
              key={col.date}
              style={{
                borderRight: 'var(--border-width-hairline) solid var(--border-subtle)',
                background: 'transparent',
              }}
            >
              {col.header}
            </div>
          ))}
        </div>
        <div
          data-testid={gridTestId}
          style={{
            display: 'grid',
            gridTemplateColumns: headerTemplate,
            position: 'relative',
            minHeight: bodyHeight,
          }}
        >
          {/* Hour rows */}
          {hours.map((hour) => (
            <HourRow key={hour} hour={hour} columns={columns} />
          ))}

          {/* Spec organization/03 §10 — an all-day overlay per holiday column,
              rendered before the entry blocks so a logged entry on the same day sits
              on top (its wrapper has `zIndex: 3`). The overlay is the marker the
              spec's testid roster names, so its `data-testid` moves here from the
              header chip and satisfies TC-03-E2E-04. */}
          {holidaysByDate &&
            columns.map((col, colIndex) => {
              const holiday = holidaysByDate.get(col.date);
              if (!holiday) return null;
              return (
                <HolidayOverlay
                  key={`holiday-${col.date}`}
                  holiday={holiday}
                  bodyHeight={bodyHeight}
                  left={columnLeft(colIndex)}
                  width={`calc(${colWidth})`}
                  onFocusAnnounce={onHolidayAnnounce}
                />
              );
            })}

          {/* Positioned entry blocks, packed into lanes per column */}
          {columns.map((col, colIndex) => {
            const dayEntries = timed.filter((e) => e.date === col.date);
            const placed = packLanes(dayEntries, tz);
            return placed.map((p) => {
              const laneWidth = `((${colWidth} - 6px) / ${p.lanes})`;
              const left = `calc(${columnLeft(colIndex)} + 3px + ${p.lane} * ${laneWidth})`;
              const width = `calc(${laneWidth}${p.lanes > 1 ? ' - 2px' : ''})`;
              const top = (p.startMin - windowStartMin) * PX_PER_MINUTE;
              const height = Math.max(
                MIN_BLOCK_HEIGHT,
                (p.endMin - p.startMin) * PX_PER_MINUTE,
              );
              return (
                <div
                  key={p.entry.id}
                  style={{ position: 'absolute', top, height, left, width, zIndex: 3 }}
                >
                  {renderBlock(p.entry, {
                    top,
                    height,
                    left,
                    width,
                    color: projectColor(p.entry.projectId),
                  })}
                </div>
              );
            });
          })}

          {/* Now-line at the current UTC time in today's column */}
          {showNow && (
            <div
              role="separator"
              aria-label={`Current time, ${nowHHMM}`}
              style={{
                position: 'absolute',
                top: (nowMin - windowStartMin) * PX_PER_MINUTE,
                left: `calc(${columnLeft(todayCol)} + 3px)`,
                width: `calc(${colWidth} - 6px)`,
                height: 2,
                background: 'var(--status-error)',
                zIndex: 6,
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: -5,
                  top: -4,
                  width: 10,
                  height: 10,
                  borderRadius: 'var(--radius-circle)',
                  background: 'var(--status-error)',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {durationStrip}
    </div>
  );
}

/**
 * A full-column holiday block for a holiday day (spec organization/03 §10). It fills the
 * body height so the day reads as an all-day "off" — not the small chip an earlier
 * draft put under the date header — while sitting at `zIndex: 1` so a logged entry on
 * the same day (`zIndex: 3`) renders on top. Focus fires the live-region announcement
 * (§Accessibility); §91's holiday ground carries the whole visual signal, the star icon and
 * the name text carry the semantic one, and the tooltip mirrors the aria-label.
 */
function HolidayOverlay({
  holiday,
  bodyHeight,
  left,
  width,
  onFocusAnnounce,
}: {
  holiday: CalendarHoliday;
  bodyHeight: number;
  left: string;
  width: string;
  onFocusAnnounce?: (message: string) => void;
}) {
  const tooltip = HOLIDAY_MESSAGES.calendarTooltip(holiday.name);
  const announcement = HOLIDAY_MESSAGES.calendarAnnouncement(holiday.name, holiday.paidHours);
  return (
    <div
      data-testid={`time-cell-${holiday.date}-holiday-marker`}
      role="img"
      aria-label={tooltip}
      title={tooltip}
      tabIndex={0}
      onFocus={() => onFocusAnnounce?.(announcement)}
      onMouseEnter={() => onFocusAnnounce?.(announcement)}
      style={{
        position: 'absolute',
        top: 0,
        height: bodyHeight,
        left,
        width,
        zIndex: 1,
        background: 'var(--surface-holiday)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 'var(--space-1)',
        padding: 'var(--space-4) var(--space-3)',
        pointerEvents: 'auto',
        cursor: 'default',
        color: 'var(--text-primary)',
      }}
    >
      <StarIcon size={14} />
      <span
        style={{
          fontWeight: 'var(--font-weight-medium)',
          fontSize: 'var(--font-size-xs)',
          lineHeight: 1.3,
          textAlign: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {holiday.name}
      </span>
      <span
        style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}
      >
        {holiday.paidHours}h paid
      </span>
    </div>
  );
}

/** One hour's worth of grid cells: the gutter label plus a slot per day column. Rendered
 * as the scrollable background beneath the absolutely-positioned blocks. */
function HourRow({ hour, columns }: { hour: number; columns: TimeGridColumn[] }) {
  const label = `${String(hour).padStart(2, '0')}:00`;
  return (
    <>
      <div
        style={{
          borderRight: 'var(--border-width-hairline) solid var(--border-subtle)',
          borderBottom: 'var(--border-width-hairline) dashed var(--border-subtle)',
          height: HOUR_HEIGHT,
          padding: '2px var(--space-3) 0',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'flex-start',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
        }}
      >
        {label}
      </div>
      {columns.map((col) => (
        <div
          key={col.date}
          style={{
            borderRight: 'var(--border-width-hairline) solid var(--border-subtle)',
            borderBottom: 'var(--border-width-hairline) dashed var(--border-subtle)',
            height: HOUR_HEIGHT,
            // Weekends render like any other day (spec 12 change B — some members work them).
            background: 'transparent',
          }}
        />
      ))}
    </>
  );
}
