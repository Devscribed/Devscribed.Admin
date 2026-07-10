"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CalendarControl } from "./CalendarControl";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { TimeZoneSelect } from "./TimeZoneSelect";
import styles from "./availability.module.css";
import { fullDateLabel, monthOf } from "./calendar-utils";
import { detectBrowserZone, timeZoneLabel } from "./timezone-utils";
import { useAvailability } from "./useAvailability";

export interface AvailabilitySelection {
  timeZone: string;
  /** ISO date, or null when nothing is available/selected. */
  date: string | null;
  /** ISO UTC instant of the chosen slot, or null. */
  slotStart: string | null;
  /** 24-hour label of the chosen slot, or null. */
  slotLabel: string | null;
}

export interface AvailabilityPickerProps {
  durationMinutes: number;
  onSelectionChange?: (selection: AvailabilitySelection) => void;
  /** Overrides the browser zone (used by the Reschedule page later). */
  initialTimeZone?: string;
  initialDate?: string;
  initialSlotStart?: string;
}

/**
 * Coordinates the Calendar Control and Time Slot Picker against real-time
 * availability: fetches on mount and on time-zone change, applies the
 * first-available-date default, resets slot selection on date/zone change, and
 * reports the current selection to the parent.
 */
export function AvailabilityPicker({
  durationMinutes,
  onSelectionChange,
  initialTimeZone,
  initialDate,
  initialSlotStart,
}: AvailabilityPickerProps): React.JSX.Element {
  const [timeZone, setTimeZone] = useState(initialTimeZone ?? "");
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialDate ?? null,
  );
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(
    initialSlotStart ?? null,
  );
  const [visibleMonth, setVisibleMonth] = useState<string>(
    initialDate ? monthOf(initialDate) : "",
  );
  const [message, setMessage] = useState("");

  // Resolve the browser zone after mount to avoid an SSR/CSR hydration mismatch.
  useEffect(() => {
    setTimeZone((current) => current || detectBrowserZone());
  }, []);

  const { data, status, reload } = useAvailability(durationMinutes, timeZone);

  // On each new availability payload, resolve the selected date (keep it if
  // still available, else fall back to the first available date), reset the
  // slot, and show the selected date's month.
  useEffect(() => {
    if (!data) return;
    const dates = data.availableDates;
    const resolved =
      selectedDate && dates.includes(selectedDate)
        ? selectedDate
        : (dates[0] ?? null);
    setSelectedDate(resolved);
    setSelectedSlotStart(null);
    setVisibleMonth(monthOf(resolved ?? data.minDate));
    setMessage(
      resolved
        ? `Showing availability. ${fullDateLabel(resolved)} selected.`
        : "No dates are currently available to book.",
    );
    // selectedDate is intentionally read from closure at data-change time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Report selection changes to the parent without re-running on callback identity.
  const callbackRef = useRef(onSelectionChange);
  callbackRef.current = onSelectionChange;
  useEffect(() => {
    const slotLabel =
      selectedSlotStart && selectedDate
        ? (data?.slotsByDate[selectedDate]?.find(
            (s) => s.start === selectedSlotStart,
          )?.label ?? null)
        : null;
    callbackRef.current?.({
      timeZone,
      date: selectedDate,
      slotStart: selectedSlotStart,
      slotLabel,
    });
  }, [timeZone, selectedDate, selectedSlotStart, data]);

  const availableDates = useMemo(
    () => new Set(data?.availableDates ?? []),
    [data],
  );
  const slotsForSelected =
    selectedDate && data ? (data.slotsByDate[selectedDate] ?? []) : [];
  const dateLabel = selectedDate ? fullDateLabel(selectedDate) : null;
  const tzLabel = timeZone ? timeZoneLabel(timeZone) : "";

  const handleSelectDate = (iso: string): void => {
    setSelectedDate(iso);
    setSelectedSlotStart(null);
    setMessage(`Selected ${fullDateLabel(iso)}. Times loaded.`);
  };

  const handleSelectSlot = (start: string): void => {
    setSelectedSlotStart(start);
    const label = slotsForSelected.find((s) => s.start === start)?.label ?? "";
    setMessage(`Selected ${label} ${tzLabel}.`);
  };

  const handleChangeTimeZone = (zone: string): void => {
    setTimeZone(zone);
    setMessage("Time zone changed. Updating availability…");
  };

  const showCalendar = data !== null && status !== "error";

  return (
    <div className={styles.picker}>
      <TimeZoneSelect
        value={timeZone}
        onChange={handleChangeTimeZone}
        disabled={status === "loading"}
      />

      <div className={styles.pickerBody}>
        {showCalendar ? (
          <CalendarControl
            visibleMonth={visibleMonth || monthOf(data.minDate)}
            minDate={data.minDate}
            maxDate={data.maxDate}
            availableDates={availableDates}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onChangeMonth={setVisibleMonth}
            disabled={status === "loading"}
          />
        ) : (
          <div className={styles.calendar}>
            <p
              className={styles.stateMessage}
              role={status === "error" ? "alert" : "status"}
            >
              {status === "error"
                ? "Couldn’t load the calendar."
                : "Loading calendar…"}
            </p>
            {status === "error" && (
              <button type="button" onClick={reload}>
                Try again
              </button>
            )}
          </div>
        )}

        <TimeSlotPicker
          dateLabel={dateLabel}
          timeZoneLabel={tzLabel}
          slots={slotsForSelected}
          selectedSlotStart={selectedSlotStart}
          onSelectSlot={handleSelectSlot}
          status={status}
          onRetry={reload}
        />
      </div>

      <div aria-live="polite" className={styles.srOnly}>
        {message}
      </div>
    </div>
  );
}
