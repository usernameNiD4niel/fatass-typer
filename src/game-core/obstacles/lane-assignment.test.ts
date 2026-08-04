import { describe, expect, it } from 'vitest';

import { adjacentLanes, LANE_COUNT, LANE_INDICES, type LaneIndex } from '../models/lane';
import { createRngFromString } from '../random';
import { assignLanes, blocksLane, isValidArrangement } from './lane-assignment';

/**
 * The fairness guarantee, checked exhaustively.
 *
 * PDF §14 calls a car encounter with no open lane an implementation bug. This
 * file is the proof that it cannot be constructed: ten thousand seeds, every
 * starting lane, every double-block setting.
 */

const SEEDS = 10_000;

describe('jump hazards', () => {
  it('block the lane the player is in and nominate no escape', () => {
    for (const lane of LANE_INDICES) {
      const { assignment } = assignLanes(createRngFromString(`jump-${String(lane)}`), {
        action: 'jump',
        playerLane: lane,
        doubleBlockChance: 1,
      });

      expect(assignment.blockedLanes).toEqual([lane]);
      expect(assignment.safeLane).toBeNull();
      expect(assignment.safeSide).toBeNull();
      expect(isValidArrangement(assignment, lane)).toBe(true);
    }
  });

  it('do not consume randomness — a jump is not a choice', () => {
    const rng = createRngFromString('jump');
    const result = assignLanes(rng, { action: 'jump', playerLane: 1, doubleBlockChance: 0.5 });

    expect(result.rng).toBe(rng);
  });
});

describe('car hazards', () => {
  it('always leave a route, from every lane, over ten thousand seeds', () => {
    for (const playerLane of LANE_INDICES) {
      for (let seed = 0; seed < SEEDS / LANE_COUNT; seed += 1) {
        const { assignment } = assignLanes(
          createRngFromString(`car-${String(playerLane)}-${String(seed)}`),
          { action: 'lane-change', playerLane, doubleBlockChance: 1 },
        );

        expect(isValidArrangement(assignment, playerLane)).toBe(true);
        expect(assignment.blockedLanes.length).toBeLessThan(LANE_COUNT);
      }
    }
  });

  it('block the lane the player is in', () => {
    for (const playerLane of LANE_INDICES) {
      const { assignment } = assignLanes(createRngFromString(`block-${String(playerLane)}`), {
        action: 'lane-change',
        playerLane,
        doubleBlockChance: 0,
      });

      expect(blocksLane(assignment, playerLane)).toBe(true);
    }
  });

  it('nominate a safe lane one move away, never the player’s own', () => {
    for (const playerLane of LANE_INDICES) {
      for (let seed = 0; seed < 200; seed += 1) {
        const { assignment } = assignLanes(
          createRngFromString(`adj-${String(playerLane)}-${String(seed)}`),
          { action: 'lane-change', playerLane, doubleBlockChance: 0.5 },
        );

        const safeLane = assignment.safeLane as LaneIndex;
        expect(adjacentLanes(playerLane)).toContain(safeLane);
        expect(safeLane).not.toBe(playerLane);
        expect(blocksLane(assignment, safeLane)).toBe(false);
      }
    }
  });

  it('name the side the safe lane is actually on', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const { assignment } = assignLanes(createRngFromString(`side-${String(seed)}`), {
        action: 'lane-change',
        playerLane: 1,
        doubleBlockChance: 0,
      });

      const expected = (assignment.safeLane as LaneIndex) < 1 ? 'left' : 'right';
      expect(assignment.safeSide).toBe(expected);
    }
  });

  it('never blocks the only escape from an edge lane', () => {
    for (const playerLane of [0, 2] as const) {
      for (let seed = 0; seed < 500; seed += 1) {
        const { assignment } = assignLanes(
          createRngFromString(`edge-${String(playerLane)}-${String(seed)}`),
          // Even at certainty: with one way out, blocking it is not a harder
          // encounter, it is an impossible one.
          { action: 'lane-change', playerLane, doubleBlockChance: 1 },
        );

        expect(assignment.blockedLanes).toHaveLength(1);
        expect(assignment.safeLane).toBe(playerLane === 0 ? 1 : 1);
      }
    }
  });

  it('blocks the second escape only from the centre, and only when asked to', () => {
    const never = countDoubleBlocks(0);
    const always = countDoubleBlocks(1);

    expect(never).toBe(0);
    expect(always).toBe(300);
  });

  it('sometimes blocks the second escape at a middling chance', () => {
    const some = countDoubleBlocks(0.5);

    expect(some).toBeGreaterThan(50);
    expect(some).toBeLessThan(250);
  });

  it('is deterministic — the same seed gives the same road', () => {
    const first = assignLanes(createRngFromString('repeat'), {
      action: 'lane-change',
      playerLane: 1,
      doubleBlockChance: 0.5,
    });
    const second = assignLanes(createRngFromString('repeat'), {
      action: 'lane-change',
      playerLane: 1,
      doubleBlockChance: 0.5,
    });

    expect(second.assignment).toEqual(first.assignment);
    expect(second.rng).toEqual(first.rng);
  });

  it('sends the player both ways over many seeds', () => {
    const sides = new Set<string | null>();
    for (let seed = 0; seed < 100; seed += 1) {
      const { assignment } = assignLanes(createRngFromString(`spread-${String(seed)}`), {
        action: 'lane-change',
        playerLane: 1,
        doubleBlockChance: 0,
      });
      sides.add(assignment.safeSide);
    }

    expect(sides).toEqual(new Set(['left', 'right']));
  });
});

describe('isValidArrangement', () => {
  it('rejects an arrangement with no way out', () => {
    expect(isValidArrangement({ blockedLanes: [0, 1, 2], safeLane: 1, safeSide: 'left' }, 1)).toBe(
      false,
    );
  });

  it('rejects a safe lane that is also blocked', () => {
    expect(isValidArrangement({ blockedLanes: [1, 2], safeLane: 2, safeSide: 'right' }, 1)).toBe(
      false,
    );
  });

  it('rejects a safe lane two moves away', () => {
    expect(isValidArrangement({ blockedLanes: [0], safeLane: 2, safeSide: 'right' }, 0)).toBe(
      false,
    );
  });

  it('rejects a side that does not match the lane', () => {
    expect(isValidArrangement({ blockedLanes: [1], safeLane: 2, safeSide: 'left' }, 1)).toBe(false);
  });

  it('rejects a jump that does not block the player’s lane', () => {
    expect(isValidArrangement({ blockedLanes: [0], safeLane: null, safeSide: null }, 1)).toBe(
      false,
    );
  });
});

function countDoubleBlocks(chance: number): number {
  let doubles = 0;
  for (let seed = 0; seed < 300; seed += 1) {
    const { assignment } = assignLanes(createRngFromString(`double-${String(seed)}`), {
      action: 'lane-change',
      playerLane: 1,
      doubleBlockChance: chance,
    });
    if (assignment.blockedLanes.length > 1) doubles += 1;
  }

  return doubles;
}
