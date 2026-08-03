import { coercePlayerProfile, type PlayerProfile, type RunResult } from '../game-core/models';
import type { StorageAdapter } from './storage-adapter';

/**
 * Progress for as long as the tab is open.
 *
 * The only implementation today. Progress resets on reload, which CLAUDE.md §5
 * records as intended for now — an IndexedDB implementation slots in behind the
 * same interface without a caller changing.
 *
 * It still validates what it loads. That looks paranoid for a store that cannot
 * be corrupted from outside, and it is the point: the recovery path (spec §17)
 * is exercised on every load in every test rather than being written blind on
 * the day real persistence arrives.
 */

/**
 * How many runs are kept.
 *
 * Enough for a statistics screen to say something useful about recent form,
 * small enough that a long session does not grow without bound.
 */
export const RUN_HISTORY_LIMIT = 50;

export interface InMemoryStorageOptions {
  readonly initialProfile?: PlayerProfile;
  readonly initialRuns?: readonly RunResult[];
  /** Used to repair a damaged profile. Read at the edge; never in `game-core`. */
  readonly now?: () => string;
  readonly firstMapId?: string;
  readonly historyLimit?: number;
}

export class InMemoryStorage implements StorageAdapter {
  private profile: PlayerProfile | null;
  private runs: RunResult[];
  private readonly now: () => string;
  private readonly firstMapId: string;
  private readonly historyLimit: number;

  constructor(options: InMemoryStorageOptions = {}) {
    this.profile = options.initialProfile ?? null;
    this.runs = [...(options.initialRuns ?? [])];
    this.now = options.now ?? (() => new Date().toISOString());
    this.firstMapId = options.firstMapId ?? 'map-1';
    this.historyLimit = options.historyLimit ?? RUN_HISTORY_LIMIT;
  }

  loadProfile(): Promise<PlayerProfile | null> {
    if (this.profile === null) return Promise.resolve(null);

    // Repaired field by field rather than discarded (spec §17): a profile with
    // one bad number is still the player's progress.
    return Promise.resolve(coercePlayerProfile(this.profile, this.now(), this.firstMapId));
  }

  saveProfile(profile: PlayerProfile): Promise<void> {
    this.profile = profile;

    return Promise.resolve();
  }

  appendRun(result: RunResult): Promise<void> {
    // Newest first, so reading recent form never has to reverse the list.
    this.runs = [result, ...this.runs].slice(0, this.historyLimit);

    return Promise.resolve();
  }

  listRuns(limit = this.historyLimit): Promise<readonly RunResult[]> {
    return Promise.resolve(this.runs.slice(0, Math.max(0, limit)));
  }

  listRunsForMap(mapId: string, limit = this.historyLimit): Promise<readonly RunResult[]> {
    return Promise.resolve(
      this.runs.filter((run) => run.mapId === mapId).slice(0, Math.max(0, limit)),
    );
  }

  clear(): Promise<void> {
    this.profile = null;
    this.runs = [];

    return Promise.resolve();
  }
}
