import React from 'react';

export const REPORT_COLUMNS = ['Member', 'Current Rate', 'Total Hours', 'Amount'];

/* amountsOwed/ReportsGroupBody.module.scss — note how this differs from the timeAndActivity
   twin: the group title has NO border-radius and NO bottom border, Total sits BELOW the rows
   (not above), Total carries border-top:1.5px solid $appGrayLight and the 50px ::after spacer,
   body rows get padding-right:20px on the last cell, and nothing collapses — there is no arrow
   and no collapsed state on that page at all.
   timeOff/ReportsTable is a byte-for-byte copy, so the same body serves both: the only
   difference is WHEN the detail rows appear. */
export function ReportGroupBody({ group, columns = REPORT_COLUMNS, detailed }) {
  const bodyCell = (i) => ({ textAlign: 'left', fontWeight: 400, fontSize: 'var(--font-size-s)', paddingLeft: i === 0 ? 20 : 0, paddingRight: i === columns.length - 1 ? 20 : 0 });
  const hoverOn = (e) => { e.currentTarget.style.backgroundColor = '#eef2f5'; };
  const hoverOff = (e) => { e.currentTarget.style.backgroundColor = '#fff'; };
  return (
    <React.Fragment>
      <tbody>
        <tr style={{ backgroundColor: '#eef2f5', height: 50 }}>
          <td colSpan={columns.length} style={{ padding: '0 20px', textAlign: 'left', fontSize: 'var(--font-size-s)', fontWeight: 550, verticalAlign: 'middle' }}>{group.title}</td>
        </tr>
      </tbody>
      <tbody>
        {group.members.map((m) => (
          <React.Fragment key={m.member}>
            <tr style={{ backgroundColor: '#fff', height: 50 }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
              {columns.map((col, i) => (
                <td key={col} style={bodyCell(i)}>
                  {col === 'Member' ? m.member : col === 'Current Rate' ? m.currentRate : col === 'Total Hours' ? m.totalHours : col === 'Amount' ? m.amount : ''}
                </td>
              ))}
            </tr>
            {/* MemberDetailedRowItem — inline border-bottom: 1px solid #E7E7E7, and only
                activity / totalHours / notes carry a value; every other cell is deliberately
                empty. Notes is truncated at 20 characters (truncateString). */}
            {detailed && (m.details || []).map((d, di) => (
              <tr key={di} style={{ backgroundColor: '#fff', height: 50, borderBottom: '1px solid #E7E7E7' }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                {columns.map((col, i) => (
                  <td key={col} style={bodyCell(i)}>
                    {col === 'Activities' ? (d.activity || '') : col === 'Total Hours' ? (d.totalHours || '') : col === 'Notes' ? (d.notes || '') : ''}
                  </td>
                ))}
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
      <tbody>
        <tr style={{ backgroundColor: '#fff', height: 50, position: 'relative', borderTop: '1.5px solid var(--color-gray-light)' }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          {columns.map((col, i) => (
            <td key={col} style={{ textAlign: 'left', fontWeight: 500, fontSize: 16, paddingLeft: i === 0 ? 20 : 0, paddingRight: i === columns.length - 1 ? 20 : 0 }}>
              {/* TotalRowItem fills only totalHours and amount */}
              {i === 0 ? 'Total' : col === 'Total Hours' ? group.total.totalHours : col === 'Amount' ? group.total.amount : ''}
            </td>
          ))}
        </tr>
        {/* .groupTotal::after */}
        <tr><td colSpan={columns.length} style={{ height: 50, padding: 0 }} /></tr>
      </tbody>
    </React.Fragment>
  );
}

/** The <thead> that goes with ReportGroupBody. */
export function ReportTableHead({ columns = REPORT_COLUMNS }) {
  return (
    <thead>
      <tr style={{ height: 50 }}>
        {columns.map((h, i) => (
          <th key={h} style={{ minWidth: 160, textAlign: 'left', fontWeight: 500, height: 70, paddingRight: i === columns.length - 1 ? 20 : 12, paddingLeft: i === 0 ? 20 : 0 }}>{h}</th>
        ))}
      </tr>
    </thead>
  );
}
