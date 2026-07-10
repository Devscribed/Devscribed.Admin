import { describe, expect, it } from "vitest";

import {
  addMonth,
  buildMonthGrid,
  dateCellState,
  edgeAvailableDateInMonth,
  findAvailableDate,
  monthLabel,
  monthOf,
} from "@/components/availability/calendar-utils";

describe("month helpers", () => {
  it("labels a month", () => {
    expect(monthLabel("2026-07")).toBe("July 2026");
  });

  it("shifts months across a year boundary", () => {
    expect(addMonth("2026-12", 1)).toBe("2027-01");
    expect(addMonth("2026-01", -1)).toBe("2025-12");
  });

  it("extracts the month of a date", () => {
    expect(monthOf("2026-07-14")).toBe("2026-07");
  });
});

describe("buildMonthGrid", () => {
  it("lays out all days in 7-column weeks with blank padding", () => {
    const weeks = buildMonthGrid("2026-07");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const days = weeks.flat().filter((d): d is string => d !== null);
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-07-01");
    expect(days[30]).toBe("2026-07-31");
  });

  it("places July 1 2026 (a Wednesday) in the correct column", () => {
    const [firstWeek] = buildMonthGrid("2026-07");
    // Monday-first: Mon,Tue,Wed -> index 2 is the first day.
    expect(firstWeek[0]).toBeNull();
    expect(firstWeek[1]).toBeNull();
    expect(firstWeek[2]).toBe("2026-07-01");
  });
});

describe("dateCellState", () => {
  const min = "2026-07-09";
  const max = "2026-08-09";
  const available = new Set(["2026-07-14", "2026-07-15"]);

  it("classifies past, beyond, available, and unavailable", () => {
    expect(dateCellState("2026-07-08", min, max, available)).toBe("past");
    expect(dateCellState("2026-08-10", min, max, available)).toBe("beyond");
    expect(dateCellState("2026-07-14", min, max, available)).toBe("available");
    expect(dateCellState("2026-07-16", min, max, available)).toBe("unavailable");
  });
});

describe("findAvailableDate", () => {
  const available = new Set(["2026-07-11", "2026-07-20"]);

  it("finds the next available date forward", () => {
    expect(
      findAvailableDate("2026-07-09", 1, available, "2026-07-09", "2026-08-09"),
    ).toBe("2026-07-11");
  });

  it("finds the previous available date backward", () => {
    expect(
      findAvailableDate("2026-07-25", -1, available, "2026-07-09", "2026-08-09"),
    ).toBe("2026-07-20");
  });

  it("returns null when none within bounds", () => {
    expect(
      findAvailableDate("2026-07-20", 1, available, "2026-07-09", "2026-08-09"),
    ).toBeNull();
  });
});

describe("edgeAvailableDateInMonth", () => {
  const available = new Set(["2026-07-11", "2026-07-20", "2026-08-03"]);

  it("returns first and last available in a month", () => {
    expect(edgeAvailableDateInMonth("2026-07", "first", available)).toBe(
      "2026-07-11",
    );
    expect(edgeAvailableDateInMonth("2026-07", "last", available)).toBe(
      "2026-07-20",
    );
  });

  it("returns null for a month with no availability", () => {
    expect(edgeAvailableDateInMonth("2026-09", "first", available)).toBeNull();
  });
});
