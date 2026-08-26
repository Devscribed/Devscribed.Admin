import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_MESSAGES,
  CANDIDATE_PAGE_SIZE_DEFAULT,
  CANDIDATE_PAGE_SIZE_MAX,
  candidateFilterPlan,
  candidateResultLabel,
  clampPageSize,
  criterionFilterParam,
  latestAssessment,
  matchesAssessment,
  matchesEveryCriterion,
  operatorsFor,
  pageCount,
  parseCriterionFilterParam,
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
