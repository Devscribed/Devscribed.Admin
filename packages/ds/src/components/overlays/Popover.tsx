import React from 'react';
import { createPortal } from 'react-dom';
import { ThreeDotsIcon } from '../icons/Icon';
import { Tooltip } from '../feedback/Tooltip';

/**
 * Popover — the click-to-open menu list, and the row-actions kebab.
 *
 * With no `trigger` it draws its own button: a 32x32 circle at `rgba(0,0,0,0.08)` behind a 22px
 * kebab, both going blue-on-white while the pointer is over it or the menu is open. The panel
 * is a 160px-minimum list, `--radius-m` over `--shadow-popover`, its rows inset 5px so none of
 * them ever reaches a rounded corner.
 *
 * `danger` paints a row in `--status-error`. It is opt-in and rare: a menu where the delete row
 * is red every time teaches a reader to stop seeing red.
 *
 * §22 — **it is a real menu.** `<div onClick>` rows inside a `<div onClick>` trigger cannot be
 * opened, walked or left from a keyboard and are announced as nothing; this is a real
 * `aria-haspopup="menu"` button over a real `role="menu"`, with arrow keys, `Home`/`End` and
 * `Escape`. A blocked row is disabled *and still focusable* — `aria-disabled`, never the
 * `disabled` attribute — because the whole point of showing it is that its reason can be read.
 *
 * §55 — the menu is a **portal**, and it flips. Positioned `absolute` inside the trigger's box
 * it is clipped by whatever scroller the trigger sits in, so on a scrolling list the last row's
 * menu is the one nobody can reach. `overflow: visible` on the cell does not fix it: the
 * ancestor doing the clipping is the scroller, not the cell. So the panel is `position: fixed`
 * in `document.body`, placed off the trigger's own rectangle, re-placed on scroll and resize,
 * and opened **upward** when it would otherwise run off the bottom of the viewport.
 * Outside-click reads both nodes, because the panel is no longer a descendant of the trigger.
 *
 * `portal` is `true` by default and can be turned off — a menu inside a `Modal` or a
 * `MenuDrawer` wants to stay inside the focus trap it was opened from.
 */

export interface PopoverItem {
  label: React.ReactNode;
  /** React key and identity. Falls back to `label`. */
  key?: string;
  /** §22 — `onSelect` is `AccountMenu`'s name for the same thing (§16). Either works. */
  onSelect?: () => void;
  onClick?: () => void;
  danger?: boolean;
  /** §22 — blocked rather than removed: `aria-disabled`, still focusable, not activatable. */
  disabled?: boolean;
  /** §22 — a second line under the label, saying what the row is *about*. Wired as the row's
   *  `aria-describedby`. For *why a row cannot be used*, see `tooltip`. */
  description?: React.ReactNode;
  descriptionTestId?: string;
  /** §62 — why this row is blocked, in a `Tooltip` bubble to the left of the menu, on hover
   *  and on focus. Also the row's `aria-describedby`; a row never carries both. */
  tooltip?: React.ReactNode;
  /** `data-testid` for the reason. It rides the always-present copy, not the bubble. */
  tooltipTestId?: string;
  testId?: string;
}

export interface PopoverProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  /** Omit to render the default 32x32 kebab circle. */
  trigger?: React.ReactNode;
  items?: (PopoverItem | string)[];
  align?: 'left' | 'right';
  /** Not-allowed cursor, no hover change, and the menu cannot open. */
  disabled?: boolean;
  /** §22 — accessible name for the trigger and the menu. Defaults to `Actions` on the kebab. */
  label?: string;
  /** §55 — the panel escapes its scroller through `document.body`. Turn it off for a menu
   *  inside a `Modal` or a `MenuDrawer`, which wants to stay in the focus trap it opened from. */
  portal?: boolean;
}

/** 10px of clearance under the trigger, wherever the panel hangs from. */
const GAP = 10;

/* §62 — present to a screen reader, absent to everything else. `BoardCard`'s flag uses the
   same pair and for the same reason: the *meaning* has to be in the tree at all times so
   `aria-describedby` always resolves, and the bubble is only what a pointer or a focus ring
   brings to the surface. A reason that exists only on hover is a reason a reader never gets. */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)',
};

