/**
 * Identifier aliases.
 *
 * These are documentation, not nominal types — a `MapId` is a `string`. The
 * value is readability at call sites like `unlock(profile, mapId)`, where a bare
 * `string` says nothing.
 */

export type MapId = string;
export type PromptId = string;
export type ObstacleId = string;
export type RunId = string;

/** ISO-8601 timestamp, e.g. `2026-07-31T09:15:00.000Z`. Always UTC. */
export type IsoTimestamp = string;

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function isIsoTimestamp(value: unknown): value is IsoTimestamp {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

/** A non-empty identifier string. */
export function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
