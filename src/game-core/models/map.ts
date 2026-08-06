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
import type { MapId } from './ids';
import { isMotionProfile } from './motion';
import type { MotionProfile } from './motion';
import type { PromptCategory } from './prompt';

/**
 * Map configuration (spec §6).
 *
 * Difficulty is never "a WPM number". It is the combination of target speed,
 * prompt length and familiarity, the reaction buffer, the slack a flow word is
 * given, and how often coins and crates interrupt the rhythm. All of it lives
 * here as data so systems never hardcode tuning (CLAUDE.md §3).
 */

/** Visual theme, spec §6 map table. Drives palette and parallax art, not rules. */
export const MAP_THEMES = [
  'neighborhood',
  'forest-valley',
  'desert-canyon',
  'harbour-docks',
  'night-highway',
  'volcano-ridge',
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

/** Timing budget for a prompt (spec §6 prompt timing formula). */
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

/** Which content this map draws on, and how often the road interrupts it. */
export interface ContentProfile {
  readonly promptCategories: readonly PromptCategory[];
  /**
   * Average seconds between coin lines, measured from the moment the road is
   * clear. A coin line takes the field from the flow word while it is asking.
   */
  readonly coinIntervalSeconds: number;
  /** How many coins are in one line. Score, and a number on the HUD. */
  readonly coinValue: number;
  /**
   * Seconds between powerup crates. Roughly a minute: rare enough that one is
   * an event, often enough that a long run sees several.
   */
  readonly powerupIntervalSeconds: number;
  /**
   * Slack a flow word gets *on top of* `timing.reactionBuffer`, as a fraction.
   *
   * A flow word carries no reaction cost — it is already on screen, in the
   * place the last one was, and the player is mid-rhythm rather than reacting
   * to something new. So it asks for less slack than the thing that has to be
   * noticed first.
   *
   * Per-map rather than one constant, and that is the whole point: flow words
   * are now the primary prompt, so a fixed buffer would give all six maps the
   * same tolerance and the ladder would stop gating anything.
   */
  readonly flowTolerance: number;
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
  /**
   * Total run distance in metres.
   *
   * Zero means **endless** (plan 2.2): there is no finish line, the run ends
   * only when the player does, and how far they got is the whole score. Zero
   * rather than a separate flag because every consumer already had to handle a
   * non-positive distance — `runProgress` returned 1 for it — so a flag would
   * have added a second thing to keep in step with the first.
   */
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
  /**
   * How the map gets harder as a run goes on. Absent on the fixed maps.
   *
   * Exists because raising `speed.rampPerMinute` does **not** make a map harder,
   * which is not obvious and cost a build to find out. Hazards are placed by
   * time budget — `spawnDistanceMeters` is derived from how long the word should
   * take — so a faster world simply puts them further away and the player has
   * exactly as long to type. The endless map ramped to nearly twice its opening
   * speed and a metronomic typist survived 53 minutes of it without ever being
   * threatened.
   *
   * The demand that has to rise is the *typing* demand, which is this.
   */
  readonly escalation?: EscalationProfile;
}

/** Rising typing demand over the course of a run (plan 2.2). */
export interface EscalationProfile {
  /** Added to the map's target speed for every minute elapsed. */
  readonly wpmPerMinute: number;
  /** The speed it stops rising at. A ceiling nobody is expected to reach. */
  readonly maxWpm: number;
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
  if (!isStringArray(content['themeTags'])) return false;
  if (!isPositiveNumber(content['coinIntervalSeconds'])) return false;
  if (!isIntegerAtLeast(content['coinValue'], 1)) return false;
  if (!isPositiveNumber(content['powerupIntervalSeconds'])) return false;
  if (!isRatio(content['flowTolerance'])) return false;

  const unlock = value['unlock'];
  if (!isRecord(unlock)) return false;
  if (unlock['requiresMapId'] !== null && !isNonEmptyString(unlock['requiresMapId'])) return false;
  if (!isRatio(unlock['minimumAccuracy'])) return false;

  return true;
}
