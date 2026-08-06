import { describe, expect, it } from 'vitest';

import type { MotionProfile } from '../models/motion';
import { LANE_SAFETY_FACTOR, laneChangeReserveMs } from './lane-reserve';

const PROFILE: MotionProfile = {
  laneWidthMeters: 3,
  laneChangeMs: 400,
  jumpAnticipationMs: 90,
  jumpAirborneMs: 620,
  jumpLandingMs: 110,
  jumpApexMeters: 1.6,
  clearanceMeters: 0.9,
};

describe('laneChangeReserveMs', () => {
  it('reserves one lane change, with a margin', () => {
    expect(laneChangeReserveMs(PROFILE)).toBeCloseTo(400 * LANE_SAFETY_FACTOR);
  });

  it('is more than the animation, so a step that straddles the plane still lands clear', () => {
    expect(laneChangeReserveMs(PROFILE)).toBeGreaterThan(PROFILE.laneChangeMs);
  });

  it('tracks the profile, so retuning the move moves the coins with it', () => {
    const slower = laneChangeReserveMs({ ...PROFILE, laneChangeMs: 800 });

    expect(slower).toBeCloseTo(laneChangeReserveMs(PROFILE) * 2);
  });
});
