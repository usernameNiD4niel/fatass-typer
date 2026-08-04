import {
  adjacentLanes,
  LANE_COUNT,
  sideBetween,
  type LaneIndex,
  type LaneSide,
} from '../models/lane';
import type { ObstacleAction } from '../models/obstacle';
import { nextFloat, pick, type Rng } from '../random';

/**
 * Which lanes a hazard blocks, and which one is the way out.
 *
 * The fairness rule the whole car encounter rests on: **the safe lane is real.**
 * Not "usually open", not "open unless the spawner got unlucky" — the
 * arrangement is constructed so that a route exists, and `isValidArrangement`
 * can prove it afterwards. The PDF calls a blocked-everywhere arrangement an
 * implementation bug, and this module is where that bug is made impossible
 * rather than merely unlikely.
 *
 * The second half of the guarantee lives in the spawner: it refuses to place a
 * hazard while another is unresolved, so nothing can wander into the safe lane
 * during the avoidance window. There is nothing else on the road.
 */

export interface LaneAssignment {
  /** Lanes the player must not be in when the collision plane arrives. */
  readonly blockedLanes: readonly LaneIndex[];
  /** The lane the challenge points at. `null` for jump hazards. */
  readonly safeLane: LaneIndex | null;
  /** Which way the safe lane lies from the player. `null` for jumps. */
  readonly safeSide: LaneSide | null;
}

/**
 * Does this arrangement leave the player a way out?
 *
 * Exported so the spawner and the tests ask the same question of the same code.
 * A predicate the production path also calls is worth more than one that only
 * ever runs under `expect`.
 */
export function isValidArrangement(assignment: LaneAssignment, playerLane: LaneIndex): boolean {
  const blocked = new Set(assignment.blockedLanes);

  // Some route must survive, whatever else is true.
  if (blocked.size >= LANE_COUNT) return false;

  if (assignment.safeLane === null) {
    // A jump hazard: it blocks the lane the player is in and they go over it.
    return blocked.has(playerLane) && assignment.safeSide === null;
  }

  if (blocked.has(assignment.safeLane)) return false;
  if (assignment.safeLane === playerLane) return false;
  // The nominated escape has to be reachable in one move.
  if (!adjacentLanes(playerLane).includes(assignment.safeLane)) return false;

  return assignment.safeSide === sideBetween(playerLane, assignment.safeLane);
}

export interface LaneAssignmentInput {
  readonly action: ObstacleAction;
  readonly playerLane: LaneIndex;
  /**
   * Probability that a second escape is also blocked, when the player is in the
   * centre and there are two. Zero on the early maps: with only one way out the
   * player still has to type, but they do not also have to read which side.
   */
  readonly doubleBlockChance: number;
}

export interface LaneAssignmentResult {
  readonly assignment: LaneAssignment;
  readonly rng: Rng;
}

/**
 * Build a fair arrangement for a hazard about to be placed.
 *
 * Jump hazards are trivial: block the player's lane, no safe side, go over it.
 *
 * Cars block the player's lane and nominate exactly one adjacent lane as the
 * answer. Where the player has two escapes, the other one may *also* be blocked
 * — that is the spec's "vary lane arrangements while preserving a valid route",
 * and it is what stops the middle lane becoming a place where direction never
 * matters. Where the player has only one escape, it is never blocked, because
 * doing so would leave nowhere to go.
 */
export function assignLanes(rng: Rng, input: LaneAssignmentInput): LaneAssignmentResult {
  const { action, playerLane } = input;

  if (action === 'jump') {
    return {
      assignment: { blockedLanes: [playerLane], safeLane: null, safeSide: null },
      rng,
    };
  }

  const escapes = adjacentLanes(playerLane);
  const chosen = pick(rng, escapes);
  let current = chosen.rng;
  // A three-lane road always leaves at least one neighbour, so `pick` cannot
  // come back empty. The fallback keeps the types honest rather than guarding
  // against a case the geometry rules out.
  const safeLane = chosen.value ?? playerLane;

  const blockedLanes: LaneIndex[] = [playerLane];

  if (escapes.length > 1) {
    const roll = nextFloat(current);
    current = roll.rng;
    if (roll.value < input.doubleBlockChance) {
      for (const lane of escapes) {
        if (lane !== safeLane) blockedLanes.push(lane);
      }
    }
  }

  const assignment: LaneAssignment = {
    blockedLanes,
    safeLane,
    safeSide: sideBetween(playerLane, safeLane),
  };

  return { assignment, rng: current };
}

/** Is `lane` one the hazard occupies? */
export function blocksLane(assignment: LaneAssignment, lane: number): boolean {
  return assignment.blockedLanes.some((blocked) => blocked === lane);
}
