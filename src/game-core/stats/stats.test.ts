import { describe, expect, it } from 'vitest';
import { applyInput, createTypingState } from '../typing';
import {
  accuracyOf,
  charactersAtWpm,
  CURRENT_WPM_WINDOW_MS,
  grossWpm,
  millisecondsToType,
  RAW_PEAK_WINDOW_MS,
} from './wpm';
import {
  averageWpm,
  createRunStats,
  currentWpm,
  idleMs,
  recordSample,
  recordTypingDelta,
  runAccuracy,
  totalCharacters,
} from './run-stats';
import type { RunStats } from './run-stats';

/** Records `count` characters, one every `intervalMs`, starting at `fromMs`. */
function typeSteadily(
  stats: RunStats,
  count: number,
  intervalMs: number,
  fromMs = intervalMs,
): RunStats {
  let next = stats;

  for (let index = 0; index < count; index += 1) {
    next = recordSample(next, fromMs + index * intervalMs, { correct: 1 });
  }

  return next;
}

describe('WPM arithmetic — spec §7', () => {
  it('uses the standard five-characters-per-word definition', () => {
    // 100 characters in one minute is 20 words per minute.
    expect(grossWpm(100, 60_000)).toBe(20);
    expect(grossWpm(250, 60_000)).toBe(50);
  });

  it('scales with elapsed time', () => {
    expect(grossWpm(50, 30_000)).toBe(20);
    expect(grossWpm(100, 120_000)).toBe(10);
  });

  it('returns zero rather than infinity across no elapsed time', () => {
    expect(grossWpm(10, 0)).toBe(0);
    expect(grossWpm(10, -5)).toBe(0);
  });

  it('returns zero when nothing has been typed', () => {
    expect(grossWpm(0, 60_000)).toBe(0);
  });

  it('inverts cleanly — characters at a speed, and time to type them', () => {
    expect(charactersAtWpm(20, 60_000)).toBe(100);
    expect(millisecondsToType(100, 20)).toBe(60_000);

    // Round-trip at the Map 1 target speed.
    const ms = millisecondsToType(45, 20);
    expect(charactersAtWpm(20, ms)).toBeCloseTo(45, 6);
  });

  it('guards the inverse functions against nonsense input', () => {
    expect(charactersAtWpm(0, 60_000)).toBe(0);
    expect(millisecondsToType(10, 0)).toBe(0);
    expect(millisecondsToType(-1, 20)).toBe(0);
  });

  it('computes accuracy, treating an untouched run as perfect', () => {
    expect(accuracyOf(0, 0)).toBe(1);
    expect(accuracyOf(90, 10)).toBe(0.9);
    expect(accuracyOf(0, 5)).toBe(0);
  });
});

describe('run statistics', () => {
  it('starts empty', () => {
    const stats = createRunStats();

    expect(totalCharacters(stats)).toBe(0);
    expect(runAccuracy(stats)).toBe(1);
    expect(stats.rawPeakWpm).toBe(0);
    expect(averageWpm(stats, 60_000)).toBe(0);
  });

  it('accumulates correct and incorrect characters', () => {
    let stats = createRunStats();
    stats = recordSample(stats, 1_000, { correct: 8, incorrect: 2 });

    expect(stats.correctCharacters).toBe(8);
    expect(stats.incorrectCharacters).toBe(2);
    expect(totalCharacters(stats)).toBe(10);
    expect(runAccuracy(stats)).toBe(0.8);
  });

  it('counts corrections without counting them as characters', () => {
    let stats = createRunStats();
    stats = recordSample(stats, 1_000, { correct: 5 });
    stats = recordSample(stats, 1_500, { corrected: 2 });

    expect(stats.correctedErrors).toBe(2);
    expect(totalCharacters(stats)).toBe(5);
    // A correction moves no characters, so it adds no sample.
    expect(stats.samples).toHaveLength(1);
  });

  it('ignores an empty record', () => {
    const stats = createRunStats();

    expect(recordSample(stats, 1_000, {})).toBe(stats);
  });

  it('never mutates the stats it is given', () => {
    const stats = recordSample(createRunStats(), 500, { correct: 3 });
    const snapshot = { ...stats, samples: [...stats.samples] };

    recordSample(stats, 1_000, { correct: 3 });

    expect(stats).toEqual(snapshot);
  });

  it('computes the run average across the whole run', () => {
    // 100 characters over 60 seconds.
    const stats = typeSteadily(createRunStats(), 100, 600);

    expect(averageWpm(stats, 60_000)).toBe(20);
  });

  it('tracks accuracy independently of speed', () => {
    let stats = createRunStats();
    stats = recordSample(stats, 1_000, { correct: 47, incorrect: 3 });

    expect(runAccuracy(stats)).toBe(0.94);
  });
});

