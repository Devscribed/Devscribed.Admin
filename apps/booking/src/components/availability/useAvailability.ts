"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AvailabilityDto } from "@/lib/availability/dto";

export type AvailabilityStatus = "loading" | "error" | "ready";

export interface UseAvailabilityResult {
  data: AvailabilityDto | null;
  status: AvailabilityStatus;
  reload: () => void;
}

/**
 * Fetch real-time availability for a duration + time zone. Refetches when
 * either changes; stale responses (from a superseded request) are ignored.
 * No fetch runs until `timeZone` is set.
 */
export function useAvailability(
  durationMinutes: number,
  timeZone: string,
): UseAvailabilityResult {
  const [data, setData] = useState<AvailabilityDto | null>(null);
  const [status, setStatus] = useState<AvailabilityStatus>("loading");
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!timeZone) return;
    const id = ++requestId.current;
    setStatus("loading");
    try {
      const res = await fetch(
        `/api/availability?duration=${durationMinutes}&tz=${encodeURIComponent(timeZone)}`,
      );
      if (!res.ok) throw new Error(`availability request failed: ${res.status}`);
      const json = (await res.json()) as AvailabilityDto;
      if (id !== requestId.current) return; // superseded
      setData(json);
      setStatus("ready");
    } catch {
      if (id !== requestId.current) return;
      setStatus("error");
    }
  }, [durationMinutes, timeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, status, reload: load };
}
