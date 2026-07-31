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

/** How the MC avoids the obstacle when the prompt is completed in time. */
export const OBSTACLE_ACTIONS = ['jump', 'slide', 'sidestep'] as const;

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
