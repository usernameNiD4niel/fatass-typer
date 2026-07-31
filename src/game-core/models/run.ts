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
  /** 0..1, where 0 means caught. */
  readonly dogDistanceNormalized: number;
  readonly elapsedMs: number;
}

export const EMPTY_LIVE_STATS: LiveRunStats = {
  currentWpm: 0,
  averageWpm: 0,
  accuracy: 1,
  combo: 0,
  score: 0,
  progress: 0,
  dogDistanceNormalized: 1,
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
    isCount(value['longestCombo'])
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
  };
}
