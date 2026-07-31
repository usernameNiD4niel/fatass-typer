import { isMemberOf, isRatio, isRecord } from './guards';

/**
 * Player settings (spec §12, §14).
 *
 * Persisted as part of the profile, so this shape is covered by the schema
 * version. Defaults are chosen for a first-time player on Map 1.
 */

/** What happens when the player types a wrong character (spec §5). */
export const MISTAKE_BEHAVIORS = [
  /** The wrong character is shown as an error and must be corrected. */
  'block-until-corrected',
  /** Typing continues; the error is recorded and highlighted. */
  'allow-and-mark',
] as const;

export type MistakeBehavior = (typeof MISTAKE_BEHAVIORS)[number];

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Prompt text size, mapping to `--prompt-font-size` (spec §12). */
export const PROMPT_TEXT_SIZES = ['small', 'medium', 'large', 'extra-large'] as const;
export type PromptTextSize = (typeof PROMPT_TEXT_SIZES)[number];

export interface GameSettings {
  readonly theme: ThemePreference;
  /** `null` follows the OS preference; a boolean is an explicit override. */
  readonly reducedMotion: boolean | null;
  readonly promptTextSize: PromptTextSize;
  readonly mistakeBehavior: MistakeBehavior;
  /** Case-insensitive comparison is the default (spec §5). */
  readonly caseSensitive: boolean;
  readonly musicEnabled: boolean;
  readonly soundEffectsEnabled: boolean;
  /** 0..1. */
  readonly musicVolume: number;
  /** 0..1. */
  readonly soundEffectsVolume: number;
  /** Adaptive assistance can be switched off by players who want honest difficulty. */
  readonly adaptiveAssistanceEnabled: boolean;
  /** Suppresses the first-run tutorial once it has been seen. */
  readonly tutorialCompleted: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  theme: 'system',
  reducedMotion: null,
  promptTextSize: 'medium',
  mistakeBehavior: 'allow-and-mark',
  caseSensitive: false,
  musicEnabled: true,
  soundEffectsEnabled: true,
  musicVolume: 0.5,
  soundEffectsVolume: 0.7,
  adaptiveAssistanceEnabled: true,
  tutorialCompleted: false,
};

const isVolume = isRatio;

export function isGameSettings(value: unknown): value is GameSettings {
  if (!isRecord(value)) return false;

  const reducedMotion = value['reducedMotion'];

  return (
    isMemberOf(THEME_PREFERENCES, value['theme']) &&
    (reducedMotion === null || typeof reducedMotion === 'boolean') &&
    isMemberOf(PROMPT_TEXT_SIZES, value['promptTextSize']) &&
    isMemberOf(MISTAKE_BEHAVIORS, value['mistakeBehavior']) &&
    typeof value['caseSensitive'] === 'boolean' &&
    typeof value['musicEnabled'] === 'boolean' &&
    typeof value['soundEffectsEnabled'] === 'boolean' &&
    isVolume(value['musicVolume']) &&
    isVolume(value['soundEffectsVolume']) &&
    typeof value['adaptiveAssistanceEnabled'] === 'boolean' &&
    typeof value['tutorialCompleted'] === 'boolean'
  );
}

/**
 * Repairs a partially valid settings object by falling back to defaults per
 * field.
 *
 * Spec §17: never silently erase progress. A single corrupt field must not cost
 * the player every other preference they set.
 */
export function coerceSettings(value: unknown): GameSettings {
  if (!isRecord(value)) return DEFAULT_SETTINGS;

  const bool = (key: keyof GameSettings, fallback: boolean): boolean =>
    typeof value[key] === 'boolean' ? value[key] : fallback;

  const reducedMotion = value['reducedMotion'];

  return {
    theme: isMemberOf(THEME_PREFERENCES, value['theme']) ? value['theme'] : DEFAULT_SETTINGS.theme,
    reducedMotion:
      reducedMotion === null || typeof reducedMotion === 'boolean'
        ? reducedMotion
        : DEFAULT_SETTINGS.reducedMotion,
    promptTextSize: isMemberOf(PROMPT_TEXT_SIZES, value['promptTextSize'])
      ? value['promptTextSize']
      : DEFAULT_SETTINGS.promptTextSize,
    mistakeBehavior: isMemberOf(MISTAKE_BEHAVIORS, value['mistakeBehavior'])
      ? value['mistakeBehavior']
      : DEFAULT_SETTINGS.mistakeBehavior,
    caseSensitive: bool('caseSensitive', DEFAULT_SETTINGS.caseSensitive),
    musicEnabled: bool('musicEnabled', DEFAULT_SETTINGS.musicEnabled),
    soundEffectsEnabled: bool('soundEffectsEnabled', DEFAULT_SETTINGS.soundEffectsEnabled),
    musicVolume: isVolume(value['musicVolume'])
      ? value['musicVolume']
      : DEFAULT_SETTINGS.musicVolume,
    soundEffectsVolume: isVolume(value['soundEffectsVolume'])
      ? value['soundEffectsVolume']
      : DEFAULT_SETTINGS.soundEffectsVolume,
    adaptiveAssistanceEnabled: bool(
      'adaptiveAssistanceEnabled',
      DEFAULT_SETTINGS.adaptiveAssistanceEnabled,
    ),
    tutorialCompleted: bool('tutorialCompleted', DEFAULT_SETTINGS.tutorialCompleted),
  };
}
