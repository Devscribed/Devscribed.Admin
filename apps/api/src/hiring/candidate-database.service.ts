import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  candidateFilterPlan,
  latestAssessment,
  matchesEveryCriterion,
  referencedFilterIds,
  resolveCandidateScope,
  type CandidateAssessment,
  type CandidateFilterLibrary,
  type CandidateFilterPlan,
  type CandidateQueryParams,
  type CandidateScope,
  type FilterCriterion,
} from '@devscribed/validation';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ViewerTimeZoneService } from './viewer-time-zone.service';

/** One row of the list: a **person**, with their latest application beside them. */
export interface PresentedCandidate {
  id: string;
  fullName: string;
  email: string;
  applicationCount: number;
  /** Deduplicated across every vacancy they have applied to (03 §01.2). */
  categories: Array<{ id: string; name: string }>;
  latestApplication: {
    id: string;
    vacancyTitle: string;
    startUtc: string;
    status: string;
  } | null;
}

/**
 * How many candidates each scope holds **under the filters already applied** — the
 * numbers the design puts inside the tab labels (03 §08.38, §08.41).
 *
 * `all` is absent for a caller who may not see it. Not merely hidden by the screen: an
 * interviewer who could read the org-wide count under an arbitrary filter would have the
 * database's contents one binary search at a time, which is the thing the 404 exists to
 * prevent.
 */
export interface CandidateScopeCounts {
  all?: number;
  mine: number;
}

export interface CandidateDatabasePage {
  /** Unfiltered **and org-wide**, so the count line can say "12 of 128" (03 §05.20). */
  total: number;
  matched: number;
  page: number;
  pageSize: number;
  /** Whether the caller may see the whole database, which is what draws the tab strip. */
  canSeeAll: boolean;
  /** What was **applied**, which may differ from what was asked (03 §08.40). */
  scope: CandidateScope;
  scopeCounts: CandidateScopeCounts;
  viewerTimeZone: string;
  candidates: PresentedCandidate[];
}

/**
 * The candidate database (spec 03) — everyone who has ever booked an interview, in one
 * filterable list.
 *
 * Rows are **candidates, not applications**: the screen exists to find people to
 * contact, so a person who applied to three vacancies is one row and every filter is
 * evaluated across all three of their applications.
 *
 * Two halves, split by what SQL can express. Search, positions and categories are
 * indexed comparisons and run in the query. The criteria rollup does not: "the
 * assessment from their most recent interview" (03 §04.16) is a correlated per-candidate
 * maximum that Prisma has no way to state, and writing it as raw SQL would put a second
 * copy of the comparison rules beside the one in `@devscribed/validation` that the
 * criterion dialog and the filter row already share. So the assessments for the criteria
 * a query names are read, rolled up per candidate, and the surviving ids restrict the
 * query — one extra round trip, bounded by one row per application per criterion named.
 *
 * It also answers what used to be a screen of its own. **My interviews is the `mine`
 * scope** (03 §08.35): one more `some` clause, over the vacancies the viewer interviews
 * for, applied on the server and never negotiable from the query string.
 */
