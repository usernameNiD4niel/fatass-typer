/**
 * Easing curves.
 *
 * These live in `game-core` rather than in the scene because the rules need the
 * same numbers the animation shows. "Had the lateral move finished when the car
 * arrived?" is a question about the curve, and it is the question the whole car
 * encounter turns on — so the curve cannot be a rendering detail.
 */

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Symmetric ease. Slow to leave a lane, slow to settle into the next. */
export function easeInOutCubic(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Ease toward a target and stay there. Used for landing compression. */
export function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 3);
}

/**
 * A parabolic arc peaking at 1.0 halfway through, zero at both ends.
 *
 * `timeToClearanceMs` in `models/motion.ts` inverts exactly this curve, so the
 * two must stay in step.
 */
export function parabolicArc(t: number): number {
  const u = clamp01(t);
  return 4 * u * (1 - u);
}

/** Linear interpolation. */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * clamp01(t);
}
