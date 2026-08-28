import {
  CalendarEventChange,
  CalendarEventDraft,
  CalendarProvider,
  EventId,
  Interval,
  MailboxRef,
  WorkingHours,
} from '../src/hiring/calendar/calendar-provider';

/**
 * The calendar the integration suites run against. It exists so a test can state its
 * precondition — "this address has no mailbox", "free/busy is unreachable", "event
 * creation fails" — instead of arranging one through environment variables, and so
 * assertions can read what a booking actually created.
 */
export class StubCalendarProvider extends CalendarProvider {
  /** Addresses that resolve to nothing. Everything else resolves. */
  withoutMailbox = new Set<string>();

  /** Busy blocks per mailbox address. */
  busyBlocks = new Map<string, Interval[]>();

  /** Mon–Fri 09:00–17:00 UTC unless a test says otherwise. */
  workingHoursSpec: WorkingHours = {
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '17:00',
    timeZone: 'UTC',
  };

  failOnCreate = false;

  /** A move the calendar refuses — the booking must survive it untouched. */
  failOnUpdate = false;

  /** A cancellation the calendar refuses — the booking must survive it untouched. */
  failOnCancel = false;

  /** An unreachable calendar, which must never be rendered as an empty month. */
  failOnBusy = false;

  readonly events = new Map<EventId, { mailbox: string; draft: CalendarEventDraft }>();

  readonly cancelled: EventId[] = [];

  /**
   * Every cancellation with the comment it carried, in order.
   *
   * The comment is the only part of a cancellation the candidate ever reads — the
   * product sends no mail, so Microsoft's notice is the whole message (07 §12.56) — and
   * a hiring manager's reason rides in it. A stub that recorded only the id could not
   * tell a reason that reached the candidate from one that was silently dropped.
   */
  readonly cancellations: Array<{ id: EventId; mailbox: string; comment?: string }> = [];

  /** Every move, in order, so a suite can assert the mailbox and the times it got. */
  readonly updated: Array<{ id: EventId; mailbox: string; change: CalendarEventChange }> = [];

  private sequence = 0;

  async resolveMailbox(email: string): Promise<MailboxRef | null> {
    const address = email.toLowerCase();
    if (this.withoutMailbox.has(address)) return null;
    return { address, displayName: null };
  }

  async workingHours(): Promise<WorkingHours> {
    return this.workingHoursSpec;
  }

  /**
   * The blocks a test declared, plus the interviews this stub has itself created. A
   * real calendar does not distinguish the two, and one that forgot its own events
   * would let a suite pass while the product double-booked.
   */
  async busy(mailbox: MailboxRef, fromUtc?: Date, toUtc?: Date): Promise<Interval[]> {
    if (this.failOnBusy) throw new Error('stub: free/busy is unreachable');

    const booked = [...this.events.values()]
      .filter(({ mailbox: address }) => address === mailbox.address)
      .map(({ draft }) => ({ startUtc: draft.startUtc, endUtc: draft.endUtc }));

    const all = [...(this.busyBlocks.get(mailbox.address) ?? []), ...booked];
    if (!fromUtc || !toUtc) return all;
    return all.filter((block) => block.startUtc < toUtc && fromUtc < block.endUtc);
  }

  async isFree(mailbox: MailboxRef, startUtc: Date, endUtc: Date): Promise<boolean> {
    // Half-open, so a slot may begin exactly when a block ends.
    return (await this.busy(mailbox, startUtc, endUtc)).length === 0;
  }

  async createEvent(mailbox: MailboxRef, draft: CalendarEventDraft): Promise<EventId> {
    if (this.failOnCreate) throw new Error('stub: event creation failed');
    this.sequence += 1;
    const id = `stub-event-${this.sequence}`;
    this.events.set(id, { mailbox: mailbox.address, draft });
    return id;
  }

  /**
   * In place: same id, same body, same mailbox, new times. The stored draft moves with
   * it, so the slot the interview left reads as free on the next availability call and
   * the one it took reads as busy — which is what makes a second reschedule behave.
   */
  async updateEvent(
    mailbox: MailboxRef,
    eventId: EventId,
    change: CalendarEventChange,
  ): Promise<void> {
    if (this.failOnUpdate) throw new Error('stub: the calendar refused the move');
    this.updated.push({ id: eventId, mailbox: mailbox.address, change });

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
  }

  /**
   * Idempotent, like the real one: cancelling an event that is already gone is a
   * success, which is what lets a caller retry after a database failure without a
   * compensating step (07 Alt flow).
   */
  async cancelEvent(mailbox: MailboxRef, eventId: EventId, comment?: string): Promise<void> {
    if (this.failOnCancel) throw new Error('stub: cancellation failed');
    this.cancelled.push(eventId);
    this.cancellations.push({ id: eventId, mailbox: mailbox.address, comment });
    this.events.delete(eventId);
  }

  /** Marks an interval busy for an address, as a test precondition. */
  block(address: string, startUtc: Date, endUtc: Date): void {
    const blocks = this.busyBlocks.get(address) ?? [];
    blocks.push({ startUtc, endUtc });
    this.busyBlocks.set(address, blocks);
  }

  reset(): void {
    this.withoutMailbox.clear();
    this.busyBlocks.clear();
    this.workingHoursSpec = {
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00',
      timeZone: 'UTC',
    };
    this.failOnCreate = false;
    this.failOnUpdate = false;
    this.failOnCancel = false;
    this.failOnBusy = false;
    this.events.clear();
    this.cancelled.length = 0;
    this.cancellations.length = 0;
    this.updated.length = 0;
    this.sequence = 0;
  }
}
