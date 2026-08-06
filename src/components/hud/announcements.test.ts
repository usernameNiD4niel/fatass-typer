import { describe, expect, it } from 'vitest';

import { announcementFor } from './announcements';

describe('announcementFor', () => {
  it('says what happened, in a sentence', () => {
    expect(announcementFor({ kind: 'started' })).toMatch(/type the word/i);
    expect(announcementFor({ kind: 'paused' })).toMatch(/paused/i);
  });

  it('names the word, because it is out in the world where nothing can read it', () => {
    // The typing field used to carry the word as its accessible name. With the
    // field gone, this sentence is the only thing that says it out loud.
    expect(announcementFor({ kind: 'challenge', word: 'river' })).toContain('river');
  });

  it('distinguishes running out of time from being caught outright', () => {
    const timedOut = announcementFor({ kind: 'hit', reason: 'timedOut' });
    const collided = announcementFor({ kind: 'hit', reason: 'collided' });

    // They happen for different reasons; hearing the same sentence for both
    // would hide which mistake was made.
    expect(timedOut).not.toBe(collided);
    expect(timedOut).toMatch(/time/i);
  });

  it('reports the outcome of a finished run with its numbers', () => {
    const text = announcementFor({ kind: 'finished', completed: true, score: 1234.6, wpm: 23.4 });

    expect(text).toContain('1235');
    expect(text).toContain('23');
    expect(text).toMatch(/finished/i);
  });

  it('says plainly that the run was lost', () => {
    const text = announcementFor({ kind: 'finished', completed: false, score: 400, wpm: 18 });

    expect(text).toMatch(/caught/i);
    expect(text).toContain('400');
  });

  it('never announces a keystroke', () => {
    // There is deliberately no moment for one: a live region that updates per
    // character is a screen reader that never stops talking.
    const kinds = ['started', 'paused', 'resumed'] as const;

    for (const kind of kinds) {
      expect(announcementFor({ kind })).not.toMatch(/character|letter|key/i);
    }
  });
});
