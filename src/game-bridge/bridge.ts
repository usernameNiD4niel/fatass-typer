import type { LiveRunStats } from '../game-core/models';
import type { DeadlinePressureLevel, GameCommand, GameEvent } from './messages';
import { TERMINAL_EVENT_TYPES } from './messages';
import { parseGameCommand } from './validate';

/**
 * The one stable bridge object (spec §13).
 *
 * Owns three responsibilities and no game logic:
 *
 *  1. **Validation.** Commands are parsed at the boundary; a bad one becomes a
 *     `fatalError` event instead of an exception inside the loop.
 *  2. **Rate limiting.** Live stats arrive every simulation step and leave at
 *     ~10Hz. Per-frame data must never reach React (CLAUDE.md §3) — a state
 *     update at 60Hz would re-render the tree sixty times a second and make the
 *     frame budget unmeetable.
 *  3. **Lifetime.** Listeners are dropped on `destroy`, so an unmounted canvas
 *     cannot keep a React tree alive or deliver events into a dead component.
 */

/** Whatever is actually running the game. Implemented by the runtime in C7. */
export interface GameHost {
  handle(command: GameCommand, emit: (event: GameEvent) => void): void;
}

export type GameEventListener = (event: GameEvent) => void;

/** ~10Hz. Fast enough for a live WPM readout, slow enough to be free. */
export const DEFAULT_STATS_INTERVAL_MS = 100;

/**
 * Smallest change in normalised dog distance worth an event.
 *
 * The gap moves continuously, so without a threshold every throttle window would
 * emit regardless of whether anything the player can see has changed.
 */
const DOG_DISTANCE_EPSILON = 0.002;

export interface GameBridgeOptions {
  readonly host?: GameHost;
  readonly statsIntervalMs?: number;
}

export class GameBridge {
  private readonly listeners = new Set<GameEventListener>();
  private readonly statsIntervalMs: number;
  private host: GameHost | undefined;

  private destroyed = false;
  private pendingStats: LiveRunStats | null = null;
  private lastStatsEmitMs = Number.NEGATIVE_INFINITY;
  private lastDogDistance: number | null = null;
  private lastDogEmitMs = Number.NEGATIVE_INFINITY;
  private lastPressure: DeadlinePressureLevel | null = null;
  private lastDeadlineRemainingMs: number | null = null;
  private lastDeadlineEmitMs = Number.NEGATIVE_INFINITY;

  constructor(options: GameBridgeOptions = {}) {
    this.host = options.host;
    this.statsIntervalMs = options.statsIntervalMs ?? DEFAULT_STATS_INTERVAL_MS;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Attaches the runtime. Separate from construction so React can hold the bridge first. */
  setHost(host: GameHost | undefined): void {
    this.host = host;
  }

  /**
   * Subscribes to events. The returned function unsubscribes and is safe to call
   * more than once — React effect cleanup runs in ways that make that likely.
   */
  subscribe(listener: GameEventListener): () => void {
    if (this.destroyed) return () => undefined;

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Sends a command in. Returns whether it was accepted.
   *
   * Takes `unknown` on purpose: the point of a boundary is that it does not
   * assume the caller was type-checked against the same version it was.
   */
  send(command: unknown): boolean {
    if (this.destroyed) return false;

    const parsed = parseGameCommand(command);

    if (!parsed.ok) {
      this.emit({ type: 'fatalError', message: `invalid command: ${parsed.reason}` });

      return false;
    }

    if (parsed.command.type === 'destroy') {
      this.host?.handle(parsed.command, (event) => {
        this.emit(event);
      });
      this.destroy();

      return true;
    }

    if (!this.host) {
      this.emit({ type: 'fatalError', message: 'no game host is attached' });

      return false;
    }

    this.host.handle(parsed.command, (event) => {
      this.emit(event);
    });

    return true;
  }

  /**
   * Emits an event to every listener.
   *
   * A throwing listener is contained: one broken UI subscriber must not stop the
   * others from being notified, and must never propagate into the game loop.
   */
  emit(event: GameEvent): void {
    if (this.destroyed) return;

    // A run that just ended must not report stats from 90ms ago as its last word.
    if (TERMINAL_EVENT_TYPES.includes(event.type)) this.flush();

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // Swallowed deliberately. See the note above.
      }
    }
  }

  /**
   * Offers a stats sample. Call it as often as you like — at most one sample per
   * interval leaves the bridge, and it is always the most recent one.
   */
  publishStats(stats: LiveRunStats, nowMs: number): void {
    if (this.destroyed) return;

    this.pendingStats = stats;

    // A clock that jumped backwards means the caller restarted its timeline.
    // Without this the throttle would wait for the old high-water mark and the
    // HUD would freeze for the length of the previous run.
    if (nowMs < this.lastStatsEmitMs) this.lastStatsEmitMs = Number.NEGATIVE_INFINITY;

    if (nowMs - this.lastStatsEmitMs >= this.statsIntervalMs) {
      this.lastStatsEmitMs = nowMs;
      this.flush();
    }
  }

  /** Offers a dog-distance sample. Throttled on the same clock as stats. */
  publishDogDistance(normalizedDistance: number, nowMs: number): void {
    if (this.destroyed) return;

    const previous = this.lastDogDistance;
    const moved =
      previous === null || Math.abs(previous - normalizedDistance) >= DOG_DISTANCE_EPSILON;

    if (nowMs < this.lastDogEmitMs) this.lastDogEmitMs = Number.NEGATIVE_INFINITY;
    if (!moved) return;
    if (nowMs - this.lastDogEmitMs < this.statsIntervalMs) return;

    this.lastDogDistance = normalizedDistance;
    this.lastDogEmitMs = nowMs;
    this.emit({ type: 'dogDistanceChanged', normalizedDistance });
  }

  /**
   * Offers the active obstacle deadline. Throttled on its own clock.
   *
   * Emitted whenever the pressure level changes, whatever the throttle says: a
   * countdown crossing into "critical" is the moment the player most needs the
   * HUD to react, and holding it for another 90ms would be exactly wrong.
   */
  publishDeadline(
    remainingMs: number | null,
    pressure: DeadlinePressureLevel,
    nowMs: number,
  ): void {
    if (this.destroyed) return;

    if (nowMs < this.lastDeadlineEmitMs) this.lastDeadlineEmitMs = Number.NEGATIVE_INFINITY;

    const levelChanged = pressure !== this.lastPressure;
    const stopped = remainingMs === null && this.lastDeadlineRemainingMs === null;

    if (stopped) return;
    if (!levelChanged && nowMs - this.lastDeadlineEmitMs < this.statsIntervalMs) return;

    this.lastPressure = pressure;
    this.lastDeadlineRemainingMs = remainingMs;
    this.lastDeadlineEmitMs = nowMs;
    this.emit({ type: 'deadlineChanged', remainingMs, pressure });
  }

  /** Sends any withheld sample immediately. */
  flush(): void {
    const stats = this.pendingStats;
    if (stats === null || this.destroyed) return;

    this.pendingStats = null;

    for (const listener of [...this.listeners]) {
      try {
        listener({ type: 'statsUpdated', stats });
      } catch {
        // Same containment as `emit`.
      }
    }
  }

  /**
   * Tears the bridge down. Called from the canvas component's effect cleanup.
   *
   * Everything after this is a no-op rather than an error: unmount ordering is
   * not something a caller can fully control, so a late event or command must be
   * harmless.
   */
  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.listeners.clear();
    this.pendingStats = null;
    this.host = undefined;
  }
}
