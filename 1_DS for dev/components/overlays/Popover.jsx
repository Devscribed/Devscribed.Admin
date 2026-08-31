import React from 'react';
import { ThreeDotsIcon } from '../icons/Icon.jsx';

/**
 * Popover — click-to-open menu list recreated from ActionsPopover (row kebab menu) and
 * AccountMenu's user popover. With no `trigger` it renders ActionsPopover's own button:
 * a 32x32 circle, `rgba(0,0,0,0.08)` background and a 22px dark kebab that both turn blue /
 * white on hover and while the menu is open (`.activeBtn`).
 * ActionsPopover.module.scss: .wrapper{display:inline-block;32x32;margin-right:8px}
 * .btn{transition:background-color .2s; svg{transition:fill .2s}}
 * .popover{right:0; top:42px; min-width:160px; padding:5px 0; radius:6px;
 * box-shadow:0 6px 12px rgb(0 0 0 / 18%); z-index:1000}
 * li{margin:0 5px; radius:4px; :hover{background:#f8f8f8; color:$appBlue}}
 * a,button{padding:8px 14px; width:100%; text-align:left; color:$appBlack}
 * Note: no destructive styling exists in prod — every row, "Delete project" included, is
 * $appBlack turning $appBlue on hover, so `danger` is an opt-in this app never uses.
 */
export function Popover({ trigger, items = [], align = 'right', disabled }) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);
  const lit = !disabled && (open || hover);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', marginRight: trigger ? 0 : 8 }}>
      {trigger ? (
        <div onClick={() => !disabled && setOpen((o) => !o)} style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>{trigger}</div>
      ) : (
        <button
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
            borderRadius: '50%', cursor: disabled ? 'not-allowed' : 'pointer',
            backgroundColor: lit ? 'var(--color-blue)' : 'rgba(0, 0, 0, 0.08)',
            color: lit ? '#fff' : 'var(--text-primary)',
            transition: 'background-color 0.2s, color 0.2s',
          }}
        >
          <ThreeDotsIcon width="22" />
        </button>
      )}
      {open && (
        <div
          style={{
            position: 'absolute', [align]: 0, top: 42, minWidth: 160,
            padding: '5px 0', backgroundColor: '#fff', borderRadius: 'var(--radius-m)',
            boxShadow: 'var(--shadow-popover)', zIndex: 1000, overflow: 'hidden',
          }}
        >
          {items.map((item) => (
            <div
              key={item.label}
              onClick={() => { item.onClick && item.onClick(); setOpen(false); }}
              style={{
                textAlign: 'left', whiteSpace: 'nowrap', margin: '0 5px', cursor: 'pointer',
                color: item.danger ? 'var(--status-error)' : 'var(--text-primary)', borderRadius: 4,
                /* ActionsPopover sets no font-size on its rows, so they inherit the context:
                   14px inside a table cell (.fBodyCell), 16px in the navbar's AccountMenu. */
                padding: '8px 14px', fontFamily: 'var(--font-family-base)', fontSize: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8f8f8'; if (!item.danger) e.currentTarget.style.color = 'var(--color-blue)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; if (!item.danger) e.currentTarget.style.color = 'var(--text-primary)'; }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
