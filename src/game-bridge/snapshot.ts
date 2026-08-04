import type { LaneIndex, LaneSide, ObstacleAction } from '../game-core/models';
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
 * deliberate: at 60Hz a fresh snapshot per frame — with a fresh array of
 * hazards inside it — is a steady stream of garbage in the hottest path in the
 * program (spec §20 "avoid per-frame allocations"). Hazards live in a
 * fixed-length pool; only `[0, hazardCount)` is meaningful, and entries beyond
 * it are stale data from an earlier frame rather than anything to draw.
 *
 * Read it, do not keep it. A reference held across frames is a reference to
 * whatever the world looks like *now*.
 */

/** Maximum hazards the pool can describe at once. */
export const MAX_SNAPSHOT_HAZARDS = 8;

export interface HazardSnapshot {
  instanceId: string;
  action: ObstacleAction;
  /** Distance from the player, in metres. Negative once it is behind them. */
  distanceMeters: number;
  /** Lanes it occupies. Reused array — read, do not retain. */
  blockedLanes: LaneIndex[];
  safeLane: LaneIndex | null;
  safeSide: LaneSide | null;
  /** True once the player has typed the word and the move has begun. */
  committed: boolean;
  /** True once it has been decided, win or lose. */
  resolved: boolean;
}

export interface ChallengeSnapshot {
  /** The word being typed. */
  word: string;
  /** Characters accepted as correct so far. */
  typedLength: number;
  /** Index of the first uncorrected mistake, or -1. */
  firstErrorIndex: number;
  action: ObstacleAction;
  /** Which side the safe lane is on, for the world cue. `null` for jumps. */
  safeSide: LaneSide | null;
  safeLane: LaneIndex | null;
  /** Which hazard the word belongs to, so the scene can place it. */
  hazardId: string;
  /** 0..1, rising as the deadline approaches. Drives the urgency pulse. */
  urgency: number;
}

export interface ImpulseSnapshot {
  /** 0..1. Camera shake, spent over a few frames. */
  shake: number;
  /** Additional field of view in degrees, from speed. */
  fovBias: number;
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
  hazardCount: number;
  hazards: HazardSnapshot[];
  challenge: ChallengeSnapshot | null;
  impulse: ImpulseSnapshot;
}

function emptyHazard(): HazardSnapshot {
  return {
    instanceId: '',
    action: 'jump',
    distanceMeters: 0,
    blockedLanes: [],
    safeLane: null,
    safeSide: null,
    committed: false,
    resolved: false,
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
    hazardCount: 0,
    hazards: Array.from({ length: MAX_SNAPSHOT_HAZARDS }, emptyHazard),
    challenge: null,
    impulse: { shake: 0, fovBias: 0 },
  };
}

/** The hazards actually in play this frame. */
export function liveHazards(snapshot: WorldSnapshot): readonly HazardSnapshot[] {
  return snapshot.hazards.slice(0, snapshot.hazardCount);
}
