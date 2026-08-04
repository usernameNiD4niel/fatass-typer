import { type JSX, useEffect, useState } from 'react';

import { Button } from '../../components/ui';
import styles from './SplashScreen.module.css';

/**
 * Splash and loading (spec §9, §16).
 *
 * There is nothing to load yet — every asset in the manifest is optional and the
 * game draws itself from vector shapes — so this reports an honest, quick
 * "ready" rather than staging a fake loading bar. When real art arrives it is
 * the manifest that grows, and this screen reads its progress from there.
 *
 * The progress is announced as text as well as drawn as a bar: a bar alone tells
 * a screen-reader user nothing (spec §12).
 */

export interface SplashScreenProps {
  /** Fired when loading finishes — the app machine's `BOOT_COMPLETE`. */
  readonly onReady: () => void;
  /** How long the minimum splash lasts, in milliseconds. */
  readonly minimumDurationMs?: number;
  /**
   * Assets still to load. Zero today: nothing in the manifest is required.
   *
   * Passed in rather than read from the manifest, because a screen may not reach
   * into `game-runtime` (CLAUDE.md §3) — when real loading exists, the count
   * comes over the bridge like everything else.
   */
  readonly pendingAssets?: number;
}

/**
 * A beat long enough to read the title, short enough not to be a toll booth.
 * Skippable, because the second time the player has read it already.
 */
const DEFAULT_MINIMUM_MS = 700;

export function SplashScreen({
  onReady,
  minimumDurationMs = DEFAULT_MINIMUM_MS,
  pendingAssets = 0,
}: SplashScreenProps): JSX.Element {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Two frames: one to paint at zero, one to animate to full. Going straight
    // to 100 would skip the transition entirely.
    const start = window.setTimeout(() => {
      setProgress(1);
    }, 30);
    const finish = window.setTimeout(onReady, minimumDurationMs);

    return () => {
      window.clearTimeout(start);
      window.clearTimeout(finish);
    };
  }, [onReady, minimumDurationMs]);

  const percent = Math.round(progress * 100);

  return (
    <section className={styles.screen} aria-label="Loading Typing Chase">
      <h1 className={styles.title}>Typing Chase</h1>
      <p className={styles.tagline}>Type fast. The road does not wait.</p>

      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Loading progress"
      >
        <div className={styles.progressFill} style={{ width: `${String(percent)}%` }} />
      </div>

      <p className={styles.status} aria-live="polite">
        {pendingAssets === 0
          ? 'Ready'
          : `Loading ${String(pendingAssets)} asset${pendingAssets === 1 ? '' : 's'}…`}
      </p>

      {/* Skippable: nobody should have to wait out an animation they have seen. */}
      <Button variant="ghost" size="small" onClick={onReady}>
        Skip
      </Button>
    </section>
  );
}
