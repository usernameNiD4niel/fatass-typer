import { timeToClearanceMs } from '../models/motion';
import type { MotionProfile } from '../models/motion';
import type { ObstacleAction } from '../models/obstacle';

/**
 * Road the avoidance animation needs, on top of the player's typing budget.
 *
 * The deadline says when the word must be finished. That is not the same moment
 * the hazard is survived: after the last keystroke the player still has to
 * *travel* — sideways into the safe lane, or upward over the barrier. The
 * reserve is that travel, expressed as time, and hazard placement pushes the
 * hazard further away by exactly this much.
 *
 * Which is why the deadline and the animation can never disagree: both are
 * derived from the same `MotionProfile`. Change the lane-change duration and
 * cars move further off automatically.
 *
 * Note what the reserve is *not*: it is not extra typing time. The player's
 * budget is untouched by it. It is road, not slack.
 */
/**
 * Margin on top of the bare animation time.
 *
 * The bare reserve is the moment the player *reaches* clearance — the exact
 * instant, to the millisecond. The simulation advances in 16.7ms steps and the
 * collision plane is crossed at whichever step happens to straddle it, so
 * "exactly enough" means a player who committed in time can still be a few
 * millimetres short when the step lands.
 *
 * The margin turns a knife-edge into a window. It costs a fraction of a second
 * of extra road and buys the guarantee that typing the word in time is always
 * enough — which is the promise the whole encounter is built on.
 */
export const MOTION_SAFETY_FACTOR = 1.25;

export function motionReserveMs(action: ObstacleAction, profile: MotionProfile): number {
  return bareReserveMs(action, profile) * MOTION_SAFETY_FACTOR;
}

/** The animation's own length, without the margin. Exported for the tests. */
export function bareReserveMs(action: ObstacleAction, profile: MotionProfile): number {
  switch (action) {
    case 'lane-change':
      /*
       * One lane, because one lane is the widest move that can be asked for.
       *
       * `assignLanes` always nominates a lane *adjacent* to the player — a car
       * can block both neighbours, but the safe lane it points at is never two
       * moves away. This used to reserve for two, which bought road no move ever
       * needed and made every car encounter a second longer than it had to be.
       */
      return profile.laneChangeMs;

    case 'jump':
      // Crouch, then rise — only up to clearance height. The rest of the arc
      // happens over the obstacle, which is the point of it.
      return timeToClearanceMs(profile);
  }
}
