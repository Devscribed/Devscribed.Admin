import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  assessedValueLabel,
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

/**
 * One assessed criterion, rolled up to the candidate (03 §01.2, §04.16).
 *
 * The **value's label**, not its id: comparison is by position and reading is by name,
 * and this is the reading half. Built with `assessedValueLabel`, which the candidate
 * card's own chip uses, so `Yes` means the same thing on both screens.
 */
export interface PresentedAssessment {
  criterionId: string;
  name: string;
  value: string;
}

/** One row of the list: a **person**, with the application it speaks for beside them. */
export interface PresentedCandidate {
  id: string;
  fullName: string;
  email: string;
  applicationCount: number;
  /**
   * What this candidate has been **assessed as**, one entry per criterion, rolled up
   * across their whole history to their most recent interview that answered it
   * (03 §01.2, §04.16). Alphabetical by criterion, so a page of rows reads down a column
   * rather than in whatever order the assessments were written.
   *
   * It is what the row's chips draw, and it replaced the vacancy categories that used to
   * sit there: the categories are already the thing the *filter* is built out of, while
   * `English: B1` is what a recruiter scans a list of people for.
   */
  criteria: PresentedAssessment[];
  /**
   * How many assessments the row's **delete confirmation** is about (03 §11.62) — every
   * one ever recorded against them, not the one-per-criterion rollup above it.
   *
   * The two numbers answer different questions and are deliberately both here. `criteria`
   * says what is known about this person now; this says how much of the record goes with
   * them. It costs nothing: the fold that builds the chips has already read every row.
   */
  assessmentCount: number;
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
    /**
     * The **vacancy's assigned** interviewer, which is the one this screen means
     * everywhere else: it is what the Interviewer filter matches on and what the `mine`
     * scope is defined by (03 §09.48). The application's own frozen interviewer is a
     * different fact and belongs to the card, where the interview itself is the subject.
     */
    interviewer: { accountId: string; fullName: string };
    startUtc: string;
    status: string;
    /**
     * The interview did not take place — and nothing about the candidate's standing
     * (07 §01.1). The row draws it *instead of* the status badge, because a cancelled
     * interview has no stage to report, and it is what removes the row's two interview
     * actions.
     */
    isCancelled: boolean;
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
    isCancelled: boolean;
    vacancy: {
      title: string;
      interviewerAccountId: string;
      interviewer: { firstName: string; lastName: string };
    };
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
      isCancelled: true,
      vacancy: {
        select: {
          title: true,
          interviewerAccountId: true,
          interviewer: { select: { firstName: true, lastName: true } },
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
 * One candidate's assessments read twice: rolled up to a chip per criterion, and counted
 * whole. The rollup is what the row draws; the count is what the delete confirmation
 * states (03 §11.62), and it is always the larger of the two.
 */
interface Assessed {
  chips: PresentedAssessment[];
  recorded: number;
}

/** A candidate nobody has assessed — no chips, and nothing to warn about deleting. */
const NOTHING_ASSESSED: Assessed = { chips: [], recorded: 0 };

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
      // Unfiltered but not unscoped: `total` answers "how many candidates does this
      // organization have", and a deleted one is not one of them — otherwise the empty
      // state would stay hidden behind people nobody can open (03 §11.63).
      this.prisma.candidate.count({ where: { organizationId, deletedAt: null } }),
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
      candidates: await this.presentPage(listed),
    };
  }

  /**
   * The page's rows, with their assessed criteria attached.
   *
   * The rollup is one query for the whole page rather than one per row: twenty-five rows
   * is twenty-five round trips otherwise, and the fold is the same one
   * `candidateIdsMatchingCriteria` already does — the difference being that this one
   * reads **every** criterion the candidates hold rather than only the ones a filter
   * named, because the chips say what is known about a person and not what was asked.
   */
  private async presentPage(listed: Listed): Promise<PresentedCandidate[]> {
    const assessed = await this.assessments(listed.rows.map((row) => row.id));
    return listed.rows.map((candidate) =>
      this.present(
        candidate,
        assessed.get(candidate.id) ?? NOTHING_ASSESSED,
        listed.speaksFor.get(candidate.id),
      ),
    );
  }

