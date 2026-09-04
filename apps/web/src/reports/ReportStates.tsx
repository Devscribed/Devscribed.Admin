'use client';

import { Button, EmptyState, InfoBanner } from '@devscribed/ds';
import { REPORTS_MESSAGES } from '@devscribed/validation';

/**
 * The three states a report screen is in when it is not showing a report — loading, empty and
 * refused — declared once for all three reports.
 *
 * Each of these was written out three times, once per report screen, with the same test ids
 * and three slightly different paints. They are the same states of the same screen; the report
 * they belong to changes nothing about any of them.
 */

/**
 * Spec reports/01 §States — "Skeleton: 4 stat tiles + 6 shimmering table rows".
 *
 * It is deliberately app-local rather than a system component: the system ships `Preloader`
 * (§23, §69) for everything that waits, and an outline earns its place over dots only where
 * the shape of what is coming is already known. That is true here — the band and the table
 * below it are the same on every filter change — and the record's own note on
 * `MembersLoadingSkeleton` is the same call, made the same way.
 *
 * The outline follows `ReportSummaryBanner` (§82): one band, not four cards, because the
 * skeleton's whole job is to reserve the space the real thing will take.
 */
export function ReportLoadingSkeleton() {
  const block = (width: number | string, height: number) => ({
    width,
    height,
    borderRadius: 'var(--radius-s)',
    background: 'var(--surface-sunken)',
  });

  return (
    <div data-testid="reports-loading-skeleton" aria-busy="true" aria-live="polite">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          border: 'var(--border-width-control) solid var(--border-default)',
          borderRadius: 'var(--radius-l)',
          padding: 'var(--space-5) 0',
          marginBottom: 'var(--space-7)',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: '1 1 180px', minWidth: 180, padding: '0 var(--space-7)' }}>
            <div style={block(80, 12)} />
            <div style={{ ...block(140, 28), marginTop: 'var(--space-3)' }} />
          </div>
        ))}
      </div>
      <div
        style={{
          border: 'var(--border-width-hairline) solid var(--border-default)',
          borderRadius: 'var(--radius-l)',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 70, background: 'var(--surface-sunken)' }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 'var(--space-7)',
              padding: '0 var(--space-7)',
              height: 50,
              alignItems: 'center',
              borderTop: 'var(--border-width-hairline) solid var(--color-gray-lighter)',
            }}
          >
            <div style={{ ...block('100%', 14), flex: 1.5 }} />
            <div style={{ ...block('100%', 14), flex: 1.5 }} />
            <div style={block(80, 14)} />
            <div style={block(80, 14)} />
            <div style={block(100, 14)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Spec §States — "Centered empty card with 'No data for this range.'". */
export function ReportEmptyState() {
  return <EmptyState data-testid="reports-empty-state">{REPORTS_MESSAGES.emptyState}</EmptyState>;
}

/** Spec §States — 5xx: the message, and a Retry that re-runs the last request. */
export function ReportErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    /* `variant`, not `tone`. Every report screen passed `tone="error"`, which is not a prop —
       it reached the DOM as an unknown attribute and the banner drew itself in the `info`
       blue, so a failed report has been announcing itself as a notice. */
    <InfoBanner variant="error" role="alert" data-testid="reports-error-banner">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <span>{REPORTS_MESSAGES.toastServerError}</span>
        <Button onClick={onRetry} data-testid="reports-error-retry-btn">
          Retry
        </Button>
      </div>
    </InfoBanner>
  );
}

/**
 * The inline refusal under the filter bar — a range the server would not run, or a filter it
 * could not read. Spec §States: "Inline error near the offending filter; last-good data stays
 * on screen."
 */
export function ReportFilterError({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div
      data-testid={testId}
      role="alert"
      style={{
        marginBottom: 'var(--space-7)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--color-error-tint)',
        color: 'var(--status-error)',
        border: 'var(--border-width-hairline) solid var(--color-error-outline)',
        borderRadius: 'var(--radius-l)',
        fontFamily: 'var(--font-family-base)',
        fontSize: 'var(--font-size-s)',
      }}
    >
      {children}
    </div>
  );
}
