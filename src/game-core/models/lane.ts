import { isFiniteNumber } from './guards';

/**
 * The three-lane road.
 *
 * Lanes are an index, never a distance. How wide a lane is, how long a change
 * takes, and how high a jump goes are all tuning that lives on `MotionProfile`
 * (see `./motion.ts`) — the rules only ever ask "which lane" and "how far
 * through the move".
 *
 * Three is not arbitrary. It is the smallest count that guarantees an escape
 * from any lane while still allowing a genuine left-or-right choice from the
 * middle, which is the decision the car encounters are built on.
 */

export const LANE_COUNT = 3;

export type LaneIndex = 0 | 1 | 2;

/** The lane a run starts in. Centre, so the first encounter can go either way. */
export const CENTRE_LANE: LaneIndex = 1;

export const LANE_INDICES: readonly LaneIndex[] = [0, 1, 2];

/** Which way the player moves to reach a lane. Lane 0 is the left-hand lane. */
export type LaneSide = 'left' | 'right';

export const LANE_SIDES: readonly LaneSide[] = ['left', 'right'];

export function isLaneIndex(value: unknown): value is LaneIndex {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0 && value < LANE_COUNT;
}

export function isLaneSide(value: unknown): value is LaneSide {
  return value === 'left' || value === 'right';
}

/**
 * The lane one step to `side` of `from`, or `null` at the edge of the road.
 *
 * `null` is the whole point: it is how the spawner discovers that a lane has
 * only one escape, which is what stops it blocking every route.
 */
export function laneToward(from: LaneIndex, side: LaneSide): LaneIndex | null {
  const next = side === 'left' ? from - 1 : from + 1;
  return isLaneIndex(next) ? next : null;
}

/** Every lane adjacent to `from`. One entry at the edges, two from the centre. */
export function adjacentLanes(from: LaneIndex): readonly LaneIndex[] {
  const lanes: LaneIndex[] = [];
  for (const side of LANE_SIDES) {
    const lane = laneToward(from, side);
    if (lane !== null) lanes.push(lane);
  }
  return lanes;
}

/** Which way `to` lies from `from`. `null` when they are the same lane. */
export function sideBetween(from: LaneIndex, to: LaneIndex): LaneSide | null {
  if (to === from) return null;
  return to < from ? 'left' : 'right';
}

/**
 * Lateral offset of a lane centre in lane widths, measured from the road centre.
 *
 * Returned in lane widths rather than metres so `game-core` never has to know
 * how wide a lane is. The scene multiplies by `MotionProfile.laneWidthMeters`.
 */
export function laneOffset(lane: number): number {
  return lane - (LANE_COUNT - 1) / 2;
}
