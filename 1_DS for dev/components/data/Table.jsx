import React from 'react';

/**
 * Table — row/column table recreated from components/shared/tables (infiniteScrollTable
 * styling): sticky light-gray header, 70px rows, hover tint, optional disabled/grayscale rows.
 */
export function Table({ columns = [], rows = [], disabledRowIds = [] }) {
  return (
    <div style={{ width: '100%', color: 'var(--text-primary)', fontFamily: 'var(--font-family-base)' }}>
      <div style={{ display: 'flex', width: '100%', height: 70, padding: '0 16px', backgroundColor: 'var(--surface-sunken)', borderBottom: '1px solid var(--color-gray-lighter)', position: 'sticky', top: 0, zIndex: 1 }}>
        {columns.map((col, i) => {
          const last = i === columns.length - 1;
          return (
            <div key={col} style={{ flex: '1 1', display: 'flex', alignItems: 'center', paddingLeft: 12, minWidth: 0, justifyContent: i === 0 ? 'flex-start' : last ? 'flex-end' : 'center', maxWidth: last ? 80 : 'none', paddingRight: last ? 12 : 0, fontWeight: 'var(--font-weight-semibold)', fontSize: 16, lineHeight: '24px' }}>
              {col}
            </div>
          );
        })}
      </div>
      {rows.map((row, ri) => {
        const disabled = disabledRowIds.includes(ri);
        return (
          <div
            key={ri}
            style={{
              display: 'flex', width: '100%', height: 70, padding: '0 16px', alignItems: 'center',
              borderBottom: '1px solid var(--color-gray-lighter)', backgroundColor: disabled ? 'var(--surface-disabled)' : '#fff',
              filter: disabled ? 'grayscale(1)' : 'none', opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer',
              /* .disabledRow also blocks interaction, hover included */
              pointerEvents: disabled ? 'none' : undefined,
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-row-hover)'; }}
            onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            {row.map((cell, ci) => {
              const last = ci === row.length - 1;
              return (
                <div key={ci} style={{ flex: '1 1', display: 'flex', alignItems: 'center', paddingLeft: 12, minWidth: 0, justifyContent: ci === 0 ? 'flex-start' : last ? 'flex-end' : 'center', maxWidth: last ? 80 : 'none', paddingRight: last ? 12 : 0, fontSize: 14, overflow: last ? 'visible' : 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {cell}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
