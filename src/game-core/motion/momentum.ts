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
 * What a single wrong character costs.
 *
 * Small, and deliberately so: a mistake already breaks the combo and hands the
 * chaser ground. This is a third cost on the same keystroke, so it has to be
 * felt as a dip rather than as a punishment — a run of four or five mistakes
 * drops the player a whole band, one does not.
 */
export const MISTAKE_COST = 0.06;

/**
 * Momentum after `deltaMs` of not typing.
 *
 * **Speed is kept, not leaked.** It used to drain continuously toward zero, so
 * a player who typed well and then paused for breath watched the road slow
 * under them for no reason they had control over. What is left is a floor: a
 * player who has stopped typing altogether coasts back to the pace the map's
 * own audience holds, and no further.
 *
 * `fullDecayMs` is how long it takes to fall back to that floor — the map's
 * `boost.durationMs`, same dial, same units.
 */
export function decayMomentum(momentum: number, deltaMs: number, fullDecayMs: number): number {
  // Never *raises* momentum. The floor is something a player falls back to,
  // not something they are handed — a run opens at base speed and the first
  // word is what lifts it.
  if (momentum <= COASTING_FLOOR) return momentum;
  if (fullDecayMs <= 0) return COASTING_FLOOR;

  return Math.max(COASTING_FLOOR, momentum - deltaMs / fullDecayMs);
}

/**
 * The pace a player holds while typing nothing at all.
 *
 * Not zero, because base speed with nothing on top is slower than the map was
 * ever tuned around, and because a player who is reading rather than typing
 * should not feel the world sag. It is the same floor a scraped-in word pays.
 */
export const COASTING_FLOOR = MARGIN_FLOOR_SHARE;

/** Momentum after a wrong character. Slightly slower, never stopped. */
export function penaliseMomentum(momentum: number): number {
  return Math.max(0, momentum - MISTAKE_COST);
}

/**
 * Momentum after finishing a word worth `share`.
 *
 * The better of the two, not the sum. Momentum is how well the player is
 * *currently* typing, and adding would let a burst of easy words bank speed
 * that outlives the typing that earned it — while taking the better of the two
 * means a good word is never undone by an easy one that followed it.
 */
export function topUpMomentum(momentum: number, share: number): number {
  return Math.min(1, Math.max(momentum, Math.max(0, share)));
}

/** Speed multiplier for a momentum level, 1..`speedMultiplier`. */
export function momentumMultiplier(momentum: number, speedMultiplier: number): number {
  return 1 + (speedMultiplier - 1) * Math.max(0, Math.min(1, momentum));
}
