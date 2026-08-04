import type { LaneIndex, LaneSide, MapConfig, ObstacleDefinition, PromptEntry } from '../models';
import {
  deadlinePressure,
  type DeadlinePressure,
  deadlineProgress,
  motionReserveMs,
  obstaclePromptTiming,
  type PromptTiming,
  spawnDistanceMeters,
  timeToImpactMs,
} from '../timing';
import type { LaneAssignment } from './lane-assignment';

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

export type ObstacleStatus = 'approaching' | 'active' | 'committed' | 'resolved' | 'missed';

export interface ActiveObstacle {
  /** Unique within a run, so two crates are never confused for each other. */
  readonly instanceId: string;
  readonly definition: ObstacleDefinition;
  readonly prompt: PromptEntry;
  readonly timing: PromptTiming;
  /** World position of the obstacle, in meters. Fixed once placed. */
  readonly impactMeters: number;
  /** Lanes the hazard occupies. The player must be in none of them at impact. */
  readonly blockedLanes: readonly LaneIndex[];
  /** The lane the challenge points at, or `null` for a jump hazard. */
  readonly safeLane: LaneIndex | null;
  /** Which way that lane lies from the player. `null` for a jump hazard. */
  readonly safeSide: LaneSide | null;
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
   * Run time the prompt was finished and the avoidance move began, or `null`.
   *
   * Typing the word is not surviving the hazard. It starts the move; the move
   * has to finish, and whether it did is decided at the collision plane.
   */
  readonly committedAtMs: number | null;
  /** The collision plane has been reached and reported once. */
  readonly impacted: boolean;
  /**
   * Road the avoidance move needs, in milliseconds.
   *
   * Frozen at placement, so the deadline sits exactly this far in front of the
   * collision plane however the map is retuned afterwards.
   */
  readonly reserveMs: number;
  /**
   * The avoidance move has actually begun.
   *
   * Separate from `committedAtMs` because the two are not the same moment for a
   * jump: committing early would otherwise mean landing before the obstacle
   * arrived. See `moveIsDue`.
   */
  readonly moveStarted: boolean;
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
 *
 * Lowered from 1.6 after playtesting. At 1.6 the player spent well over two
 * seconds watching a hazard approach with nothing to do, and that dead time —
 * not the difficulty — was what made the game feel slow.
 */
export const WARNING_LEAD_FACTOR = 1.15;

export interface PlaceObstacleInput {
  readonly instanceId: string;
  readonly definition: ObstacleDefinition;
  readonly prompt: PromptEntry;
  readonly map: MapConfig;
  /** Where the player is now, in meters. */
  readonly playerMeters: number;
  readonly elapsedMs: number;
  /** Which lanes this hazard blocks, from `lane-assignment.ts`. */
  readonly assignment: LaneAssignment;
  /**
   * Speed the placement is measured against, in metres per second.
   *
   * Defaults to the map's base speed. The run passes the fastest the player
   * could be travelling while this hazard approaches, so that a boost cannot
   * eat the budget the deadline promised.
   */
  readonly speedMetersPerSecond?: number;
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
  /*
   * The budget buys typing time; the reserve buys road.
   *
   * After the last keystroke the player still has to travel — sideways into the
   * safe lane, or upward over the barrier. Adding the reserve here is what makes
   * the deadline and the animation incapable of disagreeing: both read the same
   * `MotionProfile`, so slowing a lane change automatically moves cars further
   * away rather than quietly making them unavoidable.
   */
  const reserveMs = motionReserveMs(input.definition.action, input.map.motion);
  const leadMeters = spawnDistanceMeters(
    (timing.availableMs + reserveMs) * WARNING_LEAD_FACTOR,
    input.speedMetersPerSecond ?? input.map.baseSpeedMetersPerSecond,
  );

  return {
    instanceId: input.instanceId,
    definition: input.definition,
    prompt: input.prompt,
    timing,
    impactMeters: input.playerMeters + leadMeters,
    blockedLanes: input.assignment.blockedLanes,
    safeLane: input.assignment.safeLane,
    safeSide: input.assignment.safeSide,
    status: 'approaching',
    spawnedAtMs: input.elapsedMs,
    attachedAtMs: null,
    deadlineAtMs: null,
    warned: false,
    committedAtMs: null,
    impacted: false,
    reserveMs,
    moveStarted: false,
    expired: false,
  };
}

/** Reserve this hazard's avoidance move needs, in milliseconds. */
export function reserveMsFor(obstacle: ActiveObstacle, map: MapConfig): number {
  return motionReserveMs(obstacle.definition.action, map.motion);
}

/** Does the hazard occupy `lane`? Accepts a continuous, mid-transition lane. */
export function blocksLane(obstacle: ActiveObstacle, lane: number): boolean {
  return obstacle.blockedLanes.some((blocked) => blocked === lane);
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
  | { readonly type: 'deadlineExpired'; readonly obstacle: ActiveObstacle }
  /** The player has reached the hazard. Whatever their motion is now, is the answer. */
  | { readonly type: 'reachedImpact'; readonly obstacle: ActiveObstacle };

/**
 * Marks the prompt finished and the avoidance move started.
 *
 * Does not resolve anything. The hazard is survived at the collision plane or
 * not at all — this only records that the player earned the attempt.
 */
export function commitObstacle(
  obstacle: ActiveObstacle,
  elapsedMs: number,
  moveStarted = false,
): ActiveObstacle {
  if (obstacle.status !== 'active') return obstacle;

  return { ...obstacle, status: 'committed', committedAtMs: elapsedMs, moveStarted };
}

/**
 * Is it time to actually jump?
 *
 * A lane change begins the moment the word is finished — moving early is only
 * ever safer, and it reads as decisiveness. A jump is different: an arc started
 * too early has landed again by the time the obstacle arrives, and the player
 * would clip a barrier they had beaten. So the jump waits until the obstacle is
 * one reserve away, which is precisely the PDF's "synchronized jump that clears
 * the obstacle at its collision point" (§7).
 */
export function moveIsDue(
  obstacle: ActiveObstacle,
  playerMeters: number,
  speedMetersPerSecond: number,
): boolean {
  if (obstacle.status !== 'committed' || obstacle.moveStarted) return false;

  return timeToImpact(obstacle, playerMeters, speedMetersPerSecond) <= obstacle.reserveMs;
}

/** Records that the avoidance move has begun. */
export function startMove(obstacle: ActiveObstacle): ActiveObstacle {
  return obstacle.moveStarted ? obstacle : { ...obstacle, moveStarted: true };
}

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

  // Attached a reserve early, so the deadline lands a move's worth of road in
  // front of the collision plane rather than on top of it.
  if (
    current.status === 'approaching' &&
    untilImpactMs <= current.timing.availableMs + current.reserveMs
  ) {
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
    // The status stays `active`: `resolution.ts` decides what it costs, and it
    // needs an unresolved obstacle to work on.
    current = { ...current, expired: true };
    events.push({ type: 'deadlineExpired', obstacle: current });
  }

  // The collision plane. Reached at most once, and only reported for a hazard
  // still in play — an expired one has already failed at its deadline.
  if (!current.impacted && input.playerMeters >= current.impactMeters) {
    current = { ...current, impacted: true };
    events.push({ type: 'reachedImpact', obstacle: current });
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
