import type { MapConfig, ObstacleDefinition, PromptEntry } from '../models';
import {
  deadlinePressure,
  type DeadlinePressure,
  deadlineProgress,
  obstaclePromptTiming,
  type PromptTiming,
  spawnDistanceMeters,
  timeToImpactMs,
} from '../timing';

/**
 * An obstacle placed in a run (spec §5, §6).
 *
 * The spawner (D1) says *which* obstacle and *when*; this places it in the world
 * and runs its clock. Resolution — the avoidance animation, the collision, the
 * consequences — is D3. What this module owns is the promise the game makes to
 * the player: **the prompt is on screen early enough that someone typing at the
 * map's stated target speed can finish it before impact.**
 *
 * That promise is why placement is derived from the B5 timing budget rather than
 * from a fixed distance. A fixed distance would silently demand a different WPM
 * on every map, and the displayed target would become a lie (spec §6).
 *
 * Three moments, in order:
 *
 *   1. **Warning.** The obstacle becomes visible with no prompt yet — long
 *      enough ahead to be noticed, not so long that it clutters the screen.
 *   2. **Prompt attached.** Time to impact has fallen to the available budget.
 *      The deadline is fixed at this instant and never moves again.
 *   3. **Deadline.** Reached impact without the prompt completed.
 *
 * Pure: no clock, no randomness, no DOM. Time and position arrive as arguments.
 */

export type ObstacleStatus = 'approaching' | 'active' | 'resolved' | 'missed';

export interface ActiveObstacle {
  /** Unique within a run, so two crates are never confused for each other. */
  readonly instanceId: string;
  readonly definition: ObstacleDefinition;
  readonly prompt: PromptEntry;
  readonly timing: PromptTiming;
  /** World position of the obstacle, in meters. Fixed once placed. */
  readonly impactMeters: number;
  readonly status: ObstacleStatus;
  /** Run time the obstacle was placed. */
  readonly spawnedAtMs: number;
  /** Run time the prompt attached, or `null` while still approaching. */
  readonly attachedAtMs: number | null;
  /**
   * Run time the prompt must be finished by, or `null` before attachment.
   *
   * Frozen at attachment. Recomputing it per frame would let a boost eat the
   * player's own slack: going faster would shorten the deadline it created.
   */
  readonly deadlineAtMs: number | null;
  readonly warned: boolean;
  /**
   * The deadline has passed and has been reported once.
   *
   * Separate from `status` on purpose: this module notices the deadline, but
   * only `resolution.ts` decides what it costs, and a status set from two places
   * is a status nobody owns. The flag is what keeps the report once-only.
   */
  readonly expired: boolean;
}

/**
 * How much earlier than the prompt the obstacle itself becomes visible, as a
 * multiple of the available time.
 *
 * The warning is a look-ahead, not extra typing time: the prompt still attaches
 * at exactly the budget, so the required WPM is unchanged. All this buys is the
 * chance to see the thing coming (spec §5 "early warning").
 */
export const WARNING_LEAD_FACTOR = 1.6;

export interface PlaceObstacleInput {
  readonly instanceId: string;
  readonly definition: ObstacleDefinition;
  readonly prompt: PromptEntry;
  readonly map: MapConfig;
  /** Where the MC is now, in meters. */
  readonly playerMeters: number;
  readonly elapsedMs: number;
}

/**
 * Places an obstacle ahead of the MC.
 *
 * Distance comes from the map's **base** speed, not the current speed: an
 * obstacle placed during a boost would otherwise land early once the boost ends,
 * and the budget the player was promised would evaporate.
 */
export function placeObstacle(input: PlaceObstacleInput): ActiveObstacle {
  const timing = obstaclePromptTiming(input.map, input.definition, input.prompt);
  const leadMeters = spawnDistanceMeters(
    timing.availableMs * WARNING_LEAD_FACTOR,
    input.map.baseSpeedMetersPerSecond,
  );

  return {
    instanceId: input.instanceId,
    definition: input.definition,
    prompt: input.prompt,
    timing,
    impactMeters: input.playerMeters + leadMeters,
    status: 'approaching',
    spawnedAtMs: input.elapsedMs,
    attachedAtMs: null,
    deadlineAtMs: null,
    warned: false,
    expired: false,
  };
}

/** Meters between the MC and the obstacle. Negative once it is behind them. */
export function distanceToImpact(obstacle: ActiveObstacle, playerMeters: number): number {
  return obstacle.impactMeters - playerMeters;
}

/**
 * Milliseconds until the MC reaches the obstacle at their current speed.
 *
 * Uses current speed, so the HUD's countdown reflects a boost immediately. The
 * deadline does not — see `deadlineAtMs`.
 */
