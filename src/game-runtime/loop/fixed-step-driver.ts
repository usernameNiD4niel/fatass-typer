import {
  DEFAULT_FIXED_TIMESTEP_CONFIG,
  drainAccumulator,
  type FixedTimestepConfig,
} from './fixed-timestep';

/**
 * Turns frame deltas into fixed simulation steps.
 *
 * Deliberately *not* a loop. It owns no `requestAnimationFrame`, no scheduler,
 * and no clock — something else decides when a frame happened and tells it how
 * long that frame was.
 *
 * That something is now React Three Fiber's `useFrame`, which already runs a
 * render loop. Two rAF chains driving one game means the simulation and the
 * scene are always half a frame out of step with each other, and the
 * interpolation alpha becomes a polite fiction. One chain, and the scene reads a
 * world that is genuinely current.
 *
 * The clamps in `fixed-timestep.ts` are the valuable part and are untouched: a
 * restored tab reporting a 60-second frame still gets its surplus dropped rather
 * than simulated (spec §20).
 */

export interface FixedStepDriverOptions {
  /** Runs once per fixed step. */
  readonly update: (deltaMs: number) => void;
  readonly timestep?: Partial<FixedTimestepConfig>;
}

export interface FixedStepResult {
  /** Steps actually run this frame. */
  readonly steps: number;
  /** Position between the last completed step and the next, 0..1. */
  readonly alpha: number;
}

export interface FixedStepStats {
  readonly tick: number;
  /** Simulated milliseconds actually run. */
  readonly elapsedMs: number;
  /** Simulated milliseconds dropped by the clamps. */
  readonly droppedMs: number;
}

export class FixedStepDriver {
  private readonly update: (deltaMs: number) => void;
  private readonly config: FixedTimestepConfig;

  private accumulatorMs = 0;
  private alphaValue = 0;
  private running = false;
  private tick = 0;
  private elapsedMs = 0;
  private droppedMs = 0;

  constructor(options: FixedStepDriverOptions) {
    this.update = options.update;
    this.config = { ...DEFAULT_FIXED_TIMESTEP_CONFIG, ...options.timestep };
  }

  start(): void {
    this.running = true;
  }

  pause(): void {
    this.running = false;
  }

  resume(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
    // The accumulator goes with it. Time banked before a stop is not owed to
    // whatever run comes next.
    this.accumulatorMs = 0;
    this.alphaValue = 0;
  }

  reset(): void {
    this.stop();
    this.tick = 0;
    this.elapsedMs = 0;
    this.droppedMs = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Interpolation position for the frame just driven, 0..1. */
  get alpha(): number {
    return this.alphaValue;
  }

  get stats(): FixedStepStats {
    return { tick: this.tick, elapsedMs: this.elapsedMs, droppedMs: this.droppedMs };
  }

  /**
   * Advances the simulation by one frame's worth of time.
   *
   * A paused driver still reports an alpha so the scene keeps drawing the frozen
   * world at its last position rather than snapping.
   */
  advance(frameDeltaMs: number): FixedStepResult {
    if (!this.running || !Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) {
      return { steps: 0, alpha: this.alphaValue };
    }

    const drained = drainAccumulator(this.accumulatorMs, frameDeltaMs, this.config);

    this.accumulatorMs = drained.accumulatorMs;
    this.alphaValue = drained.alpha;
    this.droppedMs += drained.droppedMs;

    for (let step = 0; step < drained.steps; step += 1) {
      this.tick += 1;
      this.elapsedMs += this.config.fixedDeltaMs;
      this.update(this.config.fixedDeltaMs);
    }

    return { steps: drained.steps, alpha: drained.alpha };
  }
}
