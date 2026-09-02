'use client';

import { useMemo, useRef, type KeyboardEvent } from 'react';
import {
  HIRING_MESSAGES,
  formatLongDate,
  formatSlotTime,
  monthMatrix,
  parseYearMonth,
} from '@devscribed/validation';
import { Button, Calendar, Card, InfoBanner, Preloader, Select, ToggleButton } from '@devscribed/ds';
import { timeZoneOptions } from '@/hiring/format';
import { valueOf } from '@/hiring/select';
import type { UseAvailability } from '@/hiring/useAvailability';

/**
 * The date grid and the list of times, shared by the two screens that pick an interview
 * slot: the public booking page (02) and the manage page's reschedule (07).
 *
 * It is lifted out rather than reimplemented because 07's design spec says so in as many
 * words — *the same `Calendar`, the same slot `Button`s, the same zone `Select` and
 * format `ToggleButton`* — and because a second picker with its own rules is precisely how a
 * page ends up offering a start time the server would reject.
 *
 * Everything about *why* a slot is being chosen stays with the caller: the submit
 * button, what happens on success, and what else is on the page. This owns the choosing.
 */

/** Per browser, and shared by both screens, so the choice follows the candidate. */
export const TIME_FORMAT_KEY = 'teammerly.booking.timeFormat';

/** A browser that refuses storage still gets the default 24-hour clock. */
export function readTimeFormat(): boolean {
  try {
    return window.localStorage.getItem(TIME_FORMAT_KEY) === '12h';
  } catch {
    return false;
  }
}

export function writeTimeFormat(hour12: boolean): void {
  try {
    window.localStorage.setItem(TIME_FORMAT_KEY, hour12 ? '12h' : '24h');
  } catch {
    // The choice still applies to this visit; it simply will not be remembered.
  }
}

export interface SlotPickerTestIds {
  timeZoneSelect: string;
  timeFormatToggle: string;
}

/**
 * The two Cards and the controls beneath them: `1fr 1fr` above 880px, stacked below.
 */
export function SlotPicker({
  availability,
  selected,
  onSelect,
  timeZone,
  onTimeZoneChange,
  hour12,
  onFormatChange,
  onDateChange,
  testIds,
}: {
  availability: UseAvailability;
  selected: string | null;
  onSelect: (slot: string) => void;
  timeZone: string;
  onTimeZoneChange: (timeZone: string) => void;
  hour12: boolean;
  onFormatChange: (hour12: boolean) => void;
  /** Announced by the caller, which owns the page's live region. */
  onDateChange?: (date: string) => void;
  testIds: SlotPickerTestIds;
}) {
  const slots = availability.slotsOn(availability.selectedDate);
  const availableDates = useMemo(
    () => Object.keys(availability.dates).filter((date) => availability.dates[date].length > 0),
    [availability.dates],
  );
  const weeks = useMemo(() => {
    const parsed = availability.month ? parseYearMonth(availability.month) : null;
    return parsed ? monthMatrix(parsed.year, parsed.month) : [];
  }, [availability.month]);

  return (
    <>
      {/*
        The zone and the clock format come **first**, above the two panels. They are the frame
        every number below is read in — a slot list is meaningless until you know whose clock it
        is on — and a control that qualifies what is above it has to be found after the reader
        has already misread it once. The design puts them here; so does every booking product.
      */}
      <div className="booking-controls">
        <div className="booking-zone">
          <Select
            label="All times in"
            isSearchable
            options={timeZoneOptions(timeZone)}
            value={timeZone}
            onChange={(option) => onTimeZoneChange(valueOf(option))}
            aria-label="Time zone"
            data-testid={testIds.timeZoneSelect}
          />
        </div>
        <div className="booking-format">
          {/*
            One control with two answers, not two buttons: `ToggleButton` is a `radiogroup`
            of two `radio` segments (ledger §31). Both values stay legible, which is what a
            format control needs — a switch labelled only by its current state cannot say what
            pressing it would do.

            The root's `margin-bottom: 20px` is prod's, and it belongs to a stacked form rather
            than to a control sharing a row with a zone picker.

            The wrapper carries the 160px: §49 restored the control's own block behaviour, but a
            block at `width: 100%` inside a **shrink-to-fit flex item** is 100% of nothing, and
            the two segments collapsed on top of each other. The width has to be stated by
            whatever the flex row is measuring, which is this.
          */}
          <ToggleButton
            value1="24h"
            value2="12h"
            selectedValue={hour12 ? '12h' : '24h'}
            onValue1Click={() => onFormatChange(false)}
            onValue2Click={() => onFormatChange(true)}
            aria-label="Time format"
            data-testid={testIds.timeFormatToggle}
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      <div className="booking-panels">
        <Card variant="panel" title="Date">
          {availability.status === 'failed' ? (
            <Failure
              testId="calendar-error"
              retryTestId="calendar-retry"
              onRetry={availability.reload}
            />
          ) : !availability.month ? (
            // The first response is what decides which month to show, so there is no
            // grid to dim yet — only a wait.
            <div
              data-testid="calendar-loading"
              style={{ display: 'flex', justifyContent: 'center' }}
            >
              <Preloader aria-hidden />
            </div>
          ) : (
            <Calendar
              month={availability.month}
              weeks={weeks}
              availableDates={availableDates}
              selected={availability.selectedDate}
              onSelect={(date) => {
                availability.selectDate(date);
                onDateChange?.(date);
              }}
              onMonthChange={availability.showMonth}
              minDate={availability.window?.from}
              maxDate={availability.window?.to}
              today={availability.window?.from ?? null}
              loading={availability.status === 'loading'}
            />
          )}
        </Card>

        <Card variant="panel" title="Time">
          <SlotList
            status={availability.status}
            date={availability.selectedDate}
            slots={slots}
            selected={selected}
            onSelect={onSelect}
            timeZone={timeZone}
            hour12={hour12}
            onRetry={availability.reload}
          />
        </Card>
      </div>

    </>
  );
}

