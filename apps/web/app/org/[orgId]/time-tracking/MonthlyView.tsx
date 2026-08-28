'use client';

import { formatDurationHuman } from '@devscribed/validation';
import {
  dayNumber,
  formatDayLabel,
  monthGrid,
  weekdayAbbrHeaders,
  type WeekStart,
} from './date-utils';
import type { TimeEntry } from './types';

/** Heat tiers over a violet tint (DS gap — no `--heat-*` tokens yet; the mock hardcodes
 * oklch). Numeric hours ALWAYS accompany the tint, so colour is never the sole signal.
 * Empty cells are transparent regardless of weekend (spec 12 change B — weekends are not
 * muted; some members work them). */
function heatBackground(minutes: number): string {
  if (minutes <= 0) return 'transparent';
  const hours = minutes / 60;
  if (hours <= 4) return 'oklch(0.7 0.17 292 / 0.10)';
  if (hours <= 7) return 'oklch(0.7 0.17 292 / 0.20)';
  return 'oklch(0.7 0.17 292 / 0.34)';
}

/**
 * Monthly calendar heat-map (spec 12, default view). A 6-week Mon–Sun grid over the
 * anchor's month; each in-month cell shows its day number and the day's total hours
 * (client-aggregated from `entries`, one decimal or "—"), tinted by a few heat tiers.
 * Adjacent-month cells render greyed "—" and are not fetched. Clicking a cell drills into
 * the daily view for that date.
 */
export function MonthlyView({
  anchorDate,
  today,
  weekStartsOn,
  entries,
  onSelectDay,
}: {
  anchorDate: string;
  today: string;
  weekStartsOn: WeekStart;
  entries: TimeEntry[];
  onSelectDay: (date: string) => void;
}) {
  const minutesByDate = new Map<string, number>();
  for (const entry of entries) {
    minutesByDate.set(entry.date, (minutesByDate.get(entry.date) ?? 0) + entry.durationMinutes);
  }
  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const cells = monthGrid(anchorDate, weekStartsOn);
  const weekdayHeads = weekdayAbbrHeaders(weekStartsOn);

  return (
    <div>
      <div
        data-testid="tt-calendar-grid"
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-2xl)',
          overflow: 'hidden',
        }}
      >
        {/* Weekday header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            background: 'var(--bg-header)',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-11)',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {weekdayHeads.map((d) => (
            <div key={d} style={{ padding: '10px 12px', textAlign: 'left' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((cell, index) => {
            const isToday = cell.date === today;

            if (!cell.inMonth) {
              return (
                <div
                  key={cell.date + index}
                  aria-hidden
                  style={{
                    aspectRatio: '1.5 / 1',
                    borderTop: '1px solid var(--divider)',
                    borderLeft: index % 7 === 0 ? 'none' : '1px solid var(--divider)',
                    background: 'var(--bg-panel-2)',
                    padding: '8px 10px',
                    color: 'var(--text-faint)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 'var(--fs-13)' }}>{dayNumber(cell.date)}</span>
                  <span style={{ alignSelf: 'flex-end', fontSize: 'var(--fs-13)' }}>—</span>
                </div>
              );
            }

            const minutes = minutesByDate.get(cell.date) ?? 0;
            const hoursText = minutes > 0 ? formatDurationHuman(minutes) : '—';

            return (
              <button
                key={cell.date}
                type="button"
                data-testid={`tt-calendar-cell-${cell.date}`}
                onClick={() => onSelectDay(cell.date)}
                aria-label={`${formatDayLabel(cell.date, today)}, ${
                  minutes > 0 ? formatDurationHuman(minutes) : 'no time logged'
                }`}
                style={{
                  aspectRatio: '1.5 / 1',
                  border: 'none',
                  borderTop: '1px solid var(--divider)',
                  borderLeft: index % 7 === 0 ? 'none' : '1px solid var(--divider)',
                  outline: isToday ? '2px solid var(--accent)' : 'none',
                  outlineOffset: '-2px',
                  background: heatBackground(minutes),
                  padding: '8px 10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--fs-13)',
                    fontWeight: isToday ? 600 : 400,
                    color: isToday ? 'var(--accent)' : 'var(--text-sub)',
                  }}
                >
                  {dayNumber(cell.date)}
                </span>
                <span
                  data-testid={`tt-calendar-hours-${cell.date}`}
                  style={{
                    alignSelf: 'flex-end',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 'var(--fs-14)',
                    color: minutes > 0 ? 'var(--text)' : 'var(--text-faint)',
                  }}
                >
                  {hoursText}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        data-testid="tt-month-total"
        style={{
          marginTop: 14,
          textAlign: 'right',
          fontFamily: 'var(--font-text)',
          fontSize: 'var(--fs-14)',
          color: 'var(--text-sub)',
        }}
      >
        Total this month{' '}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text)' }}>
          {formatDurationHuman(totalMinutes)}
        </span>
      </div>
    </div>
  );
}
