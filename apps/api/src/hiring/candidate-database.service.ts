import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  candidateFilterPlan,
  latestAssessment,
  matchesEveryCriterion,
  orderCandidatesByInterview,
  referencedFilterIds,
  resolveCandidateScope,
  type ApplicationStatus,
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

/** One row of the list: a **person**, with the application it speaks for beside them. */
export interface PresentedCandidate {
  id: string;
  fullName: string;
  email: string;
  applicationCount: number;
  /** Deduplicated across every vacancy they have applied to (03 §01.2). */
  categories: Array<{ id: string; name: string }>;
  /**
   * The one application the row draws a vacancy, a date and a status from — and, in
   * `mine`, the one the row's position was decided by (03 §08.44).
   *
   * In `all` it is the candidate's most recent application, whoever interviewed it. In
   * `mine` it is the **viewer's own** nearest upcoming interview, or their most recent
   * past one when they have nothing ahead. The name is `all`'s reading because that is
   * the scope that is asked for by default; §08.44 is the whole of the difference.
   */
  latestApplication: {
    id: string;
    vacancyTitle: string;
    startUtc: string;
    status: string;
  } | null;
}

/** One row as the query reads it: the candidate, and every application they hold. */
interface CandidateRecord {
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
}

/**
 * A candidate's whole history, latest interview first, whichever scope listed them.
 *
 * Unnarrowed on purpose: the scope decides which **people** are listed, not which of
 * their history is read, so the application count and the category chips say the same
 * thing on either tab.
 */
const ROW_APPLICATIONS = {
  applications: {
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
} satisfies Prisma.CandidateInclude;

/**
 * Most recently added first (03 §01.3); `id` keeps two candidates created in the same
 * millisecond in a stable order, so page 2 never repeats a row from page 1.
 */
const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'asc' },
] satisfies Prisma.CandidateOrderByWithRelationInput[];

/**
 * The board column an interview sits in until somebody moves it — which is what "still
 * in play" means on a list that has no column of its own (03 §08.42).
 *
 * A cancelled interview still counts. `isCancelled` says the interview did not take
 * place and deliberately nothing about the candidate's standing (07 §01.1), and an order
 * that read it would be making exactly the claim that flag refuses to make.
 */
const SCHEDULED: ApplicationStatus = 'scheduled';
const HAS_SCHEDULED: Prisma.CandidateWhereInput = {
  applications: { some: { status: SCHEDULED } },
};
/** Nobody's interview is still in play — including a candidate holding no application. */
const HAS_NO_SCHEDULED: Prisma.CandidateWhereInput = {
  applications: { none: { status: SCHEDULED } },
};

/** One more clause on a candidate query, without reaching into how it was built. */
const also = (
  where: Prisma.CandidateWhereInput,
  clause: Prisma.CandidateWhereInput,
): Prisma.CandidateWhereInput => ({ AND: [where, clause] });

/**
 * One page, in the applied scope's order, and — where the scope decided it — which
 * application each row speaks about (03 §08.44).
 *
 * The two travel together because in `mine` they come out of one pass, and separating
 * them is how a row would end up sorted by one interview and printed with another.
 */
interface Listed {
  rows: CandidateRecord[];
  speaksFor: ReadonlyMap<string, string>;
}

