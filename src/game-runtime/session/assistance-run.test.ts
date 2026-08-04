import { describe, expect, it } from 'vitest';

import { ALL_PROMPTS, MAP_4, MAPS, OBSTACLES } from '../../content';
import { registerFailure } from '../../game-core/assistance';
import { DEFAULT_ADAPTIVE_ASSISTANCE } from '../../game-core/models';
import { playtest } from './playtest-harness';
import { advanceRunSession, createRunSession, type RunSession, startRun } from './run-session';

/**
 * Adaptive assistance inside a run (step F4, spec §6).
 *
 * The rules themselves are covered in `game-core/assistance`. What is checked
 * here is that they reach the world: an eased session has to place its obstacles
 * further away, and a run must never be able to drift far from the map as
 * written.
 *
 * **A finding worth stating plainly:** under the current tuning, assistance
 * effectively never engages. It triggers on three *consecutive missed
 * obstacles*, and the obstacle timing budget is generous enough (that is the
 * fairness promise in `game-core/obstacles`) that a player who is missing
 * obstacles at all is already so far behind that the dogs catch them first. A
 * sweep of 360 runs — every map, five hesitation levels, three speeds, four
 * seeds — produced no easing at all. The last test here pins that, so if the
 * tuning ever changes enough for assistance to start firing, someone finds out
 * deliberately rather than by surprise.
 */

const BASE = { map: MAP_4, prompts: ALL_PROMPTS, obstacles: OBSTACLES };
const OFF = { ...DEFAULT_ADAPTIVE_ASSISTANCE, enabled: false };

/**
 * Map 4, unchanged.
 *
 * These tests are about where a hazard is *placed*, which is decided the moment
 * it spawns — before anything can go wrong with it. The run does not need to
 * survive for the placement to be observed.
 */
const CALM = MAP_4;

/** Runs until an obstacle has been placed, and returns it. */
function firstObstacle(session: RunSession) {
  let current = session;

  for (let step = 0; step < 4_000 && current.obstacles.length === 0; step += 1) {
    current = advanceRunSession(current, 16).session;
  }

  return current.obstacles[0];
}

describe('assistance reaches the world', () => {
  it('gives an eased run more time before impact', () => {
    const plain = startRun(
      createRunSession({ map: CALM, pool: ALL_PROMPTS, obstacles: OBSTACLES, seed: 'assist' }),
    ).session;

    // Three misses is what the rules call a pattern; this is what the session
    // would look like after them.
    const eased: RunSession = {
      ...plain,
      assistance: registerFailure(registerFailure(registerFailure(plain.assistance))),
    };

    const plainObstacle = firstObstacle(plain);
    const easedObstacle = firstObstacle(eased);

    expect(plainObstacle).toBeDefined();
    expect(easedObstacle?.timing.availableMs ?? 0).toBeGreaterThan(
      plainObstacle?.timing.availableMs ?? 0,
    );
  });

  it('gives it more road, not a slower game', () => {
    const plain = startRun(
      createRunSession({ map: CALM, pool: ALL_PROMPTS, obstacles: OBSTACLES, seed: 'assist' }),
    ).session;
    const eased: RunSession = {
      ...plain,
      assistance: registerFailure(registerFailure(registerFailure(plain.assistance))),
    };

    // The obstacle is placed further ahead. The MC's speed, the chase, and the
    // score are untouched — the player gets more time to see it coming.
    expect(firstObstacle(eased)?.impactMeters ?? 0).toBeGreaterThan(
      firstObstacle(plain)?.impactMeters ?? 0,
    );
    expect(eased.map).toBe(plain.map);
    // Assistance moves the reaction buffer and nothing else: the score, the
    // speed, and the road are identical.
    expect(eased.score).toEqual(plain.score);
    expect(eased.playerMeters).toBe(plain.playerMeters);
  });

  it('never lets a run drift outside the clamp', () => {
    const result = playtest({ ...BASE, wpm: 18, seed: 'assist-c' });
    const { bufferMultiplier } = result.session.assistance;

    expect(bufferMultiplier).toBeGreaterThanOrEqual(
      DEFAULT_ADAPTIVE_ASSISTANCE.minimumBufferMultiplier,
    );
    expect(bufferMultiplier).toBeLessThanOrEqual(
      DEFAULT_ADAPTIVE_ASSISTANCE.maximumBufferMultiplier,
    );
  });

  it('can be switched off, and then does nothing at all', () => {
    const result = playtest({ ...BASE, wpm: 18, seed: 'assist-a', assistance: OFF });

    expect(result.session.assistance.bufferMultiplier).toBe(1);
    expect(result.session.assistance.easings).toBe(0);
  });

  it('never changes the target speed the map advertises', () => {
    const result = playtest({ ...BASE, wpm: 18, seed: 'assist-a' });

    // Whatever happened during the run, the number on the card did not move.
    expect(result.session.map.targetWpm).toBe(MAP_4.targetWpm);
    expect(result.session.map.timing.reactionBuffer).toBe(MAP_4.timing.reactionBuffer);
  });
});

describe('how often it actually fires', () => {
  it('stays dormant across the whole ladder under ordinary play', () => {
    // Documented, not endorsed. See the note at the top of this file: the map
    // If this test starts failing, assistance has begun to matter and its
    // thresholds deserve a fresh look.
    for (const map of MAPS) {
      for (const wpm of [map.targetWpm, map.targetWpm + 4]) {
        const result = playtest({
          map,
          prompts: ALL_PROMPTS,
          obstacles: OBSTACLES,
          wpm,
          seed: 'dormant',
          // Half a second of hesitation before each new prompt — more than a
          // practised typist needs, and still not enough to miss an obstacle.
          reactionDelayMs: 500,
        });

        expect(result.session.assistance.easings).toBe(0);
      }
    }
  });
});
