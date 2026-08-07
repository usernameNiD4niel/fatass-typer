import type { ChallengeSnapshot } from '../game-bridge';

import styles from './WorldPrompt.module.css';

/**
 * Painting the word the player is typing.
 *
 * Lives apart from `WorldPrompt` because it is shared by the two things that
 * draw the same state: React, which builds the spans, and `useFrame`, which
 * repaints them. Keeping it in the component file also made that file export a
 * non-component, which costs fast refresh.
 */

/**
 * What one character looks like, given how far the player has got.
 *
 * Pulled out of the JSX because it is needed twice: React sets it when the word
 * is built, and `paintTyping` sets it again every frame. Both have to agree,
 * and two copies of this ladder would eventually not.
 */
export function characterClass(
  at: number,
  typedLength: number,
  firstErrorIndex: number,
): string | undefined {
  if (at === firstErrorIndex) return styles.incorrect;
  if (at < typedLength) return styles.correct;
  if (at === typedLength) return styles.current;

  return styles.untyped;
}

/**
 * Repaints the typed-so-far highlighting, every frame.
 *
 * ## Why this is not left to React
 *
 * It was, and that was the input lag. The character classes come out of a React
 * render, and React only re-renders this tree when a *bridge event* arrives \u2014
 * in practice the stats sample, at ~10Hz. Keystrokes happen far faster than
 * that, so a character could stay grey for up to a tenth of a second after the
 * key that turned it green, and then several would go green at once. Typing
 * felt like it was being dropped and caught up in bursts.
 *
 * Per-frame data is not supposed to reach React at all (CLAUDE.md \u00a73), and this
 * is per-frame data: it changes with every keystroke. So the structure \u2014 one
 * span per character \u2014 stays React's, and the *state* of each span is written
 * straight to the DOM from `useFrame`, at 60Hz, from the same snapshot the rest
 * of the scene reads.
 *
 * React still sets the same classes when it does render. Deliberate rather than
 * redundant: a newly built word is painted correctly in the frame it appears
 * rather than one frame later, and both paths go through `characterClass`, so
 * they cannot drift apart.
 */
export function paintTyping(word: HTMLElement, challenge: ChallengeSnapshot): void {
  for (const span of word.querySelectorAll<HTMLElement>('[data-at]')) {
    const at = Number(span.dataset['at']);
    if (!Number.isFinite(at)) continue;

    const next = characterClass(at, challenge.typedLength, challenge.firstErrorIndex) ?? '';
    if (span.className !== next) span.className = next;
  }

  // A surge is grouped into words, and each group is shaded once the cursor is
  // past it. Same reasoning: the grouping is React's, the state is not.
  for (const group of word.querySelectorAll<HTMLElement>('[data-end]')) {
    const start = Number(group.dataset['start']);
    const end = Number(group.dataset['end']);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const next = [styles.surgeWord, challenge.typedLength >= end ? styles.surgeWordDone : null]
      .filter(Boolean)
      .join(' ');
    if (group.className !== next) group.className = next;

    const active = challenge.typedLength >= start && challenge.typedLength <= end;
    const activeValue = active ? 'true' : 'false';
    if (group.dataset['active'] !== activeValue) group.dataset['active'] = activeValue;
  }
}
