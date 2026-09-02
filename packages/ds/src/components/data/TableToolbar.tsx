import React from 'react';
import { PageTabs } from '../navigation/PageTabs';
import { SearchInput } from '../forms/SearchInput';
import type { TabItem } from '../navigation/PageTabs';

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

/**
 * The row above a list table: tabs on the left, search + actions on the right.
 * Projects, Clients, Members, ToDo, Policies and Holidays all use this exact geometry
 * (20px gaps, 250px search, 20px below).
 *
 * §52 — a composition that draws two controls and gives no way to address either. Blue's
 * own list screens never had to: their tabs are three words nothing arrives at by
 * keyboard, and their search is the only field on the page. Ours needs the tablist named
 * (§45 gave `PageTabs` a `label` and this swallowed it), both controls tagged for the
 * test ids every spec lists, and the tabs in the object form §45 added — which already
 * worked at runtime, because this forwards the array whole, and could not be said in the
 * types. Same shape as §16, §21, §37 and §40: the component draws the node, so the
 * component has to take its name.
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
    <div {...rest} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 20, ...style }}>
      {tabs && tabs.length
        ? <PageTabs tabs={tabs} active={activeTab} onChange={onTab} label={tabsLabel} data-testid={tabsTestId} />
        : <div />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginLeft: 'auto' }}>
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
