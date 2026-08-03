import { describe, expect, it } from 'vitest';

import {
  createView,
  DEFAULT_PERSPECTIVE,
  finishZ,
  isDrawable,
  NEAR_CLIP_METERS,
  PACK_TRAIL_MAX_METERS,
  packZ,
  project,
  resizeView,
  runnerZ,
} from './perspective';

/**
 * The chase camera.
 *
 * Pure arithmetic, so the interesting cases are the ones that would be invisible
 * in a screenshot: what happens behind the lens, and whether the direction of
 * every mapping is the right way round.
 */

const view = createView({ widthPx: 1280, heightPx: 720 }, 400);

describe('projection', () => {
  it('puts the track centre on the centre line', () => {
    expect(project(view, { z: 20 }).xPx).toBeCloseTo(view.centreXPx);
  });

  it('shrinks with distance', () => {
    const near = project(view, { z: 5 });
    const far = project(view, { z: 50 });

    expect(far.scale).toBeLessThan(near.scale);
  });

  it('draws the ground below the horizon and rising towards it', () => {
    const near = project(view, { z: 5 });
    const far = project(view, { z: 120 });

    expect(near.yPx).toBeGreaterThan(view.horizonYPx);
    expect(far.yPx).toBeGreaterThan(view.horizonYPx);
    expect(far.yPx).toBeLessThan(near.yPx);
  });

  it('lifts a point off the ground', () => {
    const ground = project(view, { z: 12 });
    const airborne = project(view, { z: 12, y: 1.8 });

    // Up is a smaller y. A jump that moved the runner *down* the screen would
    // be the kind of sign error only an assertion catches.
    expect(airborne.yPx).toBeLessThan(ground.yPx);
  });

  it('mirrors left and right', () => {
    const left = project(view, { z: 20, x: -3 });
    const right = project(view, { z: 20, x: 3 });

    expect(view.centreXPx - left.xPx).toBeCloseTo(right.xPx - view.centreXPx);
  });

  it('clamps behind the lens rather than returning an infinity', () => {
    const behind = project(view, { z: -40 });

    expect(Number.isFinite(behind.xPx)).toBe(true);
    expect(Number.isFinite(behind.yPx)).toBe(true);
  });
});

describe('what can be drawn', () => {
  it('refuses anything at or behind the lens', () => {
    expect(isDrawable(view, NEAR_CLIP_METERS)).toBe(false);
    expect(isDrawable(view, -2)).toBe(false);
  });

  it('refuses anything past the draw distance', () => {
    expect(isDrawable(view, DEFAULT_PERSPECTIVE.drawDistanceMeters + 1)).toBe(false);
    expect(isDrawable(view, 40)).toBe(true);
  });
});

describe('the pack', () => {
  it('sits between the lens and the runner, whatever the gap', () => {
    for (const gap of [0, 0.25, 0.5, 0.75, 1]) {
      const z = packZ(view, gap);

      expect(z).toBeGreaterThan(NEAR_CLIP_METERS);
      expect(z).toBeLessThan(runnerZ(view));
    }
  });

  it('closes on the runner as the gap closes', () => {
    // The direction that has to be right: losing ground moves them *up* the
    // track towards him, not away.
    expect(packZ(view, 0)).toBeGreaterThan(packZ(view, 1));
  });

  it('reaches him when the gap is gone', () => {
    expect(runnerZ(view) - packZ(view, 0)).toBeLessThan(1);
  });

  it('clamps a gap outside its range', () => {
    expect(packZ(view, 5)).toBe(packZ(view, 1));
    expect(packZ(view, -5)).toBe(packZ(view, 0));
  });

  it('never puts them further back than the configured trail', () => {
    expect(runnerZ(view) - packZ(view, 1)).toBeCloseTo(PACK_TRAIL_MAX_METERS);
  });
});

describe('the finish line', () => {
  it('stays out of view until it is close enough', () => {
    expect(finishZ(view, 0)).toBeNull();
  });

  it('appears once the runner is near the end', () => {
    const z = finishZ(view, 350);

    expect(z).not.toBeNull();
    expect(z ?? 0).toBeCloseTo(400 - 350 + runnerZ(view));
  });
});

describe('resizing', () => {
  it('recomputes the frame and keeps the run', () => {
    const wider = resizeView(view, { widthPx: 1920, heightPx: 1080 });

    expect(wider.centreXPx).toBe(960);
    expect(wider.horizonYPx).toBeCloseTo(1080 * DEFAULT_PERSPECTIVE.horizonRatio);
    expect(wider.worldLengthMeters).toBe(view.worldLengthMeters);
  });

  it('survives a zero-sized element rather than dividing by it', () => {
    const collapsed = resizeView(view, { widthPx: 0, heightPx: 0 });

    expect(Number.isFinite(collapsed.focalLengthPx)).toBe(true);
    expect(collapsed.focalLengthPx).toBeGreaterThan(0);
  });
});
