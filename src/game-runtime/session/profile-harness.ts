import type { GameEvent } from '../../game-bridge/messages';
import type { MapConfig, ObstacleDefinition, PromptEntry } from '../../game-core/models';
import type { Canvas2D, SizableCanvas } from '../render/canvas-surface';
import type { LoopScheduler } from '../loop';
import { RuntimeHost } from './runtime-host';

/**
 * Headless profiling for a run (spec §16).
 *
 * Measuring frame cost in a browser measures the browser: a backgrounded tab is
 * throttled to a fraction of a frame per second, and the numbers that come back
 * say more about Chrome's scheduler than about this code. So the loop is driven
 * by hand here, at exactly 60Hz of simulated time, through a context that
 * counts draw calls instead of rasterising them.
 *
 * What that measures honestly: the cost of the simulation, the scene assembly,
 * and the number of draw calls issued per frame. What it does not measure:
 * rasterisation, which belongs to the GPU and is the one part of the pipeline a
 * flat-shape scene of this size is not going to trouble.
 *
 * The draw-call count is the more durable number of the two. Milliseconds vary
 * with whatever else the machine is doing; "how many operations does a frame
 * cost, and does that grow as the run goes on" does not.
 */

/** Counts calls without keeping any of them. */
export class CountingCanvas2D implements Canvas2D {
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  globalAlpha = 1;

  calls = 0;

  private tick(): void {
    this.calls += 1;
  }

  save(): void {
    this.tick();
  }
  restore(): void {
    this.tick();
  }
  setTransform(): void {
    this.tick();
  }
  translate(): void {
    this.tick();
  }
  rotate(): void {
    this.tick();
  }
  scale(): void {
    this.tick();
  }
  clearRect(): void {
    this.tick();
  }
  fillRect(): void {
    this.tick();
  }
  strokeRect(): void {
    this.tick();
  }
  beginPath(): void {
    this.tick();
  }
  moveTo(): void {
    this.tick();
  }
  lineTo(): void {
    this.tick();
  }
  closePath(): void {
    this.tick();
  }
  fill(): void {
    this.tick();
  }
  stroke(): void {
    this.tick();
  }
  arc(): void {
    this.tick();
  }
  ellipse(): void {
    this.tick();
  }
  quadraticCurveTo(): void {
    this.tick();
  }
}

/** A canvas element stand-in, since sizing is all the host asks of one. */
function profileCanvas(widthPx: number, heightPx: number): SizableCanvas {
  return { width: widthPx, height: heightPx, style: { width: '', height: '' } };
}

/** Runs the loop on demand rather than on a frame callback. */
class ManualScheduler implements LoopScheduler {
  private callback: ((timestampMs: number) => void) | null = null;
  private timeMs = 0;

  now(): number {
    return this.timeMs;
  }

  request(callback: (timestampMs: number) => void): number {
    this.callback = callback;

    return 1;
  }

  cancel(): void {
    this.callback = null;
  }

  /** Delivers one frame at `timestampMs`. Returns false once the loop stops. */
  frame(timestampMs: number): boolean {
    const callback = this.callback;
    if (callback === null) return false;

    this.callback = null;
    this.timeMs = timestampMs;
    callback(timestampMs);

    return true;
  }
}

export interface ProfileInput {
  readonly map: MapConfig;
  readonly prompts: readonly PromptEntry[];
  readonly obstacles: readonly ObstacleDefinition[];
  readonly seed: string;
  /** How many frames to drive. 600 is ten seconds of play. */
  readonly frames?: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  /** Monotonic clock. Injected so a test can hold time still. */
  readonly now?: () => number;
  /**
   * Speed of the simulated typist driving the run.
   *
   * Without one the dogs win in about eight seconds and the profile only ever
   * sees the opening of a map — which is exactly the part where nothing has
   * accumulated yet. The map's own target speed keeps the run going long enough
   * for the question "does a frame get more expensive as the run goes on?" to
   * mean something.
   */
  readonly wpm?: number;
}

export interface ProfileResult {
  readonly frames: number;
  /** Frames the loop actually ran before the run ended. */
  readonly framesRun: number;
  readonly totalMs: number;
  readonly msPerFrame: number;
  readonly drawCallsTotal: number;
  readonly drawCallsPerFrame: number;
  /** The most draw calls any single frame cost. */
  readonly drawCallsPeakFrame: number;
  /** Bridge events emitted across the whole profile. */
  readonly events: number;
  /** Stats samples offered to the bridge — one per simulation step. */
  readonly statsSamples: number;
  readonly metersTravelled: number;
}

const FRAME_MS = 1000 / 60;

/** Milliseconds per character. Five characters make a word. */
function msPerCharacter(wpm: number): number {
  return 60_000 / (wpm * 5);
}

export function profileRun(input: ProfileInput): ProfileResult {
  const frames = input.frames ?? 600;
  const widthPx = input.widthPx ?? 1024;
  const heightPx = input.heightPx ?? 448;

  const context = new CountingCanvas2D();
  const scheduler = new ManualScheduler();
  const clock = input.now ?? (() => performance.now());

  let events = 0;
  let statsSamples = 0;

  const host = new RuntimeHost({
    canvas: profileCanvas(widthPx, heightPx) as unknown as HTMLCanvasElement,
    context,
    map: input.map,
    prompts: input.prompts,
    obstacles: input.obstacles,
    seed: input.seed,
    viewport: { widthPx, heightPx, devicePixelRatio: 1 },
    scheduler,
    now: clock,
    emit: () => {
      events += 1;
    },
    publishStats: () => {
      statsSamples += 1;
    },
  });

  const collect = (_event: GameEvent): void => {
    events += 1;
  };

  host.handle({ type: 'initialize', canvasId: 'profile' }, collect);
  host.handle({ type: 'startRun' }, collect);

  const interval = msPerCharacter(input.wpm ?? input.map.targetWpm);

  let peak = 0;
  let framesRun = 0;
  let nextKeyAtMs = 0;
  const started = performance.now();

  for (let frame = 1; frame <= frames; frame += 1) {
    // The typist types between frames, at their own pace, exactly as a person
    // does — the loop does not wait for them.
    let session = host.currentSession;
    while (session.phase === 'running' && session.elapsedMs >= nextKeyAtMs) {
      const target = session.prompt?.text ?? '';
      const typed = session.typing.typed;
      if (typed.length >= target.length) break;

      host.handle(
        {
          type: 'submitInput',
          value: target.slice(0, typed.length + 1),
          timestampMs: session.elapsedMs,
        },
        collect,
      );
      nextKeyAtMs += interval;
      session = host.currentSession;
    }

    const before = context.calls;
    if (!scheduler.frame(frame * FRAME_MS)) break;

    framesRun += 1;
    peak = Math.max(peak, context.calls - before);
  }

  const totalMs = performance.now() - started;

  return {
    frames,
    framesRun,
    totalMs,
    msPerFrame: framesRun === 0 ? 0 : totalMs / framesRun,
    drawCallsTotal: context.calls,
    drawCallsPerFrame: framesRun === 0 ? 0 : context.calls / framesRun,
    drawCallsPeakFrame: peak,
    events,
    statsSamples,
    metersTravelled: host.currentSession.playerMeters,
  };
}
