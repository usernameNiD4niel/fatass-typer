import type { ObstacleDefinition } from '../game-core/models';

/**
 * The seven obstacles (spec §5).
 *
 * Data only. The avoidance action is what the MC *plays* when the prompt is
 * completed in time — the rules resolve an obstacle the moment the text is
 * typed, so the jump is feedback, never the mechanism (step D3).
 *
 * Two dials matter here:
 *
 *  - `baseReactionTimeMs` is a flat allowance on top of the typing budget,
 *    covering the time to notice the thing at all. Obstacles that are hard to
 *    read at speed — a sign overhead, a narrow gap — get more of it.
 *  - `promptCategory` decides how much there is to type, which is what actually
 *    makes an obstacle hard. The narrow passage draws a phrase; everything else
 *    draws a word.
 */
export const OBSTACLES: readonly ObstacleDefinition[] = [
  {
    id: 'rock',
    label: 'Rock',
    action: 'jump',
    difficultyWeight: 0.2,
    // On every map: a boulder in the road is the one obstacle that needs no
    // explaining, which makes it the right thing to meet first.
    minimumMap: 1,
    promptCategory: 'short-word',
    baseReactionTimeMs: 340,
  },
  {
    id: 'crate',
    label: 'Wooden crate',
    action: 'jump',
    difficultyWeight: 0.2,
    minimumMap: 1,
    promptCategory: 'short-word',
    baseReactionTimeMs: 320,
  },
  {
    id: 'low-barrier',
    label: 'Low barrier',
    action: 'jump',
    difficultyWeight: 0.25,
    minimumMap: 1,
    promptCategory: 'short-word',
    baseReactionTimeMs: 320,
  },
  {
    id: 'puddle',
    label: 'Puddle',
    action: 'jump',
    difficultyWeight: 0.15,
    // The gentlest obstacle: wide, flat, and unmistakable on the road.
    minimumMap: 1,
    promptCategory: 'short-word',
    baseReactionTimeMs: 380,
  },
  {
    id: 'trash-bin',
    label: 'Trash bin',
    action: 'sidestep',
    difficultyWeight: 0.3,
    minimumMap: 2,
    promptCategory: 'medium-word',
    baseReactionTimeMs: 340,
  },
  {
    id: 'hanging-sign',
    label: 'Hanging sign',
    action: 'slide',
    difficultyWeight: 0.45,
    minimumMap: 2,
    promptCategory: 'medium-word',
    // Overhead, so it enters the frame from a direction the player is not
    // watching. The extra allowance is for spotting it, not for typing it.
    baseReactionTimeMs: 460,
  },
  {
    id: 'roadwork-barrier',
    label: 'Roadwork barrier',
    action: 'jump',
    difficultyWeight: 0.55,
    minimumMap: 3,
    promptCategory: 'medium-word',
    baseReactionTimeMs: 360,
  },
  {
    id: 'narrow-passage',
    label: 'Narrow passage',
    action: 'sidestep',
    difficultyWeight: 0.8,
    minimumMap: 4,
    // The one obstacle that asks for a phrase — spec §5 calls for typing a
    // phrase to pass cleanly, which is why it stays off the early maps.
    promptCategory: 'short-phrase',
    baseReactionTimeMs: 520,
  },
];

export function findObstacle(obstacleId: string): ObstacleDefinition | undefined {
  return OBSTACLES.find((obstacle) => obstacle.id === obstacleId);
}

/** The definitions a map's `content.obstacleIds` refers to, in map order. */
export function obstaclesFor(obstacleIds: readonly string[]): readonly ObstacleDefinition[] {
  return obstacleIds
    .map((id) => findObstacle(id))
    .filter((obstacle): obstacle is ObstacleDefinition => obstacle !== undefined);
}
