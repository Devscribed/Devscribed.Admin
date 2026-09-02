/**
 * §68 — whether a focus event should paint a ring.
 *
 * Blue declares no `:focus` state anywhere, which is survivable while nothing is expected to
 * arrive by keyboard. §45 (`PageTabs`), §31 (`ToggleButton`), §30 (`Calendar`) and §42
 * (`BoardCard`) each added one, because each of those *is* reached by keyboard and a control
 * with focus you cannot see is a control you cannot use.
 *
 * They added it on `focus`, and `focus` fires on a **pointer press** as well — so every click
 * on a tab, a segment, a day or a card left a glow sitting on it until something else was
 * clicked. A ring is an answer to *where will my next keystroke land*, and a pointer user is
 * not asking.
 *
 * `:focus-visible` is the browser's own answer to which of the two happened, and it is read
 * here rather than written as a CSS rule because everything these components paint is inline
 * (the same reason `base.css` holds only what a media query forces out of the file).
 *
 * **The fallback keeps the ring.** An engine without the selector throws on `matches`, and an
 * extra ring is a cosmetic complaint where a missing one is a keyboard user with nowhere to
 * look.
 */
export function isKeyboardFocus(element: Element | null | undefined): boolean {
  if (!element || typeof element.matches !== 'function') return true;
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}
