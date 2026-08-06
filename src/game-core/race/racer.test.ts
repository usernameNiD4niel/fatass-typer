import { describe, expect, it } from 'vitest';

import { MAP_1, MAP_6 } from '../../content/maps';
import { createRngFromString } from '../random';
import {
  advanceRace,
  createRace,
  leadingRacer,
  playerLeads,
  playerPlacement,
  referenceSpeed,
  type RaceState,
} from './racer';

/**
 * The two opponents.
 *
 * What is asserted here is the part that decides whether a race is a race: that
 * their pace is drawn from the map rather than fixed, that it wanders, and that
 * the standings answer honestly.
 */

function race(seed = 'race'): RaceState {
  return createRace(MAP_1, createRngFromString(seed));
}

function run(state: RaceState, totalMs: number, map = MAP_1): RaceState {
  let current = state;
  for (let elapsed = 0; elapsed < totalMs; elapsed += 16) {
    current = advanceRace(current, {
      map,
      deltaMs: 16,
      elapsedMs: elapsed,
      distanceMeters: map.distanceMeters,
    });
  }

  return current;
}

describe('setting up a race', () => {
  it('fields two opponents, in their own lanes', () => {
    const state = race();

    expect(state.racers).toHaveLength(2);
    expect(state.racers[0]?.lane).not.toBe(state.racers[1]?.lane);
  });

  it('never starts one on top of the player', () => {
    // Nothing collides, so this is about how it reads: opening a run already
    // overlapping somebody looks like a bug.
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      for (const racer of race(seed).racers) expect(racer.lane).not.toBe(1);
    }
  });

  it('is reproducible from its seed', () => {
    const first = run(race('same'), 20_000);
    const second = run(race('same'), 20_000);

    expect(second.racers.map((r) => r.meters)).toEqual(first.racers.map((r) => r.meters));
  });

  it('paces them off the map, not off a constant', () => {
    const slow = createRace(MAP_1, createRngFromString('pace'));
    const fast = createRace(MAP_6, createRngFromString('pace'));

    // Map 6 asks for 50 WPM and moves faster; its opponents have to as well, or
    // the race is won by turning up.
    expect(fast.racers[0]?.speed ?? 0).toBeGreaterThan(slow.racers[0]?.speed ?? 0);
  });

  it('draws every pace from a band around what the map asks for', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const reference = referenceSpeed(MAP_1, 0);
      for (const racer of race(seed).racers) {
        expect(racer.speed).toBeGreaterThan(reference * 0.85);
        expect(racer.speed).toBeLessThan(reference * 1.2);
      }
    }
  });
});

describe('running', () => {
  it('carries them down the road', () => {
    const state = run(race(), 10_000);

    for (const racer of state.racers) expect(racer.meters).toBeGreaterThan(0);
  });

  it('changes pace as the run goes on, so a lead has to be held', () => {
    // A bot at a fixed speed is a line on a graph: ten seconds in, the player
    // knows the result and nothing they do afterwards changes it.
    const state = run(race('wander'), 40_000);
    const [first] = state.racers;

    expect(first).toBeDefined();
    expect(first?.targetSpeed).not.toBe(race('wander').racers[0]?.targetSpeed);
  });

  it('stops them exactly on the finish line', () => {
    const state = run(race(), 400_000);

    for (const racer of state.racers) {
      expect(racer.finished).toBe(true);
      expect(racer.meters).toBe(MAP_1.distanceMeters);
      expect(racer.finishedAtMs).not.toBeNull();
    }
  });

  it('never finishes anybody on a map with no finish line', () => {
    const endless = { ...MAP_1, distanceMeters: 0 };
    const state = run(createRace(endless, createRngFromString('endless')), 60_000, endless);

    for (const racer of state.racers) expect(racer.finished).toBe(false);
  });
});

describe('standings', () => {
  it('places the player against both of them', () => {
    const state = run(race('standings'), 20_000);
    const meters = state.racers.map((r) => r.meters);
    const front = Math.max(...meters);
    const back = Math.min(...meters);

    expect(playerPlacement(state, front + 10)).toBe(1);
    expect(playerPlacement(state, (front + back) / 2)).toBe(2);
    expect(playerPlacement(state, back - 10)).toBe(3);
  });

  it('gives a tie to the player', () => {
    // A bot drawn at exactly the player's pace would otherwise flicker the
    // standing every frame, which is unreadable and feels unfair besides.
    const state = run(race('tie'), 20_000);
    const meters = state.racers[0]?.meters ?? 0;

    expect(playerPlacement(state, meters)).toBeLessThanOrEqual(2);
  });

  it('names who is in front, and says when nobody is', () => {
    const state = run(race('lead'), 20_000);
    const front = Math.max(...state.racers.map((r) => r.meters));

    expect(leadingRacer(state, front + 1)).toBeNull();
    expect(playerLeads(state, front + 1)).toBe(true);
    expect(leadingRacer(state, 0)?.meters).toBe(front);
    expect(playerLeads(state, 0)).toBe(false);
  });
});
