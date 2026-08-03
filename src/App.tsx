import { type JSX, useCallback, useState } from 'react';

import { findMap, MAP_1, MAPS, obstaclesFor } from './content';
import type { RunResult } from './game-core/models';
import { useAppMachine } from './hooks/useAppMachine';
import { usePlayerProfile } from './hooks/usePlayerProfile';
import { GameScreen } from './screens/game';
import { LevelBriefing } from './screens/level-briefing';
import { hasProgress, MainMenu } from './screens/main-menu';
import { MapSelection } from './screens/map-selection';
import { RunResults, unlockedMap } from './screens/results';
import { SplashScreen } from './screens/splash';

/**
 * The app shell.
 *
 * Navigation is the state machine's, never a local boolean (CLAUDE.md §3): this
 * renders whatever screen the current state calls for and sends events back.
 *
 * States without a screen yet fall through to the development harness — a button
 * per legal transition — so the graph in spec §4 stays walkable while phases E
 * and F fill the gaps in. The harness disappears when the last screen lands.
 */
export function App(): JSX.Element {
  const machine = useAppMachine();
  const { profile } = usePlayerProfile();
  // Which map was chosen — data the player picked, not navigation. Where they
  // are is the machine's business and stays there (CLAUDE.md §3).
  const [selectedMapId, setSelectedMapId] = useState<string>(MAP_1.id);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);

  const selectedMap = findMap(selectedMapId) ?? MAP_1;
  const nextMap = lastResult === null ? null : unlockedMap(lastResult, profile, MAPS);

  const startRun = useCallback(() => {
    machine.send('OPEN_MAP_SELECTION');
  }, [machine]);

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
      machine.send(result.completed ? 'REACH_FINISH' : 'CAUGHT_BY_DOGS');
    },
    [machine],
  );

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
          <MainMenu
            profile={profile}
            maps={MAPS}
            onStart={startRun}
            // Only offered when there is something to come back to.
            {...(hasProgress(profile, MAPS) ? { onContinue: startRun } : {})}
            onMaps={() => {
              machine.send('OPEN_MAP_SELECTION');
            }}
            // No `onStatistics`: the machine has no Statistics state yet, so the
            // menu shows the control disabled rather than routing nowhere. E6
            // adds the screen.
            onSettings={() => {
              machine.send('OPEN_SETTINGS');
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
            <MachineHarness machine={machine} />
          ) : (
            <RunResults
              result={lastResult}
              map={selectedMap}
              profile={profile}
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

    default:
      return (
        <main>
          <MachineHarness machine={machine} />
        </main>
      );
  }
}

/**
 * The development harness for states that have no screen yet.
 *
 * Every legal event gets a button, and only legal events do — the machine
 * decides what is offered, so the harness cannot drift from the graph.
 */
function MachineHarness({ machine }: { machine: ReturnType<typeof useAppMachine> }): JSX.Element {
  return (
    <section className="scaffold">
      <p className="scaffold__state" aria-live="polite">
        State: <strong>{machine.state}</strong>
        {machine.context.settingsOrigin !== null && (
          <span className="scaffold__origin"> (returns to {machine.context.settingsOrigin})</span>
        )}
      </p>

      <nav className="scaffold__events" aria-label="Legal transitions">
        {machine.available.map((type) => (
          <button
            key={type}
            type="button"
            className="scaffold__event"
            onClick={() => {
              machine.send(type);
            }}
          >
            {type}
          </button>
        ))}
      </nav>
    </section>
  );
}
