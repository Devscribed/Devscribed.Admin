import React from 'react';

export interface ReportSummaryItem {
  label: React.ReactNode;
  /** Already formatted. This component does no arithmetic and no rounding. */
  value: React.ReactNode;
  /** §82 — the figure is drawn here, so only this component can tag it. */
  testId?: string;
}

export interface ReportSummaryBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  summary?: ReportSummaryItem[];
}

/**
 * ReportSummaryBanner — the outlined band of headline figures above a report table.
 *
 * §82 — **one band, not a row of cards.** The figures are parts of a single answer — hours,
 * amount, members, days — and four bordered tiles draw three vertical rules between numbers
 * that are meant to be read across. One outline around the set says they belong together, and
 * it is also what lets the band wrap on a narrow viewport without turning into a grid of boxes
 * whose edges no longer line up with the table beneath.
 *
 * Each figure is a `role="status"`. The band is re-rendered when a filter changes, and the
 * amount changing is the answer to what the reader just did; without the role a screen reader
 * says nothing at all and the only feedback for a filter is a table too long to hear.
 *
 * §77 — the figures take `tabular-nums` on the base family, not the mono family. A number in a
 * report is not code; what it needs is even digit widths so a column of them does not jitter
 * when a filter changes the value under the cursor.
 */
export function ReportSummaryBanner({ summary = [], style, ...rest }: ReportSummaryBannerProps) {
  return (
    <div
      {...rest}
      style={{
        display: 'flex', flexWrap: 'wrap',
        border: 'var(--border-width-control) solid var(--border-default)',
        borderRadius: 'var(--radius-l)',
        padding: 'var(--space-5) 0',
        marginBottom: 'var(--space-7)',
        fontFamily: 'var(--font-family-base)',
        ...style,
      }}
    >
      {summary.map((item, index) => (
        <div
          key={index}
          role="status"
          data-testid={item.testId}
          /* 180px is the width at which "Total payable" and a six-figure amount both fit on
             one line; below it the band wraps rather than breaking either. */
          style={{ display: 'flex', flexDirection: 'column', flex: '1 1 180px', minWidth: 180, padding: '0 var(--space-7)' }}
        >
          <div style={{ fontSize: 'var(--font-size-xs)', lineHeight: 'var(--line-height-xs)', color: 'var(--text-secondary)' }}>
            {item.label}
          </div>
          <div
            style={{
              /* @literal 32px at 300 is this band's own figure size: the type scale tops out at
                 24px for a heading, and the summary number is not a heading — it is the largest
                 thing on the page and the only thing set above the scale. Naming it would put a
                 word in the vocabulary one component will ever read. */
              fontSize: 32,
              fontWeight: 'var(--font-weight-light)',
              color: 'var(--color-blue)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
