import { describe, expect, it } from "vitest";

import {
  INTERVIEW_TYPES,
  getInterviewTypeBySlug,
} from "@/lib/interview-types";

describe("interview types", () => {
  it("exposes exactly the three public interview links", () => {
    expect(INTERVIEW_TYPES.map((t) => t.durationMinutes)).toEqual([15, 30, 60]);
  });

  it("resolves a known slug", () => {
    expect(getInterviewTypeBySlug("30-min")?.durationMinutes).toBe(30);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getInterviewTypeBySlug("nope")).toBeUndefined();
  });
});
