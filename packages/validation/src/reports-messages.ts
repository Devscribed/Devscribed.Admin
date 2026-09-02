/**
 * User-facing copy for the Reports area — specs/reports/01-reports.md
 * §Validation Rules and §Error Messages.
 *
 * Split out of `reports.ts` so any surface can `import { REPORTS_MESSAGES }`
 * without also pulling the pure helpers and their transitive typings — same
 * shape as `holiday-messages.ts`. Every string here is authoritative; the API
 * re-emits these verbatim on 4xx bodies and the screens read them for inline
 * errors and toasts.
 */

export const REPORTS_MESSAGES = {
  // Range picker (spec Validation Rules 1–4).
  startDateRequired: 'Start date is required.',
  startDateInvalid: 'Invalid start date.',
  endDateRequired: 'End date is required.',
  endDateInvalid: 'Invalid end date.',
  endBeforeStart: 'End date must be on or after start date.',
  rangeTooWide: 'Range too wide. Pick a range of at most one year.',

  // Filter ids (spec Validation Rules 5–6).
  invalidMemberRef: 'Invalid member reference.',
  invalidProjectRef: 'Invalid project reference.',
  invalidClientRef: 'Invalid client reference.',

  // Per-report row filters (spec Validation Rules 10–12).
  invalidBillableFilter: 'Invalid billable filter.',
  invalidTypeFilter: 'Invalid type filter.',
  invalidStatusFilter: 'Invalid status filter.',

  // PDF backpressure (spec §Error Messages).
  pdfTooLarge: 'This report is too large to export as PDF. Please narrow the range or filters.',

  // Toasts (spec §Error Messages).
  toastServerError: "Couldn't load the report. Retry?",
  toastForbidden: "You don't have permission to see this report.",
  toastPdfReady: 'PDF ready — check your downloads.',

  // Empty states (spec §Error Messages).
  emptyState: 'No data for this range. Try widening it or clearing filters.',
  emptyStateNoFilters: 'Pick a start and end date to run the report.',

  // Landing copy — one-line description per card, keyed by report kind. Not in
  // §Error Messages but in §Screens / §Reports landing; kept here so the copy
  // is authoritative in one file.
  cardDescriptionAmountsOwed:
    'Payable amounts per member for a date range. Includes billable time, paid holidays, and approved vacation.',
  cardDescriptionTimeAndActivity:
    'Hours per project and member for a date range. Filter by client, project, or member.',
  cardDescriptionTimeOff:
    'Vacation and holidays overlapping a date range. Grouped by member with organization-wide holidays at the bottom.',
} as const;

export type ReportsMessage = keyof typeof REPORTS_MESSAGES;
