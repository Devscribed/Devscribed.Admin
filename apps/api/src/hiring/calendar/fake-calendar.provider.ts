import { Injectable, Logger } from '@nestjs/common';
import {
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

  /** Nothing blocks: the fake tenant's calendars are empty by construction. */
  async busy(): Promise<Interval[]> {
    return [];
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

  async cancelEvent(mailbox: MailboxRef, eventId: EventId): Promise<void> {
    this.events.delete(eventId);
    this.logger.log(`cancelEvent ${eventId} in ${mailbox.address}`);
  }

  /** Test affordance — the suites assert on what a booking actually created. */
  created(): Array<{ id: EventId; mailbox: string; draft: CalendarEventDraft }> {
    return [...this.events.entries()].map(([id, entry]) => ({ id, ...entry }));
  }
}
