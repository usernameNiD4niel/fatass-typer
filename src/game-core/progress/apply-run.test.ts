import { describe, expect, it } from 'vitest';

import { MAPS } from '../../content';
import type { MapProgress, PlayerProfile, RunResult } from '../models';
import { createPlayerProfile, emptyRunResult, progressFor } from '../models';
import { applyRunResult, unlockedBy } from './apply-run';

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';

function profileWith(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile(NOW, 'map-1'), ...overrides };
}

function resultWith(overrides: Partial<RunResult> = {}): RunResult {
  return {
    ...emptyRunResult('run-1', 'map-1', NOW),
    completed: true,
    durationMs: 40_000,
    score: 1500,
    averageWpm: 22,
    sustainablePeakWpm: 24,
    rawPeakWpm: 31,
    accuracy: 0.93,
    correctCharacters: 300,
    incorrectCharacters: 20,
    ...overrides,
  };
}

function apply(result: RunResult, profile = profileWith()): PlayerProfile {
  return applyRunResult({ profile, result, maps: MAPS, now: LATER });
}

describe('recording a run', () => {
  it('counts the attempt', () => {
    expect(progressFor(apply(resultWith()), 'map-1').attempts).toBe(1);
  });

  it('records the bests from a first run', () => {
    const progress = progressFor(apply(resultWith()), 'map-1');

    expect(progress).toMatchObject({
      completed: true,
      bestScore: 1500,
      bestAverageWpm: 22,
      bestPeakWpm: 31,
      bestAccuracy: 0.93,
      bestCompletionTimeMs: 40_000,
    });
  });

  it('adds to the lifetime counters', () => {
    const profile = apply(resultWith());

    expect(profile.lifetimeCharacters).toBe(320);
    expect(profile.lifetimeCorrectCharacters).toBe(300);
  });

  it('raises the lifetime sustainable peak', () => {
    expect(apply(resultWith()).sustainablePeakWpm).toBe(24);
  });

  it('stamps the update time', () => {
    expect(apply(resultWith()).updatedAt).toBe(LATER);
  });
});

describe('a worse run never costs the player anything', () => {
  const strong = apply(resultWith());

  it('keeps the better score, speed, accuracy, and peak', () => {
    const after = apply(
      resultWith({
        score: 100,
        averageWpm: 8,
        accuracy: 0.4,
        rawPeakWpm: 9,
        sustainablePeakWpm: 5,
      }),
      strong,
    );
    const progress = progressFor(after, 'map-1');

    expect(progress.bestScore).toBe(1500);
    expect(progress.bestAverageWpm).toBe(22);
    expect(progress.bestAccuracy).toBe(0.93);
    expect(progress.bestPeakWpm).toBe(31);
    expect(after.sustainablePeakWpm).toBe(24);
  });

  it('keeps the map completed once it has been completed', () => {
    const after = apply(resultWith({ completed: false }), strong);

    expect(progressFor(after, 'map-1').completed).toBe(true);
  });

  it('still counts the attempt', () => {
    expect(progressFor(apply(resultWith({ completed: false }), strong), 'map-1').attempts).toBe(2);
  });
});

describe('completion time', () => {
  it('keeps the fastest completion', () => {
    const first = apply(resultWith({ durationMs: 50_000 }));
    const second = apply(resultWith({ durationMs: 38_000 }), first);

    expect(progressFor(second, 'map-1').bestCompletionTimeMs).toBe(38_000);
  });

  it('ignores a run that was never finished', () => {
    // Being caught quickly is not a record.
    const finished = apply(resultWith({ durationMs: 45_000 }));
    const caught = apply(resultWith({ completed: false, durationMs: 5_000 }), finished);

    expect(progressFor(caught, 'map-1').bestCompletionTimeMs).toBe(45_000);
  });

  it('stays null while the map has never been finished', () => {
    const progress: MapProgress = progressFor(apply(resultWith({ completed: false })), 'map-1');

    expect(progress.bestCompletionTimeMs).toBeNull();
  });
});

describe('unlocks', () => {
  it('unlocks the next map on a clean completion', () => {
    expect(unlockedBy(resultWith(), profileWith(), MAPS)).toEqual(['map-2']);
    expect(apply(resultWith()).unlockedMapIds).toContain('map-2');
  });

  it('unlocks nothing for a run that was not finished', () => {
    expect(unlockedBy(resultWith({ completed: false }), profileWith(), MAPS)).toEqual([]);
  });

  it('unlocks nothing when the accuracy gate is missed', () => {
    // Map 2 asks for 85%.
    expect(unlockedBy(resultWith({ accuracy: 0.8 }), profileWith(), MAPS)).toEqual([]);
  });

  it('does not unlock the same map twice', () => {
    const once = apply(resultWith());
    const twice = apply(resultWith(), once);

    expect(twice.unlockedMapIds.filter((id) => id === 'map-2')).toHaveLength(1);
  });

  it('never unlocks a map further down the chain', () => {
    // Finishing Map 1 brilliantly does not open Map 3.
    expect(apply(resultWith({ accuracy: 1 })).unlockedMapIds).not.toContain('map-3');
  });
});

describe('what it leaves alone', () => {
  it('never touches settings', () => {
    const base = createPlayerProfile(NOW, 'map-1');
    const profile = profileWith({ settings: { ...base.settings, theme: 'dark' } });

    expect(apply(resultWith(), profile).settings.theme).toBe('dark');
  });

  it('does not mutate the profile it was given', () => {
    const profile = profileWith();
    const before = JSON.stringify(profile);

    apply(resultWith(), profile);

    expect(JSON.stringify(profile)).toBe(before);
  });
});
