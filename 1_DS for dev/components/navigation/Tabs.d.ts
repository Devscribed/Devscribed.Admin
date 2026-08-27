import * as React from 'react';

export type TabItem =
  | string
  | {
      value: string;
      label: React.ReactNode;
      /** Renders as a non-interactive, greyed placeholder — no click, no underline. */
      disabled?: boolean;
      /** `data-testid` on the tab's own element (button or disabled placeholder). */
      testId?: string;
    };

export interface TabsProps {
  items: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}

/** Bottom-underline tab strip — 3px violet underline on the active tab. */
export declare function Tabs(props: TabsProps): JSX.Element;