@Injectable()
export class CandidateDatabaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewerTimeZone: ViewerTimeZoneService,
  ) {}

  async list(
    organizationId: string,
    params: CandidateQueryParams,
    viewer: { accountId: string; canSeeAll: boolean },
  ): Promise<CandidateDatabasePage> {
    const library = await this.library(organizationId, params);

    // Everything that can be wrong is refused before a row is read, and all of it as one
    // `422 invalid_filter`: an id from another organization, an operator the criterion's
    // type does not answer, a scale value from a different scale (03 §Validation).
    const planned = candidateFilterPlan(params, library);
    if (!planned.valid) {
      throw new UnprocessableEntityException({
        error: planned.error,
        message: planned.message,
      });
    }
    const plan = planned.plan;

    // Asked is a preference; applied is the guard's finding. They differ exactly when
    // somebody hand-crafts `?scope=all` without the right to it, and the response then
    // reports what was applied rather than what was requested.
    const scope = resolveCandidateScope(params.scope, viewer.canSeeAll);

    const assessed = await this.candidateIdsMatchingCriteria(organizationId, plan, library);
    const where = this.where(organizationId, plan, assessed, scope, viewer.accountId);

    const [total, scopeCounts, rows] = await Promise.all([
      this.prisma.candidate.count({ where: { organizationId } }),
      this.scopeCounts(organizationId, plan, assessed, viewer),
      this.prisma.candidate.findMany({
        where,
        // Most recently added first (03 §01.3); `id` keeps two candidates created in the
        // same millisecond in a stable order, so page 2 never repeats a row from page 1.
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (plan.page - 1) * plan.pageSize,
        take: plan.pageSize,
        include: {
          applications: {
            // Latest interview first, so the row's headline application is `[0]`.
            orderBy: [{ start: 'desc' }, { id: 'asc' }],
            select: {
              id: true,
              status: true,
              start: true,
              vacancy: {
                select: {
                  title: true,
                  categories: { select: { category: { select: { id: true, name: true } } } },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      total,
      // The applied scope's own count, so `matched` and the lit tab never disagree.
      matched: scope === 'mine' ? scopeCounts.mine : (scopeCounts.all ?? 0),
      page: plan.page,
      pageSize: plan.pageSize,
      canSeeAll: viewer.canSeeAll,
      scope,
      scopeCounts,
      viewerTimeZone: await this.viewerTimeZone.forViewer(
        viewer.accountId,
        // In `mine` the viewer is an interviewer by definition, so their own mailbox is
        // the right fallback — which is what My interviews used, and what an interviewer
        // with no `Account.timezone` would otherwise have lost in the move.
        scope === 'mine'
          ? await this.ownEmail(viewer.accountId)
          : await this.firstInterviewerEmail(organizationId),
      ),
      candidates: rows.map((candidate) => this.present(candidate)),
    };
  }

  /**
   * How many candidates each scope the caller may see holds, under the filters already
   * applied — the numbers the tab labels carry, and the reason switching tabs never
   * needs a second request to find out what it would show.
   *
   * One count for an interviewer, two for a manager. `all` is not computed for a caller
   * who may not see it, so the leak is closed by never asking the question rather than
   * by dropping the answer.
   */
  private async scopeCounts(
    organizationId: string,
    plan: CandidateFilterPlan,
    assessed: string[] | null,
    viewer: { accountId: string; canSeeAll: boolean },
  ): Promise<CandidateScopeCounts> {
    const count = (scope: CandidateScope) =>
      this.prisma.candidate.count({
        where: this.where(organizationId, plan, assessed, scope, viewer.accountId),
      });

    const [mine, all] = await Promise.all([
      count('mine'),
      viewer.canSeeAll ? count('all') : Promise.resolve(undefined),
    ]);

    return all === undefined ? { mine } : { all, mine };
  }

  /**
   * What this organization actually holds, restricted to what the query names.
   *
   * An id that comes back missing is refused rather than dropped, which is the whole
   * reason this lookup exists: a filter that silently ignored one clause would return
   * more people than the chips on screen claim to allow (03 §Validation.2).
   */
  private async library(
    organizationId: string,
    params: CandidateQueryParams,
  ): Promise<CandidateFilterLibrary> {
    const referenced = referencedFilterIds(params);

    const [vacancies, categories, criteria] = await Promise.all([
      referenced.vacancyIds.length === 0
        ? []
        : this.prisma.vacancy.findMany({
            where: { organizationId, id: { in: referenced.vacancyIds } },
            select: { id: true },
          }),
      referenced.categoryIds.length === 0
        ? []
        : this.prisma.category.findMany({
            where: { organizationId, id: { in: referenced.categoryIds } },
            select: { id: true },
          }),
      referenced.criterionIds.length === 0
        ? []
        : this.prisma.criterion.findMany({
            // Archived included: history stays filterable, which is the difference
            // between archiving a criterion and deleting one (03 §04.19).
            where: { organizationId, id: { in: referenced.criterionIds } },
            select: { id: true, type: true, values: { select: { id: true, position: true } } },
          }),
    ]);

    return {
      vacancyIds: new Set(vacancies.map((vacancy) => vacancy.id)),
      categoryIds: new Set(categories.map((category) => category.id)),
      criteria: new Map<string, FilterCriterion>(
        criteria.map((criterion): [string, FilterCriterion] => [
          criterion.id,
          {
            id: criterion.id,
            type: criterion.type as FilterCriterion['type'],
            values: criterion.values,
          },
        ]),
      ),
    };
  }

  /**
   * The candidates every criterion row holds for, or `null` when none was asked.
   *
   * `null` rather than "every candidate": an empty list is a real answer — nobody
   * matches — and restricting the query to an empty set of ids is exactly right for it.
   *
   * The rollup is what makes the headline query work across vacancies: English assessed
   * during a .NET interview counts when filtering React applicants, because the
   * assessments are gathered per candidate and not per application (03 §04.17). A
   * candidate with no assessment for one of the criteria never enters the map, so they
   * match no operator at all — absence is not a value (03 §04.18).
   */
  private async candidateIdsMatchingCriteria(
    organizationId: string,
    plan: CandidateFilterPlan,
    library: CandidateFilterLibrary,
  ): Promise<string[] | null> {
    if (plan.criteria.length === 0) return null;

    const rows = await this.prisma.applicationCriterion.findMany({
      where: {
        criterionId: { in: plan.criteria.map((filter) => filter.criterionId) },
        application: { organizationId },
      },
      select: {
        criterionId: true,
        valueId: true,
        valueBool: true,
        valueNumber: true,
        valueText: true,
        updatedAt: true,
        // The interview's start, not the assessment's own timestamp: "most recent
        // interview" is a fact about when the candidate was seen, and notes edited a
        // month later do not make an older interview newer.
        application: { select: { candidateId: true, start: true } },
      },
    });

    const byCandidate = new Map<string, Map<string, CandidateAssessment[]>>();
    for (const row of rows) {
      const candidate = byCandidate.get(row.application.candidateId) ?? new Map();
      const assessments = candidate.get(row.criterionId) ?? [];
      assessments.push({
        interviewStart: row.application.start,
        updatedAt: row.updatedAt,
        valueId: row.valueId,
        valueBool: row.valueBool,
        valueNumber: row.valueNumber,
        valueText: row.valueText,
      });
      candidate.set(row.criterionId, assessments);
      byCandidate.set(row.application.candidateId, candidate);
    }

    const matching: string[] = [];
    for (const [candidateId, assessments] of byCandidate) {
      const rolledUp = new Map<string, CandidateAssessment>();
      for (const [criterionId, recorded] of assessments) {
        const latest = latestAssessment(recorded);
        if (latest) rolledUp.set(criterionId, latest);
      }
      if (matchesEveryCriterion(plan.criteria, library.criteria, rolledUp)) {
        matching.push(candidateId);
      }
    }

    return matching;
  }

  /**
   * The plan as a query. Each application clause is its own `some`, which is what makes
   * the filters AND across kinds while each one is satisfied by *any* application: a
   * candidate whose React application and whose Senior-tagged application are two
   * different applications still matches `React AND Senior` (03 §03.12).
   */
  private where(
    organizationId: string,
    plan: CandidateFilterPlan,
    assessed: string[] | null,
    scope: CandidateScope,
    viewerAccountId: string,
  ): Prisma.CandidateWhereInput {
    const and: Prisma.CandidateWhereInput[] = plan.applicationClauses.map((clause) => ({
      applications: {
        some: {
          ...(clause.vacancyIds ? { vacancyId: { in: clause.vacancyIds } } : {}),
          ...(clause.categoryIds
            ? { vacancy: { categories: { some: { categoryId: { in: clause.categoryIds } } } } }
            : {}),
        },
      },
    }));

    // The scope is one more clause of the same shape, and that is the whole of it: a
    // candidate is mine when **any** of their applications is to a vacancy I interview
    // for, exactly as they are React when any of their applications is to a React one.
    // Their other interviewers' applications still count towards every other filter —
    // this narrows which people are listed, not which of their history is read.
    if (scope === 'mine') {
      and.push({
        applications: { some: { vacancy: { interviewerAccountId: viewerAccountId } } },
      });
    }

    /**
     * Name and email only (03 §02.7). Every whitespace-separated term must match one of
     * the three columns, so `jane doe` finds a candidate whose first and last names are
     * in two columns — which is the only way a full name can be searched without a
     * concatenated index. Terms are parameters, never fragments of SQL.
     */
    for (const term of plan.search.split(/\s+/).filter(Boolean)) {
      and.push({
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    return {
      organizationId,
      ...(assessed ? { id: { in: assessed } } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  /**
   * The zone a member with none of their own reads times in: the organization's
   * first-created interviewer's mailbox (03 §01.4). It is one query rather than a
   * per-row one because the zone is named once, above the table, not on every line.
   */
  private async firstInterviewerEmail(organizationId: string): Promise<string | undefined> {
    const first = await this.prisma.vacancy.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: { interviewer: { select: { email: true } } },
    });
    return first?.interviewer.email;
  }

  /** The viewer's own mailbox — the fallback that fits the `mine` scope (03 §01.4). */
  private async ownEmail(accountId: string): Promise<string | undefined> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true },
    });
    return account?.email;
  }

  private present(candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    applications: Array<{
      id: string;
      status: string;
      start: Date;
      vacancy: { title: string; categories: Array<{ category: { id: string; name: string } }> };
    }>;
  }): PresentedCandidate {
    const categories = new Map<string, { id: string; name: string }>();
    for (const application of candidate.applications) {
      for (const assignment of application.vacancy.categories) {
        categories.set(assignment.category.id, assignment.category);
      }
    }

    const [latest] = candidate.applications;

    return {
      id: candidate.id,
      // The candidate's current name, which the latest booking may have corrected —
      // `Application.submittedName` is the frozen one and belongs to the application.
      fullName: `${candidate.firstName} ${candidate.lastName}`,
      email: candidate.email,
      applicationCount: candidate.applications.length,
      categories: [...categories.values()],
      latestApplication: latest
        ? {
            id: latest.id,
            vacancyTitle: latest.vacancy.title,
            startUtc: latest.start.toISOString(),
            status: latest.status,
          }
        : null,
    };
  }
}
