import type { MotionProfile } from '../game-core/models';

/**
 * The road, and how the player moves on it.
 *
 * These are the numbers three separate systems have to agree on: the timing
 * budget that decides how far away a hazard spawns, the rules that decide
 * whether a move finished in time, and the scene that animates it. They live
 * here as data so that agreement is structural rather than remembered.
 *
 * Deliberately shared across all six maps. A lane is the same width on Map 6 as
 * on Map 1 and a jump takes the same time, because the road is the road —
 * difficulty comes from how fast it goes past and how much the prompts ask for,
 * not from secretly making the player's own body slower.
 */
export const DEFAULT_MOTION: MotionProfile = {
  /** Wide enough to read as three distinct routes at the camera's distance. */
  laneWidthMeters: 3.4,
  /**
   * Long enough to read as a deliberate, eased move rather than a snap, short
   * enough that the reserve it demands does not push cars out to the horizon.
   */
  laneChangeMs: 480,
  /** A visible crouch. Below ~70ms it reads as a hitch rather than intent. */
  jumpAnticipationMs: 90,
  jumpAirborneMs: 700,
  /** Landing compression. Cosmetic, but it is part of the animation's length. */
  jumpLandingMs: 150,
  jumpApexMeters: 1.9,
  /**
   * Clearance sits at half the apex, so the player is above the bar for roughly
   * the middle 70% of the airborne phase rather than for one exact instant. That
   * window is the difference between a jump that feels fair and one that
   * demands frame-perfect timing.
   */
  clearanceMeters: 0.95,
};
