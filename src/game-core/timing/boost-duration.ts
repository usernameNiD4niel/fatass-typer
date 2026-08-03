import type { BoostProfile } from '../models/map';

/**
 * How long a boost lasts (spec §5).
 *
 * A flat duration made a run's difficulty depend on the luck of its draw.
 * Typing "the finish line is close" takes four times as long as typing "curb"
 * and used to buy exactly the same two and a half seconds of speed, while the
 * dogs gained the whole time — so a phrase-heavy run was harder than a
 * word-heavy one through no decision the player made.
 *
 * So the duration scales with length. And it is sized to the prompt the boost
 * has to carry the player *through* — the one just drawn, not the one just
 * finished. Sizing it backwards left the same cliff one prompt later: finish a
 * short word, draw a twenty-character phrase, and the boost expires halfway
 * through it with the dogs closing.
 *
 * The clamps stop a one-character prompt from being free speed and a very long
 * phrase from carrying the player halfway to the finish line.
 */

/** The prompt length `BoostProfile.durationMs` is quoted for. */
export const REFERENCE_PROMPT_CHARACTERS = 7;

export const MIN_BOOST_SCALE = 0.8;
export const MAX_BOOST_SCALE = 3;

export function boostDurationMs(boost: BoostProfile, characterCount: number): number {
  const characters = Math.max(0, characterCount);
  const raw = characters / REFERENCE_PROMPT_CHARACTERS;
  const scale = Math.min(MAX_BOOST_SCALE, Math.max(MIN_BOOST_SCALE, raw));

  return boost.durationMs * scale;
}
