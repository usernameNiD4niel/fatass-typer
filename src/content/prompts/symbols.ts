import type { PromptEntry } from '../../game-core/models';
import { buildPrompts } from './build';

/**
 * Punctuation and numbers (spec §15).
 *
 * Both are deliberately awkward — they are the reason a typist's speed on prose
 * does not transfer — so they start on later maps and stay short.
 *
 * Spec §15 asks that punctuation prompts be *intentional*. Every entry here is a
 * shape a person actually types: a contraction, a hyphenated word, a clause with
 * a comma. None of them are decorative symbol soup, which teaches nothing and
 * reads as a typo.
 */

export const PUNCTUATION: readonly PromptEntry[] = buildPrompts('punctuation', [
  { text: "don't", minimumMap: 2 },
  { text: "can't", minimumMap: 2 },
  { text: "won't", minimumMap: 2 },
  { text: "it's", minimumMap: 2 },
  { text: "they're", minimumMap: 3 },
  { text: 'left-hand', minimumMap: 3 },
  { text: 'well-lit', minimumMap: 3 },
  { text: 'half-open', minimumMap: 3 },
  { text: 'stop, look', minimumMap: 3 },
  { text: 'go, now!', minimumMap: 3 },
  { text: 'wait — no', minimumMap: 4 },
  { text: 'faster!', minimumMap: 2 },
  { text: 'again?', minimumMap: 2 },
  { text: 'nearly...', minimumMap: 3 },
  { text: 'left; right', minimumMap: 5 },
  { text: '"keep going"', minimumMap: 5 },
  { text: "the driver's side", minimumMap: 4 },
  { text: 'up-and-over', minimumMap: 4 },
]);

/**
 * Numbers, as they appear on a street: door numbers, speeds, times.
 *
 * The digit row is a different motion from the home row, so these stay short
 * even on the late maps.
 */
export const NUMBERS: readonly PromptEntry[] = buildPrompts('number', [
  { text: '42', minimumMap: 2 },
  { text: '17', minimumMap: 2 },
  { text: '90', minimumMap: 2 },
  { text: '256', minimumMap: 3 },
  { text: '108', minimumMap: 3 },
  { text: '2024', minimumMap: 3 },
  { text: '30 mph', minimumMap: 4 },
  { text: '5 km', minimumMap: 3 },
  { text: '12:45', minimumMap: 4 },
  { text: '3 lanes', minimumMap: 3 },
  { text: '60 wpm', minimumMap: 4 },
  { text: '1,200', minimumMap: 5 },
  { text: '99', minimumMap: 2 },
  { text: '7 steps', minimumMap: 4 },
]);