export function timeToImpact(
  obstacle: ActiveObstacle,
  playerMeters: number,
  speedMetersPerSecond: number,
): number {
  return timeToImpactMs(distanceToImpact(obstacle, playerMeters), speedMetersPerSecond);
}

/** Milliseconds left on the deadline, or `null` before the prompt attaches. */
export function remainingMs(obstacle: ActiveObstacle, elapsedMs: number): number | null {
  if (obstacle.deadlineAtMs === null) return null;

  return Math.max(0, obstacle.deadlineAtMs - elapsedMs);
}

/** Deadline pressure for HUD colour and audio, `safe` while still approaching. */
export function obstaclePressure(obstacle: ActiveObstacle, elapsedMs: number): DeadlinePressure {
  const remaining = remainingMs(obstacle, elapsedMs);
  if (remaining === null) return 'safe';
  if (obstacle.status === 'resolved') return 'safe';

  return deadlinePressure(remaining, obstacle.timing.availableMs);
}

/** Fraction of the deadline consumed, 0..1, for the HUD pressure meter. */
export function obstacleProgress(obstacle: ActiveObstacle, elapsedMs: number): number {
  if (obstacle.attachedAtMs === null) return 0;

  return deadlineProgress(elapsedMs - obstacle.attachedAtMs, obstacle.timing.availableMs);
}

/**
 * The WPM a player must actually sustain to beat this obstacle.
 *
 * The honesty check from spec §6: if this exceeds the map's target, the map is
 * lying about its difficulty. Asserted in the tests for every obstacle Map 1
 * can spawn.
 */
export function isFair(obstacle: ActiveObstacle): boolean {
  return obstacle.timing.spareMs >= 0;
}

export type ObstacleEvent =
  | { readonly type: 'obstacleWarning'; readonly obstacle: ActiveObstacle }
  | { readonly type: 'promptAttached'; readonly obstacle: ActiveObstacle }
  | { readonly type: 'deadlineExpired'; readonly obstacle: ActiveObstacle };

export interface ObstacleAdvanceInput {
  readonly playerMeters: number;
  readonly speedMetersPerSecond: number;
  readonly elapsedMs: number;
}

export interface ObstacleAdvanceResult {
  readonly obstacle: ActiveObstacle;
  readonly events: readonly ObstacleEvent[];
}

/**
 * Advances one obstacle by a step.
 *
 * Each transition fires at most once — the flags on the obstacle are what make
 * that true, so a stalled frame that crosses two thresholds still produces one
 * warning and one attachment rather than a burst.
 */
export function advanceObstacle(
  obstacle: ActiveObstacle,
  input: ObstacleAdvanceInput,
): ObstacleAdvanceResult {
  // Resolved and missed obstacles are inert. D3 owns what happens to them next;
  // until then they must never fire another event.
  if (obstacle.status === 'resolved' || obstacle.status === 'missed') {
    return { obstacle, events: [] };
  }

  const events: ObstacleEvent[] = [];
  let current = obstacle;

  const untilImpactMs = timeToImpact(current, input.playerMeters, input.speedMetersPerSecond);

  if (!current.warned) {
    current = { ...current, warned: true };
    events.push({ type: 'obstacleWarning', obstacle: current });
  }

  if (current.status === 'approaching' && untilImpactMs <= current.timing.availableMs) {
    current = {
      ...current,
      status: 'active',
      attachedAtMs: input.elapsedMs,
      // The deadline is wall-of-run time, fixed here. From this moment the
      // player owns the budget; speeding up cannot take it back.
      deadlineAtMs: input.elapsedMs + current.timing.availableMs,
    };
    events.push({ type: 'promptAttached', obstacle: current });
  }

  if (
    current.status === 'active' &&
    !current.expired &&
    current.deadlineAtMs !== null &&
    input.elapsedMs >= current.deadlineAtMs
  ) {
    // The status stays `active`: `resolution.ts` turns this into a stumble or a
    // hit, and it needs an unresolved obstacle to work on.
    current = { ...current, expired: true };
    events.push({ type: 'deadlineExpired', obstacle: current });
  }

  return { obstacle: current, events };
}

/** Advances every live obstacle, dropping the ones the MC has left behind. */
export function advanceObstacles(
  obstacles: readonly ActiveObstacle[],
  input: ObstacleAdvanceInput,
  /** How far behind the MC an obstacle is forgotten, in meters. */
  despawnMarginMeters = 12,
): { obstacles: readonly ActiveObstacle[]; events: readonly ObstacleEvent[] } {
  const events: ObstacleEvent[] = [];
  const kept: ActiveObstacle[] = [];

  for (const obstacle of obstacles) {
    const result = advanceObstacle(obstacle, input);
    events.push(...result.events);

    const behind = distanceToImpact(result.obstacle, input.playerMeters) < -despawnMarginMeters;
    if (!behind) kept.push(result.obstacle);
  }

  return { obstacles: kept, events };
}
