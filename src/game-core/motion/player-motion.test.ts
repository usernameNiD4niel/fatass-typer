import { describe, expect, it } from 'vitest';

import { CENTRE_LANE } from '../models/lane';
import { jumpDurationMs, isMotionProfile, timeToClearanceMs } from '../models/motion';
import type { MotionProfile } from '../models/motion';
import {
  advanceMotion,
  beginJump,
  beginLaneChange,
  createPlayerMotion,
  crouchDepth,
  isSettled,
  jumpHeightMeters,
  jumpPhase,
  lanePosition,
  lateralOffset,
  transitionProgress,
} from './player-motion';
import type { PlayerMotion } from './player-motion';

const PROFILE: MotionProfile = {
  laneWidthMeters: 3.4,
  laneChangeMs: 520,
  jumpAnticipationMs: 90,
  jumpAirborneMs: 720,
  jumpLandingMs: 140,
  jumpApexMeters: 1.9,
  clearanceMeters: 0.95,
};

/** Advance in fixed steps, the way the run loop does. */
function run(motion: PlayerMotion, totalMs: number, stepMs = 16): PlayerMotion {
  let current = motion;
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(stepMs, remaining);
    current = advanceMotion(current, step);
    remaining -= step;
  }
  return current;
}

describe('motion profile', () => {
  it('rejects an arc that never reaches clearance height', () => {
    expect(isMotionProfile(PROFILE)).toBe(true);
    expect(isMotionProfile({ ...PROFILE, clearanceMeters: PROFILE.jumpApexMeters })).toBe(false);
    expect(isMotionProfile({ ...PROFILE, jumpApexMeters: 0 })).toBe(false);
    expect(isMotionProfile(null)).toBe(false);
  });

  it('derives clearance time from the arc rather than trusting an authored number', () => {
    const clearanceMs = timeToClearanceMs(PROFILE);

    expect(clearanceMs).toBeGreaterThan(PROFILE.jumpAnticipationMs);
    expect(clearanceMs).toBeLessThan(jumpDurationMs(PROFILE));

    // At exactly that moment the player is at clearance height, not below it.
    const airborne = beginJump(createPlayerMotion(), PROFILE);
    const atClearance = advanceMotion(airborne, clearanceMs);
    expect(jumpHeightMeters(atClearance)).toBeCloseTo(PROFILE.clearanceMeters, 6);
  });

  it('reaches clearance sooner when the apex is higher', () => {
    const higher = timeToClearanceMs({ ...PROFILE, jumpApexMeters: 3 });
    expect(higher).toBeLessThan(timeToClearanceMs(PROFILE));
  });
});

describe('lane changes', () => {
  it('starts settled in the centre lane', () => {
    const motion = createPlayerMotion();
    expect(motion.lane).toBe(CENTRE_LANE);
    expect(isSettled(motion)).toBe(true);
    expect(lanePosition(motion)).toBe(CENTRE_LANE);
    expect(lateralOffset(motion)).toBe(0);
  });

  it('eases across and commits the lane only on completion', () => {
    const moving = beginLaneChange(createPlayerMotion(), 2, PROFILE);

    expect(isSettled(moving)).toBe(false);
    // Committed lane does not change until the move lands — which is exactly
    // what the collision check depends on.
    expect(moving.lane).toBe(1);

    const midway = advanceMotion(moving, PROFILE.laneChangeMs / 2);
    expect(midway.lane).toBe(1);
    expect(lanePosition(midway)).toBeGreaterThan(1);
    expect(lanePosition(midway)).toBeLessThan(2);

    const landed = run(moving, PROFILE.laneChangeMs);
    expect(landed.lane).toBe(2);
    expect(isSettled(landed)).toBe(true);
    expect(lanePosition(landed)).toBe(2);
  });

  it('eases rather than moving linearly', () => {
    const moving = beginLaneChange(createPlayerMotion(), 2, PROFILE);
    const quarter = advanceMotion(moving, PROFILE.laneChangeMs * 0.25);
    // easeInOutCubic is slow at the start: a quarter of the time covers well
    // under a quarter of the distance.
    expect(lanePosition(quarter) - 1).toBeLessThan(0.25);
    expect(lanePosition(quarter)).toBeGreaterThan(1);
  });

  it('takes proportionally longer to cross two lanes', () => {
    const single = beginLaneChange(createPlayerMotion(0), 1, PROFILE);
    const double = beginLaneChange(createPlayerMotion(0), 2, PROFILE);

    expect(single.transition?.durationMs).toBe(PROFILE.laneChangeMs);
    expect(double.transition?.durationMs).toBe(PROFILE.laneChangeMs * 2);
  });

  it('refuses a second move while one is in flight', () => {
    const moving = beginLaneChange(createPlayerMotion(), 2, PROFILE);
    const ignored = beginLaneChange(moving, 0, PROFILE);
    expect(ignored).toBe(moving);

    const alsoIgnored = beginJump(moving, PROFILE);
    expect(alsoIgnored).toBe(moving);
  });

  it('ignores a move to the lane it is already in', () => {
    const motion = createPlayerMotion(1);
    expect(beginLaneChange(motion, 1, PROFILE)).toBe(motion);
  });

  it('reports transition progress and finishes at exactly 1', () => {
    const moving = beginLaneChange(createPlayerMotion(), 0, PROFILE);
    expect(transitionProgress(moving)).toBe(0);
    expect(transitionProgress(advanceMotion(moving, PROFILE.laneChangeMs / 2))).toBeCloseTo(0.5);
    expect(transitionProgress(run(moving, PROFILE.laneChangeMs))).toBe(1);
  });

  it('lands on the target lane even when a single frame overshoots the move', () => {
    const moving = beginLaneChange(createPlayerMotion(), 0, PROFILE);
    const stalled = advanceMotion(moving, 5_000);
    expect(stalled.lane).toBe(0);
    expect(isSettled(stalled)).toBe(true);
  });
});

