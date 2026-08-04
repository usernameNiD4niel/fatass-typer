import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAP_1, MAP_6, OBSTACLES } from '../../content';
import { profileRun } from './profile-harness';

/**
 * What a frame costs, and whether it grows (spec §16).
 *
 * These are not timing assertions dressed up as tests — a CI runner's
 * millisecond is not a laptop's. What they pin is the *shape*: the cost of a
 * frame must not climb as a run goes on, because that is what a leak looks like
 * from the outside. `docs/performance.md` records the measured numbers.
 */

const BUDGET_MS = 1000 / 60;

describe('frame cost', () => {
  it('simulates and assembles the world in a fraction of a frame', () => {
    const result = profileRun({
      map: MAP_1,
      prompts: ALL_PROMPTS,
      obstacles: OBSTACLES,
      seed: 'profile-1',
      seconds: 45,
      wpm: MAP_1.targetWpm,
    });

    expect(result.frames).toBeGreaterThan(1_000);
    // A generous ceiling: what would fail here is a frame that got *orders* of
    // magnitude slower, which is the only kind of regression worth a test.
    expect(result.medianCostMs).toBeLessThan(BUDGET_MS / 4);
    expect(result.p95CostMs).toBeLessThan(BUDGET_MS);
  });

  it('does not get more expensive the longer the run goes on', () => {
    const result = profileRun({
      map: MAP_6,
      prompts: ALL_PROMPTS,
      obstacles: OBSTACLES,
      seed: 'profile-6',
      seconds: 60,
      wpm: MAP_6.targetWpm,
      sampleEvery: 4,
    });

    const samples = result.samples;
    expect(samples.length).toBeGreaterThan(50);

    const third = Math.floor(samples.length / 3);
    const early = samples.slice(0, third);
    const late = samples.slice(-third);

    const mean = (entries: typeof samples) =>
      entries.reduce((total, entry) => total + entry.costMs, 0) / entries.length;

    // The real assertion. Hazards resolve and are forgotten, pools are fixed,
    // and nothing accumulates — so the last minute of a map costs what the first
    // did, give or take the noise of a shared machine.
    expect(mean(late)).toBeLessThan(Math.max(mean(early) * 6, 0.5));
  });

  it('keeps the hazard pool bounded', () => {
    const result = profileRun({
      map: MAP_6,
      prompts: ALL_PROMPTS,
      obstacles: OBSTACLES,
      seed: 'profile-pool',
      seconds: 60,
      wpm: MAP_6.targetWpm,
    });

    // One at a time, by construction — plus whatever is briefly waiting to be
    // forgotten. A number that crept up would mean hazards were leaking.
    for (const sample of result.samples) {
      expect(sample.hazards).toBeLessThanOrEqual(2);
    }
  });
});
