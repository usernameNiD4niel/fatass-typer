import { describe, expect, it } from 'vitest';

import { MAP_1, MAP_6, obstaclesFor } from '../../content';
import { ALL_PROMPTS } from '../../content';
import { profileRun } from './profile-harness';

/**
 * The performance pass, stated as assertions (spec §16).
 *
 * Two kinds of number appear here, and they are not equally trustworthy:
 *
 *   - **Draw calls per frame** is a property of the code. It does not move when
 *     the machine is busy, and it is the number that would catch a scene which
 *     starts drawing every obstacle a run has ever spawned.
 *   - **Milliseconds per frame** is a property of the machine. It is asserted
 *     only against a ceiling generous enough to survive a loaded CI box, and
 *     the measured figures live in `docs/performance.md` rather than here.
 *
 * The recorded run of these numbers is in that document.
 */

const FRAME_BUDGET_MS = 1000 / 60;

function profile(map = MAP_1, frames = 600) {
  return profileRun({
    map,
    prompts: ALL_PROMPTS,
    obstacles: obstaclesFor(map.content.obstacleIds),
    seed: 'performance',
    frames,
  });
}

describe('frame cost', () => {
  it('leaves the frame budget almost entirely to the browser', () => {
    const result = profile();

    // Simulation plus scene assembly. Whatever is left of 16.6ms belongs to
    // rasterisation and to the rest of the page.
    expect(result.msPerFrame).toBeLessThan(FRAME_BUDGET_MS / 2);
  });

  it('costs the same per frame at the end of a run as at the start', () => {
    const early = profile(MAP_1, 120);
    const late = profile(MAP_1, 1800);

    // The failure this is written against: obstacles accumulating in the scene
    // for the whole run, so the last minute of a map costs more than the first.
    expect(late.drawCallsPerFrame).toBeLessThan(early.drawCallsPerFrame * 1.6);
  });

  it('draws a bounded scene', () => {
    const result = profile();

    // Flat vector art on a 1024px stage. A four-figure count would mean the
    // parallax tiling had stopped bounding itself.
    expect(result.drawCallsPeakFrame).toBeLessThan(1500);
  });

  it('holds on the busiest map too', () => {
    const result = profile(MAP_6);

    expect(result.msPerFrame).toBeLessThan(FRAME_BUDGET_MS / 2);
  });
});

describe('React is not in the frame loop', () => {
  it('offers stats once per simulation step and no more', () => {
    const result = profile(MAP_1, 600);

    // One offer per fixed step, which the bridge then throttles to ~10Hz. What
    // matters is that a *frame* never pushes anything at React on its own.
    expect(result.statsSamples).toBeLessThanOrEqual(result.framesRun + 2);
  });

  it('emits far fewer events than it draws frames', () => {
    const result = profile(MAP_1, 600);

    // Events are prompts, warnings, and resolutions — things that happen, not
    // things that are true every frame.
    expect(result.events).toBeLessThan(result.framesRun / 4);
  });
});
