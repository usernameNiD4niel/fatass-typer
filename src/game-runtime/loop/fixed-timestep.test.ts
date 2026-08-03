import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FIXED_TIMESTEP_CONFIG,
  drainAccumulator,
  type FixedTimestepConfig,
} from './fixed-timestep';

const config: FixedTimestepConfig = {
  fixedDeltaMs: 10,
  maxFrameMs: 250,
  maxStepsPerFrame: 5,
};

describe('drainAccumulator', () => {
  it('runs one step per whole timestep of elapsed time', () => {
    const result = drainAccumulator(0, 30, config);

    expect(result.steps).toBe(3);
    expect(result.accumulatorMs).toBe(0);
    expect(result.droppedMs).toBe(0);
  });

  it('carries the remainder instead of dropping it', () => {
    const result = drainAccumulator(0, 25, config);

    expect(result.steps).toBe(2);
    expect(result.accumulatorMs).toBe(5);
  });

  it('accumulates sub-step frames until they add up to a step', () => {
    const first = drainAccumulator(0, 4, config);
    expect(first.steps).toBe(0);

    const second = drainAccumulator(first.accumulatorMs, 4, config);
    expect(second.steps).toBe(0);

    const third = drainAccumulator(second.accumulatorMs, 4, config);
    expect(third.steps).toBe(1);
    expect(third.accumulatorMs).toBeCloseTo(2);
  });

  it('reports alpha as the fraction of a step still pending', () => {
    const result = drainAccumulator(0, 25, config);

    expect(result.alpha).toBeCloseTo(0.5);
    expect(result.alpha).toBeLessThan(1);
  });

  it('keeps alpha below one even when the accumulator is nearly full', () => {
    const result = drainAccumulator(0, 19.999, config);

    expect(result.alpha).toBeLessThan(1);
  });

  it('clamps a huge frame and reports the dropped time', () => {
    // A backgrounded tab restored after a minute.
    const result = drainAccumulator(0, 60_000, config);

    expect(result.steps).toBe(config.maxStepsPerFrame);
    expect(result.droppedMs).toBeCloseTo(60_000 - config.maxStepsPerFrame * config.fixedDeltaMs);
  });

  it('does not bank surplus time when the step ceiling bites', () => {
    // 200ms is 20 steps' worth but only 5 are allowed. If the surplus were kept,
    // the next frames would inherit a backlog that never drains — spiral of death.
    const result = drainAccumulator(0, 200, config);

    expect(result.steps).toBe(5);
    expect(result.accumulatorMs).toBeLessThan(config.fixedDeltaMs);
    expect(result.droppedMs).toBeCloseTo(150);
  });

  it('preserves the sub-step remainder while dropping the surplus', () => {
    const result = drainAccumulator(0, 203, config);

    expect(result.steps).toBe(5);
    expect(result.accumulatorMs).toBeCloseTo(3);
    expect(result.droppedMs).toBeCloseTo(150);
  });

  it('treats a negative or zero frame as no elapsed time', () => {
    const result = drainAccumulator(7, -50, config);

    expect(result.steps).toBe(0);
    expect(result.accumulatorMs).toBe(7);
    expect(result.droppedMs).toBe(0);
  });

  it('conserves time exactly when nothing is clamped', () => {
    let accumulator = 0;
    let steps = 0;

    for (let frame = 0; frame < 100; frame += 1) {
      const result = drainAccumulator(accumulator, 16.7, config);
      accumulator = result.accumulatorMs;
      steps += result.steps;
      expect(result.droppedMs).toBe(0);
    }

    expect(steps * config.fixedDeltaMs + accumulator).toBeCloseTo(100 * 16.7, 6);
  });

  it('defaults to a 60Hz simulation', () => {
    const result = drainAccumulator(0, 1000, DEFAULT_FIXED_TIMESTEP_CONFIG);

    expect(DEFAULT_FIXED_TIMESTEP_CONFIG.fixedDeltaMs).toBeCloseTo(16.667, 2);
    expect(result.steps).toBe(DEFAULT_FIXED_TIMESTEP_CONFIG.maxStepsPerFrame);
  });
});