/**
 * A flat chronological list of bookable starts. There is no disabled slot state,
 * because a time that cannot be booked is simply not listed (time-slot-picker §03.15).
 */
export function SlotList({
  status,
  date,
  slots,
  selected,
  onSelect,
  timeZone,
  hour12,
  onRetry,
}: {
  status: 'loading' | 'ready' | 'failed';
  date: string | null;
  slots: string[];
  selected: string | null;
  onSelect: (slot: string) => void;
  timeZone: string;
  hour12: boolean;
  onRetry: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  if (status === 'failed') {
    return <Failure testId="slot-list-error" retryTestId="slot-list-retry" onRetry={onRetry} />;
  }

  const focusAt = (index: number): void => {
    const options = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-slot]');
    if (!options || options.length === 0) return;
    const clamped = Math.max(0, Math.min(options.length - 1, index));
    options[clamped].focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const options = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-slot]') ?? [])];
    const current = options.findIndex((option) => option === document.activeElement);
    const moves: Record<string, number> = {
      ArrowDown: current + 1,
      ArrowRight: current + 1,
      ArrowUp: current - 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: options.length - 1,
    };
    if (moves[event.key] === undefined) return;
    event.preventDefault();
    focusAt(moves[event.key]);
  };

  return (
    <div data-testid="slot-list">
      <div data-testid="slot-list-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div
          data-testid="slot-list-date"
          style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-primary)' }}
        >
          {date ? formatLongDate(date) : ' '}
        </div>
        {/*
          Present to a reader, absent to everything else. The zone is named once on the page,
          by the labelled control above the panels — `All times in Europe/Minsk` — and printing
          it again under the date is the same sentence twice, eight inches apart. What it is
          still needed for is the announcement: a slot list read out of context has to say whose
          clock the times are on.
        */}
        <div data-testid="slot-list-timezone" style={SR_ONLY}>
          All times in {timeZone}
        </div>
      </div>

      {status === 'loading' ? (
        <div
          data-testid="slot-list-loading"
          style={{ display: 'flex', justifyContent: 'center' }}
        >
          {/* The list is replaced rather than dimmed: it has no stable shape to hold, and a
              date change replaces every entry in it anyway (time-slot-picker §07.28). */}
          <Preloader aria-hidden />
        </div>
      ) : slots.length === 0 ? (
        <p
          data-testid="slot-list-empty"
          style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-s)' }}
        >
          {date
            ? 'No times available on this date — please pick another.'
            : 'No times are available in the next month.'}
        </p>
      ) : (
        <div
          ref={listRef}
          role="group"
          aria-label="Available times"
          className="booking-slots"
          onKeyDown={onKeyDown}
        >
          {slots.map((slot) => {
            const label = formatSlotTime(new Date(slot), timeZone, hour12);
            const chosen = selected === slot;
            return (
              <Button
                key={slot}
                data-slot={slot}
                data-testid={`slot-option-${slot}`}
                // The name carries the time in the format on screen, plus the zone it
                // is expressed in — a bare "14:00" means nothing on its own.
                aria-label={`${label}, ${timeZone}`}
                onClick={() => onSelect(slot)}
                // `pressed`, not `primary` (ledger §71). A solid blue chip is the paint of
                // the page's primary action, and `Book` — a few rows below — is that: two
                // solid blue buttons, one of which submits. The chosen slot takes the 12%
                // tint the Calendar's selected day takes (§72), so the two halves of the
                // picker answer "this is the one you picked" the same way.
                pressed={chosen}
                style={{ minWidth: 92, fontVariantNumeric: 'tabular-nums' }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Availability could not be loaded — never rendered as a month with nothing free. */
export function Failure({
  testId,
  retryTestId,
  onRetry,
}: {
  testId: string;
  retryTestId: string;
  onRetry: () => void;
}) {
  return (
    <div data-testid={testId}>
      <InfoBanner variant="warning">{HIRING_MESSAGES.booking.availabilityFailed}</InfoBanner>
      <Button onClick={onRetry} data-testid={retryTestId} style={{ marginTop: 'var(--space-5)' }}>
        Try again
      </Button>
    </div>
  );
}

/** Present to a screen reader, absent to everything else. */
const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
