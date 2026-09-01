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
 *
 * §22 — prod's rows are `<div onClick>` inside a `<div onClick>` trigger, so the menu could
 * not be opened, walked or left from a keyboard and was announced as nothing. The paint is
 * unchanged; what is under it is a real `aria-haspopup="menu"` button and a real `role="menu"`.
 * A blocked row is disabled *and still focusable* — `aria-disabled`, never the `disabled`
 * attribute — because the whole point of showing it is that its reason can be read.
 */
export function Popover({
  trigger, items = [], align = 'right', disabled, label, style, ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const ref = React.useRef(null);
  const triggerRef = React.useRef(null);
  const itemRefs = React.useRef([]);
  const menuId = React.useId();
  const entries = items.map((item) => (typeof item === 'string' ? { label: item } : item));

  React.useEffect(() => {
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  /* Focus enters the menu on open and comes back to the trigger on close — without the return
     a keyboard user is left on a node that has just been unmounted, i.e. on <body>. */
  React.useEffect(() => {
    if (!open) return undefined;
    const first = itemRefs.current[0];
    if (first) first.focus();
    setActive(0);
    return () => { if (triggerRef.current && document.contains(triggerRef.current)) triggerRef.current.focus(); };
  }, [open]);

  function select(entry) {
    if (entry.disabled) return;
    setOpen(false);
    /* `onClick` is blue's own name for this; `onSelect` is §16's, so a consumer writing both
       of the system's menus writes one shape. */
    if (entry.onSelect) entry.onSelect();
    else if (entry.onClick) entry.onClick();
  }

  function onMenuKeyDown(e) {
    // Both, for the reason `Select`'s Escape gives — see the note on §21 in the ledger.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (step && entries.length) {
      e.preventDefault();
      const next = (active + step + entries.length) % entries.length;
      setActive(next);
      const node = itemRefs.current[next];
      if (node) node.focus();
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : entries.length - 1;
      setActive(next);
      const node = itemRefs.current[next];
      if (node) node.focus();
    }
  }

  const lit = !disabled && (open || hover);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', marginRight: trigger ? 0 : 8 }}>
      {trigger ? (
        <button
          {...rest}
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
        >
          {trigger}
        </button>
      ) : (
        <button
          {...rest}
          ref={triggerRef}
          type="button"
          aria-label={label || 'Actions'}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
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
            ...style,
          }}
        >
          <ThreeDotsIcon width="22" aria-hidden />
        </button>
      )}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          style={{
            position: 'absolute', [align]: 0, top: 42, minWidth: 160,
            padding: '5px 0', backgroundColor: '#fff', borderRadius: 'var(--radius-m)',
            boxShadow: 'var(--shadow-popover)', zIndex: 1000, overflow: 'hidden',
          }}
        >
          {entries.map((item, i) => {
            const describedBy = item.description ? `${menuId}-desc-${i}` : undefined;
            return (
              <div
                key={item.key || item.label}
                ref={(node) => { itemRefs.current[i] = node; }}
                role="menuitem"
                tabIndex={i === active ? 0 : -1}
                data-testid={item.testId}
                /* `aria-disabled`, not `disabled`: the row has to stay focusable, or the reason
                   it is blocked can be seen and never read. */
                aria-disabled={item.disabled || undefined}
                aria-describedby={describedBy}
                onClick={() => select(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(item); }
                }}
                style={{
                  textAlign: 'left', margin: '0 5px', cursor: item.disabled ? 'default' : 'pointer',
                  color: item.disabled ? 'var(--text-secondary)' : item.danger ? 'var(--status-error)' : 'var(--text-primary)',
                  borderRadius: 4,
                  /* ActionsPopover sets no font-size on its rows, so they inherit the context:
                     14px inside a table cell (.fBodyCell), 16px in the navbar's AccountMenu. */
                  padding: '8px 14px', fontFamily: 'var(--font-family-base)', fontSize: 'inherit',
                  /* §50 — the *label* never wraps. Letting the row go `normal` so its
                     description could wrap took the label with it, and "Delete vacancy" broke
                     across two lines in a 160px menu. Only the description wraps now. */
                  whiteSpace: 'nowrap',
                }}
                onFocus={() => setActive(i)}
                onMouseEnter={(e) => {
                  if (item.disabled) return;
                  e.currentTarget.style.backgroundColor = '#f8f8f8';
                  if (!item.danger) e.currentTarget.style.color = 'var(--color-blue)';
                }}
                onMouseLeave={(e) => {
                  if (item.disabled) return;
                  e.currentTarget.style.backgroundColor = 'transparent';
                  if (!item.danger) e.currentTarget.style.color = 'var(--text-primary)';
                }}
              >
                {item.label}
                {/* §22 — the reason, drawn in the row rather than in a bubble. Native `title`
                    is not keyboard-reachable in any major browser, and a bubble that renders
                    only on hover cannot be an `aria-describedby` target that always resolves. */}
                {item.description && (
                  <div
                    id={describedBy}
                    data-testid={item.descriptionTestId}
                    style={{ marginTop: 2, maxWidth: 220, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', whiteSpace: 'normal' }}
                  >
                    {item.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
