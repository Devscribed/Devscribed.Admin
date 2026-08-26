import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tooltip } from '../feedback/Tooltip.jsx';

const Dots = () => (
  <svg viewBox="0 0 4 16" width={4} height={16} fill="currentColor" aria-hidden>
    <circle cx={2} cy={2} r={1.6} />
    <circle cx={2} cy={8} r={1.6} />
    <circle cx={2} cy={14} r={1.6} />
  </svg>
);

const TONES = { default: 'var(--text)', danger: 'var(--error-600)' };

/**
 * The row-actions dropdown. A real menu, not a `Modal` pretending to be one: `Escape`
 * closes it, the arrows move through it, and focus returns to the trigger it came from.
 *
 * A blocked action is **disabled rather than hidden** — a missing action is
 * indistinguishable from a bug — and stays focusable so the `tooltip` carrying its
 * reason can be reached without a pointer.
 */
export function Menu({ items = [], label = 'Actions', trigger, align = 'right', style, ...rest }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);

  const close = useCallback((restoreFocus) => {
    setOpen(false);
    if (restoreFocus && triggerRef.current) triggerRef.current.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (wrapper.current && !wrapper.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  // Roving focus: the menu owns which item is current, so a disabled entry is still
  // reachable and still announces its reason.
  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  const move = (delta) => {
    if (items.length === 0) return;
    setActive((current) => (current + delta + items.length) % items.length);
  };

  const choose = (item) => {
    if (item.disabled) return;
    setOpen(false);
    if (triggerRef.current) triggerRef.current.focus();
    item.onSelect && item.onSelect();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(items.length - 1);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <span ref={wrapper} style={{ position: 'relative', display: 'inline-flex', ...style }}>
      <button
        {...rest}
        ref={triggerRef}
        type="button"
        aria-label={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          // A menu inside a linked row must never navigate on the way to opening.
          e.preventDefault();
          e.stopPropagation();
          setActive(0);
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setActive(0);
            setOpen(true);
          }
        }}
        style={{
          width: trigger ? undefined : 32,
          height: trigger ? undefined : 32,
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-faint)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {trigger || <Dots />}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            [align]: 0,
            marginTop: 4,
            minWidth: 190,
            padding: '4px 0',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-pop)',
            zIndex: 60,
          }}
        >
          {items.map((item, index) => (
            <Tooltip
              key={item.key || index}
              content={item.disabled ? item.tooltip : null}
              placement="left"
              testId={item.tooltipTestId}
            >
              {(tooltipId) => (
                <button
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  role="menuitem"
                  // Disabled, not `disabled`: the attribute would take the item out of
                  // the tab order and the reason with it.
                  aria-disabled={item.disabled || undefined}
                  aria-describedby={item.disabled && item.tooltip ? tooltipId : undefined}
                  data-testid={item.testId}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      choose(item);
                    }
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 14px',
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'var(--font-text)',
                    fontSize: 'var(--fs-14)',
                    color: item.disabled ? 'var(--text-faint)' : TONES[item.tone] || TONES.default,
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                  }}
                  onFocus={(e) => {
                    if (!item.disabled) e.currentTarget.style.background = 'var(--hover-bg-tint)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  onMouseOver={(e) => {
                    if (!item.disabled) e.currentTarget.style.background = 'var(--hover-bg-tint)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {item.label}
                </button>
              )}
            </Tooltip>
          ))}
        </div>
      )}
    </span>
  );
}
