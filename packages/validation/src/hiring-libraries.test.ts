import { describe, expect, it } from 'vitest';
import {
  LIBRARY_LIMITS,
  LIBRARY_MESSAGES,
  categoryDeleteConfirmation,
  categoryUsageLabel,
  duplicateNameMessage,
  findLibraryDuplicate,
  libraryNameKey,
  newLibraryNames,
  normalizeLibraryName,
  renameCollisionMessage,
  validateLibraryName,
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
});
