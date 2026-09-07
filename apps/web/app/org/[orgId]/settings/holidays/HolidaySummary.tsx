'use client';

import {
  Card,
  InfoBanner,
  Preloader,
  ReportGroupBody,
  ReportTableHead,
  type ReportTableColumn,
} from '@devscribed/ds';
import { HOLIDAY_SOURCING_MESSAGES } from '@devscribed/validation';
import { holidayCountryLabel } from './country-options';
import type { HolidaySummaryResponse, SummaryCountryRow, SummaryMemberRow } from './types';

/**
 * Time off spec 02 §Screens — the summary, above the list.
 *
 * Two banded tables: how many paid days each country has and how many people it reaches
 * (REQ-02-013), then how many days reach each person and what they cost (REQ-02-014,
 * REQ-02-015). The list below is the evidence for both.
 *
 * **The money column is drawn only where the response carries `byCurrency`**, which is the
 * API's own gate (REQ-02-017): the screen omits the column rather than drawing a zero,
 * because a zero is an amount and withholding is not.
 */
export function HolidaySummary({
  year,
  summary,
  loading,
  failed,
}: {
  year: number;
  summary: HolidaySummaryResponse | null;
  loading: boolean;
  failed: boolean;
}) {
  if (failed) {
    return (
      <div data-testid="holiday-summary" style={{ marginBottom: 'var(--space-6)' }}>
        <InfoBanner variant="warning">{HOLIDAY_SOURCING_MESSAGES.summaryUnavailable}</InfoBanner>
      </div>
    );
  }

  // A summary for another year is not this year's summary: the two reads are separate
  // requests and the year tab can move between them, so the block waits rather than
  // labelling last year's figures with this year's heading.
  if (loading || summary === null || summary.year !== year) {
    return (
      <div data-testid="holiday-summary" style={{ marginBottom: 'var(--space-6)' }}>
        <Card>
          <div
            role="status"
            aria-label="Loading the holiday summary"
            style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-7) 0' }}
          >
            <Preloader />
          </div>
        </Card>
      </div>
    );
  }

  // The money column exists where the body carries an amount anywhere: `byCurrency` is
  // absent from every row and from `totals` for a caller without `view-amounts-owed`.
  const showAmounts =
    summary.totals.byCurrency !== undefined ||
    summary.members.some((member) => member.byCurrency !== undefined);

  const countryColumns: ReportTableColumn<SummaryCountryRow>[] = [
    {
      key: 'countryCode',
      label: 'Country',
      render: (row) => holidayCountryLabel(row.countryCode),
    },
    {
      key: 'holidayCount',
      label: 'Days',
      align: 'end',
      width: 120,
      render: (row) => (
        <span data-testid={`holiday-summary-country-${countryKey(row.countryCode)}-days`}>
          {row.holidayCount}
        </span>
      ),
    },
    {
      key: 'memberCount',
      label: 'People',
      align: 'end',
      width: 120,
      render: (row) => row.memberCount,
    },
  ];

  const memberColumns: ReportTableColumn<SummaryMemberRow>[] = [
    { key: 'displayName', label: 'Member', render: (row) => row.displayName },
    {
      key: 'countryCode',
      label: 'Country',
      width: 160,
      // A member with no resolved country states none and inherits none — they receive
      // global holidays only. That is not "All", which is what a global HOLIDAY means, so
      // the cell holds a dash rather than a word that means the opposite here.
      render: (row) => row.countryCode ?? '—',
    },
    {
      key: 'holidayCount',
      label: 'Days',
      align: 'end',
      width: 120,
      render: (row) => (
        <span data-testid={`holiday-summary-member-${row.membershipId}-days`}>
          {row.holidayCount}
        </span>
      ),
      renderTotal: (total) => (total as { holidayCount: number }).holidayCount,
    },
    {
      key: 'paidHours',
      label: 'Paid hours',
      align: 'end',
      width: 140,
      render: (row) => `${row.paidHours} h`,
      renderTotal: (total) => `${(total as { paidHours: string }).paidHours} h`,
    },
    ...(showAmounts
      ? [
          {
            key: 'amount',
            label: 'Amount',
            align: 'end' as const,
            width: 180,
            render: (row: SummaryMemberRow) => (
              <span data-testid={`holiday-summary-member-${row.membershipId}-amount`}>
                {/* A member with no financial settings has no `byCurrency` key at all
                    (REQ-02-018) and no amount to draw — an em dash, never a 0.00. */}
                {row.byCurrency && row.byCurrency.length > 0
                  ? row.byCurrency.map((entry) => `${entry.amount} ${entry.currency}`).join(' · ')
                  : '—'}
              </span>
            ),
            renderTotal: (total: Record<string, unknown>) => {
              const amounts = (total as { byCurrency?: { currency: string; amount: string }[] })
                .byCurrency;
              if (!amounts || amounts.length === 0) return '—';
              return (
                <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  {amounts.map((entry) => (
                    <span
                      key={entry.currency}
                      data-testid={`holiday-summary-total-${entry.currency}`}
                    >
                      {`${entry.amount} ${entry.currency}`}
                    </span>
                  ))}
                </span>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div data-testid="holiday-summary" style={{ marginBottom: 'var(--space-6)' }}>
      <Card padded={false} style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            aria-label={`Paid public days by country, ${year}`}
            style={{ width: '100%', borderCollapse: 'collapse' }}
          >
            <ReportTableHead columns={countryColumns} />
            <ReportGroupBody<SummaryCountryRow>
              title={`Paid public days, ${year}`}
              columns={countryColumns}
              rows={summary.countries}
              rowTestId={(row) => `holiday-summary-country-${countryKey(row.countryCode)}`}
            />
          </table>
        </div>
      </Card>

      <Card padded={false}>
        <div style={{ overflowX: 'auto' }}>
          <table
            aria-label={`Paid public days by person, ${year}`}
            style={{ width: '100%', borderCollapse: 'collapse' }}
          >
            <ReportTableHead columns={memberColumns} />
            <ReportGroupBody<SummaryMemberRow>
              columns={memberColumns}
              rows={summary.members}
              rowTestId={(row) => `holiday-summary-member-${row.membershipId}`}
              total={summary.totals as unknown as Record<string, unknown>}
            />
          </table>
        </div>
      </Card>
    </div>
  );
}

/**
 * The id's `{countryCode}` is the value the API sent, and for the global row that value
 * is `null` — one row for the holidays that reach everybody. Rendering the API's own
 * value keeps the id an instantiation of the roster's pattern rather than a second
 * vocabulary invented on the screen.
 */
function countryKey(countryCode: string | null): string {
  return String(countryCode);
}
