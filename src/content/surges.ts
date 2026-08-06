import { buildPrompts } from './prompts/build';
import type { PromptEntry } from '../game-core/models';

/**
 * Surge sentences.
 *
 * Long — a dozen words or so, four times anything else the game asks for.
 * Length is the mechanic: one wrong character ends a surge, so what is being
 * tested is whether a rhythm can be *held*, and a short sentence cannot test
 * that.
 *
 * Deliberately **not** part of `ALL_PROMPTS`. These never appear as a flow
 * word, a coin word or a crate, and they do not advance the map's secret: a
 * surge would swallow a dozen words of the sentence at once and the secret's
 * pacing is the reason a run reads as one piece of writing.
 *
 * Plain words on purpose. No punctuation and no numbers — a surge is already
 * asking for endurance, and adding the two categories that break a rhythm would
 * be asking for two things at once.
 */
export const SURGES: readonly PromptEntry[] = buildPrompts('medium-phrase', [
  /*
   * Graded by length, and that is not decoration.
   *
   * A surge is capped at twenty seconds, so what counts as "long" depends on
   * the map: at 20 WPM a player can hold about thirty characters together in
   * that time, and at 50 WPM about eighty. `pickSurge` takes the longest one a
   * typist at the map's own speed could finish, so the early maps get the short
   * end of this list and Map 6 gets the far end. Without the short ones, Map 1
   * would be handed a sentence nobody could ever complete — which is a
   * punishment wearing a reward's clothes.
   */

  /* ~30 characters. Long for a 20 WPM map. */
  { text: 'keep going and do not stop', minimumMap: 1 },
  { text: 'the gap is closing already', minimumMap: 1 },
  { text: 'one word then the next one', minimumMap: 1 },
  { text: 'hold the line and breathe', minimumMap: 1 },

  /* ~45 characters. */
  { text: 'the road ahead is long and you are still on it', minimumMap: 1 },
  { text: 'every runner here started exactly where you are', minimumMap: 1 },
  { text: 'let the gap close on its own and keep typing', minimumMap: 1 },
  { text: 'there is more left in this than you think', minimumMap: 1 },

  /* ~60 characters. */
  { text: 'keep your eyes forward and let the rest of it happen on its own', minimumMap: 1 },
  { text: 'nothing behind you can be fixed by looking over your shoulder', minimumMap: 1 },
  { text: 'a long stretch of open road is a gift if you have legs for it', minimumMap: 1 },

  /* ~75 characters. Only the fastest maps ever ask for these. */
  {
    text: 'the road ahead is long and the only way to finish it is one word at a time',
    minimumMap: 1,
  },
  {
    text: 'you have already come further than the two of them ever expected you to',
    minimumMap: 1,
  },
  {
    text: 'the city goes past whether you are quick today or whether you are not',
    minimumMap: 1,
  },
]);
