'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from './session-context';

/**
 * The template's top bar also carries a tracker chip and a light/dark switch. Neither
 * ships here: timesheets belong to a product surface no spec covers, and the design
 * specs pin this release to the light theme with no theme toggle.
 */
export function Topbar() {
  const { account } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const name = `${account.firstName} ${account.lastName}`;
  const initials = `${account.firstName.charAt(0)}${account.lastName.charAt(0)}`.toUpperCase();

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
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

  async function logout(): Promise<void> {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    // replace, not push: the signed-in URL must not sit in history behind the login screen.
    router.replace('/login');
  }

  return (
    <header className="shell-topbar">
      <div ref={container} style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="topbar-account-button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          <span
            data-testid="topbar-account-name"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: 'var(--fs-14)',
            }}
          >
            {name}
          </span>
          <span
            aria-hidden
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-14)',
            }}
          >
            {initials}
          </span>
        </button>

        {open && (
          <div
            role="menu"
            data-testid="topbar-account-menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              minWidth: 180,
              padding: 6,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-card)',
              zIndex: 10,
            }}
          >
            <button
              type="button"
              role="menuitem"
              data-testid="logout-button"
              onClick={logout}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-14)',
                color: 'var(--text-sub)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--hover-bg-tint)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
