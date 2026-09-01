import React from 'react';
import { PageTabs } from '../navigation/PageTabs.jsx';
import { SearchInput } from '../forms/SearchInput.jsx';

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
}) {
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
