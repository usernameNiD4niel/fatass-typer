import { describe, expect, it } from 'vitest';
import { createRunStats, recordSample } from './run-stats';
import type { RunStats } from './run-stats';
import {
  bestSustainableWindow,
  DEFAULT_SUSTAINABLE_PEAK_CONFIG,
  explainMissingPeak,
  sustainablePeakWpm,
  updateLifetimePeak,
} from './sustainable-peak';
import type { SustainablePeakConfig } from './sustainable-peak';
import { grossWpm } from './wpm';

const CONFIG = DEFAULT_SUSTAINABLE_PEAK_CONFIG;

/**
 * Types at a steady speed for a duration, starting at `fromMs`.
 * One character every `60000 / (wpm * 5)` milliseconds.
 */
function typeAt(
  stats: RunStats,
  wpm: number,
  durationMs: number,
  fromMs = 0,
  options: { readonly accuracy?: number } = {},
): RunStats {
  const intervalMs = 60_000 / (wpm * 5);
  const accuracy = options.accuracy ?? 1;
  let next = stats;
  let index = 0;

  for (let atMs = fromMs + intervalMs; atMs <= fromMs + durationMs; atMs += intervalMs) {
    index += 1;
    const wrong = index % Math.max(1, Math.round(1 / (1 - accuracy || 1))) === 0 && accuracy < 1;

    next = recordSample(next, Math.round(atMs), wrong ? { incorrect: 1 } : { correct: 1 });
  }

  return next;
}

describe('sustainable peak — configuration', () => {
  it('uses a rolling window inside the 10 to 15 second range from spec §7', () => {
    expect(CONFIG.windowMs).toBeGreaterThanOrEqual(10_000);
    expect(CONFIG.windowMs).toBeLessThanOrEqual(15_000);
  });

  it('requires a character count, an accuracy floor, and an idle limit', () => {
    expect(CONFIG.minimumCharacters).toBeGreaterThan(0);
    expect(CONFIG.minimumAccuracy).toBeGreaterThan(0);
    expect(CONFIG.maximumIdleGapMs).toBeGreaterThan(0);
  });
});

describe('sustainable peak — steady typing', () => {
  it('reports the speed a player actually held', () => {
    const stats = typeAt(createRunStats(), 30, 40_000);

    expect(sustainablePeakWpm(stats)).toBeCloseTo(30, 0);
  });

  it('works at a beginner Map 1 pace', () => {
    const stats = typeAt(createRunStats(), 20, 40_000);

    expect(sustainablePeakWpm(stats)).toBeCloseTo(20, 0);
  });

  it('reports the fastest stretch, not the average of the run', () => {
    let stats = typeAt(createRunStats(), 20, 30_000);
    stats = typeAt(stats, 45, 30_000, 30_000);

    expect(sustainablePeakWpm(stats)).toBeGreaterThan(40);
  });

  it('does not lower the peak when the player slows down afterwards', () => {
    let stats = typeAt(createRunStats(), 45, 30_000);
    const peak = sustainablePeakWpm(stats);

    stats = typeAt(stats, 15, 30_000, 30_000);

    expect(sustainablePeakWpm(stats)).toBe(peak);
  });

  it('reports the window it chose', () => {
    const stats = typeAt(createRunStats(), 30, 40_000);
    const window = bestSustainableWindow(stats);

    expect(window).not.toBeNull();
    expect(window?.endMs).toBeGreaterThanOrEqual(CONFIG.windowMs);
    expect(window?.endMs).toBe((window?.startMs ?? 0) + CONFIG.windowMs);
    expect(window?.wpm).toBeCloseTo(grossWpm(window?.characters ?? 0, CONFIG.windowMs), 6);
  });
});

describe('sustainable peak — the burst problem this exists to solve', () => {
  it('refuses to turn a one-second burst into a record', () => {
    // Fifteen characters inside a single second, then nothing. Deliberately
    // above the minimum character count and perfectly accurate, so the idle gap
    // is the only thing that can disqualify it.
    let stats = createRunStats();
    for (let index = 1; index <= 15; index += 1) {
      stats = recordSample(stats, index * 66, { correct: 1 });
    }

    expect(stats.correctCharacters).toBeGreaterThan(CONFIG.minimumCharacters);
    // The raw peak happily reports a headline figure.
    expect(stats.rawPeakWpm).toBe(180);
    // The sustainable peak reports nothing at all.
    expect(sustainablePeakWpm(stats)).toBe(0);
    expect(explainMissingPeak(stats)).toBe('idle-gap-too-long');
  });

  it('rejects a run made entirely of short bursts with rests between them', () => {
    let stats = createRunStats();

    // Five characters, then a four-second rest, repeated.
    for (let burst = 0; burst < 8; burst += 1) {
      const base = burst * 5_000;
      for (let index = 1; index <= 5; index += 1) {
        stats = recordSample(stats, base + index * 100, { correct: 1 });
      }
    }

    expect(stats.rawPeakWpm).toBeGreaterThan(50);
    expect(sustainablePeakWpm(stats)).toBe(0);
    expect(explainMissingPeak(stats)).toBe('idle-gap-too-long');
  });

  it('is always at or below the raw peak', () => {
    const stats = typeAt(createRunStats(), 35, 40_000);

    expect(sustainablePeakWpm(stats)).toBeLessThanOrEqual(stats.rawPeakWpm);
  });
});

