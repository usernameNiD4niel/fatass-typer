import type { TypingState } from '../typing/session';
import { accuracyOf, CURRENT_WPM_WINDOW_MS, grossWpm, RAW_PEAK_WINDOW_MS } from './wpm';

/**
 * Typing statistics for one run (spec §7).
 *
 * Every reading derives from a timestamped sample log rather than from running
 * averages, because the same log has to answer questions at several different
 * window lengths: live WPM, raw peak, and — in step B4 — sustainable peak.
 *
 * No clock is read here. Timestamps arrive as parameters (CLAUDE.md §3).
 */

/** One batch of characters entered at a moment in time. */
export interface TypingSample {
  /** Milliseconds since the run started. */
  readonly atMs: number;
  readonly correct: number;
  readonly incorrect: number;
}

export interface RunStats {
  readonly samples: readonly TypingSample[];
  readonly correctCharacters: number;
  readonly incorrectCharacters: number;
  readonly correctedErrors: number;
  /** Highest reading over a one-second window. Spiky by design. */
  readonly rawPeakWpm: number;
  /** Latest sample time, in milliseconds since the run started. */
  readonly lastInputAtMs: number;
}

export const EMPTY_RUN_STATS: RunStats = {
  samples: [],
  correctCharacters: 0,
  incorrectCharacters: 0,
  correctedErrors: 0,
  rawPeakWpm: 0,
  lastInputAtMs: 0,
};

export function createRunStats(): RunStats {
  return EMPTY_RUN_STATS;
}

/** Total characters entered, right or wrong. Corrections are not subtracted. */
export function totalCharacters(stats: RunStats): number {
  return stats.correctCharacters + stats.incorrectCharacters;
}

/** Characters entered within `[atMs - windowMs, atMs]`. */
function charactersInWindow(stats: RunStats, atMs: number, windowMs: number): number {
  const from = atMs - windowMs;
  let total = 0;

  // Samples are appended in order, so walk backwards and stop at the edge.
  for (let index = stats.samples.length - 1; index >= 0; index -= 1) {
    const sample = stats.samples[index];
    if (sample === undefined) break;
    if (sample.atMs <= from) break;
    if (sample.atMs > atMs) continue;

    total += sample.correct + sample.incorrect;
  }

  return total;
}

/**
 * Records characters entered at a point in time.
 *
 * `atMs` is milliseconds since the run started, so a paused run simply stops
 * advancing it — no separate pause bookkeeping is needed.
 */
export function recordSample(
  stats: RunStats,
  atMs: number,
  entered: { readonly correct?: number; readonly incorrect?: number; readonly corrected?: number },
): RunStats {
  const correct = entered.correct ?? 0;
  const incorrect = entered.incorrect ?? 0;
  const corrected = entered.corrected ?? 0;

  if (correct === 0 && incorrect === 0 && corrected === 0) return stats;

  // A correction on its own moves no characters, so it does not become a sample.
  const samples =
    correct === 0 && incorrect === 0
      ? stats.samples
      : [...stats.samples, { atMs, correct, incorrect }];

  const next: RunStats = {
    samples,
    correctCharacters: stats.correctCharacters + correct,
    incorrectCharacters: stats.incorrectCharacters + incorrect,
    correctedErrors: stats.correctedErrors + corrected,
    rawPeakWpm: stats.rawPeakWpm,
    lastInputAtMs: Math.max(stats.lastInputAtMs, atMs),
  };

  // The raw peak is evaluated against a fixed window width even early in the
  // run. Dividing by the tiny real elapsed time instead would report several
  // thousand WPM for the first keystroke.
  const windowWpm = grossWpm(
    charactersInWindow(next, atMs, RAW_PEAK_WINDOW_MS),
    RAW_PEAK_WINDOW_MS,
  );

  return { ...next, rawPeakWpm: Math.max(stats.rawPeakWpm, windowWpm) };
}

/**
 * Records the difference between two typing states.
 *
 * The bridge between step B2 and the statistics: the typing engine already
 * counts characters per prompt, and this folds those deltas into the run.
 */
export function recordTypingDelta(
  stats: RunStats,
  before: TypingState,
  after: TypingState,
  atMs: number,
): RunStats {
  return recordSample(stats, atMs, {
    correct: after.correctCharacters - before.correctCharacters,
    incorrect: after.incorrectCharacters - before.incorrectCharacters,
    corrected: after.correctedErrors - before.correctedErrors,
  });
}

/** Average WPM across the whole run so far. */
export function averageWpm(stats: RunStats, elapsedMs: number): number {
  return grossWpm(totalCharacters(stats), elapsedMs);
}

/**
 * Live WPM for the HUD — a rolling three-second window.
 *
 * Measured against the full window width, so the reading climbs from zero at the
 * start of a run instead of opening on a meaningless spike.
 */
export function currentWpm(stats: RunStats, atMs: number): number {
  return grossWpm(charactersInWindow(stats, atMs, CURRENT_WPM_WINDOW_MS), CURRENT_WPM_WINDOW_MS);
}

/** Accuracy across the run, 0..1. */
export function runAccuracy(stats: RunStats): number {
  return accuracyOf(stats.correctCharacters, stats.incorrectCharacters);
}

/** Milliseconds since the last character was entered. */
export function idleMs(stats: RunStats, atMs: number): number {
  return Math.max(0, atMs - stats.lastInputAtMs);
}
