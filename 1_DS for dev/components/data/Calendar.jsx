import React from 'react';
import { isKeyboardFocus } from '../core/focus-visible.js';
import { IconButton } from '../core/IconButton.jsx';
import { Preloader } from '../feedback/Preloader.jsx';

/**
 * Calendar — §30. A month of dates, one at a time, for picking a day.
 *
 * **Designed, not measured.** Teamplay books nothing, so there is no production date *picker* to
 * recreate. What there is, and what every value below comes from, is `DateRangePicker`: a faithful
 * recreation of the react-datepicker 4.x defaults the product ships, which is the one place blue
 * draws a month grid at all. Its metrics are reproduced here rather than reinvented —
 * `.react-datepicker__day` 1.7rem/1.7rem with a .166rem margin and a 3px radius, `__month`
 * .4rem, the header at 8px 0 over a `--color-gray` bottom rule, `__current-month` .944rem/500,
 * `__day-name` in `--text-primary`/450, navigation 32x32 with a 9px border-drawn chevron, and the
 * three day states: selected `--color-blue`/white/13px/600, disabled `--color-gray-light` at
 * opacity .5 with not-allowed, everything else untinted.
 *
 * Three things depart from that grid, each because this is an availability picker rather than a
 * range picker over past dates, and each written down in `controls/calendar-control.md`:
 *
 * 1. **The week runs Monday to Sunday.** react-datepicker's Sunday-first default is a locale
 *    convention it inherited, not a choice prod made — the same class of thing as the month names
 *    being English. The consumer decides, by way of the `weeks` it hands in.
 * 2. **Leading and trailing cells are blank**, where react-datepicker greys the adjacent months'
 *    numbers. A day number in the grid looks selectable and every one of these is out of window.
 * 3. **It is a keyboard grid.** react-datepicker leaves `__day--keyboard-selected` transparent,
 *    which is survivable exactly as long as nothing can focus a day; here arrows move by day and
 *    by week, so focus takes `--shadow-focus-input` — the ring every other blue control uses.
 *
 * Deliberately presentational. Availability, the booking window and the zone they were reckoned in
 * are business rules; they belong to whatever fetched them, and arrive here as props.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Monday first — see 1 above. The header row is drawn from this, so the labels and the columns
   under them cannot disagree. */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/* react-datepicker's navigation glyph is not an svg: it is a 9px box with two 3px borders,
   rotated. Reproduced rather than replaced with a path, so the two grids match. */
const Chevron = ({ back }) => (
  <span
    aria-hidden
    style={{
      display: 'block', width: 9, height: 9, borderColor: 'currentColor', borderStyle: 'solid',
      borderWidth: '3px 3px 0 0', transform: back ? 'rotate(225deg)' : 'rotate(45deg)',
      marginLeft: back ? 3 : -3,
    }}
  />
);

const monthLabel = (month) => {
  const [year, index] = month.split('-');
  return `${MONTHS[Number(index) - 1]} ${year}`;
};

/** "Tuesday, 25 August 2026" — spelled out, because a cell reads only "25". */
const spokenDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${day} ${MONTHS[month - 1]} ${year}`;
};

function shift(month, by) {
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
}) {
  const available = React.useMemo(() => new Set(availableDates), [availableDates]);
  const ordered = React.useMemo(
    () => weeks.flat().filter((date) => date && available.has(date)),
    [weeks, available],
  );

  // Roving focus: exactly one cell is in the tab order, and it is one that can be chosen. A grid
  // where every day is tabbable makes the keyboard unusable.
  const [focused, setFocused] = React.useState(null);
  const gridRef = React.useRef(null);

  // Only a date the visible month actually renders can hold the tab stop: a selection made in
  // another month would otherwise take the grid out of the tab order entirely.
  const visible = (date) => (date && ordered.includes(date) ? date : null);
  const tabStop = visible(selected) || visible(focused) || ordered[0] || null;

  const canPrev = !loading && (!minDate || month > minDate.slice(0, 7));
  const canNext = !loading && (!maxDate || month < maxDate.slice(0, 7));

  const moveTo = (date) => {
    if (!date) return;
    setFocused(date);
    const cell = gridRef.current && gridRef.current.querySelector(`[data-date="${date}"]`);
    if (cell) cell.focus();
  };

  /** Nearest selectable date in one direction, so focus never rests on a disabled day. */
  const nearest = (from, step) => {
    const index = ordered.indexOf(from);
    if (index === -1) return ordered[0] || null;
    return ordered[index + step] || from;
  };

  const byWeek = (from, direction) => {
    const flat = weeks.flat();
    const index = flat.indexOf(from);
    if (index === -1) return from;
    for (let at = index + direction * 7; at >= 0 && at < flat.length; at += direction * 7) {
      if (flat[at] && available.has(flat[at])) return flat[at];
    }
    // No selectable day a whole week away — fall back to the nearest one that way.
    return nearest(from, direction);
  };

  const edgeOfWeek = (from, last) => {
    const week = weeks.find((row) => row.includes(from));
    if (!week) return from;
    const pickable = week.filter((date) => date && available.has(date));
    return (last ? pickable[pickable.length - 1] : pickable[0]) || from;
  };

  const onKeyDown = (event) => {
    const from = visible(focused) || tabStop;
    if (!from) return;

    const keys = {
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

  const row = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', columnGap: '0.332rem' };

  return (
    <div
      {...rest}
      data-testid={rest['data-testid'] || 'calendar-control'}
      style={{ fontFamily: 'var(--font-family-base)', fontSize: '0.8rem', ...style }}
    >
      {/* react-datepicker's header holds the month and the day names together, over one rule. */}
      <div
        style={{
          position: 'relative', textAlign: 'center', padding: '8px 0',
          borderBottom: '1px solid var(--color-gray)', marginBottom: '0.4rem',
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

        <div style={{ ...row, marginTop: 4 }}>
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

function Day({ date, selectable, selected, today, tabStop, onSelect, onFocus }) {
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
        /* A real `disabled`, not `aria-disabled`: calendar-control §10.41 requires the arrow
           walk to skip unpickable days, and a month of which four cells are bookable is not a
           grid anybody should have to arrow through. The opposite call to §22's menu row, whose
           whole point was that a blocked action stays readable. */
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
          /* §72 — the selection is a **tint**, not a fill. `DateRangePicker` paints a solid
             `--color-blue` cell with white ink, which is right for a range where a run of ten
             days has to read as one block; a single chosen date beside a list of times is one
             mark, and the solid version made it the loudest thing on a page whose primary
             action is a button below it. The 12% tint over a `--color-blue` border is what a
             `pressed` slot chip takes (§71), so the two halves of the picker agree.

             Today is a border at 45% of the same hue — present, and never mistaken for the
             selection. */
          border: selected
            ? 'var(--border-width-control) solid var(--color-blue)'
            : today
              ? 'var(--border-width-control) solid color-mix(in oklch, var(--color-blue) 45%, transparent)'
              : 'var(--border-width-control) solid transparent',
          boxShadow: focus ? 'var(--shadow-focus-input)' : 'none',
          /* §72 — an unavailable day is **not filled**. It was `--color-gray-light` at 0.6
             opacity, which put a grey block on every weekend and read as a second kind of
             selection: a month with four bookable days was mostly blocks. It is faint ink on
             the panel's own ground now, which is what "nothing here" looks like. */
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
