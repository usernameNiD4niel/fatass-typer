import type { ContentProfile, ObstacleDefinition, ObstacleId } from '../models';
import { jitter, pick, type Rng } from '../random';

/**
 * Obstacle spawning (spec §5, §6).
 *
 * Decides *when* the next obstacle appears and *which* one it is. It does not
 * decide where on screen it goes, when its prompt is due, or what happens on
 * impact — that is D2 and D3. Keeping the schedule separate means the spacing
 * can be tuned without touching resolution logic.
 *
 * Pure and seeded, like everything in `game-core`: the same seed produces the
 * same sequence of obstacles at the same moments, which is what makes a run
 * reproducible from a bug report.
 */

export interface SpawnerState {
  readonly rng: Rng;
  /** Run time at which the next obstacle is due, in milliseconds. */
  readonly nextSpawnAtMs: number;
  /** Prevents the same obstacle twice in a row while an alternative exists. */
  readonly lastObstacleId: ObstacleId | null;
  readonly spawnCount: number;
}

/**
 * Delay before the first obstacle, as a fraction of the map's interval.
 *
 * A run that opens with an obstacle gives the player no time to read the first
 * boost prompt, or even to understand what they are looking at.
 */
const FIRST_SPAWN_FACTOR = 1.5;

/** Shortest gap the jitter may produce, as a fraction of the interval. */
const MINIMUM_INTERVAL_FACTOR = 0.4;

function intervalMs(content: ContentProfile): number {
  return content.obstacleIntervalSeconds * 1_000;
}

/** Draws the next gap, jittered — perfectly even spacing feels mechanical. */
function nextInterval(rng: Rng, content: ContentProfile): { delayMs: number; rng: Rng } {
  const base = intervalMs(content);
  const drawn = jitter(rng, base, content.obstacleIntervalJitter);

  // The floor matters: a large jitter could otherwise stack two obstacles close
  // enough that the second prompt appears before the first is resolved.
  return { delayMs: Math.max(base * MINIMUM_INTERVAL_FACTOR, drawn.value), rng: drawn.rng };
}

export function createSpawner(rng: Rng, content: ContentProfile, startAtMs = 0): SpawnerState {
  return {
    rng,
    nextSpawnAtMs: startAtMs + intervalMs(content) * FIRST_SPAWN_FACTOR,
    lastObstacleId: null,
    spawnCount: 0,
  };
}

/** Obstacles this map may spawn, honouring each obstacle's minimum map. */
export function eligibleObstacles(
  pool: readonly ObstacleDefinition[],
  content: ContentProfile,
  mapNumber: number,
): readonly ObstacleDefinition[] {
  const allowed = new Set(content.obstacleIds);

  return pool.filter((obstacle) => allowed.has(obstacle.id) && obstacle.minimumMap <= mapNumber);
}

/**
 * Chooses which obstacle to spawn.
 *
 * Back-to-back repeats are avoided while an alternative exists — a map with one
 * obstacle still spawns it every time, it just cannot pretend to have variety.
 */
function chooseObstacle(
  rng: Rng,
  candidates: readonly ObstacleDefinition[],
  lastObstacleId: ObstacleId | null,
): { obstacle: ObstacleDefinition | null; rng: Rng } {
  if (candidates.length === 0) return { obstacle: null, rng };

  const fresh =
    candidates.length > 1 && lastObstacleId !== null
      ? candidates.filter((obstacle) => obstacle.id !== lastObstacleId)
      : candidates;

  const drawn = pick(rng, fresh.length > 0 ? fresh : candidates);

  return { obstacle: drawn.value, rng: drawn.rng };
}

export interface SpawnerInput {
  readonly content: ContentProfile;
  readonly mapNumber: number;
  readonly pool: readonly ObstacleDefinition[];
}

export interface SpawnResult {
  readonly state: SpawnerState;
  /** Obstacles that came due, oldest first. Usually empty, occasionally one. */
  readonly spawned: readonly ObstacleDefinition[];
}

/**
 * Reports everything due at `elapsedMs`.
 *
 * Returns a list rather than a single obstacle because a long frame — a tab
 * restored, a stalled main thread — can cross more than one due time. Dropping
 * the extras would silently make a map easier after a hitch.
 */
export function advanceSpawner(
  state: SpawnerState,
  elapsedMs: number,
  input: SpawnerInput,
): SpawnResult {
  const candidates = eligibleObstacles(input.pool, input.content, input.mapNumber);

  // A map with no obstacles is legitimate — Map 1 in the vertical slice is
  // exactly that — so the schedule simply never produces anything.
  if (candidates.length === 0 || elapsedMs < state.nextSpawnAtMs) {
    return { state, spawned: [] };
  }

  const spawned: ObstacleDefinition[] = [];
  let current = state;

  // Bounded by the schedule advancing at least MINIMUM_INTERVAL_FACTOR of the
  // map interval each time, so this cannot spin.
  while (elapsedMs >= current.nextSpawnAtMs) {
    const chosen = chooseObstacle(current.rng, candidates, current.lastObstacleId);
    if (chosen.obstacle === null) break;

    const next = nextInterval(chosen.rng, input.content);

    spawned.push(chosen.obstacle);
    current = {
      rng: next.rng,
      nextSpawnAtMs: current.nextSpawnAtMs + next.delayMs,
      lastObstacleId: chosen.obstacle.id,
      spawnCount: current.spawnCount + 1,
    };
  }

  return { state: current, spawned };
}

/** Milliseconds until the next obstacle is due. Zero once it is overdue. */
export function msUntilNextSpawn(state: SpawnerState, elapsedMs: number): number {
  return Math.max(0, state.nextSpawnAtMs - elapsedMs);
}
