import { describe, expect, it } from 'vitest';

import type { ChallengeSnapshot } from '../game-bridge';
import { characterClass, paintTyping } from './typing-paint';

/**
 * The per-frame repaint of the word being typed.
 *
 * This exists because the highlighting used to be React's alone, and React only
 * re-renders this tree when a bridge event arrives — the stats sample, at ~10Hz.
 * A character could therefore stay grey for a tenth of a second after the key
 * that turned it green, which is the input lag that was reported.
 */

function challenge(word: string, typedLength: number, firstErrorIndex = -1): ChallengeSnapshot {
  return {
    kind: 'flow',
    word,
    nextWord: '',
    typedLength,
    firstErrorIndex,
    safeSide: null,
    safeLane: null,
    hazardId: 'flow-1',
    optional: true,
    perfect: false,
    urgency: 0,
  };
}

/** The label as React first builds it: one span per character, none typed. */
function label(word: string): HTMLElement {
  const element = document.createElement('p');

  for (const [index, character] of Array.from(word).entries()) {
    const span = document.createElement('span');
    span.dataset['at'] = String(index);
    span.className = characterClass(0, 0, -1) ?? '';
    span.textContent = character;
    element.append(span);
  }

  return element;
}

function classesOf(element: HTMLElement): string[] {
  return [...element.querySelectorAll<HTMLElement>('[data-at]')].map((span) => span.className);
}

describe('painting the word being typed', () => {
  it('marks everything before the cursor as typed, and the cursor itself', () => {
    const element = label('road');
    paintTyping(element, challenge('road', 2));

    const [first, second, third, fourth] = classesOf(element);

    expect(first).toBe(characterClass(0, 2, -1));
    expect(second).toBe(characterClass(1, 2, -1));
    // The cursor is its own state, not "typed" and not "untyped".
    expect(third).toBe(characterClass(2, 2, -1));
    expect(third).not.toBe(second);
    expect(fourth).not.toBe(third);
  });

  /*
   * The reported symptom, at the level that actually draws it: repainting with a
   * higher count must never leave an earlier character looking untyped.
   */
  it('never walks the highlighting backwards as the count rises', () => {
    const word = 'the corner';
    const element = label(word);
    let previous = classesOf(element);

    for (let typed = 1; typed <= word.length; typed += 1) {
      paintTyping(element, challenge(word, typed));
      const now = classesOf(element);

      for (let index = 0; index < typed - 1; index += 1) {
        // Everything strictly behind the cursor is typed and stays typed.
        expect(now[index], `character ${String(index)} at ${String(typed)}`).toBe(
          characterClass(index, typed, -1),
        );
        if (index < typed - 2) expect(now[index]).toBe(previous[index]);
      }

      previous = now;
    }
  });

  it('marks a mistake without disturbing the correct prefix', () => {
    const element = label('road');
    paintTyping(element, challenge('road', 3, 2));

    const classes = classesOf(element);

    expect(classes[0]).toBe(characterClass(0, 3, 2));
    expect(classes[1]).toBe(characterClass(1, 3, 2));
    expect(classes[2]).toBe(characterClass(2, 3, 2));
    // The error reads differently from the two correct characters before it.
    expect(classes[2]).not.toBe(classes[1]);
  });

  it('leaves the DOM alone when nothing changed', () => {
    // The painter runs 60 times a second on every character of a surge. Writing
    // an identical className every frame would invalidate style for no reason.
    const element = label('road');
    paintTyping(element, challenge('road', 2));

    const before = classesOf(element);
    const first = element.querySelector<HTMLElement>('[data-at="0"]');
    expect(first).not.toBeNull();

    let writes = 0;
    Object.defineProperty(first, 'className', {
      get: () => before[0],
      set: () => {
        writes += 1;
      },
      configurable: true,
    });

    paintTyping(element, challenge('road', 2));

    expect(writes).toBe(0);
  });
});
