'use client';

/**
 * The Members column on the projects list (spec 11 design — "avatar stack + count").
 *
 * The list endpoint (`GET .../projects`) returns only `memberCount`, not the members
 * themselves, so this renders up to three overlapping `--accent-soft` circles as a
 * decorative stack (no initials — the list has no per-member data to show) followed by
 * the "{n} members" microcopy (singular "1 member"). A dedicated DS `AvatarStack` over
 * real avatar data is the carried-forward gap; here the count is the honest signal.
 */
export function AvatarStack({ count }: { count: number }) {
  const shown = Math.max(0, Math.min(count, 3));
  const label = count === 1 ? '1 member' : `${count} members`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
      {shown > 0 && (
        <div style={{ display: 'flex' }} aria-hidden>
          {Array.from({ length: shown }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: 'var(--accent-soft)',
                border: '2px solid var(--bg-panel)',
                marginLeft: i === 0 ? 0 : -6,
              }}
            />
          ))}
        </div>
      )}
      <span
        style={{
          fontFamily: 'var(--font-text)',
          fontSize: 'var(--fs-13)',
          color: 'var(--text-sub)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
}
