import { describe, expect, it } from 'vitest';

import {
  applyClear,
  applyFlowMiss,
  applyMistake,
  createPursuit,
  DEFAULT_PURSUIT,
  isCaught,
  pursuitPressure,
} from './pursuit';

describe('pursuit', () => {
  it('starts at the configured distance and is not chasing anybody down yet', () => {
    const state = createPursuit();

    expect(state.gapMeters).toBe(DEFAULT_PURSUIT.startMeters);
    expect(isCaught(state)).toBe(false);
    expect(pursuitPressure(state)).toBe(0);
  });

  it('falls back when a hazard is cleared decisively', () => {
    const start = createPursuit();
    const after = applyClear(start, 0.8);

    expect(after.gapMeters).toBeGreaterThan(start.gapMeters);
  });

  it('closes when a hazard is only scraped', () => {
    const start = createPursuit();
    const after = applyClear(start, 0.05);

    expect(after.gapMeters).toBeLessThan(start.gapMeters);
  });

  it('neither gains nor loses at the neutral margin', () => {
    const start = createPursuit();
    const after = applyClear(start, DEFAULT_PURSUIT.neutralMargin);

    expect(after.gapMeters).toBeCloseTo(start.gapMeters, 6);
  });

  it('closes on a mistake, immediately', () => {
    const start = createPursuit();

    expect(applyMistake(start).gapMeters).toBeLessThan(start.gapMeters);
  });

  it('closes when a gap word lapses', () => {
    const start = createPursuit();

    expect(applyFlowMiss(start).gapMeters).toBeLessThan(start.gapMeters);
  });

  it('caps the ground a strong opening can bank', () => {
    let state = createPursuit();
    for (let index = 0; index < 40; index += 1) state = applyClear(state, 1);

    // Otherwise a good first minute buys immunity for the second one, and the
    // threat stops covering the half of the run it most needs to.
    expect(state.gapMeters).toBe(DEFAULT_PURSUIT.maxMeters);
  });

  it('never goes below zero, however far it is pushed', () => {
    let state = createPursuit();
    for (let index = 0; index < 200; index += 1) state = applyMistake(state);

    expect(state.gapMeters).toBe(0);
    expect(isCaught(state)).toBe(true);
  });

  it('clamps a margin outside its range rather than trusting it', () => {
    const start = createPursuit();

    // This function can end a run. A bad number should move it by a bounded
    // amount, not kill instantly.
    expect(applyClear(start, 4).gapMeters).toBe(applyClear(start, 1).gapMeters);
    expect(applyClear(start, -3).gapMeters).toBe(applyClear(start, 0).gapMeters);
  });

  it('reports pressure rising as the gap closes', () => {
    const far = createPursuit();
    const near = applyMistake(applyMistake(applyMistake(far)));

    expect(pursuitPressure(near)).toBeGreaterThan(pursuitPressure(far));
    expect(pursuitPressure({ gapMeters: 0 })).toBe(1);
  });
});
