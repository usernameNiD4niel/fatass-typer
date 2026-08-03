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
    baseCatchUpMetersPerSecond: 1.7,
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
    obstacleIds: ['rock', 'crate', 'low-barrier', 'puddle'],
    obstacleIntervalSeconds: 9,
    obstacleIntervalJitter: 0.25,
    themeTags: ['street', 'chase'],
  },
  unlock: {
    requiresMapId: null,
    minimumAccuracy: 0,
  },
};

/**
 * Map 2 — Downtown Sprint (spec §6).
 *
 * The first map that asks for punctuation and numbers. Difficulty is never one
 * dial (spec §6): the target speed rises, the reaction buffer tightens, the
 * vocabulary widens, and a sidestep obstacle joins the jumps — no single one of
 * those would be much of a step up on its own.
 */
export const MAP_2: MapConfig = {
  id: 'map-2',
  mapNumber: 2,
  name: 'Downtown Sprint',
  theme: 'downtown',
  targetWpm: 25,
  distanceMeters: 360,
  baseSpeedMetersPerSecond: 6.4,
  timing: {
    reactionBuffer: 1.55,
    fixedVisualLeadTimeMs: 850,
  },
  chase: {
    startingDistanceMeters: 16,
    baseCatchUpMetersPerSecond: 2.1,
    collisionPenaltyMeters: 5.5,
    missedPromptPenaltyMeters: 3.5,
    streakRecoveryMeters: 2,
    streakThreshold: 3,
    dangerThresholdMeters: 8,
  },
  boost: {
    speedMultiplier: 1.55,
    durationMs: 2800,
  },
  content: {
    promptCategories: ['short-word', 'medium-word', 'short-phrase', 'themed', 'punctuation'],
    obstacleIds: ['rock', 'crate', 'low-barrier', 'puddle', 'trash-bin'],
    obstacleIntervalSeconds: 8.5,
    obstacleIntervalJitter: 0.25,
    themeTags: ['downtown', 'street', 'chase'],
  },
  unlock: {
    requiresMapId: 'map-1',
    minimumAccuracy: 0.85,
  },
};

/**
 * Map 3 — Market District (spec §6).
 *
 * Where overhead obstacles start. The hanging sign enters the frame from a
 * direction the player is not watching, which is why it carries the largest
 * reaction allowance of any obstacle.
 */
export const MAP_3: MapConfig = {
  id: 'map-3',
  mapNumber: 3,
  name: 'Market District',
  theme: 'market-district',
  targetWpm: 30,
  distanceMeters: 400,
  baseSpeedMetersPerSecond: 6.8,
  timing: {
    reactionBuffer: 1.4,
    fixedVisualLeadTimeMs: 800,
  },
  chase: {
    startingDistanceMeters: 18,
    baseCatchUpMetersPerSecond: 2.3,
    collisionPenaltyMeters: 6,
    missedPromptPenaltyMeters: 4,
    streakRecoveryMeters: 2,
    streakThreshold: 3,
    dangerThresholdMeters: 7,
  },
  boost: {
    speedMultiplier: 1.55,
    durationMs: 2800,
  },
  content: {
    promptCategories: [
      'short-word',
      'medium-word',
      'long-word',
      'short-phrase',
      'themed',
      'punctuation',
      'number',
    ],
    obstacleIds: [
      'rock',
      'crate',
      'low-barrier',
      'puddle',
      'trash-bin',
      'hanging-sign',
      'roadwork-barrier',
    ],
    obstacleIntervalSeconds: 8,
    obstacleIntervalJitter: 0.3,
    themeTags: ['market-district', 'street', 'chase'],
  },
  unlock: {
    requiresMapId: 'map-2',
    minimumAccuracy: 0.87,
  },
};

/**
 * Map 4 — Industrial Zone (spec §6).
 *
 * The narrow passage appears here: the one obstacle that asks for a phrase
 * rather than a word, and the first time a player has to hold a rhythm through
 * a space rather than sprint a single word.
 */
export const MAP_4: MapConfig = {
  id: 'map-4',
  mapNumber: 4,
  name: 'Industrial Zone',
  theme: 'industrial-zone',
  targetWpm: 35,
  distanceMeters: 440,
  baseSpeedMetersPerSecond: 7.2,
  timing: {
    reactionBuffer: 1.28,
    fixedVisualLeadTimeMs: 750,
  },
  chase: {
    startingDistanceMeters: 24,
    baseCatchUpMetersPerSecond: 2.4,
    collisionPenaltyMeters: 6.5,
    missedPromptPenaltyMeters: 4.5,
    streakRecoveryMeters: 2.5,
    streakThreshold: 3,
    dangerThresholdMeters: 7,
  },
  boost: {
    speedMultiplier: 1.6,
    durationMs: 2900,
  },
  content: {
    promptCategories: [
      'medium-word',
      'long-word',
      'short-phrase',
      'medium-phrase',
      'themed',
      'punctuation',
      'number',
    ],
    obstacleIds: [
      'rock',
      'crate',
      'low-barrier',
      'trash-bin',
      'hanging-sign',
      'roadwork-barrier',
      'narrow-passage',
    ],
    obstacleIntervalSeconds: 7.5,
    obstacleIntervalJitter: 0.3,
    themeTags: ['industrial-zone', 'chase'],
  },
  unlock: {
    requiresMapId: 'map-3',
    minimumAccuracy: 0.89,
  },
};

