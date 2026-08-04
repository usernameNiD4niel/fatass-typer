import { isCount, isIntegerAtLeast, isNonEmptyString, isRatio, isRecord } from './guards';
import type { ObstacleId } from './ids';
import { isPromptCategory } from './prompt';
import type { PromptCategory } from './prompt';

/**
 * Obstacle definitions (spec §5).
 *
 * Definitions are static content. A spawned obstacle in a run is a separate
 * runtime concern owned by phase D.
 */

/**
 * How the player avoids the hazard when the prompt is completed in time.
 *
 * Two verbs, no more. Every hazard on the road either blocks the lane you are
 * in and has to be jumped, or blocks it and has to be driven around — and the
 * road has three lanes precisely so that the second one always has an answer.
 * A third verb would need a third readable silhouette and a third animation
 * budget without adding a decision the player does not already make.
 */
export const OBSTACLE_ACTIONS = ['jump', 'lane-change'] as const;

export type ObstacleAction = (typeof OBSTACLE_ACTIONS)[number];

const OBSTACLE_ACTION_LOOKUP: ReadonlySet<string> = new Set(OBSTACLE_ACTIONS);

export function isObstacleAction(value: unknown): value is ObstacleAction {
  return typeof value === 'string' && OBSTACLE_ACTION_LOOKUP.has(value);
}

export interface ObstacleDefinition {
  readonly id: ObstacleId;
  /** Human-readable name, shown in the level briefing and dev tooling. */
  readonly label: string;
  readonly action: ObstacleAction;
  /** Relative contribution to run difficulty, 0..1. */
  readonly difficultyWeight: number;
  /** Lowest map number this obstacle may spawn on. */
  readonly minimumMap: number;
  /** Which prompt category this obstacle draws its text from. */
  readonly promptCategory: PromptCategory;
  /**
   * Fixed human reaction allowance in milliseconds, added on top of the typing
   * time budget. Covers seeing the obstacle before typing can begin (spec §6).
   */
  readonly baseReactionTimeMs: number;
}

export function isObstacleDefinition(value: unknown): value is ObstacleDefinition {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['label']) &&
    isObstacleAction(value['action']) &&
    isRatio(value['difficultyWeight']) &&
    isIntegerAtLeast(value['minimumMap'], 1) &&
    isPromptCategory(value['promptCategory']) &&
    isCount(value['baseReactionTimeMs'])
  );
}
