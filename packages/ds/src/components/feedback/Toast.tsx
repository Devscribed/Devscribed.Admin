import React from 'react';

/**
 * §54 — `react-toastify@9.1` under prod's own configuration (`position="top-right"`,
 * `hideProgressBar`, `closeOnClick`, `pauseOnHover`, `theme="colored"`), carried across for a
 * codebase that cannot take the dependency. Every value is the library's, so none of them
 * should be folded into system tokens.
 *
 * The **queue is the caller's**: this pair draws and times what it is given, exactly as
 * `AppShell` takes `menuOpen` rather than owning its drawer.
 */
export interface ToastProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * `default` is the untyped message — white, no icon — and is what prod's own confirmations
   * are. The four types take `theme="colored"`'s fill, white ink and the library's mark.
   */
  tone?: 'default' | 'info' | 'success' | 'warning' | 'error';
  /** Dismiss. The host passes one that drops the entry from its list. */
  onClose?: () => void;
  /** `closeOnClick` — the whole message is a dismiss target. On by default, as in prod. */
  closeOnClick?: boolean;
  /** Accessible name of the × . The library's own is the lowercase `close`. */
  closeLabel?: string;
  children?: React.ReactNode;
}

export interface ToastEntry {
  id: string | number;
  message: React.ReactNode;
  tone?: ToastProps['tone'];
  /** §54 — lands on the message's own root. The host draws it, so only the host can tag it. */
  testId?: string;
  /** Overrides the host's `autoClose` for this one message. */
  autoClose?: number;
}

export interface ToastHostProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The queue, oldest first. The caller owns it. */
  toasts?: ToastEntry[];
  /** Called with an entry's id when its timer runs out, it is clicked, or its × is pressed. */
  onDismiss?: (id: string | number) => void;
  /**
   * Milliseconds before an entry withdraws itself; `0` leaves them standing. Defaults to
   * **3400**, where prod passes 1000 — see the component for why that one value is not the
   * library's.
   */
  autoClose?: number;
  closeOnClick?: boolean;
  pauseOnHover?: boolean;
  /** Accessible name for the column. */
  label?: string;
}

/**
 * Toast / ToastHost — §54, rewritten.
 *
 * The first version of this entry reasoned from `InfoBanner`: prod uses `react-toastify`,
 * blue did not recreate it, so the surface was taken from the nearest measured thing and the
 * motion and stacking were designed on top. That was the right method with the wrong premise.
 * **`react-toastify` is not an absence — it is the measurement.** The app imports the
 * library's own stylesheet and overrides nothing, so what a Teamplay user sees when something
 * is confirmed is the library's default plate under one configuration, and every value below
 * is read out of `react-toastify@9.1`'s `dist/ReactToastify.css` and `dist/react-toastify.js`
 * rather than composed here:
 *
 * ```
 * position="top-right"  autoClose  hideProgressBar  closeOnClick  pauseOnHover  theme="colored"
 * ```
 *
 * Which makes the shape of this entry `packaging`, not `designed`: nothing is invented, a
 * dependency's paint is simply carried across for a codebase that cannot take the dependency.
 * **Do not fold these values into system tokens.** `#757575` is not `--text-secondary` and
 * `4px` is not `--radius-s`; they are what the library paints, and a token here would quietly
 * stop matching production the first time the token moved.
 *
 * Three consequences worth naming, because they reverse what §54 first said:
 *
 * - **Top-right, not bottom-right.** A confirmation lands beside the header it was raised
 *   from rather than in the far corner from it.
 * - **`default` is white and has no icon.** In `theme="colored"` only the four *typed* toasts
 *   take a fill and a mark; an untyped one falls back to the light surface. Prod's own
 *   confirmations are untyped, so most of this app's are too — a message that something
 *   ordinary happened is not a status.
 * - **Clicking it dismisses it**, which `closeOnClick` says and the old surface had no notion
 *   of. The × stays, because a control that is only discoverable by trying is not one.
 *
 * Not reproduced, all three deliberately: `draggable` (on in prod, and a drag target that
 * does nothing else is a poor one), the ≤480px full-width breakpoint (this app's toasts are
 * already `max-width`-bound by the column), and the exit animation — the host drops an entry
 * the moment it is dismissed, exactly as the bundle does.
 */

/* The library's own bounce, verbatim. Injected once into `<head>` rather than rendered as a
   sibling `<style>`, which is `Preloader`'s rule and for `Preloader`'s reason: a sibling is a
   real element and breaks a consumer's `:nth-child` counts. */
