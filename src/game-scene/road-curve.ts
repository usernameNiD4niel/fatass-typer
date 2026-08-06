/**
 * The shape of the road.
 *
 * A straight road is the same road at metre four hundred as at metre four, and
 * after two runs of a map the player has seen all of it. A road that bends is
 * somewhere to be *going*.
 *
 * ## Why it is a drawing trick and not a rule
 *
 * The rules know about three lanes and a distance. They do not know the road
 * has a shape, and they must not: a bend that changed where a lane *was* would
 * change what a swerve costs, and every deadline in the game is placed against
 * a straight line of metres.
 *
 * So the curve is applied at the last moment, in the scene, to everything at
 * once — road surface, markings, kerbs, scenery, traffic, coins, crates,
 * opponents, and the camera. Every one of them is shifted sideways by the same
 * function of how far up the road it is. Nothing's *relationship* to anything
 * else changes, which is exactly why it is safe: lane 0 is still one lane width
 * left of lane 1 at every point, and the player's swerve still costs what it
 * always did.
 *
 * ## Why two waves
 *
 * One sine wave is a road that snakes with a period the eye learns in about ten
 * seconds. Two of different lengths never quite repeat, so the road keeps
 * arriving at bends the player has not seen before — which is the whole reason
 * it is here.
 *
 * Seeded from the run, so the same seed drives the same road.
 */

export interface RoadShape {
  /** How far the road wanders, in metres, at its widest. */
  readonly amplitude: number;
  /** Metres per cycle of the long wave. */
  readonly longWavelength: number;
  /** Metres per cycle of the short one. */
  readonly shortWavelength: number;
  /** Where each wave starts, in radians. */
  readonly longPhase: number;
  readonly shortPhase: number;
}

/**
 * How far the road may wander, in metres.
 *
 * Twelve is about two lane widths, which is enough to be plainly a bend and
 * little enough that the far end of the road never leaves the screen. Beyond
 * about twenty the horizon slides out of frame on the straights, and a player
 * loses the one thing the road is *for*: seeing what is coming.
 */
const MAX_AMPLITUDE_METERS = 12;

/** Below this a run is visibly straight, which is one of the looks. */
const MIN_AMPLITUDE_METERS = 0;

export function roadShapeFor(seed: string): RoadShape {
  const base = hash(seed);
  const pick = (offset: number): number => fraction(base + offset);

  /*
   * A run is sometimes simply straight, and that is deliberate rather than an
   * accident of the range. Variety needs a baseline to vary *from*; if every
   * run bends, bending is the new straight.
   */
  const straight = pick(1) < 0.25;

  return {
    amplitude: straight ? MIN_AMPLITUDE_METERS : MAX_AMPLITUDE_METERS * (0.45 + pick(2) * 0.55),
    longWavelength: 260 + pick(3) * 220,
    shortWavelength: 90 + pick(4) * 70,
    longPhase: pick(5) * Math.PI * 2,
    shortPhase: pick(6) * Math.PI * 2,
  };
}

/**
 * How far the road has wandered sideways, `distance` metres along it.
 *
 * `distance` is *world* distance — the player's own metres plus however far
 * ahead the thing being drawn is — so the bend stays put as the road moves past
 * rather than sliding along with the player.
 */
export function curveOffset(shape: RoadShape, distance: number): number {
  if (shape.amplitude === 0) return 0;

  const long = Math.sin((distance / shape.longWavelength) * Math.PI * 2 + shape.longPhase);
  const short = Math.sin((distance / shape.shortWavelength) * Math.PI * 2 + shape.shortPhase);

  // Weighted toward the long wave: the short one is a kink in a bend, not a
  // bend of its own.
  return shape.amplitude * (long * 0.72 + short * 0.28);
}

/**
 * Which way the road is turning there, as a slope.
 *
 * Used to bank the camera and to point things that should face along the road.
 * Measured rather than differentiated: the arithmetic is the same to three
 * decimal places and this cannot go out of step with `curveOffset` when the
 * shape changes.
 */
export function curveSlope(shape: RoadShape, distance: number): number {
  if (shape.amplitude === 0) return 0;

  const step = 2;

  return (curveOffset(shape, distance + step) - curveOffset(shape, distance - step)) / (step * 2);
}

function hash(seed: string): number {
  let value = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16_777_619);
  }

  return Math.abs(value);
}

/** A stable 0..1 from an integer. */
function fraction(value: number): number {
  const scrambled = Math.sin(value * 0.000_193) * 43_758.545_3;

  return scrambled - Math.floor(scrambled);
}
