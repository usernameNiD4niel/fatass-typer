import { describe, expect, it } from 'vitest';

import {
  adjacentLanes,
  CENTRE_LANE,
  isLaneIndex,
  isLaneSide,
  LANE_COUNT,
  LANE_INDICES,
  laneOffset,
  laneToward,
  sideBetween,
  type LaneIndex,
} from './lane';

describe('lane geometry', () => {
  it('recognises only the three real lanes', () => {
    expect(isLaneIndex(0)).toBe(true);
    expect(isLaneIndex(2)).toBe(true);
    expect(isLaneIndex(3)).toBe(false);
    expect(isLaneIndex(-1)).toBe(false);
    expect(isLaneIndex(1.5)).toBe(false);
    expect(isLaneIndex('1')).toBe(false);
    expect(isLaneIndex(Number.NaN)).toBe(false);
  });

  it('recognises lane sides', () => {
    expect(isLaneSide('left')).toBe(true);
    expect(isLaneSide('right')).toBe(true);
    expect(isLaneSide('centre')).toBe(false);
  });

  it('starts runs in the centre so the first encounter can go either way', () => {
    expect(CENTRE_LANE).toBe(1);
    expect(adjacentLanes(CENTRE_LANE)).toHaveLength(2);
  });

  it('returns null at the edges of the road', () => {
    expect(laneToward(0, 'left')).toBeNull();
    expect(laneToward(2, 'right')).toBeNull();
    expect(laneToward(0, 'right')).toBe(1);
    expect(laneToward(2, 'left')).toBe(1);
  });

  it('gives every lane at least one escape', () => {
    for (const lane of LANE_INDICES) {
      expect(adjacentLanes(lane).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('names the direction between two lanes', () => {
    expect(sideBetween(1, 0)).toBe('left');
    expect(sideBetween(1, 2)).toBe('right');
    expect(sideBetween(1, 1)).toBeNull();
    expect(sideBetween(0, 2)).toBe('right');
  });

  it('round-trips a side through laneToward', () => {
    for (const from of LANE_INDICES) {
      for (const to of adjacentLanes(from)) {
        const side = sideBetween(from, to);
        expect(side).not.toBeNull();
        if (side !== null) expect(laneToward(from, side)).toBe(to);
      }
    }
  });

  it('measures lane offsets symmetrically about the road centre', () => {
    expect(laneOffset(0)).toBe(-1);
    expect(laneOffset(1)).toBe(0);
    expect(laneOffset(2)).toBe(1);
    // Continuous input, for a player mid-transition.
    expect(laneOffset(0.5)).toBeCloseTo(-0.5);
  });

  it('agrees with LANE_COUNT', () => {
    expect(LANE_INDICES).toHaveLength(LANE_COUNT);
    const highest: LaneIndex = 2;
    expect(isLaneIndex(highest)).toBe(true);
  });
});
