import { describe, expect, it } from 'vitest';
import {
  CRITERION_MESSAGES,
  LIBRARY_LIMITS,
  LIBRARY_MESSAGES,
  SCALE_SEPARATOR,
  categoryDeleteConfirmation,
  categoryUsageDescription,
  categoryUsageLabel,
  criterionDeleteBlockedMessage,
  criterionDeleteConfirmation,
  criterionUsageLabel,
  duplicateNameMessage,
  findLibraryDuplicate,
  libraryNameKey,
  libraryTabLabel,
  moveValue,
  newLibraryNames,
  normalizeLibraryName,
  renameCollisionMessage,
  scaleWasReordered,
  validateCriterionValues,
  validateLibraryName,
  valueInUseMessage,
} from './index';

/** The library every case below is compared against. */
const LIBRARY = [
  { id: 'cat-react', name: 'React' },
  { id: 'cat-senior', name: 'Senior' },
];

/**
 * TC-H06-UNIT-01 — case-insensitive uniqueness.
 *
 * The load-bearing rule of the whole library: it is what stops `react` joining `React`
 * and quietly halving every future filter's results (06 §01.3).
 */
describe('findLibraryDuplicate', () => {
  it('refuses every case variant of a name already in the library', () => {
    for (const attempt of ['react', 'REACT', 'ReAcT']) {
      expect(findLibraryDuplicate(attempt, LIBRARY)).toEqual({ id: 'cat-react', name: 'React' });
    }
  });

  it('refuses a name that differs only by surrounding whitespace', () => {
    // The padded form is the one a paste produces, and it is the one an exact-match
    // check would let through.
    expect(findLibraryDuplicate('  React  ', LIBRARY)).toEqual({ id: 'cat-react', name: 'React' });
  });

  it('accepts a different name that merely starts the same', () => {
    // `React Native` is a different category, not a case variant of `React`.
    expect(findLibraryDuplicate('React Native', LIBRARY)).toBeNull();
    expect(findLibraryDuplicate('Reactjs', LIBRARY)).toBeNull();
  });

  it('returns the existing entry, so an inline caller can select it instead of failing', () => {
    // The whole reason this answers with the entry rather than a boolean: the vacancy
    // dialog needs the id to select what the member actually meant (06 §01.3).
    expect(findLibraryDuplicate('senior', LIBRARY)?.id).toBe('cat-senior');
  });

  it('lets an entry keep its own name on a rename', () => {
    // Saving `React` as `React` is a no-op, not a collision with itself.
    expect(findLibraryDuplicate('React', LIBRARY, { excludeId: 'cat-react' })).toBeNull();
    // Renaming it onto another entry's name still collides.
    expect(findLibraryDuplicate('senior', LIBRARY, { excludeId: 'cat-react' })?.id).toBe(
      'cat-senior',
    );
  });

  it('treats an empty name as no duplicate — that is a required error, not a collision', () => {
    expect(findLibraryDuplicate('   ', LIBRARY)).toBeNull();
    expect(findLibraryDuplicate(undefined, LIBRARY)).toBeNull();
  });
});

describe('libraryNameKey', () => {
  it('trims and folds case, and nothing else', () => {
    expect(libraryNameKey('  React  ')).toBe('react');
    // Inner spacing is significant: `Full Stack` and `FullStack` are two names.
    expect(libraryNameKey('Full Stack')).toBe('full stack');
    expect(libraryNameKey(null)).toBe('');
  });
});

describe('normalizeLibraryName', () => {
  it('stores the name as typed, with the case preserved', () => {
    // Only the comparison folds case; `Asp.Net` is stored exactly as it was entered.
    expect(normalizeLibraryName('  Asp.Net ')).toBe('Asp.Net');
  });
});

describe('validateLibraryName', () => {
  it('requires a name that is more than whitespace', () => {
    expect(validateLibraryName('   ')).toEqual({
      valid: false,
      error: LIBRARY_MESSAGES.name.required,
    });
  });

  it('caps the name at 50 characters, measured after trimming', () => {
    const longest = 'x'.repeat(LIBRARY_LIMITS.nameMax);
    expect(validateLibraryName(longest)).toEqual({ valid: true, value: longest });
    expect(validateLibraryName(`  ${longest}  `)).toEqual({ valid: true, value: longest });
    expect(validateLibraryName(`${longest}x`)).toEqual({
      valid: false,
      error: LIBRARY_MESSAGES.name.tooLong,
    });
  });
});

