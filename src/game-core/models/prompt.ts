import { isIntegerAtLeast, isNonEmptyString, isRatio, isRecord, isStringArray } from './guards';
import type { PromptId } from './ids';

export type { PromptId };

/**
 * Typing content (spec §15).
 *
 * Prompts are pure data. Selection, timing, and difficulty scaling read these
 * fields; the content files never encode behavior.
 */

export const PROMPT_CATEGORIES = [
  'short-word',
  'medium-word',
  'long-word',
  'punctuation',
  'number',
  'short-phrase',
  'medium-phrase',
  'themed',
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

const PROMPT_CATEGORY_LOOKUP: ReadonlySet<string> = new Set(PROMPT_CATEGORIES);

export function isPromptCategory(value: unknown): value is PromptCategory {
  return typeof value === 'string' && PROMPT_CATEGORY_LOOKUP.has(value);
}

/** Where a prompt can appear. Obstacle prompts carry a deadline; boost prompts do not. */
export type PromptUsage = 'boost' | 'obstacle' | 'both';

export interface PromptEntry {
  readonly id: PromptId;
  /** Exactly what the player sees, including punctuation and capitalization. */
  readonly text: string;
  /**
   * `text` reduced to the form used for comparison — lowercased, whitespace
   * collapsed. Precomputed so the typing engine never normalizes per keystroke.
   */
  readonly normalizedText: string;
  /** Relative difficulty within its category, 0..1. Tuning input, not a gate. */
  readonly difficulty: number;
  readonly category: PromptCategory;
  /** Lowest map number this may appear on. Keeps obscure text out of Map 1. */
  readonly minimumMap: number;
  readonly usage: PromptUsage;
  readonly tags: readonly string[];
}

/**
 * Normalizes prompt text for comparison: lowercase, trimmed, inner whitespace
 * collapsed to single spaces.
 *
 * Ambiguous whitespace is a content bug (spec §15) — this makes it impossible
 * for a stray double space to become an untypeable prompt.
 */
export function normalizePromptText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Characters that count toward typing time, including spaces and punctuation
 * (spec §6). Uses the normalized form so trailing whitespace never inflates a
 * deadline.
 */
export function effectiveCharacterCount(prompt: Pick<PromptEntry, 'normalizedText'>): number {
  return prompt.normalizedText.length;
}

export function isPromptEntry(value: unknown): value is PromptEntry {
  if (!isRecord(value)) return false;

  const usage = value['usage'];

  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['text']) &&
    isNonEmptyString(value['normalizedText']) &&
    isRatio(value['difficulty']) &&
    isPromptCategory(value['category']) &&
    isIntegerAtLeast(value['minimumMap'], 1) &&
    (usage === 'boost' || usage === 'obstacle' || usage === 'both') &&
    isStringArray(value['tags'])
  );
}

/**
 * Content-authoring guard: the stored `normalizedText` must actually be the
 * normalization of `text`. A mismatch makes prompts impossible to complete.
 */
export function hasConsistentNormalization(prompt: PromptEntry): boolean {
  return prompt.normalizedText === normalizePromptText(prompt.text);
}
