import { type JSX, useCallback, useEffect, useState } from 'react';

import { Button } from './components/ui';
import { findMap, MAP_1, MAPS, obstaclesFor } from './content';
import type { PlayerProfile, RunResult } from './game-core/models';
import { useAppliedSettings } from './hooks/useAppliedSettings';
import { useGameAudio } from './hooks/useGameAudio';
import { useAppMachine } from './hooks/useAppMachine';
import { useMinimumWidth } from './hooks/useMinimumWidth';
import { usePlayerProfile } from './hooks/usePlayerProfile';
import { GameScreen } from './screens/game';
import { LevelBriefing } from './screens/level-briefing';
import { hasProgress, MainMenu } from './screens/main-menu';
import { MapSelection } from './screens/map-selection';
import { RunResults, unlockedMap } from './screens/results';
import { SettingsScreen } from './screens/settings';
import { SplashScreen } from './screens/splash';
import { StatisticsScreen } from './screens/statistics';
import { Tutorial } from './screens/tutorial';
import { WidthGuard } from './screens/width-guard';

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
      <main>
        <WidthGuard minimumWidthPx={MINIMUM_WIDTH_PX} />
      </main>
    );
  }

  switch (machine.state) {
    case 'Boot':
      return (
        <main>
          <SplashScreen
            onReady={() => {
              machine.send('BOOT_COMPLETE');
            }}
          />
        </main>
      );

    case 'MainMenu':
      return (
        <main>
          {/* Once, before the first run. Dismissing it records that it was seen. */}
          <Tutorial open={!profile.settings.tutorialCompleted} onDismiss={completeTutorial} />
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
        </main>
      );

    case 'Settings':
      return (
        <main>
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
        </main>
      );

    case 'Statistics':
      return (
        <main>
          <StatisticsScreen
            profile={profile}
            maps={MAPS}
            onBack={() => {
              machine.send('BACK');
            }}
          />
        </main>
      );

    case 'MapSelection':
      return (
        <main>
          <MapSelection
            maps={MAPS}
            profile={profile}
            onSelect={chooseMap}
            onBack={() => {
              machine.send('BACK');
            }}
          />
        </main>
      );

    case 'PreRunCountdown':
      return (
        <main>
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
        </main>
      );

    case 'Running':
    case 'Paused':
      return (
        <main>
          <GameScreen
            mapId={selectedMapId}
            audio={audio}
            onRunEnded={endRun}
            onRestart={() => {
              machine.send('RESTART_RUN');
            }}
            onQuit={() => {
              machine.send('QUIT_RUN');
            }}
          />
        </main>
      );

    case 'LevelComplete':
    case 'GameOver':
    case 'Results':
      return (
        <main>
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
        </main>
      );

    case 'PlayerHit':
      // A collision is part of the run, not a screen of its own: the canvas
      // shows it and the simulation carries on.
      return (
        <main>
          <GameScreen mapId={selectedMapId} onRunEnded={endRun} />
        </main>
      );
  }
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
