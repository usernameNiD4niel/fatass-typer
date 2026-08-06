import type { KeyStats } from '../keystats';
import { isCount, isIntegerAtLeast, isRatio, isRecord } from './guards';
import type { IsoTimestamp, MapId, RunId } from './ids';
import { isId, isIsoTimestamp } from './ids';
import { CURRENT_SCHEMA_VERSION } from './schema';
import type { Versioned } from './schema';

/**
 * Why a run ended, for the game-over screen (spec §17).
 *
 * Lives here rather than beside the hazard code that used to own it, because
 * "why did the run end" is a question about the run, and the answers no longer
 * all come from one system.
 */
export type FailureReason =
  /** The deadline passed with the word unfinished. */
  | 'timeout'
  /** The word was never finished and the player drove into the hazard. */
  | 'collision'
  /** Committed, but the move had not carried them clear in time. */
  | 'late-move'
  /** The chaser reached them. */
  | 'caught';

/**
 * Run outcome (spec §14).
 *
 * Written once when a run ends, then stored in run history. Persisted, so it
 * carries a schema version.
 */
export interface RunResult extends Versioned {
  readonly runId: RunId;
  readonly mapId: MapId;
  readonly startedAt: IsoTimestamp;
  readonly durationMs: number;
  /**
   * How far the player got, in metres.
   *
   * Recorded on every run, but it is the *only* measure of a run on an endless
   * map, where there is no finish line to complete and no completion time to
   * beat (plan 2.2).
   */
  readonly distanceMeters: number;
  /**
   * Which keys this run fumbled (plan 2.4).
   *
   * Optional, and validated only when present. It is additive to a shape that
   * is already on disk, and a required field would make every previously stored
   * run fail validation and vanish from the player's history — runs are skipped
   * rather than repaired, so there is no second chance for them.
   */
  readonly keyStats?: KeyStats;
  /** True only when the finish line was reached. */
  readonly completed: boolean;
  readonly score: number;
  readonly averageWpm: number;
  /** The honest headline figure — a rolling window, not a one-second spike (spec §7). */
  readonly sustainablePeakWpm: number;
  /** Highest instantaneous reading. Shown, but never the lifetime record. */
  readonly rawPeakWpm: number;
  /** 0..1. */
  readonly accuracy: number;
  readonly correctCharacters: number;
  readonly incorrectCharacters: number;
  /** Errors the player noticed and fixed. Not counted against final accuracy. */
  readonly correctedErrors: number;
  readonly completedPrompts: number;
  readonly missedPrompts: number;
  /**
   * 0..1. Words finished divided by words offered.
   *
   * It used to be obstacles avoided over obstacles faced, and the field kept
   * its name through the rework so that every run already on disk stays
   * readable. What it counts changed with the game; what it means — how much of
   * what was asked for did you actually do — did not.
   */
  readonly obstacleSuccessRate: number;
  readonly longestCombo: number;
  /**
   * Where the player finished the race, 1-based.
   *
   * Optional and defaulted when absent, like the fields below it: it is
   * additive to a shape that is already on disk, and a required field would
   * make every stored run fail validation and vanish from the player's history.
   */
  readonly placement?: number;
  /** Coins a rival reached first. */
  readonly coinsStolen?: number;
  /** Coins collected. Optional pickups, so this is a flourish, not a grade. */
  readonly coinsCollected: number;
  /** Powerups taken — sentences typed without a single mistake. */
  readonly powerupsClaimed: number;
  /**
   * The map's secret sentence was finished, so its writing is revealed.
   *
   * Optional on the type and defaulted when absent, like the two fields above
   * it: an older saved run has no opinion about a feature that did not exist,
   * and `coercePlayerProfile` repairs field-by-field rather than discarding a
   * record it does not fully recognise (spec §17).
   */
  readonly secretUnlocked: boolean;
  /** Sentence words typed, and how many there were. For the progress readout. */
  readonly secretWordsTyped: number;
  readonly secretWordCount: number;
}

/**
 * Live statistics emitted to the UI during a run (spec §13).
 *
 * Not persisted, so no schema version. The bridge sends this at a fixed low
 * frequency — never per frame (CLAUDE.md §3).
 */
