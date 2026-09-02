'use client';

import { useEffect, useRef, useState } from 'react';
import type { FilterOption } from './types';

/**
 * Multi-select dropdown filter (spec reports/01 §Filter bar — Members /
 * Projects / Clients). The mockup's `.flt` chip trigger with a `.count` pill,
 * a caret, and a `.drop` panel of checkbox rows. Closes on outside click or
 * Escape.
 *
 * DS ships no multi-select and no combobox; the trigger uses tokens
 * (`--border-strong`, `--accent-soft`, `--radius-lg`) so it lines up with the
 * DateRangeInput chip next to it.
 *
 * TODO(ds-gap): promote a multi-select combobox into the design system when a
 * second area needs it — several other filter surfaces will inherit it.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  testId,
  disabled,
}: {
  label: string;
  options: readonly FilterOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  testId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    onChange(next);
  }

  const count = selected.length;
  const triggerLabel = count === 0 ? 'All' : count === 1 ? '1 selected' : `${count} selected`;

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', display: 'inline-block' }}
      data-testid={testId}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 36,
          padding: '0 12px',
          border: '1.5px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-panel)',
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'var(--fs-13)',
          color: 'var(--text)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span
          style={{
            color: 'var(--text-muted)',
            fontWeight: 400,
            marginRight: 4,
          }}
        >
          {label}:
        </span>
        {triggerLabel}
        {count > 0 && (
          <span
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              padding: '1px 8px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--fs-11)',
              fontWeight: 600,
            }}
          >
            {count}
          </span>
        )}
        <Caret />
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 42,
            left: 0,
            zIndex: 20,
            minWidth: 240,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-modal)',
            padding: 8,
          }}
        >
          {options.length === 0 ? (
            <div
              style={{
                padding: 'var(--sp-4)',
                color: 'var(--text-muted)',
                fontSize: 'var(--fs-13)',
                textAlign: 'center',
              }}
            >
              No options.
            </div>
          ) : (
            options.map((opt) => {
              const on = selected.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  role="option"
                  aria-selected={on}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 'var(--fs-14)',
                    color: 'var(--text)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(opt.id)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 0,
        height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderTop: '5px solid var(--text-muted)',
        marginLeft: 4,
      }}
    />
  );
}
