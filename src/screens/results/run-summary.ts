import type { MapConfig, PlayerProfile, RunResult } from '../../game-core/models';
import { progressFor } from '../../game-core/models';

/**
 * What a finished run means for the player (spec §8, §14).
 *
 * Pure, and separate from the screen: "you set a record" and "you unlocked a
 * map" are claims, and a claim the UI invents is worse than one it omits.
 */

export type RecordKind =
  'score' | 'accuracy' | 'averageWpm' | 'sustainablePeak' | 'firstCompletion';

export interface NewRecord {
  readonly kind: RecordKind;
  readonly label: string;
  readonly value: string;
}

function percent(ratio: number): string {
  return `${String(Math.round(ratio * 100))}%`;
}

/**
 * Records this run beat.
 *
 * Strictly greater than: matching a previous best is not a new record, and
 * telling the player otherwise would cheapen the ones that are.
 */
export function newRecords(result: RunResult, profile: PlayerProfile): readonly NewRecord[] {
  const previous = progressFor(profile, result.mapId);
  const records: NewRecord[] = [];

  if (result.score > previous.bestScore) {
    records.push({
      kind: 'score',
      label: 'Best score',
      value: String(Math.round(result.score)),
    });
  }

  if (result.accuracy > previous.bestAccuracy) {
    records.push({ kind: 'accuracy', label: 'Best accuracy', value: percent(result.accuracy) });
  }

  if (result.averageWpm > previous.bestAverageWpm) {
    records.push({
      kind: 'averageWpm',
      label: 'Best average speed',
      value: `${String(Math.round(result.averageWpm))} WPM`,
    });
  }

  // The lifetime figure, compared against the profile rather than the map: it is
  // the one record that belongs to the player, not to a level.
  if (result.sustainablePeakWpm > profile.sustainablePeakWpm) {
    records.push({
      kind: 'sustainablePeak',
      label: 'Sustainable peak',
      value: `${String(Math.round(result.sustainablePeakWpm))} WPM`,
    });
  }

  if (result.completed && !previous.completed) {
    records.push({ kind: 'firstCompletion', label: 'Map completed', value: 'First time' });
  }

  return records;
}

/**
 * The map this run unlocked, if any.
 *
 * Both gates have to pass — the run has to be *finished*, and the accuracy has
 * to clear the next map's bar. Finishing scrappily is a win, but it is not a
 * promotion (spec §6).
 */
export function unlockedMap(
  result: RunResult,
  profile: PlayerProfile,
  maps: readonly MapConfig[],
): MapConfig | null {
  if (!result.completed) return null;

  const next = maps.find(
    (map) => map.unlock.requiresMapId === result.mapId && !profile.unlockedMapIds.includes(map.id),
  );

  if (next === undefined) return null;

  return result.accuracy >= next.unlock.minimumAccuracy ? next : null;
}

/**
 * What the player needed but did not manage, for a run that finished without
 * unlocking anything. Returns `null` when there was nothing to unlock anyway.
 */
export function missedUnlockReason(
  result: RunResult,
  profile: PlayerProfile,
  maps: readonly MapConfig[],
): string | null {
  const next = maps.find(
    (map) => map.unlock.requiresMapId === result.mapId && !profile.unlockedMapIds.includes(map.id),
  );

  if (next === undefined) return null;
  if (!result.completed) return `Finish the map to unlock ${next.name}`;
  if (result.accuracy >= next.unlock.minimumAccuracy) return null;

  return `${percent(next.unlock.minimumAccuracy)} accuracy unlocks ${next.name} — you had ${percent(
    result.accuracy,
  )}`;
}
