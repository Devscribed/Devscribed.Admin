import { describe, expect, it } from "vitest";

import { windowsToIana } from "@/lib/availability/timezones";

describe("windowsToIana", () => {
  it("maps a Windows zone id to its IANA equivalent", () => {
    expect(windowsToIana("Pacific Standard Time")).toBe("America/Los_Angeles");
    expect(windowsToIana("GMT Standard Time")).toBe("Europe/London");
    expect(windowsToIana("India Standard Time")).toBe("Asia/Kolkata");
  });

  it("maps UTC", () => {
    expect(windowsToIana("UTC")).toBe("Etc/UTC");
  });

  it("passes through values that already look like IANA ids", () => {
    expect(windowsToIana("America/New_York")).toBe("America/New_York");
  });

  it("throws on an unrecognized Windows zone", () => {
    expect(() => windowsToIana("Nonexistent Standard Time")).toThrow(
      /Unknown Windows time zone/,
    );
  });
});