export interface LiveRunStats {
  readonly currentWpm: number;
  readonly averageWpm: number;
  readonly accuracy: number;
  readonly combo: number;
  readonly score: number;
  /** 0..1 along the track. */
  readonly progress: number;
  /** Current forward speed, for the HUD readout the PDF asks for (§16). */
  readonly speedMetersPerSecond: number;
  /** Continuous lane position, 0..2. Whole numbers mean settled in a lane. */
  readonly lanePosition: number;
  /** Coins collected so far this run. */
  readonly coins: number;
  /** Crashes still absorbable. Shown as lives. */
  readonly shields: number;
  readonly flightRemainingMs: number;
  readonly magnetRemainingMs: number;
  readonly elapsedMs: number;
  /** How far the player has come, in metres. The score on an endless map. */
  readonly distanceMeters: number;
  /** Words of the map secret typed, and how many there are. */
  readonly secretWordsTyped: number;
  readonly secretWordCount: number;
  /**
   * How close the chaser is, 0..1, where 1 is on top of the player.
   *
   * A ratio rather than the raw gap: the HUD says how much trouble the player
   * is in, and metres behind is a number they would have to learn to read.
   */
  readonly pursuitPressure: number;
  /**
   * The WPM the map is asking for right now.
   *
   * Carried in the stats rather than read from the map config by the HUD,
   * because an endless map escalates its target as the run goes on — a value
   * captured once at mount would be a lie for all but the first few seconds.
   */
  readonly targetWpm: number;
  /** Where the player stands in the race, 1-based. 1 is leading. */
  readonly placement: number;
  /** How far ahead (positive) or behind (negative) the nearest rival is, in metres. */
  readonly rivalGapMeters: number;
}

export const EMPTY_LIVE_STATS: LiveRunStats = {
  currentWpm: 0,
  averageWpm: 0,
  accuracy: 1,
  combo: 0,
  score: 0,
  progress: 0,
  speedMetersPerSecond: 0,
  lanePosition: 1,
  coins: 0,
  shields: 0,
  secretWordsTyped: 0,
  secretWordCount: 0,
  pursuitPressure: 0,
  targetWpm: 0,
  placement: 1,
  rivalGapMeters: 0,
  flightRemainingMs: 0,
  magnetRemainingMs: 0,
  elapsedMs: 0,
  distanceMeters: 0,
};

export function isRunResult(value: unknown): value is RunResult {
  if (!isRecord(value)) return false;

  return (
    typeof value['schemaVersion'] === 'number' &&
    isId(value['runId']) &&
    isId(value['mapId']) &&
    isIsoTimestamp(value['startedAt']) &&
    isCount(value['durationMs']) &&
    isCount(value['distanceMeters']) &&
    // Present or absent, but never nonsense.
    (value['keyStats'] === undefined || isRecord(value['keyStats'])) &&
    typeof value['completed'] === 'boolean' &&
    isCount(value['score']) &&
    isCount(value['averageWpm']) &&
    isCount(value['sustainablePeakWpm']) &&
    isCount(value['rawPeakWpm']) &&
    isRatio(value['accuracy']) &&
    isCount(value['correctCharacters']) &&
    isCount(value['incorrectCharacters']) &&
    isCount(value['correctedErrors']) &&
    isCount(value['completedPrompts']) &&
    isCount(value['missedPrompts']) &&
    isRatio(value['obstacleSuccessRate']) &&
    isCount(value['longestCombo']) &&
    // Added after the first release: an older stored run has no coins, and is
    // repaired rather than rejected.
    (value['placement'] === undefined || isIntegerAtLeast(value['placement'], 1)) &&
    (value['coinsStolen'] === undefined || isCount(value['coinsStolen'])) &&
    (value['coinsCollected'] === undefined || isCount(value['coinsCollected'])) &&
    (value['powerupsClaimed'] === undefined || isCount(value['powerupsClaimed'])) &&
    (value['secretUnlocked'] === undefined || typeof value['secretUnlocked'] === 'boolean') &&
    (value['secretWordsTyped'] === undefined || isCount(value['secretWordsTyped'])) &&
    (value['secretWordCount'] === undefined || isCount(value['secretWordCount']))
  );
}

/**
 * An empty result for a run that ended before anything was typed. Used as the
 * base for building real results, so no field is ever left undefined.
 */
export function emptyRunResult(runId: RunId, mapId: MapId, startedAt: IsoTimestamp): RunResult {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    runId,
    mapId,
    startedAt,
    durationMs: 0,
    distanceMeters: 0,
    completed: false,
    score: 0,
    averageWpm: 0,
    sustainablePeakWpm: 0,
    rawPeakWpm: 0,
    accuracy: 1,
    correctCharacters: 0,
    incorrectCharacters: 0,
    correctedErrors: 0,
    completedPrompts: 0,
    missedPrompts: 0,
    obstacleSuccessRate: 0,
    longestCombo: 0,
    coinsCollected: 0,
    powerupsClaimed: 0,
    secretUnlocked: false,
    secretWordsTyped: 0,
    secretWordCount: 0,
  };
}
