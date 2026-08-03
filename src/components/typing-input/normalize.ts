/**
 * Input normalisation for the typing field (spec §5).
 *
 * The game compares **whole input values**, not key events (CLAUDE.md §3), so
 * this is the only place raw browser text is cleaned up before it crosses the
 * bridge. Everything here is pure and unit-tested; the React component does
 * nothing but wire it to an `<input>`.
 *
 * The rule is conservative: keep every character a player could legitimately
 * have to type — letters in any script, digits, punctuation, spaces — and drop
 * only what a prompt can never contain.
 */

/** Longest input accepted. Prompts are phrases; anything longer is a paste or a stuck key. */
export const MAX_INPUT_LENGTH = 240;

/**
 * Keys that must never reach the typing field.
 *
 * Not a list of "control keys" in general: Tab, Escape, and the arrows are
 * deliberately absent so they keep working. Tab must move focus (spec §12 wants
 * full keyboard navigation) and Escape must reach the pause handler. Blocking
 * them for the game's convenience would break the page around it.
 */
const IGNORED_KEYS = new Set([
  'Enter',
  'NumpadEnter',
  'PageUp',
  'PageDown',
  'Insert',
  'ContextMenu',
  'ScrollLock',
  'Pause',
  'PrintScreen',
]);

/** Whether a `keydown` should be swallowed instead of reaching the field. */
export function isIgnoredKey(key: string): boolean {
  // Function keys, all of them, without listing twelve entries.
  if (/^F\d{1,2}$/.test(key)) return true;

  return IGNORED_KEYS.has(key);
}

/** C0 and C1 control characters, minus the whitespace already folded to a space. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g;

/** Zero-width and bidi marks — invisible, but they would count as characters. */
const INVISIBLE_MARKS = /[\u200B-\u200F\u2028\u2029\u2060\uFEFF]/g;

/** Spaces that look like a plain space but are a different character. */
const EXOTIC_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Cleans a raw input value.
 *
 * Newlines and tabs become spaces rather than disappearing: a pasted phrase that
 * wrapped is still the words the player meant to type, and deleting the
 * separator would silently join two words into one.
 */
export function normalizeInput(raw: string): string {
  return raw
    .replace(/[\r\n\t\v\f]+/g, ' ')
    .replace(CONTROL_CHARACTERS, '')
    .replace(INVISIBLE_MARKS, '')
    .replace(EXOTIC_SPACES, ' ')
    .slice(0, MAX_INPUT_LENGTH);
}

/**
 * Whether a normalised value is worth sending.
 *
 * Browsers fire `input` for edits that leave the text identical — an IME commit,
 * a same-character replacement. Re-sending would make the typing engine re-diff
 * a value it has already seen, and the engine counts events, not characters.
 */
export function shouldSubmit(previous: string, next: string): boolean {
  return previous !== next;
}
