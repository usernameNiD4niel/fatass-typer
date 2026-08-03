import type { JSX } from 'react';

import styles from './ScreenFallback.module.css';

/**
 * What stands in while a lazily-loaded screen arrives (spec §12, §16).
 *
 * Deliberately quiet: on a warm cache these chunks arrive in a frame or two,
 * and a spinner that flashes for 16ms is worse than nothing. So it is a line of
 * text, announced politely for anyone who cannot see the screen change, with no
 * animation to flash.
 */

export interface ScreenFallbackProps {
  /** What is loading, for the announcement. */
  readonly label?: string;
}

export function ScreenFallback({ label = 'screen' }: ScreenFallbackProps): JSX.Element {
  return (
    <section className={styles.fallback} aria-label="Loading">
      <p className={styles.text} role="status" aria-live="polite">
        Loading the {label}…
      </p>
    </section>
  );
}