/**
 * Map 5 — Night Highway (spec §6).
 *
 * Long and fast. The buffer is tight enough that a prompt has to be read and
 * typed almost in one motion, which is what 40 WPM actually feels like.
 */
export const MAP_5: MapConfig = {
  id: 'map-5',
  mapNumber: 5,
  name: 'Night Highway',
  theme: 'night-highway',
  targetWpm: 40,
  distanceMeters: 440,
  baseSpeedMetersPerSecond: 7.6,
  timing: {
    reactionBuffer: 1.18,
    fixedVisualLeadTimeMs: 700,
  },
  chase: {
    startingDistanceMeters: 22,
    /**
     * Softer than the ladder below it would suggest.
     *
     * The unlock gate into Map 6 asks for 90% accuracy *on this map*. If a
     * typist at the advertised 40 WPM making one mistake in twelve were caught,
     * that gate would only be reachable by someone typing well above target —
     * the map would be asking for one thing and requiring another.
     */
    baseCatchUpMetersPerSecond: 2.9,
    collisionPenaltyMeters: 7,
    missedPromptPenaltyMeters: 5,
    streakRecoveryMeters: 2.5,
    streakThreshold: 3,
    dangerThresholdMeters: 6,
  },
  boost: {
    speedMultiplier: 1.65,
    durationMs: 3200,
  },
  content: {
    promptCategories: [
      'medium-word',
      'long-word',
      'short-phrase',
      'medium-phrase',
      'themed',
      'punctuation',
      'number',
    ],
    obstacleIds: [
      'rock',
      'low-barrier',
      'trash-bin',
      'hanging-sign',
      'roadwork-barrier',
      'narrow-passage',
    ],
    obstacleIntervalSeconds: 7,
    obstacleIntervalJitter: 0.3,
    themeTags: ['night-highway', 'chase'],
  },
  unlock: {
    requiresMapId: 'map-4',
    minimumAccuracy: 0.9,
  },
};

/**
 * Map 6 — Final Pursuit (spec §6).
 *
 * 50 WPM, a 1.08 buffer, and every obstacle in the game. The last map is
 * allowed to be hard; what it is not allowed to be is unfair, and the timing
 * budget still guarantees that a 50 WPM typist can finish every prompt it
 * throws — the tests assert exactly that.
 */
export const MAP_6: MapConfig = {
  id: 'map-6',
  mapNumber: 6,
  name: 'Final Pursuit',
  theme: 'final-pursuit',
  targetWpm: 50,
  distanceMeters: 520,
  baseSpeedMetersPerSecond: 8,
  timing: {
    reactionBuffer: 1.08,
    fixedVisualLeadTimeMs: 650,
  },
  chase: {
    startingDistanceMeters: 18,
    // Same reasoning as Map 5: the 92% gate has to be reachable at 50 WPM.
    baseCatchUpMetersPerSecond: 3.4,
    collisionPenaltyMeters: 8,
    missedPromptPenaltyMeters: 5.5,
    streakRecoveryMeters: 3,
    streakThreshold: 3,
    dangerThresholdMeters: 6,
  },
  boost: {
    speedMultiplier: 1.7,
    durationMs: 3000,
  },
  content: {
    promptCategories: [
      'medium-word',
      'long-word',
      'short-phrase',
      'medium-phrase',
      'themed',
      'punctuation',
      'number',
    ],
    obstacleIds: [
      'rock',
      'crate',
      'low-barrier',
      'puddle',
      'trash-bin',
      'hanging-sign',
      'roadwork-barrier',
      'narrow-passage',
    ],
    obstacleIntervalSeconds: 6.5,
    obstacleIntervalJitter: 0.3,
    themeTags: ['final-pursuit', 'chase'],
  },
  unlock: {
    requiresMapId: 'map-5',
    minimumAccuracy: 0.92,
  },
};

export const MAPS: readonly MapConfig[] = [MAP_1, MAP_2, MAP_3, MAP_4, MAP_5, MAP_6];

export function findMap(mapId: string): MapConfig | undefined {
  return MAPS.find((map) => map.id === mapId);
}
