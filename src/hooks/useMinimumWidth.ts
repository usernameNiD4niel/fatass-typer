import { useEffect, useState } from 'react';

/**
 * Whether the viewport is at least `minimumWidthPx` wide.
 *
 * Uses `matchMedia` rather than a resize listener: the browser evaluates the
 * query itself and fires only when the answer changes, so this costs nothing
 * while the player drags a window around.
 *
 * Returns `true` when `matchMedia` is unavailable. Guessing "too narrow" would
 * lock out a working browser over a missing API — the guard exists to explain a
 * real limitation, not to be the limitation.
 */
export function useMinimumWidth(minimumWidthPx: number): boolean {
  const query = `(min-width: ${String(minimumWidthPx)}px)`;

  const [matches, setMatches] = useState(() => {
    if (typeof window.matchMedia !== 'function') return true;

    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(query);
    setMatches(media.matches);

    const onChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };

    media.addEventListener('change', onChange);

    return () => {
      media.removeEventListener('change', onChange);
    };
  }, [query]);

  return matches;
}
