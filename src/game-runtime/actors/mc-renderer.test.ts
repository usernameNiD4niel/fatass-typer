import { describe, expect, it } from 'vitest';

import { FakeCanvas2D } from '../../test/fake-canvas';
import { createCamera } from '../render/camera';
import {
  advanceMcAnimation,
  createMcAnimation,
  MC_ANIMATION_STATES,
  type McAnimation,
  type McAnimationState,
  play,
  setLocomotion,
} from './mc-animation';
import { drawMc, MC_COLORS, MC_HEIGHT_METERS, mcHeightPx } from './mc-renderer';

function draw(animation: McAnimation): FakeCanvas2D {
  const context = new FakeCanvas2D();
  drawMc(context, { xPx: 350, groundYPx: 432, heightPx: 100, animation });

  return context;
}

function inState(state: McAnimationState): McAnimation {
  return play(setLocomotion(createMcAnimation(), 'running'), state);
}

describe('mcHeightPx', () => {
  it('scales the MC with the camera zoom', () => {
    const camera = createCamera({ widthPx: 1000, heightPx: 600 }, 500, {
      pixelsPerMeter: 40,
      anchorRatio: 0.3,
    });

    expect(mcHeightPx(camera)).toBe(MC_HEIGHT_METERS * 40);
  });
});

describe('drawMc', () => {
  it('restores the context it was handed', () => {
    const context = draw(createMcAnimation());

    expect(context.callsOf('save')).toHaveLength(context.callsOf('restore').length);
    expect(context.globalAlpha).toBe(1);
  });

  it('anchors the body at the feet and scales by the requested height', () => {
    const context = draw(createMcAnimation());
    const translate = context.callsOf('translate')[0];
    const scale = context.callsOf('scale')[0];

    expect(translate?.args[0]).toBe(350);
    expect(translate?.args[1]).toBe(432);
    expect(scale?.args).toEqual([100, 100]);
  });

  it('draws a ground shadow at the ground line, not under the raised body', () => {
    const jumping = advanceMcAnimation(inState('jumping'), {
      deltaMs: 350,
      speedMetersPerSecond: 6,
    });

    const grounded = draw(createMcAnimation());
    const airborne = draw(jumping);

    const shadowOf = (context: FakeCanvas2D) =>
      context.calls.find((call) => call.op === 'ellipse' && call.fillStyle === MC_COLORS.shadow);

    // Same y, smaller radius: the shadow shrinks instead of following him up.
    expect(shadowOf(airborne)?.args[1]).toBe(shadowOf(grounded)?.args[1]);
    expect(shadowOf(airborne)?.args[2]).toBeLessThan(shadowOf(grounded)?.args[2] ?? 0);
  });

  it('lifts the body while jumping', () => {
    const jumping = advanceMcAnimation(inState('jumping'), {
      deltaMs: 350,
      speedMetersPerSecond: 6,
    });

    const bodyY = (animation: McAnimation) => draw(animation).callsOf('translate')[1]?.args[1] ?? 0;

    expect(bodyY(jumping)).toBeLessThan(bodyY(createMcAnimation()));
  });

  it('draws something for every animation state', () => {
    for (const state of MC_ANIMATION_STATES) {
      const context = draw(inState(state));

      expect(context.callsOf('ellipse').length).toBeGreaterThan(5);
      expect(context.callsOf('stroke').length).toBeGreaterThan(0);
    }
  });

  it('gives each state a distinguishable pose', () => {
    const signature = (state: McAnimationState) => JSON.stringify(draw(inState(state)).calls);
    const signatures = MC_ANIMATION_STATES.map(signature);

    expect(new Set(signatures).size).toBe(MC_ANIMATION_STATES.length);
  });

  it('leans further forward when boosting than when running', () => {
    const lean = (state: McAnimationState) =>
      draw(inState(state)).callsOf('rotate')[0]?.args[0] ?? 0;

    expect(lean('boosting')).toBeGreaterThan(lean('running'));
    // Hit knocks him backwards.
    expect(lean('hit')).toBeLessThan(0);
  });

  it('squashes the body during a slide', () => {
    const sliding = advanceMcAnimation(inState('sliding'), {
      deltaMs: 300,
      speedMetersPerSecond: 6,
    });

    // scale calls in order: shadow, body units, then the crouch squash.
    const bodyScaleY = (animation: McAnimation) =>
      draw(animation).callsOf('scale')[2]?.args[1] ?? 1;

    expect(bodyScaleY(sliding)).toBeLessThan(1);
    expect(bodyScaleY(inState('running'))).toBe(1);
  });

  it('draws speed lines only while boosting', () => {
    const speedLines = (state: McAnimationState) =>
      draw(inState(state)).calls.filter(
        (call) => call.op === 'stroke' && call.strokeStyle === MC_COLORS.speedLine,
      );

    expect(speedLines('boosting').length).toBeGreaterThan(0);
    expect(speedLines('running')).toHaveLength(0);
  });

  it('kicks up dust only while sliding', () => {
    const dust = (state: McAnimationState) =>
      draw(inState(state)).calls.filter((call) => call.fillStyle === MC_COLORS.dust);

    expect(dust('sliding').length).toBeGreaterThan(0);
    expect(dust('jumping')).toHaveLength(0);
  });

  it('animates the legs across the run cycle', () => {
    const early = setLocomotion(createMcAnimation(), 'running');
    const later = advanceMcAnimation(early, { deltaMs: 300, speedMetersPerSecond: 6 });

    expect(JSON.stringify(draw(later).calls)).not.toBe(JSON.stringify(draw(early).calls));
  });

  it('is deterministic for the same animation', () => {
    const animation = advanceMcAnimation(inState('running'), {
      deltaMs: 123,
      speedMetersPerSecond: 7,
    });

    expect(draw(animation).calls).toEqual(draw(animation).calls);
  });
});
