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

/**
 * Runs the field forward.
 *
 * `playerMeters` defaults to a player keeping pace with the reference speed, so
 * the chase bonus stays out of the way of tests that are about drawn pace. The
 * chase has its own tests below, which pass a player who is deliberately far
 * ahead.
 */
function run(state: RaceState, totalMs: number, map = MAP_1, playerSpeed?: number): RaceState {
  let current = state;
  for (let elapsed = 0; elapsed < totalMs; elapsed += 16) {
    current = advanceRace(current, {
      map,
      deltaMs: 16,
      elapsedMs: elapsed,
      distanceMeters: map.distanceMeters,
      playerMeters: ((playerSpeed ?? referenceSpeed(map, elapsed)) * elapsed) / 1000,
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

describe('the chase', () => {
  /*
   * The complaint this answers: an opponent that never notices it is losing.
   * With drawn pace alone the race is decided in its first half-minute and
   * nothing happens afterwards, because a bot twenty metres down runs exactly
   * as fast as one twenty metres up.
   */
  it('makes a racer run harder when it is well behind', () => {
    const reference = referenceSpeed(MAP_1, 0);
    const level = run(race('chase'), 30_000, MAP_1, reference);
    const chasing = run(race('chase'), 30_000, MAP_1, reference * 2);

    const covered = (state: typeof level): number =>
      Math.max(...state.racers.map((racer) => racer.meters));

    expect(covered(chasing)).toBeGreaterThan(covered(level) + 10);
  });

  /*
   * A rubber band, not a leash. The bonus is capped, so a player who keeps
   * typing keeps extending — they simply cannot stop and stay ahead.
   */
  it('cannot run down a lead of any size', () => {
    const reference = referenceSpeed(MAP_1, 0);
    const state = run(race('cap'), 30_000, MAP_1, reference * 6);
    const covered = Math.max(...state.racers.map((racer) => racer.meters));

    // Well short of a player at six times the pace. The bound is the fastest
    // the field can legally go: the top of the drawn pace band (1.14) plus the
    // chase cap (0.22), over the same half-minute.
    expect(covered).toBeLessThan(reference * 1.36 * 30);
  });

  it('does nothing in a race that is level', () => {
    const reference = referenceSpeed(MAP_1, 0);
    const level = run(race('deadband'), 20_000, MAP_1, reference);
    const nudged = run(race('deadband'), 20_000, MAP_1, reference * 1.05);

    const covered = (state: typeof level): number =>
      Math.max(...state.racers.map((racer) => racer.meters));

    // Inside the dead band the field is untouched: a neck-and-neck race is a
    // race, and helping the loser of it is what took every coin off a typist
    // running at exactly the speed the map advertises.
    expect(covered(nudged)).toBe(covered(level));
  });
});
