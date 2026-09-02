import React from 'react';
import { isKeyboardFocus } from '../core/focus-visible';
import { IconButton } from '../core/IconButton';
import { Preloader } from '../feedback/Preloader';

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

interface DayProps {
  date: CalendarDate | null;
  selectable: boolean;
  selected: boolean;
  today: boolean;
  tabStop: boolean;
  onSelect?: (date: CalendarDate) => void;
  onFocus?: (date: CalendarDate) => void;
}

/**
 * Calendar — §30. A month of dates, one at a time, for picking a day.
 *
 * The grid is built on a rem scale rather than the pixel spacing tokens: cells are 1.7rem square
 * with a .166rem gutter, the month .4rem in, the month name at .944rem. A date grid is the one
 * place in the system where seven columns and six rows have to stay square and stay aligned
 * while the type around them changes size, and a rem grid does that where a px grid drifts.
 * Everything else is the system's — `--radius-s` on a cell, `--color-blue` for the selection,
 * `--shadow-focus-input` for the ring, 32x32 navigation.
 *
 * Three decisions the shape does not make for itself, each written down in
 * `controls/calendar-control.md`:
 *
 * 1. **The week runs Monday to Sunday**, and the consumer decides, by way of the `weeks` it
 *    hands in. This component never computes a month; it draws the one it is given.
 * 2. **Leading and trailing cells are blank** rather than showing the adjacent months' greyed
 *    numbers. A day number in the grid looks selectable, and every one of these is out of the
 *    booking window.
 * 3. **It is a keyboard grid.** Arrows move by day and by week, `Home`/`End` to the ends of the
 *    week, `PageUp`/`PageDown` between months — so focus needs a ring, and takes the system's.
 *
 * Deliberately presentational. Availability, the booking window and the zone they were reckoned
 * in are business rules; they belong to whatever fetched them, and arrive here as props.
 *
 * Keyboard: arrows move by day and by week, `Home`/`End` to the ends of the focused week,
 * `PageUp`/`PageDown` between months, `Enter`/`Space` to select. Focus only ever lands on a
 * selectable date; unpickable days carry the real `disabled` attribute and are out of the tab
 * order entirely.
 * @startingPoint section="Data" subtitle="Month date picker" viewport="420x400"
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Monday first — see 1 above. The header row is drawn from this, so the labels and the columns
   under them cannot disagree. */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/* The navigation glyph is a 9px box with two 3px borders, rotated — not an `<svg>`. At this
   size a drawn chevron's stroke rounds unevenly against the cell grid beside it, and a border
   is snapped to the pixel by the browser. */
const Chevron = ({ back }: { back?: boolean }) => (
  <span
    aria-hidden
    style={{
      display: 'block', width: 9, height: 9, borderColor: 'currentColor', borderStyle: 'solid',
      /* @literal the chevron is drawn from two borders rather than a path; 3px and the 3px
         nudge are the glyph's geometry, not the layout's. */
      borderWidth: '3px 3px 0 0', transform: back ? 'rotate(225deg)' : 'rotate(45deg)',
      marginLeft: back ? 3 : -3,
    }}
  />
);

const monthLabel = (month: CalendarMonth): string => {
  const [year, index] = month.split('-');
  return `${MONTHS[Number(index) - 1]} ${year}`;
};

