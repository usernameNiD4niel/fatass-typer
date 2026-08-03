import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMinimumWidth } from './useMinimumWidth';

/** A controllable `matchMedia`, since jsdom has no real layout to query. */
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
    resizeTo: (next: boolean) => {
      matches = next;
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMinimumWidth', () => {
  it('reports the current match', () => {
    stubMatchMedia(true);

    expect(renderHook(() => useMinimumWidth(1024)).result.current).toBe(true);
  });

  it('reports a viewport that is too narrow', () => {
    stubMatchMedia(false);

    expect(renderHook(() => useMinimumWidth(1024)).result.current).toBe(false);
  });

  it('follows the window as it is resized', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useMinimumWidth(1024));

    act(() => {
      media.resizeTo(false);
    });
    expect(result.current).toBe(false);

    act(() => {
      media.resizeTo(true);
    });
    expect(result.current).toBe(true);
  });

  it('stops listening when unmounted', () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useMinimumWidth(1024));

    expect(media.listenerCount()).toBe(1);
    unmount();

    expect(media.listenerCount()).toBe(0);
  });

  it('assumes wide enough when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    // Guessing "too narrow" would lock out a working browser over a missing API.
    expect(renderHook(() => useMinimumWidth(1024)).result.current).toBe(true);
  });
});
