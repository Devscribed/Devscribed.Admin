import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  HIRING_MESSAGES,
  canBeInterviewer,
  generateVacancySlug,
  isVacancyStatus,
  validateVacancy,
  validateVacancyPatch,
  type VacancyField,
  type VacancyPatchField,
  type VacancyStatus,
  type VacancyStatusFilter,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CalendarProvider } from './calendar/calendar-provider';
import { CategoriesService, type CategorySelection } from './categories.service';

export interface CreateVacancyDto extends CategorySelection {
  title?: string;
  description?: string | null;
  interviewerAccountId?: string;
  durationMinutes?: unknown;
}

/**
 * Any subset of the editable fields (01 §API PATCH). Every property is optional in the
 * PATCH sense — absent means "leave it alone", which is why the service tests for
 * `undefined` rather than for falsiness.
 */
export interface UpdateVacancyDto extends CategorySelection {
  title?: string;
  description?: string | null;
  interviewerAccountId?: string;
  durationMinutes?: unknown;
  status?: unknown;
}

export interface VacancyFilters {
  /** Title only, case-insensitive, server-side — the list is not paged (01 §05.16). */
  search?: string;
  status?: VacancyStatusFilter | string;
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
    private readonly categories: CategoriesService,
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

  /**
   * Search and the status filter run in the query, not in the browser: the list has no
   * page size, so filtering client-side would mean shipping every vacancy in the
   * organization to narrow it down to one (01 §05.16).
   *
   * Three numbers come back beside the rows, and they answer three different questions
   * (01 §07.19–21):
   *
   * - the rows are what the tab **and** the search select;
   * - `statusCounts` is what each tab would select **under the same search**, so a label
   *   never promises rows its own tab would not show;
   * - `total` is the organization's whole library, narrowed by nothing, because it is
   *   the only honest way to tell "you have no vacancies" apart from "this search found
   *   none". The candidate database keeps `total` for exactly the same reason
   *   (03 §05.20).
   */
  async list(organizationId: string, filters: VacancyFilters = {}) {
    const search = (filters.search ?? '').trim();
    // Anything but `open` or `closed` — including the list's own `all` — is no filter.
    const status = isVacancyStatus(filters.status) ? filters.status : null;

    // `React` must find `Senior React Engineer` — a title search that respected case
    // would be a search nobody can use.
    const matching = search
      ? { title: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [vacancies, byStatus, total] = await Promise.all([
      this.prisma.vacancy.findMany({
        where: { organizationId, ...(status ? { status } : {}), ...matching },
        include: {
          interviewer: { select: { id: true, firstName: true, lastName: true } },
          categories: { include: { category: { select: { id: true, name: true } } } },
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Grouped rather than counted twice: one round trip answers both tabs, and a
      // status this product does not have cannot appear in it.
      this.prisma.vacancy.groupBy({
        by: ['status'],
        where: { organizationId, ...matching },
        _count: { _all: true },
      }),
      this.prisma.vacancy.count({ where: { organizationId } }),
    ]);

    const counted = (value: VacancyStatus) =>
      byStatus.find((row) => row.status === value)?._count._all ?? 0;
    const statusCounts = {
      open: counted('open'),
      closed: counted('closed'),
      // Summed rather than counted a third time — the two statuses are the whole set.
      all: byStatus.reduce((sum, row) => sum + row._count._all, 0),
    };

    // Open first, then newest (01 §05.16). Done here rather than in the query because
    // `status` is a string column, and "closed" sorts before "open" alphabetically —
    // the exact opposite of the order the spec asks for.
    const ordered = [
      ...vacancies.filter((v) => v.status === 'open'),
      ...vacancies.filter((v) => v.status !== 'open'),
    ];

    const ids = ordered.map((vacancy) => vacancy.id);
    // Two counts of the same rows, both of which exclude a deleted candidate: the
    // `Candidates` column says how many people this vacancy has that anybody can still
    // open (03 §11.63). `_count.applications` on the row above is deliberately *not*
    // filtered — see `present`, where it decides whether the vacancy can be deleted.
    const [candidates, scheduled] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['vacancyId'],
        where: { organizationId, vacancyId: { in: ids }, candidate: { deletedAt: null } },
        _count: { _all: true },
      }),
      this.prisma.application.groupBy({
        by: ['vacancyId'],
        where: {
          organizationId,
          status: 'scheduled',
          vacancyId: { in: ids },
          candidate: { deletedAt: null },
        },
        _count: { _all: true },
      }),
    ]);
    const countBy = (rows: Array<{ vacancyId: string; _count: { _all: number } }>) =>
      new Map(rows.map((row) => [row.vacancyId, row._count._all]));
    const candidatesByVacancy = countBy(candidates);
    const scheduledByVacancy = countBy(scheduled);

    return {
      vacancies: ordered.map((vacancy) =>
        this.present(vacancy, {
          candidates: candidatesByVacancy.get(vacancy.id) ?? 0,
          scheduled: scheduledByVacancy.get(vacancy.id) ?? 0,
        }),
      ),
      statusCounts,
      total,
    };
  }

