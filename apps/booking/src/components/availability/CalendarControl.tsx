"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./availability.module.css";
import {
  WEEKDAY_LETTERS,
  addMonth,
  buildMonthGrid,
  dateCellState,
  edgeAvailableDateInMonth,
  findAvailableDate,
  fullDateLabel,
  monthLabel,
  monthOf,
} from "./calendar-utils";

export interface CalendarControlProps {
  /** Visible month, "yyyy-MM". */
  visibleMonth: string;
  /** Earliest bookable date (today, in the display zone), ISO. */
  minDate: string;
  /** Latest bookable date (one month ahead), ISO. */
  maxDate: string;
  availableDates: ReadonlySet<string>;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  onChangeMonth: (month: string) => void;
  /** Non-interactive while availability for the month is loading. */
  disabled?: boolean;
}

/**
 * A single-month date picker driven by real-time availability. Only available
 * dates are focusable/selectable; disabled dates are skipped by keyboard
 * navigation. See specs/.../controls/calendar-control.md.
 */
export function CalendarControl({
  visibleMonth,
  minDate,
  maxDate,
  availableDates,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  disabled = false,
}: CalendarControlProps): React.JSX.Element {
  const today = minDate; // minDate is "today" in the display zone
  const weeks = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  const prevDisabled = disabled || visibleMonth <= monthOf(minDate);
  const nextDisabled = disabled || visibleMonth >= monthOf(maxDate);

  // Roving tabindex target within the visible month.
  const initialFocus = (): string => {
    if (selectedDate && monthOf(selectedDate) === visibleMonth) {
      return selectedDate;
    }
    return (
      edgeAvailableDateInMonth(visibleMonth, "first", availableDates) ??
      `${visibleMonth}-01`
    );
  };
  const [focusedDate, setFocusedDate] = useState<string>(initialFocus);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const shouldFocusRef = useRef(false);

  // Keep the roving target valid when the month or availability changes.
  useEffect(() => {
    setFocusedDate((current) =>
      monthOf(current) === visibleMonth ? current : initialFocus(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMonth, availableDates, selectedDate]);

  // Move DOM focus only in response to keyboard navigation, never on mount.
  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    cellRefs.current.get(focusedDate)?.focus();
  }, [focusedDate]);

  const moveFocusTo = useCallback((iso: string) => {
    shouldFocusRef.current = true;
    setFocusedDate(iso);
  }, []);

  const gotoMonthAndFocus = useCallback(
    (month: string, edge: "first" | "last") => {
      onChangeMonth(month);
      const target =
        edgeAvailableDateInMonth(month, edge, availableDates) ?? `${month}-01`;
      shouldFocusRef.current = true;
      setFocusedDate(target);
    },
    [availableDates, onChangeMonth],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, iso: string) => {
      let handled = true;
      switch (event.key) {
        case "Enter":
        case " ": {
          if (availableDates.has(iso)) onSelectDate(iso);
          break;
        }
        case "ArrowRight":
        case "ArrowDown": {
          const step = event.key === "ArrowDown" ? 7 : 1;
          const from = stepDays(iso, step - 1); // start scan from the target-1
          const next = findAvailableDate(
            from,
            1,
            availableDates,
            minDate,
            maxDate,
          );
          if (next) {
            if (monthOf(next) !== visibleMonth) onChangeMonth(monthOf(next));
            moveFocusTo(next);
          }
          break;
        }
        case "ArrowLeft":
        case "ArrowUp": {
          const step = event.key === "ArrowUp" ? 7 : 1;
          const from = stepDays(iso, -(step - 1));
          const prev = findAvailableDate(
            from,
            -1,
            availableDates,
            minDate,
            maxDate,
          );
          if (prev) {
            if (monthOf(prev) !== visibleMonth) onChangeMonth(monthOf(prev));
            moveFocusTo(prev);
          }
          break;
        }
        case "Home": {
          const first = edgeAvailableDateInMonth(
            visibleMonth,
            "first",
            availableDates,
          );
          if (first) moveFocusTo(first);
          break;
        }
        case "End": {
          const last = edgeAvailableDateInMonth(
            visibleMonth,
            "last",
            availableDates,
          );
          if (last) moveFocusTo(last);
          break;
        }
        case "PageUp": {
          if (!prevDisabled) gotoMonthAndFocus(addMonth(visibleMonth, -1), "first");
          break;
        }
        case "PageDown": {
          if (!nextDisabled) gotoMonthAndFocus(addMonth(visibleMonth, 1), "first");
          break;
        }
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    },
    [
      availableDates,
      gotoMonthAndFocus,
      maxDate,
      minDate,
      moveFocusTo,
      nextDisabled,
      onChangeMonth,
      onSelectDate,
      prevDisabled,
      visibleMonth,
    ],
  );

  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHeader}>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => onChangeMonth(addMonth(visibleMonth, -1))}
          disabled={prevDisabled}
          aria-label="Previous month"
        >
          ‹
        </button>
        <div aria-live="off" id="calendar-month-label">
          {monthLabel(visibleMonth)}
        </div>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => onChangeMonth(addMonth(visibleMonth, 1))}
          disabled={nextDisabled}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div
        role="grid"
        aria-labelledby="calendar-month-label"
        aria-readonly="true"
      >
        <div role="row" className={styles.grid}>
          {WEEKDAY_LETTERS.map((letter, i) => (
            <div
              key={`${letter}-${i}`}
              role="columnheader"
              className={styles.weekday}
              aria-label={FULL_WEEKDAYS[i]}
            >
              {letter}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div role="row" className={styles.grid} key={wi}>
            {week.map((iso, di) => {
              if (!iso) {
                return (
                  <div
                    key={`blank-${wi}-${di}`}
                    role="gridcell"
                    aria-hidden="true"
                    className={styles.dayBlank}
                  />
                );
              }
              const state = dateCellState(
                iso,
                minDate,
                maxDate,
                availableDates,
              );
              const isAvailable = state === "available";
              const isSelected = iso === selectedDate;
              const isToday = iso === today;
              const day = Number(iso.slice(8, 10));
              return (
                <button
                  key={iso}
                  type="button"
                  role="gridcell"
                  ref={(el) => {
                    if (el) cellRefs.current.set(iso, el);
                    else cellRefs.current.delete(iso);
                  }}
                  className={styles.dayCell}
                  data-state={state}
                  data-selected={isSelected}
                  data-today={isToday}
                  disabled={!isAvailable}
                  aria-disabled={!isAvailable}
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${fullDateLabel(iso)}, ${ariaState(
                    state,
                    isSelected,
                    isToday,
                  )}`}
                  tabIndex={iso === focusedDate ? 0 : -1}
                  onClick={() => isAvailable && onSelectDate(iso)}
                  onKeyDown={(e) => handleKeyDown(e, iso)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const FULL_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function ariaState(
  state: string,
  isSelected: boolean,
  isToday: boolean,
): string {
  const parts: string[] = [];
  if (isToday) parts.push("today");
  if (isSelected) parts.push("selected");
  parts.push(state);
  return parts.join(", ");
}

/** Shift an ISO date by n days, returning ISO. */
function stepDays(iso: string, n: number): string {
  if (n === 0) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
