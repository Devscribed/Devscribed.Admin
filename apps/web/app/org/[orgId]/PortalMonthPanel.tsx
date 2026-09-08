'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Button, Card, EmptyState } from '@devscribed/ds';
import { PORTAL_MESSAGES, formatDurationHuman } from '@devscribed/validation';
import type { PortalMonth } from './portal-types';

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

export const panelLinkStyle: CSSProperties = {
  color: 'var(--text-link)',
  textDecoration: 'none',
  fontSize: 'var(--font-size-s)',
  fontWeight: 'var(--font-weight-medium)',
  whiteSpace: 'nowrap',
};

/* §82 — one band, never a row of bordered tiles. */
export const bandStyle: CSSProperties = { display: 'flex', gap: 'var(--space-10)', flexWrap: 'wrap' };

export const figStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 };

/* DS gap — `@literal 32px / var(--font-weight-light)`, the pair `ReportSummaryBanner` §82
 * already writes as a literal for the same reason: no component owns a headline figure yet. */
export const figNumberStyle: CSSProperties = {
  fontSize: '32px',
  fontWeight: 'var(--font-weight-light)',
  lineHeight: 1.1,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.5px',
  color: 'var(--text-primary)',
};

export const figCaptionStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  lineHeight: 'var(--line-height-xs)',
  color: 'var(--text-secondary)',
};

const splitStyle: CSSProperties = {
  marginTop: 'var(--space-7)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
};

/* Geometry & motion — the name is the `minmax(0,1fr)` first column with ellipsis; the
 * minutes are the `auto` second column, so three rows' figures share a right edge. */
const srowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) auto',
  gap: 'var(--space-5)',
  alignItems: 'center',
};

const snameStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const shrsStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

/**
 * "This month" — Q1's first panel (REQ-01-011 – REQ-01-014). An empty month (`totalMinutes`
 * 0) draws no figures at all: `portal-month-total` is absent, not zero, because a zero figure
 * beside `PORTAL_MESSAGES.monthEmpty` would say the same thing twice.
 */
export function PortalMonthPanel({ orgId, month }: { orgId: string; month: PortalMonth }) {
  const empty = month.totalMinutes === 0;

  return (
    <Card variant="panel">
      <div style={panelHeadStyle}>
        <h2 style={panelHeadingStyle}>This month</h2>
        <Link href={`/org/${orgId}/reports/time-and-activity`} style={panelLinkStyle}>
          Time &amp; activity →
        </Link>
      </div>

      {empty ? (
        <EmptyState
          data-testid="portal-month-empty"
          style={{ padding: 'var(--space-8) 0 var(--space-3)' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)' }}>
            <p style={{ margin: 0 }}>{PORTAL_MESSAGES.monthEmpty}</p>
            <Button as="a" href={`/org/${orgId}/time-tracking`} variant="primary">
              Start the timer
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <div style={bandStyle}>
            <div style={figStyle}>
              <span data-testid="portal-month-total" style={figNumberStyle}>
                {formatDurationHuman(month.totalMinutes)}
              </span>
              <span style={figCaptionStyle}>Tracked this month</span>
            </div>
            <div style={figStyle}>
              <span data-testid="portal-month-days" style={figNumberStyle}>
                {month.daysWithEntry}
              </span>
              <span style={figCaptionStyle}>Days with an entry</span>
            </div>
          </div>

          {month.byProject.length > 0 && (
            <div style={splitStyle}>
              {month.byProject.map((row) => (
                <div key={row.projectId ?? '(none)'} data-testid="portal-month-project-row" style={srowStyle}>
                  <span style={snameStyle}>{row.projectName}</span>
                  <span style={shrsStyle}>{formatDurationHuman(row.minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
