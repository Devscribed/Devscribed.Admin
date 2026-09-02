import React from 'react';

export interface DialogFocusOptions {
  /** Everything below happens on the transition into `true`, and unwinds on the way out. */
  open?: boolean;
  onClose?: () => void;
  /** The dialog's own panel — what focus is trapped inside and what `Escape` closes. */
  panelRef: React.RefObject<HTMLElement | null>;
  /** What to focus on open. Defaults to the first focusable element in the panel. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * §8 / §40 — what a dialog does with focus and with `Escape`.
 *
 * A dialog that only closes by click is one a keyboard user cannot leave. All four rules go
 * together, and they are not separable: focus moves in on open, is trapped while open, returns
 * to the opener on close, and `Escape` closes.
 *
 * It lives in its own file because there are *two* dialog shells — `Modal` and `ConfirmDialog` —
 * and the behaviour is the same for both. §8 wrote it inside `Modal`; §40 needed it a second
 * time, and a second copy is how the two drift apart.
 */
export function useDialogFocus({ open, onClose, panelRef, initialFocusRef }: DialogFocusOptions) {
  const returnFocusTo = React.useRef<HTMLElement | null>(null);

  /* §61 — the callback is read through a ref rather than depended on.
   *
   * A dialog is opened from a screen that owns its state, so `onClose` is an arrow rebuilt on
   * each of that screen's renders — and a dialog with a field in it makes the screen render on
   * **every keystroke**. With `onClose` in the dependency list this effect tears down and
   * re-runs between one letter and the next: the cleanup hands focus back to the opener, the
   * body moves it to `panel.querySelector(FOCUSABLE)`, and that is the close button. Typing a
   * name into "New category" put the caret on the × after the first letter, every time.
   *
   * The fix is not a stabler caller. What this effect *does* is entirely about `open` — move
   * focus in, trap it, put it back — and none of that should happen again while the dialog
   * stays open, whoever re-renders around it. So the identity of the handler is kept out of
   * the dependency list and read at call time, which is the shape §55 gives `Popover`'s
   * `place()`. */
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  React.useEffect(() => {
    if (!open) return undefined;

    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target = (initialFocusRef && initialFocusRef.current)
      || (panel && panel.querySelector<HTMLElement>(FOCUSABLE))
      || panel;
    if (target) target.focus();

    /* Escape on the bubble, and only if nothing inside has claimed it. Handling it in the same
       capture listener as Tab means the dialog always wins: a control that owns `Escape` for
       itself — a chip held mid-reorder, `Popover`'s open menu (§22), a `Select` with its list
       down — is never reached, because a capture listener on `document` fires before the event
       has got anywhere near it. Tab still traps on capture, which is the phase that job needs. */
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (closeRef.current) closeRef.current();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      // Wrap at both ends, and pull focus back in if it has escaped the panel entirely.
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keydown', onEscape);
      const restore = returnFocusTo.current;
      // The opener is often unmounted by the time the dialog closes; only return focus to
      // something still in the document, or the page loses focus to <body> silently.
      if (restore && document.contains(restore)) restore.focus();
    };
    /* §61 — `open` only. `panelRef` and `initialFocusRef` are refs, so their identity is
       already stable, and naming them here only invites a caller to build one inline. */
  }, [open]);
}
