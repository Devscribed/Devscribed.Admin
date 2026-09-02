'use client';

import Link from 'next/link';
import { Badge, Card } from '@/ds';
import type { RequestRowData } from './types';

/** Status → DS `Badge` tone + label. One map, used by the list and the detail screen. */
export const REQUEST_STATUS_META: Record<
  string,
  { tone: 'warning' | 'active' | 'inactive' | 'neutral' | 'info'; label: string }
> = {
  open: { tone: 'warning', label: 'Open' },
  answered: { tone: 'info', label: 'Answered' },
  granted: { tone: 'active', label: 'Granted' },
  declined: { tone: 'inactive', label: 'Declined' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
};

export const REQUEST_TYPE_LABEL: Record<string, string> = {
  access: 'access',
  question: 'question',
};

export const REQUEST_PRIORITY_LABEL: Record<string, string> = {
  low: 'low',
  normal: 'normal',
  high: 'high',
  urgent: 'urgent',
};

/** The eight access kinds, rendered as words rather than as the stored value. */
export const ACCESS_KIND_LABEL: Record<string, string> = {
  repository: 'repository',
  environment: 'environment',
  server: 'server',
  vpn: 'VPN',
  saas: 'SaaS',
  admin_panel: 'admin panel',
  documentation: 'documentation',
  other: 'other',
};

/** '2 Sep' — the short form the wireframe uses for a needed-by date. */
export function formatShortDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * One row of the inbox: the number, the title, the status, the addressee, the project
 * when set, and the two flags when they apply (requirement 45).
 *
 * The whole row is a link to the detail screen. Both flags are separate nodes rather
 * than one "attention" chip, because they mean different things and the spec's ordering
 * rule ranks them separately.
 */
export function RequestRow({ orgId, request }: { orgId: string; request: RequestRowData }) {
  const meta = REQUEST_STATUS_META[request.status] ?? { tone: 'neutral' as const, label: request.status };

  return (
    <Card data-testid={`request-row-${request.id}`}>
      <Link
        href={`/org/${orgId}/requests/${request.id}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-13)',
                color: 'var(--text-muted)',
              }}
            >
              #{request.number}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-15)',
                color: 'var(--text)',
                minWidth: 0,
              }}
            >
              {request.title}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Badge tone={meta.tone} data-testid={`request-row-${request.id}-status`}>
                {meta.label}
              </Badge>
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 'var(--sp-2) var(--sp-4)',
              fontSize: 'var(--fs-13)',
              color: 'var(--text-muted)',
            }}
          >
            <span>{REQUEST_TYPE_LABEL[request.type] ?? request.type}</span>
            {request.accessKind && <span>{ACCESS_KIND_LABEL[request.accessKind] ?? request.accessKind}</span>}
            <span>{REQUEST_PRIORITY_LABEL[request.priority] ?? request.priority}</span>
            {request.project && <span>{request.project.name}</span>}
            <span>&rarr; {request.assignee.displayName ?? 'Unassigned'}</span>
            {request.neededBy && <span>needed by {formatShortDate(request.neededBy)}</span>}
            {request.blocking && (
              <Badge
                tone="warning"
                outline
                data-testid={`request-row-${request.id}-blocking-flag`}
              >
                Blocked
              </Badge>
            )}
            {request.overdue && (
              <Badge
                tone="inactive"
                outline
                data-testid={`request-row-${request.id}-overdue-flag`}
              >
                Overdue
              </Badge>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}
