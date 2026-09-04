'use client';

import { Popover } from '@devscribed/ds';
import type { Member } from './types';

/**
 * The per-row "⋮" menu (spec 04, requirements 6-9). Never rendered for the caller's own
 * row — `MembersTable` omits it, so there is no "menu without Delete" state to build.
 *
 * It was 170 lines: a trigger, an open/outside-click/Escape effect, a `createPortal` into
 * `document.body` and a hand-measured `getBoundingClientRect` position, all because no
 * dropdown-menu primitive existed. `Popover` is that primitive (§22), it is a real
 * `role="menu"` with keyboard handling, and §55 is the portal — written for exactly the
 * problem this file solved by hand, that a menu inside a table's clipped rows is a menu
 * whose last row nobody can reach.
 *
 * The last-admin guard keeps its shape and gains a reason a keyboard can hear: §22's
 * `disabled` is shown-and-blocked rather than removed, and §62 puts the reason in a bubble
 * on hover **and on focus**, with the text always in the tree so `aria-describedby`
 * resolves. It used to be a `title` attribute, which the one person who could not see the
 * dimmed row was also the one who could not reach.
 */
export function MemberRowActions({
  member,
  onDeleteRequest,
  onRestore,
}: {
  member: Member;
  onDeleteRequest: (member: Member) => void;
  onRestore: (member: Member) => void;
}) {
  const removed = member.status === 'removed';

  return (
    <Popover
      label={`Actions for ${member.fullName}`}
      // The row navigates to the member's detail page, and pressing the kebab is not
      // opening the row. `Popover` forwards rest props onto the trigger, so this marks the
      // button and `MembersTable`'s row handler finds it with `closest` — not a
      // `stopPropagation`, because the menu is a portal (§55) and its rows are not inside
      // the row at all.
      data-row-actions=""
      data-testid={`member-row-actions-${member.id}`}
      items={
        removed
          ? [
              {
                key: 'restore',
                label: 'Restore',
                testId: 'member-action-restore',
                onSelect: () => onRestore(member),
              },
            ]
          : [
              {
                key: 'delete',
                label: 'Delete',
                danger: true,
                testId: 'member-action-delete',
                disabled: member.isLastAdmin,
                tooltip: member.isLastAdmin ? 'Cannot remove the last admin' : undefined,
                tooltipTestId: 'delete-guard-message',
                onSelect: () => onDeleteRequest(member),
              },
            ]
      }
    />
  );
}
