import type { MistakeBehavior } from '../models/settings';

/**
 * Character comparison primitives (spec §5, typing input system).
 *
 * The engine compares whole strings rather than key events. React owns a real
 * focused `<input>` and hands over its current value; reconstructing text from
 * `keydown` is explicitly forbidden by the spec because it breaks IME input,
 * held keys, and browser autocorrect.
 */

export interface TypingOptions {
  /** Case-insensitive by default (spec §5). */
  readonly caseSensitive: boolean;
  readonly mistakeBehavior: MistakeBehavior;
}

export const DEFAULT_TYPING_OPTIONS: TypingOptions = {
  caseSensitive: false,
  mistakeBehavior: 'allow-and-mark',
};

/** How a single target character should be rendered (spec §5). */
export type CharacterState =
  /** Typed correctly. */
  | 'correct'
  /** Typed, but wrong. */
  | 'incorrect'
  /** The character the player is expected to type next — carries the caret. */
  | 'current'
  /** Not reached yet. */
  | 'untyped';

export function charactersMatch(
  expected: string | undefined,
  actual: string | undefined,
  options: TypingOptions,
): boolean {
  if (expected === undefined || actual === undefined) return false;
  if (options.caseSensitive) return expected === actual;

  return expected.toLowerCase() === actual.toLowerCase();
}

/** Number of leading characters two strings share, honoring case sensitivity. */
export function commonPrefixLength(a: string, b: string, options: TypingOptions): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;

  while (index < limit && charactersMatch(a[index], b[index], options)) {
    index += 1;
  }

  return index;
}

/** True when `typed` completes `target` exactly. */
export function isExactMatch(target: string, typed: string, options: TypingOptions): boolean {
  if (typed.length !== target.length) return false;

  return commonPrefixLength(target, typed, options) === target.length;
}

/**
 * Index of the first wrong character, or `-1` if everything typed so far is
 * correct. Characters past the end of the target count as wrong.
 */
export function firstErrorIndex(target: string, typed: string, options: TypingOptions): number {
  for (let index = 0; index < typed.length; index += 1) {
    if (index >= target.length) return index;
    if (!charactersMatch(target[index], typed[index], options)) return index;
  }

  return -1;
}
