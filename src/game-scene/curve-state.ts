import { curveOffset, type RoadShape } from './road-curve';

/**
 * Where the road is, this frame.
 *
 * ## Why this is module state
 *
 * Nine components draw things that sit on the road — the surface, the markings,
 * the kerb posts, the gantries, the scenery, the traffic, the coins, the
 * crates, the opponents, the badges and the word. Every one of them needs the
 * same two numbers, and threading a shape and a distance through nine
 * components' props would mean nine chances for one of them to be given the
 * wrong frame's value and drift off the tarmac.
 *
 * The alternative was React context, which re-renders on change — and this
 * changes sixty times a second.
 *
 * It is safe because it is **written in exactly one place**: `GameCanvas`'s
 * `Driver`, at `useFrame` priority `-1`, before anything reads it. That is the
 * same guarantee the `WorldSnapshot` relies on, for the same reason.
 *
 * ## Relative to the player, deliberately
 *
 * `shiftAt(0)` is always zero. The player and the camera stay where they are
 * and the road bends *away* from them, rather than the player sliding sideways
 * along a fixed curve. The second way looks identical from behind and means
 * every lane position in the game would have to be corrected for the bend.
 */

let shape: RoadShape = {
  amplitude: 0,
  longWavelength: 1,
  shortWavelength: 1,
  longPhase: 0,
  shortPhase: 0,
};
let travelled = 0;
let here = 0;

/** Sets the shape for the run. Called once, when the scene mounts. */
export function setRoadShape(next: RoadShape): void {
  shape = next;
  here = curveOffset(shape, travelled);
}

/** Sets how far the player has come. Called once a frame, before anything draws. */
export function setTravelled(meters: number): void {
  travelled = meters;
  here = curveOffset(shape, travelled);
}

/**
 * How far sideways to move something `depthAhead` metres up the road.
 *
 * Zero at the player, growing with distance. Add it to the thing's `x`.
 */
export function shiftAt(depthAhead: number): number {
  if (shape.amplitude === 0) return 0;

  return curveOffset(shape, travelled + depthAhead) - here;
}

/** True when the road is straight, so callers can skip the work entirely. */
export function isStraight(): boolean {
  return shape.amplitude === 0;
}
