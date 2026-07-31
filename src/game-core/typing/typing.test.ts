import { describe, expect, it } from 'vitest';
import {
  charactersMatch,
  commonPrefixLength,
  DEFAULT_TYPING_OPTIONS,
  firstErrorIndex,
  isExactMatch,
} from './comparison';
import type { TypingOptions } from './comparison';
import {
  applyInput,
  characterStates,
  createTypingState,
  hasPendingError,
  overflowText,
  promptProgress,
  remainingCharacters,
  typingAccuracy,
} from './session';
import type { TypingState } from './session';

const CASE_SENSITIVE: TypingOptions = { ...DEFAULT_TYPING_OPTIONS, caseSensitive: true };
const BLOCKING: TypingOptions = {
  ...DEFAULT_TYPING_OPTIONS,
  mistakeBehavior: 'block-until-corrected',
};

/** Types a string one character at a time, as a real player would. */
function type(
  target: string,
  text: string,
  options: TypingOptions = DEFAULT_TYPING_OPTIONS,
): TypingState {
  let state = createTypingState(target);

  for (let index = 1; index <= text.length; index += 1) {
    state = applyInput(state, text.slice(0, index), options);
  }

  return state;
}

describe('character comparison', () => {
  it('folds case by default', () => {
    expect(charactersMatch('R', 'r', DEFAULT_TYPING_OPTIONS)).toBe(true);
    expect(charactersMatch('R', 'r', CASE_SENSITIVE)).toBe(false);
  });

  it('treats missing characters as non-matching', () => {
    expect(charactersMatch(undefined, 'a', DEFAULT_TYPING_OPTIONS)).toBe(false);
    expect(charactersMatch('a', undefined, DEFAULT_TYPING_OPTIONS)).toBe(false);
  });

  it('measures the shared prefix', () => {
    // "run fa" is shared; the seventh character differs.
    expect(commonPrefixLength('run fast', 'run far', DEFAULT_TYPING_OPTIONS)).toBe(6);
    expect(commonPrefixLength('run', 'RUN', DEFAULT_TYPING_OPTIONS)).toBe(3);
    expect(commonPrefixLength('run', 'RUN', CASE_SENSITIVE)).toBe(0);
  });

  it('locates the first mistake, counting overflow as a mistake', () => {
    expect(firstErrorIndex('crate', 'crate', DEFAULT_TYPING_OPTIONS)).toBe(-1);
    expect(firstErrorIndex('crate', 'crute', DEFAULT_TYPING_OPTIONS)).toBe(2);
    expect(firstErrorIndex('crate', 'crates', DEFAULT_TYPING_OPTIONS)).toBe(5);
  });

  it('requires an exact length for a match', () => {
    expect(isExactMatch('crate', 'crate', DEFAULT_TYPING_OPTIONS)).toBe(true);
    expect(isExactMatch('crate', 'crat', DEFAULT_TYPING_OPTIONS)).toBe(false);
    expect(isExactMatch('crate', 'crates', DEFAULT_TYPING_OPTIONS)).toBe(false);
  });
});

describe('typing a prompt', () => {
  it('starts empty and incomplete', () => {
    const state = createTypingState('crate');

    expect(state.typed).toBe('');
    expect(state.complete).toBe(false);
    expect(typingAccuracy(state)).toBe(1);
    expect(remainingCharacters(state)).toBe(5);
  });

  it('treats an empty prompt as already complete', () => {
    expect(createTypingState('').complete).toBe(true);
  });

  it('completes when the whole prompt is typed correctly', () => {
    const state = type('crate', 'crate');

    expect(state.complete).toBe(true);
    expect(state.correctCharacters).toBe(5);
    expect(state.incorrectCharacters).toBe(0);
    expect(typingAccuracy(state)).toBe(1);
  });

  it('completes regardless of case by default', () => {
    expect(type('Crate', 'crate').complete).toBe(true);
    expect(type('Crate', 'crate', CASE_SENSITIVE).complete).toBe(false);
  });

  it('handles spaces and punctuation in phrases', () => {
    const state = type('run, fat man!', 'run, fat man!');

    expect(state.complete).toBe(true);
    expect(state.correctCharacters).toBe(13);
  });

  it('counts a wrong character once, when it is entered', () => {
    const state = type('crate', 'crute');

    expect(state.incorrectCharacters).toBe(1);
    expect(state.correctCharacters).toBe(4);
    expect(state.complete).toBe(false);
    expect(typingAccuracy(state)).toBeCloseTo(0.8, 5);
  });

  it('ignores further input once complete, preventing double resolution', () => {
    const complete = type('crate', 'crate');
    const after = applyInput(complete, 'crates');

    expect(after).toBe(complete);
  });

  it('never mutates the state it is given', () => {
    const state = createTypingState('crate');
    const snapshot = { ...state };

    applyInput(state, 'c');

    expect(state).toEqual(snapshot);
  });
});

