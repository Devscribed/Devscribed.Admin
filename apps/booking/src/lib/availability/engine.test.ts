import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  computeBookingWindow,
  formatSlotTime,
  generateAvailableSlots,
  getAvailableDates,
  getSlotsForDate,
} from "@/lib/availability/engine";
import type {
  AvailabilityParams,
  EngineWorkingHours,
  Interval,
} from "@/lib/availability/types";

const utc = (iso: string): DateTime => DateTime.fromISO(iso, { zone: "UTC" });

function workingHours(
  overrides: Partial<EngineWorkingHours> = {},
): EngineWorkingHours {
  return {
    daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    startTime: "09:00",
    endTime: "17:00",
    zone: "UTC",
    ...overrides,
  };
}

function params(overrides: Partial<AvailabilityParams> = {}): AvailabilityParams {
  return {
    durationMinutes: 30,
    workingHours: workingHours(),
    busyBlocks: [],
    displayZone: "UTC",
    now: utc("2026-07-13T00:00:00"), // Monday
    ...overrides,
  };
}

/** Formatted start times for a given date, in the display zone. */
function startTimes(
  slots: Interval[],
  zone: string,
  isoDate: string,
): string[] {
  return getSlotsForDate(slots, zone, isoDate).map((s) => formatSlotTime(s, zone));
}

describe("computeBookingWindow", () => {
  it("spans today through one calendar month ahead", () => {
    const { minDate, maxDate } = computeBookingWindow(
      utc("2026-07-09T12:00:00"),
      "UTC",
    );
    expect(minDate.toISODate()).toBe("2026-07-09");
    expect(maxDate.toISODate()).toBe("2026-08-09");
  });

  it("clamps an overflowing day-of-month to the last day of next month", () => {
    const { maxDate } = computeBookingWindow(utc("2026-01-31T00:00:00"), "UTC");
    expect(maxDate.toISODate()).toBe("2026-02-28");
  });
});

describe("generateAvailableSlots", () => {
  it("spaces start times by the interview duration", () => {
    const slots = generateAvailableSlots(
      params({ workingHours: workingHours({ endTime: "11:00" }) }),
    );
    expect(startTimes(slots, "UTC", "2026-07-13")).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
    ]);
  });

  it("produces hourly slots for a 60-minute interview", () => {
    const slots = generateAvailableSlots(
      params({
        durationMinutes: 60,
        workingHours: workingHours({ startTime: "09:00", endTime: "12:00" }),
      }),
    );
    expect(startTimes(slots, "UTC", "2026-07-13")).toEqual([
      "09:00",
      "10:00",
      "11:00",
    ]);
  });

  it("only offers a slot if the full duration fits in working hours", () => {
    const slots = generateAvailableSlots(
      params({
        durationMinutes: 45,
        workingHours: workingHours({ startTime: "09:00", endTime: "10:00" }),
      }),
    );
    // 09:00–09:45 fits; 09:45–10:30 would overrun 10:00.
    expect(startTimes(slots, "UTC", "2026-07-13")).toEqual(["09:00"]);
  });

  it("removes slots overlapping a busy block but keeps adjacent ones", () => {
    const slots = generateAvailableSlots(
      params({
        workingHours: workingHours({ endTime: "11:00" }),
        busyBlocks: [
          { start: utc("2026-07-13T09:30:00"), end: utc("2026-07-13T10:00:00") },
        ],
      }),
    );
    // 09:00 ends exactly at 09:30 (adjacent, kept); 10:00 starts at busy end
    // (adjacent, kept); 09:30 overlaps and is removed.
    expect(startTimes(slots, "UTC", "2026-07-13")).toEqual([
      "09:00",
      "10:00",
      "10:30",
    ]);
  });

  it("excludes start times that have already passed today", () => {
    const slots = generateAvailableSlots(
      params({
        workingHours: workingHours({ endTime: "11:00" }),
        now: utc("2026-07-13T09:45:00"),
      }),
    );
    expect(startTimes(slots, "UTC", "2026-07-13")).toEqual(["10:00", "10:30"]);
  });

  it("does not generate slots on non-working days", () => {
    const slots = generateAvailableSlots(params());
    // 2026-07-18 is a Saturday.
    expect(getSlotsForDate(slots, "UTC", "2026-07-18")).toEqual([]);
    expect(getAvailableDates(slots, "UTC")).not.toContain("2026-07-18");
  });

  it("includes the last day of the window but nothing beyond it", () => {
    const slots = generateAvailableSlots(params());
    const dates = getAvailableDates(slots, "UTC");
    // Window: 2026-07-13 .. 2026-08-13 (a Thursday, a working day).
    expect(dates).toContain("2026-08-13");
    expect(getSlotsForDate(slots, "UTC", "2026-08-14")).toEqual([]);
    expect(dates.every((d) => d <= "2026-08-13")).toBe(true);
  });

  it("buckets slots by the candidate's display-zone date across a day boundary", () => {
    const slots = generateAvailableSlots(
      params({
        workingHours: workingHours({
          daysOfWeek: ["monday"],
          startTime: "00:00",
          endTime: "01:00",
          zone: "UTC",
        }),
        displayZone: "America/New_York",
      }),
    );
    // 2026-07-13 00:00 & 00:30 UTC land on 2026-07-12 evening in New York (-4).
    expect(startTimes(slots, "America/New_York", "2026-07-12")).toEqual([
      "20:00",
      "20:30",
    ]);
  });

  it("handles the spring-forward DST transition without a nonexistent slot", () => {
    const slots = generateAvailableSlots(
      params({
        durationMinutes: 60,
        workingHours: workingHours({
          daysOfWeek: ["sunday"],
          startTime: "01:00",
          endTime: "04:00",
          zone: "America/New_York",
        }),
        displayZone: "America/New_York",
        now: DateTime.fromISO("2026-03-08T00:00:00", {
          zone: "America/New_York",
        }),
      }),
    );
    // Clocks jump 02:00 -> 03:00 on 2026-03-08; 02:00 never exists.
    expect(startTimes(slots, "America/New_York", "2026-03-08")).toEqual([
      "01:00",
      "03:00",
    ]);
  });
});

describe("getAvailableDates", () => {
  it("returns sorted, de-duplicated ISO dates", () => {
    const slots = generateAvailableSlots(params());
    const dates = getAvailableDates(slots, "UTC");
    expect(dates[0]).toBe("2026-07-13");
    expect([...dates]).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
  });
});