describe('newLibraryNames', () => {
  it('drops the names that already exist, whatever their case', () => {
    expect(newLibraryNames(['react', 'Full Stack'], LIBRARY)).toEqual(['Full Stack']);
  });

  it('drops repeats within one request', () => {
    // Two spellings of one new name would otherwise race each other into the same
    // unique index inside a single submit.
    expect(newLibraryNames(['Full Stack', 'full stack', '  FULL STACK'], LIBRARY)).toEqual([
      'Full Stack',
    ]);
  });

  it('ignores blank entries rather than trying to create them', () => {
    expect(newLibraryNames(['  ', ''], LIBRARY)).toEqual([]);
  });
});

describe('messages', () => {
  it('names the collision, and says what to do about it on a rename', () => {
    expect(duplicateNameMessage('React')).toBe('"React" already exists');
    expect(renameCollisionMessage('React')).toBe(
      '"React" already exists. Reassign and delete one instead.',
    );
  });

  it('spells the singular out rather than interpolating it into a plural frame', () => {
    expect(categoryUsageLabel(1)).toBe('1 vacancy');
    expect(categoryUsageLabel(4)).toBe('4 vacancies');
    expect(categoryUsageLabel(0)).toBe('0 vacancies');
  });

  it('puts the usage count in the delete confirmation, because there is no undo', () => {
    expect(categoryDeleteConfirmation('React', 4)).toBe('Delete "React"? It\'s used by 4 vacancies.');
    expect(categoryDeleteConfirmation('Asp.Net', 1)).toBe(
      'Delete "Asp.Net"? It\'s used by 1 vacancy.',
    );
  });

  it('keeps the count in the cell’s accessible name, since the cell paints titles instead', () => {
    expect(categoryUsageDescription(2, ['One', 'Two'])).toBe('Used by 2 vacancies: One, Two');
    expect(categoryUsageDescription(1, ['Senior React Engineer'])).toBe(
      'Used by 1 vacancy: Senior React Engineer',
    );
    expect(categoryUsageDescription(0, [])).toBe('Not used by any vacancy');
  });

  it('names each tab with its whole library’s size', () => {
    expect(libraryTabLabel('categories', 4)).toBe('Categories (4)');
    expect(libraryTabLabel('criteria', 0)).toBe('Criteria (0)');
  });
});

/**
 * TC-H06-UNIT-02 — scale value rules.
 *
 * A scale is the only library entry with structure, and the only one whose structure a
 * later filter reads. All four of these refusals exist so that structure cannot arrive
 * half-formed (06 §Validation.3).
 */
describe('validateCriterionValues', () => {
  const labels = (result: ReturnType<typeof validateCriterionValues>) =>
    result.valid ? result.values.map((value) => `${value.label}@${value.position}`) : result.error;

  it('refuses a scale with no values', () => {
    expect(validateCriterionValues('scale', [])).toEqual({
      valid: false,
      error: 'values_required',
      message: CRITERION_MESSAGES.values.required,
    });
    expect(validateCriterionValues('scale', undefined)).toEqual({
      valid: false,
      error: 'values_required',
      message: CRITERION_MESSAGES.values.required,
    });
  });

  it('compares values case-insensitively, exactly as it compares names', () => {
    expect(validateCriterionValues('scale', [{ label: 'Good' }, { label: 'good' }])).toEqual({
      valid: false,
      error: 'duplicate_value',
      message: CRITERION_MESSAGES.values.duplicate,
    });
    // And a padded repeat, which is the form a paste produces.
    expect(
      validateCriterionValues('scale', [{ label: 'Good' }, { label: '  GOOD ' }]).valid,
    ).toBe(false);
  });

  it('caps a scale at twenty values', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => ({ label: `V${index}` }));
    expect(validateCriterionValues('scale', twenty).valid).toBe(true);
    expect(validateCriterionValues('scale', [...twenty, { label: 'V20' }])).toEqual({
      valid: false,
      error: 'too_many_values',
      message: CRITERION_MESSAGES.values.tooMany,
    });
  });

  it('refuses values on a type that has none', () => {
    // The column that stores a boolean is not the column that stores a scale, so a list
    // of labels beside one is a request that cannot be honoured.
    for (const type of ['boolean', 'number', 'text'] as const) {
      expect(validateCriterionValues(type, [{ label: 'Yes' }])).toEqual({
        valid: false,
        error: 'values_not_allowed',
        message: CRITERION_MESSAGES.values.notAllowed,
      });
      expect(validateCriterionValues(type, [])).toEqual({ valid: true, values: [] });
    }
  });

  it('holds a value to the same 1–50 rule as a library name', () => {
    expect(validateCriterionValues('scale', [{ label: '   ' }])).toEqual({
      valid: false,
      error: 'invalid_value',
      message: LIBRARY_MESSAGES.name.required,
    });
    expect(validateCriterionValues('scale', [{ label: 'x'.repeat(51) }])).toEqual({
      valid: false,
      error: 'invalid_value',
      message: LIBRARY_MESSAGES.name.tooLong,
    });
  });

  it('stores each label as typed and numbers them from zero', () => {
    expect(labels(validateCriterionValues('scale', [{ label: ' A1 ' }, { label: 'A2' }]))).toEqual([
      'A1@0',
      'A2@1',
    ]);
  });

  it('carries an existing value’s id through, so a rename is not a replacement', () => {
    const result = validateCriterionValues('scale', [{ id: 'val-a1', label: 'A1 (beginner)' }]);
    expect(result.valid && result.values).toEqual([
      { id: 'val-a1', label: 'A1 (beginner)', position: 0 },
    ]);
  });
});

