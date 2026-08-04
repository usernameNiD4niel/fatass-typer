import type { MapConfig } from '../game-core/models';
import { DEFAULT_MOTION } from './road';

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
  distanceMeters: 740,
  baseSpeedMetersPerSecond: 7.4,
  timing: {
    // The most generous buffer in the game. Map 6 runs at 1.08.
    reactionBuffer: 1.38,
    fixedVisualLeadTimeMs: 120,
  },
  // The road is the road: lane width and jump timing are shared by every
  // map (see `content/road.ts`). Difficulty lives in the dials below it.
  motion: DEFAULT_MOTION,
  speed: {
    maxMetersPerSecond: 9.6,
    rampPerMinute: 1.6,
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
    obstacleIds: ['rock', 'crate', 'low-barrier', 'sedan'],
    obstacleIntervalSeconds: 3.0,
    obstacleIntervalJitter: 0.25,
    recoverySeconds: 0.35,
    doubleBlockChance: 0,
    coinIntervalSeconds: 6.5,
    coinValue: 5,
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
  distanceMeters: 800,
  baseSpeedMetersPerSecond: 7.9,
  timing: {
    reactionBuffer: 1.32,
    fixedVisualLeadTimeMs: 115,
  },
  // The road is the road: lane width and jump timing are shared by every
  // map (see `content/road.ts`). Difficulty lives in the dials below it.
  motion: DEFAULT_MOTION,
  speed: {
    maxMetersPerSecond: 10.2,
    rampPerMinute: 1.7,
  },
  boost: {
    speedMultiplier: 1.55,
    durationMs: 2800,
  },
  content: {
    promptCategories: ['short-word', 'medium-word', 'short-phrase', 'themed', 'punctuation'],
    obstacleIds: ['rock', 'crate', 'low-barrier', 'cone-beam', 'sedan', 'van'],
    obstacleIntervalSeconds: 2.8,
    obstacleIntervalJitter: 0.25,
    recoverySeconds: 0.32,
    doubleBlockChance: 0,
    coinIntervalSeconds: 6.0,
    coinValue: 5,
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
  distanceMeters: 860,
  baseSpeedMetersPerSecond: 8.4,
  timing: {
    reactionBuffer: 1.28,
    fixedVisualLeadTimeMs: 110,
  },
  // The road is the road: lane width and jump timing are shared by every
  // map (see `content/road.ts`). Difficulty lives in the dials below it.
  motion: DEFAULT_MOTION,
  speed: {
    maxMetersPerSecond: 10.8,
    rampPerMinute: 1.8,
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
    obstacleIds: ['rock', 'crate', 'low-barrier', 'cone-beam', 'roadwork-barrier', 'sedan', 'van'],
    obstacleIntervalSeconds: 2.6,
    obstacleIntervalJitter: 0.3,
    recoverySeconds: 0.3,
    doubleBlockChance: 0.15,
    coinIntervalSeconds: 5.5,
    coinValue: 6,
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
  distanceMeters: 920,
  baseSpeedMetersPerSecond: 8.9,
  timing: {
    reactionBuffer: 1.24,
    fixedVisualLeadTimeMs: 105,
  },
  // The road is the road: lane width and jump timing are shared by every
  // map (see `content/road.ts`). Difficulty lives in the dials below it.
  motion: DEFAULT_MOTION,
  speed: {
    maxMetersPerSecond: 11.4,
    rampPerMinute: 1.9,
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
      'low-barrier',
      'cone-beam',
      'roadwork-barrier',
      'sedan',
      'van',
      'box-truck',
    ],
    obstacleIntervalSeconds: 2.4,
    obstacleIntervalJitter: 0.3,
    recoverySeconds: 0.28,
    doubleBlockChance: 0.25,
    coinIntervalSeconds: 5.0,
    coinValue: 6,
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
  distanceMeters: 980,
  baseSpeedMetersPerSecond: 9.4,
  timing: {
    reactionBuffer: 1.22,
    fixedVisualLeadTimeMs: 100,
  },
  // The road is the road: lane width and jump timing are shared by every
  // map (see `content/road.ts`). Difficulty lives in the dials below it.
  motion: DEFAULT_MOTION,
  speed: {
    maxMetersPerSecond: 12.0,
    rampPerMinute: 2.0,
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
    obstacleIds: ['rock', 'low-barrier', 'cone-beam', 'roadwork-barrier', 'van', 'box-truck'],
    obstacleIntervalSeconds: 2.3,
    obstacleIntervalJitter: 0.3,
    recoverySeconds: 0.25,
    doubleBlockChance: 0.35,
    coinIntervalSeconds: 4.5,
    coinValue: 7,
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
  distanceMeters: 1060,
  baseSpeedMetersPerSecond: 10,
  timing: {
    reactionBuffer: 1.2,
    fixedVisualLeadTimeMs: 95,
  },
  // The road is the road: lane width and jump timing are shared by every
  // map (see `content/road.ts`). Difficulty lives in the dials below it.
  motion: DEFAULT_MOTION,
  speed: {
    maxMetersPerSecond: 12.8,
    rampPerMinute: 2.1,
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
      'cone-beam',
      'roadwork-barrier',
      'sedan',
      'van',
      'box-truck',
    ],
    obstacleIntervalSeconds: 2.2,
    obstacleIntervalJitter: 0.3,
    recoverySeconds: 0.22,
    doubleBlockChance: 0.45,
    coinIntervalSeconds: 4.0,
    coinValue: 8,
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
