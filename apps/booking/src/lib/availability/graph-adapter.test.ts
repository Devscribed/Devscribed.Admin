import type { WorkingHours } from "@microsoft/microsoft-graph-types";
import { describe, expect, it } from "vitest";

import type { BusyInterval } from "@/lib/graph/availability-source";
import {
  toBusyIntervals,
  toEngineWorkingHours,
} from "@/lib/availability/graph-adapter";

describe("toEngineWorkingHours", () => {
  it("maps Graph working hours and translates the Windows zone", () => {
    const graph: WorkingHours = {
      daysOfWeek: ["monday", "tuesday"],
      startTime: "05:00:00.0000000",
      endTime: "19:00:00.0000000",
      timeZone: { name: "Pacific Standard Time" },
    };
    expect(toEngineWorkingHours(graph)).toEqual({
      daysOfWeek: ["monday", "tuesday"],
      startTime: "05:00:00.0000000",
      endTime: "19:00:00.0000000",
      zone: "America/Los_Angeles",
    });
  });

  it("returns a closed schedule when Graph returns nothing", () => {
    expect(toEngineWorkingHours(undefined).daysOfWeek).toEqual([]);
  });
});

describe("toBusyIntervals", () => {
  const items: BusyInterval[] = [
    {
      status: "busy",
      start: "2026-07-09T14:00:00.0000000",
      end: "2026-07-09T15:00:00.0000000",
      timeZone: "UTC",
    },
    {
      status: "free",
      start: "2026-07-09T12:00:00.0000000",
      end: "2026-07-09T12:30:00.0000000",
      timeZone: "UTC",
    },
    {
      status: "tentative",
      start: "2026-07-09T16:00:00.0000000",
      end: "2026-07-09T16:30:00.0000000",
      timeZone: "UTC",
    },
  ];

  it("keeps blocking statuses and drops free time", () => {
    const intervals = toBusyIntervals(items);
    expect(intervals).toHaveLength(2);
  });

  it("parses times as instants in the reported zone", () => {
    const [busy] = toBusyIntervals(items);
    expect(busy.start.toUTC().toISO()).toBe("2026-07-09T14:00:00.000Z");
  });
});
