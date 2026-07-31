/**
 * Words-per-minute arithmetic (spec §7).
 *
 * The standard definition, used everywhere without exception:
 *
 *     gross_wpm = typed_character_count / 5 / elapsed_minutes
 *
 * A "word" is five characters. Spaces and punctuation count, which is why the
 * typing engine measures the prompt exactly as it is displayed.
 */

export const CHARACTERS_PER_WORD = 5;
const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * Window for the "Current WPM" HUD reading.
 *
 * Three seconds is long enough that the number does not flicker on every
 * keystroke, short enough that it still feels live.
 */
export const CURRENT_WPM_WINDOW_MS = 3_000;

/**
 * Window for the raw peak reading.
 *
 * Deliberately short and deliberately spiky. This is the flattering number the
 * spec warns against using as a lifetime record — `sustainablePeakWpm` (step B4)
 * is the honest one.
 */
export const RAW_PEAK_WINDOW_MS = 1_000;

/**
 * Gross WPM over an elapsed span.
 *
 * Returns 0 for a non-positive span rather than infinity: a reading taken across
 * no time is not an infinitely fast typist.
 */
export function grossWpm(characters: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || characters <= 0) return 0;

  return characters / CHARACTERS_PER_WORD / (elapsedMs / MILLISECONDS_PER_MINUTE);
}

/**
 * Characters that would be typed at a given speed over a span. The inverse of
 * `grossWpm`, used by the prompt timing formula in step B5.
 */
export function charactersAtWpm(wpm: number, elapsedMs: number): number {
  if (wpm <= 0 || elapsedMs <= 0) return 0;

  return (wpm * CHARACTERS_PER_WORD * elapsedMs) / MILLISECONDS_PER_MINUTE;
}

/** Milliseconds needed to type `characters` at `wpm`. */
export function millisecondsToType(characters: number, wpm: number): number {
  if (wpm <= 0 || characters <= 0) return 0;

  return (characters / CHARACTERS_PER_WORD / wpm) * MILLISECONDS_PER_MINUTE;
}

/** Correct over entered, 0..1. Returns 1 when nothing has been entered yet. */
export function accuracyOf(correctCharacters: number, incorrectCharacters: number): number {
  const entered = correctCharacters + incorrectCharacters;

  return entered <= 0 ? 1 : correctCharacters / entered;
}
