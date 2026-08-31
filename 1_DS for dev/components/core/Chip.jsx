import React from 'react';
import { CrossIcon } from '../icons/Icon.jsx';

/**
 * Chip — §20. Blue draws this already: it is the multi-value token react-select renders inside
 * a `Select isMulti`, styled by the app's own `multiValue` / `multiValueRemove` overrides —
 * white, a 1px `--border-default` hairline, a 7px `--color-blue` left border, the 8px radius,
 * a 14px label, and a cross that lightens to `--border-default` on hover. Only the component
 * was never promoted out of `Select`, which is why a screen that wants to *show* a chosen
 * thing rather than choose one had nowhere to get it.
 *
 * Two things prod never had to say, because prod only ever draws this inside a control:
 * the cross is a real `<button>` with a name rather than a `<span onClick>`, and the pointer
 * cursor is conditional — a chip that cannot be removed must not claim it can. §18 made the
 * same call for `Table`'s rows.
 */
export function Chip({
  label, onRemove, removeLabel, style, children,
  /* §37 — a node between the label and the cross. The label span is the only slot blue has, and
     it is `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`, because inside
     `Select isMulti` it only ever holds one line of text. Anything else put there is clipped —
     and a control that drops a list is cut off at the chip's edge, which is the failure `Card`'s
     `clip` names. So the slot sits outside that span, and does not shrink. */
  trailing,
  /* §37 — the cross is drawn by the component, so a caller has no way to tag it. §16's
     `nameTestId` / `menuTestId` and §21's `chipTestId` are the same gap in the same shape. */
  removeTestId,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const text = children != null ? children : label;
  return (
    <div
      {...rest}
      style={{
        display: 'flex', minWidth: 0, margin: 2, background: '#fff',
        border: '1px solid var(--border-default)', borderLeft: '7px solid var(--color-blue)',
        borderRadius: 8, padding: onRemove ? '4px 0 4px 4px' : '4px 7px 4px 4px', color: '#000',
        cursor: onRemove ? 'pointer' : 'default', boxSizing: 'border-box',
        /* §37 — everything blue puts in a chip is one line of 14px text, so `stretch` and
           `center` paint identically and blue never had to choose. A trailing control is taller
           than the label beside it, and only then does the choice exist. */
        ...(trailing ? { alignItems: 'center' } : null),
        ...style,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 400, padding: '0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
      {trailing && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{trailing}</span>}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel || (typeof text === 'string' ? `Remove ${text}` : 'Remove')}
          data-testid={removeTestId}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{ display: 'flex', alignItems: 'center', paddingLeft: 4, paddingRight: 4, background: '#fff', borderRadius: 12, color: hover ? 'var(--border-default)' : 'var(--text-secondary)', fontWeight: 400 }}
        >
          <CrossIcon />
        </button>
      )}
    </div>
  );
}
