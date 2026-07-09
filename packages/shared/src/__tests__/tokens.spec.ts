import { expiresAt, isExpired, RESET_TOKEN_TTL_MS } from '../tokens';

describe('isExpired — TC-02-UNIT-02: Reset-token expiry calculation', () => {
  const issuedAt = new Date('2026-07-08T12:00:00.000Z');
  const minutesLater = (n: number): Date => new Date(issuedAt.getTime() + n * 60 * 1000);

  it('is still valid at +59 minutes', () => {
    expect(isExpired(issuedAt, RESET_TOKEN_TTL_MS, minutesLater(59))).toBe(false);
  });

  it('is expired at +61 minutes', () => {
    expect(isExpired(issuedAt, RESET_TOKEN_TTL_MS, minutesLater(61))).toBe(true);
  });

  it('is expired exactly at the 60-minute boundary (inclusive)', () => {
    expect(isExpired(issuedAt, RESET_TOKEN_TTL_MS, minutesLater(60))).toBe(true);
  });

  it('works with an arbitrary TTL', () => {
    const ttl = 5 * 60 * 1000; // 5 minutes
    expect(isExpired(issuedAt, ttl, minutesLater(4))).toBe(false);
    expect(isExpired(issuedAt, ttl, minutesLater(6))).toBe(true);
  });
});

describe('expiresAt', () => {
  it('returns issuedAt + ttl', () => {
    const issuedAt = new Date('2026-07-08T12:00:00.000Z');
    expect(expiresAt(issuedAt, RESET_TOKEN_TTL_MS).toISOString()).toBe('2026-07-08T13:00:00.000Z');
  });
});
