import { describe, expect, it } from 'vitest';

import type { SpeedProfile } from '../models/map';
import { rampedSpeed } from './speed';

const PROFILE: SpeedProfile = { maxMetersPerSecond: 7.4, rampPerMinute: 1 };
const BASE = 6;

describe('speed ramp', () => {
  it('starts at the base speed of the map', () => {
    expect(rampedSpeed(BASE, PROFILE, 0)).toBe(BASE);
  });

  it('rises linearly with elapsed run time', () => {
    expect(rampedSpeed(BASE, PROFILE, 30_000)).toBeCloseTo(6.5);
    expect(rampedSpeed(BASE, PROFILE, 60_000)).toBeCloseTo(7);
  });

  it('never exceeds the ceiling', () => {
    expect(rampedSpeed(BASE, PROFILE, 10 * 60_000)).toBe(PROFILE.maxMetersPerSecond);
  });

  it('never drops below the base speed', () => {
    expect(rampedSpeed(BASE, PROFILE, -5_000)).toBe(BASE);
    expect(rampedSpeed(BASE, { ...PROFILE, rampPerMinute: 0 }, 120_000)).toBe(BASE);
  });

  it('is monotonic', () => {
    let previous = 0;
    for (let ms = 0; ms <= 5 * 60_000; ms += 10_000) {
      const speed = rampedSpeed(BASE, PROFILE, ms);
      expect(speed).toBeGreaterThanOrEqual(previous);
      previous = speed;
    }
  });
});
