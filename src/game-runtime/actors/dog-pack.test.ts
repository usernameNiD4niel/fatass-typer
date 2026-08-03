import { describe, expect, it } from 'vitest';

import { createChaseState, type ChaseState } from '../../game-core/chase';
import type { ChaseProfile } from '../../game-core/models/map';
import {
  advanceDogPack,
  createDogPack,
  DOG_TRAITS,
  type DogPackState,
  dogPackView,
} from './dog-pack';

const PROFILE: ChaseProfile = {
  startingDistanceMeters: 40,
  baseCatchUpMetersPerSecond: 0.4,
  collisionPenaltyMeters: 8,
  missedPromptPenaltyMeters: 4,
  streakRecoveryMeters: 2,
  streakThreshold: 3,
  dangerThresholdMeters: 12,
};

function chaseAt(distanceMeters: number): ChaseState {
  return {
    ...createChaseState(PROFILE),
    distanceMeters,
    caught: distanceMeters <= 0,
  };
}

function view(distanceMeters: number, state: DogPackState = createDogPack(), playerMeters = 200) {
  return dogPackView({ state, chase: chaseAt(distanceMeters), profile: PROFILE, playerMeters });
}

describe('dog pack positions', () => {
  it('renders exactly three dogs', () => {
    expect(view(30).dogs).toHaveLength(DOG_TRAITS.length);
    expect(DOG_TRAITS).toHaveLength(3);
  });

  it('places the lead dog at the chase gap the rules report', () => {
    const lead = view(12).dogs[0];

    // The surge is the only deviation, and it is small enough that the HUD
    // number and the picture never disagree noticeably.
    expect(lead?.worldMeters).toBeCloseTo(200 - 12, 0);
  });

  it('keeps the pack behind the leader', () => {
    const dogs = view(20).dogs;

    expect(dogs[1]?.worldMeters).toBeLessThan(dogs[0]?.worldMeters ?? 0);
    expect(dogs[2]?.worldMeters).toBeLessThan(dogs[1]?.worldMeters ?? 0);
  });

  it('moves the whole pack forward as the gap closes', () => {
    const far = view(35).dogs.map((dog) => dog.worldMeters);
    const near = view(4).dogs.map((dog) => dog.worldMeters);

    for (let index = 0; index < far.length; index += 1) {
      expect(near[index]).toBeGreaterThan(far[index] ?? 0);
    }
  });

  it('tightens the pack as it closes so nobody is left behind at the catch', () => {
    const spread = (distance: number) => {
      const dogs = view(distance).dogs;

      return (dogs[0]?.worldMeters ?? 0) - (dogs[2]?.worldMeters ?? 0);
    };

    expect(spread(0)).toBeLessThan(spread(40));
  });

  it('follows the MC down the track', () => {
    const early = dogPackView({
      state: createDogPack(),
      chase: chaseAt(10),
      profile: PROFILE,
      playerMeters: 100,
    });
    const later = dogPackView({
      state: createDogPack(),
      chase: chaseAt(10),
      profile: PROFILE,
      playerMeters: 500,
    });

    expect((later.dogs[0]?.worldMeters ?? 0) - (early.dogs[0]?.worldMeters ?? 0)).toBeCloseTo(400);
  });

  it('reports the threat straight from the chase model', () => {
    expect(view(40).threat).toBe('safe');
    expect(view(10).threat).toBe('closing');
    expect(view(4).threat).toBe('critical');
    expect(view(0).threat).toBe('caught');
  });

  it('reports closeness as 0 at the start and 1 at the catch', () => {
    expect(view(40).closeness).toBeCloseTo(0);
    expect(view(0).closeness).toBeCloseTo(1);
  });

  it('lunges harder the closer it gets, clamped to 0..1', () => {
    expect(view(40).dogs[0]?.lungeRatio).toBe(0);
    expect(view(8).dogs[0]?.lungeRatio).toBeGreaterThan(0);
    expect(view(0).dogs[0]?.lungeRatio).toBe(1);
  });

  it('gives each dog its own gait so they do not move as one', () => {
    const phases = view(20).dogs.map((dog) => dog.cyclePhase);

    expect(new Set(phases).size).toBe(3);
  });

  it('gives each dog its own size and lane', () => {
    const dogs = view(20).dogs;

    expect(new Set(dogs.map((dog) => dog.scale)).size).toBe(3);
    expect(new Set(dogs.map((dog) => dog.laneOffset)).size).toBe(3);
  });
});

describe('dog pack animation', () => {
  it('advances the run cycle by distance travelled', () => {
    // Short enough that neither wraps, so the phases stay directly comparable.
    const slow = advanceDogPack(createDogPack(), { deltaMs: 200, speedMetersPerSecond: 3 });
    const fast = advanceDogPack(createDogPack(), { deltaMs: 200, speedMetersPerSecond: 6 });

    expect(fast.cyclePhase).toBeCloseTo(slow.cyclePhase * 2);
    expect(fast.cyclePhase).toBeGreaterThan(slow.cyclePhase);
  });

  it('keeps the cycle inside 0..1', () => {
    let state = createDogPack();

    for (let frame = 0; frame < 120; frame += 1) {
      state = advanceDogPack(state, { deltaMs: 16, speedMetersPerSecond: 9 });
      expect(state.cyclePhase).toBeGreaterThanOrEqual(0);
      expect(state.cyclePhase).toBeLessThan(1);
    }
  });

  it('runs the clock even when standing still', () => {
    const state = advanceDogPack(createDogPack(), { deltaMs: 500, speedMetersPerSecond: 0 });

    expect(state.clockSeconds).toBeCloseTo(0.5);
    expect(state.cyclePhase).toBe(0);
  });

  it('ignores negative deltas and negative speeds', () => {
    const state = advanceDogPack(createDogPack(), { deltaMs: -100, speedMetersPerSecond: -5 });

    expect(state).toEqual(createDogPack());
  });

  it('is deterministic for the same inputs', () => {
    const state = advanceDogPack(createDogPack(), { deltaMs: 250, speedMetersPerSecond: 7 });

    expect(view(15, state)).toEqual(view(15, state));
  });
});
