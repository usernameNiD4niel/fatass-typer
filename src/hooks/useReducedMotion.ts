import { useEffect, useState } from 'react';

/**
 * Whether motion should be reduced right now (spec §12).
 *
 * The setting is three-valued on purpose: `true` and `false` are the player's
 * explicit choice, and `null` means "whatever the system says". CSS already
 * handles the `null` case on its own through `prefers-reduced-motion`, but the
 * canvas is not CSS — the renderer needs an answer, so this resolves the three
 * cases into one boolean and keeps following the OS while the setting is `null`.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

function systemPrefersReduced(): boolean {
  // Older environments and jsdom have no `matchMedia`; no preference is the
  // honest answer there, not an assumed one.
  if (typeof window.matchMedia !== 'function') return false;

  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(setting: boolean | null): boolean {
  const [system, setSystem] = useState(systemPrefersReduced);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(QUERY);
    const onChange = (): void => {
      setSystem(media.matches);
    };

    media.addEventListener('change', onChange);
    onChange();

    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  return setting ?? system;
}
