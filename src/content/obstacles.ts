import type { ObstacleDefinition } from '../game-core/models';

/**
 * The eight hazards.
 *
 * Data only. The avoidance action is what the player *does* when the prompt is
 * completed in time, and unlike the old model it is not merely feedback: a
 * lane-change hazard is only cleared if the player is actually in the safe lane
 * when the collision plane arrives, and a jump only if they are above clearance
 * height. Typing the word starts the move; the move is what saves you.
 *
 * Three dials matter here:
 *
 *  - `action` decides which mechanic the hazard asks for. Jumps block the lane
 *    you are in; cars block it and send you sideways.
 *  - `baseReactionTimeMs` is a flat allowance on top of the typing budget,
 *    covering the time to notice the thing at all. Bigger, faster, or less
 *    familiar hazards get more of it.
 *  - `promptCategory` decides how much there is to type, which is what actually
 *    makes a hazard hard.
 */
export const OBSTACLES: readonly ObstacleDefinition[] = [
  /* --- Jump hazards: obstacles sitting in the player's own lane. ---------- */
  {
    id: 'rock',
    label: 'Rock',
    action: 'jump',
    difficultyWeight: 0.2,
    // On every map: a boulder in the road is the one obstacle that needs no
    // explaining, which makes it the right thing to meet first.
    minimumMap: 1,
    // Medium rather than short, on every jump hazard on every map. A hazard is
    // the only thing in the run with stakes, and a three-letter word was over
    // before the pressure registered — the encounter was mostly waiting.
    promptCategory: 'medium-word',
    baseReactionTimeMs: 340,
  },
  {
    id: 'crate',
    label: 'Fallen crate',
    action: 'jump',
    difficultyWeight: 0.2,
    minimumMap: 1,
    promptCategory: 'medium-word',
    baseReactionTimeMs: 320,
  },
  {
    id: 'low-barrier',
    label: 'Concrete block',
    action: 'jump',
    difficultyWeight: 0.25,
    minimumMap: 1,
    promptCategory: 'medium-word',
    baseReactionTimeMs: 320,
  },
  {
    id: 'cone-beam',
    label: 'Cones and beam',
    action: 'jump',
    difficultyWeight: 0.35,
    // Two cones with a beam between them: a wide silhouette, but the gap under
    // the beam reads as passable for a moment before it doesn't.
    minimumMap: 2,
    promptCategory: 'medium-word',
    baseReactionTimeMs: 400,
  },
  {
    id: 'roadwork-barrier',
    label: 'Roadwork barrier',
    action: 'jump',
    difficultyWeight: 0.55,
    minimumMap: 3,
    // Long words start on Map 3, which is exactly where this hazard starts.
    promptCategory: 'long-word',
    baseReactionTimeMs: 360,
  },

  /* --- Cars: block the lane, and the word names the way out. -------------- */
  {
    id: 'sedan',
    label: 'Stalled sedan',
    action: 'lane-change',
    difficultyWeight: 0.3,
    // Map 1 ships both verbs. With only two mechanics in the game, holding one
    // back for a whole tutorial map makes that map monotonous rather than gentle.
    minimumMap: 1,
    promptCategory: 'medium-word',
    baseReactionTimeMs: 380,
  },
  {
    id: 'van',
    label: 'Delivery van',
    action: 'lane-change',
    difficultyWeight: 0.45,
    minimumMap: 2,
    promptCategory: 'medium-word',
    baseReactionTimeMs: 420,
  },
  {
    id: 'box-truck',
    label: 'Box truck',
    action: 'lane-change',
    difficultyWeight: 0.7,
    // Tall enough to hide what is behind it until late, which is what the extra
    // allowance pays for — not the typing, the seeing.
    minimumMap: 4,
    // The heaviest word in the game, on the heaviest hazard. Long words exist
    // from Map 3 and this truck arrives on Map 4, so the pool is always there.
    promptCategory: 'long-word',
    baseReactionTimeMs: 480,
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
