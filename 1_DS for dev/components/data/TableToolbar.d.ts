import * as React from 'react';
import { TabItem } from '../navigation/PageTabs';

export interface TableToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** §52 — `PageTabs`' own array, object form included (§45). Forwarded whole. */
  tabs?: Array<string | TabItem>;
  activeTab?: string;
  onTab?: (tab: string) => void;
  /** §52 — accessible name for the tablist. A strip of tabs is a control, and named. */
  tabsLabel?: string;
  /** §52 — `data-testid` for the tablist, which this composition draws. */
  tabsTestId?: string;
  search?: string;
  onSearch?: (event: any) => void;
  onClearSearch?: () => void;
  searchPlaceholder?: string;
  searchWidth?: number | string;
  /** Set false on tables with no search. */
  showSearch?: boolean;
  /** §52 — accessible name for the search field; a placeholder is not one. */
  searchLabel?: string;
  /** §52 — `data-testid` for it, for the same reason as `tabsTestId`. */
  searchTestId?: string;
  /** Action buttons, right-aligned after the search field. */
  children?: React.ReactNode;
  /** §52 — every other attribute reaches the row; `style` merges over the painted one. */
}

export function TableToolbar(props: TableToolbarProps): JSX.Element;
