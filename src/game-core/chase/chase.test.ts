import { describe, expect, it } from 'vitest';
import type { ChaseProfile } from '../models/map';
import {
  advanceChase,
  breakStreak,
  chaseRateMetersPerSecond,
  chaseThreat,
  createChaseState,
  normalizedDistance,
  registerCollision,
  registerMissedPrompt,
  registerPromptCompleted,
  secondsUntilCaught,
} from './chase';
import type { ChaseSpeeds, ChaseState } from './chase';

const PROFILE: ChaseProfile = {
  startingDistanceMeters: 40,
  baseCatchUpMetersPerSecond: 0.4,
  collisionPenaltyMeters: 8,
  missedPromptPenaltyMeters: 4,
  streakRecoveryMeters: 2,
  streakThreshold: 3,
  dangerThresholdMeters: 12,
};

const BASE_SPEED = 6;
const RUNNING: ChaseSpeeds = {
  playerSpeedMetersPerSecond: BASE_SPEED,
  baseSpeedMetersPerSecond: BASE_SPEED,
};
const BOOSTING: ChaseSpeeds = {
  playerSpeedMetersPerSecond: BASE_SPEED * 1.4,
  baseSpeedMetersPerSecond: BASE_SPEED,
};

/** Runs for a number of seconds in one-second steps. */
function run(state: ChaseState, seconds: number, speeds: ChaseSpeeds = RUNNING): ChaseState {
  let next = state;

  for (let index = 0; index < seconds; index += 1) {
    next = advanceChase(next, PROFILE, 1_000, speeds);
  }

  return next;
}

/** Completes `count` prompts in a row. */
function completePrompts(state: ChaseState, count: number): ChaseState {
  let next = state;

  for (let index = 0; index < count; index += 1) {
    next = registerPromptCompleted(next, PROFILE);
  }

  return next;
}

describe('chase — starting state', () => {
  it('starts at the map’s configured gap', () => {
    const state = createChaseState(PROFILE);

    expect(state.distanceMeters).toBe(40);
    expect(state.caught).toBe(false);
    expect(state.streak).toBe(0);
    expect(normalizedDistance(state, PROFILE)).toBe(1);
  });
});

describe('chase — running', () => {
  it('lets the dogs gain while the MC runs at base speed', () => {
    const state = run(createChaseState(PROFILE), 10);

    // 0.4 m/s for ten seconds.
    expect(state.distanceMeters).toBeCloseTo(36, 6);
  });

  it('opens the gap while boosting', () => {
    const state = run(createChaseState(PROFILE), 5, BOOSTING);

    expect(state.distanceMeters).toBeGreaterThan(40 - 1);
    // Boost advantage 2.4 m/s minus 0.4 catch-up, but capped at the start value.
    expect(state.distanceMeters).toBe(40);
  });

  it('caps the gap at the starting distance', () => {
    let state = run(createChaseState(PROFILE), 20);
    expect(state.distanceMeters).toBeLessThan(40);

    state = run(state, 60, BOOSTING);

    expect(state.distanceMeters).toBe(40);
  });

  it('catches the MC when the gap runs out', () => {
    // 40 meters at 0.4 m/s takes 100 seconds of plain running.
    const state = run(createChaseState(PROFILE), 100);

    expect(state.distanceMeters).toBe(0);
    expect(state.caught).toBe(true);
    expect(chaseThreat(state, PROFILE)).toBe('caught');
  });

  it('is not defeated by floating-point residue', () => {
    // 100 one-second steps of 0.4m leaves ~7.5e-14 rather than exactly 0.
    // Without an epsilon the dogs would never quite arrive.
    const state = run(createChaseState(PROFILE), 100);

    expect(state.distanceMeters).toBe(0);
    expect(state.caught).toBe(true);
  });

  it('makes standing still fatal — the dogs are always faster', () => {
    expect(chaseRateMetersPerSecond(PROFILE, RUNNING)).toBeLessThan(0);
  });

  it('ignores a non-positive time step', () => {
    const state = createChaseState(PROFILE);

    expect(advanceChase(state, PROFILE, 0, RUNNING)).toBe(state);
    expect(advanceChase(state, PROFILE, -100, RUNNING)).toBe(state);
  });

  it('is unaffected by step size', () => {
    const coarse = advanceChase(createChaseState(PROFILE), PROFILE, 1_000, RUNNING);
    const fine = run(createChaseState(PROFILE), 1);

    expect(coarse.distanceMeters).toBeCloseTo(fine.distanceMeters, 6);
  });
});

