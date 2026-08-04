import type { GameEvent } from '../../game-bridge/messages';
import type { MapConfig, ObstacleDefinition, PromptEntry } from '../../game-core/models';
import { RuntimeHost } from './runtime-host';
import type { RunSession } from './run-session';

/**
 * Headless profiling for a run (spec §16).
 *
 * Measuring frame cost in a browser measures the browser: a backgrounded tab is
 * throttled to a fraction of a frame per second, and the numbers that come back
 * say more about Chrome's scheduler than about this code. So the host is driven
 * by hand here, at exactly 60Hz of simulated time.
 *
 * What it measures honestly: the simulation, plus assembling the world snapshot
 * the scene reads — everything that happens before a single triangle is
 * submitted. What it does not measure: anything on the GPU, which now belongs to
 * Three.js and is not this module's to speak for.
 *
 * The shape of the curve is the durable result. Milliseconds vary with whatever
 * else the machine is doing; "does a frame cost more in the last minute of a map
 * than in the first" does not.
 */

const FRAME_MS = 1000 / 60;

export interface ProfileInput {
  readonly map: MapConfig;
  readonly prompts: readonly PromptEntry[];
  readonly obstacles: readonly ObstacleDefinition[];
  readonly seed: string;
  /** How long to profile, in simulated seconds. */
  readonly seconds: number;
  /**
   * Words per minute the simulated typist holds. Without one, hazards go
   * unanswered and the run ends in the first few seconds — which profiles the
   * game-over screen rather than the game.
   */
  readonly wpm: number;
  /** Sampled every `sampleEvery` frames, so long profiles stay cheap. */
  readonly sampleEvery?: number;
}

export interface FrameSample {
  readonly frame: number;
  readonly elapsedMs: number;
  /** Wall-clock milliseconds the frame's simulation and snapshot cost. */
  readonly costMs: number;
  readonly hazards: number;
  readonly playerMeters: number;
}

export interface ProfileResult {
  readonly frames: number;
  readonly samples: readonly FrameSample[];
  readonly medianCostMs: number;
  readonly p95CostMs: number;
  readonly maxCostMs: number;
  readonly finished: boolean;
  readonly session: RunSession;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));

  return sorted[index] ?? 0;
}

/**
 * Runs a map for `seconds` of simulated time and reports what each frame cost.
 *
 * The typist is metronomic: one correct character every `60000 / (wpm * 5)`
 * milliseconds, fed through the same whole-value input path the real game uses.
 */
export function profileRun(input: ProfileInput): ProfileResult {
  const sampleEvery = input.sampleEvery ?? 6;
  const events: GameEvent[] = [];
  const collect = (event: GameEvent): void => {
    events.push(event);
  };

  const host = new RuntimeHost({
    map: input.map,
    prompts: input.prompts,
    obstacles: input.obstacles,
    seed: input.seed,
    emit: collect,
    publishStats: () => undefined,
    now: () => 0,
  });

  host.handle({ type: 'initialize', canvasId: 'profile' }, collect);
  host.handle({ type: 'startRun' }, collect);

  const keyIntervalMs = 60_000 / (input.wpm * 5);
  const totalFrames = Math.ceil((input.seconds * 1000) / FRAME_MS);
  const samples: FrameSample[] = [];
  const costs: number[] = [];

  let nextKeyAtMs = 0;

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const phase = host.currentSession.phase;
    if (phase === 'levelComplete' || phase === 'gameOver') break;

    // Type whatever the metronome says is due before the frame is simulated.
    while (host.currentSession.prompt !== null && nextKeyAtMs <= host.currentSession.elapsedMs) {
      const { target, typed } = host.currentSession.typing;
      if (typed.length >= target.length) break;

      host.handle(
        { type: 'submitInput', value: target.slice(0, typed.length + 1), timestampMs: 0 },
        collect,
      );
      nextKeyAtMs += keyIntervalMs;
    }

    const startedAt = performance.now();
    host.advance(FRAME_MS);
    const costMs = performance.now() - startedAt;

    costs.push(costMs);

    if (frame % sampleEvery === 0) {
      samples.push({
        frame,
        elapsedMs: host.currentSession.elapsedMs,
        costMs,
        hazards: host.snapshot.hazardCount,
        playerMeters: host.currentSession.playerMeters,
      });
    }
  }

  const sorted = [...costs].sort((a, b) => a - b);

  return {
    frames: costs.length,
    samples,
    medianCostMs: percentile(sorted, 0.5),
    p95CostMs: percentile(sorted, 0.95),
    maxCostMs: sorted[sorted.length - 1] ?? 0,
    finished: host.currentSession.phase === 'levelComplete',
    session: host.currentSession,
  };
}
