'use client';

import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@devscribed/validation';
import { Badge } from '@/ds';

/**
 * An application's status, in the four status hues blue's palette has.
 *
 * Blue's `Badge` is `ActivityBadge` — a two-state pill on a *user*, and a hiring funnel is not
 * two states. Mapping five onto its four paints would force `Scheduled`, which is neither good
 * news nor bad, to be drawn as one or the other; that is not a lost reinforcement but colour
 * saying something false, so `Badge` took blue's two remaining status hues instead
 * (ledger §32, and blue's readme: *"Status colors (green/yellow/red/cyan) are used sparingly and
 * only for real state"*).
 *
 * The rule is **hue is direction, fill is finality** (03 design §Status badges). Only the two
 * terminal states are solid, which is what keeps "sparingly" true — a list of in-flight
 * candidates is mostly outlined pills, and a filled one means the process ended.
 *
 * It also corrects an inversion Meridian had: `Offer` was the *outlined* variant of `Passed`, so
 * the strongest status in the funnel was drawn with the least emphasis.
 */
const TONES: Record<
  ApplicationStatus,
  { status: 'active' | 'inactive' | 'info' | 'warning'; outlined?: boolean }
> = {
  scheduled: { status: 'info' },
  maybe: { status: 'warning' },
  passed: { status: 'active', outlined: true },
  offer: { status: 'active' },
  didnt_pass: { status: 'inactive' },
};

export function StatusBadge({
  status,
  ...rest
}: { status: ApplicationStatus } & React.HTMLAttributes<HTMLSpanElement>) {
  const paint = TONES[status];
  // The label is the meaning; the hue only repeats it in colour.
  return (
    <Badge status={paint.status} outlined={paint.outlined} {...rest}>
      {APPLICATION_STATUS_LABELS[status]}
    </Badge>
  );
}
