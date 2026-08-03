import { type JSX, useEffect, useRef } from 'react';

import { Button, Panel } from '../ui';
import styles from './PauseOverlay.module.css';

/**
 * Pause overlay (spec §9, §4).
 *
 * Over the frozen canvas, not instead of it: the player should see the run they
 * are returning to.
 *
 * Focus moves to Resume when it opens. A paused game that leaves focus in the
 * typing field would swallow the first keystroke of the resume — and a keyboard
 * player would have no way to reach these controls at all.
 */

export interface PauseOverlayProps {
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onQuit: () => void;
}

export function PauseOverlay({ onResume, onRestart, onQuit }: PauseOverlayProps): JSX.Element {
  const resumeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    resumeRef.current?.focus();
  }, []);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Paused">
      <Panel className={styles.panel}>
        <h2 className={styles.title}>Paused</h2>
        <p className={styles.hint}>Press Escape to resume</p>

        <div className={styles.actions}>
          <Button ref={resumeRef} variant="primary" onClick={onResume}>
            Resume
          </Button>
          <Button onClick={onRestart}>Restart run</Button>
          <Button onClick={onQuit}>Quit to maps</Button>
        </div>
      </Panel>
    </div>
  );
}
