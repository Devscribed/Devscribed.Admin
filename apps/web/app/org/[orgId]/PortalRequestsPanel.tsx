'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Badge, Card, EmptyState } from '@devscribed/ds';
import { PORTAL_MESSAGES } from '@devscribed/validation';
import { daysBetween, formatShortDate, type PortalRequestItem, type PortalRequests } from './portal-types';
import { panelLinkStyle } from './PortalMonthPanel';

const panelHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-5)',
  marginBottom: 'var(--space-6)',
};

const panelHeadingStyle: CSSProperties = {
  fontSize: 'var(--headline-6-size)',
  lineHeight: 'var(--headline-6-line)',
  letterSpacing: 'var(--headline-6-tracking)',
  fontWeight: 'var(--headline-6-weight)',
  margin: 0,
  color: 'var(--text-primary)',
};

const reqsStyle: CSSProperties = { display: 'flex', flexDirection: 'column' };

/* Geometry & motion — the title is the first column at `minmax(0,1fr)`; the due text and the
 * badge are `auto` and sit last, so the badge's width is absorbed by the title's `1fr`. */
const reqRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) auto auto',
  gap: 'var(--space-5)',
  alignItems: 'center',
  padding: 'var(--space-5) 0',
  borderTop: '1px solid var(--border-subtle)',
};

const reqRowFirstStyle: CSSProperties = { ...reqRowStyle, borderTop: 0, paddingTop: 0 };

const reqTitleStyle: CSSProperties = {
  display: 'block',
  minWidth: 0,
  fontWeight: 'var(--font-weight-medium)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const reqSubStyle: CSSProperties = {
  display: 'block',
  color: 'var(--text-secondary)',
  fontSize: 'var(--font-size-xs)',
};

const dueStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--font-size-xs)',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

const dueLateStyle: CSSProperties = {
  ...dueStyle,
  color: 'var(--status-error)',
  fontWeight: 'var(--font-weight-medium)',
};

function dueText(request: PortalRequestItem, today: string): string | null {
  if (!request.neededBy) return null;
  if (request.overdue) {
    const late = daysBetween(request.neededBy, today);
    return late === 1 ? '1 day late' : `${late} days late`;
  }
  return `by ${formatShortDate(request.neededBy)}`;
}

function counterpartLine(request: PortalRequestItem): string {
  return request.direction === 'raised'
    ? `Asked of ${request.counterpartName}`
    : `Asked by ${request.counterpartName}`;
}

function RequestRow({ request, today, first }: { request: PortalRequestItem; today: string; first: boolean }) {
  const due = dueText(request, today);
  return (
    <div data-testid="portal-request-row" style={first ? reqRowFirstStyle : reqRowStyle}>
      <span style={{ minWidth: 0 }}>
        <b style={reqTitleStyle}>{request.title}</b>
        <span style={reqSubStyle}>{counterpartLine(request)}</span>
      </span>
      <span style={request.overdue ? dueLateStyle : dueStyle}>{due}</span>
      {request.overdue ? (
        <Badge status="inactive">Overdue</Badge>
      ) : request.waitingOnMe ? (
        <Badge status="info">Waiting on you</Badge>
      ) : (
        <Badge status="neutral">Open</Badge>
      )}
    </div>
  );
}

/**
 * "My requests" — Q1's third panel (REQ-01-020, REQ-01-021). The server already ordered and
 * capped the three rows; this panel draws them as answered and says nothing about the
 * `openTotal` beyond what the "All requests" link leads to.
 */
export function PortalRequestsPanel({
  orgId,
  requests,
  today,
}: {
  orgId: string;
  requests: PortalRequests;
  today: string;
}) {
  return (
    <Card variant="panel">
      <div style={panelHeadStyle}>
        <h2 style={panelHeadingStyle}>My requests</h2>
        <Link href={`/org/${orgId}/requests`} style={panelLinkStyle}>
          All requests →
        </Link>
      </div>

      {requests.items.length === 0 ? (
        <EmptyState data-testid="portal-requests-empty">{PORTAL_MESSAGES.requestsEmpty}</EmptyState>
      ) : (
        <div style={reqsStyle}>
          {requests.items.map((request, index) => (
            <RequestRow key={request.id} request={request} today={today} first={index === 0} />
          ))}
        </div>
      )}
    </Card>
  );
}