/** `all` chooses no application: the row takes its own latest, as it always has. */
const NONE_CHOSEN: ReadonlyMap<string, string> = new Map();

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
 *
 * The **order** splits along the same line, and for the same reason. The two scopes ask
 * different questions — *who do I know?* and *what is next for me?* — so they read in
 * different orders (03 §08.42), and neither is a column this table holds. `all` sorts on
 * a predicate over a relation, which Prisma will filter by and will not order by, so its
 * page is cut across two queries over disjoint sets rather than taken from one over a
 * computed column. `mine` needs a correlated per-candidate minimum over the *viewer's
 * own* applications, which Prisma cannot state at all — the same shape of problem as the
 * criteria rollup, answered the same way, with a second round trip and the rule itself
 * kept in `@devscribed/validation` where both sides read it.
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

    // One instant for the whole request, so every row of one response is ordered against
    // the same clock. Across two requests it moves, and an interview that ends between
    // page 1 and page 2 changes group — which is the same thing a candidate created
    // between them does, and no more fixable (03 §08.43).
    const now = new Date();

    const [total, scopeCounts, listed] = await Promise.all([
      this.prisma.candidate.count({ where: { organizationId } }),
      this.scopeCounts(organizationId, plan, assessed, viewer),
      scope === 'mine'
        ? this.byOwnNextInterview(organizationId, plan, where, viewer.accountId, now)
        : this.scheduledFirst(plan, where),
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
      candidates: listed.rows.map((candidate) =>
        this.present(candidate, listed.speaksFor.get(candidate.id)),
      ),
    };
  }

  /**
   * The page in `all`'s order: everyone with a `scheduled` application, newest added
   * first, then everyone without one, newest added first (03 §08.42).
   *
   * *Who do I know?* is answered best by the people still in play, and "still in play" is
   * a predicate over a relation. Prisma will filter by one and will not order by one, so
   * the two groups are queried separately and the page's slice is cut across the join
   * between them — one extra `count` to know where that join falls.
   *
   * The database still takes the slice, which is what makes this cheap and what keeps the
   * order true across a page boundary: neither group is read to find out where the next
   * page starts.
   */
  private async scheduledFirst(
    plan: CandidateFilterPlan,
    where: Prisma.CandidateWhereInput,
  ): Promise<Listed> {
    const skip = (plan.page - 1) * plan.pageSize;
    const inPlay = also(where, HAS_SCHEDULED);

    const scheduled = await this.prisma.candidate.count({ where: inPlay });

    const take = Math.min(plan.pageSize, Math.max(0, scheduled - skip));
    const head =
      take === 0
        ? []
        : await this.prisma.candidate.findMany({
            where: inPlay,
            orderBy: NEWEST_FIRST,
            skip,
            take,
            include: ROW_APPLICATIONS,
          });
    if (head.length === plan.pageSize) return { rows: head, speaksFor: NONE_CHOSEN };

    const tail = await this.prisma.candidate.findMany({
      where: also(where, HAS_NO_SCHEDULED),
      orderBy: NEWEST_FIRST,
      // Whatever the first group did not answer for. Negative before the clamp exactly
      // when this page began inside the first group, where the second one starts at its top.
      skip: Math.max(0, skip - scheduled),
      take: plan.pageSize - head.length,
      include: ROW_APPLICATIONS,
    });

    return { rows: [...head, ...tail], speaksFor: NONE_CHOSEN };
  }

  /**
   * The page in `mine`'s order: the nearest upcoming interview of the viewer's own on
   * top, then everyone else by their most recent past one (03 §06.28, §08.42).
   *
   * There is no query for this. It is a per-candidate minimum over a *filtered* set of
   * their applications — the ones the viewer holds — and Prisma has no correlated
   * subquery to state it with. So the viewer's own applications are read and folded, the
   * same second round trip the criteria rollup already makes for the same reason, and
   * bounded by the same thing that let My interviews go unpaginated at all: one person's
   * own calendar.
   *
   * The fold answers both halves at once — the order, and which interview each row
   * speaks about — because they are one fact (03 §08.44).
   *
   * A cancelled interview still places a row, which is what the old screen did: it listed
   * cancelled interviews in whichever group they fell into and marked them, rather than
   * hiding an appointment somebody may still have in their calendar.
   */
  private async byOwnNextInterview(
    organizationId: string,
    plan: CandidateFilterPlan,
    where: Prisma.CandidateWhereInput,
    viewerAccountId: string,
    now: Date,
  ): Promise<Listed> {
    const own = await this.prisma.application.findMany({
      where: {
        organizationId,
        vacancy: { interviewerAccountId: viewerAccountId },
        // The same people the list is showing, so the order is computed over exactly the
        // rows it will order — a filter narrows this alongside everything else.
        candidate: where,
      },
      // Only a tiebreak: the fold is what orders the list. Sorting here as well keeps
      // two interviews booked at the same instant in one order between requests.
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      select: { id: true, candidateId: true, start: true, end: true },
    });

    const order = orderCandidatesByInterview(own, now);
    const page = order.slice((plan.page - 1) * plan.pageSize, plan.page * plan.pageSize);

    const rows = await this.prisma.candidate.findMany({
      where: { id: { in: page.map((entry) => entry.candidateId) } },
      include: ROW_APPLICATIONS,
    });

    // `in` answers in the database's order, not in the one asked for, so the page is
    // rebuilt against the fold rather than against what came back.
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      rows: page.flatMap((entry) => {
        const row = byId.get(entry.candidateId);
        return row ? [row] : [];
      }),
      speaksFor: new Map(page.map((entry) => [entry.candidateId, entry.applicationId])),
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

  /**
   * One row. `speaksFor` names the application the scope's order placed it by, and is
   * absent in `all`, where the row takes the candidate's own most recent one.
   *
   * The lookup covers one thing the fold cannot: an application it listed and that was
   * gone by the time the row was read. A row with a date from the wrong interview would
   * be the exact disagreement §08.44 rules out; a row with no date is merely thin.
   */
  private present(candidate: CandidateRecord, speaksFor?: string): PresentedCandidate {
    const categories = new Map<string, { id: string; name: string }>();
    for (const application of candidate.applications) {
      for (const assignment of application.vacancy.categories) {
        categories.set(assignment.category.id, assignment.category);
      }
    }

    // Applications arrive latest interview first, so `all`'s headline is simply the first.
    const headline = speaksFor
      ? candidate.applications.find((application) => application.id === speaksFor)
      : candidate.applications[0];

    return {
      id: candidate.id,
      // The candidate's current name, which the latest booking may have corrected —
      // `Application.submittedName` is the frozen one and belongs to the application.
      fullName: `${candidate.firstName} ${candidate.lastName}`,
      email: candidate.email,
      // Their whole history on either tab: the scope narrows who is listed, not what is
      // read about them.
      applicationCount: candidate.applications.length,
      categories: [...categories.values()],
      latestApplication: headline
        ? {
            id: headline.id,
            vacancyTitle: headline.vacancy.title,
            startUtc: headline.start.toISOString(),
            status: headline.status,
          }
        : null,
    };
  }
}
