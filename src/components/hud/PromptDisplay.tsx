import type { JSX } from 'react';

import type { DeadlinePressureLevel, PromptViewModel } from '../../game-bridge/messages';
import type { CharacterState } from '../../game-core/typing';
import { characterStates, createTypingState } from '../../game-core/typing';
import { classes } from '../ui';
import styles from './PromptDisplay.module.css';

/**
 * The active prompt (spec §9, §12).
 *
 * The clear visual priority of the HUD: largest type, monospaced so characters
 * do not shift width as they are typed, and per-character feedback.
 *
 * Character state comes from `game-core`'s own comparison, not from a second
 * implementation here. The HUD and the rules must agree about what counts as
 * correct, and the only way to guarantee that is to ask the same function.
 */

export interface PromptDisplayProps {
  readonly prompt: PromptViewModel | null;
  /** What the player has entered, straight from the typing field. */
  readonly typed: string;
  readonly deadlineMs?: number | null;
  readonly pressure?: DeadlinePressureLevel;
  /** Placeholder while no prompt is active. */
  readonly idleMessage?: string;
}

const STATE_CLASS: Readonly<Record<CharacterState, string | undefined>> = {
  correct: styles.correct,
  incorrect: styles.incorrect,
  current: styles.current,
  untyped: styles.untyped,
};

const PRESSURE_CLASS: Readonly<Record<DeadlinePressureLevel, string | undefined>> = {
  safe: styles.safe,
  warning: styles.warning,
  critical: styles.critical,
  expired: styles.expired,
};

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

export function PromptDisplay({
  prompt,
  typed,
  deadlineMs = null,
  pressure = 'safe',
  idleMessage = 'Get ready…',
}: PromptDisplayProps): JSX.Element {
  if (prompt === null) {
    return (
      <div className={styles.wrapper}>
        <p className={classes(styles.prompt, styles.idle)}>{idleMessage}</p>
      </div>
    );
  }

  const states = characterStates({
    ...createTypingState(prompt.text),
    typed,
  });

  const isObstacle = prompt.kind === 'obstacle';
  // The bar is a fraction of the *original* budget, so it drains at a constant
  // rate rather than jumping when a new prompt arrives.
  const remaining =
    deadlineMs === null || prompt.remainingMs === null || prompt.remainingMs <= 0
      ? 1
      : Math.min(1, Math.max(0, deadlineMs / prompt.remainingMs));

  return (
    <div className={styles.wrapper}>
      <span className={classes(styles.kind, isObstacle && styles.kindObstacle)}>
        {isObstacle ? 'Obstacle — type it before you reach it' : 'Boost prompt'}
      </span>

      {/*
        One live region for the whole prompt, and it announces the *text*, not
        the per-character state: a screen reader repeating "correct, correct,
        incorrect" on every keystroke would be unusable.
      */}
      <p className={styles.prompt} aria-label={`Type: ${prompt.text}`}>
        {/*
          Split by UTF-16 code unit, matching how the typing engine indexes the
          target. Segmenting by grapheme would look tidier but would put the
          highlight out of step with the rules — and the rules decide what is
          correct. Prompt content is constrained to plain text (spec §15).
        */}
        {/* eslint-disable-next-line @typescript-eslint/no-misused-spread */}
        {[...prompt.text].map((character, index) => (
          <span
            // Index is the identity here: the same position in the same prompt.
            key={`${prompt.promptId}-${String(index)}`}
            className={classes(styles.char, STATE_CLASS[states[index] ?? 'untyped'])}
            aria-hidden="true"
          >
            {character}
          </span>
        ))}
      </p>

      {isObstacle && deadlineMs !== null && (
        <>
          <div
            className={styles.deadlineTrack}
            role="progressbar"
            aria-label="Time left to type this prompt"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(remaining * 100)}
          >
            <div
              className={classes(styles.deadlineFill, PRESSURE_CLASS[pressure])}
              style={{ width: `${String(Math.round(remaining * 100))}%` }}
            />
          </div>
          {/* The number carries the same information as the bar, for anyone the
              colour and length do not reach. */}
          <span className={styles.deadlineText}>{seconds(deadlineMs)} left</span>
        </>
      )}
    </div>
  );
}
