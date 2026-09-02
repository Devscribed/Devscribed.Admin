'use client';

import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@devscribed/validation';
import { Badge } from '@devscribed/ds';

/**
 * A vacancy's own two states, and the one place they are drawn.
 *
 * **Outlined, both of them.** A solid pill is blue's loudest paint, and neither of these is
 * news: `Open` is the state every vacancy is in for most of its life, and a whole column of
 * solid green says *look here* about the ordinary case. `Closed` is worse the other way —
 * filled `--status-error` is the treatment for something that went wrong, and closing a
 * vacancy is the intended end of one.
 *
 * That is not the rule `StatusBadge` follows below, and the difference is the point: an
 * application moves through a funnel where *finality* is worth marking, so fill means
 * finished there. A vacancy has two states and no funnel, so there is nothing for a fill to
 * distinguish — only a hue, saying which of the two it is.
 */
export function VacancyStatusBadge({
  status,
  testId,
  ...rest
}: {
  status: 'open' | 'closed';
  testId?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <Badge
      status={status === 'open' ? 'active' : 'inactive'}
      outlined
      data-testid={testId}
      {...rest}
    >
      {status === 'open' ? 'Open' : 'Closed'}
    </Badge>
  );
}

/**
 * An application's status, in the outlined idiom blue's `Badge` already has.
 *
 * Blue's `Badge` is `ActivityBadge` — a two-state pill on a *user*, and a hiring funnel is not
 * two states. Mapping five onto its four paints would force `Scheduled`, which is neither good
 * news nor bad, to be drawn as one or the other; that is not a lost reinforcement but colour
 * saying something false, so `Badge` took blue's two remaining status hues instead
 * (ledger §32, and blue's readme: *"Status colors (green/yellow/red/cyan) are used sparingly and
 * only for real state"*).
 *
 * **Revised by `blue-fixes`: four of the five are outlined, and only `Offer` is solid.** The rule
 * was *hue is direction, fill is finality*, which put three solid pills — `Scheduled`, `Maybe`,
 * `Didn't pass` — down a column that is mostly in-flight candidates, and a list where most rows
 * shout is a list where none of them do. Blue's own readme scopes the palette with *"used
 * sparingly"*, and this is the reading that honours it: the funnel is drawn in the outlined idiom
 * `Badge` already has, and the solid fill is spent once, on the terminal good state that is
 * genuinely worth the loudest ink the palette can produce.
 *
 * It is the same `Badge`, with the same geometry, in every row — that is the whole point of the
 * revision. Two of the four are blue's own outlined variants unaltered; two override an ink, and
 * both overrides are named below.
 */
const TONES: Record<
  ApplicationStatus,
  {
    status: 'active' | 'inactive' | 'info' | 'warning';
    outlined?: boolean;
    style?: React.CSSProperties;
  }
> = {
  /*
   * `--color-blue`, not `--status-info`'s cyan. Scheduled is the one status that reports no
   * judgement at all — the interview is simply ahead — and blue's primary is the hue it spends
   * on *the thing you are working on*, where the cyan of `info` is the hue it spends on a
   * notice. `outlinedInfo`'s geometry is untouched; only the two colour stops move.
   */
  scheduled: {
    status: 'info',
    outlined: true,
    style: { color: 'var(--color-blue)', borderColor: 'var(--color-blue)' },
  },
  /*
   * Blue's `outlinedWarning` unaltered: a `--status-warning` border with `--text-primary` ink.
   * §32 already settled that #FFD02B carries no legible text of its own, and the alternative —
   * mixing the token toward a dark orange — is a colour blue does not have.
   */
  maybe: { status: 'warning', outlined: true },
  /** Blue's `outlinedActive`, one step quieter than the fill `Offer` takes. */
  passed: { status: 'active', outlined: true },
  /** The only fill in the funnel: the terminal good state, and the one worth shouting. */
  offer: { status: 'active' },
  /** Blue's `outlinedInactive`: the 45% red border with `--status-error` ink. */
  didnt_pass: { status: 'inactive', outlined: true },
};

export function StatusBadge({
  status,
  ...rest
}: { status: ApplicationStatus } & React.HTMLAttributes<HTMLSpanElement>) {
  const paint = TONES[status];
  // The label is the meaning; the hue only repeats it in colour.
  return (
    <Badge {...rest} status={paint.status} outlined={paint.outlined} style={paint.style}>
      {APPLICATION_STATUS_LABELS[status]}
    </Badge>
  );
}
