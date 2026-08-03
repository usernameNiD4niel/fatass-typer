import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAP_1, OBSTACLES } from '../../content';
import { playtest, type PlaytestInput, survivalThreshold } from './playtest-harness';

/**
 * Map 1, playtested (step F2, spec §6, §19 milestone 2).
 *
 * The map advertises 20 WPM, and these tests are what that claim means. A
 * browser playtest cannot answer the question — it measures the tester, and a
 * throttled tab runs the loop at a fraction of real time — so the map's
 * difficulty is specified here, against a metronomic simulated typist.
 *
 * The tuning these numbers describe: **a genuine 20 WPM typist finishes, even
 * making mistakes; someone well below target does not; and the dogs are a real
 * presence rather than scenery.**
 */

const BASE: Omit<PlaytestInput, 'wpm' | 'seed'> = {
  map: MAP_1,
  prompts: ALL_PROMPTS,
  obstacles: OBSTACLES,
};

const SEEDS = ['playtest-a', 'playtest-b', 'playtest-c'];

function runsAt(wpm: number, errorRate = 0) {
  return SEEDS.map((seed) => playtest({ ...BASE, wpm, seed, errorRate }));
}

describe('a typist at the advertised speed', () => {
  it('finishes, on every seed', () => {
    for (const result of runsAt(MAP_1.targetWpm)) {
      expect(result.finished).toBe(true);
      expect(result.session.playerMeters).toBe(MAP_1.distanceMeters);
    }
  });

  it('finishes while making mistakes, because real typists do', () => {
    // Eight percent of characters mistyped, each corrected immediately — two
    // extra keystrokes every time, exactly what a correction costs a person.
    for (const result of runsAt(MAP_1.targetWpm, 0.08)) {
      expect(result.finished).toBe(true);
    }
  });

  it('clears the obstacles it meets', () => {
    for (const result of runsAt(MAP_1.targetWpm)) {
      expect(result.session.obstaclesFaced).toBeGreaterThan(0);
      expect(result.obstacleSuccessRate).toBe(1);
      expect(result.session.collisions).toBe(0);
    }
  });

  it('keeps a margin rather than scraping home', () => {
    for (const result of runsAt(MAP_1.targetWpm)) {
      // Map 1 is the tutorial map: reaching the finish at target speed should
      // never come down to the last metre.
      expect(result.closestApproach).toBeGreaterThan(0.4);
    }
  });
});

describe('the chase is real', () => {
  it('catches a typist well below the target', () => {
    for (const result of runsAt(10)) {
      expect(result.caught).toBe(true);
    }
  });

  it('catches someone who barely types at all, quickly', () => {
    const [result] = runsAt(5);

    expect(result?.caught).toBe(true);
    expect(result?.elapsedMs).toBeLessThan(30_000);
  });

  it('puts the survival threshold below the target, with headroom to spare', () => {
    const threshold = survivalThreshold({ ...BASE, seed: 'threshold' });

    expect(threshold).not.toBeNull();
    // Comfortably under 20: a player at the advertised speed is not on the edge.
    expect(threshold ?? 0).toBeLessThan(MAP_1.targetWpm - 4);
    // But not so far under that the dogs are decoration.
    expect(threshold ?? 0).toBeGreaterThan(8);
  });

  it('makes a below-target typist feel it, even when they get through', () => {
    // Sixteen WPM with mistakes is a near-miss run, not a comfortable one.
    const results = runsAt(16, 0.08);
    const closest = Math.min(...results.map((result) => result.closestApproach));

    expect(closest).toBeLessThan(0.35);
  });
});

describe('the shape of a run', () => {
  it('is a run, not a marathon', () => {
    for (const result of runsAt(MAP_1.targetWpm)) {
      expect(result.elapsedMs).toBeGreaterThan(20_000);
      expect(result.elapsedMs).toBeLessThan(75_000);
    }
  });

  it('gets faster the faster you type', () => {
    // Both speeds finish, so the durations are comparable — a caught run ends
    // early and would make a slower typist look quicker.
    const [slow] = runsAt(MAP_1.targetWpm);
    const [fast] = runsAt(30);

    expect(slow?.finished).toBe(true);
    expect(fast?.finished).toBe(true);
    expect(fast?.elapsedMs ?? 0).toBeLessThan(slow?.elapsedMs ?? 0);
  });

  it('spaces obstacles out rather than burying the player', () => {
    for (const result of runsAt(MAP_1.targetWpm)) {
      const secondsPerObstacle =
        result.elapsedMs / 1_000 / Math.max(1, result.session.obstaclesFaced);

      expect(secondsPerObstacle).toBeGreaterThan(5);
    }
  });

  it('rewards typing faster with a wider gap', () => {
    const slow = runsAt(16)[0]?.closestApproach ?? 0;
    const fast = runsAt(30)[0]?.closestApproach ?? 0;

    expect(fast).toBeGreaterThan(slow);
  });
});
