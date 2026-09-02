import React from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * §8 / §40 — what a dialog does with focus and with `Escape`.
 *
 * Prod's overlays are plain `<div>`s that close only by click, so blue measured no dialog role,
 * no `Escape`, no focus trap and no focus return on either of the two it draws. That is not a
 * design decision; it is a keyboard user being unable to use the dialog at all.
 *
 * It lives in its own file because blue has *two* dialog shells — `Modal` and `ConfirmDialog` —
 * and the fix is the same for both. §8 wrote it inside `Modal`; §40 needed it a second time, and
 * a second copy is how the two drift apart.
 */
export function useDialogFocus({ open, onClose, panelRef, initialFocusRef }) {
  const returnFocusTo = React.useRef(null);

  /* §61 — the callback is read through a ref rather than depended on.
   *
   * Every dialog in the app is opened from a screen that owns its state, so `onClose` is an
   * arrow rebuilt on each of that screen's renders — and a dialog with a field in it makes the
   * screen render on **every keystroke**. With `onClose` in the dependency list this effect
   * therefore tore down and re-ran between one letter and the next: the cleanup handed focus
   * back to the opener, the body moved it to `panel.querySelector(FOCUSABLE)`, and that is the
   * close button. Typing a name into "New category" put the caret on the × after the first
   * letter, every time.
   *
   * The fix is not a stabler caller. What this effect *does* is entirely about `open` — move
   * focus in, trap it, put it back — and none of that should happen again while the dialog
   * stays open, whoever re-renders around it. So the identity of the handler is kept out of
   * the dependency list and read at call time, which is the same shape as the `place()`
   * callback §55 gave `Popover`. */
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  React.useEffect(() => {
    if (!open) return undefined;

    returnFocusTo.current = document.activeElement;
    const panel = panelRef.current;
    const target = (initialFocusRef && initialFocusRef.current)
      || (panel && panel.querySelector(FOCUSABLE))
      || panel;
    if (target) target.focus();

    /* Escape on the bubble, and only if nothing inside has claimed it. §8 handled it in the
       same capture listener as Tab, which meant the dialog always won: a control that owns
       `Escape` for itself — a chip held mid-reorder, `Popover`'s open menu (§22) — could not
       be reached, because a capture listener on `document` fires before the event has got
       anywhere near it. Tab still traps on capture, which is the phase that job needs. */
    function onEscape(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (closeRef.current) closeRef.current();
    }

    function onKeyDown(event) {
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
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
