import { describe, expect, it } from 'vitest';

import { createChaseState, type ChaseState, type ChaseThreat } from '../../game-core/chase';
import type { ChaseProfile } from '../../game-core/models/map';
import { FakeCanvas2D } from '../../test/fake-canvas';
import { createCamera, followPlayer, worldToScreenX } from '../render/camera';
import { createDogPack, dogPackView } from './dog-pack';
import { DOG_COLORS, dogHeightPx, drawDog, drawDogPack } from './dog-renderer';

const PROFILE: ChaseProfile = {
  startingDistanceMeters: 40,
  baseCatchUpMetersPerSecond: 0.4,
  collisionPenaltyMeters: 8,
  missedPromptPenaltyMeters: 4,
  streakRecoveryMeters: 2,
  streakThreshold: 3,
  dangerThresholdMeters: 12,
};

const camera = followPlayer(
  createCamera({ widthPx: 1000, heightPx: 600 }, 800, { pixelsPerMeter: 20, anchorRatio: 0.35 }),
  200,
);

function chaseAt(distanceMeters: number): ChaseState {
  return { ...createChaseState(PROFILE), distanceMeters, caught: distanceMeters <= 0 };
}

function pack(distanceMeters: number) {
  return dogPackView({
    state: createDogPack(),
    chase: chaseAt(distanceMeters),
    profile: PROFILE,
    playerMeters: 200,
  });
}

function drawPack(distanceMeters: number): FakeCanvas2D {
  const context = new FakeCanvas2D();
  drawDogPack(context, { camera, groundYPx: 432, pack: pack(distanceMeters) });

  return context;
}

function drawOne(threat: ChaseThreat): FakeCanvas2D {
  const context = new FakeCanvas2D();
  const view = pack(threat === 'safe' ? 40 : threat === 'closing' ? 10 : 3);
  const dog = view.dogs[0];
  if (!dog) throw new Error('no dog');

  drawDog(context, { xPx: 300, groundYPx: 432, heightPx: 60, dog, threat });

  return context;
}

describe('dogHeightPx', () => {
  it('scales with the camera and stays smaller than the MC', () => {
    expect(dogHeightPx(camera)).toBeCloseTo(0.85 * 20);
  });
});

describe('drawDog', () => {
  it('restores the context', () => {
    const context = drawOne('safe');

    expect(context.callsOf('save')).toHaveLength(context.callsOf('restore').length);
    expect(context.globalAlpha).toBe(1);
  });

  it('stands on the ground line', () => {
    const shadow = drawOne('safe').calls.find(
      (call) => call.op === 'ellipse' && call.fillStyle === DOG_COLORS.shadow,
    );
    const shadowTranslate = drawOne('safe').callsOf('translate')[0];

    expect(shadow?.args[1]).toBe(0);
    expect(shadowTranslate?.args[1]).toBe(432);
  });

  it('changes body colour as the threat escalates', () => {
    const bodyColors = (threat: ChaseThreat) =>
      new Set(drawOne(threat).calls.map((call) => call.fillStyle));

    expect(bodyColors('safe').has(DOG_COLORS.bodySafe)).toBe(true);
    expect(bodyColors('closing').has(DOG_COLORS.bodyClosing)).toBe(true);
    expect(bodyColors('critical').has(DOG_COLORS.bodyCritical)).toBe(true);
  });

  it('kicks up dust only once the dogs are closing', () => {
    const dust = (threat: ChaseThreat) =>
      drawOne(threat).calls.filter((call) => call.fillStyle === DOG_COLORS.dust);

    expect(dust('safe')).toHaveLength(0);
    expect(dust('closing').length).toBeGreaterThan(0);
    expect(dust('critical').length).toBeGreaterThan(dust('closing').length);
  });

  it('bares teeth only at critical range', () => {
    const teeth = (threat: ChaseThreat) =>
      drawOne(threat).calls.filter((call) => call.fillStyle === DOG_COLORS.tooth);

    expect(teeth('safe')).toHaveLength(0);
    expect(teeth('closing')).toHaveLength(0);
    expect(teeth('critical').length).toBeGreaterThan(0);
  });

  it('lights the eyes at critical range, so danger is not colour-only', () => {
    const lit = (threat: ChaseThreat) =>
      drawOne(threat).calls.some((call) => call.fillStyle === DOG_COLORS.eyeCritical);

    expect(lit('safe')).toBe(false);
    expect(lit('critical')).toBe(true);
    // Posture and dust carry the same message for a colour-blind player.
    expect(drawOne('critical').callsOf('scale').length).toBeGreaterThan(1);
  });

  it('treats a catch with the same urgency as critical', () => {
    expect(drawOne('caught').calls.some((call) => call.fillStyle === DOG_COLORS.tooth)).toBe(true);
  });

  it('is deterministic', () => {
    expect(drawOne('closing').calls).toEqual(drawOne('closing').calls);
  });
});

describe('drawDogPack', () => {
  it('draws all three dogs', () => {
    const shadows = drawPack(20).calls.filter(
      (call) => call.op === 'ellipse' && call.fillStyle === DOG_COLORS.shadow,
    );

    expect(shadows).toHaveLength(3);
  });

  it('draws the lead dog last so it sits on top', () => {
    const context = drawPack(20);
    const packView = pack(20);
    const translates = context.callsOf('translate').map((call) => call.args[0] ?? 0);
    const lead = worldToScreenX(camera, packView.dogs[0]?.worldMeters ?? 0);

    expect(translates.at(-2)).toBeCloseTo(lead);
  });

  it('places dogs through the camera, so scrolling moves them', () => {
    const context = drawPack(20);
    const expected = worldToScreenX(camera, pack(20).dogs[2]?.worldMeters ?? 0);

    expect(context.callsOf('translate')[0]?.args[0]).toBeCloseTo(expected);
  });

  it('draws them nearer the MC when the gap is small', () => {
    const far = drawPack(38).callsOf('translate')[0]?.args[0] ?? 0;
    const near = drawPack(3).callsOf('translate')[0]?.args[0] ?? 0;

    expect(near).toBeGreaterThan(far);
  });
});
