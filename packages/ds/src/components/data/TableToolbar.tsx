import React from 'react';
import { PageTabs } from '../navigation/PageTabs';
import { SearchInput } from '../forms/SearchInput';
import type { TabItem } from '../navigation/PageTabs';

export interface TableToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `PageTabs`' own array, object form included (§45). Forwarded whole. */
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

/**
 * The row above a list table: tabs on the left, search and actions on the right. One geometry
 * for every list screen — 20px gaps, a 250px search, 20px of clearance below.
 *
 * §52 — it draws two controls, so it has to take both their names. A composition that renders
 * a tablist and a search field and offers no way to label or tag either leaves every screen
 * with an unnamed tablist and a field whose only description is its placeholder. Same rule as
 * §16, §21, §37 and §40: whoever draws the node owns its name and its test id.
 */
export function TableToolbar({
  tabs, activeTab, onTab,
  /** §52 — the tablist's accessible name, and a test id for the strip. */
  tabsLabel, tabsTestId,
  search, onSearch, onClearSearch, searchPlaceholder = 'Search', searchWidth = 250, showSearch = true,
  /** §52 — the search field's accessible name and test id; its placeholder is not a label. */
  searchLabel, searchTestId,
  style,
  children,
  ...rest
}: TableToolbarProps) {
  return (
    <div {...rest} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-7)', marginBottom: 'var(--space-7)', ...style }}>
      {tabs && tabs.length
        ? <PageTabs tabs={tabs} active={activeTab} onChange={onTab} label={tabsLabel} data-testid={tabsTestId} />
        : <div />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-7)', marginLeft: 'auto' }}>
        {showSearch && (
          <div style={{ width: searchWidth }}>
            <SearchInput
              placeholder={searchPlaceholder}
              value={search}
              onChange={onSearch}
              onClear={onClearSearch}
              aria-label={searchLabel}
              data-testid={searchTestId}
              outlined
            />
          </div>
        )}
        {React.Children.map(children, (child) => <div style={{ maxWidth: 300 }}>{child}</div>)}
      </div>
    </div>
  );
}