describe('chase — mistakes bring the dogs closer', () => {
  it('costs the collision penalty on a hit', () => {
    const state = registerCollision(createChaseState(PROFILE), PROFILE);

    expect(state.distanceMeters).toBe(32);
  });

  it('costs less for a missed prompt than for a collision', () => {
    const collided = registerCollision(createChaseState(PROFILE), PROFILE);
    const missed = registerMissedPrompt(createChaseState(PROFILE), PROFILE);

    expect(missed.distanceMeters).toBeGreaterThan(collided.distanceMeters);
  });

  it('accumulates across repeated collisions', () => {
    let state = createChaseState(PROFILE);
    for (let index = 0; index < 4; index += 1) {
      state = registerCollision(state, PROFILE);
    }

    // Eight meters is inside the 12m danger threshold but outside half of it.
    expect(state.distanceMeters).toBe(8);
    expect(chaseThreat(state, PROFILE)).toBe('closing');
  });

  it('can be the collision that ends the run', () => {
    let state = createChaseState(PROFILE);
    for (let index = 0; index < 5; index += 1) {
      state = registerCollision(state, PROFILE);
    }

    expect(state.distanceMeters).toBe(0);
    expect(state.caught).toBe(true);
  });

  it('never drops below zero', () => {
    let state = createChaseState(PROFILE);
    for (let index = 0; index < 20; index += 1) {
      state = registerCollision(state, PROFILE);
    }

    expect(state.distanceMeters).toBe(0);
  });

  it('breaks the streak on a collision and on a miss', () => {
    const streaking = completePrompts(createChaseState(PROFILE), 4);
    expect(streaking.streak).toBe(4);

    expect(registerCollision(streaking, PROFILE).streak).toBe(0);
    expect(registerMissedPrompt(streaking, PROFILE).streak).toBe(0);
  });

  it('breaks the streak on a mistyped character without moving the dogs', () => {
    const streaking = completePrompts(createChaseState(PROFILE), 4);
    const broken = breakStreak(streaking);

    expect(broken.streak).toBe(0);
    expect(broken.distanceMeters).toBe(streaking.distanceMeters);
  });
});

describe('chase — streaks earn ground back', () => {
  it('gives nothing before the streak threshold', () => {
    let state = registerCollision(createChaseState(PROFILE), PROFILE);
    const after = completePrompts(state, 2);

    expect(after.streak).toBe(2);
    expect(after.distanceMeters).toBe(state.distanceMeters);

    state = after;
  });

  it('starts paying out at the threshold', () => {
    const damaged = registerCollision(createChaseState(PROFILE), PROFILE);
    const recovered = completePrompts(damaged, 3);

    expect(recovered.distanceMeters).toBe(damaged.distanceMeters + 2);
  });

  it('keeps paying for every prompt while the streak holds', () => {
    const damaged = registerCollision(createChaseState(PROFILE), PROFILE);
    const recovered = completePrompts(damaged, 5);

    // Prompts 3, 4, and 5 each pay 2 meters.
    expect(recovered.distanceMeters).toBe(damaged.distanceMeters + 6);
  });

  it('restarts the count after a mistake', () => {
    let state = registerCollision(createChaseState(PROFILE), PROFILE);
    state = completePrompts(state, 4);
    state = registerMissedPrompt(state, PROFILE);
    const afterTwoMore = completePrompts(state, 2);

    expect(afterTwoMore.distanceMeters).toBe(state.distanceMeters);
  });

  it('records the longest streak of the run', () => {
    let state = completePrompts(createChaseState(PROFILE), 7);
    state = registerCollision(state, PROFILE);
    state = completePrompts(state, 2);

    expect(state.streak).toBe(2);
    expect(state.longestStreak).toBe(7);
  });

  it('cannot lift the gap above the starting distance', () => {
    const state = completePrompts(createChaseState(PROFILE), 30);

    expect(state.distanceMeters).toBe(40);
  });
});

describe('chase — being caught is permanent', () => {
  it('ignores further running', () => {
    const caught = run(createChaseState(PROFILE), 200);

    expect(run(caught, 10, BOOSTING)).toBe(caught);
  });

  it('ignores further events', () => {
    const caught = run(createChaseState(PROFILE), 200);

    expect(registerPromptCompleted(caught, PROFILE)).toBe(caught);
    expect(registerCollision(caught, PROFILE)).toBe(caught);
    expect(registerMissedPrompt(caught, PROFILE)).toBe(caught);
  });
});

describe('chase — reporting', () => {
  it('normalizes the gap for the HUD', () => {
    const state = registerCollision(createChaseState(PROFILE), PROFILE);

    expect(normalizedDistance(state, PROFILE)).toBeCloseTo(0.8, 6);
  });

  it('escalates the threat level as the dogs close in', () => {
    const fresh = createChaseState(PROFILE);
    expect(chaseThreat(fresh, PROFILE)).toBe('safe');

    // Inside the danger threshold of 12 meters.
    expect(chaseThreat(run(fresh, 71), PROFILE)).toBe('closing');
    // Inside half of it.
    expect(chaseThreat(run(fresh, 86), PROFILE)).toBe('critical');
  });

  it('estimates time until caught at the current rate', () => {
    const state = createChaseState(PROFILE);

    expect(secondsUntilCaught(state, PROFILE, RUNNING)).toBeCloseTo(100, 6);
  });

  it('reports no danger while the player is pulling away', () => {
    const state = createChaseState(PROFILE);

    expect(secondsUntilCaught(state, PROFILE, BOOSTING)).toBe(Number.POSITIVE_INFINITY);
  });

  it('reports zero once caught', () => {
    const caught = run(createChaseState(PROFILE), 200);

    expect(secondsUntilCaught(caught, PROFILE, RUNNING)).toBe(0);
  });
});

describe('chase — purity', () => {
  it('never mutates the state it is given', () => {
    const state = createChaseState(PROFILE);
    const snapshot = { ...state };

    advanceChase(state, PROFILE, 1_000, RUNNING);
    registerCollision(state, PROFILE);
    registerPromptCompleted(state, PROFILE);

    expect(state).toEqual(snapshot);
  });

  it('is deterministic', () => {
    const a = run(createChaseState(PROFILE), 30);
    const b = run(createChaseState(PROFILE), 30);

    expect(a).toEqual(b);
  });
});
