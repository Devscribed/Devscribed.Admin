import * as React from 'react';

export interface ToggleProps {
  options: (string | { value: string; label: React.ReactNode })[];
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}

/** Pill-shaped segmented control — the day/week/month + light/dark pattern. */
export declare function Toggle(props: ToggleProps): JSX.Element;
