import type { JSX } from 'react';

/** Temporary token preview. Removed when real screens land in phase E. */
const SWATCHES = [
  { token: '--surface-raised', label: 'Raised surface' },
  { token: '--accent-default', label: 'Accent' },
  { token: '--status-success', label: 'Success' },
  { token: '--status-warning', label: 'Warning' },
  { token: '--status-danger', label: 'Danger' },
  { token: '--text-primary', label: 'Primary text' },
] as const;

/**
 * Scaffold shell. Real screens and the app state machine arrive in steps A5 and E2.
 */
export function App(): JSX.Element {
  return (
    <main className="scaffold">
      <h1 className="scaffold__title">Typing Chase</h1>
      <p className="scaffold__subtitle">
        Scaffold running. Step A4 complete — design tokens wired, light and dark themes follow the
        system preference until Settings lands.
      </p>
      <ul className="scaffold__swatches" aria-label="Design token preview">
        {SWATCHES.map(({ token, label }) => (
          <li
            key={token}
            className="scaffold__swatch"
            style={{ backgroundColor: `var(${token})` }}
            title={`${label} (${token})`}
          />
        ))}
      </ul>
    </main>
  );
}
