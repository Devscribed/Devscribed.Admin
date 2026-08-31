import React from 'react';

/** Outlined band of headline figures above a report table. */
export function ReportSummaryBanner({ summary = [] }) {
  return (
    <div style={{ display: 'flex', border: '1.5px solid var(--color-gray-light)', borderRadius: 8, padding: '12px 0', flexWrap: 'wrap' }}>
      {summary.map((i) => (
        <div key={i.label} style={{ display: 'flex', flexDirection: 'column', padding: '0 20px', flex: 1 }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{i.label}</div>
          <div style={{ fontSize: 32, fontWeight: 300, color: 'var(--color-blue)' }}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}
