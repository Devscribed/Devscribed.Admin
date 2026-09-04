import React from 'react';

export interface BookingLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The organization's name, drawn above the column at the headline-4 step. A node when a
   * caller needs one — unlike `AuthLayout`, this shell does not own the mark it draws.
   */
  wordmark?: React.ReactNode;
  /** §46 — test id for that node. The shell draws it, so only the shell can tag it. */
  wordmarkTestId?: string;
  /**
   * §78 — raises the column cap for a surface that is not prose. Off by default, because the
   * default is the right one for everything the caller writes themselves.
   */
  wide?: boolean;
  children?: React.ReactNode;
}

/**
 * BookingLayout — §46. The public shell, for the screens a candidate reaches without a session.
 *
 * It is `AuthLayout` (§11) with two things changed, and both changes are the same fact about
 * who the page belongs to:
 *
 * - **No card.** `AuthLayout` is one 480px panel because a login form is one panel. These
 *   screens compose their own `Card`s — a date grid beside a slot list beside a form — so the
 *   shell supplies the well, the column and the rhythm, and nothing else. The column is 880px,
 *   which is what two `1fr 1fr` picker cards need to sit side by side.
 * - **The wordmark is the caller's.** `AuthLayout` draws this product's own mark, because the
 *   person looking at it is signing in to this product. A candidate booking with an
 *   organisation is looking at *that* organisation's page, so the name is content and the shell
 *   takes it — drawn at the headline-4 step in `--text-primary`. `wordmarkTestId` follows §16's
 *   `nameTestId` and §21's `chipTestId`: the shell draws the node, so only the shell can tag it.
 *
 * Everything else is `AuthLayout`'s, deliberately — the `#f8fafc` well `AppShell` paints, the
 * 40px/16px page padding, the 30px gap under the wordmark. A candidate who books and then comes
 * back through the link in their invite must land on the page they recognise, and the public
 * screens share this shell for exactly that reason.
 *
 * §78 — **`wide`, for a surface this product did not draw.** The signing page embeds a
 * provider's widget, which renders a whole page of a contract inside itself; at the 880px
 * column that page is a stamp in the middle of an empty screen. So `wide` raises the cap, and
 * `clamp` carries it there rather than a breakpoint — there is no width at which a document
 * should suddenly jump. It also closes the gap under the wordmark, for the same one reason the
 * width changes: the widget brings its own header, its own toolbar and its own name for the
 * document, so every band above it pushes the thing the reader came for further down a screen
 * it already fills. The caller's own prose keeps the air; a surface that is already a page
 * does not need ours.
 */
export function BookingLayout({ wordmark, wordmarkTestId, wide = false, style, children, ...rest }: BookingLayoutProps) {
  return (
    <div
      {...rest}
      style={{
        minHeight: '100vh', width: '100%', boxSizing: 'border-box',
        background: 'var(--surface-well)',
        padding: 'var(--space-12) var(--space-6)',
        /* Top-aligned, where `AuthLayout` centres: a login card is short and a booking page is
           taller than the viewport, so centring would push the vacancy title off the top. */
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: wide ? 'var(--space-6)' : 'var(--space-10)',
        fontFamily: 'var(--font-family-base)',
        ...style,
      }}
    >
      {wordmark && (
        <div
          data-testid={wordmarkTestId}
          style={{
            fontWeight: 'var(--headline-4-weight)', fontSize: 'var(--headline-4-size)',
            lineHeight: 'var(--headline-4-line)', letterSpacing: 'var(--headline-4-tracking)',
            color: 'var(--text-primary)', textAlign: 'center',
          }}
        >
          {wordmark}
        </div>
      )}
      <div
        style={{
          width: '100%', boxSizing: 'border-box',
          /* @literal §46's column is 880 — what two `1fr 1fr` picker cards need side by side —
             and §78's cap is 1180, which is a page of a contract at a readable size. Both are
             measures of the content, not steps on the spacing scale, and there is no token
             that could move them without moving something unrelated. */
          maxWidth: wide ? 'clamp(880px, 100%, 1180px)' : 880,
        }}
      >
        {children}
      </div>
    </div>
  );
}
