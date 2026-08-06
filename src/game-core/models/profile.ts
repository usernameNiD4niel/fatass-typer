import { coerceKeyStats, EMPTY_KEY_STATS, type KeyStats } from '../keystats';
import { isCount, isIntegerAtLeast, isNonEmptyString, isRatio, isRecord } from './guards';
import type { IsoTimestamp, MapId } from './ids';
import { isIsoTimestamp } from './ids';
import { coerceSettings, DEFAULT_SETTINGS, isGameSettings } from './settings';
import type { GameSettings } from './settings';
import { CURRENT_SCHEMA_VERSION } from './schema';
import type { Versioned } from './schema';

/**
 * Player profile and per-map progress (spec §14).
 *
 * The single persisted root. Everything the player earns lives under here, so
 * this is the shape that migrations and corrupted-save recovery care about.
 */

export interface MapProgress {
  readonly completed: boolean;
  readonly bestScore: number;
  readonly bestAverageWpm: number;
  readonly bestPeakWpm: number;
  /** 0..1. */
  readonly bestAccuracy: number;
  /** `null` until the map has been finished at least once. */
  readonly bestCompletionTimeMs: number | null;
  readonly attempts: number;
  /**
   * Furthest the player has ever got, in metres.
   *
   * Meaningful on every map, but it is the *only* measure of success on an
   * endless one, where there is no finish line to complete and no completion
   * time to beat (plan 2.2).
   */
  readonly bestDistanceMeters: number;
}

export const EMPTY_MAP_PROGRESS: MapProgress = {
  completed: false,
  bestScore: 0,
  bestAverageWpm: 0,
  bestPeakWpm: 0,
  bestAccuracy: 0,
  bestCompletionTimeMs: null,
  attempts: 0,
  bestDistanceMeters: 0,
};

export interface PlayerProfile extends Versioned {
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  /** The prominent lifetime record (spec §7). Never a one-second burst. */
  readonly sustainablePeakWpm: number;
  readonly lifetimeCharacters: number;
  readonly lifetimeCorrectCharacters: number;
  readonly unlockedMapIds: readonly MapId[];
  readonly mapProgress: Readonly<Record<MapId, MapProgress>>;
  /**
   * Which keys the player fumbles, across every run (plan 2.4).
   *
   * Lifetime rather than per-map: a weakness is a property of the typist, not of
   * the road they were on when it showed up.
   */
  readonly keyStats: KeyStats;
  /**
   * Unspent credits (plan: the race).
   *
   * Earned by placing in a race and by collecting coins, spent in the wardrobe.
   * A single number rather than a per-category purse: three currencies for
   * three kinds of skin would be arithmetic the player has to do before they
   * can want anything.
   */
  readonly credits: number;
  /** Skin ids the player owns. Everything free is owned from the start. */
  readonly ownedSkinIds: readonly string[];
  /** What they are wearing, by category. A missing entry means the default. */
  readonly equippedSkinIds: Readonly<Record<string, string>>;
  readonly settings: GameSettings;
}

/**
 * A brand-new profile.
 *
 * `now` and the first unlocked map are parameters rather than derived here —
 * game-core reads no clock and knows no content (CLAUDE.md §3).
 */
export function createPlayerProfile(now: IsoTimestamp, firstMapId: MapId): PlayerProfile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    sustainablePeakWpm: 0,
    lifetimeCharacters: 0,
    lifetimeCorrectCharacters: 0,
    unlockedMapIds: [firstMapId],
    mapProgress: {},
    keyStats: EMPTY_KEY_STATS,
    credits: 0,
    ownedSkinIds: [],
    equippedSkinIds: {},
    settings: DEFAULT_SETTINGS,
  };
}

/** Progress for a map the player may never have attempted. */
export function progressFor(profile: PlayerProfile, mapId: MapId): MapProgress {
  return profile.mapProgress[mapId] ?? EMPTY_MAP_PROGRESS;
}

export function isMapUnlocked(profile: PlayerProfile, mapId: MapId): boolean {
  return profile.unlockedMapIds.includes(mapId);
}

/** Lifetime accuracy across every run, 0..1. Returns 1 before anything is typed. */
export function lifetimeAccuracy(profile: PlayerProfile): number {
  if (profile.lifetimeCharacters === 0) return 1;

  return profile.lifetimeCorrectCharacters / profile.lifetimeCharacters;
}

export function isMapProgress(value: unknown): value is MapProgress {
  if (!isRecord(value)) return false;

  const completionTime = value['bestCompletionTimeMs'];

  return (
    typeof value['completed'] === 'boolean' &&
    isCount(value['bestScore']) &&
    isCount(value['bestAverageWpm']) &&
    isCount(value['bestPeakWpm']) &&
    isRatio(value['bestAccuracy']) &&
    (completionTime === null || isCount(completionTime)) &&
    isIntegerAtLeast(value['attempts'], 0) &&
    isCount(value['bestDistanceMeters'])
  );
}

/**
 * Repairs one map's progress field by field.
 *
 * The load path uses this rather than `isMapProgress`, and the difference is not
 * academic. An all-or-nothing check discards the whole record when a single
 * field is missing — and a field is *always* missing the first time the game
 * adds one. `bestDistanceMeters` arriving in plan 2.2 would have silently erased
 * every existing player's bests, unlocks intact but every number back to zero.
 *
 * Same principle as `coercePlayerProfile` one level up (spec §17): keep what
 * reads correctly, default what does not.
 */
