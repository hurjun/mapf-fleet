'use client';

import { useEffect, useState } from 'react';

/**
 * Reactive CSS media query. `fallback` is used for the first (server + initial
 * client) render to avoid a hydration mismatch; the real value is applied after
 * mount.
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const [matches, setMatches] = useState(fallback);
  useEffect(() => {
    const m = window.matchMedia(query);
    const update = () => setMatches(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, [query]);
  return matches;
}
