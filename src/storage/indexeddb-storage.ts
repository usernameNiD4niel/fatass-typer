import {
  coercePlayerProfile,
  isRunResult,
  type PlayerProfile,
  type RunResult,
} from '../game-core/models';
import { RUN_HISTORY_LIMIT } from './in-memory-storage';
import type { StorageAdapter } from './storage-adapter';

/**
 * Progress that survives a reload (plan 2.1).
 *
 * The implementation the `StorageAdapter` seam was built for. Everything the
 * interface promises was already async for this reason, so nothing above it
 * changes.
 *
 * ## Why IndexedDB and not `localStorage`
 *
 * `localStorage` is synchronous, and it is synchronous on the main thread — a
 * write blocks the frame it happens in, and this game writes a profile at the
 * end of every run. It also stores strings, so run history would be one large
 * JSON blob rewritten in full on every append. IndexedDB stores records, indexes
 * them, and stays off the critical path.
 *
 * ## It validates everything it reads
 *
 * A stored profile is data the game did not write this session — the browser
 * kept it, a previous version of the game wrote it, and the user can edit it in
 * devtools. So it is coerced field by field on the way in (spec §17), the same
 * recovery the in-memory store already exercised on every load. Runs are checked
 * with `isRunResult` and bad ones are skipped rather than poisoning the list.
 *
 * ## It never takes the game down
 *
 * IndexedDB is unavailable in some private-browsing modes, can be blocked by
 * policy, and can fail mid-session if the user clears site data. Every operation
 * therefore falls back rather than rejecting: a failed load reads as "no
 * profile", and a failed save is dropped. Losing progress is bad; refusing to
 * let somebody play is worse.
 */

const DATABASE_NAME = 'typing-chase';
const DATABASE_VERSION = 1;

const PROFILE_STORE = 'profile';
const RUN_STORE = 'runs';

/** The profile is a single record. This is its key. */
const PROFILE_KEY = 'current';

/** Index on `runs`, so a per-map history does not scan the whole store. */
const MAP_INDEX = 'byMap';

export interface IndexedDbStorageOptions {
  /** Injected so tests can supply a fake. Defaults to the browser's. */
  readonly factory?: IDBFactory;
  readonly databaseName?: string;
  /** Used to repair a damaged profile. Read at the edge; never in `game-core`. */
  readonly now?: () => string;
  readonly firstMapId?: string;
  readonly historyLimit?: number;
}

/** Whether this environment can persist at all. */
export function indexedDbAvailable(factory?: IDBFactory): boolean {
  if (factory !== undefined) return true;

  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    // Accessing the global itself throws under some privacy settings.
    return false;
  }
}

/** Promisifies a request, resolving to `null` rather than rejecting. */
function request<T>(source: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    source.onsuccess = (): void => {
      resolve(source.result);
    };
    source.onerror = (): void => {
      resolve(null);
    };
  });
}

export class IndexedDbStorage implements StorageAdapter {
  private readonly factory: IDBFactory | undefined;
  private readonly databaseName: string;
  private readonly now: () => string;
  private readonly firstMapId: string;
  private readonly historyLimit: number;

  /**
   * The open database, or the attempt in flight.
   *
   * Cached so concurrent calls share one `open` rather than racing several. It
   * resolves to `null` when the environment cannot persist, and every method
   * treats that as "no data" rather than as an error.
   */
  private connection: Promise<IDBDatabase | null> | null = null;

  constructor(options: IndexedDbStorageOptions = {}) {
    this.factory = options.factory;
    this.databaseName = options.databaseName ?? DATABASE_NAME;
    this.now = options.now ?? ((): string => new Date().toISOString());
    this.firstMapId = options.firstMapId ?? 'map-1';
    this.historyLimit = options.historyLimit ?? RUN_HISTORY_LIMIT;
  }

