import * as React from 'react';

export interface TabItemObject {
  value: string;
  /** A node, so a count or a badge composes without this component growing a prop for it. */
  label: React.ReactNode;
  /** `data-testid` on the tab. */
  testId?: string;
  /** Id of the panel this tab controls, when the caller gives its panel one. */
  controls?: string;
}

export type TabItem = string | TabItemObject;

export interface TabsProps {
  items: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  /** Accessible name for the strip itself. */
  label?: string;
  style?: React.CSSProperties;
}

/**
 * Bottom-underline tab strip — 3px violet underline on the active tab. A real
 * `tablist`, with roving focus: the strip is one tab stop and the arrows move within it.
 */
export declare function Tabs(props: TabsProps): JSX.Element;
