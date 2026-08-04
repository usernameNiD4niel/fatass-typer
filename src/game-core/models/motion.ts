import { isCount, isPositiveNumber, isRecord } from './guards';

/**
 * How long the player's avoidance moves take, and how far they travel.
 *
 * This profile is the contract between three parties that must never disagree:
 * the timing budget (which pushes a hazard far enough away that the move has
 * road to run in), the rules (which decide whether the move had finished when
 * the collision plane arrived), and the scene (which animates it). All three
 * read these same numbers, so a retune moves them together or not at all.
 *
 * Everything here is authored except the two derived quantities at the bottom.
 * `timeToClearanceMs` in particular is derived rather than authored precisely
 * because an authored "takeoff time" could drift out of step with the arc it is
 * supposed to describe.
 */

export interface MotionProfile {
  /** Lateral distance between lane centres, in metres. */
  readonly laneWidthMeters: number;
  /** Time to ease from one lane centre to the next. */
  readonly laneChangeMs: number;
  /** Crouch before the feet leave the ground. Grounded — no clearance yet. */
  readonly jumpAnticipationMs: number;
  /** Time in the air, take-off to touchdown. */
  readonly jumpAirborneMs: number;
  /** Landing compression before the run cycle resumes. Grounded. */
  readonly jumpLandingMs: number;
  /** Peak height of the arc, in metres. */
  readonly jumpApexMeters: number;
  /** Height the player must exceed at the obstacle to clear it, in metres. */
  readonly clearanceMeters: number;
}

export function isMotionProfile(value: unknown): value is MotionProfile {
  if (!isRecord(value)) return false;

  if (!isPositiveNumber(value['laneWidthMeters'])) return false;
  if (!isPositiveNumber(value['laneChangeMs'])) return false;
  if (!isCount(value['jumpAnticipationMs'])) return false;
  if (!isPositiveNumber(value['jumpAirborneMs'])) return false;
  if (!isCount(value['jumpLandingMs'])) return false;
  if (!isPositiveNumber(value['jumpApexMeters'])) return false;
  if (!isPositiveNumber(value['clearanceMeters'])) return false;

  // An arc that never reaches clearance height is an obstacle that cannot be
  // jumped. Catch it here rather than in a playtest.
  return value['clearanceMeters'] < value['jumpApexMeters'];
}

/** Whole jump animation, crouch through landing recovery. */
export function jumpDurationMs(profile: MotionProfile): number {
  return profile.jumpAnticipationMs + profile.jumpAirborneMs + profile.jumpLandingMs;
}

/**
 * Milliseconds from the start of the jump until the player is above clearance
 * height — the reserve a hazard's placement must allow for.
 *
 * The airborne arc is `apex * 4u(1 - u)` over normalised time `u`, so clearance
 * is first crossed at `u = (1 - sqrt(1 - clearance / apex)) / 2`. Solving it
 * rather than authoring it is what keeps the deadline and the animation honest.
 */
export function timeToClearanceMs(profile: MotionProfile): number {
  const ratio = profile.clearanceMeters / profile.jumpApexMeters;
  // `isMotionProfile` rejects ratio >= 1; clamp anyway so a hand-built profile
  // in a test produces a finite number rather than NaN.
  const clamped = Math.min(1, Math.max(0, ratio));
  const crossing = (1 - Math.sqrt(1 - clamped)) / 2;
  return profile.jumpAnticipationMs + profile.jumpAirborneMs * crossing;
}