const KEYFRAMES = `@keyframes ds-toast-bounce-in-right{from,60%,75%,90%,to{animation-timing-function:cubic-bezier(.215,.61,.355,1)}from{opacity:0;transform:translate3d(3000px,0,0)}60%{opacity:1;transform:translate3d(-25px,0,0)}75%{transform:translate3d(10px,0,0)}90%{transform:translate3d(-5px,0,0)}to{transform:none}}`;

if (typeof document !== 'undefined' && !document.getElementById('ds-toast-style')) {
  const el = document.createElement('style');
  el.id = 'ds-toast-style';
  el.textContent = KEYFRAMES;
  document.head.appendChild(el);
}

/* `--toastify-color-*` and the colored-theme rules, read from the library's stylesheet.
   `default` is **not** coloured: `.Toastify__toast-theme--colored.Toastify__toast--default`
   falls back to the light surface and `--toastify-text-color-light`, and it gets no icon at
   all, because the library's `Icons` map only defines the four types. */
const TONES: Record<string, { background: string; color: string }> = {
  default: { background: '#fff', color: '#757575' },
  info: { background: '#3498db', color: '#fff' },
  success: { background: '#07bc0c', color: '#fff' },
  warning: { background: '#f1c40f', color: '#fff' },
  error: { background: '#e74c3c', color: '#fff' },
};

/* `Icons.info` / `.success` / `.warning` / `.error` — path data verbatim from
   `dist/react-toastify.js`. Filled with `currentColor`, i.e. white in the coloured theme. */
const ICON_PATHS: Record<string, string> = {
  info: 'M12 0a12 12 0 1012 12A12.013 12.013 0 0012 0zm.25 5a1.5 1.5 0 11-1.5 1.5 1.5 1.5 0 011.5-1.5zm2.25 13.5h-4a1 1 0 010-2h.75a.25.25 0 00.25-.25v-4.5a.25.25 0 00-.25-.25h-.75a1 1 0 010-2h1a2 2 0 012 2v4.75a.25.25 0 00.25.25h.75a1 1 0 110 2z',
  warning: 'M23.32 17.191L15.438 2.184C14.728.833 13.416 0 11.996 0c-1.42 0-2.733.833-3.443 2.184L.533 17.448a4.744 4.744 0 000 4.368C1.243 23.167 2.555 24 3.975 24h16.05C22.22 24 24 22.044 24 19.632c0-.904-.251-1.746-.68-2.44zm-9.622 1.46c0 1.033-.724 1.823-1.698 1.823s-1.698-.79-1.698-1.822v-.043c0-1.028.724-1.822 1.698-1.822s1.698.79 1.698 1.822v.043zm.039-12.285l-.84 8.06c-.057.581-.408.943-.897.943-.49 0-.84-.367-.896-.942l-.84-8.065c-.057-.624.25-1.095.779-1.095h1.91c.528.005.84.476.784 1.1z',
  success: 'M12 0a12 12 0 1012 12A12.014 12.014 0 0012 0zm6.927 8.2l-6.845 9.289a1.011 1.011 0 01-1.43.188l-4.888-3.908a1 1 0 111.25-1.562l4.076 3.261 6.227-8.451a1 1 0 111.61 1.183z',
  error: 'M11.983 0a12.206 12.206 0 00-8.51 3.653A11.8 11.8 0 000 12.207 11.779 11.779 0 0011.8 24h.214A12.111 12.111 0 0024 11.791 11.766 11.766 0 0011.983 0zM10.5 16.542a1.476 1.476 0 011.449-1.53h.027a1.527 1.527 0 011.523 1.47 1.475 1.475 0 01-1.449 1.53h-.027a1.529 1.529 0 01-1.523-1.47zM11 12.5v-6a1 1 0 012 0v6a1 1 0 11-2 0z',
};

