import React from 'react';
import { UserIcon, ArrowIcon } from '../icons/Icon';

export interface AccountMenuItem {
  label: string;
  testId?: string;
  /** Runs instead of `onNavigate` for this entry. */
  onSelect?: () => void;
}

/** Rest props land on the trigger button — it is the control, and what a test reaches for. */
export interface AccountMenuProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  name?: string;
  /** Menu entries; defaults to My account / My organization / Log out. */
  items?: (string | AccountMenuItem)[];
  onNavigate?: (item: string) => void;
  /** `data-testid` for the name, which is drawn inside the trigger. */
  nameTestId?: string;
  /** `data-testid` for the open menu. */
  menuTestId?: string;
}

const DEFAULT_ITEMS = ['My account', 'My organization', 'Log out'];

/**
 * Avatar + name in the navbar, with the account dropdown. `UserIcon` renders at its own 46x46;
 * the arrow is a 14px box around the 12x8 `ArrowIcon`, rotated 180deg, turning from
 * `--text-secondary` to `--color-blue` while the whole wrapper is hovered.
 *
 * §16 — the trigger is a real `<button>` and the list a real `role="menu"`. A `<div onClick>`
 * wrapping a popover cannot be opened from a keyboard, cannot be left with `Escape`, is
 * announced as nothing, and re-toggles itself when an item inside it is clicked. Items are
 * plain strings, or objects carrying their own `testId` and handler.
 */
export function AccountMenu({
  name = 'Alex Chen', items = DEFAULT_ITEMS, onNavigate, nameTestId, menuTestId, style, ...rest
}: AccountMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const entries: AccountMenuItem[] = items.map((item) => (typeof item === 'string' ? { label: item } : item));

  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Back to the control that opened it, or the focus is left on a node that just left.
      if (trigger.current) trigger.current.focus();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ position: 'relative' }}>
      <button
        {...rest}
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', cursor: 'pointer', userSelect: 'none', color: 'var(--text-primary)', ...style }}
      >
        <span data-testid={nameTestId} style={{ /* @literal the name's own line box, so the trigger is one height whatever the type does */ fontWeight: 500, fontSize: 'var(--font-size-s)', lineHeight: '20px', textAlign: 'right', fontFamily: 'var(--font-family-base)' }}>{name}</span>
        <UserIcon aria-hidden />
        <span aria-hidden style={{ width: 14, display: 'flex', transform: 'rotate(180deg)', color: hover ? 'var(--color-blue)' : 'var(--text-secondary)' }}><ArrowIcon /></span>
      </button>
      {open && (
        <div role="menu" data-testid={menuTestId} style={{ /* @literal 5px is below the scale's first step: the panel's end caps, sized so no row reaches a rounded corner */ position: 'absolute', right: 0, top: 50, minWidth: 160, padding: '5px 0', backgroundColor: 'var(--surface-overlay)', borderRadius: 'var(--radius-m)', boxShadow: 'var(--shadow-popover)', zIndex: 1000 }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', overflow: 'hidden' }}>
            {/* Hover paints the row, not the label: the background lifts to #f8f8f8 and the
               ink turns blue together. The size is inherited from the navbar's 16px body. */}
            {entries.map((entry) => (
              <li key={entry.label} style={{ /* @literal the row's inset from the panel edge, below the scale — see the panel's own padding */ margin: '0 5px', borderRadius: 'var(--radius-s)', textAlign: 'left', whiteSpace: 'nowrap' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-row-hover)'; (e.currentTarget.firstElementChild as HTMLElement).style.color = 'var(--color-blue)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; (e.currentTarget.firstElementChild as HTMLElement).style.color = 'var(--text-primary)'; }}>
                <button type="button" role="menuitem" data-testid={entry.testId}
                  onClick={() => {
                    setOpen(false);
                    if (entry.onSelect) entry.onSelect();
                    else if (onNavigate) onNavigate(entry.label);
                  }}
                  style={{ /* @literal 14px sits between two steps of the scale; either one moves the row */ display: 'block', width: '100%', padding: 'var(--space-3) 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}>
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
