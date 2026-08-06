import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAP_ENDLESS, MAPS } from '../../content';
import { isEndless } from './run-session';
import { playtest } from './playtest-harness';

/**
 * The endless map (plan 2.2).
 *
 * A fixed run is a thing you complete, and a completed thing is finished with.
 * These assert the two properties that make this one different: it never ends
 * on its own, and how far you get is decided by how well you type.
 */

function run(wpm: number, seed: string) {
  return playtest({
    map: MAP_ENDLESS,
    prompts: ALL_PROMPTS,
    wpm,
    seed,
    // Endless has no sentence: a sentence has an end and this map does not.
    secretWords: [],
    // Long enough that nobody runs out of simulation before they run out of
    // road — otherwise this measures `maxSteps` rather than the map.
    maxSteps: 200_000,
  });
}

describe('the endless map', () => {
  it('is the only map with no finish line', () => {
    expect(isEndless(MAP_ENDLESS)).toBe(true);
    for (const map of MAPS) expect(isEndless(map)).toBe(false);
  });

  it('is never finished, however well it is played', () => {
    // Not "usually not finished". There is no exit that completes it, so a
    // perfect typist at twice its speed still only ever stops.
    const result = run(MAP_ENDLESS.targetWpm * 2, 'endless-perfect');

    expect(result.finished).toBe(false);
    expect(result.session.phase).not.toBe('levelComplete');
  });

  it('records the distance reached, which is the whole score', () => {
    const result = run(MAP_ENDLESS.targetWpm, 'endless-distance');

    expect(result.session.playerMeters).toBeGreaterThan(0);
    // A fixed map would have stopped at its own length. This one has none.
    expect(result.session.map.distanceMeters).toBe(0);
  });

  it('takes a faster typist further', () => {
    // The property the whole mode rests on: the number you are chasing has to
    // be a measure of typing, not of luck. Averaged over seeds, because a
    // single run is an anecdote about which hazards it drew.
    const distanceAt = (wpm: number): number => {
      let total = 0;
      for (let seed = 0; seed < 6; seed += 1) {
        total += run(wpm, `endless-${String(wpm)}-${String(seed)}`).session.playerMeters;
      }

      return total / 6;
    };

    expect(distanceAt(MAP_ENDLESS.targetWpm * 1.6)).toBeGreaterThan(
      distanceAt(MAP_ENDLESS.targetWpm * 0.8),
    );
  });

  it('eventually beats even a very fast typist', () => {
    /*
     * The assertion that matters, and the one the first build failed.
     *
     * `finished` is trivially false on an endless map, so asserting only that
     * proves nothing. This asserts the run actually *ended* — and it did not,
     * originally: raising `speed.rampPerMinute` moves the world, not the typing
     * demand, so a metronomic typist survived 53 minutes untouched. It ends now
     * because `escalation` raises the target speed the budgets are derived from.
     */
    const result = run(120, 'endless-ceiling');

    expect(result.session.phase).toBe('gameOver');
    expect(result.failureReason).not.toBe('none');
  });

  it('escalates the typing demand, not merely the world speed', () => {
    // Same map, same seed, two speeds: the slower typist must stop sooner. If
    // difficulty came only from world speed this would not hold, because
    // hazards are placed by time budget and a faster road simply puts them
    // further away.
    const slow = run(MAP_ENDLESS.targetWpm, 'endless-demand');
    const fast = run(MAP_ENDLESS.targetWpm * 2.6, 'endless-demand');

    expect(fast.elapsedMs).toBeGreaterThan(slow.elapsedMs * 2);
  });
});
