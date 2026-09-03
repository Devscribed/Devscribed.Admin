'use client';

import { StarIcon } from '@/layout/icons';
import { HOLIDAY_MESSAGES } from '@devscribed/validation';
import type { CalendarHoliday } from './types';

/**
 * The read-only holiday marker on the Monthly calendar (spec organization/03
 * requirement 10). A star, the holiday name in a `title` tooltip, and §91's holiday ground.
 * It is **not** a click target and mutates nothing — logging time on the day leaves it
 * exactly where it is (requirement 11).
 *
 * **Not a `Badge`.** It is the right shape and the wrong object: a badge states what a record
 * *is*, in one of the system's tones, and this states what a *day* is, in a ground of its own.
 * §59 already refused to paint a label in a status hue for the same reason, and painting over
 * a `Badge`'s tone to get this one would be the improvisation that rule out-argues.
 *
 * `focusable` exists because the two views nest it differently: the monthly cell is
 * already a `<button>` and announces from that button's own focus, while a weekly day
 * header is inert, so there the marker itself takes focus to satisfy §Accessibility.
 * A focusable element inside a button would be invalid HTML, which is why this is a
 * prop rather than always-on.
 */
export function HolidayMarker({
  holiday,
  focusable = false,
  onFocusAnnounce,
}: {
  holiday: CalendarHoliday;
  focusable?: boolean;
  onFocusAnnounce?: (message: string) => void;
}) {
  const tooltip = HOLIDAY_MESSAGES.calendarTooltip(holiday.name);
  const announcement = HOLIDAY_MESSAGES.calendarAnnouncement(holiday.name, holiday.paidHours);
  return (
    <span
      data-testid={`time-cell-${holiday.date}-holiday-marker`}
      title={tooltip}
      aria-label={tooltip}
      role="img"
      tabIndex={focusable ? 0 : undefined}
      onFocus={focusable ? () => onFocusAnnounce?.(announcement) : undefined}
      onMouseEnter={() => onFocusAnnounce?.(announcement)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        maxWidth: '100%',
        padding: '1px var(--space-2)',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-holiday)',
        border: 'var(--border-width-hairline) solid var(--border-holiday)',
        color: 'var(--text-primary)',
        fontWeight: 'var(--font-weight-medium)',
        fontSize: 'var(--font-size-xs)',
        lineHeight: 1.4,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
    >
      <StarIcon size={10} />
      <span
        style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
        aria-hidden
      >
        {holiday.name}
      </span>
    </span>
  );
}

/**
 * The polite live region the markers announce into (§Accessibility). One node for the
 * whole page rather than one per cell, so a screen reader hears a single stream.
 *
 * It carries no test id: the spec's roster names only the marker for this screen, and
 * the region is what a screen reader finds, so `role="status"` is the honest handle for
 * a test too (TC-03-E2E-04 locates it by role).
 */
export function HolidayLiveRegion({ message }: { message: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </span>
  );
}
