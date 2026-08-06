import { describe, expect, it } from 'vitest';

import { MAP_THEMES } from '../game-core/models';
import { biomeFor, MAX_SCENERY_PARTS } from './biome';
import { LANDMARK_POOL } from './Landmarks';

describe('biomes', () => {
  it('gives every theme something to be made of', () => {
    for (const theme of MAP_THEMES) {
      const biome = biomeFor(theme);

      expect(biome.scenery.length, theme).toBeGreaterThan(0);
      expect(biome.scenery.length, theme).toBeLessThanOrEqual(MAX_SCENERY_PARTS);
    }
  });

  /*
   * The pool is allocated for the worst case at mount and never resized, so a
   * biome with more parts than the pool would silently draw fewer of them. This
   * is the assertion that turns that into a failing test instead of a map that
   * is missing its canopy.
   */
  it('never asks for more parts than the pool holds', () => {
    const widest = Math.max(...MAP_THEMES.map((theme) => biomeFor(theme).scenery.length));

    expect(widest).toBe(MAX_SCENERY_PARTS);
  });

  it('keeps every part inside its slot', () => {
    for (const theme of MAP_THEMES) {
      for (const part of biomeFor(theme).scenery) {
        // A part taller than its slot would poke through whatever is above it,
        // and one wider than its slot would stand in the carriageway.
        expect(part.height, theme).toBeGreaterThan(0);
        expect(part.height, theme).toBeLessThanOrEqual(1);
        expect(part.width, theme).toBeGreaterThan(0);
        expect(part.width, theme).toBeLessThanOrEqual(1.3);
        expect(part.base, theme).toBeGreaterThanOrEqual(0);
        expect(part.base, theme).toBeLessThanOrEqual(1);
      }
    }
  });

  /*
   * Two maps look like a city; the other four must not. This is the whole point
   * of the file, and it is the assertion most likely to be quietly undone by
   * somebody adding a seventh map by copying the sixth.
   */
  it('does not draw the same map six times', () => {
    const travellers = new Set(MAP_THEMES.map((theme) => biomeFor(theme).travellers.join()));
    const landmarks = new Set(MAP_THEMES.map((theme) => biomeFor(theme).landmark));

    expect(travellers.size).toBeGreaterThanOrEqual(4);
    expect(landmarks.size).toBeGreaterThanOrEqual(4);
  });

  it('keeps the landmark pool fixed and small', () => {
    expect(LANDMARK_POOL).toBe(3);
  });
});
