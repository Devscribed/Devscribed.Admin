'use client';

import { useMemo, useRef, type KeyboardEvent } from 'react';
import {
  HIRING_MESSAGES,
  formatLongDate,
  formatSlotTime,
  monthMatrix,
  parseYearMonth,
} from '@devscribed/validation';
import { Button, Calendar, Card, InfoBanner, Select, Spinner, Toggle } from '@/ds';
import { timeZoneOptions } from '@/hiring/format';
import type { UseAvailability } from '@/hiring/useAvailability';

/**
 * The date grid and the list of times, shared by the two screens that pick an interview
 * slot: the public booking page (02) and the manage page's reschedule (07).
 *
 * It is lifted out rather than reimplemented because 07's design spec says so in as many
 * words — *the same `Calendar`, the same slot `Button`s, the same zone `Select` and
 * format `Toggle`* — and because a second picker with its own rules is precisely how a
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
      <div className="booking-panels">
        <Card title="Date">
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
              style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}
            >
              <Spinner size={24} />
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

        <Card title="Time">
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

      <div className="booking-controls">
        <div className="booking-zone">
          <Select
            options={timeZoneOptions(timeZone)}
            value={timeZone}
            onChange={onTimeZoneChange}
            data-testid={testIds.timeZoneSelect}
          />
        </div>
        <div className="booking-format">
          <Toggle
            options={['24h', '12h']}
            value={hour12 ? '12h' : '24h'}
            onChange={(choice) => onFormatChange(choice === '12h')}
            data-testid={testIds.timeFormatToggle}
          />
        </div>
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
      <div data-testid="slot-list-header" style={{ marginBottom: 'var(--sp-6)' }}>
        <div
          data-testid="slot-list-date"
          style={{ fontSize: 'var(--fs-14)', color: 'var(--text)' }}
        >
          {date ? formatLongDate(date) : ' '}
        </div>
        <div
          data-testid="slot-list-timezone"
          style={{ fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}
        >
          All times in {timeZone}
        </div>
      </div>

      {status === 'loading' ? (
        <div
          data-testid="slot-list-loading"
          style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}
        >
          <Spinner size={24} />
        </div>
      ) : slots.length === 0 ? (
        <p
          data-testid="slot-list-empty"
          style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-14)' }}
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
                variant="secondary"
                size="sm"
                data-slot={slot}
                data-testid={`slot-option-${slot}`}
                aria-pressed={chosen}
                // The name carries the time in the format on screen, plus the zone it
                // is expressed in — a bare "14:00" means nothing on its own.
                aria-label={`${label}, ${timeZone}`}
                onClick={() => onSelect(slot)}
                style={
                  chosen
                    ? {
                        background: 'var(--accent-soft)',
                        color: 'var(--accent)',
                        borderColor: 'var(--accent-border)',
                        fontVariantNumeric: 'tabular-nums',
                      }
                    : { fontVariantNumeric: 'tabular-nums' }
                }
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
      <InfoBanner tone="warning">{HIRING_MESSAGES.booking.availabilityFailed}</InfoBanner>
      <Button
        variant="secondary"
        size="sm"
        onClick={onRetry}
        data-testid={retryTestId}
        style={{ marginTop: 'var(--sp-6)' }}
      >
        Try again
      </Button>
    </div>
  );
}
