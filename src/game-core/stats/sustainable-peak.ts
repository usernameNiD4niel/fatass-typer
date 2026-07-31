import type { RunStats, TypingSample } from './run-stats';
import { accuracyOf, grossWpm } from './wpm';

/**
 * Sustainable peak WPM (spec §7).
 *
 * The prominent lifetime record. A one-second burst must never become the number
 * the player sees on their profile, so a window only counts when it represents
 * typing the player could actually keep up:
 *
 *   - a full rolling window of 10–15 seconds
 *   - enough characters inside it
 *   - accuracy above a floor
 *   - no idle gap longer than the configured limit
 *
 * A window that fails any of these is not slow — it is *disqualified*, and
 * contributes nothing. If no window qualifies, the result is 0 and the display
 * falls back to showing no record yet, which is honest.
 */

export interface SustainablePeakConfig {
  /** Rolling window width. Spec §7 asks for roughly 10–15 seconds. */
  readonly windowMs: number;
  /**
   * Characters required inside the window.
   *
   * Set near a 12 WPM floor: low enough that a genuine beginner on Map 1 can
   * earn a record, high enough that a few stray keystrokes cannot.
   */
  readonly minimumCharacters: number;
  /** Accuracy floor, 0..1. Fast nonsense is not sustainable typing. */
  readonly minimumAccuracy: number;
  /**
   * Longest permitted silence anywhere inside the window, including the run-up
   * to the first character and the tail after the last.
   *
   * This is what stops a burst from qualifying: a one-second flurry inside a
   * twelve-second window leaves eleven seconds of silence around it.
   */
  readonly maximumIdleGapMs: number;
}

export const DEFAULT_SUSTAINABLE_PEAK_CONFIG: SustainablePeakConfig = {
  windowMs: 12_000,
  minimumCharacters: 12,
  minimumAccuracy: 0.8,
  maximumIdleGapMs: 2_000,
};

export interface SustainablePeakWindow {
  readonly wpm: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly characters: number;
  readonly accuracy: number;
}

/** Why a window did not qualify. Used by tests and the developer panel. */
export type WindowRejection = 'too-few-characters' | 'accuracy-too-low' | 'idle-gap-too-long';

interface WindowEvaluation {
  readonly qualified: boolean;
  readonly rejection: WindowRejection | null;
  readonly window: SustainablePeakWindow;
}

/**
 * Evaluates one candidate window `[endMs - windowMs, endMs]`.
 *
 * Gaps are measured across the whole window, not just between samples, so a
 * window that begins before the run started fails on its leading silence — you
 * cannot hold a twelve-second rate until you have typed for twelve seconds.
 */
function evaluateWindow(
  samples: readonly TypingSample[],
  fromIndex: number,
  toIndex: number,
  endMs: number,
  config: SustainablePeakConfig,
): WindowEvaluation {
  const startMs = endMs - config.windowMs;

  let correct = 0;
  let incorrect = 0;
  let previousMs = startMs;
  let longestGapMs = 0;

  for (let index = fromIndex; index <= toIndex; index += 1) {
    const sample = samples[index];
    if (sample === undefined) continue;

    longestGapMs = Math.max(longestGapMs, sample.atMs - previousMs);
    previousMs = sample.atMs;
    correct += sample.correct;
    incorrect += sample.incorrect;
  }

  // Silence between the last character and the end of the window counts too.
  longestGapMs = Math.max(longestGapMs, endMs - previousMs);

  const characters = correct + incorrect;
  const accuracy = accuracyOf(correct, incorrect);
  const window: SustainablePeakWindow = {
    wpm: grossWpm(characters, config.windowMs),
    startMs,
    endMs,
    characters,
    accuracy,
  };

  let rejection: WindowRejection | null = null;
  if (characters < config.minimumCharacters) rejection = 'too-few-characters';
  else if (accuracy < config.minimumAccuracy) rejection = 'accuracy-too-low';
  else if (longestGapMs > config.maximumIdleGapMs) rejection = 'idle-gap-too-long';

  return { qualified: rejection === null, rejection, window };
}

/**
 * Best qualifying window in the run, or `null` if none qualifies.
 *
 * Every sample is considered as a window end. Samples are ordered, so the window
 * start advances monotonically — each sample enters and leaves the window once.
 */
export function bestSustainableWindow(
  stats: RunStats,
  config: SustainablePeakConfig = DEFAULT_SUSTAINABLE_PEAK_CONFIG,
): SustainablePeakWindow | null {
  const { samples } = stats;
  let best: SustainablePeakWindow | null = null;
  let fromIndex = 0;

  for (let toIndex = 0; toIndex < samples.length; toIndex += 1) {
    const end = samples[toIndex];
    if (end === undefined) continue;

    const startMs = end.atMs - config.windowMs;

    while (fromIndex <= toIndex) {
      const candidate = samples[fromIndex];
      if (candidate === undefined || candidate.atMs > startMs) break;
      fromIndex += 1;
    }

    const evaluation = evaluateWindow(samples, fromIndex, toIndex, end.atMs, config);

    if (evaluation.qualified && (best === null || evaluation.window.wpm > best.wpm)) {
      best = evaluation.window;
    }
  }

  return best;
}

/**
 * The run's sustainable peak, or 0 when the player never held a qualifying pace.
 *
 * This is the figure written to `RunResult.sustainablePeakWpm` and, when it beats
 * the previous best, to `PlayerProfile.sustainablePeakWpm`.
 */
export function sustainablePeakWpm(
  stats: RunStats,
  config: SustainablePeakConfig = DEFAULT_SUSTAINABLE_PEAK_CONFIG,
): number {
  return bestSustainableWindow(stats, config)?.wpm ?? 0;
}

/**
 * Explains why the run has no sustainable peak. Returns `null` when it does have
 * one. For the developer panel — never shown as a player-facing excuse.
 */
export function explainMissingPeak(
  stats: RunStats,
  config: SustainablePeakConfig = DEFAULT_SUSTAINABLE_PEAK_CONFIG,
): WindowRejection | 'no-input' | null {
  const { samples } = stats;
  if (samples.length === 0) return 'no-input';
  if (bestSustainableWindow(stats, config) !== null) return null;

  // Report the rejection from the densest window, which is the closest the
  // player came to qualifying.
  let closest: WindowRejection | null = null;
  let mostCharacters = -1;
  let fromIndex = 0;

  for (let toIndex = 0; toIndex < samples.length; toIndex += 1) {
    const end = samples[toIndex];
    if (end === undefined) continue;

    const startMs = end.atMs - config.windowMs;

    while (fromIndex <= toIndex) {
      const candidate = samples[fromIndex];
      if (candidate === undefined || candidate.atMs > startMs) break;
      fromIndex += 1;
    }

    const evaluation = evaluateWindow(samples, fromIndex, toIndex, end.atMs, config);

    if (evaluation.rejection !== null && evaluation.window.characters > mostCharacters) {
      mostCharacters = evaluation.window.characters;
      closest = evaluation.rejection;
    }
  }

  return closest;
}

/**
 * Lifetime record update. Never lowers an existing record — a bad run does not
 * erase a good one.
 */
export function updateLifetimePeak(previousPeakWpm: number, runPeakWpm: number): number {
  return Math.max(previousPeakWpm, runPeakWpm);
}
