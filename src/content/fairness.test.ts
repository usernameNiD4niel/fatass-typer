import { describe, expect, it } from 'vitest';

import { eligibleObstacles } from '../game-core/obstacles';
import {
  motionReserveMs,
  obstaclePromptTiming,
  requiredWpm,
  spawnDistanceMeters,
  timeToImpactMs,
} from '../game-core/timing';
import { effectiveCharacterCount } from '../game-core/models';
import { MAPS } from './maps';
import { OBSTACLES } from './obstacles';
import { ALL_PROMPTS } from './prompts';

/**
 * The promise every map makes, checked against every prompt it can draw.
 *
 * Not a sampled playtest — a table. For each map, each hazard it can spawn, and
 * each prompt that hazard's category can produce, three things must hold:
 *
 *  1. **The budget covers the typing.** A player at the map's advertised speed
 *     can finish the word before the deadline.
 *  2. **The map does not demand more than it advertises.** If Map 1 needs 26 WPM
 *     for some word, its "20 WPM" label is a lie.
 *  3. **The road covers the move.** After the last keystroke there is still
 *     enough distance for the lane change or the jump to complete before the
 *     collision plane.
 *
 * The third is the one the rework added, and it is the reason a committed player
 * always gets clear. A playtest samples; this proves.
 */

interface Case {
  readonly mapId: string;
  readonly obstacleId: string;
  readonly promptText: string;
  readonly characters: number;
  readonly targetWpm: number;
  readonly availableMs: number;
  readonly spareMs: number;
  readonly requiredWpm: number;
  readonly reserveMs: number;
  readonly timeToImpactMs: number;
}

/** Every (map × hazard × prompt) combination the game can actually produce. */
function allCases(): readonly Case[] {
  const cases: Case[] = [];

  for (const map of MAPS) {
    for (const obstacle of eligibleObstacles(OBSTACLES, map.content, map.mapNumber)) {
      const prompts = ALL_PROMPTS.filter(
        (prompt) =>
          prompt.category === obstacle.promptCategory &&
          prompt.minimumMap <= map.mapNumber &&
          prompt.usage !== 'boost',
      );

      for (const prompt of prompts) {
        const timing = obstaclePromptTiming(map, obstacle, prompt);
        const reserveMs = motionReserveMs(obstacle.action, map.motion);
        const leadMeters = spawnDistanceMeters(
          (timing.availableMs + reserveMs) * 1.6,
          map.baseSpeedMetersPerSecond,
        );

        cases.push({
          mapId: map.id,
          obstacleId: obstacle.id,
          promptText: prompt.text,
          characters: effectiveCharacterCount(prompt),
          targetWpm: map.targetWpm,
          availableMs: timing.availableMs,
          spareMs: timing.spareMs,
          requiredWpm: requiredWpm(effectiveCharacterCount(prompt), timing.availableMs),
          reserveMs,
          timeToImpactMs: timeToImpactMs(leadMeters, map.baseSpeedMetersPerSecond),
        });
      }
    }
  }

  return cases;
}

const CASES = allCases();

describe('every prompt every map can spawn', () => {
  it('produces a table worth checking', () => {
    // A guard against the filters quietly matching nothing and the assertions
    // below passing vacuously.
    expect(CASES.length).toBeGreaterThan(200);
    expect(new Set(CASES.map((entry) => entry.mapId)).size).toBe(MAPS.length);
  });

  it('leaves slack above the expected typing time', () => {
    const unfair = CASES.filter((entry) => entry.spareMs < 0);

    expect(unfair.map((entry) => `${entry.mapId}/${entry.promptText}`)).toEqual([]);
  });

  it('never demands more speed than the map advertises', () => {
    const dishonest = CASES.filter((entry) => entry.requiredWpm > entry.targetWpm);

    expect(
      dishonest.map(
        (entry) =>
          `${entry.mapId}/${entry.promptText} needs ${entry.requiredWpm.toFixed(1)} WPM but says ${String(entry.targetWpm)}`,
      ),
    ).toEqual([]);
  });

  it('leaves the avoidance move room to finish before the collision plane', () => {
    // The deadline sits `availableMs` after attachment, and attachment happens
    // `availableMs + reserveMs` before impact. So the move gets `reserveMs` of
    // road — which is exactly what it was measured to need.
    const cramped = CASES.filter(
      (entry) => entry.availableMs + entry.reserveMs > entry.timeToImpactMs,
    );

    expect(cramped.map((entry) => `${entry.mapId}/${entry.obstacleId}`)).toEqual([]);
  });

  it('gives the reserve real road, not a rounding error', () => {
    for (const entry of CASES) {
      // A whole simulation step at the very least, or the collision check would
      // be deciding on frame boundaries.
      expect(entry.reserveMs).toBeGreaterThan(1000 / 60);
    }
  });
});
