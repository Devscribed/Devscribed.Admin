'use client';

/**
 * Meridian ships no icon library, and its `P` glyph dictionary carries no document or
 * overflow glyph. These two are drawn in the same idiom as `src/layout/icons.tsx` —
 * geometric, filled with `currentColor`, no strokes — so the Documents nav row and the
 * row overflow button sit flush with the shell's existing glyphs.
 */

export function DocumentsIcon() {
  return (
    <svg viewBox="0 0 18 22" width={19} height={19} fill="currentColor" aria-hidden>
      <path d="M2.25 22C1.6425 22 1.125 21.7838 0.695 21.3513C0.265 20.9188 0.05 20.3988 0.05 19.7913V2.20875C0.05 1.60125 0.265 1.08125 0.695 0.64875C1.125 0.21625 1.6425 0 2.25 0H11.05L17.95 6.9V19.7913C17.95 20.3988 17.735 20.9188 17.305 21.3513C16.875 21.7838 16.3575 22 15.75 22H2.25ZM10.3 7.7V1.65H2.25C2.1075 1.65 1.98 1.70938 1.8675 1.82813C1.755 1.94688 1.7 2.07437 1.7 2.21063V19.7894C1.7 19.9256 1.755 20.0531 1.8675 20.1719C1.98 20.2906 2.1075 20.35 2.25 20.35H15.75C15.8925 20.35 16.02 20.2906 16.1325 20.1719C16.245 20.0531 16.3 19.9256 16.3 19.7894V7.7H10.3ZM4.4 17.05H13.6V15.4H4.4V17.05ZM4.4 10.45H8.65V8.8H4.4V10.45ZM4.4 13.75H13.6V12.1H4.4V13.75Z" />
    </svg>
  );
}

/** The `⋮` affordance the spec draws on every template row. */
export function OverflowIcon() {
  return (
    <svg viewBox="0 0 4 16" width={4} height={16} fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="1.75" />
      <circle cx="2" cy="8" r="1.75" />
      <circle cx="2" cy="14" r="1.75" />
    </svg>
  );
}
