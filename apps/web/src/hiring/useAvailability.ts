'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type BookingWindow,
  type YearMonth,
  firstAvailableDate,
  shiftMonth,
  yearMonthOf,
} from '@devscribed/validation';
import type { Availability } from './types';

export type AvailabilityStatus = 'loading' | 'ready' | 'failed';

export interface AvailabilityState {
  status: AvailabilityStatus;
  /** Merged across every month fetched so far, keyed by date in the active zone. */
  dates: Record<string, string[]>;
  window: BookingWindow | null;
  /** The month the grid is showing. */
  month: YearMonth | null;
  selectedDate: string | null;
}

export interface UseAvailability extends AvailabilityState {
  showMonth: (month: YearMonth) => void;
  selectDate: (date: string) => void;
  reload: () => void;
  slotsOn: (date: string | null) => string[];
}

/**
 * The booking page's view of the interviewer's calendar.
 *
 * Availability answers a month at a time, so this keeps what it has already fetched and
 * asks again only for a month it has not seen. Two rules are worth naming because they
 * are easy to lose: a failed fetch never degrades into an empty month, and the first
 * available date is selected on load even when it falls in the month after this one.
 *
 * `keepSlot` is how a time survives a zone change. Slots are absolute instants, so one
 * that is still offered is still the same string — it has simply moved onto a different
 * calendar date, which is exactly what the grid has to re-render.
 */
export function useAvailability(
  slug: string,
  timeZone: string,
  options: { enabled: boolean; keepSlot?: string | null; onSlotResolved?: (slot: string | null) => void },
): UseAvailability {
  const { enabled, keepSlot, onSlotResolved } = options;

  const [state, setState] = useState<AvailabilityState>({
    status: 'loading',
    dates: {},
    window: null,
    month: null,
    selectedDate: null,
  });

  // Guards a response from a zone the candidate has already moved on from.
  const generation = useRef(0);
  const resolved = useRef(onSlotResolved);
  resolved.current = onSlotResolved;
  const retained = useRef(keepSlot ?? null);
  retained.current = keepSlot ?? null;
  const cached = useRef(state.dates);
  cached.current = state.dates;

  const fetchMonth = useCallback(
    async (month?: YearMonth): Promise<Availability | null> => {
      const query = new URLSearchParams({ timeZone });
      if (month) query.set('month', month);
      try {
        const response = await fetch(`/api/book/${slug}/availability?${query}`);
        if (!response.ok) return null;
        return (await response.json()) as Availability;
      } catch {
        return null;
      }
    },
    [slug, timeZone],
  );

  const initialise = useCallback(async (): Promise<void> => {
    const mine = ++generation.current;
    const slot = retained.current;
    setState((previous) => ({ ...previous, status: 'loading' }));

    const first = await fetchMonth();
    if (mine !== generation.current) return;
    if (!first) {
      // Never an empty month: "we could not load times" is a different sentence.
      setState({ status: 'failed', dates: {}, window: null, month: null, selectedDate: null });
      return;
    }

    let dates = { ...first.dates };
    let month = yearMonthOf(first.window.from);

    // The window can begin on a Friday evening with nothing left in this month; the
    // first available date is then in the next one, and that is the month to show.
    if (!firstAvailableDate(dates) && yearMonthOf(first.window.to) !== month) {
      const next = await fetchMonth(shiftMonth(month, 1));
      if (mine !== generation.current) return;
      if (next) {
        dates = { ...dates, ...next.dates };
        if (firstAvailableDate(next.dates)) month = shiftMonth(month, 1);
      }
    }

    const surviving = slot && Object.values(dates).some((slots) => slots.includes(slot)) ? slot : null;
    const dateOfSurviving =
      surviving && Object.keys(dates).find((date) => dates[date].includes(surviving));

    setState({
      status: 'ready',
      dates,
      window: first.window,
      month: dateOfSurviving ? yearMonthOf(dateOfSurviving) : month,
      selectedDate: dateOfSurviving ?? firstAvailableDate(dates),
    });
    // Only when a time was being carried across: a first load has nothing to report,
    // and announcing "no longer available" to someone who never chose one is noise.
    if (slot) resolved.current?.(surviving);
  }, [fetchMonth]);

  useEffect(() => {
    if (!enabled) return;
    void initialise();
  }, [enabled, initialise]);

  const showMonth = useCallback(
    (month: YearMonth) => {
      // A month already fetched needs nothing — navigating back must not flicker, and
      // it must not refetch the vacancy or disturb the selection (calendar §02.9).
      const seen = Object.keys(cached.current).some((date) => date.startsWith(month));
      setState((previous) => ({ ...previous, month, status: seen ? previous.status : 'loading' }));
      if (seen) return;

      const mine = ++generation.current;
      void fetchMonth(month).then((body) => {
        if (mine !== generation.current) return;
        setState((current) =>
          body
            ? { ...current, status: 'ready', dates: { ...current.dates, ...body.dates } }
            : { ...current, status: 'failed' },
        );
      });
    },
    [fetchMonth],
  );

  const selectDate = useCallback((date: string) => {
    setState((previous) => ({ ...previous, selectedDate: date }));
  }, []);

  const slotsOn = useCallback(
    (date: string | null): string[] => (date ? (state.dates[date] ?? []) : []),
    [state.dates],
  );

  const reload = useCallback(() => {
    void initialise();
  }, [initialise]);

  return { ...state, showMonth, selectDate, reload, slotsOn };
}
