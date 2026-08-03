import { describe, expect, it } from 'vitest';

import type { ContentProfile, ObstacleDefinition } from '../models';
import { createRngFromString } from '../random';
import {
  advanceSpawner,
  createSpawner,
  eligibleObstacles,
  msUntilNextSpawn,
  type SpawnerInput,
  type SpawnerState,
} from './spawner';

const POOL: readonly ObstacleDefinition[] = [
  {
    id: 'crate',
    label: 'Crate',
    action: 'jump',
    difficultyWeight: 0.2,
    minimumMap: 1,
    promptCategory: 'short-word',
    baseReactionTimeMs: 300,
  },
  {
    id: 'puddle',
    label: 'Puddle',
    action: 'jump',
    difficultyWeight: 0.15,
    minimumMap: 1,
    promptCategory: 'short-word',
    baseReactionTimeMs: 380,
  },
  {
    id: 'hanging-sign',
    label: 'Hanging sign',
    action: 'slide',
    difficultyWeight: 0.45,
    minimumMap: 3,
    promptCategory: 'medium-word',
    baseReactionTimeMs: 460,
  },
];

const CONTENT: ContentProfile = {
  promptCategories: ['short-word'],
  obstacleIds: ['crate', 'puddle', 'hanging-sign'],
  obstacleIntervalSeconds: 10,
  obstacleIntervalJitter: 0.2,
  themeTags: [],
};

function input(overrides: Partial<SpawnerInput> = {}): SpawnerInput {
  return { content: CONTENT, mapNumber: 1, pool: POOL, ...overrides };
}

function spawner(seed = 'seed', content: ContentProfile = CONTENT): SpawnerState {
  return createSpawner(createRngFromString(seed), content);
}

/** Steps the spawner forward in 100ms ticks, collecting everything it produced. */
function run(
  state: SpawnerState,
  totalMs: number,
  spawnerInput: SpawnerInput = input(),
): { state: SpawnerState; ids: string[] } {
  let current = state;
  const ids: string[] = [];

  for (let elapsed = 0; elapsed <= totalMs; elapsed += 100) {
    const result = advanceSpawner(current, elapsed, spawnerInput);
    current = result.state;
    ids.push(...result.spawned.map((obstacle) => obstacle.id));
  }

  return { state: current, ids };
}

describe('eligibleObstacles', () => {
  it('honours the map number', () => {
    expect(eligibleObstacles(POOL, CONTENT, 1).map((o) => o.id)).toEqual(['crate', 'puddle']);
    expect(eligibleObstacles(POOL, CONTENT, 3)).toHaveLength(3);
  });

  it('only spawns what the map lists', () => {
    const narrowed = { ...CONTENT, obstacleIds: ['puddle'] };

    expect(eligibleObstacles(POOL, narrowed, 6).map((o) => o.id)).toEqual(['puddle']);
  });

  it('returns nothing for a map with no obstacles', () => {
    expect(eligibleObstacles(POOL, { ...CONTENT, obstacleIds: [] }, 1)).toHaveLength(0);
  });
});

describe('spawn schedule', () => {
  it('does not open a run with an obstacle', () => {
    const state = spawner();

    expect(state.nextSpawnAtMs).toBeGreaterThan(CONTENT.obstacleIntervalSeconds * 1_000);
    expect(advanceSpawner(state, 0, input()).spawned).toHaveLength(0);
  });

  it('spawns nothing before the first due time', () => {
    expect(run(spawner(), 10_000).ids).toHaveLength(0);
  });

  it('spawns once the schedule comes due', () => {
    expect(run(spawner(), 20_000).ids.length).toBeGreaterThan(0);
  });

  it('keeps spawning across a long run', () => {
    const { ids } = run(spawner(), 120_000);

    // ~10s apart after a 15s lead-in, so roughly ten in two minutes.
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(ids.length).toBeLessThanOrEqual(14);
  });

  it('spaces obstacles unevenly but never too tightly', () => {
    let state = spawner();
    const dueTimes: number[] = [];

    for (let round = 0; round < 12; round += 1) {
      const previous = state.nextSpawnAtMs;
      state = advanceSpawner(state, previous, input()).state;
      dueTimes.push(state.nextSpawnAtMs - previous);
    }

    const floor = CONTENT.obstacleIntervalSeconds * 1_000 * 0.4;

    expect(Math.min(...dueTimes)).toBeGreaterThanOrEqual(floor);
    expect(new Set(dueTimes).size).toBeGreaterThan(1);
  });

  it('catches up on a long frame instead of silently dropping obstacles', () => {
    const state = spawner();
    // A tab restored after a minute crosses several due times at once.
    const result = advanceSpawner(state, 60_000, input());

    expect(result.spawned.length).toBeGreaterThan(1);
    expect(result.state.nextSpawnAtMs).toBeGreaterThan(60_000);
  });

  it('never repeats an obstacle back to back while alternatives exist', () => {
    const { ids } = run(spawner('variety'), 200_000);

    expect(ids.length).toBeGreaterThan(5);
    for (let index = 1; index < ids.length; index += 1) {
      expect(ids[index]).not.toBe(ids[index - 1]);
    }
  });

  it('repeats when the map has only one obstacle', () => {
    const single = { ...CONTENT, obstacleIds: ['crate'] };
    const { ids } = run(spawner('one', single), 60_000, input({ content: single }));

    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids)).toEqual(new Set(['crate']));
  });

  it('produces nothing at all when the map lists no obstacles', () => {
    const none = { ...CONTENT, obstacleIds: [] };
    const { ids, state } = run(spawner('none', none), 120_000, input({ content: none }));

    expect(ids).toHaveLength(0);
    expect(state.spawnCount).toBe(0);
  });

  it('counts what it has spawned', () => {
    const { state, ids } = run(spawner(), 60_000);

    expect(state.spawnCount).toBe(ids.length);
  });
});

describe('determinism', () => {
  it('produces the same sequence for the same seed', () => {
    expect(run(spawner('fixed'), 120_000).ids).toEqual(run(spawner('fixed'), 120_000).ids);
  });

  it('produces different sequences for different seeds', () => {
    const sequences = ['a', 'b', 'c', 'd'].map((seed) => run(spawner(seed), 120_000).ids.join());

    expect(new Set(sequences).size).toBeGreaterThan(1);
  });

  it('does not mutate the state it was given', () => {
    const state = spawner();
    const before = { ...state };

    advanceSpawner(state, 60_000, input());

    expect(state).toEqual(before);
  });
});

describe('msUntilNextSpawn', () => {
  it('counts down to the next obstacle', () => {
    const state = spawner();

    expect(msUntilNextSpawn(state, 0)).toBe(state.nextSpawnAtMs);
    expect(msUntilNextSpawn(state, state.nextSpawnAtMs - 500)).toBe(500);
  });

  it('reports zero once overdue rather than a negative time', () => {
    expect(msUntilNextSpawn(spawner(), 999_999)).toBe(0);
  });
});
