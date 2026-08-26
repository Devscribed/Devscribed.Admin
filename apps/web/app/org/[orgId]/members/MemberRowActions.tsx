'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/ds';
import { DotsIcon } from '@/layout/icons';
import type { Member } from './types';

/**
 * The per-row "⋮" menu (spec 04, requirements 6-9 / the Screens section's Actions
 * column). Never rendered for the caller's own row — `MembersTable` simply omits it,
 * so there is no "menu without Delete" state to build; the row has no menu at all.
 *
 * Follows the same open/outside-click/Escape pattern as `Topbar`'s account menu —
 * no dedicated dropdown-menu primitive exists in the design system yet (see this
 * spec's design doc, DS gaps).
 *
 * The dropdown itself is portaled to `document.body` and positioned from the
 * trigger's `getBoundingClientRect()`. The DS `Table` clips its rows with
 * `overflow: hidden` (for its rounded corners), so a plain `position: absolute`
 * dropdown nested inside a row gets cut off by the table's own border instead of
 * floating above it — portaling is what lets the menu render on top of everything.
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
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (container.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const isRemoved = member.status === 'removed';

  const toggle = () => {
    if (!open && container.current) {
      const rect = container.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((was) => !was);
  };

  return (
    // Row clicks navigate to the member detail page (spec 04 requirement 1); the
    // whole menu — trigger and dropdown alike — must stay outside that, or opening
    // it (or clicking an item) would also fire the row's navigation. Portaled
    // content still bubbles React events through this component's position in the
    // React tree (not the DOM tree), so this still catches clicks from inside the
    // portaled menu below.
    <div ref={container} style={{ position: 'relative' }} onClick={(event) => event.stopPropagation()}>
      <IconButton
        label="Actions"
        data-testid={`member-row-actions-${member.id}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <DotsIcon />
      </IconButton>

      {open && position && createPortal(
        <div
          ref={menu}
          role="menu"
          style={{
            position: 'fixed',
            top: position.top,
            right: position.right,
            minWidth: 190,
            padding: 4,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-card)',
            zIndex: 60,
          }}
        >
          {isRemoved ? (
            <button
              type="button"
              role="menuitem"
              data-testid="member-action-restore"
              onClick={() => {
                setOpen(false);
                onRestore(member);
              }}
              style={menuItemStyle()}
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              data-testid="member-action-delete"
              disabled={member.isLastAdmin}
              title={member.isLastAdmin ? 'Cannot remove the last admin' : undefined}
              aria-disabled={member.isLastAdmin || undefined}
              onClick={() => {
                if (member.isLastAdmin) return;
                setOpen(false);
                onDeleteRequest(member);
              }}
              style={menuItemStyle(member.isLastAdmin)}
            >
              <span>Delete</span>
              {member.isLastAdmin && (
                <span
                  data-testid="delete-guard-message"
                  style={{
                    display: 'block',
                    marginTop: 2,
                    fontFamily: 'var(--font-text)',
                    fontSize: 'var(--fs-12)',
                    color: 'var(--text-muted)',
                  }}
                >
                  Cannot remove the last admin
                </span>
              )}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function menuItemStyle(disabled?: boolean): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    fontFamily: 'var(--font-text)',
    fontSize: 'var(--fs-14)',
    color: 'var(--text-sub)',
  };
}
