/**
 * Primitive guards shared by the model validators.
 *
 * Validators treat incoming data as genuinely `unknown` — never as
 * `Partial<T>`. `Partial<T>` claims every present field already has the right
 * type, which is exactly the assumption a corrupted save violates.
 */

/** A plain object, safe to index by key. Arrays and `null` do not qualify. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A finite number at or above zero. */
export function isCount(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

/** A finite number in 0..1 inclusive. */
export function isRatio(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

export function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= minimum;
}

export function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Membership test against a literal-union constant list. */
export function isMemberOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}
