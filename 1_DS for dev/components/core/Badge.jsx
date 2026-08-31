import React from 'react';

const badgeVariants = {
  active: { backgroundColor: 'var(--status-success)', color: '#fff' },
  inactive: { backgroundColor: 'var(--status-error)', color: '#fff' },
  outlinedActive: { border: '1px solid var(--status-success)', color: 'var(--status-success)' },
  outlinedInactive: { border: '1px solid var(--color-error-outline)', color: 'var(--status-error)' },

  /* §32 — the two hues prod's `ActivityBadge` has no state for. A user is active or inactive, so
     two is all it ever needed; a workflow with five states cannot be painted in two without one
     of them saying something false. The readme scopes the palette rather than the component —
     "Status colors (green/yellow/red/cyan) are used sparingly and only for real state" — and
     these are that palette's other half, in ActivityBadge's own treatment.

     `warning` is the one that does not take the solid treatment literally. Blue paints a solid
     badge white-on-hue, which holds on #27C79A and #D80027; on #FFD02B white is not a legibility
     trade-off but an absence of text. The hue stays and the ink becomes `--text-primary`, which
     is the same reading its outlined form takes. No colour is invented either way. */
  info: { backgroundColor: 'var(--status-info)', color: '#fff' },
  warning: { backgroundColor: 'var(--status-warning)', color: 'var(--text-primary)' },
  outlinedInfo: { border: '1px solid var(--status-info)', color: 'var(--status-info)' },
  outlinedWarning: { border: '1px solid var(--status-warning)', color: 'var(--text-primary)' },
};

/** `active` → `outlinedActive`. Anything unrecognised falls back the way blue's did, to inactive. */
const variantKey = (status, outlined) => {
  const known = badgeVariants[status] ? status : 'inactive';
  if (!outlined) return known;
  return `outlined${known[0].toUpperCase()}${known.slice(1)}`;
};

/**
 * Badge — status pill recreated from components/shared/ActivityBadge.
 * Solid variants for active/inactive states; outlined variants for lower-emphasis contexts.
 * §32 adds `info` and `warning` from blue's status palette — see `badgeVariants`.
 */
export function Badge({
  status = 'active', outlined,
  /* §19 — blue destructures three props and forwards nothing, so `data-testid` and every
     `aria-*` were dropped before the DOM. Prod never needed them; a badge whose text a test
     has to read does. */
  style, children, ...rest
}) {
  const key = variantKey(status, outlined);
  return (
    <span
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-s)',
        fontFamily: 'var(--font-family-base)',
        fontWeight: 'var(--font-weight-medium)',
        fontSize: 'var(--font-size-s)',
        lineHeight: '16px',
        padding: '4px 8px',
        ...badgeVariants[key],
        ...style,
      }}
    >
      {children ?? (status === 'active' ? 'Active' : 'Inactive')}
    </span>
  );
}
