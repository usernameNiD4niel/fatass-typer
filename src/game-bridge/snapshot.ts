import type { LaneIndex, LaneSide } from '../game-core/models';
import type { PowerupKind } from '../game-core/powerups';
import type { GameState } from './messages';

/**
 * The world, as the scene needs to draw it this frame.
 *
 * The second half of the bridge contract. Events carry *coarse* state — a
 * prompt changed, the run ended — at a throttled ~10Hz, because React re-renders
 * on them. The snapshot carries *per-frame* state at full rate, because the
 * scene reads it inside `useFrame` and never re-renders on it.
 *
 * It lives here rather than in `game-runtime` for a reason the ESLint config
 * enforces: `game-scene` must be able to read the world without importing
 * runtime internals. Both halves of the contract in one place is what makes
 * that boundary honest rather than nominal.
 *
 * ## Mutated in place
 *
 * Every field is mutable and the object is reused across frames. That is
 * deliberate: at 60Hz a fresh snapshot per frame — with fresh arrays of coins
 * and crates inside it — is a steady stream of garbage in the hottest path in
 * the program (spec §20 "avoid per-frame allocations"). Everything with a body
 * lives in a fixed-length pool; only `[0, count)` is meaningful, and entries
 * beyond it are stale data from an earlier frame rather than anything to draw.
 *
 * Read it, do not keep it. A reference held across frames is a reference to
 * whatever the world looks like *now*.
 */

/** Opponents in the race. Fixed: there are two, and there will be two.  */
export const MAX_SNAPSHOT_RACERS = 2;

/** Maximum coin lines the pool can describe at once. */
export const MAX_SNAPSHOT_COINS = 4;

/** Coins one line can describe. Matches `game-core/pickups`. */
export const MAX_SNAPSHOT_COIN_UNITS = 8;

/**
 * One coin of a line.
 *
 * Per coin rather than per line, because they are now collected one at a time
 * and the scene flies each one to the counter as it goes. A line-level
 * "collected" flag could not say *which* coins, and a swerve that lands halfway
 * down the row takes half of them.
 */
export interface CoinUnitSnapshot {
  /** Metres past the line's first coin. */
  offsetMeters: number;
  collected: boolean;
  /** The player is level with this coin, taken or not. */
  passed: boolean;
}

export interface CoinSnapshot {
  instanceId: string;
  /** Distance from the player to the line's first coin, in metres. */
  distanceMeters: number;
  lane: LaneIndex;
  /** Points each coin is worth. */
  value: number;
  /** True once the player has typed the word and is on their way. */
  committed: boolean;
  /** True once every coin in the line has been decided. */
  collected: boolean;
  unitCount: number;
  units: CoinUnitSnapshot[];
}

export interface PowerupSnapshot {
  instanceId: string;
  kind: PowerupKind;
  distanceMeters: number;
  lane: LaneIndex;
  /** True once claimed — the scene plays the pickup and stops drawing it. */
  claimed: boolean;
}

/** What the player is carrying. Drives the HUD and the runner's look. */
export interface EffectsSnapshot {
  flying: boolean;
  flightRemainingMs: number;
  magnet: boolean;
  magnetRemainingMs: number;
  shields: number;
}

/**
 * What kind of encounter the word belongs to.
 *
 * `flow` is the odd one: it has no body anywhere in the world, so the scene
 * places it rather than tracking something. See `game-core/flow`.
 */
export type ChallengeKind = 'coin' | 'powerup' | 'flow';

export interface ChallengeSnapshot {
  kind: ChallengeKind;
  /** The word being typed. */
  word: string;
  /** Characters accepted as correct so far. */
  typedLength: number;
  /** Index of the first uncorrected mistake, or -1. */
  firstErrorIndex: number;
  /** Which side the lane to swerve to is on, or `null` when there is none. */
  safeSide: LaneSide | null;
  safeLane: LaneIndex | null;
  /** Which encounter the word belongs to, so the scene can place it. */
  hazardId: string;
  /**
   * Nothing is lost by ignoring it.
   *
   * True for a coin line and a crate; false for the flow word, which costs the
   * combo and hands the chaser ground. The scene styles them differently, so a
   * player can tell at a glance which they are looking at.
   */
  optional: boolean;
  /**
   * One mistake forfeits it. True only for a powerup sentence.
   *
   * The scene says so on the label, because a rule that severe has to be
   * visible before the player finds out about it the hard way.
   */
  perfect: boolean;
  /** 0..1, rising as the deadline approaches. Drives the urgency pulse. */
  urgency: number;
}

export interface ImpulseSnapshot {
  /** 0..1. Camera shake, spent over a few frames. */
  shake: number;
  /** Additional field of view in degrees, from speed. */
  fovBias: number;
  /**
   * A one-off kick of extra field of view, in degrees, decaying to zero.
   *
   * Separate from `fovBias` because they answer different questions. The bias is
   * how fast the player *is* going; the punch is the moment they earned it. Held
   * in one number they would fight: a punch would read as a permanent speed
   * change and the decay would read as slowing down.
   */
  punch: number;
}

