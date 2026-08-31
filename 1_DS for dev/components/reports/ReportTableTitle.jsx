import React from 'react';
import { PageTitle } from '../core/PageTitle.jsx';
import { CloudDownloadOutlineIcon } from '../icons/Icon.jsx';

/* .tableTitle{flex;align-items:center;margin-bottom:20} .orgTimeZone{margin-left:12;$appGray;
   12px} .export{margin-left:auto;flex;$appBlue; svg 20x20 margin-right:4} */
export function ReportTableTitle({ title = 'Devscribed Inc', timeZone = 'Europe/Minsk', onExport, exportLabel = 'Export' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
      <PageTitle title={title} />
      {timeZone && <div style={{ marginLeft: 12, color: 'var(--text-secondary)', fontSize: 12 }}>{timeZone}</div>}
      <button aria-label="Export report" onClick={onExport} style={{ marginLeft: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--color-blue)' }}>
        <span style={{ display: 'flex', marginRight: 4 }}><CloudDownloadOutlineIcon width="20" height="20" /></span>
        <span>{exportLabel}</span>
      </button>
    </div>
  );
}
