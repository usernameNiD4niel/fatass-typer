export {
  advanceDogPack,
  createDogPack,
  DOG_HEIGHT_METERS,
  DOG_TRAITS,
  dogPackView,
} from './dog-pack';
export type {
  DogPackAdvanceInput,
  DogPackInput,
  DogPackState,
  DogPackView,
  DogTrait,
  DogView,
} from './dog-pack';
export { DOG_COLORS, dogHeightPx, drawDog, drawDogPack } from './dog-renderer';
export type { DogDrawOptions, DogPackDrawOptions } from './dog-renderer';
export {
  advanceMcAnimation,
  createMcAnimation,
  crouchRatio,
  isTerminal,
  locomotionFor,
  MC_ANIMATION_STATES,
  play,
  setLocomotion,
  stateDurationMs,
  verticalOffsetRatio,
} from './mc-animation';
export type {
  AdvanceInput,
  McAnimation,
  McAnimationState,
  McLocomotionState,
} from './mc-animation';
export { drawMc, MC_COLORS, MC_HEIGHT_METERS, mcHeightPx } from './mc-renderer';
export type { McDrawOptions } from './mc-renderer';
