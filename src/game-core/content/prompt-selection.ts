import type { PromptId } from '../models/ids';
import type { PromptCategory, PromptEntry } from '../models/prompt';
import { nextFloat, pick } from '../random/rng';
import type { Rng } from '../random/rng';

/**
 * Prompt selection (spec §15).
 *
 * Requirements this satisfies:
 *   - filter by map, category, and intended use
 *   - prevent immediate repetition
 *   - stay fully deterministic under a fixed seed
 *
 * The selector carries its own generator, so a run seeded identically produces
 * an identical sequence of prompts — which is what makes gameplay testable.
 */

export interface PromptCriteria {
  /** 1-based map number. Prompts above this are excluded. */
  readonly mapNumber: number;
  /** Categories this map draws from. Empty means any category. */
  readonly categories: readonly PromptCategory[];
  /** Which kind of prompt is needed. */
  readonly usage: 'boost' | 'obstacle';
  /** Optional difficulty band, 0..1. */
  readonly minDifficulty?: number;
  readonly maxDifficulty?: number;
  /**
   * Longest prompt to consider, in characters.
   *
   * Used for the first prompt of a run: the gap only opens while boosting, and
   * a boost is only earned by finishing something. Opening on a phrase that
   * takes longer to type than the starting gap survives is a run lost before
   * the player has done anything wrong.
   */
  readonly maxCharacters?: number;
  /** Tags to prefer, for map-themed vocabulary. Never a hard requirement. */
  readonly preferredTags?: readonly string[];
  /**
   * How often a themed prompt is drawn, 0..1. Defaults to
   * `DEFAULT_THEMED_SHARE`.
   */
  readonly themedShare?: number;
}

/** Prompts that satisfy the hard filters. */
export function filterPrompts(
  pool: readonly PromptEntry[],
  criteria: PromptCriteria,
): readonly PromptEntry[] {
  const min = criteria.minDifficulty ?? 0;
  const max = criteria.maxDifficulty ?? 1;

  return pool.filter((prompt) => {
    if (prompt.minimumMap > criteria.mapNumber) return false;
    if (prompt.usage !== 'both' && prompt.usage !== criteria.usage) return false;
    if (prompt.difficulty < min || prompt.difficulty > max) return false;
    if (
      criteria.maxCharacters !== undefined &&
      prompt.normalizedText.length > criteria.maxCharacters
    ) {
      return false;
    }
    if (criteria.categories.length > 0 && !criteria.categories.includes(prompt.category)) {
      return false;
    }

    return true;
  });
}

export interface PromptSelector {
  readonly rng: Rng;
  /** Most recently issued prompt ids, newest last. */
  readonly recentIds: readonly PromptId[];
  /** How many recent prompts to avoid repeating. */
  readonly historySize: number;
}

/**
 * Default history depth.
 *
 * Deep enough that a map with a healthy vocabulary does not feel repetitive,
 * shallow enough that a small themed pool is not starved.
 */
export const DEFAULT_HISTORY_SIZE = 8;

/**
 * How much of a run is themed vocabulary.
 *
 * Themed prompts are the flavour of a map, and there are only a handful per
 * theme — six on Map 1. Drawing them *whenever they exist* turned a pool of 78
 * words into a loop of six, on every map, which is the bug this constant
 * exists to prevent. One prompt in three keeps the theme audible without the
 * run becoming a chant.
 */
export const DEFAULT_THEMED_SHARE = 1 / 3;

export function createPromptSelector(rng: Rng, historySize = DEFAULT_HISTORY_SIZE): PromptSelector {
  return { rng, recentIds: [], historySize: Math.max(0, historySize) };
}

function remember(selector: PromptSelector, id: PromptId): readonly PromptId[] {
  if (selector.historySize === 0) return [];

  return [...selector.recentIds, id].slice(-selector.historySize);
}

/**
 * Narrows candidates to those not recently used.
 *
 * Falls back progressively rather than failing: full history, then only the
 * immediately previous prompt, then everything. A small themed pool must still
 * produce prompts — it just repeats sooner. Back-to-back repetition is the one
 * thing never allowed while an alternative exists.
 */
function avoidRepeats(
  candidates: readonly PromptEntry[],
  selector: PromptSelector,
): readonly PromptEntry[] {
  if (candidates.length <= 1 || selector.recentIds.length === 0) return candidates;

  const recent = new Set(selector.recentIds);
  const fresh = candidates.filter((prompt) => !recent.has(prompt.id));
  if (fresh.length > 0) return fresh;

  const previous = selector.recentIds[selector.recentIds.length - 1];
  const notPrevious = candidates.filter((prompt) => prompt.id !== previous);

  return notPrevious.length > 0 ? notPrevious : candidates;
}

/**
 * Narrows to themed vocabulary *some* of the time.
 *
 * A preference, and genuinely one: the roll travels with the generator, so the
 * sequence stays deterministic under a fixed seed. Falls back to the whole set
 * whenever the theme has nothing to offer.
 */
function preferTagged(
  candidates: readonly PromptEntry[],
  preferredTags: readonly string[] | undefined,
  share: number,
  rng: Rng,
): { readonly candidates: readonly PromptEntry[]; readonly rng: Rng } {
  if (preferredTags === undefined || preferredTags.length === 0 || share <= 0) {
    return { candidates, rng };
  }

  const roll = nextFloat(rng);
  if (roll.value >= share) return { candidates, rng: roll.rng };

  const tagged = candidates.filter((prompt) =>
    prompt.tags.some((tag) => preferredTags.includes(tag)),
  );

  return { candidates: tagged.length > 0 ? tagged : candidates, rng: roll.rng };
}

export interface PromptSelectionResult {
  /** `null` only when no prompt in the pool satisfies the hard filters. */
  readonly prompt: PromptEntry | null;
  readonly selector: PromptSelector;
}

/** Draws the next prompt and advances the selector. */
export function nextPrompt(
  selector: PromptSelector,
  pool: readonly PromptEntry[],
  criteria: PromptCriteria,
): PromptSelectionResult {
  const eligible = filterPrompts(pool, criteria);
  if (eligible.length === 0) return { prompt: null, selector };

  const themed = preferTagged(
    eligible,
    criteria.preferredTags,
    criteria.themedShare ?? DEFAULT_THEMED_SHARE,
    selector.rng,
  );
  const candidates = avoidRepeats(themed.candidates, selector);
  const { value, rng } = pick(themed.rng, candidates);

  if (value === null) return { prompt: null, selector: { ...selector, rng } };

  return {
    prompt: value,
    selector: { ...selector, rng, recentIds: remember(selector, value.id) },
  };
}

/**
 * Draws several prompts in sequence — for pre-generating a run so timing can be
 * validated before the player starts.
 */
export function nextPrompts(
  selector: PromptSelector,
  pool: readonly PromptEntry[],
  criteria: PromptCriteria,
  count: number,
): { readonly prompts: readonly PromptEntry[]; readonly selector: PromptSelector } {
  const prompts: PromptEntry[] = [];
  let current = selector;

  for (let index = 0; index < count; index += 1) {
    const result = nextPrompt(current, pool, criteria);
    current = result.selector;

    if (result.prompt === null) break;
    prompts.push(result.prompt);
  }

  return { prompts, selector: current };
}