/** "Tuesday, 25 August 2026" — spelled out, because a cell reads only "25". */
const spokenDate = (date: CalendarDate): string => {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${day} ${MONTHS[month - 1]} ${year}`;
};

function shift(month: CalendarMonth, by: number): CalendarMonth {
  const [year, index] = month.split('-').map(Number);
  const moved = year * 12 + (index - 1) + by;
  return `${Math.floor(moved / 12)}-${String((moved % 12) + 1).padStart(2, '0')}`;
}

export function Calendar({
  month,
  weeks = [],
  availableDates = [],
  selected = null,
  onSelect,
  onMonthChange,
  minDate,
  maxDate,
  today = null,
  loading = false,
  style,
  ...rest
}: CalendarProps) {
  const available = React.useMemo(() => new Set<CalendarDate | null>(availableDates), [availableDates]);
  const ordered = React.useMemo(
    () => weeks.flat().filter((date) => date && available.has(date)),
    [weeks, available],
  );

  // Roving focus: exactly one cell is in the tab order, and it is one that can be chosen. A grid
  // where every day is tabbable makes the keyboard unusable.
  const [focused, setFocused] = React.useState<CalendarDate | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);

  // Only a date the visible month actually renders can hold the tab stop: a selection made in
  // another month would otherwise take the grid out of the tab order entirely.
  const visible = (date: CalendarDate | null | undefined) => (date && ordered.includes(date) ? date : null);
  const tabStop = visible(selected) || visible(focused) || ordered[0] || null;

  const canPrev = !loading && (!minDate || month > minDate.slice(0, 7));
  const canNext = !loading && (!maxDate || month < maxDate.slice(0, 7));

  const moveTo = (date: CalendarDate | null) => {
    if (!date) return;
    setFocused(date);
    const cell = gridRef.current && gridRef.current.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (cell) cell.focus();
  };

  /** Nearest selectable date in one direction, so focus never rests on a disabled day. */
  const nearest = (from: CalendarDate, step: number) => {
    const index = ordered.indexOf(from);
    if (index === -1) return ordered[0] || null;
    return ordered[index + step] || from;
  };

  const byWeek = (from: CalendarDate, direction: number) => {
    const flat = weeks.flat();
    const index = flat.indexOf(from);
    if (index === -1) return from;
    for (let at = index + direction * 7; at >= 0 && at < flat.length; at += direction * 7) {
      if (flat[at] && available.has(flat[at])) return flat[at];
    }
    // No selectable day a whole week away — fall back to the nearest one that way.
    return nearest(from, direction);
  };

  const edgeOfWeek = (from: CalendarDate, last: boolean) => {
    const week = weeks.find((row) => row.includes(from));
    if (!week) return from;
    const pickable = week.filter((date) => date && available.has(date));
    return (last ? pickable[pickable.length - 1] : pickable[0]) || from;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const from = visible(focused) || tabStop;
    if (!from) return;

    const keys: Record<string, () => CalendarDate | null> = {
      ArrowRight: () => nearest(from, 1),
      ArrowLeft: () => nearest(from, -1),
      ArrowDown: () => byWeek(from, 1),
      ArrowUp: () => byWeek(from, -1),
      Home: () => edgeOfWeek(from, false),
      End: () => edgeOfWeek(from, true),
    };

    if (keys[event.key]) {
      event.preventDefault();
      moveTo(keys[event.key]());
      return;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      if (!onMonthChange) return;
      const forward = event.key === 'PageDown';
      if (forward ? !canNext : !canPrev) return;
      setFocused(null);
      onMonthChange(shift(month, forward ? 1 : -1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (available.has(from) && onSelect) onSelect(from);
    }
  };

  const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', columnGap: '0.332rem' };

  return (
    <div
      {...rest}
      data-testid={(rest as Record<string, any>)['data-testid'] || 'calendar-control'}
      style={{ fontFamily: 'var(--font-family-base)', fontSize: '0.8rem', ...style }}
    >
      {/* The month name and the day initials share one header, over one rule: they are the
          same fact about the grid below — which month, and which column is which day. */}
      <div
        style={{
          position: 'relative', textAlign: 'center', padding: 'var(--space-3) 0',
          borderBottom: 'var(--border-width-hairline) solid var(--color-gray)', marginBottom: '0.4rem',
        }}
      >
        <IconButton
          label="Previous month"
          size={32}
          disabled={!canPrev}
          data-testid="calendar-prev-month"
          onClick={() => onMonthChange && onMonthChange(shift(month, -1))}
          style={{ position: 'absolute', top: 2, left: 2 }}
        >
          <Chevron back />
        </IconButton>

        <div
          data-testid="calendar-month-label"
          style={{
            color: 'var(--text-primary)', fontWeight: 'var(--font-weight-medium)',
            fontSize: '0.944rem',
          }}
        >
          {monthLabel(month)}
        </div>

        <IconButton
          label="Next month"
          size={32}
          disabled={!canNext}
          data-testid="calendar-next-month"
          onClick={() => onMonthChange && onMonthChange(shift(month, 1))}
          style={{ position: 'absolute', top: 2, right: 2 }}
        >
          <Chevron />
        </IconButton>

        <div style={{ ...row, marginTop: 'var(--space-1)' }}>
          {WEEKDAYS.map((initial, index) => (
            <span
              key={index}
              /* The label is one letter and three of them repeat; the column it heads is named
                 in full for a reader. */
              aria-hidden
              style={{
                lineHeight: '1.7rem', color: 'var(--text-primary)',
                fontWeight: 'var(--font-weight-headline)',
              }}
            >
              {initial}
            </span>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', margin: '0.4rem' }}>
        <div
          ref={gridRef}
          role="grid"
          aria-label={monthLabel(month)}
          data-testid="calendar-grid"
          onKeyDown={onKeyDown}
          style={{
            opacity: loading ? 0.55 : 1,
            pointerEvents: loading ? 'none' : undefined,
            transition: 'opacity var(--duration-fast) var(--ease-standard)',
          }}
        >
          {weeks.map((week, index) => (
            <div key={index} role="row" style={row}>
              {week.map((date, column) => (
                <Day
                  key={date || `blank-${column}`}
                  date={date}
                  selectable={!!date && available.has(date)}
                  selected={date === selected}
                  today={date === today}
                  tabStop={date === tabStop}
                  onSelect={onSelect}
                  onFocus={setFocused}
                />
              ))}
            </div>
          ))}
        </div>

        {loading && (
          /* The grid dims in place rather than being replaced — a month that collapsed and
             re-expanded on every navigation would move the slot list under the candidate. */
          <div
            data-testid="calendar-loading"
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Preloader size={8} margin={5} aria-hidden />
          </div>
        )}
      </div>
    </div>
  );
}

function Day({ date, selectable, selected, today, tabStop, onSelect, onFocus }: DayProps) {
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);

  // A cell belonging to an adjacent month carries no number and nothing to press.
  if (!date) return <span role="gridcell" className="ds-calendar-day" />;

  const day = Number(date.slice(8));
  const state = selected ? 'selected' : selectable ? 'available' : 'unavailable';

  return (
    <span role="gridcell" style={{ display: 'block' }}>
      <button
        type="button"
        data-date={date}
        data-testid={`calendar-day-${date}`}
        /* A real `disabled`, not `aria-disabled`: the arrow walk skips unpickable days, and a
           month of which four cells are bookable is not a grid anybody should have to arrow
           through one cell at a time. The opposite call to §22's menu row — there the whole
           point is that a blocked action stays readable, and here there is nothing to read. */
        disabled={!selectable}
        aria-selected={selected || undefined}
        aria-current={today ? 'date' : undefined}
        // The number alone says nothing about the date or whether it can be chosen.
        aria-label={`${spokenDate(date)}, ${state}${today ? ', today' : ''}`}
        tabIndex={selectable && tabStop ? 0 : -1}
        onClick={() => selectable && onSelect && onSelect(date)}
        /* §68 — a keyboard's ring, not a pointer's. The roving `onFocus` still fires either
           way: which day owns the tab stop is not a question about how it was reached. */
        onFocus={(event) => { setFocus(isKeyboardFocus(event.currentTarget)); if (onFocus) onFocus(date); }}
        onBlur={() => setFocus(false)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="ds-calendar-day"
        style={{
          width: '100%', padding: 0, textAlign: 'center',
          fontFamily: 'var(--font-family-base)',
          /* §72 — one size and one weight, whatever the state. The selected day bumped to
             13px at 600, which moved the number inside its own cell the instant it was
             picked: a grid of tabular figures where one is a different size is a grid that
             twitches under the cursor. The border and the fill say which day it is. */
          fontSize: 'var(--font-size-s)',
          fontVariantNumeric: 'tabular-nums',
          borderRadius: 'var(--radius-s)',
          boxSizing: 'border-box',
          /* §72 — the selection is a **tint**, not a fill. A solid `--color-blue` cell with
             white ink is right for a *range*, where a run of ten days has to read as one block;
             a single chosen date beside a list of times is one mark, and the solid version made
             it the loudest thing on a page whose primary action is a button below it. The 12%
             tint over a `--color-blue` border is exactly what a `pressed` slot chip takes
             (§71), so the two halves of the picker agree.

             Today is a border at 45% of the same hue — present, and never mistaken for the
             selection. */
          border: selected
            ? 'var(--border-width-control) solid var(--color-blue)'
            : today
              ? 'var(--border-width-control) solid color-mix(in oklch, var(--color-blue) 45%, transparent)'
              : 'var(--border-width-control) solid transparent',
          boxShadow: focus ? 'var(--shadow-focus-input)' : 'none',
          /* §72 — an unavailable day is **not filled**. A grey block on every weekend reads as
             a second kind of selection, and a month with four bookable days was mostly blocks.
             Faint ink on the panel's own ground is what "nothing here" looks like. */
          backgroundColor: selected
            ? 'color-mix(in oklch, var(--color-blue) 12%, transparent)'
            : selectable && hover
              ? 'var(--color-row-hover)'
              : 'transparent',
          color: selected
            ? 'var(--color-blue)'
            : selectable
              ? 'var(--text-primary)'
              : 'color-mix(in oklch, var(--color-gray) 55%, var(--color-white))',
          cursor: selectable ? 'pointer' : 'default',
          transition: 'background-color var(--duration-fast) var(--ease-standard)',
        }}
      >
        {day}
      </button>
    </span>
  );
}