  private open(): Promise<IDBDatabase | null> {
    this.connection ??= new Promise<IDBDatabase | null>((resolve) => {
      const factory = this.factory ?? (indexedDbAvailable() ? indexedDB : undefined);
      if (factory === undefined) {
        resolve(null);

        return;
      }

      let openRequest: IDBOpenDBRequest;
      try {
        openRequest = factory.open(this.databaseName, DATABASE_VERSION);
      } catch {
        resolve(null);

        return;
      }

      openRequest.onupgradeneeded = (): void => {
        const database = openRequest.result;

        if (!database.objectStoreNames.contains(PROFILE_STORE)) {
          database.createObjectStore(PROFILE_STORE);
        }

        if (!database.objectStoreNames.contains(RUN_STORE)) {
          // Keyed by `runId`, which the run already carries — no surrogate key,
          // so appending the same run twice cannot duplicate it.
          const runs = database.createObjectStore(RUN_STORE, { keyPath: 'runId' });
          runs.createIndex(MAP_INDEX, 'mapId', { unique: false });
        }
      };

      openRequest.onsuccess = (): void => {
        resolve(openRequest.result);
      };
      openRequest.onerror = (): void => {
        resolve(null);
      };
      // Another tab holds an old version open. Not an error worth failing on.
      openRequest.onblocked = (): void => {
        resolve(null);
      };
    });

    return this.connection;
  }

  private async store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
    const database = await this.open();
    if (database === null) return null;

    try {
      return database.transaction(name, mode).objectStore(name);
    } catch {
      // The store can be missing if an older database version survives.
      return null;
    }
  }

  async loadProfile(): Promise<PlayerProfile | null> {
    const store = await this.store(PROFILE_STORE, 'readonly');
    if (store === null) return null;

    const stored = await request<unknown>(store.get(PROFILE_KEY));
    if (stored === null || stored === undefined) return null;

    // Field by field rather than all-or-nothing (spec §17): a profile with one
    // bad number is still the player's progress, and this one came off a disk
    // the game does not control.
    return coercePlayerProfile(stored, this.now(), this.firstMapId);
  }

  async saveProfile(profile: PlayerProfile): Promise<void> {
    const store = await this.store(PROFILE_STORE, 'readwrite');
    if (store === null) return;

    await request(store.put(profile, PROFILE_KEY));
  }

  async appendRun(result: RunResult): Promise<void> {
    const store = await this.store(RUN_STORE, 'readwrite');
    if (store === null) return;

    await request(store.put(result));
    await this.trimHistory();
  }

  /**
   * Drops the oldest runs once the cap is passed.
   *
   * The in-memory store gets this for free by slicing on append. A keyed store
   * does not, and without it a player who runs every day accumulates records
   * forever — the one failure mode that only appears months later.
   */
  private async trimHistory(): Promise<void> {
    const all = await this.readAllRuns();
    if (all.length <= this.historyLimit) return;

    const store = await this.store(RUN_STORE, 'readwrite');
    if (store === null) return;

    for (const stale of all.slice(this.historyLimit)) {
      await request(store.delete(stale.runId));
    }
  }

  /** Every valid stored run, newest first. */
  private async readAllRuns(): Promise<readonly RunResult[]> {
    const store = await this.store(RUN_STORE, 'readonly');
    if (store === null) return [];

    const stored = await request<unknown[]>(store.getAll());
    if (stored === null) return [];

    // A record that does not validate is skipped rather than repaired: unlike a
    // profile, one bad run is not somebody's progress, and a history is more
    // useful missing an entry than carrying a fictional one.
    return stored
      .filter((entry): entry is RunResult => isRunResult(entry))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async listRuns(limit = this.historyLimit): Promise<readonly RunResult[]> {
    return (await this.readAllRuns()).slice(0, Math.max(0, limit));
  }

  async listRunsForMap(mapId: string, limit = this.historyLimit): Promise<readonly RunResult[]> {
    const all = await this.readAllRuns();

    return all.filter((run) => run.mapId === mapId).slice(0, Math.max(0, limit));
  }

  async clear(): Promise<void> {
    const profile = await this.store(PROFILE_STORE, 'readwrite');
    if (profile !== null) await request(profile.clear());

    const runs = await this.store(RUN_STORE, 'readwrite');
    if (runs !== null) await request(runs.clear());
  }
}
