'use client';

import { statusLabelOf } from '../RequestRow';
import type { RequestEventData } from '../types';

function formatMoment(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * One line of the trail. The labels stored on the event are display-name snapshots taken
 * at write time, so a removed or renamed member does not rewrite history — which is why
 * this reads `oldLabel`/`newLabel` in preference to resolving an id now.
 */
function describe(event: RequestEventData): string {
  const actor = event.actor.displayName ?? event.newLabel ?? 'Former member';
  switch (event.action) {
    case 'created':
      return `${actor} created the request`;
    case 'message_posted':
      return `${actor} replied`;
    case 'status_changed':
      // The four words, from the same map the list rows, the detail header and the filter
      // control read (REQ-02-028) — this entry used to print the raw stored value. The
      // label alone: the closure reason is rendered where a request's own status is shown,
      // not in the trail.
      return `${actor} marked it ${statusLabelOf(event.newValue ?? '').label}`;
    case 'assignee_changed':
      return `${actor} reassigned it from ${event.oldLabel ?? 'nobody'} to ${
        event.newLabel ?? 'nobody'
      }`;
    case 'field_changed':
      return `${actor} changed ${event.field} from ${event.oldValue ?? 'nothing'} to ${
        event.newValue ?? 'nothing'
      }`;
    default:
      return `${actor} ${event.action}`;
  }
}

/**
 * The history. What happened to the request — never what was said, which is the thread's
 * job. A message appears here only as the fact that one was posted (requirement 21).
 */
export function RequestHistory({ events }: { events: RequestEventData[] }) {
  return (
    <div
      data-testid="request-detail-history"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}
    >
      {events.map((event) => (
        <div
          key={event.id}
          style={{
            display: 'flex',
            gap: 'var(--sp-4)',
            fontFamily: 'var(--font-text)',
            fontSize: 'var(--fs-13)',
            color: 'var(--text-sub)',
          }}
        >
          <span style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            {formatMoment(event.createdAt)}
          </span>
          <span>{describe(event)}</span>
        </div>
      ))}
    </div>
  );
}
