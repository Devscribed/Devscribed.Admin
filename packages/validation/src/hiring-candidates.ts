/**
 * The candidate database's rules — spec 03.
 *
 * One screen, one question: *who has applied, and which of them match?* Everything here
 * serves the headline query — everyone who applied to a React position whose English is
 * at least B1 — and it is the only place in the product where the two libraries built in
 * phases 6 and 7 are read in anger.
 *
 * Three rules carry the whole file, and each of them is a rule rather than a rendering
 * choice, which is why they are here and not beside a query:
 *
 * 1. **Filters AND across kinds and OR within one.** `(React OR Node) AND (Senior)` —
 *    and each clause is satisfied by *any* of the candidate's applications, because the
 *    row is a person rather than an application (03 §03.10, §01.1).
 * 2. **A criterion's value is the assessment from the candidate's most recent
 *    interview** (03 §04.16), which is what lets English assessed during a .NET
 *    interview count when filtering React applicants.
 * 3. **Absence is not a value** (03 §04.18). A candidate never assessed on English
 *    matches neither `English at least B1` nor `English at most B1`, and no negative
 *    operator invents an answer for them.
 *
 * Comparison for a scale is by position and lives in `hiring-libraries.ts` beside the
 * definition of what a scale is; this module maps the wire's operator names onto it
 * rather than restating the comparison, because a second copy is how the filter and the
 * library would come to disagree about `at least`.
 */

import { isApplicationStatus } from './hiring';
import type { ApplicationStatus } from './hiring';
import { CRITERION_MESSAGES, compareScale, scalePosition } from './hiring-libraries';
import type { CriterionType, ScaleOperator, ScalePosition } from './hiring-libraries';

/* ------------------------------------------------------------------ *
 * Messages and counts
 * ------------------------------------------------------------------ */

/** Verbatim from the "Error Messages" table of `specs/hiring/03-candidate-database.md`. */
export const CANDIDATE_MESSAGES = {
  /**
   * An organization with no candidates at all. It names the way out — the booking link
   * is the only thing that creates a candidate, and nothing on this screen can.
   */
  empty: 'No candidates yet. Share a booking link to start.',
  /** Filters that match nobody. A different fact from an empty database, and never conflated. */
  noResults: 'No candidates match these filters',
  /** Server-side only: the row is not submitted until it is complete, so nothing in the UI sends it. */
  invalidFilter: "That filter isn't valid for this criterion",
  loadFailed: "We couldn't load candidates. Try again.",
  searchPlaceholder: 'Search name or email…',
  clearFilters: 'Clear filters',
  /** The one marker in the criterion picker, shared with the settings screen. */
  archived: CRITERION_MESSAGES.archivedBadge,
  /**
   * The filter drawer (03 §09). Everything that narrows the list lives behind one
   * button now, so the words that used to label rows inside a card have to name a
   * surface as well as its fields.
   */
  filters: {
    /** The toolbar's button, and the drawer's own heading — the same word both ways. */
    button: 'Filters',
    /** The drawer is a dialog, and a dialog is named. */
    title: 'Filters',
    /** Dismisses the drawer without undoing anything — the filters are already applied. */
    showResults: 'Show results',
    close: 'Close filters',
    /** Field labels, in the order the drawer stacks them. */
    status: 'Status',
    position: 'Position',
    category: 'Category',
    interviewer: 'Interviewer',
    criteria: 'Criteria',
    anyStatus: 'Any status',
    anyPosition: 'Any position',
    anyCategory: 'Any category',
    anyInterviewer: 'Any interviewer',
  },
  /**
   * The criteria autocomplete, which is what `+ Add criteria filter` became (03 §09.49):
   * a field labelled `Criteria`, so the placeholder says what typing into it does rather
   * than naming the control a second time.
   */
  addCriterion: { placeholder: 'Type a criterion…' },
  /**
   * The two scope tabs. `Assigned to me` is what the separate My interviews screen
   * became: the same list, narrowed to the vacancies the viewer interviews for.
   */
  scope: {
    all: 'All',
    mine: 'Assigned to me',
    /** The tablist's accessible name — the strip is a control, and a control is named. */
    tablist: 'Candidate scope',
  },
} as const;

