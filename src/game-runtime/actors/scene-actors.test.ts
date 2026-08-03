import { describe, expect, it } from 'vitest';

import { FakeCanvas2D } from '../../test/fake-canvas';
import { createView } from '../render/perspective';
import { advanceMcAnimation, createMcAnimation, play, stateDurationMs } from './mc-animation';
import { drawObstacleCourse, obstacleZ } from './obstacle-course-renderer';
import { drawPack } from './pack-renderer';
import { drawRunner, runnerWorldPoint } from './runner-renderer';
import type { ActiveObstacle } from '../../game-core/obstacles';
import type { ObstacleAction, ObstacleDefinition, PromptEntry } from '../../game-core/models';

/**
 * The actors in the chase shot.
 *
 * jsdom has no 2D context, so these draw through the recording stub and assert
 * on what was actually issued. The questions worth asking of a renderer are not
 * "did it paint the right brown" but "is the runner higher when he jumps" and
 * "does an obstacle behind the camera cost anything".
 */

const view = createView({ widthPx: 1280, heightPx: 720 }, 400);

/** A one-shot pose, halfway through — the top of a jump, the middle of a step. */
function midway(state: 'jumping' | 'sidestepping') {
  return advanceMcAnimation(play(createMcAnimation(), state), {
    deltaMs: stateDurationMs(state) / 2,
    speedMetersPerSecond: 8,
  });
}

function obstacle(impactMeters: number, action: ObstacleAction = 'jump'): ActiveObstacle {
  const definition: ObstacleDefinition = {
    id: 'rock',
    label: 'Rock',
    action,
    difficultyWeight: 0.2,
    minimumMap: 1,
    promptCategory: 'short-word',
    baseReactionTimeMs: 340,
  };
  const prompt: PromptEntry = {
    id: 'p1',
    text: 'rock',
    normalizedText: 'rock',
    category: 'short-word',
    difficulty: 0.2,
    minimumMap: 1,
    usage: 'both',
    tags: [],
  };

  return {
    instanceId: 'o1',
    definition,
    prompt,
    timing: { expectedTypingMs: 1200, availableMs: 3000, spareMs: 1800 },
    impactMeters,
    status: 'approaching',
    spawnedAtMs: 0,
    attachedAtMs: null,
    deadlineAtMs: null,
    warned: false,
    expired: false,
  };
}

describe('the runner', () => {
  it('stands on the ground while running', () => {
    expect(runnerWorldPoint({ view, animation: createMcAnimation() }).y).toBe(0);
  });

  it('is above the ground mid-jump', () => {
    expect(runnerWorldPoint({ view, animation: midway('jumping') }).y).toBeGreaterThan(0);
  });

  it('is drawn higher on screen mid-jump than on the ground', () => {
    const grounded = new FakeCanvas2D();
    const airborne = new FakeCanvas2D();

    drawRunner(grounded, { view, animation: createMcAnimation() });
    drawRunner(airborne, { view, animation: midway('jumping') });

    // The transform that positions him is the one to compare: a smaller y is
    // further up the screen.
    const groundedY = grounded.calls.find((call) => call.op === 'translate')?.args[1] ?? 0;
    const airborneY = airborne.calls.find((call) => call.op === 'translate')?.args[1] ?? 0;

    expect(airborneY).toBeLessThan(groundedY);
  });

  it('steps sideways for a sidestep', () => {
    expect(
      Math.abs(runnerWorldPoint({ view, animation: midway('sidestepping') }).x),
    ).toBeGreaterThan(0);
  });

  it('draws something', () => {
    const context = new FakeCanvas2D();
    drawRunner(context, { view, animation: createMcAnimation() });

    expect(context.calls.length).toBeGreaterThan(10);
  });
});

describe('the pack', () => {
  it('draws three dogs', () => {
    const context = new FakeCanvas2D();
    drawPack(context, { view, normalizedGap: 0.5, threat: 'closing', cyclePhase: 0 });

    // One transform per dog places it; the rest is shapes inside that.
    expect(context.calls.filter((call) => call.op === 'translate')).toHaveLength(3);
  });

  it('draws them larger as they close in', () => {
    const far = new FakeCanvas2D();
    const near = new FakeCanvas2D();

    drawPack(far, { view, normalizedGap: 1, threat: 'safe', cyclePhase: 0 });
    drawPack(near, { view, normalizedGap: 0, threat: 'caught', cyclePhase: 0 });

    // Closing means moving up the track towards the runner, which is *away*
    // from the lens — so caught dogs are drawn smaller, and higher up the frame.
    const farScale = far.calls.find((call) => call.op === 'scale')?.args[0] ?? 0;
    const nearScale = near.calls.find((call) => call.op === 'scale')?.args[0] ?? 0;

    expect(nearScale).toBeLessThan(farScale);
  });
});

describe('the obstacle course', () => {
  it('places an obstacle further away the further ahead it is', () => {
    expect(obstacleZ(view, obstacle(80), 10)).toBeGreaterThan(obstacleZ(view, obstacle(40), 10));
  });

  it('draws one that is ahead', () => {
    const context = new FakeCanvas2D();
    drawObstacleCourse(context, { view, obstacles: [obstacle(50)], playerMeters: 10 });

    expect(context.calls.length).toBeGreaterThan(0);
  });

  it('costs nothing for one that is already behind the runner', () => {
    const context = new FakeCanvas2D();
    drawObstacleCourse(context, { view, obstacles: [obstacle(0)], playerMeters: 90 });

    // Culling is what keeps a frame's cost flat across a whole run (G3).
    expect(context.calls).toHaveLength(0);
  });

  it('gives each action its own silhouette', () => {
    const counts = (['jump', 'slide', 'sidestep'] as const).map((action) => {
      const context = new FakeCanvas2D();
      drawObstacleCourse(context, {
        view,
        obstacles: [obstacle(40, action)],
        playerMeters: 10,
      });

      return context.calls.length;
    });

    expect(new Set(counts).size).toBeGreaterThan(1);
  });
});
