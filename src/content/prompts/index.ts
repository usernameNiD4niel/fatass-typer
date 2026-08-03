import type { PromptCategory, PromptEntry } from '../../game-core/models';
import { MEDIUM_PHRASES, SHORT_PHRASES } from './phrases';
import { NUMBERS, PUNCTUATION } from './symbols';
import { THEMED_WORDS } from './themed';
import { LONG_WORDS, MEDIUM_WORDS, SHORT_WORDS } from './words';

/**
 * The whole vocabulary (spec §15).
 *
 * One file per category, assembled here. Adding words means editing a list;
 * nothing else in the game has to know.
 */
export const ALL_PROMPTS: readonly PromptEntry[] = [
  ...SHORT_WORDS,
  ...MEDIUM_WORDS,
  ...LONG_WORDS,
  ...PUNCTUATION,
  ...NUMBERS,
  ...SHORT_PHRASES,
  ...MEDIUM_PHRASES,
  ...THEMED_WORDS,
];

export function promptsInCategory(category: PromptCategory): readonly PromptEntry[] {
  return ALL_PROMPTS.filter((prompt) => prompt.category === category);
}

/** Everything a given map may draw on, before the selector's own filtering. */
export function promptsForMap(mapNumber: number): readonly PromptEntry[] {
  return ALL_PROMPTS.filter((prompt) => prompt.minimumMap <= mapNumber);
}

export { buildPrompts } from './build';
export type { PromptSeed } from './build';
export { MEDIUM_PHRASES, SHORT_PHRASES } from './phrases';
export { NUMBERS, PUNCTUATION } from './symbols';
export { THEMED_WORDS } from './themed';
export { LONG_WORDS, MEDIUM_WORDS, SHORT_WORDS } from './words';
