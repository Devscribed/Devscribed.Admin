import { describe, expect, it } from 'vitest';
import {
  APPLICATION_LIMITS,
  APPLICATION_STATUS_LABELS,
  HIRING_MESSAGES,
  ASSESSMENT_COLUMN,
  SCALE_OPERATORS,
  applicationStatusOptions,
  compareScale,
  formatShortDate,
  formatShortWhen,
  scalePosition,
  validateApplicationPatch,
  validateAssessment,
} from './index';

describe('validateApplicationPatch', () => {
  it('accepts any subset, leaving absent fields alone', () => {
    expect(validateApplicationPatch({ interviewNotes: 'Strong on hooks.' })).toEqual({
      valid: true,
      value: { interviewNotes: 'Strong on hooks.' },
    });
    expect(validateApplicationPatch({ status: 'passed' })).toEqual({
      valid: true,
      value: { status: 'passed' },
    });
    expect(validateApplicationPatch({})).toEqual({ valid: true, value: {} });
  });

  it('keeps the text exactly as it was typed', () => {
    // Not trimmed: an autosave that tidied the newline someone had just typed would
    // change the text under their cursor mid-interview.
    const notes = '\n  Walked through a real migration.\n\n';
    expect(validateApplicationPatch({ interviewNotes: notes })).toEqual({
      valid: true,
      value: { interviewNotes: notes },
    });
  });

  it('treats null as clearing the field', () => {
    expect(validateApplicationPatch({ conclusion: null })).toEqual({
      valid: true,
      value: { conclusion: '' },
    });
  });

  it('refuses a status outside the five board columns', () => {
    expect(validateApplicationPatch({ status: 'shortlisted' })).toEqual({
      valid: false,
      error: 'invalid_status',
    });
    expect(validateApplicationPatch({ status: 'open' })).toEqual({
      valid: false,
      error: 'invalid_status',
    });
  });

  it('refuses text past its own limit, naming the field', () => {
    const notes = 'x'.repeat(APPLICATION_LIMITS.interviewNotesMax + 1);
    expect(validateApplicationPatch({ interviewNotes: notes })).toEqual({
      valid: false,
      error: 'too_long',
      fields: { interviewNotes: HIRING_MESSAGES.card.notesTooLong },
    });

    const conclusion = 'x'.repeat(APPLICATION_LIMITS.conclusionMax + 1);
    expect(validateApplicationPatch({ conclusion })).toEqual({
      valid: false,
      error: 'too_long',
      fields: { conclusion: HIRING_MESSAGES.card.conclusionTooLong },
    });
  });

  it('accepts text exactly at the limit', () => {
    const notes = 'x'.repeat(APPLICATION_LIMITS.interviewNotesMax);
    expect(validateApplicationPatch({ interviewNotes: notes }).valid).toBe(true);
  });

  it('refuses a body whose notes are not text', () => {
    expect(validateApplicationPatch({ interviewNotes: 42 })).toEqual({
      valid: false,
      error: 'invalid_body',
    });
  });
});

describe('applicationStatusOptions', () => {
  it('offers the five columns in board order, labelled as the board labels them', () => {
    expect(applicationStatusOptions()).toEqual([
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'didnt_pass', label: "Didn't pass" },
      { value: 'maybe', label: 'Maybe' },
      { value: 'passed', label: 'Passed' },
      { value: 'offer', label: 'Offer' },
    ]);
    expect(APPLICATION_STATUS_LABELS.didnt_pass).toBe("Didn't pass");
  });
});

describe('card date formats', () => {
  const instant = new Date('2026-08-26T11:00:00.000Z');

  it('renders the interview line in the reader’s zone, 24-hour', () => {
    expect(formatShortWhen(instant, 'Europe/Minsk')).toBe('Wed 26 Aug 2026, 14:00');
    expect(formatShortWhen(instant, 'UTC')).toBe('Wed 26 Aug 2026, 11:00');
  });

  it('renders the collapsed summary date in the same zone', () => {
    expect(formatShortDate(instant, 'Europe/Minsk')).toBe('26 Aug 2026');
    // Late enough in the day that a western zone is still on the previous date.
    expect(formatShortDate(new Date('2026-08-26T01:00:00.000Z'), 'America/Los_Angeles')).toBe(
      '25 Aug 2026',
    );
  });
});

/**
 * TC-H04-UNIT-01 — exactly one value column, matching the criterion's type.
 *
 * The rule the whole candidate database rests on: every filter in spec 03 is a plain
 * indexed comparison on one of four columns, and it can only stay that way while nothing
 * ever lands in the wrong one (04 §05.23).
 */