/** `128 candidates`, `1 candidate`. */
export const candidateCountLabel = (count: number): string =>
  count === 1 ? '1 candidate' : `${count} candidates`;

/**
 * `12 of 128 candidates` while anything narrows the list, `128 candidates` otherwise.
 *
 * Both numbers are shown because both are answers: how many match is what was asked,
 * and how many exist is what says whether the filter is doing anything (03 §05.20).
 */
export const candidateResultLabel = (matched: number, total: number, filtered: boolean): string =>
  filtered ? `${matched} of ${candidateCountLabel(total)}` : candidateCountLabel(total);

/* ------------------------------------------------------------------ *
 * Scope
 * ------------------------------------------------------------------ */

/**
 * Which candidates the list is about (03 §08.35).
 *
 * `all` is the database as it always was — everyone who has ever booked. `mine` is the
 * whole of the former My interviews screen: the candidates on vacancies the viewer is
 * the assigned interviewer for. Two questions — *who do I know?* and *what is next for
 * me?* — asked of one list rather than of two screens.
 */
export const CANDIDATE_SCOPES = ['all', 'mine'] as const;
export type CandidateScope = (typeof CANDIDATE_SCOPES)[number];

/**
 * What the caller asked for, or `all` when they asked for nothing recognisable.
 *
 * Lenient where every other query parameter is strict, and deliberately so: the scope is
 * **navigation, not a filter**. Nothing is looked up to satisfy it, so there is no id
 * this organization could fail to hold, and a stale bookmark carrying a spelling we no
 * longer answer should land on the list rather than on a 422.
 */
export const parseCandidateScope = (input: unknown): CandidateScope =>
  CANDIDATE_SCOPES.includes(input as CandidateScope) ? (input as CandidateScope) : 'all';

/**
 * The scope that is actually applied — which is the server's to decide, never the query
 * string's (03 §08.40).
 *
 * A caller who may only see their own candidates gets `mine` however they ask, so
 * hand-crafting `?scope=all` widens nothing. The client reflects this answer; it does not
 * enforce it, and it is never the only thing standing between an interviewer and the
 * database.
 */
export const resolveCandidateScope = (
  requested: unknown,
  canSeeAll: boolean,
): CandidateScope => (canSeeAll ? parseCandidateScope(requested) : 'mine');

/** `All (128)` — the count the design puts inside the tab label rather than beside it. */
export const candidateScopeTabLabel = (scope: CandidateScope, count: number): string =>
  `${CANDIDATE_MESSAGES.scope[scope]} (${count})`;

/**
 * `Filters (3)` — how many filters are applied, on the control that opens them (03 §09.46).
 *
 * The count is the whole reason the drawer is allowed to hide them: a filter nobody can
 * see is a filter nobody can undo, and this is what puts it back on screen. **The scope
 * is not in it.** The tab strip is navigation, it survives `Clear filters`, and counting
 * it would make `Assigned to me` read as one filter that cannot be removed here.
 */
export const candidateFiltersLabel = (count: number): string =>
  count > 0 ? `${CANDIDATE_MESSAGES.filters.button} (${count})` : CANDIDATE_MESSAGES.filters.button;

/**
 * The interviewer as the picker names them, with the viewer marked (03 §09.48).
 *
 * `(me)` rather than a separate `Me` entry, so the filter and the `Assigned to me` tab
 * are visibly the same person: one mechanism said twice, not two mechanisms.
 */
export const interviewerPickerLabel = (fullName: string, isViewer: boolean): string =>
  isViewer ? `${fullName} (me)` : fullName;

/* ------------------------------------------------------------------ *
 * Operators
 * ------------------------------------------------------------------ */

/** The five that travel on the wire (03 §API). */
export const FILTER_OPERATORS = ['is', 'not', 'gte', 'lte', 'contains'] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export const isFilterOperator = (input: unknown): input is FilterOperator =>
  FILTER_OPERATORS.includes(input as FilterOperator);

