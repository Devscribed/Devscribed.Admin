import {
  INVITATION_TOKEN_TTL_DAYS,
  generateInvitationToken,
  hashInvitationToken,
  invitationTokenExpiry,
  isInvitationTokenUsable,
} from '../src/invitations/invitation-token';

const T = new Date('2026-07-22T12:00:00.000Z');
const daysAfter = (base: Date, days: number) => new Date(base.getTime() + days * 24 * 60 * 60_000);
const hoursAfter = (base: Date, hours: number) => new Date(base.getTime() + hours * 60 * 60_000);
const minutesAfter = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);

describe('invitation token generation', () => {
  it('produces a URL-safe token with no padding', () => {
    const { token } = generateInvitationToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('=');
  });

  it('carries 32 bytes of entropy', () => {
    const { token } = generateInvitationToken();

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateInvitationToken().token));

    expect(tokens.size).toBe(50);
  });

  it('stores only a SHA-256 hash, never the token itself', () => {
    const { token, tokenHash } = generateInvitationToken();

    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashInvitationToken(token)).toBe(tokenHash);
  });

  it('hashes deterministically, so a presented token can be looked up', () => {
    expect(hashInvitationToken('abc')).toBe(hashInvitationToken('abc'));
    expect(hashInvitationToken('abc')).not.toBe(hashInvitationToken('abd'));
  });
});

// TC-03-UNIT-02
describe('TC-03-UNIT-02 invitation token expiry', () => {
  it('expires exactly 7 days after issuance', () => {
    expect(invitationTokenExpiry(T)).toEqual(daysAfter(T, INVITATION_TOKEN_TTL_DAYS));
  });

  it('is still acceptable at +6 days 23 hours', () => {
    const usable = { expiresAt: invitationTokenExpiry(T), status: 'pending' };
    const now = hoursAfter(daysAfter(T, 6), 23);
    expect(isInvitationTokenUsable(usable, now)).toBe(true);
  });

  it('is expired at exactly +7 days — expiry is exclusive', () => {
    const usable = { expiresAt: invitationTokenExpiry(T), status: 'pending' };
    expect(isInvitationTokenUsable(usable, daysAfter(T, 7))).toBe(false);
  });

  it('is expired at +7 days 1 minute', () => {
    const usable = { expiresAt: invitationTokenExpiry(T), status: 'pending' };
    expect(isInvitationTokenUsable(usable, minutesAfter(daysAfter(T, 7), 1))).toBe(false);
  });
});

describe('invitation token usability', () => {
  const usable = { expiresAt: daysAfter(T, 7), status: 'pending' };

  it('rejects a used token', () => {
    expect(isInvitationTokenUsable({ ...usable, status: 'used' }, T)).toBe(false);
  });

  it('rejects an invalidated token', () => {
    expect(isInvitationTokenUsable({ ...usable, status: 'invalidated' }, T)).toBe(false);
  });

  it('accepts a fresh, pending token', () => {
    expect(isInvitationTokenUsable(usable, T)).toBe(true);
  });
});
