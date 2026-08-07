import type { MapConfig, MapProgress, PlayerProfile } from '../../game-core/models';
import { progressFor } from '../../game-core/models';

/**
 * What a map card shows (spec §9).
 *
 * Pure, so the wording of a lock — the part most likely to mislead a player — is
 * testable without rendering anything.
 */

export interface MapCardModel {
  readonly map: MapConfig;
  readonly progress: MapProgress;
  readonly locked: boolean;
  /** Why it is locked, in the player's terms. `null` when it is playable. */
  readonly unlockRequirement: string | null;
  readonly completed: boolean;
}

/**
 * The sentence a locked card shows.
 *
 * Always names both the map to beat and the accuracy needed. "Locked" on its own
 * tells the player nothing they can act on.
 */
export function unlockRequirementText(map: MapConfig, maps: readonly MapConfig[]): string | null {
  const requiredId = map.unlock.requiresMapId;
  if (requiredId === null) return null;

  const required = maps.find((entry) => entry.id === requiredId);
  const name = required === undefined ? 'the previous map' : required.name;
  const accuracy = Math.round(map.unlock.minimumAccuracy * 100);

  if (accuracy <= 0) return `Finish ${name} to unlock`;

  return `Finish ${name} with ${String(accuracy)}% accuracy to unlock`;
}

export function mapCardModel(
  map: MapConfig,
  profile: PlayerProfile,
  maps: readonly MapConfig[],
): MapCardModel {
  const progress = progressFor(profile, map.id);
  const locked = !profile.unlockedMapIds.includes(map.id);

  return {
    map,
    progress,
    locked,
    unlockRequirement: locked ? unlockRequirementText(map, maps) : null,
    completed: progress.completed,
  };
}

/** The accessible name for a card: everything its visuals convey, as one sentence. */
export function mapCardLabel(model: MapCardModel): string {
  const { map, progress, locked, completed } = model;
  const parts = [
    `Map ${String(map.mapNumber)}: ${map.name}`,
    `target ${String(map.targetWpm)} WPM`,
  ];

  if (locked) {
    parts.push(model.unlockRequirement ?? 'locked');

    return parts.join(', ');
  }

  parts.push(completed ? 'completed' : 'not completed yet');

  if (progress.attempts > 0) {
    parts.push(`best score ${String(Math.round(progress.bestScore))}`);
    parts.push(`best accuracy ${String(Math.round(progress.bestAccuracy * 100))}%`);
  }

  return parts.join(', ');
}

/**
 * Where the carousel opens.
 *
 * The furthest map the player has unlocked, which is where they are in the
 * progression and overwhelmingly the one they came to play. Opening on Map 1
 * every time would make a player who has reached Map 5 press Right four times
 * to get back to where they left off.
 *
 * A brand-new profile has only Map 1 unlocked, so for them this is the first
 * card anyway.
 */
export function openingIndex(models: readonly MapCardModel[]): number {
  let furthest = 0;

  for (const [index, model] of models.entries()) {
    if (!model.locked) furthest = index;
  }

  return furthest;
}
