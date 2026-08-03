import type { ObstacleAction } from '../models';
import type { TypingState } from '../typing';
import type { ActiveObstacle } from './active-obstacle';

/**
 * Resolving an obstacle (spec §5).
 *
 * D2 decided when an obstacle's prompt is due; this decides how it ends. There
 * are exactly three endings, and every obstacle reaches exactly one of them:
 *
 *   - **avoided** — the prompt was completed before the deadline.
 *   - **stumbled** — the deadline passed, but the player was most of the way
 *     through. A partial credit ending: it costs, but less than a collision.
 *   - **hit** — the deadline passed with little or nothing typed.
 *
 * The consequences of each — dog distance, combo, score, statistics — are D4.
 * What lives here is the decision and the guard that makes it happen once.
 *
 * Pure: no clock, no randomness, no DOM.
 */

export type ObstacleOutcome = 'avoided' | 'stumbled' | 'hit';

/**
 * How much of the prompt earns a stumble instead of a full collision.
 *
 * A player who typed most of it was *trying* and simply ran out of road; a
 * player who typed nothing was not engaged with the obstacle at all. Charging
 * both the same makes the near-miss feel arbitrary.
 */
export const STUMBLE_PROGRESS_THRESHOLD = 0.5;

/** Fraction of the prompt correctly entered, 0..1. */
export function typedFraction(typing: TypingState): number {
  if (typing.target.length === 0) return 1;

  return Math.min(1, typing.correctCharacters / typing.target.length);
}

/** Which ending an expired deadline earns. */
export function outcomeForExpiry(
  typing: TypingState,
): Extract<ObstacleOutcome, 'stumbled' | 'hit'> {
  return typedFraction(typing) >= STUMBLE_PROGRESS_THRESHOLD ? 'stumbled' : 'hit';
}

export interface ResolvedObstacle {
  readonly obstacle: ActiveObstacle;
  readonly outcome: ObstacleOutcome;
  /** How much of the prompt was entered, for scoring and the results screen. */
  readonly typedFraction: number;
  /** Milliseconds left on the deadline. Zero for a stumble or a hit. */
  readonly remainingMs: number;
  readonly elapsedMs: number;
}

export interface ResolutionResult {
  readonly obstacle: ActiveObstacle;
  /** `null` when nothing was resolved — the usual case on any given step. */
  readonly resolved: ResolvedObstacle | null;
}

/**
 * Whether an obstacle can still be resolved.
 *
 * The single guard the whole module rests on. An obstacle that has already
 * ended must never end again: a late keystroke arriving in the same step as the
 * deadline, a duplicated event, or a re-entrant call would otherwise award a
 * second avoidance or charge a second collision.
 */
export function isResolvable(obstacle: ActiveObstacle): boolean {
  return obstacle.status === 'active';
}

/**
 * The prompt was completed. Returns the obstacle unchanged if it has already
 * ended, so a duplicate completion is silently ignored rather than double-counted.
 */
export function resolveAvoided(
  obstacle: ActiveObstacle,
  typing: TypingState,
  elapsedMs: number,
): ResolutionResult {
  if (!isResolvable(obstacle)) return { obstacle, resolved: null };

  const deadline = obstacle.deadlineAtMs;

  // Completing it after the deadline has passed does not rescue it. The
  // simulation expires obstacles first for exactly this reason, but the check
  // belongs here too: correctness must not depend on call order.
  if (deadline !== null && elapsedMs > deadline) {
    return expireObstacle(obstacle, typing, elapsedMs);
  }

  const resolvedObstacle: ActiveObstacle = { ...obstacle, status: 'resolved' };

  return {
    obstacle: resolvedObstacle,
    resolved: {
      obstacle: resolvedObstacle,
      outcome: 'avoided',
      typedFraction: 1,
      remainingMs: deadline === null ? 0 : Math.max(0, deadline - elapsedMs),
      elapsedMs,
    },
  };
}

/** The deadline passed. Decides between a stumble and a hit. */
export function expireObstacle(
  obstacle: ActiveObstacle,
  typing: TypingState,
  elapsedMs: number,
): ResolutionResult {
  if (!isResolvable(obstacle)) return { obstacle, resolved: null };

  const missedObstacle: ActiveObstacle = { ...obstacle, status: 'missed' };

  return {
    obstacle: missedObstacle,
    resolved: {
      obstacle: missedObstacle,
      outcome: outcomeForExpiry(typing),
      typedFraction: typedFraction(typing),
      remainingMs: 0,
      elapsedMs,
    },
  };
}

/**
 * The animation the MC plays for an outcome.
 *
 * Avoidance uses the obstacle's own action, so a crate is jumped and a sign is
 * ducked under — the movement has to match the thing on screen or the feedback
 * reads as a glitch. The runtime maps these onto its animation states; nothing
 * in `game-core` knows what an animation is.
 */
export type AvoidanceMove = ObstacleAction | 'stumble' | 'impact';

export function moveForOutcome(outcome: ObstacleOutcome, action: ObstacleAction): AvoidanceMove {
  switch (outcome) {
    case 'avoided':
      return action;
    case 'stumbled':
      return 'stumble';
    case 'hit':
      return 'impact';
  }
}
