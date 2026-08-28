import { Injectable, NotFoundException } from '@nestjs/common';
import { partitionInterviews } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { ViewerTimeZoneService } from './viewer-time-zone.service';

/** One row: an **application**, because that is what an interview is (03 §06.26). */
export interface PresentedInterview {
  applicationId: string;
  candidateId: string;
  /** The candidate's current name, which the latest booking may have corrected. */
  candidateName: string;
  vacancyTitle: string;
  startUtc: string;
  /**
   * The booked end, so the row's reschedule dialog can state the interview's own length
   * rather than the vacancy's current one (07 §13.61).
   */
  endUtc: string;
  status: string;
  /**
   * **The interview did not take place** — and nothing about the candidate's standing
   * (07 §01.1). It is what removes the row's two actions, since a cancelled interview is
   * no more actionable than a past one.
   */
  isCancelled: boolean;
}

export interface MyInterviews {
  viewerTimeZone: string;
  upcoming: PresentedInterview[];
  past: PresentedInterview[];
}

/**
 * My interviews (spec 03 §06) — the whole of hiring for a `user` who interviews.
 *
 * It is **application-grain**, unlike the candidate database it shares a spec with,
 * because it answers "what interviews do I have?" rather than "who do I know?". No
 * search, no filters, no pagination: it is a short list by construction, bounded by one
 * person's own calendar.
 *
 * Its access rule is the one place in the product where a permission is decided by
 * **assignment rather than role** (03 §06.31), and a member with no assignment gets the
 * not-found state rather than an empty list — a screen that renders "no interviews" for
 * everybody advertises its existence to people it will never serve (03 §07.34).
 */
@Injectable()
export class MyInterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewerTimeZone: ViewerTimeZoneService,
  ) {}

  async list(organizationId: string, viewerAccountId: string): Promise<MyInterviews> {
    // The assignment, not the applications. Somebody who holds a vacancy nobody has
    // booked yet has the screen and an empty upcoming group; somebody who holds none
    // has no screen at all, and those are two different answers.
    const assigned = await this.prisma.vacancy.count({
      where: { organizationId, interviewerAccountId: viewerAccountId },
    });
    if (assigned === 0) throw new NotFoundException();

    const applications = await this.prisma.application.findMany({
      where: { organizationId, vacancy: { interviewerAccountId: viewerAccountId } },
      // Only a tiebreak — the split below is what orders the two groups. Sorting here
      // as well keeps two interviews booked at the same instant in one stable order.
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        start: true,
        end: true,
        isCancelled: true,
        candidate: { select: { id: true, firstName: true, lastName: true } },
        vacancy: { select: { title: true } },
      },
    });

    const { upcoming, past } = partitionInterviews(applications, new Date());

    return {
      // The viewer is an interviewer by definition here, so their own mailbox is the
      // right fallback when their account carries no zone of its own.
      viewerTimeZone: await this.viewerTimeZone.forViewer(
        viewerAccountId,
        await this.ownEmail(viewerAccountId),
      ),
      upcoming: upcoming.map(present),
      past: past.map(present),
    };
  }

  private async ownEmail(accountId: string): Promise<string | undefined> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true },
    });
    return account?.email;
  }
}

function present(application: {
  id: string;
  status: string;
  start: Date;
  end: Date;
  isCancelled: boolean;
  candidate: { id: string; firstName: string; lastName: string };
  vacancy: { title: string };
}): PresentedInterview {
  return {
    applicationId: application.id,
    candidateId: application.candidate.id,
    candidateName: `${application.candidate.firstName} ${application.candidate.lastName}`,
    vacancyTitle: application.vacancy.title,
    startUtc: application.start.toISOString(),
    endUtc: application.end.toISOString(),
    status: application.status,
    isCancelled: application.isCancelled,
  };
}
