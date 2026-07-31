import type { PromptId } from '../models/ids';
import type { PromptCategory, PromptEntry } from '../models/prompt';
import { pick } from '../random/rng';
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
  /** Tags to prefer, for map-themed vocabulary. Never a hard requirement. */
  readonly preferredTags?: readonly string[];
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
export const DEFAULT_HISTORY_SIZE = 5;

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
 * Splits candidates into those matching a preferred tag and the rest.
 * Themed vocabulary is a preference, never a requirement.
 */
function preferTagged(
  candidates: readonly PromptEntry[],
  preferredTags: readonly string[] | undefined,
): readonly PromptEntry[] {
  if (preferredTags === undefined || preferredTags.length === 0) return candidates;

  const tagged = candidates.filter((prompt) =>
    prompt.tags.some((tag) => preferredTags.includes(tag)),
  );

  return tagged.length > 0 ? tagged : candidates;
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

  const candidates = avoidRepeats(preferTagged(eligible, criteria.preferredTags), selector);
  const { value, rng } = pick(selector.rng, candidates);

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