describe('backspace and corrections', () => {
  it('records a correction when a wrong character is deleted', () => {
    let state = type('crate', 'cru');
    expect(state.incorrectCharacters).toBe(1);

    state = applyInput(state, 'cr');
    expect(state.correctedErrors).toBe(1);
    // The mistake still happened — correcting it does not erase it.
    expect(state.incorrectCharacters).toBe(1);
  });

  it('does not record a correction when deleting a correct character', () => {
    let state = type('crate', 'cra');
    state = applyInput(state, 'cr');

    expect(state.correctedErrors).toBe(0);
  });

  it('lets the player recover and finish after a mistake', () => {
    let state = type('crate', 'cru');
    state = applyInput(state, 'cr');
    state = applyInput(state, 'cra');
    state = applyInput(state, 'crat');
    state = applyInput(state, 'crate');

    expect(state.complete).toBe(true);
    expect(state.correctedErrors).toBe(1);
    expect(state.incorrectCharacters).toBe(1);
    // c, r correct; u wrong; then a, t, e correct after the fix.
    expect(state.correctCharacters).toBe(5);
    expect(state.keystrokes).toBe(6);
  });

  it('handles deleting several characters at once', () => {
    let state = type('crate', 'crxyz');
    expect(state.incorrectCharacters).toBe(3);

    state = applyInput(state, 'cr');
    expect(state.correctedErrors).toBe(3);
  });

  it('handles clearing the field entirely', () => {
    let state = type('crate', 'crat');
    state = applyInput(state, '');

    expect(state.typed).toBe('');
    expect(state.keystrokes).toBe(4);
    expect(state.complete).toBe(false);
  });

  it('treats a case-only retype as a real keystroke that costs no accuracy', () => {
    let state = type('crate', 'c');

    // The player really did press a key, so it counts — but with case folding on
    // "C" is still correct, so accuracy is untouched and nothing is a correction.
    state = applyInput(state, 'C');

    expect(state.typed).toBe('C');
    expect(state.keystrokes).toBe(2);
    expect(state.correctedErrors).toBe(0);
    expect(state.incorrectCharacters).toBe(0);
    expect(typingAccuracy(state)).toBe(1);
  });
});

describe('overflow past the end of the prompt', () => {
  it('cannot happen by typing one character at a time', () => {
    // Reaching "cratex" means passing through "crate", which completes the
    // prompt — and completed prompts ignore further input.
    const state = type('crate', 'cratex');

    expect(state.complete).toBe(true);
    expect(state.typed).toBe('crate');
  });

  it('marks extra characters as errors when input arrives in bulk', () => {
    // A fast typist can outrun a frame, so the input element hands over more
    // than one new character at once.
    const state = applyInput(createTypingState('crate'), 'cratex');

    expect(state.complete).toBe(false);
    expect(state.correctCharacters).toBe(5);
    expect(state.incorrectCharacters).toBe(1);
    expect(overflowText(state)).toBe('x');
  });

  it('marks extra characters as errors after an earlier mistake', () => {
    const state = type('crate', 'cratzx');

    expect(state.complete).toBe(false);
    expect(state.incorrectCharacters).toBe(2);
    expect(overflowText(state)).toBe('x');
  });

  it('completes once the extra characters are removed', () => {
    let state = applyInput(createTypingState('crate'), 'cratex');
    state = applyInput(state, 'crate');

    expect(state.complete).toBe(true);
    expect(state.correctedErrors).toBe(1);
  });
});