describe('validateAssessment', () => {
  it('stores each type in its own column', () => {
    expect(validateAssessment('scale', { valueId: 'val-b2' })).toEqual({
      valid: true,
      column: 'valueId',
      value: 'val-b2',
    });
    expect(validateAssessment('boolean', { valueBool: true })).toEqual({
      valid: true,
      column: 'valueBool',
      value: true,
    });
    expect(validateAssessment('number', { valueNumber: 7 })).toEqual({
      valid: true,
      column: 'valueNumber',
      value: 7,
    });
    expect(validateAssessment('text', { valueText: 'Ships on Fridays' })).toEqual({
      valid: true,
      column: 'valueText',
      value: 'Ships on Fridays',
    });
  });

  it('refuses a value in the wrong column for the type', () => {
    // A scale is an id into its own ordered list; text against one is not a lower-grade
    // answer, it is a different question.
    expect(validateAssessment('scale', { valueText: 'B2' })).toEqual({
      valid: false,
      error: 'type_mismatch',
      message: HIRING_MESSAGES.card.criterionTypeMismatch,
    });
    expect(validateAssessment('boolean', { valueNumber: 1 }).valid).toBe(false);
    expect(validateAssessment('number', { valueText: '7' }).valid).toBe(false);
    expect(validateAssessment('text', { valueBool: true }).valid).toBe(false);
  });

  it('refuses two value columns at once rather than picking the matching one', () => {
    // Resolving it would silently accept a request nobody meant to send.
    expect(validateAssessment('scale', { valueId: 'val-b2', valueText: 'B2' })).toEqual({
      valid: false,
      error: 'type_mismatch',
      message: HIRING_MESSAGES.card.criterionTypeMismatch,
    });
    expect(validateAssessment('boolean', { valueBool: true, valueNumber: 1 }).valid).toBe(false);
  });

  it('refuses an empty request — an assessment with no value is not one', () => {
    expect(validateAssessment('number', {}).valid).toBe(false);
    expect(validateAssessment('boolean', { valueBool: null }).valid).toBe(false);
  });

  it('insists a number is a number, not a string holding one', () => {
    // `"7"` sorts as text, which would quietly break every `>=` spec 03 runs.
    expect(validateAssessment('number', { valueNumber: '7' }).valid).toBe(false);
    expect(validateAssessment('number', { valueNumber: 0 }).valid).toBe(true);
    expect(validateAssessment('number', { valueNumber: -2.5 }).valid).toBe(true);
  });

  it('caps free text at 500 characters without truncating it', () => {
    const longest = 'x'.repeat(APPLICATION_LIMITS.criterionTextMax);
    expect(validateAssessment('text', { valueText: longest })).toEqual({
      valid: true,
      column: 'valueText',
      value: longest,
    });
    expect(validateAssessment('text', { valueText: `${longest}x` })).toEqual({
      valid: false,
      error: 'too_long',
      message: HIRING_MESSAGES.card.criterionTextTooLong,
    });
  });

  it('keeps every type pointed at its own column', () => {
    expect(ASSESSMENT_COLUMN).toEqual({
      scale: 'valueId',
      boolean: 'valueBool',
      number: 'valueNumber',
      text: 'valueText',
    });
  });
});

/**
 * TC-H04-UNIT-03 — scale values compare by position, never by label.
 *
 * This is what makes renaming a value free and reordering one retroactive, and therefore
 * why the criterion dialog confirms a reorder and nothing else (06 §03.15, §03.16).
 */
describe('compareScale', () => {
  /** CEFR at positions 0–5, as the library stores it. */
  const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((label, position) => ({
    id: `val-${label}`,
    label,
    position,
  }));

  const at = (label: string) => scalePosition(CEFR, `val-${label}`);

  it('answers "at least B1" from the positions alone', () => {
    expect(compareScale('at_least', at('B2'), at('B1'))).toBe(true);
    expect(compareScale('at_least', at('A2'), at('B1'))).toBe(false);
    expect(compareScale('at_most', at('A2'), at('B1'))).toBe(true);
    expect(compareScale('is', at('B1'), at('B1'))).toBe(true);
    expect(compareScale('is_not', at('B2'), at('B1'))).toBe(true);
  });

  it('is unchanged when a value is renamed', () => {
    // The stored assessment and the stored threshold are both ids, so the label is not
    // an input to any of this — renaming `B1` cannot move anybody across a filter.
    const renamed = CEFR.map((value) =>
      value.label === 'B1' ? { ...value, label: 'B1 (intermediate)' } : value,
    );
    expect(compareScale('at_least', scalePosition(renamed, 'val-B2'), scalePosition(renamed, 'val-B1'))).toBe(
      true,
    );
    expect(compareScale('at_least', scalePosition(renamed, 'val-A2'), scalePosition(renamed, 'val-B1'))).toBe(
      false,
    );
  });

  it('matches no operator at all when there is no assessment', () => {
    // Including the negative ones: "not B1" is a claim about somebody who was assessed,
    // and a candidate nobody assessed has not made it (03 §Acceptance).
    for (const operator of SCALE_OPERATORS) {
      expect(compareScale(operator, null, at('B1'))).toBe(false);
    }
    // A value that has since been removed from the scale reads the same way.
    expect(scalePosition(CEFR, 'val-gone')).toBeNull();
  });
});
