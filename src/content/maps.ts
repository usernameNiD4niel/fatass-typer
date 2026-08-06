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
  // ~2.5 minutes at base speed, less when boosting well. A run is an endurance
  // test now: with a word on screen at all times, a 75-second map asked for
  // about a hundred characters and that is not practice.
  distanceMeters: 1550,
  baseSpeedMetersPerSecond: 7.4,
  timing: {
    // The most generous buffer in the game. Map 6 runs at 1.07.
    reactionBuffer: 1.14,
    fixedVisualLeadTimeMs: 70,
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
    // nothing needing a phrase — those start on later maps.
    coinIntervalSeconds: 18,
    coinValue: 5,
    powerupIntervalSeconds: 60,
    flowTolerance: 0.16,
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
  distanceMeters: 1680,
  baseSpeedMetersPerSecond: 7.9,
  timing: {
    reactionBuffer: 1.13,
    fixedVisualLeadTimeMs: 68,
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
    coinIntervalSeconds: 17,
    coinValue: 5,
    powerupIntervalSeconds: 60,
    flowTolerance: 0.13,
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
  distanceMeters: 1800,
  baseSpeedMetersPerSecond: 8.4,
  timing: {
    reactionBuffer: 1.1,
    fixedVisualLeadTimeMs: 65,
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
    coinIntervalSeconds: 16,
    coinValue: 6,
    powerupIntervalSeconds: 60,
    flowTolerance: 0.14,
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
  distanceMeters: 1930,
  baseSpeedMetersPerSecond: 8.9,
  timing: {
    reactionBuffer: 1.09,
    fixedVisualLeadTimeMs: 62,
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
    coinIntervalSeconds: 15,
    coinValue: 6,
    powerupIntervalSeconds: 60,
    flowTolerance: 0.17,
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
  distanceMeters: 2060,
  baseSpeedMetersPerSecond: 9.4,
  timing: {
    reactionBuffer: 1.08,
    fixedVisualLeadTimeMs: 60,
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
    coinIntervalSeconds: 14,
    coinValue: 7,
    powerupIntervalSeconds: 60,
    flowTolerance: 0.16,
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
  distanceMeters: 2220,
  baseSpeedMetersPerSecond: 10,
  timing: {
    reactionBuffer: 1.07,
    fixedVisualLeadTimeMs: 58,
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
    coinIntervalSeconds: 13,
    coinValue: 8,
    powerupIntervalSeconds: 60,
    flowTolerance: 0.15,
    themeTags: ['final-pursuit', 'chase'],
  },
  unlock: {
    requiresMapId: 'map-5',
    minimumAccuracy: 0.92,
  },
};

<<<<<<< Updated upstream
=======
/**
 * Endless (plan 2.2).
 *
 * `distanceMeters: 0` means there is no finish line: the run ends when the
 * player does, and how far they got is the whole score.
 *
 * ## Why the six maps were not enough on their own
 *
 * A fixed run is a thing you *complete*, and a completed thing is finished with.
 * Six of them is six evenings. What keeps a runner open is a number that is
 * yours and beatable by a few metres, which is exactly what a finish line
 * forecloses.
 *
 * ## Tuning
 *
 * It opens at Map 3's speed and ramps past Map 6's ceiling — `rampPerMinute` is
 * the highest in the game and `maxMetersPerSecond` is well above any fixed map,
 * because an endless run must eventually beat anybody. The point of the ramp is
 * not to be survivable; it is to decide *where* you stop.
 *
 * Vocabulary is every category, and the obstacle list is every obstacle: this is
 * the one map that is not teaching anything, so it has no reason to hold
 * anything back.
 *
 * It carries no secret sentence. A sentence has an end and this map does not,
 * and a run that quietly stopped assembling one two minutes in would read as a
 * bug rather than as a design.
 */
export const MAP_ENDLESS: MapConfig = {
  id: 'endless',
  // Zero rather than 7: it sits outside the progression rather than after it,
  // and `minimumMap` on content is checked against this number.
  mapNumber: 6,
  name: 'Endless',
  theme: 'night-highway',
  // The speed it opens at, and the honest thing to put on the card. It does not
  // stay there.
  targetWpm: 30,
  distanceMeters: 0,
  baseSpeedMetersPerSecond: 8.6,
  timing: {
    reactionBuffer: 1.12,
    fixedVisualLeadTimeMs: 64,
  },
  motion: DEFAULT_MOTION,
  speed: {
    // Far above any fixed map. An endless run has to be able to beat anybody,
    // or it is a fixed map that forgot to end.
    maxMetersPerSecond: 18,
    rampPerMinute: 2.6,
  },
  boost: {
    speedMultiplier: 1.65,
    durationMs: 2900,
  },
  content: {
    promptCategories: [
      'short-word',
      'medium-word',
      'long-word',
      'short-phrase',
      'medium-phrase',
      'themed',
      'punctuation',
      'number',
    ],
    coinIntervalSeconds: 16,
    coinValue: 8,
    powerupIntervalSeconds: 45,
    flowTolerance: 0.15,
    themeTags: ['night-highway', 'chase'],
  },
  /*
   * What actually makes it get harder.
   *
   * Raising `rampPerMinute` alone does not: hazards are placed by time budget,
   * so a faster world puts them further away and the player has exactly as long
   * to type. Measured, the first build of this map was survivable by a
   * metronomic typist for 53 minutes without ever being threatened.
   *
   * Six WPM a minute is steep on purpose — a minute in it asks for Map 4, three
   * minutes in it asks for more than Map 6. The ceiling is past any sustained
   * human speed rather than merely high: at 140 a 120 WPM typist was never
   * caught in 53 minutes of simulation, because the reaction buffer covered the
   * difference. A ceiling somebody can sit under is not a ceiling.
   */
  escalation: {
    wpmPerMinute: 6,
    maxWpm: 220,
  },
  // Unlocked by finishing the first map. It is not a reward for finishing the
  // game — it is the mode you go to instead of replaying one you have beaten.
  unlock: {
    requiresMapId: 'map-1',
    minimumAccuracy: 0,
  },
};

/**
 * The progression. Endless is deliberately not in it.
 *
 * Everything that walks this list is asking a progression question — which map
 * unlocks next, how far through the six the player is — and a map with no finish
 * line answers all of them wrongly. `ALL_MAPS` is for the places that just need
 * to look a map up by id.
 */
>>>>>>> Stashed changes
export const MAPS: readonly MapConfig[] = [MAP_1, MAP_2, MAP_3, MAP_4, MAP_5, MAP_6];

export function findMap(mapId: string): MapConfig | undefined {
  return MAPS.find((map) => map.id === mapId);
}
