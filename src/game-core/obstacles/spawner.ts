import type { ContentProfile, ObstacleAction, ObstacleDefinition, ObstacleId } from '../models';
import { jitter, pick, type Rng } from '../random';

/**
 * Hazard spawning (spec §5, §6, §14).
 *
 * Decides *when* the next hazard appears and *which* one it is. It does not
 * decide which lanes it blocks (`lane-assignment.ts`), when its prompt is due,
 * or what happens on impact.
 *
 * ## One at a time
 *
 * The rule that makes fairness cheap: **no hazard spawns while another is
 * unresolved.** From that single gate three separate requirements fall out for
 * free — only one challenge active at a time, hazards never overlap, and the
 * safe lane stays open for the whole avoidance window, because there is nothing
 * else on the road that could close it.
 *
 * It also removes a whole class of bug the old list-returning version had to
 * think about. A long frame can no longer cross two due times and stack two
 * hazards on top of each other, so the schedule catches up rather than piling
 * up.
 *
 * Pure and seeded, like everything in `game-core`: the same seed produces the
 * same hazards at the same moments, which is what makes a run reproducible from
 * a bug report.
 */

export interface SpawnerState {
  readonly rng: Rng;
  /** Run time at which the next hazard is due, in milliseconds. */
  readonly nextSpawnAtMs: number;
  /** Prevents the same hazard twice in a row while an alternative exists. */
  readonly lastObstacleId: ObstacleId | null;
  /** Prevents a third car — or a third jump — in a row. */
  readonly lastAction: ObstacleAction | null;
  readonly repeatedActionCount: number;
  /**
   * Nothing spawns before this moment. Set when a hazard resolves, so the
   * player gets a breath between encounters rather than meeting the next one
   * mid-landing (spec §14 recovery interval).
   */
  readonly recoveryUntilMs: number;
  readonly spawnCount: number;
}

/**
 * Delay before the first hazard, as a fraction of the map's interval.
 *
 * A run that opens with a hazard gives the player no time to understand what
 * they are looking at.
 */
const FIRST_SPAWN_FACTOR = 0.8;

/** Shortest gap the jitter may produce, as a fraction of the interval. */
const MINIMUM_INTERVAL_FACTOR = 0.4;

/** Consecutive hazards of one kind before the other kind is forced. */
const MAX_REPEATED_ACTIONS = 2;

function intervalMs(content: ContentProfile): number {
  return content.obstacleIntervalSeconds * 1_000;
}

/** Draws the next gap, jittered — perfectly even spacing feels mechanical. */
function nextInterval(rng: Rng, content: ContentProfile): { delayMs: number; rng: Rng } {
  const base = intervalMs(content);
  const drawn = jitter(rng, base, content.obstacleIntervalJitter);

  return { delayMs: Math.max(base * MINIMUM_INTERVAL_FACTOR, drawn.value), rng: drawn.rng };
}

export function createSpawner(rng: Rng, content: ContentProfile, startAtMs = 0): SpawnerState {
  return {
    rng,
    nextSpawnAtMs: startAtMs + intervalMs(content) * FIRST_SPAWN_FACTOR,
    lastObstacleId: null,
    lastAction: null,
    repeatedActionCount: 0,
    recoveryUntilMs: 0,
    spawnCount: 0,
  };
}

/** Hazards this map may spawn, honouring each one's minimum map. */
export function eligibleObstacles(
  pool: readonly ObstacleDefinition[],
  content: ContentProfile,
  mapNumber: number,
): readonly ObstacleDefinition[] {
  const allowed = new Set(content.obstacleIds);

  return pool.filter((obstacle) => allowed.has(obstacle.id) && obstacle.minimumMap <= mapNumber);
}

/**
 * Chooses which hazard to spawn.
 *
 * Two filters, both of which yield rather than starve: back-to-back repeats of
 * the same hazard are avoided while an alternative exists, and a run of the same
 * *verb* is broken up once it reaches `MAX_REPEATED_ACTIONS` — three cars in a
 * row stops being a road and starts being a slalom. A map that lists only jumps
 * still spawns only jumps; it simply cannot pretend to variety it does not have.
 */