/**
 * One entry of a type's operator list, as the operator `Select` renders it.
 *
 * `value` is populated for `boolean` alone, where the operator and the value are one
 * choice: a two-valued criterion asked with four spellings — is yes, is no, is not yes,
 * is not no — is two questions wearing four hats. So the boolean row has no value
 * control at all and its operator carries the answer (03 §04.14, design §Copy).
 */
export interface FilterOperatorOption {
  operator: FilterOperator;
  label: string;
  value?: string;
}

/**
 * Which operators each type offers, and how they are worded (03 §04.14).
 *
 * Plain English rather than `>=`: `at least B1` is what an interviewer would say, and
 * `English >= B1` is what a database would. `scale` and `number` offer the same four
 * questions and differ only in what they compare — a position against a number.
 */
export const CRITERION_FILTER_OPERATORS: Record<CriterionType, readonly FilterOperatorOption[]> = {
  scale: [
    { operator: 'is', label: 'is' },
    { operator: 'not', label: 'is not' },
    { operator: 'gte', label: 'at least' },
    { operator: 'lte', label: 'at most' },
  ],
  number: [
    { operator: 'is', label: 'is' },
    { operator: 'not', label: 'is not' },
    { operator: 'gte', label: 'at least' },
    { operator: 'lte', label: 'at most' },
  ],
  boolean: [
    { operator: 'is', value: 'true', label: 'is yes' },
    { operator: 'is', value: 'false', label: 'is no' },
  ],
  text: [
    { operator: 'contains', label: 'contains' },
    { operator: 'is', label: 'is' },
  ],
};

export const operatorsFor = (type: CriterionType): readonly FilterOperatorOption[] =>
  CRITERION_FILTER_OPERATORS[type];

/**
 * Whether a type answers this operator at all — `gte` against a `boolean`, or `contains`
 * against a `scale`, is a question that has no meaning rather than one that is false
 * (03 §Validation.3).
 */
export const supportsOperator = (type: CriterionType, operator: FilterOperator): boolean =>
  operatorsFor(type).some((option) => option.operator === operator);

/** Which control picks the value, once the criterion is known (03 design §The criteria filter row). */
export const valueControlFor = (type: CriterionType): 'scale' | 'number' | 'text' | 'none' =>
  type === 'scale' ? 'scale' : type === 'boolean' ? 'none' : type;

/** The wire's names for the four questions a scale answers, in the scale's own vocabulary. */
const SCALE_OPERATOR_BY_FILTER: Partial<Record<FilterOperator, ScaleOperator>> = {
  is: 'is',
  not: 'is_not',
  gte: 'at_least',
  lte: 'at_most',
};

/* ------------------------------------------------------------------ *
 * The rollup, and what one filter row asks
 * ------------------------------------------------------------------ */

/**
 * One recorded assessment, as the rollup and the comparison need it.
 *
 * `interviewStart` is the application's, not the assessment's own timestamp: "most
 * recent interview" is a fact about when the candidate was seen, and notes edited a
 * month later do not make an older interview newer (03 §04.16).
 */
export interface CandidateAssessment {
  interviewStart: Date;
  /** Breaks a tie between two interviews booked at the same instant. */
  updatedAt: Date;
  valueId: string | null;
  valueBool: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
}

/**
 * The assessment that speaks for the candidate: the one from their latest interview
 * (03 §04.16), or `null` when they have never been assessed on this criterion.
 *
 * Only the applications *carrying an assessment* are considered, so a later interview
 * where the criterion was never asked does not blank out an earlier answer — the
 * candidate's English did not become unknown because the last interviewer forgot to ask.
 */
export function latestAssessment<T extends { interviewStart: Date; updatedAt: Date }>(
  assessments: readonly T[],
): T | null {
  return assessments.reduce<T | null>((latest, assessment) => {
    if (!latest) return assessment;
    const byStart = assessment.interviewStart.getTime() - latest.interviewStart.getTime();
    if (byStart > 0) return assessment;
    if (byStart < 0) return latest;
    return assessment.updatedAt.getTime() > latest.updatedAt.getTime() ? assessment : latest;
  }, null);
}

/** One row of the criteria filter, validated. */
export interface CriterionFilter {
  criterionId: string;
  operator: FilterOperator;
  /** A `CriterionValue` id for a scale; a literal for the other three types. */
  value: string;
}

