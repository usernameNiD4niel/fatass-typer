import type { PromptCategory, PromptEntry, PromptUsage } from '../../game-core/models';
import { normalizePromptText } from '../../game-core/models';

/**
 * How a prompt entry is built (spec §15).
 *
 * The content files list text; everything else is derived. `normalizedText`
 * comes from `text` so the two can never disagree, and `difficulty` comes from
 * length within the category's own band rather than being hand-assigned — two
 * hundred hand-tuned numbers would drift out of order the first time anyone
 * added a word.
 */

/**
 * Character counts a category spans, used to place a prompt on 0..1 within it.
 *
 * A six-letter short word is hard *for a short word*; a six-letter phrase would
 * be trivial. Difficulty is only meaningful relative to its own category, which
 * is exactly how the selector uses it.
 */
const CATEGORY_LENGTH_BAND: Readonly<Record<PromptCategory, readonly [number, number]>> = {
  'short-word': [3, 5],
  'medium-word': [6, 8],
  'long-word': [9, 13],
  punctuation: [4, 14],
  number: [2, 8],
  'short-phrase': [8, 14],
  'medium-phrase': [15, 30],
  themed: [4, 12],
};

function difficultyFor(category: PromptCategory, length: number): number {
  const [min, max] = CATEGORY_LENGTH_BAND[category];
  if (max <= min) return 0.5;

  const ratio = (length - min) / (max - min);

  // Rounded so a one-character change does not produce a difficulty with
  // fifteen decimal places in a snapshot or a test failure message.
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100) / 100;
}

export interface PromptSeed {
  readonly text: string;
  /** Lowest map this may appear on. Defaults to 1. */
  readonly minimumMap?: number;
  readonly tags?: readonly string[];
  readonly usage?: PromptUsage;
}

/**
 * Builds the entries for one category.
 *
 * Ids are derived from the category and the text, so a prompt keeps its identity
 * across edits to the list — the selector's repeat-avoidance and any future
 * per-prompt statistics both depend on that.
 */
export function buildPrompts(
  category: PromptCategory,
  seeds: readonly PromptSeed[],
): readonly PromptEntry[] {
  return seeds.map((seed) => {
    const normalizedText = normalizePromptText(seed.text);

    return {
      id: `${category}:${normalizedText.replace(/[^a-z0-9]+/g, '-')}`,
      text: seed.text,
      normalizedText,
      difficulty: difficultyFor(category, normalizedText.length),
      category,
      minimumMap: seed.minimumMap ?? 1,
      usage: seed.usage ?? 'both',
      tags: seed.tags ?? [],
    };
  });
}
