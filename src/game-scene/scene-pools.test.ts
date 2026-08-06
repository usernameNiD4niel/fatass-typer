import { describe, expect, it } from 'vitest';

import { TRAFFIC_POOL } from './AmbientTraffic';
import { ROAD_POOL } from './Road';
import { MAX_SNAPSHOT_COINS, MAX_SNAPSHOT_POPUPS, MAX_SNAPSHOT_POWERUPS } from '../game-bridge';

/**
 * Every pool in the scene is a constant.
 *
 * This is the layer's one hard performance rule, and it is easy to break by
 * accident: a pool sized from the snapshot, or from the map, would remount its
 * meshes mid-run — a stall at exactly the moment the player is being asked to
 * type. Asserting the sizes are literal numbers is a cheap way to notice.
 *
 * The numbers themselves are not the point and may be retuned freely. What
 * matters is that they do not depend on anything.
 */

describe('scene pools', () => {
  it('are fixed for the life of a run', () => {
    for (const size of [
      ROAD_POOL.dashes,
      ROAD_POOL.scenery,
      ROAD_POOL.posts,
      ROAD_POOL.gantries,
      TRAFFIC_POOL,
      MAX_SNAPSHOT_COINS,
      MAX_SNAPSHOT_POWERUPS,
      MAX_SNAPSHOT_POPUPS,
    ]) {
      expect(Number.isInteger(size)).toBe(true);
      expect(size).toBeGreaterThan(0);
    }
  });

  it('stays within a budget a laptop can draw', () => {
    // Instanced pools are one draw call each; the traffic is a group per
    // vehicle. This is the number worth watching, and 60fps was measured with
    // it here — see `docs/performance.md`.
    const drawnObjects =
      ROAD_POOL.dashes + ROAD_POOL.scenery + ROAD_POOL.posts + ROAD_POOL.gantries + TRAFFIC_POOL;

    expect(drawnObjects).toBeLessThan(200);
  });
});
