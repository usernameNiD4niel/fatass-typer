import type { JSX } from 'react';
import { useAppMachine } from './hooks/useAppMachine';
import { GameScreen } from './screens/game';

/**
 * Scaffold shell driving the app state machine directly.
 *
 * This is a development harness, not the real UI — every state gets one button
 * per legal event so the graph from spec §4 can be walked by hand. Real screens
 * replace it in phase E.
 *
 * The one real screen so far is the playable slice, which the harness mounts
 * whenever the machine is in a run state.
 */
export function App(): JSX.Element {
  const machine = useAppMachine();
  const inRun = machine.state === 'Running' || machine.state === 'Paused';

  return (
    <main className="scaffold">
      <h1 className="scaffold__title">Typing Chase</h1>
      <p className="scaffold__subtitle">
        Step A5 complete — the app state machine drives navigation. Real screens arrive in phase E.
      </p>

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

      {inRun && <GameScreen />}
    </main>
  );
}
