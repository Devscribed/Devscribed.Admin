import React from 'react';
import { PageTabs } from '../navigation/PageTabs.jsx';
import { DateRangePicker } from '../forms/DateRangePicker.jsx';
import { Button } from '../core/Button.jsx';

/* Reports.module.scss is shared by every report page, so this row is shared too:
   tabs + date range + Apply on the left, Filters on the right. */
export function ReportControls({ tabs = ['Me', 'All'], tab, onTab, range, onRange, onApply, onFilters, maxDate }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 20 }}>
      <PageTabs tabs={tabs} active={tab} onChange={onTab} />
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ width: 220 }}>
          <DateRangePicker start={range && range.start} end={range && range.end} maxDate={maxDate} onChange={([s, e]) => onRange && onRange({ start: s, end: e })} />
        </div>
        <div><Button onClick={onApply}>Apply</Button></div>
      </div>
      <div><Button variant="primary" onClick={onFilters}>Filters</Button></div>
    </div>
  );
}
