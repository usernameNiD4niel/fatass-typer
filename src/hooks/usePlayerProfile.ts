import { useCallback, useState } from 'react';

import { MAP_1 } from '../content';
import { createPlayerProfile, type PlayerProfile } from '../game-core/models';

/**
 * The player's profile, for as long as the tab is open.
 *
 * A deliberate placeholder: step F5 introduces the `StorageAdapter` and this
 * hook becomes its React binding. Until then progress resets on reload, which
 * CLAUDE.md §5 records as intended for now.
 *
 * Screens take a profile as a prop rather than reaching for this hook, so
 * swapping the source later touches this file and `App.tsx` and nothing else.
 */
export function usePlayerProfile(): {
  profile: PlayerProfile;
  setProfile: (profile: PlayerProfile) => void;
  /** Development only, until F5 gives progress somewhere durable to live. */
  resetProgress: () => void;
} {
  const [profile, setProfile] = useState<PlayerProfile>(() =>
    // The clock is read here, at the edge, because `game-core` may not read one.
    createPlayerProfile(new Date().toISOString(), MAP_1.id),
  );

  const resetProgress = useCallback(() => {
    // Settings survive a progress reset: they are the player's preferences, not
    // their achievements, and wiping them would be a second, unasked-for change.
    setProfile((current) => ({
      ...createPlayerProfile(new Date().toISOString(), MAP_1.id),
      settings: current.settings,
    }));
  }, []);

  return { profile, setProfile, resetProgress };
}
