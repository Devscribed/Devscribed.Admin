'use client';

import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/ds';

/**
 * A minimal multi-select filter for the board/list filter bar.
 * DS `Select` is single-value; this is the app-level composition the design's
 * DS gaps entry names ("Extend `Select` with a `multiple` mode … or compose an
 * app-level `MultiSelectFilter` over the existing popover primitive").
 */
export function MultiSelectFilter({
  label,
  value,
  options,
  onChange,
  'data-testid': testId,
}: {
  label: string;
  value: string[];
  options: { value: string; label: string }[];
  onChange: (next: string[]) => void;
  'data-testid'?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(v: string) {
    const set = new Set(value);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange([...set]);
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        data-testid={testId}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-13)',
          fontWeight: 500,
          color: 'var(--text)',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 12px',
          height: 40,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>{label}</span>
        {value.length > 0 && (
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-11)',
              color: 'var(--accent)',
              background: 'var(--accent-soft)',
              borderRadius: 999,
              padding: '1px 6px',
            }}
          >
            {value.length}
          </span>
        )}
        <span aria-hidden style={{ color: 'var(--text-muted)' }}>
          ▾
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 40,
            minWidth: 220,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-pop)',
            padding: 'var(--sp-3)',
          }}
        >
          {options.length === 0 ? (
            <div
              style={{
                padding: 'var(--sp-4)',
                color: 'var(--text-muted)',
                fontSize: 'var(--fs-13)',
              }}
            >
              No options
            </div>
          ) : (
            options.map((opt) => {
              const checked = value.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-3)',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <Checkbox
                    checked={checked}
                    onChange={() => toggle(opt.value)}
                  />
                  <span style={{ fontSize: 'var(--fs-13)', color: 'var(--text)' }}>
                    {opt.label}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
