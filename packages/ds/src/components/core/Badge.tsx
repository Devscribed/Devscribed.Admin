import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * `active` / `inactive` are the person states — someone is one or the other. §32 adds `info`
   * (cyan) and `warning` (yellow) from the status palette, for state a two-valued flag cannot
   * express.
   *
   * §59 adds `neutral`, which is the one tone that is *not* a status: a label on an object —
   * a category, an assessed criterion, an interview length — drawn on the recessed ground that
   * sits behind a table header, with no status hue claiming anything about it.
   */
  status?: 'active' | 'inactive' | 'info' | 'warning' | 'neutral';
  /** Border-only treatment instead of the solid fill. */
  outlined?: boolean;
  /**
   * §59 — `m` is the standard box (14px, `4px 8px`); `s` steps one down the type scale for a
   * label sitting inside a table row (12px, `2px 8px`).
   */
  size?: 's' | 'm';
  /** §19 — every other attribute reaches the `<span>`; `style` merges over the painted one. */
  children?: React.ReactNode;
}

const badgeVariants: Record<string, React.CSSProperties> = {
  active: { backgroundColor: 'var(--status-success)', color: '#fff' },
  inactive: { backgroundColor: 'var(--status-error)', color: '#fff' },
  outlinedActive: { border: '1px solid var(--status-success)', color: 'var(--status-success)' },
  outlinedInactive: { border: '1px solid var(--color-error-outline)', color: 'var(--status-error)' },

  /* §32 — the two hues beyond a person's active/inactive. Someone is one or the other, so two
     is all that pair ever needed; a workflow with five states cannot be painted in two without
     one of them saying something false. The status palette is scoped by meaning rather than by
     component — green, yellow, red and cyan are used sparingly and only for real state — and
     these are its other half, in the same treatment the first two take.

     `warning` is the one that does not take the solid treatment literally. A solid badge is
     white on the hue, which holds on the success green and the error red; on the warning yellow
     white is not a legibility trade-off but an absence of text. The hue stays and the ink
     becomes `--text-primary`, which is the same reading its outlined form takes. No colour is
     invented either way. */
  info: { backgroundColor: 'var(--status-info)', color: '#fff' },
  warning: { backgroundColor: 'var(--status-warning)', color: 'var(--text-primary)' },
  outlinedInfo: { border: '1px solid var(--status-info)', color: 'var(--status-info)' },
  outlinedWarning: { border: '1px solid var(--status-warning)', color: 'var(--text-primary)' },

  /* §59 — the tone that is not a status. Every paint above says something is *going* well or
     badly, and a vacancy's categories, a candidate's assessed criteria and an interview's
     length are none of those: they are labels on an object, and drawing `Middle` in the red
     that means `inactive` says something false about it. This is the recessed ground that
     already sits behind a `Table`'s header and inside a board column, hairlined in the
     border the quietest divisions take — no new colour, and no second component. */
  neutral: {
    backgroundColor: 'var(--surface-sunken)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    /* A label is read, not announced: `medium` is the weight of a status shouting its state,
       and a row of six categories set in it competes with the title above them. */
    fontWeight: 'var(--font-weight-regular)',
  },
  outlinedNeutral: {
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-secondary)',
    fontWeight: 'var(--font-weight-regular)',
  },
};

/* §59 — two densities. `m` is the standard box; `s` is what a label set inside a table row
   needs, and its values are that box one step down the type scale, with the padding closed up
   to match. `neutral` carries 2px more side padding at `m`
   because it is the only tone with a border on its solid form, and without it the ink sits
   tighter to the edge than every status badge beside it. */
const badgeSizes: Record<string, React.CSSProperties> = {
  m: { fontSize: 'var(--font-size-s)', lineHeight: '16px', padding: '4px 8px' },
  s: { fontSize: 'var(--font-size-xs)', lineHeight: '16px', padding: '2px 8px' },
};

/** `active` → `outlinedActive`. Anything unrecognised falls back to inactive. */
const variantKey = (status: string, outlined: boolean | undefined): string => {
  const known = badgeVariants[status] ? status : 'inactive';
  if (!outlined) return known;
  return `outlined${known[0].toUpperCase()}${known.slice(1)}`;
};

/**
 * Badge — status pill.
 * Solid variants for active/inactive states; outlined variants for lower-emphasis contexts.
 * §32 adds `info` and `warning` from the status palette — see `badgeVariants`.
 */
export function Badge({
  status = 'active', outlined,
  /** §59 — `m` is the standard box; `s` is the density a label takes inside a table row. */
  size = 'm',
  /* §19 — every attribute reaches the `<span>`. A badge is often the only node on a row
     stating what a record *is*, so it has to be findable by a test and nameable to a reader;
     a pill that swallowed `data-testid` and every `aria-*` was neither. */
  style, children, ...rest
}: BadgeProps) {
  const key = variantKey(status, outlined);
  const box = badgeSizes[size] || badgeSizes.m;
  const neutral = key === 'neutral';
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
        ...box,
        ...(neutral && size === 'm' ? { padding: '4px 10px' } : null),
        /* A label may be the longest thing in a narrow cell, and a pill that grew until the
           column did is what pushed the row's own text out of it. */
        maxWidth: '100%',
        minWidth: 0,
        ...badgeVariants[key],
        ...style,
      }}
    >
      {/* §59 — the truncation sits on a child, not on the box. This is an `inline-flex`, so
          its text is an anonymous flex item and never a line box: `text-overflow` on the
          pill itself would clip hard with no ellipsis, which is exactly what §48 found on
          `Table`'s header cells. */}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {/* §59 — only the two person states have a name of their own to fall back to. A
            neutral label with no text is not `Inactive`; it is a caller with nothing to say. */}
        {children ?? (status === 'active' || status === 'inactive'
          ? (status === 'active' ? 'Active' : 'Inactive')
          : null)}
      </span>
    </span>
  );
}
