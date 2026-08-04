import { CENTRE_LANE, laneOffset, type LaneIndex } from '../models/lane';
import { jumpDurationMs, type MotionProfile } from '../models/motion';
import { clamp01, easeInOutCubic, parabolicArc } from './easing';

/**
 * Where the player is between lanes, and how far off the ground.
 *
 * State carries its own durations rather than a reference to the profile, so
 * advancing needs nothing but a delta. That is what makes pausing free: stop
 * calling `advanceMotion` and the move is frozen exactly where it was, with no
 * clock to drift and no start timestamp to rebase on resume.
 */

export interface LaneTransition {
  /**
   * Where the move started, as a continuous lane position.
   *
   * Not a `LaneIndex`, because a move can begin halfway across the road: a coin
   * swerve that gets interrupted by a car has to be redirected from wherever the
   * body actually is, not from the lane it left.
   */
  readonly fromPosition: number;
  readonly toLane: LaneIndex;
  readonly elapsedMs: number;
  readonly durationMs: number;
}

/** Which part of the jump the player is in. Only `airborne` clears anything. */
export const JUMP_PHASES = ['anticipation', 'airborne', 'landing'] as const;
export type JumpPhase = (typeof JUMP_PHASES)[number];

export interface JumpState {
  readonly elapsedMs: number;
  readonly anticipationMs: number;
  readonly airborneMs: number;
  readonly landingMs: number;
  readonly apexMeters: number;
}

export interface PlayerMotion {
  /** The lane the player is committed to. Only changes when a move completes. */
  readonly lane: LaneIndex;
  readonly transition: LaneTransition | null;
  readonly jump: JumpState | null;
}

export function createPlayerMotion(lane: LaneIndex = CENTRE_LANE): PlayerMotion {
  return { lane, transition: null, jump: null };
}

/** A move is in flight, so a new one must not be accepted (spec §11). */
export function isSettled(motion: PlayerMotion): boolean {
  return motion.transition === null && motion.jump === null;
}

/** Smallest move worth starting, in lanes. Below this the player is already there. */
const MINIMUM_MOVE = 1e-6;

export interface LaneChangeOptions {
  /**
   * Redirect a move already in flight instead of refusing.
   *
   * Reserved for hazards. A coin swerve is optional and interruptible; a car is
   * not, and a player who typed their way out of one must never be told "no,
   * you were busy collecting coins".
   */
  readonly preempt?: boolean;
}

export function beginLaneChange(
  motion: PlayerMotion,
  toLane: LaneIndex,
  profile: MotionProfile,
  options: LaneChangeOptions = {},
): PlayerMotion {
  // A jump cannot be steered out of, whoever is asking.
  if (motion.jump !== null) return motion;

  // Refuse rather than queue, unless this is a hazard preempting a coin.
  if (motion.transition !== null && options.preempt !== true) return motion;

  const fromPosition = lanePosition(motion);
  const distance = Math.abs(toLane - fromPosition);
  if (distance < MINIMUM_MOVE) return motion;

  return {
    ...motion,
    transition: {
      fromPosition,
      toLane,
      elapsedMs: 0,
      // Proportional to the ground actually left to cover, so a redirect from
      // halfway across takes half as long rather than starting over.
      durationMs: profile.laneChangeMs * distance,
    },
  };
}

export function beginJump(motion: PlayerMotion, profile: MotionProfile): PlayerMotion {
  if (motion.jump !== null) return motion;

  return {
    ...motion,
    jump: {
      elapsedMs: 0,
      anticipationMs: profile.jumpAnticipationMs,
      airborneMs: profile.jumpAirborneMs,
      landingMs: profile.jumpLandingMs,
      apexMeters: profile.jumpApexMeters,
    },
  };
}

/**
 * Advance both moves by `deltaMs`.
 *
 * A completed lane change commits its target lane; a completed jump simply
 * ends. Both clear themselves, so `isSettled` becomes true again and the next
 * hazard can be accepted.
 */