/** The criterion a filter row names, as matching needs it. */
export interface FilterCriterion {
  id: string;
  type: CriterionType;
  /** Empty for every type but `scale`. */
  values: readonly ScalePosition[];
}

/** `{criterionId}:{op}:{value}` — the query-string form both sides speak (03 §API). */
export const criterionFilterParam = (filter: CriterionFilter): string =>
  `${filter.criterionId}:${filter.operator}:${filter.value}`;

/**
 * The other direction. The value is whatever follows the second colon, colons included,
 * because a `text` criterion may legitimately be filtered for `Ratio 1:2`.
 */
export function parseCriterionFilterParam(raw: unknown): CriterionFilter | null {
  if (typeof raw !== 'string') return null;
  const first = raw.indexOf(':');
  const second = raw.indexOf(':', first + 1);
  if (first <= 0 || second <= first) return null;

  const operator = raw.slice(first + 1, second);
  if (!isFilterOperator(operator)) return null;

  return { criterionId: raw.slice(0, first), operator, value: raw.slice(second + 1) };
}

const fold = (value: string): string => value.trim().toLowerCase();

/**
 * Whether one filter row holds for one candidate.
 *
 * A `null` assessment is refused before the operator is even read: absence is not a
 * value, and `is not B1` is a claim about somebody who was assessed (03 §04.18). Every
 * other path compares the one column the criterion's type names, which is the whole
 * reason `ApplicationCriterion` has four of them.
 */
export function matchesAssessment(
  criterion: FilterCriterion,
  filter: CriterionFilter,
  assessment: CandidateAssessment | null,
): boolean {
  if (!assessment) return false;

  switch (criterion.type) {
    case 'scale': {
      const operator = SCALE_OPERATOR_BY_FILTER[filter.operator];
      if (!operator) return false;
      // By position, never by label — so renaming `B1` never moves this line, and
      // reordering the scale deliberately does (06 §03.15).
      return compareScale(
        operator,
        scalePosition(criterion.values, assessment.valueId),
        scalePosition(criterion.values, filter.value),
      );
    }
    case 'number': {
      const threshold = Number(filter.value);
      if (!Number.isFinite(threshold) || assessment.valueNumber === null) return false;
      switch (filter.operator) {
        case 'is':
          return assessment.valueNumber === threshold;
        case 'not':
          return assessment.valueNumber !== threshold;
        case 'gte':
          return assessment.valueNumber >= threshold;
        case 'lte':
          return assessment.valueNumber <= threshold;
        default:
          return false;
      }
    }
    case 'boolean':
      if (filter.operator !== 'is' || assessment.valueBool === null) return false;
      return assessment.valueBool === (filter.value === 'true');
    case 'text': {
      if (assessment.valueText === null) return false;
      const recorded = fold(assessment.valueText);
      const wanted = fold(filter.value);
      if (filter.operator === 'contains') return recorded.includes(wanted);
      if (filter.operator === 'is') return recorded === wanted;
      return false;
    }
  }
}

/**
 * Every criterion row must hold — they AND, they never OR (03 §03.10).
 *
 * A candidate with no assessment for one of them fails that row and therefore the whole
 * conjunction, which is `matchesAssessment`'s `null` case reaching the list.
 */
export function matchesEveryCriterion(
  filters: readonly CriterionFilter[],
  criteria: ReadonlyMap<string, FilterCriterion>,
  assessments: ReadonlyMap<string, CandidateAssessment>,
): boolean {
  return filters.every((filter) => {
    const criterion = criteria.get(filter.criterionId);
    if (!criterion) return false;
    return matchesAssessment(criterion, filter, assessments.get(filter.criterionId) ?? null);
  });
}

/* ------------------------------------------------------------------ *
 * The query
 * ------------------------------------------------------------------ */

export const CANDIDATE_PAGE_SIZE_DEFAULT = 25;
export const CANDIDATE_PAGE_SIZE_MAX = 100;

