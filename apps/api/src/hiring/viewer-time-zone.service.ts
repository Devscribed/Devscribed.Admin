import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CalendarProvider } from './calendar/calendar-provider';

/** The zone a screen falls back to when nothing better can be established. */
const FALLBACK_TIME_ZONE = 'UTC';

/**
 * The zone every internal screen renders an interview in: the **viewing member's** own
 * (`Account.timezone`), falling back to the interviewer's mailbox zone when they have
 * none (04 §03.11, 05 §05.16).
 *
 * Shared by the candidate card and the board rather than written twice. The two screens
 * show the same interviews to the same people, and a card that read 14:00 on one and
 * 16:00 on the other would be a bug nobody could reproduce on their own machine.
 *
 * The fallback costs two calendar calls, so it runs only for an account with no zone of
 * its own — which today means a member who never went through signup. Any calendar
 * failure resolves to UTC rather than propagating: these are pages someone opens during
 * a live call, and they must not fail to load because Graph is having a bad morning.
 */
@Injectable()
export class ViewerTimeZoneService {
  private readonly logger = new Logger(ViewerTimeZoneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarProvider,
  ) {}

  async forViewer(viewerAccountId: string, interviewerEmail: string | undefined): Promise<string> {
    const account = await this.prisma.account.findUnique({
      where: { id: viewerAccountId },
      select: { timezone: true },
    });
    if (account?.timezone) return account.timezone;
    if (!interviewerEmail) return FALLBACK_TIME_ZONE;

    try {
      const mailbox = await this.calendar.resolveMailbox(interviewerEmail);
      if (!mailbox) return FALLBACK_TIME_ZONE;
      return (await this.calendar.workingHours(mailbox)).timeZone;
    } catch (error) {
      this.logger.warn(`Could not read a mailbox zone for ${interviewerEmail}: ${String(error)}`);
      return FALLBACK_TIME_ZONE;
    }
  }
}