export function Toast({
  tone = 'default',
  children,
  onClose,
  onClick,
  closeOnClick = true,
  closeLabel = 'close',
  style,
  ...rest
}: ToastProps) {
  const paint = TONES[tone] || TONES.default;
  const path = ICON_PATHS[tone];
  const [closeHover, setCloseHover] = React.useState(false);
  const restingOpacity = tone === 'default' ? 0.3 : 0.7;
  return (
    <div
      {...rest}
      onClick={onClick}
      style={{
        position: 'relative', boxSizing: 'border-box', minHeight: 64, marginBottom: '1rem',
        padding: 8, borderRadius: 4, display: 'flex', justifyContent: 'space-between',
        maxHeight: 800, overflow: 'hidden', direction: 'ltr', zIndex: 0,
        cursor: closeOnClick ? 'pointer' : 'default',
        boxShadow: '0 1px 10px 0 rgba(0, 0, 0, 0.1), 0 2px 15px 0 rgba(0, 0, 0, 0.05)',
        backgroundColor: paint.background,
        color: paint.color,
        /* The library sets only `font-family` and inherits the size from the page. Ours is
           mounted at the document root rather than inside a screen, so the family is named
           and the size left to inherit, exactly as there. */
        fontFamily: 'var(--font-family-base)',
        animation: 'ds-toast-bounce-in-right 0.7s both',
        ...style,
      }}
    >
      <div role="alert" style={{ margin: 'auto 0', flex: '1 1 auto', padding: 6, display: 'flex', alignItems: 'center' }}>
        {path && (
          <div style={{ marginInlineEnd: 10, width: 20, flexShrink: 0, display: 'flex' }}>
            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true">
              <path d={path} />
            </svg>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{children}</div>
      </div>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={(event) => { event.stopPropagation(); if (onClose) onClose(); }}
        onMouseEnter={() => setCloseHover(true)}
        onMouseLeave={() => setCloseHover(false)}
        style={{
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', outline: 'none',
          color: tone === 'default' ? '#000' : '#fff',
          opacity: closeHover ? 1 : restingOpacity,
          transition: '0.3s ease', alignSelf: 'flex-start',
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 14 16" width="14" height="16" fill="currentColor">
          <path fillRule="evenodd" d="M7.71 8.23l3.75 3.75-1.48 1.48-3.75-3.75-3.75 3.75L1 11.98l3.75-3.75L1 4.48 2.48 3l3.75 3.75L9.98 3l1.48 1.48-3.75 3.75z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * The `ToastContainer`: a fixed 320px column at `top: 1em; right: 1em`, 4px of padding,
 * `z-index: 9999`. **Controlled** — the caller owns the list and drops an entry in
 * `onDismiss`, exactly as `AppShell` takes `menuOpen` rather than owning its drawer;
 * `autoClose` schedules that call, and a pointer anywhere over the column pauses every
 * timer in it (`pauseOnHover`, which the library applies to the container and not to the
 * message).
 *
 * `autoClose` defaults to **3400ms** where prod passes 1000. It is the one value here that
 * is not the library's, and the reason is that prod's 1000 is a measurement of a product
 * whose toasts confirm a timer starting — five words a user is already expecting. Ours name
 * a record that changed, and a second is not long enough to find the message, let alone
 * read it. Overridable, and prod's own number is one prop away.
 *
 * Renders nothing while empty — an empty fixed box still sits over the corner of the page.
 */
export function ToastHost({
  toasts = [],
  onDismiss,
  autoClose = 3400,
  closeOnClick = true,
  pauseOnHover = true,
  label,
  style,
  ...rest
}: ToastHostProps) {
  const [paused, setPaused] = React.useState(false);
  const ids = toasts.map((toast) => toast.id).join('|');

  React.useEffect(() => {
    if (!onDismiss || !autoClose || paused) return undefined;
    const timers = toasts.map((toast) => setTimeout(
      () => onDismiss(toast.id),
      toast.autoClose == null ? autoClose : toast.autoClose,
    ));
    return () => timers.forEach(clearTimeout);
    // The list is keyed by its ids: a re-render that changes nothing must not restart a
    // timer somebody is already halfway through reading.
  }, [ids, autoClose, paused, onDismiss]);

  /* Nothing at all while empty, so a fixed 320px box is not sitting over the top-right of
     every screen for a pointer to find. */
  if (toasts.length === 0) return null;

  return (
    <div
      {...rest}
      aria-label={label}
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
      style={{
        position: 'fixed', zIndex: 9999, boxSizing: 'border-box', padding: 4, width: 320,
        top: '1em', right: '1em', color: '#fff',
        ...style,
      }}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          tone={toast.tone}
          closeOnClick={closeOnClick}
          /* §54 — the entry's own test id, on the message that carries it. The host draws
             the node, so only the host can tag it: §16's `nameTestId` and §21's
             `chipTestId`, on the one component whose every child is drawn for it. */
          data-testid={toast.testId}
          onClose={onDismiss ? () => onDismiss(toast.id) : undefined}
          onClick={closeOnClick && onDismiss ? () => onDismiss(toast.id) : undefined}
        >
          {toast.message}
        </Toast>
      ))}
    </div>
  );
}
