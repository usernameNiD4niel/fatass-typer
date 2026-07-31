import {
  charactersMatch,
  commonPrefixLength,
  DEFAULT_TYPING_OPTIONS,
  firstErrorIndex,
  isExactMatch,
} from './comparison';
import type { CharacterState, TypingOptions } from './comparison';

/**
 * A single prompt being typed (spec §5).
 *
 * Immutable and deterministic: `applyInput` takes the input element's current
 * value and returns a new state. No clock, no events, no DOM.
 *
 * Counters are event-based, not recomputed from the final string. Typing a
 * wrong character and fixing it must show up as an error *and* a correction —
 * information a final-string diff throws away.
 */
export interface TypingState {
  /** The text to type, exactly as displayed. */
  readonly target: string;
  /** What the player has entered so far, after any mistake-behavior clamping. */
  readonly typed: string;
  /** Characters entered that matched the target at their position. */
  readonly correctCharacters: number;
  /** Characters entered that did not match. Counted once, when entered. */
  readonly incorrectCharacters: number;
  /** Wrong characters the player noticed and deleted. */
  readonly correctedErrors: number;
  /** Total characters entered, corrections excluded. Drives WPM in step B3. */
  readonly keystrokes: number;
  /** True once `typed` matches `target` exactly. */
  readonly complete: boolean;
}

export function createTypingState(target: string): TypingState {
  return {
    target,
    typed: '',
    correctCharacters: 0,
    incorrectCharacters: 0,
    correctedErrors: 0,
    keystrokes: 0,
    // An empty prompt would otherwise be permanently uncompletable.
    complete: target.length === 0,
  };
}

/**
 * Under `block-until-corrected`, everything after the first mistake is
 * discarded: the wrong character stays visible so the player can see it, but no
 * further progress registers until it is removed.
 */
function clampToMistakeBehavior(target: string, candidate: string, options: TypingOptions): string {
  if (options.mistakeBehavior !== 'block-until-corrected') {
    return candidate;
  }

  const errorIndex = firstErrorIndex(target, candidate, options);

  return errorIndex === -1 ? candidate : candidate.slice(0, errorIndex + 1);
}

/**
 * Applies the input element's current value.
 *
 * Handles insertions, backspaces, and wholesale replacement (select-all, paste)
 * uniformly by diffing against the previous value.
 *
 * Input is ignored once the prompt is complete. The runtime advances to the
 * next prompt on completion, and a late keystroke must not resolve a prompt
 * twice.
 */
export function applyInput(
  state: TypingState,
  value: string,
  options: TypingOptions = DEFAULT_TYPING_OPTIONS,
): TypingState {
  if (state.complete) return state;

  const next = clampToMistakeBehavior(state.target, value, options);
  if (next === state.typed) return state;

  // The diff against the previous value is always case-sensitive: replacing "a"
  // with "A" changed the text, so it is a real keystroke even when the
  // comparison against the *target* folds case.
  const shared = commonPrefixLength(state.typed, next, { ...options, caseSensitive: true });

  let { correctCharacters, incorrectCharacters, correctedErrors, keystrokes } = state;

  // Deletions: a removed character that was wrong counts as a correction.
  for (let index = state.typed.length - 1; index >= shared; index -= 1) {
    if (!charactersMatch(state.target[index], state.typed[index], options)) {
      correctedErrors += 1;
    }
  }

  // Insertions.
  for (let index = shared; index < next.length; index += 1) {
    keystrokes += 1;

    if (charactersMatch(state.target[index], next[index], options)) {
      correctCharacters += 1;
    } else {
      incorrectCharacters += 1;
    }
  }

  return {
    target: state.target,
    typed: next,
    correctCharacters,
    incorrectCharacters,
    correctedErrors,
    keystrokes,
    complete: isExactMatch(state.target, next, options),
  };
}

/**
 * Per-character render states for the target text, one entry per target
 * character.
 *
 * Characters typed *past* the end of the target are not represented here —
 * read them from `overflowText`, which the UI renders as trailing error text.
 */
export function characterStates(
  state: TypingState,
  options: TypingOptions = DEFAULT_TYPING_OPTIONS,
): readonly CharacterState[] {
  const states: CharacterState[] = [];
  const caret = Math.min(state.typed.length, state.target.length);

  for (let index = 0; index < state.target.length; index += 1) {
    if (index < state.typed.length) {
      states.push(
        charactersMatch(state.target[index], state.typed[index], options) ? 'correct' : 'incorrect',
      );
      continue;
    }

    states.push(index === caret && !state.complete ? 'current' : 'untyped');
  }

  return states;
}

/** Characters typed beyond the end of the target. Always an error. */
export function overflowText(state: TypingState): string {
  return state.typed.length > state.target.length ? state.typed.slice(state.target.length) : '';
}

/**
 * Fraction of entered characters that were correct, 0..1.
 *
 * Returns 1 before anything is typed — an untouched prompt is not a failed one.
 * Corrections are deliberately excluded: fixing a mistake does not erase it
 * (spec §7 tracks them as their own statistic).
 */
export function typingAccuracy(state: TypingState): number {
  const entered = state.correctCharacters + state.incorrectCharacters;

  return entered === 0 ? 1 : state.correctCharacters / entered;
}

/** How many target characters remain. */
export function remainingCharacters(state: TypingState): number {
  return Math.max(0, state.target.length - state.typed.length);
}

/** Progress through the prompt, 0..1, based on correct position only. */
export function promptProgress(
  state: TypingState,
  options: TypingOptions = DEFAULT_TYPING_OPTIONS,
): number {
  if (state.target.length === 0) return 1;

  const correctPrefix = commonPrefixLength(state.target, state.typed, options);

  return correctPrefix / state.target.length;
}

/** True when the player currently has an uncorrected mistake on screen. */
export function hasPendingError(
  state: TypingState,
  options: TypingOptions = DEFAULT_TYPING_OPTIONS,
): boolean {
  return firstErrorIndex(state.target, state.typed, options) !== -1;
}
