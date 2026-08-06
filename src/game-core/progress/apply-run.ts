import type { IsoTimestamp, MapConfig, MapProgress, PlayerProfile, RunResult } from '../models';
import { mergeKeyStats } from '../keystats';
import { creditsFor } from '../wardrobe';
import { progressFor } from '../models';

/**
 * What a finished run does to a profile (spec §14).
 *
 * Pure: profile in, profile out. Everything the player keeps is decided here, so
 * there is exactly one place to check when a best score looks wrong.
 *
 * Bests only ever improve. A worse run never overwrites a better one — a player
 * who has a 2,400 on Map 1 should not lose it by trying something risky.
 */

function betterProgress(previous: MapProgress, result: RunResult): MapProgress {
  return {
    // Once completed, always completed: a later failed attempt does not undo it.
    completed: previous.completed || result.completed,
    bestScore: Math.max(previous.bestScore, result.score),
    bestAverageWpm: Math.max(previous.bestAverageWpm, result.averageWpm),
    bestPeakWpm: Math.max(previous.bestPeakWpm, result.rawPeakWpm),
    bestAccuracy: Math.max(previous.bestAccuracy, result.accuracy),
    // Fastest completion, and only completions count — being caught quickly is
    // not a record.
    bestCompletionTimeMs: result.completed
      ? Math.min(previous.bestCompletionTimeMs ?? Number.POSITIVE_INFINITY, result.durationMs)
      : previous.bestCompletionTimeMs,
    attempts: previous.attempts + 1,
    // Unlike a completion time, distance counts whether or not the run was
    // finished — on an endless map failing *is* how every run ends, and how far
    // you got before it is the entire score.
    bestDistanceMeters: Math.max(previous.bestDistanceMeters, result.distanceMeters),
  };
}

/**
 * Maps this run unlocks.
 *
 * Both gates: the run has to be finished *and* clear the next map's accuracy
 * bar. Returns ids rather than configs so the caller decides what to do with
 * them (spec §6).
 */
export function unlockedBy(
  result: RunResult,
  profile: PlayerProfile,
  maps: readonly MapConfig[],
): readonly string[] {
  if (!result.completed) return [];

  return maps
    .filter(
      (map) =>
        map.unlock.requiresMapId === result.mapId &&
        !profile.unlockedMapIds.includes(map.id) &&
        result.accuracy >= map.unlock.minimumAccuracy,
    )
    .map((map) => map.id);
}

export interface ApplyRunInput {
  readonly profile: PlayerProfile;
  readonly result: RunResult;
  readonly maps: readonly MapConfig[];
  /** The clock is read at the edge and passed in — `game-core` reads none. */
  readonly now: IsoTimestamp;
}

/** Folds a finished run into the profile. */
export function applyRunResult(input: ApplyRunInput): PlayerProfile {
  const { profile, result, maps, now } = input;

  const previous = progressFor(profile, result.mapId);
  const unlocked = unlockedBy(result, profile, maps);

  return {
    ...profile,
    updatedAt: now,
    // The lifetime headline (spec §7). Only ever rises, and only a run that
    // earned a sustainable window at all can raise it.
    sustainablePeakWpm: Math.max(profile.sustainablePeakWpm, result.sustainablePeakWpm),
    lifetimeCharacters:
      profile.lifetimeCharacters + result.correctCharacters + result.incorrectCharacters,
    lifetimeCorrectCharacters: profile.lifetimeCorrectCharacters + result.correctCharacters,
    unlockedMapIds: [...profile.unlockedMapIds, ...unlocked],
    mapProgress: {
      ...profile.mapProgress,
      [result.mapId]: betterProgress(previous, result),
    },
    // Lifetime, across every run: a weakness is a property of the typist rather
    // than of the road they were on when it showed up.
    keyStats: mergeKeyStats(profile.keyStats, result.keyStats),
    // What the run paid into the wardrobe. See `game-core/wardrobe`: a run the
    // chaser ended pays nothing, so the shortest run is never the best earner.
    credits:
      profile.credits +
      creditsFor({
        placement: result.placement ?? 3,
        coinsCollected: result.coinsCollected,
        completed: result.completed,
      }).total,
  };
}
