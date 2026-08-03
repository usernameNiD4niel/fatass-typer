import type { PlayerProfile, RunResult } from '../game-core/models';

/**
 * Where progress lives (spec §14, §17).
 *
 * An interface with one implementation today — in memory, lost on reload, which
 * CLAUDE.md §5 records as intended for now. It exists because the alternative is
 * scattering `localStorage` calls through screens and then unpicking them when
 * IndexedDB arrives.
 *
 * **Everything is async.** Nothing about the in-memory store needs to be, but
 * IndexedDB is, and an interface that only became async later would force every
 * caller to change. Paying that cost now is cheaper than paying it twice.
 *
 * Implementations must not throw for missing data: a first-run player has no
 * profile, and that is not an error.
 */
export interface StorageAdapter {
  /** The stored profile, or `null` for a player who has never run. */
  loadProfile(): Promise<PlayerProfile | null>;
  saveProfile(profile: PlayerProfile): Promise<void>;

  /**
   * Records a finished run.
   *
   * History is capped by the implementation — a player who runs a thousand
   * times should not carry a thousand records around.
   */
  appendRun(result: RunResult): Promise<void>;
  /** Most recent first. */
  listRuns(limit?: number): Promise<readonly RunResult[]>;
  /** Runs on one map, most recent first. */
  listRunsForMap(mapId: string, limit?: number): Promise<readonly RunResult[]>;

  /** Wipes everything. Development only until there is a real settings flow. */
  clear(): Promise<void>;
}
