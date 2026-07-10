"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./availability.module.css";
import type { AvailabilitySlotDto } from "@/lib/availability/dto";

export type SlotPickerStatus = "loading" | "error" | "ready";

export interface TimeSlotPickerProps {
  /** Full label of the selected date, e.g. "Tuesday, July 14, 2026". */
  dateLabel: string | null;
  /** Human-readable active time zone, shown in the header. */
  timeZoneLabel: string;
  slots: AvailabilitySlotDto[];
  selectedSlotStart: string | null;
  onSelectSlot: (start: string) => void;
  status: SlotPickerStatus;
  onRetry?: () => void;
}

/**
 * Chronological list of bookable start times for the selected date. Single
 * selection, nothing pre-selected. Times are 24-hour in the active zone.
 * See specs/.../controls/time-slot-picker-control.md.
 */
export function TimeSlotPicker({
  dateLabel,
  timeZoneLabel,
  slots,
  selectedSlotStart,
  onSelectSlot,
  status,
  onRetry,
}: TimeSlotPickerProps): React.JSX.Element {
  const [focusIndex, setFocusIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const shouldFocusRef = useRef(false);

  useEffect(() => {
    setFocusIndex(0);
  }, [dateLabel, slots]);

  useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    itemRefs.current[focusIndex]?.focus();
  }, [focusIndex]);

  const move = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(slots.length - 1, index));
      shouldFocusRef.current = true;
      setFocusIndex(clamped);
    },
    [slots.length],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number, start: string) => {
      switch (event.key) {
        case "Enter":
        case " ":
          onSelectSlot(start);
          break;
        case "ArrowDown":
          move(index + 1);
          break;
        case "ArrowUp":
          move(index - 1);
          break;
        case "Home":
          move(0);
          break;
        case "End":
          move(slots.length - 1);
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [move, onSelectSlot, slots.length],
  );

  const header = (
    <div className={styles.slotsHeader}>
      <div>{dateLabel ?? "Select a date"}</div>
      <div aria-label={`Time zone ${timeZoneLabel}`}>{timeZoneLabel}</div>
    </div>
  );

  if (status === "loading") {
    return (
      <div className={styles.slots}>
        {header}
        <p className={styles.stateMessage} role="status">
          Loading times…
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={styles.slots}>
        {header}
        <div className={styles.stateMessage} role="alert">
          <p>Couldn’t load available times.</p>
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!dateLabel) {
    return (
      <div className={styles.slots}>
        {header}
        <p className={styles.stateMessage}>
          No dates are currently available to book.
        </p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className={styles.slots}>
        {header}
        <p className={styles.stateMessage}>
          No times available on this date — please pick another date.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.slots}>
      {header}
      <ul
        className={styles.slotList}
        role="listbox"
        aria-label={`Available times on ${dateLabel}`}
      >
        {slots.map((slot, index) => {
          const isSelected = slot.start === selectedSlotStart;
          return (
            <li key={slot.start} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                className={styles.slotButton}
                data-selected={isSelected}
                tabIndex={index === focusIndex ? 0 : -1}
                aria-label={`${slot.label} ${timeZoneLabel}`}
                onClick={() => onSelectSlot(slot.start)}
                onKeyDown={(e) => handleKeyDown(e, index, slot.start)}
              >
                {slot.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
