import { describe, expect, it } from 'vitest';

import {
  coerceKeyStats,
  EMPTY_KEY_STATS,
  MAX_TRACKED_KEYS,
  recordAttempts,
  weakCharacters,
  weakestKeys,
} from './key-stats';

function attempt(expected: string, previous: string | null, missed: boolean) {
  return { expected, previous, missed };
}

/** `count` attempts at one character, `missed` of them wrong. */
function repeat(character: string, count: number, missed: number) {
  return Array.from({ length: count }, (_unused, index) =>
    attempt(character, null, index < missed),
  );
}

describe('recording keystrokes', () => {
  it('counts what was reached and what was missed', () => {
    const stats = recordAttempts(EMPTY_KEY_STATS, [
      attempt('a', null, false),
      attempt('a', null, true),
    ]);

    expect(stats['a']).toEqual({ attempts: 2, misses: 1 });
  });

  it('counts the digraph as well as the character', () => {
    // A lot of difficulty is in the transition rather than the key: somebody
    // who hits `t` and `h` reliably alone can still fumble `th`.
    const stats = recordAttempts(EMPTY_KEY_STATS, [attempt('h', 't', true)]);

    expect(stats['h']).toEqual({ attempts: 1, misses: 1 });
    expect(stats['th']).toEqual({ attempts: 1, misses: 1 });
  });

  it('ignores spaces', () => {
    // The most-typed character by a wide margin and almost never wrong.
    // Counting it buries every real weakness under one useless row.
    const stats = recordAttempts(EMPTY_KEY_STATS, [
      attempt(' ', 'e', false),
      attempt('e', ' ', true),
    ]);

    expect(stats[' ']).toBeUndefined();
    expect(stats['e ']).toBeUndefined();
    expect(stats[' e']).toBeUndefined();
    expect(stats['e']).toEqual({ attempts: 1, misses: 1 });
  });

  it('folds case together', () => {
    const stats = recordAttempts(EMPTY_KEY_STATS, [
      attempt('A', null, true),
      attempt('a', null, false),
    ]);

    expect(stats['a']).toEqual({ attempts: 2, misses: 1 });
  });

  it('stays bounded, keeping the entries with the most evidence', () => {
    // Persisted, and digraphs are quadratic in the alphabet.
    let stats = EMPTY_KEY_STATS;
    for (let index = 0; index < MAX_TRACKED_KEYS + 50; index += 1) {
      const character = String.fromCodePoint(0x100 + index);
      stats = recordAttempts(stats, repeat(character, index + 1, 0));
    }

    expect(Object.keys(stats).length).toBeLessThanOrEqual(MAX_TRACKED_KEYS);
    // The very first character had the fewest attempts, so it is the one to go.
    expect(stats[String.fromCodePoint(0x100)]).toBeUndefined();
  });
});

describe('finding the worst keys', () => {
  it('ranks by miss rate', () => {
    let stats = recordAttempts(EMPTY_KEY_STATS, repeat('a', 10, 5));
    stats = recordAttempts(stats, repeat('b', 10, 2));

    expect(weakestKeys(stats).map((entry) => entry.key)).toEqual(['a', 'b']);
  });

  it('ignores a key with too little evidence behind it', () => {
    // Otherwise the table is topped by whatever was typed twice and got wrong
    // once — a 50% miss rate on no evidence at all.
    const stats = recordAttempts(EMPTY_KEY_STATS, repeat('q', 2, 1));

    expect(weakestKeys(stats)).toEqual([]);
  });

  it('ignores a key that is never missed', () => {
    const stats = recordAttempts(EMPTY_KEY_STATS, repeat('a', 40, 0));

    expect(weakestKeys(stats)).toEqual([]);
  });

  it('is stable when two keys are equally bad', () => {
    let stats = recordAttempts(EMPTY_KEY_STATS, repeat('z', 10, 3));
    stats = recordAttempts(stats, repeat('y', 10, 3));

    expect(weakestKeys(stats).map((entry) => entry.key)).toEqual(['y', 'z']);
  });

  it('offers only single characters for steering practice', () => {
    let stats = recordAttempts(EMPTY_KEY_STATS, repeat('h', 10, 6));
    for (let index = 0; index < 10; index += 1) {
      stats = recordAttempts(stats, [attempt('h', 't', index < 6)]);
    }

    // `th` is tracked and reported, but a word containing `t` and `h` does not
    // necessarily contain `th`, so weighting on it would practise the wrong
    // words.
    expect(weakestKeys(stats).some((entry) => entry.key === 'th')).toBe(true);
    expect(weakCharacters(stats)).toEqual(['h']);
  });
});

describe('reading a stored table', () => {
  it('keeps the readable rows and drops the rest', () => {
    const stored = {
      a: { attempts: 10, misses: 2 },
      b: 'not a record',
      c: { attempts: 'lots', misses: 1 },
      'far too long': { attempts: 5, misses: 1 },
    };

    expect(coerceKeyStats(stored)).toEqual({ a: { attempts: 10, misses: 2 } });
  });

  it('clamps a row claiming more misses than attempts', () => {
    expect(coerceKeyStats({ a: { attempts: 3, misses: 99 } })).toEqual({
      a: { attempts: 3, misses: 3 },
    });
  });

  it('reads anything that is not a table as an empty one', () => {
    expect(coerceKeyStats(null)).toEqual(EMPTY_KEY_STATS);
    expect(coerceKeyStats([1, 2])).toEqual(EMPTY_KEY_STATS);
  });
});
