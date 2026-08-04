import {
  isCount,
  isFiniteNumber,
  isIntegerAtLeast,
  isNonEmptyString,
  isPositiveNumber,
  isRatio,
  isRecord,
  isStringArray,
} from './guards';
import type { MapId, ObstacleId } from './ids';
import { isMotionProfile } from './motion';
import type { MotionProfile } from './motion';
import type { PromptCategory } from './prompt';

/**
 * Map configuration (spec §6).
 *
 * Difficulty is never "a WPM number". It is the combination of target speed,
 * prompt length and familiarity, hazard frequency, reaction buffer, recovery
 * time, and how often a car blocks both ways out. All of it lives here as data
 * so systems never hardcode tuning (CLAUDE.md §3).
 */

/** Visual theme, spec §6 map table. Drives palette and parallax art, not rules. */
export const MAP_THEMES = [
  'neighborhood',
  'downtown',
  'market-district',
  'industrial-zone',
  'night-highway',
  'final-pursuit',
] as const;

export type MapTheme = (typeof MAP_THEMES)[number];

/**
 * What the player must do to unlock this map. `null` prerequisite means
 * available from the start (Map 1).
 */
export interface UnlockRule {
  readonly requiresMapId: MapId | null;
  /** Accuracy required on the prerequisite map, 0..1. Spec §6: 0.85 through 0.92. */
  readonly minimumAccuracy: number;
}

/** Timing budget for obstacle prompts (spec §6 prompt timing formula). */
export interface TimingProfile {
  /**
   * Multiplier applied to the expected typing time. 1.70 on Map 1 down to 1.08
   * on Map 6 — the player gets progressively less slack.
   */
  readonly reactionBuffer: number;
  /**
   * Flat milliseconds added on top, covering the time to notice a prompt at all.
   * Independent of prompt length.
   */
  readonly fixedVisualLeadTimeMs: number;
}

/** How the road speeds up over a run (spec §9 difficulty scaling). */
export interface SpeedProfile {
  /** Ceiling in metres per second. The ramp never exceeds it. */
  readonly maxMetersPerSecond: number;
  /** Metres per second added for each minute of running. */
  readonly rampPerMinute: number;
}

/** Speed boost granted by completing a boost prompt (spec §5). */
export interface BoostProfile {
  readonly speedMultiplier: number;
  readonly durationMs: number;
}

/** Which content this map draws on and how often obstacles appear. */
export interface ContentProfile {
  readonly promptCategories: readonly PromptCategory[];
  readonly obstacleIds: readonly ObstacleId[];
  /** Average seconds between obstacles. Lower means denser pressure. */
  readonly obstacleIntervalSeconds: number;
  /** Random variation applied to the interval, 0..1. Keeps spacing unpredictable. */
  readonly obstacleIntervalJitter: number;
  /**
   * Quiet road after a hazard resolves, in seconds. The breath between
   * encounters is pacing, not an accident of the interval (spec §14).
   */
  readonly recoverySeconds: number;
  /**
   * Chance that a car blocks *both* neighbouring lanes when the player is in
   * the centre and has two escapes, 0..1. Zero on the early maps: with one way
   * out the player still has to type, but not also read which side.
   *
   * Never applies when there is only one escape — that would leave nowhere to
   * go, which `lane-assignment.ts` refuses to construct.
   */
  readonly doubleBlockChance: number;
  /**
   * Average seconds between coin lines, measured from the moment the road is
   * clear. Coins only ever appear in the gaps between hazards.
   */
  readonly coinIntervalSeconds: number;
  /** How many coins are in one line. Score, and a number on the HUD. */
  readonly coinValue: number;
  /**
   * Seconds between powerup crates. Roughly a minute: rare enough that one is
   * an event, often enough that a long run sees several.
   */
  readonly powerupIntervalSeconds: number;
  /** Tags preferred when selecting themed vocabulary for this map. */
  readonly themeTags: readonly string[];
}

export interface MapConfig {
  readonly id: MapId;
  /** 1-based position in the progression. Matches `minimumMap` on content. */
  readonly mapNumber: number;
  readonly name: string;
  readonly theme: MapTheme;
  /** The honest target typing speed, shown to the player (spec §6). */
  readonly targetWpm: number;
  /** Total run distance in meters. */
  readonly distanceMeters: number;
  /** MC speed in meters per second before boosts and penalties. */
  readonly baseSpeedMetersPerSecond: number;
  readonly timing: TimingProfile;
  /**
   * How long the player's avoidance moves take. Shared by the timing budget,
   * the collision check, and the scene — see `models/motion.ts`.
   */
  readonly motion: MotionProfile;
  readonly speed: SpeedProfile;
  readonly boost: BoostProfile;
  readonly content: ContentProfile;
  readonly unlock: UnlockRule;
}

