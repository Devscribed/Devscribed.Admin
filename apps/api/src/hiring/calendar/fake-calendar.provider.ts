import { Injectable, Logger } from '@nestjs/common';
import { cancelNoticeComment } from '@devscribed/validation';
import {
  CalendarAttachment,
  CalendarEventChange,
  CalendarEventDraft,
  CalendarProvider,
  EventId,
  Interval,
  MailboxRef,
  WorkingHours,
} from './calendar-provider';

/**
 * The stand-in that lets the whole booking path run before a single Azure app
 * registration exists.
 *
 * It is deliberate rather than temporary scaffolding: it proves the `CalendarProvider`
 * seam cheaply, and it is what the integration and E2E suites keep running against
 * once `TenantAppOnlyProvider` ships, since neither can hold a real tenant mailbox.
 *
 * Its working hours are a flat 09:00–17:00 UTC on weekdays. Real availability comes
 * from `mailboxSettings.workingHours` and belongs to the Graph provider — nothing here
 * should grow toward it.
 */
@Injectable()
export class FakeCalendarProvider extends CalendarProvider {
  private readonly logger = new Logger(FakeCalendarProvider.name);

  /** Created events, keyed by id. Reset with the process; nothing persists it. */
  private readonly events = new Map<EventId, { mailbox: string; draft: CalendarEventDraft }>();

  private sequence = 0;

  /**
   * Addresses this provider refuses to resolve, as a comma-separated list. It is the
   * only way to exercise an ineligible interviewer without a real tenant — the
   * integration suite overrides the whole provider instead.
   */
  private get withoutMailbox(): string[] {
    return (process.env.FAKE_CALENDAR_NO_MAILBOX ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }

  async resolveMailbox(email: string): Promise<MailboxRef | null> {
    const address = (email ?? '').trim().toLowerCase();
    if (!address || this.withoutMailbox.includes(address)) return null;
    return { address, displayName: null };
  }

  async workingHours(): Promise<WorkingHours> {
    return { daysOfWeek: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00', timeZone: 'UTC' };
  }

  /**
   * The fake tenant's calendars hold nothing but the interviews booked against them,
   * which is enough for availability to behave: book a slot locally and it stops being
   * offered, exactly as a real busy block would.
   */
  async busy(mailbox: MailboxRef, fromUtc: Date, toUtc: Date): Promise<Interval[]> {
    return [...this.events.values()]
      .filter(({ mailbox: address }) => address === mailbox.address)
      .map(({ draft }) => ({ startUtc: draft.startUtc, endUtc: draft.endUtc }))
      .filter((block) => block.startUtc < toUtc && fromUtc < block.endUtc);
  }

  async isFree(mailbox: MailboxRef, startUtc: Date, endUtc: Date): Promise<boolean> {
    // Half-open overlap, so a booking may begin exactly when another ends.
    for (const { mailbox: address, draft } of this.events.values()) {
      if (address !== mailbox.address) continue;
      if (draft.startUtc < endUtc && startUtc < draft.endUtc) return false;
    }
    return true;
  }

  async createEvent(mailbox: MailboxRef, event: CalendarEventDraft): Promise<EventId> {
    this.sequence += 1;
    const id = `fake-event-${this.sequence}`;
    this.events.set(id, { mailbox: mailbox.address, draft: event });
    // Never the candidate's details or the CV bytes (00 §05.23).
    this.logger.log(`createEvent ${id} in ${mailbox.address}`);
    return id;
  }

  /**
   * In place, keeping the same id and the same body — which is what a reschedule must
   * look like from outside. The stored draft moves too, so the slot the interview just
   * left becomes free and the one it took becomes busy, exactly as a real calendar
   * would report them.
   */
  async updateEvent(
    mailbox: MailboxRef,
    eventId: EventId,
    change: CalendarEventChange,
  ): Promise<void> {
    // An id this process never created — the map resets with the process — moves
    // nothing and is not an error. A dev who restarts the API mid-afternoon should
    // still be able to reschedule the interview they booked before lunch.
    const existing = this.events.get(eventId);
    if (!existing) return;
    this.events.set(eventId, {
      mailbox: existing.mailbox,
      draft: {
        ...existing.draft,
        startUtc: change.startUtc,
        endUtc: change.endUtc,
        timeZone: change.timeZone,
      },
    });
    this.logger.log(`updateEvent ${eventId} in ${mailbox.address}`);
  }

  /**
   * The current CV, in place of whatever was there. Everything else about the event is
   * left exactly as it is — the attachment is a convenience copy of what is current,
   * and a replacement is not a re-booking (07 §07.36).
   */
  async replaceAttachment(
    mailbox: MailboxRef,
    eventId: EventId,
    attachment: CalendarAttachment,
  ): Promise<void> {
    // An id this process never created — the map resets with the process — attaches
    // nothing and is not an error, for the same reason `updateEvent` is forgiving.
    const existing = this.events.get(eventId);
    if (!existing) return;
    this.events.set(eventId, {
      mailbox: existing.mailbox,
      draft: { ...existing.draft, attachment },
    });
    // The name, never the bytes (00 §05.23).
    this.logger.log(
      `replaceAttachment ${eventId} in ${mailbox.address}: ${attachment.fileName}`,
    );
  }

  async cancelEvent(mailbox: MailboxRef, eventId: EventId, comment?: string): Promise<void> {
    this.events.delete(eventId);
    // The comment is logged rather than dropped: it is the only part of a cancellation
    // that reaches the candidate, and a fake that swallowed it would hide a caller
    // passing the wrong one.
    this.logger.log(
      `cancelEvent ${eventId} in ${mailbox.address}: ${cancelNoticeComment(comment)}`,
    );
  }

  /** Test affordance — the suites assert on what a booking actually created. */
  created(): Array<{ id: EventId; mailbox: string; draft: CalendarEventDraft }> {
    return [...this.events.entries()].map(([id, entry]) => ({ id, ...entry }));
  }
}