/** Kinds of floating score label the scene can draw. */
export type PopupKind = 'gain' | 'loss';

/**
 * A floating score label.
 *
 * Per-frame, so it travels in the snapshot rather than through the event bus:
 * these are spawned by keystrokes, and pushing one React event per mistyped
 * character through a bus that exists to throttle traffic would be working
 * against it.
 */
export interface PopupSnapshot {
  /** Empty when the slot is unused. Changes when the slot is reused. */
  id: string;
  /** Signed. Negative for a penalty, so the scene never has to infer the sign. */
  points: number;
  kind: PopupKind;
  /** Milliseconds since it appeared. The scene turns this into rise and fade. */
  ageMs: number;
  /** Lane it belongs over, so labels do not all stack in the middle. */
  lane: number;
}

/**
 * Labels drawable at once.
 *
 * Small on purpose. Mistyping fast can produce a label per keystroke, and a
 * screen full of them is noise rather than feedback — the oldest slot is
 * recycled, so the newest is always visible.
 */
export const MAX_SNAPSHOT_POPUPS = 6;

/**
 * The chaser (plan 1.3).
 *
 * A rule, not a decoration: at a gap of zero the run ends. The scene draws the
 * body from `gapMeters` and its danger cue from `pressure`, so retuning the
 * distances never silently retunes how alarming it looks.
 */
/** One opponent, as the scene needs them. */
export interface RacerSnapshot {
  instanceId: string;
  /** Metres ahead of the player. Negative once the player has passed them. */
  aheadMeters: number;
  lane: number;
  finished: boolean;
}

export interface PursuitSnapshot {
  gapMeters: number;
  /** 0..1, where 1 is on top of the player. */
  pressure: number;
}

export interface WorldSnapshot {
  phase: GameState;
  /** Distance travelled, interpolated between simulation steps. */
  playerMeters: number;
  speedMetersPerSecond: number;
  /** Continuous, 0..2. Whole numbers mean settled in a lane. */
  lanePosition: number;
  jumpHeightMeters: number;
  /** 0..1, deepest at take-off and on landing. Cosmetic crouch. */
  crouch: number;
  boosting: boolean;
  racerCount: number;
  racers: RacerSnapshot[];
  coinCount: number;
  coins: CoinSnapshot[];
  powerupCount: number;
  powerups: PowerupSnapshot[];
  effects: EffectsSnapshot;
  challenge: ChallengeSnapshot | null;
  impulse: ImpulseSnapshot;
  pursuit: PursuitSnapshot;
  popupCount: number;
  popups: PopupSnapshot[];
}

/** Maximum powerup crates the pool can describe at once. */
export const MAX_SNAPSHOT_POWERUPS = 2;

function emptyPopup(): PopupSnapshot {
  return { id: '', points: 0, kind: 'gain', ageMs: 0, lane: 1 };
}

function emptyPowerup(): PowerupSnapshot {
  return { instanceId: '', kind: 'shield', distanceMeters: 0, lane: 1, claimed: false };
}

function emptyCoin(): CoinSnapshot {
  return {
    instanceId: '',
    distanceMeters: 0,
    lane: 1,
    value: 0,
    committed: false,
    collected: false,
    unitCount: 0,
    units: Array.from({ length: MAX_SNAPSHOT_COIN_UNITS }, () => ({
      offsetMeters: 0,
      collected: false,
      passed: false,
    })),
  };
}

export function createWorldSnapshot(): WorldSnapshot {
  return {
    phase: 'uninitialized',
    playerMeters: 0,
    speedMetersPerSecond: 0,
    lanePosition: 1,
    jumpHeightMeters: 0,
    crouch: 0,
    boosting: false,
    racerCount: 0,
    racers: Array.from({ length: MAX_SNAPSHOT_RACERS }, () => ({
      instanceId: '',
      aheadMeters: 0,
      lane: 0,
      finished: false,
    })),
    coinCount: 0,
    coins: Array.from({ length: MAX_SNAPSHOT_COINS }, emptyCoin),
    powerupCount: 0,
    powerups: Array.from({ length: MAX_SNAPSHOT_POWERUPS }, emptyPowerup),
    effects: {
      flying: false,
      flightRemainingMs: 0,
      magnet: false,
      magnetRemainingMs: 0,
      shields: 0,
    },
    challenge: null,
    impulse: { shake: 0, fovBias: 0, punch: 0 },
    pursuit: { gapMeters: 0, pressure: 0 },
    popupCount: 0,
    popups: Array.from({ length: MAX_SNAPSHOT_POPUPS }, emptyPopup),
  };
}

/** The coin lines actually in play this frame. */
export function liveCoins(snapshot: WorldSnapshot): readonly CoinSnapshot[] {
  return snapshot.coins.slice(0, snapshot.coinCount);
}
