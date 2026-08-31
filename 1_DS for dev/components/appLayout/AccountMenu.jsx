import React from 'react';
import { UserIcon, ArrowIcon } from '../icons/Icon.jsx';

const DEFAULT_ITEMS = ['My account', 'My organization', 'Log out'];

/**
 * Avatar + name in the navbar, with the account dropdown.
 * UserIcon renders at its own 46x46 — the .avatar{45x45} rule in AccountMenu.module.scss is
 * never applied to it. .menuArrow is a 14px box around the 12x8 ArrowIcon, rotated 180deg,
 * fill $appGray -> $appBlue while the whole wrapper is hovered.
 *
 * §16 — prod's trigger is a `<div onClick>` wrapping the popover, so the menu cannot be opened
 * from a keyboard, cannot be left with `Escape`, is announced as nothing, and re-toggles itself
 * when an item inside it is clicked. The paint is unchanged; the control under it is a real
 * button and the list is a real menu. Items may still be plain strings — prod's shape — or
 * objects carrying their own `testId` and handler.
 */
export function AccountMenu({
  name = 'Alex Chen', items = DEFAULT_ITEMS, onNavigate, nameTestId, menuTestId, style, ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const ref = React.useRef(null);
  const trigger = React.useRef(null);
  const entries = items.map((item) => (typeof item === 'string' ? { label: item } : item));

  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const escape = (e) => {
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
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none', color: 'var(--text-primary)', ...style }}
      >
        <span data-testid={nameTestId} style={{ fontWeight: 500, fontSize: 'var(--font-size-s)', lineHeight: '20px', textAlign: 'right', fontFamily: 'var(--font-family-base)' }}>{name}</span>
        <UserIcon aria-hidden />
        <span aria-hidden style={{ width: 14, display: 'flex', transform: 'rotate(180deg)', color: hover ? 'var(--color-blue)' : 'var(--text-secondary)' }}><ArrowIcon /></span>
      </button>
      {open && (
        <div role="menu" data-testid={menuTestId} style={{ position: 'absolute', right: 0, top: 50, minWidth: 160, padding: '5px 0', backgroundColor: '#fff', borderRadius: 6, boxShadow: 'var(--shadow-popover)', zIndex: 1000 }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', overflow: 'hidden' }}>
            {/* .popover li — hover paints the li (#f8f8f8 + $appBlue text) and the link
               inherits the navbar's 16px body size; only padding and colour are set. */}
            {entries.map((entry) => (
              <li key={entry.label} style={{ margin: '0 5px', borderRadius: 4, textAlign: 'left', whiteSpace: 'nowrap' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8f8f8'; e.currentTarget.firstElementChild.style.color = 'var(--color-blue)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.firstElementChild.style.color = 'var(--text-primary)'; }}>
                <button type="button" role="menuitem" data-testid={entry.testId}
                  onClick={() => {
                    setOpen(false);
                    if (entry.onSelect) entry.onSelect();
                    else if (onNavigate) onNavigate(entry.label);
                  }}
                  style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}>
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
