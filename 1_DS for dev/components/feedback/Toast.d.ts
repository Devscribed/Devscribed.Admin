import { HTMLAttributes, ReactNode } from 'react';

/**
 * §54 — `react-toastify@9.1` under prod's own configuration (`position="top-right"`,
 * `hideProgressBar`, `closeOnClick`, `pauseOnHover`, `theme="colored"`), carried across for a
 * codebase that cannot take the dependency. Every value is the library's, so none of them
 * should be folded into system tokens.
 *
 * The **queue is the caller's**: this pair draws and times what it is given, exactly as
 * `AppShell` takes `menuOpen` rather than owning its drawer.
 */
export interface ToastProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
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
  children?: ReactNode;
}

export function Toast(props: ToastProps): JSX.Element;

export interface ToastEntry {
  id: string | number;
  message: ReactNode;
  tone?: ToastProps['tone'];
  /** §54 — lands on the message's own root. The host draws it, so only the host can tag it. */
  testId?: string;
  /** Overrides the host's `autoClose` for this one message. */
  autoClose?: number;
}

export interface ToastHostProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
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

/** Renders nothing while empty — an empty fixed box still sits over the corner of the page. */
export function ToastHost(props: ToastHostProps): JSX.Element | null;
