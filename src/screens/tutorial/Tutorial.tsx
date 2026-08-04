import type { JSX, ReactNode } from 'react';

import { Button, Modal } from '../../components/ui';
import styles from './Tutorial.module.css';

/**
 * First-run tutorial (spec §9).
 *
 * Six things, once, before the first run — how to get past what is in the way,
 * what the deadline means, which encounters are optional, and how to stop.
 * Everything else the game teaches by being played.
 *
 * A dialog rather than a screen: the player asked to start a run, and this is a
 * short interruption to that, not a detour they have to navigate back out of.
 */

export interface TutorialProps {
  readonly open: boolean;
  /** Dismissed. The caller records that it has been seen. */
  readonly onDismiss: () => void;
}

interface Step {
  readonly title: string;
  readonly body: ReactNode;
}

const STEPS: readonly Step[] = [
  {
    title: 'Type the word to get past',
    body: 'A car blocks your lane and a word appears on the open side; type it and you pull into that lane. A barrier blocks it and the word sits above; type it and you jump.',
  },
  {
    title: 'Coins are optional',
    body: 'Between hazards, coins appear one lane over with a word of their own. Type it and you swerve across and take them. Ignore it and you just drive past — missing coins costs you nothing.',
  },
  {
    title: 'Obstacles come with a timer',
    body: 'When something is in the way, its word appears with a deadline. Finish it in time and you clear it cleanly; run out and you hit it, and one hit ends the run.',
  },
  {
    title: 'Mistakes cost ground, not the run',
    body: 'A wrong character breaks your combo, not your run. Fix it and keep going — but the hazard is still coming.',
  },
  {
    title: 'Powerups need a clean sentence',
    body: 'Once a minute a crate appears with a whole sentence on it. Type it perfectly and you get flight, extra lives, or a magnet. One wrong character and it is gone.',
  },
  {
    title: 'Escape pauses',
    body: (
      <>
        Press <span className={styles.key}>Esc</span> at any point. The run freezes exactly where it
        is.
      </>
    ),
  },
];

export function Tutorial({ open, onDismiss }: TutorialProps): JSX.Element {
  return (
    <Modal
      open={open}
      onClose={onDismiss}
      title="How Typing Chase works"
      description="Six things, then you are on your own."
      closeLabel="Skip the tutorial"
      footer={
        <Button variant="primary" onClick={onDismiss}>
          Got it
        </Button>
      }
    >
      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.marker} aria-hidden="true">
              {index + 1}
            </span>
            <div className={styles.stepBody}>
              <p className={styles.stepTitle}>{step.title}</p>
              <p className={styles.stepText}>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
