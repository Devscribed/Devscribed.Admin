/**
 * Hiring validation — the rules the public booking page and the API must agree on,
 * plus the vacancy rules the admin dialog and the API share.
 *
 * Every message below is verbatim from the "Error Messages" tables of
 * `specs/hiring/01-vacancies.md` and `specs/hiring/02-booking-page.md`. The client's
 * copy is a convenience; the API re-runs all of it, which is the gate.
 */

// Only referenced from inside function bodies. `index.ts` re-exports this module at the
// end of its own body, so nothing here may read a value from it at module-eval time.
import { normalizeEmail, validateEmail, type FieldResult } from './index';
// A sibling module, so this one is safe to read at module-eval time — unlike `./index`.
import { formatBookedWhen } from './hiring-time';

/* ------------------------------------------------------------------ *
 * Roles
 * ------------------------------------------------------------------ */

/** The organization's four roles (user-management spec 01). Hiring adds none. */
export const ORG_ROLES = ['admin', 'manager', 'user', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Create, edit, close, boards, libraries — the whole authenticated hiring surface. */
export const HIRING_MANAGE_ROLES: readonly string[] = ['admin', 'manager'];

/**
 * `viewer` is absent deliberately: a viewer may not be assigned an interview
 * (hiring README, permission matrix), so they are never listed in the picker.
 */
export const INTERVIEWER_ROLES: readonly string[] = ['admin', 'manager', 'user'];

export const canManageHiring = (role: string): boolean => HIRING_MANAGE_ROLES.includes(role);

export const canBeInterviewer = (role: string): boolean => INTERVIEWER_ROLES.includes(role);

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

export const HIRING_MESSAGES = {
  vacancy: {
    title: {
      required: 'Title is required',
      tooLong: 'Title must be at most 100 characters',
    },
    description: {
      tooLong: 'Description must be at most 5000 characters',
    },
    interviewer: {
      required: 'Choose an interviewer',
      /** Shown against the disabled option in the picker. */
      ineligibleOption: 'No Microsoft 365 mailbox',
      /** Returned by the server when the mailbox no longer resolves. */
      ineligible: 'This member has no Microsoft 365 mailbox',
      /**
       * Returned by user-management's member `DELETE` when the member still holds open
       * vacancies (01 §06.17). The count travels beside it as `openVacancies` rather
       * than inside it, so the screen can name the number without this string having to
       * guess at its own grammar.
       */
      removalBlocked: "Reassign or close this member's open vacancies first",
    },
    duration: {
      required: 'Choose an interview length',
    },
    status: {
      /**
       * Server-side only: the filter offers three fixed choices and the menu writes one
       * of two values, so nothing in the UI can produce this.
       */
      invalid: 'Status must be open or closed',
    },
    deleteBlocked: 'Close this vacancy instead — it has candidates',
    /**
     * The reason a menu row's `Copy booking link` is disabled — a row's description, so
     * it says the one thing that stops the action and no more (01 §07.23).
     */
    closedLinkNote: 'This link is no longer accepting bookings.',
    /**
     * The same fact stated by the screen rather than by a menu row (01 §03.9).
     *
     * The detail page draws the board directly beneath this line (01 §08.31), so the
     * sentence has to answer the question the board immediately raises: closing stopped
     * the link, and it stopped nothing else. A member reading it is looking at the
     * interviews it did not cancel.
     */
    closedBoardNote:
      'This link is no longer accepting bookings. Scheduled interviews stand and the board keeps working.',
    /** Offered in the description's place when a vacancy has none (01 §08.30). */
    addDescription: 'Add a description',
    /** The clamp's two states, which are one control (01 §08.29). */
    viewMore: 'View more',
    viewLess: 'View less',
    /**
     * The row actions the list and the detail page share (01 §07.22).
     *
     * One set of words for one set of actions: a menu row that read `Copy link` in a list
     * and `Copy booking link` in a header would be two names for one act.
     *
     * `openBoard` was dropped when the board became the vacancy (01 §08.27), on the
     * argument that opening the row *is* opening the board. **It is back.** The argument
     * was about the destination and the menu is not: a kebab is where a row says
     * everything it can do, and a reader who has opened one is asking to be told rather
     * than to infer that the whole row is a link. It goes to the same address the row
     * does, which is the point — a menu that omits the obvious action reads as a menu
     * that cannot do it.
     *
     * `openBookingPage` is the one row that leaves the product: the candidate's own view,
     * at the address `copyLink` copies. It is **not** disabled on a closed vacancy the way
     * `copyLink` is — the page still exists and explains itself (02 §02.6), and what a
     * closed vacancy cannot do is take a booking, not be looked at.
     */
    actions: {
      openBoard: 'Open board',
      copyLink: 'Copy booking link',
      openBookingPage: 'Open booking page',
      edit: 'Edit vacancy',
      close: 'Close vacancy',
      reopen: 'Reopen vacancy',
      delete: 'Delete vacancy',
    },
    /** The tablist's accessible name — the strip is a control, and a control is named. */
    statusTablist: 'Vacancy status',
    /** Titles for the two confirmations a row can raise (01 §07.24). */
    closeTitle: 'Close this vacancy?',
    deleteTitle: 'Delete this vacancy?',
    /**
     * Copying from a row has nothing to fall back on (01 §07.25).
     *
     * The detail page selects its own link text when the clipboard refuses, so the
     * member can copy it by hand. A list row draws no link, so there is nothing to
     * select — it says where the link is instead of failing silently.
     */
    clipboardUnavailable: 'The clipboard is unavailable. Open the vacancy to copy its link.',
    forbidden: 'You do not have permission to manage vacancies',
    empty: 'No vacancies yet.',
    /**
     * Spec 01 names one empty string, for an organization with no vacancies at all.
     * A search that matches nothing is a different fact, and telling someone who has
     * twelve vacancies that they have none would read as data loss.
     */
    emptyFiltered: 'No vacancies match these filters.',
  },
  booking: {
    firstName: {
      required: 'First name is required',
      tooLong: 'Must be at most 50 characters',
    },
    lastName: {
      required: 'Last name is required',
      tooLong: 'Must be at most 50 characters',
    },
    cv: {
      required: 'Please attach your CV',
      unsupportedType: 'Unsupported file type. Accepted: .pdf, .doc, .docx, .rtf, .txt',
      tooLarge: 'File is too large (max 10 MB)',
      empty: 'The attached file is empty',
      /**
       * Stated before a file is chosen rather than after one is rejected, and shared
       * with the manage page's replacement chooser (07 design, Copy) — one chooser's
       * constraints must not read differently from the other's.
       */
      hint: 'PDF, DOC, DOCX, RTF or TXT. Up to 10 MB.',
    },
    note: {
      tooLong: 'Please keep this under 2000 characters',
    },
    slotRequired: 'Choose a time',
    slotTaken: 'That time was just booked. Please choose another.',
    /** Completed by `alreadyBookedMessage` — the date, time and zone come from the row. */
    alreadyBooked: 'You already have an interview for this position on {when} ({zone}).',
    vacancyClosed: 'This position is no longer accepting applications',
    failed: "We couldn't complete your booking. Please try again.",
    availabilityFailed: "We couldn't load available times. Try again.",
    notFound: "This link doesn't lead anywhere.",
  },
  card: {
    /**
     * Spec 04 writes this as "Couldn't save. Retry", the design spec as
     * "Couldn't save. **Retry**" — one sentence whose last word is a control. It is
     * stored as its two parts so the banner can render the button it describes, and
     * `saveFailedMessage()` reassembles the sentence a screen reader hears.
     */
    saveFailed: "Couldn't save.",
    retry: 'Retry',
    notesTooLong: 'Notes must be at most 20,000 characters',
    conclusionTooLong: 'Conclusion must be at most 5,000 characters',
    notFound: "We couldn't find that candidate.",
    cvUnavailable: "This CV couldn't be loaded.",
    noCriteria: 'No criteria recorded yet.',
    /** A value in the wrong shape for its criterion's type (04 §05.23). */
    criterionTypeMismatch: "That value doesn't match this criterion",
    /** An archived criterion can be read and edited where it already is, never added. */
    criterionArchived: "This criterion is archived and can't be added",
    /**
     * A criterion is assessed at most once per application (04 §05.24), so choosing one
     * that is already there edits the existing value rather than adding a second chip.
     * The autocomplete keeps offering it — hiding it would leave the member typing a
     * name that exists and being offered `Create` for it.
     */
    criterionPresent: 'Already assessed — edit the existing value',
    criterionTextTooLong: 'Text must be at most 500 characters',
    /**
     * The back link's two destinations (04 §01.8).
     *
     * The card is opened from a board and from the candidate database, and the link says
     * which — not "Back", which names no place. `Candidates` is also the arrival that has
     * no list behind it at all: the calendar invite's deep link opens this page in a tab
     * of its own, and the database is the one list every caller who can read this card
     * can also read (03 §07.33).
     */
    backToBoard: 'Board',
    backToCandidates: 'Candidates',
    /**
     * The copy control's accessible name. A glyph-only button beside the address, so the
     * name is the only thing that says what pressing it does.
     */
    copyEmail: 'Copy email',
  },
  board: {
    /**
     * Deliberately not the vacancy's wording: the board refuses a role that may not
     * manage **candidates**, and the two screens are reached separately.
     */
    forbidden: 'You do not have permission to manage candidates',
    moveFailed: "Couldn't move that card. Please try again.",
    staleBoard: 'This board changed. Refreshing\u2026',
    emptyColumn: 'Nothing here yet.',
    emptyBoard: 'No candidates yet. Share the booking link to start.',
    /** The missing-conclusion marker's meaning lives here, not in the amber alone. */
    noConclusion: 'No conclusion recorded',
    cancelled: 'Cancelled',
    keyboardHint: 'Press Space to pick up, arrow keys to move, Space to drop.',
  },
  /**
   * The manage page and the two actions it hosts (07 §Error Messages).
   *
   * `notFound` is the whole of the third state: a revisited cancellation, a passed
   * interview, a token that never existed and a malformed token are one message,
   * because the link travels in a calendar event both parties hold and can forward
   * onward — a stale link must not confirm that a particular person booked a
   * particular interview and later cancelled it (07 §04.17).
   */
  manage: {
    notFound: "We couldn't find your booking.",
    cancelled: 'Your interview has been cancelled.',
    cancelFailed: "We couldn't cancel your interview. Please try again.",
    /** Completed by `cancelConfirmMessage` — the interview being called off is named. */
    cancelConfirm: "Cancel your interview on {when}? This can't be undone.",
    cancelDialogTitle: 'Cancel this interview?',
    /**
     * "Keep it" rather than "Cancel": a Cancel button inside a cancellation dialog is
     * genuinely ambiguous, and this is the one dialog in the product where getting it
     * wrong is irreversible (07 design).
     */
    cancelDialogDismiss: 'Keep it',
    cancelAction: 'Cancel interview',
    /**
     * The one line the live card cannot say for itself (07 §04.16a).
     *
     * It used to be the booking page's, on a confirmation view that no longer exists,
     * and it used to name the address. It cannot: this page names nobody, and the
     * address is not in the response it reads (07 §04.21). What survives is the fact
     * that matters — an invite is coming — which the product must state because it sends
     * no mail of its own, so Microsoft's invite is the only thing the candidate ever
     * receives.
     */
    justBooked: 'A calendar invite is on its way to the address you gave.',
    /**
     * The move, and the one primary action in the whole spec. There is no confirmation
     * dialog behind it: a candidate who chose Thursday 14:00 does not need to be asked
     * whether they meant Thursday 14:00, and the action is reversible at will
     * (07 §05.26).
     */
    rescheduleAction: 'Reschedule interview',
    /** The kebab those two rows live in. A menu is a control, and a control is named. */
    interviewActions: 'Interview actions',
    /** Beside the status control in an application's header, not above it. */
    statusLabel: 'Status',
    /** The two places an application's header sends you. */
    viewVacancyAction: 'View vacancy',
    /**
     * Primary, because during an interview it is what is most often reached for — and it
     * does not exist yet, so pressing it says so (03 §10.55) rather than describing a
     * navigation this product cannot make.
     */
    openInCalendarAction: 'Open in calendar',
    rescheduleSubmit: 'Move interview',
    rescheduleSubmitting: 'Moving',
    /** Not "Cancel": inside this feature that word already means calling the interview off. */
    rescheduleDismiss: 'Keep current time',
    /** Completed by `currentTimeMessage` — the time they came here to change. */
    currentTime: 'Currently {when}',
    rescheduleFailed: "We couldn't move your interview. Please try again.",
    /**
     * The receipt for a completed move, and `justBooked`'s counterpart (07 §05.27). The
     * card beneath already names the new time, so the notice states only what the card
     * cannot: that the update is on its way. Same reason as `justBooked` — the release
     * sends no mail of its own, so Microsoft's invite is the only thing that ever
     * reaches the candidate.
     */
    justMoved: 'Your interview has been moved. An updated calendar invite is on its way.',
    /**
     * Completed by `movedMessage`. The polite region has no card under it to lean on, so
     * unlike the banner it names the time the interview moved to.
     */
    moved: 'Your interview has been moved to {when}.',
    newBooking: 'New booking',
    panelLabel: 'Your interview',
    /** The board badge and the card's mark, completed by `cancelledBadgeLabel`. */
    cancelledBy: 'Cancelled by',
    cancelledByCandidate: 'Cancelled by candidate',
    historyLabel: 'Scheduling history',
    /**
     * The team's control. It was `Cancel` while it was a button under an application
     * section that already named the interview — the longer label would have restated its
     * own heading. It is a **menu row** now (04 design §Layout), beside `Reschedule
     * interview` and among rows about a candidate, where `Cancel` alone reads as
     * *dismiss this menu*.
     */
    cancelActionTeam: 'Cancel interview',
    /**
     * Completed by `teamCancelConfirmMessage`. It names the candidate as well as the
     * time, because a member cancelling from My interviews is looking at a list of
     * several people and the dialog must not ask them to confirm a pronoun.
     */
    /**
     * The team's confirmation says the **two things a member is about to do to somebody
     * else's day**, where the candidate's own says only that it cannot be undone.
     *
     * Both are worth a sentence and neither is obvious from the control. Microsoft sends
     * the cancellation notice, not this product (07 §12), so a member pressing this is
     * sending mail whether they meant to or not — and the fear that stops them, that a
     * cancelled interview takes the record of it with it, is answered by the second
     * sentence. `isCancelled` is a flag and never a delete (07 §05.22).
     */
    cancelConfirmTeam:
      "Cancel {name}'s interview on {when}? The candidate is notified by Microsoft. Notes and conclusion are kept.",
    /**
     * Optional, and said so in the label rather than left to be discovered: a member who
     * believes a reason is required will invent one (07 §10.46).
     */
    reasonLabel: 'Reason (optional)',
    /**
     * The placeholder states where the text goes, because it leaves the building: it
     * rides into Microsoft's cancellation notice, which the candidate reads (07 §10.47).
     */
    reasonPlaceholder: 'Shared with the candidate in the cancellation notice',
    reasonTooLong: 'Please keep this under 500 characters',
    /**
     * The live state states only that a CV is on file, never which one: a candidate
     * replacing a document knows what they submitted, and naming it would hand a
     * forwarded link a filename the rest of this page withholds (07 §04.21, §07.31).
     */
    cvAttached: 'CV attached',
    cvReplaceAction: 'Replace',
    /**
     * Announced, never drawn. A replacement changes nothing visible on the card — the
     * page names no filename — so the polite region is the only acknowledgement there
     * is, and the accessibility contract asks for one on every action (07 §16.72).
     */
    cvReplaced: 'Your CV has been replaced.',
    /**
     * The card's history row, completed with the filename (07 design, Copy). Team-only,
     * like the rest of the timeline: the candidate already knows what they replaced
     * (07 §11.53).
     */
    cvReplacedEntry: 'CV replaced',
    cvReplaceFailed: "We couldn't replace your CV. Please try again.",
  },
  toast: {
    vacancyCreated: 'Vacancy created',
    vacancyUpdated: 'Vacancy updated',
    vacancyClosed: 'Vacancy closed',
    vacancyReopened: 'Vacancy reopened',
    linkCopied: 'Booking link copied',
    vacancyDeleted: 'Vacancy deleted',
    /** Completed by `interviewMovedToast` — the new time is the whole point of it. */
    interviewRescheduled: 'Interview moved to {when}',
    interviewCancelled: 'Interview cancelled',
    /** The candidate card's copy affordance (04 §02.12). */
    emailCopied: 'Email copied',
  },
} as const;

/** "Couldn't save. Retry" — the whole sentence, for the polite live region. */
export const saveFailedMessage = (): string =>
  `${HIRING_MESSAGES.card.saveFailed} ${HIRING_MESSAGES.card.retry}`;

/* ------------------------------------------------------------------ *
 * Vacancy — spec 01
 * ------------------------------------------------------------------ */

export const VACANCY_LIMITS = {
  titleMax: 100,
  descriptionMax: 5000,
} as const;

/** The only four interview lengths. Anything else is rejected server-side (01 §01.1). */
export const VACANCY_DURATIONS = [15, 30, 45, 60] as const;
export type VacancyDuration = (typeof VACANCY_DURATIONS)[number];

/** Open or closed, freely and repeatedly. There is no `draft` (01 §03.8). */
export const VACANCY_STATUSES = ['open', 'closed'] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

/** The list filter's three choices — `all` is the absence of a filter, not a status. */
export const VACANCY_STATUS_FILTERS = ['all', 'open', 'closed'] as const;
export type VacancyStatusFilter = (typeof VACANCY_STATUS_FILTERS)[number];

export const isVacancyStatus = (input: unknown): input is VacancyStatus =>
  VACANCY_STATUSES.includes(input as VacancyStatus);

/** What each of the list's three tabs is called (01 §07.18). */
export const VACANCY_STATUS_FILTER_LABELS: Record<VacancyStatusFilter, string> = {
  all: 'All',
  open: 'Open',
  closed: 'Closed',
};

/**
 * `Open (9)` — the count the design puts inside the tab rather than beside it (01 §07.19).
 *
 * The number is what makes the split readable before it is pressed: how a library of
 * vacancies divides into live and finished is the first thing somebody arriving here
 * wants, and it used to take three presses of a `Select` to find out.
 */
export const vacancyStatusTabLabel = (filter: VacancyStatusFilter, count: number): string =>
  `${VACANCY_STATUS_FILTER_LABELS[filter]} (${count})`;

/**
 * The kebab's accessible name — `Actions for Senior React Engineer`.
 *
 * Every row draws the same glyph, so without the name a reader walking a page of them is
 * told "Actions, menu" once per vacancy. The same rule as the candidate list's kebab.
 */
export const vacancyActionsLabel = (title: string): string => `Actions for ${title}`;

/**
 * What closing does, and — more to the point — what it does not (01 §03.9).
 *
 * The fear this sentence answers is that closing cancels what is already booked. It does
 * not, so the count is named when there is one: a vacancy with three interviews ahead of
 * it is a different decision from one with none, and the number is what tells them apart.
 */
export const vacancyCloseConfirmation = (scheduled: number): string => {
  const link = 'The booking link stops accepting new candidates.';
  if (scheduled === 0) return `${link} The board keeps working.`;
  // Spelled out rather than interpolated into a plural frame, for the same reason
  // `scheduledKeepMessage` is: "1 scheduled interviews stand" is not a sentence.
  const stand =
    scheduled === 1 ? '1 scheduled interview stands' : `${scheduled} scheduled interviews stand`;
  return `${link} ${stand}, and the board keeps working.`;
};

/**
 * What deleting takes with it — which, by the time this is reachable, is nothing (01 §03.11).
 *
 * The action is refused outright once a single application exists, so the only vacancy
 * that can reach this dialog is one nobody has ever applied to. Saying so is what makes
 * the decision quick: there is no record to weigh, only a title to lose.
 */
export const vacancyDeleteConfirmation = (title: string): string =>
  `${title} has no candidates, so nothing is lost. This cannot be undone.`;

/**
 * What a refused clipboard says on the detail page (01 §07.25, §08.28).
 *
 * The list has somewhere to send a member — *open the vacancy* — and the detail page is
 * that somewhere, so it has nowhere further to point. It draws no link text either, now
 * that the booking link is a button rather than a field, so there is nothing to select
 * by hand. What is left is the link itself, said out loud.
 */
export const clipboardUnavailableLink = (url: string): string =>
  `The clipboard is unavailable. The link is ${url}`;

/**
 * The same refusal on the candidate card, which needs no address said out loud (04 §02.12).
 *
 * The vacancy's link is a 60-character slug behind a button, so a refused clipboard had to
 * recite it. An email address is drawn on this page, in full, right beside the control —
 * so the honest instruction is the shorter one: select it.
 */
export const CLIPBOARD_UNAVAILABLE_EMAIL =
  'The clipboard is unavailable. Select the address to copy it.';


const ok = (value: string): FieldResult => ({ valid: true, value });
const fail = (error: string): FieldResult => ({ valid: false, error });

export function validateVacancyTitle(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(HIRING_MESSAGES.vacancy.title.required);
  if (value.length > VACANCY_LIMITS.titleMax) return fail(HIRING_MESSAGES.vacancy.title.tooLong);
  return ok(value);
}

/** Optional: absent and empty are both valid, and both store as an empty description. */
export function validateVacancyDescription(input: string | null | undefined): FieldResult {
  const value = (input ?? '').trim();
  if (value.length > VACANCY_LIMITS.descriptionMax) {
    return fail(HIRING_MESSAGES.vacancy.description.tooLong);
  }
  return ok(value);
}

export type DurationResult =
  | { valid: true; value: VacancyDuration }
  | { valid: false; error: string };

/**
 * Takes `unknown` on purpose. A JSON body can carry `"60"`, and a string that merely
 * looks like a duration is still not one — coercing it here would let the API accept a
 * shape the UI cannot produce (TC-H01-UNIT-02).
 */
export function validateDurationMinutes(input: unknown): DurationResult {
  const match = VACANCY_DURATIONS.find((allowed) => allowed === input);
  if (match === undefined) return { valid: false, error: HIRING_MESSAGES.vacancy.duration.required };
  return { valid: true, value: match };
}

export function validateInterviewerAccountId(input: unknown): FieldResult {
  const value = typeof input === 'string' ? input.trim() : '';
  if (value.length === 0) return fail(HIRING_MESSAGES.vacancy.interviewer.required);
  return ok(value);
}

export type VacancyField = 'title' | 'interviewerAccountId' | 'durationMinutes' | 'description';

/** Top-to-bottom order in the dialog — drives focus when a submit is blocked. */
export const VACANCY_FIELD_ORDER: readonly VacancyField[] = [
  'title',
  'interviewerAccountId',
  'durationMinutes',
  'description',
];

export interface VacancyInput {
  title: string;
  interviewerAccountId: string;
  durationMinutes: unknown;
  description?: string | null;
}

export interface VacancyValidation {
  valid: boolean;
  errors: Partial<Record<VacancyField, string>>;
  firstInvalidField: VacancyField | null;
  value: {
    title: string;
    interviewerAccountId: string;
    durationMinutes: VacancyDuration | null;
    description: string;
  };
}

export function validateVacancy(input: Partial<VacancyInput>): VacancyValidation {
  const errors: Partial<Record<VacancyField, string>> = {};

  const title = validateVacancyTitle(input.title ?? '');
  if (!title.valid) errors.title = title.error;

  const interviewer = validateInterviewerAccountId(input.interviewerAccountId);
  if (!interviewer.valid) errors.interviewerAccountId = interviewer.error;

  const duration = validateDurationMinutes(input.durationMinutes);
  if (!duration.valid) errors.durationMinutes = duration.error;

  const description = validateVacancyDescription(input.description);
  if (!description.valid) errors.description = description.error;

  const firstInvalidField = VACANCY_FIELD_ORDER.find((field) => errors[field]) ?? null;

  return {
    valid: firstInvalidField === null,
    errors,
    firstInvalidField,
    value: {
      title: title.valid ? title.value : (input.title ?? ''),
      interviewerAccountId: interviewer.valid ? interviewer.value : '',
      durationMinutes: duration.valid ? duration.value : null,
      description: description.valid ? description.value : '',
    },
  };
}

/* ------------------------------------------------------------------ *
 * Vacancy edits — spec 01 §04
 * ------------------------------------------------------------------ */

export type VacancyPatchField = VacancyField | 'status';

/** The dialog's order, with `status` last — the menu writes it, never the form. */
export const VACANCY_PATCH_FIELD_ORDER: readonly VacancyPatchField[] = [
  ...VACANCY_FIELD_ORDER,
  'status',
];

export interface VacancyPatchInput {
  title: string;
  description: string | null;
  interviewerAccountId: string;
  durationMinutes: unknown;
  status: unknown;
}

export interface VacancyPatchValidation {
  valid: boolean;
  errors: Partial<Record<VacancyPatchField, string>>;
  firstInvalidField: VacancyPatchField | null;
  /** Only the fields the caller actually sent — a PATCH is a subset, not a whole. */
  value: {
    title?: string;
    description?: string;
    interviewerAccountId?: string;
    durationMinutes?: VacancyDuration;
    status?: VacancyStatus;
  };
}

/**
 * A PATCH carries any subset of the editable fields (01 §API PATCH), so absence and
 * emptiness must stay distinguishable: an absent `description` leaves the stored one
 * alone, an empty one clears it. Validating the whole shape here — as `validateVacancy`
 * does for a create — would reject every partial edit for missing a field the caller
 * never intended to change.
 */
export function validateVacancyPatch(
  input: Partial<VacancyPatchInput>,
): VacancyPatchValidation {
  const errors: Partial<Record<VacancyPatchField, string>> = {};
  const value: VacancyPatchValidation['value'] = {};

  if (input.title !== undefined) {
    const title = validateVacancyTitle(input.title);
    if (title.valid) value.title = title.value;
    else errors.title = title.error;
  }

  if (input.description !== undefined) {
    const description = validateVacancyDescription(input.description);
    if (description.valid) value.description = description.value;
    else errors.description = description.error;
  }

  if (input.interviewerAccountId !== undefined) {
    const interviewer = validateInterviewerAccountId(input.interviewerAccountId);
    if (interviewer.valid) value.interviewerAccountId = interviewer.value;
    else errors.interviewerAccountId = interviewer.error;
  }

  if (input.durationMinutes !== undefined) {
    const duration = validateDurationMinutes(input.durationMinutes);
    if (duration.valid) value.durationMinutes = duration.value;
    else errors.durationMinutes = duration.error;
  }

  if (input.status !== undefined) {
    if (isVacancyStatus(input.status)) value.status = input.status;
    else errors.status = HIRING_MESSAGES.vacancy.status.invalid;
  }

  const firstInvalidField = VACANCY_PATCH_FIELD_ORDER.find((field) => errors[field]) ?? null;
  return { valid: firstInvalidField === null, errors, firstInvalidField, value };
}

/**
 * The confirmation shown before an interviewer or a duration change (01 §04.14).
 *
 * The design spec writes the copy as `{n} scheduled interviews keep their current time
 * and interviewer.` A single interview would read as "1 scheduled interviews keep
 * their", so the singular is spelled out rather than interpolated into a plural frame —
 * the sentence the visitor reads is the contract, not the template.
 */
export function scheduledKeepMessage(count: number): string {
  return count === 1
    ? '1 scheduled interview keeps its current time and interviewer.'
    : `${count} scheduled interviews keep their current time and interviewer.`;
}

/* ------------------------------------------------------------------ *
 * Public slug — spec 01 §01.2
 * ------------------------------------------------------------------ */

/** `slugify(title)` when the title yields nothing slug-safe (01 §01.2). */
export const SLUG_BASE_FALLBACK = 'vacancy';

/**
 * The base is truncated so a 200-character title cannot produce an unusable URL. The
 * suffix is never truncated — it is the part that carries the entropy.
 */
export const SLUG_BASE_MAX = 60;

/** 9 random bytes → 12 base64url characters → 72 bits, exactly as the spec states. */
export const SLUG_SUFFIX_BYTES = 9;
export const SLUG_SUFFIX_LENGTH = 12;

/** Base, separator, suffix. The documented cap a stored slug never exceeds. */
export const SLUG_MAX_LENGTH = SLUG_BASE_MAX + 1 + SLUG_SUFFIX_LENGTH;

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Lowercase ASCII words joined by hyphens. Accented Latin folds to its base letter;
 * anything with no ASCII form at all (Cyrillic, CJK) drops out, which is what makes
 * the fallback necessary rather than decorative.
 */
export function slugifyTitle(title: string): string {
  const folded = (title ?? '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (folded.length === 0) return SLUG_BASE_FALLBACK;

  // Truncating can leave a trailing hyphen mid-word; the separator adds its own.
  const truncated = folded.slice(0, SLUG_BASE_MAX).replace(/-+$/g, '');
  return truncated.length === 0 ? SLUG_BASE_FALLBACK : truncated;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 9 bytes divide evenly into 12 base64 characters, so there is never any padding. */
function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      BASE64URL[(triple >> 18) & 63] +
      BASE64URL[(triple >> 12) & 63] +
      BASE64URL[(triple >> 6) & 63] +
      BASE64URL[triple & 63];
  }
  return out;
}

/**
 * Web Crypto rather than node's `crypto.randomBytes`: this module is bundled into the
 * browser alongside the booking form, and a node-only import would break that build.
 */
export function randomSlugSuffix(): string {
  const bytes = new Uint8Array(SLUG_SUFFIX_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * Generated once, at creation, and frozen: renaming a vacancy must never invalidate a
 * link that has already been sent (01 §01.2).
 */
export function generateVacancySlug(title: string): string {
  return `${slugifyTitle(title)}-${randomSlugSuffix()}`;
}

/* ------------------------------------------------------------------ *
 * Booking — spec 02
 * ------------------------------------------------------------------ */

export const BOOKING_LIMITS = {
  personNameMax: 50,
  noteMax: 2000,
  cvMaxBytes: 10 * 1024 * 1024,
} as const;

export const CV_EXTENSIONS = ['.pdf', '.doc', '.docx', '.rtf', '.txt'] as const;

/** The `accept` attribute for the file chooser — same list, one source. */
export const CV_ACCEPT = CV_EXTENSIONS.join(',');

export function validateCandidateFirstName(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(HIRING_MESSAGES.booking.firstName.required);
  if (value.length > BOOKING_LIMITS.personNameMax) {
    return fail(HIRING_MESSAGES.booking.firstName.tooLong);
  }
  return ok(value);
}

export function validateCandidateLastName(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(HIRING_MESSAGES.booking.lastName.required);
  if (value.length > BOOKING_LIMITS.personNameMax) {
    return fail(HIRING_MESSAGES.booking.lastName.tooLong);
  }
  return ok(value);
}

export function validateBookingNote(input: string | null | undefined): FieldResult {
  const value = (input ?? '').trim();
  if (value.length > BOOKING_LIMITS.noteMax) return fail(HIRING_MESSAGES.booking.note.tooLong);
  return ok(value);
}

export interface CvCandidate {
  fileName: string;
  sizeBytes: number;
}

export type CvResult = { valid: true } | { valid: false; error: string };

export function cvExtension(fileName: string): string {
  const dot = (fileName ?? '').lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

/**
 * `{cvId}{extension}` — opaque, application-generated, and never derived from what the
 * candidate called their file (00 §03.17).
 *
 * The id is the **CV's own**, not the application's. The original shape was
 * `{applicationId}{extension}`, which is a single slot: one document per application,
 * so it cannot hold two versions of one candidate's CV — which is exactly what a
 * replacement produces (07 §07.35). Files written under the old shape keep the keys
 * they have; the migration back-fills a row per application and moves nothing.
 */
export const cvStorageKey = (cvId: string, fileName: string): string =>
  `${cvId}${cvExtension(fileName)}`;

/**
 * Order matters: an unsupported type is reported before a size problem, so a 20 MB
 * `.pages` file is told the truth about why it cannot be accepted.
 */
export function validateCv(file: CvCandidate | null | undefined): CvResult {
  if (!file || !file.fileName) return { valid: false, error: HIRING_MESSAGES.booking.cv.required };

  const extension = cvExtension(file.fileName);
  if (!CV_EXTENSIONS.includes(extension as (typeof CV_EXTENSIONS)[number])) {
    return { valid: false, error: HIRING_MESSAGES.booking.cv.unsupportedType };
  }
  if (!file.sizeBytes || file.sizeBytes <= 0) {
    return { valid: false, error: HIRING_MESSAGES.booking.cv.empty };
  }
  if (file.sizeBytes > BOOKING_LIMITS.cvMaxBytes) {
    return { valid: false, error: HIRING_MESSAGES.booking.cv.tooLarge };
  }
  return { valid: true };
}

/**
 * The refusal a repeat booking gets, naming the interview the candidate already has
 * (02 §09.35).
 *
 * The zone named is the one they booked in, not the one they happen to be reading this
 * in: it is the record of what they agreed to, and it is what their invite says.
 *
 * Telling them plainly departs from the enumeration-safe posture the rest of the
 * product keeps, and 02 §09.38 makes that trade deliberately — reaching this check
 * costs an unguessable link, a name, a valid slot selection and a CV upload, which is
 * not the cheap oracle a single-field form is.
 */
export function alreadyBookedMessage(startUtc: Date, timeZone: string): string {
  return HIRING_MESSAGES.booking.alreadyBooked
    .replace('{when}', formatBookedWhen(startUtc, timeZone))
    .replace('{zone}', timeZone);
}

export type BookingField = 'firstName' | 'lastName' | 'email' | 'cv' | 'note';

/** Top-to-bottom order on the booking form. */
export const BOOKING_FIELD_ORDER: readonly BookingField[] = [
  'firstName',
  'lastName',
  'email',
  'cv',
  'note',
];

export interface BookingInput {
  firstName: string;
  lastName: string;
  email: string;
  note?: string | null;
  cv?: CvCandidate | null;
}

export interface BookingValidation {
  valid: boolean;
  errors: Partial<Record<BookingField, string>>;
  firstInvalidField: BookingField | null;
  value: { firstName: string; lastName: string; email: string; note: string };
}

export function validateBooking(input: Partial<BookingInput>): BookingValidation {
  const errors: Partial<Record<BookingField, string>> = {};

  const firstName = validateCandidateFirstName(input.firstName ?? '');
  if (!firstName.valid) errors.firstName = firstName.error;

  const lastName = validateCandidateLastName(input.lastName ?? '');
  if (!lastName.valid) errors.lastName = lastName.error;

  const email = validateEmail(input.email ?? '');
  if (!email.valid) errors.email = email.error;

  const cv = validateCv(input.cv);
  if (!cv.valid) errors.cv = cv.error;

  const note = validateBookingNote(input.note);
  if (!note.valid) errors.note = note.error;

  const firstInvalidField = BOOKING_FIELD_ORDER.find((field) => errors[field]) ?? null;

  return {
    valid: firstInvalidField === null,
    errors,
    firstInvalidField,
    value: {
      firstName: firstName.valid ? firstName.value : (input.firstName ?? ''),
      lastName: lastName.valid ? lastName.value : (input.lastName ?? ''),
      email: normalizeEmail(input.email ?? ''),
      note: note.valid ? note.value : (input.note ?? ''),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Application status — spec 05 §01
 * ------------------------------------------------------------------ */

/**
 * The board's five columns. `Application.status` **is** the column — there is no
 * mirrored field to keep in sync (05 §01.2). Declared here because a booking writes
 * `scheduled` long before the board itself exists.
 */
export const APPLICATION_STATUSES = ['scheduled', 'didnt_pass', 'maybe', 'passed', 'offer'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Columns number independently, in clean multiples (05 §03.8). */
export const POSITION_STEP = 1000;

/**
 * The column names, in board order (05 §01.1). The card's status control writes the
 * same field the board column does, so the two must read the same words — which is why
 * the labels are here rather than beside either screen.
 */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  scheduled: 'Scheduled',
  didnt_pass: "Didn't pass",
  maybe: 'Maybe',
  passed: 'Passed',
  offer: 'Offer',
};

export const isApplicationStatus = (input: unknown): input is ApplicationStatus =>
  APPLICATION_STATUSES.includes(input as ApplicationStatus);

/**
 * The two columns that prompt for a conclusion (04 §06.31, 05 §06.20). Prompted, never
 * required: an outcome recorded without a reason is still a recorded outcome.
 */
export const CONCLUSION_PROMPTING_STATUSES: readonly ApplicationStatus[] = ['didnt_pass', 'offer'];
