import { isCount, isRecord } from '../models/guards';

/**
 * Which keys the player actually fumbles (plan 2.4).
 *
 * The game measures WPM and accuracy and tells the player both, and neither is
 * *actionable*: "88% accurate" does not say what to practise. This does. It
 * counts, per character and per digraph, how often it was reached and how often
 * it was got wrong — and the ratio of those two is the only thing in the game
 * that answers "what specifically am I bad at".
 *
 * Two uses, and the second is the point:
 *
 *  - the results screen names the worst few, so improvement has a target;
 *  - prompt selection is weighted toward them, so the game quietly practises
 *    them for you. That is the difference between a typing *game* and typing
 *    *practice*, and it costs the player no extra effort.
 *
 * ## Digraphs as well as characters
 *
 * A lot of typing difficulty is not in a key but in a *transition* — the same
 * finger twice, an awkward roll. Somebody who hits `t` and `h` reliably alone
 * can still fumble `th`, and a per-character table cannot see it.
 */

/** How often one key or digraph was reached, and how often it was missed. */
export interface KeyRecord {
  readonly attempts: number;
  readonly misses: number;
}

/** Keyed by the character or digraph itself, lowercased. */
export type KeyStats = Readonly<Record<string, KeyRecord>>;

export const EMPTY_KEY_STATS: KeyStats = {};

/**
 * Most entries kept.
 *
 * This is persisted, and digraphs are quadratic in the alphabet — left
 * unbounded a long-lived profile carries a table of a thousand pairs the player
 * will never be shown. Pruning keeps the ones with the most evidence behind
 * them, which are also the only ones worth acting on.
 */
export const MAX_TRACKED_KEYS = 240;

/** What a single keystroke was worth, as far as this table is concerned. */
export interface KeyAttempt {
  /** The character the prompt asked for. */
  readonly expected: string;
  /** The character before it in the prompt, for the digraph. */
  readonly previous: string | null;
  readonly missed: boolean;
}

/**
 * Whether a character is worth counting.
 *
 * Spaces are excluded deliberately. They are the most-typed character by a wide
 * margin and almost never wrong, so counting them buries every real weakness
 * under one enormous, useless row.
 */
function countable(character: string): boolean {
  return character.trim().length > 0;
}

function bump(record: KeyRecord | undefined, missed: boolean): KeyRecord {
  return {
    attempts: (record?.attempts ?? 0) + 1,
    misses: (record?.misses ?? 0) + (missed ? 1 : 0),
  };
}

/** Folds keystrokes into the table. Pure: stats in, stats out. */
export function recordAttempts(stats: KeyStats, attempts: readonly KeyAttempt[]): KeyStats {
  if (attempts.length === 0) return stats;

  const next: Record<string, KeyRecord> = { ...stats };

  for (const attempt of attempts) {
    const expected = attempt.expected.toLowerCase();
    if (!countable(expected)) continue;

    next[expected] = bump(next[expected], attempt.missed);

    const previous = attempt.previous?.toLowerCase();
    if (previous !== undefined && countable(previous)) {
      const digraph = `${previous}${expected}`;
      next[digraph] = bump(next[digraph], attempt.missed);
    }
  }

  return prune(next);
}

/** Keeps the best-evidenced entries when the table outgrows its cap. */
function prune(stats: Record<string, KeyRecord>): KeyStats {
  const keys = Object.keys(stats);
  if (keys.length <= MAX_TRACKED_KEYS) return stats;

  const kept = keys
    .sort((left, right) => (stats[right]?.attempts ?? 0) - (stats[left]?.attempts ?? 0))
    .slice(0, MAX_TRACKED_KEYS);

  const next: Record<string, KeyRecord> = {};
  for (const key of kept) {
    const record = stats[key];
    if (record !== undefined) next[key] = record;
  }

  return next;
}

/**
 * Adds one table into another.
 *
 * Replays each row as individual attempts rather than summing the numbers, so
 * the cap and the digraph rules stay in one implementation. A run's table is a
 * few dozen rows, so the cost is nothing and the alternative is a second place
 * that has to know what pruning means.
 */
export function mergeKeyStats(into: KeyStats, from: KeyStats | undefined): KeyStats {
  if (from === undefined) return into;

  return recordAttempts(
    into,
    Object.entries(from).flatMap(([key, record]) =>
      Array.from({ length: record.attempts }, (_unused, index) => ({
        expected: key,
        previous: null,
        missed: index < record.misses,
      })),
    ),
  );
}

export interface WeakKey {
  readonly key: string;
  readonly attempts: number;
  readonly misses: number;
  /** 0..1. */
  readonly missRate: number;
}

export interface WeakestKeysOptions {
  /**
   * Attempts before a key may be called a weakness.
   *
   * Without it the table is topped by whatever the player has typed twice and
   * got wrong once — a 50% miss rate on no evidence at all. This is the
   * difference between a weakness and an accident.
   */
  readonly minimumAttempts?: number;
  readonly limit?: number;
}

const DEFAULT_MINIMUM_ATTEMPTS = 6;
const DEFAULT_LIMIT = 5;

/** The keys most worth practising, worst first. */
export function weakestKeys(stats: KeyStats, options: WeakestKeysOptions = {}): readonly WeakKey[] {
  const minimumAttempts = options.minimumAttempts ?? DEFAULT_MINIMUM_ATTEMPTS;
  const limit = options.limit ?? DEFAULT_LIMIT;

  return Object.entries(stats)
    .filter(([, record]) => record.attempts >= minimumAttempts && record.misses > 0)
    .map(([key, record]) => ({
      key,
      attempts: record.attempts,
      misses: record.misses,
      missRate: record.misses / record.attempts,
    }))
    .sort((left, right) => {
      if (right.missRate !== left.missRate) return right.missRate - left.missRate;
      // Same rate: more evidence first, then alphabetically so the order is
      // stable rather than dependent on insertion.
      if (right.misses !== left.misses) return right.misses - left.misses;

      return left.key.localeCompare(right.key);
    })
    .slice(0, limit);
}

/**
 * The characters worth steering practice toward.
 *
 * Single characters only, even though digraphs are tracked: prompt selection
 * matches on characters a word *contains*, and a word containing `t` and `h`
 * does not necessarily contain `th`. Reporting digraphs here would weight
 * toward words that do not exercise the weakness.
 */
export function weakCharacters(
  stats: KeyStats,
  options: WeakestKeysOptions = {},
): readonly string[] {
  return weakestKeys(stats, options)
    .filter((entry) => Array.from(entry.key).length === 1)
    .map((entry) => entry.key);
}

/** Repairs a stored table field by field (spec §17). */
export function coerceKeyStats(value: unknown): KeyStats {
  if (!isRecord(value)) return EMPTY_KEY_STATS;

  const next: Record<string, KeyRecord> = {};

  for (const [key, record] of Object.entries(value)) {
    if (key.length === 0 || key.length > 2) continue;
    if (!isRecord(record)) continue;

    const attempts = record['attempts'];
    const misses = record['misses'];
    if (!isCount(attempts) || !isCount(misses)) continue;

    // A table claiming more misses than attempts is not repairable into
    // anything meaningful, but it is also not worth discarding the rest for.
    next[key] = { attempts, misses: Math.min(misses, attempts) };
  }

  return prune(next);
}
