import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReducedMotion } from './useReducedMotion';

/** A controllable `matchMedia`, since jsdom answers no media query honestly. */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initial;

  const media = {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );

  return {
    listenerCount: () => listeners.size,
    changeTo: (next: boolean) => {
      matches = next;
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('follows the system when the setting has no opinion', () => {
    stubMatchMedia(true);

    expect(renderHook(() => useReducedMotion(null)).result.current).toBe(true);
  });

  it('keeps following the system as the preference changes', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion(null));

    act(() => {
      media.changeTo(true);
    });

    expect(result.current).toBe(true);
  });

  it('lets the player ask for reduced motion the system did not', () => {
    stubMatchMedia(false);

    expect(renderHook(() => useReducedMotion(true)).result.current).toBe(true);
  });

  it('lets the player opt back into motion', () => {
    // Explicit, and therefore theirs to make: the setting screen offers "off"
    // as a real choice rather than only "follow the system".
    stubMatchMedia(true);

    expect(renderHook(() => useReducedMotion(false)).result.current).toBe(false);
  });

  it('drops its listener on unmount', () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion(null));

    unmount();

    expect(media.listenerCount()).toBe(0);
  });

  it('answers without matchMedia rather than throwing', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(renderHook(() => useReducedMotion(null)).result.current).toBe(false);
  });
});
