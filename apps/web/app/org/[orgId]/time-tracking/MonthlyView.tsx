'use client';

import { formatDurationHuman, HOLIDAY_MESSAGES, splitByBillable } from '@devscribed/validation';
import {
  dayNumber,
  formatDayLabel,
  monthGrid,
  weekdayAbbrHeaders,
  type WeekStart,
} from './date-utils';
import { HolidayMarker } from './HolidayMarker';
import type { CalendarHoliday, TimeEntry } from './types';

/**
 * Three heat tiers, and they are the action blue at rising strength rather than the violet
 * the previous design's accent gave them. A ramp of one hue is the only honest way to draw
 * *more of the same thing*, and the hue has to be the one the product is in.
 *
 * They stay literals rather than becoming `--heat-*` tokens: one screen reads them, and the
 * three alphas are a ramp measured against each other, not three separate decisions the rest
 * of the system needs a name for.
 *
 * Numeric hours ALWAYS accompany the tint, so colour is never the sole signal. Empty cells are
 * transparent regardless of weekend (spec 12 change B — weekends are not muted; some members
 * work them).
 */
function heatBackground(minutes: number): string {
  if (minutes <= 0) return 'transparent';
  const hours = minutes / 60;
  if (hours <= 4) return 'rgba(0, 122, 255, 0.10)';
  if (hours <= 7) return 'rgba(0, 122, 255, 0.20)';
  return 'rgba(0, 122, 255, 0.34)';
}

/**
 * Monthly calendar heat-map (spec 12, default view). A 6-week Mon–Sun grid over the
 * anchor's month; each in-month cell shows its day number and the day's total hours
 * (client-aggregated from `entries`, one decimal or "—"), tinted by a few heat tiers.
 * Adjacent-month cells render greyed "—" and are not fetched. Clicking a cell drills into
 * the daily view for that date.
 *
 * Spec organization/03 requirement 10 adds a read-only holiday marker to the matching
 * cells. The tint is layered as an inset ring in `--border-holiday` OVER the heat
 * background, not instead of it: requirement 11 says a logged entry and a holiday
 * coexist, so the marker must survive a day that has hours on it. §91's holiday hue is
 * chosen so it can do that: today's ring is `--color-blue` and the heat ramp is the same
 * blue, so a holiday drawn in any blue at all would be a third one nobody could separate.
 */
export function MonthlyView({
  anchorDate,
  today,
  weekStartsOn,
  entries,
  holidaysByDate,
  onHolidayAnnounce,
  onSelectDay,
}: {
  anchorDate: string;
  today: string;
  weekStartsOn: WeekStart;
  entries: TimeEntry[];
  /** Spec organization/03 — the visible range's holidays, keyed by ISO day. */
  holidaysByDate?: Map<string, CalendarHoliday>;
  onHolidayAnnounce?: (message: string) => void;
  onSelectDay: (date: string) => void;
}) {
  // Spec 16 §Monthly view — each day cell splits its total into `{billable}h / {n}h nb`
  // when both are present. Group entries per date, then use the shared splitter so the
  // aggregation logic matches the Weekly view exactly.
  const entriesByDate = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const bucket = entriesByDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else entriesByDate.set(entry.date, [entry]);
  }
  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const cells = monthGrid(anchorDate, weekStartsOn);
  const weekdayHeads = weekdayAbbrHeaders(weekStartsOn);

  return (
    <div>
      <div
        data-testid="tt-calendar-grid"
        style={{
          background: 'var(--surface-card)',
          border: 'var(--border-width-hairline) solid var(--border-default)',
          borderRadius: 'var(--radius-l)',
          overflow: 'hidden',
        }}
      >
        {/* Weekday header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            background: 'var(--surface-sunken)',
            fontWeight: 'var(--font-weight-medium)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {weekdayHeads.map((d) => (
            <div key={d} style={{ padding: 'var(--space-4) var(--space-5)', textAlign: 'left' }}>
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
                    borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
                    borderLeft: index % 7 === 0 ? 'none' : 'var(--border-width-hairline) solid var(--border-subtle)',
                    background: 'var(--surface-sunken)',
                    padding: 'var(--space-3) var(--space-4)',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 'var(--font-size-xs)' }}>{dayNumber(cell.date)}</span>
                  <span style={{ alignSelf: 'flex-end', fontSize: 'var(--font-size-xs)' }}>—</span>
                </div>
              );
            }

            const { billableMinutes, nonBillableMinutes } = splitByBillable(
              entriesByDate.get(cell.date) ?? [],
            );
            const minutes = billableMinutes + nonBillableMinutes;
            const hoursText = minutes > 0 ? formatDurationHuman(billableMinutes) : '—';
            const holiday = holidaysByDate?.get(cell.date);

            return (
              <button
                key={cell.date}
                type="button"
                data-testid={`tt-calendar-cell-${cell.date}`}
                onClick={() => onSelectDay(cell.date)}
                onFocus={
                  holiday
                    ? () =>
                        onHolidayAnnounce?.(
                          HOLIDAY_MESSAGES.calendarAnnouncement(
                            holiday.name,
                            holiday.paidHours,
                          ),
                        )
                    : undefined
                }
                aria-label={`${formatDayLabel(cell.date, today)}, ${
                  minutes > 0 ? formatDurationHuman(minutes) : 'no time logged'
                }${holiday ? `, ${HOLIDAY_MESSAGES.calendarTooltip(holiday.name)}` : ''}`}
                style={{
                  aspectRatio: '1.5 / 1',
                  border: 'none',
                  borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
                  borderLeft: index % 7 === 0 ? 'none' : 'var(--border-width-hairline) solid var(--border-subtle)',
                  // Today's ring wins the outline; a holiday takes an inset box-shadow
                  // so a day can be both without either disappearing.
                  outline: isToday ? '2px solid var(--color-blue)' : 'none',
                  outlineOffset: '-2px',
                  boxShadow: holiday ? 'inset 0 0 0 2px var(--border-holiday)' : undefined,
                  background: holiday
                    ? `linear-gradient(var(--surface-holiday), var(--surface-holiday)), ${heatBackground(minutes)}`
                    : heatBackground(minutes),
                  padding: 'var(--space-3) var(--space-4)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: isToday ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
                    color: isToday ? 'var(--color-blue)' : 'var(--text-tertiary)',
                  }}
                >
                  {dayNumber(cell.date)}
                </span>
                {holiday && (
                  <HolidayMarker holiday={holiday} onFocusAnnounce={onHolidayAnnounce} />
                )}
                <span
                  data-testid={`tt-calendar-hours-${cell.date}`}
                  data-billable-minutes={billableMinutes}
                  data-nonbillable-minutes={nonBillableMinutes}
                  style={{
                    alignSelf: 'flex-end',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    lineHeight: 1.15,
                    fontWeight: 'var(--font-weight-semibold)',
                    fontSize: 'var(--font-size-s)',
                    fontVariantNumeric: 'tabular-nums',
                    color: minutes > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  <span>{hoursText}</span>
                  {nonBillableMinutes > 0 ? (
                    <span
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 'var(--font-weight-regular)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      +{formatDurationHuman(nonBillableMinutes)} nb
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        data-testid="tt-month-total"
        style={{
          marginTop: 'var(--space-6)',
          textAlign: 'right',
          fontSize: 'var(--font-size-s)',
          color: 'var(--text-tertiary)',
        }}
      >
        Total this month{' '}
        <span style={{ fontWeight: 'var(--font-weight-semibold)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
          {formatDurationHuman(totalMinutes)}
        </span>
      </div>
    </div>
  );
}
