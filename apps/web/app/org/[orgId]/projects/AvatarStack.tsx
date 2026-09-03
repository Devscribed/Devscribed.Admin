'use client';

import { Avatar } from '@devscribed/ds';
import type { ProjectMemberPreview } from './types';

/**
 * The Members column on the projects list (spec 11 design — "avatar stack + count").
 *
 * It stays app-local, and three overlapping `Avatar`s beside a count is why: the component
 * here is the *layout*, and the only thing in it the design system does not already own is
 * the overlap. §93 draws the person.
 *
 * **The marks carry real people now.** Until this merge the list endpoint returned
 * `memberCount` and nothing else, so this drew blank discs — three of them whatever the
 * count was, on a mark that means a specific person on five other screens. `memberPreview`
 * is what fixed that, and it is a sample rather than a length: at most three come back, and
 * the count beside them is what says how many there really are. No `+N` bubble, because the
 * number is already written in words next to it.
 *
 * Every mark is `decorative`. The names are not written on this row, but the *count* is, and
 * the count is what the column is for — a reader who cannot see the discs is told "3 members"
 * and has lost nothing, whereas three names announced before it would be three interruptions
 * in front of the fact.
 */
export function AvatarStack({
  count,
  members,
}: {
  count: number;
  members: ProjectMemberPreview[];
}) {
  const label = count === 1 ? '1 member' : `${count} members`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', minWidth: 0 }}>
      {members.length > 0 && (
        <div style={{ display: 'flex' }}>
          {members.map((member, i) => (
            <Avatar
              key={`${member.name}-${i}`}
              name={member.name}
              initials={member.initials}
              decorative
              size={26}
              style={{
                /* The ring is the card the row sits on, so the discs read as separated
                   rather than merged where they overlap.
                   @literal 2px ring and -6px overlap: both are proportions of this one
                   26px mark, not steps on the spacing scale. */
                boxShadow: '0 0 0 2px var(--surface-card)',
                marginLeft: i === 0 ? 0 : -6,
              }}
            />
          ))}
        </div>
      )}
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
}
