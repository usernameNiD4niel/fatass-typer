import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAPS, OBSTACLES } from '../../content';
import { finishRate, playtest, type PlaytestInput } from './playtest-harness';

/**
 * What each map is actually worth, measured rather than felt.
 *
 * Playtesting a typing game by hand measures the tester. A metronomic simulated
 * typist does not get tired, does not get lucky, and gives the same answer every
 * time — so "can a 20 WPM typist finish Map 1?" has an answer that does not
 * depend on who is asking.
 *
 * ## Why finish *rates* and not single runs
 *
 * Failure is binary now: one hazard missed and the run is over. Whether a
 * particular run survives therefore depends on which hazards it happened to
 * draw and in which order, and a single seed is an anecdote. Every assertion
 * below runs many seeds and asserts on the proportion.
 *
 * ## The three bars
 *
 * | Typist | Bar | Why |
 * |---|---|---|
 * | Perfect, at the advertised speed | **100%** | Anything less means the map is lying about its number |
 * | Realistic — 200ms to notice, one character in twenty wrong | **≥ 80%** | The map has to be beatable by a person, not a metronome |
 * | 60% of the advertised speed | **< 25%** | Otherwise the advertised speed is decoration |
 *
 * The realistic typist's error rate is deliberately 5% rather than 8%. With
 * binary failure a mistake on a four-letter word costs more time than typing
 * 30% slower for the whole run — so an 8% error rate at *exactly* target speed
 * describes somebody who is not, in fact, a target-speed typist.
 */

const SEEDS = 24;

function base(map: (typeof MAPS)[number]): Omit<PlaytestInput, 'wpm' | 'seed'> {
  return { map, prompts: ALL_PROMPTS, obstacles: OBSTACLES };
}

describe.each(MAPS.map((map) => [map.id, map] as const))('%s', (_id, map) => {
  it('is finished by a perfect typist at its advertised speed, every time', () => {
    expect(finishRate({ ...base(map), wpm: map.targetWpm }, SEEDS)).toBe(1);
  });

  it('is finished by a realistic typist at its advertised speed', () => {
    const rate = finishRate(
      { ...base(map), wpm: map.targetWpm, reactionDelayMs: 200, errorRate: 0.05 },
      SEEDS,
    );

    expect(rate).toBeGreaterThanOrEqual(0.8);
  });

  it('is not finished by someone typing well below its advertised speed', () => {
    const rate = finishRate({ ...base(map), wpm: Math.round(map.targetWpm * 0.6) }, SEEDS);

    expect(rate).toBeLessThan(0.25);
  });

  it('asks for a real handful of hazards, not one or two', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'shape' });

    expect(result.hazardsFaced).toBeGreaterThanOrEqual(6);
    // Density is capped by how long an encounter lasts: a hazard is visible for
    // roughly its whole budget, so they cannot overlap and still be fair.
    expect(result.hazardsFaced).toBeLessThanOrEqual(20);
  });

  it('is a run, not a marathon or a sprint', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'length' });

    expect(result.elapsedMs).toBeGreaterThan(40_000);
    expect(result.elapsedMs).toBeLessThan(150_000);
  });

  it('clears every hazard it faces when typed perfectly', () => {
    const result = playtest({ ...base(map), wpm: map.targetWpm, seed: 'clean' });

    expect(result.failureReason).toBe('none');
    // The last hazard may still be approaching at the finish line; everything
    // resolved was cleared.
    expect(result.hazardsFaced - result.hazardsCleared).toBeLessThanOrEqual(1);
    expect(result.obstacleSuccessRate).toBe(1);
  });
});

describe('the ladder', () => {
  it('rises in advertised speed from first map to last', () => {
    const targets = MAPS.map((map) => map.targetWpm);

    for (let index = 1; index < targets.length; index += 1) {
      expect(targets[index]).toBeGreaterThan(targets[index - 1] ?? 0);
    }
  });

  it('tightens the reaction buffer as it goes', () => {
    const buffers = MAPS.map((map) => map.timing.reactionBuffer);

    expect(buffers[0]).toBeGreaterThan(buffers[buffers.length - 1] ?? 0);
    for (let index = 1; index < buffers.length; index += 1) {
      expect(buffers[index]).toBeLessThanOrEqual(buffers[index - 1] ?? 0);
    }
  });

  it('packs the hazards closer together as it goes', () => {
    const intervals = MAPS.map((map) => map.content.obstacleIntervalSeconds);

    for (let index = 1; index < intervals.length; index += 1) {
      expect(intervals[index]).toBeLessThanOrEqual(intervals[index - 1] ?? 0);
    }
  });

  it('gives less breathing room between hazards as it goes', () => {
    const recovery = MAPS.map((map) => map.content.recoverySeconds);

    for (let index = 1; index < recovery.length; index += 1) {
      expect(recovery[index]).toBeLessThanOrEqual(recovery[index - 1] ?? 0);
    }
  });

  it('only blocks a second lane on the later maps', () => {
    // Reading which side is safe is a skill of its own. The first two maps ask
    // only for the typing.
    expect(MAPS[0]?.content.doubleBlockChance).toBe(0);
    expect(MAPS[1]?.content.doubleBlockChance).toBe(0);
    expect(MAPS[MAPS.length - 1]?.content.doubleBlockChance).toBeGreaterThan(0);
  });

  it('is harder at the end than at the start, measured the same way', () => {
    // The same typist, at the same fraction of each map's advertised speed. If
    // the ladder means anything, the last map is where they come unstuck first.
    const at = (map: (typeof MAPS)[number]) =>
      finishRate({ ...base(map), wpm: Math.round(map.targetWpm * 0.85) }, SEEDS);

    const first = MAPS[0];
    const last = MAPS[MAPS.length - 1];
    if (first === undefined || last === undefined) throw new Error('no maps');

    expect(at(last)).toBeLessThanOrEqual(at(first));
  });
});
