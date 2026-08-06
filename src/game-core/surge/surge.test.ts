import { describe, expect, it } from 'vitest';

import { MAP_1 } from '../../content/maps';
import { MEDIUM_PHRASES } from '../../content/prompts/phrases';
import type { PromptEntry } from '../models';
import { requiredWpm } from '../timing';
import {
  breakSurge,
  completeSurge,
  isSurgeLive,
  placeSurge,
  racerSurgeShare,
  surgeExpired,
  surgeProgress,
} from './surge';

function sentence(): PromptEntry {
  const first = MEDIUM_PHRASES[0];
  if (first === undefined) throw new Error('no phrases');

  return first;
}

function surge(elapsedMs = 0) {
  return placeSurge({ instanceId: 'surge-1', prompt: sentence(), map: MAP_1, elapsedMs });
}

describe('a surge', () => {
  it('is on screen the moment it arrives', () => {
    const active = surge(30_000);

    expect(active.status).toBe('active');
    expect(isSurgeLive(active)).toBe(true);
    expect(active.deadlineAtMs).toBeGreaterThan(30_000);
  });

  it('never asks for more than the map advertises', () => {
    // The most generous budget in the game, and it has to be: the sentence is
    // four times the length of anything else and one slip ends it.
    for (const prompt of MEDIUM_PHRASES) {
      const active = placeSurge({ instanceId: 's', prompt, map: MAP_1, elapsedMs: 0 });
      const demanded = requiredWpm(prompt.normalizedText.length, active.timing.availableMs);

      expect(demanded).toBeLessThanOrEqual(MAP_1.targetWpm);
    }
  });

  it('ends on a single wrong character', () => {
    const broken = breakSurge(surge());

    expect(broken.status).toBe('broken');
    expect(isSurgeLive(broken)).toBe(false);
  });

  it('cannot be broken twice, or broken after it was finished', () => {
    const done = completeSurge(surge());

    expect(breakSurge(done).status).toBe('completed');
  });

  it('lapses when the budget runs out', () => {
    const active = surge();

    expect(surgeExpired(active, active.deadlineAtMs - 1)).toBe(false);
    expect(surgeExpired(active, active.deadlineAtMs)).toBe(true);
  });

  it('reports how far through it is', () => {
    const active = surge();

    expect(surgeProgress(active, active.attachedAtMs)).toBe(0);
    expect(surgeProgress(active, active.deadlineAtMs)).toBe(1);
  });
});

describe('what a racer gets', () => {
  it('pays the runner in front the least', () => {
    expect(racerSurgeShare(-20)).toBeLessThan(racerSurgeShare(20));
  });

  it('pays more the further behind they are', () => {
    expect(racerSurgeShare(30)).toBeGreaterThan(racerSurgeShare(10));
  });

  it('still pays the leader something', () => {
    // A minute where the runner in front simply stops gaining would read as the
    // game taking their lead away rather than as somebody earning it back.
    expect(racerSurgeShare(0)).toBeGreaterThan(0);
  });

  it('never pays more than a full surge', () => {
    expect(racerSurgeShare(500)).toBeLessThanOrEqual(1);
  });
});