export function advanceMotion(motion: PlayerMotion, deltaMs: number): PlayerMotion {
  if (deltaMs <= 0 || !Number.isFinite(deltaMs)) return motion;
  if (isSettled(motion)) return motion;

  let lane = motion.lane;
  let transition = motion.transition;
  let jump = motion.jump;

  if (transition !== null) {
    const elapsedMs = transition.elapsedMs + deltaMs;
    if (elapsedMs >= transition.durationMs) {
      lane = transition.toLane;
      transition = null;
    } else {
      transition = { ...transition, elapsedMs };
    }
  }

  if (jump !== null) {
    const elapsedMs = jump.elapsedMs + deltaMs;
    jump = elapsedMs >= totalJumpMs(jump) ? null : { ...jump, elapsedMs };
  }

  return { lane, transition, jump };
}

function totalJumpMs(jump: JumpState): number {
  return jump.anticipationMs + jump.airborneMs + jump.landingMs;
}

/** How far through the current lane change, 0..1. 1 when there is none. */
export function transitionProgress(motion: PlayerMotion): number {
  const { transition } = motion;
  if (transition === null) return 1;
  if (transition.durationMs <= 0) return 1;
  return clamp01(transition.elapsedMs / transition.durationMs);
}

/**
 * Continuous lane position, 0..2, eased.
 *
 * The single source of truth for lateral placement. The rules compare it to a
 * hazard's blocked lanes; the scene multiplies it by lane width and draws it.
 * One curve, two consumers, no drift.
 */
export function lanePosition(motion: PlayerMotion): number {
  const { transition } = motion;
  if (transition === null) return motion.lane;

  const eased = easeInOutCubic(transitionProgress(motion));

  return transition.fromPosition + (transition.toLane - transition.fromPosition) * eased;
}

/**
 * The lane the player will be in when everything settles.
 *
 * Not the same as `motion.lane`, which is where they *were*. Hazard placement
 * asks this one: a car assigned around the lane a player is currently leaving
 * would be a car assigned around nothing.
 */
export function targetLane(motion: PlayerMotion): LaneIndex {
  return motion.transition?.toLane ?? motion.lane;
}

/** Lateral offset from the road centre, in lane widths. */
export function lateralOffset(motion: PlayerMotion): number {
  return laneOffset(lanePosition(motion));
}

export function jumpPhase(motion: PlayerMotion): JumpPhase | null {
  const { jump } = motion;
  if (jump === null) return null;

  if (jump.elapsedMs < jump.anticipationMs) return 'anticipation';
  if (jump.elapsedMs < jump.anticipationMs + jump.airborneMs) return 'airborne';
  return 'landing';
}

/** Height above the road in metres. Zero unless airborne. */
export function jumpHeightMeters(motion: PlayerMotion): number {
  const { jump } = motion;
  if (jump === null || jump.airborneMs <= 0) return 0;

  const airborneMs = jump.elapsedMs - jump.anticipationMs;
  if (airborneMs <= 0 || airborneMs >= jump.airborneMs) return 0;

  return jump.apexMeters * parabolicArc(airborneMs / jump.airborneMs);
}

/**
 * Crouch depth, 0..1 — deepest at the moment of take-off and again on landing.
 *
 * Purely cosmetic, but it belongs to the curve rather than to the scene so that
 * reduced motion and the rules see the same animation length.
 */
export function crouchDepth(motion: PlayerMotion): number {
  const { jump } = motion;
  if (jump === null) return 0;

  const phase = jumpPhase(motion);
  if (phase === 'anticipation' && jump.anticipationMs > 0) {
    return clamp01(jump.elapsedMs / jump.anticipationMs);
  }
  if (phase === 'landing' && jump.landingMs > 0) {
    const landedMs = jump.elapsedMs - jump.anticipationMs - jump.airborneMs;
    return 1 - clamp01(landedMs / jump.landingMs);
  }
  return 0;
}

/** Total animation length for a jump started from this profile. */
export function plannedJumpMs(profile: MotionProfile): number {
  return jumpDurationMs(profile);
}
