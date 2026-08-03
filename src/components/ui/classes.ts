/**
 * Joins class names, dropping anything falsy.
 *
 * CSS-module lookups are typed as `string | undefined`, and a missing class must
 * not become the literal string "undefined" in the DOM. Every primitive uses
 * this rather than template literals.
 */
export function classes(...names: (string | false | null | undefined)[]): string {
  return names
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .join(' ');
}
