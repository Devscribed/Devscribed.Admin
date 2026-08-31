import React from 'react';
import { PageTabs } from '../navigation/PageTabs.jsx';
import { SearchInput } from '../forms/SearchInput.jsx';

/**
 * The row above a list table: tabs on the left, search + actions on the right.
 * Projects, Clients, Members, ToDo, Policies and Holidays all use this exact geometry
 * (20px gaps, 250px search, 20px below).
 */
export function TableToolbar({
  tabs, activeTab, onTab,
  search, onSearch, onClearSearch, searchPlaceholder = 'Search', searchWidth = 250, showSearch = true,
  children,
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 20 }}>
      {tabs && tabs.length ? <PageTabs tabs={tabs} active={activeTab} onChange={onTab} /> : <div />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginLeft: 'auto' }}>
        {showSearch && (
          <div style={{ width: searchWidth }}>
            <SearchInput
              placeholder={searchPlaceholder}
              value={search}
              onChange={onSearch}
              onClear={onClearSearch}
              outlined
            />
          </div>
        )}
        {React.Children.map(children, (child) => <div style={{ maxWidth: 300 }}>{child}</div>)}
      </div>
    </div>
  );
}