export function Popover({
  trigger, items = [], align = 'right', disabled, label, portal = true, style, ...rest
}: PopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const menuId = React.useId();
  const entries: PopoverItem[] = items.map((item) => (typeof item === 'string' ? { label: item } : item));
  /* Null until the layout pass has measured the panel; it renders at `opacity: 0` until
     then, so nothing is painted at the wrong end of the screen and focus can still enter. */
  const [pos, setPos] = React.useState<React.CSSProperties | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      // §55 — the panel is not inside the trigger any more, so it has to be asked too.
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  /* §55 — where the panel goes. Measured off the trigger rather than inherited from it, which
     is the whole of what portalling costs — and what the flip needs anyway. */
  const place = React.useCallback(() => {
    const anchor = triggerRef.current;
    if (!anchor || !portal) return;
    const rect = anchor.getBoundingClientRect();
    const height = menuRef.current ? menuRef.current.offsetHeight : 0;
    const below = rect.bottom + GAP;
    // Upward only when it does not fit below *and* fits above: near the bottom of a short
    // viewport neither is true, and staying put is better than moving off the other edge.
    const flip = height > 0 && below + height > window.innerHeight && rect.top - GAP >= height;
    setPos({
      ...(flip ? { bottom: window.innerHeight - rect.top + GAP } : { top: below }),
      ...(align === 'left' ? { left: rect.left } : { right: window.innerWidth - rect.right }),
    });
  }, [align, portal]);

  React.useLayoutEffect(() => {
    if (!open || !portal) { setPos(null); return undefined; }
    place();
    // `true` — capture, so a scroll inside any ancestor counts and not only the page's.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, portal, place]);

  /* Focus enters the menu on open and comes back to the trigger on close — without the return
     a keyboard user is left on a node that has just been unmounted, i.e. on <body>. */
  React.useEffect(() => {
    if (!open) return undefined;
    const first = itemRefs.current[0];
    if (first) first.focus();
    setActive(0);
    return () => { if (triggerRef.current && document.contains(triggerRef.current)) triggerRef.current.focus(); };
  }, [open]);

  function select(entry: PopoverItem, event?: React.SyntheticEvent) {
    /* §55 — a portalled panel is out of the DOM but **not** out of the React tree: a
       synthetic event raised inside it still bubbles to whatever rendered the `Popover`.
       On a table row that is the row's own click handler, so choosing `Cancel` from the
       menu would call the row's action off *and* open the record it belongs to. The panel
       is not part of what it was opened from, so nothing it raises may reach it. */
    if (event) event.stopPropagation();
    if (entry.disabled) return;
    setOpen(false);
    /* Both names work, so a consumer writing this menu and `AccountMenu`'s (§16) writes one
       shape rather than remembering which takes which. */
    if (entry.onSelect) entry.onSelect();
    else if (entry.onClick) entry.onClick();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
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

  /* The panel itself, built once and then either portalled or left inside the trigger. */
  const menu = open && (
    <div
      id={menuId}
      ref={menuRef}
      role="menu"
      aria-label={label}
      onKeyDown={onMenuKeyDown}
      style={{
        /* §55 — fixed and placed off the trigger's rectangle when portalled, and an `absolute`
           box inside the trigger when not. The paint is the same either way; only what the
           box hangs from changes. */
        ...(portal
          ? {
              position: 'fixed',
              ...(pos || {}),
              /* Invisible for the one commit before the layout effect has measured it, and
                 **`opacity`, never `visibility`**: a `visibility: hidden` element cannot take
                 focus, and the effect that moves focus into the menu runs in that same
                 window. The layout effect lands the real position before the browser paints,
                 so nothing is ever seen at the wrong end of the screen either way. */
              opacity: pos ? 1 : 0,
            }
          : ({ position: 'absolute', [align]: 0, top: 42 } as React.CSSProperties)),
        minWidth: 160,
        /* @literal 5px end caps and the 5px row inset, below the scale: together they are why
           no row ever reaches a rounded corner, which is what §74 relies on. */
        padding: '5px 0', backgroundColor: 'var(--surface-overlay)', borderRadius: 'var(--radius-m)',
        boxShadow: 'var(--shadow-popover)', zIndex: 3001,
        /* §74 — **no `overflow: hidden`**. There is nothing here to clip: the panel is 6px
           round with 5px of vertical padding and its rows inset 5px, so no row ever reaches a
           corner. What clipping *did* catch was §62's bubble, which hangs at `right: 100%` of
           a row and is therefore entirely outside this box — so every blocked row drew its
           reason into a zero-width sliver and nobody saw one. */
      }}
    >
      {entries.map((item, i) => {
        const describedBy = item.description ? `${menuId}-desc-${i}` : undefined;
        const tipId = item.tooltip ? `${menuId}-tip-${i}` : undefined;
        const row = (
          <div
            key={item.key || item.label as React.Key}
            ref={(node) => { itemRefs.current[i] = node; }}
            role="menuitem"
            tabIndex={i === active ? 0 : -1}
            data-testid={item.testId}
            /* `aria-disabled`, not `disabled`: the row has to stay focusable, or the reason
               it is blocked can be seen and never read. */
            aria-disabled={item.disabled || undefined}
            /* §62 — the reason, whichever slot it is in. A row never has both: `description`
               is a second line the row is *about* (what a destination is), `tooltip` is why
               the row cannot be used, and a row that is blocked has nothing else to add. */
            aria-describedby={describedBy || tipId}
            onClick={(e) => select(item, e)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(item, e); }
            }}
            style={{
              textAlign: 'left', margin: '0 5px', /* @literal see the panel's note */ cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled ? 'var(--text-secondary)' : item.danger ? 'var(--status-error)' : 'var(--text-primary)',
              borderRadius: 'var(--radius-s)',
              /* A row inherits its size from whatever the menu is opened in — 14px in a table
                 cell, 16px in the navbar. A portalled panel inherits `document.body`'s instead,
                 so the size the row would have taken from its trigger is carried across. */
              /* @literal 14px, between two steps — `AccountMenu`'s rows take the same inset. */
              padding: 'var(--space-3) 14px', fontFamily: 'var(--font-family-base)', fontSize: portal ? 'var(--font-size-s)' : 'inherit',
              /* §50 — the *label* never wraps. Letting the row go `normal` so its
                 description could wrap took the label with it, and "Delete vacancy" broke
                 across two lines in a 160px menu. Only the description wraps now. */
              whiteSpace: 'nowrap',
            }}
            onFocus={() => setActive(i)}
            onMouseEnter={(e) => {
              if (item.disabled) return;
              e.currentTarget.style.backgroundColor = 'var(--surface-row-hover)';
              if (!item.danger) e.currentTarget.style.color = 'var(--color-blue)';
            }}
            onMouseLeave={(e) => {
              if (item.disabled) return;
              e.currentTarget.style.backgroundColor = 'transparent';
              if (!item.danger) e.currentTarget.style.color = 'var(--text-primary)';
            }}
          >
            {item.label}
            {/* §22 — a second line the row is *about*, drawn in the row rather than in a
                bubble. Native `title` is not keyboard-reachable in any major browser, and a
                node that renders only on hover cannot be an `aria-describedby` target that
                always resolves. */}
            {item.description && (
              <div
                id={describedBy}
                data-testid={item.descriptionTestId}
                style={{ /* @literal 2px, below the scale: a description belongs to the label above it */ marginTop: 2, maxWidth: 220, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', whiteSpace: 'normal' }}
              >
                {item.description}
              </div>
            )}
            {/* §62 — the reason itself, always in the tree. The bubble around this row is
                what draws it; this is what a reader is told, and what the row's
                `aria-describedby` points at whether or not anything is hovering. */}
            {item.tooltip && (
              <span id={tipId} data-testid={item.tooltipTestId} style={VISUALLY_HIDDEN}>
                {item.tooltip}
              </span>
            )}
          </div>
        );
        /* §62 — a blocked row's reason goes in a bubble beside the menu rather than as a
           third line inside a 160px panel. It opens to the **left**: the menu is already
           pinned to the right edge of its trigger, so a bubble above or below the row would
           be the only thing on screen deciding whether it clears the viewport. */
        return item.tooltip ? (
          <Tooltip
            key={item.key || item.label as React.Key}
            /* Its own id: the row is described by the hidden copy above, which is in the
               tree at all times, so the bubble must not claim the same one. */
            id={`${tipId}-bubble`}
            content={item.tooltip}
            placement="left"
            /* Transparent to the accessibility tree, so the `menu` still owns its
               `menuitem`s directly — the same reason a `ul > li` wrapping a `menuitem`
               takes `role="none"`. */
            role="none"
            style={{ display: 'block' }}
          >
            {row}
          </Tooltip>
        ) : row;
      })}
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', marginRight: trigger ? 0 : 'var(--space-3)' }}>
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
            color: lit ? 'var(--text-on-accent)' : 'var(--text-primary)',
            transition: 'background-color 0.2s, color 0.2s',
            ...style,
          }}
        >
          <ThreeDotsIcon width="22" aria-hidden />
        </button>
      )}
      {menu && (portal && typeof document !== 'undefined' ? createPortal(menu, document.body) : menu)}
    </div>
  );
}
