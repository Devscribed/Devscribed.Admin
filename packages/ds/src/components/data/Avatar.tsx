import React from 'react';

export interface AvatarProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /**
   * The person. It is both what the tint is chosen from and, unless `decorative`, the
   * accessible name — an avatar drawn alone is the only thing on the row saying who this is.
   */
  name: string;
  /** The letters drawn in the circle. The server computes them; this component never does. */
  initials: string;
  /** Diameter. The type inside scales with it, so one number sets the whole mark. */
  size?: number;
  /**
   * §93 — the name is already written next to it, so the mark repeats nothing and is hidden.
   * Pass it wherever a reader can read the name without this; leave it off wherever they
   * cannot, which is the case the default is safe for.
   */
  decorative?: boolean;
}

/** The six grounds, as token pairs. The count is the ramp's length, and nothing else reads it. */
const TINTS = 6;

/**
 * Sum of the code points, times seven, modulo the ramp. Deterministic and stable: the same
 * person is the same colour on every screen and in every session, which is the only property
 * this hash needs — it is choosing a tint, not distributing keys.
 */
function tintOf(name: string): number {
  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  return ((sum * 7) % TINTS) + 1;
}

/**
 * Avatar — a person, as initials on one of six grounds.
 *
 * §93 — **the tint comes from the palette, not from the name.** The hash picks which of six
 * tokens is used; it does not compute a colour. A hue generated per person is a colour the
 * system cannot see, cannot change and cannot check, and six names that between them cover
 * every screen is not a vocabulary — it is 360 of them.
 *
 * It is `role="img"` with the person's name on it by default, because the board and the task
 * list draw this mark with the name written nowhere else on the row: an unlabelled circle
 * there says who the assignee is to everyone except the reader who cannot see it. Where the
 * name *is* written beside it, `decorative` takes the mark back out of the tree rather than
 * announcing the same person twice.
 */
export function Avatar({
  name,
  initials,
  size = 40,
  decorative = false,
  style,
  ...rest
}: AvatarProps) {
  const tint = tintOf(name);
  return (
    <span
      {...rest}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 'var(--radius-circle)',
        background: `var(--avatar-${tint}-surface)`,
        color: `var(--avatar-${tint}-text)`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-family-base)',
        fontWeight: 'var(--font-weight-semibold)',
        /* The mark is a circle of one size, and the letters in it are a fraction of that
           rather than a step on the type scale: at 22px the smallest scale step overflows
           the circle, and at 64px it leaves the mark looking empty.
           @literal the type here is a ratio of the diameter, not a step on the scale */
        fontSize: Math.round(size * 0.36),
        lineHeight: 1,
        userSelect: 'none',
        ...style,
      }}
    >
      {initials}
    </span>
  );
}