/** A larger `pageSize` is clamped rather than refused (03 §Validation.1). */
export function clampPageSize(input: unknown): number {
  const size = Math.trunc(Number(input));
  if (!Number.isFinite(size) || size < 1) return CANDIDATE_PAGE_SIZE_DEFAULT;
  return Math.min(size, CANDIDATE_PAGE_SIZE_MAX);
}

export function parsePage(input: unknown): number {
  const page = Math.trunc(Number(input));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/** How many pages `matched` rows fill. Always at least one, so page 1 of 0 never renders. */
export const pageCount = (matched: number, pageSize: number): number =>
  Math.max(1, Math.ceil(matched / Math.max(1, pageSize)));

/**
 * One kind of filter, satisfied when **any** of the candidate's applications satisfies
 * it. Two clauses in a plan is two kinds, and they must both hold.
 *
 * They stay separate rather than merging into one test against a single application:
 * a candidate who applied to a React vacancy in March and a Senior-tagged one in August
 * matches `React AND Senior`, because the row is the person (03 §01.1, §03.12).
 */
export interface ApplicationClause {
  vacancyIds?: string[];
  categoryIds?: string[];
  /** The five board statuses (03 §09.47). */
  statuses?: ApplicationStatus[];
  /**
   * The vacancy's assigned interviewer (03 §09.48).
   *
   * Dropped rather than applied in the `mine` scope, where the interviewer is the viewer
   * by definition — which is why it is its own clause and not folded into any other.
   */
  interviewerAccountIds?: string[];
}

export interface CandidateFilterPlan {
  /** Name and email only; never a vacancy title, a note or an assessment (03 §02.7). */
  search: string;
  /** ANDed. Empty when no position or category filter is applied. */
  applicationClauses: ApplicationClause[];
  /** ANDed, and resolved against the candidate's latest assessment for each criterion. */
  criteria: CriterionFilter[];
  page: number;
  pageSize: number;
  /** Whether anything narrows the list — what decides between the two empty states. */
  filtered: boolean;
}

export type CandidatePlanResult =
  | { valid: true; plan: CandidateFilterPlan }
  | { valid: false; error: 'invalid_filter'; message: string };

/**
 * What this organization actually holds, so a filter naming something else can be
 * refused rather than dropped: a query that silently ignored an unknown id would return
 * more people than the filter on screen claims to allow (03 §Validation.2).
 */
export interface CandidateFilterLibrary {
  vacancyIds: ReadonlySet<string>;
  categoryIds: ReadonlySet<string>;
  /** Active memberships — who this organization could name as an interviewer at all. */
  interviewerIds: ReadonlySet<string>;
  criteria: ReadonlyMap<string, FilterCriterion>;
}

export interface CandidateQueryParams {
  search?: unknown;
  /** Repeatable: one value arrives as a string, several as an array. */
  vacancyId?: unknown;
  categoryId?: unknown;
  /** Repeatable: one of the five board statuses (03 §09.47). */
  status?: unknown;
  /** Repeatable: an account id this organization holds an active membership for. */
  interviewerId?: unknown;
  criterion?: unknown;
  page?: unknown;
  pageSize?: unknown;
  /**
   * `all` | `mine`, resolved by `resolveCandidateScope` rather than by the plan below:
   * it narrows the list without being a filter, so it must not count towards `filtered`,
   * must not appear in the `Filters (n)` badge, and must survive `Clear filters`.
   */
  scope?: unknown;
}

const asList = (input: unknown): string[] =>
  input === undefined || input === null
    ? []
    : (Array.isArray(input) ? input : [input]).filter(
        (entry): entry is string => typeof entry === 'string' && entry.length > 0,
      );

/**
 * The ids a query names, so the service can look **exactly** those up and no more.
 *
 * Parsing lives here rather than beside the lookup because a repeatable query parameter
 * arrives as a string or as an array depending on how many were sent, and a caller that
 * got that wrong would silently validate one filter out of three.
 */
export function referencedFilterIds(params: CandidateQueryParams): {
  vacancyIds: string[];
  categoryIds: string[];
  interviewerIds: string[];
  criterionIds: string[];
} {
  return {
    vacancyIds: asList(params.vacancyId),
    categoryIds: asList(params.categoryId),
    interviewerIds: asList(params.interviewerId),
    // A malformed triple names nothing to look up; the plan refuses it either way.
    criterionIds: asList(params.criterion)
      .map(parseCriterionFilterParam)
      .filter((filter): filter is CriterionFilter => filter !== null)
      .map((filter) => filter.criterionId),
  };
}

const invalid = (): CandidatePlanResult => ({
  valid: false,
  error: 'invalid_filter',
  message: CANDIDATE_MESSAGES.invalidFilter,
});

/**
 * The query as asked, validated against the library it names (03 §03, §04, §Validation).
 *
 * Everything that can be wrong is wrong *here*, before a row is read: an id from another
 * organization, an operator a type does not answer, a scale value belonging to a
 * different scale. All of them are the same `422 invalid_filter`, because from the
 * caller's side they are the same mistake — a filter this organization cannot evaluate.
 */
export function candidateFilterPlan(
  params: CandidateQueryParams,
  library: CandidateFilterLibrary,
): CandidatePlanResult {
  const vacancyIds = asList(params.vacancyId);
  const categoryIds = asList(params.categoryId);
  const interviewerIds = asList(params.interviewerId);
  const statuses = asList(params.status);
  if (vacancyIds.some((id) => !library.vacancyIds.has(id))) return invalid();
  if (categoryIds.some((id) => !library.categoryIds.has(id))) return invalid();
  if (interviewerIds.some((id) => !library.interviewerIds.has(id))) return invalid();
  /**
   * A status is refused the same way an unknown id is, and for the same reason
   * (03 §Validation.7): the five are a closed set, so a sixth is a filter this product
   * cannot evaluate rather than one that matches nobody. Refusing it is also what keeps
   * the two counts honest — a dropped clause would return more people than the drawer's
   * chips claim to allow.
   */
  if (statuses.some((status) => !isApplicationStatus(status))) return invalid();

  const criteria: CriterionFilter[] = [];
  for (const raw of asList(params.criterion)) {
    const filter = parseCriterionFilterParam(raw);
    if (!filter) return invalid();

    const criterion = library.criteria.get(filter.criterionId);
    if (!criterion) return invalid();
    if (!supportsOperator(criterion.type, filter.operator)) return invalid();
    if (!validFilterValue(criterion, filter)) return invalid();

    criteria.push(filter);
  }

  // One clause per kind, so they AND across kinds while each is satisfied by any one
  // application — the status and the interviewer join that rule rather than qualifying
  // the clauses already there (03 §03.12, §09.47).
  const applicationClauses: ApplicationClause[] = [];
  if (vacancyIds.length > 0) applicationClauses.push({ vacancyIds });
  if (categoryIds.length > 0) applicationClauses.push({ categoryIds });
  if (statuses.length > 0) applicationClauses.push({ statuses: statuses as ApplicationStatus[] });
  if (interviewerIds.length > 0) applicationClauses.push({ interviewerAccountIds: interviewerIds });

  const search = typeof params.search === 'string' ? params.search.trim() : '';

  return {
    valid: true,
    plan: {
      search,
      applicationClauses,
      criteria,
      page: parsePage(params.page),
      pageSize: clampPageSize(params.pageSize),
      filtered: search.length > 0 || applicationClauses.length > 0 || criteria.length > 0,
    },
  };
}

/**
 * Whether the value is one this criterion could ever have been assessed as.
 *
 * A scale's is an id from **its own** list (03 §Validation.4) — a value borrowed from
 * another scale would compare against a position that means something else entirely.
 * The rest is a shape check: an unparseable number, or an empty string, is a row the
 * screen never submits, so reaching here means it was hand-assembled.
 */
function validFilterValue(criterion: FilterCriterion, filter: CriterionFilter): boolean {
  switch (criterion.type) {
    case 'scale':
      return criterion.values.some((value) => value.id === filter.value);
    case 'number':
      return Number.isFinite(Number(filter.value)) && filter.value.trim().length > 0;
    case 'boolean':
      return filter.value === 'true' || filter.value === 'false';
    case 'text':
      return filter.value.trim().length > 0;
  }
}
