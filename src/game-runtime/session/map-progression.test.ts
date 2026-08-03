import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAPS, OBSTACLES } from '../../content';
import { promptsForMap } from '../../content/prompts';
import { effectiveCharacterCount } from '../../game-core/models';
import { obstaclePromptTiming, requiredWpm } from '../../game-core/timing';
import { playtest, survivalThreshold } from './playtest-harness';

/**
 * The six-map progression (step F3, spec §6).
 *
 * Every map is playtested against the simulated typist, so "Map 4 asks for 35
 * WPM" is a measured claim rather than a label. Two rules hold across all of
 * them, and they are the ones that make a difficulty curve honest:
 *
 *   1. **A typist at the advertised speed finishes** — including while making
 *      mistakes, because real typists do.
 *   2. **No prompt demands more than the advertised speed.** A map whose
 *      obstacles need 38 WPM has no business printing 35 on the card.
 */

const SEEDS = ['ladder-a', 'ladder-b', 'ladder-c'];

function runsFor(map: (typeof MAPS)[number], wpm: number, errorRate = 0) {
  return SEEDS.map((seed) =>
    playtest({ map, prompts: ALL_PROMPTS, obstacles: OBSTACLES, wpm, seed, errorRate }),
  );
}

describe('the progression as data', () => {
  it('has all six maps in order', () => {
    expect(MAPS.map((map) => map.mapNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(MAPS.map((map) => map.targetWpm)).toEqual([20, 25, 30, 35, 40, 50]);
  });

  it('matches the reaction buffers the spec suggests', () => {
    expect(MAPS.map((map) => map.timing.reactionBuffer)).toEqual([
      1.7, 1.55, 1.4, 1.28, 1.18, 1.08,
    ]);
  });

  it('raises the accuracy gate as it goes', () => {
    const gates = MAPS.slice(1).map((map) => map.unlock.minimumAccuracy);

    expect(gates).toEqual([0.85, 0.87, 0.89, 0.9, 0.92]);
    for (let index = 1; index < gates.length; index += 1) {
      expect(gates[index]).toBeGreaterThan(gates[index - 1] ?? 0);
    }
  });

  it('chains the unlocks, with only Map 1 open from the start', () => {
    expect(MAPS[0]?.unlock.requiresMapId).toBeNull();

    for (let index = 1; index < MAPS.length; index += 1) {
      expect(MAPS[index]?.unlock.requiresMapId).toBe(MAPS[index - 1]?.id);
    }
  });

  it('gives every map its own theme', () => {
    expect(new Set(MAPS.map((map) => map.theme)).size).toBe(MAPS.length);
  });

  it('tightens the timing and quickens the pace, map by map', () => {
    for (let index = 1; index < MAPS.length; index += 1) {
      const previous = MAPS[index - 1];
      const map = MAPS[index];
      if (previous === undefined || map === undefined) continue;

      expect(map.timing.reactionBuffer).toBeLessThan(previous.timing.reactionBuffer);
      expect(map.timing.fixedVisualLeadTimeMs).toBeLessThan(previous.timing.fixedVisualLeadTimeMs);
      expect(map.content.obstacleIntervalSeconds).toBeLessThan(
        previous.content.obstacleIntervalSeconds,
      );
      expect(map.chase.baseCatchUpMetersPerSecond).toBeGreaterThan(
        previous.chase.baseCatchUpMetersPerSecond,
      );
    }
  });

  it('widens the vocabulary rather than just speeding it up', () => {
    // Spec §6 is explicit that difficulty is not WPM alone.
    expect(MAPS[0]?.content.promptCategories).not.toContain('punctuation');
    expect(MAPS[1]?.content.promptCategories).toContain('punctuation');
    expect(MAPS[2]?.content.promptCategories).toContain('number');
    expect(MAPS[3]?.content.promptCategories).toContain('medium-phrase');
    expect(MAPS[5]?.content.obstacleIds).toHaveLength(OBSTACLES.length);
  });
});

describe('every map is honest about its speed', () => {
  it('never demands more WPM than it advertises, for any prompt it can spawn', () => {
    for (const map of MAPS) {
      const pool = promptsForMap(map.mapNumber).filter((prompt) =>
        map.content.promptCategories.includes(prompt.category),
      );

      for (const obstacleId of map.content.obstacleIds) {
        const obstacle = OBSTACLES.find((entry) => entry.id === obstacleId);
        if (obstacle === undefined) continue;

        for (const prompt of pool.filter((entry) => entry.category === obstacle.promptCategory)) {
          const timing = obstaclePromptTiming(map, obstacle, prompt);
          const demanded = requiredWpm(effectiveCharacterCount(prompt), timing.availableMs);

          expect(demanded).toBeLessThanOrEqual(map.targetWpm);
        }
      }
    }
  });

  it('leaves slack above the expected typing time on every prompt', () => {
    for (const map of MAPS) {
      for (const obstacleId of map.content.obstacleIds) {
        const obstacle = OBSTACLES.find((entry) => entry.id === obstacleId);
        if (obstacle === undefined) continue;

        for (const prompt of promptsForMap(map.mapNumber)) {
          expect(obstaclePromptTiming(map, obstacle, prompt).spareMs).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('every map is beatable at its advertised speed', () => {
  it.each(MAPS.map((map) => [map.name, map] as const))('%s', (_name, map) => {
    for (const result of runsFor(map, map.targetWpm)) {
      expect(result.finished).toBe(true);
      expect(result.obstacleSuccessRate).toBe(1);
    }
  });

  it.each(MAPS.map((map) => [map.name, map] as const))(
    '%s, while mistyping one character in twelve',
    (_name, map) => {
      // Eight percent errors is roughly 92% accuracy — the strictest unlock gate
      // in the game. If a map could not be finished at that accuracy, its own
      // gate would be unreachable.
      for (const result of runsFor(map, map.targetWpm, 0.08)) {
        expect(result.finished).toBe(true);
      }
    },
  );
});

describe('the difficulty curve', () => {
  it('puts every survival threshold below the map’s advertised speed', () => {
    for (const map of MAPS) {
      const threshold =
        survivalThreshold(
          { map, prompts: ALL_PROMPTS, obstacles: OBSTACLES, seed: 'threshold' },
          { from: 5, to: 60 },
        ) ?? Number.POSITIVE_INFINITY;

      expect(threshold).toBeLessThan(map.targetWpm);
    }
  });

  it('demands more of the player by the end than at the start', () => {
    const thresholdFor = (map: (typeof MAPS)[number]) =>
      survivalThreshold(
        { map, prompts: ALL_PROMPTS, obstacles: OBSTACLES, seed: 'threshold' },
        { from: 5, to: 60 },
      ) ?? 0;

    const first = MAPS[0];
    const last = MAPS[MAPS.length - 1];
    if (first === undefined || last === undefined) throw new Error('no maps');

    // Not asserted map-by-map: the curve is shaped by seven interacting dials,
    // and demanding a strictly monotonic threshold would make every future
    // tuning change a fight with an arbitrary rule.
    expect(thresholdFor(last)).toBeGreaterThan(thresholdFor(first) * 2);
  });

  it('keeps every run a run, not a marathon', () => {
    for (const map of MAPS) {
      for (const result of runsFor(map, map.targetWpm)) {
        expect(result.elapsedMs).toBeGreaterThan(20_000);
        expect(result.elapsedMs).toBeLessThan(75_000);
      }
    }
  });
});
