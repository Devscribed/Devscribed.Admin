import React from 'react';
import { Calendar, type CalendarDate, type CalendarMonth } from '../data/Calendar';
import { isKeyboardFocus } from '../core/focus-visible';

export interface DateRangePreset {
  label: string;
  start: CalendarDate;
  end: CalendarDate;
  /** §85 — the row is drawn here, so only this component can tag it. */
  testId?: string;
}

export interface DateRangePickerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  start?: CalendarDate | null;
  end?: CalendarDate | null;
  /** Fires once, on the second click, with the two ends already in order. */
  onChange?: (range: [CalendarDate, CalendarDate]) => void;
  minDate?: CalendarDate;
  maxDate?: CalendarDate;
  /**
   * Named spans down the left of the panel. Each carries its own dates: this component does no
   * date arithmetic beyond drawing a month, and "last month" is a question about the reader's
   * zone that only the screen that fetched the report can answer.
   */
  presets?: DateRangePreset[];
  /** Drawn above the trigger, in the field-label treatment every control in a row shares. */
  label?: string;
  /** The trigger is drawn here, and it is the node a test clicks. */
  triggerTestId?: string;
  placeholder?: string;
  disabled?: boolean;
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-01` → `Aug 01, 2026`. Read off the string; an ISO day is not an instant. */
const format = (date: CalendarDate): string =>
  `${SHORT[Number(date.slice(5, 7)) - 1]} ${date.slice(8, 10)}, ${date.slice(0, 4)}`;

const monthOf = (date: CalendarDate): CalendarMonth => date.slice(0, 7);

/**
 * The month's grid, Monday-first. `Calendar` takes its weeks from the consumer rather than
 * computing them (see its note 1), and this is that consumer — the app's own `monthMatrix`
 * lives in `@devscribed/validation`, which this package does not depend on and will not.
 */
function monthWeeks(month: CalendarMonth): Array<Array<CalendarDate | null>> {
  const [year, index] = month.split('-').map(Number);
  const lead = (new Date(Date.UTC(year, index - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const cells: Array<CalendarDate | null> = [];
  for (let blank = 0; blank < lead; blank += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<CalendarDate | null>> = [];
  for (let at = 0; at < cells.length; at += 7) weeks.push(cells.slice(at, at + 7));
  return weeks;
}

/**
 * DateRangePicker — a button showing the span it holds, over a panel with a month and a column
 * of named spans.
 *
 * §85 — **the range is two clicks on one month, not a form with two fields.** A start and an
 * end typed separately can be in the wrong order, in the wrong month, and wrong in a way
 * neither field can show; picking them on the grid makes the invalid states unreachable and
 * puts the length of the range — the thing the reader is actually choosing — on screen as a
 * shape. The first click arms the start, the second commits, and `onChange` fires once with
 * the two ends already sorted, so a reader who clicks the end first still gets a range.
 *
 * §85 — **one month, not two.** A second month doubles the panel's width for the case where a
 * range crosses a month boundary, which the month controls already handle, and a 640px panel
 * hanging off a filter in a wrapping bar is the one that runs off the screen.
 *
 * The presets are the other half of the same argument: most ranges a report is run for are
 * named ones, and a named span is one click where the grid is two.
 *
 * The trigger takes the geometry `Select`'s dropdown variant draws — the same height, border
 * width, radius and ink — because it sits in a row of them and a control that is level with
 * its neighbours everywhere except here reads as a different kind of thing.
 */
export function DateRangePicker({
  start = null, end = null, onChange, minDate, maxDate, presets = [],
  label, triggerTestId, placeholder = 'Pick a range', disabled, style, ...rest
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  /* The first click's date, held until the second one commits both. */
  const [pending, setPending] = React.useState<CalendarDate | null>(null);
  const [month, setMonth] = React.useState<CalendarMonth>(() => monthOf(start || maxDate || '2026-01-01'));
  const ref = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const generatedId = React.useId();
  const labelId = label ? `${generatedId}-label` : undefined;

  /* The panel follows the value it was opened on, so re-opening it never lands the reader in
     whichever month they last browsed to. */
  React.useEffect(() => {
    if (open && start) setMonth(monthOf(start));
  }, [open, start]);

  const close = React.useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPending(null);
    if (returnFocus && triggerRef.current) triggerRef.current.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(true); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const weeks = React.useMemo(() => monthWeeks(month), [month]);
  const selectable = React.useMemo(
    () => weeks.flat().filter((date): date is CalendarDate =>
      !!date && (!minDate || date >= minDate) && (!maxDate || date <= maxDate)),
    [weeks, minDate, maxDate],
  );

  function commit(from: CalendarDate, to: CalendarDate) {
    if (onChange) onChange(from <= to ? [from, to] : [to, from]);
    close(false);
  }

  function onSelect(date: CalendarDate) {
    if (pending === null) { setPending(date); return; }
    commit(pending, date);
  }

  const value = start && end ? `${format(start)} - ${format(end)}` : start ? format(start) : '';
  const lit = open || focused;

  return (
    <div {...rest} ref={ref} style={{ position: 'relative', display: 'inline-block', fontFamily: 'var(--font-family-base)', ...style }}>
      {label && (
        /* The system's field-label treatment, inline because this control draws its own — the
           same copy `Select` (§21) and `ToggleButton` (§31) carry, so a row of filters lines up
           on one caption baseline. */
        <label
          id={labelId}
          style={{
            display: 'block', padding: 'var(--space-4) 0 0 var(--space-4)',
            fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-xs)',
            lineHeight: 'var(--line-height-label)', color: 'var(--text-secondary)',
            marginBottom: 'var(--space-1)', whiteSpace: 'nowrap',
          }}
        >
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        data-testid={triggerTestId}
        aria-haspopup="dialog"
        aria-expanded={open}
        id={`${generatedId}-trigger`}
        /* The caption *and* the button's own text, in that order: `aria-labelledby` replaces
           the content it is put on, so naming only the label would announce "Range" and drop
           the dates — which are the whole value of the control. */
        aria-labelledby={labelId ? `${labelId} ${generatedId}-trigger` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
        /* §68 — a keyboard's ring, not a pointer's. */
        onFocus={(event) => setFocused(isKeyboardFocus(event.currentTarget))}
        onBlur={() => setFocused(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)',
          minHeight: 'var(--control-height)', padding: '0 var(--space-5)',
          backgroundColor: disabled ? 'var(--surface-disabled)' : 'var(--surface-card)',
          borderWidth: 'var(--border-width-control)', borderStyle: 'solid',
          borderColor: lit ? 'var(--color-blue)' : 'var(--border-default)',
          borderRadius: 'var(--radius-s)',
          boxShadow: lit ? 'var(--shadow-focus-input)' : 'none',
          transition: 'var(--transition-border-focus)',
          fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-s)',
          color: value ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
          cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <span>{value || placeholder}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label ? `${label} — pick a date range` : 'Pick a date range'}
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 1000,
            marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-5)',
            padding: 'var(--space-5)',
            backgroundColor: 'var(--surface-overlay)',
            border: 'var(--border-width-hairline) solid var(--border-default)',
            borderRadius: 'var(--radius-l)',
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          {presets.length > 0 && (
            <div
              style={{
                display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
                paddingRight: 'var(--space-5)',
                borderRight: 'var(--border-width-hairline) solid var(--border-subtle)',
                /* 130px is the width "Last 30 days" needs without wrapping. */
                minWidth: 130,
              }}
            >
              {presets.map((preset) => (
                <PresetRow key={preset.label} preset={preset} onPick={() => commit(preset.start, preset.end)} />
              ))}
            </div>
          )}
          <div>
            <Calendar
              month={month}
              weeks={weeks}
              availableDates={selectable}
              rangeStart={pending || start}
              rangeEnd={pending ? null : end}
              onSelect={onSelect}
              onMonthChange={setMonth}
              minDate={minDate}
              maxDate={maxDate}
              /* 280px keeps the seven columns square at the rem grid `Calendar` draws on. */
              style={{ width: 280 }}
            />
            <div
              /* The instruction is live: it changes the moment the first click lands, and a
                 reader who cannot see the half-made range needs to be told it is half-made. */
              role="status"
              style={{
                marginTop: 'var(--space-4)', fontSize: 'var(--font-size-xs)',
                lineHeight: 'var(--line-height-xs)', color: 'var(--text-secondary)',
                maxWidth: 280,
              }}
            >
              {pending
                ? `Start ${format(pending)}. Pick the end date.`
                : 'Pick the start date, then the end date.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PresetRow({ preset, onPick }: { preset: DateRangePreset; onPick: () => void }) {
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  return (
    <button
      type="button"
      data-testid={preset.testId}
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={(event) => setFocus(isKeyboardFocus(event.currentTarget))}
      onBlur={() => setFocus(false)}
      style={{
        textAlign: 'left', border: 0, cursor: 'pointer',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-s)',
        backgroundColor: hover ? 'var(--surface-row-hover)' : 'transparent',
        boxShadow: focus ? 'var(--shadow-focus-input)' : 'none',
        fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-s)',
        color: 'var(--text-primary)', whiteSpace: 'nowrap',
      }}
    >
      {preset.label}
    </button>
  );
}
