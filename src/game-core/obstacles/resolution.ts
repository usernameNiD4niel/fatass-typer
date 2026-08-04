import type { LaneIndex, MapConfig, ObstacleAction } from '../models';
import { isSettled, jumpHeightMeters, type PlayerMotion } from '../motion';
import type { TypingState } from '../typing';
import type { ActiveObstacle } from './active-obstacle';

/**
 * Resolving a hazard (spec §6, §7).
 *
 * Two endings now, not three. A hazard is **avoided** or it is **hit**, and a
 * hit ends the run — there is no partial credit, because there is nothing left
 * for partial credit to cost. The dogs used to absorb it; nothing does now.
 *
 * ## Typing the word is not surviving the hazard
 *
 * This is the change that matters. Completing the prompt *commits* the player:
 * it starts a lane change or a jump and earns them the points. Whether they
 * actually get past depends on where their body is when the collision plane
 * arrives — in the safe lane and settled, or above clearance height.
 *
 * In practice a committed player always makes it, because `motionReserveMs`
 * placed the hazard far enough away for the move to finish. That is the point:
 * the guarantee is *constructed*, and this check is where it is *verified*
 * rather than assumed. If a retune ever breaks it, a run says so immediately
 * instead of a player wondering why they clipped a car they had beaten.
 *
 * Pure: no clock, no randomness, no DOM.
 */

export type ObstacleOutcome = 'avoided' | 'hit';

/** Why a run ended at a hazard, for the game-over screen (spec §17). */
export type FailureReason =
  /** The deadline passed with the word unfinished. */
  | 'timeout'
  /** The word was never finished and the player drove into the hazard. */
  | 'collision'
  /** Committed, but the move had not carried them clear in time. */
  | 'late-move';

/** Fraction of the prompt correctly entered, 0..1. */
export function typedFraction(typing: TypingState): number {
  if (typing.target.length === 0) return 1;

  return Math.min(1, typing.correctCharacters / typing.target.length);
}

export interface ResolvedObstacle {
  readonly obstacle: ActiveObstacle;
  readonly outcome: ObstacleOutcome;
  /** `null` when the hazard was avoided. */
  readonly failureReason: FailureReason | null;
  /** How much of the prompt was entered, for scoring and the results screen. */
  readonly typedFraction: number;
  /** Milliseconds left on the deadline. Zero for a hit. */
  readonly remainingMs: number;
  readonly elapsedMs: number;
}

export interface ResolutionResult {
  readonly obstacle: ActiveObstacle;
  /** `null` when nothing was resolved — the usual case on any given step. */
  readonly resolved: ResolvedObstacle | null;
}

/**
 * Whether a hazard can still be resolved.
 *
 * The single guard the whole module rests on. A hazard that has already ended
 * must never end again: a late keystroke arriving in the same step as the
 * deadline, a duplicated event, or a re-entrant call would otherwise award a
 * second avoidance or charge a second collision.
 */
export function isResolvable(obstacle: ActiveObstacle): boolean {
  return obstacle.status === 'active' || obstacle.status === 'committed';
}

/**
 * Is the player's body clear of this hazard?
 *
 * The physical question, asked at the collision plane and nowhere else.
 *
 * A jump must be *above clearance*, not merely in progress: leaving the ground
 * late is the failure the reserve exists to prevent, so the check has to be able
 * to see it. A lane change must have *landed* — mid-transition the player is
 * still partly in the lane they are leaving, and clipping a car with your back
 * half is a collision in any game worth the name.
 */
export function clearsHazard(
  obstacle: ActiveObstacle,
  motion: PlayerMotion,
  map: MapConfig,
): boolean {
  if (obstacle.definition.action === 'jump') {
    return jumpHeightMeters(motion) >= map.motion.clearanceMeters;
  }

  if (obstacle.safeLane === null) return false;
  if (!isSettled(motion)) return false;

  return motion.lane === obstacle.safeLane && !occupiesBlockedLane(obstacle, motion.lane);
}

function occupiesBlockedLane(obstacle: ActiveObstacle, lane: LaneIndex): boolean {
  return obstacle.blockedLanes.includes(lane);
}

export interface ImpactInput {
  readonly obstacle: ActiveObstacle;
  readonly motion: PlayerMotion;
  readonly map: MapConfig;
  readonly typing: TypingState;
  readonly elapsedMs: number;
}

/**
 * The player has reached the hazard. Decide it, once.
 *
 * Everything before this moment was preparation; this is the only place a
 * hazard is survived.
 */
export function resolveAtImpact(input: ImpactInput): ResolutionResult {
  const { obstacle, elapsedMs } = input;
  if (!isResolvable(obstacle)) return { obstacle, resolved: null };

  const committed = obstacle.status === 'committed';
  const cleared = clearsHazard(obstacle, input.motion, input.map);

  if (cleared) {
    const resolvedObstacle: ActiveObstacle = { ...obstacle, status: 'resolved' };
    const deadline = obstacle.deadlineAtMs;

    return {
      obstacle: resolvedObstacle,
      resolved: {
        obstacle: resolvedObstacle,
        outcome: 'avoided',
        failureReason: null,
        typedFraction: typedFraction(input.typing),
        remainingMs:
          deadline === null || obstacle.committedAtMs === null
            ? 0
            : Math.max(0, deadline - obstacle.committedAtMs),
        elapsedMs,
      },
    };
  }

  const missedObstacle: ActiveObstacle = { ...obstacle, status: 'missed' };

  return {
    obstacle: missedObstacle,
    resolved: {
      obstacle: missedObstacle,
      outcome: 'hit',
      // A committed player who did not make it was moving, just not far enough:
      // worth telling apart from one who never typed the word, because the two
      // mean completely different things about how the map is tuned.
      failureReason: committed ? 'late-move' : 'collision',
      typedFraction: typedFraction(input.typing),
      remainingMs: 0,
      elapsedMs,
    },
  };
}

/**
 * The deadline passed with the word unfinished.
 *
 * A separate ending from the collision plane, and an earlier one: the reserve
 * puts the deadline before the hazard, so an unfinished word fails while the
 * hazard is still visibly ahead. That reads correctly — the player ran out of
 * time, and then ran into it.
 */
export function expireObstacle(
  obstacle: ActiveObstacle,
  typing: TypingState,
  elapsedMs: number,
): ResolutionResult {
  if (obstacle.status !== 'active') return { obstacle, resolved: null };

  const missedObstacle: ActiveObstacle = { ...obstacle, status: 'missed' };

  return {
    obstacle: missedObstacle,
    resolved: {
      obstacle: missedObstacle,
      outcome: 'hit',
      failureReason: 'timeout',
      typedFraction: typedFraction(typing),
      remainingMs: 0,
      elapsedMs,
    },
  };
}

/**
 * The move the player plays for an outcome.
 *
 * Avoidance uses the hazard's own action, so a barrier is jumped and a car is
 * driven around — the movement has to match the thing on screen or the feedback
 * reads as a glitch. The scene maps these onto animations; nothing in
 * `game-core` knows what an animation is.
 */
export type AvoidanceMove = ObstacleAction | 'impact';

export function moveForOutcome(outcome: ObstacleOutcome, action: ObstacleAction): AvoidanceMove {
  switch (outcome) {
    case 'avoided':
      return action;
    case 'hit':
      return 'impact';
  }
}
