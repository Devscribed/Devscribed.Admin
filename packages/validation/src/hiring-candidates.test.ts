import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_MESSAGES,
  CANDIDATE_PAGE_SIZE_DEFAULT,
  CANDIDATE_PAGE_SIZE_MAX,
  candidateActionsLabel,
  candidateDeleteConfirmation,
  candidateDeletedToast,
  candidateFilterPlan,
  candidateResultLabel,
  candidateScopeTabLabel,
  clampPageSize,
  criterionFilterParam,
  latestAssessment,
  matchesAssessment,
  matchesEveryCriterion,
  operatorsFor,
  pageCount,
  parseCandidateScope,
  parseCriterionFilterParam,
  resolveCandidateScope,
  supportsOperator,
  valueControlFor,
  type CandidateAssessment,
  type FilterCriterion,
} from './index';

/* ------------------------------------------------------------------ *
 * The library every case below filters against
 * ------------------------------------------------------------------ */

/** CEFR, worst to best — the scale the spec's own examples use. */
const ENGLISH: FilterCriterion = {
  id: 'crit-english',
  type: 'scale',
  values: [
    { id: 'val-a1', position: 0 },
    { id: 'val-a2', position: 1 },
    { id: 'val-b1', position: 2 },
    { id: 'val-b2', position: 3 },
  ],
};

const YEARS: FilterCriterion = { id: 'crit-years', type: 'number', values: [] };
const LATE_HOURS: FilterCriterion = { id: 'crit-late', type: 'boolean', values: [] };
const LOCATION: FilterCriterion = { id: 'crit-location', type: 'text', values: [] };

const LIBRARY = {
  vacancyIds: new Set(['vac-react', 'vac-node', 'vac-dotnet']),
  categoryIds: new Set(['cat-senior', 'cat-react']),
  interviewerIds: new Set(['acct-sam', 'acct-ines']),
  criteria: new Map([ENGLISH, YEARS, LATE_HOURS, LOCATION].map((c) => [c.id, c])),
};

const assessment = (
  values: Partial<CandidateAssessment> & { interviewStart: Date },
): CandidateAssessment => ({
  updatedAt: values.interviewStart,
  valueId: null,
  valueBool: null,
  valueNumber: null,
  valueText: null,
  ...values,
});

const march = new Date('2026-03-10T09:00:00.000Z');
const august = new Date('2026-08-10T09:00:00.000Z');

/* ------------------------------------------------------------------ *
 * TC-H03-UNIT-01 — how the three kinds of filter compose
 * ------------------------------------------------------------------ */

/**
 * The composition rule the whole screen rests on: **AND across kinds, OR within a
 * multi-select** (03 §03.10), with each clause satisfied by *any* of the candidate's
 * applications because the row is a person rather than an application.
 */
