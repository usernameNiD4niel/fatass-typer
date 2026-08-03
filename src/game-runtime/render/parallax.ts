import { type Camera } from './camera';

/**
 * Parallax background layers (spec §10).
 *
 * Depth is a scroll factor, not a z-index: 0 never moves (sky), 1 moves exactly
 * with the ground. Distant layers scroll slowly, which is the whole illusion.
 *
 * Layers tile horizontally, so a run of any length needs only one tile's worth
 * of geometry. This module works out which tiles land on screen; drawing the
 * tile itself belongs to the scene renderer.
 */

export interface ParallaxLayer {
  readonly id: string;
  /** Scroll factor, 0..1. */
  readonly depth: number;
  /** Width of one repeat, in pixels. */
  readonly tileWidthPx: number;
  /** Top of the layer as a fraction of viewport height, 0..1. */
  readonly topRatio: number;
  /** Height of the layer as a fraction of viewport height, 0..1. */
  readonly heightRatio: number;
}

/**
 * The four bands every theme shares. Only the palette changes per map, so the
 * geometry is defined once and themes stay pure colour data.
 */
export const DEFAULT_PARALLAX_LAYERS: readonly ParallaxLayer[] = [
  { id: 'sky-band', depth: 0, tileWidthPx: 640, topRatio: 0.0, heightRatio: 0.55 },
  { id: 'far', depth: 0.15, tileWidthPx: 520, topRatio: 0.28, heightRatio: 0.34 },
  { id: 'mid', depth: 0.4, tileWidthPx: 380, topRatio: 0.38, heightRatio: 0.3 },
  { id: 'near', depth: 0.75, tileWidthPx: 260, topRatio: 0.5, heightRatio: 0.22 },
];

/**
 * The same bands, held still (spec §12).
 *
 * A side-scroller cannot honour "reduced motion" by not scrolling — the
 * scrolling is the game. What it can do is stop the *decoration* from moving:
 * the skyline and the silhouettes behind the road carry no information, and
 * they are the layers that produce the swimming, depth-shifting effect reduced
 * motion exists to spare people. The runner, the dogs, and the obstacles are
 * gameplay and keep moving.
 */
export function stillLayers(
  layers: readonly ParallaxLayer[] = DEFAULT_PARALLAX_LAYERS,
): readonly ParallaxLayer[] {
  return layers.map((layer) => ({ ...layer, depth: 0 }));
}

/** How far a layer has scrolled, in pixels, always within one tile. */
export function layerOffsetPx(camera: Camera, layer: ParallaxLayer): number {
  if (layer.tileWidthPx <= 0) return 0;

  const scrolled = camera.leftEdgeMeters * camera.config.pixelsPerMeter * layer.depth;
  // Modulo keeps the number small: after a 2km run the raw offset is large
  // enough that float precision starts to visibly jitter the tiling.
  const wrapped = scrolled % layer.tileWidthPx;

  return wrapped < 0 ? wrapped + layer.tileWidthPx : wrapped;
}

export interface TilePlacement {
  /** Screen x of the first tile. Zero or negative. */
  readonly firstXPx: number;
  /** Tiles needed to cover the viewport, including the partial ones at both edges. */
  readonly count: number;
  readonly tileWidthPx: number;
}

/** Which repeats of a layer cover the screen this frame. */
export function tilePlacement(camera: Camera, layer: ParallaxLayer): TilePlacement {
  if (layer.tileWidthPx <= 0) {
    return { firstXPx: 0, count: 0, tileWidthPx: 0 };
  }

  const offset = layerOffsetPx(camera, layer);
  // +1 for the tile the offset partially pushed off the left edge, +1 for the
  // partial tile at the right. Ceil alone leaves a gap on either side.
  const count = Math.ceil(camera.viewportWidthPx / layer.tileWidthPx) + 2;

  return { firstXPx: -offset - layer.tileWidthPx, count, tileWidthPx: layer.tileWidthPx };
}

export interface LayerBounds {
  readonly topPx: number;
  readonly heightPx: number;
}

export function layerBounds(camera: Camera, layer: ParallaxLayer): LayerBounds {
  return {
    topPx: layer.topRatio * camera.viewportHeightPx,
    heightPx: layer.heightRatio * camera.viewportHeightPx,
  };
}