/**
 * TC-H06-UNIT-03 — positions are reassigned contiguously on reorder.
 *
 * Two values sharing a position would leave `compareScale` with nothing to resolve them
 * by, and a gap would make "the next one up" mean something different in two scales. The
 * whole list is renumbered on every write, so neither can happen.
 */
describe('moveValue', () => {
  const SCALE = [
    { id: 'val-a1', label: 'A1' },
    { id: 'val-a2', label: 'A2' },
    { id: 'val-b1', label: 'B1' },
  ];

  it('renumbers the whole list when a value moves to the front', () => {
    const moved = moveValue(SCALE, 2, 0);
    const result = validateCriterionValues('scale', moved);

    expect(result.valid && result.values).toEqual([
      { id: 'val-b1', label: 'B1', position: 0 },
      { id: 'val-a1', label: 'A1', position: 1 },
      { id: 'val-a2', label: 'A2', position: 2 },
    ]);
  });

  it('moves a value to the end, and leaves a no-op alone', () => {
    expect(moveValue(SCALE, 0, 2).map((value) => value.id)).toEqual([
      'val-a2',
      'val-b1',
      'val-a1',
    ]);
    expect(moveValue(SCALE, 1, 1)).toEqual(SCALE);
    expect(moveValue(SCALE, 5, 0)).toEqual(SCALE);
  });
});

describe('scaleWasReordered', () => {
  const ORIGINAL = ['val-a1', 'val-a2', 'val-b1'];

  it('is true only when the existing values change order among themselves', () => {
    expect(scaleWasReordered(ORIGINAL, ['val-b1', 'val-a1', 'val-a2'])).toBe(true);
    expect(scaleWasReordered(ORIGINAL, ORIGINAL)).toBe(false);
  });

  it('is false for an addition, wherever it lands', () => {
    // Every existing value keeps its place in the sequence, so every existing comparison
    // keeps its answer — there is nothing retroactive to confirm.
    expect(scaleWasReordered(ORIGINAL, ['val-new', ...ORIGINAL])).toBe(false);
    expect(scaleWasReordered(ORIGINAL, ['val-a1', 'val-new', 'val-a2', 'val-b1'])).toBe(false);
  });

  it('is false for a removal', () => {
    expect(scaleWasReordered(ORIGINAL, ['val-a1', 'val-b1'])).toBe(false);
    // Unless what is left has also been shuffled.
    expect(scaleWasReordered(ORIGINAL, ['val-b1', 'val-a1'])).toBe(true);
  });
});

describe('criteria messages', () => {
  it('spells the singular out, because the count decides archive versus delete', () => {
    expect(criterionUsageLabel(1)).toBe('1 assessment');
    expect(criterionUsageLabel(18)).toBe('18 assessments');
    expect(criterionDeleteBlockedMessage(18)).toBe('Archive this instead — it has 18 assessments');
    expect(valueInUseMessage('A2', 2)).toBe('"A2" is used by 2 assessments');
  });

  it('says why a criterion delete, unlike a category’s, has no count to weigh', () => {
    expect(criterionDeleteConfirmation('Unused')).toBe(
      'Delete "Unused"? No assessments are recorded against it, so nothing else is affected.',
    );
  });

  it('separates a scale with ›, which says the order means something', () => {
    // A comma-separated list reads as a set.
    expect(['A1', 'A2', 'B1'].join(SCALE_SEPARATOR)).toBe('A1 › A2 › B1');
  });
});
