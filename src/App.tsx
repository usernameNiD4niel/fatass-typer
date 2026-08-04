import { type JSX, lazy, type ReactNode, Suspense, useCallback, useEffect, useState } from 'react';

import { Button } from './components/ui';
import { ALL_MAPS, findMap, MAP_1, MAPS, obstaclesFor } from './content';
import { weakCharacters } from './game-core/keystats';
import { progressFor, type PlayerProfile, type RunResult } from './game-core/models';
import { useAppliedSettings } from './hooks/useAppliedSettings';
import { useGameAudio } from './hooks/useGameAudio';
import { useAppMachine } from './hooks/useAppMachine';
import { useMinimumWidth } from './hooks/useMinimumWidth';
import { useReducedMotion } from './hooks/useReducedMotion';
import { usePlayerProfile } from './hooks/usePlayerProfile';
import { ScreenFallback } from './screens/ScreenFallback';
import { hasProgress, MainMenu } from './screens/main-menu';
import { unlockedMap } from './screens/results/run-summary';
import { SplashScreen } from './screens/splash';
import { WidthGuard } from './screens/width-guard';

/**
 * Screens that are not the way in (spec §16).
 *
 * The splash, the menu, and the width guard are eager: they are the first thing
 * a player sees, and a spinner in front of a menu is worse than the bytes it
 * saves. Everything else — including the run, which drags the whole runtime
 * behind it — is fetched when it is first needed, so the first load carries the
 * menu and not the game.
 *
 * Imported from the module rather than the folder barrel: a barrel that also
 * exports helpers would pull the component back into the main chunk through
 * whichever helper the shell happens to use.
 */
const GameScreen = lazy(async () => ({
  default: (await import('./screens/game/GameScreen')).GameScreen,
}));
const LevelBriefing = lazy(async () => ({
  default: (await import('./screens/level-briefing/LevelBriefing')).LevelBriefing,
}));
const MapSelection = lazy(async () => ({
  default: (await import('./screens/map-selection/MapSelection')).MapSelection,
}));
const RunResults = lazy(async () => ({
  default: (await import('./screens/results/RunResults')).RunResults,
}));
const SettingsScreen = lazy(async () => ({
  default: (await import('./screens/settings/SettingsScreen')).SettingsScreen,
}));
const StatisticsScreen = lazy(async () => ({
  default: (await import('./screens/statistics/StatisticsScreen')).StatisticsScreen,
}));
const Tutorial = lazy(async () => ({
  default: (await import('./screens/tutorial/Tutorial')).Tutorial,
}));

/**
 * The app shell.
 *
 * Navigation is the state machine's, never a local boolean (CLAUDE.md §3): this
 * renders whatever screen the current state calls for and sends events back.
 *
 * Every state now has a real screen — the development harness that stood in for
 * them through phases A to E is gone. The `switch` is exhaustive, so adding a
 * state to the machine fails the build here until it has somewhere to go.
 */
/** Below this the game is not playable; spec §9 asks for an explanation, not a squeeze. */
const MINIMUM_WIDTH_PX = 1024;

