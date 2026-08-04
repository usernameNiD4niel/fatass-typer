/**
 * Where the best-distance gate is, and how to label it (plan 2.2).
 *
 * Its own file rather than a corner of `BestLine.tsx`: whether the mark is on
 * screen and whether it has been passed are decisions, and a decision inside a
 * `useFrame` is a decision nothing can check. Keeping it here also keeps the
 * component file exporting only a component, which is what fast refresh needs.
 */

/** How far past the line it stays drawn, in metres. */
export const TRAIL_METERS = 40;

/** How far ahead it becomes visible. Beyond this it is fog. */
export const VISIBLE_AHEAD_METERS = 170;

/** Where the gate is and how to label it, given where the player is. */
export interface BestLineState {
  readonly visible: boolean;
  /** Metres ahead of the player. Negative once passed. */
  readonly aheadMeters: number;
  readonly beaten: boolean;
}

/**
 * The gate's state, as arithmetic rather than as drawing.
 *
 * Extracted so it can be tested: whether the mark is on screen and whether it
 * has been passed are decisions, and a decision buried in `useFrame` is a
 * decision nothing can check.
 */
export function bestLineState(bestMeters: number, playerMeters: number): BestLineState {
  const aheadMeters = bestMeters - playerMeters;

  return {
    aheadMeters,
    visible: bestMeters > 0 && aheadMeters < VISIBLE_AHEAD_METERS && aheadMeters > -TRAIL_METERS,
    // The moment it is behind them, rather than at some margin past it: the
    // player crossed it, and saying so late would describe a different event.
    beaten: aheadMeters <= 0,
  };
}
