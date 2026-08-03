import type { JSX, ReactNode } from 'react';

import { Button, Modal } from '../../components/ui';
import styles from './Tutorial.module.css';

/**
 * First-run tutorial (spec §9).
 *
 * Four things, once, before the first run — how to go faster, what the prompts
 * with timers are, why the dogs matter, and how to stop. Everything else the
 * game teaches by being played.
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
    title: 'Type the prompt to run faster',
    body: 'Each word you finish gives you a burst of speed. Nothing forces you to type — but the dogs never stop.',
  },
  {
    title: 'Obstacles come with a timer',
    body: 'When something is in the way, its prompt appears with a countdown. Finish it before you reach it and you clear it cleanly.',
  },
  {
    title: 'Mistakes cost ground, not the run',
    body: 'A wrong character breaks your combo and lets the dogs gain. You can always fix it and keep going.',
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
      description="Four things, then you are on your own."
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
