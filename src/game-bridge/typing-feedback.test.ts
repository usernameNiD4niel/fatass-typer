import { describe, expect, it } from 'vitest';

import { attachGame, type AttachedGame } from './attach';

/**
 * What the player sees while they are typing.
 *
 * ## The bug these pin
 *
 * Reported from play: *"when I type some letter the highlighted typed word
 * transforms into not typed word, it occurs sometimes but sometimes it does
 * work properly"*, together with a sense of lag between a key and the screen.
 *
 * One cause for both. Keystrokes arrive from the keyboard and were applied to
 * the rules immediately — but `WorldSnapshot.challenge`, which is what the
 * scene actually draws, was only rebuilt inside `advance()`. So between two
 * frames the snapshot described the word with **fewer characters typed than the
 * player had typed**, and any repaint landing in that window drew the stale
 * count: characters that had gone green turned grey again.
 *
 * "Sometimes" is the tell. Whether it happened depended on where the frame
 * boundary fell between two keystrokes, which is a coin toss at typing speed.
 *
 * These tests never call `advance`. That is the whole point: what the scene is
 * told must be true the instant the key is pressed, not one frame later.
 */

function running(seed: string): AttachedGame {
  const game = attachGame({ seed });
  game.bridge.send({ type: 'startRun', mapId: 'map-1' });
  // Past the countdown, so there is a word on screen.
  for (let frame = 0; frame < 200; frame += 1) game.advance(16);

  return game;
}

function type(game: AttachedGame, value: string): void {
  game.bridge.send({ type: 'submitInput', value, timestampMs: value.length });
}

describe('what the scene is told while the player types', () => {
  it('counts every keystroke without waiting for a frame', () => {
    const game = running('feedback');
    const word = game.snapshot.challenge?.word ?? '';
    expect(word.length).toBeGreaterThan(1);

    // Every prefix but the last: completing the word hands the field to the
    // next one, which is its own case below.
    for (let length = 1; length < word.length; length += 1) {
      type(game, word.slice(0, length));

      expect(game.snapshot.challenge?.word, `after ${String(length)} characters`).toBe(word);
      expect(game.snapshot.challenge?.typedLength, `after ${String(length)}`).toBe(length);
    }

    game.destroy();
  });

  /*
   * The symptom itself. Highlighting is `typedLength` characters of the word,
   * so a `typedLength` that goes *down* while the word stays the same is
   * literally green characters turning grey — with no key having been deleted.
   */
  it('never un-highlights a character the player still has typed', () => {
    const game = running('backwards');
    /** What the scene is currently being told, as a pair. */
    const shown = (): { word: string; typedLength: number } => {
      const challenge = game.snapshot.challenge;

      return {
        word: challenge === null ? '' : challenge.word,
        typedLength: challenge?.typedLength ?? 0,
      };
    };

    let previous = shown();

    for (let round = 0; round < 40; round += 1) {
      const word = previous.word;
      if (word.length === 0) break;

      for (let length = 1; length <= word.length; length += 1) {
        type(game, word.slice(0, length));

        const now = shown();
        if (now.word === previous.word) {
          expect(now.typedLength, `"${word}" went backwards`).toBeGreaterThanOrEqual(
            previous.typedLength,
          );
        }

        previous = now;
      }
    }

    game.destroy();
  });

  it('hands the field to the next word the moment the current one is finished', () => {
    const game = running('handover');
    const word = game.snapshot.challenge?.word ?? '';
    const promised = game.snapshot.challenge?.nextWord ?? '';

    type(game, word);

    // Not one frame later. `promptChanged` repaints React straight away, and it
    // used to repaint against a snapshot still holding the finished word.
    expect(game.snapshot.challenge?.word).toBe(promised);
    expect(game.snapshot.challenge?.typedLength).toBe(0);

    game.destroy();
  });

  it('keeps the correct prefix highlighted through a mistake', () => {
    const game = running('mistake');
    const word = game.snapshot.challenge?.word ?? '';
    expect(word.length).toBeGreaterThan(2);

    type(game, word.slice(0, 2));
    type(game, `${word.slice(0, 2)}\u00a7`);

    const shown = game.snapshot.challenge;
    // The error is marked at its own index; everything before it is still typed.
    expect(shown?.firstErrorIndex).toBe(2);
    expect(shown?.typedLength).toBeGreaterThanOrEqual(2);

    game.destroy();
  });
});