describe('candidateFilterPlan', () => {
  it('ORs the ids within one multi-select', () => {
    const result = candidateFilterPlan({ vacancyId: ['vac-react', 'vac-node'] }, LIBRARY);

    // One clause holding both ids — an application to either satisfies it.
    expect(result).toMatchObject({
      valid: true,
      plan: { applicationClauses: [{ vacancyIds: ['vac-react', 'vac-node'] }] },
    });
  });

  it('ANDs across kinds, as separate clauses rather than one', () => {
    const result = candidateFilterPlan(
      { vacancyId: 'vac-react', categoryId: 'cat-senior' },
      LIBRARY,
    );

    // Two clauses, not one: a candidate whose React application and whose Senior-tagged
    // application are different applications still matches (03 §01.1, §03.12).
    expect(result).toMatchObject({
      valid: true,
      plan: {
        applicationClauses: [{ vacancyIds: ['vac-react'] }, { categoryIds: ['cat-senior'] }],
      },
    });
  });

  /**
   * The two kinds the drawer added (03 §09.47, §09.48). They are clauses like the other
   * three — their own `some`, so they AND across kinds while each is satisfied by any one
   * application — and neither is folded into a clause already there.
   */
  it('gives the status and the interviewer a clause each', () => {
    const result = candidateFilterPlan(
      { status: ['passed', 'offer'], interviewerId: 'acct-sam', categoryId: 'cat-senior' },
      LIBRARY,
    );

    expect(result).toMatchObject({
      valid: true,
      plan: {
        applicationClauses: [
          { categoryIds: ['cat-senior'] },
          { statuses: ['passed', 'offer'] },
          { interviewerAccountIds: ['acct-sam'] },
        ],
        filtered: true,
      },
    });
  });

  /**
   * The five statuses are a closed set, so a sixth is unevaluable rather than empty — and
   * an unevaluable filter is refused, never dropped (03 §Validation.7). The interviewer
   * follows the rule every other id already follows.
   */
  it('refuses an unknown status and an interviewer this organization does not hold', () => {
    for (const params of [
      { status: ['archived'] },
      { status: ['passed', 'Scheduled'] },
      { interviewerId: ['acct-nobody'] },
    ]) {
      expect(candidateFilterPlan(params, LIBRARY)).toMatchObject({
        valid: false,
        error: 'invalid_filter',
      });
    }
  });

  it('keeps two criterion rows as a conjunction, and requires both to hold', () => {
    const result = candidateFilterPlan(
      { criterion: ['crit-english:gte:val-b1', 'crit-years:gte:3'] },
      LIBRARY,
    );
    if (!result.valid) throw new Error('the plan was refused');
    expect(result.plan.criteria).toHaveLength(2);

    const criteria = LIBRARY.criteria;
    const b2 = assessment({ interviewStart: august, valueId: 'val-b2' });
    const twoYears = assessment({ interviewStart: august, valueNumber: 2 });
    const fourYears = assessment({ interviewStart: august, valueNumber: 4 });

    // Both rows hold.
    expect(
      matchesEveryCriterion(
        result.plan.criteria,
        criteria,
        new Map([
          ['crit-english', b2],
          ['crit-years', fourYears],
        ]),
      ),
    ).toBe(true);

    // One row fails — they AND, they do not OR.
    expect(
      matchesEveryCriterion(
        result.plan.criteria,
        criteria,
        new Map([
          ['crit-english', b2],
          ['crit-years', twoYears],
        ]),
      ),
    ).toBe(false);
  });

  it('reports nothing as filtered until something narrows the list', () => {
    const bare = candidateFilterPlan({}, LIBRARY);
    expect(bare).toMatchObject({ valid: true, plan: { filtered: false, criteria: [] } });

    // Search alone narrows it, and the count line says "n of total" for that too.
    expect(candidateFilterPlan({ search: '  jane ' }, LIBRARY)).toMatchObject({
      valid: true,
      plan: { search: 'jane', filtered: true },
    });
  });

  it('refuses an id from another organization rather than dropping it', () => {
    // Dropping it would return more people than the filter on screen claims to allow
    // (03 §Validation.2).
    for (const params of [{ vacancyId: 'vac-elsewhere' }, { categoryId: 'cat-elsewhere' }]) {
      expect(candidateFilterPlan(params, LIBRARY)).toEqual({
        valid: false,
        error: 'invalid_filter',
        message: CANDIDATE_MESSAGES.invalidFilter,
      });
    }
  });

  it('refuses a malformed triple, an unknown criterion, and a value from another scale', () => {
    const refused = [
      { criterion: 'crit-english' },
      { criterion: 'crit-english:gte' },
      { criterion: 'crit-english:between:val-b1' },
      { criterion: 'crit-nothing:is:val-b1' },
      // A real value id, but from no scale of English's.
      { criterion: 'crit-english:is:val-elsewhere' },
      { criterion: 'crit-years:is:not-a-number' },
      { criterion: 'crit-late:is:maybe' },
      { criterion: 'crit-location:contains:   ' },
    ];

    for (const params of refused) {
      expect(candidateFilterPlan(params, LIBRARY).valid).toBe(false);
    }
  });

  it('clamps an oversized page size instead of refusing it', () => {
    // 03 §Validation.1 — a larger request is not an error, it is clamped.
    expect(clampPageSize(500)).toBe(CANDIDATE_PAGE_SIZE_MAX);
    expect(clampPageSize(10)).toBe(10);
    for (const nonsense of [undefined, 'many', 0, -3]) {
      expect(clampPageSize(nonsense)).toBe(CANDIDATE_PAGE_SIZE_DEFAULT);
    }
    expect(candidateFilterPlan({ page: '3' }, LIBRARY)).toMatchObject({
      valid: true,
      plan: { page: 3 },
    });
  });
});

