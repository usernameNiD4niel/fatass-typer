import { describe, expect, it } from 'vitest';

import { LANE_COUNT } from '../models/lane';
import { jumpDurationMs, timeToClearanceMs } from '../models/motion';
import type { MotionProfile } from '../models/motion';
import {
  advanceMotion,
  beginJump,
  beginLaneChange,
  createPlayerMotion,
  isSettled,
  jumpHeightMeters,
} from '../motion';
import { bareReserveMs, MOTION_SAFETY_FACTOR, motionReserveMs } from './motion-reserve';

const PROFILE: MotionProfile = {
  laneWidthMeters: 3.4,
  laneChangeMs: 480,
  jumpAnticipationMs: 90,
  jumpAirborneMs: 700,
  jumpLandingMs: 150,
  jumpApexMeters: 1.9,
  clearanceMeters: 0.95,
};

describe('motion reserve', () => {
  it('reserves for the widest lane change the road allows, not the average one', () => {
    // A car at the edge with the neighbouring lane also blocked sends the player
    // two lanes over. Reserving for one would land that move late.
    expect(bareReserveMs('lane-change', PROFILE)).toBe(PROFILE.laneChangeMs * (LANE_COUNT - 1));
  });

  it('reserves only as far as clearance height for a jump, not the whole arc', () => {
    const reserve = bareReserveMs('jump', PROFILE);

    expect(reserve).toBe(timeToClearanceMs(PROFILE));
    // The rest of the arc happens over the obstacle — that is the point of it.
    expect(reserve).toBeLessThan(jumpDurationMs(PROFILE));
  });

  it('adds a margin, because a 60Hz step never lands on the exact millisecond', () => {
    for (const action of ['jump', 'lane-change'] as const) {
      expect(motionReserveMs(action, PROFILE)).toBeCloseTo(
        bareReserveMs(action, PROFILE) * MOTION_SAFETY_FACTOR,
        6,
      );
      // A whole simulation step of slack, at the very least.
      expect(motionReserveMs(action, PROFILE) - bareReserveMs(action, PROFILE)).toBeGreaterThan(
        1000 / 60,
      );
    }
  });

  it('is enough for the lane change to actually finish', () => {
    // The promise the reserve makes, checked against the curve that has to keep
    // it: after `reserve` milliseconds the widest move has landed.
    let motion = beginLaneChange(createPlayerMotion(0), 2, PROFILE);
    motion = advanceMotion(motion, motionReserveMs('lane-change', PROFILE));

    expect(isSettled(motion)).toBe(true);
    expect(motion.lane).toBe(2);
  });

  it('is enough for the jump to be above clearance', () => {
    let motion = beginJump(createPlayerMotion(), PROFILE);
    motion = advanceMotion(motion, motionReserveMs('jump', PROFILE));

    expect(jumpHeightMeters(motion)).toBeGreaterThan(PROFILE.clearanceMeters);
  });

  it('grows when the animation is made slower', () => {
    const slower: MotionProfile = { ...PROFILE, laneChangeMs: PROFILE.laneChangeMs * 2 };

    expect(motionReserveMs('lane-change', slower)).toBeGreaterThan(
      motionReserveMs('lane-change', PROFILE),
    );
  });

  it('shrinks when the jump is made snappier', () => {
    const snappier: MotionProfile = { ...PROFILE, jumpAirborneMs: PROFILE.jumpAirborneMs / 2 };

    expect(motionReserveMs('jump', snappier)).toBeLessThan(motionReserveMs('jump', PROFILE));
  });
});
