"use client";

import { useMemo } from "react";

import styles from "./availability.module.css";
import { supportedTimeZones, timeZoneLabel } from "./timezone-utils";

export interface TimeZoneSelectProps {
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
}

/** Time-zone selector; defaults to the candidate's browser zone (set by the parent). */
export function TimeZoneSelect({
  value,
  onChange,
  disabled,
}: TimeZoneSelectProps): React.JSX.Element {
  const zones = useMemo(() => {
    const list = supportedTimeZones();
    return list.includes(value) ? list : [value, ...list];
  }, [value]);

  return (
    <div className={styles.timezone}>
      <label htmlFor="tz-select">Time zone</label>
      <select
        id="tz-select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {timeZoneLabel(zone)}
          </option>
        ))}
      </select>
    </div>
  );
}
