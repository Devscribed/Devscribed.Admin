import { DateTime } from "luxon";

/** The browser's IANA time zone, falling back to UTC. */
export function detectBrowserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Human-readable zone label with current offset, e.g. "America/Los Angeles (UTC-07:00)". */
export function timeZoneLabel(zone: string): string {
  const offset = DateTime.now().setZone(zone).toFormat("ZZ");
  return `${zone.replace(/_/g, " ")} (UTC${offset})`;
}

/** All IANA zones known to the runtime, or a minimal fallback. */
export function supportedTimeZones(): string[] {
  const intl = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  const zones = intl.supportedValuesOf?.("timeZone");
  return zones && zones.length > 0 ? zones : ["UTC"];
}
