/**
 * The run cycle, as arithmetic.
 *
 * Pure, and separated from the meshes it drives, because a gait is the one part
 * of a character that is either right or unmistakably wrong and there is no way
 * to tell by reading the component. Here it can be asserted: knees that only
 * bend one way, arms opposite the leg on the same side, a cycle that actually
 * repeats.
 *
 * ## Why it writes into a shared object
 *
 * `pose()` fills a module-level `POSE` rather than returning a fresh one. This
 * runs every frame for the life of a run — returning an object literal would be
 * sixty allocations a second in the hottest path in the program, which is the
 * one thing `game-scene/README.md` asks this layer not to do.
 *
 * The trade is that the result is only valid until the next call. Nothing keeps
 * it; the component reads the fields straight onto three.js objects.
 */

export interface RunnerPose {
  /** Hip rotation, radians. Positive swings the leg forward. */
  leftHip: number;
  rightHip: number;
  /** Knee flexion, radians. Never negative — a knee does not bend forwards. */
  leftKnee: number;
  rightKnee: number;
  /** Ankle, counter-rotating so the foot stays roughly flat through the stride. */
  leftAnkle: number;
  rightAnkle: number;
  /** Shoulder rotation, contralateral to the hip on the same side. */
  leftShoulder: number;
  rightShoulder: number;
  /** Elbow flexion. A runner holds their arms bent; it deepens on the drive. */
  leftElbow: number;
  rightElbow: number;
  /** Torso twist about the vertical, opposing the arms. */
  torsoTwist: number;
  /** Forward lean, radians. Grows with speed. */
  lean: number;
  /** Vertical bob, metres. Two per stride — one per footfall. */
  bob: number;
}

const POSE: RunnerPose = {
  leftHip: 0,
  rightHip: 0,
  leftKnee: 0,
  rightKnee: 0,
  leftAnkle: 0,
  rightAnkle: 0,
  leftShoulder: 0,
  rightShoulder: 0,
  leftElbow: 0,
  rightElbow: 0,
  torsoTwist: 0,
  lean: 0,
  bob: 0,
};

/** How far the hips swing, radians. */
const HIP_SWING = 0.72;
/** How far the knee folds at its deepest, radians. */
const KNEE_FOLD = 1.15;
const ANKLE_RANGE = 0.35;
const SHOULDER_SWING = 0.55;
const ELBOW_BASE = 0.75;
const ELBOW_RANGE = 0.35;
const TORSO_TWIST = 0.16;
const BOB_METRES = 0.035;

/** Lean at the map's top speed, radians. Small: this is a jog, not a sprint. */
const MAX_LEAN = 0.16;
const LEAN_REFERENCE_SPEED = 12;

/** How much of the amplitude survives when motion is reduced (spec §12). */
const REDUCED_SCALE = 0.35;

/** The airborne pose: legs tucked, arms out. Held rather than cycled. */
function airbornePose(target: RunnerPose, scale: number): RunnerPose {
  target.leftHip = 0.5 * scale;
  target.rightHip = -0.25 * scale;
  target.leftKnee = 0.9 * scale;
  target.rightKnee = 0.35 * scale;
  target.leftAnkle = 0;
  target.rightAnkle = 0;
  target.leftShoulder = -0.4 * scale;
  target.rightShoulder = 0.3 * scale;
  target.leftElbow = ELBOW_BASE;
  target.rightElbow = ELBOW_BASE;
  target.torsoTwist = 0;
  target.lean = 0.1 * scale;
  target.bob = 0;

  return target;
}

export interface GaitInput {
  /** Stride phase, in cycles. Advanced by distance, not by wall time. */
  readonly phase: number;
  /** Metres per second. Drives the lean only; the phase carries the timing. */
  readonly speedMetersPerSecond: number;
  /** Off the ground: jumping, or flying. The cycle stops and a pose is held. */
  readonly airborne: boolean;
  readonly reducedMotion: boolean;
}

/**
 * The pose for a moment in the cycle.
 *
 * Returns the shared object. Read it now; it is overwritten on the next call.
 */
export function pose(input: GaitInput): RunnerPose {
  const scale = input.reducedMotion ? REDUCED_SCALE : 1;

  if (input.airborne) return airbornePose(POSE, scale);

  const angle = input.phase * Math.PI * 2;
  const swing = Math.sin(angle);
  const opposite = Math.sin(angle + Math.PI);

  POSE.leftHip = swing * HIP_SWING * scale;
  POSE.rightHip = opposite * HIP_SWING * scale;

  /*
   * The knee folds on the *recovery* half of the stride and straightens on the
   * drive, and it only ever folds one way.
   *
   * `max(0, …)` is the whole reason this is a function rather than a sine: a
   * signed knee angle produces a leg that bends backwards for half of every
   * stride, which is the single most obvious way a walk cycle can look wrong.
   */
  POSE.leftKnee = Math.max(0, Math.sin(angle - Math.PI / 2)) * KNEE_FOLD * scale;
  POSE.rightKnee = Math.max(0, Math.sin(angle + Math.PI / 2)) * KNEE_FOLD * scale;

  // The ankle undoes part of the knee, so the foot lands flat rather than toe-first.
  POSE.leftAnkle = -POSE.leftKnee * ANKLE_RANGE;
  POSE.rightAnkle = -POSE.rightKnee * ANKLE_RANGE;

  // Contralateral: the left arm goes forward with the right leg. Getting this
  // backwards produces a figure that looks subtly drunk.
  POSE.leftShoulder = opposite * SHOULDER_SWING * scale;
  POSE.rightShoulder = swing * SHOULDER_SWING * scale;

  POSE.leftElbow = ELBOW_BASE + Math.max(0, opposite) * ELBOW_RANGE;
  POSE.rightElbow = ELBOW_BASE + Math.max(0, swing) * ELBOW_RANGE;

  POSE.torsoTwist = -swing * TORSO_TWIST * scale;

  const speedShare = Math.min(1, Math.max(0, input.speedMetersPerSecond / LEAN_REFERENCE_SPEED));
  POSE.lean = speedShare * MAX_LEAN * scale;

  // Twice per cycle: the body rises once per footfall, not once per stride.
  POSE.bob = input.reducedMotion ? 0 : Math.abs(Math.sin(angle)) * BOB_METRES;

  return POSE;
}
