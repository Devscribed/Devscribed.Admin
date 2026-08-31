import React from 'react';
import { UserIcon, ArrowIcon } from '../icons/Icon.jsx';

const DEFAULT_ITEMS = ['My account', 'My organization', 'Log out'];

/**
 * Avatar + name in the navbar, with the account dropdown.
 * UserIcon renders at its own 46x46 — the .avatar{45x45} rule in AccountMenu.module.scss is
 * never applied to it. .menuArrow is a 14px box around the 12x8 ArrowIcon, rotated 180deg,
 * fill $appGray -> $appBlue while the whole wrapper is hovered.
 */
export function AccountMenu({ name = 'Alex Chen', items = DEFAULT_ITEMS, onNavigate }) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} onClick={() => setOpen(!open)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', position: 'relative', userSelect: 'none' }}>
      <div style={{ fontWeight: 500, fontSize: 'var(--font-size-s)', lineHeight: '20px', textAlign: 'right', fontFamily: 'var(--font-family-base)' }}>{name}</div>
      <UserIcon />
      <span style={{ width: 14, display: 'flex', transform: 'rotate(180deg)', color: hover ? 'var(--color-blue)' : 'var(--text-secondary)' }}><ArrowIcon /></span>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 50, minWidth: 160, padding: '5px 0', backgroundColor: '#fff', borderRadius: 6, boxShadow: 'var(--shadow-popover)', zIndex: 1000 }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', overflow: 'hidden' }}>
            {/* .popover li — hover paints the li (#f8f8f8 + $appBlue text) and the link
               inherits the navbar's 16px body size; only padding and colour are set. */}
            {items.map((t) => (
              <li key={t} style={{ margin: '0 5px', borderRadius: 4, textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8f8f8'; e.currentTarget.firstElementChild.style.color = 'var(--color-blue)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.firstElementChild.style.color = 'var(--text-primary)'; }}>
                <a href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate(t); }} style={{ display: 'block', width: '100%', height: '100%', padding: '8px 14px', color: 'var(--text-primary)' }}>{t}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
