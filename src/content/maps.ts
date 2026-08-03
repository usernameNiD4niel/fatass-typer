import type { MapConfig } from '../game-core/models';

/**
 * Map 1 (spec §6).
 *
 * The only map the vertical slice needs. Every number is data here rather than
 * a constant in a system — steps F2 and F3 tune these and add maps 2 to 6
 * without a code change.
 *
 * **Tuned in step F2 against a simulated typist**, not by feel. What the numbers
 * below produce, measured in `map-1-playtest.test.ts`:
 *
 *   - 20 WPM (the advertised speed) finishes on every seed, with a margin, and
 *     still finishes while mistyping 8% of characters.
 *   - 16 WPM with mistakes scrapes home — a near-miss, not a comfortable run.
 *   - 10 WPM is caught. The survival threshold sits around 13 WPM.
 *   - A run takes about 40 seconds at target speed.
 *
 * Those are the map's real specification; the numbers are just how it is
 * currently achieved. Change a number and the playtest says what it cost.
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
    startingDistanceMeters: 16,
    /**
     * The dial that decides everything.
     *
     * At 1.2 (where this started) a 10 WPM typist finished comfortably and the
     * dogs never came closer than 88% of the starting gap — the chase was
     * scenery. At 2.0 a 20 WPM typist still has room and a 10 WPM typist is
     * caught, which is what the map's label promises.
     */
    baseCatchUpMetersPerSecond: 2.0,
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
    // No punctuation, numbers, or long words on the tutorial map: those are the
    // categories that break a beginner's rhythm, and Map 1 exists to build one.
    promptCategories: ['short-word', 'medium-word', 'short-phrase', 'themed'],
    // The three gentlest obstacles, all avoided by jumping. Nothing overhead and
    // nothing needing a phrase — those start on later maps.
    obstacleIds: ['crate', 'low-barrier', 'puddle'],
    // Spawning is wired into the run in D2/D3; until then this schedule is data
    // the spawner can be tested against.
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
