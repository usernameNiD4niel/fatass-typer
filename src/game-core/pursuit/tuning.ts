import { flowBufferFor } from '../flow/flow-word';
import type { MapConfig } from '../models/map';
import { DEFAULT_PURSUIT, type PursuitConfig } from './pursuit';

/**
 * The chaser, per map — and the whole of the six-map difficulty ladder.
 *
 * With hazards gone, nothing is instantly fatal. Failure is *cumulative*: the
 * gap moves a little on every word, and a run is lost by a hundred small losses
 * rather than one collision. That means the map's own number has to be visible
 * in the arithmetic of the gap, or a map's label stops deciding anything.
 *
 * ## Where the three bars come from
 *
 * A metronomic typist at fraction `f` of the map's target, on a word whose
 * budget is `buffer` times the typing time, finishes with roughly
 *
 *     margin = 1 - (1 / f) / buffer
 *
 * of the budget left. That is arithmetic, not measurement. So:
 *
 * | Typist | Margin on Map 1 (buffer 1.36) |
 * |---|---|
 * | at the target | ~0.26 |
 * | at 85% of it | ~0.13 |
 * | at 75% of it | ~0.02 |
 *
 * Set `neutralMargin` to exactly what an 85% typist produces and all three
 * progression bars follow as consequences rather than coincidences: the target
 * typist gains ground and finishes, the 85% typist holds level and finishes,
 * and the 75% typist loses ground on every word and is caught partway.
 *
 * The tolerance band stops being a measured accident and becomes a stated rule.
 */

/**
 * The typist the chaser is calibrated to hold level.
 *
 * A little above the bottom of the tolerance band rather than exactly on it.
 * The band's floor is 85%, and calibrating the break-even point *at* 85% left a
 * typist there breaking even on average and losing on variance — a run is a few
 * dozen words, not an infinite sample, and a fair map has to survive a bad
 * draw. Holding level at 83% means 85% drifts forward very slowly and still
 * finishes; 75% loses ground on every word.
 */
export const NEUTRAL_TYPIST_SHARE = 0.85;

/** The margin a typist at `NEUTRAL_TYPIST_SHARE` of the map's target produces. */
export function neutralMarginFor(map: MapConfig): number {
  const buffer = flowBufferFor(map);
  if (buffer <= 0) return 0;

  return Math.max(0, 1 - 1 / NEUTRAL_TYPIST_SHARE / buffer);
}

/**
 * The chaser for this map.
 *
 * Everything except `neutralMargin` is shared: the ladder lives in the buffer,
 * and deriving the break-even point from the buffer is what stops the two
 * drifting apart.
 */
export function pursuitConfigFor(map: MapConfig): PursuitConfig {
  return { ...DEFAULT_PURSUIT, neutralMargin: neutralMarginFor(map) };
}
