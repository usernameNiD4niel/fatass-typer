/**
 * Storage schema versioning (spec §14, §17).
 *
 * Every persisted shape carries a `schemaVersion` from day one, even though the
 * only store today is in-memory (CLAUDE.md §2). The cost is one field; the cost
 * of adding versioning after data exists in the wild is a migration written
 * blind against unknown records.
 *
 * Rules:
 * - Bump `CURRENT_SCHEMA_VERSION` whenever a persisted shape changes incompatibly.
 * - Never reuse a version number.
 * - A record from a *newer* version than this build must never be silently
 *   downgraded — spec §17 forbids destroying progress. Back it up, then decide.
 */

export const CURRENT_SCHEMA_VERSION = 1;

/** Oldest version this build can read and migrate forward. */
export const MINIMUM_SUPPORTED_SCHEMA_VERSION = 1;

/** Shape shared by everything written to storage. */
export interface Versioned {
  readonly schemaVersion: number;
}

export type SchemaCompatibility =
  /** Readable as-is. */
  | 'current'
  /** Older but supported — run migrations forward. */
  | 'migratable'
  /** Older than anything this build understands. */
  | 'too-old'
  /** Written by a newer build. Do not touch the data. */
  | 'too-new'
  /** Not a versioned record at all. */
  | 'unversioned';

export function isVersioned(value: unknown): value is Versioned {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    typeof (value as Versioned).schemaVersion === 'number' &&
    Number.isInteger((value as Versioned).schemaVersion)
  );
}

/**
 * Classifies a stored record before anything tries to read its fields.
 * Callers decide the recovery action; this function never mutates or discards.
 */
export function checkSchema(value: unknown): SchemaCompatibility {
  if (!isVersioned(value)) return 'unversioned';

  const { schemaVersion } = value;

  if (schemaVersion === CURRENT_SCHEMA_VERSION) return 'current';
  if (schemaVersion > CURRENT_SCHEMA_VERSION) return 'too-new';
  if (schemaVersion < MINIMUM_SUPPORTED_SCHEMA_VERSION) return 'too-old';

  return 'migratable';
}
