import { type Camera, isVisible, worldToScreenX } from './camera';
import { type Canvas2D } from './canvas-surface';
import { DEFAULT_SCENE_PALETTE, type ScenePalette } from './palette';
import {
  DEFAULT_PARALLAX_LAYERS,
  layerBounds,
  type ParallaxLayer,
  tilePlacement,
} from './parallax';

/**
 * The scene: sky, parallax silhouettes, road, finish line.
 *
 * Placeholder vector art (spec §10). Everything is flat shapes, which is cheap
 * to fill and trivially replaceable — when real background images arrive, only
 * `drawLayer` changes and the layer geometry, camera, and palettes stay put.
 *
 * Draw order is strictly back to front. Actors (C3, C4) and obstacles (D1) are
 * drawn by their own modules on top of this, using `groundYPx` as their baseline.
 */

/** Where the road surface starts, as a fraction of viewport height. */
export const GROUND_TOP_RATIO = 0.72;

/** The line the MC and the dogs stand on. */
export function groundYPx(camera: Camera): number {
  return GROUND_TOP_RATIO * camera.viewportHeightPx;
}

/**
 * Which palette colour each layer uses. A layer id with no entry falls back to
 * the nearest band, so a theme that adds a custom layer still renders.
 */
const LAYER_PALETTE_KEY: Readonly<Record<string, keyof ScenePalette | undefined>> = {
  'sky-band': 'skyBand',
  far: 'far',
  mid: 'mid',
  near: 'near',
};

export interface SceneView {
  readonly camera: Camera;
  readonly palette?: ScenePalette;
  readonly layers?: readonly ParallaxLayer[];
}

/**
 * A stable pseudo-random value in 0..1 for a tile.
 *
 * Deterministic on purpose: silhouettes must not shimmer as tiles scroll off one
 * edge and back on the other. `Math.random` here would make the skyline flicker
 * every frame. This is decoration, not gameplay — game-core's seeded RNG stays
 * reserved for anything the rules depend on.
 */
function tileNoise(seed: number): number {
  const mixed = Math.sin(seed * 127.1) * 43758.5453;

  return mixed - Math.floor(mixed);
}

function drawLayer(
  context: Canvas2D,
  camera: Camera,
  layer: ParallaxLayer,
  color: string,
  viewportWidthPx: number,
): void {
  const placement = tilePlacement(camera, layer);
  if (placement.count === 0) return;

  const bounds = layerBounds(camera, layer);
  const baseline = bounds.topPx + bounds.heightPx;

  context.fillStyle = color;

  // Tile index in world space, so a given block keeps its height forever rather
  // than being re-rolled from its current screen slot.
  const worldTileIndex = Math.floor(
    (camera.leftEdgeMeters * camera.config.pixelsPerMeter * layer.depth) / layer.tileWidthPx,
  );

  for (let tile = 0; tile < placement.count; tile += 1) {
    const tileX = placement.firstXPx + tile * placement.tileWidthPx;
    if (tileX > viewportWidthPx) break;

    const index = worldTileIndex + tile;
    const blocks = 3;
    const blockWidth = placement.tileWidthPx / blocks;

    for (let block = 0; block < blocks; block += 1) {
      const noise = tileNoise(index * blocks + block + layer.depth * 31);
      const height = bounds.heightPx * (0.45 + noise * 0.55);
      const gap = blockWidth * 0.12;

      context.fillRect(
        tileX + block * blockWidth + gap / 2,
        baseline - height,
        blockWidth - gap,
        height,
      );
    }
  }
}

/** Dashes down the middle of the road. The clearest cue that the world is moving. */
function drawRoadMarkings(
  context: Canvas2D,
  camera: Camera,
  palette: ScenePalette,
  groundY: number,
): void {
  const dashMeters = 3;
  const gapMeters = 4;
  const strideMeters = dashMeters + gapMeters;
  const dashY = groundY + (camera.viewportHeightPx - groundY) * 0.45;

  const firstDash = Math.floor(camera.leftEdgeMeters / strideMeters) * strideMeters;
  const endMeters = camera.leftEdgeMeters + camera.viewportWidthPx / camera.config.pixelsPerMeter;

  context.fillStyle = palette.groundMarking;
  context.globalAlpha = 0.55;

  for (let meters = firstDash; meters <= endMeters; meters += strideMeters) {
    const x = worldToScreenX(camera, meters);
    context.fillRect(x, dashY, dashMeters * camera.config.pixelsPerMeter, 3);
  }

  context.globalAlpha = 1;
}

/** The finish line, once it is close enough to be on screen. */
function drawFinishLine(
  context: Canvas2D,
  camera: Camera,
  palette: ScenePalette,
  groundY: number,
): void {
  if (!isVisible(camera, camera.worldLengthMeters, 4)) return;

  const x = worldToScreenX(camera, camera.worldLengthMeters);
  const height = camera.viewportHeightPx - groundY;
  const squares = 6;
  const squareSize = height / squares;
  const width = squareSize * 2;

  for (let row = 0; row < squares; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? palette.groundMarking : palette.groundEdge;
      context.fillRect(x + column * squareSize, groundY + row * squareSize, squareSize, squareSize);
    }
  }

  context.fillStyle = palette.accent;
  context.fillRect(x, groundY - camera.viewportHeightPx * 0.22, width, 6);
}

/** Draws one frame of the background. Leaves no state on the context. */
export function drawScene(context: Canvas2D, view: SceneView): void {
  const { camera } = view;
  const palette = view.palette ?? DEFAULT_SCENE_PALETTE;
  const layers = view.layers ?? DEFAULT_PARALLAX_LAYERS;
  const width = camera.viewportWidthPx;
  const height = camera.viewportHeightPx;
  const groundY = groundYPx(camera);

  context.save();
  context.clearRect(0, 0, width, height);

  context.fillStyle = palette.skyTop;
  context.fillRect(0, 0, width, height);

  for (const layer of layers) {
    const color = palette[LAYER_PALETTE_KEY[layer.id] ?? 'near'];

    if (layer.id === 'sky-band') {
      const bounds = layerBounds(camera, layer);
      context.fillStyle = color;
      context.fillRect(0, bounds.topPx, width, bounds.heightPx);
      continue;
    }

    drawLayer(context, camera, layer, color, width);
  }

  context.fillStyle = palette.ground;
  context.fillRect(0, groundY, width, height - groundY);

  context.fillStyle = palette.groundEdge;
  context.fillRect(0, groundY, width, 4);

  drawRoadMarkings(context, camera, palette, groundY);
  drawFinishLine(context, camera, palette, groundY);

  context.restore();
}
