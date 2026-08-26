import { describe, expect, it } from 'vitest';
import {
  APPLICATION_LIMITS,
  APPLICATION_STATUS_LABELS,
  HIRING_MESSAGES,
  applicationStatusOptions,
  formatShortDate,
  formatShortWhen,
  validateApplicationPatch,
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
