import { useEffect } from 'react';

import type { GameSettings, PromptTextSize } from '../game-core/models';

/**
 * Applies settings to the document.
 *
 * The one place a setting becomes a DOM change. `tokens.css` already defines
 * what each value means — `data-theme` swaps the semantic palette and
 * `--prompt-font-size` drives the prompt — so this only has to say *which*, not
 * *what*.
 */

const PROMPT_SIZE_TOKEN: Readonly<Record<PromptTextSize, string>> = {
  small: 'var(--font-size-lg)',
  medium: 'var(--font-size-2xl)',
  large: 'var(--font-size-3xl)',
  'extra-large': '3.75rem',
};

export function useAppliedSettings(settings: GameSettings): void {
  useEffect(() => {
    const root = document.documentElement;

    // No attribute means "follow the OS", which is what the tokens already do
    // through `prefers-color-scheme`. Setting `data-theme="system"` would break
    // that, so the attribute is removed instead.
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);

    root.style.setProperty('--prompt-font-size', PROMPT_SIZE_TOKEN[settings.promptTextSize]);

    // `null` follows the OS preference, so the override is removed rather than
    // set to "off" — a player whose system asks for less motion must not be
    // overruled by a default. The values are the ones `tokens.css` §11 expects.
    if (settings.reducedMotion === null) root.removeAttribute('data-reduced-motion');
    else root.setAttribute('data-reduced-motion', settings.reducedMotion ? 'on' : 'off');
  }, [settings.theme, settings.promptTextSize, settings.reducedMotion]);
}
