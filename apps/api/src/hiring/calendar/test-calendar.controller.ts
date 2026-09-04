import { Controller, Get, NotFoundException } from '@nestjs/common';
import { CalendarProvider } from './calendar-provider';
import { FakeCalendarProvider } from './fake-calendar.provider';

/**
 * Lets an E2E run read the invite the way an interviewer would, without a mailbox.
 *
 * The candidate card is reachable from exactly one place until the candidate database
 * lands: the deep link in the calendar event's body ([04 §01.7](../../../../../specs/hiring/04-candidate-card.md)).
 * A test that fabricated that URL from ids it had obtained some other way would be
 * testing a link the product never sends.
 *
 * Fenced exactly like `/api/test/mail`: it only answers while the fake calendar is in
 * use, and never when `NODE_ENV` is production. A real deployment runs Graph, so both
 * gates are shut — and the fake in production is already refused at boot.
 */
@Controller('api/test/calendar')
export class TestCalendarController {
  constructor(private readonly calendar: CalendarProvider) {}

  @Get('latest')
  latest() {
    if (
      process.env.NODE_ENV === 'production' ||
      !(this.calendar instanceof FakeCalendarProvider)
    ) {
      throw new NotFoundException();
    }

    const events = this.calendar.created();
    const event = events[events.length - 1];
    if (!event) throw new NotFoundException('No event has been created');

    return {
      id: event.id,
      mailbox: event.mailbox,
      subject: event.draft.subject,
      body: event.draft.body,
      startUtc: event.draft.startUtc,
      attendee: event.draft.attendee,
    };
  }
}
