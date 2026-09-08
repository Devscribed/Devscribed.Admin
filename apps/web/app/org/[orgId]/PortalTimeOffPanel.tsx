'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Card } from '@devscribed/ds';
import { PORTAL_MESSAGES } from '@devscribed/validation';
import { awayLabel, formatDays, formatShortDate, type PortalHolidays, type PortalTimeOff } from './portal-types';
import { bandStyle, figCaptionStyle, figNumberStyle, figStyle, panelLinkStyle } from './PortalMonthPanel';

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

const holStyle: CSSProperties = {
  marginTop: 'var(--space-7)',
  borderTop: '1px solid var(--border-subtle)',
  paddingTop: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const holCapStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  fontWeight: 'var(--font-weight-medium)',
};

/* Geometry & motion — `minmax(0,1fr)` with ellipsis between a fixed 74px date and an `auto`
 * "in N days"; the row never wraps. */
const hrowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-5)' };

const hdateStyle: CSSProperties = {
  flex: '0 0 auto',
  minWidth: 74,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-secondary)',
};

const hdotStyle: CSSProperties = {
  width: 8,
  height: 8,
  flex: '0 0 8px',
  borderRadius: 'var(--radius-circle)',
  backgroundColor: 'var(--color-holiday)',
};

const hnameStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const hawayStyle: CSSProperties = {
  marginLeft: 'auto',
  color: 'var(--text-tertiary)',
  fontSize: 'var(--font-size-xs)',
  whiteSpace: 'nowrap',
};

/**
 * "Time off" — Q1's second panel. `timeOff` is `null` in full when the membership has no
 * `MemberFinancials` row (REQ-01-016): the figures drop entirely, and the holidays below —
 * which say where the caller works, never what they are owed — are drawn exactly as always
 * (REQ-01-017). `holidays.countryCode === null` replaces the list with
 * `PORTAL_MESSAGES.noCountry` (REQ-01-019), independently of whatever the figures above did.
 */
export function PortalTimeOffPanel({
  orgId,
  timeOff,
  holidays,
  today,
}: {
  orgId: string;
  timeOff: PortalTimeOff | null;
  holidays: PortalHolidays;
  today: string;
}) {
  return (
    <Card variant="panel" data-testid="portal-timeoff-panel">
      <div style={panelHeadStyle}>
        <h2 style={panelHeadingStyle}>Time off</h2>
        <Link href={`/org/${orgId}/time-off`} style={panelLinkStyle}>
          My time off →
        </Link>
      </div>

      {timeOff && (
        <div data-testid="portal-timeoff-figures" style={bandStyle}>
          <div style={figStyle}>
            <span data-testid="portal-timeoff-available" style={figNumberStyle}>
              {formatDays(timeOff.availableDays)}
            </span>
            <span style={figCaptionStyle}>Days available</span>
          </div>
          <div style={figStyle}>
            <span style={figNumberStyle}>{formatDays(timeOff.usedDays)}</span>
            <span style={figCaptionStyle}>Used this year</span>
          </div>
          <div style={figStyle}>
            <span style={figNumberStyle}>{formatDays(timeOff.pendingDays)}</span>
            <span style={figCaptionStyle}>Pending approval</span>
          </div>
        </div>
      )}

      <div style={holStyle}>
        <div style={holCapStyle}>
          {holidays.countryCode ? `Next holidays · ${holidays.countryCode}` : 'Next holidays'}
        </div>

        {holidays.countryCode === null ? (
          <p data-testid="portal-holidays-no-country" style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>
            {/* UI-05 — the message is its own node. Left as a bare child of the `<p>` it shares
                with the link, the paragraph's text is the message *plus* the link's, and the
                sentence can then be counted neither once nor at all. */}
            <span>{PORTAL_MESSAGES.noCountry}</span>{' '}
            <Link href="/account/settings" style={panelLinkStyle}>
              Set it on your profile →
            </Link>
          </p>
        ) : (
          holidays.upcoming.map((holiday) => (
            <div key={holiday.id} data-testid="portal-holiday-row" style={hrowStyle}>
              <span style={hdateStyle}>{formatShortDate(holiday.date)}</span>
              <span aria-hidden="true" style={hdotStyle} />
              <span style={hnameStyle}>{holiday.name}</span>
              <span style={hawayStyle}>{awayLabel(today, holiday.date)}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
