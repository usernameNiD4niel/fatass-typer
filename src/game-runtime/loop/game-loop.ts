import {
  DEFAULT_FIXED_TIMESTEP_CONFIG,
  drainAccumulator,
  type FixedTimestepConfig,
} from './fixed-timestep';

/**
 * The frame driver (CLAUDE.md §3, spec §16).
 *
 * Owns wall-clock time and frame scheduling so that nothing else has to. The
 * simulation gets constant-length steps, the renderer gets one call per frame
 * with an interpolation factor, and React gets neither — per-frame data never
 * leaves this layer, and the bridge samples it at ~10Hz in step C5.
 *
 * The clock and the scheduler are injected. Tests drive the loop frame by frame
 * with a fake, which is the only honest way to assert catch-up and clamp
 * behaviour.
 */

export interface LoopScheduler {
  /** Monotonic milliseconds. */
  now(): number;
  request(callback: (timestampMs: number) => void): number;
  cancel(handle: number): void;
}

/**
 * The real browser scheduler.
 *
 * `performance.now()` rather than `Date.now()`: it is monotonic, so an NTP
 * correction or a daylight-saving jump mid-run cannot produce a negative frame.
 */
export const browserScheduler: LoopScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
};

export interface LoopUpdateContext {
  /** Always the configured step length. Never a variable frame delta. */
  readonly fixedDeltaMs: number;
  /** Steps completed since `start()`, counting this one. */
  readonly tick: number;
  /** Simulation time since `start()`, in milliseconds. Excludes paused time. */
  readonly elapsedMs: number;
}

export interface LoopRenderContext {
  /** 0..1 between the last completed step and the next. Spec §16 smoothing. */
  readonly alpha: number;
  /** Real time since the previous frame, in milliseconds. */
  readonly frameDeltaMs: number;
  readonly tick: number;
  readonly elapsedMs: number;
  /** Smoothed frames per second, for the dev overlay and the G3 perf pass. */
  readonly fps: number;
}

export interface GameLoopCallbacks {
  /** Advance the simulation exactly one fixed step. */
  update: (context: LoopUpdateContext) => void;
  /** Draw one frame. Called once per animation frame, after any updates. */
  render: (context: LoopRenderContext) => void;
}

export interface GameLoopOptions extends GameLoopCallbacks {
  readonly scheduler?: LoopScheduler;
  readonly timestep?: Partial<FixedTimestepConfig>;
}

export interface GameLoopStats {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly fps: number;
  /** Simulation time discarded by the frame and step clamps, in milliseconds. */
  readonly droppedMs: number;
}

/** Weight of the newest frame in the FPS average — enough to smooth one bad frame. */
const FPS_SMOOTHING = 0.1;

export class GameLoop {
  private readonly scheduler: LoopScheduler;
  private readonly config: FixedTimestepConfig;
  private readonly callbacks: GameLoopCallbacks;

  private handle: number | null = null;
  private isRunning = false;
  private paused = false;
  private lastTimestampMs = 0;
  private accumulatorMs = 0;
  private tick = 0;
  private elapsedMs = 0;
  private droppedMs = 0;
  private fps = 0;
  /** Bumped by every `start()`, so a frame can tell whether it was restarted under it. */
  private generation = 0;

  // Bound once. A fresh closure per frame would allocate 60 times a second for
  // no reason, and `cancel` needs a stable identity anyway.
  private readonly frame = (timestampMs: number): void => {
    // A callback may stop and restart the loop mid-frame. The restart already
    // queued the next frame, so rescheduling here too would leave two chains
    // running and double the simulation rate.
    const generation = this.generation;

    this.handle = null;
    this.runFrame(timestampMs);

    if (this.isRunning && this.generation === generation) {
      this.handle = this.scheduler.request(this.frame);
    }
  };

  constructor(options: GameLoopOptions) {
    this.scheduler = options.scheduler ?? browserScheduler;
    this.config = { ...DEFAULT_FIXED_TIMESTEP_CONFIG, ...options.timestep };
    this.callbacks = { update: options.update, render: options.render };
  }

  get running(): boolean {
    return this.isRunning;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get stats(): GameLoopStats {
    return {
      tick: this.tick,
      elapsedMs: this.elapsedMs,
      fps: this.fps,
      droppedMs: this.droppedMs,
    };
  }

  /** Starts from a clean simulation. Re-starting an already-running loop is a no-op. */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.paused = false;
    this.generation += 1;
    this.lastTimestampMs = this.scheduler.now();
    this.accumulatorMs = 0;
    this.tick = 0;
    this.elapsedMs = 0;
    this.droppedMs = 0;
    this.fps = 0;
    this.handle = this.scheduler.request(this.frame);
  }

  /**
   * Stops scheduling and cancels any pending frame.
   *
   * Callers must invoke this on canvas unmount — a leaked rAF chain keeps
   * rendering into a detached canvas and pins the whole game state in memory.
   */
  stop(): void {
    this.isRunning = false;
    this.paused = false;
    if (this.handle !== null) {
      this.scheduler.cancel(this.handle);
      this.handle = null;
    }
  }

  /**
   * Freezes the simulation but keeps the frame chain alive, so the pause overlay
   * still gets rendered over a live canvas (spec §4 `Paused`).
   */
  pause(): void {
    if (!this.isRunning) return;
    this.paused = true;
  }

  /**
   * Resumes.
   *
   * The accumulator is cleared rather than carried: whatever partial step was
   * pending when the player hit Escape is not owed to them ten minutes later,
   * and paying it back as catch-up would jerk the MC forward on resume.
   */
  resume(): void {
    if (!this.isRunning || !this.paused) return;
    this.paused = false;
    this.lastTimestampMs = this.scheduler.now();
    this.accumulatorMs = 0;
  }

  private runFrame(timestampMs: number): void {
    const frameDeltaMs = Math.max(0, timestampMs - this.lastTimestampMs);
    this.lastTimestampMs = timestampMs;

    if (frameDeltaMs > 0) {
      const instantFps = 1000 / frameDeltaMs;
      this.fps = this.fps === 0 ? instantFps : this.fps + (instantFps - this.fps) * FPS_SMOOTHING;
    }

    // A paused loop still draws — the overlay sits on top of the frozen scene —
    // but the simulation clock does not move.
    if (this.paused) {
      this.callbacks.render({
        alpha: this.accumulatorMs / this.config.fixedDeltaMs,
        frameDeltaMs,
        tick: this.tick,
        elapsedMs: this.elapsedMs,
        fps: this.fps,
      });
      return;
    }

    const result = drainAccumulator(this.accumulatorMs, frameDeltaMs, this.config);
    this.accumulatorMs = result.accumulatorMs;
    this.droppedMs += result.droppedMs;

    for (let step = 0; step < result.steps; step += 1) {
      this.tick += 1;
      this.elapsedMs += this.config.fixedDeltaMs;
      this.callbacks.update({
        fixedDeltaMs: this.config.fixedDeltaMs,
        tick: this.tick,
        elapsedMs: this.elapsedMs,
      });

      // An update may stop the loop — a game over, or an unmount mid-step.
      // Finishing the queued steps afterwards would advance a dead run.
      if (!this.isRunning) return;
    }

    this.callbacks.render({
      alpha: result.alpha,
      frameDeltaMs,
      tick: this.tick,
      elapsedMs: this.elapsedMs,
      fps: this.fps,
    });
  }
}
