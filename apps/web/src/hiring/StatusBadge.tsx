'use client';

import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@devscribed/validation';
import { Badge } from '@/ds';

/**
 * An application's status, in the five tones Meridian already has.
 *
 * There is no sixth tone and no new colour: `Offer` is the **outlined** variant of the
 * success tone rather than a new hue — it is the same good news as `Passed`, one step
 * further along, and Meridian reserves its remaining accent (amber) for the tracker and
 * for warnings (03 design §Status tones).
 */
const TONES: Record<ApplicationStatus, { tone: 'active' | 'inactive' | 'warning' | 'info'; outline?: boolean }> = {
  scheduled: { tone: 'info' },
  didnt_pass: { tone: 'inactive' },
  maybe: { tone: 'warning' },
  passed: { tone: 'active' },
  offer: { tone: 'active', outline: true },
};

export function StatusBadge({
  status,
  ...rest
}: { status: ApplicationStatus } & React.HTMLAttributes<HTMLSpanElement>) {
  const { tone, outline } = TONES[status];
  // The label is the meaning; the tone only repeats it in colour.
  return (
    <Badge tone={tone} outline={outline} {...rest}>
      {APPLICATION_STATUS_LABELS[status]}
    </Badge>
  );
}
