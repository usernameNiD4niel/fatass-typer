export {
  charactersMatch,
  commonPrefixLength,
  DEFAULT_TYPING_OPTIONS,
  firstErrorIndex,
  isExactMatch,
} from './comparison';
export type { CharacterState, TypingOptions } from './comparison';

export {
  applyInput,
  characterStates,
  createTypingState,
  hasPendingError,
  overflowText,
  promptProgress,
  remainingCharacters,
  typingAccuracy,
} from './session';
export type { TypingState } from './session';