function chooseObstacle(
  rng: Rng,
  candidates: readonly ObstacleDefinition[],
  state: SpawnerState,
): { obstacle: ObstacleDefinition | null; rng: Rng } {
  if (candidates.length === 0) return { obstacle: null, rng };

  let pool = candidates;

  if (state.lastAction !== null && state.repeatedActionCount >= MAX_REPEATED_ACTIONS) {
    const otherVerb = pool.filter((obstacle) => obstacle.action !== state.lastAction);
    if (otherVerb.length > 0) pool = otherVerb;
  }

  if (pool.length > 1 && state.lastObstacleId !== null) {
    const fresh = pool.filter((obstacle) => obstacle.id !== state.lastObstacleId);
    if (fresh.length > 0) pool = fresh;
  }

  const drawn = pick(rng, pool);

  return { obstacle: drawn.value, rng: drawn.rng };
}

export interface SpawnerInput {
  readonly content: ContentProfile;
  readonly mapNumber: number;
  readonly pool: readonly ObstacleDefinition[];
  /**
   * Whether any hazard is still approaching or active. The gate that makes the
   * fairness guarantees structural rather than statistical.
   */
  readonly hazardsLive: boolean;
  /**
   * Whether the player is currently going for a line of coins.
   *
   * Hazards wait for coins as well as for each other, which is what makes the
   * two alternate instead of competing. A car arriving mid-collection would
   * force the player to abandon a word they had already started — the one thing
   * an optional encounter must never do.
   */
  readonly coinsLive?: boolean;
}

export interface SpawnResult {
  readonly state: SpawnerState;
  /** The hazard that came due, or `null` — never more than one. */
  readonly spawned: ObstacleDefinition | null;
}

/** Reports the hazard due at `elapsedMs`, if the road is clear enough for one. */
export function advanceSpawner(
  state: SpawnerState,
  elapsedMs: number,
  input: SpawnerInput,
): SpawnResult {
  const candidates = eligibleObstacles(input.pool, input.content, input.mapNumber);

  // A map with no eligible hazards is legitimate; the schedule simply never
  // produces anything.
  if (candidates.length === 0) return { state, spawned: null };

  if (input.hazardsLive) return { state, spawned: null };
  if (input.coinsLive === true) return { state, spawned: null };
  if (elapsedMs < state.nextSpawnAtMs) return { state, spawned: null };
  if (elapsedMs < state.recoveryUntilMs) return { state, spawned: null };

  const chosen = chooseObstacle(state.rng, candidates, state);
  if (chosen.obstacle === null) return { state, spawned: null };

  const next = nextInterval(chosen.rng, input.content);
  const repeated = chosen.obstacle.action === state.lastAction ? state.repeatedActionCount + 1 : 1;

  return {
    state: {
      rng: next.rng,
      // Scheduled from now, not from the missed due time: after a recovery
      // interval or a long hazard, the next gap should be a gap, not an
      // immediate second hazard making up for lost time.
      nextSpawnAtMs: elapsedMs + next.delayMs,
      lastObstacleId: chosen.obstacle.id,
      lastAction: chosen.obstacle.action,
      repeatedActionCount: repeated,
      recoveryUntilMs: state.recoveryUntilMs,
      spawnCount: state.spawnCount + 1,
    },
    spawned: chosen.obstacle,
  };
}

/**
 * Hold off spawning until `recoverySeconds` after a hazard resolves.
 *
 * Called by the run when an encounter ends, win or lose. The breath between
 * encounters is part of the pacing, not an accident of the interval.
 */
export function beginRecovery(
  state: SpawnerState,
  elapsedMs: number,
  recoverySeconds: number,
): SpawnerState {
  const untilMs = elapsedMs + Math.max(0, recoverySeconds) * 1_000;

  return untilMs <= state.recoveryUntilMs ? state : { ...state, recoveryUntilMs: untilMs };
}

/** Milliseconds until the next hazard may appear. Zero once it is due. */
export function msUntilNextSpawn(state: SpawnerState, elapsedMs: number): number {
  return Math.max(0, Math.max(state.nextSpawnAtMs, state.recoveryUntilMs) - elapsedMs);
}
