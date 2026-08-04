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
 *   2. **Only on change.** A hazard appearing is worth one sentence when it
 *      happens, not one every 100ms while it remains true.
 *
 * The word itself is a special case. It used to be the typing field's accessible
 * name; with the field gone it lives in the world, where a screen reader cannot
 * follow it — so it is named once, when the challenge appears.
 *
 * Pure and independent of React so the wording is testable on its own.
 */

export type RunMoment =
  | { readonly kind: 'started' }
  | { readonly kind: 'paused' }
  | { readonly kind: 'resumed' }
  | { readonly kind: 'obstacleWarning' }
  | { readonly kind: 'challenge'; readonly word: string }
  | { readonly kind: 'hit'; readonly reason: 'collided' | 'timedOut' }
  | {
      readonly kind: 'finished';
      readonly completed: boolean;
      readonly score: number;
      readonly wpm: number;
    };

export function announcementFor(moment: RunMoment): string {
  switch (moment.kind) {
    case 'started':
      return 'Run started. Type the word beside each hazard.';
    case 'paused':
      return 'Paused. Press Escape to resume.';
    case 'resumed':
      return 'Resumed.';
    case 'obstacleWarning':
      return 'Hazard ahead. Type the word before you reach it.';
    case 'challenge':
      return `Type ${moment.word}.`;
    case 'hit':
      return moment.reason === 'timedOut'
        ? 'Out of time. You hit the hazard.'
        : 'You hit the hazard.';
    case 'finished':
      return moment.completed
        ? `Finished. Score ${String(Math.round(moment.score))}, ${String(Math.round(moment.wpm))} words per minute.`
        : `Crashed. Score ${String(Math.round(moment.score))}.`;
  }
}
