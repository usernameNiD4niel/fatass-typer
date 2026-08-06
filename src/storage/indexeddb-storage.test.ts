import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import type { PlayerProfile, RunResult } from '../game-core/models';
import { createPlayerProfile, emptyRunResult } from '../game-core/models';
import { IndexedDbStorage, indexedDbAvailable } from './indexeddb-storage';

/**
 * Progress that survives a reload (plan 2.1).
 *
 * Against `fake-indexeddb` rather than a hand-rolled double, because the parts
 * worth testing are the ones a hand-rolled double would get wrong: transactions,
 * key paths, indexes, and what a store does when it is asked for a record that
 * is not there.
 *
 * The point every test here shares is that **the database is not the game's
 * memory**. Everything it returns came off a disk the game does not control, and
 * is treated as untrusted input.
 */

const NOW = '2026-01-01T00:00:00.000Z';

function profile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createPlayerProfile(NOW, 'map-1'), ...overrides };
}

function run(id: string, mapId = 'map-1', startedAt = NOW): RunResult {
  return { ...emptyRunResult(id, mapId, startedAt), score: 100 };
}

/** A storage on its own private database, so tests cannot see each other. */
let counter = 0;
function freshStorage(historyLimit?: number): IndexedDbStorage {
  counter += 1;

  return new IndexedDbStorage({
    factory: new IDBFactory(),
    databaseName: `test-${String(counter)}`,
    now: () => NOW,
    ...(historyLimit === undefined ? {} : { historyLimit }),
  });
}

describe('a profile', () => {
  it('is null for a player who has never run', async () => {
    await expect(freshStorage().loadProfile()).resolves.toBeNull();
  });

  it('survives being written and read back', async () => {
    const storage = freshStorage();
    await storage.saveProfile(profile({ sustainablePeakWpm: 42 }));

    await expect(storage.loadProfile()).resolves.toMatchObject({ sustainablePeakWpm: 42 });
  });

  it('survives a new connection to the same database, which is the whole point', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbStorage({ factory, databaseName: 'shared', now: () => NOW });
    await first.saveProfile(profile({ sustainablePeakWpm: 55 }));

    // A different instance against the same database is what a page reload is.
    const second = new IndexedDbStorage({ factory, databaseName: 'shared', now: () => NOW });

    await expect(second.loadProfile()).resolves.toMatchObject({ sustainablePeakWpm: 55 });
  });

  it('is repaired field by field rather than discarded', async () => {
    const factory = new IDBFactory();
    const storage = new IndexedDbStorage({ factory, databaseName: 'damaged', now: () => NOW });
    const damaged = { ...profile({ sustainablePeakWpm: 20 }), lifetimeCharacters: 'lots' };

    await storage.saveProfile(damaged as unknown as PlayerProfile);
    const loaded = await storage.loadProfile();

    // Spec §17. This matters more here than in memory: the stored copy can be
    // edited in devtools, or written by a previous version of the game.
    expect(loaded?.sustainablePeakWpm).toBe(20);
    expect(loaded?.lifetimeCharacters).toBe(0);
  });

  it('is overwritten rather than accumulated', async () => {
    const storage = freshStorage();
    await storage.saveProfile(profile({ sustainablePeakWpm: 10 }));
    await storage.saveProfile(profile({ sustainablePeakWpm: 20 }));

    await expect(storage.loadProfile()).resolves.toMatchObject({ sustainablePeakWpm: 20 });
  });
});

