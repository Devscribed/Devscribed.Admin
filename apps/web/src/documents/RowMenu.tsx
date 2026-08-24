'use client';

import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@/ds';
import { OverflowIcon } from './icons';

export interface RowMenuItem {
  label: string;
  testId?: string;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * The `⋮` overflow menu the templates list draws on every row. Meridian ships no menu
 * component, so this is built from `IconButton` plus a popover that borrows the DS menu
 * styling used by `Select` — the same paper panel, pop shadow, and universal hover tint.
 */
export function RowMenu({ testId, items }: { testId: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <IconButton
        label="Row actions"
        size={34}
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        <OverflowIcon />
      </IconButton>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 'var(--sp-3)',
            minWidth: 160,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-pop)',
            overflow: 'hidden',
            zIndex: 30,
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              data-testid={item.testId}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'var(--hover-bg-tint)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent';
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-14)',
                color: item.danger ? 'var(--error-600)' : 'var(--text)',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