describe('mistake behavior: block-until-corrected', () => {
  it('keeps the wrong character visible but ignores anything after it', () => {
    const state = type('crate', 'crute', BLOCKING);

    // "cru" is kept; "te" never registers.
    expect(state.typed).toBe('cru');
    expect(state.keystrokes).toBe(3);
    expect(state.incorrectCharacters).toBe(1);
  });

  it('resumes normally once the mistake is deleted', () => {
    let state = type('crate', 'cru', BLOCKING);
    state = applyInput(state, 'cr', BLOCKING);
    state = applyInput(state, 'cra', BLOCKING);

    expect(state.typed).toBe('cra');
    expect(hasPendingError(state, BLOCKING)).toBe(false);
  });

  it('keeps a single overflow character visible when input arrives in bulk', () => {
    const state = applyInput(createTypingState('crate'), 'cratexyz', BLOCKING);

    // "x" is the first mistake, so it stays; "yz" never registers.
    expect(state.typed).toBe('cratex');
    expect(overflowText(state)).toBe('x');
    expect(state.incorrectCharacters).toBe(1);
  });

  it('allow-and-mark lets the player type straight past a mistake', () => {
    const state = type('crate', 'crute');

    expect(state.typed).toBe('crute');
    expect(state.keystrokes).toBe(5);
  });
});

describe('render states', () => {
  it('marks correct, incorrect, current, and untyped characters', () => {
    const state = type('crate', 'cru');

    expect(characterStates(state)).toEqual([
      'correct',
      'correct',
      'incorrect',
      'current',
      'untyped',
    ]);
  });

  it('places the caret on the first character before anything is typed', () => {
    expect(characterStates(createTypingState('go'))).toEqual(['current', 'untyped']);
  });

  it('shows no caret once the prompt is complete', () => {
    const states = characterStates(type('go', 'go'));

    expect(states).toEqual(['correct', 'correct']);
    expect(states).not.toContain('current');
  });

  it('returns one entry per target character regardless of overflow', () => {
    expect(characterStates(type('go', 'gone'))).toHaveLength(2);
  });
});

describe('progress reporting', () => {
  it('measures progress by correct prefix, not raw length', () => {
    expect(promptProgress(type('crate', 'cra'))).toBeCloseTo(0.6, 5);
    // Three characters typed, but only two are usable progress.
    expect(promptProgress(type('crate', 'crx'))).toBeCloseTo(0.4, 5);
  });

  it('reports full progress for a completed prompt', () => {
    expect(promptProgress(type('crate', 'crate'))).toBe(1);
  });

  it('reports an empty prompt as fully progressed', () => {
    expect(promptProgress(createTypingState(''))).toBe(1);
  });

  it('detects a pending mistake', () => {
    expect(hasPendingError(type('crate', 'cra'))).toBe(false);
    expect(hasPendingError(type('crate', 'crx'))).toBe(true);
  });

  it('counts remaining characters', () => {
    expect(remainingCharacters(type('crate', 'cr'))).toBe(3);
    expect(remainingCharacters(type('crate', 'cratex'))).toBe(0);
  });
});

describe('bulk input', () => {
  it('handles a pasted value as one replacement', () => {
    const state = applyInput(createTypingState('crate'), 'crate');

    expect(state.complete).toBe(true);
    expect(state.keystrokes).toBe(5);
  });

  it('handles select-all-and-replace', () => {
    let state = type('crate', 'cra');
    state = applyInput(state, 'zzz');

    expect(state.typed).toBe('zzz');
    expect(state.correctedErrors).toBe(0);
    expect(state.incorrectCharacters).toBe(3);
  });

  it('ignores a value identical to the current one', () => {
    const state = type('crate', 'cra');
    const again = applyInput(state, 'cra');

    expect(again).toBe(state);
  });
});