/** The wire form, round-tripped — a `text` value may itself contain a colon. */
describe('criterionFilterParam', () => {
  it('round-trips a triple whose value carries a colon', () => {
    const filter = { criterionId: 'crit-location', operator: 'contains' as const, value: 'UTC+3:00' };
    expect(criterionFilterParam(filter)).toBe('crit-location:contains:UTC+3:00');
    expect(parseCriterionFilterParam(criterionFilterParam(filter))).toEqual(filter);
  });
});

/* ------------------------------------------------------------------ *
 * TC-H03-UNIT-02 — the rollup
 * ------------------------------------------------------------------ */

/**
 * A candidate's value for a criterion is the assessment from their **most recent
 * interview** (03 §04.16) — which is what lets English assessed during a .NET interview
 * count when filtering React applicants.
 */
describe('latestAssessment', () => {
  it('takes the assessment from the later interview', () => {
    const a2 = assessment({ interviewStart: march, valueId: 'val-a2' });
    const b2 = assessment({ interviewStart: august, valueId: 'val-b2' });

    // Whichever order they arrive in.
    expect(latestAssessment([a2, b2])).toBe(b2);
    expect(latestAssessment([b2, a2])).toBe(b2);

    const filter = { criterionId: ENGLISH.id, operator: 'gte' as const, value: 'val-b1' };
    expect(matchesAssessment(ENGLISH, filter, latestAssessment([a2, b2]))).toBe(true);
    // And on the March assessment alone it would not have matched, which is the point.
    expect(matchesAssessment(ENGLISH, filter, a2)).toBe(false);
  });

  it('breaks a tie between two interviews at the same instant on the assessment', () => {
    const earlier = {
      ...assessment({ interviewStart: august, valueId: 'val-a2' }),
      updatedAt: new Date('2026-08-10T10:00:00.000Z'),
    };
    const later = {
      ...assessment({ interviewStart: august, valueId: 'val-b2' }),
      updatedAt: new Date('2026-08-10T11:00:00.000Z'),
    };

    expect(latestAssessment([later, earlier])).toBe(later);
  });

  it('has nothing to say about a candidate never assessed', () => {
    expect(latestAssessment([])).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * TC-H03-UNIT-03 — absence is not a value
 * ------------------------------------------------------------------ */

/**
 * A candidate with no assessment matches **no** operator, the negative ones included
 * (03 §04.18): `is not B1` is a claim about somebody who was assessed, and nobody
 * assessed them.
 */
describe('matchesAssessment', () => {
  it('excludes a candidate with no assessment under every operator', () => {
    for (const operator of ['is', 'not', 'gte', 'lte'] as const) {
      expect(
        matchesAssessment(ENGLISH, { criterionId: ENGLISH.id, operator, value: 'val-b1' }, null),
      ).toBe(false);
    }
  });

  it('compares a scale by position, so renaming a value changes nothing', () => {
    const b2 = assessment({ interviewStart: august, valueId: 'val-b2' });
    const ask = (operator: 'is' | 'not' | 'gte' | 'lte') =>
      matchesAssessment(ENGLISH, { criterionId: ENGLISH.id, operator, value: 'val-b1' }, b2);

    expect(ask('gte')).toBe(true);
    expect(ask('lte')).toBe(false);
    expect(ask('is')).toBe(false);
    expect(ask('not')).toBe(true);

    // The labels are nowhere in this file, which is the assertion: the criterion carries
    // positions and ids alone, so a rename cannot reach the comparison (03 §04.15).
    expect(ENGLISH.values.every((value) => !('label' in value))).toBe(true);
  });

  it('compares a number numerically and text case-insensitively', () => {
    const four = assessment({ interviewStart: august, valueNumber: 4 });
    expect(matchesAssessment(YEARS, { criterionId: YEARS.id, operator: 'gte', value: '3' }, four)).toBe(true);
    expect(matchesAssessment(YEARS, { criterionId: YEARS.id, operator: 'lte', value: '3' }, four)).toBe(false);

    const minsk = assessment({ interviewStart: august, valueText: 'Minsk' });
    const contains = { criterionId: LOCATION.id, operator: 'contains' as const, value: 'MIN' };
    expect(matchesAssessment(LOCATION, contains, minsk)).toBe(true);
    expect(matchesAssessment(LOCATION, { ...contains, operator: 'is', value: ' minsk ' }, minsk)).toBe(true);
    expect(matchesAssessment(LOCATION, { ...contains, operator: 'is', value: 'Min' }, minsk)).toBe(false);
  });

  it('reads a boolean off the operator that carries it', () => {
    const yes = assessment({ interviewStart: august, valueBool: true });
    const ask = (value: string) =>
      matchesAssessment(LATE_HOURS, { criterionId: LATE_HOURS.id, operator: 'is', value }, yes);

    expect(ask('true')).toBe(true);
    expect(ask('false')).toBe(false);
  });

  it('refuses a value stored in the wrong column for its criterion', () => {
    // A `scale` assessment reaching a `number` filter compares nothing, rather than
    // comparing `null` against zero.
    const scaleValue = assessment({ interviewStart: august, valueId: 'val-b2' });
    expect(matchesAssessment(YEARS, { criterionId: YEARS.id, operator: 'gte', value: '0' }, scaleValue)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * TC-H03-UNIT-04 — operators are constrained by type
 * ------------------------------------------------------------------ */

describe('operatorsFor', () => {
  it('offers each type exactly its own row of operators', () => {
    expect(operatorsFor('scale').map((o) => o.label)).toEqual(['is', 'is not', 'at least', 'at most']);
    expect(operatorsFor('number').map((o) => o.label)).toEqual(['is', 'is not', 'at least', 'at most']);
    expect(operatorsFor('boolean').map((o) => o.label)).toEqual(['is yes', 'is no']);
    expect(operatorsFor('text').map((o) => o.label)).toEqual(['contains', 'is']);
  });

  it('offers no type an operator outside its row', () => {
    expect(supportsOperator('scale', 'contains')).toBe(false);
    expect(supportsOperator('boolean', 'gte')).toBe(false);
    expect(supportsOperator('boolean', 'not')).toBe(false);
    expect(supportsOperator('text', 'lte')).toBe(false);
    expect(supportsOperator('number', 'contains')).toBe(false);
  });

  it('bakes the value into a boolean operator and asks for none', () => {
    // Two questions, not four: `is not yes` is `is no` (03 §04.14).
    expect(operatorsFor('boolean').map((o) => o.value)).toEqual(['true', 'false']);
    expect(valueControlFor('boolean')).toBe('none');
    expect(valueControlFor('scale')).toBe('scale');
    expect(valueControlFor('number')).toBe('number');
    expect(valueControlFor('text')).toBe('text');
  });
});

/* ------------------------------------------------------------------ *
 * The count, which is this screen's primary feedback
 * ------------------------------------------------------------------ */

describe('candidateResultLabel', () => {
  it('names both numbers once anything narrows the list', () => {
    expect(candidateResultLabel(128, 128, false)).toBe('128 candidates');
    expect(candidateResultLabel(12, 128, true)).toBe('12 of 128 candidates');
    expect(candidateResultLabel(1, 1, false)).toBe('1 candidate');
    expect(candidateResultLabel(0, 128, true)).toBe('0 of 128 candidates');
  });

  it('counts a page of nothing as one page, never zero', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * Scope — navigation, and the one thing the query string cannot widen
 * ------------------------------------------------------------------ */

describe('parseCandidateScope', () => {
  it('takes either scope as written', () => {
    expect(parseCandidateScope('all')).toBe('all');
    expect(parseCandidateScope('mine')).toBe('mine');
  });

  it('falls back to the whole list rather than refusing an unrecognised one', () => {
    // Lenient where a filter would be refused: nothing is looked up to satisfy a scope,
    // so there is no id this organization could fail to hold — and a stale bookmark
    // should land on the list rather than on a 422.
    for (const asked of ['theirs', '', 'MINE', undefined, null, 1, ['mine']]) {
      expect(parseCandidateScope(asked)).toBe('all');
    }
  });
});

describe('resolveCandidateScope', () => {
  it('honours what a caller who may see everything asked for', () => {
    expect(resolveCandidateScope('all', true)).toBe('all');
    expect(resolveCandidateScope('mine', true)).toBe('mine');
    // Nothing asked is the default, which is the whole pipeline rather than one desk.
    expect(resolveCandidateScope(undefined, true)).toBe('all');
  });

  it('narrows a caller who may not, however they ask', () => {
    // The one rule the client never enforces: an interviewer hand-crafting `?scope=all`
    // widens nothing, and the response says `mine` so the screen agrees with the answer.
    expect(resolveCandidateScope('all', false)).toBe('mine');
    expect(resolveCandidateScope('mine', false)).toBe('mine');
    expect(resolveCandidateScope(undefined, false)).toBe('mine');
    expect(resolveCandidateScope('nonsense', false)).toBe('mine');
  });
});

describe('candidateScopeTabLabel', () => {
  it('carries the count inside the label, where the design puts it', () => {
    expect(candidateScopeTabLabel('all', 128)).toBe('All (128)');
    expect(candidateScopeTabLabel('mine', 0)).toBe('Assigned to me (0)');
  });
});

describe('candidateActionsLabel', () => {
  it('names the person the kebab belongs to', () => {
    // Twenty-five rows draw the same glyph, so without this a reader walking the page is
    // told "Actions, menu" twenty-five times and cannot tell which row they are on.
    expect(candidateActionsLabel('Jane Doe')).toBe('Actions for Jane Doe');
  });
});

describe('pageCount', () => {
  it('is what the page strip is drawn from', () => {
    // 25 to a page (03 §05.20): 26 candidates is two pages and 25 is one, which is also
    // the case that makes the whole control disappear.
    expect(pageCount(26, CANDIDATE_PAGE_SIZE_DEFAULT)).toBe(2);
    expect(pageCount(25, CANDIDATE_PAGE_SIZE_DEFAULT)).toBe(1);
    // Never zero: page 1 of 0 must not render, so an empty list is still one page.
    expect(pageCount(0, CANDIDATE_PAGE_SIZE_DEFAULT)).toBe(1);
  });
});

describe('candidateDeleteConfirmation', () => {
  it('states both counts, because they are what makes the decision answerable', () => {
    // A person with one booking nobody assessed and a person with four interviews of
    // notes behind them are not the same deletion, and this is the last place either
    // can be told apart.
    expect(candidateDeleteConfirmation(3, 7)).toContain('3 applications and 7 assessments');
    expect(candidateDeleteConfirmation(1, 1)).toContain('1 application and 1 assessment');
  });

  it('does not claim the delete cannot be undone, because it can', () => {
    // The record is kept and re-booking with the same address brings the whole of it
    // back — which is the reason this is a flag and not a DELETE (03 §11.61).
    expect(candidateDeleteConfirmation(3, 7)).toContain('book again with the same email');
    expect(candidateDeleteConfirmation(3, 7)).not.toContain('cannot be undone');
  });

  it('says nothing about counts when there is nothing to count', () => {
    // `0 applications and 0 assessments go with them` is a sentence that reads as an
    // error rather than as a fact.
    expect(candidateDeleteConfirmation(0, 0)).toBe(
      'Nothing has been recorded against them yet. They come back if they book again with the same email.',
    );
  });
});

describe('candidateDeletedToast', () => {
  it('names the person, on either door', () => {
    // The list and the card raise the same line — one outcome, one wording.
    expect(candidateDeletedToast('Jane Doe')).toBe('Jane Doe deleted');
  });
});
