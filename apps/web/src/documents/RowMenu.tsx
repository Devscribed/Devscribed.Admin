'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/ds';
import { OverflowIcon } from './icons';

export interface RowMenuItem {
  label: string;
  testId?: string;
  danger?: boolean;
  onSelect: () => void;
}

/** Distance kept from the viewport edge when the menu has to flip above the trigger. */
const VIEWPORT_MARGIN = 8;
/** The gap the panel used to get from `marginTop` while it flowed under the button. */
const MENU_GAP = 6;
const MENU_WIDTH = 180;

interface Anchor {
  left: number;
  top: number | null;
  bottom: number | null;
  maxHeight: number;
}

/**
 * The `⋮` overflow menu the templates list draws on every row. Meridian ships no menu
 * component, so this is built from `IconButton` plus a popover that borrows the DS menu
 * styling used by `Select` — the same paper panel, pop shadow, and universal hover tint.
 *
 * The panel is rendered into `document.body` rather than beside the button. The rows live
 * inside a `Card`, which clips its children (`overflow: hidden`) so its rounded corners
 * survive an edge-to-edge table; that cropped the open menu to the few pixels of row
 * height below the button. The Card genuinely needs that clip, so the menu leaves the
 * subtree instead — which also makes it immune to any clipping ancestor added later.
 */
export function RowMenu({ testId, items }: { testId: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  /**
   * The DS `IconButton` types its props without `ref`, so the button element is reached
   * through its wrapper instead of forwarding one — the wrapper contains exactly this one
   * button. Both the popover's anchor rect and the focus return need that element.
   */
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerEl = () => wrapperRef.current?.querySelector('button') ?? null;

  const measure = useCallback(() => {
    const trigger = wrapperRef.current?.querySelector('button');
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - VIEWPORT_MARGIN;
    const above = box.top - VIEWPORT_MARGIN;
    const flip = below < 160 && above > below;
    setAnchor({
      // Right-aligned to the button, as it was, but clamped so a menu on a narrow
      // viewport cannot end up half off-screen.
      left: Math.max(VIEWPORT_MARGIN, Math.min(box.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)),
      top: flip ? null : box.bottom + MENU_GAP,
      bottom: flip ? window.innerHeight - box.top + MENU_GAP : null,
      maxHeight: Math.max(120, (flip ? above : below) - MENU_GAP),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();

    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = wrapperRef.current?.contains(target) ?? false;
      // The panel is outside this component's DOM subtree now, so it has to be excluded
      // explicitly — otherwise `mousedown` would unmount it before an item's `click`.
      const inPanel = panelRef.current?.contains(target) ?? false;
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerEl()?.focus();
    };
    // Capture phase, because the app shell's main column scrolls without bubbling a
    // scroll event to the window — a fixed panel would otherwise drift off its row.
    const reposition = () => measure();

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, measure]);

  const panel = (
    <div
      ref={panelRef}
      role="menu"
      style={{
        position: 'fixed',
        left: anchor?.left ?? 0,
        top: anchor?.top ?? undefined,
        bottom: anchor?.bottom ?? undefined,
        width: MENU_WIDTH,
        maxHeight: anchor?.maxHeight,
        overflowY: 'auto',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-pop)',
        // A child of <body>, so this only orders against other body-level layers: above
        // the Modal overlay (100), below the toasts (200) — same rule as the DS `Select`.
        zIndex: 150,
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
            // Focus returns to the row's own button before the action runs, so a menu
            // item that only opens a modal does not strand the caret on <body>.
            triggerEl()?.focus();
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
  );

  return (
    // No `position: relative` any more — nothing is positioned against this wrapper, and
    // leaving it would suggest the panel still flows from here.
    <div ref={wrapperRef} style={{ display: 'inline-flex' }}>
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

      {open && typeof document !== 'undefined' && createPortal(panel, document.body)}
    </div>
  );
}