/**
 * Bounds on adaptive assistance (spec §6). Adaptation nudges the reaction buffer
 * within these limits and never outside them, so the player cannot notice unfair
 * speed manipulation.
 */
export interface AdaptiveAssistanceConfig {
  readonly enabled: boolean;
  /** Consecutive failures before the buffer is eased. */
  readonly failuresBeforeEasing: number;
  /** Consecutive successes before the buffer is tightened. */
  readonly successesBeforeTightening: number;
  /** Step size applied to the reaction buffer. */
  readonly bufferStep: number;
  /** Hard floor and ceiling as multipliers of the map's configured buffer. */
  readonly minimumBufferMultiplier: number;
  readonly maximumBufferMultiplier: number;
}

export const DEFAULT_ADAPTIVE_ASSISTANCE: AdaptiveAssistanceConfig = {
  enabled: true,
  failuresBeforeEasing: 3,
  successesBeforeTightening: 8,
  bufferStep: 0.05,
  /*
   * One, not 0.9: assistance may hand time back, never take the map below what
   * it advertises.
   *
   * It used to go to 0.9, and that was survivable only because a run was short.
   * A run is now two and a half minutes with eleven to twenty-two hazards, so a
   * clean player crosses the eight-success threshold twice and the buffer landed
   * at 0.9 — a Map 1 buffer of 1.14 became 1.026, and a typist at exactly 20 WPM
   * started timing out an hour into the map's own advertised speed. A map that
   * gets harder than its label because you are doing well is the one thing the
   * whole timing model exists to prevent.
   *
   * Tightening therefore now un-does easing and stops. That makes assistance a
   * one-way ratchet in the player's favour, which is what `assistance/README.md`
   * already said it was for.
   */
  minimumBufferMultiplier: 1,
  maximumBufferMultiplier: 1.25,
};

export function isMapConfig(value: unknown): value is MapConfig {
  if (!isRecord(value)) return false;

  if (!isNonEmptyString(value['id'])) return false;
  if (!isIntegerAtLeast(value['mapNumber'], 1)) return false;
  if (!isNonEmptyString(value['name'])) return false;
  if (!isPositiveNumber(value['targetWpm'])) return false;
  if (!isPositiveNumber(value['distanceMeters'])) return false;
  if (!isPositiveNumber(value['baseSpeedMetersPerSecond'])) return false;

  const timing = value['timing'];
  if (!isRecord(timing)) return false;
  // A buffer below 1 would give the player less time than the map's own target
  // speed requires — an unwinnable map, not a hard one.
  if (!isFiniteNumber(timing['reactionBuffer']) || timing['reactionBuffer'] < 1) return false;
  if (!isCount(timing['fixedVisualLeadTimeMs'])) return false;

  if (!isMotionProfile(value['motion'])) return false;

  const speed = value['speed'];
  if (!isRecord(speed)) return false;
  if (!isPositiveNumber(speed['maxMetersPerSecond'])) return false;
  if (!isCount(speed['rampPerMinute'])) return false;
  // A ceiling below the base speed would make the ramp a brake.
  if (speed['maxMetersPerSecond'] < value['baseSpeedMetersPerSecond']) return false;

  const boost = value['boost'];
  if (!isRecord(boost)) return false;
  if (!isFiniteNumber(boost['speedMultiplier']) || boost['speedMultiplier'] < 1) return false;
  if (!isPositiveNumber(boost['durationMs'])) return false;

  const content = value['content'];
  if (!isRecord(content)) return false;
  if (!isStringArray(content['promptCategories']) || content['promptCategories'].length === 0) {
    return false;
  }
  if (!isStringArray(content['obstacleIds'])) return false;
  if (!isStringArray(content['themeTags'])) return false;
  if (!isPositiveNumber(content['obstacleIntervalSeconds'])) return false;
  if (!isRatio(content['obstacleIntervalJitter'])) return false;
  if (!isCount(content['recoverySeconds'])) return false;
  if (!isRatio(content['doubleBlockChance'])) return false;
  if (!isPositiveNumber(content['coinIntervalSeconds'])) return false;
  if (!isIntegerAtLeast(content['coinValue'], 1)) return false;
  if (!isPositiveNumber(content['powerupIntervalSeconds'])) return false;

  const unlock = value['unlock'];
  if (!isRecord(unlock)) return false;
  if (unlock['requiresMapId'] !== null && !isNonEmptyString(unlock['requiresMapId'])) return false;
  if (!isRatio(unlock['minimumAccuracy'])) return false;

  return true;
}
