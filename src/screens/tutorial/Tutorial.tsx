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
    title: 'There is always a word',
    body: 'One word sits in front of you at all times, and the next appears the moment you finish it. Typing is the only control you have.',
  },
  {
    title: 'Something is chasing you',
    body: 'Every word you finish pushes it back, and the faster you finish the further it falls. Let a word run out of time and it closes. It catching you is the only way to lose.',
  },
  {
    title: 'Coins are optional',
    body: 'Now and then coins appear one lane over with a word of their own. Type it and you swerve across and take them. Ignore it and you just drive past — missing coins costs you nothing at all.',
  },
  {
    title: 'Mistakes cost ground, not the run',
    body: 'A wrong character breaks your combo and lets the chaser gain a little. Fix it and keep going — a run is never lost on one slip.',
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
