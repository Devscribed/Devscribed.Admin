import React from 'react';
import { TimesheetsIcon, ArrowIcon } from '../icons/Icon.jsx';

/**
 * Pill in the navbar that opens the floating Tracker.
 * MiniTracker.module.scss defines no :hover — the mini tracker has no hover state in prod.
 */
export function MiniTracker({ counter = '00:00:00', onClick }) {
  return (
    <a onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 144, height: 30, borderRadius: 20, border: '1px solid #e4e9ef', padding: '0 10px', marginLeft: 15, color: 'var(--color-tracker-blue)', cursor: 'pointer', fontFamily: 'var(--font-family-base)', fontSize: 16 }}>
      <span style={{ display: 'flex', color: 'var(--text-secondary)', width: 16 }}><TimesheetsIcon width="16" height="16" /></span>
      <span>{counter}</span>
      {/* .link svg{fill:#64748B; width:16px} applies to both icons; .arrow{transform:rotate(90deg)} */}
      <span style={{ display: 'flex', transform: 'rotate(90deg)', color: 'var(--text-secondary)' }}><ArrowIcon width="16" /></span>
    </a>
  );
}
