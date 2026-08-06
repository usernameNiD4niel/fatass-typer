import { useCallback, useEffect, useMemo, useState } from 'react';

import { MAP_1, MAPS } from '../content';
import { createPlayerProfile, type PlayerProfile, type RunResult } from '../game-core/models';
import { applyRunResult } from '../game-core/progress';
import {
  InMemoryStorage,
  IndexedDbStorage,
  indexedDbAvailable,
  type StorageAdapter,
} from '../storage';

/**
 * The player's profile, backed by a `StorageAdapter`.
 *
 * IndexedDB by default (plan 2.1), so progress survives a reload. Everything
 * above this hook was already written against the async interface, which is why
 * turning the seam on changed nothing else.
 *
 * Screens take a profile as a prop rather than reaching for this hook, so the
 * source stays swappable.
 */

/**
 * The best store this environment can offer.
 *
 * Falls back to memory when the browser will not persist — private-browsing
 * modes, blocked storage, and the test environment all land here. A player with
 * no durable storage gets a session's worth of progress rather than a broken
 * game; the adapter itself already swallows failures, and this avoids opening a
 * database that was never going to work.
 */
function defaultStorage(): StorageAdapter {
  return indexedDbAvailable() ? new IndexedDbStorage() : new InMemoryStorage();
}

export interface UsePlayerProfileOptions {
  readonly storage?: StorageAdapter;
  /** The clock, read here at the edge because `game-core` may not read one. */
  readonly now?: () => string;
}

export interface PlayerProfileHandle {
  readonly profile: PlayerProfile;
  /** False until the stored profile has loaded. */
  readonly loaded: boolean;
  readonly setProfile: (profile: PlayerProfile) => void;
  /** Folds a finished run into the profile and appends it to run history. */
  readonly recordRun: (result: RunResult) => void;
  /**
   * Erases the stored profile and run history.
   *
   * A real destructive action now that progress persists, rather than the
   * development convenience it was while everything died on reload. The
   * settings screen confirms before calling it.
   */
  readonly resetProgress: () => void;
}

export function usePlayerProfile(options: UsePlayerProfileOptions = {}): PlayerProfileHandle {
  // Both held for the lifetime of the hook. A new adapter every render would
  // throw the player's progress away on every keystroke, and a new clock would
  // re-create every callback that depends on it.
  const now = useMemo(() => options.now ?? (() => new Date().toISOString()), [options.now]);
  const storage = useMemo(() => options.storage ?? defaultStorage(), [options.storage]);

  const [profile, setProfileState] = useState<PlayerProfile>(() =>
    createPlayerProfile(now(), MAP_1.id),
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void storage.loadProfile().then((stored) => {
      // A profile arriving after the component has gone would be a state update
      // on an unmounted tree, and worse, a stale one.
      if (cancelled) return;
      if (stored !== null) setProfileState(stored);
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setProfile = useCallback(
    (next: PlayerProfile) => {
      setProfileState(next);
      void storage.saveProfile(next);
    },
    [storage],
  );

  const recordRun = useCallback(
    (result: RunResult) => {
      // Computed from the *current* profile, so bests and unlocks compare
      // against what the player had before this run.
      setProfileState((current) => {
        const next = applyRunResult({ profile: current, result, maps: MAPS, now: now() });
        void storage.saveProfile(next);

        return next;
      });

      void storage.appendRun(result);
    },
    [storage, now],
  );

  const resetProgress = useCallback(() => {
    setProfileState((current) => {
      // Settings survive a progress reset: they are the player's preferences,
      // not their achievements, and wiping them would be a second, unasked-for
      // change.
      const fresh: PlayerProfile = {
        ...createPlayerProfile(now(), MAP_1.id),
        settings: current.settings,
      };

      void storage.clear().then(() => storage.saveProfile(fresh));

      return fresh;
    });
  }, [storage, now]);

  return { profile, loaded, setProfile, recordRun, resetProgress };
}
