import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  HIRING_MESSAGES,
  canBeInterviewer,
  generateVacancySlug,
  validateVacancy,
  type VacancyValidation,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CalendarProvider } from './calendar/calendar-provider';

export interface CreateVacancyDto {
  title?: string;
  description?: string | null;
  interviewerAccountId?: string;
  durationMinutes?: unknown;
}

export interface InterviewerOption {
  accountId: string;
  fullName: string;
  email: string;
  eligible: boolean;
  reason: 'no_mailbox' | null;
}

/** How many times a slug collision is retried before the write is allowed to fail. */
const SLUG_ATTEMPTS = 5;

@Injectable()
export class VacanciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarProvider,
  ) {}

  /**
   * Every member who *may* be assigned, eligible or not. Ineligible entries are
   * returned rather than filtered out, because a missing name is indistinguishable
   * from a bug — the picker disables them and shows the reason (01 §02.6).
   */
  async interviewers(organizationId: string): Promise<InterviewerOption[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId, status: 'active' },
      include: { account: true },
      orderBy: { joinedAt: 'asc' },
    });

    const eligibleByRole = memberships.filter((m) => canBeInterviewer(m.role));

    return Promise.all(
      eligibleByRole.map(async (membership) => {
        const mailbox = await this.resolveAndCache(membership.accountId, membership.account.email);
        return {
          accountId: membership.accountId,
          fullName: `${membership.account.firstName} ${membership.account.lastName}`,
          email: membership.account.email,
          eligible: mailbox !== null,
          reason: mailbox === null ? ('no_mailbox' as const) : null,
        };
      }),
    );
  }

  async list(organizationId: string) {
    const vacancies = await this.prisma.vacancy.findMany({
      where: { organizationId },
      include: {
        interviewer: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Open first, then newest (01 §05.16). Done here rather than in the query because
    // `status` is a string column, and "closed" sorts before "open" alphabetically —
    // the exact opposite of the order the spec asks for.
    const ordered = [
      ...vacancies.filter((v) => v.status === 'open'),
      ...vacancies.filter((v) => v.status !== 'open'),
    ];

    const scheduled = await this.prisma.application.groupBy({
      by: ['vacancyId'],
      where: { organizationId, status: 'scheduled' },
      _count: { _all: true },
    });
    const scheduledByVacancy = new Map(scheduled.map((row) => [row.vacancyId, row._count._all]));

    return ordered.map((vacancy) => this.present(vacancy, scheduledByVacancy.get(vacancy.id) ?? 0));
  }

  async get(organizationId: string, vacancyId: string) {
    const vacancy = await this.prisma.vacancy.findFirst({
      // Scoped by the session's organization, never by the path alone.
      where: { id: vacancyId, organizationId },
      include: {
        interviewer: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { applications: true } },
      },
    });
    if (!vacancy) throw new NotFoundException();

    const scheduledCount = await this.prisma.application.count({
      where: { vacancyId: vacancy.id, status: 'scheduled' },
    });

    return this.present(vacancy, scheduledCount);
  }

  async create(organizationId: string, dto: CreateVacancyDto) {
    const validation = validateVacancy({
      title: dto.title ?? '',
      description: dto.description,
      interviewerAccountId: dto.interviewerAccountId ?? '',
      durationMinutes: dto.durationMinutes,
    });
    if (!validation.valid) throw this.validationError(validation);

    const { title, description, interviewerAccountId, durationMinutes } = validation.value;

    await this.assertAssignable(organizationId, interviewerAccountId);

    const vacancy = await this.insertWithUniqueSlug(() => ({
      organizationId,
      title,
      description: description || null,
      interviewerAccountId,
      durationMinutes: durationMinutes!,
      status: 'open',
      publicSlug: generateVacancySlug(title),
    }));

    return this.get(organizationId, vacancy.id);
  }

  /**
   * Eligibility is a verified fact, re-resolved on every write (01 §02.7). The cached
   * `mailboxVerifiedAt` on the account is for the picker's benefit only; a stale one
   * never authorises an assignment.
   */
  private async assertAssignable(organizationId: string, accountId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: { accountId, organizationId, status: 'active' },
      include: { account: { select: { email: true } } },
    });

    if (!membership || !canBeInterviewer(membership.role)) {
      throw new UnprocessableEntityException({
        error: 'validation',
        fields: { interviewerAccountId: HIRING_MESSAGES.vacancy.interviewer.required },
      });
    }

    const mailbox = await this.resolveAndCache(accountId, membership.account.email);
    if (!mailbox) {
      throw new UnprocessableEntityException({
        error: 'interviewer_ineligible',
        message: HIRING_MESSAGES.vacancy.interviewer.ineligible,
      });
    }
  }

  private async resolveAndCache(accountId: string, email: string) {
    const mailbox = await this.calendar.resolveMailbox(email);
    await this.prisma.account.update({
      where: { id: accountId },
      data: { mailboxVerifiedAt: mailbox ? new Date() : null },
    });
    return mailbox;
  }

  /**
   * The unique index is the real guard, not the 72 bits of entropy: retrying on P2002
   * costs nothing and means a collision — however improbable — surfaces as a second
   * slug rather than as a failed creation.
   */
  private async insertWithUniqueSlug(data: () => Prisma.VacancyUncheckedCreateInput) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.vacancy.create({ data: data() });
      } catch (error) {
        const collision =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!collision || attempt >= SLUG_ATTEMPTS) throw error;
      }
    }
  }

  private validationError(validation: VacancyValidation): UnprocessableEntityException {
    return new UnprocessableEntityException({
      error: 'validation',
      fields: validation.errors,
    });
  }

  private present(
    vacancy: {
      id: string;
      title: string;
      description: string | null;
      status: string;
      durationMinutes: number;
      publicSlug: string;
      createdAt: Date;
      interviewer: { id: string; firstName: string; lastName: string };
      _count: { applications: number };
    },
    scheduledCount: number,
  ) {
    return {
      id: vacancy.id,
      title: vacancy.title,
      description: vacancy.description,
      status: vacancy.status,
      durationMinutes: vacancy.durationMinutes,
      publicSlug: vacancy.publicSlug,
      interviewer: {
        accountId: vacancy.interviewer.id,
        fullName: `${vacancy.interviewer.firstName} ${vacancy.interviewer.lastName}`,
      },
      // Categories arrive with the library in a later phase; the field is present so
      // the client renders the same shape throughout.
      categories: [] as Array<{ id: string; name: string }>,
      applicationCount: vacancy._count.applications,
      scheduledCount,
      createdAt: vacancy.createdAt.toISOString(),
    };
  }
}
