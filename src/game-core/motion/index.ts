export { clamp01, easeInOutCubic, easeOutCubic, lerp, parabolicArc } from './easing';

export {
  advanceMotion,
  beginJump,
  beginLaneChange,
  createPlayerMotion,
  crouchDepth,
  isSettled,
  JUMP_PHASES,
  jumpHeightMeters,
  jumpPhase,
  lanePosition,
  lateralOffset,
  plannedJumpMs,
  transitionProgress,
} from './player-motion';
export type { JumpPhase, JumpState, LaneTransition, PlayerMotion } from './player-motion';

export { rampedSpeed } from './speed';
