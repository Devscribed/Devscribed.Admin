/**
 * The calendar capability, as specified in `specs/hiring/00-integrations.md` §02.
 *
 * Callers name this interface and never a vendor: no Graph type, no SDK type, and no
 * mailbox-shaped string crosses this boundary in either direction. A caller that can
 * name `microsoft-graph-types` is a bug, not a shortcut.
 *
 * An abstract class rather than an interface so it can be the Nest DI token directly,
 * matching `MailService`.
 */

/** An opaque handle to a mailbox. Only the provider knows what addresses it. */
export interface MailboxRef {
  /** The address the mailbox was resolved from, for logging. Never a Graph id. */
  address: string;
  displayName: string | null;
}

/** Bookable hours as the mailbox itself reports them — never a product setting. */
export interface WorkingHours {
  /** 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[];
  /** `HH:mm`, in `timeZone`. */
  startTime: string;
  endTime: string;
  /** IANA. The provider translates Windows identifiers on the way out. */
  timeZone: string;
}

/** A half-open busy block: `[startUtc, endUtc)`. */
export interface Interval {
  startUtc: Date;
  endUtc: Date;
}

export interface CalendarAttachment {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

export interface CalendarEventDraft {
  subject: string;
  /** Identical for both parties — there is no interviewer-only variant (00 §04.19). */
  body: string;
  startUtc: Date;
  endUtc: Date;
  /** The zone the candidate booked in, carried so the event can name it. */
  timeZone: string;
  attendee: { email: string; name: string };
  attachment?: CalendarAttachment;
}

/**
 * A move of an existing event. Only the time — the subject, the body, the attendee and
 * the attachment all stay exactly as they were, because a reschedule changes when the
 * interview is and nothing else about it (07 §02.6).
 */
export interface CalendarEventChange {
  startUtc: Date;
  endUtc: Date;
  /** The zone the acting party was working in, carried so the event can name it. */
  timeZone: string;
}

export type EventId = string;

export abstract class CalendarProvider {
  /**
   * The single source of interviewer eligibility. `null` means "no mailbox", which is
   * an answer, not a failure — it must not throw (TC-H00-INT-02).
   */
  abstract resolveMailbox(email: string): Promise<MailboxRef | null>;

  abstract workingHours(mailbox: MailboxRef): Promise<WorkingHours>;

  /** Only blocking statuses — `free` and `workingElsewhere` never appear (00 §02.8). */
  abstract busy(mailbox: MailboxRef, fromUtc: Date, toUtc: Date): Promise<Interval[]>;

  abstract isFree(mailbox: MailboxRef, startUtc: Date, endUtc: Date): Promise<boolean>;

  /** Adds the candidate as an attendee, which is what delivers the invite (00 §02.10). */
  abstract createEvent(mailbox: MailboxRef, event: CalendarEventDraft): Promise<EventId>;

  /**
   * Moves an existing event in place, which is what makes Microsoft send both parties a
   * meeting-updated notice.
   *
   * A reschedule is **never** a cancellation followed by a fresh booking (00 §02.4).
   * That would tell the candidate their interview is cancelled as the first half of
   * moving it — under 07 §01.1 the one message this feature must never send — while
   * also re-uploading the CV attachment on every move and leaving a tombstone in the
   * interviewer's calendar each time.
   */
  abstract updateEvent(
    mailbox: MailboxRef,
    eventId: EventId,
    change: CalendarEventChange,
  ): Promise<void>;

  /**
   * Cancels rather than deletes, so the attendees are told rather than left holding an
   * invite to a meeting that is no longer there.
   *
   * `comment` rides into the notice Microsoft sends. It is the hiring manager's reason
   * when they gave one (07 §10.47), and a bare statement that the interview is off when
   * they did not — never the compensating rollback's wording, which is correct only for
   * a booking that failed halfway and reads as an apology when a member cancelled on
   * purpose. Idempotent: an event that is already cancelled is a success, which is what
   * lets a caller retry after a database failure with no compensating step.
   */
  abstract cancelEvent(
    mailbox: MailboxRef,
    eventId: EventId,
    comment?: string,
  ): Promise<void>;
}