export function coerceMapProgress(value: unknown): MapProgress | null {
  if (!isRecord(value)) return null;

  const completionTime = value['bestCompletionTimeMs'];
  const accuracy = value['bestAccuracy'];

  return {
    completed: value['completed'] === true,
    bestScore: isCount(value['bestScore']) ? value['bestScore'] : 0,
    bestAverageWpm: isCount(value['bestAverageWpm']) ? value['bestAverageWpm'] : 0,
    bestPeakWpm: isCount(value['bestPeakWpm']) ? value['bestPeakWpm'] : 0,
    bestAccuracy: isRatio(accuracy) ? accuracy : 0,
    bestCompletionTimeMs: isCount(completionTime) ? completionTime : null,
    attempts: isIntegerAtLeast(value['attempts'], 0) ? value['attempts'] : 0,
    bestDistanceMeters: isCount(value['bestDistanceMeters']) ? value['bestDistanceMeters'] : 0,
  };
}

export function isPlayerProfile(value: unknown): value is PlayerProfile {
  if (!isRecord(value)) return false;

  if (typeof value['schemaVersion'] !== 'number') return false;
  if (!isIsoTimestamp(value['createdAt']) || !isIsoTimestamp(value['updatedAt'])) return false;
  if (!isCount(value['sustainablePeakWpm'])) return false;

  const characters = value['lifetimeCharacters'];
  const correct = value['lifetimeCorrectCharacters'];
  if (!isCount(characters) || !isCount(correct)) return false;
  // More correct characters than characters typed is arithmetically impossible
  // and signals a corrupt or hand-edited save.
  if (correct > characters) return false;

  const unlocked = value['unlockedMapIds'];
  if (!Array.isArray(unlocked)) return false;
  if (!unlocked.every(isNonEmptyString)) return false;

  const mapProgress = value['mapProgress'];
  if (!isRecord(mapProgress)) return false;
  if (!Object.values(mapProgress).every(isMapProgress)) return false;

  // Added with the wardrobe. Validated when present and defaulted when absent,
  // so a profile stored before it existed still loads.
  const credits = value['credits'];
  if (credits !== undefined && !isCount(credits)) return false;

  const owned = value['ownedSkinIds'];
  if (owned !== undefined && (!Array.isArray(owned) || !owned.every(isNonEmptyString)))
    return false;

  const equipped = value['equippedSkinIds'];
  if (equipped !== undefined && !isRecord(equipped)) return false;

  return isGameSettings(value['settings']);
}

/**
 * Best-effort repair of a damaged profile (spec §17).
 *
 * Returns `null` only when nothing usable can be recovered — the caller is then
 * responsible for backing the original up before replacing it. Individual bad
 * map entries are dropped rather than failing the whole profile.
 */
export function coercePlayerProfile(
  value: unknown,
  fallbackNow: IsoTimestamp,
  firstMapId: MapId,
): PlayerProfile | null {
  if (!isRecord(value)) return null;

  const rawUnlocked = value['unlockedMapIds'];
  const unlocked = Array.isArray(rawUnlocked) ? rawUnlocked.filter(isNonEmptyString) : [];

  const mapProgress: Record<MapId, MapProgress> = {};
  const rawProgress = value['mapProgress'];
  if (isRecord(rawProgress)) {
    for (const [mapId, progress] of Object.entries(rawProgress)) {
      const repaired = coerceMapProgress(progress);
      if (repaired !== null) mapProgress[mapId] = repaired;
    }
  }

  const rawCharacters = value['lifetimeCharacters'];
  const rawCorrect = value['lifetimeCorrectCharacters'];
  const lifetimeCharacters = isCount(rawCharacters) ? rawCharacters : 0;
  const lifetimeCorrect = isCount(rawCorrect) ? rawCorrect : 0;
  const peak = value['sustainablePeakWpm'];

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: isIsoTimestamp(value['createdAt']) ? value['createdAt'] : fallbackNow,
    updatedAt: isIsoTimestamp(value['updatedAt']) ? value['updatedAt'] : fallbackNow,
    sustainablePeakWpm: isCount(peak) ? peak : 0,
    lifetimeCharacters,
    // Clamp rather than discard: the counters may disagree, but the run history
    // they came from is still the player's.
    lifetimeCorrectCharacters: Math.min(lifetimeCorrect, lifetimeCharacters),
    // The first map is always playable, whatever the save says.
    unlockedMapIds: unlocked.includes(firstMapId) ? unlocked : [firstMapId, ...unlocked],
    mapProgress,
    keyStats: coerceKeyStats(value['keyStats']),
    credits: isCount(value['credits']) ? value['credits'] : 0,
    ownedSkinIds: coerceIdList(value['ownedSkinIds']),
    equippedSkinIds: coerceEquipped(value['equippedSkinIds']),
    settings: coerceSettings(value['settings']),
  };
}

/** A list of ids, keeping the ones that read as ids and dropping the rest. */
function coerceIdList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

/**
 * The equipped map, field by field.
 *
 * A skin id that no longer exists in the catalogue is left in place rather than
 * stripped: the wardrobe resolves an unknown id to the default, and removing it
 * here would silently forget what somebody chose if a build ever renamed a skin.
 */
function coerceEquipped(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};

  const equipped: Record<string, string> = {};
  for (const [category, id] of Object.entries(value)) {
    if (isNonEmptyString(category) && isNonEmptyString(id)) equipped[category] = id;
  }

  return equipped;
}
