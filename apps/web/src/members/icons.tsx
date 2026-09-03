'use client';

/**
 * Meridian ships no lock glyph, and the spec draws one on every sensitive row and
 * beside every sensitive entry in the autofill picker. Drawn in the same idiom as
 * `src/layout/icons.tsx` and `src/documents/icons.tsx` — geometric, filled with
 * `currentColor`, no strokes — so it sits flush with the shell's existing glyphs.
 *
 * `aria-hidden` on purpose: the affordance is decorative reinforcement. The row that
 * carries it also carries a title attribute, which is what a screen reader announces.
 */
export function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 14 18" width={size} height={Math.round((size * 18) / 14)} fill="currentColor" aria-hidden>
      <path d="M2 18c-.55 0-1.02-.196-1.412-.587A1.926 1.926 0 0 1 0 16V8c0-.55.196-1.02.588-1.412A1.926 1.926 0 0 1 2 6h1V4.5c0-1.242.44-2.3 1.32-3.18C5.2.44 6.258 0 7.5 0s2.3.44 3.18 1.32C11.56 2.2 12 3.258 12 4.5V6h.5c.412 0 .765.147 1.06.44.294.293.44.646.44 1.06v8.5c0 .55-.196 1.02-.588 1.413A1.926 1.926 0 0 1 12 18H2Zm2.75-12h5.5V4.5c0-.764-.267-1.414-.8-1.95A2.652 2.652 0 0 0 7.5 1.75c-.764 0-1.414.267-1.95.8a2.652 2.652 0 0 0-.8 1.95V6ZM7 13.25c.412 0 .765-.147 1.06-.44.294-.293.44-.646.44-1.06 0-.412-.146-.765-.44-1.06A1.446 1.446 0 0 0 7 10.25c-.412 0-.765.147-1.06.44-.294.295-.44.648-.44 1.06 0 .414.146.767.44 1.06.295.293.648.44 1.06.44Z" />
    </svg>
  );
}
