import React from 'react';
import { TimesheetsIcon, ArrowIcon } from '../icons/Icon';

export interface MiniTrackerProps {
  /** Elapsed time shown in the pill. */
  counter?: string;
  onClick?: () => void;
}

/**
 * Pill in the navbar showing elapsed time. Deliberately no hover state: it is a status readout
 * that happens to be pressable, and a hover on it would read as a button in a bar of them.
 */
export function MiniTracker({ counter = '00:00:00', onClick }: MiniTrackerProps) {
  return (
    <a onClick={onClick} style={{ /* @literal the pill's own hairline and its offset into the bar — one measurement, cancelled by `Navbar` */ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 144, height: 30, borderRadius: 'var(--radius-pill)', border: 'var(--border-width-hairline) solid #e4e9ef', padding: '0 var(--space-4)', marginLeft: 15, color: 'var(--color-tracker-blue)', cursor: 'pointer', fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-base)' }}>
      <span style={{ display: 'flex', color: 'var(--text-secondary)', width: 16 }}><TimesheetsIcon width="16" height="16" /></span>
      <span>{counter}</span>
      {/* Both glyphs are 16px in `--text-secondary`; only the arrow is rotated. */}
      <span style={{ display: 'flex', transform: 'rotate(90deg)', color: 'var(--text-secondary)' }}><ArrowIcon width="16" /></span>
    </a>
  );
}
