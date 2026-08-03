import { describe, expect, it } from 'vitest';

import { announcementFor, shouldAnnounceThreat } from './announcements';

describe('announcementFor', () => {
  it('says what happened, in a sentence', () => {
    expect(announcementFor({ kind: 'obstacleWarning' })).toMatch(/obstacle ahead/i);
    expect(announcementFor({ kind: 'paused' })).toMatch(/paused/i);
  });

  it('distinguishes a stumble from a collision', () => {
    const stumble = announcementFor({ kind: 'hit', reason: 'stumbled' });
    const collision = announcementFor({ kind: 'hit', reason: 'collided' });

    // They cost the player different amounts; hearing the same sentence for
    // both would hide that.
    expect(stumble).not.toBe(collision);
  });

  it('reports the outcome of a finished run with its numbers', () => {
    const text = announcementFor({ kind: 'finished', completed: true, score: 1234.6, wpm: 23.4 });

    expect(text).toContain('1235');
    expect(text).toContain('23');
    expect(text).toMatch(/finished/i);
  });

  it('says plainly that the dogs won', () => {
    const text = announcementFor({ kind: 'finished', completed: false, score: 400, wpm: 18 });

    expect(text).toMatch(/caught/i);
  });

  it('never announces a keystroke', () => {
    // There is deliberately no moment for one: a live region that updates per
    // character is a screen reader that never stops talking.
    const kinds = ['started', 'paused', 'resumed', 'obstacleWarning'] as const;

    for (const kind of kinds) {
      expect(announcementFor({ kind })).not.toMatch(/character|letter|key/i);
    }
  });
});

describe('shouldAnnounceThreat', () => {
  it('announces the dogs closing in', () => {
    expect(shouldAnnounceThreat('safe', 'closing')).toBe(true);
    expect(shouldAnnounceThreat('closing', 'critical')).toBe(true);
  });

  it('stays quiet while nothing has changed', () => {
    expect(shouldAnnounceThreat('critical', 'critical')).toBe(false);
  });

  it('stays quiet on a partial recovery', () => {
    // Drifting between critical and closing repeatedly is normal play, and
    // narrating each crossing would be unbearable.
    expect(shouldAnnounceThreat('critical', 'closing')).toBe(false);
  });

  it('announces a full recovery, which is the one piece of good news', () => {
    expect(shouldAnnounceThreat('critical', 'safe')).toBe(true);
  });
});
