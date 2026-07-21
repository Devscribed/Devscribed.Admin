import * as React from 'react';

export type TabItem = string | { value: string; label: React.ReactNode };

export interface TabsProps {
  items: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}

/** Bottom-underline tab strip — 3px violet underline on the active tab. */
export declare function Tabs(props: TabsProps): JSX.Element;