describe('sustainable peak — disqualification rules', () => {
  it('rejects a window with too few characters', () => {
    // Very slow but perfectly steady: a character every 1.5 seconds.
    let stats = createRunStats();
    for (let index = 1; index <= 20; index += 1) {
      stats = recordSample(stats, index * 1_500, { correct: 1 });
    }

    expect(sustainablePeakWpm(stats)).toBe(0);
    expect(explainMissingPeak(stats)).toBe('too-few-characters');
  });

  it('rejects fast typing that is mostly wrong', () => {
    let stats = createRunStats();
    for (let index = 1; index <= 200; index += 1) {
      stats = recordSample(stats, index * 200, { incorrect: 1 });
    }

    expect(sustainablePeakWpm(stats)).toBe(0);
    expect(explainMissingPeak(stats)).toBe('accuracy-too-low');
  });

  it('accepts typing just above the accuracy floor', () => {
    let stats = createRunStats();
    // Nine correct for every one wrong: 90%, above the 80% floor.
    for (let index = 1; index <= 200; index += 1) {
      stats = recordSample(
        stats,
        index * 200,
        index % 10 === 0 ? { incorrect: 1 } : { correct: 1 },
      );
    }

    expect(sustainablePeakWpm(stats)).toBeGreaterThan(0);
  });

  it('rejects a mid-window pause longer than the idle limit', () => {
    let stats = typeAt(createRunStats(), 40, 6_000);
    // A five-second break, well past the two-second limit.
    stats = typeAt(stats, 40, 6_000, 11_000);

    const window = bestSustainableWindow(stats);

    // Any window spanning the break is disqualified, so if a peak exists at all
    // it comes from one of the unbroken halves — and neither half is a full
    // window, so there is no peak.
    expect(window).toBeNull();
  });

  it('tolerates a pause shorter than the idle limit', () => {
    let stats = typeAt(createRunStats(), 40, 20_000);
    stats = typeAt(stats, 40, 20_000, 21_500);

    expect(sustainablePeakWpm(stats)).toBeGreaterThan(0);
  });

  it('cannot qualify before a full window has elapsed', () => {
    // Fast, clean typing — but only for eight seconds.
    const stats = typeAt(createRunStats(), 60, 8_000);

    expect(sustainablePeakWpm(stats)).toBe(0);
  });

  it('qualifies as soon as a full window has elapsed', () => {
    const stats = typeAt(createRunStats(), 60, CONFIG.windowMs + 500);

    expect(sustainablePeakWpm(stats)).toBeGreaterThan(0);
  });
});

describe('sustainable peak — empty and edge cases', () => {
  it('reports no peak for a run with no input', () => {
    expect(sustainablePeakWpm(createRunStats())).toBe(0);
    expect(bestSustainableWindow(createRunStats())).toBeNull();
    expect(explainMissingPeak(createRunStats())).toBe('no-input');
  });

  it('reports no explanation when a peak exists', () => {
    const stats = typeAt(createRunStats(), 30, 40_000);

    expect(explainMissingPeak(stats)).toBeNull();
  });

  it('honors a custom configuration', () => {
    const strict: SustainablePeakConfig = { ...CONFIG, minimumAccuracy: 0.99 };
    let stats = createRunStats();
    for (let index = 1; index <= 200; index += 1) {
      stats = recordSample(
        stats,
        index * 200,
        index % 10 === 0 ? { incorrect: 1 } : { correct: 1 },
      );
    }

    expect(sustainablePeakWpm(stats)).toBeGreaterThan(0);
    expect(sustainablePeakWpm(stats, strict)).toBe(0);
  });

  it('is deterministic', () => {
    const stats = typeAt(createRunStats(), 30, 40_000);

    expect(sustainablePeakWpm(stats)).toBe(sustainablePeakWpm(stats));
  });
});

describe('lifetime record', () => {
  it('takes the better of the two', () => {
    expect(updateLifetimePeak(30, 42)).toBe(42);
  });

  it('never lowers an existing record after a bad run', () => {
    expect(updateLifetimePeak(42, 0)).toBe(42);
    expect(updateLifetimePeak(42, 30)).toBe(42);
  });
});
