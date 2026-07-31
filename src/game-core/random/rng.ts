/**
 * Seeded pseudo-random number generator (spec §15, CLAUDE.md §3).
 *
 * `Math.random` is banned inside game-core — it makes runs impossible to
 * reproduce and tests impossible to pin. Every random decision in the game draws
 * from here, and every draw returns the next generator alongside its value, so
 * randomness threads through the code as data rather than hiding in module state.
 *
 * The algorithm is mulberry32: small, fast, and good enough for picking words.
 * It is not cryptographic and must never be used as if it were.
 */

export interface Rng {
  readonly seed: number;
}

/** A value paired with the generator to use for the next draw. */
export interface RngResult<T> {
  readonly value: T;
  readonly rng: Rng;
}

export function createRng(seed: number): Rng {
  // Force to a 32-bit integer so equal seeds always start identically.
  return { seed: seed | 0 };
}

/**
 * Derives a numeric seed from a string — an FNV-1a hash.
 *
 * Lets a run be seeded from something meaningful and reproducible, such as
 * `"map-1:run-7"`, instead of a magic number.
 */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash | 0;
}

export function createRngFromString(text: string): Rng {
  return createRng(seedFromString(text));
}

/** Next float in `[0, 1)`. */
export function nextFloat(rng: Rng): RngResult<number> {
  const seed = (rng.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

  return { value: ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296, rng: { seed } };
}

/** Next integer in `[0, maxExclusive)`. Returns 0 when the range is empty. */
export function nextInt(rng: Rng, maxExclusive: number): RngResult<number> {
  if (maxExclusive <= 0) return { value: 0, rng };

  const { value, rng: next } = nextFloat(rng);

  return { value: Math.floor(value * maxExclusive), rng: next };
}

/** Next float in `[min, max)`. */
export function nextRange(rng: Rng, min: number, max: number): RngResult<number> {
  const { value, rng: next } = nextFloat(rng);

  return { value: min + value * (max - min), rng: next };
}

/** Uniform pick. Returns `null` for an empty list rather than throwing. */
export function pick<T>(rng: Rng, items: readonly T[]): RngResult<T | null> {
  if (items.length === 0) return { value: null, rng };

  const { value: index, rng: next } = nextInt(rng, items.length);

  return { value: items[index] ?? null, rng: next };
}

/**
 * Applies a symmetric jitter: `base * (1 ± amount)`.
 *
 * Used for obstacle spacing, where perfectly even intervals feel mechanical.
 */
export function jitter(rng: Rng, base: number, amount: number): RngResult<number> {
  if (amount <= 0) return { value: base, rng };

  const { value, rng: next } = nextRange(rng, -amount, amount);

  return { value: base * (1 + value), rng: next };
}

/** Fisher-Yates shuffle. Returns a new array; the input is untouched. */
export function shuffle<T>(rng: Rng, items: readonly T[]): RngResult<readonly T[]> {
  const result = [...items];
  let next = rng;

  for (let index = result.length - 1; index > 0; index -= 1) {
    const draw = nextInt(next, index + 1);
    next = draw.rng;

    const swapIndex = draw.value;
    const a = result[index];
    const b = result[swapIndex];

    if (a !== undefined && b !== undefined) {
      result[index] = b;
      result[swapIndex] = a;
    }
  }

  return { value: result, rng: next };
}

/**
 * Picks by weight. Items with a non-positive weight are never chosen.
 * Returns `null` when nothing has a usable weight.
 */
export function weightedPick<T>(
  rng: Rng,
  items: readonly T[],
  weightOf: (item: T) => number,
): RngResult<T | null> {
  const weights = items.map((item) => Math.max(0, weightOf(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  if (total <= 0) return { value: null, rng };

  const { value: roll, rng: next } = nextRange(rng, 0, total);
  let running = 0;

  for (let index = 0; index < items.length; index += 1) {
    running += weights[index] ?? 0;

    if (roll < running) {
      return { value: items[index] ?? null, rng: next };
    }
  }

  // Only reachable through floating-point drift at the very top of the range.
  return { value: items[items.length - 1] ?? null, rng: next };
}
