/**
 * Fixed-timestep accumulator (spec §16).
 *
 * The simulation advances in constant slices so the rules stay deterministic and
 * frame-rate independent: the same seed and the same inputs must produce the same
 * run on a 60Hz laptop and on a 144Hz monitor. Rendering still happens once per
 * animation frame and interpolates with `alpha`.
 *
 * This module is pure arithmetic — no clock, no scheduler, no state. `GameLoop`
 * owns those. Keeping the maths separate is what makes the awkward cases
 * (a backgrounded tab, a GC pause, a debugger breakpoint) testable without
 * faking time.
 */

export interface FixedTimestepConfig {
  /** Length of one simulation step, in milliseconds. */
  readonly fixedDeltaMs: number;
  /**
   * Longest frame the loop will believe. A tab restored after a minute reports a
   * 60,000ms frame; simulating it would either freeze for a second or teleport
   * the MC into the dogs. Time beyond this is dropped, not banked.
   */
  readonly maxFrameMs: number;
  /**
   * Ceiling on steps per frame. Guards the spiral of death: if an update takes
   * longer than a step, the accumulator grows faster than it drains and each
   * frame asks for more work than the last. Dropping the surplus keeps the loop
   * responsive at a slower simulation rate instead of locking the page.
   */
  readonly maxStepsPerFrame: number;
}

/** 60Hz simulation. Divides evenly into the common refresh rates we care about. */
export const DEFAULT_FIXED_DELTA_MS = 1000 / 60;

export const DEFAULT_FIXED_TIMESTEP_CONFIG: FixedTimestepConfig = {
  fixedDeltaMs: DEFAULT_FIXED_DELTA_MS,
  maxFrameMs: 250,
  maxStepsPerFrame: 5,
};

export interface AccumulatorResult {
  /** How many fixed steps to run for this frame. */
  readonly steps: number;
  /** Leftover time carried into the next frame, in milliseconds. */
  readonly accumulatorMs: number;
  /**
   * Position between the last completed step and the next one, 0..1.
   * The renderer uses it to interpolate so motion looks smooth at any refresh
   * rate. Always < 1 — a full step's worth of time would have been consumed.
   */
  readonly alpha: number;
  /** Simulation time thrown away by the clamps, in milliseconds. */
  readonly droppedMs: number;
}

/**
 * Folds a frame's elapsed time into the accumulator and reports how many fixed
 * steps that buys.
 *
 * Both clamps report what they discarded through `droppedMs` rather than
 * swallowing it: the loop needs to know that wall-clock time and simulation time
 * have diverged, and hiding it would make a stuttering machine look healthy.
 */
export function drainAccumulator(
  accumulatorMs: number,
  frameMs: number,
  config: FixedTimestepConfig,
): AccumulatorResult {
  const elapsed = Math.max(0, frameMs);
  const clampedFrame = Math.min(elapsed, config.maxFrameMs);
  const frameDroppedMs = elapsed - clampedFrame;

  let pending = Math.max(0, accumulatorMs) + clampedFrame;

  const affordable = Math.floor(pending / config.fixedDeltaMs);
  const steps = Math.min(affordable, config.maxStepsPerFrame);

  pending -= steps * config.fixedDeltaMs;

  // Everything the step ceiling could not cover is surplus, not backlog.
  const surplusMs = steps < affordable ? pending - (pending % config.fixedDeltaMs) : 0;
  const accumulator = pending - surplusMs;

  return {
    steps,
    accumulatorMs: accumulator,
    alpha: accumulator / config.fixedDeltaMs,
    droppedMs: frameDroppedMs + surplusMs,
  };
}
