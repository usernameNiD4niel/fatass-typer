import { MAP_1, ALL_PROMPTS, findSecret, secretPrompts } from '../content';
import type { MapConfig, PromptEntry } from '../game-core/models';
import { liveStats, RuntimeHost } from '../game-runtime/session';
import { GameBridge } from './bridge';
import type { WorldSnapshot } from './snapshot';

/**
 * Builds a bridge with the TypeScript runtime behind it.
 *
 * This is the **only** module that knows both sides exist, and the reason
 * neither React nor the scene imports `game-runtime`: a caller asks for a game
 * and gets back the same narrow handle it would get from any other runtime.
 * Swapping in Rust + WASM later means rewriting this file and nothing above it.
 *
 * The handle has two halves, because the game speaks at two rates. `bridge`
 * carries throttled events into React. `advance` and `snapshot` are the scene's
 * per-frame channel and never touch React at all.
 */

export interface AttachGameOptions {
  readonly map?: MapConfig;
  readonly prompts?: readonly PromptEntry[];
  /** Fixing the seed makes a run reproducible — used by tests and bug reports. */
  readonly seed?: string;
}

export interface AttachedGame {
  readonly bridge: GameBridge;
  /**
   * Advances the simulation by one frame and refreshes the snapshot.
   *
   * Called from the scene's `useFrame`. One render loop drives everything, so
   * the snapshot is never a frame behind what is being drawn.
   */
  advance: (frameDeltaMs: number) => void;
  /** The world as of the last `advance`. Read it, do not retain it. */
  readonly snapshot: WorldSnapshot;
  /** Stops the simulation and tears the bridge down. */
  destroy: () => void;
}

export function attachGame(options: AttachGameOptions = {}): AttachedGame {
  const bridge = new GameBridge();
  const map = options.map ?? MAP_1;
  // Every prompt of a run is the next word of the map's secret. A map without
  // one simply falls back to its own vocabulary, which is what the sentence
  // does anyway once it is finished.
  const secret = findSecret(map.id);

  const host = new RuntimeHost({
    map,
    prompts: options.prompts ?? ALL_PROMPTS,
    secretWords: secret === undefined ? [] : secretPrompts(secret),
    seed: options.seed ?? 'typing-chase',
    emit: (event) => {
      bridge.emit(event);
    },
    publishStats: (session, nowMs) => {
      bridge.publishStats(liveStats(session), nowMs);
    },
    publishDeadline: (remainingMs, pressure, nowMs) => {
      bridge.publishDeadline(remainingMs, pressure, nowMs);
    },
  });

  bridge.setHost(host);

  return {
    bridge,
    advance: (frameDeltaMs) => {
      host.advance(frameDeltaMs);
    },
    snapshot: host.snapshot,
    destroy: () => {
      host.destroy();
      bridge.destroy();
    },
  };
}
