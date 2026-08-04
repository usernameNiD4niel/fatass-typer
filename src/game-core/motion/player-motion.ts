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
  readonly fromLane: LaneIndex;
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

export function beginLaneChange(
  motion: PlayerMotion,
  toLane: LaneIndex,
  profile: MotionProfile,
): PlayerMotion {
  // Refuse rather than queue. An unresolved lane change means the previous
  // hazard is still being avoided, and stacking moves is how a player ends up
  // somewhere neither the rules nor the animation expected.
  if (!isSettled(motion) || toLane === motion.lane) return motion;

  return {
    ...motion,
    transition: {
      fromLane: motion.lane,
      toLane,
      elapsedMs: 0,
      // Crossing two lanes takes twice as long — the player covers twice the
      // ground. The reserve in `motionReserveMs` allows for the widest move.
      durationMs: profile.laneChangeMs * Math.abs(toLane - motion.lane),
    },
  };
}

export function beginJump(motion: PlayerMotion, profile: MotionProfile): PlayerMotion {
  if (!isSettled(motion)) return motion;

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
  return transition.fromLane + (transition.toLane - transition.fromLane) * eased;
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
