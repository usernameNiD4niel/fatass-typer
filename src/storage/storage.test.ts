import { describe, expect, it } from 'vitest';

import type { PlayerProfile, RunResult } from '../game-core/models';
import { createPlayerProfile, emptyRunResult } from '../game-core/models';
import { InMemoryStorage, RUN_HISTORY_LIMIT } from './in-memory-storage';

const NOW = '2026-01-01T00:00:00.000Z';

function profile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile(NOW, 'map-1'), ...overrides };
}

function run(id: string, mapId = 'map-1'): RunResult {
  return { ...emptyRunResult(id, mapId, NOW), score: 100 };
}

describe('loading a profile', () => {
  it('returns null for a player who has never run', async () => {
    // Not an error: a first-run player simply has nothing stored.
    await expect(new InMemoryStorage().loadProfile()).resolves.toBeNull();
  });

  it('returns what was saved', async () => {
    const storage = new InMemoryStorage();
    await storage.saveProfile(profile({ sustainablePeakWpm: 31 }));

    await expect(storage.loadProfile()).resolves.toMatchObject({ sustainablePeakWpm: 31 });
  });

  it('repairs a damaged profile rather than discarding it', async () => {
    // Spec §17: one bad number is not a reason to lose a player's progress.
    const damaged = { ...profile({ sustainablePeakWpm: 20 }), lifetimeCharacters: 'lots' };
    const storage = new InMemoryStorage({ initialProfile: damaged as unknown as PlayerProfile });

    const loaded = await storage.loadProfile();

    expect(loaded?.sustainablePeakWpm).toBe(20);
    expect(loaded?.lifetimeCharacters).toBe(0);
  });

  it('always leaves the first map playable, whatever the save says', async () => {
    const storage = new InMemoryStorage({
      initialProfile: profile({ unlockedMapIds: [] }),
      firstMapId: 'map-1',
    });

    await expect(storage.loadProfile()).resolves.toMatchObject({ unlockedMapIds: ['map-1'] });
  });
});

describe('run history', () => {
  it('starts empty', async () => {
    await expect(new InMemoryStorage().listRuns()).resolves.toEqual([]);
  });

  it('returns the most recent run first', async () => {
    const storage = new InMemoryStorage();
    await storage.appendRun(run('first'));
    await storage.appendRun(run('second'));

    const runs = await storage.listRuns();

    expect(runs.map((entry) => entry.runId)).toEqual(['second', 'first']);
  });

  it('honours a limit', async () => {
    const storage = new InMemoryStorage();
    for (const id of ['a', 'b', 'c']) await storage.appendRun(run(id));

    await expect(storage.listRuns(2)).resolves.toHaveLength(2);
  });

  it('caps the history, so a long session does not grow without bound', async () => {
    const storage = new InMemoryStorage({ historyLimit: 3 });
    for (const id of ['a', 'b', 'c', 'd', 'e']) await storage.appendRun(run(id));

    const runs = await storage.listRuns();

    expect(runs).toHaveLength(3);
    // The oldest fall off, not the newest.
    expect(runs.map((entry) => entry.runId)).toEqual(['e', 'd', 'c']);
  });

  it('has a sensible default cap', () => {
    expect(RUN_HISTORY_LIMIT).toBeGreaterThan(10);
    expect(RUN_HISTORY_LIMIT).toBeLessThanOrEqual(200);
  });

  it('filters by map', async () => {
    const storage = new InMemoryStorage();
    await storage.appendRun(run('one', 'map-1'));
    await storage.appendRun(run('two', 'map-2'));
    await storage.appendRun(run('three', 'map-1'));

    const runs = await storage.listRunsForMap('map-1');

    expect(runs.map((entry) => entry.runId)).toEqual(['three', 'one']);
  });

  it('returns nothing for a map never played', async () => {
    await expect(new InMemoryStorage().listRunsForMap('map-6')).resolves.toEqual([]);
  });
});

describe('clearing', () => {
  it('removes the profile and the history', async () => {
    const storage = new InMemoryStorage();
    await storage.saveProfile(profile());
    await storage.appendRun(run('a'));

    await storage.clear();

    await expect(storage.loadProfile()).resolves.toBeNull();
    await expect(storage.listRuns()).resolves.toEqual([]);
  });
});
