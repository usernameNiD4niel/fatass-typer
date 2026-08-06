import { PLAYER_HEIGHT_METERS } from '../scene-config';

/**
 * The runner's proportions, as data.
 *
 * Separated from the component because a limb length is referenced three times
 * — by the joint that carries it, by the mesh offset inside that joint, and by
 * the joint hanging off its end — and a figure whose knee is half a centimetre
 * away from its shin is the kind of thing that is obvious on screen and
 * invisible in the diff.
 *
 * Everything is a fraction of `PLAYER_HEIGHT_METERS`, so the character can be
 * resized without re-deriving twenty numbers.
 */

const H = PLAYER_HEIGHT_METERS;

export const RIG = {
  /** Hip height. Everything above hangs from here. */
  hipHeight: H * 0.47,
  thighLength: H * 0.24,
  shinLength: H * 0.23,
  /** Limb radii. The character is heavy-set and the legs carry it. */
  thighRadius: H * 0.062,
  shinRadius: H * 0.05,
  hipHalfWidth: H * 0.085,

  torsoHeight: H * 0.3,
  torsoRadius: H * 0.135,
  /** The belly, as a separate scaled sphere. It is the silhouette. */
  bellyRadius: H * 0.155,
  bellyDrop: H * 0.05,
  bellyPush: H * 0.045,

  shoulderHalfWidth: H * 0.145,
  shoulderHeight: H * 0.29,
  upperArmLength: H * 0.17,
  forearmLength: H * 0.16,
  upperArmRadius: H * 0.045,
  forearmRadius: H * 0.038,

  neckHeight: H * 0.045,
  headRadius: H * 0.088,

  footLength: H * 0.115,
  footHeight: H * 0.035,
  footWidth: H * 0.07,
  /** Ball joints, at every hinge. This is what makes a limb read as rounded. */
  jointRadius: H * 0.052,
} as const;

export const RUNNER_COLORS = {
  skin: '#e0a882',
  shirt: '#2f6fd0',
  shirtDark: '#265ba9',
  shorts: '#2b3440',
  shoe: '#22262c',
  hair: '#4a3728',
} as const;
