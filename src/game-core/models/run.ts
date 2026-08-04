import { isCount, isRatio, isRecord } from './guards';
import type { IsoTimestamp, MapId, RunId } from './ids';
import { isId, isIsoTimestamp } from './ids';
import { CURRENT_SCHEMA_VERSION } from './schema';
import type { Versioned } from './schema';

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
  /** 0..1. Obstacles avoided divided by obstacles faced. */
  readonly obstacleSuccessRate: number;
  readonly longestCombo: number;
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
  flightRemainingMs: 0,
  magnetRemainingMs: 0,
  elapsedMs: 0,
};

export function isRunResult(value: unknown): value is RunResult {
  if (!isRecord(value)) return false;

  return (
    typeof value['schemaVersion'] === 'number' &&
    isId(value['runId']) &&
    isId(value['mapId']) &&
    isIsoTimestamp(value['startedAt']) &&
    isCount(value['durationMs']) &&
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
