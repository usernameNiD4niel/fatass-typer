import { MAP_1, OBSTACLES, STARTER_PROMPTS } from '../content';
import type { MapConfig, ObstacleDefinition, PromptEntry } from '../game-core/models';
import type { Canvas2D } from '../game-runtime/render';
import { liveStats, RuntimeHost } from '../game-runtime/session';
import { GameBridge } from './bridge';

/**
 * Builds a bridge with the TypeScript runtime behind it.
 *
 * This is the **only** module that knows both sides exist, and the reason React
 * never imports `game-runtime`: a screen asks for a bridge attached to a canvas
 * and gets back the same narrow object it would get from any other runtime.
 * Swapping in Rust + WASM later means rewriting this file and nothing above it.
 */

export interface AttachGameOptions {
  readonly canvas: HTMLCanvasElement | null;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly devicePixelRatio?: number;
  readonly map?: MapConfig;
  readonly prompts?: readonly PromptEntry[];
  readonly obstacles?: readonly ObstacleDefinition[];
  /** Fixing the seed makes a run reproducible — used by tests and bug reports. */
  readonly seed?: string;
}

export interface AttachedGame {
  readonly bridge: GameBridge;
  /** Call from a resize observer. */
  resize: (widthPx: number, heightPx: number, devicePixelRatio?: number) => void;
  /** Stops the loop, drops the canvas, and tears the bridge down. */
  destroy: () => void;
}

/**
 * Asks for the 2D context.
 *
 * Returns `null` rather than throwing when the environment has no canvas
 * implementation — jsdom and a few hardened browsers. The host reports that as
 * a fatal error, which the screen can show.
 */
function get2dContext(canvas: HTMLCanvasElement | null): Canvas2D | null {
  if (!canvas) return null;

  try {
    const context = canvas.getContext('2d');

    // `Canvas2D` narrows `fillStyle` to a string because the renderer only ever
    // assigns strings; the DOM type also allows gradients and patterns, and a
    // mutable property is invariant, so the two do not line up without a cast.
    // This is the one place the two type worlds meet.
    return context as Canvas2D | null;
  } catch {
    return null;
  }
}

export function attachGame(options: AttachGameOptions): AttachedGame {
  const bridge = new GameBridge();
  const devicePixelRatio = options.devicePixelRatio ?? 1;

  const host = new RuntimeHost({
    canvas: options.canvas,
    context: get2dContext(options.canvas),
    map: options.map ?? MAP_1,
    prompts: options.prompts ?? STARTER_PROMPTS,
    obstacles: options.obstacles ?? OBSTACLES,
    seed: options.seed ?? 'typing-chase',
    viewport: {
      widthPx: options.widthPx,
      heightPx: options.heightPx,
      devicePixelRatio,
    },
    emit: (event) => {
      bridge.emit(event);
    },
    publishStats: (session, nowMs) => {
      const stats = liveStats(session);

      bridge.publishStats(stats, nowMs);
      bridge.publishDogDistance(stats.dogDistanceNormalized, nowMs);
    },
  });

  bridge.setHost(host);

  return {
    bridge,
    resize: (widthPx, heightPx, ratio) => {
      host.resize({ widthPx, heightPx, devicePixelRatio: ratio ?? devicePixelRatio });
    },
    destroy: () => {
      host.destroy();
      bridge.destroy();
    },
  };
}
