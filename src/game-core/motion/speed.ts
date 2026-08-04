import type { SpeedProfile } from '../models/map';

/**
 * How fast the road goes past, `elapsedMs` into a run (spec §9).
 *
 * A linear ramp with a ceiling. Speed rising means the same word has less road
 * to be typed in, so this is a real difficulty dial — but hazard placement is
 * derived from *base* speed, never from the ramped value, so a run that has
 * been going a while gets tenser without ever producing a prompt that could not
 * have been typed in time.
 */
export function rampedSpeed(
  baseMetersPerSecond: number,
  profile: SpeedProfile,
  elapsedMs: number,
): number {
  const minutes = Math.max(0, elapsedMs) / 60_000;
  const ramped = baseMetersPerSecond + profile.rampPerMinute * minutes;
  return Math.min(profile.maxMetersPerSecond, Math.max(baseMetersPerSecond, ramped));
}