describe('run history', () => {
  it('comes back newest first', async () => {
    const storage = freshStorage();
    await storage.appendRun(run('a', 'map-1', '2026-01-01T00:00:00.000Z'));
    await storage.appendRun(run('b', 'map-1', '2026-01-03T00:00:00.000Z'));
    await storage.appendRun(run('c', 'map-1', '2026-01-02T00:00:00.000Z'));

    const runs = await storage.listRuns();

    expect(runs.map((entry) => entry.runId)).toEqual(['b', 'c', 'a']);
  });

  it('filters to one map', async () => {
    const storage = freshStorage();
    await storage.appendRun(run('a', 'map-1'));
    await storage.appendRun(run('b', 'map-2'));

    const runs = await storage.listRunsForMap('map-2');

    expect(runs.map((entry) => entry.runId)).toEqual(['b']);
  });

  it('cannot record the same run twice', async () => {
    const storage = freshStorage();
    await storage.appendRun(run('a'));
    await storage.appendRun(run('a'));

    // Keyed on `runId`, so a double append is an overwrite. A surrogate key
    // would have produced two records for one run.
    await expect(storage.listRuns()).resolves.toHaveLength(1);
  });

  it('drops the oldest once the cap is passed', async () => {
    const storage = freshStorage(3);
    for (let index = 0; index < 6; index += 1) {
      const day = String(index + 1).padStart(2, '0');
      await storage.appendRun(run(`r${String(index)}`, 'map-1', `2026-01-${day}T00:00:00.000Z`));
    }

    const runs = await storage.listRuns();

    // A keyed store does not trim itself the way an array slice does, and
    // without this a player who runs daily accumulates records forever.
    expect(runs).toHaveLength(3);
    expect(runs.map((entry) => entry.runId)).toEqual(['r5', 'r4', 'r3']);
  });

  it('skips a record that does not validate rather than serving it', async () => {
    const storage = freshStorage();
    await storage.appendRun(run('good'));
    await storage.appendRun({ runId: 'junk', mapId: 'map-1' } as unknown as RunResult);

    const runs = await storage.listRuns();

    // Unlike a profile, one bad run is not somebody's progress — a history is
    // more useful missing an entry than carrying a fictional one.
    expect(runs.map((entry) => entry.runId)).toEqual(['good']);
  });

  it('honours a limit', async () => {
    const storage = freshStorage();
    await storage.appendRun(run('a', 'map-1', '2026-01-01T00:00:00.000Z'));
    await storage.appendRun(run('b', 'map-1', '2026-01-02T00:00:00.000Z'));

    await expect(storage.listRuns(1)).resolves.toHaveLength(1);
  });
});

describe('clearing', () => {
  it('removes the profile and the history', async () => {
    const storage = freshStorage();
    await storage.saveProfile(profile());
    await storage.appendRun(run('a'));

    await storage.clear();

    await expect(storage.loadProfile()).resolves.toBeNull();
    await expect(storage.listRuns()).resolves.toEqual([]);
  });
});

describe('when the browser will not persist', () => {
  /** An `open` that always fails, as private-browsing modes do. */
  function refusing(): IDBFactory {
    return {
      open: () => {
        const request = {
          onerror: null as null | (() => void),
          onsuccess: null,
          onupgradeneeded: null,
          onblocked: null,
        };
        queueMicrotask(() => request.onerror?.());

        return request as unknown as IDBOpenDBRequest;
      },
    } as unknown as IDBFactory;
  }

  it('reads as empty rather than throwing', async () => {
    const storage = new IndexedDbStorage({ factory: refusing(), now: () => NOW });

    // Losing progress is bad; refusing to let somebody play is worse.
    await expect(storage.loadProfile()).resolves.toBeNull();
    await expect(storage.listRuns()).resolves.toEqual([]);
    await expect(storage.listRunsForMap('map-1')).resolves.toEqual([]);
  });

  it('swallows writes rather than throwing', async () => {
    const storage = new IndexedDbStorage({ factory: refusing(), now: () => NOW });

    await expect(storage.saveProfile(profile())).resolves.toBeUndefined();
    await expect(storage.appendRun(run('a'))).resolves.toBeUndefined();
    await expect(storage.clear()).resolves.toBeUndefined();
  });
});

describe('availability', () => {
  it('is true when a factory is supplied', () => {
    expect(indexedDbAvailable(new IDBFactory())).toBe(true);
  });
});
