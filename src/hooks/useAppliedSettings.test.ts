import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type GameSettings } from '../game-core/models';
import { useAppliedSettings } from './useAppliedSettings';

function apply(overrides: Partial<GameSettings> = {}) {
  return renderHook(
    (settings: GameSettings) => {
      useAppliedSettings(settings);
    },
    {
      initialProps: { ...DEFAULT_SETTINGS, ...overrides },
    },
  );
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-reduced-motion');
  document.documentElement.style.removeProperty('--prompt-font-size');
});

describe('useAppliedSettings', () => {
  it('sets an explicit theme', () => {
    apply({ theme: 'dark' });

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('removes the attribute for the system theme, so the tokens follow the OS', () => {
    const view = apply({ theme: 'light' });
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    view.rerender({ ...DEFAULT_SETTINGS, theme: 'system' });

    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('sets the prompt size token', () => {
    apply({ promptTextSize: 'large' });

    expect(document.documentElement.style.getPropertyValue('--prompt-font-size')).not.toBe('');
  });

  it('gives each prompt size a different value', () => {
    const view = apply({ promptTextSize: 'small' });
    const small = document.documentElement.style.getPropertyValue('--prompt-font-size');

    view.rerender({ ...DEFAULT_SETTINGS, promptTextSize: 'extra-large' });

    expect(document.documentElement.style.getPropertyValue('--prompt-font-size')).not.toBe(small);
  });

  it('writes the reduced-motion values the tokens expect', () => {
    const view = apply({ reducedMotion: true });
    expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'on');

    view.rerender({ ...DEFAULT_SETTINGS, reducedMotion: false });

    expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'off');
  });

  it('defers to the operating system when reduced motion is unset', () => {
    const view = apply({ reducedMotion: true });

    view.rerender({ ...DEFAULT_SETTINGS, reducedMotion: null });

    // Removed, not set to "off": a system that asks for less motion must not be
    // overruled by a default.
    expect(document.documentElement).not.toHaveAttribute('data-reduced-motion');
  });
});
