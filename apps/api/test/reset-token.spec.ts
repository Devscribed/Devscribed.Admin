import {
  RESET_TOKEN_TTL_MINUTES,
  generateResetToken,
  hashResetToken,
  isResetTokenUsable,
  resetTokenExpiry,
} from '../src/auth/reset-token';

const T = new Date('2026-07-22T12:00:00.000Z');
const minutesAfter = (base: Date, minutes: number) =>
  new Date(base.getTime() + minutes * 60_000);

const usable = { expiresAt: minutesAfter(T, RESET_TOKEN_TTL_MINUTES), usedAt: null, isInvalidated: false };

describe('reset token generation', () => {
  it('produces a URL-safe token with no padding', () => {
    const { token } = generateResetToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('=');
  });

  it('carries 32 bytes of entropy', () => {
    const { token } = generateResetToken();

    // 32 bytes → ceil(32/3)*4 = 44 base64 chars, minus one '=' of padding.
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateResetToken().token));

    expect(tokens.size).toBe(50);
  });

  it('stores only a SHA-256 hash, never the token itself', () => {
    const { token, tokenHash } = generateResetToken();

    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashResetToken(token)).toBe(tokenHash);
  });

  it('hashes deterministically, so a presented token can be looked up', () => {
    expect(hashResetToken('abc')).toBe(hashResetToken('abc'));
    expect(hashResetToken('abc')).not.toBe(hashResetToken('abd'));
  });
});

// TC-02-UNIT-02
describe('TC-02-UNIT-02 reset-token expiry', () => {
  it('expires exactly 60 minutes after issuance', () => {
    expect(resetTokenExpiry(T)).toEqual(minutesAfter(T, 60));
  });

  it('is still valid at +59 minutes', () => {
    expect(isResetTokenUsable(usable, minutesAfter(T, 59))).toBe(true);
  });

  it('is expired at exactly +60 minutes — expiry is exclusive', () => {
    expect(isResetTokenUsable(usable, minutesAfter(T, 60))).toBe(false);
  });

  it('is expired at +61 minutes', () => {
    expect(isResetTokenUsable(usable, minutesAfter(T, 61))).toBe(false);
  });
});

describe('reset-token usability', () => {
  it('rejects a token that has already been spent', () => {
    expect(isResetTokenUsable({ ...usable, usedAt: minutesAfter(T, 1) }, minutesAfter(T, 2))).toBe(
      false,
    );
  });

  it('rejects a token superseded by a newer request', () => {
    expect(isResetTokenUsable({ ...usable, isInvalidated: true }, minutesAfter(T, 1))).toBe(false);
  });

  it('accepts a fresh, unused, uninvalidated token', () => {
    expect(isResetTokenUsable(usable, T)).toBe(true);
  });
});
