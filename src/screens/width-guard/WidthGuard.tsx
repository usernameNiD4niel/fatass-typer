import type { JSX } from 'react';

import styles from './WidthGuard.module.css';

/**
 * Shown below the minimum width (spec §9).
 *
 * The game needs a physical keyboard and a wide view of the track, so a narrow
 * window is a real limitation rather than a layout that could be squeezed. What
 * it must not be is a dead end with no explanation: this says what the game
 * needs and why, so the player knows what to do about it.
 */

export interface WidthGuardProps {
  readonly minimumWidthPx: number;
}

export function WidthGuard({ minimumWidthPx }: WidthGuardProps): JSX.Element {
  return (
    <section className={styles.screen} aria-label="Window too narrow">
      <h1 className={styles.title}>A little more room, please</h1>
      <p className={styles.body}>
        Typing Chase runs on a desktop browser with a physical keyboard. The track needs a wide view
        so you can read the road far enough ahead to type your way out of it.
      </p>
      <p className={styles.detail}>Widen the window to at least {minimumWidthPx}px to play.</p>
    </section>
  );
}
