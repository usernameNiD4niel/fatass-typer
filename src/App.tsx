import type { JSX } from 'react';

/**
 * Scaffold shell. Real screens and the app state machine arrive in steps A5 and E2.
 */
export function App(): JSX.Element {
  return (
    <main className="scaffold">
      <h1 className="scaffold__title">Typing Chase</h1>
      <p className="scaffold__subtitle">
        Scaffold running. Step A1 complete — tooling and build pipeline only.
      </p>
    </main>
  );
}
