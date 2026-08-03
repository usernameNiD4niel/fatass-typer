import type { MapConfig, PlayerProfile } from '../../game-core/models';
import { progressFor } from '../../game-core/models';

/**
 * What the menu needs to know about a profile.
 *
 * Kept out of the component file so the screen exports only a component — Vite's
 * fast refresh gives up on a module that mixes the two.
 */

/** The furthest map the player has unlocked, or the first if none are. */
export function highestUnlockedMap(
  profile: PlayerProfile,
  maps: readonly MapConfig[],
): MapConfig | null {
  const unlocked = maps.filter((map) => profile.unlockedMapIds.includes(map.id));
  const [first] = maps;

  return unlocked.reduce<MapConfig | null>(
    (best, map) => (best === null || map.mapNumber > best.mapNumber ? map : best),
    first ?? null,
  );
}

/** Whether the player has anything worth continuing. */
export function hasProgress(profile: PlayerProfile, maps: readonly MapConfig[]): boolean {
  if (profile.unlockedMapIds.length > 1) return true;

  return maps.some((map) => progressFor(profile, map.id).attempts > 0);
}
