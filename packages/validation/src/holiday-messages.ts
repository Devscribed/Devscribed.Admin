/**
 * Every user-facing string of specs/organization/03-holidays.md, verbatim from that
 * spec's Validation Rules list and Error Messages table.
 *
 * The API emits these in 422 field maps, in the 409 duplicate body and in the 403
 * delete body; the web layer reads the same object for toasts, confirmations, empty
 * states, the calendar tooltip and the vacation hint. Parameterised rows are builder
 * functions here rather than template literals at the call site, so the wording can
 * only change in one place.
 */
export const HOLIDAY_MESSAGES = {
  /* Validation Rules 1–8 (§Validation Rules). */
  dateRequired: 'Date is required.',
  dateInvalid: 'Invalid date.',
  nameRequired: 'Holiday name is required.',
  nameTooLong: 'Holiday name cannot exceed 120 characters.',
  nameInvalidChars: 'Holiday name contains disallowed characters.',
  paidHoursRequired: 'Paid hours is required.',
  paidHoursOutOfRange: 'Paid hours must be between 0 and 24.',
  countryCodeInvalid: 'Country code must be 2 uppercase letters.',

  /* Validation Rule 9 — the 409 body's `message`. */
  duplicate: 'A holiday already exists on this date.',

  /* §Error Messages — toasts. */
  toastCreated: 'Holiday added.',
  toastUpdated: 'Holiday updated.',
  toastDeleted: 'Holiday deleted.',
  toastServerError: 'Something went wrong. Please try again.',

  /* §Error Messages — the 403 body's `message` on DELETE without `delete-holidays`. */
  deleteForbidden: "You don't have permission to delete holidays.",

  /* §Error Messages — the two delete confirmations and their buttons. */
  deleteConfirmPast: (name: string, date: string): string =>
    `Delete ${name} on ${date}? Amounts Owed reports run after now will no longer ` +
    `include it. Reports already exported as PDF are unchanged.`,
  deleteConfirmFuture: (name: string, date: string): string =>
    `Delete ${name} on ${date}?`,
  deleteConfirmCancel: 'Cancel',
  deleteConfirmConfirm: 'Delete holiday',

  /* §Error Messages — the two empty states. */
  emptyState: (year: number | string): string =>
    `No holidays for ${year} yet. Add holidays so paid public days appear on ` +
    `Amounts Owed reports and the Time Tracking calendar.`,
  emptyStateCountry: (country: string, year: number | string): string =>
    `No holidays for ${country} in ${year}.`,

  /* §Error Messages — the non-blocking vacation-request hint (requirement 13). */
  vacationHint: (n: number): string =>
    `Note: ${n} paid holiday(s) fall in this range. Vacation is deducted for the ` +
    `working days; holidays are paid separately in Amounts Owed.`,

  /* §Error Messages — the Time Tracking calendar tooltip (requirement 10). */
  calendarTooltip: (name: string): string => `★ Holiday · ${name}`,

  /* §Accessibility — the live-region announcement on day-cell focus. */
  calendarAnnouncement: (name: string, paidHours: number | string): string =>
    `Holiday: ${name}. Paid hours: ${paidHours}.`,

  /* The list page's error banner (§UI Description, Error state). */
  errorLoad: "Couldn't load holidays. Retry?",

  /** 404 body for a holiday that is missing or belongs to another organization. */
  notFound: 'Holiday not found.',
} as const;
