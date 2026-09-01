import { HTMLAttributes, ReactNode } from 'react';

/**
 * §54 — the real toast, where `InfoBanner` had been standing in for one. The paint is
 * `InfoBanner`'s; the motion, the timer and the stacking are what a banner never had.
 *
 * The **queue is the caller's**: this pair draws and times what it is given, exactly as
 * `AppShell` takes `menuOpen` rather than owning its drawer.
 */
export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'error';
  /** Milliseconds before it withdraws itself; `0` leaves it standing. Defaults to 5000. */
  duration?: number;
  /** Called once the **exit** has finished, so the caller drops it from its own queue. */
  onDismiss?: () => void;
  dismissLabel?: string;
  children?: ReactNode;
}

export function Toast(props: ToastProps): JSX.Element;

export interface ToastHostProps extends HTMLAttributes<HTMLDivElement> {
  /** Accessible name for the polite live region the messages arrive in. */
  label?: string;
  children?: ReactNode;
}

/** Renders nothing while empty — an empty fixed box still sits over the corner of the page. */
export function ToastHost(props: ToastHostProps): JSX.Element | null;
