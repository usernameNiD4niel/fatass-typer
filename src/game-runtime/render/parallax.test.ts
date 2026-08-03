import { describe, expect, it } from 'vitest';

import { createCamera, followPlayer } from './camera';
import {
  DEFAULT_PARALLAX_LAYERS,
  layerBounds,
  layerOffsetPx,
  type ParallaxLayer,
  tilePlacement,
} from './parallax';

const config = { pixelsPerMeter: 10, anchorRatio: 0 };
const viewport = { widthPx: 1000, heightPx: 600 };

function cameraAt(meters: number) {
  return followPlayer(createCamera(viewport, 100_000, config), meters);
}

const layer: ParallaxLayer = {
  id: 'test',
  depth: 0.5,
  tileWidthPx: 200,
  topRatio: 0.25,
  heightRatio: 0.5,
};

describe('parallax', () => {
  it('scrolls a layer at its depth factor', () => {
    // 30m at 10px/m is 300px of ground movement; at depth 0.5 that is 150px.
    expect(layerOffsetPx(cameraAt(30), layer)).toBeCloseTo(150);
  });

  it('does not move a depth-zero layer', () => {
    const sky = { ...layer, depth: 0 };

    expect(layerOffsetPx(cameraAt(900), sky)).toBe(0);
  });

  it('wraps the offset within one tile no matter how long the run is', () => {
    for (const meters of [0, 37, 480, 12_345]) {
      const offset = layerOffsetPx(cameraAt(meters), layer);

      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(layer.tileWidthPx);
    }
  });

  it('covers the full viewport with tiles at any offset', () => {
    for (const meters of [0, 3, 17.5, 200, 1001]) {
      const camera = cameraAt(meters);
      const placement = tilePlacement(camera, layer);
      const rightEdge = placement.firstXPx + placement.count * placement.tileWidthPx;

      expect(placement.firstXPx).toBeLessThanOrEqual(0);
      expect(rightEdge).toBeGreaterThanOrEqual(camera.viewportWidthPx);
    }
  });

  it('scales layer bounds to the viewport height', () => {
    expect(layerBounds(cameraAt(0), layer)).toEqual({ topPx: 150, heightPx: 300 });
  });

  it('handles a degenerate zero-width tile without dividing by zero', () => {
    const broken = { ...layer, tileWidthPx: 0 };

    expect(layerOffsetPx(cameraAt(50), broken)).toBe(0);
    expect(tilePlacement(cameraAt(50), broken).count).toBe(0);
  });

  it('orders the default layers from far to near', () => {
    const depths = DEFAULT_PARALLAX_LAYERS.map((entry) => entry.depth);

    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(depths.every((depth) => depth >= 0 && depth <= 1)).toBe(true);
  });

  it('gives every default layer a unique id and a positive tile width', () => {
    const ids = DEFAULT_PARALLAX_LAYERS.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_PARALLAX_LAYERS.every((entry) => entry.tileWidthPx > 0)).toBe(true);
  });
});
