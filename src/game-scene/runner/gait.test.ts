import { describe, expect, it } from 'vitest';

import { pose, type RunnerPose } from './gait';

/**
 * The gait, asserted rather than eyeballed.
 *
 * A run cycle is either right or unmistakably wrong, and the difference is not
 * visible in a component's source. These are the four things that make a figure
 * look human, in the order they are noticed when they are missing.
 */

function snapshot(phase: number, options: Partial<Parameters<typeof pose>[0]> = {}): RunnerPose {
  // Copied, because `pose` returns a shared object that the next call overwrites.
  return {
    ...pose({ phase, speedMetersPerSecond: 8, airborne: false, reducedMotion: false, ...options }),
  };
}

describe('the run cycle', () => {
  it('never bends a knee the wrong way', () => {
    for (let step = 0; step <= 64; step += 1) {
      const at = snapshot(step / 64);

      expect(at.leftKnee).toBeGreaterThanOrEqual(0);
      expect(at.rightKnee).toBeGreaterThanOrEqual(0);
    }
  });

  it('swings the arm opposite the leg on the same side', () => {
    // Contralateral motion. Get it backwards and the figure reads as drunk
    // without anybody being able to say why.
    for (const phase of [0.1, 0.35, 0.6, 0.85]) {
      const at = snapshot(phase);

      expect(Math.sign(at.leftShoulder)).toBe(-Math.sign(at.leftHip));
      expect(Math.sign(at.rightShoulder)).toBe(-Math.sign(at.rightHip));
    }
  });

  it('keeps the legs half a stride apart', () => {
    const at = snapshot(0.17);

    expect(at.leftHip).toBeCloseTo(-at.rightHip, 6);
  });

  it('repeats exactly once per cycle', () => {
    const start = snapshot(0.23);
    const later = snapshot(1.23);

    expect(later.leftHip).toBeCloseTo(start.leftHip, 9);
    expect(later.leftKnee).toBeCloseTo(start.leftKnee, 9);
    expect(later.bob).toBeCloseTo(start.bob, 9);
  });

  it('bounces twice per stride, once per footfall', () => {
    // Zero at both footfalls and at the crossover, peaking between them.
    expect(snapshot(0).bob).toBeCloseTo(0, 6);
    expect(snapshot(0.5).bob).toBeCloseTo(0, 6);
    expect(snapshot(0.25).bob).toBeGreaterThan(0);
    expect(snapshot(0.75).bob).toBeGreaterThan(0);
  });
});

describe('lean', () => {
  it('grows with speed and stops at the top', () => {
    const slow = snapshot(0.3, { speedMetersPerSecond: 3 });
    const fast = snapshot(0.3, { speedMetersPerSecond: 11 });
    const absurd = snapshot(0.3, { speedMetersPerSecond: 400 });

    expect(fast.lean).toBeGreaterThan(slow.lean);
    expect(absurd.lean).toBeCloseTo(snapshot(0.3, { speedMetersPerSecond: 12 }).lean, 6);
  });
});

describe('airborne', () => {
  it('holds a pose rather than running in mid-air', () => {
    const early = snapshot(0.1, { airborne: true });
    const late = snapshot(0.9, { airborne: true });

    expect(late).toEqual(early);
    expect(early.bob).toBe(0);
  });
});

describe('reduced motion', () => {
  it('damps the whole cycle rather than freezing it', () => {
    // Still a run cycle — a figure sliding along with rigid legs is worse than
    // a small one (spec §12).
    const full = snapshot(0.3);
    const damped = snapshot(0.3, { reducedMotion: true });

    expect(Math.abs(damped.leftHip)).toBeGreaterThan(0);
    expect(Math.abs(damped.leftHip)).toBeLessThan(Math.abs(full.leftHip));
    expect(damped.bob).toBe(0);
  });
});
