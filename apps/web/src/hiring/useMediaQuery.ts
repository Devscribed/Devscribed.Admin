'use client';

import { useEffect, useState } from 'react';

/**
 * A breakpoint a screen has to react to in JavaScript rather than in CSS, because what
 * changes across it is structure rather than styling — the board's five columns become
 * a tab strip, a row's two buttons become one menu. A media query cannot express either.
 *
 * It starts `false` and settles after mount, so the server and the first client render
 * agree. Every caller must therefore treat the wide layout as the default rather than
 * something that arrives.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
