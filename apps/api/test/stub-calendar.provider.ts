import {
  CalendarEventDraft,
  CalendarProvider,
  EventId,
  Interval,
  MailboxRef,
  WorkingHours,
} from '../src/hiring/calendar/calendar-provider';

/**
 * The calendar the integration suites run against. It exists so a test can state its
 * precondition — "this address has no mailbox", "event creation fails" — instead of
 * arranging one through environment variables, and so assertions can read what a
 * booking actually created.
 */
export class StubCalendarProvider extends CalendarProvider {
  /** Addresses that resolve to nothing. Everything else resolves. */
  withoutMailbox = new Set<string>();

  /** Busy blocks per mailbox address. */
  busyBlocks = new Map<string, Interval[]>();

  failOnCreate = false;

  readonly events = new Map<EventId, { mailbox: string; draft: CalendarEventDraft }>();

  readonly cancelled: EventId[] = [];

  private sequence = 0;

  async resolveMailbox(email: string): Promise<MailboxRef | null> {
    const address = email.toLowerCase();
    if (this.withoutMailbox.has(address)) return null;
    return { address, displayName: null };
  }

  async workingHours(): Promise<WorkingHours> {
    return { daysOfWeek: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00', timeZone: 'UTC' };
  }

  async busy(mailbox: MailboxRef): Promise<Interval[]> {
    return this.busyBlocks.get(mailbox.address) ?? [];
  }

  async isFree(mailbox: MailboxRef, startUtc: Date, endUtc: Date): Promise<boolean> {
    const blocks = this.busyBlocks.get(mailbox.address) ?? [];
    // Half-open, so a slot may begin exactly when a block ends.
    return !blocks.some((block) => block.startUtc < endUtc && startUtc < block.endUtc);
  }

  async createEvent(mailbox: MailboxRef, draft: CalendarEventDraft): Promise<EventId> {
    if (this.failOnCreate) throw new Error('stub: event creation failed');
    this.sequence += 1;
    const id = `stub-event-${this.sequence}`;
    this.events.set(id, { mailbox: mailbox.address, draft });
    return id;
  }

  async cancelEvent(_mailbox: MailboxRef, eventId: EventId): Promise<void> {
    this.cancelled.push(eventId);
    this.events.delete(eventId);
  }

  reset(): void {
    this.withoutMailbox.clear();
    this.busyBlocks.clear();
    this.failOnCreate = false;
    this.events.clear();
    this.cancelled.length = 0;
    this.sequence = 0;
  }
}
