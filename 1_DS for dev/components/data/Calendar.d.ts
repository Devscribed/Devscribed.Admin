import * as React from 'react';

/** `YYYY-MM-DD`. Dates are calendar days here, never instants. */
export type CalendarDate = string;

/** `YYYY-MM`. */
export type CalendarMonth = string;

export interface CalendarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** The month on display, e.g. `"2026-08"`. */
  month: CalendarMonth;
  /**
   * Weeks of seven cells. A cell belonging to an adjacent month is `null` and renders blank —
   * handed in rather than derived, so one tested implementation of the grid serves the page and
   * this component alike, and so the **week start is the consumer's** rather than this
   * component's. `@devscribed/validation`'s `monthMatrix` builds them Monday-first.
   */
  weeks: Array<Array<CalendarDate | null>>;
  /** The dates that may be chosen. Everything else renders disabled. */
  availableDates?: CalendarDate[];
  selected?: CalendarDate | null;
  onSelect?: (date: CalendarDate) => void;
  /** Called by the month controls and by `PageUp` / `PageDown`. */
  onMonthChange?: (month: CalendarMonth) => void;
  /** Bounds for month navigation — the previous/next controls disable at them. */
  minDate?: CalendarDate;
  maxDate?: CalendarDate;
  /** Today in whatever zone the page is reckoning in; marked, never assumed. */
  today?: CalendarDate | null;
  /** Dims the grid and blocks interaction while a month is in flight. */
  loading?: boolean;
}

/**
 * Calendar — §30. Month grid for picking a date, **designed, not measured**: prod books nothing,
 * so every value is taken from `DateRangePicker`, blue's recreation of the react-datepicker
 * defaults the product ships.
 *
 * Presentational — availability, bounds, and the zone they were computed in all arrive as props.
 *
 * Keyboard: arrows move by day and by week, `Home`/`End` to the ends of the focused week,
 * `PageUp`/`PageDown` between months, `Enter`/`Space` to select. Focus only ever lands on a
 * selectable date; unpickable days carry the real `disabled` attribute and are out of the tab
 * order entirely.
 * @startingPoint section="Data" subtitle="Month date picker" viewport="420x400"
 */
export declare function Calendar(props: CalendarProps): JSX.Element;
