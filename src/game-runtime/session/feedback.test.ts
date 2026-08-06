import { describe, expect, it } from 'vitest';

import { attachGame, MAX_SNAPSHOT_POPUPS, type AttachedGame } from '../../game-bridge';

/**
 * Feedback the player can actually see (plan 1.3, 1.4).
 *
 * The rules already knew what every word was worth and what every mistake cost,
 * and said none of it: score was a number in a corner that changed by an
 * unexplained amount, and the only pressure was a deadline nobody can see.
 * These assert the channels that now carry it — a floating label per event, a
 * camera kick sized by how decisively a hazard was cleared, and something
 * behind you that closes when you are sloppy.
 */

function start(seed: string): AttachedGame {
  const game = attachGame({ seed });
  game.bridge.send({ type: 'startRun' });

  return game;
}

/** Advances until a word is on screen, or gives up. */
function untilWord(game: AttachedGame, limitMs = 60_000): string {
  for (let elapsed = 0; elapsed < limitMs; elapsed += 16) {
    const word = game.snapshot.challenge?.word;
    if (word !== undefined && word.length > 0) return word;
    game.advance(16);
  }

  return '';
}

function livePopups(game: AttachedGame): readonly { points: number; kind: string }[] {
  return game.snapshot.popups.filter((popup) => popup.id !== '');
}

describe('score popups', () => {
  it('says what a completed word was worth, where it happened', () => {
    const game = start('popup-gain');
    const word = untilWord(game);
    expect(word).not.toBe('');

    game.bridge.send({ type: 'submitInput', value: word, timestampMs: 0 });
    game.advance(16);

    const gains = livePopups(game).filter((popup) => popup.kind === 'gain');
    expect(gains.length).toBeGreaterThan(0);
    expect(gains[0]?.points).toBeGreaterThan(0);
    // Whole points. The score is carried as a float, and the first build of
    // this drew "+654.4791532272574" over the road.
    expect(gains[0]?.points).toBe(Math.round(gains[0]?.points ?? 0));

    game.destroy();
  });

  it('shows the penalty on the keystroke that caused it, not at the end of the word', () => {
    const game = start('popup-loss');
    const word = untilWord(game);
    expect(word).not.toBe('');

    // One wrong character. The prompt is nowhere near finished, so the charge
    // itself is still deferred — the point is that the player is told now.
    const wrong = word.startsWith('q') ? 'z' : 'q';
    game.bridge.send({ type: 'submitInput', value: wrong, timestampMs: 0 });
    game.advance(16);

    const losses = livePopups(game).filter((popup) => popup.kind === 'loss');
    expect(losses.length).toBeGreaterThan(0);
    expect(losses[0]?.points).toBeLessThan(0);

    game.destroy();
  });

  it('recycles the oldest label rather than dropping the newest', () => {
    const game = start('popup-pool');
    const word = untilWord(game);
    expect(word).not.toBe('');

    // Far more mistakes than the pool can hold, each a fresh wrong character
    // so every one is a new miss rather than the same buffer resubmitted.
    for (let index = 0; index < MAX_SNAPSHOT_POPUPS * 3; index += 1) {
      const wrong = index % 2 === 0 ? 'q' : 'z';
      game.bridge.send({ type: 'submitInput', value: wrong, timestampMs: 0 });
      game.advance(16);
    }

    expect(livePopups(game).length).toBeLessThanOrEqual(MAX_SNAPSHOT_POPUPS);
    expect(livePopups(game).length).toBeGreaterThan(0);

    game.destroy();
  });

  it('lets a label expire, so they do not pile up on the road', () => {
    const game = start('popup-expiry');
    const word = untilWord(game);
    expect(word).not.toBe('');

    game.bridge.send({ type: 'submitInput', value: word, timestampMs: 0 });
    game.advance(16);
    expect(livePopups(game).length).toBeGreaterThan(0);

    // Comfortably past the lifetime.
    for (let elapsed = 0; elapsed < 2_000; elapsed += 16) game.advance(16);

    expect(game.snapshot.popupCount).toBe(0);

    game.destroy();
  });
});

describe('restarting', () => {
  it('clears labels left over from the previous run', () => {
    const game = start('popup-restart');
    const word = untilWord(game);
    expect(word).not.toBe('');

    game.bridge.send({ type: 'submitInput', value: word, timestampMs: 0 });
    game.advance(16);
    expect(livePopups(game).length).toBeGreaterThan(0);

    // Seen in the browser: a label from the finished run hung over the new
    // road, because they age on wall-clock time and a stopped run has no
    // frames to age them with.
    game.bridge.send({ type: 'restart' });
    game.advance(16);

    expect(livePopups(game).length).toBe(0);
    expect(game.snapshot.popupCount).toBe(0);

    game.destroy();
  });
});

describe('camera punch', () => {
  it('kicks the field of view when a hazard is cleared, then gives it back', () => {
    const game = start('punch');
    const word = untilWord(game);
    expect(word).not.toBe('');

    expect(game.snapshot.impulse.punch).toBe(0);

    game.bridge.send({ type: 'submitInput', value: word, timestampMs: 0 });
    game.advance(16);

    expect(game.snapshot.impulse.punch).toBeGreaterThan(0);

    // It is a hit, not a state: it is gone within a second.
    for (let elapsed = 0; elapsed < 3_000; elapsed += 16) game.advance(16);
    expect(game.snapshot.impulse.punch).toBe(0);

    game.destroy();
  });
});

describe('the chaser', () => {
  it('is behind the player at the start and reported to the HUD', () => {
    const game = start('pursuit-start');
    game.advance(16);

    expect(game.snapshot.pursuit.gapMeters).toBeGreaterThan(0);
    expect(game.snapshot.pursuit.pressure).toBe(0);

    game.destroy();
  });

  it('closes when a character is mistyped', () => {
    const game = start('pursuit-mistake');
    const word = untilWord(game);
    expect(word).not.toBe('');

    const before = game.snapshot.pursuit.gapMeters;
    game.bridge.send({
      type: 'submitInput',
      value: word.startsWith('q') ? 'z' : 'q',
      timestampMs: 0,
    });
    game.advance(16);

    expect(game.snapshot.pursuit.gapMeters).toBeLessThan(before);
    expect(game.snapshot.pursuit.pressure).toBeGreaterThan(0);

    game.destroy();
  });

  it('ends the run once it arrives, after an impact beat', () => {
    const game = start('pursuit-caught');
    const word = untilWord(game);
    expect(word).not.toBe('');

    // Enough wrong characters to close the whole gap. Each one is a fresh
    // miss rather than the same buffer resubmitted.
    for (let index = 0; index < 400; index += 1) {
      game.bridge.send({ type: 'submitInput', value: index % 2 === 0 ? 'q' : 'z', timestampMs: 0 });
      game.advance(16);
      if (game.snapshot.phase !== 'running') break;
    }

    expect(game.snapshot.pursuit.gapMeters).toBe(0);
    // The beat first, then the end — the same courtesy a collision gets.
    expect(game.snapshot.phase).toBe('playerHit');

    for (let elapsed = 0; elapsed < 3_000; elapsed += 16) game.advance(16);
    expect(game.snapshot.phase).toBe('gameOver');

    game.destroy();
  });
});
