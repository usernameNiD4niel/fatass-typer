import type { MotionProfile } from '../models/motion';

/**
 * Road a swerve needs, on top of the player's typing budget.
 *
 * The deadline says when the word must be finished. That is not the moment the
 * player is *there*: after the last keystroke they still have to travel
 * sideways into the next lane. The reserve is that travel, expressed as time,
 * and coin placement pushes the line further away by exactly this much.
 *
 * Which is why the deadline and the animation can never disagree: both are
 * derived from the same `MotionProfile`. Change the lane-change duration and
 * coin lines move further off automatically.
 *
 * Note what the reserve is *not*: it is not extra typing time. The player's
 * budget is untouched by it. It is road, not slack.
 *
 * This replaced `motionReserveMs`, which reserved for a jump as well because
 * hazards could ask for one. Nothing on the road is jumped over any more, and
 * nothing collides — the one surviving need is the coin swerve.
 */

/**
 * Margin on top of the bare animation time.
 *
 * The bare reserve is the moment the player *arrives* — the exact instant, to
 * the millisecond. The simulation advances in 16.7ms steps and the collect
 * plane is crossed at whichever step happens to straddle it, so "exactly
 * enough" means a player who typed in time can still be a few millimetres
 * short when the step lands.
 *
 * The margin turns a knife-edge into a window. It costs a fraction of a second
 * of extra road and buys the guarantee that typing the word in time is always
 * enough to reach the coins — which is the only promise coins make.
 */
export const LANE_SAFETY_FACTOR = 1.25;

/** One lane, because one lane is the widest move anything asks for. */
export function laneChangeReserveMs(profile: MotionProfile): number {
  return profile.laneChangeMs * LANE_SAFETY_FACTOR;
}