describe('jumps', () => {
  it('runs anticipation, airborne, then landing', () => {
    const jumping = beginJump(createPlayerMotion(), PROFILE);
    expect(jumpPhase(jumping)).toBe('anticipation');
    expect(jumpHeightMeters(jumping)).toBe(0);

    const airborne = advanceMotion(jumping, PROFILE.jumpAnticipationMs + 10);
    expect(jumpPhase(airborne)).toBe('airborne');
    expect(jumpHeightMeters(airborne)).toBeGreaterThan(0);

    const landing = advanceMotion(
      jumping,
      PROFILE.jumpAnticipationMs + PROFILE.jumpAirborneMs + 10,
    );
    expect(jumpPhase(landing)).toBe('landing');
    expect(jumpHeightMeters(landing)).toBe(0);

    const done = run(jumping, jumpDurationMs(PROFILE));
    expect(done.jump).toBeNull();
    expect(isSettled(done)).toBe(true);
  });

  it('peaks at the apex halfway through the airborne phase', () => {
    const jumping = beginJump(createPlayerMotion(), PROFILE);
    const apex = advanceMotion(jumping, PROFILE.jumpAnticipationMs + PROFILE.jumpAirborneMs / 2);
    expect(jumpHeightMeters(apex)).toBeCloseTo(PROFILE.jumpApexMeters, 6);
  });

  it('stays above clearance for a real window, not an instant', () => {
    const jumping = beginJump(createPlayerMotion(), PROFILE);
    const clearanceMs = timeToClearanceMs(PROFILE);
    const airborneEndMs = PROFILE.jumpAnticipationMs + PROFILE.jumpAirborneMs;

    // Sample across the whole jump; every sample after clearance and before the
    // mirrored crossing must be above the bar.
    const above: number[] = [];
    for (let t = 0; t <= airborneEndMs; t += 5) {
      if (jumpHeightMeters(advanceMotion(jumping, t)) >= PROFILE.clearanceMeters) above.push(t);
    }

    expect(above.length).toBeGreaterThan(10);
    expect(above[0] ?? 0).toBeGreaterThanOrEqual(clearanceMs - 5);
  });

  it('does not change lane', () => {
    const jumping = run(beginJump(createPlayerMotion(2), PROFILE), jumpDurationMs(PROFILE));
    expect(jumping.lane).toBe(2);
  });

  it('crouches deepest at take-off and recovers on landing', () => {
    const jumping = beginJump(createPlayerMotion(), PROFILE);

    expect(crouchDepth(jumping)).toBe(0);
    expect(crouchDepth(advanceMotion(jumping, PROFILE.jumpAnticipationMs - 1))).toBeGreaterThan(
      0.9,
    );
    expect(crouchDepth(advanceMotion(jumping, PROFILE.jumpAnticipationMs + 100))).toBe(0);

    const justLanded = advanceMotion(
      jumping,
      PROFILE.jumpAnticipationMs + PROFILE.jumpAirborneMs + 1,
    );
    expect(crouchDepth(justLanded)).toBeGreaterThan(0.9);
  });
});

describe('advancing', () => {
  it('is a no-op when settled or given a nonsense delta', () => {
    const settled = createPlayerMotion();
    expect(advanceMotion(settled, 100)).toBe(settled);

    const moving = beginLaneChange(settled, 2, PROFILE);
    expect(advanceMotion(moving, 0)).toBe(moving);
    expect(advanceMotion(moving, -50)).toBe(moving);
    expect(advanceMotion(moving, Number.NaN)).toBe(moving);
  });

  it('reaches the same place whatever the step size', () => {
    const moving = beginLaneChange(createPlayerMotion(), 2, PROFILE);
    const target = PROFILE.laneChangeMs * 0.6;

    const coarse = run(moving, target, 100);
    const fine = run(moving, target, 4);

    expect(lanePosition(coarse)).toBeCloseTo(lanePosition(fine), 10);
  });

  it('freezes exactly where it was when nothing advances it', () => {
    const moving = run(beginLaneChange(createPlayerMotion(), 2, PROFILE), 200);
    const paused = lanePosition(moving);

    // A pause is simply not calling advanceMotion. Nothing to rebase, nothing
    // to drift.
    expect(lanePosition(moving)).toBe(paused);
    expect(lanePosition(advanceMotion(moving, 0))).toBe(paused);
  });
});
