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

  abstract cancelEvent(mailbox: MailboxRef, eventId: EventId): Promise<void>;
}
