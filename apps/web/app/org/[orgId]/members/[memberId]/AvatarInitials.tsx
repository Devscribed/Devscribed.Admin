'use client';

/**
 * Initials-only avatar placeholder (spec 05 requirement 4). The API supplies the
 * initials themselves (`avatarInitials`) — computing "AK" from a name is a server
 * concern shared with `@devscribed/validation`'s `getAvatarInitials`. The background
 * color is purely presentational and the API contract has no field for it, so it is
 * derived here from the member's full name via a deterministic hash: the same
 * hue-from-name-sum formula the Meridian product template already uses for this exact
 * screen (`1_DS for dev/templates/meridian-app/MeridianApp.dc.html`, `avaEl`) — reused
 * for visual consistency with that ground-truth reference rather than inventing a new
 * palette.
 */
export function AvatarInitials({
  fullName,
  initials,
  size = 64,
  'data-testid': dataTestId = 'member-detail-avatar',
}: {
  fullName: string;
  initials: string;
  size?: number;
  /** Overridable so callers (e.g. the Requests page cards) can scope the avatar's
   * testid; defaults to the member-detail value so existing call sites are unaffected. */
  'data-testid'?: string;
}) {
  const hue = hashHue(fullName);
  return (
    <div
      data-testid={dataTestId}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: `oklch(0.9 0.07 ${hue})`,
        color: `oklch(0.42 0.14 ${hue})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: Math.round(size * 0.36),
      }}
    >
      {initials}
    </div>
  );
}

/** Sum of char codes × 7, mod 360 — a simple, deterministic name → hue hash. */
function hashHue(fullName: string): number {
  let sum = 0;
  for (const ch of fullName) sum += ch.charCodeAt(0);
  return (sum * 7) % 360;
}