  /**
   * Every candidate on this page, what each of them has been assessed as, and how many
   * times.
   *
   * Same rule as the filter (03 §04.16): across the applications carrying an assessment
   * for a criterion, the one whose *interview* is latest wins, ties broken on the
   * assessment's own `updatedAt`. A criterion the last interviewer never asked about does
   * not blank out an earlier answer — the candidate's English did not become unknown.
   *
   * Archived criteria are included. The assessment happened, and archiving a criterion
   * takes it out of the pickers rather than out of the record (03 §04.19).
   *
   * The **count** is the rows before that fold, not the chips after it, and it is here
   * rather than in a query of its own because this one has already read them: the delete
   * confirmation asks how much record goes with the person, and the rollup is by
   * definition a smaller number than the answer (03 §11.62).
   */
  private async assessments(candidateIds: string[]): Promise<ReadonlyMap<string, Assessed>> {
    if (candidateIds.length === 0) return new Map();

    const rows = await this.prisma.applicationCriterion.findMany({
      where: { application: { candidateId: { in: candidateIds } } },
      select: {
        criterionId: true,
        valueBool: true,
        valueNumber: true,
        valueText: true,
        updatedAt: true,
        // The label, resolved here rather than on the row: a scale's id means nothing to
        // a reader, and reading by label is the one job that is not a comparison.
        value: { select: { label: true } },
        criterion: { select: { name: true } },
        application: { select: { candidateId: true, start: true } },
      },
    });

    const byCandidate = new Map<string, Map<string, typeof rows>>();
    for (const row of rows) {
      const candidate = byCandidate.get(row.application.candidateId) ?? new Map();
      candidate.set(row.criterionId, [...(candidate.get(row.criterionId) ?? []), row]);
      byCandidate.set(row.application.candidateId, candidate);
    }

    const presented = new Map<string, Assessed>();
    for (const [candidateId, held] of byCandidate) {
      const chips: PresentedAssessment[] = [];
      let recordedCount = 0;
      for (const [criterionId, recorded] of held) {
        recordedCount += recorded.length;
        const latest = latestAssessment(
          recorded.map((row) => ({ ...row, interviewStart: row.application.start })),
        );
        if (!latest) continue;
        chips.push({
          criterionId,
          name: latest.criterion.name,
          value: assessedValueLabel({
            valueLabel: latest.value?.label ?? null,
            valueBool: latest.valueBool,
            valueNumber: latest.valueNumber,
            valueText: latest.valueText,
          }),
        });
      }
      presented.set(candidateId, {
        chips: chips.sort((left, right) => left.name.localeCompare(right.name)),
        recorded: recordedCount,
      });
    }

    return presented;
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

    const [vacancies, categories, interviewers, criteria] = await Promise.all([
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
      referenced.interviewerIds.length === 0
        ? []
        : this.prisma.membership.findMany({
            // Membership rather than role: a member whose role has since narrowed may
            // still be the assigned interviewer on a vacancy, and filtering by them is
            // still a question with an answer. What the organization does not hold at
            // all is what gets refused.
            where: {
              organizationId,
              status: 'active',
              accountId: { in: referenced.interviewerIds },
            },
            select: { accountId: true },
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
      interviewerIds: new Set(interviewers.map((membership) => membership.accountId)),
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
   *
   * The **interviewer clause is dropped in `mine`** (03 §09.48). Not intersected with the
   * scope, not refused: in that scope the interviewer is the viewer by definition, the
   * drawer does not draw the field, and a value left in the query string from the other
   * tab must not quietly narrow a list whose control for it is not on screen. It is
   * dropped here rather than out of the plan because `scopeCounts` builds both scopes'
   * queries from **one** plan, and a tab label counted under a clause the tab would not
   * apply is a label that lies.
   */
  private where(
    organizationId: string,
    plan: CandidateFilterPlan,
    assessed: string[] | null,
    scope: CandidateScope,
    viewerAccountId: string,
  ): Prisma.CandidateWhereInput {
    const and: Prisma.CandidateWhereInput[] = plan.applicationClauses
      .filter((clause) => !(scope === 'mine' && clause.interviewerAccountIds))
      .map((clause) => ({
        applications: {
          some: {
            ...(clause.vacancyIds ? { vacancyId: { in: clause.vacancyIds } } : {}),
            ...(clause.statuses ? { status: { in: clause.statuses } } : {}),
            ...(clause.categoryIds
              ? { vacancy: { categories: { some: { categoryId: { in: clause.categoryIds } } } } }
              : {}),
            ...(clause.interviewerAccountIds
              ? { vacancy: { interviewerAccountId: { in: clause.interviewerAccountIds } } }
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
      // Deleted people are not narrowed out by a filter — they are not in the list at
      // all (03 §11.63). Stated here rather than at each caller because every count this
      // screen reports is taken through this predicate, and a scope count that disagreed
      // with the rows under it would be the one bug a soft delete is prone to.
      deletedAt: null,
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
  private present(
    candidate: CandidateRecord,
    assessed: Assessed,
    speaksFor?: string,
  ): PresentedCandidate {
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
      criteria: assessed.chips,
      assessmentCount: assessed.recorded,
      latestApplication: headline
        ? {
            id: headline.id,
            vacancyTitle: headline.vacancy.title,
            interviewer: {
              accountId: headline.vacancy.interviewerAccountId,
              fullName: `${headline.vacancy.interviewer.firstName} ${headline.vacancy.interviewer.lastName}`,
            },
            startUtc: headline.start.toISOString(),
            status: headline.status,
            isCancelled: headline.isCancelled,
          }
        : null,
    };
  }
}