  async get(organizationId: string, vacancyId: string) {
    const vacancy = await this.prisma.vacancy.findFirst({
      // Scoped by the session's organization, never by the path alone.
      where: { id: vacancyId, organizationId },
      include: {
        interviewer: { select: { id: true, firstName: true, lastName: true } },
        categories: { include: { category: { select: { id: true, name: true } } } },
        _count: { select: { applications: true } },
      },
    });
    if (!vacancy) throw new NotFoundException();

    const [candidateCount, scheduledCount] = await Promise.all([
      this.prisma.application.count({
        where: { vacancyId: vacancy.id, candidate: { deletedAt: null } },
      }),
      this.prisma.application.count({
        where: { vacancyId: vacancy.id, status: 'scheduled', candidate: { deletedAt: null } },
      }),
    ]);

    return this.present(vacancy, { candidates: candidateCount, scheduled: scheduledCount });
  }

  async create(organizationId: string, dto: CreateVacancyDto) {
    const validation = validateVacancy({
      title: dto.title ?? '',
      description: dto.description,
      interviewerAccountId: dto.interviewerAccountId ?? '',
      durationMinutes: dto.durationMinutes,
    });
    if (!validation.valid) throw this.validationError(validation.errors);

    const { title, description, interviewerAccountId, durationMinutes } = validation.value;

    await this.assertAssignable(organizationId, interviewerAccountId);

    // Resolved before the vacancy exists, so a name that collides with the library is
    // refused — or resolved to the entry the member meant — before anything is written.
    const categoryIds = (await this.categories.resolveForVacancy(organizationId, dto)) ?? [];

    const vacancy = await this.insertWithUniqueSlug(() => ({
      organizationId,
      title,
      description: description || null,
      interviewerAccountId,
      durationMinutes: durationMinutes!,
      status: 'open',
      publicSlug: generateVacancySlug(title),
      // Assigned in the same statement as the vacancy: 06 §04.22 asks for the inline
      // category and the vacancy to arrive in one submit, and a second round trip is
      // one more place for half of that to land.
      categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
    }));

    return this.get(organizationId, vacancy.id);
  }