describe('current WPM — the live HUD reading', () => {
  it('measures only the recent window', () => {
    let stats = createRunStats();
    // A burst long ago that should no longer count.
    stats = recordSample(stats, 1_000, { correct: 100 });
    // 50 characters inside the last three seconds.
    stats = recordSample(stats, 29_000, { correct: 50 });

    expect(currentWpm(stats, 30_000)).toBe(grossWpm(50, CURRENT_WPM_WINDOW_MS));
  });

  it('climbs from zero instead of opening on a spike', () => {
    // One character 100ms into the run. Dividing by the real elapsed time would
    // report 120 WPM; against the full window it is a believable 4.
    const stats = recordSample(createRunStats(), 100, { correct: 1 });

    expect(currentWpm(stats, 100)).toBe(4);
  });

  it('falls back to zero once the player stops typing', () => {
    const stats = recordSample(createRunStats(), 1_000, { correct: 30 });

    expect(currentWpm(stats, 1_000)).toBeGreaterThan(0);
    expect(currentWpm(stats, 10_000)).toBe(0);
  });

  it('counts a character exactly once, on the window boundary', () => {
    const stats = recordSample(createRunStats(), 5_000, { correct: 10 });

    // The window is exclusive at its far edge.
    expect(currentWpm(stats, 5_000 + CURRENT_WPM_WINDOW_MS)).toBe(0);
    expect(currentWpm(stats, 5_000 + CURRENT_WPM_WINDOW_MS - 1)).toBeGreaterThan(0);
  });

  it('ignores samples from the future', () => {
    const stats = recordSample(createRunStats(), 10_000, { correct: 50 });

    expect(currentWpm(stats, 2_000)).toBe(0);
  });
});

describe('raw peak WPM — the flattering number', () => {
  it('captures a one-second burst', () => {
    let stats = createRunStats();
    // Ten characters inside a single second: 10 / 5 * 60 = 120 WPM.
    stats = typeSteadily(stats, 10, 100);

    expect(stats.rawPeakWpm).toBe(grossWpm(10, RAW_PEAK_WINDOW_MS));
    expect(stats.rawPeakWpm).toBe(120);
  });

  it('keeps the highest reading even after the player slows down', () => {
    let stats = typeSteadily(createRunStats(), 10, 100);
    const peak = stats.rawPeakWpm;

    stats = typeSteadily(stats, 5, 2_000, 5_000);

    expect(stats.rawPeakWpm).toBe(peak);
  });

  it('rises well above the sustained average — which is why it is not the record', () => {
    let stats = typeSteadily(createRunStats(), 10, 100);
    stats = typeSteadily(stats, 20, 3_000, 4_000);

    expect(stats.rawPeakWpm).toBeGreaterThan(averageWpm(stats, 64_000) * 3);
  });

  it('does not report a wild figure for the very first keystroke', () => {
    const stats = recordSample(createRunStats(), 1, { correct: 1 });

    expect(stats.rawPeakWpm).toBe(12);
  });

  it('counts incorrect characters toward the raw peak', () => {
    // Raw speed is raw speed; accuracy is reported separately.
    const stats = recordSample(createRunStats(), 500, { correct: 5, incorrect: 5 });

    expect(stats.rawPeakWpm).toBe(120);
  });
});

describe('idle detection', () => {
  it('reports time since the last character', () => {
    const stats = recordSample(createRunStats(), 4_000, { correct: 3 });

    expect(idleMs(stats, 9_000)).toBe(5_000);
    expect(idleMs(stats, 4_000)).toBe(0);
  });

  it('never reports negative idle time', () => {
    const stats = recordSample(createRunStats(), 4_000, { correct: 3 });

    expect(idleMs(stats, 1_000)).toBe(0);
  });
});

describe('recording from the typing engine', () => {
  it('folds a keystroke delta into the run', () => {
    const before = createTypingState('crate');
    const after = applyInput(before, 'c');

    const stats = recordTypingDelta(createRunStats(), before, after, 500);

    expect(stats.correctCharacters).toBe(1);
    expect(stats.incorrectCharacters).toBe(0);
  });

  it('carries mistakes and corrections through unchanged', () => {
    let typing = createTypingState('crate');
    let stats = createRunStats();
    let atMs = 0;

    for (const value of ['c', 'cr', 'cru', 'cr', 'cra', 'crat', 'crate']) {
      const next = applyInput(typing, value);
      atMs += 200;
      stats = recordTypingDelta(stats, typing, next, atMs);
      typing = next;
    }

    expect(typing.complete).toBe(true);
    expect(stats.correctCharacters).toBe(5);
    expect(stats.incorrectCharacters).toBe(1);
    expect(stats.correctedErrors).toBe(1);
    expect(runAccuracy(stats)).toBeCloseTo(5 / 6, 6);
  });

  it('produces the expected speed for a steady 20 WPM typist', () => {
    // 20 WPM is 100 characters per minute — one character every 600ms.
    let typing = createTypingState('the quick brown fox jumps');
    let stats = createRunStats();

    for (let index = 1; index <= typing.target.length; index += 1) {
      const next = applyInput(typing, typing.target.slice(0, index));
      stats = recordTypingDelta(stats, typing, next, index * 600);
      typing = next;
    }

    expect(typing.complete).toBe(true);
    expect(averageWpm(stats, typing.target.length * 600)).toBeCloseTo(20, 6);
  });
});
