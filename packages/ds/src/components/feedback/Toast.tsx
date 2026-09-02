import React from 'react';

/**
 * §54 — the transient confirmation plate. Its values are deliberately literals rather than
 * tokens; see the component note for why.
 *
 * The **queue is the caller's**: this pair draws and times what it is given, exactly as
 * `AppShell` takes `menuOpen` rather than owning its drawer.
 */
export interface ToastProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * `default` is the untyped message — white, no icon — and is what most confirmations are.
   * The four types take a coloured fill, white ink and a mark.
   */
  tone?: 'default' | 'info' | 'success' | 'warning' | 'error';
  /** Dismiss. The host passes one that drops the entry from its list. */
  onClose?: () => void;
  /** The whole message is a dismiss target. On by default. */
  closeOnClick?: boolean;
  /** Accessible name of the ×. */
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
   * **3400** — see the host for how that number was chosen.
   */
  autoClose?: number;
  closeOnClick?: boolean;
  pauseOnHover?: boolean;
  /** Accessible name for the column. */
  label?: string;
}

/**
 * Toast / ToastHost — §54.
 *
 * **The plate is not part of the page's surface vocabulary, and its values are deliberately
 * literals rather than tokens.** Everything else in this system paints *the app*: a `Card` is
 * the app's card, and when `--radius-l` moves every card moves with it, which is the point. A
 * toast is not on the page — it is a fixed object floating over whatever page happens to be
 * underneath, for three seconds, and it has to look the same over all of them. So `#757575` is
 * not `--text-secondary` and `4px` is not `--radius-s`: they are this plate's own, and folding
 * them into tokens would let a change to the app's ink silently restyle a thing that is not
 * part of the app. If the plate should change, change it here, on purpose.
 *
 * The rest is what a transient confirmation has to be:
 *
 * - **Top-right.** A confirmation lands beside the header the action was taken from, rather
 *   than in the far corner from it.
 * - **`default` is white and has no mark.** Only a *typed* message takes a fill and an icon;
 *   most confirmations are untyped, because a message that something ordinary happened is not
 *   a status and a green plate for every saved field is noise.
 * - **Clicking it dismisses it.** The × stays as well, because a control that is only
 *   discoverable by trying is not one.
 *
 * Three things it deliberately does not do: it is not draggable (a drag target that does
 * nothing else is a poor one), it does not go full-width on a narrow viewport (the column
 * already bounds it), and it has no exit animation — the host drops an entry the moment it is
 * dismissed, because an animation on the way out delays the next one on the way in.
 */

/* The entrance: a bounce in from the right, overshooting and settling. It is the one piece of
   motion in the system that is not a 0.1–0.3s state change, and it earns that because the whole
   job of the plate is to be noticed arriving over a page nobody was looking away from.

   Injected once into `<head>` rather than rendered as a sibling `<style>`, which is
   `Preloader`'s rule and for `Preloader`'s reason: a sibling is a real element and breaks a
   consumer's `:nth-child` counts. */
const KEYFRAMES = `@keyframes ds-toast-bounce-in-right{from,60%,75%,90%,to{animation-timing-function:cubic-bezier(.215,.61,.355,1)}from{opacity:0;transform:translate3d(3000px,0,0)}60%{opacity:1;transform:translate3d(-25px,0,0)}75%{transform:translate3d(10px,0,0)}90%{transform:translate3d(-5px,0,0)}to{transform:none}}`;

if (typeof document !== 'undefined' && !document.getElementById('ds-toast-style')) {
  const el = document.createElement('style');
  el.id = 'ds-toast-style';
  el.textContent = KEYFRAMES;
  document.head.appendChild(el);
}

/* The plate's own palette — see the note above on why these are literals. `default` is **not**
   coloured and gets no mark: it is the ordinary case, and the four types are the exceptions. */
const TONES: Record<string, { background: string; color: string }> = {
  default: { background: '#fff', color: '#757575' },
  info: { background: '#3498db', color: '#fff' },
  success: { background: '#07bc0c', color: '#fff' },
  warning: { background: '#f1c40f', color: '#fff' },
  error: { background: '#e74c3c', color: '#fff' },
};

/* One mark per type, filled with `currentColor` — white on every coloured plate. */
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
        /* The family is named and the size is left to inherit. The host mounts at the
           document root rather than inside a screen, so there is no local type scale to take
           one from — and nothing about a confirmation wants a size of its own. */
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
 * The host: a fixed 320px column at `top: 1em; right: 1em`, 4px of padding, `z-index: 9999`.
 *
 * **Controlled** — the caller owns the list and drops an entry in `onDismiss`, exactly as
 * `AppShell` takes `menuOpen` rather than owning its drawer. `autoClose` schedules that call,
 * and a pointer anywhere over the *column* pauses every timer in it, not only the one under
 * the pointer: somebody reading the second message is not asking the first one to leave.
 *
 * `autoClose` is **3400ms**, and the number is a reading speed. These messages name a record
 * that changed — "Vacancy archived", "Interview rescheduled to Tuesday" — and a second is not
 * long enough to notice the plate, let alone read it. A product whose confirmations tell a
 * reader something they are already expecting can pass a shorter one.
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
