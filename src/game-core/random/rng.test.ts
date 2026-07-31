import { describe, expect, it } from 'vitest';
import {
  createRng,
  createRngFromString,
  jitter,
  nextFloat,
  nextInt,
  nextRange,
  pick,
  seedFromString,
  shuffle,
  weightedPick,
} from './rng';
import type { Rng } from './rng';

/** Draws `count` floats, returning them in order. */
function draw(rng: Rng, count: number): number[] {
  const values: number[] = [];
  let current = rng;

  for (let index = 0; index < count; index += 1) {
    const result = nextFloat(current);
    values.push(result.value);
    current = result.rng;
  }

  return values;
}

describe('seeded generator — determinism', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw(createRng(12345), 20)).toEqual(draw(createRng(12345), 20));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(createRng(1), 20)).not.toEqual(draw(createRng(2), 20));
  });

  it('never mutates the generator it is given', () => {
    const rng = createRng(99);

    nextFloat(rng);
    nextInt(rng, 10);

    expect(rng.seed).toBe(createRng(99).seed);
  });

  it('replays from any point in the sequence', () => {
    const start = createRng(7);
    const midpoint = nextFloat(nextFloat(start).rng).rng;

    expect(draw(midpoint, 10)).toEqual(draw(midpoint, 10));
  });

  it('derives a stable seed from a string', () => {
    expect(seedFromString('map-1:run-7')).toBe(seedFromString('map-1:run-7'));
    expect(seedFromString('map-1:run-7')).not.toBe(seedFromString('map-1:run-8'));
    expect(draw(createRngFromString('map-1'), 5)).toEqual(draw(createRngFromString('map-1'), 5));
  });
});

describe('seeded generator — distribution', () => {
  it('stays inside [0, 1)', () => {
    for (const value of draw(createRng(42), 2_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('averages near the middle of the range', () => {
    const values = draw(createRng(2024), 5_000);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('covers the whole integer range without exceeding it', () => {
    const seen = new Set<number>();
    let rng = createRng(5);

    for (let index = 0; index < 1_000; index += 1) {
      const result = nextInt(rng, 6);
      rng = result.rng;
      seen.add(result.value);

      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(6);
    }

    expect(seen.size).toBe(6);
  });

  it('handles an empty integer range without dividing by zero', () => {
    expect(nextInt(createRng(1), 0).value).toBe(0);
    expect(nextInt(createRng(1), -5).value).toBe(0);
  });

  it('respects an explicit range', () => {
    let rng = createRng(11);

    for (let index = 0; index < 500; index += 1) {
      const result = nextRange(rng, 5, 9);
      rng = result.rng;

      expect(result.value).toBeGreaterThanOrEqual(5);
      expect(result.value).toBeLessThan(9);
    }
  });
});

describe('picking', () => {
  it('returns null for an empty list rather than throwing', () => {
    expect(pick(createRng(1), []).value).toBeNull();
  });

  it('always returns the only item in a single-item list', () => {
    expect(pick(createRng(1), ['solo']).value).toBe('solo');
  });

  it('eventually returns every item', () => {
    const items = ['a', 'b', 'c', 'd'];
    const seen = new Set<string>();
    let rng = createRng(3);

    for (let index = 0; index < 200; index += 1) {
      const result = pick(rng, items);
      rng = result.rng;
      if (result.value !== null) seen.add(result.value);
    }

    expect(seen.size).toBe(items.length);
  });
});

describe('weighted picking', () => {
  it('favors heavier items', () => {
    const items = [
      { id: 'rare', weight: 1 },
      { id: 'common', weight: 9 },
    ];
    const counts = new Map<string, number>();
    let rng = createRng(17);

    for (let index = 0; index < 2_000; index += 1) {
      const result = weightedPick(rng, items, (item) => item.weight);
      rng = result.rng;
      if (result.value !== null) {
        counts.set(result.value.id, (counts.get(result.value.id) ?? 0) + 1);
      }
    }

    expect(counts.get('common') ?? 0).toBeGreaterThan((counts.get('rare') ?? 0) * 5);
  });

  it('never picks a zero-weight item', () => {
    const items = [
      { id: 'never', weight: 0 },
      { id: 'always', weight: 1 },
    ];
    let rng = createRng(23);

    for (let index = 0; index < 300; index += 1) {
      const result = weightedPick(rng, items, (item) => item.weight);
      rng = result.rng;

      expect(result.value?.id).toBe('always');
    }
  });

  it('returns null when nothing has a usable weight', () => {
    const items = [{ weight: 0 }, { weight: -4 }];

    expect(weightedPick(createRng(1), items, (item) => item.weight).value).toBeNull();
  });
});

describe('shuffling', () => {
  it('returns a permutation, leaving the input untouched', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = shuffle(createRng(31), items);

    expect([...result.value].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('is deterministic for a given seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];

    expect(shuffle(createRng(4), items).value).toEqual(shuffle(createRng(4), items).value);
  });

  it('actually reorders', () => {
    const items = Array.from({ length: 30 }, (_unused, index) => index);

    expect(shuffle(createRng(8), items).value).not.toEqual(items);
  });
});

describe('jitter', () => {
  it('stays inside the requested band', () => {
    let rng = createRng(13);

    for (let index = 0; index < 500; index += 1) {
      const result = jitter(rng, 8, 0.25);
      rng = result.rng;

      expect(result.value).toBeGreaterThanOrEqual(6);
      expect(result.value).toBeLessThanOrEqual(10);
    }
  });

  it('returns the base value when there is no jitter', () => {
    expect(jitter(createRng(1), 8, 0).value).toBe(8);
  });
});
