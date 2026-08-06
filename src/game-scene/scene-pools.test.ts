import { describe, expect, it } from 'vitest';

import { MAP_THEMES } from '../game-core/models';
import { TRAFFIC_POOL } from './AmbientTraffic';
import { biomeFor } from './biome';
import { ROAD_POOL } from './Road';
import { scenePalette, windowGlow } from './scene-config';
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

describe('window glow', () => {
  it('is dark in daylight and lit at night', () => {
    // Windows burning at midday is the classic tell of an emissive map applied
    // without asking what time it is.
    expect(windowGlow(scenePalette('neighborhood'))).toBe(0);
    expect(windowGlow(scenePalette('night-highway'))).toBeGreaterThan(0.3);
  });

  /*
   * Only two maps have windows at all.
   *
   * The other four are built out of trees, rock, containers and obsidian, and
   * the glow number is meaningless on them — it used to be asserted on the
   * volcano, which stopped having buildings the moment biomes landed and would
   * have gone on passing for the wrong reason.
   */
  it('only matters on the maps that have buildings', () => {
    const windowed = MAP_THEMES.filter((theme) =>
      biomeFor(theme).scenery.some((part) => part.facade),
    );

    expect(windowed).toEqual(['neighborhood', 'night-highway']);
  });

  it('never burns brighter than the map it belongs to', () => {
    for (const theme of MAP_THEMES) {
      expect(windowGlow(scenePalette(theme)), theme).toBeLessThanOrEqual(0.9);
    }
  });
});