export function App(): JSX.Element {
  const machine = useAppMachine();
  const { profile, setProfile, recordRun, resetProgress } = usePlayerProfile();
  const wideEnough = useMinimumWidth(MINIMUM_WIDTH_PX);

  // Theme, prompt size, and reduced motion reach the document from here.
  useAppliedSettings(profile.settings);
  const audio = useGameAudio(profile.settings);
  // CSS handles reduced motion on its own; the canvas cannot, so it is resolved
  // here and handed to the run (spec §12).
  const reducedMotion = useReducedMotion(profile.settings.reducedMotion);

  const inRun = machine.state === 'Running' || machine.state === 'Paused';

  useEffect(() => {
    // Menu music everywhere but the run; the run screen starts its own track
    // when the player presses Start, which is also the gesture that unlocks
    // audio in the first place.
    if (!inRun) audio.setTrack('menu');
  }, [audio, inRun]);
  // Which map was chosen — data the player picked, not navigation. Where they
  // are is the machine's business and stays there (CLAUDE.md §3).
  const [selectedMapId, setSelectedMapId] = useState<string>(MAP_1.id);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  /**
   * The profile as it was when the last run started.
   *
   * The results screen reports records and unlocks by comparing against it. If
   * it compared against the live profile — already updated with this very run —
   * every record would look like it had always been there.
   */
  const [profileBeforeRun, setProfileBeforeRun] = useState<PlayerProfile | null>(null);

  const selectedMap = findMap(selectedMapId) ?? MAP_1;
  const resultsProfile = profileBeforeRun ?? profile;
  const nextMap = lastResult === null ? null : unlockedMap(lastResult, resultsProfile, MAPS);

  const startRun = useCallback(() => {
    machine.send('OPEN_MAP_SELECTION');
  }, [machine]);

  const completeTutorial = useCallback(() => {
    setProfile({ ...profile, settings: { ...profile.settings, tutorialCompleted: true } });
  }, [profile, setProfile]);

  const chooseMap = useCallback(
    (mapId: string) => {
      setSelectedMapId(mapId);
      machine.send('SELECT_MAP');
    },
    [machine],
  );

  /**
   * The run ended.
   *
   * The result is kept here rather than in the game screen, because the results
   * screen outlives the canvas that produced it.
   */
  const endRun = useCallback(
    (result: RunResult) => {
      setLastResult(result);
      // The results screen compares against the profile *before* this run, so
      // it is captured here and the profile is updated behind it.
      setProfileBeforeRun(profile);
      recordRun(result);
      machine.send(result.completed ? 'REACH_FINISH' : 'CAUGHT_BY_DOGS');
    },
    [machine, profile, recordRun],
  );

  // Checked before anything else: there is no point rendering a HUD the player
  // cannot use, and no point mounting a canvas they cannot see.
  if (!wideEnough) {
    return (
      <Shell>
        <WidthGuard minimumWidthPx={MINIMUM_WIDTH_PX} />
      </Shell>
    );
  }

  switch (machine.state) {
    case 'Boot':
      return (
        <Shell>
          <SplashScreen
            onReady={() => {
              machine.send('BOOT_COMPLETE');
            }}
          />
        </Shell>
      );

    case 'MainMenu':
      return (
        <Shell>
          {/* Once, before the first run. Dismissing it records that it was seen. */}
          {/* Its own boundary, with no fallback: the menu behind it must not
              flash a loading line while the tutorial chunk arrives. */}
          <Suspense fallback={null}>
            <Tutorial open={!profile.settings.tutorialCompleted} onDismiss={completeTutorial} />
          </Suspense>
          <MainMenu
            profile={profile}
            maps={MAPS}
            onStart={startRun}
            // Only offered when there is something to come back to.
            {...(hasProgress(profile, MAPS) ? { onContinue: startRun } : {})}
            onMaps={() => {
              machine.send('OPEN_MAP_SELECTION');
            }}
            onStatistics={() => {
              machine.send('OPEN_STATISTICS');
            }}
            onSettings={() => {
              machine.send('OPEN_SETTINGS');
            }}
          />
        </Shell>
      );

    case 'Settings':
      return (
        <Shell>
          <SettingsScreen
            settings={profile.settings}
            onChange={(settings) => {
              setProfile({ ...profile, settings });
            }}
            onClose={() => {
              machine.send('CLOSE_SETTINGS');
            }}
            onResetProgress={resetProgress}
          />
        </Shell>
      );

    case 'Statistics':
      return (
        <Shell>
          <StatisticsScreen
            profile={profile}
            maps={MAPS}
            onBack={() => {
              machine.send('BACK');
            }}
          />
        </Shell>
      );

    case 'MapSelection':
      return (
        <Shell>
          {/* Endless belongs on this screen but not in the progression. */}
          <MapSelection
            maps={ALL_MAPS}
            profile={profile}
            onSelect={chooseMap}
            onBack={() => {
              machine.send('BACK');
            }}
          />
        </Shell>
      );

    case 'PreRunCountdown':
      return (
        <Shell>
          <LevelBriefing
            map={selectedMap}
            profile={profile}
            obstacles={obstaclesFor(selectedMap.content.obstacleIds)}
            onStart={() => {
              machine.send('COUNTDOWN_COMPLETE');
            }}
            onBack={() => {
              machine.send('BACK');
            }}
          />
        </Shell>
      );

    case 'Running':
    case 'Paused':
      return (
        <Shell>
          <GameScreen
            mapId={selectedMapId}
            // Read once, as the run starts: a best that updated mid-run would
            // be a target that moves as you approach it.
            bestDistanceMeters={progressFor(profile, selectedMapId).bestDistanceMeters}
            // What the player is known to be bad at, so the run practises it.
            weakCharacters={weakCharacters(profile.keyStats)}
            audio={audio}
            reducedMotion={reducedMotion}
            onRunEnded={endRun}
            /* The runtime restarts itself in place; the machine only has to
               know the run is live again, which `onPauseChange` reports. */
            onPauseChange={(paused) => {
              machine.send(paused ? 'PAUSE' : 'RESUME');
            }}
            onQuit={() => {
              machine.send('QUIT_RUN');
            }}
          />
        </Shell>
      );

    case 'LevelComplete':
    case 'GameOver':
    case 'Results':
      return (
        <Shell>
          {lastResult === null ? (
            // No result to show: only reachable if a run ended without reporting
            // one. Say so and offer the way out rather than showing empty stats.
            <NoResult
              onReturnToMaps={() => {
                machine.send(machine.can('RETURN_TO_MAPS') ? 'RETURN_TO_MAPS' : 'SHOW_RESULTS');
              }}
            />
          ) : (
            <RunResults
              result={lastResult}
              map={selectedMap}
              profile={resultsProfile}
              maps={MAPS}
              onRetry={() => {
                machine.send(machine.can('RETRY') ? 'RETRY' : 'SHOW_RESULTS');
              }}
              {...(nextMap === null
                ? {}
                : {
                    onNextMap: () => {
                      setSelectedMapId(nextMap.id);
                      machine.send(machine.can('NEXT_MAP') ? 'NEXT_MAP' : 'SHOW_RESULTS');
                    },
                  })}
              onReturnToMaps={() => {
                machine.send(machine.can('RETURN_TO_MAPS') ? 'RETURN_TO_MAPS' : 'SHOW_RESULTS');
              }}
            />
          )}
        </Shell>
      );

    case 'PlayerHit':
      // A collision is part of the run, not a screen of its own: the canvas
      // shows it and the simulation carries on.
      return (
        <Shell>
          <GameScreen mapId={selectedMapId} reducedMotion={reducedMotion} onRunEnded={endRun} />
        </Shell>
      );
  }
}

/**
 * The page, and the boundary every lazy screen loads inside.
 *
 * One `<main>` for the whole app: the landmark should not come and go as the
 * player navigates.
 */
function Shell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main>
      <Suspense fallback={<ScreenFallback />}>{children}</Suspense>
    </main>
  );
}

/** The one dead end worth handling: a concluded run with nothing to report. */
function NoResult({ onReturnToMaps }: { onReturnToMaps: () => void }): JSX.Element {
  return (
    <section className="fallback" aria-label="No result">
      <h1>That run did not report a result</h1>
      <p>Nothing was recorded, so there is nothing to show.</p>
      <Button variant="primary" onClick={onReturnToMaps}>
        Return to maps
      </Button>
    </section>
  );
}
