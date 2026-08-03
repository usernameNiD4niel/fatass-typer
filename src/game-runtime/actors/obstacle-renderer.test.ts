import { describe, expect, it } from 'vitest';

import { MAP_1, OBSTACLES, ALL_PROMPTS } from '../../content';
import type { PromptEntry } from '../../game-core/models';
import { type ActiveObstacle, placeObstacle } from '../../game-core/obstacles';
import { FakeCanvas2D } from '../../test/fake-canvas';
import { createCamera, followPlayer } from '../render/camera';
import {
  drawObstacle,
  drawObstacles,
  OBSTACLE_COLORS,
  obstacleHeightPx,
} from './obstacle-renderer';

const camera = followPlayer(
  createCamera({ widthPx: 1000, heightPx: 600 }, 800, { pixelsPerMeter: 24, anchorRatio: 0.55 }),
  100,
);

const PROMPT: PromptEntry =
  ALL_PROMPTS[0] ??
  (() => {
    throw new Error('the starter vocabulary is empty');
  })();

function place(obstacleId: string, overrides: Partial<ActiveObstacle> = {}): ActiveObstacle {
  const definition = OBSTACLES.find((entry) => entry.id === obstacleId);
  if (definition === undefined) throw new Error(`unknown obstacle ${obstacleId}`);

  const placed = placeObstacle({
    instanceId: `${obstacleId}-1`,
    definition,
    prompt: PROMPT,
    map: MAP_1,
    playerMeters: 100,
    elapsedMs: 0,
  });

  return { ...placed, ...overrides };
}

/** An obstacle with its prompt attached and its deadline running from zero. */
function attached(obstacleId: string): ActiveObstacle {
  const placed = place(obstacleId);

  return {
    ...placed,
    status: 'active',
    attachedAtMs: 0,
    deadlineAtMs: placed.timing.availableMs,
    warned: true,
  };
}

function draw(obstacle: ActiveObstacle, elapsedMs = 0): FakeCanvas2D {
  const context = new FakeCanvas2D();
  drawObstacle(context, { camera, groundYPx: 432, obstacle, elapsedMs });

  return context;
}

describe('obstacleHeightPx', () => {
  it('sizes obstacles in world meters, so they scale with the camera', () => {
    // The MC is 1.75m: a crate is knee-to-waist height, a sign is overhead.
    expect(obstacleHeightPx(camera, 'crate')).toBeLessThan(1.75 * 24);
    expect(obstacleHeightPx(camera, 'hanging-sign')).toBeGreaterThan(1.75 * 24);
  });

  it('falls back to a sensible height for an unknown obstacle', () => {
    expect(obstacleHeightPx(camera, 'not-real')).toBeGreaterThan(0);
  });
});

describe('drawObstacle', () => {
  it('restores the context it was handed', () => {
    const context = draw(place('crate'));

    expect(context.callsOf('save')).toHaveLength(context.callsOf('restore').length);
  });

  it('stands the obstacle on the ground at its world position', () => {
    const obstacle = place('crate');
    const context = draw(obstacle);
    const translate = context.callsOf('translate')[0];

    expect(translate?.args[1]).toBe(432);
    // Ahead of the MC, who is at 100m.
    expect(translate?.args[0]).toBeGreaterThan(0);
  });

  it('gives every obstacle its own silhouette', () => {
    const signatures = OBSTACLES.map((definition) =>
      JSON.stringify(draw(place(definition.id)).calls),
    );

    expect(new Set(signatures).size).toBe(OBSTACLES.length);
  });

  it('draws something for every obstacle in the game', () => {
    for (const definition of OBSTACLES) {
      const context = draw(place(definition.id));

      expect(context.calls.length).toBeGreaterThan(3);
    }
  });

  it('flags an approaching obstacle with a warning marker', () => {
    const context = draw(place('crate'));

    expect(context.calls.some((call) => call.fillStyle === OBSTACLE_COLORS.warning)).toBe(true);
  });

  it('swaps the warning for a deadline bar once the prompt attaches', () => {
    const context = draw(attached('crate'), 0);

    expect(context.calls.some((call) => call.fillStyle === OBSTACLE_COLORS.warning)).toBe(false);
    expect(context.calls.some((call) => call.fillStyle === OBSTACLE_COLORS.pressureSafe)).toBe(
      true,
    );
  });

  it('escalates the bar colour as the deadline closes', () => {
    const obstacle = attached('crate');
    const budget = obstacle.timing.availableMs;

    const colourAt = (elapsedMs: number) =>
      new Set(draw(obstacle, elapsedMs).calls.map((call) => call.fillStyle));

    expect(colourAt(budget * 0.6).has(OBSTACLE_COLORS.pressureWarning)).toBe(true);
    expect(colourAt(budget * 0.85).has(OBSTACLE_COLORS.pressureCritical)).toBe(true);
  });

  it('shortens the bar as time runs out, so the cue is not colour alone', () => {
    const obstacle = attached('crate');
    const budget = obstacle.timing.availableMs;

    const barWidth = (elapsedMs: number) => {
      const calls = draw(obstacle, elapsedMs).callsOf('fillRect');
      // The bar's backing is drawn first, the remaining time on top of it.
      return calls[1]?.args[2] ?? 0;
    };

    expect(barWidth(budget * 0.75)).toBeLessThan(barWidth(0));
  });

  it('draws no marker at all for a resolved obstacle', () => {
    const context = draw(place('crate', { status: 'resolved' }));

    expect(context.calls.some((call) => call.fillStyle === OBSTACLE_COLORS.warning)).toBe(false);
    expect(context.calls.some((call) => call.fillStyle === OBSTACLE_COLORS.pressureSafe)).toBe(
      false,
    );
  });

  it('is deterministic', () => {
    expect(draw(place('trash-bin')).calls).toEqual(draw(place('trash-bin')).calls);
  });
});

describe('drawObstacles', () => {
  it('draws each obstacle on screen', () => {
    const context = new FakeCanvas2D();

    // Close enough to be inside the camera's slice of world.
    drawObstacles(context, {
      camera,
      groundYPx: 432,
      obstacles: [place('crate', { impactMeters: 110 }), place('puddle', { impactMeters: 115 })],
      elapsedMs: 0,
    });

    expect(context.callsOf('translate').length).toBe(2);
  });

  it('skips obstacles the camera cannot see', () => {
    const context = new FakeCanvas2D();
    const faraway = place('crate', { impactMeters: 700 });

    drawObstacles(context, { camera, groundYPx: 432, obstacles: [faraway], elapsedMs: 0 });

    expect(context.calls).toHaveLength(0);
  });

  it('handles an empty world', () => {
    const context = new FakeCanvas2D();

    drawObstacles(context, { camera, groundYPx: 432, obstacles: [], elapsedMs: 0 });

    expect(context.calls).toHaveLength(0);
  });
});
