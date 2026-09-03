'use client';

import Link from 'next/link';
import { Badge, Card } from '@/ds';
import { REQUEST_STATUS_LABELS } from '@devscribed/validation';
import type { RequestRowData } from './types';

/**
 * Status → DS `Badge` tone. The *words* are not here: requests spec 02 requirement 28
 * puts them in one exported map that this row, the detail header, the history entries and
 * the filter control all read, so the four screens cannot disagree about what a status is
 * called. Only the tone — which is a design decision about the badge, not vocabulary —
 * stays on this side.
 */
export const STATUS_TONE: Record<
  string,
  'warning' | 'active' | 'inactive' | 'neutral' | 'info'
> = {
  open: 'warning',
  answered: 'info',
  granted: 'active',
  declined: 'inactive',
  cancelled: 'neutral',
};

/**
 * The word a stored status shows as, and the closure reason beside it where there is one
 * (REQ-02-028, REQ-02-029). An unmapped value — which no stored status is — falls back to
 * itself rather than rendering blank.
 */
export function statusLabelOf(status: string): { label: string; closure: string | null } {
  return (
    REQUEST_STATUS_LABELS[status as keyof typeof REQUEST_STATUS_LABELS] ?? {
      label: status,
      closure: null,
    }
  );
}

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
  const tone = STATUS_TONE[request.status] ?? 'neutral';
  const status = statusLabelOf(request.status);

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
              <Badge tone={tone} data-testid={`request-row-${request.id}-status`}>
                {status.closure ? `${status.label} · ${status.closure}` : status.label}
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
            {/* The About cell. A request raised under a topic shows its snapshot name
                under the id the spec names, with an archived marker where the catalogue
                entry has since been retired. A request raised before requests spec 02
                carries no topic and falls back to its stored type, drawn outside that id
                — the testid marks a request that carries a topic (edge case 8). */}
            {request.topic ? (
              <span data-testid={`request-row-${request.id}-topic`}>
                {request.topic.name}
                {request.topic.status === 'archived' && (
                  <span style={{ color: 'var(--text-faint)' }}> (archived)</span>
                )}
              </span>
            ) : (
              <span>{REQUEST_TYPE_LABEL[request.type] ?? request.type}</span>
            )}
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
