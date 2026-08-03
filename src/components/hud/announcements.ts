import type { ThreatLevel } from './threat';

/**
 * What a run says out loud (spec §12).
 *
 * The canvas is not screen-reader playable, and pretending otherwise by
 * narrating every frame would be worse than saying nothing. So this narrates
 * *moments*: the things a sighted player learns from a glance at the scene and
 * would otherwise simply miss.
 *
 * Two rules keep it usable:
 *
 *   1. **Never per keystroke.** A live region that updates on every character
 *      is a screen reader that never stops talking. The prompt text itself is
 *      already the field's accessible name.
 *   2. **Only on change.** The dogs closing in is worth one sentence when it
 *      happens, not one every 100ms while it stays true.
 *
 * Pure and independent of React so the wording is testable on its own.
 */

export type RunMoment =
  | { readonly kind: 'started' }
  | { readonly kind: 'paused' }
  | { readonly kind: 'resumed' }
  | { readonly kind: 'obstacleWarning' }
  | { readonly kind: 'hit'; readonly reason: 'stumbled' | 'collided' }
  | { readonly kind: 'threat'; readonly level: ThreatLevel }
  | {
      readonly kind: 'finished';
      readonly completed: boolean;
      readonly score: number;
      readonly wpm: number;
    };

const THREAT_SENTENCE: Readonly<Record<ThreatLevel, string>> = {
  // 'safe' is the absence of news, and news is the only thing worth an
  // interruption. It reads as a recovery, which is why it is not silent.
  safe: 'You have pulled ahead of the dogs.',
  closing: 'The dogs are closing in.',
  critical: 'The dogs are right behind you.',
  caught: 'The dogs have caught you.',
};

export function announcementFor(moment: RunMoment): string {
  switch (moment.kind) {
    case 'started':
      return 'Run started. Type the prompt.';
    case 'paused':
      return 'Paused. Press Escape to resume.';
    case 'resumed':
      return 'Resumed.';
    case 'obstacleWarning':
      return 'Obstacle ahead. Type the prompt before you reach it.';
    case 'hit':
      return moment.reason === 'stumbled'
        ? 'You stumbled. The dogs gained ground.'
        : 'You hit the obstacle. The dogs gained ground.';
    case 'threat':
      return THREAT_SENTENCE[moment.level];
    case 'finished':
      return moment.completed
        ? `Finished. Score ${String(Math.round(moment.score))}, ${String(Math.round(moment.wpm))} words per minute.`
        : `Caught by the dogs. Score ${String(Math.round(moment.score))}.`;
  }
}

/**
 * Whether a change in threat is worth saying.
 *
 * Only escalation, and only once per level: a player oscillating around a
 * boundary must not be told about it forty times.
 */
export function shouldAnnounceThreat(previous: ThreatLevel, next: ThreatLevel): boolean {
  if (previous === next) return false;

  const rank: Readonly<Record<ThreatLevel, number>> = {
    safe: 0,
    closing: 1,
    critical: 2,
    caught: 3,
  };

  // Recovery all the way back to safe is also news — it is the one piece of
  // good news the chase ever produces.
  return rank[next] > rank[previous] || next === 'safe';
}
