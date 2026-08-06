/**
 * Momentum — the player's speed, as something they hold rather than something
 * that is handed to them.
 *
 * ## Why it is not a timer
 *
 * Speed used to be a boost with a duration: clearing a hazard set
 * `boostRemainingMs` to two or three seconds, and it ran down. That worked when
 * a hazard arrived every ten seconds. It cannot work now that a word completes
 * every second or two — a timer refreshed that often never lapses, and a boost
 * that is always on is not a boost, it is the base speed with extra steps.
 *
 * So momentum is a *level*, 0..1, not a countdown. It drains continuously and
 * every completed word tops it back up by what that word was worth. Type well
 * and it sits near the top; hesitate and it sags. The player can see their own
 * typing in the speed of the road, which is the thing the old timer could never
 * show.
 *
 * Pure: no clock, no randomness, no DOM.
 */

/**
 * The band of margins a run actually produces.
 *
 * Measured across all six maps at 1×, 1.25×, 1.6× and 2.2× their target speed:
 * margins run from about 0.24 at the advertised speed to about 0.67 at more
 * than twice it. They never approach 1, and they cannot — typing the word is
 * most of what the budget is for.
 *
 * Mapping raw margin straight onto the boost range therefore wasted over half
 * of it: a target-speed typist got 1.13× of an available 1.55×, and the cap was
 * unreachable by anybody. Stretching the attainable band across the whole range
 * is what makes the reward legible.
 */
export const MARGIN_BAND_FLOOR = 0.15;
export const MARGIN_BAND_CEILING = 0.65;

/**
 * The share of the map's speed a scraped-in word still pays.
 *
 * Not zero. A player typing at exactly the speed on the card is the audience the
 * map was written for, and leaving them unboosted would make every map slower
 * than its own label — punishing them for being precisely what was asked.
 */
export const MARGIN_FLOOR_SHARE = 0.3;

/**
 * Momentum below which the player is not meaningfully boosting.
 *
 * The threshold exists so `boostStarted` / `boostEnded` still have edges to fire
 * on. A level that decays continuously has no natural moment of ending, and the
 * audio and the scene both want one.
 */
export const BOOSTING_THRESHOLD = 0.15;

/**
 * What finishing a word at this margin is worth, 0..1.
 *
 * Linear across the band, rather than squared as the score is. The score is
 * where the game asks the player to reach; speed is where it has to stay
 * honest, and a squared curve here would leave a competent-but-not-fast player
 * crawling.
 */
export function momentumShare(marginFraction: number): number {
  const banded = (marginFraction - MARGIN_BAND_FLOOR) / (MARGIN_BAND_CEILING - MARGIN_BAND_FLOOR);

  return MARGIN_FLOOR_SHARE + (1 - MARGIN_FLOOR_SHARE) * Math.max(0, Math.min(1, banded));
}

/**
 * Momentum after `deltaMs` of not typing.
 *
 * `fullDecayMs` is how long a full bar takes to reach nothing — the map's
 * `boost.durationMs`, which used to be the length of a single boost and is now
 * the length of the whole drain. Same dial, same units, a meaning that fits
 * what it now controls.
 */
export function decayMomentum(momentum: number, deltaMs: number, fullDecayMs: number): number {
  if (fullDecayMs <= 0) return 0;

  return Math.max(0, momentum - deltaMs / fullDecayMs);
}

/**
 * Momentum after finishing a word worth `share`.
 *
 * The better of the two, not the sum. Momentum is how well the player is
 * *currently* typing, and adding would let a burst of easy words bank speed
 * that outlives the typing that earned it.
 */
export function topUpMomentum(momentum: number, share: number): number {
  return Math.min(1, Math.max(momentum, Math.max(0, share)));
}

/** Speed multiplier for a momentum level, 1..`speedMultiplier`. */
export function momentumMultiplier(momentum: number, speedMultiplier: number): number {
  return 1 + (speedMultiplier - 1) * Math.max(0, Math.min(1, momentum));
}
