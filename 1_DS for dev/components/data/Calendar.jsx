import React from 'react';
import { IconButton } from '../actions/IconButton.jsx';
import { Spinner } from '../feedback/Spinner.jsx';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const Chevron = ({ back }) => (
  <svg viewBox="0 0 8 12" width={8} height={12} fill="none" stroke="currentColor"
    strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden
    style={{ transform: back ? 'scaleX(-1)' : undefined }}>
    <path d="M1.5 1 6.5 6l-5 5" />
  </svg>
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

/**
 * A month of dates, one at a time, for picking a day.
 *
 * Deliberately presentational: it is handed the weeks to draw, which dates may be
 * chosen, and the bounds it may navigate between. Availability, the booking window and
 * the time zone are business rules — they belong to whatever fetched them, not here.
 *
 * The week always runs Monday to Sunday and the header is always English; both are
 * fixed rather than locale-derived, so the columns line up with the labels above them
 * wherever the page is opened.
 */
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

  // Roving focus: exactly one cell is in the tab order, and it is one that can be
  // chosen. A grid where every day is tabbable makes the keyboard unusable.
  const [focused, setFocused] = React.useState(null);
  const gridRef = React.useRef(null);

  // Only a date the visible month actually renders can hold the tab stop: a selection
  // made in another month would otherwise take the grid out of the tab order entirely.
  const visible = (date) => (date && ordered.includes(date) ? date : null);
  const tabStop = visible(selected) || visible(focused) || ordered[0] || null;

  // Navigation is bounded by the window, when one is given, and always blocked while a
  // month is in flight.
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
    const next = ordered[index + step];
    return next || from;
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

  return (
    <div {...rest} data-testid={rest['data-testid'] || 'calendar-control'} style={style}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--sp-6)',
      }}>
        <IconButton label="Previous month" size={30} disabled={!canPrev}
          data-testid="calendar-prev-month"
          onClick={() => onMonthChange && onMonthChange(shift(month, -1))}>
          <Chevron back />
        </IconButton>
        <div data-testid="calendar-month-label" style={{
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-15)',
          color: 'var(--text)',
        }}>{monthLabel(month)}</div>
        <IconButton label="Next month" size={30} disabled={!canNext}
          data-testid="calendar-next-month"
          onClick={() => onMonthChange && onMonthChange(shift(month, 1))}>
          <Chevron />
        </IconButton>
      </div>

      <div style={{ position: 'relative' }}>
        <div
          ref={gridRef}
          role="grid"
          aria-label={monthLabel(month)}
          data-testid="calendar-grid"
          onKeyDown={onKeyDown}
          style={{
            opacity: loading ? 0.55 : 1,
            pointerEvents: loading ? 'none' : undefined,
            transition: 'opacity var(--duration-base) var(--easing-standard)',
          }}
        >
          <div role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {WEEKDAYS.map((initial, index) => (
              <div key={index} role="columnheader" aria-label={DAY_NAMES[(index + 1) % 7]}
                style={{
                  textAlign: 'center', padding: '6px 0',
                  fontFamily: 'var(--font-display)', fontSize: 'var(--fs-11)',
                  letterSpacing: 'var(--ls-wider)', color: 'var(--text-faint)',
                }}>{initial}</div>
            ))}
          </div>

          {weeks.map((week, index) => (
            <div key={index} role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
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
          <div data-testid="calendar-loading" style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)',
          }}><Spinner size={24} /></div>
        )}
      </div>
    </div>
  );
}

function Day({ date, selectable, selected, today, tabStop, onSelect, onFocus }) {
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);

  // A cell belonging to an adjacent month carries no number and nothing to press.
  if (!date) return <div role="gridcell" style={{ height: 38 }} />;

  const day = Number(date.slice(8));
  const state = selected ? 'selected' : selectable ? 'available' : 'unavailable';

  return (
    <div role="gridcell" style={{ padding: 2 }}>
      <button
        type="button"
        data-date={date}
        data-testid={`calendar-day-${date}`}
        disabled={!selectable}
        aria-disabled={!selectable || undefined}
        aria-selected={selected || undefined}
        aria-current={today ? 'date' : undefined}
        // The number alone says nothing about the date or whether it can be chosen.
        aria-label={`${spokenDate(date)}, ${state}${today ? ', today' : ''}`}
        tabIndex={selectable && tabStop ? 0 : -1}
        onClick={() => selectable && onSelect && onSelect(date)}
        onFocus={() => { setFocus(true); onFocus && onFocus(date); }}
        onBlur={() => setFocus(false)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: '100%', height: 34, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontSize: 'var(--fs-13)',
          fontVariantNumeric: 'tabular-nums',
          borderRadius: 'var(--radius-md)',
          border: `1.5px solid ${selected || today ? 'var(--accent-border)' : 'transparent'}`,
          background: selected
            ? 'var(--accent-soft)'
            : (hover && selectable ? 'var(--hover-bg-tint)' : 'transparent'),
          color: selected ? 'var(--accent)' : (selectable ? 'var(--text)' : 'var(--text-faint)'),
          cursor: selectable ? 'pointer' : 'default',
          boxShadow: focus ? 'var(--shadow-glow-accent)' : 'none',
          transition: 'background var(--duration-base) var(--easing-standard),color var(--duration-base) var(--easing-standard)',
        }}
      >{day}</button>
    </div>
  );
}

function shift(month, by) {
  const [year, index] = month.split('-').map(Number);
  const moved = year * 12 + (index - 1) + by;
  return `${Math.floor(moved / 12)}-${String((moved % 12) + 1).padStart(2, '0')}`;
}
