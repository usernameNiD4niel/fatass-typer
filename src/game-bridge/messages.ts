import type { GameSettings, LiveRunStats, RunResult } from '../game-core/models';

/**
 * The bridge message contract (spec §13).
 *
 * Commands go in, events come out, and nothing else crosses. No renderer type,
 * canvas handle, or game-core internal appears here: this file is the whole
 * public surface between React and whatever is running the game, so replacing
 * the TypeScript runtime with Rust + WASM later would leave it untouched.
 *
 * Everything here is plain serialisable data for the same reason.
 */

/**
 * What the *run* is doing.
 *
 * Deliberately narrower than the app state machine (`game-core/app-state`),
 * which also covers menus and settings screens the runtime knows nothing about.
 * React owns navigation; the bridge only reports the run.
 */
export const GAME_STATES = [
  'uninitialized',
  'loading',
  'ready',
  'countdown',
  'running',
  'paused',
  'playerHit',
  'levelComplete',
  'gameOver',
] as const;

export type GameState = (typeof GAME_STATES)[number];

/** The prompt the player is typing right now. */
export interface PromptViewModel {
  readonly promptId: string;
  readonly text: string;
  /** How many characters are currently accepted as correct. */
  readonly typedLength: number;
  readonly mistakeCount: number;
  /** Which encounter the word belongs to. */
  readonly kind: 'flow' | 'coin' | 'powerup';
  /** Milliseconds left to finish, or `null` when nothing is enforcing a deadline. */
  readonly remainingMs: number | null;
}

/* -------------------------------------------------------------------------- */
/* Commands — React to the runtime                                            */
/* -------------------------------------------------------------------------- */

export type GameCommand =
  | { readonly type: 'initialize'; readonly canvasId: string }
  | { readonly type: 'loadMap'; readonly mapId: string }
  | { readonly type: 'startRun' }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'restart' }
  /**
   * The whole input value, not a keystroke — the typing engine diffs against the
   * previous value so paste, backspace, and IME edits all work (CLAUDE.md §3).
   */
  | { readonly type: 'submitInput'; readonly value: string; readonly timestampMs: number }
  | { readonly type: 'setSettings'; readonly settings: GameSettings }
  | { readonly type: 'destroy' };

export type GameCommandType = GameCommand['type'];

/* -------------------------------------------------------------------------- */
/* Events — the runtime to React                                              */
/* -------------------------------------------------------------------------- */

/** How close the current word's deadline is. Mirrors `game-core`. */
export type DeadlinePressureLevel = 'safe' | 'warning' | 'critical' | 'expired';

export type GameEvent =
  | { readonly type: 'ready' }
  /**
   * The current word's deadline, throttled like the stats.
   *
   * A separate event rather than a field on `LiveRunStats`: the deadline exists
   * only while a word is attached, and folding a mostly-null field into the
   * stats every tick would make the common case pay for the rare one.
   */
  | {
      readonly type: 'deadlineChanged';
      readonly remainingMs: number | null;
      readonly pressure: DeadlinePressureLevel;
    }
  | { readonly type: 'stateChanged'; readonly state: GameState }
  | { readonly type: 'promptChanged'; readonly prompt: PromptViewModel | null }
  | { readonly type: 'statsUpdated'; readonly stats: LiveRunStats }
  /** A word was finished and the player picked up speed. */
  | { readonly type: 'boostStarted' }
  | { readonly type: 'playerHit'; readonly reason: string }
  | { readonly type: 'levelCompleted'; readonly result: RunResult }
  | { readonly type: 'gameOver'; readonly result: RunResult }
  | { readonly type: 'fatalError'; readonly message: string };

export type GameEventType = GameEvent['type'];

/** Events that end a run. Pending throttled updates are flushed before these. */
export const TERMINAL_EVENT_TYPES: readonly GameEventType[] = ['levelCompleted', 'gameOver'];
