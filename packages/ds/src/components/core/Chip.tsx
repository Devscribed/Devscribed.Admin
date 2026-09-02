import React from 'react';
import { CrossIcon } from '../icons/Icon';

export interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The chip's text. `children` wins when both are given. */
  label?: React.ReactNode;
  /** Draws the removal cross. Omit for a read-only chip — which also drops the pointer cursor. */
  onRemove?: () => void;
  /** Accessible name for the cross. Defaults to `Remove {label}`. */
  removeLabel?: string;
  /** §39 — a node before the label: a drag handle, a leading glyph. `trailing`'s mirror. */
  leading?: React.ReactNode;
  /** §39 — blocks the cross without removing it: `aria-disabled`, still focusable. */
  removeDisabled?: boolean;
  /** §39 — id of the node saying why it is blocked, wired as the cross's `aria-describedby`. */
  removeDescribedBy?: string;
  /** §37 — `data-testid` for the cross, which the component draws itself. */
  removeTestId?: string;
  /** §37 — a node between the label and the cross: a value control, a count. Not inside the
   *  label, which ellipsises to one line and clips anything that opens out of it. */
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Chip — §20. One chosen thing, with a way to drop it: white, a 1px `--border-default`
 * hairline, a 7px `--color-blue` left border, the 8px radius, a 14px label, and a cross that
 * lightens to `--border-default` on hover.
 *
 * It is a component in its own right rather than something `Select` draws privately, because a
 * screen that wants to *show* a chosen thing is doing the same work as one that chooses it, and
 * two chips that drift apart are worse than one.
 *
 * Two rules a chip drawn only inside a control never has to state. The cross is a real
 * `<button>` with a name, not a `<span onClick>` — it is an action, and an action must be
 * reachable by keyboard. And the pointer cursor is conditional: a chip that cannot be removed
 * must not claim it can, which is the call §18 makes for `Table`'s rows.
 */
export function Chip({
  label, onRemove, removeLabel, style, children,
  /* §39 — a node *before* the label. A chip that can be picked up and moved needs a grip, and
     putting one in `trailing` would sit it beside the cross: a control that reorders adjacent
     to one that deletes. */
  leading,
  /* §37 — a node between the label and the cross, and it sits *outside* the label span. That
     span is `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`, so anything
     put in it is clipped — and a control that drops a list is cut off at the chip's edge, which
     is the failure `Card`'s `clip` names. This slot does not shrink either. */
  trailing,
  /* §37 — the cross is drawn by the component, so only the component can tag it. §16's
     `nameTestId` / `menuTestId` and §21's `chipTestId` are the same rule in the same shape:
     whoever renders a node owns its test id. */
  removeTestId,
  /* §39 — the cross, blocked. `aria-disabled` and still focusable, never the `disabled`
     attribute: a cross that vanishes is indistinguishable from a bug, and a reason nobody can
     focus is a reason nobody reads. §22's rule on `Popover`'s rows, on the control `Chip` draws
     for itself. */
  removeDisabled,
  /* §39 — id of the node carrying *why*, drawn by the consumer where there is room for a
     sentence. The cross keeps `Remove {label}` as its name, so the reason is a description and
     is not read twice. */
  removeDescribedBy,
  ...rest
}: ChipProps) {
  const [hover, setHover] = React.useState(false);
  const text = children != null ? children : label;
  return (
    <div
      {...rest}
      style={{
        /* @literal the chip's own micro-geometry: a 2px gap between chips, the 7px accent edge,
           3px of breathing room around the label, and a 12px cross. All below the scale, and
           all measured against each other rather than against the page. */
        display: 'flex', minWidth: 0, margin: 2, background: 'var(--surface-card)',
        border: 'var(--border-width-hairline) solid var(--border-default)', borderLeft: '7px solid var(--color-blue)',
        borderRadius: 'var(--radius-l)', padding: onRemove ? 'var(--space-1) 0 var(--space-1) var(--space-1)' : 'var(--space-1) 7px var(--space-1) var(--space-1)', /* @literal pure black, where the system's ink is `--text-primary` (#1B1B1B).
           Reconciling the two is a visual decision, not a substitution. */ color: '#000',
        cursor: onRemove && !removeDisabled ? 'pointer' : 'default', boxSizing: 'border-box',
        /* §37 — with one line of 14px text `stretch` and `center` paint identically, so the
           choice only exists once something taller than the label is in the row. */
        ...(trailing || leading ? { alignItems: 'center' } : null),
        ...style,
      }}
    >
      {leading && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{leading}</span>}
      <span style={{ /* @literal see the chip's micro-geometry note above */ fontSize: 'var(--font-size-s)', fontWeight: 400, padding: '0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
      {trailing && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{trailing}</span>}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel || (typeof text === 'string' ? `Remove ${text}` : 'Remove')}
          data-testid={removeTestId}
          aria-disabled={removeDisabled || undefined}
          aria-describedby={removeDescribedBy}
          onClick={(e) => { e.stopPropagation(); if (!removeDisabled) onRemove(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{ /* @literal a 12px radius on a 24px cross is a circle in all but name; see the note above */ display: 'flex', alignItems: 'center', paddingLeft: 'var(--space-1)', paddingRight: 'var(--space-1)', background: 'var(--surface-card)', borderRadius: 12, color: hover && !removeDisabled ? 'var(--border-default)' : 'var(--text-secondary)', fontWeight: 400, cursor: removeDisabled ? 'default' : 'pointer', opacity: removeDisabled ? 0.5 : 1 }}
        >
          <CrossIcon />
        </button>
      )}
    </div>
  );
}