  /**
   * Editing, with the one rule that matters: **future bookings only** (01 §04.13).
   *
   * A new interviewer or a new length changes what the booking page offers from the
   * next request onward and nothing else. Interviews already scheduled keep their time,
   * their length, and their event — which stays in the original interviewer's mailbox,
   * because a Graph event cannot be moved between mailboxes and re-inviting a candidate
   * is not a side effect a dropdown may have.
   *
   * So this method writes to `Vacancy` alone. There is deliberately no application
   * fix-up here, and its absence is the requirement.
   */
  async update(organizationId: string, vacancyId: string, dto: UpdateVacancyDto) {
    const existing = await this.prisma.vacancy.findFirst({
      where: { id: vacancyId, organizationId },
      select: { id: true },
    });
    // 404 before validation: a caller guessing ids must not learn which of them exist
    // from the shape of the error.
    if (!existing) throw new NotFoundException();

    const validation = validateVacancyPatch(dto);
    if (!validation.valid) throw this.validationError(validation.errors);

    const { title, description, interviewerAccountId, durationMinutes, status } = validation.value;

    // Re-resolved here as well as at create: a mailbox that has since disappeared must
    // not be assignable just because it once was (01 §02.7).
    if (interviewerAccountId !== undefined) {
      await this.assertAssignable(organizationId, interviewerAccountId);
    }

    // `null` means the caller named neither key, which is "leave the assignments
    // alone" — distinct from an empty array, which clears them (01 §API PATCH).
    const categoryIds = await this.categories.resolveForVacancy(organizationId, dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.vacancy.update({
        where: { id: vacancyId },
        // `publicSlug` is absent on purpose — it is frozen at creation, so renaming a
        // vacancy leaves every link already sent working (01 §01.2).
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description: description || null } : {}),
          ...(interviewerAccountId !== undefined ? { interviewerAccountId } : {}),
          ...(durationMinutes !== undefined ? { durationMinutes } : {}),
          ...(status !== undefined ? { status } : {}),
        },
      });

      if (categoryIds) await this.categories.assign(tx, vacancyId, categoryIds);
    });

    return this.get(organizationId, vacancyId);
  }

  /**
   * Deletion is for vacancies nobody has applied to. One with applications is closed
   * instead: deleting it would take its interview notes, conclusions and criteria
   * assessments with it, and 04 treats that record as permanent (01 §03.11).
   *
   * **Every** application counts here, including one whose candidate has been deleted.
   * Removing a person hides their record; it does not destroy it, and a cascade that
   * took it away because nobody could see it any more would be a hard delete arrived at
   * sideways. The screen is told so by `deletable` rather than inferring it from the
   * candidate count, which is the smaller number.
   */
  async remove(organizationId: string, vacancyId: string) {
    const vacancy = await this.prisma.vacancy.findFirst({
      where: { id: vacancyId, organizationId },
      select: { id: true, _count: { select: { applications: true } } },
    });
    if (!vacancy) throw new NotFoundException();

    if (vacancy._count.applications > 0) {
      throw new ConflictException({
        error: 'has_applications',
        message: HIRING_MESSAGES.vacancy.deleteBlocked,
      });
    }

    await this.prisma.vacancy.delete({ where: { id: vacancyId } });
    return { success: true };
  }

  /**
   * How many `open` vacancies this member is the interviewer on.
   *
   * The cross-spec guard of 01 §06.17, kept here rather than in user-management: the
   * rule is hiring's, and removing a member who holds a live booking link would break
   * every one of those links silently. Closed vacancies do not count — their links
   * already explain themselves.
   */
  async openVacancyCount(organizationId: string, accountId: string): Promise<number> {
    return this.prisma.vacancy.count({
      where: { organizationId, interviewerAccountId: accountId, status: 'open' },
    });
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

  private validationError(
    fields: Partial<Record<VacancyField | VacancyPatchField, string>>,
  ): UnprocessableEntityException {
    return new UnprocessableEntityException({ error: 'validation', fields });
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
      categories: Array<{ category: { id: string; name: string } }>;
      _count: { applications: number };
    },
    counts: { candidates: number; scheduled: number },
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
      // Alphabetical, so the chips under a title read the same way on every screen —
      // the assignment rows carry no order of their own worth preserving.
      categories: vacancy.categories
        .map((assignment) => assignment.category)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
      // The `Candidates` column, which counts the people a member can still open: a
      // deleted candidate is not one of them (03 §11.63).
      applicationCount: counts.candidates,
      scheduledCount: counts.scheduled,
      /**
       * Whether `remove` will accept this vacancy — the server's own rule, shipped rather
       * than re-derived from the count beside it (01 §03.11).
       *
       * The two can disagree, and the case where they do is the reason this is a field.
       * A vacancy whose only applicants have been deleted shows **no** candidates and is
       * still not deletable, because their applications are still there holding notes,
       * conclusions and assessments — and deleting the vacancy would cascade all of it
       * away, which is the one thing hiring never does. Closing it is still the answer.
       */
      deletable: vacancy._count.applications === 0,
      createdAt: vacancy.createdAt.toISOString(),
    };
  }
}
