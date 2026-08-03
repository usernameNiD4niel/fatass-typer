import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PlayerProfile, RunResult } from '../game-core/models';
import { createPlayerProfile, emptyRunResult } from '../game-core/models';
import { InMemoryStorage } from '../storage';
import { usePlayerProfile } from './usePlayerProfile';

const NOW = '2026-01-01T00:00:00.000Z';

function resultWith(overrides: Partial<RunResult> = {}): RunResult {
  return {
    ...emptyRunResult('run-1', 'map-1', NOW),
    completed: true,
    score: 1500,
    averageWpm: 22,
    sustainablePeakWpm: 26,
    accuracy: 0.93,
    correctCharacters: 300,
    incorrectCharacters: 20,
    ...overrides,
  };
}

function setup(storage = new InMemoryStorage()) {
  const view = renderHook(() => usePlayerProfile({ storage, now: () => NOW }));

  return { storage, ...view };
}

describe('loading', () => {
  it('starts with a fresh profile and reports when the load has finished', async () => {
    const { result } = setup();

    expect(result.current.profile.lifetimeCharacters).toBe(0);
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
  });

  it('adopts a stored profile', async () => {
    const stored: PlayerProfile = {
      ...createPlayerProfile(NOW, 'map-1'),
      sustainablePeakWpm: 33,
    };
    const { result } = setup(new InMemoryStorage({ initialProfile: stored }));

    await waitFor(() => {
      expect(result.current.profile.sustainablePeakWpm).toBe(33);
    });
  });
});

describe('recording a run', () => {
  it('folds the run into the profile', async () => {
    const { result } = setup();
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    act(() => {
      result.current.recordRun(resultWith());
    });

    expect(result.current.profile.sustainablePeakWpm).toBe(26);
    expect(result.current.profile.unlockedMapIds).toContain('map-2');
  });

  it('appends it to the run history', async () => {
    const { result, storage } = setup();
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    act(() => {
      result.current.recordRun(resultWith({ runId: 'run-42' }));
    });

    await waitFor(async () => {
      const runs = await storage.listRuns();
      expect(runs.map((run) => run.runId)).toEqual(['run-42']);
    });
  });

  it('persists the updated profile', async () => {
    const { result, storage } = setup();
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    act(() => {
      result.current.recordRun(resultWith());
    });

    await waitFor(async () => {
      const stored = await storage.loadProfile();
      expect(stored?.sustainablePeakWpm).toBe(26);
    });
  });
});

describe('resetting progress', () => {
  it('clears achievements but keeps the player’s settings', async () => {
    const { result } = setup();
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    act(() => {
      result.current.setProfile({
        ...result.current.profile,
        settings: { ...result.current.profile.settings, theme: 'dark' },
      });
    });
    act(() => {
      result.current.recordRun(resultWith());
    });

    act(() => {
      result.current.resetProgress();
    });

    expect(result.current.profile.sustainablePeakWpm).toBe(0);
    expect(result.current.profile.unlockedMapIds).toEqual(['map-1']);
    // Preferences are not achievements.
    expect(result.current.profile.settings.theme).toBe('dark');
  });

  it('empties the run history too', async () => {
    const { result, storage } = setup();
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    act(() => {
      result.current.recordRun(resultWith());
    });
    act(() => {
      result.current.resetProgress();
    });

    await waitFor(async () => {
      expect(await storage.listRuns()).toEqual([]);
    });
  });
});
