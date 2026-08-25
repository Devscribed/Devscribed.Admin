import { describe, expect, it } from 'vitest';
import {
  HIRING_MESSAGES,
  SLUG_MAX_LENGTH,
  SLUG_SUFFIX_LENGTH,
  generateVacancySlug,
  slugifyTitle,
  validateCv,
  validateDurationMinutes,
  validateVacancyDescription,
  validateVacancyTitle,
} from './index';

/** TC-H01-UNIT-01 — slug generation is unique, frozen, and slug-safe. */
describe('generateVacancySlug', () => {
  it('gives two vacancies with the same title different slugs', () => {
    const first = generateVacancySlug('Senior React Engineer');
    const second = generateVacancySlug('Senior React Engineer');

    expect(first.startsWith('senior-react-engineer-')).toBe(true);
    expect(second.startsWith('senior-react-engineer-')).toBe(true);
    expect(first).not.toBe(second);
  });

  it('falls back to "vacancy" when the title has no slug-safe characters', () => {
    const slug = generateVacancySlug('  Ведущий инженер  ');

    expect(slug.startsWith('vacancy-')).toBe(true);
    expect(slug.slice('vacancy-'.length)).toHaveLength(SLUG_SUFFIX_LENGTH);
  });

  it('truncates the base of a long title but never the suffix', () => {
    const slug = generateVacancySlug('Senior '.repeat(30).trim());

    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    // The suffix is what carries the 72 bits; truncation must not touch it. Taken by
    // length rather than by splitting — base64url's alphabet includes '-' itself.
    expect(slug.slice(-(SLUG_SUFFIX_LENGTH + 1))).toMatch(/^-[A-Za-z0-9_-]{12}$/);
  });

  it('folds accents rather than dropping the word', () => {
    expect(slugifyTitle('Développeur Sénior')).toBe('developpeur-senior');
  });
});

/** TC-H01-UNIT-02 — duration accepts only the four documented lengths. */
describe('validateDurationMinutes', () => {
  it('accepts 15, 30, 45 and 60', () => {
    for (const minutes of [15, 30, 45, 60]) {
      expect(validateDurationMinutes(minutes)).toEqual({ valid: true, value: minutes });
    }
  });

  it('rejects everything else, including the string "60"', () => {
    for (const input of [0, 20, 90, '60', null]) {
      expect(validateDurationMinutes(input)).toEqual({
        valid: false,
        error: HIRING_MESSAGES.vacancy.duration.required,
      });
    }
  });
});

/** TC-H01-UNIT-03 — title and description length rules. */
describe('vacancy text fields', () => {
  it('treats a whitespace-only title as missing', () => {
    expect(validateVacancyTitle('   ')).toEqual({
      valid: false,
      error: HIRING_MESSAGES.vacancy.title.required,
    });
  });

  it('accepts 100 characters and rejects 101', () => {
    expect(validateVacancyTitle('a'.repeat(100)).valid).toBe(true);
    expect(validateVacancyTitle('a'.repeat(101))).toEqual({
      valid: false,
      error: HIRING_MESSAGES.vacancy.title.tooLong,
    });
  });

  it('accepts a 5000-character description and rejects 5001', () => {
    expect(validateVacancyDescription('a'.repeat(5000)).valid).toBe(true);
    expect(validateVacancyDescription('a'.repeat(5001))).toEqual({
      valid: false,
      error: HIRING_MESSAGES.vacancy.description.tooLong,
    });
  });

  it('treats an absent description as valid and empty', () => {
    expect(validateVacancyDescription(undefined)).toEqual({ valid: true, value: '' });
  });
});

/** TC-H02-UNIT-07 — CV validation. */
describe('validateCv', () => {
  const MB = 1024 * 1024;

  it('accepts a PDF, and matches the extension case-insensitively', () => {
    expect(validateCv({ fileName: 'cv.pdf', sizeBytes: MB })).toEqual({ valid: true });
    expect(validateCv({ fileName: 'cv.DOCX', sizeBytes: 9.9 * MB })).toEqual({ valid: true });
  });

  it('rejects an unsupported type', () => {
    expect(validateCv({ fileName: 'cv.pages', sizeBytes: MB })).toEqual({
      valid: false,
      error: HIRING_MESSAGES.booking.cv.unsupportedType,
    });
  });

  it('rejects a file over 10 MB', () => {
    expect(validateCv({ fileName: 'cv.pdf', sizeBytes: 10.1 * MB })).toEqual({
      valid: false,
      error: HIRING_MESSAGES.booking.cv.tooLarge,
    });
  });

  it('rejects an empty file', () => {
    expect(validateCv({ fileName: 'cv.txt', sizeBytes: 0 })).toEqual({
      valid: false,
      error: HIRING_MESSAGES.booking.cv.empty,
    });
  });

  it('rejects a missing file', () => {
    expect(validateCv(null)).toEqual({
      valid: false,
      error: HIRING_MESSAGES.booking.cv.required,
    });
  });
});
