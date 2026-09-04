import React from 'react';
import { TimesheetsIcon, ArrowIcon } from '../icons/Icon';

export interface MiniTrackerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> {
  /** Elapsed time shown in the pill. */
  counter?: string;
  onClick?: () => void;
  /**
   * §92 — whether the panel this pill discloses is open. Sets `aria-expanded`; omit it in a
   * product whose pill discloses nothing.
   */
  expanded?: boolean;
}

/**
 * Pill in the navbar showing elapsed time. Deliberately no hover state: it is a status readout
 * that happens to be pressable, and a hover on it would read as a button in a bar of them.
 *
 * §92 — **it is a button, and it says what it discloses.** It was an `<a>` with an `onClick`
 * and no `href`, which is §38's argument met from the other side: an anchor is right for a
 * control that *navigates*, and this one does not — it opens the `Tracker` sitting over the
 * page. So it was announced as a link to nowhere, and the chevron drawn on its trailing edge —
 * the one thing on the pill saying there is more behind it — said so to nobody. `aria-expanded`
 * is what makes that promise real, and it is what tells a reader who has already opened the
 * panel that pressing again closes it.
 */
export function MiniTracker({ counter = '00:00:00', onClick, expanded, style, ...rest }: MiniTrackerProps) {
  return (
    /* §75 — everything not destructured reaches the control, `style` merged over the paint.
       Rule 3's first clause: a readout a test cannot find is a readout nobody can assert on,
       and this one is the whole of what the navbar says about a running timer. */
    <button {...rest} type="button" onClick={onClick} aria-expanded={expanded} style={{ /* @literal the pill's own hairline and its offset into the bar — one measurement, cancelled by `Navbar` */ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 144, height: 30, borderRadius: 'var(--radius-pill)', border: 'var(--border-width-hairline) solid #e4e9ef', background: 'var(--surface-card)', padding: '0 var(--space-4)', marginLeft: 15, color: 'var(--color-tracker-blue)', cursor: 'pointer', fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-base)', ...style }}>
      <span style={{ display: 'flex', color: 'var(--text-secondary)', width: 16 }}><TimesheetsIcon width="16" height="16" /></span>
      <span>{counter}</span>
      {/* Both glyphs are 16px in `--text-secondary`; only the arrow is rotated — and the
          rotation follows the panel, so the chevron points at where the thing it opens is. */}
      <span style={{ display: 'flex', transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)', color: 'var(--text-secondary)' }}><ArrowIcon width="16" /></span>
    </button>
  );
}
