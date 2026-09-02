import React from 'react';

export interface AuthLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Card heading, rendered as the page's `<h1>` at the headline-5 step. */
  title?: string;
  /** One line under the title. */
  subtitle?: string;
  /** Cross-account link, drawn under the card rather than inside it. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

/* The same mark Sidebar draws, inlined rather than shared — which is blue's own practice:
   "the sidebar component still renders its own inline copy so the kit matches the shipped app
   pixel-for-pixel" (readme → Caveats → Logo variants). Sized down to 148x28 here, because a
   signed-out page has no 80px navbar to fill. */
function Wordmark() {
  return (
    <svg width="148" height="28" viewBox="0 0 71 15" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Teammerly">
      <path d="M6.744 2.6V4.292H4.404V11H2.592V4.292H0.252V2.6H6.744ZM13.2452 7.748C13.2452 7.916 13.2332 8.084 13.2092 8.252H8.30119C8.45719 9.14 9.03319 9.632 9.88519 9.632C10.4972 9.632 11.0012 9.344 11.2652 8.876H13.1012C12.6332 10.292 11.3972 11.192 9.88519 11.192C7.97719 11.192 6.52519 9.704 6.52519 7.76C6.52519 5.816 7.96519 4.34 9.88519 4.34C11.8772 4.34 13.2452 5.876 13.2452 7.748ZM9.88519 5.84C9.10519 5.84 8.55319 6.296 8.34919 7.064H11.4932C11.2412 6.272 10.6772 5.84 9.88519 5.84ZM19.7723 4.52H21.0803V11H19.7123L19.5563 10.412C19.0043 10.904 18.2843 11.192 17.4563 11.192C15.5123 11.192 14.0603 9.716 14.0603 7.76C14.0603 5.804 15.5123 4.34 17.4563 4.34C18.2963 4.34 19.0283 4.64 19.5923 5.132L19.7723 4.52ZM17.6003 9.536C18.6203 9.536 19.3643 8.78 19.3643 7.76C19.3643 6.74 18.6203 5.984 17.6003 5.984C16.5803 5.984 15.8363 6.74 15.8363 7.76C15.8363 8.768 16.5803 9.536 17.6003 9.536ZM30.1455 4.376C31.4895 4.376 32.4255 5.42 32.4255 6.944V11H30.6735V7.232C30.6735 6.368 30.3375 5.912 29.7015 5.912C28.9215 5.912 28.4535 6.488 28.4535 7.496V11H26.7495V7.232C26.7495 6.368 26.4135 5.912 25.7895 5.912C24.9975 5.912 24.5295 6.488 24.5295 7.496V11H22.7775V4.52H24.0015L24.3255 5.324C24.7815 4.748 25.4895 4.376 26.2575 4.376C27.0855 4.376 27.7575 4.76 28.1415 5.408C28.5855 4.784 29.3175 4.376 30.1455 4.376Z" fill="#007AFF" />
      <path d="M41.3952 4.388C42.7512 4.388 43.6392 5.408 43.6392 6.884V11H42.8232V7.124C42.8232 5.9 42.2232 5.132 41.2392 5.132C40.1832 5.132 39.3672 6.08 39.3552 7.352V11H38.5632V7.124C38.5632 5.888 37.9632 5.132 36.9672 5.132C35.9112 5.132 35.0952 6.08 35.0832 7.352V11H34.2672V4.52H34.8672L35.0112 5.528C35.4792 4.82 36.2592 4.388 37.1352 4.388C38.0952 4.388 38.8152 4.904 39.1512 5.732C39.6072 4.904 40.4352 4.388 41.3952 4.388ZM51.693 7.772C51.693 7.868 51.681 7.976 51.681 8.072H45.981C46.113 9.416 47.109 10.34 48.453 10.34C49.425 10.34 50.217 9.872 50.649 9.068H51.513C50.937 10.388 49.833 11.144 48.453 11.144C46.581 11.144 45.165 9.692 45.165 7.76C45.165 5.84 46.581 4.388 48.453 4.388C50.385 4.388 51.693 5.888 51.693 7.772ZM48.453 5.168C47.145 5.168 46.185 6.032 45.993 7.316H50.877C50.697 6.008 49.725 5.168 48.453 5.168ZM56.1548 4.496H56.7308V5.276H56.0948C54.8468 5.276 54.1028 6.128 54.1028 7.448V11H53.2868V4.52H53.8748L54.0188 5.636C54.4628 4.904 55.1828 4.496 56.1548 4.496ZM57.8922 11V2.216H58.7082V11H57.8922Z" fill="#151515" />
      <circle cx="64.8335" cy="7.02956" r="0.838577" fill="#151515" />
      <rect x="69.8054" y="2" width="0.940608" height="6.45195" transform="rotate(48.1411 69.8054 2)" fill="#151515" />
      <rect x="61" y="3.87146" width="0.664653" height="4.50603" transform="rotate(-45.704 61 3.87146)" fill="#151515" />
      <rect x="64.4131" y="7.45505" width="0.37302" height="5.70956" transform="rotate(18.0175 64.4131 7.45505)" fill="#151515" />
    </svg>
  );
}

/**
 * AuthLayout — §11. Prod has no signed-out surface at all, so there is nothing to measure and
 * this is **designed, not measured**. Everything it draws is blue's own vocabulary: the
 * `#f8fafc` well `AppShell` paints, a `--surface-card` panel with a 1px `--border-default` and
 * `--radius-l` and no shadow (blue reserves shadow for things that float), the headline-5 step
 * for the title, and body-s in `--text-secondary` for the subtitle and footer.
 *
 * The footer sits outside the card on purpose: every signed-out screen puts its cross-account
 * link there, so a visitor learns one place to look for it.
 */
export function AuthLayout({ title, subtitle, footer, style, children, ...rest }: AuthLayoutProps) {
  return (
    <div
      {...rest}
      style={{
        minHeight: '100vh', width: '100%', boxSizing: 'border-box',
        background: '#f8fafc',
        padding: 'var(--space-12) var(--space-6)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-10)',
        fontFamily: 'var(--font-family-base)',
        ...style,
      }}
    >
      <Wordmark />
      <div
        style={{
          width: '100%', maxWidth: 480, boxSizing: 'border-box',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-l)',
          padding: 'var(--space-10)',
        }}
      >
        {title && (
          <h1 style={{
            margin: 0,
            fontWeight: 'var(--headline-5-weight)', fontSize: 'var(--headline-5-size)',
            lineHeight: 'var(--headline-5-line)', letterSpacing: 'var(--headline-5-tracking)',
            color: 'var(--text-primary)',
          }}>{title}</h1>
        )}
        {subtitle && (
          <p style={{
            margin: 'var(--space-2) 0 0', fontSize: 'var(--font-size-s)',
            lineHeight: 'var(--line-height-base)', color: 'var(--text-secondary)',
          }}>{subtitle}</p>
        )}
        <div style={{ marginTop: (title || subtitle) ? 'var(--space-8)' : 0 }}>{children}</div>
      </div>
      {footer && (
        <div style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>{footer}</div>
      )}
    </div>
  );
}
