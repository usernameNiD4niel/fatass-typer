import type { MapConfig } from '../game-core/models';

/**
 * Map 1 (spec §6).
 *
 * The only map the vertical slice needs. Every number is data here rather than
 * a constant in a system — steps F2 and F3 tune these and add maps 2 to 6
 * without a code change.
 *
 * Tuning intent: a genuine 20 WPM typist should finish. The dogs gain slowly,
 * a completed prompt buys a real boost, and the run is short enough that a
 * first attempt is not a marathon.
 */
export const MAP_1: MapConfig = {
  id: 'map-1',
  mapNumber: 1,
  name: 'Neighborhood Dash',
  theme: 'neighborhood',
  targetWpm: 20,
  // ~50 seconds at base speed, less when boosting well.
  distanceMeters: 320,
  baseSpeedMetersPerSecond: 6,
  timing: {
    // The most generous buffer in the game. Map 6 runs at 1.08.
    reactionBuffer: 1.7,
    fixedVisualLeadTimeMs: 900,
  },
  chase: {
    // Close enough that all three dogs are on screen at the start. A gap wider
    // than the camera can show turns the chase into an invisible timer.
    startingDistanceMeters: 20,
    // Slow enough to be survivable by typing, fast enough to be felt: standing
    // still is never an option.
    baseCatchUpMetersPerSecond: 1.2,
    collisionPenaltyMeters: 5,
    missedPromptPenaltyMeters: 3,
    streakRecoveryMeters: 2,
    streakThreshold: 3,
    dangerThresholdMeters: 8,
  },
  boost: {
    speedMultiplier: 1.55,
    durationMs: 2600,
  },
  content: {
    promptCategories: ['short-word', 'medium-word', 'short-phrase'],
    // Obstacles arrive in phase D; the slice runs on boost prompts alone.
    obstacleIds: [],
    obstacleIntervalSeconds: 9,
    obstacleIntervalJitter: 0.25,
    themeTags: ['street', 'chase'],
  },
  unlock: {
    requiresMapId: null,
    minimumAccuracy: 0,
  },
};

export const MAPS: readonly MapConfig[] = [MAP_1];

export function findMap(mapId: string): MapConfig | undefined {
  return MAPS.find((map) => map.id === mapId);
}
